// Прогон 10 сценариев на FLUX 3 Image 1K с арт-директором.
// Запуск: node --env-file=.env scripts/tune-flux-10.mjs
// Результаты: tmp/flux-tests/*.png|jpg|webp + report.json
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';
import { q } from '../src/db.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'flux-tests');
fs.mkdirSync(OUT, { recursive: true });

const scenarios = [
  { key: 'scandi-living', style: 'Скандинавский', roomType: 'Гостиная (зал)', dims: { width: 3.6, length: 5.2, height: 2.7 }, src: 'web/dist/images/living-before.webp' },
  { key: 'japandi-bedroom', style: 'Джапанди', roomType: 'Спальня', dims: { width: 3.0, length: 4.2, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'wabi-bedroom', style: 'Ваби-саби', roomType: 'Спальня', dims: { width: 2.8, length: 3.8, height: 2.5, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'organic-living', style: 'Органик модерн', roomType: 'Гостиная (зал)', dims: { width: 4.0, length: 5.5, height: 2.8 }, src: 'web/dist/images/living-before.webp' },
  { key: 'warmmin-kitchen', style: 'Тёплый минимализм', roomType: 'Кухня', dims: { width: 2.8, length: 3.4, height: 2.6 }, src: 'assets/kitchen_before.png' },
  { key: 'biophilic-living', style: 'Биофильный', roomType: 'Гостиная (зал)', dims: { width: 3.4, length: 5.0, height: 2.7 }, src: 'web/dist/images/living-before.webp' },
  { key: 'heritage-bedroom', style: 'Современная классика', roomType: 'Спальня', dims: { width: 3.2, length: 4.4, height: 2.8, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'med-kitchen', style: 'Средиземноморский модерн', roomType: 'Кухня', dims: { width: 3.0, length: 3.6, height: 2.6 }, src: 'assets/kitchen_before.png' },
  { key: 'japandi-kitchen', style: 'Джапанди', roomType: 'Кухня', dims: { width: 2.6, length: 3.2, height: 2.5 }, src: 'assets/kitchen_before.png' },
  { key: 'scandi-kids', style: 'Скандинавский', roomType: 'Детская', dims: { width: 3.0, length: 4.0, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
];

function dataUrl(buf) {
  const ext = detectImageExt(buf);
  return `data:${MIME[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

const report = [];
let totalCost = 0;
const t0 = Date.now();

for (const [index, s] of scenarios.entries()) {
  const n = String(index + 1).padStart(2, '0');
  const started = Date.now();
  const row = { n, key: s.key, style: s.style, room_type: s.roomType, dimensions: s.dims, source: s.src };
  try {
    const styleInfo = await q.styleByName(s.style);
    row.style_brief = Boolean(styleInfo?.prompt_description);
    const buf = fs.readFileSync(path.join(process.cwd(), s.src));
    const srcUrl = dataUrl(buf);
    const { width, height } = imageSize(buf);
    row.source_px = [width, height];

    const adStart = Date.now();
    const ad = await buildArtDirection({
      imageDataUrl: srcUrl,
      roomType: s.roomType,
      style: s.style,
      styleDescription: styleInfo?.prompt_description || '',
      dimensions: s.dims,
      keepFurniture: false,
    });
    row.art_direction_ms = Date.now() - adStart;
    row.art_direction_cost = ad?.cost ?? null;
    row.art_direction = ad ? { palette: ad.palette, focalPoint: ad.focalPoint, featureWall: ad.featureWall, mood: ad.mood, text: ad.text } : null;

    const prompt = buildPrompt({
      style: s.style,
      priceTier: 'comfort',
      products: [],
      roomType: s.roomType,
      keepFurniture: false,
      useCatalog: false,
      hasStyleRef: false,
      styleDescription: styleInfo?.prompt_description || '',
      imageMap: [{ role: 'source room', label: 'the only authority for architecture, camera and room proportions' }],
      dimensions: s.dims,
      artDirection: ad?.text || '',
    });
    fs.writeFileSync(path.join(OUT, `${n}-${s.key}.prompt.txt`), prompt, 'utf8');

    const aspect = snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects);
    const genStart = Date.now();
    const out = await generateRender({
      prompt,
      sourceImageB64: srcUrl,
      referenceImagesB64: [],
      aspectRatio: aspect,
      model: 'black-forest-labs/flux-3-image',
    });
    row.render_ms = Date.now() - genStart;
    row.render_cost = out.cost ?? null;
    row.aspect = aspect;
    row.model = out.model;

    let outBuf = Buffer.from(out.b64, 'base64');
    const ext = detectImageExt(outBuf);
    const file = `${n}-${s.key}.${ext === 'jpeg' ? 'jpg' : ext}`;
    fs.writeFileSync(path.join(OUT, file), outBuf);
    row.file = file;
    row.out_px = imageSize(outBuf);
    row.ok = true;

    const cost = (ad?.cost || 0) + (out.cost || 0);
    totalCost += cost;
    row.total_cost = cost;
    row.ms = Date.now() - started;
    console.log(`[${n}/10] OK ${s.style} · ${s.roomType} · ${row.total_cost.toFixed(4)}$ · ${row.ms}ms · ${file}`);
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 500);
    row.cost = e.cost ?? null;
    if (typeof e.cost === 'number') totalCost += e.cost;
    row.ms = Date.now() - started;
    console.log(`[${n}/10] FAIL ${s.style} · ${s.roomType} · ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ model: 'black-forest-labs/flux-3-image', resolution: '1K', total_cost: totalCost, total_ms: Date.now() - t0, items: report }, null, 2));
}

console.log(`\nDONE: ${report.filter(r => r.ok).length}/10 ok, cost $${totalCost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
