// Обратная совместимость: прежний интерфейс вариативности переехал в ./variety.js.
// Этот модуль остаётся тонким реэкспортом, чтобы не ломать старых потребителей
// (scripts/regression-prompts.mjs, test/variability.test.js).
import { pickVariety } from './variety.js';

export { resolveStylePalette, pickStyleAccent, pickVariety, variabilityPrompt } from './variety.js';

// Прежняя сигнатура buildRoomVariability(options): options-объект вместо (room, style, seed, used).
export function buildRoomVariability({ seed = '', styleName = '', styleKey = '', used = [], keepFurniture = true } = {}) {
  const variety = pickVariety(
    { keep_furniture: keepFurniture, style: styleName },
    { name: styleName, key: styleKey },
    seed,
    used,
  );
  return { ...variety, accentHex: variety.accent };
}
