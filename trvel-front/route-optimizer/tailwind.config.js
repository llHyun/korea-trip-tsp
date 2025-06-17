/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  safelist: [
    'bg-[#ccff00]',
    'text-[#ff2a2a]',
    'hover:bg-black',
    'hover:text-[#ccff00]'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
