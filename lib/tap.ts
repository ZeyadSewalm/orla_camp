import crypto from 'crypto';

/**
 * Tap Payments — the Gulf/GCC gateway, replacing PayPal.
 *
 * Tap is the gateway the sales sheet specifies for Gulf/GCC. It covers cards
 * plus the local schemes a Gulf customer actually reaches for — mada in Saudi,
 * KNET in Kuwait, Benefit in Bahrain, Apple Pay — which PayPal does not.
 *
 * Flow: create a charge → Tap returns a hosted payment URL → the buyer pays
 * there → Tap POSTs a webhook to `post.url` and sends the buyer back to
 * `redirect.url`. Access is granted from the WEBHOOK, never from the redirect:
 * the redirect is a browser navigation the buyer can abandon, refresh, or
 * forge, while the webhook is server-to-server and signed.
 */

const API = 'https://api.tap.company/v2';

function secretKey() {
  const key = process.env.TAP_SECRET_KEY;
  if (!key) throw new Error('TAP_SECRET_KEY is not set');
  return key;
}

export function isTapConfigured() {
  return Boolean(process.env.TAP_SECRET_KEY);
}

/**
 * Decimal places per ISO currency, which Tap requires for BOTH the charge
 * amount and the webhook hash.
 *
 * This is not cosmetic. The hash is computed over the amount as a STRING, so
 * "2.00" and "2.0" produce completely different hashes. Kuwaiti dinar, Bahraini
 * dinar, Omani rial and Jordanian dinar use three decimals; everything else
 * here uses two. Getting this wrong means every webhook fails verification and
 * no customer is ever granted access.
 */
const DECIMALS: Record<string, number> = {
  KWD: 3, BHD: 3, OMR: 3, JOD: 3,
  USD: 2, SAR: 2, AED: 2, QAR: 2, EGP: 2, EUR: 2, GBP: 2
};

export function tapAmount(amount: number, currency: string): string {
  return Number(amount).toFixed(DECIMALS[currency.toUpperCase()] ?? 2);
}

export async function createTapCharge(opts: {
  amount: number;
  currency: string;
  /** Our payments.id — comes straight back on the webhook. */
  reference: string;
  email: string;
  firstName: string;
  lastName?: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
}) {
  const res = await fetch(`${API}/charges`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Number(tapAmount(opts.amount, opts.currency)),
      currency: opts.currency.toUpperCase(),
      threeDSecure: true,
      save_card: false,
      description: opts.description,
      // Our id travels in two places on purpose — Tap echoes `reference.order`
      // back reliably, and metadata is the documented free-form carrier. The
      // webhook reads whichever is present.
      reference: { order: opts.reference, transaction: opts.reference },
      metadata: { payment_id: opts.reference },
      customer: {
        first_name: opts.firstName,
        last_name: opts.lastName || '',
        email: opts.email
      },
      source: { id: 'src_all' }, // Tap's hosted page: every method enabled on the account
      post: { url: opts.webhookUrl },
      redirect: { url: opts.redirectUrl }
    }),
    cache: 'no-store'
  });

  const data = await res.json();

  if (!res.ok || !data?.transaction?.url) {
    console.error('[tap] charge creation failed:', data);
    throw new Error(data?.errors?.[0]?.description ?? 'tap_charge_failed');
  }

  return { url: data.transaction.url as string, chargeId: data.id as string };
}

/**
 * Verifies the `hashstring` header Tap sends with every webhook.
 *
 * Per Tap's spec the signed string is the concatenation
 *   x_id…x_amount…x_currency…x_gateway_reference…x_payment_reference…x_status…x_created…
 * HMAC-SHA256'd with the secret API key. `reference.gateway` is passed as an
 * empty string when absent — that is Tap's documented behaviour, not a guess.
 */
export function verifyTapHashstring(charge: Record<string, any>, receivedHash: string): boolean {
  const key = process.env.TAP_SECRET_KEY;
  if (!key) {
    // Fail closed, and say why. Throwing here would return a 500, and Tap
    // retries on 5xx — a misconfiguration would become a retry loop against an
    // endpoint that can never succeed.
    console.error('[tap] TAP_SECRET_KEY is not set — rejecting webhook');
    return false;
  }
  if (!receivedHash) return false;

  const toHash =
    `x_id${charge.id ?? ''}` +
    `x_amount${tapAmount(charge.amount ?? 0, charge.currency ?? 'USD')}` +
    `x_currency${charge.currency ?? ''}` +
    `x_gateway_reference${charge.reference?.gateway ?? ''}` +
    `x_payment_reference${charge.reference?.payment ?? ''}` +
    `x_status${charge.status ?? ''}` +
    `x_created${charge.transaction?.created ?? ''}`;

  const expected = crypto.createHmac('sha256', key).update(toHash).digest('hex');

  try {
    // Constant-time compare: a plain === leaks how much of the hash matched
    // through response timing, which is enough to forge one given patience.
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHash));
  } catch {
    // Length mismatch — timingSafeEqual throws rather than returning false.
    return false;
  }
}
