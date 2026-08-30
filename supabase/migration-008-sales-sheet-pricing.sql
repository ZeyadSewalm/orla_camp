-- =============================================================
-- OrlaDent Camp — Migration 008: prices from the sales sheet
--
-- Run ONCE in the Supabase SQL editor, after migration-007.
-- Idempotent — safe to re-run; it sets absolute values, not deltas.
--
-- The live site was showing 12,000 / 22,000 EGP and $260 / $480. The sales
-- sheet — the source of truth — says 7,500 / 15,000 EGP and $249 / $499.
-- These are not small differences and they run in both directions, so this
-- writes every price field explicitly rather than nudging any of them.
-- =============================================================

-- ---------- Foundation ----------
update public.tiers set
  price_egp                = 7500,
  price_usd                = 249,
  installments_available   = true,
  installment_count        = 3,
  installment_price_egp    = 2750,   -- 3 x 2,750 = 8,250
  installment_price_usd    = 89,     -- 3 x 89    = 267
  is_self_checkout         = true,
  max_seats                = null
where slug = 'foundation';

-- ---------- Freelance Ready ----------
update public.tiers set
  price_egp                = 15000,
  price_usd                = 499,
  installments_available   = true,
  installment_count        = 3,
  installment_price_egp    = 5500,   -- 3 x 5,500 = 16,500
  installment_price_usd    = 179,    -- 3 x 179   = 537
  is_self_checkout         = true,
  max_seats                = null
where slug = 'freelance_ready';

-- ---------- Production Partner ----------
-- Priced per student on a call with Badr. NULL prices are what make the site
-- print "priced after the call" instead of a number, and is_self_checkout =
-- false is what stops anyone paying their way in without that call.
update public.tiers set
  price_egp                = null,
  price_usd                = null,
  installments_available   = false,
  installment_price_egp    = null,
  installment_price_usd    = null,
  is_self_checkout         = false,
  max_seats                = 3
where slug = 'production_partner';

-- =============================================================
-- ABOUT THE INSTALMENT PREMIUM
--
-- The sales sheet's own instalment figures total about 10% more than paying
-- in full (8,250 vs 7,500 and 16,500 vs 15,000). That is a deliberate pricing
-- decision and this migration keeps it exactly as written.
--
-- What it did contradict was the site copy, which said "3 أقساط من غير رسوم
-- إضافية" / "3 instalments, no extra fee". That claim has been corrected in
-- messages/ar.json and messages/en.json to state the premium plainly. On a
-- page whose whole argument is that it does not overstate anything, that was
-- the one line that did.
-- =============================================================

-- ---------- VERIFY ----------
-- select slug, price_egp, installment_price_egp, installment_price_egp * 3 as egp_total,
--        price_usd, installment_price_usd, installment_price_usd * 3 as usd_total,
--        is_self_checkout, max_seats
--   from tiers order by order_index;
