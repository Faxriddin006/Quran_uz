import './styles.css';
import { h, icon, I } from './lib/dom.ts';
import { getMeta, parseQuickNav, type QuickNavItem } from './lib/data.ts';
import { settings, saveSettings, getLastRead, type Theme } from './lib/store.ts';
import { setTitle } from './lib/util.ts';

export type Cleanup = void | (() => void);
export interface Route {
  name: string;
  sura?: number;
  ayah?: number | null;
  query?: URLSearchParams;
  rest?: string;
}
type ViewModule = { render: (root: HTMLElement, r: Route) => Cleanup | Promise<Cleanup> };

const views: Record<string, () => Promise<ViewModule>> = {
  home: () => import('./views/home.ts'),
  reader: () => import('./views/reader.ts'),
  search: () => import('./views/search.ts'),
  sources: () => import('./views/sources.ts'),
  map: () => import('./views/map.ts'),
  graph: () => import('./views/graph.ts'),
  juz: () => import('./views/juz.ts'),
  bookmarks: () => import('./views/bookmarks.ts'),
};

const NAV: { href: string; name: string; label: string; ic: string; tab?: boolean }[] = [
  { href: '#/', name: 'home', label: 'Suralar', ic: I.book, tab: true },
  { href: '#/qidiruv', name: 'search', label: 'Qidiruv', ic: I.search, tab: true },
  { href: '#/xarita', name: 'map', label: 'Xarita', ic: I.map, tab: true },
  { href: '#/ildizlar', name: 'graph', label: 'Ildizlar', ic: I.graph, tab: true },
  { href: '#/juz', name: 'juz', label: 'Juzlar', ic: I.layers },
  { href: '#/saqlangan', name: 'bookmarks', label: 'Saqlangan', ic: I.bookmark, tab: true },
  { href: '#/manbalar', name: 'sources', label: 'Manbalar', ic: I.info },
];

export function parseRoute(hash: string): Route {
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  const m = /^(\d{1,3})(?::(\d{1,3}))?$/.exec(raw);
  if (m) return { name: 'reader', sura: Number(m[1]), ayah: m[2] ? Number(m[2]) : null };
  const [pathPart, qs] = raw.split('?');
  const path = pathPart.replace(/^\/+/, '');
  const [head, ...rest] = path.split('/');
  const query = new URLSearchParams(qs || '');
  if (head === 'sahifa') {
    query.set('tab', 'sahifa');
    return { name: 'juz', query, rest: rest.join('/') };
  }
  const map: Record<string, string> = {
    '': 'home',
    qidiruv: 'search',
    manbalar: 'sources',
    xarita: 'map',
    ildizlar: 'graph',
    juz: 'juz',
    saqlangan: 'bookmarks',
  };
  const name = map[head] ?? 'notfound';
  return { name, query, rest: rest.join('/') };
}

// ---------- Mavzu ----------
function applyTheme(t: Theme) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
const THEME_NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_LABEL: Record<Theme, string> = {
  auto: 'Mavzu: tizim boʻyicha',
  light: 'Mavzu: yorugʻ',
  dark: 'Mavzu: qorongʻi',
};
const THEME_ICON: Record<Theme, string> = { auto: I.auto, light: I.sun, dark: I.moon };

function themeButton(): HTMLButtonElement {
  const b = h('button', { class: 'icon-btn', type: 'button' });
  const paint = () => {
    b.replaceChildren(icon(THEME_ICON[settings.theme]));
    b.setAttribute('aria-label', THEME_LABEL[settings.theme]);
    b.title = THEME_LABEL[settings.theme];
  };
  b.addEventListener('click', () => {
    settings.theme = THEME_NEXT[settings.theme];
    saveSettings();
    applyTheme(settings.theme);
    paint();
    window.dispatchEvent(new Event('quz:theme'));
  });
  paint();
  return b;
}

