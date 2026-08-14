import { getRequestConfig } from 'next-intl/server';

export const locales = ['ar', 'en'] as const;
export const defaultLocale = 'ar';
export type Locale = (typeof locales)[number];

export const dir = (locale: string) => (locale === 'ar' ? 'rtl' : 'ltr');

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
