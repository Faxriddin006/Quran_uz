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
