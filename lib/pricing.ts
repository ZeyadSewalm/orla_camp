import type { Currency, PromoCode, Region, Tier } from './types';

export const currencyFor = (region: Region): Currency => (region === 'egypt' ? 'EGP' : 'USD');

export function tierPrice(tier: Tier, region: Region) {
  const currency = currencyFor(region);
  const full = currency === 'EGP' ? tier.price_egp : tier.price_usd;
  const installment = currency === 'EGP' ? tier.installment_price_egp : tier.installment_price_usd;
  return { currency, full, installment, count: tier.installment_count ?? 3 };
}

export function formatMoney(amount: number, currency: Currency, locale: string) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

/** Applies a promo code to an amount. Never returns below zero. */
export function applyDiscount(amount: number, promo: PromoCode) {
  const off = promo.discount_type === 'percentage' ? (amount * promo.discount_value) / 100 : promo.discount_value;
  return Math.max(0, Math.round((amount - off) * 100) / 100);
}

/** Server-side promo validation. Returns a reason key when the code can't be used. */
export function validatePromo(promo: PromoCode | null, tierId: string): { ok: true } | { ok: false; reason: string } {
  if (!promo) return { ok: false, reason: 'notFound' };
  if (!promo.is_active) return { ok: false, reason: 'inactive' };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { ok: false, reason: 'expired' };
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return { ok: false, reason: 'exhausted' };
  if (promo.applicable_tiers && promo.applicable_tiers.length > 0 && !promo.applicable_tiers.includes(tierId))
    return { ok: false, reason: 'wrongTier' };
  return { ok: true };
}

export const seatsLeft = (tier: Tier) =>
  tier.max_seats === null ? null : Math.max(0, tier.max_seats - (tier.current_seats_taken ?? 0));
