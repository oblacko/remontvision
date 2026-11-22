// Сжатие сгенерированных обложек стилей style-*.png → style-*.webp (компактный формат).
// Запуск: node scripts/compress-style-images.mjs [--remove-png]
// Без --remove-png только создаёт .webp рядом с .png (для проверки размеров).
// С --remove-png удаляет .png — .webp становится единственным ассетом, и
// generatedStyleImage() в src/server.js начинает отдавать компактный webp.
//
// Ключи, у которых есть legacy-обложка (modern/loft/boho/country/japandi),
// перезаписываются новым сжатым вариантом сгенерированной иллюстрации.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIRS = ['web/public/images', 'web/dist/images'];
const QUALITY = 82;
const removePng = process.argv.includes('--remove-png');

let count = 0;
let saved = 0;

for (const dir of DIRS) {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs).sort()) {
    if (!file.startsWith('style-') || !file.endsWith('.png')) continue;
    const pngPath = path.join(abs, file);
    const webpPath = pngPath.replace(/\.png$/, '.webp');
    const before = fs.statSync(pngPath).size;
    await sharp(pngPath).webp({ quality: QUALITY }).toFile(webpPath);
    const after = fs.statSync(webpPath).size;
    if (removePng) fs.unlinkSync(pngPath);
    saved += before - after;
    count++;
    console.log(`${dir.replace('web/public/images', 'public').replace('web/dist/images', 'dist  ')} ${file} -> ${file.replace(/\.png$/, '.webp')}  ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
  }
}

console.log(`\n${count} files, saved ${(saved / 1024 / 1024).toFixed(1)} MB total (quality ${QUALITY})`);
