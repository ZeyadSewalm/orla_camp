import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileUp,
  Star,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import type { Assignment, AssignmentSubmission, CourseModule, LessonProgress } from '@/lib/types';
import StudentWelcome from '@/components/StudentWelcome';
import { lh } from '@/lib/href';

type Activity = {
  id: string;
  type: 'completed' | 'watched' | 'submitted' | 'reviewed' | 'task_submitted' | 'task_graded' | 'task_revision';
  title: string;
  meta: string;
  at: string;
};

type TaskSummary = {
  assignment: Assignment;
  submission: AssignmentSubmission | null;
  lesson: CourseModule | null;
};

function formatWatchTime(seconds: number, locale: string) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return locale === 'ar' ? `${hours} س ${minutes} د` : `${hours}h ${minutes}m`;
  return locale === 'ar' ? `${minutes} دقيقة` : `${minutes} min`;
}

function relativeTime(value: string, locale: string) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSeconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date(value));
}

export default function StudentDashboard({
  locale,
  name,
  email,
  avatarUrl,
  courseName,
  courseImage,
  modules,
  progress,
  progressAvailable,
  activities,
  taskSummaries
}: {
  locale: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  courseName: string;
  courseImage: string | null;
  modules: CourseModule[];
  progress: LessonProgress[];
  progressAvailable: boolean;
  activities: Activity[];
  taskSummaries: TaskSummary[];
}) {
  const ar = locale === 'ar';
  // Upcoming lessons are visible in the curriculum but must not inflate the
  // student's denominator until they are actually released.
  const lessons = modules.filter((m) => m.status !== 'coming');
  const lessonIds = new Set(lessons.map((m) => m.id));
  const relevantProgress = progress.filter((p) => lessonIds.has(p.module_id));
  const completed = relevantProgress.filter((p) => p.is_completed).length;
  const total = lessons.length;
  const remaining = Math.max(total - completed, 0);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const watchSeconds = relevantProgress.reduce((sum, row) => sum + (row.watch_seconds || 0), 0);

  const recent = [...relevantProgress].sort(
    (a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()
  )[0];
  const continueModule = modules.find((m) => m.id === recent?.module_id) ?? lessons[0] ?? null;
  const continueHref = continueModule ? `${lh(locale, '/course')}#lesson-${continueModule.id}` : lh(locale, '/course');
  const image = courseImage ?? continueModule?.thumbnail_url ?? modules.find((m) => m.thumbnail_url)?.thumbnail_url ?? null;

  const labels = ar
    ? {
        overview: 'نظرة سريعة على تعلمك',
        progress: 'تقدمك في الكورس',
        completed: 'مكتمل',
        lessonsCompleted: 'دروس مكتملة',
        completedLesson: 'درس مكتمل',
        remaining: 'دروس متبقية',
        watch: 'وقت المشاهدة',
        continue: percentage === 100 && total > 0 ? 'أكملت الكورس' : recent ? 'كمل من حيث توقفت' : 'خطوتك التالية',
        nextLesson: recent ? 'آخر درس وصلت إليه' : 'ابدأ بأول درس',
        action: percentage === 100 && total > 0 ? 'مراجعة الدروس' : recent ? 'متابعة المشاهدة' : 'ابدأ الكورس',
        activityKicker: 'نشاطك',
        recent: 'آخر النشاطات',
        noActivity: 'ابدأ أول درس، وهنا هتظهر مشاهداتك وإنجازاتك وآخر نشاطاتك.',
        noProgress: 'تعذر تحميل تقدمك حاليًا. ما زال بإمكانك مشاهدة الدروس وإكمالها بشكل طبيعي.',
        lessons: 'درس',
        noCourses: 'لا توجد دروس متاحة للتعلّم في الكورس حاليًا.',
        tasksKicker: 'مهامك العملية',
        tasksTitle: 'STL Tasks',
        noTasks: 'لا توجد مهام STL مطلوبة منك حاليًا.',
        taskNotSubmitted: 'لم يتم التسليم بعد',
        taskSubmitted: 'تم التسليم',
        taskReview: 'قيد المراجعة',
        taskGraded: 'تم التقييم',
        taskRevision: 'يحتاج تعديل',
        goToTask: 'اذهب للمهمة',
        score: 'النتيجة',
        ready: percentage === 100 ? 'تم الإنجاز' : percentage > 0 ? 'استمر بنفس القوة' : 'جاهز للبدء',
      }
    : {
        overview: 'Your learning at a glance',
        progress: 'Course progress',
        completed: 'completed',
        lessonsCompleted: 'Completed lessons',
        completedLesson: 'lesson completed',
        remaining: 'Remaining lessons',
        watch: 'Total watch time',
        continue: percentage === 100 && total > 0 ? 'Course completed' : recent ? 'Continue learning' : 'Your next step',
        nextLesson: recent ? 'Last lesson reached' : 'Start with the first lesson',
        action: percentage === 100 && total > 0 ? 'Review lessons' : recent ? 'Continue watching' : 'Start course',
        activityKicker: 'Your activity',
        recent: 'Recent activity',
        noActivity: 'Start your first lesson and your viewing history and achievements will appear here.',
        noProgress: 'Your progress could not be loaded right now. You can still watch and complete lessons normally.',
        lessons: 'lessons',
        noCourses: 'There are no lessons available to learn yet.',
        tasksKicker: 'Hands-on work',
        tasksTitle: 'STL Tasks',
        noTasks: 'You do not have any STL tasks right now.',
        taskNotSubmitted: 'Not submitted yet',
        taskSubmitted: 'Submitted',
        taskReview: 'Under review',
        taskGraded: 'Graded',
        taskRevision: 'Needs revision',
        goToTask: 'Go to task',
        score: 'Score',
        ready: percentage === 100 ? 'Completed' : percentage > 0 ? 'Keep going' : 'Ready to start',
      };

  const statCards = [
    { label: labels.lessonsCompleted, value: completed.toString(), icon: CheckCircle2 },
    { label: labels.remaining, value: remaining.toString(), icon: BookOpen },
    { label: labels.watch, value: formatWatchTime(watchSeconds, locale), icon: Clock3 }
  ];

  return (
    <section aria-labelledby="student-dashboard-title" className="space-y-5 md:space-y-6">
      <StudentWelcome
        initialName={name}
        initialEmail={email}
        initialAvatarUrl={avatarUrl}
      />

      {!progressAvailable && (
        <div role="status" className="rounded-2xl border border-brandGold/25 bg-brandGold/10 px-4 py-3 text-xs text-steel sm:text-sm">
          {labels.noProgress}
        </div>
      )}

      {lessons.length === 0 ? (
        <div className="surface-card p-6 text-sm text-steel soft-shadow sm:p-8">
          {labels.noCourses}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.45fr_0.55fr] lg:items-start">
            <div className="surface-card self-start p-5 soft-shadow sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="label !mb-0">{labels.progress}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brass/10 px-2.5 py-1 text-xs font-semibold text-brass">
                      <Target aria-hidden className="h-3 w-3" />
                      {labels.ready}
                    </span>
                  </div>
                  <h2 className="truncate font-display text-[clamp(1.35rem,2vw,1.9rem)] font-black leading-tight text-ink">{courseName}</h2>
                  <p className="mt-1.5 text-xs text-steel sm:text-sm">{labels.overview}</p>
                </div>

                <div className="shrink-0 text-end">
                  <div className="inline-flex items-baseline gap-1 rounded-2xl bg-brass/5 px-3 py-2">
                    <span className="figure text-[clamp(1.8rem,3vw,2.6rem)] font-medium leading-none text-brass">{percentage}%</span>
                  </div>
                  <p className="mt-1 text-xs text-steel">{labels.completed}</p>
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/[0.07]" aria-label={`${percentage}%`}>
                <div
                  className="h-full rounded-full bg-brass transition-[width] duration-700 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="mt-4 grid gap-2 xs:grid-cols-2">
                <div className="rounded-2xl bg-ink/[0.035] px-3.5 py-3">
                  <p className="text-xs text-steel">{labels.lessonsCompleted}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span dir="ltr" className="figure text-base font-medium text-ink">{completed} / {total}</span>
                    <span className="text-xs text-steel">{labels.completedLesson}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-ink/[0.035] px-3.5 py-3">
                  <p className="text-xs text-steel">{labels.remaining}</p>
                  <p className="figure mt-1 text-base font-medium text-ink">{remaining}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
              {statCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="group rounded-2xl border border-ink/10 bg-white p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-brass/20 hover:shadow-sm sm:p-4">
                  <div className="flex items-center justify-between gap-2 lg:items-start">
                    <div className="min-w-0">
                      <p className="figure text-base font-medium text-ink sm:text-lg">{value}</p>
                      <p className="mt-1 text-xs leading-snug text-steel">{label}</p>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-brass transition group-hover:bg-brass group-hover:text-white">
                      <Icon aria-hidden className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <div className="surface-card overflow-hidden soft-shadow">
              <div className="grid sm:grid-cols-[9.5rem_1fr]">
                <div className="relative min-h-36 overflow-hidden bg-ink sm:min-h-full">
                  {image ? (
                    // These URLs are controlled by admins and may live outside Next Image domains.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-85 transition duration-500 hover:scale-[1.03]" />
                  ) : (
                    <div className="absolute inset-0 brand-grid bg-brass/5" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/10 to-transparent" />
                  <span className="absolute bottom-4 start-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-brass shadow-lg">
                    <PlayCircle aria-hidden className="h-5 w-5" />
                  </span>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="label !mb-0">{labels.continue}</p>
                    <span className="figure rounded-full bg-brass/10 px-2.5 py-1 text-xs font-medium text-brass">{percentage}%</span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-black leading-tight">{courseName}</h2>
                  {continueModule && (
                    <div className="mt-3 rounded-2xl bg-ink/[0.035] p-3.5">
                      <p className="text-xs font-semibold text-steel">{labels.nextLesson}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink">
                        {ar ? continueModule.title_ar : continueModule.title_en}
                      </p>
                    </div>
                  )}
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
                    <div className="h-full rounded-full bg-brass transition-[width] duration-700" style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-steel">
                    <span>{percentage}%</span>
                    <span className="flex items-center gap-1">
                      <span dir="ltr" className="figure text-ink">{completed} / {total}</span>
                      <span>{labels.lessons}</span>
                    </span>
                  </div>
                  {continueModule && (
                    <Link href={continueHref} className="btn-primary mt-4 w-full justify-center sm:w-auto">
                      <PlayCircle aria-hidden className="h-4 w-4" />
                      {labels.action}
                      <ArrowRight aria-hidden className="h-4 w-4 rtl:rotate-180" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="surface-card p-5 soft-shadow sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="label !mb-1">{labels.activityKicker}</p>
                  <h2 className="font-display text-lg font-black leading-tight">{labels.recent}</h2>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass/10 text-brass">
                  <RotateCcw aria-hidden className="h-4 w-4" />
                </span>
              </div>

              {activities.length === 0 ? (
                <div className="mt-5 flex gap-3 rounded-2xl border border-dashed border-ink/10 bg-ink/[0.025] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-brass">
                    <Sparkles aria-hidden className="h-4 w-4" />
                  </span>
                  <p className="text-xs leading-relaxed text-steel sm:text-sm">{labels.noActivity}</p>
                </div>
              ) : (
                <ol className="mt-5 space-y-1">
                  {activities.slice(0, 6).map((activity, index) => {
                    const Icon = activity.type === 'completed'
                      ? CheckCircle2
                      : activity.type === 'task_graded'
                        ? Star
                        : activity.type === 'task_revision'
                          ? RotateCcw
                          : activity.type === 'reviewed' || activity.type === 'submitted' || activity.type === 'task_submitted'
                            ? FileCheck2
                            : PlayCircle;
                    return (
                      <li key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < Math.min(activities.length, 6) - 1 && (
                          <span aria-hidden className="absolute start-[15px] top-8 h-[calc(100%_-_1.4rem)] w-px bg-ink/10" />
                        )}
                        <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass/10 text-brass">
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm font-semibold leading-snug text-ink">{activity.title}</p>
                          <p className="mt-1 text-xs text-steel">{activity.meta} · {relativeTime(activity.at, locale)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          <div className="surface-card p-5 soft-shadow sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="label !mb-1">{labels.tasksKicker}</p>
                <h2 className="font-display text-lg font-black leading-tight">{labels.tasksTitle}</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass/10 text-brass">
                <FileUp aria-hidden className="h-4 w-4" />
              </span>
            </div>

            {taskSummaries.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-ink/10 bg-ink/[0.025] p-4 text-sm text-steel">
                {labels.noTasks}
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {taskSummaries.map(({ assignment, submission, lesson }) => {
                  const taskTitle = ar ? assignment.title_ar : assignment.title_en;
                  const lessonTitle = lesson ? (ar ? lesson.title_ar : lesson.title_en) : courseName;
                  const status = !submission || submission.status === 'uploading' || submission.status === 'failed'
                    ? labels.taskNotSubmitted
                    : submission.status === 'graded'
                      ? labels.taskGraded
                      : submission.status === 'needs_revision'
                        ? labels.taskRevision
                        : submission.status === 'under_review'
                          ? labels.taskReview
                          : labels.taskSubmitted;
                  return (
                    <div key={assignment.id} className="rounded-2xl border border-ink/10 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-steel">{lessonTitle}</p>
                          <h3 className="mt-1 font-display text-sm font-black text-ink sm:text-base">{taskTitle}</h3>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                          submission?.status === 'graded'
                            ? 'bg-emerald-50 text-emerald-700'
                            : submission?.status === 'needs_revision'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-brass/10 text-brass'
                        }`}>
                          {status}
                        </span>
                      </div>

                      {submission?.status === 'graded' && submission.grade !== null && (
                        <div className="mt-3 flex items-center justify-between rounded-xl bg-brass/5 px-3 py-2">
                          <span className="text-xs text-steel">{labels.score}</span>
                          <span dir="ltr" className="figure text-sm font-medium text-ink">{submission.grade} / {assignment.max_score}</span>
                        </div>
                      )}
                      {submission?.admin_feedback && (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-steel">{submission.admin_feedback}</p>
                      )}
                      <Link href={`${lh(locale, '/course')}#lesson-${assignment.lesson_id}`} className="btn-quiet mt-3 w-full justify-center py-2 text-xs sm:w-auto">
                        {labels.goToTask}
                        <ArrowRight aria-hidden className="h-3.5 w-3.5 rtl:rotate-180" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
