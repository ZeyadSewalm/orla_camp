import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCachedTierOrder } from '@/lib/data';
import type { LiveSession } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LiveSessions({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('live');
  const supabase = createClient();

  const user = await getSessionUser();
  const [{ data }, order] = await Promise.all([
    supabase.from('live_sessions').select('*').order('scheduled_at', { ascending: false }),
    user ? getCachedTierOrder(user.id) : Promise.resolve(0)
  ]);

  const sessions = (data ?? []) as LiveSession[];
  const allowed = sessions.length > 0 || order >= 2;
  const now = Date.now();
  const upcoming = sessions.filter((s) => new Date(s.scheduled_at).getTime() >= now).reverse();
  const past = sessions.filter((s) => new Date(s.scheduled_at).getTime() < now);
  const ar = locale === 'ar';

  // -u-nu-latn for the same reason prices use it: Arabic-Indic digits fall
  // back to a different face mid-string and the date renders as a jumble.
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(ar ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Cairo' })
      .format(new Date(iso));

  if (!allowed) {
    const c = await getTranslations('community');
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-4xl font-black">{t('title')}</h1>
        <div className="mt-8 border border-brass bg-brass/5 p-6">
          <p>{c('locked')}</p>
          <Link href={lh(locale, `/pricing`)} className="btn-brass mt-5">{c('upgrade')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>

      <h2 className="mt-12 font-display text-xl font-bold">{t('upcoming')}</h2>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-steel">{t('none')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {upcoming.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{ar ? s.title_ar : s.title_en}</p>
                <p className="text-sm text-steel">{fmt(s.scheduled_at)}</p>
              </div>
              {s.join_link && <a href={s.join_link} target="_blank" rel="noopener" className="btn-brass text-sm">{t('join')}</a>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-14 font-display text-xl font-bold">{t('archive')}</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {past.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">{ar ? s.title_ar : s.title_en}</p>
              <p className="text-sm text-steel">{fmt(s.scheduled_at)}</p>
            </div>
            {s.recording_link && <a href={s.recording_link} target="_blank" rel="noopener" className="btn-quiet text-sm">{t('recording')}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
