import { h, icon, I } from '../lib/dom.ts';
import { getMeta, getSura, getTafsir, type Meta, type SuraData, type Edition } from '../lib/data.ts';
import { settings, saveSettings, isBookmarked, toggleBookmark, setLastRead } from '../lib/store.ts';
import { arNum, copyText, siteUrl, toast, typeLabel, setTitle, debounce } from '../lib/util.ts';
import { stripFootnoteMarks } from '../lib/normalize.ts';
import { footerNote } from './home.ts';
import type { Route } from '../main.ts';

export const RECITERS: { id: string; name: string }[] = [
  { id: 'Alafasy_128kbps', name: 'Mishari Rashid al-Afasy' },
  { id: 'Husary_128kbps', name: 'Mahmud Xalil al-Husariy' },
  { id: 'Minshawy_Murattal_128kbps', name: 'Muhammad Siddiq al-Minshaviy (murattal)' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'Abdulbosit Abdussamad (murattal)' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'Abdurrahmon as-Sudays' },
];
const pad3 = (n: number) => String(n).padStart(3, '0');
export const audioUrl = (reciter: string, s: number, a: number) => `https://everyayah.com/data/${reciter}/${pad3(s)}${pad3(a)}.mp3`;

function applySizes() {
  document.documentElement.style.setProperty('--ar-size', `${settings.arSize}px`);
  document.documentElement.style.setProperty('--tr-size', `${settings.trSize}px`);
}

export async function render(root: HTMLElement, r: Route) {
  const meta = await getMeta();
  const n = r.sura!;
  if (!(n >= 1 && n <= 114)) {
    root.replaceChildren(h('div', { class: 'wrap page-head' }, h('h1', null, 'Bunday sura yoʻq'), h('p', null, 'Sura raqami 1 dan 114 gacha boʻlishi kerak.')));
    return;
  }
  const sm = meta.suras[n - 1];
  setTitle(`${sm.n}. ${sm.tr} surasi`);
  applySizes();
  const data = await getSura(n);
  return mount(root, meta, data, r.ayah ?? null);
}

