import MiniSearch, { type SearchResult } from 'minisearch';
import { h, icon, I } from '../lib/dom.ts';
import { getMeta, fetchJson, fetchText, refOf, getAr, parseQuickNav, juzOf, pageOf, type Meta } from '../lib/data.ts';
import { tokenize, normTerm, normAr } from '../lib/normalize.ts';
import { setTitle, debounce, arNum } from '../lib/util.ts';
import type { Route } from '../main.ts';

let msP: Promise<MiniSearch> | null = null;
let docsT: string[] | null = null;
let docsMP: Promise<string[]> | null = null;

const OPTS = { fields: ['t', 'm'], idField: 'id', tokenize, processTerm: normTerm };

const SUGGESTED_QUERIES = ['sabr', 'rahmat', 'taqvo', 'jannat', 'ilm', 'duo', 'ota-ona', 'adolat', 'shukr', 'tavba', 'الرحمن', '2:255', 'Yosin', '30-juz'];

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

function highlightAr(text: string, qNorm: string): (string | HTMLElement)[] {
  if (!qNorm) return [text];
  const words = text.split(' ');
  const out: (string | HTMLElement)[] = [];
  words.forEach((w, i) => {
    if (i) out.push(' ');
    const nw = normAr(w);
    if (nw && nw.includes(qNorm)) out.push(h('mark', null, w));
    else out.push(w);
  });
  return out;
}

