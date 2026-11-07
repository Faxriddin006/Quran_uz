import { matchSura } from './normalize.ts';

export interface SuraMeta {
  n: number;
  ar: string;
  tr: string;
  tz: string;
  ayas: number;
  start: number;
  order: number;
  rukus: number;
  type: 'makkiy' | 'madaniy';
}
export interface Edition {
  id: string;
  title: string;
  script: 'lotin' | 'kirill';
  note: string;
  source: string;
  sourceUrl: string;
}
export interface TafsirInfo {
  id: string;
  key: string;
  title: string;
  note: string;
  source: string;
  sourceUrl: string;
}
export interface Meta {
  suras: SuraMeta[];
  juz: [number, number][];
  hizbQuarters: [number, number][];
  manzil: [number, number][];
  pages: [number, number][];
  sajdas: [number, number, string][];
  editions: Edition[];
  tafsirs: TafsirInfo[];
  sources: Record<string, { file: string; sha256: string; version?: string }>;
  built: string;
}
export interface SuraData {
  n: number;
  b: string | null;
  ar: string[];
  tr: Record<string, string[]>;
  fn: { sodiq_lat: Record<string, string>; mansur_cyr: string[]; sodiq_cyr: string[] };
}
export type TafsirEntry = string | [string, string];

const V = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

export async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`data/${path}?v=${V}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (await r.json()) as T;
}
export async function fetchText(path: string): Promise<string> {
  const r = await fetch(`data/${path}?v=${V}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
}

let metaP: Promise<Meta> | null = null;
export function getMeta(): Promise<Meta> {
  if (!metaP) {
    metaP = fetchJson<Meta>('meta.json');
    metaP.catch(() => (metaP = null));
  }
  return metaP;
}

const suraCache = new Map<number, Promise<SuraData>>();
export function getSura(n: number): Promise<SuraData> {
  let p = suraCache.get(n);
  if (!p) {
    p = fetchJson<SuraData>(`s/${n}.json`);
    p.catch(() => suraCache.delete(n));
    suraCache.set(n, p);
    if (suraCache.size > 12) suraCache.delete(suraCache.keys().next().value as number);
  }
  return p;
}

const tafCache = new Map<string, Promise<TafsirEntry[]>>();
export function getTafsir(id: string, n: number): Promise<TafsirEntry[]> {
  const k = `${id}/${n}`;
  let p = tafCache.get(k);
  if (!p) {
    p = fetchJson<TafsirEntry[]>(`tafsir/${id}/${n}.json`);
    p.catch(() => tafCache.delete(k));
    tafCache.set(k, p);
  }
  return p;
}

/** Global oyat indeksi (0..6235) -> [sura, oyat] */
export function refOf(meta: Meta, id: number): [number, number] {
  let lo = 0,
    hi = 113;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (meta.suras[mid].start <= id) lo = mid;
    else hi = mid - 1;
  }
  const s = meta.suras[lo];
  return [s.n, id - s.start + 1];
}

