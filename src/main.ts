import './styles.css';
import { h, icon, I } from './lib/dom.ts';
import { settings, saveSettings, type Theme } from './lib/store.ts';
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

applyTheme(settings.theme);
renderChrome();
window.addEventListener('hashchange', route);
route();
