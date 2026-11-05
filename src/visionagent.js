// MCP-агент подбора товаров на OpenRouter Agent SDK.
// SDK сам крутит tool-loop, тулы — MCP-инструменты каталога.
import { tool } from '@openrouter/agent';
import { z } from 'zod';
import { callAgentWithTools } from './openrouteragent.js';
import { validateSearchResult } from './agentcontracts.js';
import { listCatalogCategories, searchCatalogText, getCatalogOffer } from './catalogclient.js';

const SYSTEM = `Ты — агент подбора реальных товаров по фото интерьера. У тебя есть инструменты каталога Hoff.
Порядок работы:
1. Посмотри фото и определи комнату (type, style, lighting, walls, floor, ceiling) и ВСЕ видимые товары.
2. Для КАЖДОГО товара ОБЯЗАТЕЛЬНО вызови search_offers с категорией и/или query, цветом, материалом, типом.
3. Посмотри на реальные названия и params в выдаче. Если категория/тип/цвет не совпадают — вызови resolve_category или list_categories и поищи снова.
4. Если в категории 0 товаров — так и напиши, не подставляй товары из других категорий.
5. Не дублируй один и тот же предмет. Одинаковые предметы с разными bbox — разные экземпляры.
6. В финале верни СТРОГО JSON:
{"room": {"type":"...","style":"...","lighting":"...","walls":{"color":"...","material":"..."},"floor":{"type":"...","color":"..."},"ceiling":{"type":"...","color":"..."}},
 "items": [{"label":"...","category":"...","search_query":"...","offer_ids":["..."],"why":"..."}]}
offer_ids — только id из вызовов инструментов. Не выдумывай товары и id.
Описывай видимые детали: опоры, ручки, ящики/двери, обивку, материал, цвет.
Все текстовые поля — на русском. Финальный ответ — только JSON.`;

const compactParams = params => Object.fromEntries(
  ['Цвет', 'Материал', 'Тип обивки', 'Ширина', 'Длина', 'Высота', 'Глубина']
    .filter(key => params?.[key])
    .map(key => [key, params[key]]),
);

const searchOffers = tool({
  name: 'search_offers',
  description: 'Поиск реальных товаров в каталоге по категории, ключевым словам и атрибутам.',
  inputSchema: z.object({
    query: z.string().optional().default('').describe('Ключевые слова: тип, опоры, материал, цвет'),
    category: z.string().optional().describe('Ключ категории: bed, sofa, cabinet'),
    color: z.string().optional(),
    material: z.string().optional(),
    product_type: z.string().optional(),
    size: z.string().optional(),
    top_k: z.number().int().min(1).max(20).optional().default(5),
  }),
  execute: async ({ query, category, color, material, product_type, size, top_k }) => {
    const { results } = await searchCatalogText({
      query: query || '',
      filters: category ? { categories: [category] } : {},
      product: {
        label: query || undefined,
        color: color || undefined,
        material: material || undefined,
        product_type: product_type || undefined,
        size: size || undefined,
        category: category || undefined,
      },
      topK: top_k || 5,
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
  },
});

const getOffer = tool({
  name: 'get_offer',
  description: 'Карточка конкретного товара по offer_id.',
  inputSchema: z.object({ offer_id: z.string() }),
  execute: async ({ offer_id }) => {
    const offer = await getCatalogOffer(offer_id);
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
  },
});

const resolveCategory = tool({
  name: 'resolve_category',
  description: 'Сопоставить свободное название категории с ключом каталога.',
  inputSchema: z.object({ label: z.string() }),
  execute: async ({ label }) => {
    const text = String(label || '').toLowerCase();
    const categories = await listCatalogCategories();
    return categories.find(item =>
      String(item.label || '').toLowerCase().includes(text)
      || text.includes(String(item.key || '').toLowerCase()),
    ) || { key: null, label: null };
  },
});

const listCategories = tool({
  name: 'list_categories',
  description: 'Список категорий каталога (ключ и русское название).',
  inputSchema: z.object({}),
  execute: async () => listCatalogCategories(),
});

export async function runVisionAgent({ image, mime = 'image/jpeg', roomType = '', style = '', topK = 5, maxSteps = 8 } = {}) {
  if (!image) throw new Error('Нужна картинка рендера');
  const imageUrl = `data:${mime};base64,${Buffer.from(image).toString('base64')}`;
  const context = [roomType ? `Тип комнаты: ${roomType}.` : '', style ? `Стиль: ${style}.` : ''].filter(Boolean).join(' ');
  const out = await callAgentWithTools({
    instructions: SYSTEM,
    inputText: `${context} Подбери товары по фото. Верни до 20 предметов, top_k=${topK}.`,
    images: [imageUrl],
    tools: [searchOffers, getOffer, resolveCategory, listCategories],
    maxSteps,
    maxCostUsd: Number(process.env.PRODUCT_AGENT_MAX_COST_USD || 0.05),
  });
  const validated = validateSearchResult(out.parsed || {});
  const result = validated || { room: {}, items: [] };
  return {
    room: result.room || {},
    items: Array.isArray(result.items) ? result.items : [],
    usage: out.usage,
    cost: out.cost,
  };
}
