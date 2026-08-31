'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Loads Bunny Stream's player.js bridge exactly once per page, however many
 * players are mounted.
 *
 * This is what turns the Bunny iframe from a black box into something we can
 * ask "did it finish?" — without it, a cross-origin <iframe> tells the parent
 * page nothing about play state at all.
 */
let playerJsPromise: Promise<void> | null = null;
function loadPlayerJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as { playerjs?: unknown }).playerjs) return Promise.resolve();
  if (playerJsPromise) return playerJsPromise;

  playerJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-playerjs]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('playerjs_failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = '//assets.mediadelivery.net/playerjs/playerjs-latest.min.js';
    script.async = true;
    script.dataset.playerjs = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('playerjs_failed'));
    document.head.appendChild(script);
  });
  return playerJsPromise;
}

type BunnyPlayer = {
  on: (event: string, cb: (data?: unknown) => void) => void;
  off?: (event: string, cb?: (data?: unknown) => void) => void;
  setCurrentTime?: (seconds: number) => void;
};

/** Where we remember "you were at 4:12" for a Bunny lesson, client-side only. */
const resumeKeyFor = (moduleId: string) => `bunny-resume:${moduleId}`;

/**
 * Click-to-play video facade.
 *
 * Paid course lessons may pass a moduleId. In that case we record the amount
 * of time the lesson player stays active while the tab is visible. The player
 * itself lives in a cross-origin Drive/Bunny iframe, so the browser cannot
 * safely inspect its internal playhead in general; this is intentionally
 * "active viewing time", not a fabricated exact video position.
 *
 * The one exception is Bunny Stream: its embed speaks Player.js over
 * postMessage, so for Bunny lessons `onEnded` fires from the real "ended"
 * event. Drive has no such channel, so for Drive lessons `onEnded` fires from
 * a watch-time heuristic instead (see the threshold below) — close enough to
 * "finished" to auto-advance without pretending to be exact.
 */
