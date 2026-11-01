import { q } from './db.js';
import { log } from './openrouter.js';
import { processVisionStep } from './searchservice.js';

export function startSearchWorker() {
  q.requeueProcessingSearchJobs()
    .then(n => { if (n) console.log(`[search] вернул в очередь ${n} прерванных поисков`); })
    .catch(e => log({ event: 'search_requeue_error', error: String(e.message || e).slice(0, 200) }));

  setInterval(async () => {
    try {
      const jobs = await q.listSearchJobs(200);
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const job of jobs) {
        if (job.status !== 'processing' || !job.started_at) continue;
        if (new Date(job.started_at).getTime() >= cutoff) continue;
        await q.updateSearchJob(job.id, {
          status: 'failed',
          error: 'Поиск не завершился за час',
          finished_at: new Date().toISOString(),
        });
        log({ event: 'search_timeout', job_id: job.id });
      }
    } catch (e) {
      log({ event: 'search_stale_error', error: String(e.message || e).slice(0, 200) });
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try {
      const row = await q.claimNextSearchJob();
      if (!row) return;
      try {
        await processVisionStep(row.id);
      } catch (e) {
        await q.updateSearchJob(row.id, {
          status: 'failed',
          error: String(e.message || e).slice(0, 300),
          finished_at: new Date().toISOString(),
        });
        log({ event: 'search_job_error', job_id: row.id, error: String(e.message || e).slice(0, 300) });
      }
    } catch (e) {
      log({ event: 'search_worker_error', error: String(e.message || e).slice(0, 300) });
    }
  }, 2000);

  console.log('[search] worker запущен');
}