function mount(root: HTMLElement, meta: Meta, data: SuraData, target: number | null) {
  const sm = meta.suras[data.n - 1];
  const audio = new Audio();
  audio.preload = 'none';
  let playing: number | null = null;
  let disposed = false;

  // ---------- Sarlavha ----------
  const head = h(
    'header',
    { class: 'wrap reader-head' },
    h('p', { class: 'ar ar-title', lang: 'ar' }, sm.ar),
    h('h1', null, `${sm.n}. ${sm.tr}`),
    h(
      'div',
      { class: 'meta-row' },
      h('span', { class: `badge ${sm.type}` }, typeLabel(sm.type)),
      h('span', null, `${sm.ayas} oyat`),
      h('span', null, `Nuzul tartibi: ${sm.order}`),
      h('span', null, `${sm.rukus} ruku`),
    ),
  );

  // ---------- Asboblar paneli ----------
  const sel = h(
    'select',
    { 'aria-label': 'Surani tanlash' },
    meta.suras.map((s) => h('option', { value: String(s.n), selected: s.n === sm.n }, `${s.n}. ${s.tr}`)),
  );
  sel.addEventListener('change', () => (location.hash = `#${sel.value}`));
  const jump = h('input', {
    class: 'field',
    type: 'number',
    min: '1',
    max: String(sm.ayas),
    inputmode: 'numeric',
    placeholder: 'Oyat',
    'aria-label': `Oyatga oʻtish (1–${sm.ayas})`,
    style: { width: '86px', padding: '7px 10px' },
  });
  jump.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const a = Number(jump.value);
      if (a >= 1 && a <= sm.ayas) location.hash = `#${sm.n}:${a}`;
    }
  });
  const panelBtn = h('button', { class: 'btn small', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'reader-panel', title: 'Tarjimalar, matn oʻlchami, qiroat' }, icon(I.text), h('span', { class: 'lbl' }, 'Sozlamalar'));
  const arBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(settings.showAr) }, 'Arabcha matnni koʻrsatish');
  const prevA = sm.n > 1 ? h('a', { class: 'icon-btn', href: `#${sm.n - 1}`, 'aria-label': 'Oldingi sura', title: 'Oldingi sura' }, icon(I.left)) : null;
  const nextA = sm.n < 114 ? h('a', { class: 'icon-btn', href: `#${sm.n + 1}`, 'aria-label': 'Keyingi sura', title: 'Keyingi sura' }, icon(I.right)) : null;
  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'wrap' }, prevA, sel, nextA, h('span', { class: 'sep' }), jump, panelBtn));

  // ---------- Sozlamalar paneli ----------
  const edChips = h('div', { class: 'row', role: 'group', 'aria-label': 'Tarjimalar' });
  function paintEdChips() {
    edChips.replaceChildren(
      ...meta.editions.map((e) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(settings.editions.includes(e.id)),
            onclick: () => {
              const on = settings.editions.includes(e.id);
              if (on && settings.editions.length === 1 && !settings.showAr) return toast('Kamida bitta matn koʻrinib turishi kerak');
              settings.editions = on ? settings.editions.filter((x) => x !== e.id) : [...settings.editions, e.id];
              saveSettings();
              paintEdChips();
              renderAyahs();
            },
          },
          `${e.title} (${e.script})`,
        ),
      ),
    );
  }
  paintEdChips();
  const range = (label: string, min: number, max: number, get: () => number, set: (v: number) => void) => {
    const out = h('span', null, String(get()));
    const inp = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(get()), 'aria-label': label });
    inp.addEventListener('input', () => {
      set(Number(inp.value));
      out.textContent = inp.value;
      applySizes();
      saveSettingsDebounced();
    });
    return h('label', { class: 'rng' }, h('span', null, label), inp, out);
  };
  const saveSettingsDebounced = debounce(saveSettings, 300);
  const reciterSel = h(
    'select',
    { class: 'field', 'aria-label': 'Qori', style: { maxWidth: '360px', padding: '8px 10px' } },
    RECITERS.map((rc) => h('option', { value: rc.id, selected: rc.id === settings.reciter }, rc.name)),
  );
  reciterSel.addEventListener('change', () => {
    settings.reciter = reciterSel.value;
    saveSettings();
    stopAudio();
  });
  const panel = h(
    'section',
    { class: 'wrap', id: 'reader-panel', hidden: true },
    h(
      'div',
      { class: 'card panel' },
      h('h3', null, 'Tarjimalar'),
      edChips,
      h('div', { class: 'row' }, arBtn),
      h('h3', null, 'Matn oʻlchami'),
      h('div', { class: 'row' }, range('Arabcha matn', 20, 52, () => settings.arSize, (v) => (settings.arSize = v))),
      h('div', { class: 'row' }, range('Tarjima', 13, 26, () => settings.trSize, (v) => (settings.trSize = v))),
      h('h3', null, 'Qiroat (audio)'),
      h('div', { class: 'row' }, reciterSel),
      h('p', { class: 'muted', style: { fontSize: '13px', margin: 0 } }, 'Audio everyayah.com saytidan oyatma-oyat yuklanadi. ', h('a', { href: '#/manbalar' }, 'Manbalar')),
    ),
  );
  panelBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    panelBtn.setAttribute('aria-expanded', String(!panel.hidden));
  });
  arBtn.addEventListener('click', () => {
    if (settings.showAr && settings.editions.length === 0) return toast('Kamida bitta matn koʻrinib turishi kerak');
    settings.showAr = !settings.showAr;
    arBtn.setAttribute('aria-pressed', String(settings.showAr));
    saveSettings();
    renderAyahs();
  });

  // ---------- Oyatlar ----------
  const list = h('div', { class: 'wrap ayahs' });
  const basmala = data.b ? h('p', { class: 'ar basmala', lang: 'ar' }, data.b) : null;

  function trBlock(ed: Edition, i: number): HTMLElement {
    const text = data.tr[ed.id][i];
    const p = h('p', { lang: 'uz', dir: 'ltr' });
    const boxes: HTMLElement[] = [];
    const addRef = (label: string, fnText: string) => {
      const box = h('div', { class: 'fn-box', hidden: true }, fnText);
      const b = h('button', { class: 'fn-ref', type: 'button', 'aria-expanded': 'false', title: 'Izoh', 'aria-label': `Izoh ${label}` }, label);
      b.addEventListener('click', () => {
        box.hidden = !box.hidden;
        b.setAttribute('aria-expanded', String(!box.hidden));
      });
      boxes.push(box);
      return b;
    };
    if (ed.id === 'sodiq_lat') {
      let last = 0;
      for (const m of text.matchAll(/<sup foot_note="(\d+)">(\d+)<\/sup>/g)) {
        p.append(text.slice(last, m.index));
        const fnText = data.fn.sodiq_lat[m[1]];
        p.append(fnText ? addRef(m[2], fnText) : m[0]);
        last = m.index! + m[0].length;
      }
      p.append(text.slice(last));
    } else {
      const fnStr = (ed.id === 'mansur_cyr' ? data.fn.mansur_cyr[i] : data.fn.sodiq_cyr[i]) || '';
      let last = 0;
      for (const m of text.matchAll(/\[(\d+)\]/g)) {
        if (!fnStr.includes(m[0])) continue;
        p.append(text.slice(last, m.index));
        p.append(addRef(m[1], fnStr));
        last = m.index! + m[0].length;
      }
      p.append(text.slice(last));
    }
    const multi = settings.editions.length > 1;
    return h(
      'div',
      { class: 'tr', 'data-ed': ed.id },
      p,
      boxes,
      h('span', { class: 'src' }, multi || ed.id !== 'sodiq_lat' ? `${ed.title} · ${ed.script}` : ed.title),
    );
  }

  function ayahEl(i: number): HTMLElement {
    const a = i + 1;
    const eds = meta.editions.filter((e) => settings.editions.includes(e.id));
    const bm = isBookmarked(sm.n, a);
    const playBtn = h('button', { class: 'icon-btn play', type: 'button', 'aria-label': `${sm.n}:${a} oyatni tinglash`, title: 'Tinglash' }, icon(I.play));
    const bmBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': String(bm), 'aria-label': 'Saqlash', title: 'Saqlash' }, icon(I.bookmark));
    const tafBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Tafsir', title: 'Tafsir' }, icon(I.note));
    const extra = h('div', { class: 'extra' });
    const el = h(
      'article',
      { class: `ayah${settings.showAr && eds.length ? ' two-col' : ''}`, id: `a${a}`, 'data-a': String(a), 'aria-label': `${sm.n}:${a}` },
      h(
        'div',
        { class: 'ayah-top' },
        h('a', { class: 'ayah-ref', href: `#${sm.n}:${a}`, title: 'Oyat havolasi' }, `${sm.n}:${a}`),
        h(
          'div',
          { class: 'ayah-actions' },
          playBtn,
          tafBtn,
          bmBtn,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nusxa olish', title: 'Nusxa olish', onclick: () => copyAyah(a) }, icon(I.copy)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ulashish', title: 'Ulashish', onclick: () => shareAyah(a) }, icon(I.share)),
        ),
      ),
      settings.showAr ? h('p', { class: 'ar ar-text', lang: 'ar' }, data.ar[i], ' ', h('span', { class: 'ayah-num', 'aria-hidden': 'true' }, arNum(a))) : null,
      eds.length ? h('div', { class: 'tr-list' }, eds.map((e) => trBlock(e, i))) : null,
      extra,
    );
    playBtn.addEventListener('click', () => (playing === a && !audio.paused ? stopAudio() : playAyah(a)));
    bmBtn.addEventListener('click', () => {
      const on = toggleBookmark(sm.n, a);
      bmBtn.setAttribute('aria-pressed', String(on));
      toast(on ? `${sm.n}:${a} saqlandi` : `${sm.n}:${a} saqlanganlardan olib tashlandi`);
    });
    tafBtn.addEventListener('click', () => toggleTafsir(extra, tafBtn, i));
    return el;
  }

  let tafsirChoice = meta.tafsirs[0]?.id;
  function toggleTafsir(extra: HTMLElement, btn: HTMLButtonElement, i: number) {
    const open = btn.getAttribute('aria-expanded') === 'true';
    if (open) {
      extra.replaceChildren();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    btn.setAttribute('aria-expanded', 'true');
    const body = h('div', null, h('div', { class: 'spinner', style: { width: '22px', height: '22px' } }));
    const tabs = h('div', { class: 'tf-tabs', role: 'group', 'aria-label': 'Tafsir tanlash' });
    const box = h('div', { class: 'tafsir-box' }, tabs, body);
    extra.replaceChildren(box);
    const show = async (id: string) => {
      tafsirChoice = id;
      tabs.replaceChildren(
        ...meta.tafsirs.map((t) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(t.id === id), onclick: () => show(t.id) }, t.title)),
      );
      const info = meta.tafsirs.find((t) => t.id === id)!;
      try {
        const arr = await getTafsir(id, data.n);
        const entry = arr[i];
        const [text, notes] = Array.isArray(entry) ? entry : [entry, ''];
        body.replaceChildren(
          h('p', { lang: 'uz' }, text),
          ...(notes ? [h('div', { class: 'fn-box' }, notes)] : []),
          h('span', { class: 'src' }, `Manba: ${info.source}. `, h('a', { href: info.sourceUrl, target: '_blank', rel: 'noopener' }, 'QuranEnc'), ' · ', h('a', { href: '#/manbalar' }, 'Shartlar')),
        );
      } catch {
        body.replaceChildren(h('p', { class: 'muted' }, 'Tafsirni yuklab boʻlmadi.'));
      }
    };
    show(tafsirChoice);
  }

  function renderAyahs() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < data.ar.length; i++) frag.appendChild(ayahEl(i));
    list.replaceChildren(frag);
    observe();
    if (playing) markPlaying(playing);
  }

  // ---------- Nusxa / ulashish ----------
  function plainTr(id: string, i: number) {
    return stripFootnoteMarks(data.tr[id][i]);
  }
  function copyAyah(a: number) {
    const i = a - 1;
    const eds = meta.editions.filter((e) => settings.editions.includes(e.id));
    const parts = [data.ar[i], ...eds.map((e) => `${plainTr(e.id, i)}\n— ${e.title} tarjimasi`), `Qurʼon, ${sm.tr} surasi, ${sm.n}:${a}\n${siteUrl(`#${sm.n}:${a}`)}`];
    copyText(parts.join('\n\n')).then((ok) => toast(ok ? 'Nusxa olindi' : 'Nusxa olib boʻlmadi'));
  }
  async function shareAyah(a: number) {
    const url = siteUrl(`#${sm.n}:${a}`);
    const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];
    const text = `${plainTr(ed.id, a - 1)} (${sm.tr}, ${sm.n}:${a})`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Qurʼon ${sm.n}:${a}`, text, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    const ok = await copyText(url);
    toast(ok ? 'Havola nusxalandi' : url);
  }

  // ---------- Audio ----------
  function markPlaying(a: number | null) {
    list.querySelectorAll('.icon-btn.play').forEach((b) => {
      b.classList.remove('playing');
      b.replaceChildren(icon(I.play));
    });
    if (a == null) return;
    const b = list.querySelector<HTMLButtonElement>(`#a${a} .icon-btn.play`);
    if (b) {
      b.classList.add('playing');
      b.replaceChildren(icon(I.pause));
    }
  }
  function playAyah(a: number) {
    playing = a;
    audio.src = audioUrl(settings.reciter, sm.n, a);
    audio.play().catch(() => {
      toast('Audioni ijro etib boʻlmadi');
      stopAudio();
    });
    markPlaying(a);
  }
  function stopAudio() {
    audio.pause();
    playing = null;
    markPlaying(null);
  }
  audio.addEventListener('ended', () => {
    if (disposed || playing == null) return;
    if (playing < sm.ayas) {
      const next = playing + 1;
      playAyah(next);
      const el = document.getElementById(`a${next}`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > innerHeight * 0.7) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else stopAudio();
  });

  // ---------- Oxirgi oʻqilgan joy ----------
  let io: IntersectionObserver | null = null;
  const saveLast = debounce((a: number) => !disposed && setLastRead(sm.n, a), 600);
  function observe() {
    io?.disconnect();
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) saveLast(Number((e.target as HTMLElement).dataset.a));
      },
      { rootMargin: '-120px 0px -70% 0px' },
    );
    list.querySelectorAll('.ayah').forEach((el) => io!.observe(el));
  }

  // ---------- Sura navigatsiyasi ----------
  const prev = sm.n > 1 ? meta.suras[sm.n - 2] : null;
  const next = sm.n < 114 ? meta.suras[sm.n] : null;
  const nav = h(
    'nav',
    { class: 'wrap sura-nav', 'aria-label': 'Suralar boʻylab' },
    prev ? h('a', { class: 'btn', href: `#${prev.n}` }, icon(I.left), `${prev.n}. ${prev.tr}`) : h('span'),
    next ? h('a', { class: 'btn next', href: `#${next.n}` }, `${next.n}. ${next.tr}`, icon(I.right)) : h('span'),
  );

  root.replaceChildren(head, toolbar, panel, ...(basmala ? [h('div', { class: 'wrap' }, basmala)] : []), list, nav, h('div', { class: 'wrap' }, footerNote()));
  renderAyahs();

  function focus(a: number | null) {
    if (a == null || a < 1 || a > sm.ayas) {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(`a${a}`);
    if (!el) return;
    const go = () => el.scrollIntoView({ block: 'start' });
    go();
    el.classList.remove('target');
    void el.offsetWidth;
    el.classList.add('target');
    requestAnimationFrame(go);
    document.fonts?.ready.then(() => !disposed && go());
    setTimeout(() => !disposed && go(), 350);
  }
  if (target) focus(target);
  else window.scrollTo({ top: 0 });
  window.__reader = { sura: sm.n, focus };

  return () => {
    disposed = true;
    io?.disconnect();
    audio.pause();
    audio.src = '';
  };
}
