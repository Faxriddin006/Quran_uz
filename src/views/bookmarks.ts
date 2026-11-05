import { h, icon, I } from '../lib/dom.ts';
import { getMeta, getSura } from '../lib/data.ts';
import { getBookmarks, getLastRead, toggleBookmark, settings } from '../lib/store.ts';
import { setTitle, toast } from '../lib/util.ts';
import { stripFootnoteMarks } from '../lib/normalize.ts';
import type { Route } from '../main.ts';

export async function render(root: HTMLElement, _r: Route) {
  setTitle('Saqlanganlar');
  const meta = await getMeta();
  const list = h('div', { class: 'results' });
  const last = getLastRead();
  const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];

  async function paint() {
    const bms = getBookmarks();
    if (!bms.length) {
      list.replaceChildren(h('p', { class: 'notice' }, 'Hali saqlangan oyat yoʻq. Oʻqish sahifasida oyat yonidagi ', icon(I.bookmark), ' belgisini bosing. Saqlanganlar faqat shu brauzerda turadi.'));
      return;
    }
    const suras = await Promise.all([...new Set(bms.map((b) => b.s))].map((s) => getSura(s).then((d) => [s, d] as const)));
    const bySura = new Map(suras);
    list.replaceChildren(
      ...bms.map((b) => {
        const d = bySura.get(b.s)!;
        const sm = meta.suras[b.s - 1];
        const rm = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Oʻchirish', title: 'Oʻchirish' }, icon(I.close));
        rm.addEventListener('click', (e) => {
          e.preventDefault();
          toggleBookmark(b.s, b.a);
          toast(`${b.s}:${b.a} olib tashlandi`);
          paint();
        });
        return h(
          'a',
          { class: 'card result', href: `#${b.s}:${b.a}` },
          h('div', { class: 'rh' }, h('b', null, `${b.s}:${b.a}`), h('span', null, `${sm.tr} surasi`), h('span', { style: { marginLeft: 'auto' } }, rm)),
          h('p', { class: 'ar', lang: 'ar', style: { fontSize: '24px', lineHeight: '2', textAlign: 'right', margin: '0 0 6px' } }, d.ar[b.a - 1]),
          h('p', { lang: 'uz' }, stripFootnoteMarks(d.tr[ed.id][b.a - 1])),
        );
      }),
    );
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'page-head' }, h('h1', null, 'Saqlanganlar'), h('p', null, 'Saqlangan oyatlar va oxirgi oʻqilgan joy shu qurilmadagi brauzerda saqlanadi (serverga yuborilmaydi).')),
      last
        ? h(
            'a',
            { class: 'card result', href: `#${last.s}:${last.a}`, style: { margin: '14px 0' } },
            h('div', { class: 'rh' }, icon(I.book), h('b', null, 'Oxirgi oʻqilgan joy')),
            h('p', null, `${meta.suras[last.s - 1].tr} surasi, ${last.s}:${last.a} — davom ettirish`),
          )
        : null,
      list,
    ),
  );
  await paint();
}
