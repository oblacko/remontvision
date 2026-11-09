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

const DEFAULT_LIMIT = 50;
const DEFAULT_OUT = 'docs/ops/speed-2026-11.md';

// Парсит argv-хвост (после `node script.mjs`). Бросает Error с понятным текстом
// на некорректный/неизвестный аргумент; `--out` не «съедает» следующий флаг.
export function parseArgs(argv) {
  const args = { limit: DEFAULT_LIMIT, out: DEFAULT_OUT, force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      const raw = argv[i + 1];
      if (raw === undefined || raw.startsWith('--')) {
        throw new Error(`--limit требует число (например --limit 50), получено: ${raw ?? 'ничего'}`);
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Некорректное значение --limit: ${raw} (нужно целое число > 0)`);
      }
      args.limit = n;
      i++;
    } else if (arg === '--out') {
      const raw = argv[i + 1];
      if (raw === undefined || raw.startsWith('--')) {
        throw new Error(`--out требует путь (например --out ${DEFAULT_OUT}), получено: ${raw ?? 'ничего'}`);
      }
      args.out = raw;
      i++;
    } else if (arg === '--force') {
      args.force = true;
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }
  return args;
}

const toIsoDate = () => new Date().toISOString().slice(0, 10);

// `requested` — запрошенный лимит, `actual` — реально выбранное число строк.
function header(requested, actual, date) {
  return [
    '# Скорость пайплайна — baseline (ноябрь 2026)',
    '',
    `- Дата замера: ${date}`,
    `- Выборка: ${actual} из ${requested} запрошенных успешных рендеров (\`status='done'\`), read-only.`,
    '- Источник: `renders.meta.<stage>.ms` (время этапов) и `renders.cost_usd` + `renders.meta.cost_breakdown` (себестоимость).',
    '- `n` — число рендеров с записанным временем этапа; `—` = данных нет (этап не писал ms или не нёс cost в выборке).',
    '- «Итого» по времени — `meta.total_ms` (в текущих данных не пишется) либо сумма записанных `meta.<stage>.ms`; это не полное wall-clock время (полное — `renders.duration_ms`, вне этого отчёта).',
    '',
    '',
  ].join('\n');
}

const COST_NOTE =
  'Примечание: средняя себестоимость (`cost_usd`) считается по числу рендеров с числовым значением в `cost_breakdown` — оно может отличаться от `n` по времени этапа (ms пишут не все этапы).';

const VPS_COMMAND =
  'cd app && node --env-file=.env scripts/ops/speed-report.mjs --limit 50 --out docs/ops/speed-2026-11.md';

function fallbackDoc(limit, date) {
  return [
    '# Скорость пайплайна — baseline (ноябрь 2026)',
    '',
    `- Дата: ${date}`,
    '- Статус: **н/д** — база недоступна, цифры не выдуманы.',
    '',
    '## Методика',
    '',
    `Отчёт считает p50/p90/mean по времени этапов и средней себестоимости за последние (запрошено N=${limit}) успешные рендеры:`,
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

// Пишет fallback-док, только если целевой файл не существует или явно --force.
// Иначе оставляет существующий baseline нетронутым.
function writeFallbackIfAllowed(outPath, doc, force) {
  if (force || !fs.existsSync(outPath)) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, doc);
    return;
  }
  console.error(`[speed-report] Не перезаписываю существующий отчёт: ${outPath}. Для принудительной записи передайте --force.`);
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
    process.stdout.write(doc);
    writeFallbackIfAllowed(outPath, doc, args.force);
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
    process.stdout.write(doc);
    writeFallbackIfAllowed(outPath, doc, args.force);
    console.error(`[speed-report] Не удалось прочитать renders: ${String(e.message || e).slice(0, 200)}`);
    console.error(`  ${VPS_COMMAND}`);
    await pool.end();
    process.exit(1);
  } finally {
    if (!rows) await pool.end();
  }

  await pool.end();

  const summary = summarizeStages(rows, { limit: args.limit });
  const doc = header(args.limit, summary.n, date) + formatReport(summary) + '\n\n' + COST_NOTE + '\n';

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, doc);
  process.stdout.write(doc);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(e => {
    console.error(`[speed-report] ${String(e.message || e).slice(0, 300)}`);
    process.exit(1);
  });
}
