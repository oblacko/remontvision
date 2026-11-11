// Настройки воркера, вынесенные в чистые функции (тестируются без БД).
// WORKER_CONCURRENCY — сколько рендеров обрабатывать одновременно в одном процессе.
// Image-вызовы всё равно сериализуются глобальным слотом; параллелизм скрывает
// ожидание vision-этапов (арт-директор, design direction), а не увеличивает нагрузку на провайдера.
export function workerConcurrency(raw = process.env.WORKER_CONCURRENCY) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 2;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 2;
  return Math.min(8, Math.max(1, Math.floor(value)));
}
