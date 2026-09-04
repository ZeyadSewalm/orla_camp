import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import type { Assignment, AssignmentSubmission, CaseFileSubmission } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MySubmissions({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('course');
  const user = await getSessionUser();
  if (!user) redirect(lh(locale, '/login'));

  const supabase = createClient();
  const [{ data }, { data: taskRows }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from('case_file_submissions')
      .select('*')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('assignment_submissions')
      .select('id,assignment_id,user_id,drive_file_id,drive_web_view_link,original_filename,stored_filename,file_size,attempt_number,status,grade,admin_feedback,submitted_at,upload_started_at,graded_at,graded_by,updated_at')
      .eq('user_id', user.id)
      .not('status', 'in', '(uploading,failed)')
      .order('updated_at', { ascending: false }),
    supabase
      .from('assignments')
      .select('id,lesson_id,title_ar,title_en,description_ar,description_en,max_score,allowed_file_types,max_file_size_mb,due_date,active,allow_resubmission,drive_folder_id,created_at,updated_at')
  ]);

  const rows = (data ?? []) as CaseFileSubmission[];
  const assignments = (assignmentRows ?? []) as Assignment[];
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const tasks = (taskRows ?? []) as AssignmentSubmission[];
  const ar = locale === 'ar';

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-display text-4xl font-black">{t('mySubmissions')}</h1>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label">{ar ? 'المهام العملية' : 'Hands-on assignments'}</p>
            <h2 className="font-display text-xl font-black">STL Tasks</h2>
          </div>
          <span className="figure text-sm text-brass">{tasks.length}</span>
        </div>
        {tasks.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-ink/10 bg-white p-5 text-sm text-steel">
            {ar ? 'لم تسلّم أي مهمة STL حتى الآن.' : 'You have not submitted an STL task yet.'}
          </div>
        ) : (
          <ul className="mt-5 space-y-4">
            {tasks.map((row) => {
              const assignment = assignmentById.get(row.assignment_id);
              const title = assignment ? (ar ? assignment.title_ar : assignment.title_en) : (ar ? 'مهمة STL' : 'STL Task');
              const status = row.status === 'graded'
                ? (ar ? 'تم التقييم' : 'Graded')
                : row.status === 'needs_revision'
                  ? (ar ? 'يحتاج تعديل' : 'Needs revision')
                  : row.status === 'under_review'
                    ? (ar ? 'قيد المراجعة' : 'Under review')
                    : (ar ? 'تم التسليم' : 'Submitted');
              return (
                <li key={row.id} className="rounded-2xl border border-ink/10 bg-white p-5 soft-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-black">{title}</h3>
                      <p className="mt-1 text-xs text-steel">{row.original_filename} · #{row.attempt_number}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'graded' ? 'bg-emerald-50 text-emerald-700' : row.status === 'needs_revision' ? 'bg-amber-50 text-amber-700' : 'bg-brass/10 text-brass'}`}>{status}</span>
                  </div>
                  {assignment && row.grade !== null && (
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-brass/5 px-3 py-2">
                      <span className="text-xs text-steel">{ar ? 'النتيجة' : 'Score'}</span>
                      <span dir="ltr" className="figure text-sm font-medium">{row.grade} / {assignment.max_score}</span>
                    </div>
                  )}
                  {row.admin_feedback && (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="label">{ar ? 'ملاحظات المدرب' : 'Instructor feedback'}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.admin_feedback}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12 border-t border-ink/10 pt-8">
        <p className="label">{ar ? 'ملفات المراجعة العامة' : 'General case review files'}</p>
        <h2 className="font-display text-xl font-black">{ar ? 'ملفاتي' : 'My case files'}</h2>
        {rows.length === 0 ? (
          <p className="mt-5 text-steel">{t('noSubmissions')}</p>
        ) : (
          <ul className="mt-5 space-y-5">
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
                    <p className="label">{t('feedback')}{row.reviewed_by ? ` · ${row.reviewed_by}` : ''}</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.reviewer_notes}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
