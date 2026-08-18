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
