'use client';
import { useRef } from 'react';
import Link from 'next/link';

/**
 * A CTA that leans slightly toward the cursor as it approaches.
 *
 * Deliberately subtle — 6px of travel. Enough to register as responsive,
 * not enough to make the button feel like it is dodging the click. Disabled
 * for touch and for reduced-motion.
 */
export default function MagneticButton({
  href,
  children,
  className = '',
  strength = 6
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const frame = useRef<number>();

  const move = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    if (e.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
    });
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.transform = '';
  };

  return (
    <Link
      ref={ref}
      href={href}
      onPointerMove={move}
      onPointerLeave={reset}
      className={`transition-transform duration-200 ease-out will-change-transform ${className}`}
    >
      {children}
    </Link>
  );
}
