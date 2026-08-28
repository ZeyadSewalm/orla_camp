-- =============================================================
-- OrlaDent Camp — Migration 007: COLUMN-LEVEL SECURITY
--
-- Run ONCE in the Supabase SQL editor, after migration-006-leads.sql.
-- Additive and idempotent — safe to re-run.
--
-- ⚠️  THIS FIXES TWO SERIOUS HOLES. Run it before taking real payments.
--
-- Both come from the same misunderstanding: Row Level Security is ROW level.
-- A policy decides WHICH ROWS you may touch. It says nothing about WHICH
-- COLUMNS. Every policy below was written correctly for rows and left the
-- columns wide open.
-- =============================================================


-- =============================================================
-- HOLE 1 — Any logged-in user could make themselves an admin.
-- =============================================================
-- The policy:
--     create policy "profiles own update" on profiles
--       for update using (id = auth.uid()) with check (id = auth.uid());
--
-- reads as "you may edit your own profile", and that is exactly what it does —
-- ALL of it. profiles carries `role`, `has_access` and `tier_id`. The anon key
-- ships inside the browser bundle, so any signed-up user could open devtools
-- and run:
--
--     supabase.from('profiles')
--             .update({ role: 'admin', has_access: true })
--             .eq('id', <their own id>)
--
-- and become an administrator with the full course, for free, in one line.
-- No server code had to be tricked; the database allowed it directly.
--
-- The fix is column-level privileges. Postgres checks these BEFORE policies,
-- so the write is refused no matter what the policy says.

revoke update on public.profiles from anon, authenticated;

-- The only fields a user has any business changing about themselves.
grant update (full_name, region) on public.profiles to authenticated;

-- Nothing in the app writes to profiles from the browser — every write goes
-- through a server action or a webhook using the service-role key, which
-- bypasses RLS and column grants alike. So this removes an attack surface
-- without removing a feature.


-- =============================================================
-- HOLE 2 — The whole paid course was readable by anyone.
-- =============================================================
-- The policy:
--     create policy "modules public read" on course_modules
--       for select using (true);
--
-- carried the comment "the video link is only ever selected through a server
-- component that checks has_access first". That is true of the application —
-- and irrelevant, because the browser can query the table directly:
--
--     supabase.from('course_modules').select('video_link, bunny_video_id')
--
-- with the public anon key, and receive every video URL in the course. Not
-- one lesson: all of them. The paywall existed only in the UI.
--
-- The table still needs public SELECT — the landing page lists module titles
-- and statuses. So the fix is to keep row access and remove the two columns
-- that are the product.

revoke select (video_link, bunny_video_id) on public.course_modules from anon, authenticated;

-- Server-side reads of those columns now go through the service-role client,
-- which is not subject to these grants. See lib/data.ts.


-- =============================================================
-- HARDENING — stop forged Production Partner requests
-- =============================================================
-- `with check (true)` let anyone insert a request with ANY user_id attached,
-- including another customer's. The form is deliberately open to visitors who
-- are not signed in, so anonymous inserts stay allowed — but an insert may now
-- only claim your own id, or none.

drop policy if exists "ppr own insert" on public.production_partner_requests;
create policy "ppr own insert" on public.production_partner_requests
  for insert with check (user_id is null or user_id = auth.uid());


-- =============================================================
-- VERIFY — run these after applying
-- =============================================================
-- Should list ONLY full_name and region:
--   select column_name, privilege_type
--     from information_schema.column_privileges
--    where table_name = 'profiles' and grantee = 'authenticated'
--      and privilege_type = 'UPDATE';
--
-- Should NOT list video_link or bunny_video_id:
--   select column_name
--     from information_schema.column_privileges
--    where table_name = 'course_modules' and grantee = 'anon'
--      and privilege_type = 'SELECT';
-- =============================================================
