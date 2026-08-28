'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * The global "something is happening" indicator.
 *
 * WHY THE OLD ONE WAS INVISIBLE
 *
 * It was two pixels of brass at the very top of a cream page, and the site is
 * fast enough that it often lived for under a second. It was doing its job and
 * nobody could see it. Three things changed:
 *
 *  1. Height 2px -> 3px, plus a soft glow and a moving sheen, so it reads as
 *     motion in peripheral vision rather than a thin static line.
 *  2. It now also watches the SEARCH PARAMS, not just the pathname. The admin
 *     panel navigates by `?tab=` and `?student=` — same pathname every time —
 *     so the bar used to start and then never get told it had arrived.
 *  3. It listens for form submissions as well as link clicks. Every admin save
 *     is a form post to a server action, and those produced no page-level
 *     feedback whatsoever.
 *
 * There is also a safety timer. A navigation that is cancelled (a link to the
 * page you are already on, a download, a blocked redirect) would otherwise
 * leave the bar running forever, which is worse than no bar at all.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    setActive(true);
    if (timeout.current) clearTimeout(timeout.current);
    // Nothing on this site legitimately takes 15s. If we get there, the
    // navigation died somewhere and the bar should stop lying.
    timeout.current = setTimeout(() => setActive(false), 15_000);
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // A modified click opens a new tab; this tab is not navigating.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement)?.closest?.('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;

      // External links leave the app entirely — the bar would be pointless.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Same URL including the query string: nothing will change.
        if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      } catch {
        return;
      }

      start();
    };

    /*
     * Form submissions. `submit` does not bubble in the ordinary sense but it
     * DOES fire during the capture phase on document, which is why the third
     * argument is true. Without this, every server action in the admin panel
     * ran in complete silence.
     */
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.hasAttribute('data-no-progress')) return;
      start();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit, true);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  /*
   * Arrival. Watching searchParams as well as pathname is what makes this work
   * inside the admin panel, where every tab is the same route with a different
   * query string.
   */
  useEffect(() => {
    setActive(false);
    if (timeout.current) clearTimeout(timeout.current);
  }, [pathname, searchParams]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <div className="h-full w-full origin-left animate-[progress_1.4s_ease-out_forwards] bg-brass shadow-[0_0_10px_1px_rgba(75,64,255,0.6)]">
        {/* A sheen travelling along the filled part, so the bar still reads as
            active even while it sits at 95% waiting for a slow response. */}
        <div className="h-full w-1/3 animate-[sheen_1.1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
