import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getProfile } from '@/lib/supabase/server';
import { lh } from '@/lib/href';
import { CRITERIA, parseBreakdown, parseNotes, toPercent } from '@/lib/scoring';
import { signedReviewPhotos } from '@/lib/case-files';
import LeaderboardVisibility from '@/components/LeaderboardVisibility';
import StudentDashboard from '@/components/StudentDashboard';
import { getStudentOverview } from '@/lib/student-overview';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The student's own profile: progress, graded case files, and where they stand.
 *
 * WHY THIS IS ONE PAGE AND NOT A NEW SYSTEM
 *
 * Everything here is already recorded — lesson_progress has been tracking
 * watches since migration 009, assignment_submissions has carried grades and
 * feedback since 011. What was missing was a place a student could see it all
 * at once. So this page computes and presents; it stores nothing new.
 *
 * The one genuinely new column is `profiles.show_on_leaderboard`, and that
 * exists so a student can decline to be ranked.
 */
export default async function Profile({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const ar = locale === 'ar';
  const t = await getTranslations('profile');

  const me = await getProfile();
  if (!me) redirect(lh(locale, '/login'));
  if (!me.has_access) redirect(lh(locale, '/pricing'));

  /*
   * The dashboard moved here from /course.
   *
   * It was always personal data — your name, your streak, your recent activity,
   * your STL tasks — sitting on top of a page whose job is playing lessons. On
   * /course it pushed the player below the fold and repeated on every visit;
   * here it is what the page is for.
   */
  const overview = await getStudentOverview(locale);

  const supabase = createClient();

  /*
   * The module list is filtered by the SAME rule the course page uses: a
   * student's denominator must be the curriculum THEY can reach. Counting
   * modules locked behind a higher tier would show someone on Foundation a
   * percentage they can never move past — a progress bar that punishes them
   * for the tier they bought.
   */
  /*
   * getStudentOverview() above already fetched modules and lesson_progress for
   * the dashboard. Fetching them a second time here — which is what happened
   * while this page had its own progress bar — meant two extra round trips on
   * every profile view to render numbers that were already on screen.
   */
  const [{ data: submissionRows }, { data: assignmentRows }, { data: caseRows }, { data: rankRows }] =
    await Promise.all([
      supabase
        .from('assignment_submissions')
        .select('id,assignment_id,attempt_number,status,grade,score_breakdown,criterion_notes,publish_to_leaderboard,admin_feedback,submitted_at,graded_at,original_filename')
        .eq('user_id', me.id)
        .not('status', 'in', '(uploading,failed)')
        .order('updated_at', { ascending: false }),
      supabase.from('assignments').select('id,lesson_id,title_ar,title_en,max_score'),
      /*
       * Case review now carries grades too (migration 020), and a student's
       * record has to show both kinds of work, or a case they were graded on
       * would count toward their rank and appear nowhere on their own profile.
       */
      supabase
        .from('case_file_submissions')
        .select('id,module_id,file_name,status,grade,score_breakdown,criterion_notes,publish_to_leaderboard,reviewer_notes,review_photos,submitted_at,reviewed_at,graded_at,course_modules(title_ar,title_en)')
        .eq('user_id', me.id)
        .order('submitted_at', { ascending: false }),
      supabase.rpc('my_leaderboard_rank')
    ]);

  const assignments = (assignmentRows ?? []) as any[];
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const submissions = (submissionRows ?? []) as any[];
  const cases = (caseRows ?? []) as any[];

  /*
   * ONE SHAPE FOR BOTH KINDS OF GRADED WORK, so the list below renders them
   * identically. The student does not care which button they uploaded through;
   * they care how the work was judged.
   */
  type GradedItem = {
    key: string;
    workKey: string;          // what "best attempt" is grouped by
    title: string;
    attempt: number;
    grade: number;
    max: number;
    breakdown: ReturnType<typeof parseBreakdown>;
    notes: ReturnType<typeof parseNotes>;
    feedback: string | null;
    photoPaths: string[];
    counts: boolean;
    gradedAt: string;
  };

  const graded: GradedItem[] = [
    ...submissions
      .filter((s) => s.status === 'graded' && s.grade !== null)
      .map((s) => {
        const a = assignmentById.get(s.assignment_id);
        return {
          key: `task-${s.id}`,
          workKey: `task:${s.assignment_id}`,
          title: a ? (ar ? a.title_ar : a.title_en) : s.original_filename,
          attempt: s.attempt_number ?? 1,
          grade: Number(s.grade),
          max: Number(a?.max_score ?? 100),
          breakdown: parseBreakdown(s.score_breakdown),
          notes: parseNotes(s.criterion_notes),
          feedback: s.admin_feedback,
          photoPaths: [],
          counts: s.publish_to_leaderboard !== false,
          gradedAt: s.graded_at ?? s.submitted_at
        };
      }),
    ...cases
      .filter((c) => c.status === 'reviewed' && c.grade !== null)
      .map((c) => {
        const module = Array.isArray(c.course_modules) ? c.course_modules[0] : c.course_modules;
        return {
          key: `case-${c.id}`,
          workKey: `case:${c.module_id ?? c.id}`,
          title: module ? (ar ? module.title_ar : module.title_en) : (c.file_name ?? 'Case file'),
          attempt: 1,
          grade: Number(c.grade),
          max: 100,
          breakdown: parseBreakdown(c.score_breakdown),
          notes: parseNotes(c.criterion_notes),
          feedback: c.reviewer_notes,
          photoPaths: Array.isArray(c.review_photos) ? c.review_photos : [],
          counts: c.publish_to_leaderboard !== false,
          gradedAt: c.graded_at ?? c.reviewed_at ?? c.submitted_at
        };
      })
  ].sort((a, b) => new Date(b.gradedAt).getTime() - new Date(a.gradedAt).getTime());

  /*
   * THE AVERAGE MUST EQUAL THE ONE THE LEADERBOARD RANKS ON.
   *
   * Same three rules as the `leaderboard` view in migration 020, in the same
   * order: only work that counts, best attempt per piece of work, converted to
   * a percentage before averaging. If this page and the view disagreed, a
   * student would see one average here, be ranked on another, and be right to
   * trust neither.
   */
  const bestByWork = new Map<string, number>();
  for (const item of graded) {
    if (!item.counts) continue;
    const pct = toPercent(item.grade, item.max);
    const current = bestByWork.get(item.workKey);
    if (current === undefined || pct > current) bestByWork.set(item.workKey, pct);
  }
  const bestScores = [...bestByWork.values()];
  const average = bestScores.length
    ? Math.round((bestScores.reduce((a, b) => a + b, 0) / bestScores.length) * 10) / 10
    : null;

  /*
   * Reviewer photos are private-bucket paths. Sign them only for this page
   * view, with a short expiry. The paths come from this student's own rows
   * (read under RLS as them), and students cannot write review_photos — the
   * insert guard in migration 020 blanks it — so nothing here can be steered
   * at another student's files.
   */
  const photosByItem = new Map<string, Array<{ path: string; url: string }>>();
  await Promise.all(
    graded
      .filter((item) => item.photoPaths.length > 0)
      .map(async (item) => photosByItem.set(item.key, await signedReviewPhotos(item.photoPaths)))
  );

  const rank = (rankRows as any[])?.[0] ?? null;
  const awaiting =
    submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review' || s.status === 'resubmitted').length +
    cases.filter((c) => c.status === 'pending').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10 md:py-14">
      {/* The welcome banner, at-a-glance stats, recent activity and STL task
          grid. Rendered only when the overview loaded — a failed fetch should
          cost the banner, not the whole profile. */}
      {overview && (
        <StudentDashboard
          locale={locale}
          name={overview.displayName}
          email={overview.email}
          avatarUrl={overview.avatarUrl}
          courseName={overview.courseName}
          courseImage={overview.courseImage}
          modules={overview.modules}
          progress={overview.progress}
          progressAvailable={overview.progressAvailable}
          activities={overview.activities}
          taskSummaries={overview.taskSummaries}
        />
      )}

      {/*
        * NO SECOND PROGRESS CARD, AND NO SECOND NAME.
        *
        * StudentDashboard above already renders the welcome banner (name,
        * email, avatar), the completion percentage — twice, in the ring and
        * the continue card — the progress bar, completed/remaining counts and
        * total watch time. Repeating any of it here was the same numbers
        * printed a second time a few hundred pixels lower.
        *
        * What follows is only what the dashboard does NOT cover: the average
        * grade, the leaderboard standing, and the per-criterion detail behind
        * each graded case.
        */}

      {/* ---------- STANDING ---------- */}
      <section className="surface-card mt-14 p-6 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-black">{t('standingTitle')}</h2>
          <Link href={lh(locale, '/leaderboard')} className="text-sm text-brass underline">
            {t('viewLeaderboard')}
          </Link>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-steel">
          {rank
            ? t('rankLine', { rank: Number(rank.rank), total: Number(rank.total) })
            : t('rankNone')}
        </p>

        {/* The average IS new — the dashboard counts lessons and watch time but
            never grades. Shown here beside the rank it feeds into. */}
        {average !== null && (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Stat label={t('statAverage')} value={String(average)} />
            <Stat label={t('statCasesGraded')} value={String(bestScores.length)} />
          </dl>
        )}

        {/* The opt-out lives here, next to the rank it controls, rather than
            buried in a settings page the student would have to go looking for. */}
        <div className="mt-5 border-t border-ink/10 pt-5">
          <LeaderboardVisibility initial={me.show_on_leaderboard !== false} ar={ar} />
        </div>
      </section>

      {/* ---------- SCORE DETAIL ----------
        *
        * NOT a second list of case files. The STL Tasks grid in the dashboard
        * above already shows one card per assignment: title, current status,
        * grade and a clipped feedback line. Repeating that here was the same
        * information twice.
        *
        * This section answers the question the grid cannot: HOW was each grade
        * arrived at. So it shows graded attempts only — every attempt, not just
        * the latest — with the per-criterion breakdown and the reviewer's note
        * in full.
        */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-black">{t('scoresTitle')}</h2>
          {awaiting > 0 && (
            <span className="text-xs text-steel">{t('awaiting', { count: awaiting })}</span>
          )}
        </div>

        {graded.length === 0 ? (
          <p className="surface-card mt-4 p-6 text-sm text-steel">{t('noScores')}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {graded.map((item) => {
              const photos = photosByItem.get(item.key) ?? [];
              return (
                <li key={item.key} className="surface-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      {item.title}
                      {item.attempt > 1 && (
                        <span className="ms-2 text-xs font-normal text-steel">
                          {t('attempt', { n: item.attempt })}
                        </span>
                      )}
                      {!item.counts && (
                        // Said plainly, so a student who sees a grade here but
                        // not in their leaderboard average knows why.
                        <span className="ms-2 rounded-full bg-ink/5 px-2 py-0.5 text-[0.68rem] font-normal text-steel">
                          {t('practice')}
                        </span>
                      )}
                    </p>
                    <span className="figure font-display text-lg font-bold text-brass">
                      {item.grade}
                      <span className="text-sm font-normal text-steel"> / {item.max}</span>
                    </span>
                  </div>

                  {/* Sub-scores, only when the reviewer actually filled them in. */}
                  {item.breakdown && (
                    <ul className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-2">
                      {CRITERIA.filter((c) => item.breakdown![c.id] !== undefined).map((c) => {
                        const value = item.breakdown![c.id];
                        const note = item.notes?.[c.id];
                        return (
                          <li key={c.id}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="text-steel">{ar ? c.ar : c.en}</span>
                              <span className="figure font-medium">{value} / {c.max}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-brass/70"
                                style={{ width: `${Math.min(100, (value / c.max) * 100)}%` }}
                              />
                            </div>
                            {note && <p className="mt-1.5 text-xs leading-relaxed text-steel">{note}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {item.feedback && (
                    <p className="mt-4 whitespace-pre-line border-t border-ink/10 pt-4 text-sm leading-relaxed text-steel">
                      {item.feedback}
                    </p>
                  )}

                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink/10 pt-4 sm:grid-cols-3">
                      {photos.map((photo) => (
                        <a
                          key={photo.path}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-line"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label mb-1">{label}</dt>
      <dd className="figure font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}
