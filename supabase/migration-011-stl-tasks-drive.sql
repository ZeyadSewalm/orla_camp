-- =============================================================
-- OrlaDent Camp — Migration 011: Assignment + Google Drive STL tasks
-- Run ONCE after migration-010. Additive and safe to re-run.
-- Google Drive stores the binary; Supabase stores ownership/workflow/grades.
-- =============================================================

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.course_modules(id) on delete restrict not null,
  title_ar text not null,
  title_en text not null,
  description_ar text,
  description_en text,
  max_score numeric(8,2) not null default 100 check (max_score > 0),
  allowed_file_types text[] not null default array['.stl']::text[],
  max_file_size_mb integer check (max_file_size_mb is null or max_file_size_mb > 0),
  due_date timestamptz,
  active boolean not null default true,
  allow_resubmission boolean not null default true,
  drive_folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignments_lesson_active_idx
  on public.assignments (lesson_id, active);

-- Preserve submission metadata if this migration is re-run after an earlier
-- draft that used cascading deletes. Lessons/tasks with real submissions must
-- be explicitly disabled, not silently erase the Supabase audit trail.
alter table public.assignments drop constraint if exists assignments_lesson_id_fkey;
alter table public.assignments
  add constraint assignments_lesson_id_fkey
  foreign key (lesson_id) references public.course_modules(id) on delete restrict;

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.assignments(id) on delete restrict not null,
  user_id uuid references public.profiles(id) on delete restrict not null,
  drive_file_id text unique,
  drive_web_view_link text,
  original_filename text not null,
  stored_filename text not null,
  file_size bigint not null check (file_size >= 0),
  attempt_number integer not null default 1 check (attempt_number > 0),
  status text not null default 'uploading'
    check (status in ('uploading','submitted','under_review','graded','needs_revision','resubmitted','failed')),
  grade numeric(8,2),
  admin_feedback text,
  submitted_at timestamptz,
  upload_started_at timestamptz not null default now(),
  graded_at timestamptz,
  graded_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.assignment_submissions drop constraint if exists assignment_submissions_assignment_id_fkey;
alter table public.assignment_submissions
  add constraint assignment_submissions_assignment_id_fkey
  foreign key (assignment_id) references public.assignments(id) on delete restrict;

alter table public.assignment_submissions drop constraint if exists assignment_submissions_user_id_fkey;
alter table public.assignment_submissions
  add constraint assignment_submissions_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

create index if not exists assignment_submissions_user_recent_idx
  on public.assignment_submissions (user_id, updated_at desc);
create index if not exists assignment_submissions_queue_idx
  on public.assignment_submissions (status, submitted_at desc);
create index if not exists assignment_submissions_assignment_user_idx
  on public.assignment_submissions (assignment_id, user_id, attempt_number desc);

-- Prevent two concurrent upload-session requests from creating the same attempt.
create unique index if not exists assignment_submissions_attempt_unique_idx
  on public.assignment_submissions (assignment_id, user_id, attempt_number);

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

-- A signed-in student with course access may read active task definitions.
-- Staff can read all tasks. Writes are server-only through service_role.
drop policy if exists "assignments course read" on public.assignments;
create policy "assignments course read" on public.assignments
  for select using (
    public.is_reviewer()
    or (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and coalesce(p.has_access, false) = true
      )
      and (
        active = true
        or exists (
          select 1 from public.assignment_submissions s
          where s.assignment_id = assignments.id and s.user_id = auth.uid()
        )
      )
    )
  );

-- Students only see their own submissions. Reviewers/admins see the queue.
drop policy if exists "assignment submissions own read" on public.assignment_submissions;
create policy "assignment submissions own read" on public.assignment_submissions
  for select using (user_id = auth.uid() or public.is_reviewer());

-- Do not allow browser clients to forge ownership, grades, Drive ids or status.
revoke insert, update, delete on public.assignments from anon, authenticated;
revoke insert, update, delete on public.assignment_submissions from anon, authenticated;
grant select on public.assignments to authenticated;
grant select on public.assignment_submissions to authenticated;

comment on table public.assignments is 'Lesson tasks. File binaries live in Google Drive; this table defines what a student must submit.';
comment on table public.assignment_submissions is 'STL task metadata + evaluation. user_id is assigned by the authenticated server API, never trusted from the browser.';
comment on column public.assignment_submissions.drive_file_id is 'Canonical link between Supabase metadata and the private Google Drive file.';
