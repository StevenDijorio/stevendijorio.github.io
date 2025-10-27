/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    './src/app/**/*.{ts,tsx,mdx}',
    './src/components/**/*.{ts,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.25rem',
        md: '2rem',
        lg: '2rem',
        xl: '2.5rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1400px',
      },
    },
    extend: {
      spacing: {
        '0.25': '0.0625rem',
        '0.5': '0.125rem',
        '1.5': '0.375rem',
        '2.5': '0.625rem',
        '3.5': '0.875rem',
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '7.5': '1.875rem',
        '9.5': '2.375rem',
        '11': '2.75rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
        gutter: 'var(--gutter, 1rem)',
        'message-x': 'var(--message-x, 0.75rem)',
        'message-y': 'var(--message-y, 0.5rem)',
        'input-h': 'var(--input-h, 2.5rem)',
        sidebar: 'var(--sidebar-w, 18rem)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        ai: {
          DEFAULT: 'hsl(var(--ai))',
          foreground: 'hsl(var(--ai-foreground))',
        },
        user: {
          DEFAULT: 'hsl(var(--user))',
          foreground: 'hsl(var(--user-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg, 0.75rem)',
        md: 'calc(var(--radius-lg, 0.75rem) - 2px)',
        sm: 'calc(var(--radius-lg, 0.75rem) - 4px)',
        xl: 'var(--radius-xl, 1rem)',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))',
        DEFAULT:
          'var(--shadow, 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1))',
        md: 'var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1))',
        lg: 'var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))',
        xl: 'var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))',
        '2xl': 'var(--shadow-2xl, 0 25px 50px -12px rgb(0 0 0 / 0.25))',
        inner: 'var(--shadow-inner, inset 0 2px 4px 0 rgb(0 0 0 / 0.05))',
        card: 'var(--shadow-card, 0 4px 6px -1px rgb(0 0 0 / 0.1))',
        input: 'var(--shadow-input, 0 1px 2px rgb(0 0 0 / 0.06))',
        popover: 'var(--shadow-popover, 0 10px 15px -3px rgb(0 0 0 / 0.1))',
        message: 'var(--shadow-message, 0 1px 2px rgb(0 0 0 / 0.06))',
      },
      animation: {
        'fade-in':
          'fade-in var(--duration-normal, 200ms) var(--easing-standard, ease-out) both',
        'slide-up-fade':
          'slide-up-fade var(--duration-normal, 250ms) var(--easing-emphasized, cubic-bezier(.2,.8,.2,1)) both',
        'ping-once': 'ping-once 300ms ease-out both',
        'caret-blink': 'caret-blink 1s steps(1,end) infinite',
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme('colors.foreground'),
            a: {
              color: theme('colors.primary.DEFAULT'),
              textDecoration: 'none',
            },
            strong: { color: theme('colors.foreground') },
            code: { color: theme('colors.accent.foreground') },
            blockquote: { color: theme('colors.muted.foreground') },
          },
        },
        invert: {
          css: {
            color: theme('colors.muted.foreground'),
            a: { color: theme('colors.primary.foreground') },
            strong: { color: theme('colors.foreground') },
            code: { color: theme('colors.accent.foreground') },
            blockquote: { color: theme('colors.muted.foreground') },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    plugin(({ addBase }) => {
      addBase({
        '@media (prefers-reduced-motion: reduce)': {
          '*:not([data-allow-motion])': {
            animation: 'none !important',
            transitionDuration: '1ms !important',
            transitionTimingFunction: 'linear !important',
            scrollBehavior: 'auto !important',
          },
        },
        '@media (prefers-reduced-motion: no-preference)': {
          '@keyframes fade-in': {
            from: { opacity: '0' },
            to: { opacity: '1' },
          },
          '@keyframes slide-up-fade': {
            '0%': { transform: 'translateY(8px)', opacity: '0' },
            '100%': { transform: 'translateY(0)', opacity: '1' },
          },
          '@keyframes ping-once': {
            '0%': { transform: 'scale(0.98)' },
            '40%': { transform: 'scale(1.02)' },
            '100%': { transform: 'scale(1)' },
          },
          '@keyframes caret-blink': {
            '0%, 40%': { opacity: '1' },
            '50%, 100%': { opacity: '0' },
          },
        },
      });
    }),
  ],
};