import { h, icon, I } from '../lib/dom.ts';
import { getMeta, getSura, juzOf, pageOf, type Meta } from '../lib/data.ts';
import { settings } from '../lib/store.ts';
import { stripFootnoteMarks } from '../lib/normalize.ts';
import { setTitle, arNum } from '../lib/util.ts';
import type { Route } from '../main.ts';

type Tab = 'juz' | 'sahifa' | 'sajda' | 'manzil';

const name = (meta: Meta, s: number) => meta.suras[s - 1]?.tr ?? '';

/** [sura, oyat] dan oldingi oyat (bo'lak oxirini topish uchun) */
function prevRef(meta: Meta, s: number, a: number): [number, number] {
  if (a > 1) return [s, a - 1];
  return [s - 1, meta.suras[s - 2].ayas];
}

export async function render(root: HTMLElement, r: Route) {
  const meta = await getMeta();
  const n = Number(r.rest);
  const tabParam = r.query?.get('tab') as Tab | null;

  // To'g'ridan-to'g'ri havolalar: #/juz/30 yoki #/sahifa/50
  if (r.rest && tabParam === 'sahifa' && n >= 1 && n <= 604) {
    const [s, a] = meta.pages[n - 1];
    location.replace(`#${s}:${a}`);
    return;
  }
  if (r.rest && n >= 1 && n <= 30) {
    const [s, a] = meta.juz[n - 1];
    location.replace(`#${s}:${a}`);
    return;
  }

  let activeTab: Tab = tabParam && ['juz', 'sahifa', 'sajda', 'manzil'].includes(tabParam) ? tabParam : 'juz';
  setTitle('Juzlar, sahifalar va sajdalar');

  const tabBtns: Record<Tab, HTMLButtonElement> = {
    juz: h('button', { class: 'chip', type: 'button' }, '30 Juz va 60 Hizb'),
    sahifa: h('button', { class: 'chip', type: 'button' }, '604 Mushaf sahifasi'),
    sajda: h('button', { class: 'chip', type: 'button' }, '15 Sajda oyati'),
    manzil: h('button', { class: 'chip', type: 'button' }, '7 Manzil'),
  };
  const body = h('div', { style: { padding: '14px 0 50px' } });

  function renderJuzTab() {
    const cards = [];
    for (let j = 1; j <= 30; j++) {
      const [s, a] = meta.juz[j - 1];
      const [es, ea] = prevRef(meta, ...meta.juz[j]);
      const pStart = pageOf(meta, s, a);
      const pEnd = pageOf(meta, es, ea);
      const quarters = [];
      for (let q = (j - 1) * 8; q < j * 8; q++) {
        const [qs, qa] = meta.hizbQuarters[q];
        const hizb = Math.floor(q / 4) + 1;
        const part = q % 4;
        const label = part === 0 ? `${hizb}-hizb` : `${hizb}-hizb ${['', '¼', '½', '¾'][part]}`;
        quarters.push(h('a', { class: part === 0 ? 'chip on' : 'chip', href: `#${qs}:${qa}`, title: `${name(meta, qs)} ${qs}:${qa}` }, `${label} · ${qs}:${qa}`));
      }
      cards.push(
        h(
          'section',
          { class: 'card', style: { padding: '14px 16px' } },
          h(
            'a',
            { href: `#${s}:${a}`, style: { display: 'flex', gap: '12px', alignItems: 'center', textDecoration: 'none', color: 'inherit' } },
            h('span', { class: 'sura-num' }, String(j)),
            h(
              'span',
              null,
              h('strong', null, `${j}-juz (pora)`),
              h('div', { class: 'muted', style: { fontSize: '13.5px' } }, `${name(meta, s)} ${s}:${a} — ${name(meta, es)} ${es}:${ea} · ${pStart}–${pEnd}-betlar`),
            ),
            h('span', { style: { marginLeft: 'auto', color: 'var(--muted)' } }, icon(I.right)),
          ),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' } }, quarters),
        ),
      );
    }
    body.replaceChildren(h('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } }, cards));
  }

  function renderSahifaTab() {
    let selJuz = 0;
    const pageInput = h('input', {
      class: 'field',
      type: 'number',
      min: '1',
      max: '604',
      inputmode: 'numeric',
      placeholder: 'Sahifa raqami (1–604)…',
      'aria-label': 'Mushaf sahifasiga oʻtish (1–604)',
      style: { maxWidth: '240px' },
    });
    const jumpForm = h(
      'form',
      {
        style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
        onsubmit: (e: Event) => {
          e.preventDefault();
          const p = Number(pageInput.value);
          if (p >= 1 && p <= 604) {
            const [ps, pa] = meta.pages[p - 1];
            location.hash = `#${ps}:${pa}`;
          }
        },
      },
      pageInput,
      h('button', { class: 'btn primary', type: 'submit' }, 'Sahifaga oʻtish'),
    );
    const juzFilter = h(
      'select',
      { class: 'field', 'aria-label': 'Juz boʻyicha filtr', style: { maxWidth: '200px' } },
      h('option', { value: '0' }, 'Barcha juzlar (1–30)'),
      Array.from({ length: 30 }, (_, i) => h('option', { value: String(i + 1) }, `${i + 1}-juz`)),
    );
    const pagesWrap = h('div', { style: { display: 'grid', gap: '14px', marginTop: '14px' } });

    const paintPages = () => {
      const byJuz = new Map<number, number[]>();
      for (let p = 1; p <= 604; p++) {
        const [ps, pa] = meta.pages[p - 1];
        const j = juzOf(meta, ps, pa);
        if (selJuz && j !== selJuz) continue;
        let arr = byJuz.get(j);
        if (!arr) byJuz.set(j, (arr = []));
        arr.push(p);
      }
      pagesWrap.replaceChildren(
        ...[...byJuz.entries()].map(([j, pages]) =>
          h(
            'section',
            { class: 'card', style: { padding: '14px 16px' } },
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
              h('strong', null, `${j}-juz sahifalari`),
              h('span', { class: 'muted', style: { fontSize: '13px' } }, `${pages[0]}–${pages[pages.length - 1]}-sahifalar`),
            ),
            h(
              'div',
              { class: 'page-grid' },
              pages.map((p) => {
                const [ps, pa] = meta.pages[p - 1];
                const sm = meta.suras[ps - 1];
                return h(
                  'a',
                  { class: 'page-tile', href: `#${ps}:${pa}`, title: `${p}-sahifa: ${sm.tr} ${ps}:${pa}` },
                  h('strong', null, `${p}-bet`),
                  h('small', { class: 'muted' }, `${sm.tr} ${ps}:${pa}`),
                );
              }),
            ),
          ),
        ),
      );
    };
    juzFilter.addEventListener('change', () => {
      selJuz = Number(juzFilter.value);
      paintPages();
    });
    paintPages();
    body.replaceChildren(
      h('div', { class: 'list-tools', style: { marginTop: '0' } }, jumpForm, juzFilter),
      pagesWrap,
    );
  }

  async function renderSajdaTab() {
    const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];
    const note = h(
      'p',
      { class: 'notice', style: { marginBottom: '14px' } },
      'Qurʼoni Karimda 15 ta sajda belgisi kelgan oyat mavjud (Tanzil metamaʼlumotlari, CC BY 3.0). Mazhablar oʻrtasida tilovat sajdasining hukmi (vojib yoki sunnat/mustahab) va 22-suradagi ikkinchi sajda (22:77) borasida farqli qarashlar bor.',
    );
    const listWrap = h('div', { class: 'results' }, h('div', { class: 'spinner' }));
    body.replaceChildren(note, listWrap);

    const suraNums = [...new Set(meta.sajdas.map(([s]) => s))];
    const suraMap = new Map(await Promise.all(suraNums.map((s) => getSura(s).then((d) => [s, d] as const))));
    if (activeTab !== 'sajda') return;

    listWrap.replaceChildren(
      ...meta.sajdas.map(([s, a, kind], idx) => {
        const sm = meta.suras[s - 1];
        const d = suraMap.get(s)!;
        const jz = juzOf(meta, s, a);
        const pg = pageOf(meta, s, a);
        return h(
          'a',
          { class: 'card result', href: `#${s}:${a}` },
          h(
            'div',
            { class: 'rh' },
            h('span', { class: 'badge sajda' }, `۩ ${idx + 1}-sajda`),
            h('b', null, `${s}:${a}`),
            h('span', null, `${sm.tr} surasi`),
            h('span', null, '·'),
            h('span', null, `${jz}-juz, ${pg}-bet`),
            h('span', { style: { marginLeft: 'auto', fontSize: '12px' } }, `Tanzil: ${kind}`),
          ),
          h(
            'p',
            { class: 'ar result-ar', lang: 'ar' },
            d.ar[a - 1],
            ' ',
            h('span', { class: 'ayah-num', 'aria-hidden': 'true' }, arNum(a)),
          ),
          h('p', { lang: 'uz' }, stripFootnoteMarks(d.tr[ed.id][a - 1])),
        );
      }),
    );
  }

  function renderManzilTab() {
    const cards = [];
    for (let m = 0; m < meta.manzil.length; m++) {
      const [s, a] = meta.manzil[m];
      const [es, ea] = m + 1 < meta.manzil.length ? prevRef(meta, ...meta.manzil[m + 1]) : [114, meta.suras[113].ayas];
      const pStart = pageOf(meta, s, a);
      const pEnd = pageOf(meta, es, ea);
      const surasInManzil = meta.suras.filter((sm) => sm.n >= s && sm.n <= es);
      cards.push(
        h(
          'section',
          { class: 'card', style: { padding: '14px 16px' } },
          h(
            'a',
            { href: `#${s}:${a}`, style: { display: 'flex', gap: '12px', alignItems: 'center', textDecoration: 'none', color: 'inherit' } },
            h('span', { class: 'sura-num' }, String(m + 1)),
            h(
              'span',
              null,
              h('strong', null, `${m + 1}-manzil (${m + 1}-kun)`),
              h('div', { class: 'muted', style: { fontSize: '13.5px' } }, `${name(meta, s)} ${s}:${a} — ${name(meta, es)} ${es}:${ea} · ${pStart}–${pEnd}-betlar (${surasInManzil.length} sura)`),
            ),
            h('span', { style: { marginLeft: 'auto', color: 'var(--muted)' } }, icon(I.right)),
          ),
          h(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' } },
            surasInManzil.map((sm) => h('a', { class: 'chip small', href: `#${sm.n}` }, `${sm.n}. ${sm.tr}`)),
          ),
        ),
      );
    }
    body.replaceChildren(
      h('p', { class: 'notice', style: { marginBottom: '14px' } }, 'Manzil — Qurʼoni Karimni 7 kunda xatm qilish uchun anʼanaviy 7 boʻlim (Tanzil metamaʼlumotlari).'),
      h('div', { style: { display: 'grid', gap: '10px' } }, cards),
    );
  }

  function paint() {
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-pressed', String(k === activeTab));
    history.replaceState(null, '', activeTab === 'juz' ? '#/juz' : `#/juz?tab=${activeTab}`);
    if (activeTab === 'juz') renderJuzTab();
    else if (activeTab === 'sahifa') renderSahifaTab();
    else if (activeTab === 'sajda') renderSajdaTab();
    else renderManzilTab();
  }

  for (const k of Object.keys(tabBtns) as Tab[]) {
    tabBtns[k].addEventListener('click', () => {
      activeTab = k;
      paint();
    });
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Juzlar, sahifalar va sajdalar'),
        h('p', null, 'Qurʼoni Karimning 30 juz (60 hizb), 604 Madina mushafi sahifasi, 15 tilovat sajdasi oyati va 7 manzil boʻyicha koʻrsatkichi. Chegaralar Tanzil metamaʼlumotlaridan olingan.'),
      ),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Boʻlim turi', style: { marginTop: '12px' } }, tabBtns.juz, tabBtns.sahifa, tabBtns.sajda, tabBtns.manzil),
      body,
    ),
  );
  paint();
}

