// data/raw/ dagi manbalardan public/data/ ni yaratadi.
// QOIDA: Qur'on matni, tarjimalar va izohlar so'zma-so'z ko'chiriladi.
// Skript ularni o'zgartirmaydi; faqat qidiruv indeksi uchun normallashtirish qilinadi.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import MiniSearch from 'minisearch';
import { tokenize, normTerm, stripFootnoteMarks } from '../src/lib/normalize.ts';
import { buildRoots } from './build-roots.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = path.join(ROOT, 'public/data');

const read = (p) => fs.readFileSync(path.join(RAW, p), 'utf8');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(RAW, p))).digest('hex');
function check(cond, msg) {
  if (!cond) throw new Error('TEKSHIRUV XATOSI: ' + msg);
}
function writeJson(rel, obj) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
  return fs.statSync(p).size;
}

// ---------- 1. Tanzil metama'lumotlari (quran-data.js, eval qilinmaydi) ----------
function parseRow(s) {
  const cells = [];
  const re = /\s*(?:'([^']*)'|"([^"]*)"|(-?\d+))\s*(?:,|$)/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1] !== undefined) cells.push(m[1]);
    else if (m[2] !== undefined) cells.push(m[2]);
    else cells.push(Number(m[3]));
  }
  return cells;
}
function parseQuranData(src, name) {
  const start = src.indexOf(`QuranData.${name} = [`);
  check(start >= 0, `quran-data.js: ${name} topilmadi`);
  const end = src.indexOf('];', start);
  const body = src.slice(src.indexOf('[', start) + 1, end).replace(/\/\/[^\n]*/g, '');
  const rows = [];
  for (const m of body.matchAll(/\[([^\[\]]*)\]/g)) rows.push(parseRow(m[1]));
  return rows.slice(1); // birinchi bo'sh [] tashlab yuboriladi
}

const metaSrc = read('tanzil/quran-data.js');
const suraRows = parseQuranData(metaSrc, 'Sura').filter((r) => r.length === 8);
check(suraRows.length === 114, 'suralar soni 114 emas');
const juzRows = parseQuranData(metaSrc, 'Juz');
const hizbRows = parseQuranData(metaSrc, 'HizbQaurter');
const pageRows = parseQuranData(metaSrc, 'Page');
const sajdaRows = parseQuranData(metaSrc, 'Sajda');
const manzilRows = parseQuranData(metaSrc, 'Manzil');
check(juzRows.length === 31, 'juz soni (30 + yakun belgisi)');
check(hizbRows.length === 241, 'hizb choraklari soni (240 + yakun belgisi)');
check(pageRows.length === 605, 'sahifalar soni (604 + yakun belgisi)');
check(sajdaRows.length === 15, 'sajda oyatlari soni');

// quran.com bob nomlari (lotin transliteratsiyasi)
const qcomChapters = JSON.parse(read('qurancom/chapters.json')).chapters;
check(qcomChapters.length === 114, 'quran.com boblar soni');

// ---------- 2. Tanzil Usmoniy matn (XML) ----------
const xml = read('tanzil/quran-uthmani.xml');
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const suras = [];
for (const sm of xml.matchAll(/<sura index="(\d+)" name="([^"]*)">([\s\S]*?)<\/sura>/g)) {
  const n = Number(sm[1]);
  const ayas = [];
  let bismillah = null;
  for (const am of sm[3].matchAll(/<aya index="(\d+)" text="([^"]*)"(?: bismillah="([^"]*)")?\s*\/>/g)) {
    check(Number(am[1]) === ayas.length + 1, `${n}-sura oyat tartibi`);
    ayas.push(decode(am[2]));
    if (am[3] !== undefined) {
      check(Number(am[1]) === 1, 'bismillah faqat 1-oyatda');
      bismillah = decode(am[3]);
    }
  }
  suras.push({ n, name: decode(sm[2]), ayas, bismillah });
}
check(suras.length === 114, 'XML: suralar soni');
const totalAyas = suras.reduce((a, s) => a + s.ayas.length, 0);
check(totalAyas === 6236, 'XML: oyatlar soni 6236 emas: ' + totalAyas);
suras.forEach((s, i) => {
  check(s.ayas.length === suraRows[i][1], `${s.n}-sura oyatlar soni metama'lumot bilan mos emas`);
  check(s.name === suraRows[i][4], `${s.n}-sura arabcha nomi mos emas`);
  check(qcomChapters[i].id === s.n && qcomChapters[i].verses_count === s.ayas.length, `${s.n}: quran.com mosligi`);
});
// Qo'shimcha: XML matni Tanzil txt bilan solishtiriladi (agar mavjud bo'lsa) — skript buni talab qilmaydi.

