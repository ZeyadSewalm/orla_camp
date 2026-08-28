import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTapHashstring } from '@/lib/tap';
import { grantAccessForPayment } from '@/lib/grant-access';

export const dynamic = 'force-dynamic';

/**
 * Tap's server-to-server notification. This — not the buyer's redirect — is
 * what grants access.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  let charge: Record<string, any>;
  try {
    charge = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }

  const hash = request.headers.get('hashstring') ?? '';
  if (!verifyTapHashstring(charge, hash)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Our payments.id, wherever Tap echoed it back.
  let paymentId: string | undefined =
    charge.metadata?.payment_id ?? charge.reference?.order ?? charge.reference?.transaction;

  if (!paymentId && charge.id) {
    const { data } = await admin
      .from('payments')
      .select('id')
      .eq('provider_reference', charge.id)
      .maybeSingle();
    paymentId = data?.id;
  }

  if (!paymentId) return NextResponse.json({ error: 'payment_not_found' }, { status: 404 });

  /*
   * CAPTURED is the only status that means money moved.
   *
   * Tap also sends INITIATED and, for asynchronous methods, an intermediate
   * state before the funds settle. Treating anything other than CAPTURED as
   * success would hand out course access for a payment that has not completed
   * — and for a redirect method the buyer can reach that state and then simply
   * abandon the page.
   */
  const status = String(charge.status ?? '').toUpperCase();

  if (status === 'CAPTURED') {
    await grantAccessForPayment(paymentId, charge.id, Number(charge.amount));
    return NextResponse.json({ ok: true });
  }

  if (['FAILED', 'DECLINED', 'CANCELLED', 'VOID', 'TIMEDOUT', 'ABANDONED'].includes(status)) {
    // Only mark failed if it has not already been paid — a late failure
    // notification must never revoke a captured payment.
    await admin.from('payments').update({ status: 'failed' }).eq('id', paymentId).neq('status', 'paid');
    return NextResponse.json({ ok: true });
  }

  // INITIATED and anything else: acknowledge so Tap stops retrying, change
  // nothing.
  return NextResponse.json({ ok: true, ignored: status });
}
