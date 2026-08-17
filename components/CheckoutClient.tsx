'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Region, Tier } from '@/lib/types';
import { formatMoney, tierPrice } from '@/lib/pricing';

export default function CheckoutClient({ tier, region, locale }: { tier: Tier; region: Region; locale: string }) {
  const t = useTranslations('checkout');
  const c = useTranslations('common');
  const { currency, full, installment, count } = tierPrice(tier, region);

  const [plan, setPlan] = useState<'full' | 'installments'>('full');
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = plan === 'full' ? full ?? 0 : installment ?? 0;
  const total = useMemo(() => Math.max(0, base - (discount ?? 0)), [base, discount]);

  async function applyPromo() {
    setBusy('promo');
    setPromoError(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, tierId: tier.id, amount: base })
      });
      const data = await res.json();
      if (!data.ok) {
        setDiscount(null);
        setPromoError(t(`promoErrors.${data.reason}` as 'promoErrors.notFound'));
      } else {
        setDiscount(data.discount);
      }
    } catch {
      setPromoError(c('error'));
    } finally {
      setBusy(null);
    }
  }

  function checkoutError(code: string): string {
    switch (code) {
      case 'tier_sold_out':       return t('errSoldOut');
      case 'already_purchased':   return t('errAlreadyPurchased');
      case 'tier_requires_call':  return t('errRequiresCall');
      case 'amount_invalid':
      case 'price_unavailable':   return t('errAmount');
      case 'tap_not_configured':
      case 'paymob_is_egp_only':
      case 'tap_is_usd_only_here': return t('errUnavailable');
      default:                    return t('errGeneric');
    }
  }

  async function pay(provider: 'paymob' | 'tap') {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api/create-payment/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: tier.id,
          isInstallment: plan === 'installments',
          promoCode: discount !== null ? code : null,
          locale
        })
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'failed');
      window.location.href = data.url;
    } catch (e) {
      // The server throws machine codes ('tier_sold_out', 'already_purchased').
      // Showing those raw put literal English snake_case in front of an Arabic
      // buyer at the exact moment they were trying to pay.
      setError(checkoutError(e instanceof Error ? e.message : ''));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {tier.installments_available && installment && (
        <div className="flex flex-wrap gap-2">
          {(['full', 'installments'] as const).map((p) => (
            <button
              key={p} type="button" onClick={() => setPlan(p)} aria-pressed={plan === p}
              className={`px-4 py-3 text-sm ${plan === p ? 'bg-ink text-paper' : 'border border-ink/25'}`}
            >
              {p === 'full' ? t('payFull') : t('payInstallments', { count })}
            </button>
          ))}
        </div>
      )}

      <div>
        <label className="label" htmlFor="promo">{t('promoLabel')}</label>
        <div className="flex gap-2">
          <input id="promo" className="field" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="button" onClick={applyPromo} disabled={!code || busy === 'promo'} className="btn-quiet shrink-0">
            {t('promoApply')}
          </button>
        </div>
        {promoError && <p className="mt-2 text-sm text-red-700">{promoError}</p>}
        {discount !== null && (
          <p className="mt-2 text-sm text-brass">
            {t('promoApplied', { amount: formatMoney(discount, currency, locale) })}
          </p>
        )}
      </div>

      <div className="border-t border-ink pt-5">
        <div className="flex items-baseline justify-between">
          <span className="label mb-0">{plan === 'full' ? t('total') : t('firstInstallment')}</span>
          <span className="font-display text-4xl font-black">{formatMoney(total, currency, locale)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => pay('paymob')} disabled={!!busy} className="btn-primary disabled:opacity-50">
          {busy === 'paymob' ? t('processing') : t('payPaymob')}
        </button>
        {/* Gulf / international. Tap covers cards plus mada, KNET, Benefit
            and Apple Pay — the methods a Gulf customer actually uses. */}
        <button type="button" onClick={() => pay('tap')} disabled={!!busy} className="btn-brass disabled:opacity-50">
          {busy === 'tap' ? t('processing') : t('payTap')}
        </button>
      </div>
    </div>
  );
}
