import { q } from './db.js';
import { log } from './openrouter.js';
import { processProcurementRun, refundProcurementRun } from './procurement.js';
import { getProcurementConfig } from './procurementconfig.js';

let running = 0;

export function startProcurementWorker() {
  if (!getProcurementConfig().configured) {
    console.log('[procurement] worker не запущен: Yandex Search не настроен');
    return;
  }
  q.requeueProcessingProcurements()
    .then(n => { if (n) console.log(`[procurement] вернул в очередь ${n} прерванных запусков`); })
    .catch(e => log({ event: 'procurement_requeue_error', error: String(e.message || e).slice(0, 200) }));

  setInterval(async () => {
    try {
      const stale = await q.staleProcurements(60);
      for (const run of stale) {
        const failed = await q.failProcurementRun(run.id, 'Подбор товаров не завершился за час', { costUsd: run.cost_usd || 0 });
        await refundProcurementRun(failed || run, 'Подбор товаров не завершился за час');
        log({ event: 'procurement_timeout', run_id: run.id });
      }
    } catch (e) {
      log({ event: 'procurement_stale_error', error: String(e.message || e).slice(0, 200) });
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    if (running >= 1) return;
    try {
      const row = await q.claimNextProcurement();
      if (!row) return;
      running++;
      try { await processProcurementRun(row.id); } finally { running--; }
    } catch (e) {
      log({ event: 'procurement_worker_error', error: String(e.message || e).slice(0, 300) });
    }
  }, 2000);
  console.log('[procurement] worker запущен');
}
