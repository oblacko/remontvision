import test from 'node:test';
import assert from 'node:assert/strict';

// DB-free: чистая математика и форматирование отчёта о скорости пайплайна.
const { percentile, summarizeStages, formatReport } = await import('../src/speedreport.js');

test('percentile returns null for empty input', () => {
  assert.equal(percentile([], 0.5), null);
});

test('percentile returns the single value for one element', () => {
  assert.equal(percentile([7], 0.5), 7);
  assert.equal(percentile([7], 0.9), 7);
});

test('percentile p50/p90 use linear interpolation on known values', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // p50 = среднее между 5-м и 6-м элементами (rank = 4.5) => 5.5
  assert.equal(percentile(values, 0.5), 5.5);
  // p90: rank = 9 * 0.9 = 8.1 => между 9 и 10 => 9.1
  assert.equal(percentile(values, 0.9), 9.1);
});

test('percentile clamps p to the data range', () => {
  assert.equal(percentile([1, 2, 3], 0), 1);
  assert.equal(percentile([1, 2, 3], 1), 3);
});

test('summarizeStages ignores missing ms and non-numeric costs', () => {
  const rows = [
    {
      created_at: '2026-11-09T10:00:00Z',
      cost_usd: 0.12,
      meta: {
        art_direction: { ms: 1000 },
        cleanup: { ms: 2000 },
        cost_breakdown: { art_direction: 0.01, cleanup: 0.02, design: 0.09 },
      },
    },
    {
      created_at: '2026-11-09T09:00:00Z',
      cost_usd: 'не число',
      meta: {
        // нет ms ни у одного этапа, cost_breakdown частично нечисловой
        cost_breakdown: { design: 0.05, failed: null },
      },
    },
  ];
  const summary = summarizeStages(rows);
  assert.equal(summary.n, 2);

  const art = summary.stages.art_direction;
  assert.equal(art.ms.n, 1);
  assert.equal(art.ms.p50, 1000);
  assert.equal(art.ms.p90, 1000);
  assert.equal(art.ms.mean, 1000);
  // cost по art_direction: только 0.01 (у второго рендера ключа нет)
  assert.equal(art.cost_usd.n, 1);
  assert.equal(art.cost_usd.mean, 0.01);

  const design = summary.stages.design;
  assert.equal(design.ms, null);
  assert.equal(design.cost_usd.n, 2);
  assert.equal(design.cost_usd.mean, 0.07);

  // total ms = сумма доступных ms (meta.total_ms отсутствует)
  assert.equal(summary.total.ms.n, 1);
  assert.equal(summary.total.ms.p50, 3000);
  // total cost: у 1-го рендера из колонки cost_usd (0.12),
  // у 2-го колонка нечисловая → фолбэк на сумму cost_breakdown (0.05).
  assert.equal(summary.total.cost_usd.n, 2);
  assert.ok(Math.abs(summary.total.cost_usd.mean - 0.085) < 1e-9);
});

test('summarizeStages respects limit and newest-first ordering', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push({
      created_at: `2026-11-09T0${i}:00:00Z`,
      cost_usd: i,
      meta: { cleanup: { ms: i * 100 }, cost_breakdown: { cleanup: i } },
    });
  }
  // Массив уже от новых к старым не передан — функция сама сортирует по created_at desc.
  const summary = summarizeStages(rows, { limit: 3 });
  assert.equal(summary.n, 3);
  // Берутся последние 3 по created_at: i = 9, 8, 7
  assert.equal(summary.stages.cleanup.ms.n, 3);
  assert.equal(summary.stages.cleanup.ms.mean, 800);
});

test('summarizeStages on empty input yields n=0 and null total', () => {
  const summary = summarizeStages([]);
  assert.equal(summary.n, 0);
  assert.equal(summary.total.ms, null);
  assert.equal(summary.total.cost_usd, null);
});

test('formatReport includes stage names and p50/p90 headers', () => {
  const summary = summarizeStages([
    {
      created_at: '2026-11-09T10:00:00Z',
      cost_usd: 0.1,
      meta: { cleanup: { ms: 1500 }, cost_breakdown: { cleanup: 0.1, design: 0.05 } },
    },
  ]);
  const md = formatReport(summary);
  assert.match(md, /Этап/);
  assert.match(md, /p50/);
  assert.match(md, /p90/);
  assert.match(md, /mean/);
  assert.match(md, /cleanup/);
  assert.match(md, /design/);
  assert.match(md, /Итого|total/);
});
