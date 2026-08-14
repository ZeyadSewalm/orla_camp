-- =============================================================
-- OrlaDent Camp — Migration 004: backend audit fixes
--
-- Run ONCE in the Supabase SQL editor, after migration-003-bunny.sql.
-- =============================================================

-- ---------- FIX 1: case-file read policy ----------
-- The old policy matched on storage.objects.owner, which is deprecated and is
-- NULL for anything uploaded through the JS client. Result: a student could
-- upload a case file and then get "not found" trying to read it back.
-- The path already starts with the user id, so match on that instead —
-- the same rule the insert policy already uses.
drop policy if exists "case files owner read" on storage.objects;
create policy "case files owner read" on storage.objects for select
  using (
    bucket_id = 'case-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
      or is_reviewer()
    )
  );

-- ---------- FIX 2: installment tracking ----------
-- Only the first instalment was ever charged. These columns let the platform
-- know what is still owed, so access can be tied to keeping up with payments
-- instead of being granted permanently after one third of the price.
alter table profiles add column if not exists installments_paid int default 0;
alter table profiles add column if not exists installments_total int default 0;
alter table profiles add column if not exists next_installment_due date;

comment on column profiles.installments_total is '0 = paid in full. Otherwise the number of instalments agreed (usually 3).';
comment on column profiles.next_installment_due is 'Set when an instalment plan starts. Used by the admin panel to chase what is owed.';

-- ---------- FIX 3: prevent duplicate pending payments ----------
-- A student clicking "pay" five times created five pending rows. Harmless but
-- it makes the payments screen unreadable. Index to find and clean them.
create index if not exists payments_user_status_idx on payments(user_id, status);

-- ---------- FIX 4: promo code usage integrity ----------
-- used_count was incremented with a read-then-write, which can lose a count
-- under concurrent checkouts. This does it atomically instead.
create or replace function public.increment_promo_use(promo_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update promo_codes set used_count = coalesce(used_count, 0) + 1 where id = promo_id;
$$;

-- ---------- FIX 5: seat counting integrity ----------
create or replace function public.increment_tier_seat(tier uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update tiers set current_seats_taken = coalesce(current_seats_taken, 0) + 1
  where id = tier and (max_seats is null or coalesce(current_seats_taken, 0) < max_seats);
$$;
