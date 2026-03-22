/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#5B5BD6',
        'accent-hover': '#4848c2',
        'accent-light': '#EBEBFB',
      }
    },
  },
  plugins: [],
}
