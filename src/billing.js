// Правила списания кредитов: первые FREE_EDITS правок бесплатны, корневой
// рендер всегда платный. Чистые функции без БД — их использует транзакция биллинга.

export const FREE_EDITS = 3;

export function editChargeDecision({ iteration, editCount } = {}) {
  const count = Number.isFinite(Number(editCount)) ? Number(editCount) : 0;
  const free = iteration === true && count < FREE_EDITS;
  return { free };
}

export function modelCreditsFor(modelKey, models) {
  if (!modelKey || !Array.isArray(models)) return 1;
  const model = models.find((row) => row && row.model_id === modelKey && row.active === true);
  const credits = Number(model?.credits);
  if (!Number.isFinite(credits) || credits < 1) return 1;
  return credits;
}

export function modelForEdit(parentModelKey) {
  return parentModelKey;
}
