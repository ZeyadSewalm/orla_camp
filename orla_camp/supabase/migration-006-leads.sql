-- =============================================================
-- OrlaDent Camp — Migration 006: lead capture for the free lesson
--
-- Run ONCE in the Supabase SQL editor, after migration-005-auth-repair.sql.
-- Additive and idempotent — safe to re-run.
-- =============================================================

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  full_name   text,
  region      text default 'egypt',
  source      text default 'free-lesson',
  -- Marketing attribution, so you can tell which post or ad actually paid off.
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  -- Set when this email later becomes a paying account, so you can measure
  -- what share of the free lesson converts.
  converted_user_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One row per email. A returning visitor updates their row rather than
-- creating a duplicate — otherwise the list is unusable within a week.
create unique index if not exists leads_email_key on public.leads (lower(email));
create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

/*
 * NO public select policy, deliberately.
 *
 * With RLS on and no select policy, the anon key cannot read this table at
 * all — which is the point. An email list is the single most scrapeable thing
 * on a marketing site, and `select * from leads` with a key that ships in the
 * browser would hand the whole list to anyone who opened devtools.
 *
 * Inserts do NOT go through this policy either: the capture runs as a server
 * action using the service-role key, so it can upsert while the browser can
 * do neither. Admins read the list through the same server side.
 */
create policy "leads admin read" on public.leads
  for select using (is_admin());

create policy "leads admin write" on public.leads
  for all using (is_admin()) with check (is_admin());

-- =============================================================
-- Mark the module you want to give away:
--
--   update course_modules set is_free_preview = true
--    where title_en ilike '%single crown%';
--
-- The /free-lesson page reads whichever module has is_free_preview = true
-- (lowest order_index wins), so you can swap the giveaway any time from the
-- admin panel without touching code.
--
-- Who signed up, newest first:
--   select email, full_name, region, created_at from leads order by created_at desc;
-- =============================================================
