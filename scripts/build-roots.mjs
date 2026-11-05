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
  const G = new Graph({ type: 'undirected' });
  const rand = mulberry32(114);
  suraMeta.forEach((s, i) => {
    const ang = (i / 114) * Math.PI * 2;
    G.addNode(`s${s.n}`, { x: Math.cos(ang) * 100, y: Math.sin(ang) * 100, size: 4 + Math.sqrt(s.ayas) * 0.9 });
  });
  keys.forEach((k, ri) => {
    const o = roots.get(k);
    let x = 0,
      y = 0,
      tot = 0;
    for (const [s, c] of o.suras) {
      x += G.getNodeAttribute(`s${s}`, 'x') * c;
      y += G.getNodeAttribute(`s${s}`, 'y') * c;
      tot += c;
    }
    G.addNode(`r${ri}`, { x: x / tot + (rand() - 0.5) * 8, y: y / tot + (rand() - 0.5) * 8, size: 1.5 + Math.log2(1 + o.occ.length) * 0.9 });
    for (const [s, c] of o.suras) G.addEdge(`s${s}`, `r${ri}`, { weight: c });
  });
  forceAtlas2.assign(G, {
    iterations: 600,
    settings: {
      barnesHutOptimize: true,
      barnesHutTheta: 0.6,
      gravity: 0.6,
      scalingRatio: 6,
      strongGravityMode: false,
      outboundAttractionDistribution: true,
      linLogMode: true,
      edgeWeightInfluence: 0.5,
      adjustSizes: false,
      slowDown: 2,
    },
  });
  noverlap.assign(G, { maxIterations: 60, settings: { ratio: 1.05, margin: 0.5 } });

  const round = (v) => Math.round(v * 100) / 100;
  const sPos = suraMeta.map((s) => {
    const a = G.getNodeAttributes(`s${s.n}`);
    return [round(a.x), round(a.y)];
  });
  const rPos = keys.map((k, ri) => {
    const a = G.getNodeAttributes(`r${ri}`);
    return [round(a.x), round(a.y)];
  });
  const edges = [];
  keys.forEach((k, ri) => {
    for (const [s, c] of roots.get(k).suras) edges.push(s - 1, ri, c);
  });

  const graphSize = writeJson('roots/graph.json', { s: sPos, r: rPos, e: edges });
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
  return `Ildizlar: ${keys.length} ildiz, ${edges.length / 3} bog'lanish, ${misaligned} oyatda so'z moslanmadi; graf ${(graphSize / 1e3).toFixed(0)} KB, indeks ${(indexSize / 1e3).toFixed(0)} KB, ar.json ${(arSize / 1e6).toFixed(2)} MB; ${((Date.now() - t0) / 1000).toFixed(1)} s`;
}
