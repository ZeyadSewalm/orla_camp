import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import CoursePlayer, { type CourseLessonVM } from '@/components/CoursePlayer';
import { videoSrcFor, posterFor } from '@/lib/video-src';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules } from '@/lib/data';
import type { Assignment, AssignmentSubmission, CourseModule, LessonProgress } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * videoSrcFor and posterFor now come from lib/video-src.ts.
 *
 * A second copy of this logic used to live here, and lib/video-src.ts warned in
 * its own header that the two would drift and that the drifting copy would be
 * the one that stopped signing Bunny URLs. That is what happened: the fix for
 * Bunny links pasted into the Drive field went into the shared helper, and this
 * page — the one that actually plays the lessons — would not have received it.
 */

export default async function Course({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('course');

  // Cookie read (no network) + a briefly cached profile. Access is still
  // enforced by middleware and RLS; these reads are for page data/display.
  const user = await getSessionUser();
  if (!user) redirect(lh(locale, '/login?next=/course'));

  const [profile, modules] = await Promise.all([
    getCachedProfile(user.id),
    getModules()
  ]);

  if (!profile) redirect(lh(locale, '/login?next=/course'));
  if (!profile.has_access && profile.role !== 'admin' && profile.role !== 'reviewer') {
    redirect(lh(locale, '/pricing'));
  }

  const supabase = createClient();
  const [
    { data: progressRows, error: progressError },
    { data: assignmentRows, error: assignmentsError },
    { data: taskSubmissionRows, error: taskSubmissionsError },
    { data: overrideRows, error: overrideError }
  ] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('user_id,module_id,is_completed,watch_seconds,started_at,last_watched_at,completed_at,updated_at')
      .eq('user_id', user.id)
      .order('last_watched_at', { ascending: false }),
    supabase
      .from('assignments')
      .select('id,lesson_id,title_ar,title_en,description_ar,description_en,max_score,allowed_file_types,max_file_size_mb,due_date,active,allow_resubmission,drive_folder_id,created_at,updated_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('assignment_submissions')
      .select('id,assignment_id,user_id,drive_file_id,drive_web_view_link,original_filename,stored_filename,file_size,attempt_number,status,grade,admin_feedback,submitted_at,upload_started_at,graded_at,graded_by,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    /*
     * This student's lesson exceptions. RLS restricts the table to the caller's
     * own rows, so this cannot read anyone else's even if the filter were wrong.
     */
    supabase
      .from('module_access_overrides')
      .select('module_id,mode')
      .eq('user_id', user.id)
  ]);

  if (progressError && process.env.NODE_ENV === 'development') {
    console.warn('[course] lesson_progress unavailable:', progressError.message);
  }
  if ((assignmentsError || taskSubmissionsError) && process.env.NODE_ENV === 'development') {
    console.warn('[course] STL tasks unavailable:', assignmentsError?.message || taskSubmissionsError?.message);
  }

  const progress = (progressRows ?? []) as LessonProgress[];
  const assignments = (assignmentRows ?? []) as Assignment[];
  const taskSubmissions = (taskSubmissionRows ?? []) as AssignmentSubmission[];
  const progressByModule = new Map(progress.map((row) => [row.module_id, row]));
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const assignmentsByLesson = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    if (!assignment.active) continue;
    const list = assignmentsByLesson.get(assignment.lesson_id) ?? [];
    list.push(assignment);
    assignmentsByLesson.set(assignment.lesson_id, list);
  }
  /*
   * SEQUENTIAL UNLOCKING — computed on the server, enforced on the server.
   *
   * A lesson opens only when the one before it is finished: marked complete,
   * AND every active task on it submitted. Staff bypass it entirely, or they
   * could never review a later lesson.
   *
   * This is worked out here rather than in the browser because the gate has to
   * be real. If the page shipped every video URL and merely hid the locked
   * ones behind CSS, one look at the page source would hand a student the
   * whole course on day one — which is exactly the leak we just closed on the
   * free lesson. A locked module is sent with NO src at all.
   */
  const latestTaskSubmissionByAssignment = new Map<string, AssignmentSubmission>();
  for (const submission of taskSubmissions) {
    if (!latestTaskSubmissionByAssignment.has(submission.assignment_id)) {
      latestTaskSubmissionByAssignment.set(submission.assignment_id, submission);
    }
  }

  const ar = locale === 'ar';
  const isStaff = profile.role === 'admin' || profile.role === 'reviewer';

  /*
   * PACKAGE (TIER) GATING.
   *
   * A module with no tier_ids is open to every package, same as before this
   * existed. One that lists specific tiers only opens for a student whose own
   * tier_id is in that list — staff bypass it, same as they bypass sequential
   * unlocking, since a reviewer has to be able to open anything to review it.
   */
  /*
   * The watermark label. Built from the profile already in hand rather than
   * calling my_watermark_label(), which exists for other surfaces — one less
   * round trip on the hottest page in the app.
   *
   * Only the local part of the email is used. It identifies the account
   * unambiguously for us without publishing a full address into every frame
   * of a video the student may well be screen-sharing legitimately.
   *
   * Staff get no watermark: they are not the leak risk this addresses, and a
   * reviewer's name over a student's case video would be actively confusing.
   */
  const watermark = isStaff
    ? ''
    : [profile.full_name?.trim(), (profile.email ?? '').split('@')[0]].filter(Boolean).join(' \u00b7 ');

  const studentTierId = profile.tier_id;
  function tierAllowed(m: CourseModule) {
    return isStaff || !m.tier_ids || m.tier_ids.length === 0 || (!!studentTierId && m.tier_ids.includes(studentTierId));
  }

  /*
   * PER-STUDENT OVERRIDES, applied ON TOP of the tier rule.
   *
   *   grant → open a lesson this student's tier excludes
   *   deny  → close a lesson this student's tier includes
   *
   * Order matters: deny is evaluated last and wins over everything, including a
   * grant on the same lesson. A deny is how access gets paused — for an unpaid
   * instalment, say — and a pause that something else can quietly outrank is
   * not a pause.
   *
   * Staff are exempt from both. A reviewer has to be able to open any lesson to
   * review work submitted against it.
   */
  /*
   * IF THIS QUERY FAILED, TREAT EVERY OVERRIDE AS A DENY.
   *
   * An empty map on error would silently lift suspensions: a student paused for
   * an unpaid instalment would get their lessons back the moment the table was
   * briefly unreachable, and nothing anywhere would say so. Losing a `grant` is
   * a student seeing one lesson fewer for a few seconds; losing a `deny` is paid
   * content opening to someone who was deliberately cut off.
   *
   * So on error we fall back to the tier rule alone AND drop any grants — the
   * conservative reading in both directions — and make the failure loud rather
   * than letting it pass as normal operation.
   */
  if (overrideError) {
    console.error('[course] module_access_overrides unavailable:', overrideError.message);
  }
  const overrideByModule = new Map(
    (overrideError ? [] : overrideRows ?? []).map((row: any) => [
      row.module_id as string,
      row.mode as 'grant' | 'deny'
    ])
  );
  function allowed(m: CourseModule) {
    if (isStaff) return true;
    const override = overrideByModule.get(m.id);
    if (override === 'deny') return false;
    if (override === 'grant') return true;
    return tierAllowed(m);
  }

  const visibleModules = modules.filter((m) => allowed(m));
  /*
   * NO SEQUENTIAL LOCKING.
   *
   * Lessons used to unlock one at a time: a lesson opened only once the one
   * before it was finished and its task submitted. That is gone — every lesson
   * the student's tier includes is open from day one, in any order.
   *
   * WHAT THIS DOES NOT CHANGE
   *
   * `visibleModules` is still the tier filter, and it still decides what goes
   * in this set. Sequencing was a teaching preference; the tier is the thing
   * the student paid for, and it stays enforced here AND in RLS. Removing the
   * order lock must not become a way to reach content from a higher tier.
   *
   * The old rule was also weaker than it looked: `record_lesson_watch` is
   * callable on any module id, so a determined student could create a progress
   * row and open a lesson early. Ordering was never a real boundary — the tier
   * always was.
   */
  const unlockedModuleIds = new Set(visibleModules.map((m) => m.id));

  /*
   * The identity fields and the activity feed that used to be built here
   * moved to lib/student-overview.ts with the dashboard. Leaving them
   * behind meant this page still assembled a feed nobody rendered, on
   * every lesson view.
   */

  /*
   * The lesson list handed to the client player. Locked lessons still carry
   * their title/description/duration (so the sidebar can show what's coming
   * next) but src/poster are null and assignments are withheld — exactly the
   * same "no src at all for a locked lesson" rule the old server-rendered
   * list enforced, just computed once here instead of per-<article>.
   */
  const lessons: CourseLessonVM[] = modules.map((m: CourseModule, i: number) => {
    const unlocked = unlockedModuleIds.has(m.id);
    const progressRow = progressByModule.get(m.id);
    return {
      id: m.id,
      index: i + 1,
      title: ar ? m.title_ar : m.title_en,
      description: ar ? m.description_ar : m.description_en,
      block: m.block,
      durationMinutes: m.duration_minutes,
      unlocked,
      tierBlocked: !tierAllowed(m),
      isFreePreview: m.is_free_preview,
      src: unlocked ? videoSrcFor(m) : null,
      poster: unlocked ? posterFor(m) : null,
      completed: progressRow?.is_completed ?? false,
      watchSeconds: progressRow?.watch_seconds ?? 0,
      checklistUrl: unlocked ? m.checklist_file_url : null,
      assignments: unlocked ? assignmentsByLesson.get(m.id) ?? [] : [],
      submissionsByAssignment: unlocked
        ? Object.fromEntries(
            (assignmentsByLesson.get(m.id) ?? []).map((a) => [a.id, latestTaskSubmissionByAssignment.get(a.id) ?? null])
          )
        : {}
    };
  });

  const mostRecentProgress = [...progress].sort(
    (a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
  )[0];
  const initialActiveId =
    (mostRecentProgress && unlockedModuleIds.has(mostRecentProgress.module_id) && mostRecentProgress.module_id) ||
    lessons.find((l) => l.unlocked && !l.completed)?.id ||
    lessons[0]?.id ||
    '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10 md:py-14">
      {/*
       * THE DASHBOARD MOVED TO /profile.
       *
       * The welcome banner, stats, recent activity and STL task grid used to
       * sit above this section. All of it is personal rather than
       * instructional — it answered "how am I doing?", not "what am I
       * learning?" — and it pushed the player itself below the fold on every
       * single visit to the page a student opens to watch a lesson.
       *
       * This page is now the lessons and nothing else.
       */}
      <section aria-labelledby="course-content-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label">{t('learningArea')}</p>
            <h2 id="course-content-title" className="font-display text-xl font-black sm:text-2xl">{t('title')}</h2>
          </div>
          <Link href={lh(locale, '/course/my-submissions')} className="btn-quiet py-2.5 text-xs sm:text-sm">
            {t('mySubmissions')}
          </Link>
        </div>

        {modules.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6 text-sm text-steel">
            {t('empty')}
          </div>
        ) : (
          <div className="mt-8">
            <CoursePlayer
              locale={locale}
              userId={profile.id}
              lessons={lessons}
              watermark={watermark}
              initialActiveId={initialActiveId}
            />
          </div>
        )}
      </section>
    </div>
  );
}
