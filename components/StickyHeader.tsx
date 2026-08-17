'use client';
import { useEffect, useRef } from 'react';

/**
 * Watches whether the page has been scrolled, and writes the answer to
 * <html data-scrolled="true|false">. The header's appearance is driven from
 * that attribute in globals.css.
 *
 * WHY THE FLAG GOES ON <html> AND NOT ON A WRAPPER
 * The first version of this wrapped the header in a <div data-scrolled>. That
 * broke the sticky header completely: a `position: sticky` element only sticks
 * inside its OWN PARENT's box, and that wrapper was exactly as tall as the
 * header itself. So the header stuck for about sixty pixels and then scrolled
 * away with the page — which is the "it disappears when I scroll" bug.
 *
 * Putting the flag on the document element means the header keeps <body> as
 * its layout parent and can stick for the whole page, while the CSS still gets
 * the state it needs. No wrapper, no containing block, nothing to break.
 *
 * WHY A SENTINEL AND NOT A SCROLL LISTENER
 * A scroll listener fires on every frame and reads scrollY, which is a layout
 * read that can force style recalculation mid-scroll — the usual cause of
 * scroll jank on mid-range Androids. A 24px marker at the top of the document
 * lets the browser tell us instead: two callbacks per page, off the main
 * thread.
 */
export default function StickyHeader() {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    const root = document.documentElement;
    if (!el) return;

    // No IntersectionObserver: leave the header in its full-width state.
    // Nothing breaks, it just doesn't collapse into the pill.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => root.setAttribute('data-scrolled', String(!entry.isIntersecting)),
      { threshold: 0 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.removeAttribute('data-scrolled');
    };
  }, []);

  // Zero-height box so the marker takes no space and cannot shift the layout
  // it is measuring.
  return (
    <div className="relative h-0">
      <div ref={sentinel} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6" />
    </div>
  );
}
