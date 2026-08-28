import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCachedTierOrder } from '@/lib/data';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Community({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('community');
  const supabase = createClient();

  // RLS returns nothing when the member's tier is below min_tier_order.
  const user = await getSessionUser();
  const [{ data: settings }, order] = await Promise.all([
    supabase.from('community_settings').select('*').eq('id', 1).maybeSingle(),
    user ? getCachedTierOrder(user.id) : Promise.resolve(0)
  ]);

  const allowed = !!settings && order >= (settings.min_tier_order ?? 2);

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>

      {allowed ? (
        settings?.whatsapp_group_link ? (
          <a href={settings.whatsapp_group_link} target="_blank" rel="noopener" className="btn-brass mt-8">{t('join')}</a>
        ) : (
          <p className="mt-8 text-steel">{t('soon')}</p>
        )
      ) : (
        <div className="mt-8 border border-brass bg-brass/5 p-6">
          <p>{t('locked')}</p>
          <Link href={lh(locale, `/pricing`)} className="btn-brass mt-5">{t('upgrade')}</Link>
        </div>
      )}
    </div>
  );
}
