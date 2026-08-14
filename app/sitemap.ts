import type { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { lh } from '@/lib/href';

const PUBLIC_PATHS = ['', '/pricing', '/faq'];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return locales.flatMap((locale) =>
    PUBLIC_PATHS.map((path) => ({
      url: `${site}${lh(locale, path)}`.replace(/\/$/, '') || site,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: path === '' ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${site}${lh(l, path)}`]))
      }
    }))
  );
}
