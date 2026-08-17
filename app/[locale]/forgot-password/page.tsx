import { Suspense } from 'react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export default async function ForgotPasswordPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="display h-section">{t('forgotTitle')}</h1>
      <div className="surface-card mt-8 p-6 sm:p-8">
        <Suspense>
          <ForgotPasswordForm locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
