// Генерация иллюстраций для 32 стилей каталога.
// Запуск: node --env-file=.env scripts/generate-style-illustrations.mjs [--styles=modern,loft] [--room=living]
// Результат: web/dist/images/style-<id>.webp + web/public/images/style-<id>.webp + tmp/style-illustrations/report.json
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_STYLES } from '../src/designdata.js';
import { buildPrompt, generateRender, snapAspect } from '../src/openrouter.js';
import { buildOpenings } from '../src/openings.js';
import { imageSize, detectImageExt } from '../src/imagesize.js';
import { modelCaps } from '../src/modelcaps.js';
import { q } from '../src/db.js';
import { designBrief } from './style-briefs.mjs';

process.env.BBOX_LOCK_ENABLED = 'true';
process.env.OPENINGS_MODEL = process.env.OPENINGS_MODEL || process.env.VISION_MODEL || 'google/gemini-3.1-pro-preview';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const OUT = path.join(process.cwd(), 'tmp', 'style-illustrations');
fs.mkdirSync(OUT, { recursive: true });

const SIGNATURE_BY_STYLE = {
  modern: 'a full-height walnut slat wall with a recessed petrol-blue niche and hidden warm light',
  loft: 'an exposed brick wall with black steel glazing and a worn cognac leather sofa',
  scandinavian: 'pale oak boards, floor-length linen curtains and one terracotta wool throw',
  provence: 'aged oak beams, a carved armoire and a ceramic jug of lavender on the table',
  minimalism: 'a seamless microcement floor, hidden flush doors and one large sculptural ceramic vessel',
  neoclassic: 'herringbone parquet, applied wall mouldings and a pair of brass sconces framing a mirror',
  boho: 'a large macrame wall hanging, rattan peacock chair and a cluster of living plants',
  baroque: 'a deep burgundy velvet headboard, gilded wall panels and a crystal chandelier',
  japandi: 'a low oak platform bed, a dark walnut cabinet and a rice-paper pendant glowing warm',
  classic: 'dark walnut panelling, a Persian rug and a bronze chandelier over antique furniture',
  country: 'an exposed brick wall, a cast-iron range and a checked linen tablecloth',
  art_nouveau: 'a stained-glass botanical window, curved mahogany furniture and a brass whiplash lamp',
  english: 'deep green walls, a leather chesterfield and warm brass reading lamps',
  eclectic: 'a gallery wall of mismatched frames, a vintage armchair and one teal accent wall',
  mediterranean: 'whitewashed plaster, terracotta floor tiles and olive-green shutters',
  eco: 'a living moss wall, rattan chairs and a large natural-stone table',
  art_deco: 'a geometric brass inlay panel, a sunburst mirror and an oxblood velvet chair',
  dark_contemporary: 'smoked oak veneer, a graphite stone wall and one brass sculptural lamp',
  mid_century: 'a walnut credenza on tapered legs, a sputnik floor lamp and a geometric rug',
  soviet_modern: 'a veneered wall unit, a geometric wool rug and a framed soviet-era poster',
  bauhaus: 'tubular steel chairs, a glass table and a red-blue-yellow colour block',
  dark_academia: 'a wall of old books, a leather armchair and a brass desk lamp with candles',
  modern_farmhouse: 'white shiplap, black window frames and a reclaimed wood farmhouse table',
  coastal: 'white linen sofas, rattan chairs, soft blue cushions and a driftwood table',
  space_age: 'a bubble pendant, rounded plastic chairs and chrome details in mustard and cream',
  grandmillennial: 'floral wallpaper, pleated lampshades and a vintage curved-leg console',
  desert_modern: 'terracotta plaster, a large cactus and a low stone bench with woven textiles',
  tropical_modern: 'bamboo and rattan textures, lush palm leaves near the window and one terracotta ceramic accent',
  neo_deco: 'red marble surfaces, brushed brass and a colour-drenched deep burgundy wall',
  high_tech: 'a glass partition, chrome details and integrated cool LED lines',
  chalet: 'warm honey wood textures, sheepskin throws and wrought iron candle holders',
};

