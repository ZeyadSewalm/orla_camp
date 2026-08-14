import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPaymobHmac } from '@/lib/paymob';
import { grantAccessForPayment } from '@/lib/grant-access';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const body = await request.json();

  // Paymob sends the hmac as a query param on the callback and inside the body.
  const hmac = url.searchParams.get('hmac') ?? body.hmac ?? '';
  const transaction = body.obj ?? body;

  if (!verifyPaymobHmac(transaction, hmac)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const success = transaction.success === true || transaction.success === 'true';
  const merchantOrderId: string | undefined = transaction.order?.merchant_order_id;
  const paymobOrderId = String(transaction.order?.id ?? '');

  const admin = createAdminClient();

  // merchant_order_id is our payments.id; fall back to the provider reference.
  let paymentId = merchantOrderId;
  if (!paymentId && paymobOrderId) {
    const { data } = await admin.from('payments').select('id').eq('provider_reference', paymobOrderId).maybeSingle();
    paymentId = data?.id;
  }
  if (!paymentId) return NextResponse.json({ error: 'payment_not_found' }, { status: 404 });

  if (!success) {
    await admin.from('payments').update({ status: 'failed' }).eq('id', paymentId);
    return NextResponse.json({ ok: true });
  }

  await grantAccessForPayment(paymentId, paymobOrderId);
  return NextResponse.json({ ok: true });
}
