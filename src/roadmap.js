// Генерация роадмапа ремонта: один vision-вызов, результат — этапы и карточки.
import { callAgentJson } from './openrouteragent.js';
import { buildRoadmapSystem, buildRoadmapUser, normalizeRoadmap } from './roadmapdata.js';

const ROADMAP_MODEL = process.env.ROADMAP_MODEL
  || process.env.BREAKDOWN_MODEL
  || process.env.ARCHITECT_MODEL
  || 'deepseek/deepseek-v4.1-flash-1017';

export async function generateRoadmap({
  imageDataUrl,
  roomType = '',
  style = '',
  priceTier = 'comfort',
  repairScope = null,
  vision = null,
} = {}) {
  if (!imageDataUrl) return null;
  const system = buildRoadmapSystem();
  const user = buildRoadmapUser({ roomType, style, priceTier, repairScope });
  let parsed = {};
  let cost = null;

  try {
    if (vision) {
      const first = await vision({ system, user, images: [imageDataUrl], model: ROADMAP_MODEL });
      parsed = first?.parsed || {};
      cost = first?.cost ?? null;
    } else {
      try {
        const agent = await callAgentJson({
          instructions: system,
          inputText: user,
          images: [imageDataUrl],
          model: ROADMAP_MODEL,
          maxCostUsd: Number(process.env.ROADMAP_MAX_COST_USD || 0.08),
          maxSteps: 2,
        });
        if (agent.parsed) {
          parsed = agent.parsed;
          cost = agent.cost ?? null;
        }
      } catch { /* fallback на visionJson ниже */ }
      if (!parsed || !Object.keys(parsed).length) {
        const { visionJson } = await import('./openrouter.js');
        const legacy = await visionJson({ system, user, images: [imageDataUrl], model: ROADMAP_MODEL });
        parsed = legacy?.parsed || {};
        cost = legacy?.cost ?? null;
      }
    }
  } catch {
    return null;
  }

  let roadmap = normalizeRoadmap(parsed);
  if (!roadmap && !vision) {
    try {
      const { visionJson } = await import('./openrouter.js');
      const retry = await visionJson({ system, user, images: [imageDataUrl], model: ROADMAP_MODEL });
      const retried = normalizeRoadmap(retry?.parsed || {});
      if (retried) {
        roadmap = retried;
        parsed = retry?.parsed || parsed;
        cost = (cost || 0) + (retry?.cost || 0);
      }
    } catch { /* остаётся исходный результат */ }
  }
  if (!roadmap) return null;
  return { roadmap, cost: cost ?? null, parsed };
}
