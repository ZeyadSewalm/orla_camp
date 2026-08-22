import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileCheck2,
  PlayCircle,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import type { CourseModule, LessonProgress } from '@/lib/types';
import { lh } from '@/lib/href';

type Activity = {
  id: string;
  type: 'completed' | 'watched' | 'submitted' | 'reviewed';
  title: string;
  meta: string;
  at: string;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

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
  activities
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
        welcome: `مرحبًا بعودتك، ${name} 👋`,
        sub: 'جاهز تكمل رحلة التعلم؟',
        progress: 'تقدمك في الكورس',
        completed: 'مكتمل',
        lessonsCompleted: 'دروس مكتملة',
        remaining: 'دروس متبقية',
        watch: 'وقت المشاهدة',
        continue: percentage === 100 && total > 0 ? 'أكملت الكورس' : recent ? 'كمل من حيث توقفت' : 'ابدأ التعلم',
        lastLesson: recent ? 'آخر درس وصلت إليه' : 'ابدأ بأول درس',
        action: percentage === 100 && total > 0 ? 'مراجعة الدروس' : recent ? 'متابعة المشاهدة' : 'ابدأ الكورس',
        recent: 'آخر النشاطات',
        noActivity: 'أول ما تبدأ مشاهدة الدروس، نشاطك هيظهر هنا.',
        noProgress: 'تعذر تحميل تقدمك حاليًا. ما زال بإمكانك مشاهدة الدروس وإكمالها بشكل طبيعي.',
        lessons: 'درس',
        courseContent: 'محتوى الكورس',
        noCourses: 'لا توجد دروس متاحة للتعلّم في الكورس حاليًا.'
      }
    : {
        welcome: `Welcome back, ${name} 👋`,
        sub: 'Ready to keep learning?',
        progress: 'Course progress',
        completed: 'completed',
        lessonsCompleted: 'Completed lessons',
        remaining: 'Remaining lessons',
        watch: 'Total watch time',
        continue: percentage === 100 && total > 0 ? 'Course completed' : recent ? 'Continue learning' : 'Start learning',
        lastLesson: recent ? 'Last lesson reached' : 'Start with the first lesson',
        action: percentage === 100 && total > 0 ? 'Review lessons' : recent ? 'Continue watching' : 'Start course',
        recent: 'Recent activity',
        noActivity: 'Your learning activity will appear here once you start watching lessons.',
        noProgress: 'Your progress could not be loaded right now. You can still watch and complete lessons normally.',
        lessons: 'lessons',
        courseContent: 'Course content',
        noCourses: 'There are no lessons available to learn yet.'
      };

  const statCards = [
    { label: labels.lessonsCompleted, value: completed.toString(), icon: CheckCircle2 },
    { label: labels.remaining, value: remaining.toString(), icon: BookOpen },
    { label: labels.watch, value: formatWatchTime(watchSeconds, locale), icon: Clock3 }
  ];

  return (
    <section aria-labelledby="student-dashboard-title" className="space-y-6 md:space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-ink/10 bg-white p-5 soft-shadow sm:p-7 md:p-8">
        <div aria-hidden className="absolute -end-12 -top-12 h-40 w-40 rounded-full bg-brass/10 blur-2xl" />
        <div className="relative flex items-center gap-4 sm:gap-5">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-brass/15 bg-brass/10 sm:h-16 sm:w-16">
            {avatarUrl ? (
              // Auth-provider avatars have dynamic hosts, so a plain img avoids
              // adding a broad remoteImages allowlist to Next config.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-lg font-black text-brass">
                {initials(name)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-brass">
              <Sparkles aria-hidden className="h-4 w-4" />
              <span className="text-xs font-semibold">{email}</span>
            </div>
            <h1 id="student-dashboard-title" className="font-display text-xl font-black leading-tight sm:text-2xl">
              {labels.welcome}
            </h1>
            <p className="mt-2 text-sm text-steel sm:text-base">{labels.sub}</p>
          </div>
        </div>
      </div>

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
      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="surface-card p-5 soft-shadow sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">{labels.progress}</p>
              <h2 className="font-display text-lg font-black sm:text-xl">{courseName}</h2>
            </div>
            <div className="text-end">
              <p className="figure text-2xl font-medium text-brass">{percentage}%</p>
              <p className="text-xs text-steel">{labels.completed}</p>
            </div>
          </div>

          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-ink/[0.08]" aria-label={`${percentage}%`}>
            <div
              className="h-full rounded-full bg-brass transition-[width] duration-700 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-steel sm:text-sm">
            <span><strong className="figure text-ink">{completed} / {total}</strong> {labels.lessonsCompleted}</span>
            <span><strong className="figure text-ink">{remaining}</strong> {labels.remaining}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-ink/10 bg-white p-3 sm:p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-brass/10 text-brass">
                <Icon aria-hidden className="h-4 w-4" />
              </div>
              <p className="figure text-base font-medium text-ink sm:text-lg">{value}</p>
              <p className="mt-1 text-[0.68rem] leading-snug text-steel sm:text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="surface-card overflow-hidden soft-shadow">
          <div className="grid sm:grid-cols-[11rem_1fr]">
            <div className="relative min-h-40 bg-ink sm:min-h-full">
              {image ? (
                // See avatar note above; these URLs are configured by admins.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
              ) : (
                <div className="absolute inset-0 brand-grid bg-brass/5" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
              <PlayCircle aria-hidden className="absolute bottom-4 start-4 h-9 w-9 text-white" />
            </div>
            <div className="p-5 sm:p-6">
              <p className="label">{labels.continue}</p>
              <h2 className="font-display text-lg font-black">{courseName}</h2>
              {continueModule && (
                <p className="mt-2 line-clamp-2 text-sm text-steel">
                  {labels.lastLesson}: <span className="text-ink">{ar ? continueModule.title_ar : continueModule.title_en}</span>
                </p>
              )}
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
                <div className="h-full rounded-full bg-brass" style={{ width: `${percentage}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-steel">
                <span>{percentage}%</span>
                <span>{completed} / {total} {labels.lessons}</span>
              </div>
              {continueModule && (
                <Link href={continueHref} className="btn-primary mt-5 w-full justify-center sm:w-auto">
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
              <p className="label">{labels.recent}</p>
              <h2 className="font-display text-lg font-black">{labels.recent}</h2>
            </div>
            <RotateCcw aria-hidden className="h-5 w-5 text-brass" />
          </div>

          {activities.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-ink/[0.035] p-4 text-sm leading-relaxed text-steel">{labels.noActivity}</p>
          ) : (
            <ol className="mt-5 space-y-1">
              {activities.slice(0, 6).map((activity, index) => {
                const Icon = activity.type === 'completed'
                  ? CheckCircle2
                  : activity.type === 'reviewed'
                    ? FileCheck2
                    : activity.type === 'submitted'
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
        </>
      )}
    </section>
  );
}