// ---------- Tezkor o'tish (Ctrl+K) ----------
let qjBackdrop: HTMLElement | null = null;
export async function openQuickJump() {
  if (qjBackdrop) {
    qjBackdrop.remove();
    qjBackdrop = null;
    return;
  }
  const meta = await getMeta().catch(() => null);
  const input = h('input', {
    class: 'field qj-input',
    type: 'search',
    placeholder: 'Sura, oyat (2:255, Yosin 10), 30-juz, 50-sahifa yoki soʻz…',
    'aria-label': 'Tezkor oʻtish yoki qidiruv',
    autocomplete: 'off',
  });
  const listEl = h('div', { class: 'qj-list', role: 'listbox' });
  let activeIdx = 0;
  let currentItems: QuickNavItem[] = [];

  const close = () => {
    qjBackdrop?.remove();
    qjBackdrop = null;
  };
  const go = (href: string) => {
    close();
    location.hash = href;
  };

  function renderItems() {
    const v = input.value.trim();
    const items: QuickNavItem[] = [];
    if (!v) {
      const last = getLastRead();
      if (last && meta) {
        const sm = meta.suras[last.s - 1];
        items.push({
          href: `#${last.s}:${last.a}`,
          badge: 'Davom',
          title: `Oxirgi oʻqilgan: ${sm.tr} ${last.s}:${last.a}`,
          sub: 'Oʻqishni kelgan joydan davom ettirish',
          ar: sm.ar,
        });
      }
      items.push(
        { href: '#1', badge: '1-sura', title: '1. Al-Fatihah surasi', sub: '7 oyat · 1-juz · 1-sahifa', ar: 'الفاتحة' },
        { href: '#2:255', badge: '2:255', title: 'Oyatul Kursiy (Al-Baqarah, 255)', sub: '3-juz · 42-sahifa', ar: 'البقرة' },
        { href: '#18', badge: '18-sura', title: '18. Al-Kahf surasi', sub: '110 oyat · 15–16-juzlar', ar: 'الكهف' },
        { href: '#36', badge: '36-sura', title: '36. Ya-Sin surasi', sub: '83 oyat · 22–23-juzlar', ar: 'يس' },
        { href: '#67', badge: '67-sura', title: '67. Al-Mulk surasi', sub: '30 oyat · 29-juz', ar: 'الملك' },
        { href: '#/juz', badge: 'Boʻlimlar', title: 'Juzlar, Mushaf sahifalari (1–604) va Sajda oyatlari', sub: '30 juz · 604 sahifa · 15 sajda · 7 manzil' },
      );
    } else {
      if (meta) items.push(...parseQuickNav(meta, v, 6));
      items.push({
        href: `#/qidiruv?q=${encodeURIComponent(v)}`,
        badge: 'Qidiruv',
        title: `«${v}» soʻzini barcha tarjimalardan qidirish`,
        sub: 'Lotin, kirill va arabcha matnlar boʻyicha toʻliq qidiruv',
      });
    }
    currentItems = items;
    if (activeIdx >= items.length) activeIdx = 0;
    listEl.replaceChildren(
      ...items.map((it, idx) =>
        h(
          'button',
          {
            type: 'button',
            class: `qj-item${idx === activeIdx ? ' active' : ''}`,
            role: 'option',
            'aria-selected': String(idx === activeIdx),
            onmouseenter: () => {
              activeIdx = idx;
              listEl.querySelectorAll('.qj-item').forEach((el, i) => {
                el.classList.toggle('active', i === activeIdx);
                el.setAttribute('aria-selected', String(i === activeIdx));
              });
            },
            onclick: () => go(it.href),
          },
          h('span', { class: 'qj-badge' }, it.badge),
          h('span', { class: 'qj-main' }, h('strong', null, it.title), h('small', null, it.sub)),
          it.ar ? h('span', { class: 'ar qj-ar', lang: 'ar' }, it.ar) : null,
        ),
      ),
    );
  }

  input.addEventListener('input', () => {
    activeIdx = 0;
    renderItems();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % Math.max(1, currentItems.length);
      renderItems();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + Math.max(1, currentItems.length)) % Math.max(1, currentItems.length);
      renderItems();
    } else if (e.key === 'Enter' && currentItems[activeIdx]) {
      e.preventDefault();
      go(currentItems[activeIdx].href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  const modal = h(
    'div',
    { class: 'qj-modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tezkor oʻtish' },
    h(
      'div',
      { class: 'qj-head' },
      icon(I.search),
      input,
      h('button', { class: 'chip small', type: 'button', onclick: close, 'aria-label': 'Yopish' }, 'Esc'),
    ),
    listEl,
    h(
      'div',
      { class: 'qj-foot muted' },
      h('span', null, '↑↓ tanlash · Enter oʻtish · Esc yopish'),
      h('span', null, 'Misol: ', h('code', null, '2:255'), ', ', h('code', null, 'Yosin'), ', ', h('code', null, '30-juz'), ', ', h('code', null, '50-sahifa')),
    ),
  );
  qjBackdrop = h(
    'div',
    {
      class: 'qj-backdrop',
      onclick: (e: MouseEvent) => {
        if (e.target === qjBackdrop) close();
      },
    },
    modal,
  );
  document.body.appendChild(qjBackdrop);
  renderItems();
  input.focus();
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openQuickJump();
    return;
  }
  if (e.key === 'Escape' && qjBackdrop) {
    qjBackdrop.remove();
    qjBackdrop = null;
    return;
  }
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault();
    openQuickJump();
  }
});

function brandMark(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', 'brand-mark');
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', 'var(--gold)');
  g.setAttribute('stroke-width', '2');
  const r1 = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ x: '9', y: '9', width: '22', height: '22', rx: '1.5' })) r1.setAttribute(k, v);
  const r2 = r1.cloneNode() as SVGRectElement;
  r2.setAttribute('transform', 'rotate(45 20 20)');
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', '20');
  c.setAttribute('cy', '20');
  c.setAttribute('r', '4.5');
  c.setAttribute('fill', 'var(--accent)');
  c.setAttribute('stroke', 'none');
  g.append(r1, r2);
  svg.append(g, c);
  return svg;
}

