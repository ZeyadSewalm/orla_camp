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
import AssignmentTask from '@/components/AssignmentTask';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules, getSiteSettings } from '@/lib/data';
import type { Assignment, AssignmentSubmission, CourseModule, LessonProgress } from '@/lib/types';
import { lh } from '@/lib/href';
import { Lock } from 'lucide-react';

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
  const [
    { data: progressRows, error: progressError },
    { data: submissions },
    { data: assignmentRows, error: assignmentsError },
    { data: taskSubmissionRows, error: taskSubmissionsError }
  ] = await Promise.all([
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
      .limit(6),
    supabase
      .from('assignments')
      .select('id,lesson_id,title_ar,title_en,description_ar,description_en,max_score,allowed_file_types,max_file_size_mb,due_date,active,allow_resubmission,drive_folder_id,created_at,updated_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('assignment_submissions')
      .select('id,assignment_id,user_id,drive_file_id,drive_web_view_link,original_filename,stored_filename,file_size,attempt_number,status,grade,admin_feedback,submitted_at,upload_started_at,graded_at,graded_by,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
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

  const isStaff = profile.role === 'admin' || profile.role === 'reviewer';

  /**
   * A lesson counts as finished when it is marked complete AND every active
   * task on it has been submitted. A task still in `uploading` or `failed` has
   * not been submitted — the file never arrived.
   */
  function lessonFinished(moduleId: string) {
    if (!(progressByModule.get(moduleId)?.is_completed ?? false)) return false;
    const tasks = assignmentsByLesson.get(moduleId) ?? [];
    return tasks.every((task) => {
      const sub = latestTaskSubmissionByAssignment.get(task.id);
      return !!sub && !['uploading', 'failed'].includes(sub.status);
    });
  }

  const unlockedModuleIds = new Set<string>();
  for (let i = 0; i < modules.length; i += 1) {
    const current = modules[i];
    // The first lesson is always open, and so is anything already started —
    // nobody who has begun a lesson should ever find it locked behind them.
    const previous = i === 0 ? null : modules[i - 1];
    const open =
      isStaff ||
      i === 0 ||
      current.is_free_preview ||
      progressByModule.has(current.id) ||
      (previous ? lessonFinished(previous.id) : true);
    if (open) unlockedModuleIds.add(current.id);
  }

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
    type: 'completed' | 'watched' | 'submitted' | 'reviewed' | 'task_submitted' | 'task_graded' | 'task_revision';
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


  for (const submission of taskSubmissions) {
    if (submission.status === 'uploading' || submission.status === 'failed') continue;
    const assignment = assignments.find((item) => item.id === submission.assignment_id);
    if (!assignment) continue;
    const taskTitle = ar ? assignment.title_ar : assignment.title_en;
    const activityAt = submission.graded_at || submission.submitted_at || submission.updated_at;
    if (submission.status === 'graded') {
      activities.push({
        id: `task-graded-${submission.id}`,
        type: 'task_graded',
        title: ar ? `تم تقييم مهمة «${taskTitle}»` : `Task graded: “${taskTitle}”`,
        meta: submission.grade !== null ? `${submission.grade} / ${assignment.max_score}` : courseName,
        at: activityAt
      });
    } else if (submission.status === 'needs_revision') {
      activities.push({
        id: `task-revision-${submission.id}`,
        type: 'task_revision',
        title: ar ? `مهمة «${taskTitle}» تحتاج تعديل` : `Revision requested: “${taskTitle}”`,
        meta: courseName,
        at: activityAt
      });
    } else {
      activities.push({
        id: `task-submitted-${submission.id}`,
        type: 'task_submitted',
        title: ar ? `تم تسليم مهمة «${taskTitle}»` : `Submitted task: “${taskTitle}”`,
        meta: courseName,
        at: submission.submitted_at || submission.updated_at
      });
    }
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
        taskSummaries={assignments.map((assignment) => ({
          assignment,
          submission: latestTaskSubmissionByAssignment.get(assignment.id) ?? null,
          lesson: modulesById.get(assignment.lesson_id) ?? null
        }))}
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
          {modules.map((m: CourseModule, i: number) => {
            const unlocked = unlockedModuleIds.has(m.id);
            const previousTitle = i > 0 ? (ar ? modules[i - 1].title_ar : modules[i - 1].title_en) : '';
            return (
            <article
              key={m.id}
              id={`lesson-${m.id}`}
              className={`scroll-mt-28 rounded-[2rem] border border-ink/10 bg-white p-4 soft-shadow sm:p-6 md:p-8 ${unlocked ? '' : 'opacity-70'}`}
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

              {!unlocked ? (
                /*
                  No <VideoEmbed> at all for a locked lesson — not a hidden
                  one. The src is never computed, so it is not in the page
                  source either.
                */
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink/20 bg-paper px-6 text-center">
                  <Lock aria-hidden className="h-7 w-7 text-steel" />
                  <p className="text-sm font-semibold">
                    {ar ? 'هذا الدرس مقفل' : 'This lesson is locked'}
                  </p>
                  <p className="max-w-sm text-xs leading-relaxed text-steel">
                    {ar
                      ? `أكمِل درس «${previousTitle}» وسلّم مهمته لفتح هذا الدرس.`
                      : `Finish “${previousTitle}” and submit its task to unlock this lesson.`}
                  </p>
                  <a href={`#lesson-${modules[i - 1]?.id ?? ''}`} className="btn-quiet mt-1 text-xs">
                    {ar ? 'اذهب إلى الدرس السابق' : 'Go to the previous lesson'}
                  </a>
                </div>
              ) : (
              <VideoEmbed
                src={videoSrcFor(m)}
                poster={m.thumbnail_url ?? (m.video_source === 'bunny' && m.bunny_video_id ? bunnyThumbnail(m.bunny_video_id) : null)}
                title={ar ? m.title_ar : m.title_en}
                moduleId={m.id}
                durationMinutes={m.duration_minutes}
              />
              )}

              <div className={`mt-4 flex flex-wrap items-center gap-3 ${unlocked ? '' : 'hidden'}`}>
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


              {(assignmentsByLesson.get(m.id) ?? []).map((assignment) => (
                <AssignmentTask
                  key={assignment.id}
                  assignment={assignment}
                  latestSubmission={latestTaskSubmissionByAssignment.get(assignment.id) ?? null}
                  locale={locale}
                />
              ))}
            </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
