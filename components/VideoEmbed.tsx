'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Click-to-play video facade.
 *
 * Paid course lessons may pass a moduleId. In that case we record the amount
 * of time the lesson player stays active while the tab is visible. The player
 * itself lives in a cross-origin Drive/Bunny iframe, so the browser cannot
 * safely inspect its internal playhead; this is intentionally "active viewing
 * time", not a fabricated exact video position.
 */
export default function VideoEmbed({
  src,
  title,
  poster,
  moduleId
}: {
  src: string | null;
  title: string;
  poster?: string | null;
  moduleId?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const supabase = useMemo(() => (moduleId ? createClient() : null), [moduleId]);
  const pendingSeconds = useRef(0);
  const lastTick = useRef<number | null>(null);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (!moduleId || !supabase || flushing.current) return;
    const seconds = Math.floor(pendingSeconds.current);
    if (seconds <= 0) return;

    pendingSeconds.current -= seconds;
    flushing.current = true;
    const { error } = await supabase.rpc('record_lesson_watch', {
      p_module_id: moduleId,
      p_seconds: seconds
    });
    flushing.current = false;

    // Put the unsent seconds back so a transient network error does not erase
    // them from this viewing session.
    if (error) {
      pendingSeconds.current += seconds;
      if (process.env.NODE_ENV === 'development') {
        console.warn('[progress] watch sync failed:', error.message);
      }
    }
  }, [moduleId, supabase]);

  useEffect(() => {
    if (!playing || !moduleId || !supabase) return;

    // Create the progress row immediately, even if the student watches for
    // less than the periodic flush interval.
    supabase.rpc('record_lesson_watch', { p_module_id: moduleId, p_seconds: 0 });
    lastTick.current = Date.now();

    const tick = () => {
      const now = Date.now();
      if (lastTick.current !== null && document.visibilityState === 'visible') {
        pendingSeconds.current += Math.max(0, Math.min((now - lastTick.current) / 1000, 35));
      }
      lastTick.current = now;
    };

    const interval = window.setInterval(() => {
      tick();
      if (pendingSeconds.current >= 30) void flush();
    }, 15000);

    const onVisibility = () => {
      tick();
      if (document.visibilityState !== 'visible') void flush();
    };

    window.addEventListener('pagehide', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      tick();
      void flush();
      window.removeEventListener('pagehide', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush, moduleId, playing, supabase]);

  const isDrive = !!src && src.includes('drive.google.com');
  const frame =
    'relative aspect-video w-full overflow-hidden rounded-2xl bg-ink ring-1 ring-ink/10 shadow-[0_24px_60px_-24px_rgba(26,26,26,0.45)]';

  if (!src) {
    return (
      <div className={`${frame} flex items-center justify-center`}>
        <span className="text-sm text-white/50">—</span>
      </div>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={title}
        className={`${frame} group flex items-center justify-center`}
      >
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain opacity-70 transition duration-500 group-hover:opacity-90"
          />
        )}

        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'radial-gradient(closest-side, rgba(26,26,26,0.55), rgba(26,26,26,0) 70%)' }}
        />

        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition duration-300 group-hover:scale-110 group-hover:bg-brass">
          <Play
            aria-hidden
            className="ms-0.5 h-6 w-6 text-ink transition group-hover:text-white"
            strokeWidth={2}
            fill="currentColor"
          />
        </span>
      </button>
    );
  }

  return (
    <div className={frame}>
      <iframe
        src={src}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
      />

      {isDrive && (
        <span
          aria-hidden
          onClick={(e: React.MouseEvent<HTMLSpanElement>) => e.preventDefault()}
          className="pointer-events-auto absolute right-0 top-0 h-12 w-14 cursor-default sm:h-14 sm:w-16"
          style={{
            background:
              'radial-gradient(120% 120% at 100% 0%, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.92) 45%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0) 100%)'
          }}
        />
      )}
    </div>
  );
}
