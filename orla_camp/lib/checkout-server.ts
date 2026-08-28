import { createAdminClient } from './supabase/admin';
import { applyDiscount, currencyFor, escapeLikePattern, seatsLeft, validatePromo } from './pricing';
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

  /*
   * Seats are checked HERE, not only in the SQL increment.
   *
   * `increment_tier_seat` refuses to push the counter past max_seats, so the
   * number stayed correct — but the payment still went through and the buyer
   * still got `has_access`. The counter was right and the seat was oversold.
   * Today Production Partner is the only capped tier and it is call-only, so
   * this never fired; the day a capped tier is switched to self-checkout it
   * would have, and it would have taken real money for a seat that does not
   * exist.
   */
  const left = seatsLeft(tier);
  if (left !== null && left <= 0) throw new Error('tier_sold_out');

  /*
   * Don't sell the same tier to someone who already owns it. A double
   * purchase is a refund conversation, and the most common cause is simply a
   * double-click or a back button.
   */
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('user_id', opts.profile.id)
    .eq('tier_id', tier.id)
    .eq('status', 'paid')
    .eq('is_installment', false)
    .maybeSingle();
  if (existing) throw new Error('already_purchased');

  const currency = currencyFor(opts.profile.region);
  const useInstallment = opts.isInstallment && tier.installments_available;

  const base = useInstallment
    ? currency === 'EGP' ? tier.installment_price_egp : tier.installment_price_usd
    : currency === 'EGP' ? tier.price_egp : tier.price_usd;

  if (base === null || base === undefined) throw new Error('price_unavailable');

  let amount = Number(base);
  let promo: PromoCode | null = null;

  if (opts.promoCode) {
    // escapeLikePattern: without it, `%` matches every promo code. See pricing.ts.
    const { data } = await admin
      .from('promo_codes')
      .select('*')
      .ilike('code', escapeLikePattern(opts.promoCode.trim()))
      .maybeSingle();
    const check = validatePromo(data as PromoCode | null, tier.id);
    if (check.ok) {
      promo = data as PromoCode;
      amount = applyDiscount(amount, promo);
    }
  }

  /*
   * A gateway cannot charge zero, and neither Paymob nor Tap gives a readable
   * error when asked to — the buyer just sees checkout fail. A promo worth
   * more than the tier (100%, or a fixed amount above the price) produced
   * exactly that. Free access is a legitimate thing to want, but it belongs in
   * the admin panel as a manual grant, not in a checkout flow.
   */
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount_invalid');

  return { tier, currency, amount, promo, isInstallment: useInstallment };
}
