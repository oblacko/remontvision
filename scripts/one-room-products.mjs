// Один рендер комнаты из фото: арт-директор (DeepSeek) → товары Hoff → image.
// Запуск: CATALOG_SERVICE_URL=http://127.0.0.1:8000 CATALOG_SERVICE_TOKEN=change-me \
//   node --env-file=.env scripts/one-room-products.mjs <image> [style] [roomType]
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, generateRender, snapAspect } from '../src/openrouter.js';
import { buildArtDirection } from '../src/artdirector.js';
import { pickHoffProducts, loadProductImages } from '../src/productpicker.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';

const [imagePath, styleArg, roomArg] = process.argv.slice(2);
if (!imagePath) {
  console.error('usage: node scripts/one-room-products.mjs <image> [style] [roomType]');
  process.exit(1);
}

const style = styleArg || 'Скандинавский';
const roomType = roomArg || 'Спальня';
const dimensions = { width: 2.8, length: 3.8, height: 2.6 };
const STYLE_BRIEFS = {
  'Скандинавский': 'scandinavian interior, light oak, white walls, linen, soft natural light, functional minimalism',
  'Джапанди': 'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette',
  'Тёплый минимализм': 'warm minimalist interior, off-white and greige, hidden storage, pale wood, textured plaster, one saturated accent, 2700–3000K indirect light',
  'Современная классика': 'modern classic interior, elegant wall moldings, warm neutrals, subtle brass, timeless',
};

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'one-room');
fs.mkdirSync(OUT, { recursive: true });

const buf = fs.readFileSync(imagePath);
const mime = MIME[detectImageExt(buf)] || 'image/jpeg';
const srcUrl = `data:${mime};base64,${buf.toString('base64')}`;
const { width, height } = imageSize(buf);
const aspect = snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects);
console.log(`photo ${width}x${height}, aspect ${aspect}, style ${style}, room ${roomType}`);

const ad = await buildArtDirection({
  imageDataUrl: srcUrl,
  roomType,
  style,
  styleDescription: STYLE_BRIEFS[style] || '',
  dimensions,
  keepFurniture: false,
});
console.log('art_direction cost:', ad?.cost ?? null);
console.log('product_plan:', JSON.stringify(ad?.productPlan || []));

const picked = await pickHoffProducts({ plan: ad?.productPlan || [], roomType, style, maxProducts: 3 });
const refs = await loadProductImages(picked);
console.log('picked:', refs.map(p => ({ name: String(p.name).slice(0, 50), category: p.category, price: p.price, dims: p.dims, why: p.why, picked_by: p.picked_by })));

const imageMap = [
  { role: 'source room', label: 'the only authority for architecture, camera and room proportions' },
  ...refs.map(p => ({
    role: `product reference — ${p.category}: keep its exact shape, colour, material and proportions; light it with the room's own light and add a soft contact shadow`,
    label: p.name,
  })),
];
const prompt = buildPrompt({
  style,
  priceTier: 'comfort',
  products: [],
  roomType,
  keepFurniture: false,
  useCatalog: false,
  hasStyleRef: false,
  styleDescription: STYLE_BRIEFS[style] || '',
  imageMap,
  dimensions,
  artDirection: ad?.text || '',
  productRefs: refs.length > 0,
});
fs.writeFileSync(path.join(OUT, 'prompt.txt'), prompt, 'utf8');

const out = await generateRender({
  prompt,
  sourceImageB64: srcUrl,
  referenceImagesB64: refs.map(r => r.b64),
  aspectRatio: aspect,
  model: 'black-forest-labs/flux-3-image',
});
const outBuf = Buffer.from(out.b64, 'base64');
const ext = detectImageExt(outBuf);
const file = path.join(OUT, `render.${ext === 'jpeg' ? 'jpg' : ext}`);
fs.writeFileSync(file, outBuf);
fs.writeFileSync(path.join(OUT, 'picked.json'), JSON.stringify({ style, roomType, dimensions, plan: ad?.productPlan || [], picked: refs.map(({ b64, ...rest }) => rest) }, null, 2));
console.log('render cost:', out.cost ?? null, '| total refs:', refs.length);
console.log('saved:', file);
process.exit(0);
