// localStorage — har doim try/catch bilan (maxfiy rejim, bloklangan saqlash va h.k.)
const P = 'quz.';

export function load<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? def : (JSON.parse(v) as T);
  } catch {
    return def;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
  } catch {
    /* saqlab bo'lmadi — jim o'tamiz */
  }
}

export type Theme = 'auto' | 'light' | 'dark';
export type ReaderLayout = 'split' | 'stack' | 'mushaf';
export interface Settings {
  theme: Theme;
  arSize: number;
  trSize: number;
  editions: string[];
  showAr: boolean;
  showTranslit: boolean;
  reciter: string;
  layout: ReaderLayout;
  audioSpeed: number;
  audioRepeat: number; // 1 = 1x, 2 = 2x, 3 = 3x, 0 = cheksiz
  showDividers: boolean;
}

const DEFAULTS: Settings = {
  theme: 'auto',
  arSize: 30,
  trSize: 17,
  editions: ['sodiq_lat'],
  showAr: true,
  showTranslit: true,
  reciter: 'Alafasy_128kbps',
  layout: 'split',
  audioSpeed: 1,
  audioRepeat: 1,
  showDividers: true,
};

export const settings: Settings = { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) };
if (!Array.isArray(settings.editions)) settings.editions = DEFAULTS.editions.slice();
if (!['split', 'stack', 'mushaf'].includes(settings.layout)) settings.layout = 'split';
if (![0.85, 1, 1.25].includes(settings.audioSpeed)) settings.audioSpeed = 1;
if (![0, 1, 2, 3].includes(settings.audioRepeat)) settings.audioRepeat = 1;
if (typeof settings.showTranslit !== 'boolean') settings.showTranslit = true;

export function saveSettings(): void {
  save('settings', settings);
}

export interface Bookmark {
  s: number;
  a: number;
  t: number; // vaqt
  note?: string;
}
export function getBookmarks(): Bookmark[] {
  const b = load<Bookmark[]>('bookmarks', []);
  return Array.isArray(b) ? b.filter((x) => x && typeof x.s === 'number' && typeof x.a === 'number') : [];
}
export function isBookmarked(s: number, a: number): boolean {
  return getBookmarks().some((b) => b.s === s && b.a === a);
}
export function toggleBookmark(s: number, a: number): boolean {
  const list = getBookmarks();
  const i = list.findIndex((b) => b.s === s && b.a === a);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ s, a, t: Date.now() });
  save('bookmarks', list);
  return i < 0;
}
export function setBookmarkNote(s: number, a: number, note: string): void {
  const list = getBookmarks();
  const item = list.find((b) => b.s === s && b.a === a);
  if (!item) return;
  const trimmed = note.trim();
  if (trimmed) item.note = trimmed;
  else delete item.note;
  save('bookmarks', list);
}
export function importBookmarks(items: Bookmark[]): number {
  const current = getBookmarks();
  let added = 0;
  for (const x of items) {
    if (!x || typeof x.s !== 'number' || typeof x.a !== 'number' || x.s < 1 || x.s > 114 || x.a < 1) continue;
    const ex = current.find((b) => b.s === x.s && b.a === x.a);
    if (!ex) {
      current.push({
        s: x.s,
        a: x.a,
        t: typeof x.t === 'number' ? x.t : Date.now(),
        ...(typeof x.note === 'string' && x.note.trim() ? { note: x.note.trim() } : {}),
      });
      added++;
    } else if (!ex.note && typeof x.note === 'string' && x.note.trim()) {
      ex.note = x.note.trim();
    }
  }
  current.sort((a, b) => b.t - a.t);
  save('bookmarks', current);
  return added;
}

export interface LastRead {
  s: number;
  a: number;
  t: number;
}
export function getLastRead(): LastRead | null {
  const v = load<LastRead | null>('last', null);
  return v && typeof v.s === 'number' && typeof v.a === 'number' ? v : null;
}
export function getHistory(): LastRead[] {
  const h = load<LastRead[]>('history', []);
  return Array.isArray(h) ? h.filter((x) => x && typeof x.s === 'number' && typeof x.a === 'number') : [];
}
export function clearHistory(): void {
  save('history', []);
}
export function setLastRead(s: number, a: number): void {
  const now = Date.now();
  save('last', { s, a, t: now });
  const hist = getHistory().filter((x) => x.s !== s);
  hist.unshift({ s, a, t: now });
  if (hist.length > 8) hist.length = 8;
  save('history', hist);
}

