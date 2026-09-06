-- =============================================================
-- OrlaDent Camp — Migration 016: PER-STUDENT LESSON OVERRIDES
--
-- Run ONCE in the Supabase SQL editor. Additive and idempotent.
-- =============================================================
--
-- WHAT THIS IS FOR
--
-- Exceptions, not routine administration. A student who paid part of the fee
-- and gets one extra lesson; a student behind on instalments whose access to a
-- lesson is paused; someone given a preview of higher-tier content. The tier
-- remains the rule — this is the documented way to break it for one person.
--
-- WHY A TABLE AND NOT A COLUMN
--
-- Overrides are sparse: a handful of rows across the whole student body. An
-- array column on `profiles` would have to be rewritten wholesale on every
-- change, cannot be indexed usefully, and has nowhere to record WHO granted
-- what and WHY — which is the first thing anyone asks three months later.

create table if not exists public.module_access_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  module_id   uuid not null references public.course_modules(id) on delete cascade,

  -- 'grant' opens a lesson the student's tier excludes.
  -- 'deny'  closes a lesson the student's tier includes.
  mode        text not null check (mode in ('grant', 'deny')),

  -- Why this exists. Not optional in spirit: an override with no reason is one
  -- nobody will dare remove later.
  note        text,

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per student per lesson. A student cannot be simultaneously granted
  -- and denied the same lesson; changing your mind updates the row.
  unique (user_id, module_id)
);

create index if not exists module_access_overrides_user_idx
  on public.module_access_overrides (user_id);

comment on table public.module_access_overrides is
  'Per-student exceptions to tier-based lesson access. Sparse by design — the tier is still the rule. mode=grant opens a lesson the tier excludes; mode=deny closes one it includes.';

-- ---------- RLS ----------
--
-- THE POINT OF THIS SECTION.
--
-- The course page applies overrides when it decides what to render, but a page
-- is not a security boundary: `course_modules` is publicly readable, and a
-- student could query Supabase directly. What actually protects paid content is
-- that a locked lesson never receives a signed video URL — and that decision
-- has to be able to read these rows.
--
-- So: a student may read their OWN overrides (the course page runs as them and
-- needs to know), and nobody else's. Only staff may write.

alter table public.module_access_overrides enable row level security;

drop policy if exists "overrides own read" on public.module_access_overrides;
create policy "overrides own read"
  on public.module_access_overrides
  for select
  using (user_id = auth.uid() or is_admin());

drop policy if exists "overrides admin write" on public.module_access_overrides;
create policy "overrides admin write"
  on public.module_access_overrides
  for all
  using (is_admin())
  with check (is_admin());

-- ---------- FORENSIC WATERMARK IDENTITY ----------
--
-- Returns the short label burned over the player for the current user.
--
-- Screen recording cannot be prevented in a browser — no CSS or JS trick
-- survives a screen recorder or a phone camera, and the ones that exist mostly
-- inconvenience honest students. What a watermark does instead is remove
-- anonymity: a leaked recording carries the account it came from.
--
-- This is a function rather than a column so the label can change without a
-- migration, and so the email is never handed to the client in full.

create or replace function public.my_watermark_label()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.full_name), '') || ' · ' || split_part(p.email, '@', 1),
    split_part(p.email, '@', 1),
    'OrlaDent'
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.my_watermark_label() to authenticated;
