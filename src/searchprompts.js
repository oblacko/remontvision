// Версионируемые промты поиска (vision/grid/cell) из таблицы search_prompts.
// Кэш держим в памяти, к БД обращаемся только внутри async-функций (как promptconfig.js),
// чтобы модуль можно было импортировать в тестах без Postgres.
import { DEFAULT_VISION_PROMPT } from './searchvision.js';

export const PROMPT_KINDS = ['vision', 'grid', 'cell'];

export const DEFAULT_GRID_PROMPT = `Ты генерируешь референс-лист товаров для интерьерного поиска.
Создай одно изображение-сетку 2 ряда × 5 колонок (10 ячеек) на чистом белом фоне.
В каждой ячейке — один изолированный товар из списка ниже, в том же порядке, целиком, без обрезки.
Ровные поля между ячейками, одинаковый размер ячеек, мягкая тень, студийный свет.
Никакого текста, подписей, цифр, логотипов, людей и лишних предметов.
Товары:
{objects}
Только изображение сетки, без текста вокруг.`;

export const DEFAULT_CELL_PROMPT = `Ты проверяешь одну ячейку сетки товаров.
Верни строго JSON: {"ok":true|false,"label":"...","category":"...","description":"..."}
ok=true, если в ячейке ровно один целый товар, он соответствует ожидаемому названию и не обрезан.
description — краткое описание видимого товара (тип, цвет, материал).
Ожидаемый товар: {label}
Только JSON.`;

export const DEFAULT_SEARCH_PROMPTS = {
  vision: DEFAULT_VISION_PROMPT,
  grid: DEFAULT_GRID_PROMPT,
  cell: DEFAULT_CELL_PROMPT,
};

let cache = {};

const fallback = kind => ({ id: null, version: 0, prompt: DEFAULT_SEARCH_PROMPTS[kind] });

const assertKind = kind => {
  if (!PROMPT_KINDS.includes(kind)) throw new Error(`Неизвестный тип промта: ${kind}`);
};

const putCache = (kind, row) => {
  cache[kind] = row
    ? { id: row.id, version: row.version, prompt: row.prompt }
    : fallback(kind);
  return cache[kind];
};

export function nextPromptVersion(rows = []) {
  return Math.max(0, ...rows.map(r => Number(r.version) || 0)) + 1;
}

export function pickActivePrompt(rows = []) {
  const active = rows.find(r => r.active === true);
  if (active) return active;
  if (!rows.length) return null;
  return rows.reduce((best, row) =>
    (Number(row.version) || 0) > (Number(best.version) || 0) ? row : best);
}

export async function listSearchPrompts(kind) {
  const { q } = await import('./db.js');
  return q.listSearchPrompts(kind);
}

async function refreshPrompt(kind) {
  const rows = await listSearchPrompts(kind);
  return putCache(kind, pickActivePrompt(rows));
}

export async function seedSearchPrompts() {
  for (const kind of PROMPT_KINDS) {
    const rows = await listSearchPrompts(kind);
    if (!rows.length) {
      const created = await createPromptVersion(kind, DEFAULT_SEARCH_PROMPTS[kind]);
      await activatePromptVersion(kind, created.id);
      continue;
    }
    const picked = pickActivePrompt(rows);
    if (!picked || picked.active !== true) {
      await activatePromptVersion(kind, picked.id);
    }
  }
  return { ...cache };
}

export async function createPromptVersion(kind, prompt) {
  assertKind(kind);
  const text = String(prompt ?? '').trim();
  if (!text) throw new Error('Промт не может быть пустым');
  const { q } = await import('./db.js');
  return q.createSearchPromptVersion(kind, text);
}

export async function activatePromptVersion(kind, id) {
  assertKind(kind);
  const { q } = await import('./db.js');
  await q.activateSearchPromptVersion(kind, id);
  return refreshPrompt(kind);
}

export async function loadSearchPrompts() {
  for (const kind of PROMPT_KINDS) {
    const rows = await listSearchPrompts(kind);
    putCache(kind, pickActivePrompt(rows));
  }
  return { ...cache };
}

export function getActivePrompt(kind) {
  return cache[kind] || fallback(kind);
}

export function setSearchPromptsForTests(patch = {}) {
  cache = { ...cache, ...patch };
  return { ...cache };
}
