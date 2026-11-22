// Canary: 5 дополнительных генераций FLUX 3 Image с улучшенным детектором openings.
// Запуск: node --env-file=.env scripts/canary-bbox-5.mjs
// Результаты: tmp/bbox-canary-5/*.png|jpg|webp + report.json
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { buildOpenings } from '../src/openings.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';
import { q } from '../src/db.js';

process.env.BBOX_LOCK_ENABLED = 'true';
process.env.OPENINGS_MODEL = process.env.OPENINGS_MODEL || process.env.VISION_MODEL || 'google/gemini-3.1-pro-preview';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'bbox-canary-5');
fs.mkdirSync(OUT, { recursive: true });

const scenarios = [
  { key: 'scandi-kids-v2', style: 'Скандинавский', roomType: 'Детская', dims: { width: 3, length: 4, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'japandi-bedroom-v2', style: 'Джапанди', roomType: 'Спальня', dims: { width: 3, length: 4.2, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'wabi-bedroom-v2', style: 'Ваби-саби', roomType: 'Спальня', dims: { width: 2.8, length: 3.8, height: 2.5, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'heritage-bedroom-v2', style: 'Современная классика', roomType: 'Спальня', dims: { width: 3.2, length: 4.4, height: 2.8, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'warmmin-kitchen-v2', style: 'Тёплый минимализм', roomType: 'Кухня', dims: { width: 2.8, length: 3.4, height: 2.6 }, src: 'assets/kitchen_before.png' },
];

function dataUrl(buf) {
  const ext = detectImageExt(buf);
  return `data:${MIME[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

const existingReport = fs.existsSync(path.join(OUT, 'report.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8'))
  : null;
const existingByN = new Map((existingReport?.items || []).map(r => [r.n, r]));

const report = [];
let totalCost = existingReport?.total_cost || 0;
const t0 = Date.now();

for (const [index, s] of scenarios.entries()) {
  const n = String(index + 1).padStart(2, '0');
  const existing = existingByN.get(n);
  if (existing?.ok && existing?.file && fs.existsSync(path.join(OUT, existing.file))) {
    report.push(existing);
    console.log(`[${n}/5] SKIP (already rendered) ${existing.style} · ${existing.room_type} · ${existing.file}`);
    continue;
  }
  const started = Date.now();
  const row = { n, key: s.key, style: s.style, room_type: s.roomType, dimensions: s.dims, source: s.src };
  try {
    const styleInfo = await q.styleByName(s.style);
    row.style_brief = Boolean(styleInfo?.prompt_description);
    const buf = fs.readFileSync(path.join(process.cwd(), s.src));
    const srcUrl = dataUrl(buf);
    const { width, height } = imageSize(buf);
    row.source_px = [width, height];

    const openingsStart = Date.now();
    const openings = await buildOpenings({ imageDataUrl: srcUrl, roomType: s.roomType });
    row.openings_ms = Date.now() - openingsStart;
    row.openings_cost = openings?.cost ?? null;
    row.openings = openings ? { windows: openings.windows.length, doors: openings.doors.length, builtins: openings.builtins.length, confidence: openings.confidence, empty: openings.empty } : null;

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
      openings,
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

    const cost = (openings?.cost || 0) + (ad?.cost || 0) + (out.cost || 0);
    totalCost += cost;
    row.total_cost = cost;
    row.ms = Date.now() - started;
    console.log(`[${n}/5] OK ${s.style} · ${s.roomType} · openings ${openings?.windows.length || 0}w/${openings?.doors.length || 0}d · ${row.total_cost.toFixed(4)}$ · ${row.ms}ms · ${file}`);
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 500);
    row.cost = e.cost ?? null;
    if (typeof e.cost === 'number') totalCost += e.cost;
    row.ms = Date.now() - started;
    console.log(`[${n}/5] FAIL ${s.style} · ${s.roomType} · ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ model: 'black-forest-labs/flux-3-image', resolution: '1K', bbox_lock: true, total_cost: totalCost, total_ms: Date.now() - t0, items: report }, null, 2));
}

console.log(`\nDONE: ${report.filter(r => r.ok).length}/5 ok, cost $${totalCost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
