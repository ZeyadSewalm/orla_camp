import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import FreeLessonGate from '@/components/FreeLessonGate';
import { getModules } from '@/lib/data';
import { lh } from '@/lib/href';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'free' });
  // Just the page name. The root layout's title template appends
  // " — OrlaDent Camp", so including it here produced the doubled
  // "درس مجاني — OrlaDent Camp — OrlaDent Camp" visible in the live tab title.
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function FreeLesson({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('free');
  const ar = locale === 'ar';

  /*
   * The giveaway is whichever module is flagged is_free_preview in the admin
   * panel — lowest order_index wins. That flag and the admin checkbox already
   * existed and were never wired to anything; this page is what gives them a
   * purpose. It also means the free lesson can be swapped without a deploy.
   */
  const modules = await getModules();
  const lesson = modules.find((m) => m.is_free_preview) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
      <p className="label text-brass">{t('kicker')}</p>
      <h1 className="display h-section mt-3">{lesson ? (ar ? lesson.title_ar : lesson.title_en) : t('title')}</h1>
      <p className="mt-5 text-base leading-relaxed text-steel">{t('subhead')}</p>

      <ul className="mt-7 space-y-2.5 text-sm">
        {[t('point1'), t('point2'), t('point3')].map((point) => (
          <li key={point} className="flex gap-3">
            <span aria-hidden className="mt-0.5 shrink-0 text-brass">✓</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        {lesson ? (
          <Suspense fallback={<div className="aspect-video w-full animate-pulse rounded-2xl bg-ink/5" />}>
            {/* No src prop: the URL is fetched by a server action once the
                email is in, so it never appears in this page's HTML. */}
            <FreeLessonGate locale={locale} title={ar ? lesson.title_ar : lesson.title_en} />
          </Suspense>
        ) : (
          /*
           * No module is flagged yet. Say so honestly instead of showing an
           * email form for a video that does not exist — collecting addresses
           * against a promise you cannot keep is the fastest way to burn a
           * list before you have one.
           */
          <div className="surface-card p-6 sm:p-8">
            <p className="text-sm leading-relaxed">{t('comingSoon')}</p>
            <Link href={lh(locale, '/pricing')} className="btn-primary mt-5 justify-center xs:w-auto">
              {t('seePlans')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
