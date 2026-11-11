// Детерминированный перенос объекта: модель убирает объект и восстанавливает фон,
// затем sharp вставляет вырезанный из исходника объект в новую точку.
// Так объект действительно перемещается, а не «просит» модель угадать.
import sharp from 'sharp';

const clamp01 = n => Math.max(0, Math.min(1, Number(n)));

export function normalizeMove(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bbox = Array.isArray(raw.bbox) && raw.bbox.length === 4 ? raw.bbox.map(Number) : null;
  if (!bbox || bbox.some(n => !Number.isFinite(n))) return null;
  const [x, y, w, h] = bbox.map(clamp01);
  if (w <= 0 || h <= 0) return null;
  const dx = Number(raw.dx);
  const dy = Number(raw.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return {
    bbox: [x, y, w, h],
    dx: Math.max(-1, Math.min(1, dx)),
    dy: Math.max(-1, Math.min(1, dy)),
    label: String(raw.label || '').slice(0, 120),
  };
}

// parentBuf — исходный рендер, cleanedBuf — результат удаления объекта моделью.
export async function composeMove(parentBuf, cleanedBuf, rawMove) {
  const move = normalizeMove(rawMove);
  if (!move) throw new Error('Некорректные данные переноса');
  const parentMeta = await sharp(parentBuf).metadata();
  const width = Number(parentMeta.width);
  const height = Number(parentMeta.height);
  if (!width || !height) throw new Error('Не удалось прочитать исходный рендер');

  const [x, y, w, h] = move.bbox;
  const sx = Math.max(0, Math.min(width - 1, Math.round(x * width)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y * height)));
  const sw = Math.max(1, Math.min(width - sx, Math.round(w * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round(h * height)));
  const tx = Math.max(0, Math.min(width - sw, Math.round((x + move.dx) * width)));
  const ty = Math.max(0, Math.min(height - sh, Math.round((y + move.dy) * height)));

  const base = await sharp(cleanedBuf).resize(width, height, { fit: 'fill' }).toBuffer();
  const crop = await sharp(parentBuf)
    .extract({ left: sx, top: sy, width: sw, height: sh })
    .toBuffer();

  // Мягкие края: альфа-маска с размытой рамкой, чтобы вставка не выглядела аппликацией.
  const inset = Math.max(3, Math.round(Math.min(sw, sh) * 0.1));
  const mask = Buffer.from(
    `<svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.max(2, inset)}"/></filter></defs>` +
    `<rect x="${inset}" y="${inset}" width="${Math.max(1, sw - inset * 2)}" height="${Math.max(1, sh - inset * 2)}" rx="${inset}" fill="#fff" filter="url(#b)"/>` +
    `</svg>`,
  );
  const feathered = await sharp(crop)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: feathered, left: tx, top: ty }])
    .png()
    .toBuffer();
}

export function moveDestinationRegion(bbox, dx, dy) {
  const [x = 0, y = 0, w = 0, h = 0] = bbox || [];
  const nx = Math.min(1 - w, Math.max(0, x + dx));
  const ny = Math.min(1 - h, Math.max(0, y + dy));
  return {
    x: Math.round(nx * 100),
    y: Math.round(ny * 100),
    w: Math.round(w * 100),
    h: Math.round(h * 100),
  };
}

export async function cropObjectPng(parentBuf, bbox) {
  const move = normalizeMove({ bbox, dx: 0, dy: 0 });
  if (!move) throw new Error('Некорректный bbox объекта');
  const meta = await sharp(parentBuf).metadata();
  const width = Number(meta.width);
  const height = Number(meta.height);
  const [x, y, w, h] = move.bbox;
  const sx = Math.max(0, Math.min(width - 1, Math.round(x * width)));
  const sy = Math.max(0, Math.min(height - 1, Math.round(y * height)));
  const sw = Math.max(1, Math.min(width - sx, Math.round(w * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round(h * height)));
  const crop = await sharp(parentBuf).extract({ left: sx, top: sy, width: sw, height: sh }).png().toBuffer();
  // BFL/OpenRouter требует референс не меньше 256×256. Приводим к 512×512,
  // вписывая объект целиком (прозрачные поля по краям).
  return sharp(crop)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
