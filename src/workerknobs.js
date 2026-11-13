// Настройки воркера, вынесенные в чистые функции (тестируются без БД).
// WORKER_CONCURRENCY — сколько рендеров обрабатывать одновременно в одном процессе.
// Один процесс держит ~100 одновременных рендеров: потолок поднят, реальный лимит
// провайдера меряем на проде. Фактическая нагрузка на провайдера ограничена
// отдельно: image_concurrency.
export function workerConcurrency(raw = process.env.WORKER_CONCURRENCY) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 100;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
}
