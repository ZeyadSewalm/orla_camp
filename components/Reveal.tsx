'use client';
import { useEffect, useRef, type ReactNode, type ElementType } from 'react';

/**
 * Fades a section up as it enters the viewport, once.
 *
 * This is the animation that actually changes how a page feels. A rotating
 * logo is decoration; content arriving as you reach it is pacing — it makes a
 * long sales page read as a sequence of points instead of one wall.
 *
 * IntersectionObserver, not a scroll listener, and the observer unobserves
 * each element after it fires. On a page with twelve sections that is twelve
 * callbacks in total, then nothing.
 *
 * The element starts visible in the markup and is only hidden once JS
 * confirms it can animate. If the script fails, is blocked, or the browser is
 * old, the content is simply there — it never gets stuck invisible, which is
 * the standard way scroll-reveal breaks a page.
 */
export default function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = ''
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    el.dataset.reveal = 'pending';
    if (delay) el.style.transitionDelay = `${delay}ms`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = 'in';
        observer.unobserve(el);
      },
      // Fires slightly before the element reaches the fold, so the motion has
      // finished by the time it is properly in view rather than animating
      // under the reader's eyes.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
