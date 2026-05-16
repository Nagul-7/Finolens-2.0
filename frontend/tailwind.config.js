/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0e1a',
        surface: '#131826',
        border:  '#1e2538',
        accent:  '#00d4aa',
        'accent-dim': '#00b894',
        muted:   '#6b7280',
        text:    '#e2e8f0',
        'text-dim': '#94a3b8',
        positive: '#22c55e',
        negative: '#ef4444',
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
