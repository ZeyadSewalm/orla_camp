'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import VideoEmbed from './VideoEmbed';
import { captureLead, getFreeLessonSource } from '@/app/[locale]/free-lesson/actions';
import { lh } from '@/lib/href';

const STORAGE_KEY = 'orla_free_lesson_unlocked';

export default function FreeLessonGate({
  locale,
  title
}: {
  locale: string;
  title: string;
}) {
  const t = useTranslations('free');
  const c = useTranslations('common');
  const params = useSearchParams();

  const [unlocked, setUnlocked] = useState(false);
  // Fetched only after the gate opens — never rendered into the page's HTML.
  const [video, setVideo] = useState<{ src: string | null; poster: string | null } | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Someone who already gave their email should not be asked twice. The flag
   * is remembered locally rather than server-side on purpose: it only controls
   * whether a FREE video is shown, so there is nothing here worth protecting,
   * and a round trip to check would delay the page for no gain.
   */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') {
        setUnlocked(true);
        void loadVideo();
      }
    } catch {
      // Private browsing blocks storage — just show the form.
    }
    setReady(true);
  }, []);

  async function loadVideo() {
    try {
      const v = await getFreeLessonSource();
      setVideo({ src: v.src, poster: v.poster });
    } catch {
      setVideo({ src: null, poster: null });
    }
  }

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!clean) {
      setError(t('errEmail'));
      return;
    }

    setBusy(true);
    setError(null);

    const result = await captureLead({
      email: clean,
      fullName: name,
      region: locale === 'ar' ? 'egypt' : 'international',
      utm: {
        source: params.get('utm_source') ?? undefined,
        medium: params.get('utm_medium') ?? undefined,
        campaign: params.get('utm_campaign') ?? undefined
      }
    });

    if (!result.ok && result.error === 'invalid') {
      setError(t('errEmail'));
      setBusy(false);
      return;
    }

    /*
     * Note what happens on result.error === 'failed': we unlock anyway.
     *
     * The visitor did what was asked. If our own database write failed, that
     * is our problem, not theirs — holding the lesson hostage to a logging
     * error would lose the person AND the lead. The failure is already in the
     * server logs.
     */
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setUnlocked(true);
    await loadVideo();
    setBusy(false);
  }

  // Render nothing until the storage check has run, so a returning visitor
  // doesn't see the form flash before the video replaces it.
  if (!ready) return <div className="aspect-video w-full animate-pulse rounded-2xl bg-ink/5" />;

  if (unlocked) {
    return (
      <div className="space-y-6">
        {/*
          FULL-BLEED ON PHONES.

          The page has 20px of side padding, so on a 390px screen the video was
          rendering 350px wide — and because this particular film is ultrawide,
          Drive letterboxes it inside that, leaving a picture roughly 150px
          tall. Nobody can judge a crown margin at 150px.

          The negative margin cancels the page padding for this element only,
          so the video runs edge to edge and gains about 12% width, and the
          square corners at that width look deliberate rather than cramped.
          From `sm` up the padding and the rounding come back.
        */}
        <div className="-mx-5 sm:mx-0 [&>*]:rounded-none sm:[&>*]:rounded-2xl">
          {video ? (
            <VideoEmbed src={video.src} poster={video.poster} title={title} />
          ) : (
            <div className="aspect-video w-full animate-pulse bg-ink/5 sm:rounded-2xl" />
          )}
        </div>

        <div className="surface-card p-6">
          <h2 className="display text-lg">{t('nextTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-steel">{t('nextBody')}</p>
          <div className="mt-5 flex flex-col gap-3 xs:flex-row">
            <Link href={lh(locale, '/pricing')} className="btn-primary justify-center">{t('seePlans')}</Link>
            <Link href={lh(locale, '/faq')} className="btn-quiet justify-center">{t('readFaq')}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card p-6 sm:p-8">
      <p className="text-sm leading-relaxed text-steel">{t('formIntro')}</p>

      <div className="mt-6 space-y-5">
        <div>
          <label htmlFor="lead-name" className="label mb-2 block">{t('name')}</label>
          <input
            id="lead-name" className="field" value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="lead-email" className="label mb-2 block">{t('email')}</label>
          <input
            id="lead-email" type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="field" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmail(email.trim().toLowerCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>

        {error && <p className="text-sm text-brandCoral">{error}</p>}

        <button
          type="button" onClick={submit} disabled={busy} aria-busy={busy}
          className="btn-primary w-full justify-center disabled:opacity-60"
        >
          {busy ? c('loading') : t('unlock')}
        </button>

        {/* Says plainly what happens next. "No card, no account" removes the
            two objections that stop people typing an email on a paid site. */}
        <p className="text-xs leading-relaxed text-steel">{t('privacy')}</p>
      </div>
    </div>
  );
}
