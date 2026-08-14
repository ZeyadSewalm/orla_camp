import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (landing image, checklists). Replace <project-ref>.
      { protocol: 'https', hostname: '**.supabase.co' }
    ]
  }
};

export default withNextIntl(nextConfig);
