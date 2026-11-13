// Ildizlar grafi: Quranic Arabic Corpus (morfologiya v0.4) dan sura–ildiz grafi.
// Faqat ROOT belgilari va joylashuvlari ishlatiladi. Joylashuv (layout) build vaqtida
// ForceAtlas2 bilan oldindan hisoblanadi — telefonda fizika simulyatsiyasi kerak emas.
import fs from 'node:fs';
import path from 'node:path';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';

// Buckwalter -> arab harflari (faqat ildizlarda uchraydigan undoshlar)
const BW = {
  "'": 'ء', '>': 'أ', '<': 'إ', '&': 'ؤ', '}': 'ئ', '|': 'آ', A: 'ا', b: 'ب', p: 'ة', t: 'ت', v: 'ث', j: 'ج', H: 'ح',
  x: 'خ', d: 'د', '*': 'ذ', r: 'ر', z: 'ز', s: 'س', $: 'ش', S: 'ص', D: 'ض', T: 'ط', Z: 'ظ', E: 'ع', g: 'غ',
  f: 'ف', q: 'ق', k: 'ك', l: 'ل', m: 'م', n: 'ن', h: 'ه', w: 'و', Y: 'ى', y: 'ي',
};
// Tanzil matnida alohida so'z bo'lmagan to'xtash/sajda belgilari
const MARK_ONLY = /^[ۖ-ۭؕ-ؚ۞۩]+$/;

