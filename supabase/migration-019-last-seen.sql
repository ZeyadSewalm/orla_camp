-- =============================================================
-- OrlaDent Camp — Migration 019: RECORD WHEN A STUDENT WAS LAST SEEN
--
-- Run ONCE, after 018. Idempotent.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- The n8n "Inactivity Reminder" workflow finds students whose
-- `profiles.last_login_at` is more than 3 days old. Migration 018 created that
-- column, but NOTHING EVER WROTE TO IT, so the workflow could never find anyone.
--
-- The contributor's branch did try: AuthForm updated the column straight from
-- the browser after sign-in. That write was always refused. Migration 007
-- deliberately limits what a student may update on their own profile row to
-- `full_name` and `region` — so has_access and role cannot be self-granted —
-- and the refusal went unnoticed because the error was never checked.
--
-- WHY "LAST SEEN" RATHER THAN "LAST LOGIN"
--
-- Supabase sessions refresh silently for weeks. A student who opens the course
-- every single day may not have typed a password in a month. Stamping only on
-- sign-in would send "you haven't been here in 3 days" to exactly the students
-- who are here every day. So the column is stamped whenever a signed-in student
-- loads a protected page, which is what "inactive" actually means.
--
-- The column keeps its name, `last_login_at`, because the n8n query already
-- reads it by that name.

-- ---------- 1. THE STAMP ----------
--
-- SECURITY DEFINER, narrow on purpose: it touches one column on the caller's
-- own row and nothing else. Granting students UPDATE on last_login_at directly
-- would have worked too, but a function cannot be widened by accident the way a
-- column grant can.
--
-- The WHERE clause throttles it to one real write per hour per student. The
-- middleware already skips the call when the stamp is fresh, so this is a
-- second guard rather than the only one.

create or replace function public.touch_last_seen()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profiles
     set last_login_at = now()
   where id = auth.uid()
     and (last_login_at is null or last_login_at < now() - interval '1 hour');
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- ---------- 2. BACKFILL ----------
--
-- Without this, the reminder would never reach the students it exists for.
-- Stamping happens on page load, and a student who has already stopped coming
-- will never load a page — so their last_login_at would stay NULL forever, and
-- the n8n query skips NULLs. The quiet students are precisely the ones missed.
--
-- The best evidence available of when each student was last actually here is
-- the later of their last Supabase sign-in and the last lesson they watched.
--
-- ⚠ CONSEQUENCE: once this runs, students who have been away more than 3 days
-- become eligible immediately. The first run of the n8n workflow after this
-- will message all of them at once. Preview the count first — see the query at
-- the bottom of this file.

update public.profiles p
   set last_login_at = seen.at
  from (
    select
      u.id,
      greatest(
        u.last_sign_in_at,
        (select max(lp.last_watched_at) from public.lesson_progress lp where lp.user_id = u.id)
      ) as at
    from auth.users u
  ) as seen
 where p.id = seen.id
   and p.last_login_at is null
   and seen.at is not null;

-- ---------- 3. PREVIEW (read-only — run this on its own) ----------
--
-- How many people the n8n workflow would message on its next run, using the
-- corrected filters (paying students only, no staff, valid Egyptian mobile).
-- Run this BEFORE publishing the workflow.
--
-- select count(*) as would_be_messaged
--   from public.profiles
--  where phone is not null
--    and has_access is true
--    and coalesce(role, 'user') = 'user'
--    and last_login_at is not null
--    and last_login_at < now() - interval '3 days'
--    and (last_inactivity_message_at is null
--         or last_inactivity_message_at < now() - interval '7 days');
