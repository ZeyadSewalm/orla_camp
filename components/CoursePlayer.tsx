'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Lock,
  PartyPopper,
  Play,
  PlayCircle,
  Square,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { lh } from '@/lib/href';
import VideoEmbed from '@/components/VideoEmbed';
import UploadCaseFile from '@/components/UploadCaseFile';
import AssignmentTask from '@/components/AssignmentTask';
import type { Assignment, AssignmentSubmission } from '@/lib/types';

export type CourseLessonVM = {
  id: string;
  index: number;
  title: string;
  description: string | null;
  block: string | null;
  durationMinutes: number | null;
  unlocked: boolean;
  /** Locked because the signed-in student's package doesn't include this lesson (as opposed to sequential order). */
  tierBlocked: boolean;
  isFreePreview: boolean;
  src: string | null;
  poster: string | null;
  completed: boolean;
  watchSeconds: number;
  checklistUrl: string | null;
  previousTitle: string | null;
  assignments: Assignment[];
  submissionsByAssignment: Record<string, AssignmentSubmission | null>;
};

/**
 * Udemy-style course player: a sidebar curriculum list on one side, the
 * active lesson's video and work on the other.
 *
 * Lock state, video URLs and posters are exactly what the server decided —
 * this component never invents a src for a lesson the server marked locked.
 * A lesson unlocking mid-session (after a completion + refresh) is picked up
 * from the new `lessons` prop the next time the server re-renders the page.
 */