const LIGHT_BY_STYLE = {
  modern: 'Soft even 3000K architectural lighting with one warm accent; gentle shadows.',
  loft: 'Hard directional daylight from tall factory windows, long dramatic shadows, warm tungsten accents.',
  scandinavian: 'Cool overcast northern daylight, soft diffused, low contrast, pale surfaces.',
  provence: 'Warm bright southern daylight, soft shadows, sun-bleached surfaces.',
  minimalism: 'Even diffused daylight, almost shadowless, cool neutral, calm.',
  neoclassic: 'Soft formal daylight, warm 2700K sconces, balanced symmetry.',
  boho: 'Dappled warm daylight through sheer curtains, relaxed layered shadows.',
  baroque: 'Dramatic low-key lighting, strong chiaroscuro, warm candlelight and crystal sparkle.',
  japandi: 'Quiet soft daylight, gentle shadows, warm 2700K paper lantern.',
  classic: 'Formal warm light from a chandelier and wall sconces, soft deep shadows.',
  country: 'Bright honest daylight, warm practical farm light, no drama.',
  art_nouveau: 'Soft warm daylight through stained glass, decorative glow, curved shadows.',
  english: 'Moody low warm light, pools from brass lamps and fireplace, deep shadows.',
  eclectic: 'Soft even daylight, mixed warm and cool accents, collected atmosphere.',
  mediterranean: 'Bright warm sunlight, sun-bleached surfaces, strong clean shadows.',
  eco: 'Dappled soft daylight through plants, warm natural glow, airy.',
  art_deco: 'Glamorous warm light, sparkle on brass and glass, dramatic contrast.',
  dark_contemporary: 'Moody low-key 2700K, precise accent lighting, deep shadows.',
  mid_century: 'Warm afternoon sunlight, short shadows, brass and teak reflections.',
  soviet_modern: 'Soft even ceiling light, modest warm glow, nostalgic documentary mood.',
  bauhaus: 'Even functional daylight, crisp shadows, no decorative glow.',
  dark_academia: 'Low warm candlelight and brass lamp pools, deep scholarly shadows.',
  modern_farmhouse: 'Bright soft daylight, clean shadows, fresh airy mood.',
  coastal: 'Bright cool daylight, soft sea haze, airy shadows.',
  space_age: 'Bright even light with chrome reflections, optimistic 1960s glow.',
  grandmillennial: 'Soft daylight through lace curtains, gentle warm shadows.',
  desert_modern: 'Warm dry sunlight, long soft shadows, sun-baked surfaces.',
  tropical_modern: 'Dappled humid daylight through palm leaves, lush shadows.',
  neo_deco: 'Glamorous warm light, red marble reflections, high contrast.',
  high_tech: 'Cool even LED light, precise reflections, clinical clarity.',
  chalet: 'Warm firelight and soft mountain daylight, cozy deep shadows.',
};

// Планировка конкретного исходника: где двери и куда можно ставить крупную мебель.
const SOURCE_LAYOUT = {
  'assets/zal.jpg': {
    living: 'Composition stays identical to the source: the left third is the wall with two doors, the right third is the wide window with the radiator. The left wall stays clear; place the sofa on the right-hand wall, armchairs opposite, and leave 90 cm in front of both doors. Same camera height and crop.',
    bedroom: 'Composition stays identical to the source: the left third is the wall with two doors, the right third is the wide window with the radiator. The left wall floor stays clear; use only wall art, a mirror or a wall panel there. Place the bed along the right-hand wall with its headboard at the near end, length running toward the window; keep 90 cm between the footboard and the window wall. Same camera height and crop.',
    study: 'Composition stays identical to the source: the left third is the wall with two doors, the right third is the wide window with the radiator. The left wall stays clear; place the desk on the right-hand wall, the bookcase on the far wall, and leave 90 cm in front of both doors. Same camera height and crop.',
    dining: 'Composition stays identical to the source: the left third is the wall with two doors, the right third is the wide window with the radiator. The left wall stays clear; center the dining table under the pendant, put the sideboard on the right-hand wall, and leave 90 cm in front of both doors. Same camera height and crop.',
  },
};

const ROOMS = {
  living: { roomType: 'Гостиная (зал)', dims: { width: 3.8, length: 5.2, height: 2.7 }, src: 'web/dist/images/living-before.webp' },
  bedroom: { roomType: 'Спальня', dims: { width: 3.2, length: 4.2, height: 2.6, bedLength: 2 }, src: 'web/dist/images/room-before.webp' },
  study: { roomType: 'Кабинет', dims: { width: 2.8, length: 3.6, height: 2.6 }, src: 'assets/zal.jpg' },
  dining: { roomType: 'Столовая', dims: { width: 3.4, length: 4.6, height: 2.7 }, src: 'assets/zal.jpg' },
  kitchen: { roomType: 'Кухня', dims: { width: 2.8, length: 3.4, height: 2.6 }, src: 'assets/kitchen_before.png' },
};

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const roomKey = ROOMS[args.room] ? args.room : 'living';
const roomKeys = args.rooms
  ? String(args.rooms).split(',').map(item => item.trim()).filter(key => ROOMS[key])
  : [roomKey];
