import type { Metadata } from 'next';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import ApplyForm from '@/components/ApplyForm';
import { createClient, getProfile } from '@/lib/supabase/server';
import { seatsLeft } from '@/lib/pricing';
import type { Tier } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

export default async function Apply({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('apply');
  const supabase = createClient();
  const [{ data: tier }, profile] = await Promise.all([
    supabase.from('tiers').select('*').eq('slug', 'production_partner').single(),
    getProfile()
  ]);

  const left = tier ? seatsLeft(tier as Tier) : null;

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>
      <p className="mt-3 mb-9 text-steel">{t('intro')}</p>
      {left === 0 ? (
        <p className="border border-ink/20 p-6 text-sm text-steel">{t('full')}</p>
      ) : (
        <ApplyForm
          defaults={{ name: profile?.full_name ?? '', email: profile?.email ?? '', userId: profile?.id ?? null }}
        />
      )}
    </div>
  );
}
