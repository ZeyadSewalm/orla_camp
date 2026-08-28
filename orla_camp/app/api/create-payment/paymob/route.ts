import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { priceCheckout } from '@/lib/checkout-server';
import { createPaymobCheckout } from '@/lib/paymob';

export async function POST(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  try {
    const { tierId, isInstallment, promoCode } = await request.json();
    const quote = await priceCheckout({ profile, tierId, isInstallment: !!isInstallment, promoCode });

    if (quote.currency !== 'EGP') return NextResponse.json({ error: 'paymob_is_egp_only' }, { status: 400 });

    const admin = createAdminClient();
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        user_id: profile.id,
        tier_id: quote.tier.id,
        amount: quote.amount,
        currency: 'EGP',
        is_installment: quote.isInstallment,
        installment_number: quote.isInstallment ? 1 : null,
        status: 'pending',
        payment_method: 'paymob',
        promo_code_id: quote.promo?.id ?? null
      })
      .select('id')
      .single();

    // The insert can fail — a dropped connection, a constraint, RLS. Without
    // this check the code carried on with `payment.id` and threw a
    // TypeError, which surfaced to the buyer as a blank 400 instead of
    // anything actionable.
    if (paymentError || !payment) {
      console.error('[checkout] could not create payment row:', paymentError);
      return NextResponse.json({ error: 'could_not_start_checkout' }, { status: 500 });
    }

    const checkout = await createPaymobCheckout({
      amountEgp: quote.amount,
      merchantOrderId: payment.id,
      email: profile.email,
      fullName: profile.full_name ?? 'Student'
    });

    // Paymob's own order id is what the webhook reports back.
    await admin.from('payments').update({ provider_reference: checkout.orderId }).eq('id', payment.id);

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