export async function render(root: HTMLElement, r: Route) {
  setTitle('Qidiruv');
  window.__searchQ = (r.query?.get('q') ?? '').trim();
  const meta = await getMeta();
  const initial = r.query?.get('q') ?? '';

  let filterSura = Number(r.query?.get('sura') || 0);
  let filterType: 'all' | 'makkiy' | 'madaniy' = 'all';
  let showAr = false;

  const input = h('input', {
    class: 'field',
    type: 'search',
    value: initial,
    placeholder: 'Soʻz (lotin, kirill, arabcha), sura nomi yoki 2:255, 30-juz, 50-sahifa…',
    'aria-label': 'Tarjimalar va oyatlardan qidirish',
    autocomplete: 'off',
    enterkeyhint: 'search',
    autofocus: true,
  });

  const suraSel = h(
    'select',
    { class: 'field search-filter-sel', 'aria-label': 'Sura boʻyicha filtr' },
    h('option', { value: '0' }, 'Barcha suralar (114)'),
    meta.suras.map((s) => h('option', { value: String(s.n), selected: s.n === filterSura }, `${s.n}. ${s.tr}`)),
  );
  const typeBtns = {
    all: h('button', { class: 'chip small', type: 'button', 'aria-pressed': 'true' }, 'Barchasi'),
    makkiy: h('button', { class: 'chip small', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'dot makkiy' }), 'Makkiy'),
    madaniy: h('button', { class: 'chip small', type: 'button', 'aria-pressed': 'false' }, h('span', { class: 'dot madaniy' }), 'Madaniy'),
  };
  const showArBtn = h('button', { class: 'chip small', type: 'button', 'aria-pressed': 'false' }, 'Arabcha matn bilan');

  const status = h('p', { class: 'muted', role: 'status', style: { margin: '8px 0 0', fontSize: '14px' } });
  const results = h('div', { class: 'results' });

  const emptyState = h(
    'div',
    { class: 'search-empty card' },
    h('h3', { style: { margin: '0 0 8px', fontSize: '16px' } }, 'Tezkor qidiruv namunalari'),
    h(
      'div',
      { class: 'g-chips' },
      SUGGESTED_QUERIES.map((sq) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            onclick: () => {
              input.value = sq;
              run(sq);
            },
          },
          sq,
        ),
      ),
    ),
    h(
      'p',
      { class: 'muted', style: { margin: '12px 0 0', fontSize: '13.5px' } },
      'Maslahat: lotin (',
      h('code', null, 'rahmat'),
      '), kirill (',
      h('code', null, 'раҳмат'),
      ') yoki arabcha (',
      h('code', null, 'الرحمن'),
      ') yozuvda qidirishingiz, shuningdek ',
      h('code', null, 'Baqara 255'),
      ', ',
      h('code', null, '30-juz'),
      ', ',
      h('code', null, '50-sahifa'),
      ' deb yozishingiz mumkin.',
    ),
  );

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
          'Muhammad Sodiq Muhammad Yusuf (lotin), Alouddin Mansur (kirill) tarjimalari hamda Usmoniy arabcha matn boʻyicha. Lotin va kirill yozuvlari bir xil qidiriladi.',
        ),
      ),
      h(
        'div',
        { class: 'search-box' },
        h('form', { role: 'search', onsubmit: (e: Event) => e.preventDefault() }, input),
        h('div', { class: 'search-filters' }, suraSel, typeBtns.all, typeBtns.makkiy, typeBtns.madaniy, showArBtn),
        status,
      ),
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
  let all: { id: number; inT: boolean; isArMatch?: boolean }[] = [];
  let terms = new Set<string>();
  let arQueryNorm = '';
  const PAGE = 30;

  async function run(q: string) {
    const v = q.trim();
    window.__searchQ = v;
    const qp = new URLSearchParams();
    if (v) qp.set('q', v);
    if (filterSura) qp.set('sura', String(filterSura));
    const qs = qp.toString();
    history.replaceState(null, '', qs ? `#/qidiruv?${qs}` : '#/qidiruv');

    results.replaceChildren();
    shown = 0;
    if (!v) {
      status.textContent = '';
      results.appendChild(emptyState);
      return;
    }

    // 1. Tezkor o'tish kartalari (2:255, Baqara 255, Yosin, 30-juz, 50-sahifa va h.k.)
    const quickNavs = parseQuickNav(meta, v, 3);
    for (const qn of quickNavs) {
      results.append(
        h(
          'a',
          { class: 'card result result-quick', href: qn.href },
          h('div', { class: 'rh' }, icon(I.right), h('b', null, qn.badge), h('span', null, qn.sub)),
          h('p', null, h('strong', null, qn.title), qn.ar ? h('span', { class: 'ar', lang: 'ar', style: { float: 'right', fontSize: '22px', color: 'var(--gold)' } }, qn.ar) : null),
        ),
      );
    }

    // 2. Arabcha matn bo'yicha qidiruv
    if (/[؀-ۿ]/.test(v)) {
      arQueryNorm = normAr(v);
      terms = new Set();
      if (arQueryNorm.length >= 2) {
        status.textContent = 'Arabcha matndan qidirilmoqda…';
        const arAll = await getAr();
        const matches: { id: number; inT: boolean; isArMatch?: boolean }[] = [];
        for (let gid = 0; gid < arAll.length; gid++) {
          if (normAr(arAll[gid]).includes(arQueryNorm)) {
            const [s] = refOf(meta, gid);
            const sm = meta.suras[s - 1];
            if (filterSura && s !== filterSura) continue;
            if (filterType !== 'all' && sm.type !== filterType) continue;
            matches.push({ id: gid, inT: true, isArMatch: true });
          }
        }
        all = matches;
        status.textContent = all.length ? `Arabcha matnda ${all.length} ta oyat topildi` : 'Arabcha matnda topilmadi.';
        await more(meta);
        return;
      }
    }

    // 3. O'zbekcha tarjimalar bo'yicha qidiruv (MiniSearch)
    arQueryNorm = '';
    let rawRes: SearchResult[] = ms!.search(v, { prefix: (t) => t.length >= 3, fuzzy: (t) => (t.length >= 4 ? 0.2 : false), combineWith: 'AND', boost: { t: 1.4 } });
    let mode = '';
    if (!rawRes.length) {
      rawRes = ms!.search(v, { prefix: (t) => t.length >= 3, fuzzy: (t) => (t.length >= 4 ? 0.2 : false), combineWith: 'OR', boost: { t: 1.4 } });
      if (rawRes.length) mode = ' (barcha soʻzlar birga topilmadi — istalgan soʻz boʻyicha)';
    }
    terms = new Set(rawRes.flatMap((x) => x.terms));
    all = rawRes
      .map((x) => ({
        id: Number(x.id),
        inT: Object.values(x.match).some((f) => f.includes('t')),
      }))
      .filter((item) => {
        const [s] = refOf(meta, item.id);
        const sm = meta.suras[s - 1];
        if (filterSura && s !== filterSura) return false;
        if (filterType !== 'all' && sm.type !== filterType) return false;
        return true;
      });

    status.textContent = all.length
      ? `${all.length} ta oyat topildi${mode}`
      : quickNavs.length
        ? 'Yuqoridagi tezkor havoladan foydalaning.'
        : 'Hech narsa topilmadi. Boshqa soʻz yoki yozuvni sinab koʻring.';
    await more(meta);
  }

  async function more(meta: Meta) {
    const slice = all.slice(shown, shown + PAGE);
    if (!slice.length) return;
    const needM = slice.some((x) => !x.inT);
    const needAr = showAr || slice.some((x) => x.isArMatch);
    const [docsM, arAll] = await Promise.all([
      needM ? loadDocsM().catch(() => null) : Promise.resolve(null),
      needAr ? getAr().catch(() => null) : Promise.resolve(null),
    ]);
    const frag = document.createDocumentFragment();
    for (const res of slice) {
      const id = res.id;
      const [s, a] = refOf(meta, id);
      const sm = meta.suras[s - 1];
      const text = res.inT || !docsM ? docsT![id] : docsM[id];
      const jz = juzOf(meta, s, a);
      const pg = pageOf(meta, s, a);
      frag.appendChild(
        h(
          'a',
          { class: 'card result', href: `#${s}:${a}` },
          h(
            'div',
            { class: 'rh' },
            h('b', null, `${s}:${a}`),
            h('span', null, `${sm.tr} surasi`),
            h('span', null, '·'),
            h('span', null, `${jz}-juz, ${pg}-bet`),
            h('span', null, '·'),
            h('span', null, res.inT || !docsM ? 'M. Sodiq (lotin)' : 'A. Mansur (kirill)'),
          ),
          needAr && arAll
            ? h(
                'p',
                { class: 'ar result-ar', lang: 'ar' },
                res.isArMatch ? highlightAr(arAll[id], arQueryNorm) : arAll[id],
                ' ',
                h('span', { class: 'ayah-num', 'aria-hidden': 'true' }, arNum(a)),
              )
            : null,
          h('p', { lang: 'uz' }, res.isArMatch ? text : highlight(text, terms)),
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

  suraSel.addEventListener('change', () => {
    filterSura = Number(suraSel.value);
    run(input.value);
  });
  for (const [k, btn] of Object.entries(typeBtns) as ['all' | 'makkiy' | 'madaniy', HTMLButtonElement][]) {
    btn.addEventListener('click', () => {
      filterType = k;
      for (const [k2, b2] of Object.entries(typeBtns)) b2.setAttribute('aria-pressed', String(k2 === filterType));
      run(input.value);
    });
  }
  showArBtn.addEventListener('click', () => {
    showAr = !showAr;
    showArBtn.setAttribute('aria-pressed', String(showAr));
    run(input.value);
  });

  const runD = debounce(run, 180);
  input.addEventListener('input', () => runD(input.value));
  run(initial);
  input.focus();
}

