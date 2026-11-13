import { h, icon, I } from '../lib/dom.ts';
import { getMeta, getSura, refOf, juzOf, pageOf, parseQuickNav, type Meta, type SuraMeta } from '../lib/data.ts';
import { getKhatm, portion } from '../lib/khatm.ts';
import { stripFootnoteMarks } from '../lib/normalize.ts';
import { settings } from '../lib/store.ts';
import { matchSura } from '../lib/normalize.ts';
import { getLastRead, getHistory, load, save } from '../lib/store.ts';
import { setTitle, typeLabel, relTime } from '../lib/util.ts';
import type { Route } from '../main.ts';

type Order = 'mushaf' | 'nuzul' | 'hajm';
type TypeFilter = 'all' | 'makkiy' | 'madaniy';

const QUICK_REFS: [string, string][] = [
  ['#1', 'Fotiha'],
  ['#2:255', 'Oyatul Kursiy (2:255)'],
  ['#2:285', 'Baqara oxiri (2:285)'],
  ['#18', 'Kahf (18)'],
  ['#36', 'Yosin (36)'],
  ['#55', 'Rahmon (55)'],
  ['#56', 'Voqea (56)'],
  ['#67', 'Mulk (67)'],
  ['#78:1', '30-juz'],
  ['#/juz?tab=sajda', '15 sajda oyati'],
];

