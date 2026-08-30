import { createAdminClient } from './supabase/admin';

/**
 * Runs after a verified payment.
 *
 * Idempotent under BOTH retries and concurrency — see the atomic claim below.
 * Two webhook deliveries racing each other cannot double-count a promo use or
 * a Production Partner seat.
 */
export async function grantAccessForPayment(
  paymentId: string,
  providerReference?: string,
  /**
   * What the gateway says it actually captured. Optional so an admin's manual
   * grant can skip it, but every webhook passes it.
   */
  capturedAmount?: number
) {
  const admin = createAdminClient();

  /*
   * ATOMIC CLAIM — this is the whole idempotency guarantee, and it has to be
   * one statement.
   *
   * The previous version read the row, checked `status === 'paid'`, and then
   * wrote. That is safe against a webhook RETRIED later, but not against two
   * arriving at the same moment — and this codebase deliberately creates that
   * situation: a gateway that retries, or fires two events seconds apart for
   * one payment, produces exactly this. Both reads see 'pending', both
   * proceed, and the seat counter and promo counter are each incremented
   * twice. On a three-seat tier that is an oversold seat.
   *
   * Adding `.neq('status', 'paid')` to the UPDATE turns it into a
   * compare-and-swap. Postgres takes a row lock, so exactly one of two
   * concurrent updates matches; the loser matches zero rows, gets null back,
   * and returns early having changed nothing.
   */
  const { data: payment, error: claimError } = await admin
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      ...(providerReference ? { provider_reference: providerReference } : {})
    })
    .eq('id', paymentId)
    .neq('status', 'paid')
    .select('*')
    .maybeSingle();

  if (claimError) {
    console.error('[grant-access] claim failed:', claimError);
    return { ok: false, reason: 'claim_failed' };
  }

  // Either the payment does not exist, or another delivery already claimed it.
  // Both mean: do nothing further.
  if (!payment) return { ok: true, alreadyProcessed: true };

  /*
   * Confirm the gateway captured what we asked for.
   *
   * Nothing upstream compared these. The signature proves the message came
   * from the gateway; it does not prove the gateway charged the right amount.
   * Partial captures, a currency mix-up, or a gateway-side edit would all have
   * granted full access for less money, silently.
   *
   * The half-piastre tolerance absorbs float rounding — Paymob works in
   * integer cents, so a 1499.99 vs 1500.00 comparison must not fail.
   */
  if (typeof capturedAmount === 'number' && Number.isFinite(capturedAmount)) {
    const expected = Number(payment.amount);
    if (capturedAmount + 0.005 < expected) {
      console.error(
        `[grant-access] amount mismatch on ${paymentId}: captured ${capturedAmount}, expected ${expected}`
      );
      await admin.from('payments').update({ status: 'underpaid' }).eq('id', paymentId);
      return { ok: false, reason: 'amount_mismatch' };
    }
  }

  await admin.from('profiles').update({ tier_id: payment.tier_id, has_access: true }).eq('id', payment.user_id);

  // Atomic increments: a read-then-write here loses counts when two students
  // check out at the same moment, which for a 3-seat tier means overselling.
  if (payment.promo_code_id) {
    await admin.rpc('increment_promo_use', { promo_id: payment.promo_code_id });
  }

  const { data: tier } = await admin
    .from('tiers')
    .select('slug, max_seats, installment_count')
    .eq('id', payment.tier_id)
    .single();

  if (tier && tier.max_seats !== null) {
    await admin.rpc('increment_tier_seat', { tier: payment.tier_id });
  }

  // Track instalment progress so you can see who still owes what.
  if (payment.is_installment) {
    /*
     * `count`, not `data`.
     *
     * With `head: true` Supabase returns no rows at all — `data` is always
     * null and the number lives in `count`. Reading `data` here meant the
     * fallback fired every single time, so installments_paid was written as 1
     * after the first payment, and 1 again after the second, and 1 again after
     * the third. Anyone paying in instalments looked permanently stuck on
     * payment one.
     */
    const { count: paidCount } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', payment.user_id)
      .eq('tier_id', payment.tier_id)
      .eq('is_installment', true)
      .eq('status', 'paid');

    const total = tier?.installment_count ?? 3;
    const next = new Date();
    next.setMonth(next.getMonth() + 1);

    const paid = paidCount ?? 1;

    await admin.from('profiles').update({
      installments_paid: paid,
      installments_total: total,
      // Once the plan is settled there is nothing left to chase, so the due
      // date is cleared rather than pushed out another month forever.
      next_installment_due: paid >= total ? null : next.toISOString().slice(0, 10)
    }).eq('id', payment.user_id);
  }

  return { ok: true };
}
