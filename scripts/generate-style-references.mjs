// Генерация собственных референсов стилей: нейтральные room shells, hero-сцены из наших товаров,
// vision-скоринг и material boards. Результат — public/style-refs/*.webp + style-refs/seed.json.
// Запуск: RENDER_MODEL=bytedance-seed/seedream-5-0-flash VISION_MODEL=google/gemini-3-flash-preview \
//   node --env-file=.env scripts/generate-style-references.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { q } from '../src/db.js';
import { curateProducts, referenceImagesDetailed, hasImage } from '../src/curate.js';
import { buildPrompt, generateRender, generateFromText, scoreStyleReference } from '../src/openrouter.js';
import { imageSize } from '../src/imagesize.js';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'style-refs');
const SEED = path.join(ROOT, 'style-refs', 'seed.json');
const SCORES = path.join(ROOT, 'style-refs', 'scores.json');
fs.mkdirSync(OUT, { recursive: true });

const STYLE_KEYS = (process.env.REF_STYLES || 'modern,scandi,japandi,loft,neo').split(',').map(s => s.trim()).filter(Boolean);
const ROOMS = (process.env.REF_ROOMS || 'Спальня,Гостиная (зал),Кухня,Санузел,Столовая,Кабинет').split(',').map(s => s.trim()).filter(Boolean);
const VARIANTS = [
  'calm, airy, soft natural daylight, restrained styling, lots of breathing space',
  'richer material contrast, warm evening light, more layered decor and textiles',
  'editorial magazine composition, strong focal light, sculptural furniture and styled details',
];
const ROOM_SLUG = {
  'Спальня': 'bedroom',
  'Гостиная (зал)': 'living',
  'Кухня': 'kitchen',
  'Санузел': 'bathroom',
  'Столовая': 'dining',
  'Кабинет': 'office',
};
const STYLING = {
  'Спальня': 'Dress the bed with layered linen bedding, pillows and a throw. Add a rug, curtains, bedside lamps, art, books and a plant. The bed frame/finish must match the listed product, but the room must look finished and lived-in, never a bare mattress.',
  'Гостиная (зал)': 'Style the sofa with cushions and a throw, add a rug, art, books, ceramics, plants and layered lighting. The sofa and furniture must match the listed products, but the room must feel finished and editorial.',
  'Кухня': 'Style with ceramics, cutting boards, herbs, a runner, a bowl of fruit and warm under-cabinet light. Keep counters clean and uncluttered; the room must look like a finished project.',
  'Санузел': 'Style with folded towels, soap, a plant, a mirror and spa-like lighting. The room must look finished, calm and premium.',
  'Столовая': 'Set the table with ceramics, glassware, a runner and candles. Add art, a plant and a pendant that relates to the table. The room must look like a finished editorial dining space.',
  'Кабинет': 'Style the desk with a lamp, books, ceramics and a plant. Add art, a rug and shelving details. The workspace must look finished, calm and productive.',
};
const SHELLS = {
  'Спальня': 'Photorealistic wide-angle interior photo of a simple clean bedroom with a bed, two bedside tables, a window, plain white walls and light wood floor. Neutral, empty of decor and textiles, renovation base. Camera from the doorway at eye level. No people, no text, no watermark, realistic proportions.',
  'Гостиная (зал)': 'Photorealistic wide-angle interior photo of a simple clean living room with a sofa, coffee table, low TV console and a large window, plain white walls and light wood floor. Neutral, empty of decor, renovation base. Camera from the corner at eye level. No people, no text, no watermark, realistic proportions.',
  'Кухня': 'Photorealistic wide-angle interior photo of a simple clean L-shaped kitchen with cabinets, sink, cooktop, oven and a window, plain white walls and neutral floor. Neutral, empty of decor, renovation base. Camera from the doorway at eye level. No people, no text, no watermark, realistic proportions.',
  'Санузел': 'Photorealistic wide-angle interior photo of a simple clean bathroom with a toilet, vanity sink, shower, neutral tiles and a small window. Neutral, empty of decor, renovation base. Camera from the door at eye level. No people, no text, no watermark, realistic proportions.',
  'Столовая': 'Photorealistic wide-angle interior photo of a simple clean dining room with a table, chairs, sideboard and a large window, plain white walls and light wood floor. Neutral, empty of decor, renovation base. Camera from the doorway at eye level. No people, no text, no watermark, realistic proportions.',
  'Кабинет': 'Photorealistic wide-angle interior photo of a simple clean home office with a desk, office chair, shelving and a window, plain white walls and light wood floor. Neutral, empty of decor, renovation base. Camera from the doorway at eye level. No people, no text, no watermark, realistic proportions.',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const scores = fs.existsSync(SCORES) ? JSON.parse(fs.readFileSync(SCORES, 'utf8')) : {};
const seedRows = [];

async function toWebp(b64, file, width = 1280, height = 854) {
  const buf = await sharp(Buffer.from(b64, 'base64'), { failOn: 'none' })
    .resize(width, height, { fit: 'cover' })
    .webp({ quality: 88 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, file), buf);
  return buf;
}

async function shell(roomType) {
  const slug = ROOM_SLUG[roomType];
  const file = `shell-${slug}.webp`;
  const full = path.join(OUT, file);
  if (fs.existsSync(full)) return { file, full };
  console.log(`[style-refs] shell ${roomType}`);
  const out = await generateFromText({ prompt: SHELLS[roomType], aspectRatio: '3:2' });
  await toWebp(out.b64, file);
  await sleep(800);
  return { file, full };
}

async function materialBoard(products, file) {
  const full = path.join(OUT, file);
  if (fs.existsSync(full)) return;
  const chosen = products.filter(hasImage).slice(0, 6);
  if (!chosen.length) return;
  const size = 470, gap = 28;
  const cols = 3, rows = 2;
  const bg = { width: cols * size + (cols + 1) * gap, height: rows * size + (rows + 1) * gap, channels: 3, background: '#f3efe8' };
  const composites = [];
  for (let i = 0; i < chosen.length; i++) {
    const refs = await referenceImagesDetailed([chosen[i]], 1);
    if (!refs[0]) continue;
    const b64 = refs[0].b64.split(',')[1];
    const thumb = await sharp(Buffer.from(b64, 'base64')).resize(size, size, { fit: 'cover' }).toBuffer();
    composites.push({ input: thumb, left: gap + (i % cols) * (size + gap), top: gap + Math.floor(i / cols) * (size + gap) });
  }
  await sharp({ create: bg }).composite(composites).webp({ quality: 86 }).toFile(full);
}

async function score(file, style, roomType, key) {
  if (scores[key]) return scores[key];
  const buf = fs.readFileSync(path.join(OUT, file));
  const s = await scoreStyleReference(buf.toString('base64'), 'image/webp', { style, roomType });
  scores[key] = s;
  fs.writeFileSync(SCORES, JSON.stringify(scores, null, 2));
  return s;
}

async function processPair(style, roomType) {
  const slug = ROOM_SLUG[roomType];
  const sh = await shell(roomType);
  const curated = await curateProducts({
    style: style.name,
    priceTier: 'premium',
    roomType,
    seed: `${style.key}:${roomType}`,
  });
  const refs = await referenceImagesDetailed(curated.filter(hasImage), 4);
  const refIds = new Set(refs.map(r => Number(r.product.id)));
  const productsForPrompt = curated.map(p => ({ ...p, has_ref: refIds.has(Number(p.id)) }));
  const imageMap = [
    { role: 'source room', label: 'neutral shell — preserve architecture, camera and room proportions' },
    ...refs.map(r => ({ role: 'product reference', label: `${r.product.name} — ${r.product.category}` })),
  ];
  const basePrompt = buildPrompt({
    style: style.name,
    priceTier: 'premium',
    products: productsForPrompt,
    roomType,
    hasStyleRef: false,
    styleDescription: style.prompt_description || '',
    imageMap,
  });
  const shellData = `data:image/webp;base64,${fs.readFileSync(sh.full).toString('base64')}`;
  const refData = refs.map(r => r.b64);
  const roomSlug = slug;
  const variants = [];

  await Promise.all(VARIANTS.map(async (variation, index) => {
    const file = `hero-${style.key}-${roomSlug}-${index + 1}.webp`;
    const key = `hero-${style.key}-${roomSlug}-${index + 1}`;
    const full = path.join(OUT, file);
    if (!fs.existsSync(full)) {
      console.log(`[style-refs] hero ${style.key} ${roomType} #${index + 1}`);
      const out = await generateRender({
        prompt: `${basePrompt}\n\nSTYLING FOR THE REFERENCE: ${STYLING[roomType] || 'Style the room with textiles, art, plants and layered lighting so it looks finished and editorial.'}\n\nART DIRECTION VARIATION: ${variation}. Editorial interior photography, no people, no text, no watermark.`,
        sourceImageB64: shellData,
        referenceImagesB64: refData,
        aspectRatio: '3:2',
      });
      await toWebp(out.b64, file);
    }
    const s = await score(file, style.name, roomType, key);
    variants.push({ index, file, score: s, key });
    await sleep(400);
  }));

  variants.sort((a, b) => b.score.total - a.score.total || b.score.beauty_score - a.score.beauty_score);
  const best = variants[0];
  for (const v of variants) {
    seedRows.push({
      seed_key: `style-${style.key}-${roomSlug}-hero-${v.index + 1}`,
      style_key: style.key,
      room_type: roomType,
      kind: 'hero',
      title: `${style.name} · ${roomType} · hero ${v.index + 1}`,
      file: v.file,
      sort: v.index,
      approved: v.key === best.key && v.score.total >= 7.5 && v.score.style_score >= 7 && v.score.room_score >= 8,
      source: 'ai',
      score: v.score,
      product_ids: curated.map(p => Number(p.id)).join(','),
      meta: { tier: 'premium', variant: VARIANTS[v.index] },
    });
  }

  const boardFile = `board-${style.key}-${roomSlug}.webp`;
  await materialBoard(curated, boardFile);
  if (fs.existsSync(path.join(OUT, boardFile))) {
    seedRows.push({
      seed_key: `style-${style.key}-${roomSlug}-board`,
      style_key: style.key,
      room_type: roomType,
      kind: 'material_board',
      title: `${style.name} · ${roomType} · material board`,
      file: boardFile,
      sort: 10,
      approved: false,
      source: 'ai',
      score: null,
      product_ids: curated.map(p => Number(p.id)).join(','),
      meta: { tier: 'premium' },
    });
  }
  console.log(`[style-refs] ${style.key} ${roomType}: best ${best.key} ${best.score.total}`);
}

const styles = (await q.styles(false)).filter(s => STYLE_KEYS.includes(s.key));
if (!styles.length) { console.error('Нет стилей', STYLE_KEYS); process.exit(1); }
console.log(`[style-refs] styles=${styles.map(s => s.key).join(',')} rooms=${ROOMS.join(',')}`);

for (const style of styles) {
  for (const roomType of ROOMS) {
    if (!ROOM_SLUG[roomType]) continue;
    try { await processPair(style, roomType); }
    catch (e) { console.error(`[style-refs] ${style.key} ${roomType}: ${String(e.message || e).slice(0, 300)}`); }
  }
}

seedRows.sort((a, b) => a.style_key.localeCompare(b.style_key) || a.room_type.localeCompare(b.room_type) || a.sort - b.sort);
fs.writeFileSync(SEED, JSON.stringify(seedRows, null, 2) + '\n');
console.log(`[style-refs] готово: ${seedRows.length} строк, ${fs.readdirSync(OUT).filter(f => f.endsWith('.webp')).length} файлов`);
