import { h, type Child } from '../lib/dom.ts';
import { getMeta, type Meta } from '../lib/data.ts';
import { setTitle } from '../lib/util.ts';
import { RECITERS } from './reader.ts';
import type { Route } from '../main.ts';

const TANZIL_TERMS = `Tanzil Quran Text (Uthmani, Version 1.1)
Copyright (C) 2007-2026 Tanzil Project
License: Creative Commons Attribution 3.0

TERMS OF USE:
- Permission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT ALLOWED.
- This Quran text can be used in any website or application, provided that its source (Tanzil Project) is clearly indicated, and a link is made to tanzil.net to enable users to keep track of changes.
- This copyright notice shall be included in all verbatim copies of the text, and shall be reproduced appropriately in all files derived from or containing substantial portion of this text.`;

const QENC_TERMS = `Contents of the translations can be downloaded and re-published, with the following terms and conditions:
1. No modification, addition, or deletion of the content.
2. Clearly referring to the publisher and the source (QuranEnc.com).
3. Mentioning the version number when re-publishing the translation.
4. Keeping the transcript information inside the document.
5. Notifying the source (QuranEnc.com) of any note on the translation.
6. Updating the translation according to the latest version issued from the source (QuranEnc.com).
7. Inappropriate advertisements must not be included when displaying translations of the meanings of the Noble Quran.`;

const CORPUS_TERMS = `Quranic Arabic Corpus (morphology, version 0.4)
Copyright (C) 2011 Kais Dukes
License: GNU General Public License

The Quranic Arabic Corpus includes syntactic and morphological annotation of the Quran, and builds on the verified Arabic text distributed by the Tanzil project.

TERMS OF USE:
- Permission is granted to copy and distribute verbatim copies of this file, but CHANGING IT IS NOT ALLOWED.
- This annotation can be used in any website or application, provided its source (the Quranic Arabic Corpus) is clearly indicated, and a link is made to http://corpus.quran.com to enable users to keep track of changes.
- This copyright notice shall be included in all verbatim copies of the text, and shall be reproduced appropriately in all works derived from or containing substantial portion of this file.`;

const ext = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

function srcCard(title: string, rows: [string, Child][], ...extra: Child[]) {
  return h(
    'section',
    { class: 'card src-card' },
    h('h3', null, title),
    h(
      'dl',
      null,
      rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]),
    ),
    extra,
  );
}

function sha(meta: Meta, key: string) {
  const s = meta.sources[key];
  return s ? h('code', null, `data/raw/${s.file} · SHA-256 ${s.sha256}`) : '—';
}

