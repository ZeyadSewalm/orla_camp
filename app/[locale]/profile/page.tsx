import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getProfile } from '@/lib/supabase/server';
import { lh } from '@/lib/href';
import { CRITERIA, parseBreakdown } from '@/lib/scoring';
import LeaderboardVisibility from '@/components/LeaderboardVisibility';

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

  const supabase = createClient();

  /*
   * The module list is filtered by the SAME rule the course page uses: a
   * student's denominator must be the curriculum THEY can reach. Counting
   * modules locked behind a higher tier would show someone on Foundation a
   * percentage they can never move past — a progress bar that punishes them
   * for the tier they bought.
   */
  const [{ data: moduleRows }, { data: progressRows }, { data: submissionRows }, { data: assignmentRows }, { data: rankRows }] =
    await Promise.all([
      supabase.from('course_modules').select('id,title_ar,title_en,order_index,tier_ids').order('order_index'),
      supabase.from('lesson_progress').select('module_id,is_completed,watch_seconds,completed_at').eq('user_id', me.id),
      supabase
        .from('assignment_submissions')
        .select('id,assignment_id,attempt_number,status,grade,score_breakdown,admin_feedback,submitted_at,graded_at,original_filename')
        .eq('user_id', me.id)
        .not('status', 'in', '(uploading,failed)')
        .order('updated_at', { ascending: false }),
      supabase.from('assignments').select('id,lesson_id,title_ar,title_en,max_score'),
      supabase.rpc('my_leaderboard_rank')
    ]);

  const modules = (moduleRows ?? []) as any[];
  const myTierId = me.tier_id ?? null;
  const visibleModules = modules.filter(
    (m) => !m.tier_ids?.length || (myTierId && m.tier_ids.includes(myTierId))
  );

  const progressByModule = new Map((progressRows ?? []).map((row: any) => [row.module_id, row]));
  const completed = visibleModules.filter((m) => progressByModule.get(m.id)?.is_completed).length;
  const started = visibleModules.filter((m) => progressByModule.has(m.id)).length;
  const pct = visibleModules.length ? Math.round((completed / visibleModules.length) * 100) : 0;

  const assignments = (assignmentRows ?? []) as any[];
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const submissions = (submissionRows ?? []) as any[];

  const gradedSubs = submissions.filter((s) => s.status === 'graded' && s.grade !== null);
  /*
   * Best attempt per assignment, matching the leaderboard view exactly. If the
   * two disagreed, a student would see one average here and be ranked on
   * another — and would be right to trust neither.
   */
  const bestByAssignment = new Map<string, number>();
  for (const sub of gradedSubs) {
    const current = bestByAssignment.get(sub.assignment_id);
    if (current === undefined || Number(sub.grade) > current) {
      bestByAssignment.set(sub.assignment_id, Number(sub.grade));
    }
  }
  const bestScores = [...bestByAssignment.values()];
  const average = bestScores.length
    ? Math.round((bestScores.reduce((a, b) => a + b, 0) / bestScores.length) * 10) / 10
    : null;

  const rank = (rankRows as any[])?.[0] ?? null;
  const awaiting = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review' || s.status === 'resubmitted').length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black">{t('title')}</h1>
          <p className="mt-1 text-sm text-steel">{me.full_name || me.email}</p>
        </div>
        <Link href={lh(locale, '/course')} className="btn-quiet text-xs">{t('backToCourse')}</Link>
      </header>

      {/* ---------- PROGRESS ---------- */}
      <section className="surface-card mt-10 p-6 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-black">{t('progressTitle')}</h2>
          <span className="figure text-sm text-steel">
            {completed} / {visibleModules.length} {t('lessons')}
          </span>
        </div>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-brass transition-[width] duration-700"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label={t('statComplete')} value={`${pct}%`} />
          <Stat label={t('statStarted')} value={String(started)} />
          <Stat label={t('statAverage')} value={average === null ? '—' : String(average)} />
        </dl>
      </section>

      {/* ---------- STANDING ---------- */}
      <section className="surface-card mt-6 p-6 md:p-8">
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

        {/* The opt-out lives here, next to the rank it controls, rather than
            buried in a settings page the student would have to go looking for. */}
        <div className="mt-5 border-t border-ink/10 pt-5">
          <LeaderboardVisibility initial={me.show_on_leaderboard !== false} ar={ar} />
        </div>
      </section>

      {/* ---------- CASE FILES ---------- */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-black">{t('casesTitle')}</h2>
          {awaiting > 0 && (
            <span className="text-xs text-steel">{t('awaiting', { count: awaiting })}</span>
          )}
        </div>

        {submissions.length === 0 ? (
          <p className="surface-card mt-4 p-6 text-sm text-steel">{t('noCases')}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {submissions.map((sub) => {
              const assignment = assignmentById.get(sub.assignment_id);
              const breakdown = parseBreakdown(sub.score_breakdown);
              const isGraded = sub.status === 'graded' && sub.grade !== null;

              return (
                <li key={sub.id} className="surface-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      {assignment ? (ar ? assignment.title_ar : assignment.title_en) : sub.original_filename}
                      {sub.attempt_number > 1 && (
                        <span className="ms-2 text-xs font-normal text-steel">
                          {t('attempt', { n: sub.attempt_number })}
                        </span>
                      )}
                    </p>
                    {isGraded ? (
                      <span className="figure font-display text-lg font-bold text-brass">
                        {Number(sub.grade)}
                        <span className="text-sm font-normal text-steel"> / {assignment?.max_score ?? 100}</span>
                      </span>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.12em] text-steel">
                        {t(`status_${sub.status}` as 'status_submitted')}
                      </span>
                    )}
                  </div>

                  {/* Sub-scores. Only rendered when the reviewer actually filled
                      them in — older submissions have a grade and no detail, and
                      an empty grid of dashes would look like missing data. */}
                  {isGraded && breakdown && (
                    <ul className="mt-4 grid gap-2.5 border-t border-ink/10 pt-4 sm:grid-cols-2">
                      {CRITERIA.filter((c) => breakdown[c.id] !== undefined).map((c) => {
                        const value = breakdown[c.id];
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
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {sub.admin_feedback && (
                    <p className="mt-4 border-t border-ink/10 pt-4 text-sm leading-relaxed text-steel">
                      {sub.admin_feedback}
                    </p>
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
