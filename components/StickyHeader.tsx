'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Wraps the header so it can be full-size at the top of the page and compact
 * once you scroll — the shrink-on-scroll behaviour.
 *
 * WHY A SENTINEL AND NOT A SCROLL LISTENER
 * A `scroll` listener fires on every frame of every scroll, on every page, and
 * each call reads `window.scrollY` — a layout read that can force the browser
 * to recalculate style mid-scroll. On a long marketing page that is the
 * classic cause of scroll jank on mid-range Androids, which is most of this
 * audience.
 *
 * Instead there is a 24px invisible marker at the very top of the document.
 * The browser tells US, off the main thread, when it leaves the viewport. Two
 * callbacks per page instead of hundreds.
 *
 * The marker sits inside a zero-height box and is absolutely positioned, so it
 * occupies no space and cannot shift the layout it measures.
 *
 * State lives here; the ACTUAL styling is `data-scrolled` in globals.css. That
 * keeps Header a Server Component — it reads the session, and turning it into
 * a Client Component to watch a scroll position would ship the auth logic to
 * the browser for no reason.
 */
export default function StickyHeader({ children }: { children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    // Older browsers without IntersectionObserver simply keep the full-size
    // header. Nothing breaks; it just doesn't shrink.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div className="relative h-0">
        <div ref={sentinel} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6" />
      </div>
      <div data-scrolled={scrolled}>{children}</div>
    </>
  );
}
