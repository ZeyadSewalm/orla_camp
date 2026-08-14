'use client';
import { useRef } from 'react';

/**
 * Mouse-tracking 3D tilt. Wraps a pricing card so it reads as a physical
 * object rather than a rectangle.
 *
 * Written against the DOM directly instead of React state: a tilt driven by
 * setState would re-render the card on every mouse move. Here the only work
 * per frame is one transform string, and the browser composites it on the GPU.
 */
export default function TiltCard({
  children,
  className = '',
  max = 6
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number>();

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (e.pointerType !== 'mouse') return; // never on touch

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;

      el.style.transform =
        `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
      // The shadow moves opposite the tilt, as a real light source would.
      el.style.boxShadow = `${(-px * 22).toFixed(0)}px ${(18 - py * 10).toFixed(0)}px 38px rgba(16,17,19,0.16)`;
    });
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.transform = '';
    el.style.boxShadow = '';
  };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={reset}
      className={`transition-[transform,box-shadow] duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}
