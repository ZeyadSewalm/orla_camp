'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { lh, stripLocale } from '@/lib/href';

export default function LocaleSwitcher({ locale }: { locale: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common');
  const other = locale === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      onClick={() => router.push(lh(other, stripLocale(pathname)))}
      className="border border-ink/25 px-3 py-1.5 text-xs uppercase tracking-[0.2em] transition hover:border-ink hover:bg-ink hover:text-paper"
      aria-label={t('language')}
    >
      {other === 'ar' ? 'ع' : 'EN'}
    </button>
  );
}
