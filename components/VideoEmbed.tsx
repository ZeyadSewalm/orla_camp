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

  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center border border-dashed border-line bg-ink/5 text-sm text-steel">
        —
      </div>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={title}
        className="group relative flex aspect-video w-full items-center justify-center overflow-hidden bg-ink"
      >
        {poster && (
          // Plain img on purpose: these are third-party poster URLs of unknown
          // dimensions, and they are already behind a click.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70 transition group-hover:opacity-90" />
        )}
        <span className="relative flex h-16 w-16 items-center justify-center border border-brass bg-ink/70 transition group-hover:bg-brass">
          <Play aria-hidden className="h-6 w-6 text-brass transition group-hover:text-ink" strokeWidth={1.5} />
        </span>
      </button>
    );
  }

  return (
    <div className="relative aspect-video w-full bg-ink/5">
      <iframe
        src={src}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
