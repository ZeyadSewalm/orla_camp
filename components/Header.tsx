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
    <header className="sticky top-0 z-50 px-3 pt-3 md:px-5">
      <div className="soft-shadow mx-auto flex max-w-content items-center gap-4 rounded-full border border-ink/10 bg-paper/90 px-4 py-2.5 backdrop-blur-xl md:px-5">
        <Link href={lh(locale, ``)} className="flex items-center gap-2.5" aria-label="OrlaDent Camp">
          <Logo className="h-9 w-auto text-ink" />
          <Wordmark className="text-[0.72rem] sm:text-[0.82rem]" />
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

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <LocaleSwitcher locale={locale} />
          {profile ? (
            <LogoutButton locale={locale} label={t('logout')} />
          ) : (
            <Link href={lh(locale, `/login`)} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-brass">
              {t('login')}
            </Link>
          )}
        </div>
      </div>

      <nav className="mx-auto mt-2 flex max-w-max gap-1 overflow-x-auto rounded-full border border-ink/10 bg-paper/90 px-2 py-1.5 text-xs shadow-sm backdrop-blur md:hidden">
        {links.map(([href, label]) => (
          <Link key={href} href={lh(locale, `${href}`)} className="whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-white">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
