'use client';

import { useEffect, useState } from 'react';

/**
 * A drifting, semi-transparent identity label over the player.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It does NOT prevent screen recording. Nothing in a browser does — no CSS, no
 * key handler, no DevTools detection survives a screen recorder, an extension,
 * or a phone pointed at the monitor. Those tricks mostly punish honest students
 * while stopping nobody. The only real prevention is hardware DRM
 * (Widevine L1 / FairPlay), which is a paid Bunny add-on, and even that does
 * not stop a camera.
 *
 * What this does is remove ANONYMITY. A recording that leaks carries the
 * account it came from, legibly, in every frame. That changes the calculation
 * for the person deciding whether to share it — which is where leaks actually
 * get stopped.
 *
 * DESIGN CHOICES THAT MATTER
 *
 * - It MOVES. A watermark fixed in one corner is cropped out in one pass. This
 *   one walks the frame, so removing it means cropping most of the video.
 * - Opacity is low enough not to spoil watching and high enough to survive
 *   re-encoding. Roughly 18% is the usable floor for compressed video.
 * - `pointer-events: none` so it never intercepts a click on the player.
 * - It is not a security boundary and is not treated as one: a locked lesson is
 *   protected by never receiving a signed URL, not by this.
 *
 * Anyone determined can remove it with an element inspector. That is fine —
 * the audience for a deterrent is the person who would otherwise share it
 * casually, not the one prepared to work at it.
 */
export default function ForensicWatermark({ label }: { label: string }) {
  // Nine positions on a 3×3 grid, walked in an order that never puts two
  // consecutive stops on the same edge — so no single crop catches them all.
  const stops = [
    { top: '12%', left: '8%' },
    { top: '68%', left: '62%' },
    { top: '38%', left: '30%' },
    { top: '80%', left: '14%' },
    { top: '20%', left: '58%' },
    { top: '54%', left: '78%' },
    { top: '86%', left: '44%' },
    { top: '30%', left: '76%' },
    { top: '60%', left: '20%' }
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Long enough not to distract, short enough that a clip of any useful
    // length contains at least one full move.
    const timer = setInterval(() => setIndex((i) => (i + 1) % stops.length), 7000);
    return () => clearInterval(timer);
  }, [stops.length]);

  if (!label) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      <span
        className="absolute select-none whitespace-nowrap font-mono text-[0.7rem] tracking-wide transition-all duration-[2500ms] ease-in-out sm:text-xs"
        style={{
          top: stops[index].top,
          left: stops[index].left,
          color: 'rgba(255,255,255,0.18)',
          // A matching shadow keeps it legible over a white-ish frame without
          // raising opacity, which would start to annoy the viewer.
          textShadow: '0 1px 3px rgba(0,0,0,0.45)'
        }}
      >
        {label}
      </span>
    </div>
  );
}
