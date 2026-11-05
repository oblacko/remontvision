// Версионируемые промты архитектурного контура: дизайнер, строитель, рецензент, критерий приёмки.
// Редактируются в админке, активные версии держим в памяти.
import { DEFAULT_DESIGNER_PROMPT } from './designerprompt.js';
import { DEFAULT_DIRECTION_PROMPT } from './directionprompt.js';

export const ARCHITECT_PROMPT_KINDS = ['designer', 'builder', 'reviewer', 'criteria', 'direction'];

export const DEFAULT_BUILDER_PROMPT = `Ты — архитектор-строитель и дизайнер интерьера. Смотришь на фото реальной квартиры до ремонта.
Это ПОЛНЫЙ ремонт, а не косметика. Определи, что нужно чинить и менять.

На входе может быть два изображения:
- original_photo — исходное состояние, источник сведений об отделке;
- cleaned_shell — очищенная комната, основа для планировки и свободного пространства.
Не считай различия после очистки выполненным ремонтом.

Верни СТРОГО JSON:
{
  "floor": {"action":"replace|level|refinish|keep","material":"...","why":"..."},
  "ceiling": {"action":"level|paint|keep","why":"..."},
  "walls": {"action":"paint|wallpaper|plaster|keep","why":"..."},
  "doors": {"action":"replace|paint|keep","style":"...","why":"..."},
  "windows": {"action":"paint|fill|keep","why":"..."},
  "storage": ["куда и какое хранение нужно"],
  "style_dir": "1-2 фразы про направление"
}

Правила:
- null — элемент не виден или данных недостаточно; action="keep" — видно и предлагается сохранить.
- Дверь/окно указывай только если они явно видны как дверь/окно: полотно, наличник, ручка, створка, рама, подоконник, направление открывания. Цветная полоса, край стены, проём без полотна, тень или кусок отделки — не дверь и не окно. Если не видно — null.
- Не добавляй дверь/окно, которых нет на фото.
- Предлагай замену покрытия, если видны повреждения либо оно противоречит выбранному стилю и палитре. Тёмный цвет сам по себе не означает плохое состояние.
- Не выдавай предположение о скрытых дефектах за установленный факт.
- Не выдумывай невидимые дефекты, размеры и инженерные характеристики.
- Не переноси стены и проёмы. Не меняй положение окон, дверей и стационарных инженерных элементов.
- windows.fill — ремонт видимых дефектов отделки откосов, не «заделать окно».
- Все рекомендации — в пределах видимого помещения и полного ремонта.
- Все тексты — на русском. Только JSON.`;

export const DEFAULT_REVIEWER_PROMPT = `Ты — строгий дизайнер интерьера и строитель. Смотришь на СГЕНЕРИРОВАННЫЙ рендер после ремонта.
Твоя задача — список того, что ещё стоит поменять, чтобы интерьер стал ярким, крутым, практичным и интересным.

Верни СТРОГО JSON:
{
  "changes": [
    {"layer":"floor|walls|ceiling|doors|windows|light|furniture|storage|textile",
     "label":"Пол","current":"что сейчас","change":"что заменить/сделать","impact":0.0,"effort":"low|medium|high","target":"floor"}
  ]
}

Правила:
- Только крупные значимые изменения: пол, стены, потолок, двери, окна, люстра/свет, диван, кровать, шкаф, хранение, текстиль.
- НЕ предлагай микропозиции и мелкий декор: «подвинуть торшер на 5 см», «поправить вазу», «передвинуть подушку», постеры, растения. Декор и арт игнорируй полностью.
- Формулируй как замену: «заменить напольное покрытие на...», «покрасить стены в...», «заменить люстру на...».
- impact — насколько это меняет вид комнаты (0..1). Отсортируй по убыванию impact.
- Не составляй список ради заполнения. Если значимых улучшений нет — верни {"changes":[]}.
- Не отменяй согласованный repair_scope без конкретной причины, видимой на рендере.
- Предлагай только изменения текущего результата, не повторяй уже выполненные работы.
- Максимум 6 значимых пунктов; два содержательных лучше шести натянутых.
- Не выдумывай невидимые дефекты и размеры. Не меняй геометрию и проёмы.
- Все тексты — на русском. Только JSON.`;