export async function render(root: HTMLElement, _r: Route) {
  setTitle('Manbalar va litsenziyalar');
  const meta = await getMeta();
  const mansur = meta.sources.mansur;

  root.replaceChildren(
    h(
      'div',
      { class: 'wrap prose' },
      h(
        'div',
        { class: 'page-head' },
        h('h1', null, 'Manbalar va litsenziyalar'),
        h('p', null, `Maʼlumotlar yigʻilgan sana: 2026-11-05 · Sayt maʼlumotlari qurilgan: ${meta.built}`),
      ),
      h(
        'div',
        { class: 'warn' },
        h('strong', null, 'Asosiy qoida. '),
        'Bu sayt Qurʼon matni, tarjima, izoh yoki tafsirni oʻzi yaratmaydi, qayta ifodalamaydi va «tuzatmaydi». Barcha matnlar quyidagi nashr qilingan manbalardan soʻzma-soʻz olinadi. Yuklab olingan asl fayllar va ularning SHA-256 xeshlari ochiq repozitoriyda (data/raw/) saqlanadi; qurish skripti har bir oyatning soni va tartibini tekshiradi.',
      ),

      h('h2', null, 'Arabcha matn'),
      srcCard(
        'Tanzil Quran Text — Usmoniy (Uthmani), 1.1-versiya',
        [
          ['Manba', ext('https://tanzil.net/download/', 'tanzil.net/download')],
          ['Litsenziya', 'Creative Commons Attribution 3.0 + quyidagi foydalanish shartlari (matnni oʻzgartirish taqiqlanadi)'],
          ['Format', 'XML (quran-uthmani.xml). Basmala Tanzil XML dagi alohida «bismillah» maydonidan olinib, sura boshida koʻrsatiladi.'],
          ['Fayl', sha(meta, 'tanzilText')],
        ],
        h('blockquote', { lang: 'en' }, TANZIL_TERMS),
      ),

      h('h2', null, 'Metamaʼlumotlar'),
      srcCard(
        'Tanzil Quran Metadata (1.0-versiya)',
        [
          ['Manba', ext('https://tanzil.net/docs/quran_metadata', 'tanzil.net — quran-data.js')],
          ['Litsenziya', 'Creative Commons Attribution 3.0'],
          ['Ishlatilishi', 'Suralar oyatlari soni, arabcha nomlar, nuzul tartibi, Makkiy/Madaniy tasnifi, juz, hizb choraklari, sajda oyatlari'],
          ['Fayl', sha(meta, 'tanzilMeta')],
        ],
        h(
          'p',
          { class: 'muted', style: { fontSize: '14px' } },
          'Eslatma: Makkiy/Madaniy tasnifi va nuzul tartibi shu manbadan olingan. Ayrim suralar boʻyicha ulamolar orasida turli qarashlar mavjud — bu maʼlumotlarni yakuniy hukm sifatida qabul qilmang.',
        ),
      ),
      srcCard('Suralarning lotincha nomlari (transliteratsiya)', [
        ['Manba', ext('https://api.quran.com/api/v4/chapters', 'Quran.com API v4 — chapters (name_simple)')],
        ['Izoh', 'Oʻzbekcha nomlar uchun ochiq litsenziyali maʼlumotlar toʻplami topilmadi, shuning uchun nomlar oʻzimiz tomonidan tarjima qilinmadi.'],
      ]),
      srcCard('Arabcha matnning kirillcha oʻqilishi (талаффуз / транслитерация)', [
        ['Manba', 'Tanzil Quran Text — Usmoniy (quran-uthmani.xml)'],
        [
          'Usul',
          'Tanzil Usmoniy XML dagi harflar, harakatlar (fatha, kasra, damma, sukun, shadda, tanwin), hamzatul-vasl (ٱ), shamsiy/qamariy harflar, idgʻom, iqlob (ۢ/ۭ) va vaqf qoidalaridan deterministik jadval asosida avtomatik hosil qilingan (src/lib/translit.ts).',
        ],
        [
          'Muhim eslatma',
          'Kirill yoki lotin harflari arab tovushlari va tajvid qoidalarini toʻliq ifodalay olmaydi. Shu sababli bu qator faqat oʻrganuvchilar uchun yordamchi vosita boʻlib, uni asl arabcha matn va qorilar audiosi bilan birga kuzatish tavsiya etiladi.',
        ],
      ]),

      h('h2', null, 'Tarjimalar'),
      srcCard(
        'Muhammad Sodiq Muhammad Yusuf — lotin yozuvida (izohlari bilan)',
        [
          ['Manba', ext('https://api.quran.com/api/v4/quran/translations/55', 'Quran.com API v4, tarjima resursi 55')],
          ['Izohlar', 'Quran.com API v4 /foot_notes (1797 ta izoh)'],
          ['Yozuv', 'Manbada oʻ, gʻ harflari « ` » belgisi bilan yozilgan (masalan: «to`g`ri»); matn oʻzgartirilmagani uchun shunday koʻrsatiladi.'],
          [
            'Litsenziya',
            'Quran.com / Quran Foundation sahifalarida ushbu kontent uchun aniq litsenziya yoki foydalanish shartlari topilmadi (2026-11-05 da tekshirildi). Mualliflik huquqi tarjimon va noshirga tegishli. Matn notijorat maqsadda, oʻzgartirishsiz va manbasi koʻrsatilgan holda berilmoqda.',
          ],
          ['Fayl', sha(meta, 'sodiqLat')],
        ],
      ),
      srcCard(
        'Muhammad Sodiq Muhammad Yusuf — kirill yozuvida (izohlari bilan)',
        [
          ['Manba', ext('https://quranenc.com/en/browse/uzbek_sadiq', 'QuranEnc.com — uzbek_sadiq')],
          ['Versiya', 'QuranEnc API javobida versiya raqami koʻrsatilmagan; olingan sana 2026-11-05'],
          ['Litsenziya', 'QuranEnc foydalanish shartlari (pastda)'],
          ['Fayl', sha(meta, 'sodiqCyr')],
        ],
      ),
      srcCard(
        'Alouddin Mansur — kirill yozuvida',
        [
          ['Manba', ext('https://quranenc.com/en/browse/uzbek_mansour', 'QuranEnc.com — uzbek_mansour')],
          ['Versiya', mansur?.version ? `v${mansur.version}` : '—'],
          [
            'Noshir tavsifi',
            h('span', { lang: 'en' }, '“Translated by Alaauddin Mansour. Developed under the supervision of Rowwad Translation Center. The original translation is available for the purpose of expressing opinion, evaluation, and continuous development.”'),
          ],
          ['Litsenziya', 'QuranEnc foydalanish shartlari (pastda)'],
          ['Fayl', sha(meta, 'mansur')],
        ],
      ),

      h('h2', null, 'Tafsirlar'),
      h(
        'p',
        null,
        'Qoida: tafsir faqat ochiq qayta nashr qilishga ruxsat beruvchi manbadan olinadi. QuranEnc.com quyidagi shartlar bilan yuklab olish va qayta nashr qilishga ochiq ruxsat beradi, shuning uchun ikki oʻzbekcha tafsir kiritildi. Ular tarjima matnidan alohida, «Tafsir» tugmasi orqali koʻrsatiladi.',
      ),
      meta.tafsirs.map((t) =>
        srcCard(t.title, [
          ['Manba', ext(t.sourceUrl, `QuranEnc.com — ${t.key}`)],
          ['Tavsif', t.note],
          ['Versiya', 'QuranEnc API javobida versiya raqami koʻrsatilmagan; olingan sana 2026-11-05'],
          ['Litsenziya', 'QuranEnc foydalanish shartlari (pastda)'],
          ['Fayl', sha(meta, t.id)],
        ]),
      ),
      h('h3', null, 'QuranEnc.com foydalanish shartlari (asl matn)'),
      h('blockquote', { lang: 'en' }, QENC_TERMS),
      h('p', { class: 'muted', style: { fontSize: '14px' } }, 'Tarjima yoki tafsirda xato koʻrsangiz, iltimos, bevosita QuranEnc.com ga xabar bering (5-shart). Bu sayt matnlarni oʻzi tuzatmaydi.'),

      h('h2', null, 'Arabcha ildizlar (morfologiya)'),
      srcCard(
        'Quranic Arabic Corpus — morfologiya, 0.4-versiya',
        [
          ['Manba', ext('https://corpus.quran.com/download/', 'corpus.quran.com')],
          [
            'Olingan joy',
            'Rasmiy sayt yuklab olish uchun e-pochta talab qiladi, shuning uchun fayl GitHub nusxasidan olindi (AhmedSaadi0/quran-words, Git LFS) va ikkinchi mustaqil nusxa (ezAldinWaez/quran-etl) bilan solishtirildi — mazmuni bir xil (faqat qator oxiri belgilari farq qiladi).',
          ],
          ['Litsenziya', 'GNU General Public License + quyidagi shartlar'],
          ['Ishlatilishi', 'Faqat ROOT (ildiz) belgilari va ularning joylashuvi (sura:oyat). Ildizlar Buckwalter transliteratsiyasidan arab harflariga mexanik (jadval asosida) oʻgiriladi.'],
          ['Fayl', sha(meta, 'corpus')],
        ],
        h('blockquote', { lang: 'en' }, CORPUS_TERMS),
      ),

      h('h2', null, 'Audio (qiroat)'),
      srcCard('EveryAyah.com — oyatma-oyat MP3', [
        ['Manba', ext('https://everyayah.com/', 'everyayah.com')],
        ['Qorilar', RECITERS.map((r) => r.name).join(', ')],
        ['Ishlatilishi', 'Fayllar bu saytda saqlanmaydi; brauzer ularni toʻgʻridan-toʻgʻri everyayah.com dan yuklaydi.'],
        ['Litsenziya', 'everyayah.com sahifalarida aniq foydalanish shartlari topilmadi (2026-11-05 da tekshirildi).'],
      ]),

      h('h2', null, 'Shrift'),
      srcCard('Amiri Quran', [
        ['Manba', ext('https://github.com/aliftype/amiri', 'github.com/aliftype/amiri') ],
        ['Litsenziya', h('span', null, 'SIL Open Font License 1.1 — ', h('a', { href: 'fonts/OFL-Amiri.txt' }, 'toʻliq matn'))],
      ]),

      h('h2', null, 'Tekshirilgan, lekin ishlatilmagan manbalar'),
      h(
        'ul',
        null,
        h(
          'li',
          null,
          h('strong', null, 'fawazahmed0/quran-api'),
          ' — undagi barcha oʻzbekcha nashrlar kirill yozuvida va asl manbalarning nusxalari: «uzb-muhammadsodikmu» (Tanzil nusxasi, gap oxiridagi nuqtalar olib tashlangan), «uzb-alauddinmansour» (QuranEnc v1.0.0 nusxasi, oyat raqami va oxirgi nuqtalar olib tashlangan). «uzb-alaaudeenmansou» esa Alouddin Mansur nomi bilan berilgan, lekin mazmunan Muhammad Sodiq tarjimasi (6236 oyatdan 3945 tasi Quran.com dagi Sodiq kirill matni bilan aynan bir xil). Shu sababli asl manbalar bevosita ishlatildi.',
        ),
        h('li', null, h('strong', null, 'Tanzil uz.sodik'), ' — Muhammad Sodiq tarjimasining 2011-yilgi kirill nashri (izohlar qavs ichida). Yangiroq nashr (QuranEnc) tanlandi.'),
        h('li', null, h('strong', null, 'QuranEnc uzbek_rwwad'), ' — Ruvvod tarjima markazi tarjimasi. Mavjud, ammo loyiha talabida koʻrsatilmagani uchun kiritilmadi.'),
      ),

      h('h2', null, 'Sunʼiy intellekt haqida'),
      h(
        'p',
        null,
        'Saytning dasturiy kodi sunʼiy intellekt (Claude) yordamida yozilgan. Qurʼon matni, tarjimalar, izohlar va tafsirlar AI tomonidan yaratilmagan va oʻzgartirilmagan. «Ildizlar grafi» Quranic Arabic Corpus morfologik maʼlumotlaridan algoritm bilan hisoblanadi (AI emas). Saytda hozircha AI yaratgan mavzu teglari yoʻq; kelajakda qoʻshilsa, ular «AI tomonidan guruhlangan, tekshirilmagan» deb aniq belgilanadi.',
      ),
    ),
  );
}
