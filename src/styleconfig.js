export const STYLE_CONFIG_KEY = 'style.reference.mode.v1';
export const STYLE_MODES = ['text', 'reference', 'swatches'];

export const DEFAULT_STYLE_CONFIG = { mode: 'text' };
let cache = { ...DEFAULT_STYLE_CONFIG };

function validate(input = {}) {
  const out = {};
  if ('mode' in input) {
    const mode = String(input.mode || '').trim();
    if (STYLE_MODES.includes(mode)) out.mode = mode;
  }
  return out;
}

export function getStyleConfig() {
  return { ...cache };
}

export function getStyleDefaults() {
  return { ...DEFAULT_STYLE_CONFIG };
}

export async function loadStyleConfig() {
  try {
    const { q } = await import('./db.js');
    const rows = await q.settingsByKeys([STYLE_CONFIG_KEY]);
    const raw = rows.find(r => r.key === STYLE_CONFIG_KEY)?.value;
    cache = raw ? { ...DEFAULT_STYLE_CONFIG, ...validate(JSON.parse(raw)) } : { ...DEFAULT_STYLE_CONFIG };
  } catch {
    cache = { ...DEFAULT_STYLE_CONFIG };
  }
  return getStyleConfig();
}

export async function saveStyleConfig(patch) {
  const next = { ...cache, ...validate(patch) };
  const { q } = await import('./db.js');
  await q.setSetting(STYLE_CONFIG_KEY, JSON.stringify(next));
  cache = next;
  return getStyleConfig();
}

export async function resetStyleConfig() {
  const { q } = await import('./db.js');
  await q.deleteSetting(STYLE_CONFIG_KEY);
  cache = { ...DEFAULT_STYLE_CONFIG };
  return getStyleConfig();
}
