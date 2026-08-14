'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Thin accent bar across the top of the page during navigation.
 *
 * loading.tsx handles the content area, but a click on a nav link still has a
 * moment before anything visibly changes. This fires the instant a link is
 * clicked so the interface always feels like it responded immediately.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  // Any click on an internal link starts the bar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || link.target === '_blank') return;
      if (href === pathname) return;

      setActive(true);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname]);

  // The new route rendered — pathname changed, so we're done.
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-transparent" role="status" aria-live="polite">
      <div className="h-full w-full origin-left animate-[progress_1.4s_ease-out_forwards] bg-brass" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
