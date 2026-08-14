'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import LogoAssemble from './LogoAssemble';

/**
 * Decides what stands in the hero, and when.
 *
 * The flat SVG mark renders immediately — it is part of the server HTML, so
 * the hero is never empty and the text is never held up. Three.js (~150 KB)
 * is only requested AFTER the window load event, meaning it cannot compete
 * with the fonts, CSS or the rest of the page for bandwidth.
 *
 * When the 3D model is ready it cross-fades in. If Three.js fails to load, or
 * WebGL is unavailable, or the visitor prefers reduced motion, the SVG simply
 * stays — no error state, no layout shift.
 */
const Logo3D = dynamic(() => import('./Logo3D'), {
  ssr: false,
  loading: () => null
});

export default function HeroMark({ className = '' }: { className?: string }) {
  const [load3D, setLoad3D] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // WebGL check before pulling in the library at all.
    const canvas = document.createElement('canvas');
    const webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (!webgl) return;

    const start = () => {
      // One more frame after load so the browser can paint the page first.
      requestAnimationFrame(() => setLoad3D(true));
    };

    if (document.readyState === 'complete') start();
    else {
      window.addEventListener('load', start, { once: true });
      return () => window.removeEventListener('load', start);
    }
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Always present: the flat mark, in the server HTML. */}
      <LogoAssemble
        className={`h-full w-auto text-ink transition-opacity duration-700 ${load3D ? 'opacity-0' : 'opacity-100'}`}
      />

      {load3D && (
        <div className="absolute inset-0">
          <Logo3D className="h-full w-full" />
        </div>
      )}
    </div>
  );
}
