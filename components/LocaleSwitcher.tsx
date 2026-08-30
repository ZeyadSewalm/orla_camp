'use client';
import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { lh, stripLocale } from '@/lib/href';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n';

/**
 * Language switch.
 *
 * WHY THIS USED TO DO NOTHING
 * ---------------------------
 * Arabic is the default locale with NO url prefix, so Arabic pages live at
 * "/pricing" and English at "/en/pricing".
 *
 * next-intl's middleware has locale detection on by default. On an unprefixed
 * request it resolves the locale from the NEXT_LOCALE cookie, and if that
 * cookie says "en" it REDIRECTS "/pricing" back to "/en/pricing".
 *
 * The old switcher only called router.push('/pricing'). The cookie still said
 * "en", so the middleware bounced it straight back to English. Arabic → English
 * appeared to work; English → Arabic silently did nothing. That is the bug.
 *
 * The fix is to write the cookie FIRST, then navigate. router.refresh() is
 * needed too: the layout, the header and every server component were rendered
 * on the server in the old language, so the RSC payload has to be re-fetched
 * rather than served from the client router cache.
 */
export default function LocaleSwitcher({ locale }: { locale: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('common');
  const [pending, startTransition] = useTransition();

  const other = locale === 'ar' ? 'en' : 'ar';

  function switchTo(next: string) {
    // 1. Tell the middleware what an unprefixed url means from now on.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;

    // 2. Keep the user on the same page, query string included.
    const query = searchParams.toString();
    const target = lh(next, stripLocale(pathname)) + (query ? `?${query}` : '');

    startTransition(() => {
      router.replace(target);
      // 3. Re-render the server components (html lang/dir, header, page copy).
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={() => switchTo(other)}
      disabled={pending}
      lang={other}
      dir={other === 'ar' ? 'rtl' : 'ltr'}
      title={t('language')}
      aria-label={t('language')}
      className="shrink-0 rounded-full border border-ink/15 bg-white/70 px-3 py-2 text-xs font-semibold transition hover:border-brass hover:text-brass disabled:opacity-50 sm:px-3.5"
    >
      {other === 'ar' ? 'ع' : 'EN'}
    </button>
  );
}
