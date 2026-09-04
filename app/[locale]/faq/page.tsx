import type { Metadata } from 'next';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'faq' });
  return { title: t('title'), description: t('a1') };
}

export default async function Faq({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('faq');
  /*
   * Three questions now.
   *
   * The sales sheet had five: the refund question is deliberately unpublished
   * (the sheet marks it 'do not publish without a confirmed policy'), the
   * certificate one was removed on request, and the payment-plans one went
   * with the instalment offer.
   *
   * Keep this range in step with the keys that exist. It has drifted before:
   * the loop kept asking for q5 after q5 was deleted, and next-intl renders a
   * missing message as a visible error string on the page.
   */
  const items = [1, 2, 3].map((n) => [t(`q${n}` as 'q1'), t(`a${n}` as 'a1')]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({
      '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <h1 className="display text-5xl md:text-[4.5rem]">{t('title')}</h1>
      <div className="rule-diagonal mt-7 text-brass" />
      <dl className="mt-10 space-y-3">
        {items.map(([q, a]) => (
          <div key={q} className="surface-card p-6 md:p-7">
            <dt className="text-base font-semibold md:text-lg">{q}</dt>
            <dd className="mt-2 leading-relaxed text-steel">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
