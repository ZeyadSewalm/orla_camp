import { createAdminClient } from './supabase/admin';
import { applyDiscount, currencyFor, validatePromo } from './pricing';
import type { PromoCode, Profile, Tier } from './types';

/**
 * Single source of truth for what a payment should cost. The browser never
 * decides the amount — it only says which tier, plan and code it wants.
 */
export async function priceCheckout(opts: { profile: Profile; tierId: string; isInstallment: boolean; promoCode?: string | null }) {
  const admin = createAdminClient();

  const { data: tierRow } = await admin.from('tiers').select('*').eq('id', opts.tierId).single();
  const tier = tierRow as Tier | null;
  if (!tier) throw new Error('tier_not_found');
  if (!tier.is_self_checkout) throw new Error('tier_requires_call');

  const currency = currencyFor(opts.profile.region);
  const useInstallment = opts.isInstallment && tier.installments_available;

  const base = useInstallment
    ? currency === 'EGP' ? tier.installment_price_egp : tier.installment_price_usd
    : currency === 'EGP' ? tier.price_egp : tier.price_usd;

  if (base === null || base === undefined) throw new Error('price_unavailable');

  let amount = Number(base);
  let promo: PromoCode | null = null;

  if (opts.promoCode) {
    const { data } = await admin.from('promo_codes').select('*').ilike('code', opts.promoCode.trim()).maybeSingle();
    const check = validatePromo(data as PromoCode | null, tier.id);
    if (check.ok) {
      promo = data as PromoCode;
      amount = applyDiscount(amount, promo);
    }
  }

  return { tier, currency, amount, promo, isInstallment: useInstallment };
}
