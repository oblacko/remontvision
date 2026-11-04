// A/B: базовый рендер «без товаров» vs «с товарами Hoff» (5 фото, не больше).
// Арт-директор даёт план → catalog-service ищет → DeepSeek отбирает «красиво по размерам».
// Запуск: CATALOG_SERVICE_URL=http://127.0.0.1:8000 CATALOG_SERVICE_TOKEN=change-me node --env-file=.env scripts/ab-products.mjs [scenario]
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect, visionJson } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { pickHoffProducts, loadProductImages } from '../src/productpicker.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'ab-products');
fs.mkdirSync(OUT, { recursive: true });

const STYLE_BRIEFS = {
  'Скандинавский': 'scandinavian interior, light oak, white walls, linen, soft natural light, functional minimalism',
  'Джапанди': 'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette',
  'Тёплый минимализм': 'warm minimalist interior, off-white and greige, hidden storage, pale wood, textured plaster, one saturated accent, 2700–3000K indirect light',
  'Современная классика': 'modern classic interior, elegant wall moldings, warm neutrals, subtle brass, timeless',
};

const scenarios = [
  { key: 'kitchen', style: 'Тёплый минимализм', roomType: 'Кухня', dims: { width: 2.8, length: 3.4, height: 2.6 }, src: 'assets/kitchen_before.png' },
  { key: 'living', style: 'Скандинавский', roomType: 'Гостиная (зал)', dims: { width: 3.6, length: 5.2, height: 2.7 }, src: 'web/dist/images/living-before.webp' },
  { key: 'bedroom', style: 'Джапанди', roomType: 'Спальня', dims: { width: 3.0, length: 4.2, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  { key: 'bath', style: 'Современная классика', roomType: 'Санузел', dims: { width: 1.7, length: 2.2, height: 2.5 }, src: 'tmp/live/bath-photo.jpg' },
  { key: 'office', style: 'Тёплый минимализм', roomType: 'Кабинет', dims: { width: 3.0, length: 4.0, height: 2.7 }, src: 'tmp/office/photo.jpg' },
];

const only = process.argv[2];
const onlyKeys = only ? only.split(',').map(k => k.trim()).filter(Boolean) : null;
const list = onlyKeys ? scenarios.filter(s => onlyKeys.includes(s.key)) : scenarios;

const dataUrl = buf => `data:${MIME[detectImageExt(buf)] || 'image/jpeg'};base64,${buf.toString('base64')}`;

const QA_SYSTEM = `Ты строгий арт-директор интерьерного бюро и QA-рецензент. Сравни два изображения: 1 — исходная реальная комната, 2 — сгенерированный дизайн.
Верни строго JSON без текста вокруг:
{"style_match":0-10,"photorealism":0-10,"architecture_preserved":0-10,"scale_honesty":0-10,"authorial_quality":0-10,"issues":["кратко по-русски"]}
style_match — соответствие стилю; photorealism — фотореализм; architecture_preserved — стены/окна/двери/потолок/ракурс; scale_honesty — честность масштаба; authorial_quality — цельность композиции и стилинга.
issues — максимум 3 реальные проблемы.`;
const num = v => Math.max(0, Math.min(10, Number(v) || 0));

async function qa(sourceUrl, renderUrl, s) {
  const { parsed, cost } = await visionJson({
    system: QA_SYSTEM,
    user: `Стиль: ${s.style}. Тип комнаты: ${s.roomType}. Размеры: ${JSON.stringify(s.dims)}. Оцени результат.`,
    images: [sourceUrl, renderUrl],
  });
  return {
    values: {
      style_match: num(parsed.style_match),
      photorealism: num(parsed.photorealism),
      architecture_preserved: num(parsed.architecture_preserved),
      scale_honesty: num(parsed.scale_honesty),
      authorial_quality: num(parsed.authorial_quality),
    },
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 3) : [],
    cost: cost ?? null,
  };
}

async function render(s, srcUrl, aspect, extra) {
  const out = await generateRender({
    prompt: extra.prompt, sourceImageB64: srcUrl, referenceImagesB64: extra.refs || [],
    aspectRatio: aspect, model: 'black-forest-labs/flux-3-image',
  });
  const buf = Buffer.from(out.b64, 'base64');
  const ext = detectImageExt(buf);
  const file = `${extra.n}-${s.key}-${extra.tag}.${ext === 'jpeg' ? 'jpg' : ext}`;
  fs.writeFileSync(path.join(OUT, file), buf);
  const score = await qa(srcUrl, dataUrl(buf), s);
  return { file, cost: out.cost ?? null, ...score.values, issues: score.issues, qaCost: score.cost };
}

const report = [];
let totalCost = 0;
const t0 = Date.now();

for (const s of list) {
  const i = scenarios.indexOf(s);
  const n = String(i + 1).padStart(2, '0');
  const row = { n, key: s.key, style: s.style, room_type: s.roomType, src: s.src };
  try {
    const srcBuf = fs.readFileSync(path.join(process.cwd(), s.src));
    const srcUrl = dataUrl(srcBuf);
    const { width, height } = imageSize(srcBuf);
    const ad = await buildArtDirection({
      imageDataUrl: srcUrl, roomType: s.roomType, style: s.style,
      styleDescription: STYLE_BRIEFS[s.style] || '', dimensions: s.dims, keepFurniture: false,
    });
    totalCost += ad?.cost || 0;
    row.plan = ad?.productPlan || [];
    const picked = row.plan.length ? await pickHoffProducts({ plan: row.plan, roomType: s.roomType, style: s.style, maxProducts: 3 }) : [];
    const refs = await loadProductImages(picked);
    row.picked = refs.map(p => ({ offer_id: p.offer_id, name: p.name, category: p.category, price: p.price, dims: p.dims, why: p.why, picked_by: p.picked_by }));
    const aspect = snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects);

    const basePrompt = buildPrompt({
      style: s.style, priceTier: 'comfort', products: [], roomType: s.roomType,
      keepFurniture: false, useCatalog: false, hasStyleRef: false,
      styleDescription: STYLE_BRIEFS[s.style] || '',
      imageMap: [{ role: 'source room', label: 'the only authority for architecture, camera and room proportions' }],
      dimensions: s.dims, artDirection: ad?.text || '',
    });
    fs.writeFileSync(path.join(OUT, `${n}-${s.key}-base.prompt.txt`), basePrompt, 'utf8');
    const base = await render(s, srcUrl, aspect, { n, tag: 'base', prompt: basePrompt });
    totalCost += (base.cost || 0) + (base.qaCost || 0);
    row.base = {
      file: base.file,
      style_match: base.style_match, photorealism: base.photorealism,
      architecture_preserved: base.architecture_preserved, scale_honesty: base.scale_honesty,
      authorial_quality: base.authorial_quality, issues: base.issues,
    };

    const imageMap = [
      { role: 'source room', label: 'the only authority for architecture, camera and room proportions' },
      ...refs.map(p => ({ role: `product reference — ${p.category}: keep its exact shape, colour, material and proportions; light it with the room's own light and add a soft contact shadow`, label: p.name })),
    ];
    const refsPrompt = buildPrompt({
      style: s.style, priceTier: 'comfort', products: [], roomType: s.roomType,
      keepFurniture: false, useCatalog: false, hasStyleRef: false,
      styleDescription: STYLE_BRIEFS[s.style] || '',
      imageMap, dimensions: s.dims, artDirection: ad?.text || '', productRefs: refs.length > 0,
    });
    fs.writeFileSync(path.join(OUT, `${n}-${s.key}-refs.prompt.txt`), refsPrompt, 'utf8');
    const withRefs = await render(s, srcUrl, aspect, { n, tag: 'refs', prompt: refsPrompt, refs: refs.map(r => r.b64) });
    totalCost += (withRefs.cost || 0) + (withRefs.qaCost || 0);
    row.refs = {
      file: withRefs.file,
      style_match: withRefs.style_match, photorealism: withRefs.photorealism,
      architecture_preserved: withRefs.architecture_preserved, scale_honesty: withRefs.scale_honesty,
      authorial_quality: withRefs.authorial_quality, issues: withRefs.issues,
    };

    console.log(`[${n}/5] ${s.key} | picked ${refs.length} | base arch ${base.architecture_preserved} style ${base.style_match} photo ${base.photorealism} | refs arch ${withRefs.architecture_preserved} style ${withRefs.style_match} photo ${withRefs.photorealism}`);
    row.ok = true;
  } catch (e) {
    row.ok = false; row.error = String(e.message || e).slice(0, 500);
    console.log(`[${n}/5] ${s.key} FAIL: ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, `report-${only || 'all'}.json`), JSON.stringify({ items: report, total_cost: totalCost }, null, 2));
}

const avg = (tag, key) => {
  const vals = report.filter(r => r.ok && r[tag]).map(r => r[tag][key]);
  return vals.length ? +(vals.reduce((a, v) => a + v, 0) / vals.length).toFixed(2) : null;
};
const keys = ['architecture_preserved', 'style_match', 'photorealism', 'scale_honesty', 'authorial_quality'];
const summary = { count: report.filter(r => r.ok).length, total_cost: +totalCost.toFixed(4) };
for (const k of keys) summary[k] = { base: avg('base', k), refs: avg('refs', k) };
fs.writeFileSync(path.join(OUT, `report-${only || 'all'}.json`), JSON.stringify({ ...summary, items: report }, null, 2));
console.log('\nСРЕДНИЕ        base   refs');
for (const k of keys) console.log(k.padEnd(22), String(summary[k].base).padStart(5), String(summary[k].refs).padStart(6));
console.log(`DONE ${summary.count}/5, cost $${totalCost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
