import crypto from 'crypto';

const BASE = 'https://accept.paymob.com/api';

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Paymob ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Full auth -> order -> payment key flow. Returns the hosted iframe URL. */
export async function createPaymobCheckout(opts: {
  amountEgp: number;
  merchantOrderId: string;
  email: string;
  fullName: string;
  phone?: string;
  integrationId?: string;
}) {
  const { token } = await post<{ token: string }>('/auth/tokens', { api_key: process.env.PAYMOB_API_KEY });

  const order = await post<{ id: number }>(
    '/ecommerce/orders',
    {
      auth_token: token,
      delivery_needed: false,
      amount_cents: Math.round(opts.amountEgp * 100),
      currency: 'EGP',
      merchant_order_id: opts.merchantOrderId,
      items: []
    }
  );

  const [firstName, ...rest] = (opts.fullName || 'Student').split(' ');
  const paymentKey = await post<{ token: string }>('/acceptance/payment_keys', {
    auth_token: token,
    amount_cents: Math.round(opts.amountEgp * 100),
    expiration: 3600,
    order_id: order.id,
    currency: 'EGP',
    integration_id: Number(opts.integrationId ?? process.env.PAYMOB_INTEGRATION_ID),
    billing_data: {
      email: opts.email,
      first_name: firstName,
      last_name: rest.join(' ') || 'Student',
      phone_number: opts.phone || '+201000000000',
      apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA',
      shipping_method: 'NA', postal_code: 'NA', city: 'NA', country: 'EG', state: 'NA'
    }
  });

  return {
    orderId: String(order.id),
    url: `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKey.token}`
  };
}

/**
 * HMAC verification, per Paymob's docs: concatenate a fixed, alphabetically
 * ordered set of fields from the transaction object and SHA-512 them with the
 * HMAC secret. Reject anything that doesn't match — the callback is public.
 */
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'
];

const pick = (obj: Record<string, any>, path: string) =>
  path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);

export function verifyPaymobHmac(transaction: Record<string, any>, receivedHmac: string) {
  /*
   * A missing secret must FAIL the check, not crash it.
   *
   * `createHmac('sha512', undefined)` throws, so an unconfigured environment
   * turned every webhook into a 500. Paymob retries on 5xx, so a
   * misconfiguration became a retry loop against an endpoint that could never
   * succeed. Returning false rejects it cleanly with a 401 and leaves a log
   * line saying exactly what is missing.
   */
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) {
    console.error('[paymob] PAYMOB_HMAC_SECRET is not set — rejecting webhook');
    return false;
  }

  const concatenated = HMAC_FIELDS.map((field) => String(pick(transaction, field))).join('');
  const expected = crypto
    .createHmac('sha512', secret)
    .update(concatenated)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHmac ?? ''));
  } catch {
    return false;
  }
}
