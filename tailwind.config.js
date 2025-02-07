import tailwindScrollbar from 'tailwind-scrollbar';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'favorite-fill': {
          '0%': {
            background: 'linear-gradient(to right, rgba(234, 179, 8, 0.1) 0%, transparent 0%)'
          },
          '100%': {
            background: 'linear-gradient(to right, rgba(234, 179, 8, 0.1) 100%, transparent 100%)'
          }
        },
        'unfavorite-fill': {
          '0%': {
            background: 'linear-gradient(to left, transparent 0%, rgba(234, 179, 8, 0.1) 0%)'
          },
          '100%': {
            background: 'linear-gradient(to left, transparent 100%, rgba(234, 179, 8, 0.1) 100%)'
          }
        }
      },
      animation: {
        'favorite-fill': 'favorite-fill 1000ms ease-out forwards',
        'unfavorite-fill': 'unfavorite-fill 1000ms ease-out forwards'
      }
    }
  },
  plugins: [
    tailwindScrollbar({ nocompatible: true }),
  ],
}