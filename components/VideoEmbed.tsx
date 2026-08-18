'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * Click-to-play video facade.
 *
 * A page with ten modules used to mount ten iframes at once — ten connections
 * to Google Drive or Bunny before the student had watched anything. Each one
 * pulls its own player JavaScript, and the browser serialises them. That is
 * seconds of load time for videos nobody asked for yet.
 *
 * Now the page renders a lightweight poster. The real player is only created
 * when the student actually clicks, and `loading="lazy"` still applies to any
 * that end up below the fold.
 *
 * The signed URL is generated on the server and passed in — this component
 * never sees a secret, and never decides who is allowed to watch.
 */
export default function VideoEmbed({
  src,
  title,
  poster
}: {
  src: string | null;
  title: string;
  poster?: string | null;
}) {
  const [playing, setPlaying] = useState(false);

  /*
   * Google Drive's /preview player draws a "pop out" button in its top-right
   * corner that opens the file on drive.google.com. It lives inside a
   * cross-origin iframe, so its markup cannot be reached or restyled from
   * here — no CSS, no JS, no iframe parameter removes it.
   *
   * The only thing that works is covering it. The patch below sits over that
   * corner and swallows the click, so the button can neither be seen nor
   * pressed.
   *
   * Be clear about what this is: it hides the exit, it does not lock the door.
   * The iframe's src is still visible in devtools. Bunny Stream — already
   * wired up in this project — is the answer when the video genuinely must be
   * protected. For a free lead-magnet lesson, hiding the pop-out is the right
   * amount of effort.
   */
  const isDrive = !!src && src.includes('drive.google.com');

  const frame =
    'relative aspect-video w-full overflow-hidden rounded-2xl bg-ink ring-1 ring-ink/10 shadow-[0_24px_60px_-24px_rgba(26,26,26,0.45)]';

  if (!src) {
    return (
      <div className={`${frame} flex items-center justify-center`}>
        <span className="text-sm text-white/50">—</span>
      </div>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={title}
        className={`${frame} group flex items-center justify-center`}
      >
        {poster && (
          // Plain img on purpose: these are third-party poster URLs of unknown
          // dimensions, and they are already behind a click.
          // eslint-disable-next-line @next/next/no-img-element
          /*
            object-CONTAIN, not cover.
            
            `cover` crops the poster to fill the frame, but the Drive player
            letterboxes instead — so the still and the video showed different
            framings, and pressing play made the picture visibly jump and
            shrink. `contain` letterboxes the poster the same way the player
            does, so the still is an exact preview of the first frame and
            nothing moves on click.
          */
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain opacity-70 transition duration-500 group-hover:opacity-90"
          />
        )}

        {/* Keeps the play button readable over a bright or busy poster.
            Radial so it darkens only behind the button, rather than dimming
            the letterbox bars that `contain` now leaves. */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'radial-gradient(closest-side, rgba(26,26,26,0.55), rgba(26,26,26,0) 70%)' }}
        />

        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition duration-300 group-hover:scale-110 group-hover:bg-brass">
          <Play
            aria-hidden
            className="ms-0.5 h-6 w-6 text-ink transition group-hover:text-white"
            strokeWidth={2}
            fill="currentColor"
          />
        </span>
      </button>
    );
  }

  return (
    <div className={frame}>
      <iframe
        src={src}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
      />

      {isDrive && (
        <span
          aria-hidden
          /*
           * `right-0`, NOT `end-0`. The logical property flips to the left in
           * Arabic, but the button being covered belongs to Drive's own LTR
           * interface inside the iframe — it sits on the physical right in
           * both languages.
           *
           * A GRADIENT, not a flat rectangle. The first version was a solid
           * black block, which vanished against the player's chrome but read
           * as a cut-out square the moment a bright frame was underneath it —
           * exactly what it looked like over the crown on the poster. Fading
           * to transparent reads as a corner vignette instead, so there is
           * nothing to notice. It still swallows the click either way.
           *
           * Smaller on phones, where Drive draws a smaller button and a big
           * patch would eat real picture.
           */
          onClick={(e) => e.preventDefault()}
          className="pointer-events-auto absolute right-0 top-0 h-12 w-14 cursor-default sm:h-14 sm:w-16"
          style={{
            background:
              'radial-gradient(120% 120% at 100% 0%, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.92) 45%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0) 100%)'
          }}
        />
      )}
    </div>
  );
}
