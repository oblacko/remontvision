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

let INPUT_REFS_OK = true;
export const supportsInputRefs = () => INPUT_REFS_OK;

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
  INPUT_REFS_OK = Boolean(render.input_refs);
  if (!INPUT_REFS_OK) {
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
  'Скандинавский': 'scandinavian interior, light oak, white walls, linen, soft natural light, functional minimalism',
  'Лофт': 'industrial loft, exposed concrete or brick, black metal, warm wood, large windows',
  'Джапанди': 'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette',
  'Неоклассика': 'neoclassical interior, elegant wall moldings, warm neutrals, subtle brass, timeless',
  'Минимализм': 'minimalist interior, clean lines, neutral palette, hidden storage, soft lighting',
  'Тёмный модерн': 'dark modern interior, graphite and walnut, moody lighting, premium materials',
  'Бохо': 'bohemian interior, layered textiles, rattan, plants, warm earthy colors',
  'Ар-деко': 'art deco interior, brass, velvet, geometric patterns, rich jewel tones',
  'Кантри': 'country interior, natural wood, cozy textiles, warm rustic details',
  'Референс пользователя': 'the uploaded style reference',
};

const PALETTES = {
  mono: 'monochrome palette',
  analogous: 'analogous color palette',
  complementary: 'complementary color accents',
  split: 'split-complementary color accents',
};
const ACCENTS = {
  forest: 'olive green',
  sand: 'sandy beige',
  terra: 'terracotta',
  dust: 'dusty blue',
  graphite: 'graphite',
};

