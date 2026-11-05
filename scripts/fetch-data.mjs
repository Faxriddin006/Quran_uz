// Manbalarni qaytadan yuklab olib, data/raw/ ni yangilaydi.
// Ishlatish:  node scripts/fetch-data.mjs        (natija: data/raw/)
//             RAW_DIR=/tmp/raw node scripts/fetch-data.mjs   (boshqa papkaga)
// Matnlar so'zma-so'z saqlanadi. Bir nechta API javoblari faqat bitta faylga yig'iladi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = process.env.RAW_DIR ? path.resolve(process.env.RAW_DIR) : path.join(ROOT, 'data/raw');
const CORPUS_SHA256 = '910b721a8f04f4334ac5d4c62b19e858f5d720c525bb975f2e750ea2c6bb532d';
const CORPUS_URLS = [
  'https://media.githubusercontent.com/media/AhmedSaadi0/quran-words/a6d4217a9e1422978c367eadc833ff4883db77fb/data/quranic-corpus-morphology-0.4.txt',
];
const QENC_KEYS = ['uzbek_mansour', 'uzbek_sadiq', 'uzbek_mokhtasar', 'uzbek_moyassar'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, as = 'text') {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'quran-uz-data-fetch' } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === 'json' ? await r.json() : as === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (i >= 5) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const i = k++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
function write(rel, data) {
  const p = path.join(RAW, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  const sum = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  console.log(`${rel}  ${sum}`);
}

// 1. Tanzil
write('tanzil/quran-uthmani.xml', await get('https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml&agree=true'));
write('tanzil/quran-data.js', await get('https://tanzil.net/res/text/metadata/quran-data.js'));

// 2. Quran.com: Muhammad Sodiq (lotin) + izohlar + sura nomlari
const t55 = await get('https://api.quran.com/api/v4/quran/translations/55');
write('qurancom/translation-55.json', t55);
write('qurancom/chapters.json', await get('https://api.quran.com/api/v4/chapters?language=uz'));
const ids = [...t55.matchAll(/foot_note=\\"(\d+)\\"/g)].map((m) => m[1]);
console.log(`izohlar: ${ids.length}`);
const notes = await pool(ids, 6, (id) => get(`https://api.quran.com/api/v4/foot_notes/${id}`, 'json'));
const fn = {};
ids.forEach((id, i) => {
  if (String(notes[i].foot_note.id) !== id) throw new Error('izoh id mos emas: ' + id);
  fn[id] = notes[i].foot_note.text;
});
write('qurancom/footnotes-55.json', JSON.stringify(fn, null, 0));

// 3. QuranEnc
write('quranenc/translations-list-uz.json', await get('https://quranenc.com/api/v1/translations/list/uz'));
for (const key of QENC_KEYS) {
  const suras = await pool(
    Array.from({ length: 114 }, (_, i) => i + 1),
    4,
    (n) => get(`https://quranenc.com/api/v1/translation/sura/${key}/${n}`, 'json'),
  );
  const rows = suras.flatMap((d) => d.result.map(({ id, sura, aya, translation, footnotes }) => ({ id, sura, aya, translation, footnotes })));
  if (rows.length !== 6236) throw new Error(`${key}: ${rows.length} oyat`);
  write(`quranenc/${key}.json`, JSON.stringify(rows, null, 0));
}

// 4. Quranic Arabic Corpus (rasmiy sayt e-pochta so'raydi — GitHub nusxasi, xesh bilan tekshiriladi)
for (const url of CORPUS_URLS) {
  const buf = await get(url, 'buf');
  const txt = buf.toString('utf8').replace(/\r\n/g, '\n');
  const sum = crypto.createHash('sha256').update(txt).digest('hex');
  if (sum !== CORPUS_SHA256) {
    console.warn(`OGOHLANTIRISH: corpus xeshi kutilganidan farq qiladi (${sum}). Fayl yozilmadi.`);
    continue;
  }
  write('corpus/quranic-corpus-morphology-0.4.txt', txt);
  break;
}
console.log('Tayyor. Endi: npm run build');
