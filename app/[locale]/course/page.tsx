import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import StudentDashboard from '@/components/StudentDashboard';
import CoursePlayer, { type CourseLessonVM } from '@/components/CoursePlayer';
import { videoSrcFor, posterFor } from '@/lib/video-src';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules, getSiteSettings } from '@/lib/data';
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
      isFreePreview: m.is_free_preview,
      src: unlocked ? videoSrcFor(m) : null,
      poster: unlocked ? posterFor(m) : null,
      completed: progressRow?.is_completed ?? false,
      watchSeconds: progressRow?.watch_seconds ?? 0,
      checklistUrl: unlocked ? m.checklist_file_url : null,
      previousTitle: i > 0 ? (ar ? modules[i - 1].title_ar : modules[i - 1].title_en) : null,
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

        {modules.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-6 text-sm text-steel">
            {t('empty')}
          </div>
        ) : (
          <div className="mt-8">
            <CoursePlayer locale={locale} userId={profile.id} lessons={lessons} initialActiveId={initialActiveId} />
          </div>
        )}
      </section>
    </div>
  );
}
