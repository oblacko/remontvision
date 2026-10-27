// Генерация референсных картинок каталога через OpenRouter Image API.
// Запуск: node --env-file=.env scripts/generate-catalog-images.mjs
// Файлы кладутся в public/catalog/<slug>.webp и коммитятся в репозиторий.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SEED = path.join(ROOT, 'catalog', 'seed.json');
const OUT = path.join(ROOT, 'public', 'catalog');
const MODEL = process.env.CATALOG_IMAGE_MODEL || 'bytedance-seed/seedream-5-0-flash';
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.CATALOG_IMAGE_CONCURRENCY || 3)));
const API = 'https://openrouter.ai/api/v1/images';

if (!process.env.OPENROUTER_API_KEY) {
  console.error('Нет OPENROUTER_API_KEY. Запускайте: node --env-file=.env scripts/generate-catalog-images.mjs');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const items = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const pending = items.filter(item => item.image && !fs.existsSync(path.join(OUT, item.image)));
console.log(`[catalog-images] всего ${items.length}, сгенерировать ${pending.length}, модель ${MODEL}, параллельно ${CONCURRENCY}`);

let done = 0;
let spent = 0;

async function generate(item, attempt = 1) {
  const body = {
    model: MODEL,
    prompt: item.image_prompt,
    aspect_ratio: '1:1',
    resolution: '1K',
  };
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://www.remontvision.ru',
      'X-Title': 'remontvision-catalog',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await r.json().catch(() => ({}));
  spent += typeof data.usage?.cost === 'number' ? data.usage.cost : 0;
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const b64 = data.data?.[0]?.b64_json ||
    data.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/base64,(.+)$/)?.[1];
  if (!b64) throw new Error('нет картинки в ответе');
  const raw = Buffer.from(b64, 'base64');
  const webp = await sharp(raw, { failOn: 'none' })
    .resize(1024, 1024, { fit: 'cover' })
    .webp({ quality: 88 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, item.image), webp);
  done++;
  console.log(`[catalog-images] ${done}/${pending.length} ${item.image} ${Math.round(webp.length / 1024)} КБ`);
}

async function withRetry(item) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await generate(item, attempt); }
    catch (e) {
      console.error(`[catalog-images] ${item.image} попытка ${attempt}: ${String(e.message || e).slice(0, 240)}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(`${item.image}: не сгенерировано`);
}

let cursor = 0;
const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
  while (cursor < pending.length) {
    const item = pending[cursor++];
    await withRetry(item);
  }
});

try {
  await Promise.all(workers);
  console.log(`[catalog-images] готово, потрачено ~$${spent.toFixed(3)}`);
} catch (e) {
  console.error(`[catalog-images] ошибка: ${e.message}`);
  process.exit(1);
}
