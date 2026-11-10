// Возможности известных семейств image-моделей: что реально можно отправить.
const SEEDREAM_ASPECTS = ['auto','1:1','1:2','2:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','9:19.5','19.5:9','9:20','20:9','9:21','21:9'];
const FLUX_ASPECTS = ['auto','21:9','2:1','16:9','3:2','7:5','4:3','5:4','1:1','4:5','3:4','5:7','2:3','9:16','1:2','9:21'];
const SAFE_ASPECTS = ['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'];

export const MODEL_CAPS = {
  openai: { resolutions: [], aspects: ['auto','1:1','3:2','2:3','4:3','3:4','16:9','9:16','21:9'] },
  seedream: { resolutions: ['1K', '2K'], aspects: SEEDREAM_ASPECTS },
  flux: { resolutions: [], aspects: FLUX_ASPECTS },
  google: { resolutions: ['1K'], aspects: SAFE_ASPECTS },
  other: { resolutions: ['1K', '2K'], aspects: SAFE_ASPECTS },
};

// У FLUX разные возможности по моделям: FLUX 3 Klein принимает resolution,
// FLUX 2 Pro — нет (см. OpenRouter model docs).
export function modelCaps(id) {
  const s = String(id || '');
  if (/^bytedance-seed\/seedream/.test(s)) return MODEL_CAPS.seedream;
  if (/^black-forest-labs\/flux-3-image/.test(s)) return { resolutions: ['768', '1K', '1.5K', '2K', '4K'], aspects: FLUX_ASPECTS };
  if (/^black-forest-labs\/flux/.test(s)) return MODEL_CAPS.flux;
  if (/^openai\/gpt-image/.test(s)) return MODEL_CAPS.openai;
  if (/^google\//.test(s)) return MODEL_CAPS.google;
  return MODEL_CAPS.other;
}

export function modelFamily(id) {
  const s = String(id || '');
  if (/^bytedance-seed\/seedream/.test(s)) return 'seedream';
  if (/^black-forest-labs\/flux/.test(s)) return 'flux';
  if (/^google\//.test(s)) return 'google';
  return 'other';
}

export function supportsAdvancedOptions(id) {
  const family = modelFamily(id);
  return family === 'seedream' || family === 'flux';
}

export function supportsResolution(id) {
  return supportsAdvancedOptions(id) && modelCaps(id).resolutions.length > 0;
}

export function validateModelOptions(id, resolution, aspectRatio) {
  const family = modelFamily(id);
  const caps = modelCaps(id);
  if (!caps) return null;
  if (supportsAdvancedOptions(id)) {
    // FLUX 2 Pro (и текущее семейство FLUX в OpenRouter Image API) не принимает resolution:
    // размер задаётся моделью/вендором. Отправка resolution даёт 400.
    if (caps.resolutions.length && !caps.resolutions.includes(resolution)) {
      return `resolution для ${family}: ${caps.resolutions.join(', ')}`;
    }
    if (!caps.aspects.includes(aspectRatio)) {
      return `aspect_ratio для ${family}: ${caps.aspects.join(', ')}`;
    }
  }
  return null;
}

// Цена рендера в кредитах для выбранной резолюции: из карты цен модели,
// иначе базовая цена рендера. Пустая/1K-резолюция без отдельной цены — базовая.
// Только целое ≥ 1: дробная цена из БД не должна дойти до списания.
export function priceForResolution(resolutionPrices, resolution, baseCredits) {
  const price = resolutionPrices?.[resolution];
  const n = Number(price);
  return Number.isInteger(n) && n >= 1 ? n : baseCredits;
}

// Санитайзер карты цен из админки: только поддерживаемые моделью резолюции
// и целые значения ≥ 1. Мусор и неизвестные ключи отбрасываются.
export function sanitizeResolutionPrices(prices, allowedResolutions) {
  const allowed = new Set(Array.isArray(allowedResolutions) ? allowedResolutions : []);
  const out = {};
  if (!prices || typeof prices !== 'object') return out;
  for (const [resolution, raw] of Object.entries(prices)) {
    if (!allowed.has(resolution)) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) continue;
    out[resolution] = n;
  }
  return out;
}

// Разрешена ли резолюция для модели: пустая карта возможностей = не поддерживает.
export function resolutionAllowed(id, resolution) {
  return modelCaps(id).resolutions.includes(String(resolution || ''));
}
