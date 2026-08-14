import { createAdminClient } from './supabase/admin';

/**
 * Runs after a verified payment. Idempotent: a provider that retries the same
 * webhook won't double-count a promo use or a Production Partner seat.
 */
export async function grantAccessForPayment(paymentId: string, providerReference?: string) {
  const admin = createAdminClient();

  const { data: payment } = await admin.from('payments').select('*').eq('id', paymentId).single();
  if (!payment) return { ok: false, reason: 'payment_not_found' };
  if (payment.status === 'paid') return { ok: true, alreadyProcessed: true };

  await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), provider_reference: providerReference ?? payment.provider_reference })
    .eq('id', paymentId);

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
    const { data: paidCount } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', payment.user_id)
      .eq('tier_id', payment.tier_id)
      .eq('is_installment', true)
      .eq('status', 'paid');

    const total = tier?.installment_count ?? 3;
    const next = new Date();
    next.setMonth(next.getMonth() + 1);

    await admin.from('profiles').update({
      installments_paid: (paidCount as unknown as number) ?? 1,
      installments_total: total,
      next_installment_due: next.toISOString().slice(0, 10)
    }).eq('id', payment.user_id);
  }

  return { ok: true };
}
