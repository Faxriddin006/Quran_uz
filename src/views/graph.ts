import { h } from '../lib/dom.ts';
import { setTitle } from '../lib/util.ts';
import type { Route } from '../main.ts';

export function render(root: HTMLElement, _r: Route) {
  setTitle('Tayyorlanmoqda');
  root.replaceChildren(
    h('div', { class: 'wrap page-head' }, h('h1', null, 'Bu boʻlim tayyorlanmoqda'), h('p', null, 'Tez orada shu yerda paydo boʻladi.'), h('p', null, h('a', { href: '#/' }, 'Bosh sahifaga qaytish'))),
  );
}
