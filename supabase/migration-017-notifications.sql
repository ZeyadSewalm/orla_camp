-- =============================================================
-- OrlaDent Camp — Migration 017: ADMIN / REVIEWER NOTIFICATIONS
--
-- Run ONCE in the Supabase SQL editor. Additive and idempotent.
-- =============================================================
--
-- PROVENANCE
--
-- Adapted from a contributor's branch, where it was numbered 013. That number
-- was already taken here by the seat-cap removal, so it moves to 017. Two
-- different migrations sharing a number is how a team loses track of what has
-- actually been applied to production.
--
-- WHAT IT DOES
--
-- A student uploads a case file for review and nobody finds out until someone
-- happens to open the admin panel. This puts a row in front of the reviewers
-- the moment it lands.
--
-- WHY A DATABASE TRIGGER AND NOT APPLICATION CODE
--
-- Case files arrive through more than one path, and a trigger fires for all of
-- them — including an insert made directly in the Supabase dashboard. A
-- notification written from one route handler would silently miss the others.

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type         text not null default 'case_submitted',
  title        text not null,
  body         text not null,
  href         text not null,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Partial index: the only query that runs often is "my unread, newest first".
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

comment on table public.notifications is
  'In-app notifications for admins and reviewers, written by database triggers rather than application code so every insert path is covered.';

create or replace function public.notify_case_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, href, entity_id)
  select
    p.id,
    'case_submitted',
    'New case submitted',
    coalesce(new.file_name, 'A student case is ready for review.'),
    '/admin?tab=qc&case=' || new.id::text,
    new.id
  from public.profiles p
  where p.role in ('admin', 'reviewer')
    -- A reviewer who uploads a case for themselves should not be told about it.
    and p.id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists case_submission_notification on public.case_file_submissions;
create trigger case_submission_notification
  after insert on public.case_file_submissions
  for each row execute function public.notify_case_submission();

-- ---------- RLS ----------
--
-- Read and update are both scoped to the recipient. Note there is deliberately
-- NO insert policy: rows arrive only from the SECURITY DEFINER trigger above,
-- so no client — not even an admin's session — can fabricate a notification.

alter table public.notifications enable row level security;

drop policy if exists "notifications recipient read" on public.notifications;
create policy "notifications recipient read" on public.notifications
  for select using (recipient_id = auth.uid());

drop policy if exists "notifications recipient update" on public.notifications;
create policy "notifications recipient update" on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ---------- REVIEWER PHOTO ATTACHMENTS ----------
-- Paths into the private `case-files` bucket, signed on demand at read time.

alter table public.case_file_submissions
  add column if not exists review_photos jsonb not null default '[]'::jsonb;

comment on column public.case_file_submissions.review_photos is
  'Private case-files bucket paths for images attached by reviewers. Never public URLs — they are signed at read time with a short expiry.';
