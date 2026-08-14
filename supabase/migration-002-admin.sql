-- =============================================================
-- OrlaDent Camp — Migration 002: admin capabilities
--
-- Run this ONCE in the Supabase SQL editor, after schema.sql.
-- It is additive only: nothing is dropped, no existing data is touched.
-- Safe to re-run (every statement is guarded).
-- =============================================================

-- ---------- 1. MODULES: media, grouping, honest status ----------
alter table course_modules add column if not exists thumbnail_url text;
alter table course_modules add column if not exists block text default 'foundations';
alter table course_modules add column if not exists status text default 'coming';
alter table course_modules add column if not exists duration_minutes int;
alter table course_modules add column if not exists is_free_preview boolean default false;

comment on column course_modules.block is 'foundations | restorative | advanced — the sales-sheet learning blocks';
comment on column course_modules.status is 'available | coming — must stay honest, matches the sales sheet labels';
comment on column course_modules.is_free_preview is 'when true the module is viewable without a paid plan (the free Single Crown lesson)';

-- video_link is currently required. Make it optional so a module can be
-- created and filled in later instead of blocking on the Drive upload.
alter table course_modules alter column video_link drop not null;

-- ---------- 2. SITE CONTENT: every landing string editable ----------
alter table site_settings add column if not exists hero_kicker_ar text;
alter table site_settings add column if not exists hero_kicker_en text;
alter table site_settings add column if not exists hero_headline_ar text;
alter table site_settings add column if not exists hero_headline_en text;
alter table site_settings add column if not exists hero_subhead_ar text;
alter table site_settings add column if not exists hero_subhead_en text;
alter table site_settings add column if not exists cta_primary_ar text;
alter table site_settings add column if not exists cta_primary_en text;
alter table site_settings add column if not exists whatsapp_number text;
alter table site_settings add column if not exists instagram_url text;
alter table site_settings add column if not exists youtube_url text;

-- ---------- 3. STUDENT NOTES ----------
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists admin_notes text;

-- ---------- 4. TEAM ROLES ----------
-- Three roles now:
--   user     — a student
--   reviewer — a designer from your team: reads and reviews case files ONLY.
--              Cannot see payments, cannot change prices, cannot grant access.
--   admin    — you: everything.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table profiles add constraint profiles_role_check
      check (role in ('user', 'reviewer', 'admin'));
  end if;
end $$;

create or replace function public.is_reviewer()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('reviewer', 'admin')
  );
$$;

-- Reviewers can see and review case files, and nothing else.
drop policy if exists "cases reviewer read" on case_file_submissions;
create policy "cases reviewer read" on case_file_submissions
  for select using (is_reviewer());

drop policy if exists "cases reviewer update" on case_file_submissions;
create policy "cases reviewer update" on case_file_submissions
  for update using (is_reviewer()) with check (is_reviewer());

-- Reviewers need to open the uploaded file itself.
drop policy if exists "case files reviewer read" on storage.objects;
create policy "case files reviewer read" on storage.objects
  for select using (bucket_id = 'case-files' and is_reviewer());

-- Reviewers may read student names to know whose file they're reviewing.
drop policy if exists "profiles reviewer read" on profiles;
create policy "profiles reviewer read" on profiles
  for select using (is_reviewer());

-- ---------- 5. MEDIA BUCKET ----------
-- Module thumbnails and any other public marketing image.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media admin write" on storage.objects;
create policy "media admin write" on storage.objects
  for all using (bucket_id = 'media' and is_admin());

-- ---------- 6. BACKFILL the sales-sheet curriculum status ----------
-- Nothing is invented here: these are the exact labels from the sales sheet.
-- Only touches rows that already exist and are still on the default.

-- =============================================================
-- To make a team member a reviewer:
--   update profiles set role = 'reviewer' where email = 'designer@example.com';
-- =============================================================
