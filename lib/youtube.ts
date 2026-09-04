/**
 * YouTube support for course videos.
 *
 * WHY THIS EXISTS
 *
 * Bunny is the right home for paid lessons: signed URLs that expire, and a
 * player we can ask "did it finish?". But the free lesson is a lead magnet, not
 * paid content — it is meant to be watched, shared and found. Paying Bunny
 * bandwidth to serve a giveaway to strangers is the wrong trade, and YouTube
 * brings its own discovery for free.
 *
 * So this is deliberately a third source alongside Drive and Bunny rather than
 * a replacement for either. Nothing gated should ever use it: a YouTube URL is
 * public by construction and cannot be signed or expired.
 */

/**
 * Pulls the 11-character video ID out of any YouTube URL shape.
 *
 * As with Bunny, people paste whatever their browser or the Share button gave
 * them, and none of the forms is signposted as the correct one:
 *
 *   https://www.youtube.com/watch?v=<id>
 *   https://youtu.be/<id>
 *   https://www.youtube.com/embed/<id>
 *   https://www.youtube.com/live/<id>
 *   https://www.youtube.com/shorts/<id>
 *   <id>                                    (bare, 11 chars)
 *
 * A playlist or timestamp suffix (?t=, &list=) is ignored rather than rejected,
 * since it is almost always a copy-paste artefact rather than an intention.
 */
export function youtubeIdFrom(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // The ID alphabet is exactly this, and the length is exactly 11.
  const ID = '[A-Za-z0-9_-]{11}';

  // A bare ID pasted on its own.
  if (new RegExp(`^${ID}$`).test(raw)) return raw;

  // Only treat it as YouTube if it actually is: this keeps an 11-character
  // fragment of some other URL from being mistaken for a video ID.
  if (!/(?:youtube\.com|youtu\.be)/i.test(raw)) return null;

  const patterns = [
    new RegExp(`[?&]v=(${ID})`),            // watch?v=
    new RegExp(`youtu\\.be/(${ID})`),        // short link
    new RegExp(`/embed/(${ID})`),
    new RegExp(`/live/(${ID})`),
    new RegExp(`/shorts/(${ID})`)
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * The privacy-preserving embed URL.
 *
 * youtube-nocookie.com is used rather than youtube.com so that a visitor who
 * has not pressed play is not handed a tracking cookie by a third party. On the
 * free-lesson page in particular, that visitor has just given us their email
 * and has not agreed to anything else.
 *
 * `rel=0` keeps the end-screen suggestions to the same channel instead of
 * offering competitors' tutorials the moment the lesson finishes.
 */
export function youtubeEmbedUrl(input: string | null | undefined): string | null {
  const id = youtubeIdFrom(input);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}

/** Poster frame. Served by YouTube itself, so there is nothing to upload. */
export function youtubeThumbnail(input: string | null | undefined): string | null {
  const id = youtubeIdFrom(input);
  // hqdefault exists for every video; maxresdefault 404s on older uploads.
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