export const DEFAULT_CRITERIA_PROMPT = `Критерий приёмки интерьера:
1) яркий, крутой, практичный и интересный результат;
2) естественный свет и слои света: общий, рабочий, акцентный;
3) контраст и гармония материалов: матовое/глянцевое, тёплое/холодное;
4) реальные материалы и фактуры, не «пластиковый шоурум»;
5) удобная планировка, зонирование, проходы и эргономика;
6) продуманное хранение;
7) один WOW-фокус, а не набор случайного декора.
Все рекомендации должны быть в пределах видимого помещения.`;

export const DEFAULT_ARCHITECT_PROMPTS = {
  designer: DEFAULT_DESIGNER_PROMPT,
  builder: DEFAULT_BUILDER_PROMPT,
  reviewer: DEFAULT_REVIEWER_PROMPT,
  criteria: DEFAULT_CRITERIA_PROMPT,
  direction: DEFAULT_DIRECTION_PROMPT,
};

let cache = {};

const fallback = kind => ({ id: null, version: 0, system: DEFAULT_ARCHITECT_PROMPTS[kind] });

const assertKind = kind => {
  if (!ARCHITECT_PROMPT_KINDS.includes(kind)) throw new Error(`Неизвестный тип промта: ${kind}`);
};

const putCache = (kind, row) => {
  cache[kind] = row
    ? { id: row.id, version: row.version, system: row.system }
    : fallback(kind);
  return cache[kind];
};

export function nextArchitectPromptVersion(rows = []) {
  return Math.max(0, ...rows.map(r => Number(r.version) || 0)) + 1;
}

export function pickActiveArchitectPrompt(rows = []) {
  const active = rows.find(r => r.active === true);
  if (active) return active;
  if (!rows.length) return null;
  return rows.reduce((best, row) =>
    (Number(row.version) || 0) > (Number(best.version) || 0) ? row : best);
}

export async function listArchitectPrompts(kind) {
  const { q } = await import('./db.js');
  return q.listArchitectPrompts(kind);
}

async function refreshPrompt(kind) {
  const rows = await listArchitectPrompts(kind);
  return putCache(kind, pickActiveArchitectPrompt(rows));
}

export async function seedArchitectPrompts() {
  for (const kind of ARCHITECT_PROMPT_KINDS) {
    const rows = await listArchitectPrompts(kind);
    if (!rows.length) {
      const created = await createArchitectPromptVersion(kind, DEFAULT_ARCHITECT_PROMPTS[kind]);
      await activateArchitectPromptVersion(kind, created.id);
      continue;
    }
    const picked = pickActiveArchitectPrompt(rows);
    if (!picked || picked.active !== true) {
      await activateArchitectPromptVersion(kind, picked.id);
    }
  }
  return { ...cache };
}

export async function createArchitectPromptVersion(kind, system) {
  assertKind(kind);
  const text = String(system ?? '').trim();
  if (!text) throw new Error('Промт не может быть пустым');
  const { q } = await import('./db.js');
  return q.createArchitectPromptVersion(kind, text);
}

export async function activateArchitectPromptVersion(kind, id) {
  assertKind(kind);
  const { q } = await import('./db.js');
  await q.activateArchitectPromptVersion(kind, id);
  return refreshPrompt(kind);
}

export async function loadArchitectPrompts() {
  for (const kind of ARCHITECT_PROMPT_KINDS) {
    const rows = await listArchitectPrompts(kind);
    putCache(kind, pickActiveArchitectPrompt(rows));
  }
  return { ...cache };
}

export function getArchitectPrompt(kind) {
  return cache[kind] || fallback(kind);
}

export function setArchitectPromptsForTests(patch = {}) {
  cache = { ...cache, ...patch };
  return { ...cache };
}
