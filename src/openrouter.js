// Клиент OpenRouter: рендер через Image API, разбор рендера через chat/completions (vision).
// Документация: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Если задан HTTPS_PROXY/S3-прокси — гоним через него (нативный fetch env-прокси не читает).

const BASE = 'https://openrouter.ai/api/v1';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
if (proxyUrl) {
  const { setGlobalDispatcher, ProxyAgent } = await import('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[openrouter] используется прокси: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`);
}

export const MOCK_MODE = !process.env.OPENROUTER_API_KEY;

const RENDER_MODEL = process.env.RENDER_MODEL || 'google/gemini-3.1-flash-image-preview';
const RENDER_MODEL_FALLBACK = process.env.RENDER_MODEL_FALLBACK || ''; // один ретрай на ней при падении основной
const VISION_MODEL = process.env.VISION_MODEL || 'google/gemini-3-flash-preview';
const HTTP_REFERER = process.env.APP_URL || 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 120_000);
export const MAX_REFERENCES = 4; // сколько референсов товаров передаём в генерацию (проверяй supported_parameters модели)

// --- логирование: json-строки для юнит-экономики и отладки ---
export function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': HTTP_REFERER,
    'X-Title': 'remontvision',
  };
}

// fetch с таймаутом и экспоненциальным бэкоффом. 4xx (кроме 429) не повторяем.
async function fetchWithRetry(url, options = {}, { retries = 2, timeoutMs = TIMEOUT_MS } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      if (r.ok) return r;
      const body = (await r.text()).slice(0, 300);
      lastErr = new Error(`${url}: ${r.status} ${body}`);
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? new Error(`${url}: timeout ${timeoutMs}ms`) : e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt); // 1 с, 2 с
    attempt++;
  }
  throw lastErr;
}

export async function listImageModels() {
  if (MOCK_MODE) return { mock: true, models: [] };
  const r = await fetch(`${BASE}/images/models`, { headers: headers() });
  if (!r.ok) throw new Error(`models: ${r.status} ${await r.text()}`);
  const data = await r.json();
  // возвращаем компактный список: slug + поддержка референсов
  return (data.data || data.models || []).map(m => ({
    id: m.id,
    input_refs: Boolean(m.supported_parameters?.input_references),
  }));
}

// Проверка конфига при старте: неверный slug рендер-модели = каждый рендер жжёт 502.
// Падаем с понятной ошибкой ДО приёма трафика. Vision-модель сверяем мягко (предупреждение).
export async function assertConfig() {
  if (MOCK_MODE) return;
  const models = await listImageModels();
  const render = models.find(m => m.id === RENDER_MODEL);
  if (!render) {
    throw new Error(
      `RENDER_MODEL="${RENDER_MODEL}" нет в списке image-моделей OpenRouter (получено ${models.length} шт.). ` +
      `Проверьте slug: curl https://openrouter.ai/api/v1/images/models -H "Authorization: Bearer $OPENROUTER_API_KEY" ` +
      `либо откройте GET /api/models у приложения.`
    );
  }
  if (!render.input_refs) {
    log({ event: 'config_warning', msg: `модель ${RENDER_MODEL} не поддерживает input_references — референсы товаров в генерацию не уйдут` });
  }
  try {
    const r = await fetchWithRetry(`${BASE}/models`, { headers: headers() }, { retries: 1, timeoutMs: 15_000 });
    const data = await r.json();
    const ids = (data.data || []).map(m => m.id);
    if (!ids.includes(VISION_MODEL)) {
      log({ event: 'config_warning', msg: `VISION_MODEL="${VISION_MODEL}" не найдена среди chat-моделей — этап разбора рендера будет падать` });
    }
  } catch (e) {
    log({ event: 'config_warning', msg: `не удалось сверить VISION_MODEL: ${String(e.message || e).slice(0, 200)}` });
  }
  log({ event: 'config_ok', render_model: RENDER_MODEL, render_fallback: RENDER_MODEL_FALLBACK || null, vision_model: VISION_MODEL });
}

const STYLES = {
  'Современный': 'modern minimalist interior, handleless matte cabinets, warm LED lighting, large-format porcelain tile',
  'Светлый':     'bright airy interior, white and light wood palette, lots of natural light, scandinavian',
  'Тёмный':      'moody dark interior, deep graphite and walnut, accent warm lighting, premium hotel feel',
  'Классика':    'classic interior, elegant moldings, warm wood, brass details, timeless',
};

export function buildPrompt({ style, budget, requestText, iteration, products }) {
  const styleDesc = STYLES[style] || STYLES['Современный'];
  const keep = 'CRITICAL: keep the exact same camera angle, walls positions, window and door openings. Do not change the room geometry or layout. Photorealistic professional interior photography.';
  if (iteration) {
    return `${keep} Apply ONLY this change to the interior: "${requestText}". Keep everything else exactly as in the source image.`;
  }
  // новое ядро: рисуем ИЗ товаров каталога — их фото уходят референсами (input_references)
  if (products?.length) {
    const list = products.map((p, i) => `${i + 1}) ${p.name} — use for ${p.category}`).join('; ');
    return `${keep} Redesign this room in ${styleDesc} style. Use EXACTLY these specific products in the interior (reference photos attached): ${list}. Keep the listed products visually recognizable in the result. Materials budget context ~${budget} thousand RUB.`;
  }
  return `${keep} Redesign this room in ${styleDesc} style. Materials and furniture for a total materials budget around ${budget} thousand RUB. Realistic materials, believable lighting.`;
}

