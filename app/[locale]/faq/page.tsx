import type { Metadata } from 'next';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'faq' });
  return { title: t('title'), description: t('a1') };
}

export default async function Faq({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('faq');
  // Five questions from the sales sheet. The refund question is deliberately
  // NOT published — the sheet marks it 'do not publish without a confirmed policy'.
  const items = [1, 2, 3, 4, 5].map((n) => [t(`q${n}` as 'q1'), t(`a${n}` as 'a1')]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({
      '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>
      <dl className="mt-10">
        {items.map(([q, a]) => (
          <div key={q} className="border-b border-line py-6">
            <dt className="font-display text-xl font-bold">{q}</dt>
            <dd className="mt-2 leading-relaxed text-steel">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
