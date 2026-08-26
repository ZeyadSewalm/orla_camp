import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildStoredFilename,
  createResumableUploadSession,
  isGoogleDriveConfigured,
  lessonFolderName,
  stageFolderName
} from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = {
  assignmentId?: string;
  originalFilename?: string;
  fileSize?: number;
  contentType?: string;
};

function extensionOf(filename: string) {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/i);
  return match?.[1] ?? '';
}

export async function POST(request: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'drive_not_configured' }, { status: 503 });
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json() as Payload;
    const assignmentId = String(body.assignmentId || '').trim();
    const originalFilename = String(body.originalFilename || '').trim();
    const fileSize = Number(body.fileSize);
    const contentType = String(body.contentType || 'application/octet-stream').slice(0, 150);

    if (!assignmentId || !originalFilename || originalFilename.length > 255 || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const db = createAdminClient();
    const [{ data: profile }, { data: assignment }] = await Promise.all([
      db.from('profiles').select('id,full_name,email,has_access,role').eq('id', user.id).maybeSingle(),
      db.from('assignments').select('*').eq('id', assignmentId).maybeSingle()
    ]);

    if (!profile || (!profile.has_access && profile.role !== 'admin' && profile.role !== 'reviewer')) {
      return NextResponse.json({ error: 'course_access_required' }, { status: 403 });
    }
    if (!assignment || !assignment.active) {
      return NextResponse.json({ error: 'assignment_unavailable' }, { status: 404 });
    }

    const { data: lesson } = await db
      .from('course_modules')
      .select('id,title_en,title_ar,block,order_index,status')
      .eq('id', assignment.lesson_id)
      .maybeSingle();
    if (!lesson || lesson.status === 'coming') {
      return NextResponse.json({ error: 'lesson_unavailable' }, { status: 403 });
    }

    const allowed = ((assignment.allowed_file_types as string[] | null) ?? ['.stl'])
      .map((x) => String(x).trim().toLowerCase())
      .filter(Boolean)
      .map((x) => x.startsWith('.') ? x : `.${x}`);
    const ext = extensionOf(originalFilename);
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json({ error: 'file_type_not_allowed', allowed }, { status: 400 });
    }

    const configuredMaxMb = Number(process.env.TASK_UPLOAD_MAX_MB || 512);
    const systemMaxMb = Number.isFinite(configuredMaxMb) && configuredMaxMb > 0 ? configuredMaxMb : 512;
    const configuredAssignmentMax = Number(assignment.max_file_size_mb);
    const assignmentMaxMb = Number.isFinite(configuredAssignmentMax) && configuredAssignmentMax > 0
      ? configuredAssignmentMax
      : systemMaxMb;
    const maxBytes = Math.min(systemMaxMb, assignmentMaxMb) * 1024 * 1024;
    if (fileSize > maxBytes) {
      return NextResponse.json({ error: 'file_too_large', maxMb: Math.floor(maxBytes / 1024 / 1024) }, { status: 413 });
    }

    const { data: previousRows } = await db
      .from('assignment_submissions')
      .select('id,status,attempt_number')
      .eq('assignment_id', assignmentId)
      .eq('user_id', user.id)
      .order('attempt_number', { ascending: false })
      .limit(5);

    const previous = previousRows ?? [];
    const latest = previous[0];
    if (latest && ['submitted', 'resubmitted', 'under_review'].includes(latest.status)) {
      return NextResponse.json({ error: 'submission_already_pending' }, { status: 409 });
    }
    if (latest && !assignment.allow_resubmission && !['failed', 'uploading', 'needs_revision'].includes(latest.status)) {
      return NextResponse.json({ error: 'resubmission_not_allowed' }, { status: 409 });
    }

    // A page refresh loses the browser-only Drive session URI. Mark any old
    // unfinished row failed so the student can safely start a fresh session.
    await db.from('assignment_submissions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('assignment_id', assignmentId)
      .eq('user_id', user.id)
      .eq('status', 'uploading');

    const attemptNumber = Math.max(0, ...previous.map((x) => Number(x.attempt_number) || 0)) + 1;
    const storedFilename = buildStoredFilename({
      fullName: profile.full_name,
      userId: user.id,
      lessonOrder: Number(lesson.order_index) || 0,
      originalFilename
    });

    const { data: created, error: insertError } = await db
      .from('assignment_submissions')
      .insert({
        assignment_id: assignmentId,
        user_id: user.id,
        original_filename: originalFilename,
        stored_filename: storedFilename,
        file_size: Math.floor(fileSize),
        attempt_number: attemptNumber,
        status: 'uploading'
      })
      .select('id')
      .single();
    if (insertError || !created) {
      console.error('[tasks] submission row create failed', insertError);
      return NextResponse.json({ error: 'submission_create_failed' }, { status: 500 });
    }

    try {
      const stageName = stageFolderName(lesson.block);
      const lessonName = lessonFolderName(
        Number(lesson.order_index) || 0,
        lesson.title_en || lesson.title_ar
      );
      const driveSession = await createResumableUploadSession({
        storedFilename,
        fileSize: Math.floor(fileSize),
        contentType: contentType || 'application/octet-stream',
        submissionId: created.id,
        assignmentId,
        userId: user.id,
        stageName,
        lessonName
      });

      // Keep this field as a convenient admin hint/cache. The Apps Script
      // bridge is authoritative for folder creation and never trusts a folder
      // id supplied by the student/browser.
      if (driveSession.folderId && driveSession.folderId !== assignment.drive_folder_id) {
        await db.from('assignments')
          .update({ drive_folder_id: driveSession.folderId, updated_at: new Date().toISOString() })
          .eq('id', assignmentId);
      }

      return NextResponse.json({
        submissionId: created.id,
        sessionUrl: driveSession.sessionUrl,
        storedFilename,
        chunkSize: 8 * 1024 * 1024
      });
    } catch (error) {
      await db.from('assignment_submissions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', created.id);
      console.error('[tasks] Drive session failed', error);
      return NextResponse.json({ error: 'drive_session_failed' }, { status: 502 });
    }
  } catch (error) {
    console.error('[tasks] upload-session unexpected error', error);
    return NextResponse.json({ error: 'unexpected_error' }, { status: 500 });
  }
}
