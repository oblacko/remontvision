// Санитизация загруженных изображений: авто-поворот по EXIF и удаление метаданных
// (EXIF/GPS/комментарии) перед сохранением в storage.
import sharp from 'sharp';
import { detectImageExt } from './imagesize.js';

export async function sanitizeImage(buf) {
  const ext = detectImageExt(buf);
  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    if (meta.width && meta.height && meta.width * meta.height > 40_000_000) {
      const err = new Error('Слишком большое изображение (макс. 40 МП)');
      err.status = 400;
      throw err;
    }
    let img = sharp(buf, { failOn: 'none' }).rotate()
      .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true });
    if (ext === 'jpg') img = img.jpeg({ quality: 90, mozjpeg: true });
    else if (ext === 'webp') img = img.webp({ quality: 90 });
    else img = img.png({ compressionLevel: 9 });
    return await img.toBuffer();
  } catch (e) {
    const err = new Error('Не удалось обработать изображение');
    err.status = 400;
    err.cause = e;
    throw err;
  }
}

// Приводим выход модели к формату исходного фото: центр-кроп по нужной пропорции.
// Если модель вернула правильную пропорцию — буфер не перекодируется.
export async function fitAspect(buf, targetRatio) {
  if (!targetRatio || !Number.isFinite(targetRatio)) return buf;
  try {
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return buf;
    const current = meta.width / meta.height;
    if (Math.abs(current - targetRatio) / targetRatio < 0.01) return buf;

    let width = meta.width;
    let height = Math.round(width / targetRatio);
    if (height > meta.height) {
      height = meta.height;
      width = Math.round(height * targetRatio);
    }
    width = Math.max(1, Math.min(width, meta.width));
    height = Math.max(1, Math.min(height, meta.height));
    const left = Math.floor((meta.width - width) / 2);
    const top = Math.floor((meta.height - height) / 2);
    return await img.extract({ left, top, width, height }).toBuffer();
  } catch {
    return buf;
  }
}
