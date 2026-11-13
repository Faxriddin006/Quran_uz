// Xatm rejasi: Qur'onning 604 sahifasini N kunga teng bo'lib chiqadi (Tanzil sahifa chegaralari).
import type { Meta } from './data.ts';
import { load, save } from './store.ts';

export interface Khatm {
  days: number;
  start: string; // YYYY-MM-DD
  done: number; // tugallangan kunlar soni
}
const PAGES = 604;

export function getKhatm(): Khatm | null {
  const k = load<Khatm | null>('khatm', null);
  return k && k.days >= 1 && k.days <= 1000 && typeof k.done === 'number' ? k : null;
}
export function setKhatm(k: Khatm | null): void {
  save('khatm', k);
}
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface Portion {
  day: number; // 1 dan
  fromPage: number;
  toPage: number;
  from: [number, number];
  to: [number, number]; // oxirgi oyat (shu qism ichida)
}
/** day: 1..days */
export function portion(meta: Meta, k: Khatm, day: number): Portion {
  const fromPage = Math.floor((PAGES * (day - 1)) / k.days) + 1;
  const toPage = Math.max(fromPage, Math.floor((PAGES * day) / k.days));
  const from = meta.pages[fromPage - 1];
  const [ns, na] = meta.pages[toPage]; // keyingi sahifa boshi (yoki yakun belgisi)
  const to: [number, number] = na > 1 ? [ns, na - 1] : [ns - 1, meta.suras[ns - 2].ayas];
  return { day, fromPage, toPage, from, to };
}
/** Reja bo'yicha bugun nechanchi kun bo'lishi kerak (1 dan) */
export function scheduledDay(k: Khatm): number {
  const ms = new Date(today()).getTime() - new Date(k.start).getTime();
  return Math.min(k.days, Math.max(1, Math.floor(ms / 86400000) + 1));
}
