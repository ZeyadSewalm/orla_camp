import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Logo from './Logo';
import { lh } from '@/lib/href';

export default async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations('nav');
  const p = await getTranslations('pricing');

  return (
    <footer className="relative mt-0 overflow-hidden bg-ink text-paper">
      <div aria-hidden className="facet-field pointer-events-none absolute inset-0 text-paper/15" />
      <div className="relative mx-auto flex max-w-content flex-col gap-8 px-5 py-14 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-20 w-auto text-brass" />
          <span className="display text-3xl">ORLA<br />DENT<br />CAMP</span>
        </div>
        <div className="text-sm text-paper/70">
          <p className="mb-3 max-w-xs">{p('noCert')}</p>
          <div className="flex gap-5 uppercase tracking-[0.18em] text-xs">
            <Link href={lh(locale, `/pricing`)}>{t('pricing')}</Link>
            <Link href={lh(locale, `/faq`)}>{t('faq')}</Link>
          </div>
          <p className="mt-5 text-xs text-paper/45">© {new Date().getFullYear()} OrlaDent</p>
        </div>
      </div>
    </footer>
  );
}
