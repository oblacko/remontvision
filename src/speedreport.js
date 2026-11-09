// Отчёт о скорости пайплайна генерации (baseline).
// Чистый модуль без БД: берёт готовые строки рендеров и считает
// p50/p90/mean по времени этапов (meta.<stage>.ms) и средней себестоимости
// (renders.cost_usd и meta.cost_breakdown.<stage>).
//
// Время этапов хранится не у всех этапов: ms есть только у тех, кто его пишет
// (art_direction / design_direction / cleanup); остальные имеют только cost —
// пропуски обрабатываются как «нет данных» (n=0, stat=null).

// Канонический порядок этапов в отчёте. Включает все ключи cost_breakdown
// (из src/jobs.js) и design_direction (ms-only, стоимость складывается в art_direction).
export const STAGES = [
  'art_direction',
  'design_direction',
  'cleanup',
  'layout',
  'repair_scope',
  'design',
  'design_retry',
  'architect_review',
  'architecture_qa',
  'product_qa',
  'render_analysis',
  'failed',
];

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const mean = values => {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
};

// Процентиль с линейной интерполяцией (numpy `linear` / R-7):
// rank = (n - 1) * p, значение интерполируется между floor/ceil соседями.
// p задаётся в [0,1] (0.5 — медиана, 0.9 — p90). Пустой вход → null.
export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

// Сводная статистика по набору чисел: { n, p50, p90, mean } или null, если данных нет.
function statOf(values) {
  const vals = values.filter(v => num(v) != null);
  if (!vals.length) return null;
  return { n: vals.length, p50: percentile(vals, 0.5), p90: percentile(vals, 0.9), mean: mean(vals) };
}

// Общая длительность рендера в мс: meta.total_ms, если записано,
// иначе сумма доступных meta.<stage>.ms.
function totalMsOf(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const explicit = num(meta.total_ms);
  if (explicit != null) return explicit;
  let sum = null;
  for (const key of Object.keys(meta)) {
    const stage = meta[key];
    const ms = stage && typeof stage === 'object' ? num(stage.ms) : null;
    if (ms != null) sum = (sum || 0) + ms;
  }
  return sum;
}

// Полная себестоимость рендера: колонка cost_usd, иначе сумма cost_breakdown.
function totalCostOf(row) {
  const col = num(row.cost_usd);
  if (col != null) return col;
  const cb = row.meta?.cost_breakdown;
  if (!cb || typeof cb !== 'object') return null;
  let sum = null;
  for (const v of Object.values(cb)) {
    const n = num(v);
    if (n != null) sum = (sum || 0) + n;
  }
  return sum;
}

// Статистика средней себестоимости по набору чисел: { n, mean } или null.
function costStatOf(values) {
  const vals = values.filter(v => num(v) != null);
  if (!vals.length) return null;
  return { n: vals.length, mean: mean(vals) };
}

/**
 * Сводка по последним `limit` рендерам (сортируются по created_at DESC).
 * @param {Array<{created_at?: string|Date, cost_usd?: number, meta?: object}>} renders
 * @param {{limit?: number}} [options]
 * @returns {{
 *   n: number,
 *   total: { ms: object|null, cost_usd: {n:number, mean:number}|null },
 *   stages: Record<string, { ms: object|null, cost_usd: {n:number, mean:number}|null }>
 * }}
 */
export function summarizeStages(renders, { limit = 50 } = {}) {
  const rows = Array.isArray(renders) ? renders.slice() : [];
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const subset = rows.slice(0, Math.max(0, limit));

  const stageNames = new Set(STAGES);
  // Добираем ключи, которых нет в каноническом списке (будущие этапы).
  for (const row of subset) {
    const meta = row?.meta;
    if (!meta || typeof meta !== 'object') continue;
    for (const key of Object.keys(meta)) {
      if (meta[key] && typeof meta[key] === 'object' && num(meta[key].ms) != null) stageNames.add(key);
    }
    const cb = meta.cost_breakdown;
    if (cb && typeof cb === 'object') for (const key of Object.keys(cb)) if (num(cb[key]) != null) stageNames.add(key);
  }

  const stages = {};
  const totalMs = [];
  const totalCost = [];

  for (const row of subset) {
    const meta = row?.meta || {};
    totalMs.push(totalMsOf(meta));
    totalCost.push(totalCostOf(row));
  }

  for (const name of stageNames) {
    const msValues = [];
    const costValues = [];
    for (const row of subset) {
      const meta = row?.meta || {};
      const stage = meta[name];
      const ms = stage && typeof stage === 'object' ? num(stage.ms) : null;
      if (ms != null) msValues.push(ms);
      const cost = num(meta.cost_breakdown?.[name]);
      if (cost != null) costValues.push(cost);
    }
    stages[name] = { ms: statOf(msValues), cost_usd: costStatOf(costValues) };
  }

  return {
    n: subset.length,
    total: { ms: statOf(totalMs), cost_usd: costStatOf(totalCost) },
    stages,
  };
}

const fmtMs = v => (num(v) == null ? '—' : String(Math.round(v)));
const fmtUsd = v => (num(v) == null ? '—' : v.toFixed(3));

/**
 * Markdown-таблица по сводке summarizeStages: строки этапов + строка «Итого».
 */
export function formatReport(summary) {
  const lines = [];
  lines.push('| Этап | n | p50 (мс) | p90 (мс) | mean (мс) | cost_usd (среднее) |');
  lines.push('|---|---:|---:|---:|---:|---:|');

  const ordered = [...STAGES.filter(s => s in summary.stages)];
  for (const extra of Object.keys(summary.stages).sort()) {
    if (!ordered.includes(extra)) ordered.push(extra);
  }

  const push = (label, st) => {
    if (!st.ms && !st.cost_usd) return;
    const ms = st.ms;
    const cost = st.cost_usd;
    lines.push(`| ${label} | ${ms ? ms.n : '—'} | ${fmtMs(ms?.p50)} | ${fmtMs(ms?.p90)} | ${fmtMs(ms?.mean)} | ${cost ? fmtUsd(cost.mean) : '—'} |`);
  };

  for (const name of ordered) push(name, summary.stages[name]);
  push('**Итого**', summary.total);

  return lines.join('\n');
}
