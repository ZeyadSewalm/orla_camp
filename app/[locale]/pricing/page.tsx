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
    <div className="mx-auto max-w-content px-5 py-14 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="relative mb-12 overflow-hidden rounded-[2.25rem] bg-brass p-8 text-white md:p-12">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white" />
        <span aria-hidden className="absolute -end-6 -top-8 h-28 w-28 rounded-full bg-brandSun" />
        <h1 className="display relative text-5xl md:text-[4.5rem]">{t('title')}</h1>
        <p className="relative mt-4 max-w-xl text-white/75">{t('subtitle')}</p>
      </div>

      <PricingClient tiers={tiers} locale={locale} initialRegion={region} />

      <div className="surface-card mt-10 space-y-3 p-6 text-sm text-steel">
        <p className="border-s-2 border-brass ps-4">{t('ppNote')}</p>
        <p className="border-s-2 border-ink/30 ps-4">{t('noCert')}</p>
      </div>
    </div>
  );
}
