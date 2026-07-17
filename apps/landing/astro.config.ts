import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://moneydiary.cl',
  output: 'static',
  integrations: [],
  vite: {
    plugins: tailwindcss() as any,
  },
});
