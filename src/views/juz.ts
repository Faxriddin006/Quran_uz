import { h, icon, I } from '../lib/dom.ts';
import { getMeta, type Meta } from '../lib/data.ts';
import { setTitle } from '../lib/util.ts';
import type { Route } from '../main.ts';

const name = (meta: Meta, s: number) => meta.suras[s - 1]?.tr ?? '';

/** [sura, oyat] dan oldingi oyat (bo'lak oxirini topish uchun) */
function prevRef(meta: Meta, s: number, a: number): [number, number] {
  if (a > 1) return [s, a - 1];
  return [s - 1, meta.suras[s - 2].ayas];
}

export async function render(root: HTMLElement, r: Route) {
  const meta = await getMeta();
  const n = Number(r.rest);
  if (r.rest && n >= 1 && n <= 30) {
    const [s, a] = meta.juz[n - 1];
    location.replace(`#${s}:${a}`);
    return;
  }
  setTitle('Juz va hizblar');
  const cards = [];
  for (let j = 1; j <= 30; j++) {
    const [s, a] = meta.juz[j - 1];
    const [es, ea] = prevRef(meta, ...meta.juz[j]);
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
          h('span', null, h('strong', null, `${j}-juz (pora)`), h('div', { class: 'muted', style: { fontSize: '14px' } }, `${name(meta, s)} ${s}:${a} — ${name(meta, es)} ${es}:${ea}`)),
          h('span', { style: { marginLeft: 'auto', color: 'var(--muted)' } }, icon(I.right)),
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' } }, quarters),
      ),
    );
  }
  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h('div', { class: 'page-head' }, h('h1', null, 'Juz va hizblar'), h('p', null, 'Qurʼon 30 juz (pora), 60 hizb va 240 hizb choragiga boʻlingan. Chegaralar Tanzil metamaʼlumotlaridan olingan.')),
      h('div', { style: { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', padding: '14px 0 50px' } }, cards),
    ),
  );
}
