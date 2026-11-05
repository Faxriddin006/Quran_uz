import Graph from 'graphology';
import Sigma from 'sigma';
import { h, icon, I } from '../lib/dom.ts';
import { getMeta, fetchJson, refOf } from '../lib/data.ts';
import { setTitle, typeLabel } from '../lib/util.ts';
import type { Route } from '../main.ts';

interface GraphData {
  s: [number, number][];
  r: [number, number][];
  e: number[];
}
interface RootIndex {
  note: string;
  k: string[];
  ar: string[];
  n: number[];
  occ: number[][];
}

let graphP: Promise<GraphData> | null = null;
let indexP: Promise<RootIndex> | null = null;
let arP: Promise<string[]> | null = null;
let docsP: Promise<string[]> | null = null;
const once = <T,>(p: Promise<T> | null, f: () => Promise<T>, set: (v: Promise<T> | null) => void): Promise<T> => {
  if (p) return p;
  const np = f();
  np.catch(() => set(null));
  set(np);
  return np;
};
const getGraph = () => once(graphP, () => fetchJson<GraphData>('roots/graph.json'), (v) => (graphP = v));
const getIndex = () => once(indexP, () => fetchJson<RootIndex>('roots/index.json'), (v) => (indexP = v));
const getAr = () => once(arP, () => fetchJson<string[]>('ar.json'), (v) => (arP = v));
const getDocs = () => once(docsP, () => fetchJson<string[]>('search/docs-t.json'), (v) => (docsP = v));

const MARK_ONLY = /^[ۖ-ۭؕ-ؚ۞۩]+$/;
const normAr = (s: string) =>
  s
    .replace(/[ً-ٰٟۖ-ۭـ\s]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}
