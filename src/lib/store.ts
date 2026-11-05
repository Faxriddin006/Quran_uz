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
export interface Settings {
  theme: Theme;
  arSize: number;
  trSize: number;
  editions: string[];
  showAr: boolean;
  reciter: string;
}

const DEFAULTS: Settings = {
  theme: 'auto',
  arSize: 30,
  trSize: 17,
  editions: ['sodiq_lat'],
  showAr: true,
  reciter: 'Alafasy_128kbps',
};

export const settings: Settings = { ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) };
if (!Array.isArray(settings.editions)) settings.editions = DEFAULTS.editions.slice();

export function saveSettings(): void {
  save('settings', settings);
}

export interface Bookmark {
  s: number;
  a: number;
  t: number; // vaqt
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

export interface LastRead {
  s: number;
  a: number;
  t: number;
}
export function getLastRead(): LastRead | null {
  const v = load<LastRead | null>('last', null);
  return v && typeof v.s === 'number' && typeof v.a === 'number' ? v : null;
}
export function setLastRead(s: number, a: number): void {
  save('last', { s, a, t: Date.now() });
}
