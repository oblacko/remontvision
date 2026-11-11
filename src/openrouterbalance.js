// Мониторинг баланса OpenRouter: раз в 10 минут читаем GET /api/v1/key.
// При низком остатке пишем алерт в лог; снимок отдаётся в /api/admin/metrics.
import { fetchKeyInfo, log } from './openrouter.js';

const LOW_CREDITS_THRESHOLD = Number(process.env.OPENROUTER_LOW_CREDITS_USD || 5);

let snapshot = { checked_at: null, ok: null, limit_remaining: null, usage_daily: null, usage_monthly: null, error: null };
let timer = null;

export function getBalanceSnapshot() {
  return { ...snapshot, low_threshold_usd: LOW_CREDITS_THRESHOLD };
}

export async function refreshBalance() {
  try {
    const data = await fetchKeyInfo();
    if (data?.mock) {
      snapshot = { checked_at: new Date().toISOString(), ok: true, limit_remaining: null, usage_daily: null, usage_monthly: null, error: null };
      return snapshot;
    }
    const limit = typeof data?.limit_remaining === 'number' ? data.limit_remaining : null;
    snapshot = {
      checked_at: new Date().toISOString(),
      ok: true,
      limit_remaining: limit,
      usage_daily: typeof data?.usage_daily === 'number' ? data.usage_daily : null,
      usage_monthly: typeof data?.usage_monthly === 'number' ? data.usage_monthly : null,
      error: null,
    };
    if (limit !== null && limit < LOW_CREDITS_THRESHOLD) {
      log({ event: 'openrouter_balance_low', limit_remaining: limit, threshold: LOW_CREDITS_THRESHOLD, usage_daily: snapshot.usage_daily });
    }
    return snapshot;
  } catch (e) {
    snapshot = { ...snapshot, checked_at: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 300) };
    log({ event: 'openrouter_balance_error', error: snapshot.error });
    return snapshot;
  }
}

export function startBalanceMonitor(intervalMs = 10 * 60 * 1000) {
  if (timer) return;
  void refreshBalance();
  timer = setInterval(() => { void refreshBalance(); }, intervalMs);
  if (timer.unref) timer.unref();
}

export function stopBalanceMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
