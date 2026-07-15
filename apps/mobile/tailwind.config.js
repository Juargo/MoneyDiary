/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Mirror of src/theme/colors.ts (keep in sync — no TS→JS bridge here).
      colors: {
        necesidades: '#464B69',
        gustos: '#E7E1BF',
        ahorro: '#3E9B52',
        ingreso: '#3B4266',
        heading: '#2D2F3A',
        muted: '#8A8F9C',
        hairline: '#EBEBEE',
        canvas: '#F3F3F5',
        link: '#3B5BDB',
        avatar: '#A7B0D6',
        'semaforo-verde': '#3E9B52',
        'semaforo-amarillo': '#C99A2E',
        'semaforo-rojo': '#D1495B',
      },
    },
  },
  plugins: [],
};
