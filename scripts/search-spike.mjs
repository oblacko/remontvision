// Throwaway spike: live grid generation + optional Yandex image search.
// Запуск: node --env-file=.env scripts/search-spike.mjs            # только grid
//         node --env-file=.env scripts/search-spike.mjs <фото>     # Yandex (нужны ключи)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const OPENROUTER_IMAGES = 'https://openrouter.ai/api/v1/images';
const YANDEX_IMAGE_SEARCH = 'https://searchapi.api.cloud.yandex.net/v2/image/search_by_image';
const MODEL = process.env.SEARCH_GRID_MODEL || 'black-forest-labs/flux-3-image-klein';
const ASPECT = '21:9';
const RESOLUTION = '1K';
const OUT_DIR = path.join(process.cwd(), '.superpowers', 'sdd', '2026-11-01-search-lab');
const GRID_PATH = path.join(OUT_DIR, 'grid.png');
const FIXTURE_PATH = path.join(process.cwd(), 'test', 'fixtures', 'search_by_image.json');

const GRID_PROMPT = [
  'A clean 2 by 5 grid (2 rows, 5 columns, exactly 10 equal cells) of isolated furniture and home-decor items on a pure white background.',
  'One object per cell, centered, fully visible and not cropped, consistent studio scale and soft lighting.',
  'Even white gutters between all cells, no shadows crossing cell borders, no borders or frames.',
  'No text, no labels, no numbers, no watermarks, no logos.',
].join(' ');

function extractBase64(data) {
  const direct = data?.data?.[0]?.b64_json;
  if (direct) return direct;
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (url) return url.match(/^data:[^;]+;base64,(.+)$/)?.[1] || null;
  return null;
}

export async function spikeGrid() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Нет OPENROUTER_API_KEY. Запускайте: node --env-file=.env scripts/search-spike.mjs');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[grid] model=${MODEL} aspect=${ASPECT} resolution=${RESOLUTION}`);

  const started = Date.now();
  const response = await fetch(OPENROUTER_IMAGES, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://www.remontvision.ru',
      'X-Title': 'remontvision-search-spike',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: GRID_PROMPT,
      aspect_ratio: ASPECT,
      resolution: RESOLUTION,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);

  const b64 = extractBase64(data);
  if (!b64) throw new Error(`Нет картинки в ответе: ${Object.keys(data).join(', ')}`);

  const raw = Buffer.from(b64, 'base64');
  const png = await sharp(raw, { failOn: 'none' }).png().toBuffer();
  fs.writeFileSync(GRID_PATH, png);
  const meta = await sharp(png).metadata();

  const result = {
    ok: true,
    path: path.relative(process.cwd(), GRID_PATH),
    bytes: png.length,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    cost_usd: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
    ms: Date.now() - started,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export async function spikeYandex(photoPath) {
  const apiKey = process.env.YANDEX_SEARCH_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folderId) {
    console.error('[yandex] пропуск: не заданы YANDEX_SEARCH_API_KEY/YANDEX_FOLDER_ID. Живой вызов не выполнялся.');
    return { ok: false, skipped: true, reason: 'missing_credentials' };
  }
  if (!photoPath) {
    console.error('[yandex] пропуск: укажите путь к фото аргументом.');
    return { ok: false, skipped: true, reason: 'missing_photo' };
  }
  const abs = path.resolve(photoPath);
  if (!fs.existsSync(abs)) {
    console.error(`[yandex] файл не найден: ${abs}`);
    return { ok: false, skipped: true, reason: 'missing_file' };
  }

  const data = fs.readFileSync(abs).toString('base64');
  console.log(`[yandex] photo=${path.relative(process.cwd(), abs)} bytes=${Buffer.byteLength(data, 'base64')}`);

  const response = await fetch(YANDEX_IMAGE_SEARCH, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      folder_id: folderId,
      data,
      page: '0',
      family_mode: 'FAMILY_MODE_MODERATE',
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Yandex ${response.status}: ${text.slice(0, 500)}`);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Yandex: некорректный JSON ${text.slice(0, 300)}`);
  }

  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(json, null, 2)}\n`);

  const images = Array.isArray(json.images) ? json.images : [];
  console.log(`[yandex] images.length=${images.length} page=${json.page ?? '?'} id=${json.id ?? '?'}`);
  for (const image of images.slice(0, 3)) {
    console.log(JSON.stringify({
      url: image.url,
      host: image.host,
      format: image.format,
      width: image.width,
      height: image.height,
      page_url: image.page_url,
      page_title: image.page_title,
      passage: image.passage,
    }));
  }
  console.log(`[yandex] fixture=${path.relative(process.cwd(), FIXTURE_PATH)}`);
  return { ok: true, images: images.length, path: FIXTURE_PATH };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const photoPath = process.argv[2];
  try {
    if (photoPath) await spikeYandex(photoPath);
    else await spikeGrid();
    process.exit(0);
  } catch (e) {
    console.error(`[spike] ошибка: ${e.message}`);
    process.exit(1);
  }
}
