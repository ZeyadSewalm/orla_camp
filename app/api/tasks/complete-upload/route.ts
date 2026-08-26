import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  findDriveFileBySubmissionId,
  getDriveFile,
  isGoogleDriveConfigured,
  type DriveFileMetadata
} from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = { submissionId?: string; driveFileId?: string | null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: 'drive_not_configured' }, { status: 503 });
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json() as Payload;
    const submissionId = String(body.submissionId || '').trim();
    const driveFileId = String(body.driveFileId || '').trim();
    if (!submissionId) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const db = createAdminClient();
    const { data: submission } = await db
      .from('assignment_submissions')
      .select('id,user_id,assignment_id,drive_file_id,file_size,stored_filename,attempt_number,status')
      .eq('id', submissionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!submission) return NextResponse.json({ error: 'submission_not_found' }, { status: 404 });

    // Idempotent finalization: if our first success response was lost, a
    // client retry should not create another upload or turn success into an
    // error. Ownership is still constrained to the authenticated user above.
    if (['submitted', 'resubmitted', 'under_review', 'graded', 'needs_revision'].includes(submission.status) && submission.drive_file_id) {
      if (driveFileId && driveFileId !== submission.drive_file_id) {
        return NextResponse.json({ error: 'drive_file_mismatch' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, status: submission.status, driveFileId: submission.drive_file_id });
    }
    if (submission.status !== 'uploading') {
      return NextResponse.json({ error: 'submission_not_uploading' }, { status: 409 });
    }

    let file: DriveFileMetadata | null = driveFileId
      ? await getDriveFile(driveFileId)
      : null;

    // If Google's final response was lost, the browser might know the upload
    // is complete but not have the Drive file id. Recover it from the private
    // appProperty that was bound to this submission when the session started.
    if (!file) {
      for (let attempt = 0; attempt < 3 && !file; attempt += 1) {
        file = await findDriveFileBySubmissionId(submission.id);
        if (!file && attempt < 2) await wait(350 * (attempt + 1));
      }
    }
    if (!file) {
      return NextResponse.json({ error: 'drive_file_not_ready' }, { status: 409 });
    }

    const props = file.appProperties ?? {};
    const expectedSize = Number(submission.file_size);
    const actualSize = Number(file.size ?? -1);
    const valid =
      !file.trashed &&
      props.orla_submission_id === submission.id &&
      props.orla_assignment_id === submission.assignment_id &&
      props.orla_user_id === user.id &&
      file.name === submission.stored_filename &&
      Number.isFinite(actualSize) && actualSize === expectedSize;

    if (!valid) {
      console.warn('[tasks] Drive verification rejected', {
        submissionId,
        driveFileId: file.id,
        props,
        expectedSize,
        actualSize
      });
      return NextResponse.json({ error: 'drive_verification_failed' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const finalStatus = Number(submission.attempt_number) > 1 ? 'resubmitted' : 'submitted';
    const { error: updateError } = await db
      .from('assignment_submissions')
      .update({
        drive_file_id: file.id,
        drive_web_view_link: file.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
        status: finalStatus,
        submitted_at: now,
        updated_at: now
      })
      .eq('id', submission.id)
      .eq('user_id', user.id)
      .eq('status', 'uploading');
    if (updateError) {
      console.error('[tasks] complete metadata update failed', updateError);
      return NextResponse.json({ error: 'submission_finalize_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: finalStatus, driveFileId: file.id });
  } catch (error) {
    console.error('[tasks] complete-upload unexpected error', error);
    return NextResponse.json({ error: 'unexpected_error' }, { status: 500 });
  }
}
