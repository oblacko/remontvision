// Приём загруженных изображений: маппинг MIME → расширение и серверная
// конвертация HEIC/HEIF в JPEG (iPhone отдаёт HEIC по умолчанию).
import sharp from 'sharp';

export const UPLOAD_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.jpg',
  'image/heif': '.jpg',
};

const HEIC_MIME = new Set(['image/heic', 'image/heif']);

export function isHeic(mimetype) {
  return HEIC_MIME.has(mimetype);
}

const defaultConvert = buffer => sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();

// Для JPEG/PNG/WebP возвращает буфер без изменений; для HEIC/HEIF — JPEG.
// Конвертер подставляется в тестах, чтобы не гонять sharp на каждый формат.
export async function convertHeicIfNeeded(buffer, mimetype, { convert = defaultConvert } = {}) {
  if (!isHeic(mimetype)) return buffer;
  try {
    return await convert(buffer);
  } catch (e) {
    const err = new Error('Не удалось прочитать HEIC. Сохраните фото как JPG или включите в настройках iPhone «Наиболее совместимые»');
    err.status = 400;
    err.cause = e;
    throw err;
  }
}
