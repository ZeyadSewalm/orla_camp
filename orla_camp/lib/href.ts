import { defaultLocale } from '@/i18n';

/**
 * Builds a link for the given locale.
 *
 * Arabic is the default and carries NO prefix — the home page is "/", pricing
 * is "/pricing". English is prefixed: "/en", "/en/pricing".
 *
 * Always use this instead of writing `/${locale}/x` by hand: a hard-coded
 * "/ar/x" would make every click go through a redirect, which is slow.
 */
export function lh(locale: string, path = ''): string {
  const clean = path === '/' ? '' : path;
  return locale === defaultLocale ? clean || '/' : `/${locale}${clean}`;
}

/** Strips any locale prefix, e.g. "/en/pricing" -> "/pricing". */
export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(ar|en)(?=\/|$)/, '') || '/';
}
