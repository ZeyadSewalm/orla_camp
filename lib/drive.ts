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
  const id = link.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? link.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}
