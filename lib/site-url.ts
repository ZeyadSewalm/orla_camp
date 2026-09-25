/**
 * The canonical public origin of this site.
 *
 * WHY NOT window.location.origin
 *
 * Every Vercel deployment also answers on its own generated hostname, and a
 * preview build answers on another. Building an email link from whatever host
 * the browser happens to be on means the link inside that email can point at a
 * deployment URL — which a student then clicks days later, on a build that may
 * already have been rotated away, and which sets its session cookies on the
 * wrong host.
 *
 * NEXT_PUBLIC_SITE_URL is baked in at build time and is the one address this
 * site is meant to live at. The window fallback exists so local development
 * still works when the variable is unset.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}
