-- =============================================================
-- OrlaDent Camp — Migration 018: WHATSAPP AUTOMATION TRACKING
--
-- Run ONCE, after 017. Additive and idempotent.
-- =============================================================
--
-- PROVENANCE
--
-- Adapted from a contributor's branch where it was numbered 014 — a number
-- already used here by the instalment removal. Renumbered to 018.
--
-- WHAT IT DOES
--
-- Two outbound messages: a nudge to a student who has not logged in for three
-- days, and a note when a case has been graded. This migration stores only the
-- bookkeeping; the sending lives in /api/cron/whatsapp and the message itself
-- is delivered by n8n.
--
-- THE LOG IS THE POINT
--
-- Messaging costs money and annoys people when duplicated. Every send is
-- recorded, and the unique index below makes a duplicate grade notification
-- impossible at the database level rather than relying on the cron's own
-- bookkeeping being correct.

alter table public.profiles
  add column if not exists last_login_at timestamptz,
  add column if not exists last_inactivity_message_at timestamptz;

comment on column public.profiles.last_login_at is
  'Most recent successful login. Read by the inactivity reminder; written on sign-in.';
comment on column public.profiles.last_inactivity_message_at is
  'When the 3-day inactivity reminder last went to this student. Enforces the 7-day cooldown between nudges.';

create table if not exists public.whatsapp_message_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  message_type        text not null check (message_type in ('inactive_3d', 'case_graded')),
  entity_id           uuid,
  sent_at             timestamptz not null default now(),
  status              text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider            text not null default 'n8n',
  provider_message_id text,
  payload             jsonb
);

create index if not exists whatsapp_message_log_user_type_idx
  on public.whatsapp_message_log (user_id, message_type, sent_at desc);

/*
 * ONE GRADE NOTIFICATION PER CASE, ENFORCED BY THE DATABASE.
 *
 * The cron also checks the log before queueing, but two overlapping runs — a
 * manual trigger while the schedule fires, say — would both pass that check and
 * both insert. This index makes the second insert fail instead, which is the
 * difference between a bug and a student receiving the same message twice.
 */
create unique index if not exists whatsapp_message_log_case_grade_unique_idx
  on public.whatsapp_message_log (user_id, message_type, entity_id)
  where message_type = 'case_graded' and entity_id is not null;

comment on table public.whatsapp_message_log is
  'Audit trail for outbound WhatsApp. Phone numbers are stored in E.164 without a plus, normalised for Egypt (+20) by /api/cron/whatsapp.';

-- ---------- RLS ----------
--
-- The contributor's version left this table without RLS. It holds phone numbers
-- and message bodies for every student, so it is closed to clients entirely:
-- only the service role (the cron) touches it, and the service role bypasses
-- RLS anyway. No policy means no client access, which is the intent.

alter table public.whatsapp_message_log enable row level security;
