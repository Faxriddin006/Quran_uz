import { defineConfig } from 'vite';

export default defineConfig({
  // Nisbiy yo'llar: GitHub Pages'da /Quran_uz/ ostida ham, lokal serverda ham ishlaydi
  base: './',
  define: {
    __BUILD__: JSON.stringify(Date.now().toString(36)),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
