// Архитектор-планировщик v2: координатная расстановка, проверка геометрии
// и честные допущения. Результат вставляется в промт блоком LAYOUT PLAN.
import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';

export const LAYOUT_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.LAYOUT_PLAN_ENABLED ?? 'true'));

const LAYOUT_MODEL = process.env.LAYOUT_MODEL || process.env.DIRECTION_MODEL || process.env.ART_DIRECTOR_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

const cm = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
};

const BRIEFS = {
  'гостиная': '2 пользователя; отдых и просмотр ТВ; обязательны диван, ТВ/медиа и хранение; обеденная зона не обязательна; гостевой сон не нужен.',
  'спальня': '2 пользователя; сон и хранение; обязательны кровать, прикроватные зоны и шкаф; без лишнего декора.',
  'кухня': 'готовка и хранение; обязательны рабочие поверхности, техника и обеденная зона, если она влезает.',
  'детская': 'ребёнок; сон, занятия, игры и хранение; мебель должна адаптироваться по мере взросления.',
  'кабинет': '1–2 пользователя; полноценное рабочее место, хранение и, при месте, чтение/отдых.',
  'санузел': 'сантехника, хранение и доступ к обслуживанию; без лишней мебели.',
  'столовая': 'обеденный стол и посадочные места; проверять каждую занятую сторону и проходы.',
};

// Функциональный бриф комнаты (не зависит от стиля): занятия, обязательные функции, хранение.
// Используется и в промте, и в briefHash кэш-ключа layout.
export const briefForRoom = roomType => {
  const key = Object.keys(BRIEFS).find(name => String(roomType || '').toLowerCase().includes(name));
  return key ? BRIEFS[key] : 'Обязательные функции — по типу помещения; без декора ради количества.';
};

