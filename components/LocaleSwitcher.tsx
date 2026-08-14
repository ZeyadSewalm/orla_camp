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
      className="rounded-full border border-ink/15 bg-white/70 px-3.5 py-2 text-xs font-semibold transition hover:border-brass hover:text-brass"
      aria-label={t('language')}
    >
      {other === 'ar' ? 'ع' : 'EN'}
    </button>
  );
}
