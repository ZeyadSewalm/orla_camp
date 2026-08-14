import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Logo from './Logo';
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
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center gap-6 px-5 py-4">
        <Link href={lh(locale, ``)} className="flex items-center gap-3">
          <Logo className="h-9 w-auto" />
          <span className="font-display text-lg font-black uppercase leading-none tracking-tight sm:text-xl">Orladent Camp</span>
        </Link>

        <nav className="ms-auto hidden items-center gap-5 text-sm md:flex">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={lh(locale, `${href}`)}
              className={
                href === '/admin'
                  ? 'bg-brass px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white hover:bg-brassInk'
                  : 'relative after:absolute after:-bottom-1 after:start-0 after:h-px after:w-0 after:bg-brass after:transition-all hover:text-brass hover:after:w-full'
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
            <Link href={lh(locale, `/login`)} className="border border-ink/25 px-3 py-1.5 text-xs uppercase tracking-[0.18em] hover:border-ink">
              {t('login')}
            </Link>
          )}
        </div>
      </div>

      {/* mobile nav */}
      <nav className="flex gap-4 overflow-x-auto border-t border-line px-5 py-2 text-sm md:hidden">
        {links.map(([href, label]) => (
          <Link key={href} href={lh(locale, `${href}`)} className="whitespace-nowrap">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