const ROOT_TOP = Number(process.env.ROOT_TOP || 2);
const SURA_TOP = Number(process.env.SURA_TOP || 20);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildRoots({ RAW, OUT, suraMeta, writeJson, check, ayaTexts }) {
  const t0 = Date.now();
  const src = fs.readFileSync(path.join(RAW, 'corpus/quranic-corpus-morphology-0.4.txt'), 'utf8');
  check(src.includes('Quranic Arabic Corpus (morphology, version 0.4)'), 'corpus sarlavhasi');

  const starts = suraMeta.map((s) => s.start);
  const wordsPerAya = new Map();
  const roots = new Map(); // key -> { occ: [gid*256+w], suras: Map(s -> count) }
  for (const line of src.split('\n')) {
    const m = /^\((\d+):(\d+):(\d+):(\d+)\)\t[^\t]*\t[^\t]*\t(.*)$/.exec(line);
    if (!m) continue;
    const s = +m[1];
    const a = +m[2];
    const w = +m[3];
    const gid = starts[s - 1] + a - 1;
    wordsPerAya.set(gid, Math.max(wordsPerAya.get(gid) || 0, w));
    const r = /ROOT:([^|]+)/.exec(m[5]);
    if (!r) continue;
    let o = roots.get(r[1]);
    if (!o) roots.set(r[1], (o = { occ: [], suras: new Map() }));
    o.occ.push(gid * 256 + w);
    o.suras.set(s, (o.suras.get(s) || 0) + 1);
  }
  check(wordsPerAya.size === 6236, 'corpus: oyatlar soni');

  // Corpus so'z raqamlari Tanzil 1.1 matnidagi so'zlarga mos keladimi? (mos kelmasa — so'z ko'rsatilmaydi)
  const aligned = new Uint8Array(6236);
  let g = 0;
  let misaligned = 0;
  for (const ayas of ayaTexts)
    for (const text of ayas) {
      const toks = text.split(' ').filter((t) => t && !MARK_ONLY.test(t));
      aligned[g] = toks.length === wordsPerAya.get(g) ? 1 : 0;
      if (!aligned[g]) misaligned++;
      g++;
    }

  const keys = [...roots.keys()].sort((a, b) => roots.get(b).occ.length - roots.get(a).occ.length || (a < b ? -1 : 1));
  const toAr = (k) =>
    [...k]
      .map((c) => {
        check(BW[c], `noma'lum Buckwalter belgisi: ${c} (${k})`);
        return BW[c];
      })
      .join(' ');

  // ---------- Graf ----------
  // Har bir sura–ildiz juftligi uchun "xoslik" (TF-IDF): ildiz shu surada nisbatan ko'p,
  // boshqa suralarda kam uchrasa — yuqori. Joylashuv faqat "kuchli" bog'lanishlar bo'yicha
  // hisoblanadi, aks holda 17 ming qirra hammasini markazga tortib, "soch tugunchasi" hosil qiladi.
  const suraTotal = new Array(115).fill(0);
  for (const k of keys) for (const [s, c] of roots.get(k).suras) suraTotal[s] += c;
  const tfidf = (k, s, c) => (c / suraTotal[s]) * Math.log(114 / roots.get(k).suras.size);
  const strong = new Set(); // "s|ri"
  const perSura = Array.from({ length: 115 }, () => []);
  keys.forEach((k, ri) => {
    const arr = [...roots.get(k).suras].map(([s, c]) => [s, c / suraTotal[s], c]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [s] of arr.slice(0, ROOT_TOP)) strong.add(`${s}|${ri}`);
    for (const [s, , c] of arr) perSura[s].push([ri, tfidf(k, s, c)]);
  });
  for (let s = 1; s <= 114; s++) {
    perSura[s].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [ri] of perSura[s].slice(0, SURA_TOP)) strong.add(`${s}|${ri}`);
  }

  const G = new Graph({ type: 'undirected' });
  const rand = mulberry32(114);
  suraMeta.forEach((s, i) => {
    const ang = (i / 114) * Math.PI * 2 - Math.PI / 2;
    G.addNode(`s${s.n}`, { x: Math.cos(ang) * 100, y: Math.sin(ang) * 100, size: 4 + Math.sqrt(s.ayas) * 0.9 });
  });
  keys.forEach((k, ri) => {
    const o = roots.get(k);
    let x = 0,
      y = 0,
      tot = 0;
    for (const [s] of o.suras) {
      if (!strong.has(`${s}|${ri}`)) continue;
      x += G.getNodeAttribute(`s${s}`, 'x');
      y += G.getNodeAttribute(`s${s}`, 'y');
      tot++;
    }
    G.addNode(`r${ri}`, { x: x / tot + (rand() - 0.5) * 12, y: y / tot + (rand() - 0.5) * 12, size: 1.5 + Math.log2(1 + o.occ.length) * 0.9 });
    for (const [s] of o.suras) if (strong.has(`${s}|${ri}`)) G.addEdge(`s${s}`, `r${ri}`, { weight: 1 });
  });
  forceAtlas2.assign(G, {
    iterations: 700,
    settings: {
      barnesHutOptimize: true,
      barnesHutTheta: 0.6,
      gravity: 1.2,
      scalingRatio: 12,
      strongGravityMode: false,
      outboundAttractionDistribution: false,
      linLogMode: false,
      adjustSizes: false,
      slowDown: 3,
    },
  });
  noverlap.assign(G, { maxIterations: 120, settings: { ratio: 1.15, margin: 1.2 } });

  const round = (v) => Math.round(v * 100) / 100;
  const sPos = suraMeta.map((s) => {
    const a = G.getNodeAttributes(`s${s.n}`);
    return [round(a.x), round(a.y)];
  });
  const rPos = keys.map((k, ri) => {
    const a = G.getNodeAttributes(`r${ri}`);
    return [round(a.x), round(a.y)];
  });
  // qirralar: [sura indeksi, ildiz indeksi, soni, kuchli(1/0)]
  const edges = [];
  keys.forEach((k, ri) => {
    for (const [s, c] of roots.get(k).suras) edges.push(s - 1, ri, c, strong.has(`${s}|${ri}`) ? 1 : 0);
  });

  const graphSize = writeJson('roots/graph.json', { v4: 1, s: sPos, r: rPos, e: edges });
  const indexSize = writeJson('roots/index.json', {
    note: 'Manba: Quranic Arabic Corpus (morphology v0.4), corpus.quran.com — GNU GPL. Faqat ROOT belgilari va joylashuvlari.',
    k: keys,
    ar: keys.map(toAr),
    n: keys.map((k) => roots.get(k).occ.length),
    // occ: gid*256 + so'z raqami (so'z Tanzil matniga mos kelmasa: gid*256)
    occ: keys.map((k) => roots.get(k).occ.map((v) => (aligned[v >> 8] ? v : (v >> 8) * 256))),
  });
  // Arabcha matn (faqat Tanzil, so'zma-so'z) — ildiz panelida oyatlarni ko'rsatish uchun
  const arSize = writeJson('ar.json', ayaTexts.flat());
  return `Ildizlar: ${keys.length} ildiz, ${edges.length / 4} bog'lanish (${strong.size} kuchli), ${misaligned} oyatda so'z moslanmadi; graf ${(graphSize / 1e3).toFixed(0)} KB, indeks ${(indexSize / 1e3).toFixed(0)} KB, ar.json ${(arSize / 1e6).toFixed(2)} MB; ${((Date.now() - t0) / 1000).toFixed(1)} s`;
}
