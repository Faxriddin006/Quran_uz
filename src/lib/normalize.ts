// Qidiruv uchun normallashtirish. Faqat indeks va so'rov uchun ishlatiladi:
// ekranda ko'rsatiladigan matnlar HECH QACHON o'zgartirilmaydi.
// Build skripti (Node) ham, brauzer ham shu faylni ishlatadi.

const APOS = /['`ʻʼ‘’]/g;

// Kirill -> lotin (faqat qidiruv kaliti uchun, ko'rsatish uchun emas)
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i',
  ь: '', э: 'e', ю: 'yu', я: 'ya', ё: 'yo', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};
const CYR_VOWELS = 'аеёиоуэюяў';

export function cyrToLat(word: string): string {
  let out = '';
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === 'е') {
      const prev = i > 0 ? word[i - 1] : '';
      out += !prev || CYR_VOWELS.includes(prev) || prev === 'ъ' || prev === 'ь' ? 'ye' : 'e';
    } else {
      out += CYR[ch] ?? ch;
    }
  }
  return out;
}

const SPLIT = /[^\p{L}\p{N}'`ʻʼ‘’]+/u;

export function tokenize(text: string): string[] {
  return text.split(SPLIT).filter(Boolean);
}

const STOP = new Set(['va', 'ham', 'bu', 'u', 'ul', 'deb', 'esa', 'ki', 'yoki', 'bilan', 'uchun', 'edi', 'emas']);

export function normTerm(term: string): string | null {
  let t = term.toLowerCase();
  if (/[Ѐ-ӿ]/.test(t)) t = cyrToLat(t);
  t = t.replace(APOS, '');
  if (!t || STOP.has(t)) return null;
  return t;
}

/** Arabcha qidiruv uchun harakat va belgilarni olib tashlash (faqat solishtirish uchun) */
export function normAr(s: string): string {
  return s
    .replace(/[ً-ٰٟۖ-ۭـ\s]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** Sura nomlarini lotin/kirill/fonetik qidirish uchun normallashtirish */
export function normSura(s: string): string {
  let t = s.toLowerCase();
  if (/[Ѐ-ӿ]/.test(t)) t = cyrToLat(t);
  return t
    .replace(/['`ʻʼ‘’\-_\s.,]/g, '')
    .replace(/kh/g, 'x')
    .replace(/gh/g, 'g')
    .replace(/th/g, 's')
    .replace(/dh/g, 'z')
    .replace(/w/g, 'v')
    .replace(/[ou]/g, 'a')
    .replace(/[ye]/g, 'i')
    .replace(/i(?=[la])/g, 'a')
    .replace(/(.)\1+/g, '$1')
    .replace(/(?<=.{4})[ht]$/g, '');
}

export function matchSura(s: { n: number; tr: string; tz: string; ar: string }, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  if (String(s.n) === raw) return true;
  if (/[؀-ۿ]/.test(raw)) return normAr(s.ar).includes(normAr(raw));
  const nq = normSura(raw);
  if (!nq) return true;
  return normSura(s.tr).includes(nq) || normSura(s.tz).includes(nq);
}

// quran.com matnidagi izoh belgilari: <sup foot_note="123">1</sup>
export const FOOTNOTE_RE = /<sup foot_note="(\d+)">(\d+)<\/sup>/g;

// QuranEnc matnidagi izoh belgilari: [1]
export const QENC_FN_RE = /\[(\d+)\]/g;

export function stripFootnoteMarks(text: string): string {
  return text.replace(FOOTNOTE_RE, '').replace(QENC_FN_RE, '').replace(/\s{2,}/g, ' ').trim();
}

