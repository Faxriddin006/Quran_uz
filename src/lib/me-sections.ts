// «Shaxsiy» sahifasi uchun qo'shimcha bo'limlar: xatm rejasi va oflayn yuklab olish
import { h, icon, I, setChildren } from './dom.ts';
import { DATA_V, type Meta } from './data.ts';
import { load, save } from './store.ts';
import { getKhatm, setKhatm, portion, scheduledDay, today } from './khatm.ts';
import { toast } from './util.ts';

export function khatmSection(meta: Meta): HTMLElement {
  const sName = (s: number) => meta.suras[s - 1].tr;
  const box = h('div', { class: 'card me-card' });
  function paint() {
    const k = getKhatm();
    if (!k) {
      const custom = h('input', { class: 'field', type: 'number', min: '1', max: '1000', placeholder: 'kun', 'aria-label': 'Kunlar soni', style: { width: '90px', padding: '8px 10px' } });
      const start = (days: number) => {
        if (!(days >= 1 && days <= 1000)) return toast('Kunlar soni 1 dan 1000 gacha boʻlsin');
        setKhatm({ days: Math.round(days), start: today(), done: 0 });
        paint();
      };
      setChildren(
        box,
        h('p', { style: { margin: '0 0 10px' } }, 'Qurʼonni necha kunda oʻqib chiqmoqchisiz? 604 sahifa kunlarga teng boʻlinadi va har kuni bugungi qism koʻrsatiladi.'),
        h(
          'div',
          { class: 'me-row' },
          [30, 60, 90, 180, 365].map((d) => h('button', { class: 'chip', type: 'button', onclick: () => start(d) }, `${d} kun`)),
          custom,
          h('button', { class: 'btn small', type: 'button', onclick: () => start(Number(custom.value)) }, 'Boshlash'),
        ),
      );
      return;
    }
    const finished = k.done >= k.days;
    const day = Math.min(k.days, k.done + 1);
    const p = portion(meta, k, day);
    const diff = k.done - (scheduledDay(k) - 1);
    const status = finished ? 'Xatm tugallandi' : diff > 0 ? `Rejadan ${diff} kun oldindasiz` : diff < 0 ? `Rejadan ${-diff} kun ortdasiz` : 'Reja boʻyicha ketyapsiz';
    setChildren(
      box,
      h('div', { class: 'me-row', style: { justifyContent: 'space-between' } }, h('strong', null, `${k.done} / ${k.days} kun`), h('span', { class: 'muted' }, status)),
      h('div', { class: 'me-prog', role: 'progressbar', 'aria-label': 'Xatm jarayoni', 'aria-valuemin': '0', 'aria-valuemax': String(k.days), 'aria-valuenow': String(k.done) }, h('i', { style: { width: `${(k.done / k.days) * 100}%` } })),
      finished
        ? null
        : [
            h(
              'p',
              { style: { margin: '12px 0 10px' } },
              h('b', null, `${day}-kun: `),
              p.fromPage === p.toPage ? `${p.fromPage}-sahifa` : `${p.fromPage}–${p.toPage}-sahifalar`,
              h('br'),
              h('span', { class: 'muted' }, `${sName(p.from[0])} ${p.from[0]}:${p.from[1]} — ${sName(p.to[0])} ${p.to[0]}:${p.to[1]}`),
            ),
            h(
              'div',
              { class: 'me-row' },
              h('a', { class: 'btn primary', href: `#${p.from[0]}:${p.from[1]}` }, icon(I.book), 'Oʻqishni boshlash'),
              h('button', { class: 'btn', type: 'button', onclick: () => (setKhatm({ ...k, done: k.done + 1 }), paint()) }, icon(I.check), 'Bugungi qismni oʻqidim'),
            ),
          ],
      h(
        'div',
        { class: 'me-row', style: { marginTop: '12px' } },
        k.done > 0 && !finished ? h('button', { class: 'btn small', type: 'button', onclick: () => (setKhatm({ ...k, done: k.done - 1 }), paint()) }, 'Bir kun orqaga') : null,
        h('button', { class: 'btn small', type: 'button', onclick: () => confirm('Xatm rejasi oʻchirilsinmi?') && (setKhatm(null), paint()) }, finished ? 'Yangi reja' : 'Rejani bekor qilish'),
      ),
    );
  }
  paint();
  return h('section', { class: 'me-sec' }, h('h2', null, 'Xatm rejasi'), box);
}