export default function VideoEmbed({
  src,
  title,
  poster,
  moduleId,
  durationMinutes,
  onEnded,
  initialWatchSeconds = 0,
  edgeToEdge = false
}: {
  src: string | null;
  title: string;
  poster?: string | null;
  moduleId?: string;
  /** Module length in minutes, used to cap runaway watch-time accrual. */
  durationMinutes?: number | null;
  /** Fires once when the lesson is judged "finished" — real event on Bunny, heuristic on Drive. */
  onEnded?: () => void;
  /** Watch time already recorded for this lesson before this mount, seconds. */
  initialWatchSeconds?: number;
  /** Square corners on phones so the player can run edge-to-edge; rounds again from `sm`. */
  edgeToEdge?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const supabase = useMemo(() => (moduleId ? createClient() : null), [moduleId]);
  const pendingSeconds = useRef(0);
  const lastTick = useRef<number | null>(null);
  const flushing = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const endedFiredRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const isBunny = !!src && src.includes('mediadelivery.net');
  const isDrive = !!src && src.includes('drive.google.com');

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

  /*
   * CAP ON HOW MUCH ONE SITTING CAN LOG.
   *
   * The player is a cross-origin iframe, so we cannot tell when the student
   * pauses — `playing` only ever goes true. A lesson tab left open on a
   * desktop kept accruing seconds all day: the `visibilityState` check stops
   * a BACKGROUND tab, but not a foreground one nobody is watching. Overnight
   * that turns "Total watch time" into a number the student knows is false,
   * which is worse than not showing it.
   *
   * 2x the module's own length is generous for rewinding and re-watching, and
   * still far below an abandoned tab. Where the length is unknown, 3 hours is
   * the ceiling — longer than any lesson here, shorter than a working day.
   */
  const sessionCapSeconds =
    durationMinutes && durationMinutes > 0 ? durationMinutes * 60 * 2 : 3 * 60 * 60;
  const sessionSeconds = useRef(0);

  /*
   * DRIVE "FINISHED" HEURISTIC.
   *
   * There is no ended event to listen for, so once accumulated active watch
   * time (this sitting plus whatever was already on the record) crosses 92%
   * of the lesson's stated length, we call it watched. 92% rather than 100%
   * because "active tab time" always undercounts slightly — a moment glancing
   * at notes, a brief pause — and a threshold that never fires for anyone who
   * actually finished the video is worse than one that fires a few seconds
   * early for someone who watched all of it.
   */
  const maybeFireDriveHeuristic = useCallback(() => {
    if (isBunny || endedFiredRef.current) return;
    if (!durationMinutes || durationMinutes <= 0) return;
    const total = initialWatchSeconds + sessionSeconds.current;
    if (total >= durationMinutes * 60 * 0.92) {
      endedFiredRef.current = true;
      onEndedRef.current?.();
    }
  }, [durationMinutes, initialWatchSeconds, isBunny]);

  useEffect(() => {
    if (!playing || !moduleId || !supabase) return;

    // Create the progress row immediately, even if the student watches for
    // less than the periodic flush interval.
    supabase.rpc('record_lesson_watch', { p_module_id: moduleId, p_seconds: 0 });
    lastTick.current = Date.now();

    const tick = () => {
      const now = Date.now();
      if (lastTick.current !== null && document.visibilityState === 'visible') {
        const elapsed = Math.max(0, Math.min((now - lastTick.current) / 1000, 35));
        // Never log past the cap for this sitting.
        const room = Math.max(0, sessionCapSeconds - sessionSeconds.current);
        const counted = Math.min(elapsed, room);
        sessionSeconds.current += counted;
        pendingSeconds.current += counted;
      }
      lastTick.current = now;
      maybeFireDriveHeuristic();
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
  }, [flush, maybeFireDriveHeuristic, moduleId, playing, supabase]);

  /*
   * BUNNY "ENDED" EVENT + RESUME POSITION, both via Player.js over postMessage.
   *
   * "ended" is the real event — no heuristic needed on Bunny. While we're
   * already wired into the player, `timeupdate` also gives us a genuine
   * playhead position (unlike the Drive "active time" tracking above), so a
   * student who closes the tab mid-lesson comes back to where they left off
   * instead of the start. This is purely a client-side convenience — nothing
   * is sent to the server, so it costs nothing to be wrong and never blocks
   * playback if it fails.
   */
  const lastKnownTime = useRef(0);
  useEffect(() => {
    if (!playing || !isBunny || !iframeRef.current) return;
    let cancelled = false;
    let player: BunnyPlayer | null = null;
    const storageKey = moduleId ? resumeKeyFor(moduleId) : null;

    const persistTimer = storageKey
      ? window.setInterval(() => {
          if (lastKnownTime.current > 5) {
            try {
              window.localStorage.setItem(storageKey, String(Math.floor(lastKnownTime.current)));
            } catch {
              // Private mode — resume just won't work this session.
            }
          }
        }, 5000)
      : undefined;

    loadPlayerJs()
      .then(() => {
        if (cancelled || !iframeRef.current) return;
        const Playerjs = (window as unknown as { playerjs?: { Player: new (el: HTMLIFrameElement) => BunnyPlayer } }).playerjs;
        if (!Playerjs) return;
        player = new Playerjs.Player(iframeRef.current);
        player.on('ready', () => {
          if (cancelled) return;
          if (storageKey) {
            try {
              const saved = Number(window.localStorage.getItem(storageKey));
              if (saved > 5) player?.setCurrentTime?.(saved);
            } catch {
              // No saved position — starts from the top, same as always.
            }
          }
          player?.on('timeupdate', (data) => {
            const seconds = (data as { seconds?: number } | undefined)?.seconds;
            if (typeof seconds === 'number' && Number.isFinite(seconds)) lastKnownTime.current = seconds;
          });
          player?.on('ended', () => {
            if (storageKey) {
              try {
                window.localStorage.removeItem(storageKey);
              } catch {
                // Nothing to clean up then.
              }
            }
            if (!endedFiredRef.current) {
              endedFiredRef.current = true;
              onEndedRef.current?.();
            }
          });
        });
      })
      .catch(() => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[video] playerjs failed to load — falling back to manual completion');
        }
      });

    return () => {
      cancelled = true;
      if (persistTimer) window.clearInterval(persistTimer);
      if (storageKey && lastKnownTime.current > 5) {
        try {
          window.localStorage.setItem(storageKey, String(Math.floor(lastKnownTime.current)));
        } catch {
          // Best-effort only.
        }
      }
      try {
        player?.off?.('ended');
        player?.off?.('ready');
        player?.off?.('timeupdate');
      } catch {
        // Iframe may already be gone.
      }
    };
  }, [isBunny, moduleId, playing]);

  const rounding = edgeToEdge ? 'rounded-none sm:rounded-2xl' : 'rounded-2xl';
  // Drive's own preview UI (title bar, controls, warnings) needs real pixels
  // to render in — at a strict 16:9 on a narrow phone it gets crushed and
  // looks broken. Giving it a taller box on small screens only fixes that
  // without touching the desktop shape at all. Bunny's player is built for
  // small embeds, so it keeps 16:9 everywhere.
  const ratio = isDrive ? 'aspect-[4/3] sm:aspect-video' : 'aspect-video';
  const frame = `relative w-full overflow-hidden bg-ink ring-1 ring-ink/10 shadow-[0_24px_60px_-24px_rgba(26,26,26,0.45)] ${ratio} ${rounding}`;

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
        ref={iframeRef}
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
