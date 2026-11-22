// Оркестратор обложек: генерирует по одному стилю, проверяет vision-QA,
// при провале делает ещё одну попытку. Лимит генераций — 100.
// Запуск: node --env-file=.env scripts/run-style-illustrations.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = path.join(process.cwd(), 'tmp', 'style-illustrations');
fs.mkdirSync(OUT, { recursive: true });
const REPORT = path.join(OUT, 'qa-report.json');
const MAX_GENERATIONS = Number(process.env.STYLE_MAX_GENERATIONS || 100);

// 32 стиля: по 8 на комнату, чтобы библиотека показывала разные пространства.
const PLAN = [
  ['modern', 'living'], ['loft', 'living'], ['scandinavian', 'living'], ['provence', 'living'],
  ['minimalism', 'living'], ['neoclassic', 'living'], ['boho', 'living'], ['mediterranean', 'living'],
  ['japandi', 'bedroom'], ['baroque', 'bedroom'], ['art_nouveau', 'bedroom'], ['english', 'bedroom'],
  ['classic', 'bedroom'], ['dark_academia', 'bedroom'], ['grandmillennial', 'bedroom'], ['coastal', 'bedroom'],
  ['country', 'study'], ['art_deco', 'study'], ['eclectic', 'study'], ['eco', 'study'],
  ['dark_contemporary', 'study'], ['modern_farmhouse', 'study'], ['high_tech', 'study'], ['bauhaus', 'study'],
  ['memphis_accent', 'dining'], ['mid_century', 'dining'], ['soviet_modern', 'dining'], ['space_age', 'dining'],
  ['desert_modern', 'dining'], ['tropical_modern', 'dining'], ['neo_deco', 'dining'], ['chalet', 'dining'],
];

const only = process.env.STYLE_ONLY ? new Set(String(process.env.STYLE_ONLY).split(',').map(s => s.trim())) : null;
const plan = only ? PLAN.filter(([id]) => only.has(id)) : PLAN;

let generationCount = 0;
const results = [];
const done = new Set();

function run(args, timeout = 300000) {
  const child = spawnSync(process.execPath, ['--env-file=.env', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  });
  return { status: child.status, stdout: child.stdout || '', stderr: child.stderr || '' };
}

function parseQa(stdout) {
  const start = stdout.lastIndexOf('\n{');
  const raw = start >= 0 ? stdout.slice(start + 1) : stdout;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

for (const [styleId, room] of plan) {
  if (done.has(styleId)) continue;
  let passed = false;
  let attempt = 0;
  let lastQa = null;
  while (!passed && attempt < 2 && generationCount < MAX_GENERATIONS) {
    attempt++;
    generationCount++;
    console.log(`\n=== ${styleId} / ${room} · попытка ${attempt} · генерация ${generationCount}/${MAX_GENERATIONS} ===`);
    const gen = run([
      'scripts/generate-style-illustrations.mjs',
      `--styles=${styleId}`,
      `--rooms=${room}`,
      '--source=assets/zal.jpg',
      ...(room === 'bedroom' ? [] : ['--keep-furniture=true']),
    ]);
    if (gen.status !== 0) {
      console.log(gen.stderr.slice(-1000));
      break;
    }
    const source = room === 'bedroom' ? 'web/dist/images/room-before.webp' : 'assets/zal.jpg';
    const image = path.join('web/dist/images', `style-${styleId}.png`);
    const qa = run(['scripts/style-qa.mjs', image, source, styleId, room]);
    lastQa = parseQa(qa.stdout);
    console.log(JSON.stringify(lastQa, null, 2));
    if (qa.status === 0 && lastQa?.pass) passed = true;
  }
  results.push({ styleId, room, passed, attempts: attempt, qa: lastQa });
  done.add(styleId);
  fs.writeFileSync(REPORT, JSON.stringify({ generated: generationCount, results }, null, 2));
}

const passed = results.filter(r => r.passed).length;
console.log(`\nDONE: ${passed}/${results.length} passed, ${generationCount} generations`);
process.exit(0);
