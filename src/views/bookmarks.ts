import { h, icon, I } from '../lib/dom.ts';
import { getMeta, getSura, juzOf, pageOf } from '../lib/data.ts';
import {
  getBookmarks,
  getLastRead,
  getHistory,
  clearHistory,
  toggleBookmark,
  setBookmarkNote,
  importBookmarks,
  settings,
  type Bookmark,
} from '../lib/store.ts';
import { setTitle, toast, relTime, copyText } from '../lib/util.ts';
import { stripFootnoteMarks } from '../lib/normalize.ts';
import type { Route } from '../main.ts';

export async function render(root: HTMLElement, _r: Route) {
  setTitle('Saqlanganlar');
  const meta = await getMeta();
  const list = h('div', { class: 'results' });
  const histBox = h('div');
  const toolsBox = h('div', { class: 'bm-tools' });
  const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      const arr: Bookmark[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : [];
      const added = importBookmarks(arr);
      toast(`${added} ta saqlangan oyat qoʻshildi`);
      await paint();
    } catch {
      toast('Faylni oʻqib boʻlmadi (notoʻgʻri JSON)');
    }
    fileInput.value = '';
  });

  function paintHistory() {
    const last = getLastRead();
    const hist = getHistory();
    if (!last && !hist.length) {
      histBox.replaceChildren();
      return;
    }
    const items = hist.length ? hist : last ? [last] : [];
    histBox.replaceChildren(
      h(
        'section',
        { class: 'card bm-hist-card' },
        h(
          'div',
          { class: 'bm-hist-head' },
          h('strong', null, icon(I.clock), ' Oxirgi oʻqilgan suralar'),
          hist.length
            ? h(
                'button',
                {
                  class: 'chip small',
                  type: 'button',
                  onclick: () => {
                    clearHistory();
                    paintHistory();
                    toast('Oʻqish tarixi tozalandi');
                  },
                },
                'Tarixni tozalash',
              )
            : null,
        ),
        h(
          'div',
          { class: 'bm-hist-grid' },
          items.map((item, idx) => {
            const sm = meta.suras[item.s - 1];
            const pct = Math.round((item.a / sm.ayas) * 100);
            return h(
              'a',
              { class: `bm-hist-item${idx === 0 ? ' primary' : ''}`, href: `#${item.s}:${item.a}` },
              h(
                'div',
                { class: 'bm-hist-top' },
                h('strong', null, `${sm.n}. ${sm.tr}`),
                h('span', { class: 'ayah-ref' }, `${item.s}:${item.a}`),
              ),
              h('div', { class: 'muted', style: { fontSize: '12.5px' } }, `${pct}% (${item.a}/${sm.ayas} oyat) · ${relTime(item.t)}`),
              h('div', { class: 'bm-prog' }, h('div', { style: { width: `${pct}%` } })),
            );
          }),
        ),
      ),
    );
  }

  async function paint() {
    const bms = getBookmarks();
    toolsBox.replaceChildren(
      h('h2', { style: { margin: 0, fontSize: '20px' } }, `Saqlangan oyatlar (${bms.length})`),
      h(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' } },
        bms.length
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: async () => {
                  const suras = await Promise.all([...new Set(bms.map((b) => b.s))].map((s) => getSura(s).then((d) => [s, d] as const)));
                  const bySura = new Map(suras);
                  const text = bms
                    .map((b) => {
                      const d = bySura.get(b.s)!;
                      const sm = meta.suras[b.s - 1];
                      return `${sm.tr} ${b.s}:${b.a}\n${d.ar[b.a - 1]}\n${stripFootnoteMarks(d.tr[ed.id][b.a - 1])}${b.note ? `\nEslatma: ${b.note}` : ''}`;
                    })
                    .join('\n\n---\n\n');
                  const ok = await copyText(text);
                  toast(ok ? 'Barcha saqlangan oyatlar nusxalandi' : 'Nusxa olib boʻlmadi');
                },
              },
              icon(I.copy),
              'Nusxa olish',
            )
          : null,
        bms.length
          ? h(
              'button',
              {
                class: 'btn small',
                type: 'button',
                onclick: () => {
                  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), bookmarks: bms }, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = h('a', { href: url, download: `quran-uz-saqlanganlar-${new Date().toISOString().slice(0, 10)}.json` });
                  a.click();
                  URL.revokeObjectURL(url);
                },
              },
              icon(I.download),
              'Eksport (JSON)',
            )
          : null,
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => fileInput.click(),
          },
          icon(I.upload),
          'Import (JSON)',
        ),
        fileInput,
      ),
    );

    if (!bms.length) {
      list.replaceChildren(
        h(
          'p',
          { class: 'notice' },
          'Hali saqlangan oyat yoʻq. Oʻqish sahifasida oyat yonidagi ',
          icon(I.bookmark),
          ' belgisini bosing. Saqlanganlar faqat shu brauzerda turadi (yoki JSON fayl orqali eksport/import qilinadi).',
        ),
      );
      return;
    }
    const suras = await Promise.all([...new Set(bms.map((b) => b.s))].map((s) => getSura(s).then((d) => [s, d] as const)));
    const bySura = new Map(suras);
    list.replaceChildren(
      ...bms.map((b) => {
        const d = bySura.get(b.s)!;
        const sm = meta.suras[b.s - 1];
        const jz = juzOf(meta, b.s, b.a);
        const pg = pageOf(meta, b.s, b.a);
        const noteInput = h('input', {
          class: 'field bm-note-input',
          type: 'text',
          value: b.note ?? '',
          placeholder: 'Shaxsiy eslatma qoʻshish…',
          'aria-label': `${b.s}:${b.a} uchun shaxsiy eslatma`,
        });
        noteInput.addEventListener('change', () => {
          setBookmarkNote(b.s, b.a, noteInput.value);
          toast('Eslatma saqlandi');
        });
        const rm = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Oʻchirish', title: 'Oʻchirish' }, icon(I.close));
        rm.addEventListener('click', () => {
          toggleBookmark(b.s, b.a);
          toast(`${b.s}:${b.a} olib tashlandi`);
          paint();
        });
        return h(
          'article',
          { class: 'card result bm-card' },
          h(
            'div',
            { class: 'rh' },
            h('a', { class: 'ayah-ref', href: `#${b.s}:${b.a}` }, `${b.s}:${b.a}`),
            h('a', { href: `#${b.s}:${b.a}`, style: { fontWeight: '600', textDecoration: 'none', color: 'var(--ink)' } }, `${sm.tr} surasi`),
            h('span', null, `· ${jz}-juz, ${pg}-bet`),
            h('span', null, `· ${relTime(b.t)}`),
            h('span', { style: { marginLeft: 'auto' } }, rm),
          ),
          h(
            'a',
            { href: `#${b.s}:${b.a}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } },
            h('p', { class: 'ar', lang: 'ar', style: { fontSize: '24px', lineHeight: '2', textAlign: 'right', margin: '0 0 6px' } }, d.ar[b.a - 1]),
            h('p', { lang: 'uz' }, stripFootnoteMarks(d.tr[ed.id][b.a - 1])),
          ),
          noteInput,
        );
      }),
    );
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap' },
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Saqlanganlar va oʻqish tarixi'),
        h('p', null, 'Saqlangan oyatlar, shaxsiy eslatmalar va oxirgi oʻqilgan suralar shu qurilmadagi brauzerda saqlanadi (serverga yuborilmaydi).'),
      ),
      histBox,
      toolsBox,
      list,
    ),
  );
  paintHistory();
  await paint();
}

