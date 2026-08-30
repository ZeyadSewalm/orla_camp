import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (landing image, checklists). Replace <project-ref>.
      { protocol: 'https', hostname: '**.supabase.co' },
      // Drive-generated video posters (see lib/drive.ts driveThumbnail)
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: '**.b-cdn.net' }
    ]
  },

  // Response headers were entirely absent. These are the cheap ones — no
  // Content-Security-Policy here, because a wrong CSP silently breaks the
  // Bunny and Drive video iframes and that is worse than none.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Stop the site being framed by a lookalike that overlays the real
          // login form. SAMEORIGIN, not DENY: the site embeds its own iframes.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Don't let a browser guess a served file is something executable.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Send the origin only, never the full path, to third parties — a
          // reset-password or checkout URL must not leak in a Referer header.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' }
        ]
      },
      {
        // Nothing under /api should ever be cached by a CDN or a browser —
        // these responses are per-user and some carry auth cookies.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }]
      },
      {
        // Fonts are content-hashed by filename and never change in place.
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
