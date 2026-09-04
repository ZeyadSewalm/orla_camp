'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Minus, Phone } from 'lucide-react';
import type { Region, Tier } from '@/lib/types';
import { formatMoney, seatsLeft, tierPrice } from '@/lib/pricing';
import { lh } from '@/lib/href';
import CountUp from './CountUp';
import TiltCard from './TiltCard';

export default function PricingClient({
  tiers, locale, initialRegion
}: { tiers: Tier[]; locale: string; initialRegion: Region }) {
  const t = useTranslations('pricing');

  /*
   * EGYPT ONLY, FOR NOW.
   *
   * There used to be an Egypt / Gulf-International switch here that set a
   * `region` cookie and swapped every price between EGP and USD. The
   * international offer is off, so showing a USD column would quote prices
   * against an offer that isn't being sold.
   *
   * The Region type, the USD columns on `tiers`, and the USD gateways are all
   * deliberately left in place: bringing the offer back should be restoring
   * this toggle, not rebuilding the pricing model. `initialRegion` is still
   * accepted for the same reason — the prop, the cookie and the server-side
   * region on each profile all still work.
   */
  const region: Region = 'egypt';

  const ar = locale === 'ar';

  return (
    <>
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {tiers.map((tier) => {
          const { currency, full } = tierPrice(tier, region);
          const left = seatsLeft(tier);
          const soldOut = left === 0;
          const features = (ar ? tier.features?.ar : tier.features?.en) ?? [];
          // Production Partner is a different path, not a bigger box.
          const exclusive = !tier.is_self_checkout;

          return (
            <TiltCard key={tier.id} className="h-full">
            <section
              className={`group relative flex h-full flex-col p-6 sm:p-9 ${
                exclusive
                  ? 'overflow-hidden rounded-[2rem] border border-brass bg-brass text-white lg:-my-3 lg:py-12'
                  : 'rounded-[2rem] border border-ink/10 bg-white transition hover:-translate-y-1 hover:shadow-xl'
              }`}
            >
              {exclusive && (
                <>
                  <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-brass" />
                  <span className="relative mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[0.68rem] font-semibold text-brass">
                    {t('pilotBadge')}
                  </span>
                </>
              )}

              <div className="relative flex h-full flex-col">
                <p className={`figure text-xs ${exclusive ? 'text-white/60' : 'text-steel'}`}>
                  {String(tier.order_index).padStart(2, '0')}
                </p>
                {/* Tier name: text-2xl was 64px, which alone overflowed the
                    card on every phone. */}
                <h2 className="display mt-2 text-xl">{ar ? tier.name_ar : tier.name_en}</h2>
                {/* min-h reserved desktop space for two lines; on a phone the
                    same copy runs to four and the fixed height clipped it. */}
                <p className={`mt-3 text-sm md:min-h-[3.5rem] ${exclusive ? 'text-paper/65' : 'text-steel'}`}>
                  {ar ? tier.description_ar : tier.description_en}
                </p>

                <div className={`my-8 border-t pt-6 ${exclusive ? 'border-white/25' : 'border-ink/15'}`}>
                  {full !== null ? (
                    <>
                      <p className="display text-lg sm:text-xl">
                        <CountUp value={full} format={(n) => formatMoney(n, currency, locale)} />
                      </p>
                    </>
                  ) : (
                    <p className={`text-base font-semibold ${exclusive ? 'text-brandSun' : 'text-brass'}`}>{t('customPrice')}</p>
                  )}

                </div>

                <ul className={`mb-10 space-y-3.5 text-sm ${exclusive ? 'text-paper/85' : 'text-ink'}`}>
                  {features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${exclusive ? 'text-brass' : 'text-steel'}`} strokeWidth={2.5} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  {soldOut ? (
                    <p className={`flex items-center justify-center gap-2 px-4 py-4 text-xs uppercase tracking-[0.14em] ${
                      exclusive ? 'border border-paper/25 text-paper/55' : 'border border-line text-steel'
                    }`}>
                      <Minus aria-hidden className="h-4 w-4" /> {t('seatsFull')}
                    </p>
                  ) : exclusive ? (
                    // Outline + a phone icon: this is a conversation, not a checkout
                    <Link href={lh(locale, '/apply-production-partner')} className="btn-outline w-full">
                      <Phone aria-hidden className="h-4 w-4" /> {t('requestCall')}
                    </Link>
                  ) : (
                    <Link href={lh(locale, `/checkout?tier=${tier.slug}`)} className="btn-primary w-full">
                      {t('subscribe')}
                    </Link>
                  )}
                </div>
              </div>
            </section>
            </TiltCard>
          );
        })}
      </div>
    </>
  );
}