function withAlpha(color: string, a: number): string {
  const c = color.trim();
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    const full = c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c;
    const n = parseInt(full.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return c;
}

export async function render(root: HTMLElement, r: Route) {
  setTitle('Ildizlar grafi');
  const meta = await getMeta();

  const stage = h('div', { class: 'g-stage', role: 'img', 'aria-label': 'Suralar va arabcha ildizlar grafi' });
  const loading = h('div', { class: 'g-loading' }, h('div', { class: 'spinner' }), h('span', null, 'Graf yuklanmoqda…'));
  const panel = h('aside', { class: 'g-panel card', 'aria-live': 'polite' });
  const search = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Ildiz (رحم, rHm) yoki sura nomi…',
    'aria-label': 'Ildiz yoki surani qidirish',
    autocomplete: 'off',
  });
  const sugg = h('div', { class: 'g-sugg', role: 'listbox', hidden: true });
  const filterSel = h(
    'select',
    { class: 'field g-filter', 'aria-label': 'Sura boʻyicha filtr' },
    h('option', { value: '' }, 'Barcha suralar'),
    meta.suras.map((s) => h('option', { value: String(s.n) }, `${s.n}. ${s.tr}`)),
  );
  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Yaqinlashtirish', title: 'Yaqinlashtirish' }, '+');
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Uzoqlashtirish', title: 'Uzoqlashtirish' }, '−');
  const zoomReset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Asl holat', title: 'Asl holat' }, icon(I.auto));

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap g-page' },
      h(
        'div',
        { class: 'page-head g-head' },
        h('h1', null, 'Ildizlar grafi'),
        h(
          'p',
          null,
          'Katta tugunlar — suralar, kichiklari — arabcha ildizlar (masalan, ر ح م). Ildiz surada uchrasa, ular bogʻlanadi. Ildizni bossangiz — u uchraydigan barcha oyatlar; oyatni bossangiz — oʻqish sahifasi ochiladi.',
        ),
      ),
      h(
        'div',
        { class: 'g-tools' },
        h('div', { class: 'g-search' }, search, sugg),
        filterSel,
        h('div', { class: 'g-legend' }, h('span', null, h('span', { class: 'dot makkiy' }), 'Makkiy sura'), h('span', null, h('span', { class: 'dot madaniy' }), 'Madaniy sura'), h('span', null, h('span', { class: 'dot root' }), 'Ildiz')),
      ),
      h('div', { class: 'g-layout' }, h('div', { class: 'g-stage-wrap' }, stage, loading, h('div', { class: 'g-zoom' }, zoomIn, zoomOut, zoomReset)), panel),
    ),
  );

  const [gd, idx] = await Promise.all([getGraph(), getIndex(), document.fonts?.load('16px "Amiri Quran"').catch(() => null)]);
  getAr();
  getDocs();

  // ---------- Graf ----------
  const scale = Math.max(0.55, Math.min(1, stage.clientWidth / 1100));
  const graph = new Graph({ type: 'undirected' });
  meta.suras.forEach((s, i) => {
    graph.addNode(`s${s.n}`, { x: gd.s[i][0], y: gd.s[i][1], size: (4 + Math.sqrt(s.ayas) * 0.9) * scale, label: `${s.n}. ${s.tr}`, kind: 's', st: s.type });
  });
  idx.k.forEach((_, ri) => {
    graph.addNode(`r${ri}`, { x: gd.r[ri][0], y: gd.r[ri][1], size: (1.5 + Math.log2(1 + idx.n[ri]) * 0.9) * scale, label: idx.ar[ri], kind: 'r' });
  });
  for (let i = 0; i < gd.e.length; i += 3) graph.addEdge(`s${gd.e[i] + 1}`, `r${gd.e[i + 1]}`, { w: gd.e[i + 2] });

  let C = palette();
  function palette() {
    return {
      mk: cssVar('--makki'),
      md: cssVar('--madani'),
      root: withAlpha(cssVar('--ink-2'), 0.55),
      rootHi: cssVar('--accent'),
      edge: withAlpha(cssVar('--muted'), 0.07),
      edgeHi: withAlpha(cssVar('--accent'), 0.55),
      faded: withAlpha(cssVar('--muted'), 0.12),
      label: cssVar('--ink'),
      surface: cssVar('--surface'),
      line: cssVar('--line-2'),
    };
  }
  function baseColor(attrs: Record<string, unknown>) {
    return attrs.kind === 's' ? (attrs.st === 'makkiy' ? C.mk : C.md) : C.root;
  }

  let hovered: string | null = null;
  let selected: string | null = null;
  let filterSura: number | null = null;
  let filterSet: Set<string> | null = null;
  let focusSet: Set<string> | null = null;

  function updateFocus() {
    const f = hovered ?? selected;
    focusSet = f ? new Set([f, ...graph.neighbors(f)]) : null;
  }

  const renderer = new Sigma(graph, stage, {
    renderEdgeLabels: false,
    hideEdgesOnMove: true,
    hideLabelsOnMove: false,
    labelFont: '"Amiri Quran", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    labelSize: 13,
    labelWeight: '600',
    labelColor: { attribute: 'lc' },
    labelDensity: 0.6,
    labelGridCellSize: 80,
    labelRenderedSizeThreshold: 8,
    zIndex: true,
    minCameraRatio: 0.03,
    maxCameraRatio: 3,
    defaultEdgeColor: C.edge,
    nodeReducer: (node, data) => {
      const res: Record<string, unknown> = { ...data, color: baseColor(data), lc: C.label };
      if (filterSet && !filterSet.has(node)) return { ...res, hidden: true };
      if (focusSet) {
        if (focusSet.has(node)) {
          res.zIndex = 2;
          if (node === hovered || node === selected) {
            res.forceLabel = true;
            res.highlighted = true;
          } else if (data.kind === 'r') res.color = C.rootHi;
          if (data.kind === 'r' && focusSet.size < 60) res.forceLabel = true;
        } else {
          res.color = C.faded;
          res.label = '';
          res.zIndex = 0;
        }
      } else if (filterSet) {
        res.forceLabel = data.kind === 's' || filterSet.size < 80;
      }
      return res;
    },
    edgeReducer: (edge, data) => {
      const res: Record<string, unknown> = { ...data, color: C.edge, size: 0.6 };
      const [a, b] = graph.extremities(edge);
      if (filterSet && (!filterSet.has(a) || !filterSet.has(b))) return { ...res, hidden: true };
      const f = hovered ?? selected;
      if (f) {
        if (a === f || b === f) {
          res.color = C.edgeHi;
          res.size = Math.min(4, 0.6 + Math.log2(1 + (data.w as number)) * 0.5);
          res.zIndex = 1;
        } else res.hidden = true;
      } else if (filterSet) {
        res.color = withAlpha(cssVar('--accent'), 0.25);
      }
      return res;
    },
    defaultDrawNodeHover: (ctx, data, settings) => {
      const size = settings.labelSize;
      const font = settings.labelFont;
      const weight = settings.labelWeight;
      ctx.font = `${weight} ${size}px ${font}`;
      const label = data.label || '';
      const tw = ctx.measureText(label).width;
      const x = data.x;
      const y = data.y;
      ctx.fillStyle = C.surface;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (label) {
        const pad = 6;
        const w = tw + data.size + pad * 2 + 4;
        const hgt = size + pad * 2;
        ctx.roundRect(x - data.size - 3, y - hgt / 2, w + data.size, hgt, 8);
      } else ctx.arc(x, y, data.size + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = data.color;
      ctx.arc(x, y, data.size, 0, Math.PI * 2);
      ctx.fill();
      if (label) {
        ctx.fillStyle = C.label;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + data.size + 5, y + 1);
      }
    },
  });
  loading.remove();

  renderer.on('enterNode', ({ node }) => {
    hovered = node;
    updateFocus();
    stage.style.cursor = 'pointer';
    renderer.refresh({ skipIndexation: true });
  });
  renderer.on('leaveNode', () => {
    hovered = null;
    updateFocus();
    stage.style.cursor = '';
    renderer.refresh({ skipIndexation: true });
  });
  renderer.on('clickNode', ({ node }) => select(node, false));
  renderer.on('clickStage', () => {
    if (selected) select(null, false);
  });

  const camera = renderer.getCamera();
  zoomIn.addEventListener('click', () => camera.animatedZoom({ duration: 300 }));
  zoomOut.addEventListener('click', () => camera.animatedUnzoom({ duration: 300 }));
  zoomReset.addEventListener('click', () => camera.animatedReset({ duration: 400 }));

  function focusNodes(nodes: string[], maxRatio = 1) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of nodes) {
      const d = renderer.getNodeDisplayData(n);
      if (!d) continue;
      x0 = Math.min(x0, d.x);
      y0 = Math.min(y0, d.y);
      x1 = Math.max(x1, d.x);
      y1 = Math.max(y1, d.y);
    }
    if (!isFinite(x0)) return;
    const ratio = Math.min(maxRatio, Math.max(0.08, Math.max(x1 - x0, y1 - y0) * 1.35));
    camera.animate({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, ratio }, { duration: 550 });
  }

  function setUrl() {
    const q = new URLSearchParams();
    if (selected?.startsWith('r')) q.set('ildiz', idx.k[Number(selected.slice(1))]);
    if (selected?.startsWith('s')) q.set('sura', selected.slice(1));
    if (filterSura) q.set('filtr', String(filterSura));
    const s = q.toString();
    history.replaceState(null, '', `#/ildizlar${s ? '?' + s : ''}`);
  }

  function setFilter(n: number | null, fit = true) {
    filterSura = n;
    filterSel.value = n ? String(n) : '';
    if (n) {
      const sn = `s${n}`;
      filterSet = new Set([sn, ...graph.neighbors(sn)]);
      if (fit) focusNodes([...filterSet]);
    } else {
      filterSet = null;
      if (fit) camera.animatedReset({ duration: 450 });
    }
    renderer.refresh({ skipIndexation: true });
    setUrl();
  }
  filterSel.addEventListener('change', () => setFilter(filterSel.value ? Number(filterSel.value) : null));

  function select(node: string | null, fly = true) {
    selected = node;
    updateFocus();
    renderer.refresh({ skipIndexation: true });
    setUrl();
    if (!node) return showIntro();
    if (fly) focusNodes([node, ...graph.neighbors(node)], 0.9);
    if (node.startsWith('r')) showRoot(Number(node.slice(1)));
    else showSura(Number(node.slice(1)));
    if (innerWidth < 900) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Panel ----------
  function showIntro() {
    const top = idx.k
      .map((_, i) => i)
      .slice(0, 14)
      .map((i) => rootChip(i));
    panel.replaceChildren(
      h('h2', null, 'Qanday foydalaniladi'),
      h(
        'ul',
        { class: 'g-help' },
        h('li', null, 'Tugunni bosing: ildiz boʻlsa — oyatlar roʻyxati, sura boʻlsa — undagi ildizlar.'),
        h('li', null, 'Barmoq yoki gʻildirak bilan yaqinlashtiring, suring.'),
        h('li', null, 'Yuqoridagi filtr bilan faqat bitta suraning ildizlarini koʻring.'),
      ),
      h('h3', null, 'Eng koʻp uchraydigan ildizlar'),
      h('div', { class: 'g-chips' }, top),
      h(
        'p',
        { class: 'muted', style: { fontSize: '13px' } },
        `${idx.k.length} ta ildiz, ${gd.e.length / 3} ta sura–ildiz bogʻlanishi. Maʼlumot: Quranic Arabic Corpus (morfologiya v0.4, GNU GPL). Joylashuv ForceAtlas2 algoritmi bilan hisoblangan; masofalar maʼno emas, faqat umumiy ildizlar soni asosida. `,
        h('a', { href: '#/manbalar' }, 'Manbalar'),
      ),
    );
  }

  function rootChip(ri: number) {
    return h(
      'button',
      { class: 'chip ar-chip', type: 'button', onclick: () => select(`r${ri}`), title: `${idx.k[ri]} — ${idx.n[ri]} marta` },
      h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]),
      h('small', null, String(idx.n[ri])),
    );
  }

  function suraCounts(ri: number): [number, number][] {
    const out: [number, number][] = [];
    graph.forEachEdge(`r${ri}`, (_e, attrs, a, b) => {
      const s = a.startsWith('s') ? a : b;
      out.push([Number(s.slice(1)), attrs.w as number]);
    });
    return out.sort((x, y) => y[1] - x[1]);
  }

  async function showRoot(ri: number) {
    const occ = idx.occ[ri];
    const byAya = new Map<number, number[]>();
    for (const v of occ) {
      const g = v >> 8;
      const w = v & 255;
      if (!byAya.has(g)) byAya.set(g, []);
      if (w) byAya.get(g)!.push(w);
    }
    const ayas = [...byAya.keys()].sort((a, b) => a - b);
    const sc = suraCounts(ri);
    const list = h('div', { class: 'g-ayas' }, h('div', { class: 'spinner', style: { width: '22px', height: '22px' } }));
    const forms = h('div', { class: 'g-chips' });
    panel.replaceChildren(
      h('div', { class: 'g-root-head' }, h('span', { class: 'ar g-root-ar', lang: 'ar' }, idx.ar[ri]), h('span', { class: 'muted' }, `ildiz · ${idx.k[ri]}`)),
      h('p', { class: 'g-stats' }, `${idx.n[ri]} marta · ${ayas.length} oyatda · ${sc.length} surada`),
      h('h3', null, 'Matndagi shakllari'),
      forms,
      h('h3', null, 'Eng koʻp uchraydigan suralar'),
      h(
        'div',
        { class: 'g-chips' },
        sc.slice(0, 8).map(([s, c]) => h('button', { class: 'chip', type: 'button', onclick: () => select(`s${s}`) }, `${s}. ${meta.suras[s - 1].tr}`, h('small', null, String(c)))),
      ),
      h('h3', null, `Oyatlar (${ayas.length})`),
      list,
    );
    const [ar, docs] = await Promise.all([getAr(), getDocs().catch(() => null)]);
    if (selected !== `r${ri}`) return;
    // shakllar (Tanzil matnidagi so'zlar, so'zma-so'z)
    const formCount = new Map<string, number>();
    for (const g of ayas) {
      const toks = tokens(ar[g]);
      for (const w of byAya.get(g)!) {
        const t = toks[w - 1]?.t;
        if (t) formCount.set(t, (formCount.get(t) || 0) + 1);
      }
    }
    forms.replaceChildren(
      ...[...formCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([t, c]) => h('span', { class: 'chip ar-chip' }, h('span', { class: 'ar', lang: 'ar' }, t), h('small', null, String(c)))),
    );
    let shown = 0;
    const more = () => {
      const frag = document.createDocumentFragment();
      for (const g of ayas.slice(shown, shown + 25)) {
        const [s, a] = refOf(meta, g);
        const marks = new Set(byAya.get(g)!);
        const p = h('p', { class: 'ar g-aya-ar', lang: 'ar' });
        tokens(ar[g]).forEach((tk, i) => {
          if (i) p.append(' ');
          p.append(tk.w && marks.has(tk.w) ? h('mark', null, tk.t) : tk.t);
        });
        frag.appendChild(
          h(
            'a',
            { class: 'g-aya', href: `#${s}:${a}` },
            h('span', { class: 'g-aya-ref' }, `${s}:${a}`, h('span', { class: 'muted' }, ` · ${meta.suras[s - 1].tr}`)),
            p,
            docs ? h('span', { class: 'g-aya-tr', lang: 'uz' }, docs[g]) : null,
          ),
        );
      }
      shown += 25;
      list.querySelector('.more')?.remove();
      list.appendChild(frag);
      if (shown < ayas.length)
        list.appendChild(h('button', { class: 'btn small more', type: 'button', onclick: more }, `Yana koʻrsatish (${ayas.length - shown})`));
    };
    list.replaceChildren();
    more();
  }

  /** Tanzil oyat matnini so'zlarga ajratadi; to'xtash belgilari so'z raqamiga kirmaydi. */
  function tokens(text: string): { t: string; w: number }[] {
    let w = 0;
    return text.split(' ').map((t) => (MARK_ONLY.test(t) ? { t, w: 0 } : { t, w: ++w }));
  }

  function showSura(n: number) {
    const sm = meta.suras[n - 1];
    const counts: [number, number][] = [];
    let total = 0;
    graph.forEachEdge(`s${n}`, (_e, attrs, a, b) => {
      const rn = a.startsWith('r') ? a : b;
      counts.push([Number(rn.slice(1)), attrs.w as number]);
      total += attrs.w as number;
    });
    counts.sort((x, y) => y[1] - x[1]);
    const tfidf = counts
      .map(([ri, c]) => [ri, (c / total) * Math.log(114 / graph.degree(`r${ri}`))] as [number, number])
      .sort((x, y) => y[1] - x[1]);
    panel.replaceChildren(
      h('div', { class: 'g-root-head' }, h('span', { class: 'ar g-root-ar', lang: 'ar' }, sm.ar), h('span', { class: 'muted' }, `${sm.n}. ${sm.tr}`)),
      h('p', { class: 'g-stats' }, h('span', { class: `badge ${sm.type}` }, typeLabel(sm.type)), ` ${sm.ayas} oyat · ${counts.length} xil ildiz · ${total} ta ildizli soʻz`),
      h(
        'div',
        { class: 'g-chips' },
        h('a', { class: 'btn small primary', href: `#${n}` }, icon(I.book), 'Surani oʻqish'),
        filterSura === n
          ? h('button', { class: 'btn small', type: 'button', onclick: () => setFilter(null) }, 'Filtrni olib tashlash')
          : h('button', { class: 'btn small', type: 'button', onclick: () => setFilter(n) }, 'Faqat shu sura'),
      ),
      h('h3', null, 'Eng koʻp uchraydigan ildizlar'),
      h('div', { class: 'g-chips' }, counts.slice(0, 14).map(([ri]) => rootChip(ri))),
      h('h3', null, 'Shu suraga xos ildizlar'),
      h('p', { class: 'muted', style: { fontSize: '12.5px', margin: '-4px 0 8px' } }, 'Algoritm bilan hisoblangan (TF-IDF): shu surada koʻp, boshqa suralarda kam uchraydigan ildizlar. Bu tafsir yoki mavzu tasnifi emas.'),
      h('div', { class: 'g-chips' }, tfidf.slice(0, 12).map(([ri]) => rootChip(ri))),
    );
  }

  // ---------- Qidiruv ----------
  function suggest(q: string) {
    const v = q.trim();
    if (!v) return [];
    const out: { label: Node[]; node: string }[] = [];
    const lat = v.toLowerCase().replace(/['`ʻʼ‘’\-\s]/g, '');
    for (const s of meta.suras) {
      if (String(s.n) === v || s.tr.toLowerCase().replace(/['`ʻʼ‘’\-\s]/g, '').includes(lat) || (/[؀-ۿ]/.test(v) && normAr(s.ar).includes(normAr(v))))
        out.push({ node: `s${s.n}`, label: [document.createTextNode(`${s.n}. ${s.tr} `), h('span', { class: 'ar', lang: 'ar' }, s.ar)] });
      if (out.length >= 5) break;
    }
    const isAr = /[؀-ۿ]/.test(v);
    const na = normAr(v);
    for (let ri = 0; ri < idx.k.length && out.length < 12; ri++) {
      const hit = isAr ? normAr(idx.ar[ri]) === na || (na.length >= 2 && normAr(idx.ar[ri]).startsWith(na)) : idx.k[ri] === v || (v.length >= 2 && idx.k[ri].startsWith(v));
      if (hit) out.push({ node: `r${ri}`, label: [h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]), document.createTextNode(` ildiz · ${idx.k[ri]} · ${idx.n[ri]} marta`)] });
    }
    return out;
  }
  let suggItems: { node: string; label: Node[] }[] = [];
  search.addEventListener('input', () => {
    suggItems = suggest(search.value);
    sugg.replaceChildren(
      ...suggItems.map((it) =>
        h(
          'button',
          {
            type: 'button',
            role: 'option',
            onclick: () => {
              sugg.hidden = true;
              select(it.node);
            },
          },
          it.label,
        ),
      ),
    );
    sugg.hidden = !suggItems.length;
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && suggItems[0]) {
      e.preventDefault();
      sugg.hidden = true;
      select(suggItems[0].node);
    }
    if (e.key === 'Escape') sugg.hidden = true;
  });
  const closeSugg = (e: Event) => {
    if (!(e.target as HTMLElement).closest('.g-search')) sugg.hidden = true;
  };
  document.addEventListener('click', closeSugg);

  const onTheme = () => {
    C = palette();
    renderer.refresh({ skipIndexation: true });
  };
  window.addEventListener('quz:theme', onTheme);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onTheme);

  // ---------- Boshlang'ich holat (URL) ----------
  const q = r.query;
  const f = Number(q?.get('filtr'));
  if (f >= 1 && f <= 114) setFilter(f, false);
  const ik = q?.get('ildiz');
  const sn = Number(q?.get('sura'));
  const ri = ik ? idx.k.indexOf(ik) : -1;
  if (ri >= 0) select(`r${ri}`, true);
  else if (sn >= 1 && sn <= 114) select(`s${sn}`, true);
  else showIntro();
  if (f && ri < 0 && !(sn >= 1)) focusNodes([...(filterSet ?? [])]);

  return () => {
    window.removeEventListener('quz:theme', onTheme);
    mq.removeEventListener('change', onTheme);
    document.removeEventListener('click', closeSugg);
    renderer.kill();
  };
}
