import crypto from 'crypto';

/**
 * Bunny Stream integration.
 *
 * Two separate credentials, and they must not be confused:
 *  - BUNNY_API_KEY   : the Video Library API key. Server-side only. Creates,
 *                      uploads and deletes videos.
 *  - BUNNY_TOKEN_KEY : the token authentication key from the library's
 *                      security settings. Used to sign playback URLs.
 *
 * Neither ever reaches the browser.
 */

const VIDEO_API = 'https://video.bunnycdn.com/library';

function config() {
  const libraryId = process.env.BUNNY_LIBRARY_ID;
  const apiKey = process.env.BUNNY_API_KEY;
  const hostname = process.env.BUNNY_CDN_HOSTNAME;
  if (!libraryId || !apiKey || !hostname) {
    throw new Error('bunny_not_configured');
  }
  return { libraryId, apiKey, hostname };
}

export const isBunnyConfigured = () =>
  Boolean(process.env.BUNNY_LIBRARY_ID && process.env.BUNNY_API_KEY && process.env.BUNNY_CDN_HOSTNAME);

/** Step 1: create the video object so we have a GUID to upload into. */
export async function createBunnyVideo(title: string): Promise<string> {
  const { libraryId, apiKey } = config();

  const res = await fetch(`${VIDEO_API}/${libraryId}/videos`, {
    method: 'POST',
    headers: { AccessKey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
    cache: 'no-store'
  });

  if (!res.ok) throw new Error(`bunny_create_failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.guid as string;
}

/**
 * Step 2: push the bytes. Bunny transcodes asynchronously, so this returning
 * OK means "received", not "ready to play" — the admin list shows the status.
 */
export async function uploadBunnyVideo(guid: string, file: ArrayBuffer): Promise<void> {
  const { libraryId, apiKey } = config();

  const res = await fetch(`${VIDEO_API}/${libraryId}/videos/${guid}`, {
    method: 'PUT',
    headers: { AccessKey: apiKey, 'Content-Type': 'application/octet-stream' },
    body: file,
    cache: 'no-store'
  });

  if (!res.ok) throw new Error(`bunny_upload_failed: ${res.status} ${await res.text()}`);
}

export async function getBunnyVideo(guid: string) {
  const { libraryId, apiKey } = config();
  const res = await fetch(`${VIDEO_API}/${libraryId}/videos/${guid}`, {
    headers: { AccessKey: apiKey },
    cache: 'no-store'
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    guid: string;
    title: string;
    status: number;          // 0-3 processing, 4 finished, 5 failed
    length: number;          // seconds
    thumbnailFileName: string;
  }>;
}

export async function deleteBunnyVideo(guid: string): Promise<void> {
  const { libraryId, apiKey } = config();
  await fetch(`${VIDEO_API}/${libraryId}/videos/${guid}`, {
    method: 'DELETE',
    headers: { AccessKey: apiKey },
    cache: 'no-store'
  });
}

/** Human-readable transcoding state for the admin list. */
export function bunnyStatusLabel(status: number): 'processing' | 'ready' | 'failed' {
  if (status >= 5) return 'failed';
  if (status === 4) return 'ready';
  return 'processing';
}

/**
 * Signs an embed URL that expires.
 *
 * This is the whole point of moving off Drive: the URL is generated on the
 * server AFTER the tier check passes, it dies after `expirySeconds`, and
 * Bunny refuses it from any other referrer. Copying the link out of devtools
 * and sending it to a friend gets them a dead link within the hour.
 *
 * Requires "Token Authentication" to be ENABLED in the Bunny library's
 * security settings — otherwise the signature is ignored and the video is
 * public. See README.
 */
export function signedEmbedUrl(guid: string, expirySeconds = 3600): string {
  const { libraryId, hostname } = config();
  const tokenKey = process.env.BUNNY_TOKEN_KEY;

  const expires = Math.floor(Date.now() / 1000) + expirySeconds;
  const base = `https://iframe.mediadelivery.net/embed/${libraryId}/${guid}`;

  if (!tokenKey) {
    // Unsigned fallback so the player still works before token auth is on.
    // Turn token auth on in Bunny and set BUNNY_TOKEN_KEY to close this.
    return `${base}?autoplay=false`;
  }

  const token = crypto
    .createHash('sha256')
    .update(tokenKey + guid + expires)
    .digest('hex');

  return `${base}?token=${token}&expires=${expires}&autoplay=false`;
}

/** Poster image for a Bunny video — safe to expose, it's just a thumbnail. */
export function bunnyThumbnail(guid: string): string {
  const hostname = process.env.BUNNY_CDN_HOSTNAME;
  return hostname ? `https://${hostname}/${guid}/thumbnail.jpg` : '';
}
