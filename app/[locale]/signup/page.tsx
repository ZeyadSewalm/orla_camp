import { Suspense } from 'react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import AuthForm from '@/components/AuthForm';

export default async function Signup({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('auth');
  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <h1 className="mb-8 font-display text-4xl font-black">{t('signupTitle')}</h1>
      <Suspense>
        <AuthForm mode="signup" locale={locale} />
      </Suspense>
    </div>
  );
}
