import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, dir, type Locale } from '@/i18n';
import { lh } from '@/lib/href';
import Header from '@/components/Header';
import RouteProgress from '@/components/RouteProgress';
import Footer from '@/components/Footer';
import '../globals.css';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * The viewport meta tag, declared explicitly.
 *
 * Next 14 injects a default one, but relying on that is fragile — the moment
 * anything else defines `viewport` the default is dropped, and without it a
 * phone renders the page at 980px wide and scales it down. Everything then
 * looks "zoomed out and broken" no matter how good the CSS is.
 *
 * maximumScale is deliberately 5 and userScalable stays on: pinch-zoom is an
 * accessibility requirement, and disabling it is a common mistake made while
 * chasing exactly this bug.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#F5EFE6'
};

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
    <html lang={locale} dir={dir(locale)}>
      <head>
        {/*
          Preload only the face that actually paints this locale's first
          screen. Without this the browser has to download the CSS, parse it,
          discover the @font-face, and only THEN start the font request —
          three serial round trips before any real text appears. Arabic gets
          Almarai, English gets Inter; neither pays for the other's file.
        */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={locale === 'ar' ? '/fonts/almarai-arabic-400.woff2' : '/fonts/inter-latin.woff2'}
          crossOrigin="anonymous"
        />
      </head>
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
