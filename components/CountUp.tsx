'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Animates between two numbers instead of snapping.
 *
 * Used when the currency toggle changes a price: a jump reads as a page
 * reload, a short count reads as the same product being re-quoted.
 */
export default function CountUp({
  value,
  format,
  duration = 420
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const frame = useRef<number>();

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      from.current = value;
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // ease-out cubic: fast then settling, like a dial coming to rest
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(origin + delta * eased);
      if (p < 1) frame.current = requestAnimationFrame(step);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [value, duration]);

  return <span className="figure">{format(Math.round(display))}</span>;
}