export default function CoursePlayer({
  locale,
  userId,
  lessons,
  initialActiveId
}: {
  locale: string;
  userId: string;
  lessons: CourseLessonVM[];
  initialActiveId: string;
}) {
  const ar = locale === 'ar';
  const t = useTranslations('course');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [activeId, setActiveId] = useState(initialActiveId);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lessons.map((l) => [l.id, l.completed]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justDoneId, setJustDoneId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const pendingAdvanceId = useRef<string | null>(null);
  const advancedOnceRef = useRef<Set<string>>(new Set());

  // Server props are the source of truth for completion; keep local state in
  // sync so a router.refresh() (e.g. after an assignment upload) doesn't get
  // masked by stale optimistic state.
  useEffect(() => {
    setCompletedMap(Object.fromEntries(lessons.map((l) => [l.id, l.completed])));
  }, [lessons]);

  const lessonById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);

  // Group into sections by `block`, preserving first-seen order.
  const sections = useMemo(() => {
    const map = new Map<string, CourseLessonVM[]>();
    for (const lesson of lessons) {
      const key = lesson.block?.trim() || '__general__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lesson);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      title: key === '__general__' ? null : key,
      items
    }));
  }, [lessons]);

  // Read a #lesson-<id> hash on first load (links from the dashboard / my
  // submissions point here) and open the section it lives in.
  useEffect(() => {
    const hash = window.location.hash.replace('#lesson-', '');
    const target = hash ? lessonById.get(hash) : undefined;
    if (target?.unlocked) setActiveId(target.id);
  }, [lessonById]);

  useEffect(() => {
    const active = lessonById.get(activeId);
    const key = active?.block?.trim() || '__general__';
    setOpenSections((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, [activeId, lessonById]);

  // Lock background scroll while the mobile curriculum sheet is open.
  useEffect(() => {
    if (!mobileListOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileListOpen]);

  // Once a just-completed lesson's follow-up unlocks (via router.refresh()),
  // jump to it and scroll the player back into view.
  useEffect(() => {
    const pendingId = pendingAdvanceId.current;
    if (!pendingId) return;
    const next = lessonById.get(pendingId);
    if (next?.unlocked) {
      pendingAdvanceId.current = null;
      setActiveId(next.id);
      mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [lessons, lessonById]);

  // Locked lessons are selectable too — clicking one shows the lock message
  // and names the lesson to finish first, instead of a dead button that gives
  // no feedback at all. It just never gets a video src, same as before.
  const selectLesson = useCallback((lesson: CourseLessonVM) => {
    setActiveId(lesson.id);
    if (lesson.unlocked) {
      try {
        window.history.replaceState(null, '', `#lesson-${lesson.id}`);
      } catch {
        // Non-browser environment or blocked — cosmetic only.
      }
    }
    mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setCompletion = useCallback(
    async (moduleId: string, value: boolean, { advance }: { advance: boolean }) => {
      setCompletedMap((prev) => ({ ...prev, [moduleId]: value }));
      if (value) {
        setJustDoneId(moduleId);
        window.setTimeout(() => setJustDoneId((cur) => (cur === moduleId ? null : cur)), 1200);
      }
      if (advance && value) {
        const list = lessons;
        const idx = list.findIndex((l) => l.id === moduleId);
        const next = idx >= 0 ? list[idx + 1] : undefined;
        if (next) {
          if (next.unlocked) {
            selectLesson(next);
          } else {
            pendingAdvanceId.current = next.id;
          }
        }
      }

      setBusyId(moduleId);
      const { error } = await supabase.rpc('set_lesson_complete', {
        p_module_id: moduleId,
        p_completed: value
      });
      setBusyId(null);

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[progress] completion sync failed:', error.message);
        }
        // Roll back optimistic state — the server never recorded it.
        setCompletedMap((prev) => ({ ...prev, [moduleId]: !value }));
        return;
      }
      router.refresh();
    },
    [lessons, router, selectLesson, supabase]
  );

  const handleAutoEnded = useCallback(
    (moduleId: string) => {
      if (completedMap[moduleId] || advancedOnceRef.current.has(moduleId)) return;
      advancedOnceRef.current.add(moduleId);
      void setCompletion(moduleId, true, { advance: true });
    },
    [completedMap, setCompletion]
  );

  const active = lessonById.get(activeId) ?? lessons[0];
  const totalCount = lessons.length;
  const doneCount = lessons.filter((l) => completedMap[l.id]).length;
  const allDone = totalCount > 0 && doneCount === totalCount;
  const activeIndex = lessons.findIndex((l) => l.id === active.id);
  const nextLesson = activeIndex >= 0 ? lessons[activeIndex + 1] : undefined;

  function formatDuration(minutes: number | null) {
    if (!minutes || minutes <= 0) return null;
    return `${minutes} ${t('min')}`;
  }

  const totalMinutes = lessons.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);
  const totalLengthLabel =
    totalMinutes > 0
      ? totalMinutes >= 60
        ? `${Math.floor(totalMinutes / 60)}${t('hourShort')}${totalMinutes % 60}${t('min')}`
        : `${totalMinutes}${t('min')}`
      : null;
  const lecturesLabel = `${totalCount} ${totalCount === 1 ? t('lecture') : t('lectures')}`;

  // Shared curriculum list markup — used by both the desktop sticky sidebar
  // and the mobile bottom-sheet, so the two never drift apart. `onSelect`
  // lets the mobile sheet close itself right after a lesson is picked.
  const renderSections = (onSelect: (lesson: CourseLessonVM) => void) =>
    sections.map((section) => {
      const sectionDone = section.items.filter((l) => completedMap[l.id]).length;
      const isOpen = openSections[section.key] ?? false;
      return (
        <div key={section.key} className="border-b border-ink/10 last:border-0">
          {section.title && (
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 bg-ink/[0.02] px-4 py-3 text-start sm:px-5"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{section.title}</span>
                <span className="figure text-[0.7rem] text-steel">
                  {t('sectionProgress', { done: sectionDone, total: section.items.length })}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 shrink-0 text-steel transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {(isOpen || !section.title) && (
            <ul>
              {section.items.map((lesson) => {
                const isActive = lesson.id === active.id;
                const done = !!completedMap[lesson.id];
                const inProgress = !done && lesson.unlocked && lesson.watchSeconds > 0;
                const duration = formatDuration(lesson.durationMinutes);
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(lesson)}
                      aria-disabled={!lesson.unlocked}
                      aria-current={isActive ? 'true' : undefined}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition sm:px-5 ${
                        isActive ? 'bg-brass/[0.07]' : lesson.unlocked ? 'hover:bg-ink/[0.025]' : 'opacity-60 hover:bg-ink/[0.015]'
                      } ${isActive ? 'border-l-2 border-brass' : 'border-l-2 border-transparent'}`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {!lesson.unlocked ? (
                          <Lock aria-hidden className="h-4 w-4 text-steel" />
                        ) : done ? (
                          <CheckSquare aria-hidden className={`h-4 w-4 text-brass ${justDoneId === lesson.id ? 'check-pop' : ''}`} strokeWidth={2} />
                        ) : (
                          <Square aria-hidden className={`h-4 w-4 ${inProgress ? 'text-brass' : 'text-line'}`} strokeWidth={inProgress ? 2 : 1.5} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${isActive ? 'font-semibold text-ink' : done ? 'text-steel' : 'text-ink'}`}>
                          {lesson.index}. {lesson.title}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[0.7rem] text-steel">
                            {duration && (
                              <span className="inline-flex items-center gap-1">
                                <Play aria-hidden className="h-3 w-3" strokeWidth={1.5} />
                                {duration}
                              </span>
                            )}
                            {lesson.isFreePreview && (
                              <span className="rounded-full bg-brass/10 px-1.5 py-0.5 font-semibold text-brass">
                                {t('freePreview')}
                              </span>
                            )}
                          </span>
                          {lesson.unlocked && lesson.checklistUrl && (
                            <a
                              href={lesson.checklistUrl}
                              target="_blank"
                              rel="noopener"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink/10 px-2 py-0.5 text-[0.65rem] text-steel transition hover:border-ink/30 hover:text-ink"
                            >
                              <Download aria-hidden className="h-3 w-3" />
                              {t('resources')}
                            </a>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
    });

  return (
    <>
    {/*
     * dir="ltr" HERE ON PURPOSE.
     *
     * Udemy's own course player keeps video-left / curriculum-right even for
     * Arabic courses — the player chrome doesn't mirror, only the lesson text
     * inside it does (Arabic still shapes and reads right-to-left on its own,
     * that's Unicode bidi, not this attribute). Forcing ltr just on this grid
     * pins the two panes to that same fixed arrangement instead of the RTL
     * auto-mirroring the rest of the site correctly uses everywhere else.
     */}
    <div dir="ltr" className={`grid gap-6 lg:items-start lg:gap-8 ${sidebarOpen ? 'lg:grid-cols-[1fr_23rem]' : 'lg:grid-cols-[1fr_auto]'}`}>
      {/* ---------------------------------------------------------------- */}
      {/* MAIN: active lesson                                              */}
      {/* ---------------------------------------------------------------- */}
      <div ref={mainRef} className="min-w-0 scroll-mt-24">
        <div className="overflow-hidden bg-white sm:rounded-[2rem] sm:border sm:border-ink/10 sm:soft-shadow">
          {!active.unlocked ? (
            <div className="-mx-4 flex aspect-[4/3] w-[calc(100%+2rem)] flex-col items-center justify-center gap-3 bg-paper px-6 text-center sm:mx-0 sm:aspect-video sm:w-full sm:rounded-t-[2rem]">
              <Lock aria-hidden className="h-7 w-7 text-steel" />
              <p className="text-sm font-semibold">{active.tierBlocked ? t('tierLockedLesson') : t('lockedLesson')}</p>
              {active.tierBlocked ? (
                <>
                  <p className="max-w-sm text-xs leading-relaxed text-steel">{t('tierLockedHint')}</p>
                  <Link href={lh(locale, '/pricing')} className="btn-quiet text-xs">
                    {t('viewPlans')}
                  </Link>
                </>
              ) : (
                active.previousTitle && (
                  <p className="max-w-sm text-xs leading-relaxed text-steel">
                    {t('lockedHint', { previous: active.previousTitle })}
                  </p>
                )
              )}
            </div>
          ) : (
            <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full">
              <VideoEmbed
                key={active.id}
                src={active.src}
                poster={active.poster}
                title={active.title}
                moduleId={active.id}
                durationMinutes={active.durationMinutes}
                initialWatchSeconds={active.watchSeconds}
                edgeToEdge
                onEnded={() => handleAutoEnded(active.id)}
              />
            </div>
          )}

          <div className="p-4 sm:p-6 md:p-8">
            <div className="flex items-start gap-3">
              <span className="figure flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-xs font-medium text-brass">
                {String(active.index).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-black sm:text-xl">{active.title}</h3>
                {active.description && (
                  <p className="mt-2 text-sm leading-relaxed text-steel">{active.description}</p>
                )}
              </div>
            </div>

            {activeIndex > 0 && (
              <button
                type="button"
                onClick={() => selectLesson(lessons[activeIndex - 1])}
                className="mt-3 inline-flex items-center gap-1 text-xs text-steel transition hover:text-ink"
              >
                <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
                <span className="truncate">{lessons[activeIndex - 1].title}</span>
              </button>
            )}

            {active.unlocked && (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {active.checklistUrl && (
                    <a href={active.checklistUrl} target="_blank" rel="noopener" className="btn-quiet text-sm">
                      <Download aria-hidden className="h-4 w-4" />
                      {t('checklist')}
                    </a>
                  )}
                  <UploadCaseFile moduleId={active.id} userId={userId} />
                  <button
                    type="button"
                    disabled={busyId === active.id}
                    aria-pressed={!!completedMap[active.id]}
                    onClick={() =>
                      setCompletion(active.id, !completedMap[active.id], { advance: !completedMap[active.id] })
                    }
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs transition disabled:opacity-60 ${
                      completedMap[active.id]
                        ? 'border-brass text-brass'
                        : 'border-line text-steel hover:border-ink hover:text-ink'
                    } ${justDoneId === active.id ? 'celebrate' : ''}`}
                  >
                    {completedMap[active.id] ? (
                      <CheckSquare aria-hidden className={`h-4 w-4 ${justDoneId === active.id ? 'check-pop' : ''}`} strokeWidth={2} />
                    ) : (
                      <Square aria-hidden className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    {completedMap[active.id] ? t('markedDone') : t('markDone')}
                  </button>
                </div>

                <p className="mt-3 text-[0.7rem] leading-relaxed text-steel">
                  {active.src?.includes('mediadelivery.net') || (active.durationMinutes ?? 0) > 0
                    ? t('autoCompleteNote')
                    : t('manualCompleteHint')}
                </p>

                {active.assignments.map((assignment) => (
                  <AssignmentTask
                    key={assignment.id}
                    assignment={assignment}
                    latestSubmission={active.submissionsByAssignment[assignment.id] ?? null}
                    locale={locale}
                  />
                ))}
              </>
            )}

            {active.unlocked && nextLesson && (
              <button
                type="button"
                onClick={() => selectLesson(nextLesson)}
                aria-disabled={!nextLesson.unlocked}
                className={`mt-6 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition ${
                  nextLesson.unlocked
                    ? 'border-ink/10 bg-ink/[0.025] hover:border-brass/30 hover:bg-brass/5'
                    : 'border-dashed border-ink/10 bg-ink/[0.015] opacity-70'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brass/10 text-brass">
                  {nextLesson.unlocked ? (
                    <PlayCircle aria-hidden className="h-4 w-4" />
                  ) : (
                    <Lock aria-hidden className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-steel">
                    {t('upNext')}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-semibold text-ink">{nextLesson.title}</span>
                </span>
              </button>
            )}

            {active.unlocked && !nextLesson && allDone && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brass/20 bg-brass/5 p-4">
                <PartyPopper aria-hidden className="h-5 w-5 shrink-0 text-brass" />
                <div>
                  <p className="text-sm font-semibold text-ink">{t('courseCompleteTitle')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-steel">{t('courseCompleteBody')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* SIDEBAR: curriculum                                              */}
      {/* ---------------------------------------------------------------- */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label={t('showSidebar')}
          className="hidden h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-ink/10 bg-white text-steel shadow-sm transition hover:text-ink lg:sticky lg:top-6 lg:flex"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
      )}

      <aside className={`lg:sticky lg:top-6 ${sidebarOpen ? '' : 'hidden lg:hidden'}`}>
        <div className="overflow-hidden rounded-[1.75rem] border border-ink/10 bg-white soft-shadow">
          <div className="border-b border-ink/10 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-sm font-black sm:text-base">{t('courseContent')}</h3>
              <div className="flex shrink-0 items-center gap-2">
                <span className="figure text-xs text-steel">{t('sectionProgress', { done: doneCount, total: totalCount })}</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label={t('hideSidebar')}
                  className="hidden h-6 w-6 items-center justify-center rounded-full text-steel transition hover:bg-ink/5 hover:text-ink lg:inline-flex"
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-[0.7rem] text-steel">
              {lecturesLabel}
              {totalLengthLabel && (
                <span dir="ltr" className="figure">
                  {' '}
                  • {totalLengthLabel}
                </span>
              )}
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
              <div
                className="h-full rounded-full bg-brass transition-[width] duration-500"
                style={{ width: `${totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="max-h-[36rem] overflow-y-auto sm:max-h-[calc(100vh-11rem)]">
            {renderSections(selectLesson)}
          </div>
        </div>
      </aside>
    </div>

    {/* ------------------------------------------------------------------ */}
    {/* MOBILE: floating "course content" quick-access + bottom sheet       */}
    {/* The desktop sidebar sits far below the fold on phones (video +      */}
    {/* description + buttons + assignments all come first), so this gives */}
    {/* a one-tap shortcut to the curriculum from anywhere on the page.     */}
    {/* ------------------------------------------------------------------ */}
    <button
      type="button"
      onClick={() => setMobileListOpen(true)}
      className="fixed bottom-5 end-5 z-30 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-ink/25 transition active:scale-95 lg:hidden"
    >
      <List aria-hidden className="h-4 w-4" />
      {t('courseContent')}
      <span className="figure rounded-full bg-white/15 px-1.5 py-0.5 text-[0.65rem]">
        {doneCount}/{totalCount}
      </span>
    </button>

    {mobileListOpen && (
      <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label={t('hideSidebar')}
          onClick={() => setMobileListOpen(false)}
          className="absolute inset-0 bg-ink/50"
        />
        <div dir="ltr" className="relative flex max-h-[80vh] flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-ink/10 p-4 sm:p-5">
            <div className="min-w-0">
              <h3 className="font-display text-sm font-black sm:text-base">{t('courseContent')}</h3>
              <p className="mt-1 text-[0.7rem] text-steel">
                {lecturesLabel}
                {totalLengthLabel && (
                  <span dir="ltr" className="figure">
                    {' '}
                    • {totalLengthLabel}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileListOpen(false)}
              aria-label={t('hideSidebar')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-steel transition hover:bg-ink/5 hover:text-ink"
            >
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 pt-3 sm:px-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
              <div
                className="h-full rounded-full bg-brass transition-[width] duration-500"
                style={{ width: `${totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {renderSections((lesson) => {
              selectLesson(lesson);
              setMobileListOpen(false);
            })}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