// ---------- 3. Tarjimalar ----------
// 3a. Muhammad Sodiq Muhammad Yusuf (lotin) — quran.com API v4, resource 55
const sodiqLatRaw = JSON.parse(read('qurancom/translation-55.json')).translations;
check(sodiqLatRaw.length === 6236, 'sodiq_lat: 6236 emas');
const sodiqLatFn = JSON.parse(read('qurancom/footnotes-55.json'));
// 3b. QuranEnc nashrlari: Muhammad Sodiq (kirill), Alouddin Mansur (kirill), 2 ta tafsir
function loadQenc(key) {
  const rows = JSON.parse(read(`quranenc/${key}.json`));
  check(rows.length === 6236, `${key}: 6236 emas`);
  return rows;
}
const sodiqCyr = loadQenc('uzbek_sadiq');
const mansur = loadQenc('uzbek_mansour');
const mokhtasar = loadQenc('uzbek_mokhtasar');
const moyassar = loadQenc('uzbek_moyassar');
const qencList = JSON.parse(read('quranenc/translations-list-uz.json')).translations;
const mansurInfo = qencList.find((t) => t.key === 'uzbek_mansour');
check(mansurInfo, "QuranEnc ro'yxatida uzbek_mansour yo'q");
const RETRIEVED = '2026-11-05';

const EDITIONS = [
  {
    id: 'sodiq_lat',
    title: 'Muhammad Sodiq Muhammad Yusuf',
    script: 'lotin',
    note: "Izohlar alohida (izoh belgisini bosing)",
    source: 'Quran.com API v4 (translation resource 55)',
    sourceUrl: 'https://api.quran.com/api/v4/quran/translations/55',
  },
  {
    id: 'mansur_cyr',
    title: 'Alouddin Mansur',
    script: 'kirill',
    note: `QuranEnc, versiya ${mansurInfo.version}`,
    source: `QuranEnc.com — uzbek_mansour v${mansurInfo.version}`,
    sourceUrl: 'https://quranenc.com/en/browse/uzbek_mansour',
  },
  {
    id: 'sodiq_cyr',
    title: 'Muhammad Sodiq Muhammad Yusuf',
    script: 'kirill',
    note: 'Izohlar alohida (izoh belgisini bosing)',
    source: `QuranEnc.com — uzbek_sadiq (olingan: ${RETRIEVED})`,
    sourceUrl: 'https://quranenc.com/en/browse/uzbek_sadiq',
  },
];
const TAFSIRS = [
  {
    id: 'mokhtasar',
    key: 'uzbek_mokhtasar',
    title: "Al-Muxtasar fi tafsiril Qur'onil Karim",
    note: 'QuranEnc tavsifi: «Uzbek Translation of Al-Mukhtasar in Interpreting the Noble Qur’an»',
    source: `QuranEnc.com — uzbek_mokhtasar (olingan: ${RETRIEVED})`,
    sourceUrl: 'https://quranenc.com/en/browse/uzbek_mokhtasar',
    rows: mokhtasar,
  },
  {
    id: 'moyassar',
    key: 'uzbek_moyassar',
    title: 'At-Tafsir al-Muyassar',
    note: 'QuranEnc tavsifi: «Translation of At-Tafsīr Al-Muyassar into the Uzbek language, translated by Ismail Yaqub and reviewed by members of the Islamic Center IxlosOrg.»',
    source: `QuranEnc.com — uzbek_moyassar (olingan: ${RETRIEVED})`,
    sourceUrl: 'https://quranenc.com/en/browse/uzbek_moyassar',
    rows: moyassar,
  },
];

