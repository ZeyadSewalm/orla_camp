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

        {/*
          Two nested transforms, on purpose: the outer box floats (translateY),
          the inner one spins in 3D (rotateY). Combining them on one element
          would mean the two animations fight over `transform` and one wins.

          ABSOLUTE, NOT h-full. The first version chained `height: 100%` three
          levels deep inside a flex item, and the chain collapsed to zero — the
          eagle vanished completely. A percentage height only resolves against
          a parent with a definite height, and a `flex-1` item does not reliably
          give one. Positioning against the `relative` wrapper sidesteps the
          whole problem: the box is whatever size flex made the wrapper.

          This is real 3D — perspective + preserve-3d — but it is CSS, so it
          composites on the GPU and costs no JavaScript. The three.js version
          of this mark that used to sit unused in the project cost 600 KB
          before drawing a single frame.

          ONE FACE, NOT TWO. The full 360° spin needed a mirrored back face,
          because the mark turned away from the viewer for half of every
          rotation and went paper-thin twice a cycle. The tilt never passes
          ±20°, so the back is never seen — which means the second SVG, its
          drop-shadow filter and its backface-visibility handling can all go.
          The eagle now faces the reader the entire time.
        */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center self-stretch">
          <div className="float-mark mark-3d absolute inset-0">
            <div className="mark-3d-inner">
              <Logo className="mark-3d-face text-white drop-shadow-[0_18px_0_rgba(26,26,26,0.16)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
