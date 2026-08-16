import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Logo, { Wordmark } from './Logo';
import LocaleSwitcher from './LocaleSwitcher';
import LogoutButton from './LogoutButton';
import { getSessionUser } from '@/lib/supabase/server';
import { getCachedRole } from '@/lib/data';
import { lh } from '@/lib/href';

export default async function Header({ locale }: { locale: string }) {
  const t = await getTranslations('nav');
  // Cookie read + a 30s-cached role lookup, instead of two Supabase round
  // trips on every single page load.
  const user = await getSessionUser();
  const profile = user ? await getCachedRole(user.id) : null;

  const links: Array<[string, string]> = [
    ['/pricing', t('pricing')],
    ['/faq', t('faq')]
  ];
  if (profile?.has_access) links.unshift(['/course', t('course')], ['/live-sessions', t('live')], ['/community', t('community')]);
  if (profile?.role === 'admin' || profile?.role === 'reviewer') links.push(['/admin', t('admin')]);

  return (
    <>
      {/*
        ONLY THIS BAR IS STICKY.

        Before, the whole <header> was sticky and it held TWO rows: the logo
        pill and the mobile link row underneath. So on a phone you scrolled and
        two separate pills stayed pinned on top of the content, stacked, and
        you read the page through a ~130px-tall window. One pinned bar, not two.
      */}
      <header className="sticky top-0 z-50 px-3 pt-3 md:px-5">
        <div className="soft-shadow mx-auto flex max-w-content items-center gap-2 rounded-full border border-ink/10 bg-paper/90 px-3 py-2 backdrop-blur-xl sm:gap-4 sm:px-4 sm:py-2.5 md:px-5">
          <Link href={lh(locale, ``)} className="flex min-w-0 items-center gap-2 sm:gap-2.5" aria-label="OrlaDent Camp">
            <Logo className="h-8 w-auto shrink-0 text-ink sm:h-9" />
            {/* The name stays visible at every width — it is the brand. It is
                the NAV LINKS that leave this bar on mobile, not the wordmark. */}
            <Wordmark className="text-[0.6rem] sm:text-[0.72rem] md:text-[0.82rem]" />
          </Link>

          <nav className="ms-auto hidden items-center gap-1 text-sm md:flex">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={lh(locale, `${href}`)}
                className={
                  href === '/admin'
                    ? 'rounded-full bg-brass px-4 py-2 text-xs font-semibold text-white hover:bg-brassInk'
                    : 'rounded-full px-4 py-2 transition hover:bg-white hover:text-brass'
                }
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:ms-0">
            <LocaleSwitcher locale={locale} />
            {profile ? (
              <LogoutButton locale={locale} label={t('logout')} />
            ) : (
              <Link href={lh(locale, `/login`)} className="whitespace-nowrap rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-brass sm:px-4">
                {t('login')}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/*
        Mobile links — deliberately OUTSIDE the sticky header, so this row
        scrolls away with the page and only the bar above stays pinned.
        max-w-full (not max-w-max) so the row is viewport-wide and scrolls
        inside itself instead of growing past the screen edge.
      */}
      <nav className="no-scrollbar mx-auto mt-2 flex max-w-full gap-1 overflow-x-auto px-3 pb-1 text-xs md:hidden">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={lh(locale, `${href}`)}
            className="whitespace-nowrap rounded-full border border-ink/10 bg-paper/90 px-3.5 py-2 shadow-sm hover:bg-white"
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
