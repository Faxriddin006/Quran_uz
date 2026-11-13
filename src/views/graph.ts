import Graph from 'graphology';
import Sigma from 'sigma';
import { h, icon, I, append, type Child } from '../lib/dom.ts';
import { getMeta, fetchJson, refOf, getRootIndex, getAr } from '../lib/data.ts';
import { normAr, matchSura } from '../lib/normalize.ts';
import { setTitle, typeLabel, debounce } from '../lib/util.ts';
import type { Route } from '../main.ts';

interface GraphData {
  s: [number, number][];
  r: [number, number][];
  /** [sura indeksi, ildiz indeksi, soni, kuchli(1/0)] ketma-ketligi */
  e: number[];
}

let graphP: Promise<GraphData> | null = null;
let docsP: Promise<string[]> | null = null;
const once = <T,>(p: Promise<T> | null, f: () => Promise<T>, set: (v: Promise<T> | null) => void): Promise<T> => {
  if (p) return p;
  const np = f();
  np.catch(() => set(null));
  set(np);
  return np;
};
const getGraph = () => once(graphP, () => fetchJson<GraphData>('roots/graph.json'), (v) => (graphP = v));
const getDocs = () => once(docsP, () => fetchJson<string[]>('search/docs-t.json'), (v) => (docsP = v));

