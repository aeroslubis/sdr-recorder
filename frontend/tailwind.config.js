/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#121212',
        ash: '#242424',
        charcoal: '#2e2e2e',
        slate: '#393939',
        graphite: '#4d4d4d',
        smoke: '#898989',
        'silver-mist': '#b4b4b4',
        snow: '#fafafa',
        'phosphor-green': '#3ecf8e',
        'mint-pulse': '#00c573',
        'forest-depth': '#1f4b37',
        'midnight-emerald': '#006239',
      },
      fontFamily: {
        circular: ['Circular', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['Source Code Pro', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        cards: '16px',
        inputs: '8px',
        buttons: '9999px',
        pill: '9999px',
      },
      boxShadow: {
        sm: 'rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px',
      },
    },
  },
  plugins: [],
};
