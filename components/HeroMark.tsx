import Logo, { Wordmark } from './Logo';

/**
 * The brand mark block beside the hero copy.
 *
 * WHAT WAS WRONG
 * The wordmark was absolutely positioned at `bottom-8 end-8` while the eagle
 * sat centred at 78% height. They occupied the same space, so the logo's
 * plinth cut straight through "ORLA / DENT / CAMP" — in Arabic worse still,
 * because `end` flips to the left and dropped the text right under the widest
 * part of the mark. The result read as a broken image, not a logo.
 *
 * Now the two are stacked in normal flow: the eagle takes the space it needs,
 * the wordmark sits under it, and neither can ever overlap the other at any
 * width or in either writing direction.
 */
export default function HeroMark({ className = '' }: { className?: string }) {
  return (
    <div className={['relative isolate', className].join(' ')}>
      <div className="absolute inset-[8%] rotate-3 rounded-[2.5rem] bg-brandSun" />
      <div className="brand-grid absolute inset-x-[2%] bottom-[2%] top-[15%] -rotate-3 rounded-[2.5rem] bg-brass text-ink" />
      <div className="absolute -end-5 top-10 h-20 w-20 rounded-full bg-brandOrange md:h-24 md:w-24" />
      <div className="absolute -start-7 bottom-12 h-24 w-24 rotate-12 bg-brandCoral md:h-28 md:w-28" />

      <div className="relative flex h-full flex-col items-center justify-center gap-5 overflow-hidden rounded-[2.5rem] px-6 py-8">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white/80" />

        {/* min-h-0 lets the eagle shrink inside the flex column instead of
            pushing the wordmark out of the rounded card. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <Logo className="float-mark h-full w-auto text-white drop-shadow-[0_18px_0_rgba(26,26,26,0.16)]" />
        </div>

        {/* In normal flow now — never underneath the mark. Always LTR: the
            wordmark is a Latin lockup regardless of page language. */}
        <Wordmark
          dir="ltr"
          className="relative shrink-0 text-center text-[clamp(1.1rem,2vw,1.6rem)] text-white"
        />
      </div>
    </div>
  );
}
