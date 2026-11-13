import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Ma'lumot versiyasi (scripts/build-data.mjs yozadi) — kesh kaliti sifatida ishlatiladi
let dataV = 'dev';
try {
  dataV = JSON.parse(fs.readFileSync(new URL('./public/data/version.json', import.meta.url), 'utf8')).v;
} catch {
  /* `npm run data` hali ishga tushirilmagan */
}

/** Oflayn yuklab olish uchun barcha qurilgan fayllar ro'yxati (asset-list.json) */
function assetList(): Plugin {
  return {
    name: 'quz-asset-list',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      this.emitFile({ type: 'asset', fileName: 'asset-list.json', source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  // Nisbiy yo'llar: GitHub Pages'da /Quran_uz/ ostida ham, lokal serverda ham ishlaydi
  base: './',
  define: {
    __BUILD__: JSON.stringify(Date.now().toString(36)),
    __DATA_V__: JSON.stringify(dataV),
  },
  plugins: [assetList()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
