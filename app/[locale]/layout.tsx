import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource-variable/noto-kufi-arabic';
import { notFound } from 'next/navigation';
import { locales, dir, type Locale } from '@/i18n';
import { lh } from '@/lib/href';
import Header from '@/components/Header';
import RouteProgress from '@/components/RouteProgress';
import Footer from '@/components/Footer';
import '../globals.css';

const fontVariables = {
  '--font-fraunces': '"Fraunces Variable"',
  '--font-inter': '"Inter Variable"',
  '--font-plex-mono': '"IBM Plex Mono"',
  '--font-kufi': '"Noto Kufi Arabic Variable"'
} as React.CSSProperties;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'home' });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const title = 'OrlaDent Camp';
  const description = t('subhead');

  return {
    metadataBase: new URL(site),
    title: { default: title, template: `%s — ${title}` },
    description,
    alternates: {
      canonical: `${site}${lh(locale)}`,
      languages: { ar: `${site}${lh('ar')}`, en: `${site}${lh('en')}` }
    },
    openGraph: {
      title, description, url: `${site}${lh(locale)}`, siteName: title,
      locale: locale === 'ar' ? 'ar_EG' : 'en_US',
      images: [{ url: '/logo/orladent-logo.svg', width: 543, height: 937, alt: title }]
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/logo/orladent-logo.svg'] },
    icons: { icon: '/logo/orladent-logo.svg' }
  };
}

export default async function LocaleLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!locales.includes(locale as Locale)) notFound();
  unstable_setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={dir(locale)} style={fontVariables}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <RouteProgress />
          <div className="flex min-h-screen flex-col">
            <Header locale={locale} />
            <main className="flex-1">{children}</main>
            <Footer locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