// OpenRouter принимает только фиксированные пропорции — подбираем ближайшую к реальному фото.
const ASPECTS = [[1, 1], [3, 2], [2, 3], [4, 3], [3, 4], [16, 9], [9, 16]];
export function snapAspect(width, height) {
  if (!width || !height) return '3:2';
  const r = Math.log(width / height);
  let best = '3:2', bestD = Infinity;
  for (const [w, h] of ASPECTS) {
    const d = Math.abs(r - Math.log(w / h));
    if (d < bestD) { bestD = d; best = `${w}:${h}`; }
  }
  return best;
}

// Референсы товаров: до MAX_REFERENCES изображений из каталога (если у товара есть картинка).
// У демо-каталога картинок нет — поле оставлено на будущее, подписано в README.
export async function generateRender({ prompt, sourceImageB64, referenceImagesB64 = [], aspectRatio }) {
  const models = RENDER_MODEL_FALLBACK ? [RENDER_MODEL, RENDER_MODEL_FALLBACK] : [RENDER_MODEL];
  let lastErr, spent = 0; // суммируем затраты по всем попыткам (падение после начала генерации тоже стоит денег)
  for (const model of models) {
    try {
      const out = await generateWithModel(model, { prompt, sourceImageB64, referenceImagesB64, aspectRatio });
      return { ...out, cost: out.cost != null ? out.cost + spent : (spent || null) };
    } catch (e) {
      lastErr = e;
      if (typeof e.cost === 'number') spent += e.cost;
      log({ event: 'render_fallback', model, error: String(e.message || e).slice(0, 300) });
    }
  }
  throw lastErr || new Error('generation failed');
}

async function generateWithModel(model, { prompt, sourceImageB64, referenceImagesB64, aspectRatio }) {
  const body = {
    model,
    prompt,
    aspect_ratio: aspectRatio || '3:2',
    ...(referenceImagesB64.length
      ? { input_references: referenceImagesB64.map(b => ({ type: 'image_url', image_url: { url: b } })) }
      : {}),
  };

  // Вариант A: chat/completions с модальностью image (Nano Banana работает так:
  // принимает image_url в messages и возвращает картинку в message.images).
  const chatBody = {
    model,
    messages: [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: sourceImageB64 } },
        ...referenceImagesB64.map(b => ({ type: 'image_url', image_url: { url: b } })),
      ]},
    ],
    modalities: ['image', 'text'],
  };

  let lastErr;
  for (const [endpoint, payload] of [[`${BASE}/chat/completions`, chatBody], [`${BASE}/images`, body]]) {
    try {
      const r = await fetchWithRetry(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      const data = await r.json();
      const b64out =
        data.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/base64,(.+)$/)?.[1] ||
        data.data?.[0]?.b64_json;
      if (!b64out) {
        lastErr = new Error(`${endpoint}: нет картинки в ответе`);
        if (typeof data.usage?.cost === 'number') lastErr.cost = data.usage.cost; // генерация была оплачена, результата нет
        continue;
      }
      return { b64: b64out, cost: data.usage?.cost ?? null, model };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('generation failed');
}

// Vision: читаем готовый рендер и достаём список материалов/предметов для матчинга.
// Возвращает { items, cost } — cost нужен для полной себестоимости рендера.
export async function parseRender(renderB64) {
  const sys = `Ты — анализатор интерьерных рендеров. Посмотри на картинку и верни JSON-массив материалов и предметов отделки, которые видны: пол, стены, фартук, столешница, смеситель, свет, розетки/выключатели, фасады. Для каждого: {"category": одно из tile|paint|countertop|faucet|light|outlets|cabinet, "description": краткое описание на русском, "keywords": [3-5 ключевых слов]}. Только реальные отделочные материалы и сантехника/свет/электрика, без мебели-декора и растений. Только JSON, без текста вокруг.`;
  const r = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: [
          { type: 'text', text: 'Список материалов с картинки:' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${renderB64}` } },
        ]},
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content || '[]';
  const parsed = JSON.parse(txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '[]');
  return { items: Array.isArray(parsed) ? parsed : (parsed.items || []), cost: data.usage?.cost ?? null };
}

// Простой матчинг: пересечение ключевых слов с каталогом. v2 — эмбеддинги.
export function matchCatalog(items, products) {
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
  const results = [];
  for (const it of items.slice(0, 12)) {
    const words = [...(it.keywords || []), it.description || '', it.category || ''].map(norm);
    let best = null, bestScore = 0;
    for (const p of products) {
      if (p.category !== it.category) continue;
      const pwords = norm(p.keywords).split(',').map(w => w.trim());
      const score = pwords.filter(w => w && words.some(x => x.includes(w) || w.includes(x))).length / Math.max(pwords.length, 1);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 0.34) results.push({ product: best, score: bestScore });
  }
  // дедуп по товару, максимальный скор
  const seen = new Map();
  for (const r of results) if (!seen.has(r.product.id) || seen.get(r.product.id).score < r.score) seen.set(r.product.id, r);
  return [...seen.values()];
}
