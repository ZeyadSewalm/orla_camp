import { signedEmbedUrl, bunnyThumbnail } from '@/lib/bunny';
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
  if (m.video_source === 'bunny' && m.bunny_video_id) {
    try {
      return signedEmbedUrl(m.bunny_video_id);
    } catch {
      // Bunny not configured — fall through rather than break the page.
      return null;
    }
  }
  return m.video_link ? driveEmbedUrl(m.video_link) : null;
}

export function posterFor(m: VideoModule): string | null {
  // Order matters: an explicitly uploaded image is a deliberate choice and
  // always wins over anything generated.
  if (m.thumbnail_url) return m.thumbnail_url;
  if (m.video_source === 'bunny' && m.bunny_video_id) return bunnyThumbnail(m.bunny_video_id);
  // Drive makes a thumbnail for every video it holds. Without this, every
  // Drive module with no uploaded image showed a black rectangle.
  if (m.video_link) return driveThumbnail(m.video_link);
  return null;
}
