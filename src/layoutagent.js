// Архитектор-планировщик: видит комнату и предлагает расстановку мебели,
// зоны и проходы. Результат вставляется в промт блоком LAYOUT PLAN.
import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';
import { normalizeLayoutPlan } from './agentcontracts.js';
import { styleById, conceptById } from './designdata.js';

export const LAYOUT_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.LAYOUT_PLAN_ENABLED ?? 'true'));

const LAYOUT_MODEL = process.env.LAYOUT_MODEL || process.env.DIRECTION_MODEL || process.env.ART_DIRECTOR_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

const LAYOUT_SCHEMA = `Обязательный контракт layout_plan (не удалять при редактировании промта):
{"strategy":"...","zones":[{"name":"...","purpose":"...","position":"..."}],"items":[{"type":"desk","label":"...","position":"...","size_cm":"...","priority":1}],"circulation":"...","focal_point":"...","avoid":["..."]}
Только JSON.`;

function dimensionsText(dimensions) {
  if (!dimensions) return 'Размеры не заданы — оцени масштаб по фото.';
  const parts = [dimensions.width, dimensions.length, dimensions.height].map(value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? String(Math.round(number * 10) / 10) : '';
  });
  if (!parts.every(Boolean)) return 'Размеры не заданы — оцени масштаб по фото.';
  return `Размеры комнаты: ${parts.join(' × ')} м.`;
}

export function composeLayoutPrompt({
  roomType = 'Другое',
  dimensions = null,
  style = '',
  concept = '',
  usedStrategies = [],
  keepFurniture = false,
} = {}) {
  const styleCard = styleById(style);
  const conceptCard = concept ? conceptById(concept) : null;
  const system = `${getArchitectPrompt('layout').system}\n\n${LAYOUT_SCHEMA}`;
  const history = Array.isArray(usedStrategies) && usedStrategies.length
    ? `Не повторяй прошлые планировочные ходы: ${usedStrategies.filter(Boolean).join('; ')}.`
    : '';
  const user = [
    `Тип комнаты: ${roomType || 'Другое'}.`,
    dimensionsText(dimensions),
    styleCard ? `Стиль: ${styleCard.name}. Материалы: ${styleCard.materials}.` : style ? `Стиль: ${style}.` : '',
    conceptCard ? `Концепция: ${conceptCard.name}. Главный ход: ${conceptCard.main_move}.` : '',
    keepFurniture
      ? 'В комнате уже есть мебель: планируй вокруг неё, не добавляй дубли и лишние предметы. Проверь, что существующая расстановка не блокирует проходы 60 см.'
      : 'Комната пустая: спланируй наполнение с нуля.',
    'Жёстко проверь влезаемость: сумма габаритов предметов вдоль одной стены + проход 60 см не должна превышать размер комнаты. Не влезает — убери или уменьши предмет.',
    'Не своди планировку к шаблону «стол + стул + шкаф»; минимум 5 предметов и 2 зоны добавляй только если они влезают.',
    history,
    'Предложи планировку по схеме. Только JSON.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

export function layoutPlanToText(plan) {
  if (!plan) return '';
  const zones = (plan.zones || [])
    .map(zone => `- ${zone.name}${zone.position ? ` (${zone.position})` : ''}: ${zone.purpose}`)
    .join('\n');
  const items = (plan.items || [])
    .map((item, index) => `${index + 1}. ${item.label || item.type}${item.position ? ` — ${item.position}` : ''}${item.size_cm ? `, ${item.size_cm}` : ''}`)
    .join('\n');
  return [
    plan.strategy ? `Layout strategy: ${plan.strategy}` : '',
    zones ? `Zones:\n${zones}` : '',
    items ? `Furniture:\n${items}` : '',
    plan.circulation ? `Circulation: ${plan.circulation}` : '',
    plan.focal_point ? `Focal point: ${plan.focal_point}` : '',
    plan.avoid?.length ? `Avoid: ${plan.avoid.join('; ')}` : '',
    plan.constraints?.length ? `Hard furniture limits:\n${plan.constraints.map(item => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export async function buildLayoutPlan({
  imageDataUrl,
  roomType = 'Другое',
  dimensions = null,
  style = '',
  concept = '',
  usedStrategies = [],
  keepFurniture = false,
  sessionId = null,
} = {}) {
  if (!LAYOUT_ENABLED || !imageDataUrl) return null;
  const { system, user } = composeLayoutPrompt({ roomType, dimensions, style, concept, usedStrategies, keepFurniture });
  let cost = null;
  try {
    const agent = await callAgentJson({
      instructions: system,
      inputText: user,
      images: [imageDataUrl],
      model: LAYOUT_MODEL,
      maxCostUsd: Number(process.env.LAYOUT_MAX_COST_USD || 0.02),
      maxSteps: 2,
      sessionId,
    });
    cost = agent.cost ?? null;
    const plan = normalizeLayoutPlan(agent.parsed);
    if (plan) return { ...plan, cost };
  } catch { /* retry ниже */ }
  try {
    const retry = await callAgentJson({
      instructions: system,
      inputText: user,
      images: [imageDataUrl],
      model: undefined,
      maxCostUsd: Number(process.env.LAYOUT_MAX_COST_USD || 0.02),
      maxSteps: 2,
      sessionId,
    });
    const plan = normalizeLayoutPlan(retry.parsed);
    return plan ? { ...plan, cost: (cost || 0) + (retry.cost || 0) } : null;
  } catch {
    return null;
  }
}
