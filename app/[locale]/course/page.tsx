import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import VideoEmbed from '@/components/VideoEmbed';
import ModuleComplete from '@/components/ModuleComplete';
import StudentDashboard from '@/components/StudentDashboard';
import { driveEmbedUrl } from '@/lib/drive';
import { bunnyThumbnail, signedEmbedUrl } from '@/lib/bunny';
import UploadCaseFile from '@/components/UploadCaseFile';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules, getSiteSettings } from '@/lib/data';
import type { CourseModule, LessonProgress } from '@/lib/types';
import { lh } from '@/lib/href';

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Resolves the playable URL on the SERVER, after the access check above has
 * already passed. Bunny URLs are signed here and expire within the hour.
 */
function videoSrcFor(m: { video_source: string | null; bunny_video_id: string | null; video_link: string | null }) {
  if (m.video_source === 'bunny' && m.bunny_video_id) {
    try {
      return signedEmbedUrl(m.bunny_video_id);
    } catch {
      return null;
    }
  }
  return m.video_link ? driveEmbedUrl(m.video_link) : null;
}

export default async function Course({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('course');

  // Cookie read (no network) + a briefly cached profile. Access is still
  // enforced by middleware and RLS; these reads are for page data/display.
  const user = await getSessionUser();
  if (!user) redirect(lh(locale, '/login?next=/course'));

  const [profile, modules, siteSettings] = await Promise.all([
    getCachedProfile(user.id),
    getModules(),
    getSiteSettings()
  ]);

  if (!profile) redirect(lh(locale, '/login?next=/course'));
  if (!profile.has_access && profile.role !== 'admin' && profile.role !== 'reviewer') {
    redirect(lh(locale, '/pricing'));
  }

  const supabase = createClient();
  const [{ data: progressRows, error: progressError }, { data: submissions }] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select('user_id,module_id,is_completed,watch_seconds,started_at,last_watched_at,completed_at,updated_at')
      .eq('user_id', user.id)
      .order('last_watched_at', { ascending: false }),
    supabase
      .from('case_file_submissions')
      .select('id,module_id,status,submitted_at,reviewed_at')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(6)
  ]);

  if (progressError && process.env.NODE_ENV === 'development') {
    console.warn('[course] lesson_progress unavailable:', progressError.message);
  }

  const progress = (progressRows ?? []) as LessonProgress[];
  const progressByModule = new Map(progress.map((row) => [row.module_id, row]));
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const ar = locale === 'ar';

  const authName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    '';
  const email = profile.email || user.email || '';
  const displayName = profile.full_name?.trim() || authName || email.split('@')[0] || (ar ? 'طالب' : 'Student');
  const avatarUrl =
    (typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url) ||
    (typeof user.user_metadata?.picture === 'string' && user.user_metadata.picture) ||
    null;
  const courseName = ar
    ? siteSettings?.landing_title_ar || 'OrlaDent Camp'
    : siteSettings?.landing_title_en || 'OrlaDent Camp';

  const activities: Array<{
    id: string;
    type: 'completed' | 'watched' | 'submitted' | 'reviewed';
    title: string;
    meta: string;
    at: string;
  }> = [];

  for (const row of progress) {
    const module = modulesById.get(row.module_id);
    if (!module) continue;
    const lessonTitle = ar ? module.title_ar : module.title_en;

    if (row.is_completed && row.completed_at) {
      activities.push({
        id: `completed-${row.module_id}-${row.completed_at}`,
        type: 'completed',
        title: ar ? `أكملت درس «${lessonTitle}»` : `Completed “${lessonTitle}”`,
        meta: courseName,
        at: row.completed_at
      });
    } else if (row.last_watched_at) {
      const minutes = Math.max(1, Math.round((row.watch_seconds || 0) / 60));
      activities.push({
        id: `watched-${row.module_id}-${row.last_watched_at}`,
        type: 'watched',
        title: ar ? `واصلت مشاهدة «${lessonTitle}»` : `Continued “${lessonTitle}”`,
        meta: row.watch_seconds > 0
          ? (ar ? `${minutes} دقيقة مشاهدة مسجلة` : `${minutes} min recorded watch time`)
          : courseName,
        at: row.last_watched_at
      });
    }
  }

  for (const submission of submissions ?? []) {
    const module = submission.module_id ? modulesById.get(submission.module_id) : null;
    const lessonTitle = module ? (ar ? module.title_ar : module.title_en) : courseName;
    const reviewed = submission.status === 'reviewed' && !!submission.reviewed_at;
    activities.push({
      id: `${reviewed ? 'reviewed' : 'submitted'}-${submission.id}`,
      type: reviewed ? 'reviewed' : 'submitted',
      title: reviewed
        ? (ar ? 'تمت مراجعة ملف الحالة' : 'Your case file was reviewed')
        : (ar ? 'رفعت ملف حالة للمراجعة' : 'Uploaded a case file for review'),
      meta: lessonTitle,
      at: reviewed ? submission.reviewed_at! : submission.submitted_at
    });
  }

  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10 md:py-14">
      <StudentDashboard
        locale={locale}
        name={displayName}
        email={email}
        avatarUrl={avatarUrl}
        courseName={courseName}
        courseImage={siteSettings?.landing_image_url ?? null}
        modules={modules}
        progress={progress}
        progressAvailable={!progressError}
        activities={activities}
      />

      <section className="mt-14 border-t border-ink/10 pt-10 md:mt-20 md:pt-14" aria-labelledby="course-content-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label">{t('learningArea')}</p>
            <h2 id="course-content-title" className="font-display text-xl font-black sm:text-2xl">{t('title')}</h2>
          </div>
          <Link href={lh(locale, '/course/my-submissions')} className="btn-quiet py-2.5 text-xs sm:text-sm">
            {t('mySubmissions')}
          </Link>
        </div>

        {modules.length === 0 && (
          <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6 text-sm text-steel">
            {t('empty')}
          </div>
        )}

        <div className="mt-10 space-y-12 md:space-y-16">
          {modules.map((m: CourseModule, i: number) => (
            <article
              key={m.id}
              id={`lesson-${m.id}`}
              className="scroll-mt-28 rounded-[2rem] border border-ink/10 bg-white p-4 soft-shadow sm:p-6 md:p-8"
            >
              <div className="mb-5 flex items-start gap-4">
                <span className="figure flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-xs font-medium text-brass">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-display text-lg font-black sm:text-xl">{ar ? m.title_ar : m.title_en}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-steel">{ar ? m.description_ar : m.description_en}</p>
                </div>
              </div>

              <VideoEmbed
                src={videoSrcFor(m)}
                poster={m.thumbnail_url ?? (m.video_source === 'bunny' && m.bunny_video_id ? bunnyThumbnail(m.bunny_video_id) : null)}
                title={ar ? m.title_ar : m.title_en}
                moduleId={m.id}
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {m.checklist_file_url && (
                  <a href={m.checklist_file_url} target="_blank" rel="noopener" className="btn-quiet text-sm">
                    {t('checklist')}
                  </a>
                )}
                <UploadCaseFile moduleId={m.id} userId={profile.id} />
                <ModuleComplete
                  moduleId={m.id}
                  initialDone={progressByModule.get(m.id)?.is_completed ?? false}
                  labels={{ done: t('markedDone'), markDone: t('markDone') }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