// ---------- 4. Har bir sura uchun fayl ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const FN_RE = /<sup foot_note="(\d+)">\d+<\/sup>/g;
let g = 0; // global oyat indeksi (0..6235)
const suraMeta = [];
const searchDocs = { t: [], m: [] };
for (let i = 0; i < 114; i++) {
  const s = suras[i];
  const row = suraRows[i];
  check(row[0] === g, `${s.n}-sura boshlanish indeksi`);
  const tr = { sodiq_lat: [], mansur_cyr: [], sodiq_cyr: [] };
  const fn = { sodiq_lat: {}, mansur_cyr: [], sodiq_cyr: [] };
  const taf = Object.fromEntries(TAFSIRS.map((t) => [t.id, []]));
  for (let a = 1; a <= s.ayas.length; a++, g++) {
    const lat = sodiqLatRaw[g].text;
    const cyr = sodiqCyr[g];
    const man = mansur[g];
    check(Number(cyr.sura) === s.n && Number(cyr.aya) === a, `sodiq_cyr tartibi ${s.n}:${a}`);
    check(Number(man.sura) === s.n && Number(man.aya) === a, `mansur tartibi ${s.n}:${a}`);
    check(lat && cyr.translation && man.translation, `bo'sh tarjima ${s.n}:${a}`);
    // quran.com matnida faqat izoh belgilari bo'lishi mumkin, boshqa HTML yo'q
    check(!/<(?!sup foot_note="\d+">\d+<\/sup>|\/sup>)/.test(lat), `kutilmagan HTML ${s.n}:${a}`);
    for (const m of lat.matchAll(FN_RE)) {
      check(sodiqLatFn[m[1]] !== undefined, `izoh topilmadi ${m[1]}`);
      fn.sodiq_lat[m[1]] = sodiqLatFn[m[1]];
    }
    tr.sodiq_lat.push(lat);
    tr.sodiq_cyr.push(cyr.translation);
    fn.sodiq_cyr.push(cyr.footnotes || '');
    for (const t of TAFSIRS) {
      const r = t.rows[g];
      check(Number(r.sura) === s.n && Number(r.aya) === a && r.translation, `${t.key} ${s.n}:${a}`);
      taf[t.id].push(r.footnotes ? [r.translation, r.footnotes] : r.translation);
    }
    tr.mansur_cyr.push(man.translation);
    fn.mansur_cyr.push(man.footnotes || '');
    searchDocs.t.push(stripFootnoteMarks(lat));
    searchDocs.m.push(man.translation);
  }
  const ch = qcomChapters[i];
  suraMeta.push({
    n: s.n,
    ar: s.name,
    tr: ch.name_simple, // lotin transliteratsiyasi (quran.com)
    tz: row[5], // Tanzil transliteratsiyasi
    ayas: s.ayas.length,
    start: row[0],
    order: row[2], // nuzul tartibi (Tanzil)
    rukus: row[3],
    type: row[7] === 'Meccan' ? 'makkiy' : 'madaniy',
  });
  writeJson(`s/${s.n}.json`, { n: s.n, b: s.bismillah, ar: s.ayas, tr, fn });
  for (const t of TAFSIRS) writeJson(`tafsir/${t.id}/${s.n}.json`, taf[t.id]);
}
check(g === 6236, 'jami oyatlar');

// ---------- 5. Meta ----------
const meta = {
  suras: suraMeta,
  juz: juzRows, // [sura, aya] — 30 ta + yakun
  hizbQuarters: hizbRows, // 240 ta + yakun
  manzil: manzilRows,
  pages: pageRows, // 604 ta + yakun
  sajdas: sajdaRows,
  editions: EDITIONS,
  tafsirs: TAFSIRS.map(({ rows, ...t }) => t),
  sources: {
    tanzilText: { file: 'tanzil/quran-uthmani.xml', sha256: sha256('tanzil/quran-uthmani.xml') },
    tanzilMeta: { file: 'tanzil/quran-data.js', sha256: sha256('tanzil/quran-data.js') },
    sodiqLat: { file: 'qurancom/translation-55.json', sha256: sha256('qurancom/translation-55.json') },
    sodiqLatFootnotes: { file: 'qurancom/footnotes-55.json', sha256: sha256('qurancom/footnotes-55.json') },
    sodiqCyr: { file: 'quranenc/uzbek_sadiq.json', sha256: sha256('quranenc/uzbek_sadiq.json') },
    mansur: { file: 'quranenc/uzbek_mansour.json', sha256: sha256('quranenc/uzbek_mansour.json'), version: mansurInfo.version },
    mokhtasar: { file: 'quranenc/uzbek_mokhtasar.json', sha256: sha256('quranenc/uzbek_mokhtasar.json') },
    moyassar: { file: 'quranenc/uzbek_moyassar.json', sha256: sha256('quranenc/uzbek_moyassar.json') },
    corpus: {
      file: 'corpus/quranic-corpus-morphology-0.4.txt',
      sha256: sha256('corpus/quranic-corpus-morphology-0.4.txt'),
    },
  },
  built: new Date().toISOString().slice(0, 10),
};
writeJson('meta.json', meta);

// ---------- 6. Qidiruv indeksi (MiniSearch, oldindan qurilgan) ----------
const ms = new MiniSearch({
  idField: 'id',
  fields: ['t', 'm'],
  tokenize,
  processTerm: normTerm,
});
ms.addAll(searchDocs.t.map((t, id) => ({ id, t, m: searchDocs.m[id] })));
const idxSize = writeJson('search/index.json', ms.toJSON());
const docsSize = writeJson('search/docs-t.json', searchDocs.t) + writeJson('search/docs-m.json', searchDocs.m);

// ---------- 7. Ildizlar (Quranic Arabic Corpus) ----------
const rootsInfo = buildRoots({ RAW, OUT, suraMeta, writeJson, check, ayaTexts: suras.map((s) => s.ayas) });

console.log(
  `OK: 114 sura, ${g} oyat, 3 tarjima. Indeks ${(idxSize / 1e6).toFixed(2)} MB, hujjatlar ${(docsSize / 1e6).toFixed(2)} MB.`,
);
if (rootsInfo) console.log(rootsInfo);
