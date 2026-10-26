// Санитизация загруженных изображений: авто-поворот по EXIF и удаление метаданных
// (EXIF/GPS/комментарии) перед сохранением в storage.
import sharp from 'sharp';
import { detectImageExt } from './imagesize.js';

export async function sanitizeImage(buf) {
  const ext = detectImageExt(buf);
  try {
    let img = sharp(buf, { failOn: 'none' }).rotate();
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
