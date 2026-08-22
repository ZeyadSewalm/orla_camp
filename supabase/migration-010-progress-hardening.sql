-- =============================================================
-- OrlaDent Camp — Migration 010: progress integrity hardening
--
-- Run after migration-009. Safe to re-run.
-- This also upgrades databases that already ran an older migration-009.
-- =============================================================

-- Students can read their own progress, but cannot directly overwrite it.
-- All writes must pass through the RPC functions below.
revoke insert, update on public.lesson_progress from authenticated;
grant select on public.lesson_progress to authenticated;

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

-- Functions are callable only by signed-in users. The functions themselves
-- then verify that the user has course access (or is staff).
revoke all on function public.record_lesson_watch(uuid, integer) from public;
revoke execute on function public.record_lesson_watch(uuid, integer) from anon;
grant execute on function public.record_lesson_watch(uuid, integer) to authenticated;

revoke all on function public.set_lesson_complete(uuid, boolean) from public;
revoke execute on function public.set_lesson_complete(uuid, boolean) from anon;
grant execute on function public.set_lesson_complete(uuid, boolean) to authenticated;
