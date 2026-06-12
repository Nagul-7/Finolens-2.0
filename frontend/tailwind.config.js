/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:        '#0b0d10',
        surface:   '#16191f',
        elevated:  '#1d2128',
        border:    '#262b33',
        accent:    '#00d4aa',
        'accent-dim': '#00b896',
        muted:     '#5c6470',
        text:      '#e6e9ee',
        'text-dim': '#8a92a0',
        positive:  '#10b981',
        negative:  '#ef4444',
      },
      borderRadius: {
        md: '7px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.2)',
        elevated: '0 4px 12px rgba(0,0,0,0.35)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        label: ['11px', { lineHeight: '1.4' }],
        body:  ['14px', { lineHeight: '1.5' }],
        head:  ['18px', { lineHeight: '1.3' }],
      },
    },
  },
  plugins: [],
}
