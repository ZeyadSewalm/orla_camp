-- =============================================================
-- OrlaDent Camp — Migration 009: student lesson progress
--
-- Run ONCE in the Supabase SQL editor after migration-008.
-- Additive and idempotent. Existing course/auth/payment data is untouched.
-- =============================================================

create table if not exists public.lesson_progress (
  user_id uuid references public.profiles(id) on delete cascade not null,
  module_id uuid references public.course_modules(id) on delete cascade not null,
  is_completed boolean not null default false,
  watch_seconds integer not null default 0 check (watch_seconds >= 0),
  started_at timestamptz not null default now(),
  last_watched_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

create index if not exists lesson_progress_user_recent_idx
  on public.lesson_progress (user_id, last_watched_at desc);

alter table public.lesson_progress enable row level security;

drop policy if exists "lesson progress own read" on public.lesson_progress;
create policy "lesson progress own read" on public.lesson_progress
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "lesson progress own insert" on public.lesson_progress;
create policy "lesson progress own insert" on public.lesson_progress
  for insert with check (user_id = auth.uid());

drop policy if exists "lesson progress own update" on public.lesson_progress;
create policy "lesson progress own update" on public.lesson_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Students may read their own rows, but direct writes are intentionally
-- blocked. All writes go through the validated RPC functions below so the
-- browser cannot arbitrarily overwrite watch_seconds.
revoke insert, update on public.lesson_progress from authenticated;
grant select on public.lesson_progress to authenticated;

-- Record active watch time without a read-then-write race in the browser.
-- p_seconds is capped per call so a malformed client cannot inflate the
-- student's own statistic by sending an arbitrarily large number at once.
create or replace function public.record_lesson_watch(
  p_module_id uuid,
  p_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_seconds integer := greatest(0, least(coalesce(p_seconds, 0), 120));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.has_access, false) or p.role in ('admin', 'reviewer'))
  ) then
    raise exception 'course access required';
  end if;

  insert into public.lesson_progress (
    user_id, module_id, watch_seconds, started_at, last_watched_at, updated_at
  ) values (
    auth.uid(), p_module_id, safe_seconds, now(), now(), now()
  )
  on conflict (user_id, module_id) do update
    set watch_seconds = lesson_progress.watch_seconds + safe_seconds,
        last_watched_at = now(),
        updated_at = now();
end;
$$;

revoke all on function public.record_lesson_watch(uuid, integer) from public;
revoke execute on function public.record_lesson_watch(uuid, integer) from anon;
grant execute on function public.record_lesson_watch(uuid, integer) to authenticated;

-- Completion uses the authenticated uid inside Postgres, so the client never
-- gets to choose which user's progress row is modified.
create or replace function public.set_lesson_complete(
  p_module_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (coalesce(p.has_access, false) or p.role in ('admin', 'reviewer'))
  ) then
    raise exception 'course access required';
  end if;

  insert into public.lesson_progress (
    user_id, module_id, is_completed, completed_at, started_at, last_watched_at, updated_at
  ) values (
    auth.uid(),
    p_module_id,
    coalesce(p_completed, false),
    case when coalesce(p_completed, false) then now() else null end,
    now(),
    now(),
    now()
  )
  on conflict (user_id, module_id) do update
    set is_completed = excluded.is_completed,
        completed_at = case
          when excluded.is_completed then coalesce(lesson_progress.completed_at, now())
          else null
        end,
        last_watched_at = now(),
        updated_at = now();
end;
$$;

revoke all on function public.set_lesson_complete(uuid, boolean) from public;
revoke execute on function public.set_lesson_complete(uuid, boolean) from anon;
grant execute on function public.set_lesson_complete(uuid, boolean) to authenticated;