export function buildPrompt({ style, budget, requestText, iteration, products, palette = 'none', accent = 'none', hasStyleRef = false }) {
  const styleDesc = hasStyleRef ? 'the uploaded style reference' : (STYLES[style] || STYLES['Современный']);
  const keep = 'CRITICAL: keep the exact same camera angle, walls positions, window and door openings. Do not change the room geometry or layout. Photorealistic professional interior photography.';
  if (iteration) {
    return `${keep} Apply ONLY this change to the interior: "${requestText}". Keep everything else exactly as in the source image.`;
  }
  const extras = [
    PALETTES[palette] ? `Color scheme: ${PALETTES[palette]}.` : '',
    ACCENTS[accent] ? `Accent color: ${ACCENTS[accent]}.` : '',
    hasStyleRef ? 'Use the uploaded style reference for mood, materials and palette; do not copy its room layout.' : '',
  ].filter(Boolean).join(' ');
  // новое ядро: рисуем ИЗ товаров каталога — их фото уходят референсами (input_references)
  if (products?.length) {
    const hasRefs = products.some(p => p.image_path || p.image_url);
    const list = products.map((p, i) => {
      const attrs = Object.entries(p.attrs || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      return `${i + 1}) ${p.name}${p.brand ? ` (${p.brand})` : ''} — ${p.category}${attrs ? ` [${attrs}]` : ''}`;
    }).join('; ');
    return `${keep} Redesign this room in ${styleDesc} style. ${extras} Use EXACTLY these specific products in the interior${hasRefs ? ' (reference photos attached)' : ''}: ${list}. Match the specified colors and materials; do not substitute unrelated products. Keep the listed products visually recognizable in the result. Materials budget context ~${budget} thousand RUB.`;
  }
  return `${keep} Redesign this room in ${styleDesc} style. ${extras} Materials and furniture for a total materials budget around ${budget} thousand RUB. Realistic materials, believable lighting.`;
}

// OpenRouter принимает только фиксированные пропорции — подбираем ближайшую к реальному фото.
// Только значения, которые принимает провайдер (иначе 400 invalid_value).
const ASPECTS = [
  [1, 1], [1, 4], [1, 8], [2, 3], [3, 2], [3, 4], [4, 1], [4, 3],
  [4, 5], [5, 4], [8, 1], [9, 16], [16, 9],
];
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

// Один рендер = максимум два внешних вызова: Image API, затем chat-фолбэк.
// Без retry-каскада и без второй модели: неизвестный timeout не повторяем автоматически.
export async function generateRender({ prompt, sourceImageB64, referenceImagesB64 = [], aspectRatio }) {
  return generateWithModel(RENDER_MODEL, { prompt, sourceImageB64, referenceImagesB64, aspectRatio });
}

async function generateWithModel(model, { prompt, sourceImageB64, referenceImagesB64, aspectRatio }) {
  const productRefs = INPUT_REFS_OK ? referenceImagesB64 : [];
  // Исходное фото комнаты — первый обязательный reference в основном Image API.
  const refs = [
    { type: 'image_url', image_url: { url: sourceImageB64 } },
    ...productRefs.map(b => ({ type: 'image_url', image_url: { url: b } })),
  ];
  const body = {
    model,
    prompt,
    aspect_ratio: aspectRatio || '3:2',
    input_references: refs,
  };

  const chatBody = {
    model,
    messages: [
      { role: 'user', content: [
        { type: 'text', text: prompt },
        ...refs.map(r => ({ type: 'image_url', image_url: r.image_url })),
      ]},
    ],
    modalities: ['image', 'text'],
    image_config: { aspect_ratio: aspectRatio || '3:2' },
  };

  let lastErr, spent = 0;
  for (const [attempt, [endpoint, payload]] of [[`${BASE}/images`, body], [`${BASE}/chat/completions`, chatBody]].entries()) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(150_000),
      });
      const data = await r.json().catch(() => ({}));
      const cost = typeof data.usage?.cost === 'number' ? data.usage.cost : 0;
      spent += cost;
      if (!r.ok) {
        lastErr = new Error(`${endpoint} ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
        lastErr.cost = cost;
        log({ event: 'render_attempt_error', model, endpoint, attempt: attempt + 1, status: r.status, cost_usd: cost || null });
        continue;
      }
      const b64out =
        data.choices?.[0]?.message?.images?.[0]?.image_url?.url?.match(/base64,(.+)$/)?.[1] ||
        data.data?.[0]?.b64_json;
      if (!b64out) {
        lastErr = new Error(`${endpoint}: нет картинки в ответе`);
        lastErr.cost = cost;
        log({ event: 'render_no_image', model, endpoint, attempt: attempt + 1, cost_usd: cost || null });
        continue;
      }
      log({
        event: 'render_endpoint',
        model,
        endpoint,
        attempt: attempt + 1,
        aspect_ratio: aspectRatio || '3:2',
        refs: refs.length,
        cost_usd: spent || null,
      });
      return { b64: b64out, cost: spent || null, model, endpoint, refs: refs.length, attempts: attempt + 1 };
    } catch (e) {
      lastErr = e;
      log({ event: 'render_attempt_error', model, endpoint, attempt: attempt + 1, error: String(e.message || e).slice(0, 300) });
    }
  }
  if (lastErr) lastErr.cost = spent || lastErr.cost;
  throw lastErr || new Error('generation failed');
}

// Vision: читаем готовый рендер и достаём список материалов/предметов для матчинга.
// Возвращает { items, cost } — cost нужен для полной себестоимости рендера.
export async function parseRender(renderB64, mime = 'image/png') {
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
          { type: 'image_url', image_url: { url: `data:${mime};base64,${renderB64}` } },
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

// Простой матчинг: ключевые слова + штраф за несовпадение цвета. v2 — эмбеддинги.
const COLOR_HINTS = {
  'белый': ['бел', 'светл'],
  'бежевый': ['беж', 'светл'],
  'серый': ['сер', 'камен'],
  'грейдж': ['грейдж', 'сер', 'камен'],
  'графит': ['графит', 'темн', 'черн'],
  'черный': ['черн', 'темн'],
  'темный': ['темн', 'графит', 'черн'],
  'светлый': ['светл', 'бел', 'беж'],
  'антрацит': ['антрацит', 'темн', 'черн'],
  'латунь': ['латун', 'золот', 'brass'],
  'золотой': ['золот', 'латун'],
  'хром': ['хром', 'серебр'],
  'сталь': ['стал', 'серебр'],
  'дерево': ['дерев', 'древес'],
  'коричневый': ['корич', 'дерев', 'орех'],
  'орех': ['орех', 'корич', 'дерев'],
};

export function matchCatalog(items, products) {
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
  const results = [];
  for (const it of items.slice(0, 12)) {
    const words = [...(it.keywords || []), it.description || '', it.category || ''].map(norm);
    const text = words.join(' ');
    let best = null, bestScore = 0;
    for (const p of products) {
      if (p.category !== it.category) continue;
      const pwords = norm(p.keywords).split(',').map(w => w.trim());
      let score = pwords.filter(w => w && words.some(x => x.includes(w) || w.includes(x))).length / Math.max(pwords.length, 1);
      const color = norm((p.attrs || {})['цвет'] || '').split(/[ ,/]+/)[0];
      const hints = COLOR_HINTS[color] || (color ? [color] : []);
      if (hints.length && !hints.some(h => text.includes(h))) score *= 0.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best && bestScore >= 0.34) results.push({ product: best, score: bestScore });
  }
  // дедуп по товару, максимальный скор
  const seen = new Map();
  for (const r of results) if (!seen.has(r.product.id) || seen.get(r.product.id).score < r.score) seen.set(r.product.id, r);
  return [...seen.values()];
}
