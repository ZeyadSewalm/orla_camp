import Logo, { Wordmark } from './Logo';

export default function HeroMark({ className = '' }: { className?: string }) {
  return (
    <div className={['relative isolate', className].join(' ')}>
      <div className="absolute inset-[8%] rotate-3 rounded-[2.5rem] bg-brandSun" />
      <div className="brand-grid absolute inset-x-[2%] bottom-[2%] top-[15%] -rotate-3 rounded-[2.5rem] bg-brass text-ink" />
      <div className="absolute -end-5 top-10 h-20 w-20 rounded-full bg-brandOrange md:h-24 md:w-24" />
      <div className="absolute -start-7 bottom-12 h-24 w-24 rotate-12 bg-brandCoral md:h-28 md:w-28" />

      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[2.5rem]">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white/80" />
        <Logo className="float-mark relative h-[78%] w-auto text-white drop-shadow-[0_18px_0_rgba(26,26,26,0.16)]" />
        <Wordmark className="absolute bottom-8 end-8 text-[clamp(1.45rem,2.6vw,2.25rem)] text-white" />
      </div>
    </div>
  );
}
