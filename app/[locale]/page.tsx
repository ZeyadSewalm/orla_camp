import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import Logo from '@/components/Logo';
import HeroMark from '@/components/HeroMark';
import Reveal from '@/components/Reveal';
import MagneticButton from '@/components/MagneticButton';
import Curriculum from '@/components/Curriculum';
import TierComparison from '@/components/TierComparison';
import { getSiteSettings, getTiers } from '@/lib/data';
import { lh } from '@/lib/href';
import { seatsLeft } from '@/lib/pricing';

/**
 * Sales page. Section order follows the sales sheet exactly:
 * 1 Hero · 2 Problem · 3 Instructor · 4 Curriculum · 5 Tier comparison
 * 6 What's included · 7 Pricing + payment plans · 8 FAQ · 9 Final CTA
 */
export default async function Home({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('home');
  const f = await getTranslations('faq');
  const p = await getTranslations('pricing');
  // `modules` used to be fetched here and never read. It is a whole extra
  // Supabase round trip on the site's busiest page, and since migration-007 it
  // is a service-role read of the paid video columns for no reason at all.
  const [settings, tiers] = await Promise.all([
    getSiteSettings(),
    getTiers()
  ]);

  const ar = locale === 'ar';
  const partner = tiers.find((x) => x.slug === 'production_partner');
  const left = partner ? seatsLeft(partner) : null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'OrlaDent Camp',
    description: t('subhead'),
    inLanguage: locale,
    provider: { '@type': 'Organization', name: 'OrlaDent', sameAs: process.env.NEXT_PUBLIC_SITE_URL },
    instructor: { '@type': 'Person', name: 'Badr' }
  };

  const included = [t('included1'), t('included2'), t('included3'), t('included4'), t('included5')];
  // Four questions now — the certificate Q&A was removed on request.
  const faqs = [1, 2, 3, 4].map((n) => [f(`q${n}` as 'q1'), f(`a${n}` as 'a1')]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* ── 1. HERO ── */}
      <section className="relative overflow-hidden px-3 pb-4 pt-6 md:px-5 md:pt-8">
        {/* Decorative only — hidden on phones, where they sat under the text
            and forced horizontal scroll. */}
        <div aria-hidden className="parallax-fast absolute -start-10 top-12 hidden h-32 w-32 rotate-12 bg-brandSun sm:block md:h-44 md:w-44" />
        <div aria-hidden className="parallax-slow absolute -end-10 bottom-10 hidden h-32 w-32 rounded-full bg-brandCoral sm:block md:h-40 md:w-40" />

        <div className="soft-shadow relative mx-auto grid max-w-[90rem] items-center gap-10 overflow-hidden rounded-[1.5rem] border border-ink/10 bg-white px-5 py-10 sm:rounded-[2.25rem] sm:px-6 sm:py-14 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:px-12 md:py-16 lg:px-16">
          <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-brass" />
          <div className="rise">
            <p className="mb-7 inline-flex items-center gap-2.5 rounded-full bg-paper px-4 py-2 text-xs font-semibold text-steel">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brass" />
              {t('kicker')}
            </p>
            {/* Size lives in .h-hero, which carries a separate clamp for
                Arabic — see globals.css. A single shared clamp is what made
                the Arabic headline run to seven lines and swallow the fold. */}
            <h1 className="display h-hero relative max-w-3xl">{t('headline')}</h1>
            <div className="rule-diagonal my-7 text-brass" />
            {/* Was text-lg → md:text-xl, i.e. a 40px body paragraph on
                desktop under the custom scale. Body copy stays body-sized. */}
            <p className="max-w-2xl text-base leading-relaxed text-steel md:text-lg">{t('subhead')}</p>

            {/* Full-width stacked on a phone, side by side from 400px up —
                two half-width buttons on a 360px screen wrap their labels. */}
            <div className="mt-9 flex flex-col gap-3 xs:flex-row xs:flex-wrap xs:items-center md:mt-10">
              {/* The button says "free Single Crown lesson" — so it now goes to the
                  free lesson, not to a signup form. Promising something free
                  and delivering a signup wall is the fastest way to lose
                  someone at the very first click. */}
              <MagneticButton href={lh(locale, '/free-lesson')} className="btn-brass w-full justify-center xs:w-auto">{t('ctaPrimary')}</MagneticButton>
              <a href="#curriculum" className="btn-quiet w-full justify-center xs:w-auto">{t('ctaSecondary')}</a>
            </div>

            {left !== null && left > 0 && (
              <p className="mt-8 flex items-center gap-2.5 text-xs font-semibold text-steel">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brass" />
                {p('seatsLeft', { count: left })} — Production Partner
              </p>
            )}
          </div>

          {/*
            VISIBLE ON EVERY SIZE.

            This was `hidden md:block`, so the entire brand mark vanished on
            phones and on any narrow desktop window — the hero became a wall of
            text with no image at all, on the one screen most visitors actually
            see. Hiding the logo is not a responsive strategy.

            `order-first` on mobile puts the mark ABOVE the headline, which is
            how the eye expects it; from `md` the grid takes over and it
            returns to its column beside the copy. It is also smaller on a
            phone so it introduces the page rather than filling it.
          */}
          <div className="relative order-first flex justify-center md:order-none md:block">
            <HeroMark className="h-[15rem] w-full max-w-[15rem] sm:h-[19rem] sm:max-w-[19rem] md:h-[28rem] md:max-w-[25rem]" />
          </div>
        </div>
      </section>

      {/* ── 2. THE PROBLEM — the first faceted cut ── */}
      <section className="relative mx-3 mt-1 overflow-hidden rounded-[2.25rem] bg-brandSun py-16 md:mx-5 md:py-20">
        <div aria-hidden className="brand-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-content px-5">
        <Reveal as="h2" className="display h-section">{t('problemTitle')}</Reveal>
        {/* text-2xl is 64px under this project's scale, so the mobile size was
            larger than the md: size. Now it climbs instead of collapsing. */}
        <p className="mt-8 max-w-3xl text-xl font-semibold leading-snug sm:text-2xl">{t('problem1')}</p>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <p className="leading-relaxed text-ink/70">{t('problem2')}</p>
          <p className="leading-relaxed text-ink/70">{t('problem3')}</p>
        </div>
          <p className="mt-12 border-s-2 border-brass ps-5 font-display text-lg font-black md:ps-7">{t('problemClose')}</p>
        </div>
      </section>

      {/* ── 3. INSTRUCTOR ── */}
      <section className="relative mx-3 mt-4 overflow-hidden rounded-[2.25rem] bg-brass text-white md:mx-5">
        <div aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white" />
        <div aria-hidden className="absolute -end-12 top-10 h-40 w-40 rounded-full bg-brandOrange" />
        <div className="relative mx-auto max-w-content px-5 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{t('instructorKicker')}</p>
          <div className="mt-6 flex flex-col gap-10 md:flex-row md:items-start">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-white p-5 text-ink md:h-40 md:w-40 md:p-7">
              <Logo className="h-full w-auto" />
            </div>
            <div>
              <Reveal as="h2" className="display h-section">{t('instructorTitle')}</Reveal>
              <div className="mt-6 max-w-3xl space-y-5 text-base leading-relaxed text-white/75 md:text-lg">
                <p>{t('instructor1')}</p>
                <p>{t('instructor2')}</p>
                <p className="text-white">{t('instructor3')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CURRICULUM ── */}
      <section id="curriculum" className="scroll-mt-24">
        <div className="mx-auto max-w-content px-5 py-20">
          <Reveal as="h2" className="display h-section">{t('curriculumTitle')}</Reveal>
          <p className="mt-4 max-w-2xl italic text-steel">{t('curriculumNote')}</p>
          <Curriculum locale={locale} labels={{ available: t('statusAvailable'), coming: t('statusComing') }} />
          <p className="mt-12 max-w-3xl border-s-4 border-brass ps-6 italic text-steel">{t('curriculumFooter')}</p>
        </div>
      </section>

      {/* ── 5. TIER COMPARISON ──
          Guarded on `tiers`: TierComparison returns null when the table is
          empty, and without this the section still printed its heading and
          intro over nothing at all. That only happens when Supabase is
          unreachable — which the fail-soft data layer now allows the page to
          survive — so the page has to survive it looking right too, not just
          without throwing. */}
      {tiers.length > 0 && (
      <section className="mx-auto max-w-content px-5 py-16 md:py-20">
        <Reveal as="h2" className="display h-section">{t('comparisonTitle')}</Reveal>
        <p className="mt-4 max-w-3xl italic text-steel">{t('comparisonNote')}</p>
        <TierComparison
          tiers={tiers}
          locale={locale}
          labels={{
            egypt: ar ? 'مصر' : 'Egypt',
            intl: ar ? 'الخليج / دولي' : 'Gulf / International',
            custom: p('customPrice'),
            installments: ar ? 'أو' : 'or'
          }}
        />
        <p className="surface-card mt-8 max-w-3xl p-6 text-sm leading-relaxed text-steel">
          {t('partnerNote')}
        </p>
        <div className="mt-8 flex flex-col gap-3 xs:flex-row xs:flex-wrap">
          <Link href={lh(locale, '/pricing')} className="btn-primary w-full justify-center xs:w-auto">{p('subscribe')}</Link>
          <Link href={lh(locale, '/apply-production-partner')} className="btn-outline w-full justify-center xs:w-auto">{p('requestCall')}</Link>
        </div>
      </section>
      )}

      {/* ── 6. WHAT'S INCLUDED ── */}
      <section className="mx-3 overflow-hidden rounded-[2.25rem] bg-white md:mx-5">
        <div className="mx-auto max-w-content px-5 py-16 md:py-20">
          <Reveal as="h2" className="display h-section">{t('includedTitle')}</Reveal>
          <ul className="mt-10 grid gap-3 md:grid-cols-2">
            {included.map((line, i) => (
              <li key={i} className="flex gap-4 rounded-2xl bg-paper p-5 sm:rounded-3xl sm:p-7">
                <span className="figure flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass text-xs text-white">{String(i + 1).padStart(2, '0')}</span>
                <span className="leading-relaxed text-steel">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 7. PRICING + PAYMENT PLANS ── */}
      <section className="mx-auto max-w-content px-5 py-20">
        <Reveal as="h2" className="display h-section">{t('pricingTitle')}</Reveal>
        <div className="mt-8 grid max-w-4xl gap-6">
          <p className="leading-relaxed text-steel">{t('pricing2')}</p>
        </div>
        <MagneticButton href={lh(locale, '/pricing')} className="btn-brass mt-9">{p('subscribe')}</MagneticButton>
      </section>

      {/* ── 8. FAQ ── */}
      <section className="mx-3 overflow-hidden rounded-[2.25rem] bg-white md:mx-5">
        <div className="mx-auto max-w-content px-5 py-20">
          <Reveal as="h2" className="display h-section">{f('title')}</Reveal>
          <dl className="mt-10 max-w-3xl">
            {faqs.map(([q, a]) => (
              <div key={q} className="mb-3 rounded-2xl bg-paper p-5 sm:rounded-3xl sm:p-6">
                <dt className="text-base font-semibold md:text-lg">{q}</dt>
                <dd className="mt-2 leading-relaxed text-steel">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 9. FINAL CTA ── */}
      <section className="mx-auto max-w-content px-5 py-20">
        <div className="relative overflow-hidden rounded-[1.5rem] bg-brass p-7 text-white sm:rounded-[2.25rem] sm:p-10 md:p-16">
          <div aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white/25" />
          <div className="relative">
            <Reveal as="h2" className="display h-final max-w-4xl">{t('finalTitle')}</Reveal>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">{t('finalBody')}</p>
            <Link href={lh(locale, '/pricing')} className="btn-on-dark mt-9 w-full justify-center xs:w-auto">{t('finalCta')}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
