// Чтение размеров изображения без зависимостей: PNG, JPEG, WebP.
// Нужно для aspect_ratio генерации (п.6 — не портить вертикальные фото хардкодом 3:2).

export function imageSize(buf) {
  if (!buf || buf.length < 30) throw new Error('imageSize: файл слишком маленький');

  // PNG: сигнатура \x89PNG, ширина/высота в IHDR, big-endian
  if (isPng(buf)) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: идём по маркерам, ищем SOFn (0xC0–0xCF без C4/C8/CC — это не размеры)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const len = buf.readUInt16BE(off + 2);
      off += 2 + len;
    }
    throw new Error('imageSize: SOF-маркер не найден в JPEG');
  }

  // WebP: RIFF....WEBP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8 ') {
      if (buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      throw new Error('imageSize: VP8 start code не найден');
    }
  }

  throw new Error('imageSize: неподдерживаемый формат');
}

// Модели возвращают base64 как есть: Gemini отдаёт JPEG, другие — PNG.
// Сохраняем с реальным расширением, чтобы файл не врал про формат.
export function detectImageExt(buf) {
  if (isPng(buf)) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'png';
}

function isPng(buf) {
  return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
