export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

/** Xavfsiz DOM yaratish: matnlar doim textContent sifatida qo'yiladi. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** Ikonka (faqat ichki, ishonchli path ma'lumotlari). */
export function icon(paths: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  for (const d of paths.split('|')) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export const I = {
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z|M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4-4',
  map: 'M3 3h8v10H3z|M13 3h8v5h-8z|M13 10h8v11h-8z|M3 15h8v6H3z',
  graph:
    'M6 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0|M18 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0|M12 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0|M8 7.5l2.6 8|M16.3 8.4l-3 7|M8.4 6.3l7.6.6',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-5|M12 8h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  auto: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 2v20',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M8.6 13.5l6.8 4|M15.4 6.5l-6.8 4',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7z|M14 4h4v16h-4z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  text: 'M4 7V5h16v2|M9 19h6|M12 5v14',
  close: 'M18 6L6 18|M6 6l12 12',
  layers: 'M12 2l10 6-10 6L2 8z|M2 16l10 6 10-6',
  note: 'M4 4h16v12H8l-4 4z|M8 9h8|M8 12h5',
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M14 14h7v7h-7z|M3 14h7v7H3z',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
  shuffle: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6|M4 4l5 5',
  ext: 'M15 3h6v6|M10 14L21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
};
