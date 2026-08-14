import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  // Arabic is the default locale and carries no prefix, so each private route
  // exists at both "/x" and "/en/x".
  const priv = ['/admin', '/course', '/checkout', '/apply-production-partner', '/whoami'];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...priv, ...priv.map((x) => `/en${x}`), '/api/']
      }
    ],
    sitemap: `${site}/sitemap.xml`
  };
}
