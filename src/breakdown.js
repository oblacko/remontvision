// Разбор интерьера по кнопке: один vision-вызов, результат — маршрут для UI.
import { callAgentJson } from './openrouteragent.js';
import { buildBreakdownSystem, buildBreakdownUser, normalizeBreakdown } from './breakdowndata.js';

const BREAKDOWN_MODEL = process.env.BREAKDOWN_MODEL
  || process.env.ARCHITECT_MODEL
  || 'deepseek/deepseek-v4.1-flash-1017';

export async function breakdownInterior({
  imageDataUrl,
  roomType = '',
  style = '',
  priceTier = 'comfort',
  budget = null,
  dimensions = null,
  repairScope = null,
  designDirection = null,
  layoutPlan = null,
  sessionId = null,
  vision = null,
} = {}) {
  if (!imageDataUrl) return null;
  const system = buildBreakdownSystem();
  const user = buildBreakdownUser({ roomType, style, priceTier, budget, dimensions, repairScope, designDirection, layoutPlan });
  let parsed = {};
  let cost = null;

  try {
    if (vision) {
      const first = await vision({ system, user, images: [imageDataUrl], model: BREAKDOWN_MODEL, sessionId });
      parsed = first?.parsed || {};
      cost = first?.cost ?? null;
    } else {
      try {
        const agent = await callAgentJson({
          instructions: system,
          inputText: user,
          images: [imageDataUrl],
          model: BREAKDOWN_MODEL,
          maxCostUsd: Number(process.env.BREAKDOWN_MAX_COST_USD || 0.08),
          maxSteps: 2,
          sessionId,
        });
        if (agent.parsed) {
          parsed = agent.parsed;
          cost = agent.cost ?? null;
        }
      } catch { /* fallback на visionJson ниже */ }
      if (!parsed || !Object.keys(parsed).length) {
        const { visionJson } = await import('./openrouter.js');
        const legacy = await visionJson({ system, user, images: [imageDataUrl], model: BREAKDOWN_MODEL, sessionId });
        parsed = legacy?.parsed || {};
        cost = legacy?.cost ?? null;
      }
    }
  } catch {
    return null;
  }

  let breakdown = normalizeBreakdown(parsed);
  // Непустой, но непригодный ответ — пробуем совместимый vision-вызов ещё раз.
  if (!breakdown && !vision) {
    try {
      const { visionJson } = await import('./openrouter.js');
      const retry = await visionJson({ system, user, images: [imageDataUrl], model: BREAKDOWN_MODEL, sessionId });
      const retried = normalizeBreakdown(retry?.parsed || {});
      if (retried) {
        breakdown = retried;
        parsed = retry?.parsed || parsed;
        cost = (cost || 0) + (retry?.cost || 0);
      }
    } catch { /* остаётся исходный результат */ }
  }
  if (!breakdown) return null;
  return { breakdown, cost: cost ?? null, parsed };
}
