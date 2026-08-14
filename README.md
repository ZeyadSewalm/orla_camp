# OrlaDent Camp

Bilingual (AR/EN) training platform: tiered plans, a growing module library, case-file QC review, community + live Q&A, and a full admin panel.

Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + Storage) · Paymob + PayPal · next-intl.

---

## 1. Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000/ar
```

## 2. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor** and run `supabase/schema.sql` top to bottom. It creates every table, the RLS policies, the storage buckets, and seeds the three plans.
3. **Authentication → Providers → Email**: turn on "Confirm email".
4. **Authentication → URL Configuration**: set Site URL to your domain (or `http://localhost:3000`).
5. Sign up through `/ar/signup`, then make yourself an admin:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

Buckets created by the schema:

| Bucket | Public | Holds |
|---|---|---|
| `checklists` | yes | module checklist PDFs |
| `landing` | yes | landing page image |
| `case-files` | **no** | student case uploads — owner + admin only, opened via signed URLs |

## 3. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=          # Project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # server-only, never expose

PAYMOB_API_KEY=
PAYMOB_INTEGRATION_ID=             # card integration
PAYMOB_INTEGRATION_ID_FAWRY=       # optional
PAYMOB_IFRAME_ID=
PAYMOB_HMAC_SECRET=

PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_ENV=sandbox                 # sandbox | live

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Nothing goes in the code. Card data is never stored — both gateways host their own payment page.

## 4. Sandbox → live

Everything runs against the test environment first; going live is a key swap, not a code change.

**PayPal** — set `PAYPAL_ENV=live` and replace `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` with the live app's values. Sandbox uses `api-m.sandbox.paypal.com`, live uses `api-m.paypal.com`; `lib/paypal.ts` picks by `PAYPAL_ENV`.

**Paymob** — replace `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` with the live values from the Paymob dashboard. Test cards live in Paymob's docs.

Webhook URLs to register in both dashboards:

```
https://YOUR-DOMAIN/api/webhook/paymob
https://YOUR-DOMAIN/api/webhook/paypal
```

Both handlers verify the signature before touching the database (Paymob: HMAC-SHA512 over the documented field order; PayPal: the official verify-webhook-signature endpoint). Unverified requests get a 401.

## 5. Deploy to Vercel

1. Push to GitHub, import the repo in Vercel.
2. **Settings → Environment Variables**: add every variable above. `SUPABASE_SERVICE_ROLE_KEY`, both gateway secret groups → Production + Preview only. `NEXT_PUBLIC_SITE_URL` → your real domain.
3. Deploy, then point both gateway webhooks at the deployed domain.
4. Add the domain to Supabase → Authentication → URL Configuration.

## 6. How the tier system works

Plans live in the `tiers` table — nothing about them is hard-coded, so a fourth plan is a row, not a deploy.

| Column | What it drives |
|---|---|
| `order_index` | the plan's rank. Everything gated compares against it |
| `price_egp` / `price_usd` | which price shows, chosen by the member's `region` |
| `installments_available` + `installment_price_*` | whether checkout offers 3 payments |
| `is_self_checkout` | `true` → "Subscribe now". `false` → "Request a call with Badr" |
| `max_seats` / `current_seats_taken` | seat counter. Production Partner is 3; sold out hides the button |
| `features` | the bullet list on `/pricing`, as `{"ar": [...], "en": [...]}` |

Gating runs at three depths:

1. **Middleware** — is the visitor signed in, is `has_access` true, is `role = 'admin'` for `/admin`.
2. **The page** — `/community` and `/live-sessions` compare the member's `order_index` against `min_tier_order`.
3. **RLS** — the same comparison in Postgres, so a WhatsApp link or a join link can't be read by an API call from a lower plan even if the UI were bypassed.

Production Partner never checks out on its own. The flow is: `/apply-production-partner` → row in `production_partner_requests` → admin sets status and the agreed price → **Grant access manually**, which sets the plan, flips `has_access`, records the payment and takes one of the three seats.

**No plan includes a certificate.** That's stated on the landing page, under the pricing table, in the footer, and in the FAQ.

## 7. Video protection — read this

Drive's "viewers can't download" stops the casual save. It is not real protection; a determined viewer can still screen-record. The gate that matters is the server check on `has_access` before the iframe is ever rendered (`app/[locale]/course/page.tsx` → `components/VideoEmbed.tsx`). Keep the Drive links on **Anyone with the link — Viewer** or the embed won't play at all.

## 8. Structure

```
app/[locale]/            pages (ar | en)
app/api/                 payment creation + webhooks
components/              UI, components/admin for the panel
lib/                     supabase clients, pricing, gateways, drive, access
messages/                ar.json, en.json — static UI copy
public/logo/             mark + horizontal and vertical lockups (SVG)
supabase/schema.sql      tables, RLS, buckets, seed
middleware.ts            locale routing + route protection
```

Dynamic copy (plans, modules, landing) is bilingual in the database via `_ar` / `_en` columns, and every admin form edits both languages side by side.
