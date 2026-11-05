import MiniSearch, { type SearchResult } from 'minisearch';
import { h, icon, I } from '../lib/dom.ts';
import { getMeta, fetchJson, fetchText, refOf, type Meta } from '../lib/data.ts';
import { tokenize, normTerm } from '../lib/normalize.ts';
import { setTitle, debounce } from '../lib/util.ts';
import type { Route } from '../main.ts';

let msP: Promise<MiniSearch> | null = null;
let docsT: string[] | null = null;
let docsMP: Promise<string[]> | null = null;

const OPTS = { fields: ['t', 'm'], idField: 'id', tokenize, processTerm: normTerm };

function loadIndex(): Promise<MiniSearch> {
  if (!msP) {
    msP = Promise.all([fetchText('search/index.json'), fetchJson<string[]>('search/docs-t.json')]).then(([idx, t]) => {
      docsT = t;
      return MiniSearch.loadJSON(idx, OPTS);
    });
    msP.catch(() => (msP = null));
  }
  return msP;
}
function loadDocsM(): Promise<string[]> {
  if (!docsMP) {
    docsMP = fetchJson<string[]>('search/docs-m.json');
    docsMP.catch(() => (docsMP = null));
  }
  return docsMP;
}

const WORD = /([\p{L}\p{N}'`ʻʼ‘’]+)/u;
function highlight(text: string, terms: Set<string>): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  const parts = text.split(WORD);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (i % 2 === 1) {
      const n = normTerm(p);
      if (n && terms.has(n)) {
        out.push(h('mark', null, p));
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

export async function render(root: HTMLElement, r: Route) {
  setTitle('Qidiruv');
  const meta = await getMeta();
  const initial = r.query?.get('q') ?? '';

  const input = h('input', {
    class: 'field',
    type: 'search',
    value: initial,
    placeholder: 'Soʻz yoki ibora (lotin yoki kirill), yoki 2:255',
    'aria-label': 'Tarjimalardan qidirish',
    autocomplete: 'off',
    enterkeyhint: 'search',
    autofocus: true,
  });
  const status = h('p', { class: 'muted', role: 'status', style: { margin: '8px 0 0', fontSize: '14px' } });
  const results = h('div', { class: 'results' });

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Qidiruv'),
        h(
          'p',
          null,
          'Muhammad Sodiq Muhammad Yusuf (lotin) va Alouddin Mansur (kirill) tarjimalari boʻyicha. Lotin va kirill yozuvlari bir xil qidiriladi; soʻz boshlanishi va kichik xatolar ham hisobga olinadi.',
        ),
      ),
      h('div', { class: 'search-box' }, h('form', { role: 'search', onsubmit: (e: Event) => e.preventDefault() }, input), status),
      results,
    ),
  );

  let ms: MiniSearch | null = null;
  status.textContent = 'Qidiruv indeksi yuklanmoqda…';
  try {
    ms = await loadIndex();
    status.textContent = '';
  } catch {
    status.textContent = 'Qidiruv indeksini yuklab boʻlmadi. Sahifani yangilang.';
    return;
  }

  let shown = 0;
  let all: SearchResult[] = [];
  let terms = new Set<string>();
  const PAGE = 30;

  async function run(q: string) {
    const v = q.trim();
    history.replaceState(null, '', v ? `#/qidiruv?q=${encodeURIComponent(v)}` : '#/qidiruv');
    results.replaceChildren();
    shown = 0;
    if (!v) {
      status.textContent = '';
      return;
    }
    const ref = /^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/.exec(v) || /^(\d{1,3})$/.exec(v);
    if (ref) {
      const s = Number(ref[1]);
      const a = ref[2] ? Number(ref[2]) : null;
      if (s >= 1 && s <= 114 && (a == null || (a >= 1 && a <= meta.suras[s - 1].ayas))) {
        const sm = meta.suras[s - 1];
        results.append(
          h(
            'a',
            { class: 'card result', href: a ? `#${s}:${a}` : `#${s}` },
            h('div', { class: 'rh' }, icon(I.right), h('b', null, a ? `${s}:${a}` : `${s}-sura`)),
            h('p', null, a ? `${sm.tr} surasi, ${a}-oyatga oʻtish` : `${sm.tr} surasini ochish`),
          ),
        );
      }
    }
    all = ms!.search(v, { prefix: (t) => t.length >= 3, fuzzy: (t) => (t.length >= 5 ? 0.2 : false), combineWith: 'AND', boost: { t: 1.4 } });
    let mode = '';
    if (!all.length) {
      all = ms!.search(v, { prefix: (t) => t.length >= 3, fuzzy: (t) => (t.length >= 5 ? 0.2 : false), combineWith: 'OR', boost: { t: 1.4 } });
      if (all.length) mode = ' (barcha soʻzlar birga topilmadi — istalgan soʻz boʻyicha)';
    }
    terms = new Set(all.flatMap((x) => x.terms));
    status.textContent = all.length ? `${all.length} ta oyat topildi${mode}` : 'Hech narsa topilmadi. Boshqa soʻz yoki yozuvni sinab koʻring.';
    await more(meta);
  }

  async function more(meta: Meta) {
    const slice = all.slice(shown, shown + PAGE);
    const needM = slice.some((x) => !Object.values(x.match).some((f) => f.includes('t')));
    const docsM = needM ? await loadDocsM().catch(() => null) : null;
    const frag = document.createDocumentFragment();
    for (const res of slice) {
      const id = Number(res.id);
      const [s, a] = refOf(meta, id);
      const sm = meta.suras[s - 1];
      const inT = Object.values(res.match).some((f) => f.includes('t'));
      const text = inT || !docsM ? docsT![id] : docsM[id];
      frag.appendChild(
        h(
          'a',
          { class: 'card result', href: `#${s}:${a}` },
          h('div', { class: 'rh' }, h('b', null, `${s}:${a}`), h('span', null, `${sm.tr} surasi`), h('span', null, '·'), h('span', null, inT || !docsM ? 'M. Sodiq (lotin)' : 'A. Mansur (kirill)')),
          h('p', { lang: 'uz' }, highlight(text, terms)),
        ),
      );
    }
    shown += slice.length;
    results.querySelector('.more')?.remove();
    results.appendChild(frag);
    if (shown < all.length) {
      results.appendChild(
        h('button', { class: 'btn more', type: 'button', style: { justifySelf: 'center' }, onclick: () => more(meta) }, `Yana koʻrsatish (${all.length - shown} ta qoldi)`),
      );
    }
  }

  const runD = debounce(run, 180);
  input.addEventListener('input', () => runD(input.value));
  if (initial) run(initial);
  input.focus();
}
