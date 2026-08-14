import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import type { CaseFileSubmission } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MySubmissions({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('course');
  const user = await getSessionUser();
  if (!user) redirect(lh(locale, '/login'));

  const supabase = createClient();
  const { data } = await supabase
    .from('case_file_submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false });

  const rows = (data ?? []) as CaseFileSubmission[];

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-display text-4xl font-black">{t('mySubmissions')}</h1>

      {rows.length === 0 ? (
        <p className="mt-8 text-steel">{t('noSubmissions')}</p>
      ) : (
        <ul className="mt-10 space-y-5">
          {rows.map((row) => (
            <li key={row.id} className="border border-ink/15 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">{row.file_name}</span>
                <span className={`px-2 py-1 text-xs ${row.status === 'reviewed' ? 'bg-brass text-white' : 'border border-ink/25 text-steel'}`}>
                  {row.status === 'reviewed' ? t('statusReviewed') : t('statusPending')}
                </span>
              </div>
              {row.reviewer_notes && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="label">{t('feedback')}{row.reviewed_by ? ` — ${row.reviewed_by}` : ''}</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.reviewer_notes}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
