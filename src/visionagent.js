// MCP-агент подбора товаров: смотрит рендер и вызывает инструменты каталога.
// Живёт в app-контейнере, потому что OpenRouter ходит через рабочий прокси приложения.
import { proxyFetch } from './proxy.js';
import { listCatalogCategories, searchCatalogText, getCatalogOffer } from './catalogclient.js';

const BASE = process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1';
const MODEL = process.env.AGENT_MODEL || process.env.SEARCH_VISION_MODEL || 'deepseek/deepseek-v4.1-flash-1017';
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 300_000);

const SYSTEM = `Ты — агент подбора реальных товаров по фото интерьера. У тебя есть инструменты каталога Hoff.
Порядок работы:
1. Посмотри фото и определи комнату (type, style, lighting, walls, floor, ceiling) и ВСЕ видимые товары.
2. Для КАЖДОГО товара ОБЯЗАТЕЛЬНО вызови search_offers с категорией и/или query, цветом, материалом, типом.
3. Посмотри на реальные названия и params в выдаче. Если категория/тип/цвет не совпадают с предметом — вызови resolve_category или list_categories и поищи снова. Не оставляй заведомо неверную категорию.
4. Если в категории 0 товаров — так и напиши, не подставляй товары из других категорий.
5. Не дублируй один и тот же предмет. Одинаковые предметы с разными bbox — разные экземпляры.
6. В финале верни СТРОГО JSON:
{"room": {"type":"...","style":"...","lighting":"...","walls":{"color":"...","material":"...","pattern":"..."},"floor":{"type":"...","color":"...","pattern":"..."},"ceiling":{"type":"...","color":"..."}},
 "items": [{"label":"...","category":"...","search_query":"...","offer_ids":["..."],"why":"..."}]}
offer_ids — только id из вызовов инструментов. Не выдумывай товары и id.
Описывай все видимые детали: опоры, ручки, ящики/двери, обивку/изголовье, материал, цвет.
Все текстовые поля для пользователя — строго на русском.
Финальный ответ — только JSON.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Список категорий каталога (ключ и русское название).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_offers',
      description: 'Поиск реальных товаров в каталоге по категории, ключевым словам и атрибутам.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Ключевые слова: тип, опоры, материал, цвет' },
          category: { type: 'string', description: 'Ключ категории, например bed, sofa, cabinet' },
          color: { type: 'string' },
          material: { type: 'string' },
          product_type: { type: 'string' },
          size: { type: 'string' },
          top_k: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_offer',
      description: 'Карточка конкретного товара по offer_id.',
      parameters: { type: 'object', properties: { offer_id: { type: 'string' } }, required: ['offer_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_category',
      description: 'Сопоставить свободное название категории с ключом каталога.',
      parameters: { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    },
  },
];

const compactParams = params => Object.fromEntries(
  ['Цвет', 'Материал', 'Тип обивки', 'Ширина', 'Длина', 'Высота', 'Глубина']
    .filter(key => params?.[key])
    .map(key => [key, params[key]]),
);

async function dispatch(name, args = {}) {
  if (name === 'list_categories') return listCatalogCategories();
  if (name === 'search_offers') {
    const query = String(args.query || '').trim();
    const category = String(args.category || '').trim();
    const { results } = await searchCatalogText({
      query,
      filters: category ? { categories: [category] } : {},
      product: {
        label: query || undefined,
        color: args.color || undefined,
        material: args.material || undefined,
        product_type: args.product_type || undefined,
        size: args.size || undefined,
        category: category || undefined,
      },
      topK: Math.max(1, Math.min(20, Number(args.top_k) || 5)),
    });
    return (results || []).map(item => ({
      offer_id: item.offer_id,
      name: item.name,
      category: item.category,
      price: item.price,
      availability: item.availability,
      params: compactParams(item.params),
      score: item.score,
    }));
  }
  if (name === 'get_offer') {
    const offer = await getCatalogOffer(String(args.offer_id || ''));
    if (!offer) return { error: 'Не найдено' };
    return {
      offer_id: offer.id,
      name: offer.name,
      category: offer.category,
      price: offer.price,
      currency: offer.currency,
      availability: offer.availability,
      picture_url: offer.picture_url,
      canonical_url: offer.canonical_url,
      affiliate_url: offer.affiliate_url,
      erid: offer.erid,
      params: compactParams(offer.params),
    };
  }
  if (name === 'resolve_category') {
    const label = String(args.label || '').toLowerCase();
    const categories = await listCatalogCategories();
    const found = categories.find(item => String(item.label || '').toLowerCase().includes(label) || label.includes(String(item.key || '').toLowerCase()));
    return found || { key: null, label: null };
  }
  throw new Error(`Неизвестный инструмент: ${name}`);
}

async function chat(messages, { useTools = true, forceJson = false } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY не задан');
  const body = { model: MODEL, messages, temperature: 0 };
  if (useTools) { body.tools = TOOLS; body.tool_choice = 'auto'; }
  if (forceJson) body.response_format = { type: 'json_object' };
  const response = await proxyFetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message || {};
}

export async function runVisionAgent({ image, mime = 'image/jpeg', roomType = '', style = '', topK = 5, maxSteps = 10 } = {}) {
  if (!image) throw new Error('Нужна картинка рендера');
  const imageUrl = `data:${mime};base64,${Buffer.from(image).toString('base64')}`;
  const context = [roomType ? `Тип комнаты: ${roomType}.` : '', style ? `Стиль: ${style}.` : ''].filter(Boolean).join(' ');
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        { type: 'text', text: `${context} Подбери товары по фото. Верни до 20 предметов, top_k=${topK}.` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];
  let final = '';
  const steps = Math.max(1, Math.min(14, Number(maxSteps) || 10));
  for (let step = 0; step < steps; step++) {
    const message = await chat(messages);
    messages.push(message);
    const calls = message.tool_calls || [];
    if (!calls.length) { final = String(message.content || ''); break; }
    for (const call of calls) {
      const fn = call.function || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }
      let payload;
      try {
        payload = JSON.stringify(await dispatch(fn.name, args)).slice(0, 12000);
      } catch (e) {
        payload = JSON.stringify({ error: String(e.message || e).slice(0, 300) });
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: payload });
    }
  }
  if (!final) {
    messages.push({ role: 'user', content: 'Поиск завершён. Верни финальный JSON строго по схеме из системного сообщения, без вызова инструментов.' });
    const message = await chat(messages, { useTools: false, forceJson: true });
    final = String(message.content || '');
  }
  const match = final.match(/\{[\s\S]*\}/);
  if (!match) return { room: {}, items: [], raw: final };
  try {
    const parsed = JSON.parse(match[0]);
    return { room: parsed.room || {}, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { room: {}, items: [], raw: final };
  }
}
