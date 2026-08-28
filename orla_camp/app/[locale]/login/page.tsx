import { Suspense } from 'react';
import { getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import AuthForm from '@/components/AuthForm';

export default async function Login({ params: { locale } }: { params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const t = await getTranslations('auth');
  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-5 py-12 md:grid-cols-[0.9fr_1.1fr] md:py-20">
      <div className="relative hidden min-h-[34rem] overflow-hidden rounded-[2.25rem] bg-brass p-10 text-white md:block">
        <span aria-hidden className="facet-field pointer-events-none absolute inset-0 text-white" />
        <span className="display relative text-5xl">ORLA<br />DENT<br />CAMP</span>
        <span aria-hidden className="absolute -bottom-8 -end-8 h-48 w-48 rounded-full bg-brandSun" />
      </div>
      <div className="surface-card p-7 md:p-10">
        <h1 className="display mb-8 text-4xl md:text-5xl">{t('loginTitle')}</h1>
        <Suspense><AuthForm mode="login" locale={locale} /></Suspense>
      </div>
    </div>
  );
}
