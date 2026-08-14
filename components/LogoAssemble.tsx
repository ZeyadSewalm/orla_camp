import Logo from './Logo';

/**
 * The mark assembling itself on page load.
 *
 * Each facet starts offset in the direction it sits relative to the centre, so
 * the pieces converge inward — one composed movement over half a second, not
 * eleven separate animations. Falls back to a static mark under
 * prefers-reduced-motion (handled in globals.css).
 */
const FACETS: Array<{ d?: string; rect?: [number, number, number, number, number]; dx: string; dy: string; delay: number }> = [
  { d: 'M24 148 L110 118 L118 168 Z', dx: '-40px', dy: '-14px', delay: 0 },
  { d: 'M118 70 L206 100 L196 186 L112 176 L106 116 Z M150 126 a10 10 0 1 0 0.1 0 Z', dx: '-14px', dy: '-34px', delay: 0.04 },
  { d: 'M112 182 L196 192 L206 246 L132 262 Z', dx: '-22px', dy: '-8px', delay: 0.08 },
  { d: 'M132 268 L206 252 L214 320 L140 336 Z', dx: '-18px', dy: '10px', delay: 0.12 },
  { d: 'M138 342 L212 330 L232 392 L116 392 Z', dx: '-10px', dy: '20px', delay: 0.16 },
  { d: 'M200 200 L230 268 L214 318 L194 252 Z', dx: '18px', dy: '0px', delay: 0.1 },
  { d: 'M214 196 L300 64 L322 92 L240 214 Z', dx: '44px', dy: '-32px', delay: 0.06 },
  { d: 'M220 230 L312 120 L328 152 L244 248 Z', dx: '48px', dy: '-20px', delay: 0.1 },
  { d: 'M228 266 L320 182 L330 214 L250 286 Z', dx: '46px', dy: '-6px', delay: 0.14 },
  { rect: [84, 398, 172, 26, 13], dx: '0px', dy: '24px', delay: 0.2 },
  { d: 'M98 430 L242 430 L266 482 L74 482 Z', dx: '0px', dy: '30px', delay: 0.24 },
  { rect: [52, 488, 236, 28, 14], dx: '0px', dy: '36px', delay: 0.28 }
];

export default function LogoAssemble({ className = 'h-72 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 520" className={className} role="img" aria-label="OrlaDent Camp" fill="currentColor" fillRule="evenodd">
      <g className="assemble">
        {FACETS.map((f, i) => {
          const style = {
            ['--dx' as string]: f.dx,
            ['--dy' as string]: f.dy,
            animationDelay: `${f.delay}s`
          } as React.CSSProperties;

          return f.rect ? (
            <rect key={i} x={f.rect[0]} y={f.rect[1]} width={f.rect[2]} height={f.rect[3]} rx={f.rect[4]} style={style} />
          ) : (
            <path key={i} d={f.d} style={style} />
          );
        })}
      </g>
    </svg>
  );
}

export { Logo };
