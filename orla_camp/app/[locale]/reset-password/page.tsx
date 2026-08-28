import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import ResetPasswordForm from '@/components/ResetPasswordForm';

// The recovery session lives in cookies set by /api/auth/callback, so this
// page must never be cached or prerendered.
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="display h-section">{t('resetTitle')}</h1>
      <div className="surface-card mt-8 p-6 sm:p-8">
        <ResetPasswordForm locale={locale} />
      </div>
    </div>
  );
}
