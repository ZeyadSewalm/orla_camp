-- =============================================================
-- OrlaDent Camp — Migration 020: ONE GRADING SYSTEM FOR BOTH SUBMISSION TYPES
--
-- Run ONCE, after 019. Idempotent.
-- =============================================================
--
-- WHAT THIS UNIFIES
--
-- Students hand in work two ways:
--   • STL tasks   (assignment_submissions) — per-lesson assignments via Drive
--   • Case review (case_file_submissions)  — the general "upload your case" button
--
-- STL tasks were already graded (grade + score_breakdown, migration 015). A
-- contributor built grading for case review separately, with its own columns
-- (grade_margin, grade_occlusion, …) and its own leaderboard on the community
-- page. Two systems meant two leaderboards disagreeing about the same student.
--
-- This migration gives case review THE SAME grading model as STL tasks —
-- one set of criteria (defined once, in lib/scoring.ts), one storage shape, one
-- leaderboard — and brings over the contributor's genuine improvements:
--   • a reviewer note per criterion         → criterion_notes
--   • reviewer photo attachments            → review_photos (added in 017)
--   • control over what counts on the board → publish_to_leaderboard
--
-- STORAGE SHAPE (same on both tables)
--   grade            numeric   the total
--   score_breakdown  jsonb     {"margin": 27, "occlusion": 22, …} — points out of
--                              each criterion's own max (30/25/25/20 = 100)
--   criterion_notes  jsonb     {"margin": "Open at the distal", …} — optional

-- ---------- 1. CASE REVIEW GETS GRADES ----------

alter table public.case_file_submissions
  add column if not exists grade numeric(6,2),
  add column if not exists score_breakdown jsonb,
  add column if not exists criterion_notes jsonb,
  add column if not exists graded_by uuid references public.profiles(id) on delete set null,
  add column if not exists graded_at timestamptz,
  add column if not exists publish_to_leaderboard boolean not null default true;

alter table public.case_file_submissions
  drop constraint if exists case_file_submissions_grade_range;
alter table public.case_file_submissions
  add constraint case_file_submissions_grade_range
    check (grade is null or (grade >= 0 and grade <= 100));

-- ---------- 2. STL TASKS GET THE TWO NEW CAPABILITIES ----------

alter table public.assignment_submissions
  add column if not exists criterion_notes jsonb,
  add column if not exists publish_to_leaderboard boolean not null default true;

/*
 * WHY publish_to_leaderboard DEFAULTS TO TRUE
 *
 * In the contributor's version it defaulted to FALSE: a case counted only if
 * the reviewer remembered to tick a box. Applied here that would have silently
 * removed every STL grade already on the leaderboard — the column is added to
 * existing rows with its default — and every future grade whenever the box was
 * forgotten. Students who did the work would simply vanish from the ranking.
 *
 * So the control is kept but inverted into an opt-OUT: everything graded counts
 * unless the reviewer unticks it (a practice case, a re-grade for coaching).
 */

-- ---------- 3. CLOSE THE SELF-GRADING HOLE ----------
--
-- Students insert their own case_file_submissions rows directly from the
-- browser (UploadCaseFile.tsx), and the only RLS check is that user_id is
-- theirs. That was harmless while the table had no grades. With a grade
-- column, a student could call the API directly and insert a row that is
-- already status='reviewed', grade=100 — and walk onto the leaderboard.
--
-- A trigger rather than column grants: the upload client sends status
-- 'pending' explicitly, so revoking the column would break legitimate uploads.
-- This overwrites every review field on any insert that is not from staff.
-- Only INSERT is guarded — students have no UPDATE policy on this table.

create or replace function public.case_file_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * auth.uid() IS NULL means the insert bypassed RLS — the service role, used
   * by server code and the SQL editor. It cannot be a student: the only insert
   * policy students have requires user_id = auth.uid(), which a NULL uid never
   * satisfies, so a student's insert with no uid is refused before reaching
   * here. Exempting it keeps server-side tooling (imports, backfills) from
   * having its grades silently blanked.
   */
  if auth.uid() is not null and not (public.is_admin() or public.is_reviewer()) then
    new.status                 := 'pending';
    new.grade                  := null;
    new.score_breakdown        := null;
    new.criterion_notes        := null;
    new.graded_by              := null;
    new.graded_at              := null;
    new.reviewed_at            := null;
    new.reviewed_by            := null;
    new.reviewer_notes         := null;
    new.review_photos          := '[]'::jsonb;
    new.publish_to_leaderboard := true;
  end if;
  return new;
end;
$$;

drop trigger if exists case_file_insert_guard on public.case_file_submissions;
create trigger case_file_insert_guard
  before insert on public.case_file_submissions
  for each row execute function public.case_file_insert_guard();

-- ---------- 4. ONE LEADERBOARD, READING BOTH ----------
--
-- Replaces the view from migration 015. Same columns, same names, same types —
-- so `create or replace` works and my_leaderboard_rank() keeps working.
--
-- NORMALISED TO PERCENT. An STL task is graded out of its assignment's
-- max_score, which is not always 100; a case is graded out of 100. Averaging
-- the raw numbers together would compare a 45/50 with a 45/100 as equal. Every
-- score is converted to a percentage before it is averaged.
--
-- BEST ATTEMPT PER PIECE OF WORK, on both sides: per assignment for STL tasks,
-- per lesson for case files. Resubmitting can only raise a score, and handing
-- in the same lesson five times does not count as five cases.

create or replace view public.leaderboard as
with task_best as (
  select
    s.user_id,
    'task:' || s.assignment_id::text as item,
    max(s.grade / nullif(a.max_score, 0) * 100) as pct
  from public.assignment_submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.status = 'graded'
    and s.grade is not null
    and s.publish_to_leaderboard is true
  group by s.user_id, s.assignment_id
),
case_best as (
  select
    c.user_id,
    -- A case with no lesson attached is its own piece of work.
    'case:' || coalesce(c.module_id::text, c.id::text) as item,
    max(c.grade) as pct
  from public.case_file_submissions c
  where c.status = 'reviewed'
    and c.grade is not null
    and c.publish_to_leaderboard is true
  group by c.user_id, coalesce(c.module_id::text, c.id::text)
),
graded as (
  select user_id, item, pct from task_best
  union all
  select user_id, item, pct from case_best
),
lessons as (
  select user_id, count(*) filter (where is_completed) as lessons_completed
  from public.lesson_progress
  group by user_id
)
select
  p.id                                               as user_id,
  coalesce(nullif(trim(p.full_name), ''), 'Student') as display_name,
  coalesce(l.lessons_completed, 0)::int              as lessons_completed,
  count(g.item)::int                                 as cases_graded,
  round(avg(g.pct), 1)                               as average_grade,
  (count(g.item) * 10 + coalesce(avg(g.pct), 0))::numeric(10,2) as points
from public.profiles p
left join graded  g on g.user_id = p.id
left join lessons l on l.user_id = p.id
where p.show_on_leaderboard is true
  and p.has_access is true
  and coalesce(p.role, 'user') = 'user'
group by p.id, p.full_name, l.lessons_completed
having count(g.item) > 0 or coalesce(l.lessons_completed, 0) > 0;

comment on view public.leaderboard is
  'Single public-safe ranking across STL tasks and case review. Scores normalised to percent, best attempt per piece of work. Exposes name, counts and an average only.';

create index if not exists case_file_submissions_graded_idx
  on public.case_file_submissions (user_id)
  where status = 'reviewed' and grade is not null;
