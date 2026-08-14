import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import PricingClient from '@/components/PricingClient';
import { getTiers } from '@/lib/data';
import type { Region, Tier } from '@/lib/types';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return { title: t('title'), description: t('subtitle') };
}

export default async function Pricing({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('pricing');
  const tiers = await getTiers();
  const region = ((cookies().get('region')?.value as Region) ?? 'egypt');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'OrlaDent Camp',
    provider: { '@type': 'Organization', name: 'OrlaDent' },
    instructor: { '@type': 'Person', name: 'Badr' },
    offers: tiers
      .filter((x) => x.price_egp !== null || x.price_usd !== null)
      .flatMap((x) => [
        x.price_egp !== null ? { '@type': 'Offer', name: x.name_en, price: x.price_egp, priceCurrency: 'EGP' } : null,
        x.price_usd !== null ? { '@type': 'Offer', name: x.name_en, price: x.price_usd, priceCurrency: 'USD' } : null
      ].filter(Boolean))
  };

  return (
    <div className="mx-auto max-w-content px-5 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>
      <p className="mt-3 max-w-xl text-steel">{t('subtitle')}</p>
      <div className="rule-diagonal my-8 max-w-xs text-ink" />

      <PricingClient tiers={tiers} locale={locale} initialRegion={region} />

      <div className="mt-10 space-y-3 text-sm text-steel">
        <p className="border-s-2 border-brass ps-4">{t('ppNote')}</p>
        <p className="border-s-2 border-ink ps-4">{t('noCert')}</p>
      </div>
    </div>
  );
}
