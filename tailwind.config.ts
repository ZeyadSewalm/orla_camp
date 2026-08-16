import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1A1A1A',
        paper: '#F5EFE6',
        steel: '#655F59',
        brass: '#4B40FF',
        brassInk: '#3429E6',
        line: '#D9D1C6',
        brandBlue: '#2D4FFF',
        brandGold: '#C9A327',
        brandCoral: '#D9603C',
        brandOrange: '#FF8D00',
        brandSun: '#EDDD59',
        brandRed: '#DD4124',
        brandBrown: '#241C15'
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace']
      },
      fontSize: {
        /**
         * A deliberate scale — nothing between these steps — but FLUID.
         *
         * This is the single biggest cause of the broken mobile layout. The
         * scale overrides Tailwind's defaults, so `text-2xl` was not 24px as
         * everyone writing the components assumed: it was a fixed 64px, and
         * `text-xl` was 40px. On a 390px phone a "text-2xl" card title (the
         * pricing tier names, the curriculum block headings, a student's name
         * in the admin panel) rendered at 64px and pushed its own container
         * sideways. `md:text-3xl` then made it SMALLER on desktop than on the
         * phone, which is how the hierarchy ended up inverted.
         *
         * Each step now interpolates between a phone-sized minimum and the
         * exact value the design had before. Every maximum below is unchanged,
         * so the desktop design is byte-for-byte the same — the sizes simply
         * scale down under roughly 1100px instead of overflowing.
         */
        xs: ['clamp(0.8125rem, 0.78rem + 0.15vw, 0.875rem)', { lineHeight: '1.5' }],  // 13 → 14
        sm: ['clamp(0.9375rem, 0.90rem + 0.20vw, 1rem)', { lineHeight: '1.65' }],     // 15 → 16
        base: ['clamp(1.0625rem, 0.95rem + 0.55vw, 1.25rem)', { lineHeight: '1.6' }], // 17 → 20
        lg: ['clamp(1.25rem, 1.00rem + 1.25vw, 1.75rem)', { lineHeight: '1.3' }],     // 20 → 28
        xl: ['clamp(1.75rem, 1.25rem + 2.50vw, 2.5rem)', { lineHeight: '1.12' }],     // 28 → 40
        '2xl': ['clamp(2.25rem, 1.30rem + 4.75vw, 4rem)', { lineHeight: '1.0' }]      // 36 → 64
      },
      borderRadius: {
        none: '0',
        DEFAULT: '1rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        full: '9999px'
      },
      // 360px-wide Androids are a large share of the audience here, and they
      // are narrower than Tailwind's smallest built-in breakpoint (640px).
      screens: { xs: '400px' },
      maxWidth: { content: '72rem' },
      letterSpacing: { widest: '0.28em' }
    }
  },
  plugins: []
};
export default config;
