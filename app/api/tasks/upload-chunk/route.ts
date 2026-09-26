import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A 4 MiB chunk to Drive normally takes a second or two; this leaves headroom
// for a slow hop without letting a hung request hold a function for minutes.
export const maxDuration = 60;

/**
 * Forwards one chunk of an STL upload from the student's browser to Google
 * Drive.
 *
 * WHY THIS EXISTS
 *
 * The browser used to PUT chunks straight to the Drive resumable session. That
 * session is created by the Apps Script bridge — server-side, with no Origin —
 * and Google rejects cross-origin browser requests to a session opened that
 * way. The browser surfaces a CORS rejection to page code as a bare network
 * error, so students saw "the connection dropped" on a working connection.
 *
 * Server-to-server there is no CORS. This route receives the chunk and makes
 * the same PUT from here.
 *
 * THE DESTINATION NEVER COMES FROM THE BROWSER
 *
 * The session URL is read from the database row this server wrote, scoped to
 * the signed-in student and to a submission still uploading. A proxy that
 * forwarded to a URL the caller supplied would be a relay for anyone's own
 * Google upload sessions on this site's bandwidth.
 *
 * CONTRACT
 *   POST /api/tasks/upload-chunk?submissionId=<uuid>
 *   x-content-range: "bytes <start>-<end>/<total>"   a chunk
 *                    "bytes STAR/<total>"             a status probe, where
 *                                                     STAR is a literal asterisk
 *   body: raw chunk bytes (empty for a probe)
 *
 *   → { status: 308, nextOffset }     more to send
 *   → { status: 200, fileId }         upload complete
 *   → { error, status }               anything else
 */

// Vercel refuses request bodies over 4.5 MB before this code even runs. The
// client sends 4 MiB chunks — a multiple of 256 KiB, as Drive requires — and
// anything larger than this is rejected here with a clear error rather than an
// opaque platform 413.
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

const RANGE_CHUNK = /^bytes (\d+)-(\d+)\/(\d+)$/;
const RANGE_PROBE = /^bytes \*\/(\d+)$/;

/** Defence in depth: even a URL from our own database must point at Drive. */
function isDriveUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.googleapis.com' &&
      url.pathname.startsWith('/upload/drive/') &&
      url.searchParams.has('upload_id')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const submissionId = new URL(request.url).searchParams.get('submissionId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    return NextResponse.json({ error: 'bad_submission' }, { status: 400 });
  }

  const contentRange = request.headers.get('x-content-range') ?? '';
  const chunkMatch = contentRange.match(RANGE_CHUNK);
  const probeMatch = contentRange.match(RANGE_PROBE);
  if (!chunkMatch && !probeMatch) {
    return NextResponse.json({ error: 'bad_range' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: row } = await db
    .from('assignment_submissions')
    .select('id, user_id, status, file_size, upload_session_url')
    .eq('id', submissionId)
    .maybeSingle();

  // Ownership and state in one refusal: a student may only push bytes into
  // their OWN submission, and only while it is still uploading. Not found and
  // not yours look identical on purpose.
  if (!row || row.user_id !== user.id || row.status !== 'uploading' || !row.upload_session_url) {
    return NextResponse.json({ error: 'not_uploading' }, { status: 404 });
  }
  if (!isDriveUploadUrl(row.upload_session_url)) {
    console.error('[upload-chunk] stored session URL is not a Drive upload URL', submissionId);
    return NextResponse.json({ error: 'bad_session' }, { status: 500 });
  }

  const total = Number((chunkMatch ?? probeMatch)![chunkMatch ? 3 : 1]);
  // The total must match what was declared when the session was opened; Drive
  // would reject a mismatch anyway, but this catches it with a readable error.
  if (total !== Number(row.file_size)) {
    return NextResponse.json({ error: 'size_mismatch' }, { status: 400 });
  }

  let body: ArrayBuffer | undefined;
  if (chunkMatch) {
    const start = Number(chunkMatch[1]);
    const end = Number(chunkMatch[2]);
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: 'chunk_too_large' }, { status: 413 });
    }
    if (end < start || body.byteLength !== end - start + 1) {
      return NextResponse.json({ error: 'range_body_mismatch' }, { status: 400 });
    }
  }

  let driveResponse: Response;
  try {
    driveResponse = await fetch(row.upload_session_url, {
      method: 'PUT',
      headers: {
        'Content-Range': chunkMatch ? contentRange : `bytes */${total}`,
        'Content-Length': String(body?.byteLength ?? 0)
      },
      body: body ?? new ArrayBuffer(0),
      signal: AbortSignal.timeout(50_000)
    });
  } catch (error) {
    // Retryable from the browser's point of view: it re-probes and resumes.
    console.warn('[upload-chunk] Drive unreachable', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'drive_unreachable', status: 503 }, { status: 503 });
  }

  // 308 Resume Incomplete: Drive tells us exactly what it has in Range.
  if (driveResponse.status === 308) {
    const range = driveResponse.headers.get('range');
    const match = range?.match(/bytes=0-(\d+)/i);
    // No Range header on a 308 means Drive has nothing yet.
    return NextResponse.json({ status: 308, nextOffset: match ? Number(match[1]) + 1 : 0 });
  }

  if (driveResponse.ok) {
    const meta = (await driveResponse.json().catch(() => null)) as { id?: string } | null;
    return NextResponse.json({ status: 200, fileId: meta?.id ?? null });
  }

  const detail = await driveResponse.text().catch(() => '');
  console.warn('[upload-chunk] Drive rejected chunk', driveResponse.status, detail.slice(0, 300));
  // Pass the status through so the browser can tell retryable (5xx, 429) from
  // final (404 — the session expired, a new upload is needed).
  return NextResponse.json(
    { error: 'drive_rejected', status: driveResponse.status },
    { status: driveResponse.status >= 500 || driveResponse.status === 429 ? 503 : 400 }
  );
}
