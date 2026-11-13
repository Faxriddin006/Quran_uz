import { h, icon, I } from '../lib/dom.ts';
import {
  getMeta,
  getSura,
  getTafsir,
  getRootIndex,
  getRootsByAya,
  juzOf,
  pageOf,
  sajdaOf,
  dividersAt,
  type Meta,
  type SuraData,
  type Edition,
} from '../lib/data.ts';
import {
  settings,
  saveSettings,
  isBookmarked,
  toggleBookmark,
  setLastRead,
  type ReaderLayout,
  type AudioMode,
  type UzAudioEdition,
} from '../lib/store.ts';
import { arNum, copyText, siteUrl, toast, typeLabel, setTitle, debounce } from '../lib/util.ts';
import { stripFootnoteMarks, normTerm, normAr, tokenize } from '../lib/normalize.ts';
import {
  speakUzAyah,
  stopUzSpeech,
  pauseUzSpeech,
  resumeUzSpeech,
  isUzSpeaking,
  isUzPaused,
  getUzVoiceOptions,
} from '../lib/uz-audio.ts';
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
  const nextPreload = new Audio();
  audio.preload = 'none';
  nextPreload.preload = 'none';
  let playing: number | null = null;
  let playingStep: 'ar' | 'uz' = 'ar';
  let repeatCount = 0;
  let disposed = false;
  let suraFilter = '';
  let mushafSelectedAyah = target && target >= 1 && target <= sm.ayas ? target : 1;

  function getActiveUzEdition(): Edition {
    if (settings.uzAudioEdition !== 'auto') {
      const found = meta.editions.find((e) => e.id === settings.uzAudioEdition);
      if (found) return found;
    }
    const firstActive = meta.editions.find((e) => settings.editions.includes(e.id));
    return firstActive ?? meta.editions[0];
  }

  function isAudioPaused(): boolean {
    if (playing == null) return true;
    if (playingStep === 'ar') return audio.paused;
    return isUzPaused() || !isUzSpeaking();
  }

  const jStart = juzOf(meta, sm.n, 1);
  const jEnd = juzOf(meta, sm.n, sm.ayas);
  const pStart = pageOf(meta, sm.n, 1);
  const pEnd = pageOf(meta, sm.n, sm.ayas);

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
      h('a', { class: 'meta-link', href: `#/juz` }, jStart === jEnd ? `${jStart}-juz` : `${jStart}–${jEnd}-juzlar`),
      h('a', { class: 'meta-link', href: `#/juz?tab=sahifa` }, pStart === pEnd ? `${pStart}-sahifa` : `${pStart}–${pEnd}-sahifalar`),
      h('span', null, `Nuzul: ${sm.order}`),
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
    placeholder: `Oyat (1–${sm.ayas})`,
    'aria-label': `Oyatga oʻtish (1–${sm.ayas})`,
    style: { width: '108px', padding: '7px 10px' },
  });
  const jumpForm = h(
    'form',
    {
      style: { display: 'inline-flex', margin: 0 },
      onsubmit: (e: Event) => {
        e.preventDefault();
        const a = Number(jump.value);
        if (a >= 1 && a <= sm.ayas) location.hash = `#${sm.n}:${a}`;
      },
    },
    jump,
  );
  jump.addEventListener('change', () => {
    const a = Number(jump.value);
    if (a >= 1 && a <= sm.ayas) location.hash = `#${sm.n}:${a}`;
  });

  const filterInput = h('input', {
    class: 'field toolbar-filter',
    type: 'search',
    placeholder: 'Suradan qidirish…',
    'aria-label': 'Shu sura ichidan qidirish',
    autocomplete: 'off',
  });
  filterInput.addEventListener(
    'input',
    debounce(() => {
      suraFilter = filterInput.value.trim();
      renderAyahs();
    }, 140),
  );

  const playSuraBtn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      title: 'Arabcha qiroatni ketma-ket tinglash',
      onclick: () => {
        if (playing != null && !isAudioPaused() && settings.audioMode !== 'uz') {
          stopAudio();
        } else {
          if (settings.audioMode === 'uz') {
            settings.audioMode = 'ar';
            saveSettings();
            paintAudioModeBtns();
            paintAudioControls();
          }
          playAyah(playing ?? 1, 'ar');
        }
      },
    },
    icon(I.play),
    h('span', { class: 'lbl' }, 'Arabcha'),
  );

  const playUzSuraBtn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      title: 'Oʻzbekcha maʼnolar tarjimasini oyatma-oyat ketma-ket tinglash',
      onclick: () => {
        if (playing != null && !isAudioPaused() && (settings.audioMode === 'uz' || playingStep === 'uz')) {
          stopAudio();
        } else {
          if (settings.audioMode === 'ar') {
            settings.audioMode = 'uz';
            saveSettings();
            paintAudioModeBtns();
            paintAudioControls();
          }
          playAyah(playing ?? 1, 'uz');
        }
      },
    },
    icon(I.play),
    h('span', null, 'Oʻzb audio'),
  );

  const tlToolbarBtn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      'aria-pressed': String(settings.showTranslit),
      title: 'Arabcha matnning kirillcha oʻqilishini (talaffuzini) koʻrsatish / yashirish',
      onclick: () => toggleTranslit(),
    },
    h('span', null, 'Ўқилиши'),
  );

  const panelBtn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': 'reader-panel',
      title: 'Koʻrinish, tarjimalar, matn oʻlchami, qiroat',
    },
    icon(I.text),
    h('span', { class: 'lbl' }, 'Sozlamalar'),
  );

  const prevA = sm.n > 1 ? h('a', { class: 'icon-btn', href: `#${sm.n - 1}`, 'aria-label': 'Oldingi sura', title: 'Oldingi sura' }, icon(I.left)) : null;
  const nextA = sm.n < 114 ? h('a', { class: 'icon-btn', href: `#${sm.n + 1}`, 'aria-label': 'Keyingi sura', title: 'Keyingi sura' }, icon(I.right)) : null;
  const progressFill = h('div', { class: 'reading-progress-fill' });
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h('div', { class: 'wrap' }, prevA, sel, nextA, h('span', { class: 'sep' }), jumpForm, filterInput, tlToolbarBtn, playSuraBtn, playUzSuraBtn, panelBtn),
    h('div', { class: 'reading-progress', 'aria-hidden': 'true' }, progressFill),
  );

  // ---------- Sozlamalar paneli ----------
  const layoutGroup = h('div', { class: 'seg', role: 'group', 'aria-label': 'Koʻrinish tartibi' });
  const LAYOUTS: { id: ReaderLayout; label: string }[] = [
    { id: 'split', label: 'Yonma-yon' },
    { id: 'stack', label: 'Ketma-ket' },
    { id: 'mushaf', label: 'Mushaf sahifasi' },
  ];
  function paintLayoutBtns() {
    layoutGroup.replaceChildren(
      ...LAYOUTS.map((l) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(settings.layout === l.id),
            onclick: () => {
              settings.layout = l.id;
              if (l.id === 'mushaf' && !settings.showAr) {
                settings.showAr = true;
                arBtn.setAttribute('aria-pressed', 'true');
              }
              saveSettings();
              paintLayoutBtns();
              renderAyahs();
            },
          },
          l.label,
        ),
      ),
    );
  }
  paintLayoutBtns();

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
              if (on && settings.editions.length === 1 && !settings.showAr && !settings.showTranslit)
                return toast('Kamida bitta matn koʻrinib turishi kerak');
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

  const arBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(settings.showAr) }, 'Arabcha matnni koʻrsatish');
  const tlBtn = h(
    'button',
    { class: 'chip', type: 'button', 'aria-pressed': String(settings.showTranslit), onclick: () => toggleTranslit() },
    'Arabcha kirillcha oʻqilishi (талаффуз)',
  );
  const divBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(settings.showDividers) }, 'Juz, hizb va sahifa chegaralari');

  function toggleTranslit() {
    if (settings.showTranslit && !settings.showAr && settings.editions.length === 0) {
      return toast('Kamida bitta matn koʻrinib turishi kerak');
    }
    settings.showTranslit = !settings.showTranslit;
    tlBtn.setAttribute('aria-pressed', String(settings.showTranslit));
    tlToolbarBtn.setAttribute('aria-pressed', String(settings.showTranslit));
    saveSettings();
    renderAyahs();
  }

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

  const audioModeGroup = h('div', { class: 'seg', role: 'group', 'aria-label': 'Audio tinglash rejimi' });
  const AUDIO_MODES: { id: AudioMode; label: string }[] = [
    { id: 'ar', label: 'Faqat arabcha' },
    { id: 'uz', label: 'Faqat oʻzbekcha' },
    { id: 'both', label: 'Arabcha + Oʻzbekcha ketma-ket' },
  ];
  function paintAudioModeBtns() {
    audioModeGroup.replaceChildren(
      ...AUDIO_MODES.map((m) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(settings.audioMode === m.id),
            onclick: () => {
              settings.audioMode = m.id;
              saveSettings();
              paintAudioModeBtns();
              paintAudioControls();
              if (playing != null) playAyah(playing);
            },
          },
          m.label,
        ),
      ),
    );
  }
  paintAudioModeBtns();

  const reciterSel = h(
    'select',
    { class: 'field', 'aria-label': 'Arabcha qori', style: { maxWidth: '340px', padding: '8px 10px' } },
    RECITERS.map((rc) => h('option', { value: rc.id, selected: rc.id === settings.reciter }, `Arabcha: ${rc.name}`)),
  );
  reciterSel.addEventListener('change', () => {
    settings.reciter = reciterSel.value;
    saveSettings();
    if (playing != null && playingStep === 'ar') playAyah(playing, 'ar');
  });

  const uzEdSel = h(
    'select',
    { class: 'field', 'aria-label': 'Oʻzbekcha audio tarjimasi', style: { maxWidth: '340px', padding: '8px 10px' } },
    h('option', { value: 'auto', selected: settings.uzAudioEdition === 'auto' }, 'Oʻzbekcha matn: Tanlangan tarjima (avtomatik)'),
    ...meta.editions.map((e) =>
      h('option', { value: e.id, selected: settings.uzAudioEdition === e.id }, `Oʻzbekcha matn: ${e.title} (${e.script})`),
    ),
  );
  uzEdSel.addEventListener('change', () => {
    settings.uzAudioEdition = uzEdSel.value as UzAudioEdition;
    saveSettings();
    if (playing != null && playingStep === 'uz') playAyah(playing, 'uz');
  });

  const uzVoiceSel = h('select', {
    class: 'field',
    'aria-label': 'Oʻzbekcha ovoz',
    style: { maxWidth: '340px', padding: '8px 10px' },
  });
  function populateVoiceSelect() {
    const vOpts = getUzVoiceOptions();
    uzVoiceSel.replaceChildren(
      h('option', { value: 'auto', selected: settings.uzVoice === 'auto' }, 'Ovoz: Avtomatik (eng mos ovoz)'),
      ...vOpts.map((v) => h('option', { value: v.uri, selected: settings.uzVoice === v.uri }, `Ovoz: ${v.name}`)),
    );
    uzVoiceSel.hidden = vOpts.length === 0;
  }
  populateVoiceSelect();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', populateVoiceSelect);
    } catch {
      /* ignore */
    }
  }
  uzVoiceSel.addEventListener('change', () => {
    settings.uzVoice = uzVoiceSel.value;
    saveSettings();
    if (playing != null && playingStep === 'uz') playAyah(playing, 'uz');
  });

  const panel = h(
    'section',
    { class: 'wrap', id: 'reader-panel', hidden: true },
    h(
      'div',
      { class: 'card panel' },
      h('h3', null, 'Koʻrinish'),
      h('div', { class: 'row' }, layoutGroup, divBtn),
      h('h3', null, 'Tarjimalar va oʻqilishi'),
      edChips,
      h('div', { class: 'row' }, tlBtn, arBtn),
      h('h3', null, 'Matn oʻlchami'),
      h('div', { class: 'row' }, range('Arabcha matn', 20, 52, () => settings.arSize, (v) => (settings.arSize = v))),
      h('div', { class: 'row' }, range('Tarjima va oʻqilishi', 13, 26, () => settings.trSize, (v) => (settings.trSize = v))),
      h('h3', null, 'Qiroat va Oʻzbekcha audio'),
      h('div', { class: 'row' }, audioModeGroup),
      h('div', { class: 'row' }, reciterSel, uzEdSel, uzVoiceSel),
      h(
        'p',
        { class: 'muted', style: { fontSize: '13px', margin: 0 } },
        'Arabcha qiroat everyayah.com saytidan, oʻzbekcha maʼnolar tarjimasi esa tanlangan tarjima matni asosida oyatma-oyat ketma-ket oʻqiladi. ',
        h('a', { href: '#/manbalar' }, 'Manbalar'),
      ),
    ),
  );
  panelBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    panelBtn.setAttribute('aria-expanded', String(!panel.hidden));
  });
  arBtn.addEventListener('click', () => {
    if (settings.showAr && settings.editions.length === 0 && !settings.showTranslit) return toast('Kamida bitta matn koʻrinib turishi kerak');
    settings.showAr = !settings.showAr;
    arBtn.setAttribute('aria-pressed', String(settings.showAr));
    saveSettings();
    renderAyahs();
  });
  divBtn.addEventListener('click', () => {
    settings.showDividers = !settings.showDividers;
    divBtn.setAttribute('aria-pressed', String(settings.showDividers));
    saveSettings();
    renderAyahs();
  });

  // ---------- Oyatlar ----------
  const list = h('div', { class: 'wrap ayahs' });
  const basmala = data.b
    ? h(
        'div',
        { class: 'basmala-wrap' },
        h('p', { class: 'ar basmala', lang: 'ar' }, data.b),
        data.btl ? h('p', { class: 'basmala-tl', lang: 'uz-Cyrl', hidden: !settings.showTranslit }, data.btl) : null,
      )
    : null;

  function tlBlock(i: number): HTMLElement | null {
    const t = data.tl?.[i];
    if (!t) return null;
    return h(
      'div',
      { class: 'tr translit-box', 'data-ed': 'tl_cyr' },
      h('p', { class: 'translit-text', lang: 'uz-Cyrl', dir: 'ltr' }, t),
      h('span', { class: 'src' }, 'Кириллча ўқилиши (талаффуз)'),
    );
  }

  function trBlock(ed: Edition, i: number): HTMLElement {
    const text = data.tr[ed.id][i];
    const p = h('p', { lang: 'uz', dir: 'ltr' });
    const boxes: HTMLElement[] = [];
    const addRef = (label: string, fnText: string, prefixLabel = false) => {
      const box = h('div', { class: 'fn-box', hidden: true }, prefixLabel ? h('strong', null, `[${label}] `) : null, fnText);
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
        p.append(fnText ? addRef(m[2], fnText, true) : m[0]);
        last = m.index! + m[0].length;
      }
      p.append(text.slice(last));
    } else {
      const fnStr = (ed.id === 'mansur_cyr' ? data.fn.mansur_cyr[i] : data.fn.sodiq_cyr[i]) || '';
      let last = 0;
      for (const m of text.matchAll(/\[(\d+)\]/g)) {
        if (!fnStr.includes(m[0])) continue;
        p.append(text.slice(last, m.index));
        p.append(addRef(m[1], fnStr, false));
        last = m.index! + m[0].length;
      }
      p.append(text.slice(last));
    }
    const multi = settings.editions.length > 1 || settings.showTranslit;
    return h(
      'div',
      { class: `tr${multi ? ' tr-multi' : ''}`, 'data-ed': ed.id },
      p,
      boxes,
      h('span', { class: 'src' }, multi || ed.id !== 'sodiq_lat' ? `${ed.title} · ${ed.script}` : ed.title),
    );
  }

  function dividerEl(a: number): HTMLElement | null {
    if (!settings.showDividers) return null;
    const d = dividersAt(meta, sm.n, a);
    if (!d.juz && !d.hizb && !d.page && !d.manzil) return null;
    const pills: HTMLElement[] = [];
    if (d.juz) pills.push(h('a', { class: 'div-pill juz', href: '#/juz' }, `۞ ${d.juz}-juz boshi`));
    if (d.hizb) pills.push(h('a', { class: 'div-pill hizb', href: '#/juz' }, d.hizb));
    if (d.manzil && a > 1) pills.push(h('a', { class: 'div-pill', href: '#/juz?tab=manzil' }, `${d.manzil}-manzil`));
    if (d.page) pills.push(h('a', { class: 'div-pill page', href: '#/juz?tab=sahifa' }, `${d.page}-sahifa`));
    return h('div', { class: 'ayah-divider', 'aria-label': 'Mushaf boʻlinishi' }, pills);
  }

  function ayahEl(i: number): HTMLElement {
    const a = i + 1;
    const eds = meta.editions.filter((e) => settings.editions.includes(e.id));
    const hasLeftCol = eds.length > 0 || settings.showTranslit;
    const bm = isBookmarked(sm.n, a);
    const sajda = sajdaOf(meta, sm.n, a);
    const jz = juzOf(meta, sm.n, a);
    const pg = pageOf(meta, sm.n, a);
    const playBtn = h(
      'button',
      { class: 'icon-btn play', type: 'button', 'aria-label': `${sm.n}:${a} oyatni tinglash`, title: 'Oyatni tinglash (arabcha / tanlangan rejim)' },
      icon(I.play),
    );
    const playUzBtn = h(
      'button',
      {
        class: 'icon-btn uz-play-btn',
        type: 'button',
        'aria-label': `${sm.n}:${a} oyatning oʻzbekcha maʼnosini tinglash`,
        title: 'Oʻzbekcha tarjimani ketma-ket tinglash',
      },
      'Oʻz',
    );
    const bmBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-pressed': String(bm), 'aria-label': 'Saqlash', title: 'Saqlash' }, icon(I.bookmark));
    const tafBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Tafsir', title: 'Tafsir' }, icon(I.note));
    const rootBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Soʻzlar va ildizlar', title: 'Soʻzlar va ildizlar' }, icon(I.graph));
    const extra = h('div', { class: 'extra' });
    const twoCol = settings.layout === 'split' && settings.showAr && hasLeftCol;
    const stacked = settings.layout === 'stack';
    const el = h(
      'article',
      {
        class: `ayah${twoCol ? ' two-col' : ''}${stacked ? ' stacked-col' : ''}`,
        id: `a${a}`,
        'data-a': String(a),
        'aria-label': `${sm.n}:${a}`,
      },
      h(
        'div',
        { class: 'ayah-top' },
        h('a', { class: 'ayah-ref', href: `#${sm.n}:${a}`, title: 'Oyat havolasi' }, `${sm.n}:${a}`),
        h('span', { class: 'ayah-loc muted' }, `${jz}-juz · ${pg}-bet`),
        sajda ? h('a', { class: 'badge sajda', href: '#/juz?tab=sajda', title: `Tilovat sajdasi oyati (Tanzil: ${sajda})` }, '۩ Sajda oyati') : null,
        h(
          'div',
          { class: 'ayah-actions' },
          playBtn,
          playUzBtn,
          tafBtn,
          rootBtn,
          bmBtn,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nusxa olish', title: 'Nusxa olish', onclick: () => copyAyah(a) }, icon(I.copy)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Ulashish', title: 'Ulashish (havola yoki rasm)', onclick: (e: Event) => (e.stopPropagation(), openShareMenu(e.currentTarget as HTMLElement, a)) }, icon(I.share)),
        ),
      ),
      settings.showAr ? h('p', { class: 'ar ar-text', lang: 'ar' }, data.ar[i], ' ', h('span', { class: 'ayah-num', 'aria-hidden': 'true' }, arNum(a))) : null,
      hasLeftCol
        ? h(
            'div',
            { class: 'tr-list' },
            settings.showTranslit ? tlBlock(i) : null,
            eds.map((e) => trBlock(e, i)),
          )
        : null,
      extra,
    );
    playBtn.addEventListener('click', () => {
      if (playing === a && !isAudioPaused() && (settings.audioMode !== 'uz' || playingStep === 'ar')) {
        stopAudio();
      } else {
        playAyah(a);
      }
    });
    playUzBtn.addEventListener('click', () => {
      if (playing === a && playingStep === 'uz' && !isAudioPaused()) {
        stopAudio();
      } else {
        if (settings.audioMode === 'ar') {
          settings.audioMode = 'uz';
          saveSettings();
          paintAudioModeBtns();
          paintAudioControls();
        }
        playAyah(a, 'uz');
      }
    });
    bmBtn.addEventListener('click', () => {
      const on = toggleBookmark(sm.n, a);
      bmBtn.setAttribute('aria-pressed', String(on));
      toast(on ? `${sm.n}:${a} saqlandi` : `${sm.n}:${a} saqlanganlardan olib tashlandi`);
    });
    tafBtn.addEventListener('click', () => {
      rootBtn.setAttribute('aria-expanded', 'false');
      toggleTafsir(extra, tafBtn, i);
    });
    rootBtn.addEventListener('click', () => {
      tafBtn.setAttribute('aria-expanded', 'false');
      toggleRoots(extra, rootBtn, i);
    });
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

  async function toggleRoots(extra: HTMLElement, btn: HTMLButtonElement, i: number) {
    if (btn.getAttribute('aria-expanded') === 'true') {
      extra.replaceChildren();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    btn.setAttribute('aria-expanded', 'true');
    const box = h('div', { class: 'tafsir-box roots-box' }, h('div', { class: 'spinner', style: { width: '22px', height: '22px' } }));
    extra.replaceChildren(box);
    try {
      const [idx, byAya] = await Promise.all([getRootIndex(), getRootsByAya()]);
      const gid = sm.start + i;
      const pairs = byAya.get(gid) ?? [];
      let w = 0;
      const toks = data.ar[i].split(' ').map((t) => (/^[\u06D6-\u06ED\u0615-\u061A\u06DE\u06E9]+$/.test(t) ? { t, w: 0 } : { t, w: ++w }));
      const known = pairs.some(([wi]) => wi > 0);
      const rwContainer = h('div', { class: 'rw-list' });
      const highlightRoot = (ri: number | null) => {
        rwContainer.querySelectorAll<HTMLElement>('.rw-item').forEach((el) => {
          const roots = (el.dataset.roots || '').split(',');
          el.classList.toggle('rw-hi', ri != null && roots.includes(String(ri)));
        });
      };
      const items = known
        ? toks
            .filter((tk) => tk.w)
            .map((tk) => {
              const rs = pairs.filter(([wi]) => wi === tk.w).map(([, ri]) => ri);
              const itemEl = h(
                'div',
                {
                  class: 'rw-item',
                  'data-roots': rs.join(','),
                  onmouseenter: () => rs.length && highlightRoot(rs[0]),
                  onmouseleave: () => highlightRoot(null),
                },
                h('span', { class: 'ar rw-word', lang: 'ar' }, tk.t),
                rs.length
                  ? rs.map((ri) =>
                      h(
                        'a',
                        {
                          class: 'chip ar-chip',
                          href: `#/ildizlar?ildiz=${encodeURIComponent(idx.k[ri])}`,
                          title: `${idx.k[ri]} — Qurʼonda ${idx.n[ri]} marta`,
                        },
                        h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]),
                        h('small', null, String(idx.n[ri])),
                      ),
                    )
                  : h('span', { class: 'muted rw-none' }, 'ildizsiz'),
              );
              return itemEl;
            })
        : [...new Set(pairs.map(([, ri]) => ri))].map((ri) =>
            h(
              'a',
              { class: 'chip ar-chip', href: `#/ildizlar?ildiz=${encodeURIComponent(idx.k[ri])}` },
              h('span', { class: 'ar', lang: 'ar' }, idx.ar[ri]),
              h('small', null, String(idx.n[ri])),
            ),
          );
      rwContainer.replaceChildren(...items);
      box.replaceChildren(
        rwContainer,
        h(
          'span',
          { class: 'src' },
          'Ildizlar: Quranic Arabic Corpus (morfologiya v0.4, GNU GPL). Soʻzlar — Tanzil matnidan. Raqam — ildizning Qurʼonda necha marta uchrashi. Ildizni bossangiz, grafda ochiladi. ',
          h('a', { href: '#/manbalar' }, 'Manbalar'),
        ),
      );
    } catch {
      box.replaceChildren(h('p', { class: 'muted' }, 'Ildizlarni yuklab boʻlmadi.'));
    }
  }

  function matchesFilter(i: number): boolean {
    if (!suraFilter) return true;
    const a = i + 1;
    if (String(a) === suraFilter || `${sm.n}:${a}` === suraFilter) return true;
    if (/[؀-ۿ]/.test(suraFilter)) return normAr(data.ar[i]).includes(normAr(suraFilter));
    const qTerms = tokenize(suraFilter).map(normTerm).filter(Boolean) as string[];
    if (!qTerms.length) return true;
    const hay = [
      ...Object.values(data.tr).map((arr) => stripFootnoteMarks(arr[i])),
      data.tl?.[i] ?? '',
    ].join(' ');
    const docTerms = tokenize(hay).map(normTerm).filter(Boolean) as string[];
    return qTerms.every((qt) => docTerms.some((dt) => dt.includes(qt)));
  }

  function renderMushafMode() {
    const pagesMap = new Map<number, number[]>();
    for (let i = 0; i < data.ar.length; i++) {
      if (!matchesFilter(i)) continue;
      const a = i + 1;
      const pg = pageOf(meta, sm.n, a);
      let arr = pagesMap.get(pg);
      if (!arr) pagesMap.set(pg, (arr = []));
      arr.push(a);
    }
    const inspector = h('div', { class: 'mushaf-inspector' });
    const updateInspector = (a: number) => {
      mushafSelectedAyah = a;
      list.querySelectorAll<HTMLElement>('.mushaf-ayah').forEach((el) => {
        el.classList.toggle('active', Number(el.dataset.a) === a);
      });
      inspector.replaceChildren(ayahEl(a - 1));
    };
    const frag = document.createDocumentFragment();
    for (const [pg, ayahs] of pagesMap.entries()) {
      const jz = juzOf(meta, sm.n, ayahs[0]);
      const versesBlock = h(
        'div',
        { class: 'ar mushaf-flow', lang: 'ar' },
        ayahs.map((a) => {
          const sajda = sajdaOf(meta, sm.n, a);
          return h(
            'span',
            {
              class: `mushaf-ayah${a === mushafSelectedAyah ? ' active' : ''}${playing === a ? ' playing' : ''}`,
              id: `a${a}`,
              'data-a': String(a),
              tabindex: '0',
              role: 'button',
              'aria-label': `${sm.n}:${a} oyatni tanlash`,
              onclick: () => updateInspector(a),
              onkeydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  updateInspector(a);
                }
              },
            },
            data.ar[a - 1],
            ' ',
            h('span', { class: 'ayah-num', title: `${sm.n}:${a}${sajda ? ' (Sajda)' : ''}` }, arNum(a)),
            ' ',
          );
        }),
      );
      frag.appendChild(
        h(
          'section',
          { class: 'mushaf-page card' },
          h(
            'header',
            { class: 'mushaf-page-head muted' },
            h('span', null, `${jz}-juz`),
            h('strong', null, sm.tr),
            h('span', null, `${pg}-sahifa`),
          ),
          versesBlock,
        ),
      );
    }
    if (!pagesMap.size) {
      list.replaceChildren(h('p', { class: 'notice' }, 'Qidiruv boʻyicha bu surada oyat topilmadi.'));
      return;
    }
    updateInspector(mushafSelectedAyah);
    frag.appendChild(inspector);
    list.replaceChildren(frag);
  }

  function renderAyahs() {
    const btlEl = basmala?.querySelector<HTMLElement>('.basmala-tl');
    if (btlEl) btlEl.hidden = !settings.showTranslit;
    if (settings.layout === 'mushaf') {
      renderMushafMode();
      observe();
      if (playing) markPlaying(playing);
      return;
    }
    const frag = document.createDocumentFragment();
    let count = 0;
    for (let i = 0; i < data.ar.length; i++) {
      if (!matchesFilter(i)) continue;
      count++;
      if (!suraFilter) {
        const div = dividerEl(i + 1);
        if (div) frag.appendChild(div);
      }
      frag.appendChild(ayahEl(i));
    }
    if (!count) {
      list.replaceChildren(h('p', { class: 'notice' }, `«${suraFilter}» boʻyicha ushbu surada oyat topilmadi.`));
      return;
    }
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
    const parts = [
      data.ar[i],
      ...(settings.showTranslit && data.tl?.[i] ? [`${data.tl[i]}\n— Кириллча ўқилиши`] : []),
      ...eds.map((e) => `${plainTr(e.id, i)}\n— ${e.title} tarjimasi`),
      `Qurʼon, ${sm.tr} surasi, ${sm.n}:${a}\n${siteUrl(`#${sm.n}:${a}`)}`,
    ];
    copyText(parts.join('\n\n')).then((ok) => toast(ok ? 'Nusxa olindi' : 'Nusxa olib boʻlmadi'));
  }
  // ---------- Ulashish menyusi ----------
  let shareMenu: HTMLElement | null = null;
  const closeShareMenu = () => {
    shareMenu?.remove();
    shareMenu = null;
  };
  function openShareMenu(anchor: HTMLElement, a: number) {
    const had = shareMenu?.dataset.a === String(a);
    closeShareMenu();
    if (had) return;
    const item = (ic: string, label: string, fn: () => void) => h('button', { type: 'button', role: 'menuitem', onclick: () => (closeShareMenu(), fn()) }, icon(ic), label);
    shareMenu = h('div', { class: 'pop-menu', role: 'menu', 'data-a': String(a) }, item(I.link, 'Havolani ulashish', () => shareAyah(a)), item(I.image, 'Rasm sifatida (oyat kartasi)', () => openCard(a)));
    anchor.parentElement!.appendChild(shareMenu);
    shareMenu.querySelector('button')?.focus();
  }
  document.addEventListener('click', closeShareMenu);

  // ---------- Oyat kartasi (rasm) ----------
  async function openCard(a: number) {
    const ed = meta.editions.find((e) => settings.editions.includes(e.id)) ?? meta.editions[0];
    toast('Rasm tayyorlanmoqda…');
    let blob: Blob | null = null;
    try {
      const { renderCard } = await import('../lib/card.ts');
      blob = await renderCard({
        ar: data.ar[a - 1],
        tr: plainTr(ed.id, a - 1),
        ref: `${sm.tr} surasi, ${sm.n}:${a}`,
        trBy: ed.title,
        site: location.host + location.pathname.replace(/\/$/, ''),
      });
    } catch {
      blob = null;
    }
    if (disposed) return;
    if (!blob) return toast('Bu oyat rasm uchun juda uzun — matn yoki havolani ulashing');
    const url = URL.createObjectURL(blob);
    const name = `quron-${sm.n}-${a}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    const dlg = h('dialog', { class: 'modal card-modal', 'aria-label': 'Oyat kartasi' });
    const close = () => {
      dlg.close();
      dlg.remove();
      URL.revokeObjectURL(url);
    };
    const canShare = !!navigator.canShare?.({ files: [file] });
    dlg.append(
      h('img', { src: url, alt: `${sm.n}:${a} oyat kartasi`, class: 'card-img' }),
      h(
        'div',
        { class: 'modal-actions' },
        h('a', { class: 'btn primary', href: url, download: name }, icon(I.download), 'Yuklab olish'),
        ...(canShare ? [h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ files: [file], title: `Qurʼon ${sm.n}:${a}` }).catch(() => {}) }, icon(I.share), 'Ulashish')] : []),
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Yopish'),
      ),
    );
    dlg.addEventListener('cancel', (e) => (e.preventDefault(), close()));
    dlg.addEventListener('click', (e) => e.target === dlg && close());
    document.body.appendChild(dlg);
    dlg.showModal();
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

  // ---------- Audio va Mini-pleyer ----------
  const playerRef = h('a', { class: 'ap-ref', href: `#${sm.n}:1` }, `${sm.n}:1`);
  const playerSub = h('span', { class: 'ap-sub muted' });
  const playerPlayBtn = h('button', { class: 'icon-btn ap-play', type: 'button', 'aria-label': 'Toʻxtatib turish / davom ettirish' }, icon(I.pause));
  const playerPrevBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Oldingi oyat', title: 'Oldingi oyat' }, icon(I.left));
  const playerNextBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Keyingi oyat', title: 'Keyingi oyat' }, icon(I.right));
  const modeBtn = h('button', { class: 'chip small ap-chip', type: 'button', title: 'Audio rejimi: Arabcha / Oʻzbekcha / Ikkalasi ketma-ket' });
  const repeatBtn = h('button', { class: 'chip small ap-chip', type: 'button', title: 'Oyatni takrorlash (yodlash uchun)' });
  const speedBtn = h('button', { class: 'chip small ap-chip', type: 'button', title: 'Qiroat tezligi' });
  const playerCloseBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Audioni yopish', title: 'Yopish' }, icon(I.close));

  const miniPlayer = h(
    'div',
    { class: 'audio-bar card', role: 'region', 'aria-label': 'Audio pleyer', hidden: true },
    h('div', { class: 'ap-info' }, playerRef, playerSub),
    h('div', { class: 'ap-controls' }, playerPrevBtn, playerPlayBtn, playerNextBtn, modeBtn, repeatBtn, speedBtn, playerCloseBtn),
  );

  function paintAudioControls() {
    const modeShort = settings.audioMode === 'ar' ? 'Arabcha' : settings.audioMode === 'uz' ? 'Oʻzbekcha' : 'Ar + Oʻz';
    modeBtn.textContent = modeShort;
    modeBtn.classList.toggle('on', settings.audioMode !== 'ar');
    const repLabel = settings.audioRepeat === 0 ? '∞' : `${settings.audioRepeat}×`;
    repeatBtn.replaceChildren(icon(I.repeat), h('span', null, repLabel));
    repeatBtn.classList.toggle('on', settings.audioRepeat !== 1);
    speedBtn.textContent = `${settings.audioSpeed}×`;
    speedBtn.classList.toggle('on', settings.audioSpeed !== 1);
  }
  paintAudioControls();

  modeBtn.addEventListener('click', () => {
    const order: AudioMode[] = ['ar', 'uz', 'both'];
    const next = order[(order.indexOf(settings.audioMode) + 1) % order.length];
    settings.audioMode = next;
    saveSettings();
    paintAudioModeBtns();
    paintAudioControls();
    const msg =
      next === 'ar'
        ? 'Faqat arabcha qiroat'
        : next === 'uz'
          ? 'Faqat oʻzbekcha ketma-ket audio'
          : 'Arabcha + Oʻzbekcha ketma-ket audio';
    toast(msg);
    if (playing != null) playAyah(playing);
  });

  repeatBtn.addEventListener('click', () => {
    const order = [1, 2, 3, 0];
    const next = order[(order.indexOf(settings.audioRepeat) + 1) % order.length];
    settings.audioRepeat = next;
    repeatCount = 0;
    saveSettings();
    paintAudioControls();
    toast(next === 0 ? 'Oyat cheksiz takrorlanadi' : next === 1 ? 'Takrorlash oʻchirildi (1×)' : `Har bir oyat ${next} marta oʻqiladi`);
  });

  speedBtn.addEventListener('click', () => {
    const speeds = [1, 1.25, 0.85];
    const next = speeds[(speeds.indexOf(settings.audioSpeed) + 1) % speeds.length];
    settings.audioSpeed = next;
    audio.playbackRate = next;
    saveSettings();
    paintAudioControls();
    if (playing != null && playingStep === 'uz') {
      playAyah(playing, 'uz');
    }
  });

  playerPlayBtn.addEventListener('click', () => {
    if (playing == null) return;
    if (playingStep === 'ar') {
      if (audio.paused) {
        audio.play().catch(() => {});
        markPlaying(playing);
      } else {
        audio.pause();
        markPlaying(playing);
      }
    } else {
      if (isUzPaused()) {
        resumeUzSpeech();
        markPlaying(playing);
      } else if (isUzSpeaking()) {
        pauseUzSpeech();
        markPlaying(playing);
      } else {
        playAyah(playing, 'uz');
      }
    }
  });
  playerPrevBtn.addEventListener('click', () => {
    if (playing && playing > 1) playAyah(playing - 1);
  });
  playerNextBtn.addEventListener('click', () => {
    if (playing && playing < sm.ayas) playAyah(playing + 1);
  });
  playerCloseBtn.addEventListener('click', () => stopAudio());

  function updateMediaSession(a: number) {
    if (!('mediaSession' in navigator)) return;
    const rc = RECITERS.find((r) => r.id === settings.reciter)?.name ?? settings.reciter;
    const edTitle = getActiveUzEdition().title;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${sm.tr} surasi, ${sm.n}:${a}${playingStep === 'uz' ? ' (Oʻzbekcha)' : ''}`,
        artist: playingStep === 'uz' ? edTitle : rc,
        album: 'Qurʼoni Karim',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (playingStep === 'ar') audio.play().catch(() => {});
        else resumeUzSpeech();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (playingStep === 'ar') audio.pause();
        else pauseUzSpeech();
      });
      navigator.mediaSession.setActionHandler('previoustrack', playing && playing > 1 ? () => playAyah(playing! - 1) : null);
      navigator.mediaSession.setActionHandler('nexttrack', playing && playing < sm.ayas ? () => playAyah(playing! + 1) : null);
      navigator.mediaSession.setActionHandler('stop', () => stopAudio());
    } catch {
      /* MediaSession qo'llab-quvvatlanmasa e'tiborsiz qoldiramiz */
    }
  }

  function markPlaying(a: number | null) {
    const isPaused = isAudioPaused();
    list.querySelectorAll('.icon-btn.play').forEach((b) => {
      b.classList.remove('playing');
      b.replaceChildren(icon(I.play));
    });
    list.querySelectorAll('.uz-play-btn').forEach((b) => {
      b.classList.remove('playing');
      b.textContent = 'Oʻz';
    });
    list.querySelectorAll('.ayah.playing, .mushaf-ayah.playing, .ar-text.playing-part, .tr.playing-part').forEach((el) => {
      el.classList.remove('playing', 'playing-part');
    });
    if (a == null) {
      miniPlayer.hidden = true;
      playSuraBtn.replaceChildren(icon(I.play), h('span', { class: 'lbl' }, 'Arabcha'));
      playUzSuraBtn.replaceChildren(icon(I.play), h('span', null, 'Oʻzb audio'));
      return;
    }
    miniPlayer.hidden = false;
    playerRef.textContent = `${sm.n}:${a} · ${sm.tr}`;
    playerRef.href = `#${sm.n}:${a}`;
    const rc = RECITERS.find((r) => r.id === settings.reciter)?.name ?? '';
    const uzEd = getActiveUzEdition();
    const uzEdId = uzEd.id;
    const uzEdTitle = uzEd.title;
    if (playingStep === 'uz') {
      playerSub.textContent = `Oʻzbekcha: ${uzEdTitle}`;
    } else if (settings.audioMode === 'both') {
      playerSub.textContent = `${rc.split(' (')[0]} + Oʻzbekcha`;
    } else {
      playerSub.textContent = rc.split(' (')[0];
    }
    playerPlayBtn.replaceChildren(icon(isPaused ? I.play : I.pause));

    const arActive = playingStep === 'ar' && settings.audioMode !== 'uz';
    const uzActive = playingStep === 'uz' || settings.audioMode === 'uz';
    playSuraBtn.replaceChildren(
      icon(arActive && !isPaused ? I.pause : I.play),
      h('span', { class: 'lbl' }, arActive && !isPaused ? 'Toʻxtatish' : 'Arabcha'),
    );
    playUzSuraBtn.replaceChildren(
      icon(uzActive && !isPaused ? I.pause : I.play),
      h('span', null, uzActive && !isPaused ? 'Toʻxtatish' : 'Oʻzb audio'),
    );

    const ayEl = document.getElementById(`a${a}`);
    if (ayEl) {
      ayEl.classList.add('playing');
      if (playingStep === 'ar') {
        ayEl.querySelector('.ar-text')?.classList.add('playing-part');
      } else {
        const trEl = ayEl.querySelector(`.tr[data-ed="${uzEdId}"]`) ?? ayEl.querySelector('.tr:not(.translit-box)');
        trEl?.classList.add('playing-part');
      }
    }
    const b = list.querySelector<HTMLButtonElement>(`#a${a} .icon-btn.play`);
    if (b && playingStep === 'ar') {
      b.classList.toggle('playing', !isPaused);
      b.replaceChildren(icon(isPaused ? I.play : I.pause));
    }
    const uzB = list.querySelector<HTMLButtonElement>(`#a${a} .uz-play-btn`);
    if (uzB && playingStep === 'uz') {
      uzB.classList.toggle('playing', !isPaused);
      uzB.replaceChildren(icon(isPaused ? I.play : I.pause));
    }
  }

  function scrollAyahIntoViewIfNeeded(a: number) {
    if (settings.layout === 'mushaf') {
      mushafSelectedAyah = a;
      renderAyahs();
    }
    const el = document.getElementById(`a${a}`);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.top > innerHeight * 0.72) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function onStepFinished(finishedStep: 'ar' | 'uz') {
    if (disposed || playing == null) return;
    // Agar "Arabcha + O'zbekcha ketma-ket" rejimida arabcha tugagan bo'lsa, shu oyatning o'zbekchasini o'qiymiz
    if (settings.audioMode === 'both' && finishedStep === 'ar') {
      playAyah(playing, 'uz');
      return;
    }
    // Oyat to'liq o'qib bo'lindi — takrorlash yoki keyingi oyatga o'tish
    repeatCount++;
    if (settings.audioRepeat === 0 || repeatCount < settings.audioRepeat) {
      const startStep = settings.audioMode === 'uz' ? 'uz' : 'ar';
      playAyah(playing, startStep);
      return;
    }
    repeatCount = 0;
    if (playing < sm.ayas) {
      const next = playing + 1;
      playAyah(next);
      scrollAyahIntoViewIfNeeded(next);
    } else {
      stopAudio();
    }
  }

  function playAyah(a: number, forceStep?: 'ar' | 'uz') {
    if (playing !== a) repeatCount = 0;
    playing = a;
    const step: 'ar' | 'uz' = forceStep ?? (settings.audioMode === 'uz' ? 'uz' : 'ar');
    playingStep = step;

    if (step === 'ar') {
      stopUzSpeech();
      audio.src = audioUrl(settings.reciter, sm.n, a);
      audio.playbackRate = settings.audioSpeed;
      audio.play().catch(() => {
        toast('Arabcha audioni ijro etib boʻlmadi');
        stopAudio();
      });
      if (a < sm.ayas) {
        nextPreload.src = audioUrl(settings.reciter, sm.n, a + 1);
        nextPreload.load();
      }
      updateMediaSession(a);
      markPlaying(a);
    } else {
      audio.pause();
      const uzEd = getActiveUzEdition();
      const rawText = data.tr[uzEd.id]?.[a - 1] ?? data.tr.sodiq_lat[a - 1] ?? '';
      updateMediaSession(a);
      markPlaying(a);
      speakUzAyah({
        rawText,
        rate: settings.audioSpeed,
        preferredVoiceUri: settings.uzVoice,
        onStart: () => {
          if (!disposed && playing === a && playingStep === 'uz') markPlaying(a);
        },
        onEnd: () => {
          if (!disposed && playing === a && playingStep === 'uz') onStepFinished('uz');
        },
        onError: (msg: string) => {
          toast(msg);
          stopAudio();
        },
      });
    }
  }

  function stopAudio() {
    audio.pause();
    stopUzSpeech();
    playing = null;
    repeatCount = 0;
    markPlaying(null);
  }

  audio.addEventListener('play', () => playing != null && playingStep === 'ar' && markPlaying(playing));
  audio.addEventListener('pause', () => playing != null && playingStep === 'ar' && markPlaying(playing));
  audio.addEventListener('ended', () => {
    if (disposed || playing == null || playingStep !== 'ar') return;
    onStepFinished('ar');
  });

  // ---------- Oʻqish jarayoni (progress) va oxirgi oʻqilgan joy ----------
  const onScroll = () => {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? Math.min(100, Math.max(0, (window.scrollY / docH) * 100)) : 0;
    progressFill.style.width = `${pct.toFixed(1)}%`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

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
    list.querySelectorAll('.ayah, .mushaf-ayah').forEach((el) => io!.observe(el));
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

  root.replaceChildren(
    head,
    toolbar,
    panel,
    ...(basmala ? [h('div', { class: 'wrap' }, basmala)] : []),
    list,
    nav,
    miniPlayer,
    h('div', { class: 'wrap' }, footerNote()),
  );
  renderAyahs();
  onScroll();

  function focus(a: number | null) {
    if (a == null || a < 1 || a > sm.ayas) {
      window.scrollTo({ top: 0 });
      return;
    }
    if (settings.layout === 'mushaf') {
      mushafSelectedAyah = a;
      renderAyahs();
    }
    const el = document.getElementById(`a${a}`);
    if (!el) return;
    const go = () => !disposed && !userMoved && el.scrollIntoView({ block: 'start' });
    let userMoved = false;
    const stop = () => {
      userMoved = true;
      ro.disconnect();
    };
    const ro = new ResizeObserver(() => go());
    ro.observe(list);
    for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown']) addEventListener(ev, stop, { once: true, passive: true });
    setTimeout(stop, 2500);
    go();
    el.classList.remove('target');
    void el.offsetWidth;
    el.classList.add('target');
    document.fonts?.ready.then(go);
  }
  if (target) focus(target);
  else window.scrollTo({ top: 0 });
  window.__reader = { sura: sm.n, focus };

  return () => {
    disposed = true;
    closeShareMenu();
    document.removeEventListener('click', closeShareMenu);
    document.querySelectorAll('dialog.card-modal').forEach((d) => d.remove());
    io?.disconnect();
    window.removeEventListener('scroll', onScroll);
    audio.pause();
    audio.src = '';
    nextPreload.src = '';
    stopUzSpeech();
  };
}

