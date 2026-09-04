import { createClient, getSessionUser } from '@/lib/supabase/server';
import { getCachedProfile, getModules, getSiteSettings } from '@/lib/data';
import type {
  Assignment,
  AssignmentSubmission,
  CourseModule,
  LessonProgress,
  Profile
} from '@/lib/types';

/**
 * Everything the student dashboard needs, gathered once.
 *
 * WHY THIS IS A SHARED MODULE AND NOT INLINE IN A PAGE
 *
 * This logic used to live inside the course page, because the dashboard used to
 * live there too. Moving the dashboard to /profile left two bad options:
 * duplicate ~200 lines of queries and activity-feed construction into the new
 * page, or import from one page into another. Both rot.
 *
 * So the data layer moved here, and the page that renders it just calls this.
 * The course page keeps only what the player itself needs.
 */

export type StudentActivity = {
  id: string;
  type: 'completed' | 'watched' | 'submitted' | 'reviewed' | 'task_submitted' | 'task_graded' | 'task_revision';
  title: string;
  meta: string;
  at: string;
};

export type StudentOverview = {
  profile: Profile;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  courseName: string;
  courseImage: string | null;
  modules: CourseModule[];
  progress: LessonProgress[];
  progressAvailable: boolean;
  activities: StudentActivity[];
  taskSummaries: Array<{
    assignment: Assignment;
    submission: AssignmentSubmission | null;
    lesson: CourseModule | null;
  }>;
};

/**
 * Returns null when there is no signed-in user or no profile row. The CALLER
 * decides what that means — redirect to login, redirect to pricing — because
 * only the caller knows which page the student was trying to reach.
 */
export async function getStudentOverview(locale: string): Promise<StudentOverview | null> {
  const ar = locale === 'ar';

  const user = await getSessionUser();
  if (!user) return null;

  const [profile, modules, siteSettings] = await Promise.all([
    getCachedProfile(user.id),
    getModules(),
    getSiteSettings()
  ]);
  if (!profile) return null;

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
    console.warn('[overview] lesson_progress unavailable:', progressError.message);
  }
  if ((assignmentsError || taskSubmissionsError) && process.env.NODE_ENV === 'development') {
    console.warn('[overview] STL tasks unavailable:', assignmentsError?.message || taskSubmissionsError?.message);
  }

  const progress = (progressRows ?? []) as LessonProgress[];
  const assignments = (assignmentRows ?? []) as Assignment[];
  const taskSubmissions = (taskSubmissionRows ?? []) as AssignmentSubmission[];
  const courseModules = modules as CourseModule[];
  const modulesById = new Map(courseModules.map((m) => [m.id, m]));

  // Newest first, so the first row seen per assignment is the latest attempt.
  const latestTaskSubmissionByAssignment = new Map<string, AssignmentSubmission>();
  for (const submission of taskSubmissions) {
    if (!latestTaskSubmissionByAssignment.has(submission.assignment_id)) {
      latestTaskSubmissionByAssignment.set(submission.assignment_id, submission);
    }
  }

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

  const activities: StudentActivity[] = [];

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

  return {
    profile,
    displayName,
    email,
    avatarUrl,
    courseName,
    courseImage: siteSettings?.landing_image_url ?? null,
    modules: courseModules,
    progress,
    progressAvailable: !progressError,
    activities,
    taskSummaries: assignments.map((assignment) => ({
      assignment,
      submission: latestTaskSubmissionByAssignment.get(assignment.id) ?? null,
      lesson: modulesById.get(assignment.lesson_id) ?? null
    }))
  };
}
