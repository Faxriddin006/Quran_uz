// Oyat kartasi: arabcha matn va tarjimani (so'zma-so'z, o'zgartirmasdan) rasmga chizadi.
export interface CardInput {
  ar: string;
  tr: string;
  ref: string; // "Al-Baqarah surasi, 2:255"
  trBy: string; // tarjimon
  site: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!word) continue;
      const t = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(t).width > maxW) {
        lines.push(line);
        line = word;
      } else line = t;
    }
    if (line) lines.push(line);
  }
  return lines;
}

const W = 1080;
const PAD = 96;
const MAX_H = 1920;
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Sig'masa null qaytaradi (juda uzun oyat). */
export async function renderCard(input: CardInput): Promise<Blob | null> {
  try {
    await document.fonts.load('64px "Amiri Quran"', input.ar.slice(0, 40));
  } catch {
    /* shrift yuklanmasa ham tizim shrifti bilan davom etamiz */
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const maxW = W - PAD * 2;
  const HEAD = 150;
  const FOOT = 210;

  let layout: { arSize: number; trSize: number; arLines: string[]; trLines: string[]; h: number } | null = null;
  for (const [arSize, trSize] of [
    [68, 38],
    [58, 34],
    [50, 31],
    [44, 28],
    [38, 26],
    [33, 24],
  ]) {
    ctx.font = `${arSize}px "Amiri Quran", serif`;
    ctx.direction = 'rtl';
    const arLines = wrap(ctx, input.ar, maxW);
    ctx.font = `${trSize}px ${UI_FONT}`;
    ctx.direction = 'ltr';
    const trLines = wrap(ctx, input.tr, maxW);
    const h = HEAD + arLines.length * arSize * 2.05 + 90 + trLines.length * trSize * 1.55 + FOOT;
    layout = { arSize, trSize, arLines, trLines, h };
    if (h <= MAX_H) break;
  }
  if (!layout || layout.h > MAX_H) return null;
  const H = Math.max(1080, Math.ceil(layout.h));
  canvas.width = W;
  canvas.height = H;

  // Fon
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b1219');
  g.addColorStop(1, '#0d2b27');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 700);
  glow.addColorStop(0, 'rgba(67,198,166,0.20)');
  glow.addColorStop(1, 'rgba(67,198,166,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Naqsh
  ctx.strokeStyle = 'rgba(224,183,92,0.07)';
  ctx.lineWidth = 1.5;
  for (let y = 40; y < H; y += 120)
    for (let x = 40; x < W; x += 120) {
      ctx.strokeRect(x - 26, y - 26, 52, 52);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-26, -26, 52, 52);
      ctx.restore();
    }
  // Ramka
  ctx.strokeStyle = 'rgba(224,183,92,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(36, 36, W - 72, H - 72, 28);
  ctx.stroke();

  const cx = W / 2;
  const extra = (H - layout.h) / 2;
  let y = HEAD + extra;

  // Arabcha
  ctx.fillStyle = '#f3e6c4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = `${layout.arSize}px "Amiri Quran", serif`;
  for (const line of layout.arLines) {
    y += layout.arSize * 1.025;
    ctx.fillText(line, cx, y);
    y += layout.arSize * 1.025;
  }
  // Ajratgich
  y += 45;
  ctx.strokeStyle = 'rgba(224,183,92,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 120, y);
  ctx.lineTo(cx - 18, y);
  ctx.moveTo(cx + 18, y);
  ctx.lineTo(cx + 120, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-7, -7, 14, 14);
  ctx.restore();
  y += 45;
  // Tarjima
  ctx.direction = 'ltr';
  ctx.fillStyle = '#ece6d9';
  ctx.font = `${layout.trSize}px ${UI_FONT}`;
  for (const line of layout.trLines) {
    y += layout.trSize * 0.775;
    ctx.fillText(line, cx, y);
    y += layout.trSize * 0.775;
  }
  // Pastki qism
  ctx.fillStyle = '#e0b75c';
  ctx.font = `600 30px ${UI_FONT}`;
  ctx.fillText(input.ref, cx, H - 150);
  ctx.fillStyle = '#93a0ad';
  ctx.font = `24px ${UI_FONT}`;
  ctx.fillText(`Tarjima: ${input.trBy}`, cx, H - 108);
  ctx.fillText(input.site, cx, H - 72);

  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
}