function findSpan(bounds: [number, number][], count: number, s: number, a: number): number {
  let lo = 0,
    hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [bs, ba] = bounds[mid];
    if (bs < s || (bs === s && ba <= a)) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** [sura, oyat] qaysi juzda (1..30) */
export function juzOf(meta: Meta, s: number, a: number): number {
  return findSpan(meta.juz, 30, s, a);
}

/** [sura, oyat] Madina mushafining qaysi sahifasida (1..604) */
export function pageOf(meta: Meta, s: number, a: number): number {
  return findSpan(meta.pages, 604, s, a);
}

/** [sura, oyat] sajda oyatimi ('obligatory' | 'recommended' | null) */
export function sajdaOf(meta: Meta, s: number, a: number): string | null {
  for (const [ss, sa, kind] of meta.sajdas) {
    if (ss === s && sa === a) return kind;
  }
  return null;
}

export interface AyahDividers {
  juz?: number;
  hizb?: string;
  page?: number;
  manzil?: number;
}

/** Shu [sura, oyat] da yangi juz, hizb choragi, sahifa yoki manzil boshlanadimi */
export function dividersAt(meta: Meta, s: number, a: number): AyahDividers {
  const out: AyahDividers = {};
  for (let j = 0; j < 30; j++) {
    if (meta.juz[j][0] === s && meta.juz[j][1] === a) {
      out.juz = j + 1;
      break;
    }
  }
  for (let q = 0; q < 240; q++) {
    if (meta.hizbQuarters[q][0] === s && meta.hizbQuarters[q][1] === a) {
      const hizb = Math.floor(q / 4) + 1;
      const part = q % 4;
      out.hizb = part === 0 ? `${hizb}-hizb` : `${hizb}-hizb ${['', '¼', '½', '¾'][part]}`;
      break;
    }
  }
  const p = pageOf(meta, s, a);
  if (meta.pages[p - 1][0] === s && meta.pages[p - 1][1] === a) {
    out.page = p;
  }
  for (let m = 0; m < meta.manzil.length; m++) {
    if (meta.manzil[m][0] === s && meta.manzil[m][1] === a) {
      out.manzil = m + 1;
      break;
    }
  }
  return out;
}

let arAllP: Promise<string[]> | null = null;
/** Barcha 6236 oyatning arabcha matni (Tanzil Usmoniy) */
export function getAr(): Promise<string[]> {
  if (!arAllP) {
    arAllP = fetchJson<string[]>('ar.json');
    arAllP.catch(() => (arAllP = null));
  }
  return arAllP;
}

export interface RootIndex {
  note: string;
  k: string[];
  ar: string[];
  n: number[];
  occ: number[][];
}
let rootIdxP: Promise<RootIndex> | null = null;
export function getRootIndex(): Promise<RootIndex> {
  if (!rootIdxP) {
    rootIdxP = fetchJson<RootIndex>('roots/index.json');
    rootIdxP.catch(() => (rootIdxP = null));
  }
  return rootIdxP;
}
let byAyaP: Promise<Map<number, [number, number][]>> | null = null;
/** gid -> [[so'z raqami, ildiz indeksi], ...] */
export function getRootsByAya(): Promise<Map<number, [number, number][]>> {
  if (!byAyaP) {
    byAyaP = getRootIndex().then((idx) => {
      const m = new Map<number, [number, number][]>();
      idx.occ.forEach((list, ri) => {
        for (const v of list) {
          const g = v >> 8;
          let arr = m.get(g);
          if (!arr) m.set(g, (arr = []));
          arr.push([v & 255, ri]);
        }
      });
      for (const arr of m.values()) arr.sort((a, b) => a[0] - b[0]);
      return m;
    });
    byAyaP.catch(() => (byAyaP = null));
  }
  return byAyaP;
}

export interface QuickNavItem {
  href: string;
  badge: string;
  title: string;
  sub: string;
  ar?: string;
}

/** Qidiruv so'rovidan to'g'ridan-to'g'ri o'tish nishonlarini aniqlaydi (masalan: "2:255", "Baqara 255", "Yosin", "30-juz", "50-sahifa") */
export function parseQuickNav(meta: Meta, rawQuery: string, limit = 6): QuickNavItem[] {
  const v = rawQuery.trim();
  if (!v) return [];
  const items: QuickNavItem[] = [];

  // 1. Raqamli sura:oyat yoki sura raqami ("2:255", "2 255", "36")
  const numRef = /^(\d{1,3})\s*[:.\-\s]\s*(\d{1,3})$/.exec(v) || /^(\d{1,3})$/.exec(v);
  if (numRef) {
    const s = Number(numRef[1]);
    const a = numRef[2] ? Number(numRef[2]) : null;
    if (s >= 1 && s <= 114) {
      const sm = meta.suras[s - 1];
      if (a == null) {
        items.push({
          href: `#${s}`,
          badge: `${s}-sura`,
          title: `${sm.tr} surasini ochish`,
          sub: `${sm.ayas} oyat · ${juzOf(meta, s, 1)}-juz · ${pageOf(meta, s, 1)}-sahifa`,
          ar: sm.ar,
        });
      } else if (a >= 1 && a <= sm.ayas) {
        items.push({
          href: `#${s}:${a}`,
          badge: `${s}:${a}`,
          title: `${sm.tr} surasi, ${a}-oyatga oʻtish`,
          sub: `${juzOf(meta, s, a)}-juz · ${pageOf(meta, s, a)}-sahifa`,
          ar: sm.ar,
        });
      }
    }
    if (a == null && s >= 1 && s <= 604 && numRef[0] === v) {
      const [ps, pa] = meta.pages[s - 1];
      items.push({
        href: `#${ps}:${pa}`,
        badge: `${s}-bet`,
        title: `Mushafning ${s}-sahifasiga oʻtish`,
        sub: `${meta.suras[ps - 1].tr} ${ps}:${pa} dan boshlanadi · ${juzOf(meta, ps, pa)}-juz`,
      });
    }
  }

  // 2. Sura nomi + oyat raqami ("Baqara 255", "Yosin 36:10", "Каҳф 10")
  const nameRef = /^([^\d:]+?)\s*[:.\-\s]\s*(\d{1,3})$/.exec(v);
  if (nameRef && !/^(?:juz|pora|жуз|пора|sahifa|bet|p|саҳифа|бет)$/i.test(nameRef[1].trim())) {
    const namePart = nameRef[1].trim();
    const a = Number(nameRef[2]);
    for (const sm of meta.suras) {
      if (matchSura(sm, namePart) && a >= 1 && a <= sm.ayas) {
        items.push({
          href: `#${sm.n}:${a}`,
          badge: `${sm.n}:${a}`,
          title: `${sm.tr} surasi, ${a}-oyat`,
          sub: `${juzOf(meta, sm.n, a)}-juz · ${pageOf(meta, sm.n, a)}-sahifa`,
          ar: sm.ar,
        });
        if (items.length >= 3) break;
      }
    }
  }

  // 3. Juz / pora ("30-juz", "juz 30", "pora 15")
  const juzRef = /^(?:juz|pora|жуз|пора)\s*(\d{1,2})$|^(\d{1,2})\s*-?\s*(?:juz|pora|жуз|пора)$/i.exec(v);
  if (juzRef) {
    const j = Number(juzRef[1] || juzRef[2]);
    if (j >= 1 && j <= 30) {
      const [js, ja] = meta.juz[j - 1];
      const sm = meta.suras[js - 1];
      items.push({
        href: `#${js}:${ja}`,
        badge: `${j}-juz`,
        title: `${j}-juz (pora) boshiga oʻtish`,
        sub: `${sm.tr} ${js}:${ja} · ${pageOf(meta, js, ja)}-sahifa`,
      });
    }
  }

  // 4. Mushaf sahifasi ("50-sahifa", "sahifa 50", "50-bet", "bet 50")
  const pageRef = /^(?:sahifa|bet|p|саҳифа|бет)\s*(\d{1,3})$|^(\d{1,3})\s*-?\s*(?:sahifa|bet|саҳифа|бет)$/i.exec(v);
  if (pageRef) {
    const p = Number(pageRef[1] || pageRef[2]);
    if (p >= 1 && p <= 604) {
      const [ps, pa] = meta.pages[p - 1];
      const sm = meta.suras[ps - 1];
      items.push({
        href: `#${ps}:${pa}`,
        badge: `${p}-sahifa`,
        title: `Madina mushafi, ${p}-sahifa`,
        sub: `${sm.tr} ${ps}:${pa} dan boshlanadi · ${juzOf(meta, ps, pa)}-juz`,
      });
    }
  }

  // 5. Sajda oyatlari
  if (/^(?:sajda|сажда|tilovat sajdasi)$/i.test(v)) {
    items.push({
      href: '#/juz?tab=sajda',
      badge: '15 sajda',
      title: 'Tilovat sajdasi oyatlari (15 ta)',
      sub: 'Tanzil metamaʼlumotlari boʻyicha barcha sajda oyatlari roʻyxati',
    });
  }

  // 6. Sura nomi bo'yicha qidirish ("Fotiha", "Yosin", "Каҳф")
  if (!numRef && !juzRef && !pageRef && v.length >= 2) {
    for (const sm of meta.suras) {
      if (items.length >= limit) break;
      if (matchSura(sm, v) && !items.some((x) => x.href === `#${sm.n}`)) {
        items.push({
          href: `#${sm.n}`,
          badge: `${sm.n}-sura`,
          title: `${sm.n}. ${sm.tr}`,
          sub: `${sm.ayas} oyat · ${juzOf(meta, sm.n, 1)}-juz · ${pageOf(meta, sm.n, 1)}-sahifa`,
          ar: sm.ar,
        });
      }
    }
  }

  return items.slice(0, limit);
}


