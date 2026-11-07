/**
 * Tanzil Usmoniy (Uthmani) arabcha oyat matnini o'zbek kirill yozuvidagi
 * fonetik o'qilishiga (transliteratsiya / talaffuz) o'giruvchi deterministik modul.
 *
 * Qoida: Matn taxmin qilinmaydi; Tanzil XML dagi har bir harf, harakat (fatha,
 * kasra, damma, sukun, shadda, tanwin), hamzatul-vasl (ٱ), shamsiy/qamariy
 * harflar, idg'om, iqlob (ۢ/ۭ), mad va vaqf (oyat oxirida to'xtash) belgilari
 * asosida mexanik ravishda hisoblanadi.
 */

const MUQATTAAT: Record<string, string> = {
  'الٓمٓ': 'Алиф лаам мийм',
  'الٓمٓصٓ': 'Алиф лаам мийм соод',
  'الٓر': 'Алиф лаам ро',
  'الٓمٓر': 'Алиф лаам мийм ро',
  'كٓهيعٓصٓ': 'Кааф ҳаа йаа айн соод',
  'طه': 'То ҳаа',
  'طسٓمٓ': 'То сийн мийм',
  'طسٓ': 'То сийн',
  'يسٓ': 'Йаа сийн',
  'صٓ': 'Соод',
  'حمٓ': 'Ҳаа мийм',
  'عٓسٓقٓ': 'Айн сийн қооф',
  'قٓ': 'Қооф',
  'نٓ': 'Нуун',
};

const HEAVY = new Set(['ص', 'ض', 'ط', 'ظ', 'ق', 'غ', 'خ']);

const CONS: Record<string, string> = {
  ب: 'б',
  ت: 'т',
  ث: 'с',
  ج: 'ж',
  ح: 'ҳ',
  خ: 'х',
  د: 'д',
  ذ: 'з',
  ر: 'р',
  ز: 'з',
  س: 'с',
  ش: 'ш',
  ص: 'с',
  ض: 'з',
  ط: 'т',
  ظ: 'з',
  ع: 'ъ',
  غ: 'ғ',
  ف: 'ф',
  ق: 'қ',
  ك: 'к',
  ل: 'л',
  م: 'м',
  ن: 'н',
  ه: 'ҳ',
  و: 'в',
  ي: 'й',
  ى: 'й',
  ة: 'т',
  ء: 'ъ',
  أ: 'ъ',
  إ: 'ъ',
  ؤ: 'ъ',
  ئ: 'ъ',
};

interface ArTok {
  c: string;
  d: string;
}

const DIAC_RE = /^[\u064B-\u0654\u0670\u06DC-\u06ED]$/;

function parseWord(raw: string): ArTok[] {
  const w = raw
    .replace(/\u0640\u0654/g, '\u0621')
    .replace(/\u0670\u0654/g, '\u0670\u0621')
    .replace(/\u0640/g, '');
  const tokens: ArTok[] = [];
  for (const ch of w) {
    if (DIAC_RE.test(ch)) {
      if (tokens.length) tokens[tokens.length - 1].d += ch;
    } else {
      tokens.push({ c: ch, d: '' });
    }
  }
  return tokens;
}

/**
 * Bitta arabcha oyat (yoki Basmala) matnini o'zbek kirill yozuvidagi
 * o'qilishiga (talaffuziga) o'giradi.
 */
