/**
 * Turns any Google Drive share link into an embeddable preview URL.
 *
 * NOTE ON PROTECTION: Drive's "disable download" setting stops a casual viewer
 * from saving the file, but it is NOT real DRM — anyone determined can still
 * screen-record. The real gate is the has_access / tier check that runs on the
 * server before this iframe is ever rendered. Keep the Drive link itself on
 * "Anyone with the link — Viewer" so the embed works at all.
 */
export function driveEmbedUrl(link: string): string | null {
  const raw = (link ?? '').trim();
  if (!raw) return null;

  const id =
    // .../file/d/<ID>/view  — what Drive's Share button gives you
    raw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    // ...open?id=<ID> / uc?id=<ID> — older share formats
    raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    // A bare file ID pasted on its own. Drive IDs are 25+ chars of
    // [A-Za-z0-9_-], so this cannot swallow a normal URL by accident.
    (/^[a-zA-Z0-9_-]{25,}$/.test(raw) ? raw : undefined);

  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}


/**
 * A poster frame for a Drive video, without uploading one by hand.
 *
 * Drive generates a thumbnail for every video it stores and serves it from
 * this endpoint. Until now `posterFor()` returned null for any Drive module
 * with no uploaded thumbnail, so the player was a flat black rectangle with a
 * play button — nothing showing what the lesson actually contains, on the one
 * screen whose whole job is to make someone press play.
 *
 * An uploaded thumbnail still wins; this is the fallback, not the default.
 * It only resolves while the file is shared "Anyone with the link" — the same
 * condition the embed already needs, so it can never be the thing that breaks.
 */
export function driveThumbnail(link: string, width = 1280): string | null {
  const raw = (link ?? '').trim();
  if (!raw) return null;

  const id =
    raw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    (/^[a-zA-Z0-9_-]{25,}$/.test(raw) ? raw : undefined);

  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${width}` : null;
}
