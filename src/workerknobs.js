// Настройки воркера, вынесенные в чистые функции (тестируются без БД).
// WORKER_CONCURRENCY — сколько рендеров обрабатывать одновременно в одном процессе.
// Значение должно быть не меньше типичного размера пакета (3–5), иначе варианты
// ждут друг друга на уровне воркера, даже когда семафор image-вызовов свободен.
// Фактическая нагрузка на провайдера ограничена отдельно: image_concurrency.
export function workerConcurrency(raw = process.env.WORKER_CONCURRENCY) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 6;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 6;
  return Math.min(8, Math.max(1, Math.floor(value)));
}
