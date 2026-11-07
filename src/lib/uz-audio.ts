// Oʻzbekcha oyatma-oyat audio (Web Speech API / SpeechSynthesis orqali)
// Barcha suralardagi 6236 oyatning asl tarjima matnini (izoh raqamlarisiz) ketma-ket oʻqib beradi.

import { stripFootnoteMarks } from './normalize.ts';

export type AudioMode = 'ar' | 'uz' | 'both';
export type UzAudioEdition = 'auto' | 'sodiq_lat' | 'sodiq_cyr' | 'mansur_cyr';

export interface UzVoiceOption {
  uri: string;
  name: string;
  lang: string;
  quality: 'uz' | 'tr' | 'ru' | 'other';
}

// Kirill -> Lotin (TTS uchun toza fonetik yozuv)
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', А: 'A',
  б: 'b', Б: 'B',
  в: 'v', В: 'V',
  г: 'g', Г: 'G',
  ғ: "g'", Ғ: "G'",
  д: 'd', Д: 'D',
  е: 'e', Е: 'E',
  ё: 'yo', Ё: 'Yo',
  ж: 'j', Ж: 'J',
  з: 'z', З: 'Z',
  и: 'i', И: 'I',
  й: 'y', Й: 'Y',
  к: 'k', К: 'K',
  қ: 'q', Қ: 'Q',
  л: 'l', Л: 'L',
  м: 'm', М: 'M',
  н: 'n', Н: 'N',
  о: 'o', О: 'O',
  ў: "o'", Ў: "O'",
  п: 'p', П: 'P',
  р: 'r', Р: 'R',
  с: 's', С: 'S',
  т: 't', Т: 'T',
  у: 'u', У: 'U',
  ф: 'f', Ф: 'F',
  х: 'x', Х: 'X',
  ҳ: 'h', Ҳ: 'H',
  ц: 'ts', Ц: 'Ts',
  ч: 'ch', Ч: 'Ch',
  ш: 'sh', Ш: 'Sh',
  щ: 'sh', Щ: 'Sh',
  ъ: '', Ъ: '',
  ы: 'i', Ы: 'I',
  ь: '', Ь: '',
  э: 'e', Э: 'E',
  ю: 'yu', Ю: 'Yu',
  я: 'ya', Я: 'Ya',
};

