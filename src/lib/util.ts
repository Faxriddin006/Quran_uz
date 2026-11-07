const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function arNum(n: number): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

let toastTimer = 0;
export function toast(msg: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function siteUrl(hash: string): string {
  return location.origin + location.pathname + hash;
}

export function typeLabel(t: 'makkiy' | 'madaniy'): string {
  return t === 'makkiy' ? 'Makkiy' : 'Madaniy';
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t = 0;
  return (...a: A) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export function setTitle(t: string): void {
  document.title = t ? `${t} — Qur'oni Karim` : "Qur'oni Karim — arabcha matn va o'zbekcha tarjimalar";
}

export function relTime(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return 'hozirgina';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} daqiqa oldin`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} soat oldin`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} kun oldin`;
  return new Date(ts).toISOString().slice(0, 10);
}

