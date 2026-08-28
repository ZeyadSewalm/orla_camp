import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Logo, { Wordmark } from './Logo';
import { lh } from '@/lib/href';

export default async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations('nav');
  const p = await getTranslations('pricing');

  return (
    <footer className="px-3 pb-3 pt-8 md:px-5 md:pb-5">
      <div className="relative mx-auto max-w-[90rem] overflow-hidden rounded-[2.25rem] bg-brass text-white">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white" />
        <span aria-hidden className="absolute -end-10 -top-12 h-44 w-44 rounded-full bg-brandSun" />
        <span aria-hidden className="absolute -bottom-16 start-[38%] h-36 w-36 rotate-12 bg-brandOrange" />

        <div className="relative mx-auto grid max-w-content gap-12 px-7 py-14 md:grid-cols-[1.1fr_0.9fr] md:px-10 md:py-16">
          <div className="flex items-end gap-5">
            <Logo className="h-32 w-auto text-white md:h-40" />
            <Wordmark className="text-4xl md:text-5xl" />
          </div>

          <div className="self-end">
            <nav className="mt-7 flex flex-wrap gap-2 text-sm font-semibold">
              <Link className="rounded-full bg-white px-5 py-2.5 text-ink hover:bg-brandSun" href={lh(locale, '/pricing')}>{t('pricing')}</Link>
              <Link className="rounded-full border border-white/35 px-5 py-2.5 hover:bg-white hover:text-ink" href={lh(locale, '/faq')}>{t('faq')}</Link>
            </nav>
            <p className="mt-8 text-xs text-white/55">© {new Date().getFullYear()} OrlaDent Camp</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
