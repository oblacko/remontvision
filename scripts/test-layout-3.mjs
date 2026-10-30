// Проверка layout-first: размеры, видимый кадр, живые детали.
// Запуск: node --env-file=.env scripts/test-layout-3.mjs
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect, assessDimensions } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { buildScalePlan } from '../src/scaleplan.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';
import { getModelConfig } from '../src/modelconfig.js';
import { q } from '../src/db.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'layout-tests');
fs.mkdirSync(OUT, { recursive: true });
const dataUrl = buf => `data:${MIME[detectImageExt(buf)] || 'image/jpeg'};base64,${buf.toString('base64')}`;

const scenarios = [
  {
    key: 'bedroom-2.4',
    style: 'Тёплый минимализм',
    roomType: 'Спальня',
    dims: { width: 2.4, length: 4.0, height: 2.6, bedLength: 2, orientation: '' },
    src: 'web/dist/images/room-before.webp',
  },
  {
    key: 'living-cat',
    style: 'Органик модерн',
    roomType: 'Гостиная (зал)',
    dims: { width: 3.6, length: 5.2, height: 2.7, bedLength: null, orientation: '' },
    src: 'web/dist/images/living-before.webp',
  },
  {
    key: 'bath-redesign',
    style: 'Тёплый минимализм',
    roomType: 'Санузел',
    dims: { width: 1.7, length: 2.2, height: 2.4, bedLength: null, orientation: '' },
    src: 'tmp/live/bath-photo.jpg',
  },
];

const report = [];
let totalCost = 0;
const model = getModelConfig().render;
console.log('model', model);

for (const [index, s] of scenarios.entries()) {
  const n = String(index + 1).padStart(2, '0');
  const row = { n, key: s.key, style: s.style, room_type: s.roomType, dimensions: s.dims, model };
  try {
    const styleInfo = await q.styleByName(s.style);
    const buf = fs.readFileSync(path.join(process.cwd(), s.src));
    const srcUrl = dataUrl(buf);
    const { width, height } = imageSize(buf);
    const scalePlan = buildScalePlan({ roomType: s.roomType, ...s.dims });

    const ad = await buildArtDirection({
      imageDataUrl: srcUrl,
      roomType: s.roomType,
      style: s.style,
      styleDescription: styleInfo?.prompt_description || '',
      dimensions: s.dims,
      keepFurniture: false,
      scalePlan,
    });
    row.art_direction_cost = ad?.cost ?? null;
    row.layout_items = ad?.layoutItems || [];
    row.layout_plan = ad?.layoutPlan || scalePlan;
    row.framing_note = ad?.framingNote || '';
    row.art_direction = ad?.text || '';

    const prompt = buildPrompt({
      style: s.style,
      priceTier: 'comfort',
      products: [],
      roomType: s.roomType,
      keepFurniture: false,
      useCatalog: false,
      styleDescription: styleInfo?.prompt_description || '',
      imageMap: [{ role: 'source room', label: 'authority for architecture, camera and room envelope' }],
      dimensions: s.dims,
      artDirection: ad?.text || '',
      layoutPlan: ad?.layoutPlan || scalePlan,
      framingNote: ad?.framingNote || '',
    });
    fs.writeFileSync(path.join(OUT, `${n}-${s.key}.prompt.txt`), prompt, 'utf8');

    const aspect = snapAspect(width, height, modelCaps(model).aspects);
    const started = Date.now();
    const out = await generateRender({ prompt, sourceImageB64: srcUrl, referenceImagesB64: [], aspectRatio: aspect });
    row.render_ms = Date.now() - started;
    row.render_cost = out.cost ?? null;
    row.aspect = aspect;

    const outBuf = Buffer.from(out.b64, 'base64');
    const ext = detectImageExt(outBuf);
    const file = `${n}-${s.key}.${ext === 'jpeg' ? 'jpg' : ext}`;
    fs.writeFileSync(path.join(OUT, file), outBuf);
    row.file = file;

    const qa = await assessDimensions({
      sourceImageUrl: srcUrl,
      renderImageUrl: dataUrl(outBuf),
      roomType: s.roomType,
      dimensions: s.dims,
      plan: ad?.layoutPlan || scalePlan,
      framing: ad?.framingNote || '',
    });
    row.dimension_qa = qa;
    row.total_cost = (ad?.cost || 0) + (out.cost || 0) + (qa.cost || 0);
    totalCost += row.total_cost;
    row.ok = true;
    console.log(`[${n}/3] ${s.key}: plan="${(ad?.layoutPlan || '').slice(0, 120)}..." qa=${qa.accepted ? 'ok' : 'issues'} score=${qa.score} issues=${qa.issues.join('; ')} cost=$${row.total_cost.toFixed(4)}`);
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 500);
    console.log(`[${n}/3] FAIL ${s.key}: ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ model, total_cost: totalCost, items: report }, null, 2));
}

console.log(`\nDONE: ${report.filter(r => r.ok).length}/3, cost $${totalCost.toFixed(4)}`);
process.exit(0);
