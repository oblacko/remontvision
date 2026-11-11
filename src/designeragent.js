// Агент-дизайнер: пользователь выбрал стиль и концепцию, агент собирает
// DesignDirection под конкретную комнату. Работает без фото — только по
// карточкам стиля/концепции и размерам от архитектора.
import { getArchitectPrompt } from './architectprompts.js';
import { callAgentJson } from './openrouteragent.js';
import { validateDesignDirection } from './agentcontracts.js';
import { styleById, conceptById, compatibilityOf, compatibilityNote } from './designdata.js';
import { log } from './openrouter.js';
import { cacheGet, cachePut, directionCacheKey, pickVariant } from './generationcache.js';

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
  variant = null,
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
  const variantLine = variant && variant.count > 1
    ? `Это вариант ${variant.index + 1} из ${variant.count}. Сфокусируй композицию на зоне: ${(variant.focalZones || []).join(' или ')}; main_move и focal_zone должны отличаться от других вариантов этой пары.`
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
    variantLine,
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

const FOCAL_ROTATION = [
  ['window', 'wall'],
  ['center', 'perimeter'],
  ['floor', 'ceiling'],
];

function directionCacheEnabled() {
  return !/^(0|false|no|off)$/i.test(String(process.env.DIRECTION_CACHE_ENABLED ?? 'true'));
}

function directionCacheTtlDays() {
  const value = Number(process.env.DIRECTION_CACHE_TTL_DAYS || 30);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

function directionVariantCount() {
  const value = Number(process.env.DIRECTION_CACHE_VARIANTS || 3);
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.floor(value)));
}

async function callDirection({ styleId, conceptId, compatibility, system, user, model, sessionId }) {
  const startedAt = Date.now();
  try {
    const agent = await agentCall({
      instructions: system,
      inputText: user,
      model,
      maxCostUsd: Number(process.env.DIRECTION_MAX_COST_USD || 0.02),
      maxSteps: 1,
      sessionId,
    });
    return {
      result: normalizeDirectionResult(agent.parsed, { styleId, conceptId, compatibility, cost: agent.cost ?? null }),
      parsed: agent.parsed,
      cost: agent.cost ?? null,
      ms: Date.now() - startedAt,
    };
  } catch {
    return { result: null, parsed: null, cost: null, ms: Date.now() - startedAt };
  }
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
  const base = composeDirectionPrompt({ styleId, conceptId, roomType, dimensions, usedDirections });
  if (!base.system || base.compatibility === 'conflict') return null;

  const cacheOn = directionCacheEnabled();
  const seed = sessionId || `${styleId}:${conceptId}:${roomType}`;
  const cacheKey = directionCacheKey({
    styleId, conceptId, roomType, dimensions,
    promptVersion: getArchitectPrompt('direction').version || 0,
  });

  if (cacheOn) {
    try {
      const cached = await cacheGet('design_direction', cacheKey, directionCacheTtlDays());
      const variants = Array.isArray(cached?.variants) ? cached.variants.filter(item => item && item.text) : [];
      const picked = pickVariant(variants, seed);
      if (picked) {
        log({ event: 'design_direction_cache_hit', variants: variants.length, key: cacheKey });
        return { ...picked, cached: true, ms: 0, retried: false, cost: null };
      }
    } catch (e) {
      log({ event: 'design_direction_cache_error', error: String(e.message || e).slice(0, 200) });
    }
  }

  const startedAt = Date.now();
  const count = cacheOn ? directionVariantCount() : 1;
  // Варианты генерируются параллельно: первый промах платит за N вызовов,
  // все последующие рендеры этой пары получают направление из кэша мгновенно.
  const calls = await Promise.all(Array.from({ length: count }, (_, index) => {
    const variant = count > 1
      ? { index, count, focalZones: FOCAL_ROTATION[index % FOCAL_ROTATION.length] }
      : null;
    const prompt = composeDirectionPrompt({ styleId, conceptId, roomType, dimensions, usedDirections, variant });
    return callDirection({
      styleId, conceptId, compatibility: base.compatibility,
      system: prompt.system, user: prompt.user,
      model: DIRECTION_MODEL, sessionId,
    });
  }));

  const totalCost = calls.reduce((sum, call) => sum + (typeof call.cost === 'number' ? call.cost : 0), 0) || null;
  const usable = calls.map(call => call.result).filter(result => result && result.text);
  const ms = Date.now() - startedAt;

  if (usable.length && cacheOn) {
    try {
      await cachePut('design_direction', cacheKey, { variants: usable.map(result => ({ ...result, cost: null })) });
    } catch (e) {
      log({ event: 'design_direction_cache_error', error: String(e.message || e).slice(0, 200) });
    }
  }

  // Ни один вариант не дал валидный JSON — один повтор дефолтной моделью.
  if (!usable.length && !calls.some(call => call.parsed)) {
    const retry = await callDirection({
      styleId, conceptId, compatibility: base.compatibility,
      system: base.system, user: base.user,
      model: undefined, sessionId,
    });
    const result = retry.result;
    const cost = (totalCost || 0) + (retry.cost || 0);
    if (!result) {
      log({ event: 'design_direction_empty', ms: Date.now() - startedAt, retried: true, cost_usd: cost || null });
      return null;
    }
    const out = { ...result, ms: Date.now() - startedAt, retried: true, cached: false, cost: cost || null };
    log({ event: 'design_direction_call', ms: out.ms, retried: true, variants: count, usable: 0, cached: false, has_text: Boolean(out.text), cost_usd: out.cost });
    return out;
  }

  const pool = usable.length ? usable : calls.map(call => call.result).filter(Boolean);
  const picked = pickVariant(pool, seed);
  if (!picked) {
    log({ event: 'design_direction_empty', ms, retried: false, cost_usd: totalCost });
    return null;
  }
  const out = { ...picked, ms, retried: false, cached: false, cost: totalCost };
  log({ event: 'design_direction_call', ms, retried: false, variants: count, usable: usable.length, cached: false, has_text: Boolean(out.text), cost_usd: out.cost });
  return out;
}
