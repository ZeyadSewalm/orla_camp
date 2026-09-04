import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getProfile } from '@/lib/supabase/server';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The cohort leaderboard.
 *
 * WHAT THIS PAGE CAN AND CANNOT SEE
 *
 * It reads the `leaderboard` view and nothing else. That view is the privacy
 * boundary: it exposes a display name, two counts and an average, and excludes
 * anyone who opted out, anyone without access, and staff. Per-submission
 * grades, feedback, emails and file links are not in it and cannot leak
 * through this page.
 *
 * `robots: noindex` because this is student performance data. It is behind a
 * login, but a search engine should never be tempted either.
 */
export default async function Leaderboard({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const ar = locale === 'ar';
  const t = await getTranslations('leaderboard');

  const me = await getProfile();
  if (!me) redirect(lh(locale, '/login'));
  if (!me.has_access) redirect(lh(locale, '/pricing'));

  const supabase = createClient();
  const { data } = await supabase
    .from('leaderboard')
    .select('user_id,display_name,lessons_completed,cases_graded,average_grade,points')
    .order('points', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as any[];

  /*
   * Ranks are computed here rather than by row position so that equal scores
   * share a rank (1, 2, 2, 4) instead of being ordered arbitrarily. Two
   * students on identical points are genuinely tied, and showing one above the
   * other implies a difference that does not exist.
   */
  let lastPoints: number | null = null;
  let lastRank = 0;
  const ranked = rows.map((row, i) => {
    const points = Number(row.points);
    const rank = points === lastPoints ? lastRank : i + 1;
    lastPoints = points;
    lastRank = rank;
    return { ...row, rank };
  });

  const optedOut = me.show_on_leaderboard === false;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black">{t('title')}</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-steel">{t('subtitle')}</p>
        </div>
        <Link href={lh(locale, '/profile')} className="btn-quiet text-xs">{t('backToProfile')}</Link>
      </header>

      {optedOut && (
        // Someone who opted out will not find themselves in the list. Saying so
        // is better than letting them scroll looking for a row that isn't there.
        <p className="mt-6 border border-ink/15 bg-white/70 p-4 text-xs leading-relaxed text-steel">
          {t('youAreHidden')}
        </p>
      )}

      {ranked.length === 0 ? (
        <p className="surface-card mt-8 p-6 text-sm text-steel">{t('empty')}</p>
      ) : (
        <ol className="surface-card mt-8 divide-y divide-ink/10">
          {ranked.map((row) => {
            const isMe = row.user_id === me.id;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-4 px-5 py-4 ${isMe ? 'bg-brass/5' : ''}`}
              >
                <span
                  className={`figure w-8 shrink-0 text-sm font-bold ${
                    row.rank <= 3 ? 'text-brass' : 'text-steel'
                  }`}
                >
                  {row.rank}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.display_name}
                    {isMe && (
                      <span className="ms-2 text-xs font-normal text-brass">{t('you')}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-steel">
                    {t('rowSummary', {
                      lessons: Number(row.lessons_completed),
                      cases: Number(row.cases_graded)
                    })}
                    {row.average_grade !== null && (
                      <> · {t('avg')} <span className="figure">{Number(row.average_grade)}</span></>
                    )}
                  </p>
                </div>

                <span className="figure shrink-0 font-display text-base font-bold">
                  {Math.round(Number(row.points))}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-6 text-xs leading-relaxed text-steel">{t('howItWorks')}</p>
    </div>
  );
}