export function offlineSection(meta: Meta): HTMLElement {
  const box = h('div', { class: 'card me-card' });
  function paint(progress?: string) {
    const at = load<string | null>('offlineAt', null);
    const okV = load<string | null>('offlineV', null) === DATA_V;
    const supported = 'serviceWorker' in navigator && 'caches' in window;
    const withTafsir = h('input', { type: 'checkbox', id: 'off-taf' });
    setChildren(
      box,
      h('p', { style: { margin: '0 0 10px' } }, 'Ochilgan sahifalar avtomatik keshlanadi. Butun Qurʼonni (arabcha matn, tarjimalar, qidiruv, ildizlar) internetsiz ishlatish uchun bir marta yuklab oling — taxminan 5 MB trafik. Arabcha qiroat (audio) oflayn ishlamaydi.'),
      !supported ? h('p', { class: 'notice' }, 'Bu brauzer oflayn rejimni qoʻllab-quvvatlamaydi (yoki maxfiy oynada ochilgan).') : null,
      at && okV ? h('p', { class: 'me-ok' }, icon(I.check), `Oflayn uchun tayyor (${at})`) : at ? h('p', { class: 'notice' }, 'Maʼlumotlar yangilangan — qaytadan yuklab oling.') : null,
      progress ? h('p', { class: 'muted', role: 'status' }, progress) : null,
      h(
        'div',
        { class: 'me-row' },
        h('button', { class: 'btn primary', type: 'button', disabled: !supported || !!progress, onclick: () => download(withTafsir.checked) }, icon(I.download), at && okV ? 'Qayta yuklash' : 'Oflayn uchun yuklab olish'),
        h('label', { class: 'me-check', for: 'off-taf' }, withTafsir, 'Tafsirlar bilan (+1,5 MB)'),
      ),
    );
  }
  async function download(tafsir: boolean) {
    try {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) return toast('Sahifani bir marta yangilang, soʻng qayta urinib koʻring');
      const assets: string[] = await fetch('asset-list.json', { cache: 'no-store' }).then((r) => r.json());
      const data = ['meta.json', 'ar.json', 'search/index.json', 'search/docs-t.json', 'search/docs-m.json', 'roots/graph.json', 'roots/index.json'];
      for (let s = 1; s <= 114; s++) data.push(`s/${s}.json`);
      if (tafsir) for (const t of meta.tafsirs) for (let s = 1; s <= 114; s++) data.push(`tafsir/${t.id}/${s}.json`);
      const urls = [...assets, ...data.map((d) => `data/${d}?v=${DATA_V}`)];
      let done = 0;
      let failed = 0;
      let i = 0;
      paint(`Yuklanmoqda… 0 / ${urls.length}`);
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (i < urls.length) {
            const u = urls[i++];
            try {
              const r = await fetch(u);
              if (!r.ok) failed++;
              await r.arrayBuffer();
            } catch {
              failed++;
            }
            done++;
            if (done % 8 === 0 || done === urls.length) paint(`Yuklanmoqda… ${done} / ${urls.length}`);
          }
        }),
      );
      if (failed) {
        paint();
        return toast(`${failed} ta faylni yuklab boʻlmadi — qayta urinib koʻring`);
      }
      save('offlineAt', today());
      save('offlineV', DATA_V);
      paint();
      toast('Tayyor: endi internetsiz ham ishlaydi');
    } catch {
      paint();
      toast('Yuklab boʻlmadi. Internet aloqasini tekshiring.');
    }
  }
  paint();
  return h('section', { class: 'me-sec' }, h('h2', null, 'Oflayn oʻqish'), box);
}
