/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a2332',
        paper: '#fafaf7',
        rule: '#e6e3da',
        muted: '#6b6f78',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      maxWidth: {
        page: '1440px',
      },
    },
  },
  plugins: [],
}