const sourceOverride = args.source || '';
const keepFurniture = String(args['keep-furniture'] || 'false') === 'true';
const only = args.styles ? new Set(String(args.styles).split(',').map(item => item.trim()).filter(Boolean)) : null;
const styles = only ? DESIGN_STYLES.filter(style => only.has(style.id)) : DESIGN_STYLES;

function dataUrl(buf) {
  const ext = detectImageExt(buf);
  return `data:${MIME[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

const report = [];
let totalCost = 0;
const t0 = Date.now();

for (const [index, style] of styles.entries()) {
  const n = String(index + 1).padStart(2, '0');
  const started = Date.now();
  const currentRoomKey = roomKeys[index % roomKeys.length];
  const room = ROOMS[currentRoomKey];
  // Спальню генерируем из реального фото спальни: на фото зала кровать
  // стабильно ломает оконный проём.
  const sourcePath = (sourceOverride && currentRoomKey !== 'bedroom') ? sourceOverride : room.src;
  const row = { n, id: style.id, name: style.name, display_name: style.display_name, room: currentRoomKey, source: sourcePath };
  try {
    const styleInfo = await q.styleByName(style.name);
    const buf = fs.readFileSync(path.join(process.cwd(), sourcePath));
    const srcUrl = dataUrl(buf);
    const { width, height } = imageSize(buf);

    const openings = await buildOpenings({ imageDataUrl: srcUrl, roomType: room.roomType });

    const prompt = buildPrompt({
      style: style.name,
      priceTier: 'comfort',
      products: [],
      roomType: room.roomType,
      keepFurniture,
      useCatalog: false,
      hasStyleRef: false,
      styleDescription: styleInfo?.prompt_description || style.prompt_en,
      imageMap: [{ role: 'source room', label: 'the only authority for architecture, camera and room proportions' }],
      dimensions: room.dims,
      artDirection: '',
      openings,
      signatureMove: SIGNATURE_BY_STYLE[style.id] || '',
      stylePalette: style.palette,
      accentHex: style.palette.accent,
      lightOverride: LIGHT_BY_STYLE[style.id] || '',
      designContrast: true,
      designBrief: [
        designBrief(style.id, currentRoomKey, SOURCE_LAYOUT[sourcePath]?.[currentRoomKey] || ''),
        'WINDOW LOCK — keep every window’s exact width, height, number of panes and mullions. Curtains frame each window and leave its full glazed width visible.',
        openings?.windows?.[0]?.bbox
          ? `WINDOW BBOX — the main window occupies the frame box [top ${openings.windows[0].bbox[0]}, left ${openings.windows[0].bbox[1]}, bottom ${openings.windows[0].bbox[2]}, right ${openings.windows[0].bbox[3]}] on the 0–1000 grid. Keep its width and height identical.`
          : '',
      ].filter(Boolean).join('\n'),
    });
    fs.writeFileSync(path.join(OUT, `${style.id}.prompt.txt`), prompt, 'utf8');

    const aspect = snapAspect(width, height, modelCaps('black-forest-labs/flux-3-image').aspects);
    const out = await generateRender({
      prompt,
      sourceImageB64: srcUrl,
      referenceImagesB64: [],
      aspectRatio: aspect,
      model: 'black-forest-labs/flux-3-image',
    });

    const outBuf = Buffer.from(out.b64, 'base64');
    const ext = detectImageExt(outBuf);
    const fileName = `style-${style.id}.${ext === 'jpeg' ? 'jpg' : ext}`;
    const distPath = path.join(process.cwd(), 'web', 'dist', 'images', fileName);
    const publicPath = path.join(process.cwd(), 'web', 'public', 'images', fileName);
    fs.writeFileSync(distPath, outBuf);
    fs.writeFileSync(publicPath, outBuf);

    row.file = fileName;
    row.out_px = imageSize(outBuf);
    row.cost = (openings?.cost || 0) + (out.cost || 0);
    row.total_cost = row.cost;
    row.ms = Date.now() - started;
    row.ok = true;
    totalCost += row.cost;
    console.log(`[${n}/${styles.length}] OK ${style.id} · ${style.display_name} · ${row.cost.toFixed(4)}$ · ${fileName}`);
  } catch (e) {
    row.ok = false;
    row.error = String(e.message || e).slice(0, 500);
    row.ms = Date.now() - started;
    console.log(`[${n}/${styles.length}] FAIL ${style.id} · ${row.error}`);
  }
  report.push(row);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ model: 'black-forest-labs/flux-3-image', rooms: roomKeys, source: sourceOverride || null, total_cost: totalCost, total_ms: Date.now() - t0, items: report }, null, 2));
}

console.log(`\nDONE: ${report.filter(r => r.ok).length}/${styles.length} ok, cost $${totalCost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
