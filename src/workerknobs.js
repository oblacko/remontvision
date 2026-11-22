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

// Период тика воркера (мс): как часто процесс проверяет очередь на новые задачи.
// Меньше — быстрее холодный старт задачи, чуть больше запросов к Postgres.
export function workerTickMs(raw = process.env.WORKER_TICK_MS) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 500;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 500;
  return Math.min(5000, Math.max(100, Math.floor(value)));
}

// Сколько миллисекунд рендер ждёт готовый cleaned-shell перед тем, как отказаться
// и идти по оригинальному фото. Раньше было фиксированные 3 минуты холостого
// поллинга — теперь настраиваемый таймаут, по умолчанию 30 с.
export function shellWaitTimeoutMs(raw = process.env.RENDER_SHELL_WAIT_MS) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 30_000;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 30_000;
  return Math.min(300_000, Math.max(0, Math.floor(value)));
}
