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
        DEFAULT: '1rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        full: '9999px'
      },
      maxWidth: { content: '72rem' },
      letterSpacing: { widest: '0.28em' }
    }
  },
  plugins: []
};
export default config;
