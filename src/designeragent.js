// Агент-дизайнер: пользователь выбрал стиль и концепцию, агент собирает
// DesignDirection под конкретную комнату. Работает без фото — только по
// карточкам стиля/концепции и размерам от архитектора.
import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';
import { validateDesignDirection } from './agentcontracts.js';
import { styleById, conceptById, compatibilityOf, compatibilityNote } from './designdata.js';
import { log } from './openrouter.js';

export const DESIGN_DIRECTION_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.DESIGN_DIRECTION_ENABLED ?? 'true'));

const DIRECTION_MODEL = process.env.DIRECTION_MODEL || process.env.ART_DIRECTOR_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

const DIRECTION_SCHEMA = `Обязательный контракт DesignDirection (не удалять при редактировании промта):
{"style_id":"...","concept_id":"...","compatibility":"ok|weaken","concept":"...","main_move":{"target":"...","action":"...","effect":"..."},"supporting_moves":[{"target":"...","action":"...","effect":"..."}],"palette_hex":{"base":"#RRGGBB","support":"#RRGGBB","dark":"#RRGGBB","accent":"#RRGGBB"},"focal_point":"...","focal_zone":"window|wall|center|ceiling|floor|perimeter","quiet_areas":["..."],"materials_story":["..."],"prompt_en":"...","novelty_class":"novel|balance|safe","avoid":["..."]}
Только JSON.`;

function dimensionsText(dimensions) {
  if (!dimensions) return 'Размеры не заданы — работай с типовым масштабом, не выдумывай точные метры.';
  const parts = [dimensions.width, dimensions.length, dimensions.height].map(value => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? String(Math.round(number * 10) / 10) : '';
  });
  if (!parts.every(Boolean)) return 'Размеры не заданы — работай с типовым масштабом, не выдумывай точные метры.';
  return `Размеры комнаты: ${parts.join(' × ')} м.`;
}

export function composeDirectionPrompt({
  styleId,
  conceptId,
  roomType = 'Другое',
  dimensions = null,
  usedDirections = [],
} = {}) {
  const style = styleById(styleId);
  const concept = conceptById(conceptId);
  const compatibility = compatibilityOf(styleId, conceptId);
  const note = compatibilityNote(styleId, conceptId);
  if (!style || !concept) {
    return { compatibility: 'conflict', system: '', user: '', style: null, concept: null };
  }
  const system = `${getArchitectPrompt('direction').system}\n\n${DIRECTION_SCHEMA}`;
  const history = Array.isArray(usedDirections) && usedDirections.length
    ? `Последние проекты пользователя (не повторяй main_move и focal_zone): ${usedDirections.map(item => JSON.stringify(item)).join('; ')}.`
    : '';
  const user = [
    `Тип комнаты: ${roomType || 'Другое'}.`,
    dimensionsText(dimensions),
    `Стиль: ${style.name} (id: ${style.id}).`,
    `Палитра стиля: base ${style.palette.base}, support ${style.palette.support}, dark ${style.palette.dark}, accent ${style.palette.accent}.`,
    `Материалы стиля: ${style.materials}.`,
    `Промпт стиля (EN): ${style.prompt_en}.`,
    `Концепция: ${concept.name} (id: ${concept.id}). Главный ход: ${concept.main_move}. Спокойные зоны: ${concept.quiet_areas}.`,
    `Совместимость пары: ${compatibility}.${note ? ` Ослабленная форма: ${note}.` : ''}`,
    compatibility === 'weaken'
      ? 'Пара допустима только в ослабленной форме: сохрани главный ход концепции, но приглуши его.'
      : '',
    history,
    'Собери одно DesignDirection по схеме. Только JSON.',
  ].filter(Boolean).join('\n');
  return { compatibility, system, user, style, concept };
}

function paletteToArtDirection(paletteHex = {}) {
  const labels = { base: 'основной', support: 'поддерживающий', dark: 'тёмный', accent: 'акцент' };
  return Object.entries(labels)
    .map(([key, name]) => (paletteHex[key] ? { hex: paletteHex[key], name } : null))
    .filter(Boolean);
}

export function normalizeDirectionResult(parsed, {
  styleId = '',
  conceptId = '',
  compatibility = null,
  cost = null,
} = {}) {
  const validated = validateDesignDirection(parsed || {});
  if (!validated) return null;
  return {
    styleId: styleId || validated.style_id,
    conceptId: conceptId || validated.concept_id,
    compatibility: compatibility || validated.compatibility || 'ok',
    concept: validated.concept,
    mainMove: validated.main_move,
    supportingMoves: validated.supporting_moves,
    focalPoint: validated.focal_point,
    focalZone: validated.focal_zone,
    quietAreas: validated.quiet_areas,
    materialsStory: validated.materials_story,
    noveltyClass: validated.novelty_class,
    text: validated.prompt_en || '',
    palette: paletteToArtDirection(validated.palette_hex),
    materials: validated.materials_story.join(', '),
    mood: validated.concept,
    avoid: validated.avoid.join('; '),
    cost: cost ?? null,
  };
}

let agentCall = callAgentJson;

// Тестовый шов: инъекция фейкового агента без обращения к провайдеру.
export function setDirectionAgentForTests(fn) {
  agentCall = fn || callAgentJson;
}

export async function buildDesignDirection({
  styleId,
  conceptId,
  roomType = 'Другое',
  dimensions = null,
  usedDirections = [],
  sessionId = null,
} = {}) {
  if (!DESIGN_DIRECTION_ENABLED) return null;
  const { system, user, compatibility } = composeDirectionPrompt({ styleId, conceptId, roomType, dimensions, usedDirections });
  if (!system || compatibility === 'conflict') return null;
  const startedAt = Date.now();
  let parsed = null;
  let cost = null;
  try {
    const agent = await agentCall({
      instructions: system,
      inputText: user,
      model: DIRECTION_MODEL,
      maxCostUsd: Number(process.env.DIRECTION_MAX_COST_USD || 0.02),
      maxSteps: 1,
      sessionId,
    });
    parsed = agent.parsed;
    cost = agent.cost ?? null;
  } catch { /* retry ниже */ }
  let result = normalizeDirectionResult(parsed, { styleId, conceptId, compatibility, cost });
  let retried = false;
  // Повторяем только когда JSON не распарсился. Валидный ответ без prompt_en
  // не повторяем: jobs.js уходит на fallback арт-директора, а второй полный
  // вызов удваивал задержку direction (p50 ~34 с на два прохода).
  if (!parsed) {
    retried = true;
    try {
      const retry = await agentCall({
        instructions: system,
        inputText: user,
        model: undefined,
        maxCostUsd: Number(process.env.DIRECTION_MAX_COST_USD || 0.02),
        maxSteps: 1,
        sessionId,
      });
      const retryResult = normalizeDirectionResult(retry.parsed, {
        styleId, conceptId, compatibility,
        cost: (cost || 0) + (retry.cost || 0),
      });
      if (retryResult) result = retryResult;
    } catch { /* остаётся null */ }
  }
  const ms = Date.now() - startedAt;
  if (!result) {
    log({ event: 'design_direction_empty', ms, retried, cost_usd: cost ?? null });
    return null;
  }
  const out = { ...result, ms, retried };
  log({ event: 'design_direction_call', ms, retried, has_text: Boolean(result.text), cost_usd: result.cost ?? null });
  return out;
}
