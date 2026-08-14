import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import CheckoutClient from '@/components/CheckoutClient';
import { createClient, getProfile } from '@/lib/supabase/server';
import type { Region, Tier } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
// Reads the signed-in profile and the live seat count — must never be
// prerendered, or a student could be served someone else's checkout state.
export const dynamic = 'force-dynamic';

export default async function Checkout({
  params: { locale },
  searchParams
}: {
  params: { locale: string };
  searchParams: { tier?: string };
}) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('checkout');
  const profile = await getProfile();
  const next = encodeURIComponent(lh(locale, `/checkout?tier=${searchParams.tier ?? ''}`));
  if (!profile) redirect(lh(locale, `/login?next=${next}`));

  const supabase = createClient();
  const { data } = await supabase.from('tiers').select('*').eq('slug', searchParams.tier ?? '').single();
  const tier = data as Tier | null;

  // Production Partner never checks out directly.
  if (!tier || !tier.is_self_checkout) redirect(lh(locale, `/pricing`));

  const region = (profile.region ?? 'egypt') as Region;
  const ar = locale === 'ar';

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>
      <p className="mt-3 mb-9 text-steel">{ar ? tier.name_ar : tier.name_en}</p>
      <CheckoutClient tier={tier} region={region} locale={locale} />
    </div>
  );
}
