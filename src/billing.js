// Правила списания кредитов: первые FREE_EDITS правок бесплатны, корневой
// рендер всегда платный. Чистые функции без БД — их использует транзакция биллинга.

export const FREE_EDITS = 3;

export function editChargeDecision({ iteration, editCount } = {}) {
  // Fail closed: без корректного счётчика правок считаем вызов платным.
  if (!Number.isInteger(editCount)) return { free: false };
  const free = iteration === true && editCount < FREE_EDITS;
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
