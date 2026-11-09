#!/usr/bin/env node
// Read-only baseline-отчёт о скорости пайплайна генерации.
// Читает последние N успешных рендеров (status='done') и печатает/сохраняет
// p50/p90/mean по этапам (meta.<stage>.ms) и средней себестоимости
// (renders.cost_usd + meta.cost_breakdown).
//
// Запуск (из корня репозитория, на VPS .env уже есть):
//   node --env-file=.env scripts/ops/speed-report.mjs --limit 50 --out docs/ops/speed-2026-11.md
//
// Секреты не выводятся: используется только RV_DATABASE_URL из окружения,
// в отчёт/логи попадают только агрегаты (счётчики, процентили, среднее).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { summarizeStages, formatReport } from '../../src/speedreport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { limit: 50, out: 'docs/ops/speed-2026-11.md' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      const n = Number(argv[i + 1]);
      args.limit = Number.isFinite(n) && n > 0 ? n : 50;
      i++;
    } else if (argv[i] === '--out') {
      if (argv[i + 1]) args.out = argv[i + 1];
      i++;
    }
  }
  return args;
}

const toIsoDate = () => new Date().toISOString().slice(0, 10);

function header(limit, date) {
  return [
    '# Скорость пайплайна — baseline (ноябрь 2026)',
    '',
    `- Дата замера: ${date}`,
    `- Выборка: последние N=${limit} успешных рендеров (\`status='done'\`), read-only.`,
    '- Источник: `renders.meta.<stage>.ms` (время этапов) и `renders.cost_usd` + `renders.meta.cost_breakdown` (себестоимость).',
    '- `n` — число рендеров с записанным временем этапа; `—` = данных нет (этап не писал ms или не нёс cost в выборке).',
    '- «Итого» по времени — `meta.total_ms` (в текущих данных не пишется) либо сумма записанных `meta.<stage>.ms`; это не полное wall-clock время (полное — `renders.duration_ms`, вне этого отчёта).',
    '',
  ].join('\n');
}

const VPS_COMMAND =
  'cd app && node --env-file=.env scripts/ops/speed-report.mjs --limit 50 --out docs/ops/speed-2026-11.md';

function fallbackDoc(limit, date) {
  return [
    '# Скорость пайплайна — baseline (ноябрь 2026)',
    '',
    `- Дата: ${date}`,
    '- Статус: **н/д** — локальная база недоступна, цифры не выдуманы.',
    '',
    '## Методика',
    '',
    'Отчёт считает p50/p90/mean по времени этапов и средней себестоимости за последние успешные рендеры:',
    '',
    '- время этапа — `renders.meta.<stage>.ms` (пишется для `art_direction`/`design_direction`/`cleanup`; остальные этапы имеют только cost);',
    '- себестоимость — `renders.cost_usd` (итог) и `renders.meta.cost_breakdown.<stage>` (по этапам);',
    '- общее время — `meta.total_ms` (если записан) или сумма доступных `meta.<stage>.ms`.',
    '',
    '## Запустить на VPS (read-only)',
    '',
    '```bash',
    VPS_COMMAND,
    '```',
    '',
    '| Этап | n | p50 (мс) | p90 (мс) | mean (мс) | cost_usd (среднее) |',
    '|---|---:|---:|---:|---:|---:|',
    '| — н/д, запустить на VPS — | | | | | |',
    '',
  ].join('\n');
}

async function fetchRenders(pool, limit) {
  const { rows } = await pool.query(
    `SELECT id, created_at, cost_usd, meta
       FROM renders
      WHERE status = 'done'
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = toIsoDate();
  const outPath = path.resolve(process.cwd(), args.out);

  if (!process.env.RV_DATABASE_URL) {
    const doc = fallbackDoc(args.limit, date);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, doc);
    console.error('[speed-report] RV_DATABASE_URL не задан — отчёт не собран. Запустите на VPS:');
    console.error(`  ${VPS_COMMAND}`);
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.RV_DATABASE_URL, max: 1 });
  let rows;
  try {
    rows = await fetchRenders(pool, args.limit);
  } catch (e) {
    const doc = fallbackDoc(args.limit, date);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, doc);
    console.error(`[speed-report] Не удалось прочитать renders: ${String(e.message || e).slice(0, 200)}`);
    console.error(`  ${VPS_COMMAND}`);
    await pool.end();
    process.exit(1);
  } finally {
    if (!rows) await pool.end();
  }

  await pool.end();

  const summary = summarizeStages(rows, { limit: args.limit });
  const doc = header(args.limit, date) + formatReport(summary) + '\n';

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, doc);
  process.stdout.write(doc);
}

main().catch(e => {
  console.error(`[speed-report] ${String(e.message || e).slice(0, 300)}`);
  process.exit(1);
});
