-- =============================================================
-- OrlaDent Camp — Migration 015: PROFILE TAB, SCORE BREAKDOWN, LEADERBOARD
--
-- Run ONCE in the Supabase SQL editor. Additive and idempotent.
-- =============================================================

-- ---------- 1. LEADERBOARD OPT-OUT ----------
--
-- This column exists BEFORE the leaderboard does, on purpose.
--
-- A leaderboard publishes one student's name and performance to every other
-- student. Some will not want that, and adding an opt-out after people are
-- already listed is a far worse conversation than shipping with one. Default
-- is TRUE (visible) because an empty leaderboard teaches nobody anything, but
-- the switch is in the student's own hands from day one.

alter table public.profiles
  add column if not exists show_on_leaderboard boolean not null default true;

comment on column public.profiles.show_on_leaderboard is
  'Student-controlled. When false the student is excluded from the leaderboard entirely — not shown as "Anonymous", not counted in ranks.';

-- ---------- 2. SCORE BREAKDOWN ----------
--
-- jsonb, not four columns. The criteria and their weights are a teaching
-- decision that will change; four columns would mean a migration every time
-- Badr rethinks how a case is judged. The shape is documented in
-- lib/scoring.ts, which is the single place the criteria are defined.
--
-- `grade` stays the authoritative number. The breakdown is supporting detail:
-- a submission graded before this migration has a grade and no breakdown, and
-- must keep working.

alter table public.assignment_submissions
  add column if not exists score_breakdown jsonb;

comment on column public.assignment_submissions.score_breakdown is
  'Per-criterion sub-scores, e.g. {"margin":28,"occlusion":20,"anatomy":22,"efficiency":15}. Optional — `grade` remains the authoritative total. Criteria are defined in lib/scoring.ts.';

-- ---------- 3. LEADERBOARD VIEW ----------
--
-- WHY A VIEW AND NOT A TABLE
--
-- At a few hundred students a live aggregate is far cheaper than the bug
-- surface of a cached table that has to be kept in step with every grade
-- change. If this ever gets slow, materialise it then.
--
-- WHY security_invoker = false (the default for a view)
--
-- The view runs with the definer's rights, which is exactly what makes it
-- safe to expose: students cannot read each other's `profiles` or
-- `assignment_submissions` rows directly — RLS forbids it — but they CAN read
-- this view, which exposes only a name, a count and an average. No email, no
-- grades per submission, no file links. The view is the privacy boundary.

create or replace view public.leaderboard as
with graded as (
  select
    s.user_id,
    s.assignment_id,
    -- Best attempt per assignment, not every attempt. A student who resubmits
    -- and improves should not be penalised for having tried twice, and one who
    -- submits the same case five times should not get five entries in the mean.
    max(s.grade) as best_grade
  from public.assignment_submissions s
  where s.status = 'graded'
    and s.grade is not null
  group by s.user_id, s.assignment_id
),
lessons as (
  select user_id, count(*) filter (where is_completed) as lessons_completed
  from public.lesson_progress
  group by user_id
)
select
  p.id                                              as user_id,
  coalesce(nullif(trim(p.full_name), ''), 'Student') as display_name,
  coalesce(l.lessons_completed, 0)::int             as lessons_completed,
  count(g.assignment_id)::int                       as cases_graded,
  round(avg(g.best_grade), 1)                       as average_grade,
  /*
   * The ranking metric, and it is a composite on purpose.
   *
   * Ranking on average grade alone rewards the student who submitted one good
   * case and stopped. Ranking on volume alone rewards submitting anything at
   * all. Points = completed work + quality of that work, so moving up requires
   * both: 10 points a graded case, plus the average grade as a quality term.
   */
  (count(g.assignment_id) * 10 + coalesce(avg(g.best_grade), 0))::numeric(10,2) as points
from public.profiles p
left join graded  g on g.user_id = p.id
left join lessons l on l.user_id = p.id
where p.show_on_leaderboard is true
  and p.has_access is true
  -- Staff run the course; they are not competing in it.
  and coalesce(p.role, 'user') = 'user'
group by p.id, p.full_name, l.lessons_completed
-- A student with nothing graded and nothing watched has not started, and an
-- empty tail makes the board look abandoned.
having count(g.assignment_id) > 0 or coalesce(l.lessons_completed, 0) > 0;

comment on view public.leaderboard is
  'Public-safe ranking. Exposes display name, counts and an average only — never email, per-submission grades or file links. Excludes opted-out students, students without access, and staff.';

grant select on public.leaderboard to authenticated;

-- ---------- 4. OWN RANK ----------
--
-- Reading the whole board to find your own row does not scale and leaks more
-- than it needs to. This returns the caller's position and nothing about
-- anyone else.

create or replace function public.my_leaderboard_rank()
returns table (rank bigint, total bigint, points numeric)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select user_id, points, rank() over (order by points desc) as rank
    from public.leaderboard
  )
  select
    r.rank,
    (select count(*) from ranked)::bigint as total,
    r.points
  from ranked r
  where r.user_id = auth.uid();
$$;

grant execute on function public.my_leaderboard_rank() to authenticated;

-- ---------- 5. LETTING A STUDENT SET THEIR OWN VISIBILITY ----------
--
-- The existing "profiles own write" policy, if any, is not assumed here. This
-- function is narrow by design: it can change exactly one boolean on exactly
-- the caller's own row, and nothing else. That is safer than opening
-- profiles to self-update, which would also expose has_access and role.

create or replace function public.set_leaderboard_visibility(p_visible boolean)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.profiles
     set show_on_leaderboard = p_visible
   where id = auth.uid();
$$;

grant execute on function public.set_leaderboard_visibility(boolean) to authenticated;

-- ---------- 6. INDEXES ----------
-- The leaderboard aggregates every graded submission on each load.

create index if not exists assignment_submissions_graded_idx
  on public.assignment_submissions (user_id, assignment_id)
  where status = 'graded';

create index if not exists lesson_progress_completed_idx
  on public.lesson_progress (user_id)
  where is_completed;
