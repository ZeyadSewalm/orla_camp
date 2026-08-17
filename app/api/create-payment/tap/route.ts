import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { priceCheckout } from '@/lib/checkout-server';
import { createTapCharge, isTapConfigured } from '@/lib/tap';
import { lh } from '@/lib/href';

export async function POST(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  if (!isTapConfigured()) {
    return NextResponse.json({ error: 'tap_not_configured' }, { status: 400 });
  }

  try {
    const { tierId, isInstallment, promoCode, locale } = await request.json();

    // The amount is priced server-side from the tier row. The browser only
    // says WHICH tier and plan it wants — it never sends a number.
    const quote = await priceCheckout({ profile, tierId, isInstallment: !!isInstallment, promoCode });

    if (quote.currency !== 'USD') {
      return NextResponse.json({ error: 'tap_is_usd_only_here' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        user_id: profile.id,
        tier_id: quote.tier.id,
        amount: quote.amount,
        currency: 'USD',
        is_installment: quote.isInstallment,
        installment_number: quote.isInstallment ? 1 : null,
        status: 'pending',
        payment_method: 'tap',
        promo_code_id: quote.promo?.id ?? null
      })
      .select('id')
      .single();

    if (paymentError || !payment) {
      console.error('[checkout] could not create payment row:', paymentError);
      return NextResponse.json({ error: 'could_not_start_checkout' }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    const safeLocale = locale === 'en' ? 'en' : 'ar';

    const charge = await createTapCharge({
      amount: quote.amount,
      currency: 'USD',
      reference: payment.id,
      email: profile.email,
      firstName: (profile.full_name ?? 'Student').split(' ')[0],
      lastName: (profile.full_name ?? '').split(' ').slice(1).join(' '),
      description: `OrlaDent Camp — ${quote.tier.name_en}`,
      // Where the BUYER lands. Purely cosmetic: access is granted by the
      // webhook, so a buyer who never reaches this page still gets in.
      redirectUrl: `${origin}${lh(safeLocale, '/course')}?paid=1`,
      webhookUrl: `${origin}/api/webhook/tap`
    });

    await admin.from('payments').update({ provider_reference: charge.chargeId }).eq('id', payment.id);

    return NextResponse.json({ url: charge.url });
  } catch (e) {
    console.error('[checkout] tap failed:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
