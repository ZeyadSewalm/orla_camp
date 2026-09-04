import type { Metadata } from 'next';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import ApplyForm from '@/components/ApplyForm';
import { getProfile } from '@/lib/supabase/server';

export const metadata: Metadata = { robots: { index: false } };

export default async function Apply({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('apply');
  // The tier row used to be fetched only to read its seat count. With the cap
  // gone there is nothing to read, so the query goes too rather than sitting
  // there costing a round trip on every page view.
  const profile = await getProfile();

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="font-display text-4xl font-black">{t('title')}</h1>
      <p className="mt-3 mb-9 text-steel">{t('intro')}</p>
      {/* Production Partner is no longer capped, so there is no "full" state
          to fall into and the form is always open. */}
      <ApplyForm
        defaults={{ name: profile?.full_name ?? '', email: profile?.email ?? '', userId: profile?.id ?? null }}
      />
    </div>
  );
}
