import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createBunnyVideo, uploadBunnyVideo, getBunnyVideo, isBunnyConfigured } from '@/lib/bunny';

/**
 * Admin-only video upload. Kept out of a server action because video files are
 * far larger than the default action body limit.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!isBunnyConfigured()) {
    return NextResponse.json({ error: 'bunny_not_configured' }, { status: 400 });
  }

  try {
    const form = await request.formData();
    const file = form.get('video') as File | null;
    const moduleId = form.get('module_id') as string | null;
    const title = (form.get('title') as string) || file?.name || 'Untitled';

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    const guid = await createBunnyVideo(title);
    await uploadBunnyVideo(guid, await file.arrayBuffer());

    const details = await getBunnyVideo(guid);

    // Attach to the module if one was given; otherwise just hand back the GUID.
    if (moduleId) {
      await createAdminClient()
        .from('course_modules')
        .update({
          bunny_video_id: guid,
          video_source: 'bunny',
          video_duration_seconds: details?.length ?? null
        })
        .eq('id', moduleId);
    }

    return NextResponse.json({ guid, status: details?.status ?? 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'upload_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