export async function render(root: HTMLElement, _r: Route) {
  setTitle('');
  const meta = await getMeta();
  const last = getLastRead();
  const history = getHistory();

  const savedOrder = load<Order>('homeOrder', 'mushaf');
  let order: Order = savedOrder === 'nuzul' || savedOrder === 'hajm' ? savedOrder : 'mushaf';
  let tf: TypeFilter = 'all';
  let q = '';

  const input = h('input', {
    class: 'field',
    type: 'search',
    name: 'q',
    placeholder: 'Masalan: sabr, rahmat, 2:255, Yosin, 30-juz, 50-sahifa…',
    'aria-label': 'Tarjimalardan qidirish yoki oyatga oʻtish',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const suggBox = h('div', { class: 'hero-sugg card', role: 'listbox', hidden: true });
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!v) {
      suggBox.hidden = true;
      return;
    }
    const items = parseQuickNav(meta, v, 5);
    if (!items.length) {
      suggBox.hidden = true;
      return;
    }
    suggBox.replaceChildren(
      ...items.map((it) =>
        h(
          'a',
          { class: 'qj-item', href: it.href, role: 'option' },
          h('span', { class: 'qj-badge' }, it.badge),
          h('span', { class: 'qj-main' }, h('strong', null, it.title), h('small', null, it.sub)),
          it.ar ? h('span', { class: 'ar qj-ar', lang: 'ar' }, it.ar) : null,
        ),
      ),
      h(
        'a',
        { class: 'qj-item', href: `#/qidiruv?q=${encodeURIComponent(v)}`, role: 'option' },
        h('span', { class: 'qj-badge' }, 'Qidiruv'),
        h('span', { class: 'qj-main' }, h('strong', null, `«${v}» soʻzini barcha tarjimalardan qidirish`), h('small', null, 'Lotin, kirill va arabcha oyatlar ichidan qidirish')),
      ),
    );
    suggBox.hidden = false;
  });
  const closeSugg = (e: Event) => {
    if (!(e.target as HTMLElement | null)?.closest('.hero-search-wrap')) suggBox.hidden = true;
  };
  document.addEventListener('click', closeSugg);

  const form = h(
    'form',
    {
      class: 'hero-search',
      role: 'search',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) {
          location.hash = '#/qidiruv';
          return;
        }
        // Agar aniq sura:oyat, juz yoki sahifa yozilgan bo'lsa to'g'ridan-to'g'ri o'tamiz
        if (/^\d{1,3}\s*[:.\-\s]\s*\d{1,3}$/.test(v) || /^(?:juz|pora|жуз|пора|sahifa|bet|саҳифа|бет)\s*\d+$/i.test(v) || /^\d+\s*-?\s*(?:juz|pora|жуз|пора|sahifa|bet|саҳифа|бет)$/i.test(v)) {
          const nav = parseQuickNav(meta, v, 1)[0];
          if (nav) {
            location.hash = nav.href;
            return;
          }
        }
        location.hash = `#/qidiruv?q=${encodeURIComponent(v)}`;
      },
    },
    input,
    h('button', { class: 'btn primary', type: 'submit' }, icon(I.search), h('span', null, 'Qidirish')),
  );

  const quickChips = h(
    'div',
    { class: 'hero-chips', 'aria-label': 'Tezkor havolalar' },
    QUICK_REFS.map(([href, label]) => h('a', { class: 'chip small', href }, label)),
  );

  const quick = h(
    'div',
    { class: 'quick' },
    last
      ? quickCard(
          `#${last.s}:${last.a}`,
          I.bookmark,
          'Davom ettirish',
          `${meta.suras[last.s - 1].tr}, ${last.s}:${last.a} · ${Math.round((last.a / meta.suras[last.s - 1].ayas) * 100)}% (${relTime(last.t)})`,
        )
      : null,
    quickCard('#/xarita', I.map, 'Suralar xaritasi', '114 sura: hajmi, Makkiy/Madaniy, nuzul tartibi'),
    quickCard('#/ildizlar', I.graph, 'Ildizlar grafi', 'Arabcha ildizlar orqali suralar aloqasi'),
    quickCard('#/juz', I.layers, 'Juz, sahifa va sajdalar', '30 juz, 604 sahifa, 15 sajda oyati'),
    khatmCard(meta),
  );

  const histRow =
    history.length > 1
      ? h(
          'div',
          { class: 'hist-strip' },
          h('span', { class: 'muted hist-lbl' }, icon(I.clock), 'Oxirgi oʻqilgan:'),
          ...history.slice(0, 5).map((item) => {
            const sm = meta.suras[item.s - 1];
            return h(
              'a',
              { class: 'chip small', href: `#${item.s}:${item.a}`, title: `${sm.tr} ${item.s}:${item.a} (${relTime(item.t)})` },
              `${sm.n}. ${sm.tr} `,
              h('small', null, `${item.s}:${item.a}`),
            );
          }),
        )
      : null;

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
      h('div', { class: 'hero-search-wrap' }, form, suggBox),
      quickChips,
      quick,
      histRow,
    ),
  );

  const filter = h('input', {
    class: 'field',
    type: 'search',
    placeholder: 'Sura nomi (Fotiha, Yosin, Каҳф) yoki raqami…',
    'aria-label': 'Suralarni saralash',
    autocomplete: 'off',
  });
  const grid = h('div', { class: 'sura-grid' });
  const orderBtns: Record<Order, HTMLButtonElement> = {
    mushaf: h('button', { class: 'chip', type: 'button' }, 'Mushaf tartibi'),
    nuzul: h('button', { class: 'chip', type: 'button' }, 'Nuzul tartibi'),
    hajm: h('button', { class: 'chip', type: 'button' }, 'Oyatlar soni'),
  };
  const typeBtns = {
    all: h('button', { class: 'chip', type: 'button' }, 'Barchasi'),
    makkiy: h('button', { class: 'chip', type: 'button' }, h('span', { class: 'dot makkiy' }), 'Makkiy'),
    madaniy: h('button', { class: 'chip', type: 'button' }, h('span', { class: 'dot madaniy' }), 'Madaniy'),
  };
  const count = h('span', { class: 'muted', style: { fontSize: '14px', marginLeft: 'auto' } });

  const cards = new Map<number, HTMLAnchorElement>();
  for (const s of meta.suras) cards.set(s.n, suraCard(s, meta));

  function paint() {
    for (const [k, b] of Object.entries(orderBtns)) b.setAttribute('aria-pressed', String(k === order));
    for (const [k, b] of Object.entries(typeBtns)) b.setAttribute('aria-pressed', String(k === tf));
    const list = meta.suras
      .filter((s) => tf === 'all' || s.type === tf)
      .filter((s) => matchSura(s, q))
      .sort((a, b) => (order === 'mushaf' ? a.n - b.n : order === 'nuzul' ? a.order - b.order : b.ayas - a.ayas || a.n - b.n));
    grid.replaceChildren(...list.map((s) => cards.get(s.n)!));
    for (const s of list) {
      const ord = cards.get(s.n)!.querySelector('.ord');
      if (ord) ord.textContent = order === 'nuzul' ? `· Nuzul: ${s.order}` : `· ${juzOf(meta, s.n, 1)}-juz, ${pageOf(meta, s.n, 1)}-bet`;
    }
    count.textContent = `${list.length} ta sura`;
  }
  for (const k of Object.keys(orderBtns) as Order[]) {
    orderBtns[k].onclick = () => {
      order = k;
      save('homeOrder', order);
      paint();
    };
  }
  for (const k of Object.keys(typeBtns) as TypeFilter[]) typeBtns[k].onclick = () => ((tf = k), paint());
  filter.addEventListener('input', () => ((q = filter.value), paint()));

  root.replaceChildren(
    hero,
    h(
      'section',
      { class: 'wrap', 'aria-labelledby': 'suralar-h' },
      dailyAyah(meta),
      h('h2', { id: 'suralar-h', class: 'sr-only' }, 'Suralar roʻyxati'),
      h('div', { class: 'list-tools' }, filter, orderBtns.mushaf, orderBtns.nuzul, orderBtns.hajm, typeBtns.all, typeBtns.makkiy, typeBtns.madaniy, count),
      grid,
      footerNote(),
    ),
  );
  paint();
  return () => document.removeEventListener('click', closeSugg);
}

