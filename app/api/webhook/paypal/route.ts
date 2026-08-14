import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { capturePaypalOrder, verifyPaypalWebhook } from '@/lib/paypal';
import { grantAccessForPayment } from '@/lib/grant-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const raw = await request.text();

  if (!(await verifyPaypalWebhook(request.headers, raw))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const event = JSON.parse(raw);
  const resource = event.resource ?? {};

  // custom_id carries our payments.id; PAYMENT.CAPTURE.COMPLETED is the money event.
  const paymentId: string | undefined =
    resource.custom_id ?? resource.purchase_units?.[0]?.custom_id;

  if (!paymentId) return NextResponse.json({ ok: true, ignored: 'no_reference' });

  const admin = createAdminClient();

  if (event.event_type === 'PAYMENT.CAPTURE.DENIED' || event.event_type === 'PAYMENT.CAPTURE.REVERSED') {
    await admin.from('payments').update({ status: 'failed' }).eq('id', paymentId);
    return NextResponse.json({ ok: true });
  }

  /**
   * Approval is NOT payment. When the buyer approves, we must capture — that
   * is the call that charges the card. Access is granted only once money has
   * actually moved (CAPTURE.COMPLETED), never on approval alone.
   */
  if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    const result = await capturePaypalOrder(resource.id);
    if (!result.ok) {
      await admin.from('payments').update({ status: 'failed' }).eq('id', paymentId);
      return NextResponse.json({ ok: false, reason: 'capture_failed' });
    }
    // PayPal now fires PAYMENT.CAPTURE.COMPLETED, which grants access below.
    // Granting here too keeps it working even if that webhook is missed;
    // grantAccessForPayment is idempotent so this cannot double-count.
    await grantAccessForPayment(paymentId, result.captureId ?? resource.id);
    return NextResponse.json({ ok: true, captured: true });
  }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    await grantAccessForPayment(paymentId, resource.id);
  }

  return NextResponse.json({ ok: true });
}
