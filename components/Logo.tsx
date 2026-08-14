/** The mark, inlined so it inherits currentColor and never flashes. */
export default function Logo({ className = 'h-10 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 520" className={className} role="img" aria-label="OrlaDent Camp" fill="currentColor" fillRule="evenodd">
      <path d="M24 148 L110 118 L118 168 Z" />
      <path d="M118 70 L206 100 L196 186 L112 176 L106 116 Z M150 126 a10 10 0 1 0 0.1 0 Z" />
      <path d="M112 182 L196 192 L206 246 L132 262 Z" />
      <path d="M132 268 L206 252 L214 320 L140 336 Z" />
      <path d="M138 342 L212 330 L232 392 L116 392 Z" />
      <path d="M200 200 L230 268 L214 318 L194 252 Z" />
      <path d="M214 196 L300 64 L322 92 L240 214 Z" />
      <path d="M220 230 L312 120 L328 152 L244 248 Z" />
      <path d="M228 266 L320 182 L330 214 L250 286 Z" />
      <rect x="84" y="398" width="172" height="26" rx="13" />
      <path d="M98 430 L242 430 L266 482 L74 482 Z" />
      <rect x="52" y="488" width="236" height="28" rx="14" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-black leading-[0.82] tracking-tight ${className}`}>
      ORLA<br />DENT<br />CAMP
    </span>
  );
}