// Lotin -> Kirill (kirill/rus TTS dvijoklari uchun)
export function uzLatToCyr(input: string): string {
  let s = input
    .replace(/([OoGg])\s*[`ʻʼ'’‘]/g, (_, c: string) => (c.toLowerCase() === 'o' ? (c === 'O' ? 'Ў' : 'ў') : c === 'G' ? 'Ғ' : 'ғ'))
    .replace(/[`ʻʼ'’‘]/g, '')
    .replace(/Sh|SH/g, 'Ш')
    .replace(/sh/g, 'ш')
    .replace(/Ch|CH/g, 'Ч')
    .replace(/ch/g, 'ч')
    .replace(/Yo|YO/g, 'Ё')
    .replace(/yo/g, 'ё')
    .replace(/Yu|YU/g, 'Ю')
    .replace(/yu/g, 'ю')
    .replace(/Ya|YA/g, 'Я')
    .replace(/ya/g, 'я')
    .replace(/Ts|TS/g, 'Ц')
    .replace(/ts/g, 'ц');

  const map: Record<string, string> = {
    a: 'а', A: 'А',
    b: 'б', B: 'Б',
    d: 'д', D: 'Д',
    e: 'э', E: 'Э',
    f: 'ф', F: 'Ф',
    g: 'г', G: 'Г',
    h: 'ҳ', H: 'Ҳ',
    i: 'и', I: 'И',
    j: 'ж', J: 'Ж',
    k: 'к', K: 'К',
    l: 'л', L: 'Л',
    m: 'м', M: 'М',
    n: 'н', N: 'Н',
    o: 'о', O: 'О',
    p: 'п', P: 'П',
    q: 'қ', Q: 'Қ',
    r: 'р', R: 'Р',
    s: 'с', S: 'С',
    t: 'т', T: 'Т',
    u: 'у', U: 'У',
    v: 'в', V: 'В',
    x: 'х', X: 'Х',
    y: 'й', Y: 'Й',
    z: 'з', Z: 'З',
  };
  // So'z ichidagi 'e' harfini 'е' ga o'girish
  s = s.replace(/([b-df-hj-np-tv-zB-DF-HJ-NP-TV-ZўғЎҒ])e/g, '$1е');
  let out = '';
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

export function uzCyrToLat(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === 'Е' || ch === 'е') {
      const prev = i > 0 ? input[i - 1] : ' ';
      const isVowelOrStart = /[\s([«"'аеёиоуўэюяАЕЁИОУЎЭЮЯ-]/.test(prev);
      out += isVowelOrStart ? (ch === 'Е' ? 'Ye' : 'ye') : ch === 'Е' ? 'E' : 'e';
      continue;
    }
    out += CYR_TO_LAT[ch] ?? ch;
  }
  return out;
}

/**
 * Tarjima matnini TTS o'qishi uchun tayyorlaydi:
 * - Izoh raqamlarini (<sup...>, [1]) olib tashlaydi
 * - sodiq_lat dagi ` belgilarini (to`g`ri -> to'g'ri, ne`mat -> nemat) to'g'rilaydi,
 *   aks holda TTS so'zni ikkiga bo'lib o'qiydi.
 */
export function prepareUzTtsText(rawText: string, voiceKind: 'uz-lat' | 'uz-cyr' | 'tr' | 'ru'): string {
  let s = stripFootnoteMarks(rawText)
    .replace(/\s+/g, ' ')
    .trim();

  // Lotin matnidagi o` va g` ni saqlab, qolgan tutuq belgilarini (ne`mat, mo`min, Qur`on) birlashtiramiz
  s = s
    .replace(/([OoGg])\s*[`ʻʼ'’‘]/g, '$1ʻ')
    .replace(/([A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ])[`ʼ'’‘]([A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ])/g, '$1$2')
    .replace(/([A-FH-NP-Za-fh-np-z])ʻ([A-Za-z])/g, '$1$2')
    .replace(/([OoGg])ʻ/g, "$1'");

  const isCyr = /[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(s);

  if (voiceKind === 'uz-cyr') {
    return isCyr ? s.replace(/[ъЪ]/g, '') : uzLatToCyr(s);
  }

  if (voiceKind === 'ru') {
    const cyr = isCyr ? s : uzLatToCyr(s);
    // Rus TTS dvijoklari ў, қ, ғ, ҳ harflarini tashlab ketmasligi uchun eng yaqin rus harflariga moslaymiz
    return cyr
      .replace(/ў/g, 'у')
      .replace(/Ў/g, 'У')
      .replace(/қ/g, 'к')
      .replace(/Қ/g, 'К')
      .replace(/ғ/g, 'г')
      .replace(/Ғ/g, 'Г')
      .replace(/ҳ/g, 'х')
      .replace(/Ҳ/g, 'Х')
      .replace(/[ъЪ]/g, '');
  }

  const lat = isCyr ? uzCyrToLat(s) : s;

  if (voiceKind === 'tr') {
    // Turk TTS dvijoki o'zbekcha lotin matnini tabiiy o'qishi uchun fonetik moslash
    return lat
      .replace(/G'/g, 'Ğ')
      .replace(/g'/g, 'ğ')
      .replace(/O'/g, 'Ö')
      .replace(/o'/g, 'ö')
      .replace(/Sh|SH/g, 'Ş')
      .replace(/sh/g, 'ş')
      .replace(/Ch|CH/g, 'Ç')
      .replace(/ch/g, 'ç')
      .replace(/C(?![hH])/g, 'Ts')
      .replace(/c(?![hH])/g, 'ts')
      .replace(/J/g, 'C')
      .replace(/j/g, 'c')
      .replace(/X/g, 'H')
      .replace(/x/g, 'h')
      .replace(/Q/g, 'K')
      .replace(/q/g, 'k');
  }

  // 'uz-lat'
  return lat.replace(/([OoGg])'/g, '$1ʻ');
}

/**
 * Uzun oyatlarni (masalan, Baqara 282) Chrome TTS uzib qo'ymasligi uchun jumlalarga bo'lamiz.
 */
export function splitIntoTtsChunks(text: string, maxLen = 190): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.split(/(?<=[.!?…;:])\s+/);
  const chunks: string[] = [];
  let current = '';

  const pushClauseChunks = (piece: string) => {
    const clauses = piece.split(/(?<=[,،—–])\s+/);
    for (const cl of clauses) {
      if (!cl) continue;
      if ((current ? `${current} ${cl}` : cl).length <= maxLen) {
        current = current ? `${current} ${cl}` : cl;
      } else {
        if (current) chunks.push(current);
        if (cl.length <= maxLen) {
          current = cl;
        } else {
          // Juda uzun vergulsiz bo'lakni so'zlar bo'yicha bo'lamiz
          const words = cl.split(/\s+/);
          current = '';
          for (const w of words) {
            if ((current ? `${current} ${w}` : w).length <= maxLen) {
              current = current ? `${current} ${w}` : w;
            } else {
              if (current) chunks.push(current);
              current = w;
            }
          }
        }
      }
    }
  };

  for (const sent of sentences) {
    if (!sent) continue;
    if ((current ? `${current} ${sent}` : sent).length <= maxLen) {
      current = current ? `${current} ${sent}` : sent;
    } else {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushClauseChunks(sent);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

let cachedVoices: SpeechSynthesisVoice[] = [];
if (isSpeechSupported()) {
  const loadV = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch {
      cachedVoices = [];
    }
  };
  loadV();
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', loadV);
  } catch {
    /* ba'zi brauzerlarda addEventListener bo'lmasligi mumkin */
  }
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  if (!cachedVoices.length) {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch {
      cachedVoices = [];
    }
  }
  return cachedVoices;
}

export function getUzVoiceOptions(): UzVoiceOption[] {
  const voices = getVoices();
  const opts: UzVoiceOption[] = [];
  for (const v of voices) {
    const l = (v.lang || '').toLowerCase();
    const n = (v.name || '').toLowerCase();
    let quality: UzVoiceOption['quality'] = 'other';
    if (l.startsWith('uz') || n.includes('uzbek') || n.includes('madina') || n.includes('sardor')) {
      quality = 'uz';
    } else if (l.startsWith('tr') || l.startsWith('kk') || l.startsWith('ky') || l.startsWith('az') || l.startsWith('tk')) {
      quality = 'tr';
    } else if (l.startsWith('ru')) {
      quality = 'ru';
    }
    if (quality !== 'other') {
      opts.push({ uri: v.voiceURI, name: `${v.name} (${v.lang})`, lang: v.lang, quality });
    }
  }
  const rank = { uz: 0, tr: 1, ru: 2, other: 3 };
  opts.sort((a, b) => rank[a.quality] - rank[b.quality] || a.name.localeCompare(b.name));
  return opts;
}

export function pickBestVoice(preferredUri?: string): {
  voice: SpeechSynthesisVoice | null;
  kind: 'uz-lat' | 'uz-cyr' | 'tr' | 'ru';
  langTag: string;
} {
  const voices = getVoices();
  if (preferredUri && preferredUri !== 'auto') {
    const found = voices.find((v) => v.voiceURI === preferredUri);
    if (found) {
      const l = found.lang.toLowerCase();
      if (l.startsWith('uz')) {
        return { voice: found, kind: l.includes('cyrl') ? 'uz-cyr' : 'uz-lat', langTag: found.lang };
      }
      if (l.startsWith('ru')) return { voice: found, kind: 'ru', langTag: found.lang };
      if (l.startsWith('tr') || l.startsWith('kk') || l.startsWith('ky') || l.startsWith('az')) {
        return { voice: found, kind: 'tr', langTag: found.lang };
      }
      return { voice: found, kind: 'uz-lat', langTag: found.lang };
    }
  }

  // 1. O'zbekcha ovoz (uz-UZ, Microsoft Madina/Sardor, Google uz-UZ va h.k.)
  const uzVoices = voices.filter((v) => {
    const l = (v.lang || '').toLowerCase();
    const n = (v.name || '').toLowerCase();
    return l.startsWith('uz') || n.includes('uzbek') || n.includes('madina') || n.includes('sardor');
  });
  if (uzVoices.length) {
    // Natural/Online ovozlarni birinchi o'ringa qo'yamiz
    const natural = uzVoices.find((v) => /natural|online|google|neural/i.test(v.name)) ?? uzVoices[0];
    const isCyr = /cyrl/i.test(natural.lang);
    return { voice: natural, kind: isCyr ? 'uz-cyr' : 'uz-lat', langTag: natural.lang || 'uz-UZ' };
  }

  // 2. Yaqin turkiy ovoz (tr-TR)
  const trVoices = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('tr'));
  if (trVoices.length) {
    const bestTr = trVoices.find((v) => /natural|online|google|neural/i.test(v.name)) ?? trVoices[0];
    return { voice: bestTr, kind: 'tr', langTag: bestTr.lang || 'tr-TR' };
  }

  // 3. Rus ovozi (ru-RU — MDH qurilmalarida deyarli har doim mavjud)
  const ruVoices = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('ru'));
  if (ruVoices.length) {
    const bestRu = ruVoices.find((v) => /natural|online|google|neural/i.test(v.name)) ?? ruVoices[0];
    return { voice: bestRu, kind: 'ru', langTag: bestRu.lang || 'ru-RU' };
  }

  // 4. Agar brauzer ovozlar ro'yxatini bermasa (masalan, Android WebView), uz-UZ lang tegi bilan yuboramiz
  return { voice: null, kind: 'uz-lat', langTag: 'uz-UZ' };
}

// ---------- Aktiv nutq boshqaruvi ----------
let activeToken = 0;
export let activeUtterance: SpeechSynthesisUtterance | null = null;
let uzSpeakingState = false;
let uzPausedState = false;
let resumeCallback: (() => void) | null = null;
let timerId: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timerId != null) {
    clearTimeout(timerId);
    timerId = null;
  }
}

export function isUzSpeaking(): boolean {
  return uzSpeakingState;
}

export function isUzPaused(): boolean {
  return uzPausedState;
}

export function stopUzSpeech(): void {
  activeToken++;
  clearTimer();
  uzSpeakingState = false;
  uzPausedState = false;
  resumeCallback = null;
  activeUtterance = null;
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function pauseUzSpeech(onStateChange?: () => void): void {
  if (!uzSpeakingState || uzPausedState) return;
  uzPausedState = true;
  clearTimer();
  if (isSpeechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  onStateChange?.();
}

export function resumeUzSpeech(onStateChange?: () => void): void {
  if (!uzSpeakingState || !uzPausedState) return;
  uzPausedState = false;
  onStateChange?.();
  if (resumeCallback) {
    const cb = resumeCallback;
    cb();
  }
}

export interface SpeakUzOptions {
  rawText: string;
  rate: number;
  preferredVoiceUri?: string;
  onStart?: () => void;
  onEnd: () => void;
  onError?: (msg: string) => void;
}

export function speakUzAyah(opts: SpeakUzOptions): void {
  if (!isSpeechSupported()) {
    opts.onError?.('Qurilmangizda ovozli oʻqish (Web Speech API) qoʻllab-quvvatlanmaydi');
    return;
  }

  const token = ++activeToken;
  clearTimer();
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }

  const { voice, kind, langTag } = pickBestVoice(opts.preferredVoiceUri);
  const prepared = prepareUzTtsText(opts.rawText, kind);
  const chunks = splitIntoTtsChunks(prepared);

  if (!chunks.length) {
    opts.onEnd();
    return;
  }

  uzSpeakingState = true;
  uzPausedState = false;
  let idx = 0;

  const playChunk = () => {
    if (token !== activeToken) return;
    if (uzPausedState) {
      resumeCallback = playChunk;
      return;
    }
    if (idx >= chunks.length) {
      uzSpeakingState = false;
      uzPausedState = false;
      resumeCallback = null;
      activeUtterance = null;
      opts.onEnd();
      return;
    }

    const chunkText = chunks[idx];
    const u = new SpeechSynthesisUtterance(chunkText);
    activeUtterance = u;
    if (voice) u.voice = voice;
    u.lang = langTag;
    u.rate = Math.max(0.5, Math.min(2, opts.rate || 1));

    u.onstart = () => {
      if (token !== activeToken) return;
      if (idx === 0) opts.onStart?.();
    };

    u.onend = () => {
      if (token !== activeToken || uzPausedState) return;
      idx++;
      playChunk();
    };

    u.onerror = (ev) => {
      if (token !== activeToken || uzPausedState) return;
      const errType = (ev as SpeechSynthesisErrorEvent)?.error;
      if (errType === 'canceled' || errType === 'interrupted') return;
      // Agar tanlangan ovozda xato bo'lsa, keyingi bo'lakka o'tamiz yoki xabar beramiz
      idx++;
      if (idx < chunks.length) {
        playChunk();
      } else {
        uzSpeakingState = false;
        activeUtterance = null;
        opts.onError?.('Oʻzbekcha audioni oʻqishda xatolik yuz berdi');
      }
    };

    try {
      window.speechSynthesis.speak(u);
      if (idx === 0) opts.onStart?.();
    } catch {
      uzSpeakingState = false;
      opts.onError?.('Oʻzbekcha audioni ishga tushirib boʻlmadi');
    }
  };

  // cancel() dan keyin kichik pauza Chrome/Android da barqaror ishlashini ta'minlaydi
  timerId = setTimeout(playChunk, 35);
}
