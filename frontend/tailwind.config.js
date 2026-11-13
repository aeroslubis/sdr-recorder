/** @type {import('tailwindcss').Config} */
function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variableName}) / ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: withOpacity('--color-obsidian-rgb'),
        ash: withOpacity('--color-ash-rgb'),
        charcoal: withOpacity('--color-charcoal-rgb'),
        slate: withOpacity('--color-slate-rgb'),
        graphite: withOpacity('--color-graphite-rgb'),
        smoke: withOpacity('--color-smoke-rgb'),
        'silver-mist': withOpacity('--color-silver-mist-rgb'),
        snow: withOpacity('--color-snow-rgb'),
        'phosphor-green': withOpacity('--color-phosphor-green-rgb'),
        'mint-pulse': withOpacity('--color-mint-pulse-rgb'),
        'forest-depth': withOpacity('--color-forest-depth-rgb'),
        'midnight-emerald': withOpacity('--color-midnight-emerald-rgb'),
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
