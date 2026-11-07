import { h } from '../lib/dom.ts';
import { getMeta, juzOf, pageOf, type SuraMeta } from '../lib/data.ts';
import { matchSura } from '../lib/normalize.ts';
import { load, save } from '../lib/store.ts';
import { setTitle, typeLabel, debounce } from '../lib/util.ts';
import type { Route } from '../main.ts';

type Mode = 'mushaf' | 'nuzul' | 'hajm';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tartibni saqlovchi "strip" treemap: yuza ~ og'irlik, o'qish tartibi (chapdan o'ngga, yuqoridan pastga) saqlanadi. */
export function stripLayout(weights: number[], W: number, H: number): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const areas = weights.map((w) => (w * W * H) / total);
  const rects: Rect[] = new Array(weights.length);
  const avgAspect = (from: number, to: number, sum: number) => {
    const hS = sum / W;
    let s = 0;
    for (let k = from; k <= to; k++) {
      const w = areas[k] / hS;
      s += Math.max(w / hS, hS / w);
    }
    return s / (to - from + 1);
  };
  let y = 0;
  let i = 0;
  while (i < areas.length) {
    let sum = areas[i];
    let best = avgAspect(i, i, sum);
    let j = i + 1;
    while (j < areas.length) {
      const asp = avgAspect(i, j, sum + areas[j]);
      if (asp > best) break;
      best = asp;
      sum += areas[j];
      j++;
    }
    const hS = sum / W;
    let x = 0;
    for (let k = i; k < j; k++) {
      const w = areas[k] / hS;
      rects[k] = { x, y, w, h: hS };
      x += w;
    }
    y += hS;
    i = j;
  }
  return rects;
}