const MARK_ONLY = /^[ۖ-ۭؕ-ؚ۞۩]+$/;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Ikki rangni aralashtiradi (WebGL'da shaffoflik o'rniga tiniq rang ishlatish uchun) */
function mix(fg: string, bg: string, t: number): string {
  const p = (c: string) => {
    const x = c.trim();
    const full = x.length === 4 ? '#' + [...x.slice(1)].map((v) => v + v).join('') : x;
    const n = parseInt(full.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  if (!fg.trim().startsWith('#') || !bg.trim().startsWith('#')) return fg;
  const a = p(fg);
  const b = p(bg);
  return '#' + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

const FREQ_STEPS = [1, 2, 5, 10, 25, 50, 100];

export async function render(root: HTMLElement, r: Route) {
  setTitle('Ildizlar grafi');
  const meta = await getMeta();

  // ---------- Qobiq ----------
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
  const freqOut = h('output', { class: 'g-freq-out' });
  const freqInp = h('input', { type: 'range', min: '0', max: String(FREQ_STEPS.length - 1), step: '1', value: '0', 'aria-label': 'Ildizning eng kam uchrash soni' });
  const edgesBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', title: 'Asosiy bogʻlanish chiziqlarini koʻrsatish' }, 'Chiziqlar');
  const zoomIn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Yaqinlashtirish', title: 'Yaqinlashtirish' }, '+');
  const zoomOut = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Uzoqlashtirish', title: 'Uzoqlashtirish' }, '−');
  const zoomReset = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Toʻliq koʻrinish', title: 'Toʻliq koʻrinish' }, icon(I.auto));
  const fullBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Toʻliq ekran', title: 'Toʻliq ekran', 'aria-pressed': 'false' }, icon(I.expand));
  const stageWrap = h('div', { class: 'g-stage-wrap' }, stage, loading, h('div', { class: 'g-zoom' }, fullBtn, zoomIn, zoomOut, zoomReset));
  const hint = h('div', { class: 'g-hint', hidden: true });
  stageWrap.appendChild(hint);

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
          'Rangli tugunlar — suralar, kichik kulranglari — arabcha ildizlar. Har bir ildiz oʻzi eng xos boʻlgan suralar yoniga joylashadi, shuning uchun yaqin turgan suralar koʻproq umumiy ildizlarga ega. Tugunni bosing.',
        ),
      ),
      h(
        'div',
        { class: 'g-tools' },
        h('div', { class: 'g-search' }, search, sugg),
        filterSel,
        h('label', { class: 'g-freq' }, h('span', null, 'Chastota'), freqInp, freqOut),
        edgesBtn,
        h(
          'div',
          { class: 'g-legend' },
          h('span', null, h('span', { class: 'dot makkiy' }), 'Makkiy'),
          h('span', null, h('span', { class: 'dot madaniy' }), 'Madaniy'),
          h('span', null, h('span', { class: 'dot root' }), 'Ildiz'),
        ),
      ),
      h('div', { class: 'g-layout' }, stageWrap, panel),
    ),
  );

  const [gd, idx] = await Promise.all([getGraph(), getRootIndex(), document.fonts?.load('16px "Amiri Quran"').catch(() => null)]);
  // Sahifa qobig'i avval chizilsin, keyin og'ir graf qurilsin
  await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  if (!stage.isConnected) return;

  // ---------- Bog'lanishlar (to'liq ro'yxat xotirada, grafda faqat kuchlilari) ----------
  const NR = idx.k.length;
  const suraAdj: [number, number][][] = Array.from({ length: 115 }, () => []); // s -> [ri, soni]
  const rootAdj: [number, number][][] = Array.from({ length: NR }, () => []); // ri -> [s, soni]
  const suraTotal = new Float64Array(115);
  const strongKeys = new Set<number>();
  const ekey = (s: number, ri: number) => s * 4096 + ri;
  for (let i = 0; i < gd.e.length; i += 4) {
    const s = gd.e[i] + 1;
    const ri = gd.e[i + 1];
    const c = gd.e[i + 2];
    suraAdj[s].push([ri, c]);
    rootAdj[ri].push([s, c]);
    suraTotal[s] += c;
    if (gd.e[i + 3]) strongKeys.add(ekey(s, ri));
  }
  for (let s = 1; s <= 114; s++) suraAdj[s].sort((a, b) => b[1] - a[1]);
  for (const a of rootAdj) a.sort((x, y) => y[1] - x[1]);
  const idf = (ri: number) => Math.log(114 / rootAdj[ri].length);
  const tfidf = (s: number, ri: number, c: number) => (c / suraTotal[s]) * idf(ri);
  const suraNorm = new Float64Array(115);
  for (let s = 1; s <= 114; s++) {
    let q = 0;
    for (const [ri, c] of suraAdj[s]) q += tfidf(s, ri, c) ** 2;
    suraNorm[s] = Math.sqrt(q);
  }
  /** Ildizlar tarkibi bo'yicha o'xshashlik (TF-IDF kosinus), 0..1 */
  function similar(s: number): [number, number][] {
    const dot = new Float64Array(115);
    for (const [ri, c] of suraAdj[s]) {
      const w = tfidf(s, ri, c);
      for (const [t, c2] of rootAdj[ri]) if (t !== s) dot[t] += w * tfidf(t, ri, c2);
    }
    const out: [number, number][] = [];
    for (let t = 1; t <= 114; t++) if (t !== s && dot[t] > 0) out.push([t, dot[t] / (suraNorm[s] * suraNorm[t])]);
    return out.sort((a, b) => b[1] - a[1]);
  }
  const neighbors = (node: string): string[] =>
    node[0] === 's' ? suraAdj[Number(node.slice(1))].map(([ri]) => `r${ri}`) : rootAdj[Number(node.slice(1))].map(([s]) => `s${s}`);

  // ---------- Graf ----------
  const small = stage.clientWidth < 700;
  const scale = small ? 0.62 : 1;
  const graph = new Graph({ type: 'undirected' });
  meta.suras.forEach((s, i) => {
    graph.addNode(`s${s.n}`, { x: gd.s[i][0], y: -gd.s[i][1], size: (5 + Math.sqrt(s.ayas) * 0.75) * scale, label: small ? String(s.n) : `${s.n}. ${s.tr}`, full: `${s.n}. ${s.tr}`, kind: 's', st: s.type, zIndex: 1 });
  });
  for (let ri = 0; ri < NR; ri++) {
    graph.addNode(`r${ri}`, { x: gd.r[ri][0], y: -gd.r[ri][1], size: (1.6 + Math.log2(1 + idx.n[ri]) * 0.55) * scale, label: idx.ar[ri], kind: 'r', f: idx.n[ri], zIndex: 0 });
  }
  for (const k of strongKeys) graph.addEdgeWithKey(`e${k}`, `s${k >> 12}`, `r${k & 4095}`, { s: k >> 12, ri: k & 4095 });

  let C = palette();
  function palette() {
    const bg = cssVar('--surface');
    return {
      mk: cssVar('--makki'),
      md: cssVar('--madani'),
      root: mix(cssVar('--ink-2'), bg, 0.5),
      rootHi: cssVar('--accent'),
      edge: mix(cssVar('--muted'), bg, 0.2),
      edgeFilter: mix(cssVar('--accent'), bg, 0.4),
      edgeHi: mix(cssVar('--accent'), bg, 0.75),
      faded: mix(cssVar('--muted'), bg, 0.16),
      label: cssVar('--ink'),
      surface: cssVar('--surface'),
      line: cssVar('--line-2'),
      shared: cssVar('--cmp-s'),
      a: cssVar('--cmp-a'),
      b: cssVar('--cmp-b'),
      aEdge: mix(cssVar('--cmp-a'), bg, 0.45),
      bEdge: mix(cssVar('--cmp-b'), bg, 0.45),
    };
  }

  // ---------- Holat ----------
  let hovered: string | null = null;
  let selected: string | null = null;
  let filterSura: number | null = null;
  let compare: [number, number] | null = null;
  let minFreq = 1;
  let showEdges = true;
  let visible: Set<string> | null = null; // null = hammasi
  let focus: Set<string> | null = null;
  let cmpA: Set<number> | null = null; // faqat A dagi ildizlar
  let cmpB: Set<number> | null = null;
  let cmpShared: Set<number> | null = null;
  let tempEdges: string[] = [];
  let booted = false;

  function recompute() {
    cmpA = cmpB = cmpShared = null;
    if (compare) {
      const [a, b] = compare;
      const ra = new Set(suraAdj[a].map(([ri]) => ri));
      const rb = new Set(suraAdj[b].map(([ri]) => ri));
      cmpShared = new Set([...ra].filter((x) => rb.has(x)));
      cmpA = new Set([...ra].filter((x) => !rb.has(x)));
      cmpB = new Set([...rb].filter((x) => !ra.has(x)));
      visible = new Set([`s${a}`, `s${b}`, ...[...ra, ...rb].map((ri) => `r${ri}`)]);
    } else if (filterSura) {
      visible = new Set([`s${filterSura}`, ...suraAdj[filterSura].map(([ri]) => `r${ri}`)]);
    } else visible = null;
    const f = hovered ?? selected;
    focus = f ? new Set([f, ...neighbors(f)]) : null;
  }

  /** Tanlangan tugun/filtr/solishtirish uchun kuchsiz qirralarni vaqtincha grafga qo'shadi */
  function syncTempEdges() {
    for (const e of tempEdges) if (graph.hasEdge(e)) graph.dropEdge(e);
    tempEdges = [];
    const want = new Set<number>();
    const addSura = (s: number, only?: Set<number> | null) => {
      for (const [ri] of suraAdj[s]) if (!only || only.has(ri)) want.add(ekey(s, ri));
    };
    if (compare) {
      addSura(compare[0], cmpShared);
      addSura(compare[1], cmpShared);
    } else if (filterSura) addSura(filterSura);
    if (selected) {
      if (selected[0] === 's') addSura(Number(selected.slice(1)));
      else for (const [s] of rootAdj[Number(selected.slice(1))]) want.add(ekey(s, Number(selected.slice(1))));
    }
    for (const k of want) {
      if (strongKeys.has(k)) continue;
      const key = `t${k}`;
      graph.addEdgeWithKey(key, `s${k >> 12}`, `r${k & 4095}`, { s: k >> 12, ri: k & 4095, temp: true });
      tempEdges.push(key);
    }
  }

  const isHidden = (node: string, f?: number) => (visible !== null && !visible.has(node)) || (f !== undefined && f < minFreq && node !== selected);

  const renderer = new Sigma(graph, stage, {
    renderEdgeLabels: false,
    hideEdgesOnMove: true,
    hideLabelsOnMove: small,
    labelFont: '"Amiri Quran", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    labelSize: small ? 12 : 13,
    labelWeight: '600',
    labelColor: { attribute: 'lc' },
    labelDensity: small ? 0.5 : 0.8,
    labelGridCellSize: small ? 70 : 90,
    labelRenderedSizeThreshold: small ? 6.5 : 7,
    zIndex: true,
    minCameraRatio: 0.02,
    maxCameraRatio: 2.5,
    stagePadding: small ? 14 : 30,
    minEdgeThickness: 0.6,
    defaultEdgeColor: C.edge,
    nodeReducer: (node, data) => {
      if (isHidden(node, data.f as number | undefined)) return { ...data, hidden: true };
      const isS = data.kind === 's';
      const res: Record<string, unknown> = { ...data, lc: C.label, color: isS ? (data.st === 'makkiy' ? C.mk : C.md) : C.root };
      if (cmpShared && !isS) {
        const ri = Number(node.slice(1));
        res.color = cmpShared.has(ri) ? C.shared : cmpA!.has(ri) ? C.a : C.b;
        res.zIndex = cmpShared.has(ri) ? 2 : 0;
      } else if (compare && isS) {
        res.forceLabel = true;
        res.label = data.full;
        res.color = node === `s${compare[0]}` ? C.a : C.b;
        res.size = (data.size as number) * 1.25;
      }
      if (focus) {
        if (focus.has(node)) {
          res.zIndex = 3;
          if (node === hovered || node === selected) {
            res.forceLabel = true;
            res.highlighted = true;
            if (isS) res.label = data.full;
          } else if (!isS && !cmpShared) res.color = C.rootHi;
          if (focus.size < 70) res.forceLabel = true;
        } else if (!compare) {
          res.color = C.faded;
          res.label = '';
          res.zIndex = 0;
        }
      } else if (visible && visible.size < 90) res.forceLabel = true;
      else if (filterSura && isS) res.forceLabel = true;
      return res;
    },
    edgeReducer: (edge, data) => {
      const s = data.s as number;
      const ri = data.ri as number;
      const sn = `s${s}`;
      const rn = `r${ri}`;
      if (isHidden(sn) || isHidden(rn, idx.n[ri])) return { ...data, hidden: true };
      const res: Record<string, unknown> = { ...data, color: C.edge, size: 0.4 };
      const f = hovered ?? selected;
      if (f) {
        if (sn === f || rn === f) {
          res.color = C.edgeHi;
          res.size = 1.1;
          res.zIndex = 1;
          return res;
        }
        if (selected && !compare && !filterSura) return { ...data, hidden: true };
      }
      if (compare) {
        if (!cmpShared!.has(ri)) return { ...data, hidden: true };
        res.color = s === compare[0] ? C.aEdge : C.bEdge;
        res.size = 0.8;
      } else if (filterSura) {
        res.color = C.edgeFilter;
      } else if (data.temp || !showEdges) return { ...data, hidden: true };
      return res;
    },
    defaultDrawNodeHover: (ctx, data, settings) => {
      const size = settings.labelSize;
      ctx.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
      const label = data.label || '';
      const tw = ctx.measureText(label).width;
      const { x, y } = data;
      ctx.fillStyle = C.surface;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (label) {
        const pad = 6;
        const hgt = size + pad * 2;
        ctx.roundRect(x - data.size - 3, y - hgt / 2, tw + data.size * 2 + pad * 2 + 6, hgt, 8);
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
  const camera = renderer.getCamera();
  const redraw = () => renderer.refresh({ skipIndexation: true });

  function apply(opts: { fit?: boolean } = {}) {
    recompute();
    syncTempEdges();
    redraw();
    setUrl();
    paintTools();
    if (opts.fit) fit();
  }

  function fit() {
    const nodes = compare || filterSura ? [...(visible ?? [])] : selected ? [selected, ...neighbors(selected)] : null;
    if (!nodes) return camera.animatedReset({ duration: 450 });
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of nodes) {
      const d = renderer.getNodeDisplayData(n);
      if (!d || d.hidden) continue;
      x0 = Math.min(x0, d.x);
      y0 = Math.min(y0, d.y);
      x1 = Math.max(x1, d.x);
      y1 = Math.max(y1, d.y);
    }
    if (!isFinite(x0)) return;
    const ratio = Math.min(1.05, Math.max(0.06, Math.max(x1 - x0, y1 - y0) * 1.3));
    camera.animate({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, ratio }, { duration: 550 });
  }

  // ---------- Hodisalar ----------
  renderer.on('enterNode', ({ node }) => {
    hovered = node;
    stage.style.cursor = 'pointer';
    recompute();
    redraw();
  });
  renderer.on('leaveNode', () => {
    hovered = null;
    stage.style.cursor = '';
    recompute();
    redraw();
  });
  renderer.on('clickNode', ({ node }) => select(node, false));
  renderer.on('clickStage', () => {
    if (selected) select(null, false);
  });
  zoomIn.addEventListener('click', () => camera.animatedZoom({ duration: 300 }));
  zoomOut.addEventListener('click', () => camera.animatedUnzoom({ duration: 300 }));
  zoomReset.addEventListener('click', () => camera.animatedReset({ duration: 400 }));

  const setFull = (on: boolean) => {
    stageWrap.classList.toggle('full', on);
    document.body.classList.toggle('g-noscroll', on);
    fullBtn.setAttribute('aria-pressed', String(on));
    fullBtn.replaceChildren(icon(on ? I.close : I.expand));
  };
  fullBtn.addEventListener('click', () => setFull(!stageWrap.classList.contains('full')));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && stageWrap.classList.contains('full')) setFull(false);
  };
  document.addEventListener('keydown', onKey);
  let roFirst = true;
  const onResize = debounce(() => {
    renderer.resize();
    renderer.refresh();
  }, 80);
  const ro = new ResizeObserver(() => {
    if (roFirst) roFirst = false; // birinchi chaqiruv — boshlang'ich o'lcham, qayta chizish shart emas
    else onResize();
  });
  ro.observe(stage);

  function paintTools() {
    filterSel.value = filterSura ? String(filterSura) : '';
    freqInp.value = String(Math.max(0, FREQ_STEPS.indexOf(minFreq)));
    let n = 0;
    for (let ri = 0; ri < NR; ri++) if (idx.n[ri] >= minFreq) n++;
    freqOut.textContent = minFreq === 1 ? `barchasi · ${n}` : `≥ ${minFreq} marta · ${n}`;
    edgesBtn.setAttribute('aria-pressed', String(showEdges));
    hint.hidden = !compare;
    if (compare)
      hint.replaceChildren(
        h('span', null, h('span', { class: 'dot', style: { background: C.a } }), `faqat ${meta.suras[compare[0] - 1].tr}`),
        h('span', null, h('span', { class: 'dot', style: { background: C.shared } }), 'umumiy'),
        h('span', null, h('span', { class: 'dot', style: { background: C.b } }), `faqat ${meta.suras[compare[1] - 1].tr}`),
      );
  }
  freqInp.addEventListener('input', () => {
    minFreq = FREQ_STEPS[Number(freqInp.value)] ?? 1;
    apply();
  });
  edgesBtn.addEventListener('click', () => {
    showEdges = !showEdges;
    apply();
  });
  filterSel.addEventListener('change', () => {
    compare = null;
    filterSura = filterSel.value ? Number(filterSel.value) : null;
    if (filterSura) {
      selected = `s${filterSura}`;
      showSura(filterSura);
    }
    apply({ fit: true });
  });

  function setUrl() {
    const q = new URLSearchParams();
    if (compare) q.set('taqqos', `${compare[0]}-${compare[1]}`);
    else {
      if (selected?.startsWith('r')) q.set('ildiz', idx.k[Number(selected.slice(1))]);
      if (selected?.startsWith('s')) q.set('sura', selected.slice(1));
      if (filterSura) q.set('filtr', String(filterSura));
    }
    if (minFreq > 1) q.set('min', String(minFreq));
    const s = q.toString();
    history.replaceState(null, '', `#/ildizlar${s ? '?' + s : ''}`);
  }

  function select(node: string | null, fly = true) {
    selected = node;
    if (compare && node) compare = null;
    apply({ fit: fly && !!node });
    if (!node) return compare ? showCompare() : showIntro();
    if (node[0] === 'r') showRoot(Number(node.slice(1)));
    else showSura(Number(node.slice(1)));
    if (booted && innerWidth < 900 && !stageWrap.classList.contains('full')) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setCompare(a: number, b: number) {
    compare = [a, b];
    selected = null;
    filterSura = null;
    setFull(false);
    apply({ fit: true });
    showCompare();
  }

  // ---------- Panel ----------
  function setPanel(...children: Child[]) {
    const frag = document.createDocumentFragment();
    append(frag, children);
    panel.replaceChildren(frag);
  }
  const sName = (s: number) => `${s}. ${meta.suras[s - 1].tr}`;
  function rootChip(ri: number, count?: number) {
    return h(
      'button',
      { class: 'chip ar-chip', type: 'button', onclick: () => select(`r${ri}`), title: `${idx.k[ri]} — Qurʼonda ${idx.n[ri]} marta` },
      h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]),
      h('small', null, String(count ?? idx.n[ri])),
    );
  }
  function suraChip(s: number, extra?: string) {
    return h('button', { class: 'chip', type: 'button', onclick: () => select(`s${s}`) }, h('span', { class: `dot ${meta.suras[s - 1].type}` }), sName(s), extra ? h('small', null, extra) : null);
  }
  const algoNote = (t: string) => h('p', { class: 'muted g-note' }, t);

  function showIntro() {
    setPanel(
      h('h2', null, 'Qanday foydalaniladi'),
      h(
        'ul',
        { class: 'g-help' },
        h('li', null, h('b', null, 'Ildizni bosing'), ' — u uchraydigan barcha oyatlar va suralar boʻyicha taqsimoti.'),
        h('li', null, h('b', null, 'Surani bosing'), ' — unga xos ildizlar va ildizlari boʻyicha eng yaqin suralar.'),
        h('li', null, h('b', null, 'Solishtirish'), ' — ikki suraning umumiy va farqli ildizlari.'),
        h('li', null, '«Chastota» slayderi kam uchraydigan ildizlarni yashiradi.'),
      ),
      h('h3', null, 'Eng koʻp uchraydigan ildizlar'),
      h('div', { class: 'g-chips' }, Array.from({ length: 14 }, (_, i) => rootChip(i))),
      h('h3', null, 'Sinab koʻring'),
      h(
        'div',
        { class: 'g-chips' },
        h('button', { class: 'chip', type: 'button', onclick: () => setCompare(113, 114) }, 'Al-Falaq ↔ An-Nas'),
        h('button', { class: 'chip', type: 'button', onclick: () => setCompare(2, 3) }, 'Al-Baqarah ↔ Ali ʼImran'),
        h('button', { class: 'chip', type: 'button', onclick: () => select('s12') }, 'Yusuf surasi'),
      ),
      algoNote(
        `${NR} ta ildiz, ${gd.e.length / 4} ta sura–ildiz bogʻlanishi (chiziqlar bilan ${strongKeys.size} ta eng xosi koʻrsatilgan). Maʼlumot: Quranic Arabic Corpus (morfologiya v0.4, GNU GPL). Joylashuv va «xoslik» algoritm bilan hisoblangan (ForceAtlas2, TF-IDF) — bu tafsir yoki mavzu tasnifi emas.`,
      ),
      h('p', { class: 'g-note' }, h('a', { href: '#/manbalar' }, 'Manbalar va litsenziyalar')),
    );
  }

  /** 114 sura bo'yicha taqsimot (ustunchalar) */
  function distribution(ri: number) {
    const by = new Map(rootAdj[ri]);
    const max = rootAdj[ri][0][1];
    return h(
      'div',
      { class: 'g-dist', role: 'img', 'aria-label': 'Suralar boʻyicha taqsimot' },
      meta.suras.map((s) => {
        const c = by.get(s.n) ?? 0;
        return h('button', {
          type: 'button',
          class: `g-bar ${s.type}${c ? '' : ' zero'}`,
          style: { height: c ? `${Math.max(8, Math.round((c / max) * 100))}%` : '3%' },
          title: `${sName(s.n)}: ${c} marta`,
          'aria-label': `${sName(s.n)}: ${c} marta`,
          tabindex: '-1',
          onclick: () => select(`s${s.n}`),
        });
      }),
    );
  }

  function tokens(text: string): { t: string; w: number }[] {
    let w = 0;
    return text.split(' ').map((t) => (MARK_ONLY.test(t) ? { t, w: 0 } : { t, w: ++w }));
  }

  async function showRoot(ri: number) {
    const byAya = new Map<number, number[]>();
    for (const v of idx.occ[ri]) {
      const g = v >> 8;
      if (!byAya.has(g)) byAya.set(g, []);
      if (v & 255) byAya.get(g)!.push(v & 255);
    }
    const ayas = [...byAya.keys()].sort((a, b) => a - b);
    const sc = rootAdj[ri];
    const list = h('div', { class: 'g-ayas' }, h('div', { class: 'spinner', style: { width: '22px', height: '22px' } }));
    const forms = h('div', { class: 'g-chips' });
    const ayasTitle = h('h3', null, `Oyatlar (${ayas.length})`);
    const onlyIn = sc.length === 1 ? ` · faqat ${meta.suras[sc[0][0] - 1].tr} surasida` : '';
    setPanel(
      h('div', { class: 'g-root-head' }, h('span', { class: 'ar g-root-ar', lang: 'ar' }, idx.ar[ri]), h('span', { class: 'muted' }, `ildiz · ${idx.k[ri]}`)),
      h('p', { class: 'g-stats' }, `${idx.n[ri]} marta · ${ayas.length} oyatda · ${sc.length} surada${onlyIn}`),
      h('h3', null, 'Suralar boʻyicha taqsimot (1 → 114)'),
      distribution(ri),
      h('h3', null, 'Matndagi shakllari (filtrlash uchun bosing)'),
      forms,
      h('h3', null, 'Eng koʻp uchraydigan suralar'),
      h('div', { class: 'g-chips' }, sc.slice(0, 8).map(([s, c]) => suraChip(s, String(c)))),
      ayasTitle,
      list,
    );
    panel.scrollTop = 0;
    const [ar, docs] = await Promise.all([getAr(), getDocs().catch(() => null)]);
    if (selected !== `r${ri}`) return;
    const formCount = new Map<string, number>();
    const ayasByForm = new Map<string, Set<number>>();
    for (const g of ayas) {
      const toks = tokens(ar[g]);
      for (const w of byAya.get(g)!) {
        const t = toks[w - 1]?.t;
        if (!t) continue;
        formCount.set(t, (formCount.get(t) || 0) + 1);
        if (!ayasByForm.has(t)) ayasByForm.set(t, new Set());
        ayasByForm.get(t)!.add(g);
      }
    }
    let activeForm: string | null = null;
    let filtered = ayas;
    let shown = 0;
    const formButtons: HTMLButtonElement[] = [...formCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t, c], bi) =>
        h(
          'button',
          {
            class: 'chip ar-chip',
            type: 'button',
            'aria-pressed': 'false',
            onclick: () => {
              activeForm = activeForm === t ? null : t;
              formButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === bi && activeForm === t)));
              renderAyas();
            },
          },
          h('span', { class: 'ar', lang: 'ar' }, t),
          h('small', null, String(c)),
        ),
      );
    forms.replaceChildren(...formButtons);
    const more = () => {
      const frag = document.createDocumentFragment();
      for (const g of filtered.slice(shown, shown + 25)) {
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
      if (shown < filtered.length) list.appendChild(h('button', { class: 'btn small more', type: 'button', onclick: more }, `Yana koʻrsatish (${filtered.length - shown})`));
    };
    const renderAyas = () => {
      filtered = activeForm ? ayas.filter((g) => ayasByForm.get(activeForm!)?.has(g)) : ayas;
      ayasTitle.textContent = activeForm ? `Oyatlar — «${activeForm}» (${filtered.length})` : `Oyatlar (${filtered.length})`;
      shown = 0;
      list.replaceChildren();
      more();
    };
    renderAyas();
  }

  function showSura(n: number) {
    const sm = meta.suras[n - 1];
    const counts = suraAdj[n];
    const total = suraTotal[n];
    const spec = counts.map(([ri, c]) => [ri, tfidf(n, ri, c), c] as [number, number, number]).sort((x, y) => y[1] - x[1]);
    const unique = counts.filter(([ri]) => rootAdj[ri].length === 1);
    const sims = similar(n).slice(0, 6);
    const cmpSel = h(
      'select',
      { class: 'field g-cmp-sel', 'aria-label': 'Solishtirish uchun sura' },
      h('option', { value: '' }, 'Boshqa sura bilan solishtirish…'),
      meta.suras.filter((s) => s.n !== n).map((s) => h('option', { value: String(s.n) }, `${s.n}. ${s.tr}`)),
    );
    cmpSel.addEventListener('change', () => cmpSel.value && setCompare(n, Number(cmpSel.value)));
    setPanel(
      h('div', { class: 'g-root-head' }, h('span', { class: 'ar g-root-ar', lang: 'ar' }, sm.ar), h('span', { class: 'muted' }, sName(n))),
      h('p', { class: 'g-stats' }, h('span', { class: `badge ${sm.type}` }, typeLabel(sm.type)), ` ${sm.ayas} oyat · ${counts.length} xil ildiz · ${total} ta ildizli soʻz`),
      h(
        'div',
        { class: 'g-chips' },
        h('a', { class: 'btn small primary', href: `#${n}` }, icon(I.book), 'Surani oʻqish'),
        filterSura === n
          ? h('button', { class: 'btn small', type: 'button', onclick: () => ((filterSura = null), apply({ fit: true }), showSura(n)) }, 'Filtrni olib tashlash')
          : h('button', { class: 'btn small', type: 'button', onclick: () => ((filterSura = n), apply({ fit: true }), showSura(n)) }, 'Faqat shu sura'),
      ),
      cmpSel,
      h('h3', null, 'Ildizlari boʻyicha eng yaqin suralar'),
      h(
        'div',
        { class: 'g-sim' },
        sims.map(([t, v]) =>
          h(
            'button',
            { type: 'button', class: 'g-sim-row', onclick: () => setCompare(n, t), title: 'Solishtirish' },
            h('span', { class: `dot ${meta.suras[t - 1].type}` }),
            h('span', { class: 'nm' }, sName(t)),
            h('span', { class: 'bar' }, h('i', { style: { width: `${Math.round((v / sims[0][1]) * 100)}%` } })),
            h('span', { class: 'pc' }, `${Math.round(v * 100)}%`),
          ),
        ),
      ),
      algoNote('Oʻxshashlik — ildizlar tarkibining TF-IDF kosinus oʻlchovi. Faqat soʻz ildizlari hisobga olinadi; bu mazmun yoki mavzu boʻyicha xulosa emas.'),
      h('h3', null, 'Shu suraga xos ildizlar'),
      h('div', { class: 'g-chips' }, spec.slice(0, 12).map(([ri, , c]) => rootChip(ri, c))),
      h('h3', null, 'Eng koʻp uchraydigan ildizlar'),
      h('div', { class: 'g-chips' }, counts.slice(0, 12).map(([ri, c]) => rootChip(ri, c))),
      unique.length
        ? [h('h3', null, `Faqat shu surada uchraydigan ildizlar (${unique.length})`), h('div', { class: 'g-chips' }, unique.slice(0, 24).map(([ri, c]) => rootChip(ri, c)))]
        : null,
      algoNote('Chipdagi raqam — ildizning shu surada necha marta uchrashi.'),
    );
    panel.scrollTop = 0;
  }

  function showCompare() {
    if (!compare) return;
    const [a, b] = compare;
    const ca = new Map(suraAdj[a]);
    const cb = new Map(suraAdj[b]);
    const shared = [...cmpShared!].map((ri) => [ri, Math.min(ca.get(ri)!, cb.get(ri)!), idf(ri)] as [number, number, number]);
    const sharedSpec = shared.slice().sort((x, y) => y[2] * Math.log2(1 + y[1]) - x[2] * Math.log2(1 + x[1]));
    const onlyA = suraAdj[a].filter(([ri]) => cmpA!.has(ri));
    const onlyB = suraAdj[b].filter(([ri]) => cmpB!.has(ri));
    const sim = similar(a).find(([t]) => t === b)?.[1] ?? 0;
    const union = cmpShared!.size + cmpA!.size + cmpB!.size;
    const part = (label: string, n: number, color: string) => h('div', { class: 'g-cmp-part', style: { flex: String(Math.max(n, union * 0.04)), background: color } }, h('b', null, String(n)), h('span', null, label));
    setPanel(
      h('h2', null, 'Solishtirish'),
      h(
        'div',
        { class: 'g-cmp-head' },
        h('button', { class: 'chip', type: 'button', onclick: () => select(`s${a}`) }, h('span', { class: 'dot', style: { background: C.a } }), sName(a)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Oʻrnini almashtirish', title: 'Oʻrnini almashtirish', onclick: () => setCompare(b, a) }, icon(I.shuffle)),
        h('button', { class: 'chip', type: 'button', onclick: () => select(`s${b}`) }, h('span', { class: 'dot', style: { background: C.b } }), sName(b)),
      ),
      h('div', { class: 'g-cmp-bar' }, part('faqat 1-sura', cmpA!.size, C.a), part('umumiy', cmpShared!.size, C.shared), part('faqat 2-sura', cmpB!.size, C.b)),
      h('p', { class: 'g-stats' }, `Ildizlar tarkibi oʻxshashligi: ${Math.round(sim * 100)}% · umumiy ildizlar ulushi: ${Math.round((cmpShared!.size / union) * 100)}%`),
      h('h3', null, `Umumiy ildizlar — eng xoslari (${shared.length})`),
      h('div', { class: 'g-chips' }, sharedSpec.slice(0, 18).map(([ri]) => rootChip(ri))),
      h('h3', null, `Faqat ${meta.suras[a - 1].tr} (${onlyA.length})`),
      h('div', { class: 'g-chips' }, onlyA.slice(0, 12).map(([ri, c]) => rootChip(ri, c))),
      h('h3', null, `Faqat ${meta.suras[b - 1].tr} (${onlyB.length})`),
      h('div', { class: 'g-chips' }, onlyB.slice(0, 12).map(([ri, c]) => rootChip(ri, c))),
      h(
        'div',
        { class: 'g-chips', style: { marginTop: '14px' } },
        h('button', { class: 'btn small', type: 'button', onclick: () => ((compare = null), apply({ fit: true }), showIntro()) }, icon(I.close), 'Solishtirishni yopish'),
      ),
      algoNote('«Xos» — kam surada uchraydigan ildizlar oldinga chiqarilgan (algoritm). Bu mavzu boʻyicha xulosa emas.'),
    );
    panel.scrollTop = 0;
    if (booted && innerWidth < 900) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Qidiruv ----------
  function suggest(q: string) {
    const v = q.trim();
    if (!v) return [];
    const out: { label: Node[]; node: string }[] = [];
    const isAr = /[\u0600-\u06ff]/.test(v);
    const na = normAr(v);
    for (const s of meta.suras) {
      if (matchSura(s, v)) out.push({ node: `s${s.n}`, label: [document.createTextNode(`${s.n}. ${s.tr} `), h('span', { class: 'ar', lang: 'ar' }, s.ar)] });
      if (out.length >= 5) break;
    }
    for (let ri = 0; ri < NR && out.length < 12; ri++) {
      const hit = isAr ? normAr(idx.ar[ri]) === na || (na.length >= 2 && normAr(idx.ar[ri]).startsWith(na)) : idx.k[ri] === v || (v.length >= 2 && idx.k[ri].startsWith(v));
      if (hit) out.push({ node: `r${ri}`, label: [h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]), document.createTextNode(` ildiz · ${idx.k[ri]} · ${idx.n[ri]} marta`)] });
    }
    return out;
  }
  let suggItems: { node: string; label: Node[] }[] = [];
  const pick = (node: string) => {
    sugg.hidden = true;
    search.value = '';
    select(node);
  };
  search.addEventListener('input', () => {
    suggItems = suggest(search.value);
    sugg.replaceChildren(...suggItems.map((it) => h('button', { type: 'button', role: 'option', onclick: () => pick(it.node) }, it.label)));
    sugg.hidden = !suggItems.length;
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && suggItems[0]) {
      e.preventDefault();
      pick(suggItems[0].node);
    }
    if (e.key === 'Escape') sugg.hidden = true;
  });
  const closeSugg = (e: Event) => {
    if (!(e.target as HTMLElement).closest('.g-search')) sugg.hidden = true;
  };
  document.addEventListener('click', closeSugg);

  const onTheme = () => {
    C = palette();
    paintTools();
    redraw();
  };
  window.addEventListener('quz:theme', onTheme);
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onTheme);

  // ---------- Boshlang'ich holat (URL) ----------
  const q = r.query;
  const mf = Number(q?.get('min'));
  if (FREQ_STEPS.includes(mf)) minFreq = mf;
  const tq = /^(\d{1,3})-(\d{1,3})$/.exec(q?.get('taqqos') ?? '');
  const ok = (n: number) => n >= 1 && n <= 114;
  const f = Number(q?.get('filtr'));
  const ik = q?.get('ildiz');
  const sn = Number(q?.get('sura'));
  const ri0 = ik ? idx.k.indexOf(ik) : -1;
  if (tq && ok(+tq[1]) && ok(+tq[2]) && tq[1] !== tq[2]) setCompare(+tq[1], +tq[2]);
  else {
    if (ok(f)) filterSura = f;
    if (ri0 >= 0) select(`r${ri0}`, true);
    else if (ok(sn)) select(`s${sn}`, true);
    else if (filterSura) select(`s${filterSura}`, true);
    else {
      apply();
      showIntro();
    }
  }

  booted = true;

  return () => {
    window.removeEventListener('quz:theme', onTheme);
    mq.removeEventListener('change', onTheme);
    document.removeEventListener('click', closeSugg);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('g-noscroll');
    ro.disconnect();
    renderer.kill();
  };
}
