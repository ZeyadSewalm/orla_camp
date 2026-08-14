import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { priceCheckout } from '@/lib/checkout-server';
import { createPaypalOrder } from '@/lib/paypal';

export async function POST(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  try {
    const { tierId, isInstallment, promoCode, locale } = await request.json();
    const quote = await priceCheckout({ profile, tierId, isInstallment: !!isInstallment, promoCode });

    if (quote.currency !== 'USD') return NextResponse.json({ error: 'paypal_is_usd_only' }, { status: 400 });

    const admin = createAdminClient();
    const { data: payment } = await admin
      .from('payments')
      .insert({
        user_id: profile.id,
        tier_id: quote.tier.id,
        amount: quote.amount,
        currency: 'USD',
        is_installment: quote.isInstallment,
        installment_number: quote.isInstallment ? 1 : null,
        status: 'pending',
        payment_method: 'paypal',
        promo_code_id: quote.promo?.id ?? null
      })
      .select('id')
      .single();

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const order = await createPaypalOrder({
      amountUsd: quote.amount,
      reference: payment!.id,
      returnUrl: `${site}/${locale ?? 'ar'}/course`,
      cancelUrl: `${site}/${locale ?? 'ar'}/pricing`
    });

    await admin.from('payments').update({ provider_reference: order.id }).eq('id', payment!.id);
    return NextResponse.json({ url: order.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