export async function render(root: HTMLElement, _r: Route) {
  setTitle('Suralar xaritasi');
  const meta = await getMeta();
  let mode: Mode = (['mushaf', 'nuzul', 'hajm'] as Mode[]).includes(load<Mode>('mapMode', 'mushaf')) ? load<Mode>('mapMode', 'mushaf') : 'mushaf';
  let typeHighlight: 'all' | 'makkiy' | 'madaniy' = 'all';
  let searchQ = '';

  const stats = (t: 'makkiy' | 'madaniy') => {
    const list = meta.suras.filter((s) => s.type === t);
    return { n: list.length, ayas: list.reduce((a, s) => a + s.ayas, 0) };
  };
  const mk = stats('makkiy');
  const md = stats('madaniy');

  const btns: Record<Mode, HTMLButtonElement> = {
    mushaf: h('button', { class: 'chip', type: 'button' }, 'Mushaf tartibi'),
    nuzul: h('button', { class: 'chip', type: 'button' }, 'Nuzul tartibi'),
    hajm: h('button', { class: 'chip', type: 'button' }, 'Hajm boʻyicha'),
  };
  const searchInput = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Xaritadan surani topish…',
    'aria-label': 'Xaritadan surani topish',
    style: { maxWidth: '220px', padding: '7px 12px', fontSize: '14px' },
  });
  const mkBtn = h(
    'button',
    { class: 'chip small', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'dot makkiy' }),
    `Makkiy (${mk.n} sura, ${mk.ayas} oyat)`,
  );
  const mdBtn = h(
    'button',
    { class: 'chip small', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'dot madaniy' }),
    `Madaniy (${md.n} sura, ${md.ayas} oyat)`,
  );

  const caption = h('p', { class: 'muted', style: { margin: '0', fontSize: '14px' }, 'aria-live': 'polite' });
  const box = h('nav', { class: 'tmap', 'aria-label': 'Suralar xaritasi' });
  const tip = h('div', { class: 'tmap-tip', hidden: true });

  const tiles = new Map<number, HTMLAnchorElement>();
  for (const s of meta.suras) {
    const a = h(
      'a',
      {
        class: `tile ${s.type}`,
        href: `#${s.n}`,
        'aria-label': `${s.n}. ${s.tr} — ${s.ayas} oyat, ${typeLabel(s.type)}, nuzul tartibi ${s.order}`,
      },
      h('span', { class: 'tn' }, String(s.n)),
      h('span', { class: 'tl' }, s.tr),
      h('span', { class: 'tc' }, `${s.ayas} oyat`),
      h('span', { class: 'to' }),
    );
    a.addEventListener('pointerenter', (e) => showTip(s, e as PointerEvent));
    a.addEventListener('pointermove', (e) => moveTip(e as PointerEvent));
    a.addEventListener('pointerleave', () => (tip.hidden = true));
    a.addEventListener('focus', () => {
      const r = a.getBoundingClientRect();
      showTip(s, { clientX: r.left + r.width / 2, clientY: r.top } as PointerEvent);
    });
    a.addEventListener('blur', () => (tip.hidden = true));
    tiles.set(s.n, a);
    box.appendChild(a);
  }

  function showTip(s: SuraMeta, e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const jz = juzOf(meta, s.n, 1);
    const pg = pageOf(meta, s.n, 1);
    tip.replaceChildren(
      h('strong', null, `${s.n}. ${s.tr}`),
      h('span', { class: 'ar', lang: 'ar' }, s.ar),
      h('span', null, `${s.ayas} oyat · ${typeLabel(s.type)} · Nuzul: ${s.order}`),
      h('span', { class: 'muted' }, `${jz}-juz · ${pg}-sahifa · ${s.rukus} ruku`),
    );
    tip.hidden = false;
    moveTip(e);
  }
  function moveTip(e: PointerEvent) {
    const r = box.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left + 14, 8), r.width - 230);
    const y = e.clientY - r.top + 18;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }

  function updateHighlights() {
    const hasFilter = typeHighlight !== 'all' || searchQ.trim().length > 0;
    mkBtn.setAttribute('aria-pressed', String(typeHighlight === 'makkiy'));
    mdBtn.setAttribute('aria-pressed', String(typeHighlight === 'madaniy'));
    for (const s of meta.suras) {
      const t = tiles.get(s.n)!;
      if (!hasFilter) {
        t.classList.remove('dimmed', 'spotlight');
        continue;
      }
      const matchType = typeHighlight === 'all' || s.type === typeHighlight;
      const matchQuery = !searchQ.trim() || matchSura(s, searchQ);
      const hit = matchType && matchQuery;
      t.classList.toggle('dimmed', !hit);
      t.classList.toggle('spotlight', hit && searchQ.trim().length > 0);
    }
  }

  mkBtn.addEventListener('click', () => {
    typeHighlight = typeHighlight === 'makkiy' ? 'all' : 'makkiy';
    updateHighlights();
  });
  mdBtn.addEventListener('click', () => {
    typeHighlight = typeHighlight === 'madaniy' ? 'all' : 'madaniy';
    updateHighlights();
  });
  searchInput.addEventListener('input', () => {
    searchQ = searchInput.value;
    updateHighlights();
  });

  function order(): SuraMeta[] {
    const list = meta.suras.slice();
    if (mode === 'nuzul') list.sort((a, b) => a.order - b.order);
    if (mode === 'hajm') list.sort((a, b) => b.ayas - a.ayas || a.n - b.n);
    return list;
  }

  let firstPaint = true;
  function paint() {
    for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === mode));
    caption.textContent =
      mode === 'mushaf'
        ? 'Mushafdagi tartib: 1-sura chap yuqorida, 114-sura oʻng pastda.'
        : mode === 'nuzul'
          ? 'Nuzul (vahiy) tartibi — Tanzil metamaʼlumotlari boʻyicha. Kichik raqam: nuzul tartibi.'
          : 'Oyatlar soni boʻyicha kamayish tartibida.';
    const W = box.clientWidth;
    const H = Math.round(Math.max(480, Math.min(1150, W * (W < 600 ? 1.9 : 0.62))));
    box.style.height = `${H}px`;
    const list = order();
    const rects = stripLayout(
      list.map((s) => s.ayas),
      W,
      H,
    );
    box.classList.toggle('instant', firstPaint);
    list.forEach((s, i) => {
      const t = tiles.get(s.n)!;
      const r = rects[i];
      const g = 1.5;
      const w = Math.max(1, r.w - g * 2);
      const hh = Math.max(1, r.h - g * 2);
      t.style.left = `${r.x + g}px`;
      t.style.top = `${r.y + g}px`;
      t.style.width = `${w}px`;
      t.style.height = `${hh}px`;
      t.style.transitionDelay = firstPaint ? '0ms' : `${Math.round(i * 5)}ms`;
      const size = Math.min(w, hh);
      t.dataset.lvl = w >= 74 && hh >= 46 ? '3' : w >= 30 && hh >= 22 ? '2' : '1';
      t.style.setProperty('--fs', `${Math.max(10, Math.min(30, size * 0.3))}px`);
      (t.querySelector('.to') as HTMLElement).textContent = mode === 'nuzul' ? `#${s.order}` : '';
    });
    if (firstPaint) requestAnimationFrame(() => box.classList.remove('instant'));
    firstPaint = false;
  }

  for (const k of Object.keys(btns) as Mode[])
    btns[k].addEventListener('click', () => {
      if (mode === k) return;
      mode = k;
      save('mapMode', mode);
      paint();
    });

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Suralar xaritasi'),
        h('p', null, 'Har bir toʻrtburchak — bitta sura; yuzasi suradagi oyatlar soniga mutanosib. Rang: Makkiy yoki Madaniy. Bosilsa, sura ochiladi.'),
      ),
      h(
        'div',
        { class: 'map-tools' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Tartib' }, btns.mushaf, btns.nuzul, btns.hajm),
        searchInput,
        h('div', { class: 'legend' }, mkBtn, mdBtn),
      ),
      caption,
      h('div', { class: 'tmap-wrap' }, box, tip),
      h(
        'p',
        { class: 'muted', style: { fontSize: '13px', margin: '14px 0 40px' } },
        'Manba: Tanzil Quran Metadata (CC BY 3.0). Makkiy/Madaniy tasnifi va nuzul tartibi boʻyicha ayrim suralarda ulamolar orasida turli qarashlar bor. ',
        h('a', { href: '#/manbalar' }, 'Batafsil'),
      ),
    ),
  );
  paint();
  const onResize = debounce(() => {
    firstPaint = true;
    paint();
  }, 150);
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}

