// Правила списания кредитов: первые FREE_EDITS правок бесплатны, корневой
// рендер всегда платный. Чистые функции без БД — их использует транзакция биллинга.

export const FREE_EDITS = 3;

export function editChargeDecision({ iteration, editCount } = {}) {
  // Fail closed: без корректного счётчика правок считаем вызов платным.
  // Отрицательный счётчик тоже платный — согласовано с chargeForEnqueue.
  if (!Number.isInteger(editCount)) return { free: false };
  const free = iteration === true && editCount >= 0 && editCount < FREE_EDITS;
  return { free };
}

export function modelCreditsFor(modelKey, models) {
  if (!modelKey || !Array.isArray(models)) return 1;
  // Ключ модели в API — это render_models.id (короткий), но старые вызовы
  // передают model_id, поэтому активную строку ищем по обоим полям.
  const model = models.find(
    (row) => row && row.active === true && (row.id === modelKey || row.model_id === modelKey),
  );
  const credits = Number(model?.credits);
  if (!Number.isFinite(credits) || credits < 1) return 1;
  return credits;
}

// models намеренно не используется: правка всегда наследует модель родителя.
export function modelForEdit(parentModelKey, models) {
  return parentModelKey;
}

// Параметризованный SQL подсчёта правок, принадлежащих корневому дизайну.
// Параметр — root_render_id (id корня); сам корень (id = $1) не считается.
export function rootEditCountSql(rootRenderId) {
  return {
    sql: 'SELECT COUNT(*)::int AS n FROM renders WHERE root_render_id = $1 AND id <> $1',
    params: [rootRenderId],
  };
}

// Чистое правило списания при постановке рендера в очередь.
// Возвращает { ok: true, delta } либо { ok: false, needed }.
// Корень платный по цене модели; первые FREE_EDITS правок бесплатны (delta = 0),
// остальные правки — 1 кредит. Fail closed: некорректный счётчик правок → платно.
export function chargeForEnqueue({ iteration = false, editCount, modelCredits = 1, balance = 0 } = {}) {
  const credits = Number(modelCredits);
  const cost = Number.isFinite(credits) && credits >= 1 ? credits : 1;
  if (iteration !== true) {
    return balance >= cost ? { ok: true, delta: -cost } : { ok: false, needed: cost };
  }
  if (Number.isInteger(editCount) && editCount >= 0 && editCount < FREE_EDITS) {
    return { ok: true, delta: 0 };
  }
  return balance >= 1 ? { ok: true, delta: -1 } : { ok: false, needed: 1 };
}
