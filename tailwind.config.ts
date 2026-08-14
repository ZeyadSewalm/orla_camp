import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101113',      // warm black — never pure #000
        paper: '#F5F3EF',    // ivory — never pure #FFF
        steel: '#4A5568',    // blue-grey for secondary text
        brass: '#B08D57',    // the one accent. CTAs, PP card, small details only
        brassInk: '#8E7044',
        line: '#DCD8CF'      // hairline dividers
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace']
      },
      fontSize: {
        // A deliberate scale — nothing between these steps.
        xs: ['0.875rem', { lineHeight: '1.5' }],      // 14
        sm: ['1rem', { lineHeight: '1.65' }],         // 16
        base: ['1.25rem', { lineHeight: '1.6' }],     // 20
        lg: ['1.75rem', { lineHeight: '1.3' }],       // 28
        xl: ['2.5rem', { lineHeight: '1.08' }],       // 40
        '2xl': ['4rem', { lineHeight: '0.95' }]       // 64
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        full: '9999px' // kept only for dots and pills
      },
      maxWidth: { content: '76rem' },
      letterSpacing: { widest: '0.28em' }
    }
  },
  plugins: []
};
export default config;
