// Контрольный прогон детской после фикса масштаба кровати.
// Запуск: node --env-file=.env scripts/recheck-kids.mjs
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect, visionJson } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';
import { q } from '../src/db.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'flux-tests');
const file = path.join(process.cwd(), 'web/dist/images/room-before.webp');
const src = fs.readFileSync(file);
const dataUrl = buf => `data:${MIME[detectImageExt(buf)] || 'image/jpeg'};base64,${buf.toString('base64')}`;
const dims = { width: 3.0, length: 4.0, height: 2.6, bedLength: 2 };
const roomType = 'Детская';
const style = 'Скандинавский';
const styleInfo = await q.styleByName(style);
const srcUrl = dataUrl(src);
const ad = await buildArtDirection({ imageDataUrl: srcUrl, roomType, style, styleDescription: styleInfo?.prompt_description || '', dimensions: dims, keepFurniture: false });
const prompt = buildPrompt({ style, priceTier: 'comfort', products: [], roomType, keepFurniture: false, useCatalog: false, styleDescription: styleInfo?.prompt_description || '', imageMap: [{ role: 'source room' }], dimensions: dims, artDirection: ad?.text || '' });
const { width, height } = imageSize(src);
const out = await generateRender({ prompt, sourceImageB64: srcUrl, referenceImagesB64: [], aspectRatio: snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects), model: 'black-forest-labs/flux-3-image' });
const buf = Buffer.from(out.b64, 'base64');
const ext = detectImageExt(buf);
const name = `10b-scandi-kids-fixed.${ext === 'jpeg' ? 'jpg' : ext}`;
fs.writeFileSync(path.join(OUT, name), buf);
fs.writeFileSync(path.join(OUT, '10b-scandi-kids-fixed.prompt.txt'), prompt, 'utf8');
console.log('saved', name, 'cost', ((ad?.cost || 0) + (out.cost || 0)).toFixed(4));

const { parsed, cost } = await visionJson({
  system: 'Ты строгий арт-директор. Сравни 1 — исходная комната, 2 — дизайн детской. Верни JSON {"style_match":0-10,"photorealism":0-10,"architecture_preserved":0-10,"scale_honesty":0-10,"authorial_quality":0-10,"issues":["..."]}. scale_honesty — адекватна ли кровать (90-140 см) и проходы для детской 3×4 м.',
  user: 'Стиль: Скандинавский. Детская 3×4 м, потолок 2.6 м. Оцени.',
  images: [srcUrl, dataUrl(buf)],
});
console.log('QA', JSON.stringify(parsed), 'cost', cost);
process.exit(0);