function khatmCard(meta: Meta) {
  const k = getKhatm();
  if (!k) return quickCard('#/saqlangan', I.cal, 'Xatm rejasi', 'Qurʼonni kunlarga boʻlib oʻqish');
  if (k.done >= k.days) return quickCard('#/saqlangan', I.check, 'Xatm tugallandi', `${k.days} kunlik reja`);
  const p = portion(meta, k, k.done + 1);
  return quickCard(`#${p.from[0]}:${p.from[1]}`, I.cal, `Xatm: ${k.done + 1}/${k.days}-kun`, p.fromPage === p.toPage ? `${p.fromPage}-sahifa` : `${p.fromPage}–${p.toPage}-sahifalar`);
}

/** Kun oyati: sana bo'yicha aniqlanadigan (hamma uchun bir xil) oyat. Matn manbadan so'zma-so'z. */
function dailyAyah(meta: Meta) {
  const box = h('section', { class: 'card daily', 'aria-label': 'Kun oyati' });
  const show = async (gid: number, label: string) => {
    const [s, a] = refOf(meta, gid);
    const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];
    try {
      const d = await getSura(s);
      box.replaceChildren(
        h(
          'div',
          { class: 'daily-head' },
          h('span', { class: 'daily-tag' }, label),
          h('a', { href: `#${s}:${a}` }, `${meta.suras[s - 1].tr}, ${s}:${a}`),
          h('button', { class: 'btn small', type: 'button', style: { marginLeft: 'auto' }, onclick: () => show(Math.floor(Math.random() * 6236), 'Tasodifiy oyat') }, icon(I.shuffle), 'Boshqa oyat'),
        ),
        h('p', { class: 'ar daily-ar', lang: 'ar' }, d.ar[a - 1]),
        h('p', { class: 'daily-tr', lang: 'uz' }, stripFootnoteMarks(d.tr[ed.id][a - 1])),
        h('p', { class: 'muted daily-src' }, `${ed.title} tarjimasi · oyat alohida olingan — toʻliq maʼno uchun `, h('a', { href: `#${s}:${a}` }, 'suradagi oʻrnida oʻqing'), '.'),
      );
    } catch {
      box.remove();
    }
  };
  const now = new Date();
  const dayNo = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  // Knut multiplikativ xeshi: kunlar bo'yicha oyatlarni bir tekis "aralashtiradi"
  show(((dayNo * 2654435761) >>> 0) % 6236, 'Kun oyati');
  return box;
}

function quickCard(href: string, ic: string, title: string, sub: string) {
  return h('a', { class: 'card', href }, h('span', { class: 'qi' }, icon(ic)), h('span', null, h('strong', null, title), h('span', { class: 'sub' }, sub)));
}

function suraCard(s: SuraMeta, meta: Meta): HTMLAnchorElement {
  return h(
    'a',
    { class: 'sura-card', href: `#${s.n}`, 'aria-label': `${s.n}. ${s.tr}, ${s.ayas} oyat, ${typeLabel(s.type)}` },
    h('span', { class: 'sura-num' }, String(s.n)),
    h(
      'span',
      null,
      h('div', { class: 'nm' }, s.tr),
      h(
        'div',
        { class: 'info' },
        h('span', { class: `dot ${s.type}`, title: typeLabel(s.type) }),
        `${typeLabel(s.type)} · ${s.ayas} oyat `,
        h('span', { class: 'ord' }, `· ${juzOf(meta, s.n, 1)}-juz, ${pageOf(meta, s.n, 1)}-bet`),
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

