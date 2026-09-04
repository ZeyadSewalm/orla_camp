-- =============================================================
-- OrlaDent Camp — Migration 013: REMOVE THE PRODUCTION PARTNER SEAT CAP
--
-- Run ONCE in the Supabase SQL editor. Additive and idempotent.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- Production Partner was launched as a 3-seat pilot, and that cap lived in two
-- places: the marketing copy, and `tiers.max_seats`. The copy has been rewritten
-- to talk about the intro call instead of a seat count, but copy alone is not
-- enough — `max_seats` is still enforced server-side in three places:
--
--   1. lib/checkout-server.ts refuses checkout when no seats are left.
--   2. lib/grant-access.ts increments the counter on every successful payment.
--   3. the manual-enrolment admin action throws 'no_seats_left'.
--
-- Leave the number in place and the site would keep refusing enrolments once
-- three people had paid, with no seat counter on screen to explain why. That is
-- strictly worse than the visible cap it replaced.
--
-- Setting max_seats to NULL is what actually lifts the limit: every check in
-- the codebase is written as `max_seats !== null && ...`, so NULL means
-- "uncapped" everywhere, in one statement, with no deploy.

update public.tiers
   set max_seats = null
 where max_seats is not null;

-- The column and the machinery stay. Nothing here is dropped: if a future
-- cohort is ever capped again, setting a number in the admin panel restores the
-- full behaviour — counter, sold-out state and all — without a migration.
--
-- current_seats_taken is deliberately NOT reset. It is an honest record of how
-- many people enrolled on each tier, and it is now purely informational.

comment on column public.tiers.max_seats is
  'Maximum enrolments for this tier. NULL = uncapped (the default since migration 013). Set a number to re-enable the seat counter, the sold-out state and the server-side checkout guard.';
