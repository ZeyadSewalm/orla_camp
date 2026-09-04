-- =============================================================
-- OrlaDent Camp — Migration 014: TURN OFF INSTALMENTS
--
-- Run ONCE in the Supabase SQL editor. Additive and idempotent.
-- Run this together with migration-013 and the matching deploy.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- Instalment plans were removed from the pricing page and the comparison table
-- in the same change as this file. But the CHECKOUT page reads
-- `tiers.installments_available` directly, and lib/checkout-server.ts prices
-- the instalment quote from `installment_price_egp`. Change the marketing pages
-- alone and the site advertises one price while checkout still offers a
-- three-payment plan underneath it — the worst of both, and the kind of
-- mismatch that turns into a refund argument.
--
-- Flipping the flag is what actually removes the option: the checkout UI is
-- written as `tier.installments_available && ...`, so false hides the plan
-- selector AND stops the server producing an instalment quote.

update public.tiers
   set installments_available = false
 where installments_available is true;

-- The instalment PRICES are deliberately not cleared. They are the record of
-- what was charged to students already on a plan, `profiles.installments_paid`
-- and `installments_total` still track those people, and the admin panel still
-- shows who owes what. Wiping the numbers would orphan that history.
--
-- Nothing is dropped: re-ticking "instalments available" on a tier in the admin
-- panel restores the plan in full, with the prices already there.

comment on column public.tiers.installments_available is
  'Whether checkout offers a payment plan for this tier. FALSE for all tiers since migration 014. The instalment prices below are kept for students already on a plan.';
