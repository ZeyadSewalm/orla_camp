import Link from 'next/link';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import Logo from '@/components/Logo';
import HeroMark from '@/components/HeroMark';
import MagneticButton from '@/components/MagneticButton';
import Curriculum from '@/components/Curriculum';
import TierComparison from '@/components/TierComparison';
import { getModules, getSiteSettings, getTiers } from '@/lib/data';
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
  const [settings, modules, tiers] = await Promise.all([
    getSiteSettings(),
    getModules(),
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
  const faqs = [1, 2, 3, 4, 5].map((n) => [f(`q${n}` as 'q1'), f(`a${n}` as 'a1')]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* ── 1. HERO ── */}
      <section className="relative overflow-hidden bg-paper">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-ink" />

        <div className="relative mx-auto grid max-w-content items-center gap-14 px-5 pb-16 pt-16 md:grid-cols-[1.25fr_auto] md:pb-24 md:pt-24">
          <div className="rise">
            <p className="mb-8 inline-flex items-center gap-2.5 border border-ink/15 px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-steel">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rotate-45 bg-brass" />
              {t('kicker')}
            </p>
            <h1 className="display text-[clamp(2.2rem,5.6vw,4.2rem)]">{t('headline')}</h1>
            <div className="rule-diagonal my-9 max-w-sm text-brass" />
            <p className="max-w-2xl text-base leading-relaxed text-steel">{t('subhead')}</p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <MagneticButton href={lh(locale, '/signup')} className="btn-brass">{t('ctaPrimary')}</MagneticButton>
              <a href="#curriculum" className="btn-quiet">{t('ctaSecondary')}</a>
            </div>

            {left !== null && left > 0 && (
              <p className="mt-8 flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.14em] text-steel">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rotate-45 bg-brass" />
                {p('seatsLeft', { count: left })} — Production Partner
              </p>
            )}
          </div>

          <div className="relative hidden md:block">
            {/*
              The hero always shows the mark. The uploaded landing image used
              to render here, which meant any stock photo saved in the admin
              replaced the brand at the most important point on the site.
              That image is still available for social previews and elsewhere;
              it just no longer outranks the logo.
            */}
            <HeroMark className="h-[26rem] w-[22rem]" />
          </div>
        </div>
      </section>

      {/* ── 2. THE PROBLEM — the first faceted cut ── */}
      <section className="cut-section relative -mt-1 bg-white pb-20 pt-[max(5rem,7vw)] md:pb-24">
        <div className="mx-auto max-w-content px-5">
        <h2 className="display text-4xl md:text-5xl">{t('problemTitle')}</h2>
        <p className="mt-8 max-w-3xl font-display text-2xl font-bold leading-snug md:text-3xl">{t('problem1')}</p>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <p className="leading-relaxed text-steel">{t('problem2')}</p>
          <p className="leading-relaxed text-steel">{t('problem3')}</p>
        </div>
          <p className="mt-12 border-s-2 border-brass ps-7 font-display text-lg font-black">{t('problemClose')}</p>
        </div>
      </section>

      {/* ── 3. INSTRUCTOR ── */}
      <section className="relative overflow-hidden bg-ink text-paper">
        <div aria-hidden className="facet-field pointer-events-none absolute inset-0 text-paper/20" />
        <div className="relative mx-auto max-w-content px-5 py-20">
          <p className="text-xs uppercase tracking-[0.28em] text-brass">{t('instructorKicker')}</p>
          <div className="mt-6 flex flex-col gap-10 md:flex-row md:items-start">
            <Logo className="h-32 w-auto shrink-0 text-brass" />
            <div>
              <h2 className="display text-4xl md:text-5xl">{t('instructorTitle')}</h2>
              <div className="mt-6 max-w-3xl space-y-5 text-lg leading-relaxed text-paper/75">
                <p>{t('instructor1')}</p>
                <p>{t('instructor2')}</p>
                <p className="text-paper">{t('instructor3')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CURRICULUM ── */}
      <section id="curriculum" className="scroll-mt-24 border-b border-line bg-white">
        <div className="mx-auto max-w-content px-5 py-20">
          <h2 className="display text-4xl md:text-5xl">{t('curriculumTitle')}</h2>
          <p className="mt-4 max-w-2xl italic text-steel">{t('curriculumNote')}</p>
          <Curriculum locale={locale} labels={{ available: t('statusAvailable'), coming: t('statusComing') }} />
          <p className="mt-12 max-w-3xl border-s-4 border-brass ps-6 italic text-steel">{t('curriculumFooter')}</p>
        </div>
      </section>

      {/* ── 5. TIER COMPARISON ── */}
      <section className="mx-auto max-w-content px-5 py-20">
        <h2 className="display text-4xl md:text-5xl">{t('comparisonTitle')}</h2>
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
        <p className="mt-8 max-w-3xl border border-ink/20 bg-white p-6 text-sm italic leading-relaxed text-steel">
          {t('partnerNote')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={lh(locale, '/pricing')} className="btn-primary">{p('subscribe')}</Link>
          <Link href={lh(locale, '/apply-production-partner')} className="btn-outline">{p('requestCall')}</Link>
        </div>
      </section>

      {/* ── 6. WHAT'S INCLUDED ── */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-content px-5 py-20">
          <h2 className="display text-4xl md:text-5xl">{t('includedTitle')}</h2>
          <ul className="mt-10 grid gap-px bg-line md:grid-cols-2">
            {included.map((line, i) => (
              <li key={i} className="flex gap-4 bg-white p-7">
                <span className="font-display text-sm text-brass">{String(i + 1).padStart(2, '0')}</span>
                <span className="leading-relaxed text-steel">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 7. PRICING + PAYMENT PLANS ── */}
      <section className="mx-auto max-w-content px-5 py-20">
        <h2 className="display text-4xl md:text-5xl">{t('pricingTitle')}</h2>
        <div className="mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
          <p className="leading-relaxed text-steel">{t('pricing1')}</p>
          <p className="leading-relaxed text-steel">{t('pricing2')}</p>
        </div>
        <MagneticButton href={lh(locale, '/pricing')} className="btn-brass mt-9">{p('subscribe')}</MagneticButton>
      </section>

      {/* ── 8. FAQ ── */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-content px-5 py-20">
          <h2 className="display text-4xl md:text-5xl">{f('title')}</h2>
          <dl className="mt-10 max-w-3xl">
            {faqs.map(([q, a]) => (
              <div key={q} className="border-b border-line py-6">
                <dt className="font-display text-lg font-bold">{q}</dt>
                <dd className="mt-2 leading-relaxed text-steel">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 9. FINAL CTA ── */}
      <section className="mx-auto max-w-content px-5 py-20">
        <div className="cut-corner relative overflow-hidden bg-brass p-10 text-white md:p-16">
          <div aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white/25" />
          <div className="relative">
            <h2 className="display text-4xl md:text-6xl">{t('finalTitle')}</h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85">{t('finalBody')}</p>
            <Link href={lh(locale, '/pricing')} className="btn-on-dark mt-9">{t('finalCta')}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
