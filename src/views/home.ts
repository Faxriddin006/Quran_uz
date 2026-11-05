import { h, icon, I } from '../lib/dom.ts';
import { getMeta, type SuraMeta } from '../lib/data.ts';
import { getLastRead, load, save } from '../lib/store.ts';
import { setTitle, typeLabel } from '../lib/util.ts';
import type { Route } from '../main.ts';

type Order = 'mushaf' | 'nuzul';
type TypeFilter = 'all' | 'makkiy' | 'madaniy';

export async function render(root: HTMLElement, _r: Route) {
  setTitle('');
  const meta = await getMeta();
  const last = getLastRead();

  let order: Order = load<Order>('homeOrder', 'mushaf') === 'nuzul' ? 'nuzul' : 'mushaf';
  let tf: TypeFilter = 'all';
  let q = '';

  const input = h('input', {
    class: 'field',
    type: 'search',
    name: 'q',
    placeholder: 'Masalan: sabr, jannat, rahmat, 2:255',
    'aria-label': 'Tarjimalardan qidirish',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const form = h(
    'form',
    {
      class: 'hero-search',
      role: 'search',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const v = input.value.trim();
        location.hash = v ? `#/qidiruv?q=${encodeURIComponent(v)}` : '#/qidiruv';
      },
    },
    input,
    h('button', { class: 'btn primary', type: 'submit' }, icon(I.search), h('span', null, 'Qidirish')),
  );

  const quick = h(
    'div',
    { class: 'quick' },
    last
      ? quickCard(`#${last.s}:${last.a}`, I.bookmark, 'Davom ettirish', `${meta.suras[last.s - 1].tr}, ${last.s}:${last.a}`)
      : null,
    quickCard('#/xarita', I.map, 'Suralar xaritasi', '114 sura: hajmi, Makkiy/Madaniy, nuzul tartibi'),
    quickCard('#/ildizlar', I.graph, 'Ildizlar grafi', 'Arabcha ildizlar orqali suralar aloqasi'),
    quickCard('#/juz', I.layers, 'Juz va hizblar', '30 juz, 60 hizb boʻyicha oʻqish'),
  );

  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'wrap' },
      h('p', { class: 'ar hero-ar', lang: 'ar', 'aria-hidden': 'true' }, 'القرآن الكريم'),
      h('h1', null, 'Qurʼoni Karim'),
      h(
        'p',
        { class: 'lead' },
        'Usmoniy rasmdagi arabcha matn (Tanzil) va oʻzbekcha tarjimalar — Muhammad Sodiq Muhammad Yusuf va Alouddin Mansur. Barcha matnlar nashr qilingan manbalardan soʻzma-soʻz olingan.',
      ),
      form,
      quick,
    ),
  );

  const filter = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Sura nomi yoki raqami…',
    'aria-label': 'Suralarni saralash',
    autocomplete: 'off',
  });
  const grid = h('div', { class: 'sura-grid', role: 'list' });
  const orderBtns = {
    mushaf: h('button', { class: 'chip', type: 'button' }, 'Mushaf tartibi'),
    nuzul: h('button', { class: 'chip', type: 'button' }, 'Nuzul tartibi'),
  };
  const typeBtns = {
    all: h('button', { class: 'chip', type: 'button' }, 'Barchasi'),
    makkiy: h('button', { class: 'chip', type: 'button' }, h('span', { class: 'dot makkiy' }), 'Makkiy'),
    madaniy: h('button', { class: 'chip', type: 'button' }, h('span', { class: 'dot madaniy' }), 'Madaniy'),
  };
  const count = h('span', { class: 'muted', style: { fontSize: '14px', marginLeft: 'auto' } });

  const cards = new Map<number, HTMLAnchorElement>();
  for (const s of meta.suras) cards.set(s.n, suraCard(s));

  function norm(s: string) {
    return s.toLowerCase().replace(/['`ʻʼ‘’\-\s]/g, '');
  }
  function paint() {
    for (const [k, b] of Object.entries(orderBtns)) b.setAttribute('aria-pressed', String(k === order));
    for (const [k, b] of Object.entries(typeBtns)) b.setAttribute('aria-pressed', String(k === tf));
    const nq = norm(q);
    const list = meta.suras
      .filter((s) => tf === 'all' || s.type === tf)
      .filter((s) => !nq || String(s.n) === nq || norm(s.tr).includes(nq) || norm(s.tz).includes(nq) || s.ar.includes(q.trim()))
      .sort((a, b) => (order === 'mushaf' ? a.n - b.n : a.order - b.order));
    grid.replaceChildren(...list.map((s) => cards.get(s.n)!));
    for (const s of list) {
      const ord = cards.get(s.n)!.querySelector('.ord');
      if (ord) ord.textContent = order === 'nuzul' ? `Nuzul: ${s.order}` : '';
    }
    count.textContent = `${list.length} ta sura`;
  }
  orderBtns.mushaf.onclick = () => ((order = 'mushaf'), save('homeOrder', order), paint());
  orderBtns.nuzul.onclick = () => ((order = 'nuzul'), save('homeOrder', order), paint());
  for (const k of Object.keys(typeBtns) as TypeFilter[]) typeBtns[k].onclick = () => ((tf = k), paint());
  filter.addEventListener('input', () => ((q = filter.value), paint()));

  root.replaceChildren(
    hero,
    h(
      'section',
      { class: 'wrap', 'aria-labelledby': 'suralar-h' },
      h('h2', { id: 'suralar-h', class: 'sr-only' }, 'Suralar roʻyxati'),
      h('div', { class: 'list-tools' }, filter, orderBtns.mushaf, orderBtns.nuzul, typeBtns.all, typeBtns.makkiy, typeBtns.madaniy, count),
      grid,
      footerNote(),
    ),
  );
  paint();
}

function quickCard(href: string, ic: string, title: string, sub: string) {
  return h('a', { class: 'card', href }, h('span', { class: 'qi' }, icon(ic)), h('span', null, h('strong', null, title), h('span', { class: 'sub' }, sub)));
}

function suraCard(s: SuraMeta): HTMLAnchorElement {
  return h(
    'a',
    { class: 'sura-card', href: `#${s.n}`, role: 'listitem', 'aria-label': `${s.n}. ${s.tr}, ${s.ayas} oyat, ${typeLabel(s.type)}` },
    h('span', { class: 'sura-num' }, String(s.n)),
    h(
      'span',
      null,
      h('div', { class: 'nm' }, s.tr),
      h(
        'div',
        { class: 'info' },
        h('span', { class: `dot ${s.type}`, title: typeLabel(s.type) }),
        `${typeLabel(s.type)} · ${s.ayas} oyat`,
        h('span', { class: 'ord' }),
      ),
    ),
    h('span', { class: 'ar', lang: 'ar' }, s.ar),
  );
}

export function footerNote() {
  return h(
    'p',
    { class: 'muted', style: { fontSize: '13px', padding: '8px 0 40px', textAlign: 'center' } },
    'Arabcha matn: Tanzil (Usmoniy). Tarjima va tafsirlar: Quran.com, QuranEnc.com. ',
    h('a', { href: '#/manbalar' }, 'Manbalar va litsenziyalar'),
  );
}
