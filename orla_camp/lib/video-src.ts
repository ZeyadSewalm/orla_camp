import { signedEmbedUrl, bunnyThumbnail, bunnyGuidFrom } from '@/lib/bunny';
import { driveEmbedUrl, driveThumbnail } from '@/lib/drive';

type VideoModule = {
  video_source: string | null;
  bunny_video_id: string | null;
  video_link: string | null;
  thumbnail_url?: string | null;
};

/**
 * Turns a module row into a playable embed URL.
 *
 * Lifted out of the course page so the free-lesson page uses the exact same
 * logic. Two copies of this would drift, and the copy that drifts is the one
 * that silently stops signing Bunny URLs.
 */
export function videoSrcFor(m: VideoModule): string | null {
  /*
   * Resolve the Bunny GUID from the column first, then from the link.
   *
   * The fallback repairs rows already saved the wrong way: before the admin
   * form had a Bunny field, a Bunny URL could only be pasted into video_link,
   * which left video_source='bunny' with a null bunny_video_id. That
   * combination used to fall through to driveEmbedUrl(), which correctly
   * refuses to find a Drive ID in a Bunny URL and returned null — a black
   * player with no explanation. Reading the GUID out of the link makes those
   * lessons play without anyone having to re-enter them.
   */
  const guid = m.bunny_video_id ?? bunnyGuidFrom(m.video_link);

  if (m.video_source === 'bunny' && guid) {
    try {
      return signedEmbedUrl(guid);
    } catch {
      // Bunny not configured — fall through rather than break the page.
      return null;
    }
  }

  // A Bunny link on a module still marked 'drive' is a mismatched source, not
  // a Drive video. Play it rather than handing driveEmbedUrl a URL it cannot
  // parse.
  if (guid) {
    try {
      return signedEmbedUrl(guid);
    } catch {
      return null;
    }
  }

  return m.video_link ? driveEmbedUrl(m.video_link) : null;
}

export function posterFor(m: VideoModule): string | null {
  // Order matters: an explicitly uploaded image is a deliberate choice and
  // always wins over anything generated.
  if (m.thumbnail_url) return m.thumbnail_url;
  const guid = m.bunny_video_id ?? bunnyGuidFrom(m.video_link);
  if (guid) return bunnyThumbnail(guid);
  // Drive makes a thumbnail for every video it holds. Without this, every
  // Drive module with no uploaded image showed a black rectangle.
  if (m.video_link) return driveThumbnail(m.video_link);
  return null;
}