function renderChrome() {
  const top = document.getElementById('topbar')!;
  const nav = h(
    'nav',
    { class: 'topnav', 'aria-label': 'Boʻlimlar' },
    NAV.map((n) => h('a', { href: n.href, 'data-name': n.name }, n.label)),
  );
  const qjBtn = h(
    'button',
    {
      class: 'qj-trigger',
      type: 'button',
      'aria-label': 'Tezkor oʻtish (Ctrl+K)',
      title: 'Tezkor oʻtish (Ctrl+K yoki /)',
      onclick: () => openQuickJump(),
    },
    icon(I.search),
    h('span', { class: 'qj-lbl' }, 'Oʻtish…'),
    h('kbd', null, '⌘K'),
  );
  top.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h(
        'a',
        { class: 'brand', href: '#/', 'aria-label': 'Qurʼoni Karim — bosh sahifa' },
        brandMark(),
        h('span', null, 'Qurʼoni Karim', h('small', null, 'oʻzbekcha tarjimalar')),
      ),
      nav,
      h(
        'div',
        { class: 'top-actions' },
        qjBtn,
        h('a', { class: 'icon-btn', href: '#/juz', 'aria-label': 'Juzlar va sahifalar', title: 'Juzlar va sahifalar' }, icon(I.layers)),
        h('a', { class: 'icon-btn', href: '#/manbalar', 'aria-label': 'Manbalar va litsenziyalar', title: 'Manbalar' }, icon(I.info)),
        themeButton(),
      ),
    ),
  );
  const tab = document.getElementById('tabbar')!;
  tab.replaceChildren(
    ...NAV.filter((n) => n.tab).map((n) => h('a', { href: n.href, 'data-name': n.name }, icon(n.ic), h('span', null, n.label))),
  );
}

function markNav(name: string) {
  const active = name === 'reader' ? 'home' : name;
  document.querySelectorAll<HTMLAnchorElement>('.topnav a, .tabbar a').forEach((a) => {
    if (a.dataset.name === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------- Router ----------
const main = document.getElementById('main')!;
let cleanup: Cleanup;
let current: Route | null = null;
let seq = 0;

type ReaderApi = { focus: (ayah: number | null) => void };
declare global {
  interface Window {
    __reader?: ReaderApi & { sura: number };
    __searchQ?: string;
  }
}

async function route() {
  const r = parseRoute(location.hash);
  // Bir sura ichida oyatga o'tish — qayta chizmasdan
  if (r.name === 'reader' && current?.name === 'reader' && current.sura === r.sura && window.__reader?.sura === r.sura) {
    current = r;
    window.__reader?.focus(r.ayah ?? null);
    return;
  }
  // Qidiruv so'rovi o'zgarishi — qidiruv sahifasi o'zi boshqaradi
  if (r.name === 'search' && current?.name === 'search' && (r.query?.get('q') ?? '') === (window.__searchQ ?? '')) {
    current = r;
    return;
  }
  const my = ++seq;
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  window.__reader = undefined;
  current = r;
  markNav(r.name);
  if (r.name === 'notfound') {
    setTitle('Topilmadi');
    main.replaceChildren(
      h('div', { class: 'wrap page-head' }, h('h1', null, 'Sahifa topilmadi'), h('p', null, h('a', { href: '#/' }, 'Bosh sahifaga qaytish'))),
    );
    return;
  }
  main.replaceChildren(h('div', { class: 'boot' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', null, 'Yuklanmoqda…')));
  try {
    const mod = await views[r.name]();
    if (my !== seq) return;
    const c = await mod.render(main, r);
    if (my !== seq) {
      if (typeof c === 'function') c();
      return;
    }
    cleanup = c;
  } catch (e) {
    console.error(e);
    if (my !== seq) return;
    main.replaceChildren(
      h(
        'div',
        { class: 'wrap page-head' },
        h('h1', null, 'Xatolik yuz berdi'),
        h('p', null, 'Maʼlumotni yuklab boʻlmadi. Internet aloqasini tekshirib, sahifani yangilang.'),
        h('p', null, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Qayta yuklash')),
      ),
    );
  }
}

// Oflayn ishlash: service worker (faqat qurilgan saytda)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Yangi versiyadan keyin: hali keshlanmagan bo'laklarni bo'sh vaqtda keshlash, eskilarini tozalash
    const warm = async () => {
      try {
        if (!navigator.serviceWorker.controller) return;
        const list: string[] = await fetch('asset-list.json', { cache: 'no-store' }).then((r) => r.json());
        const cache = await caches.open('quz-static-v3');
        const want = new Set(list.map((f) => new URL(f, location.href).href));
        for (const req of await cache.keys()) if (req.url.includes('/assets/') && !want.has(req.url)) await cache.delete(req);
        for (const url of want) if (!(await cache.match(url, { ignoreVary: true }))) await fetch(url).catch(() => {});
        const { DATA_V } = await import('./lib/data.ts');
        await fetch(`data/meta.json?v=${DATA_V}`).catch(() => {});
      } catch {
        /* oflayn yoki kesh mavjud emas */
      }
    };
    setTimeout(warm, 3000);
    navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(warm, 1000));
  });
}

applyTheme(settings.theme);
renderChrome();
window.addEventListener('hashchange', route);
route();
