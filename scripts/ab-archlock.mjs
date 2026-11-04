// A/B-тест ARCHITECTURE LOCK (V1 «запреты» vs V2 «позитив») на 5 фото.
// Запуск: node --env-file=.env scripts/ab-archlock.mjs
// Результаты: tmp/ab-archlock/*.png|jpg + report.json (score по каждому фото).
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect, visionJson } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'ab-archlock');
fs.mkdirSync(OUT, { recursive: true });

// Короткие брифы стилей (без БД, чтобы тест шёл локально).
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

const dataUrl = buf => `data:${MIME[detectImageExt(buf)] || 'image/jpeg'};base64,${buf.toString('base64')}`;

const QA_SYSTEM = `Ты строгий арт-директор интерьерного бюро и QA-рецензент. Сравни два изображения: 1 — исходная реальная комната, 2 — сгенерированный дизайн.
Верни строго JSON без текста вокруг:
{"style_match":0-10,"photorealism":0-10,"architecture_preserved":0-10,"scale_honesty":0-10,"authorial_quality":0-10,"issues":["кратко по-русски"]}
style_match — насколько результат соответствует заявленному стилю.
photorealism — похоже ли на реальную фотографию, а не на CGI/рендер.
architecture_preserved — сохранены ли стены, окна, двери, потолок, ракурс и пропорции.
scale_honesty — честен ли масштаб мебели и проходов относительно комнаты.
authorial_quality — уровень авторского дизайна: цельная композиция, свет, материалы, стилинг, а не шаблонный шоурум.
issues — только реальные проблемы, максимум 3.`;

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

const only = process.argv[2];
const list = only ? scenarios.filter(s => s.key === only || s.src === only) : scenarios;

const report = [];
let totalCost = 0;
const t0 = Date.now();

for (const s of list) {
  const i = scenarios.indexOf(s);
  const n = String(i + 1).padStart(2, '0');
  const row = { n, key: s.key, style: s.style, room_type: s.roomType, dimensions: s.dims, src: s.src };
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), s.src));
    const srcUrl = dataUrl(buf);
    const { width, height } = imageSize(buf);
    const ad = await buildArtDirection({
      imageDataUrl: srcUrl,
      roomType: s.roomType,
      style: s.style,
      styleDescription: STYLE_BRIEFS[s.style] || '',
      dimensions: s.dims,
      keepFurniture: false,
    });
    row.art_direction_cost = ad?.cost ?? null;
    row.art_direction_fields = ad ? Object.keys(ad).filter(k => !['text', 'cost'].includes(k)) : [];
    const aspect = snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects);
    row.aspect = aspect;

    for (const v2 of [false, true]) {
      const tag = v2 ? 'v2' : 'v1';
      const prompt = buildPrompt({
        archLockV2: v2,
        style: s.style,
        priceTier: 'comfort',
        products: [],
        roomType: s.roomType,
        keepFurniture: false,
        useCatalog: false,
        hasStyleRef: false,
        styleDescription: STYLE_BRIEFS[s.style] || '',
        imageMap: [{ role: 'source room', label: 'the only authority for architecture, camera and room proportions' }],
        dimensions: s.dims,
        artDirection: ad?.text || '',
      });
      fs.writeFileSync(path.join(OUT, `${n}-${s.key}-${tag}.prompt.txt`), prompt, 'utf8');
      const out = await generateRender({
        prompt,
        sourceImageB64: srcUrl,
        referenceImagesB64: [],
        aspectRatio: aspect,
        model: 'black-forest-labs/flux-3-image',
      });
      const outBuf = Buffer.from(out.b64, 'base64');
      const ext = detectImageExt(outBuf);
      const file = `${n}-${s.key}-${tag}.${ext === 'jpeg' ? 'jpg' : ext}`;
      fs.writeFileSync(path.join(OUT, file), outBuf);
      const score = await qa(srcUrl, dataUrl(outBuf), s);
      totalCost += (out.cost || 0) + (score.cost || 0);
      row[tag] = { file, render_cost: out.cost ?? null, ...score.values, issues: score.issues };
      console.log(`[${n}/5] ${s.key} ${tag}: arch ${score.values.architecture_preserved} · style ${score.values.style_match} · photo ${score.values.photorealism} · scale ${score.values.scale_honesty}`);
    }
    row.ok = true;
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 500);
    console.log(`[${n}/5] ${s.key} FAIL: ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, `report-${only || 'all'}.json`), JSON.stringify({ items: report, total_cost: totalCost }, null, 2));
}

const avg = (items, tag, key) => {
  const vals = items.filter(r => r.ok && r[tag]).map(r => r[tag][key]);
  return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : '—';
};
const summary = {
  count: report.filter(r => r.ok).length,
  v1: { arch: avg(report, 'v1', 'architecture_preserved'), style: avg(report, 'v1', 'style_match'), photo: avg(report, 'v1', 'photorealism'), scale: avg(report, 'v1', 'scale_honesty') },
  v2: { arch: avg(report, 'v2', 'architecture_preserved'), style: avg(report, 'v2', 'style_match'), photo: avg(report, 'v2', 'photorealism'), scale: avg(report, 'v2', 'scale_honesty') },
};
fs.writeFileSync(path.join(OUT, `report-${only || 'all'}.json`), JSON.stringify({ ...summary, items: report, total_cost: totalCost, total_ms: Date.now() - t0 }, null, 2));
console.log(`\nV1 (запреты): arch ${summary.v1.arch} · style ${summary.v1.style} · photo ${summary.v1.photo} · scale ${summary.v1.scale}`);
console.log(`V2 (позитив): arch ${summary.v2.arch} · style ${summary.v2.style} · photo ${summary.v2.photo} · scale ${summary.v2.scale}`);
console.log(`DONE ${summary.count}/5, cost $${totalCost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
