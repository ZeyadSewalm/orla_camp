const API = () =>
  process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function accessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${API()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  return (await res.json()).access_token as string;
}

/** Creates an order and returns the approval URL to send the buyer to. */
export async function createPaypalOrder(opts: { amountUsd: number; reference: string; returnUrl: string; cancelUrl: string }) {
  const token = await accessToken();
  const res = await fetch(`${API()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: opts.reference,
          amount: { currency_code: 'USD', value: opts.amountUsd.toFixed(2) }
        }
      ],
      application_context: {
        brand_name: 'OrlaDent Camp',
        user_action: 'PAY_NOW',
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl
      }
    }),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`PayPal order failed: ${await res.text()}`);
  const order = await res.json();
  const approve = order.links?.find((l: { rel: string }) => l.rel === 'approve')?.href as string | undefined;
  return { id: order.id as string, url: approve! };
}

/**
 * Captures an approved order — this is the step that actually moves the money.
 *
 * With intent: 'CAPTURE', the buyer approving the order does NOT charge them.
 * PayPal waits for this call. Without it the order sits approved and expires,
 * and you never get paid. Idempotent: capturing twice returns the same result
 * or an ORDER_ALREADY_CAPTURED error, which we treat as success.
 */
export async function capturePaypalOrder(orderId: string): Promise<{ ok: boolean; captureId?: string }> {
  const token = await accessToken();
  const res = await fetch(`${API()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Guards against double charges if this runs twice for the same order.
      'PayPal-Request-Id': `capture-${orderId}`
    },
    cache: 'no-store'
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const alreadyDone = JSON.stringify(body).includes('ORDER_ALREADY_CAPTURED');
    return { ok: alreadyDone };
  }

  const captureId = body?.purchase_units?.[0]?.payments?.captures?.[0]?.id as string | undefined;
  return { ok: body?.status === 'COMPLETED', captureId };
}

/** Verifies a webhook using PayPal's own verification endpoint (the official method). */
export async function verifyPaypalWebhook(headers: Headers, rawBody: string) {
  const token = await accessToken();
  const res = await fetch(`${API()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody)
    }),
    cache: 'no-store'
  });
  if (!res.ok) return false;
  return (await res.json()).verification_status === 'SUCCESS';
}
