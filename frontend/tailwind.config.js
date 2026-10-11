/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crimson: '#e74c3c',
        slate: {
          canvas: '#263238',
          card: '#1b262c',
          elevated: '#202d35',
          border: '#32424a',
          muted: '#b0bec5',
        },
        semantic: {
          income: '#2ecc71',
          committed: '#8b0000',
          committedLight: '#ff5252',
          variable: '#f39c12',
          category: '#9b59b6',
          merchant: '#e67e22',
          cumulative: '#3498db',
        },
      },
    },
  },
  plugins: [],
};
