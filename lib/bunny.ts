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

/**
 * Pulls the video GUID out of anything Bunny might hand you.
 *
 * WHY THIS EXISTS
 *
 * The admin panel only ever wrote `bunny_video_id` from its own upload widget.
 * If you uploaded the video inside Bunny's own dashboard instead — which is the
 * normal thing to do for a large file — there was no way to attach it. The only
 * text box on the form was the Drive link, so the URL went there, and the
 * player rendered black: the code saw video_source='bunny' with no GUID, fell
 * through to driveEmbedUrl(), and that correctly refused to find a Drive ID in
 * a Bunny URL.
 *
 * Bunny shows the same video under several different URLs depending on where
 * you copy from, and none of them is signposted as "the right one":
 *
 *   https://player.mediadelivery.net/play/<lib>/<guid>      ← the Share button
 *   https://iframe.mediadelivery.net/embed/<lib>/<guid>     ← the Embed snippet
 *   https://iframe.mediadelivery.net/play/<lib>/<guid>
 *   https://vz-xxxx.b-cdn.net/<guid>/playlist.m3u8          ← direct CDN
 *   643ef563-2e56-4da3-af1d-d1ebc18e476f                    ← the bare GUID
 *
 * All five are accepted. The GUID is a v4 UUID, which is specific enough that
 * this cannot mistake a Drive link for a Bunny one.
 */
export function bunnyGuidFrom(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  // A bare GUID pasted on its own.
  if (new RegExp(`^${uuid.source}$`, 'i').test(raw)) return raw.toLowerCase();

  // Any Bunny URL. Restricting to Bunny hostnames means a Drive link
  // containing a UUID-shaped folder name can never be misread as a video.
  if (/mediadelivery\.net|b-cdn\.net|bunnycdn\.com/i.test(raw)) {
    const match = raw.match(uuid);
    if (match) return match[0].toLowerCase();
  }

  return null;
}

/**
 * The library ID embedded in a pasted Bunny URL, if there is one.
 *
 * Playback is signed with BUNNY_LIBRARY_ID from the environment, not with
 * whatever is in the URL. If someone pastes a link from a different library the
 * GUID saves fine and the embed then 404s — a silent, very confusing failure.
 * The admin panel compares this against the configured library and says so.
 */
export function bunnyLibraryFrom(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw || !/mediadelivery\.net/i.test(raw)) return null;
  return raw.match(/mediadelivery\.net\/(?:play|embed)\/(\d+)\//i)?.[1] ?? null;
}