export function translitCyr(ayaText: string): string {
  const rawWords = ayaText.trim().split(/\s+/);
  const outWords: string[] = [];
  let prevEndVowel = '';
  let prevTookLam = false;

  for (let wi = 0; wi < rawWords.length; wi++) {
    const rw = rawWords[wi];
    const isLastWord = wi === rawWords.length - 1;
    const nextRw = rawWords[wi + 1] || '';

    if (MUQATTAAT[rw]) {
      outWords.push(MUQATTAAT[rw]);
      prevEndVowel = '';
      prevTookLam = false;
      continue;
    }

    // Keyingi so'z ٱل bilan boshlansa, shamsiy/qamariy ulanishni aniqlash
    let nextAssimilate = '';
    if (nextRw.startsWith('\u0671\u0644')) {
      const nt = parseWord(nextRw);
      if (nt[1] && nt[1].d.includes('\u0652')) {
        nextAssimilate = 'л';
      } else if (nt[1] && nt[1].d.includes('\u0651')) {
        nextAssimilate = 'л';
      } else if (nt[2] && nt[2].d.includes('\u0651')) {
        nextAssimilate = CONS[nt[2].c] || '';
      }
    }

    const toks = parseWord(rw);
    let res = '';
    let lastVowel = '';
    const isAllahWord = /^(?:[\u0648\u0641\u062A\u0628\u0644\u0623]*)(?:\u0671?\u0644\u0644\u0651\u064E\u0647|\u0644\u0651?\u0650\u0644\u0651\u064E\u0647)/.test(rw);

    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      const prev = toks[i - 1];
      const next = toks[i + 1];
      const c = tk.c;
      const d = tk.d;
      const isLastTok = i === toks.length - 1;

      // 1. O'qilmaydigan harflar: ۟ (U+06DF) yoki oyat ichidagi ۠ (U+06E0)
      if (d.includes('\u06DF') || (d.includes('\u06E0') && !(isLastWord && isLastTok))) {
        if (!d.includes('\u064E') && !d.includes('\u064F') && !d.includes('\u0650')) continue;
      }

      // 2. Hamzatul-vasl (ٱ)
      if (c === '\u0671') {
        if (wi === 0 && i === 0) {
          if (next && next.c === '\u0644') {
            res += 'а';
            lastVowel = 'a';
          } else {
            const t2 = toks[2];
            const v = t2 && t2.d.includes('\u064F') ? 'у' : 'и';
            res += v;
            lastVowel = v === 'у' ? 'u' : 'i';
          }
        } else if (i === 0 && !prevTookLam && next && next.c !== '\u0644') {
          const t2 = toks[2];
          const v = t2 && t2.d.includes('\u064F') ? 'у' : 'и';
          res += v;
          lastVowel = v === 'у' ? 'u' : 'i';
        }
        continue;
      }

      // 3. ٱل dagi لام (qamariy harfda oldingi so'zga ulangan bo'lsa yoki shamsiy harfda)
      if (c === '\u0644' && prev && prev.c === '\u0671') {
        if (i === 1 && prevTookLam && d.includes('\u0652')) continue;
        if (d === '' && next && next.d.includes('\u0651')) continue;
      }

      const hasVowel = /[\u064B-\u0650]/.test(d);
      const hasShadda = d.includes('\u0651');
      const hasSukun = d.includes('\u0652');

      // 4. Harakatsiz undosh keyingi shaddali undoshga idg'om bo'lganda (masalan: عَبَدتُّمْ, قَد تَّبَيَّنَ)
      if (d === '' && c !== '\u0627' && c !== '\u0648' && c !== '\u0649' && c !== '\u064A' && next && next.d.includes('\u0651')) {
        continue;
      }

      // 5. Cho'ziq alif (ا)
      if (c === '\u0627') continue;

      // 6. Cho'ziq vov (و) yoki alif-oliya (وٰ)
      if (c === '\u0648' && !hasVowel && !hasShadda && !hasSukun) {
        if (d.includes('\u0670')) continue;
        if (prev && (prev.c === '\u064A' || prev.c === '\u0649') && prev.d.includes('\u064F') && !prev.d.includes('\u0651')) {
          res += 'в';
        }
        continue;
      }

      // 7. Cho'ziq yo / alif-maqsura (ي / ى)
      if ((c === '\u0649' || c === '\u064A') && !hasVowel && !hasShadda && !hasSukun) {
        if (d.includes('\u0670') || (prev && (prev.d.includes('\u064E') || prev.d.includes('\u064B')))) {
          continue;
        }
        if (prev && prev.d.includes('\u0650')) {
          if (isLastTok && nextAssimilate) continue;
          res += 'й';
          continue;
        }
        continue;
      }

      let cons = CONS[c] || '';
      if (c === '\u0635' && (d.includes('\u06DC') || d.includes('\u06E3'))) cons = 'с';

      // 8. Oyat oxirida (vaqfda) تاء مربوطة (ة) -> ҳ
      if (c === '\u0629' && isLastWord && isLastTok) {
        res += 'ҳ';
        break;
      }

      const nextIsSilentAlif = Boolean(next && next.c === '\u0627' && !/[\u064B-\u0652]/.test(next.d) && next === toks[toks.length - 1]);
      const nextIsAlifMaqsura = Boolean(next && next.c === '\u0649' && !/[\u064B-\u0652\u0670]/.test(next.d) && next === toks[toks.length - 1]);
      const effectivelyLast = isLastTok || nextIsSilentAlif || (nextIsAlifMaqsura && d.includes('\u064B'));

      // 9. Nun sokina: iqlob (ۢ/ۭ) va idg'om
      if (c === '\u0646' && !hasVowel && !hasShadda) {
        if (d.includes('\u06E2') || d.includes('\u06ED') || (next && next.c === '\u0628')) {
          res += 'м';
          continue;
        }
        if (!hasSukun && effectivelyLast && nextRw) {
          const nt0 = parseWord(nextRw)[0];
          if (nt0 && 'يرملون'.includes(nt0.c) && nt0.d.includes('\u0651')) {
            res += CONS[nt0.c];
            continue;
          }
        }
      }

      // 10. Tashdid (shadda)
      const isSunStart = i === 2 && toks[0].c === '\u0671' && toks[1].c === '\u0644' && toks[1].d === '';
      if (hasShadda) {
        if (isSunStart && prevTookLam) {
          // shamsiy harfning birinchi qismi oldingi so'z oxiriga qo'shilgan
        } else if (res.length > 0 && !res.endsWith(' ')) {
          if ((c === '\u064A' || c === '\u0649') && prev && prev.d.includes('\u0650')) {
            res += 'й';
          } else if (cons && cons !== 'ъ') {
            res += cons;
          }
        }
      }

      // 11. Unli harakat (tafxim / istifola bilan)
      let v = '';
      const isAllahLam = isAllahWord && c === '\u0644' && hasShadda;
      const allahHeavy = isAllahLam && (lastVowel ? lastVowel === 'a' || lastVowel === 'u' : wi === 0 || prevEndVowel === 'a' || prevEndVowel === 'u');
      const isHeavy =
        (HEAVY.has(c) && !d.includes('\u06DC')) ||
        (c === '\u0631' && (d.includes('\u064E') || d.includes('\u064B') || d.includes('\u0670'))) ||
        allahHeavy;

      if (d.includes('\u064E')) v = isHeavy ? 'о' : 'а';
      else if (d.includes('\u0650')) v = 'и';
      else if (d.includes('\u064F')) v = 'у';
      else if (d.includes('\u0670')) v = isHeavy ? 'о' : 'а';

      // 12. Tanwin
      let tanwin = '';
      if (d.includes('\u064B')) {
        v = isHeavy ? 'о' : 'а';
        tanwin = 'н';
      } else if (d.includes('\u064C')) {
        v = 'у';
        tanwin = 'н';
      } else if (d.includes('\u064D')) {
        v = 'и';
        tanwin = 'н';
      }

      if (tanwin && (d.includes('\u06E2') || d.includes('\u06ED'))) tanwin = 'м';
      else if (tanwin && effectivelyLast && nextRw) {
        const nt0 = parseWord(nextRw)[0];
        if (nt0 && 'يرملون'.includes(nt0.c) && nt0.d.includes('\u0651')) {
          tanwin = CONS[nt0.c];
        }
      }

      // 13. Oyat oxirida vaqf qoidasi
      if (isLastWord && effectivelyLast) {
        if (d.includes('\u064B')) {
          // Madd ivaz: -ан -> -а
          tanwin = '';
        } else {
          const hasMaddAfter =
            (next && (next.c === '\u0627' || next.c === '\u0648' || next.c === '\u064A' || next.c === '\u0649') && !d.includes('\u064B')) ||
            d.includes('\u0670') ||
            d.includes('\u06E5') ||
            d.includes('\u06E6');
          if (!hasMaddAfter) {
            v = '';
            tanwin = '';
          }
        }
      }

      // 14. Harf va unlini chiqarish
      if (c === '\u0621' || c === '\u0623' || c === '\u0625' || c === '\u0624' || c === '\u0626' || c === '\u0639') {
        const afterVocOrConj =
          i === 1 &&
          (((prev.c === '\u064A' || prev.c === '\u0647') && prev.d.includes('\u0670')) ||
            ((prev.c === '\u0648' || prev.c === '\u0641') && prev.d === '\u064E')) &&
          (c === '\u0623' || c === '\u0625');
        const afterPrefixAl = i >= 2 && prev.c === '\u0644' && prev.d.includes('\u0652') && toks[i - 2]?.c === '\u0671';
        if (v) {
          if (res.length === 0 || res.endsWith(' ')) res += v;
          else if (afterVocOrConj || afterPrefixAl) res += ' ' + v;
          else res += 'ъ' + v;
        } else if (hasSukun || (isLastWord && effectivelyLast)) {
          if (res.length > 0 && !res.endsWith(' ')) res += 'ъ';
        }
      } else if (c === '\u064A' || c === '\u0649') {
        if (v === 'а' || v === 'о') res += 'я';
        else if (v === 'у') res += 'ю';
        else res += 'й' + v;
      } else {
        res += cons + v;
      }

      if ((d.includes('\u06E6') || d.includes('\u06E7')) && c !== '\u0647' && v === 'и') {
        res += 'й';
      }
      if (d.includes('\u06E8')) res += 'н';

      if (tanwin) res += tanwin;
      if (v) lastVowel = v === 'о' || v === 'а' ? 'a' : v === 'и' ? 'i' : 'u';
    }

    prevEndVowel = lastVowel;

    if (nextAssimilate && /[аоиуяю]$/.test(res)) {
      res += nextAssimilate;
      prevTookLam = true;
    } else {
      prevTookLam = false;
    }

    if (wi > 0 && /^(\u0671\u0644\u0644\u0651\u064E\u0647)/.test(rw) && outWords.length > 0 && outWords[outWords.length - 1].endsWith('л')) {
      outWords[outWords.length - 1] += res;
    } else {
      outWords.push(res);
    }
  }

  let line = outWords.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (line.length) line = line[0].toUpperCase() + line.slice(1);
  return line;
}
