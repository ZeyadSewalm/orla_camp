import { getRequestConfig } from 'next-intl/server';

export const locales = ['ar', 'en'] as const;
export const defaultLocale = 'ar';
export type Locale = (typeof locales)[number];

export const dir = (locale: string) => (locale === 'ar' ? 'rtl' : 'ltr');

/**
 * The cookie next-intl's middleware reads to decide which locale an
 * UNPREFIXED url means.
 *
 * This name is not decorative — it is the whole reason the language switch
 * used to fail. Arabic is the default locale and carries no prefix, so the
 * only thing that tells the server "/pricing means Arabic, not English" is
 * this cookie. The switcher must write it before navigating.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export default getRequestConfig(async ({ requestLocale }) => {
  // next-intl 3.22 deprecated the `locale` parameter in favour of awaiting
  // `requestLocale`. Using the old one logs a warning on every rendered page.
  const requested = await requestLocale;
  const locale = locales.includes(requested as Locale) ? (requested as Locale) : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
