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

  const cleanBase = await sharp(cleanedBuf).resize(width, height, { fit: 'fill' }).png().toBuffer();
  const region = { left: sx, top: sy, width: sw, height: sh };
  const parentRgb = await sharp(parentBuf).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleanRgb = await sharp(cleanBase).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = sw * sh;
  const alpha = Buffer.alloc(count);
  let changed = 0;
  for (let i = 0; i < count; i += 1) {
    const o = i * 3;
    const d = Math.max(
      Math.abs(parentRgb.data[o] - cleanRgb.data[o]),
      Math.abs(parentRgb.data[o + 1] - cleanRgb.data[o + 1]),
      Math.abs(parentRgb.data[o + 2] - cleanRgb.data[o + 2]),
    );
    if (d > 24) { alpha[i] = 255; changed += 1; }
  }

  let objectPng;
  let shadowPng = null;
  let shadowPad = 0;
  if (changed > count * 0.02) {
    // Силуэт объекта = область, которую модель реально изменила при удалении.
    // Это убирает прямоугольный патч стены: вставляем только сам объект.
    const soft = await sharp(alpha, { raw: { width: sw, height: sh, channels: 1 } }).blur(1.5).raw().toBuffer();
    const rgba = Buffer.alloc(count * 4);
    for (let i = 0; i < count; i += 1) {
      const o = i * 3;
      rgba[i * 4] = parentRgb.data[o];
      rgba[i * 4 + 1] = parentRgb.data[o + 1];
      rgba[i * 4 + 2] = parentRgb.data[o + 2];
      rgba[i * 4 + 3] = soft[i];
    }
    objectPng = await sharp(rgba, { raw: { width: sw, height: sh, channels: 4 } }).png().toBuffer();
    // Мягкая тень по тому же силуэту, сдвинутая вниз: без неё вставка выглядит наклейкой.
    // Холст с полями: иначе blur обрезается по границе bbox и тень не выходит за объект.
    const pad = Math.max(4, Math.round(Math.min(sw, sh) * 0.12));
    const paddedW = sw + pad * 2;
    const paddedH = sh + pad * 2;
    const padded = await sharp({
      create: { width: paddedW, height: paddedH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: objectPng, left: pad, top: pad }]).png().toBuffer();
    const alphaOnly = await sharp(padded)
      .ensureAlpha()
      .extractChannel('alpha')
      .blur(Math.max(2, Math.min(sw, sh) * 0.08))
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (alphaOnly.info.width === paddedW && alphaOnly.info.height === paddedH) {
      const shadow = Buffer.alloc(paddedW * paddedH * 4);
      for (let i = 0; i < paddedW * paddedH; i += 1) {
        shadow[i * 4 + 3] = Math.round(alphaOnly.data[i] * 0.35);
      }
      shadowPng = await sharp(shadow, { raw: { width: paddedW, height: paddedH, channels: 4 } }).png().toBuffer();
      shadowPad = pad;
    }
  } else {
    // Fallback: если разница почти нулевая, используем мягкий кроп.
    const inset = Math.max(1, Math.round(Math.min(sw, sh) * 0.02));
    const blur = Math.max(2, Math.round(Math.min(sw, sh) * 0.01));
    const mask = Buffer.from(
      `<svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
      `<rect x="${inset}" y="${inset}" width="${Math.max(1, sw - inset * 2)}" height="${Math.max(1, sh - inset * 2)}" rx="${inset}" fill="#fff" filter="url(#b)"/>` +
      `</svg>`,
    );
    objectPng = await sharp(parentBuf).extract(region).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }

  const layers = [];
  if (shadowPng) {
    // Тень чуть ниже и правее объекта: так вставка «стоит» на поверхности.
    layers.push({
      input: shadowPng,
      left: tx + Math.round(sw * 0.03) - shadowPad,
      top: ty + Math.round(sh * 0.10) - shadowPad,
    });
  }
  layers.push({ input: objectPng, left: tx, top: ty });
  return sharp(cleanBase)
    .composite(layers)
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
  return sharp(crop)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