export function composeLayoutPrompt({ roomType = 'Другое', dimensions = null, brief = '', usedStrategies = [], keepFurniture = false } = {}) {
  const width = cm(dimensions?.width);
  const length = cm(dimensions?.length);
  const height = cm(dimensions?.height);
  const dims = width && length
    ? `ширина ${width} см, длина ${length} см, высота ${height || '—'} см (предварительная оценка по фото)`
    : 'размеры не заданы — оцени масштаб по фото и отметь допущения';
  const history = Array.isArray(usedStrategies) && usedStrategies.length
    ? `не повторяй прошлые ходы: ${usedStrategies.filter(Boolean).slice(-5).join('; ')}`
    : 'нет';
  const system = `${getArchitectPrompt('layout').system}`;
  const user = [
    'ВХОДНЫЕ ДАННЫЕ',
    `room: ${roomType}, прямоугольная; ${dims}.`,
    'photos: приложена фотография; направление съёмки — от входа в сторону окна, если не указано иное.',
    'openings_and_obstacles: точные данные не предоставлены — распознай дверь, окно и радиатор по фото; отметь это в assumptions.',
    'utilities: положения розеток и ТВ-подключений неизвестны.',
    `existing_furniture: ${keepFurniture ? 'сохранить видимую мебель; если комната пустая — мебель отсутствует.' : 'комната пустая, мебель отсутствует.'}`,
    `user_brief: ${brief || briefForRoom(roomType)}`,
    'mounting_policy: новые отверстия в стенах и навесная мебель запрещены.',
    `previous_layouts: ${history}.`,
    'Размеры и проёмы — рабочая оценка по фото. Не возвращай needs_input только из-за отсутствия обмерного плана: предложи расстановку и перечисли неподтверждённое в assumptions/validation.unverified.',
    'Верни JSON по схеме.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

const text = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeLayoutPlanV2(parsed = {}) {
  if (!parsed || typeof parsed !== 'object') return null;
  const status = ['needs_input', 'proposed', 'infeasible'].includes(parsed.status) ? parsed.status : 'proposed';
  if (status !== 'proposed') {
    return {
      status,
      strategy: text(parsed.strategy, 500),
      zones: [],
      items: [],
      circulation: '',
      focal_point: '',
      avoid: [],
      constraints: [],
      validation: parsed.validation || null,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(item => text(item, 300)).filter(Boolean) : [],
      missing_inputs: Array.isArray(parsed.missing_inputs) ? parsed.missing_inputs.map(item => text(item, 300)).filter(Boolean) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.map(item => text(item, 300)).filter(Boolean) : [],
    };
  }

  const zones = (Array.isArray(parsed.zones) ? parsed.zones : []).map(zone => ({
    name: text(zone?.name, 120),
    purpose: text(zone?.purpose, 300),
    position: text(zone?.position, 300),
  })).filter(zone => zone.name);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map(item => {
    const width = Number(item?.width_cm);
    const depth = Number(item?.depth_cm);
    return {
      type: text(item?.type, 40) || 'storage',
      label: text(item?.label, 160) || text(item?.type, 40),
      position: text(item?.position, 300),
      size_cm: Number.isFinite(width) && Number.isFinite(depth) ? `${Math.round(width)}x${Math.round(depth)}` : '',
      width_cm: Number.isFinite(width) ? Math.round(width) : null,
      depth_cm: Number.isFinite(depth) ? Math.round(depth) : null,
      height_cm: Number.isFinite(Number(item?.height_cm)) ? Number(item.height_cm) : null,
      rotation_deg: Number.isFinite(Number(item?.rotation_deg)) ? Number(item.rotation_deg) : null,
      priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 2,
      use_clearances: Array.isArray(item?.use_clearances) ? item.use_clearances : [],
    };
  }).filter(item => item.label);

  const validation = parsed.validation || null;
  const constraints = [
    ...(Array.isArray(validation?.conflicts) ? validation.conflicts : []),
    ...(Array.isArray(validation?.unverified) ? validation.unverified : []),
    ...(Array.isArray(validation?.adjustments_made) ? validation.adjustments_made : []),
  ].map(item => text(item, 300)).filter(Boolean);

  return {
    status,
    strategy: text(parsed.strategy, 500),
    zones,
    items,
    circulation: text(parsed.circulation?.description, 500),
    focal_point: text(parsed.focal_point, 240),
    avoid: Array.isArray(parsed.avoid) ? parsed.avoid.map(item => text(item, 240)).filter(Boolean) : [],
    constraints,
    validation,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(item => text(item, 300)).filter(Boolean) : [],
    missing_inputs: [],
    questions: [],
    plan: parsed.plan || null,
  };
}

export function layoutPlanToText(plan) {
  if (!plan) return '';
  const zones = (plan.zones || [])
    .map(zone => `- ${zone.name}${zone.position ? ` (${zone.position})` : ''}: ${zone.purpose}`)
    .join('\n');
  const items = (plan.items || [])
    .map((item, index) => {
      return `${index + 1}. ${item.label || item.type}${item.position ? ` — ${item.position}` : ''}${item.size_cm ? `, ${item.size_cm}` : ''}`;
    })
    .join('\n');
  return [
    plan.strategy ? `Layout strategy: ${plan.strategy}` : '',
    zones ? `Zones:\n${zones}` : '',
    items ? `Furniture:\n${items}` : '',
    plan.circulation ? `Circulation: ${plan.circulation}` : '',
    plan.focal_point ? `Focal point: ${plan.focal_point}` : '',
    plan.avoid?.length ? `Avoid: ${plan.avoid.join('; ')}` : '',
    plan.assumptions?.length ? `Assumptions:\n${plan.assumptions.map(item => `- ${item}`).join('\n')}` : '',
    plan.constraints?.length ? `Hard furniture limits:\n${plan.constraints.map(item => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

// Полный план расстановки — только status=proposed с ненулевым списком предметов.
// needs_input/infeasible/null не кэшируем и не считаем результатом: иначе
// заморозим пустой/частичный план на все следующие рендеры комнаты.
export function isCompleteLayoutPlan(plan) {
  return Boolean(plan && plan.status === 'proposed' && Array.isArray(plan.items) && plan.items.length > 0);
}

export async function buildLayoutPlan({
  photoPath,
  roomType = 'Другое',
  dimensions = null,
  brief = '',
  usedStrategies = [],
  keepFurniture = false,
  sessionId = null,
} = {}) {
  if (!LAYOUT_ENABLED || !photoPath) return null;
  // Layout всегда работает по исходному фото (комната с мебелью для масштаба),
  // никогда по очищенному shell — поэтому в контракте путь к фото, а не data URL.
  let imageDataUrl = null;
  try {
    const { getBuffer } = await import('./storage.js');
    const { detectImageExt } = await import('./imagesize.js');
    const buf = await getBuffer(photoPath);
    const ext = detectImageExt(buf);
    imageDataUrl = `data:${MIME_BY_EXT[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch (e) {
    // Ошибку чтения фото не превращаем в «плана нет» (иначе layoutFailed не
    // выставится и null заморозится в кэше): пробрасываем наружу.
    throw e;
  }
  const { system, user } = composeLayoutPrompt({ roomType, dimensions, brief, usedStrategies, keepFurniture });
  let cost = null;
  try {
    const agent = await callAgentJson({
      instructions: system,
      inputText: user,
      images: [imageDataUrl],
      model: LAYOUT_MODEL,
      maxCostUsd: Number(process.env.LAYOUT_MAX_COST_USD || 0.05),
      maxSteps: 2,
      sessionId,
    });
    cost = agent.cost ?? null;
    const plan = normalizeLayoutPlanV2(agent.parsed);
    if (plan?.status === 'proposed' && plan.items.length) return { ...plan, cost };
    if (plan) return { ...plan, cost, empty: true };
  } catch { /* retry ниже */ }
  try {
    const retry = await callAgentJson({
      instructions: system,
      inputText: user,
      images: [imageDataUrl],
      model: undefined,
      maxCostUsd: Number(process.env.LAYOUT_MAX_COST_USD || 0.05),
      maxSteps: 2,
      sessionId,
    });
    const plan = normalizeLayoutPlanV2(retry.parsed);
    if (plan) return { ...plan, cost: (cost || 0) + (retry.cost || 0) };
  } catch { /* ignore */ }
  return null;
}
