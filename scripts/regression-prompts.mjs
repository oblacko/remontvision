// Регрессия промтов: 5 комнат × 4 стиля, без платных вызовов.
// Сравнивает текущий текст промта с зафиксированным baseline и пишет diff.
//   node scripts/regression-prompts.mjs            # проверить
//   node scripts/regression-prompts.mjs --update   # обновить baseline (осознанно)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.OPENROUTER_API_KEY ||= 'regression-no-calls';

const { buildPrompt } = await import('../src/openrouter.js');
const { getPromptConfig } = await import('../src/promptconfig.js');
const { buildRoomVariability, variabilityPrompt } = await import('../src/variability.js');

const OUT_DIR = path.join(process.cwd(), 'docs', 'regression');
const BASELINE = path.join(OUT_DIR, 'baseline.json');
const LAST_RUN = path.join(OUT_DIR, 'last-run.json');
const LAST_DIFF = path.join(OUT_DIR, 'last-diff.txt');

const ROOMS = [
  { roomType: 'Гостиная (зал)', dimensions: { width: 5.2, length: 4.1, height: 2.7, orientation: 'окно на длинной стене' } },
  { roomType: 'Спальня', dimensions: { width: 3.6, length: 4.2, height: 2.7, orientation: 'окно на короткой стене' }, bedLength: 2 },
  { roomType: 'Кухня', dimensions: { width: 3.1, length: 4.6, height: 2.7, orientation: 'окно в торце' } },
  { roomType: 'Санузел', dimensions: { width: 2, length: 2.6, height: 2.7, orientation: 'без окна' } },
  { roomType: 'Кабинет', dimensions: { width: 2.8, length: 3.4, height: 2.7, orientation: 'окно слева от входа' } },
];
const STYLES = ['Современный минимализм', 'Скандинавский', 'Джапанди', 'Лофт'];

const hash = text => crypto.createHash('sha256').update(text).digest('hex');

function buildRun() {
  const promptConfig = getPromptConfig();
  const cases = [];
  for (const room of ROOMS) {
    for (const style of STYLES) {
      const id = `${room.roomType} / ${style}`;
      const variability = buildRoomVariability({ seed: id, styleName: style, keepFurniture: true });
      const prompt = buildPrompt({
        style,
        roomType: room.roomType,
        priceTier: 'comfort',
        budget: 150,
        keepFurniture: true,
        useCatalog: false,
        imageMap: [{ role: 'source room' }],
        dimensions: room.bedLength ? { ...room.dimensions, bedLength: room.bedLength } : room.dimensions,
        accentHex: variability.accentHex,
        novelty: variabilityPrompt(variability),
      });
      cases.push({
        id,
        roomType: room.roomType,
        style,
        dimensions: room.dimensions,
        hash: hash(prompt),
        length: prompt.length,
        prompt,
      });
    }
  }
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    prompt_config_hash: hash(JSON.stringify(promptConfig)),
    cases,
  };
}

function naiveDiff(before, after) {
  const a = before.prompt.split('\n');
  const b = after.prompt.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA -= 1; endB -= 1; }

  const context = 2;
  const from = Math.max(0, start - context);
  const aTo = Math.min(a.length, endA + 1 + context);
  const bTo = Math.min(b.length, endB + 1 + context);
  const out = [`=== ${after.id} ===`, `@@ -${from + 1},${aTo - from} +${from + 1},${bTo - from} @@`];
  for (let i = from; i < start; i += 1) out.push(`  ${a[i]}`);
  for (let i = start; i <= endA; i += 1) out.push(`- ${a[i]}`);
  for (let i = start; i <= endB; i += 1) out.push(`+ ${b[i]}`);
  const tailA = a.slice(endA + 1, aTo);
  const tailB = b.slice(endB + 1, bTo);
  const tail = Math.min(tailA.length, tailB.length);
  for (let i = 0; i < tail; i += 1) out.push(`  ${tailB[i]}`);
  return out.join('\n');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const current = buildRun();
const update = process.argv.includes('--update');

if (update) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  if (fs.existsSync(LAST_DIFF)) fs.rmSync(LAST_DIFF);
  console.log(`baseline обновлён: ${current.cases.length} конфигураций → ${path.relative(process.cwd(), BASELINE)}`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`Нет baseline ${path.relative(process.cwd(), BASELINE)}. Сначала: node scripts/regression-prompts.mjs --update`);
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const byId = new Map(baseline.cases.map(item => [item.id, item]));
const diffs = [];
for (const item of current.cases) {
  const before = byId.get(item.id);
  if (!before || before.hash !== item.hash) diffs.push({ before, after: item });
}
fs.writeFileSync(LAST_RUN, JSON.stringify(current, null, 2) + '\n');

if (!diffs.length) {
  if (fs.existsSync(LAST_DIFF)) fs.rmSync(LAST_DIFF);
  console.log(`OK: ${current.cases.length}/${current.cases.length} промтов совпали с baseline`);
  process.exit(0);
}

const header = `baseline: ${baseline.generated_at}\ncurrent:  ${current.generated_at}\nconfig hash: ${baseline.prompt_config_hash} → ${current.prompt_config_hash}\n`;
const diffText = [
  header,
  ...diffs.map(({ before, after }) => before ? naiveDiff(before, after) : `=== ${after.id} ===\n+ новый кейс без baseline`),
].join('\n\n');
fs.writeFileSync(LAST_DIFF, diffText + '\n');
console.log(`DIRTY: изменены ${diffs.length} из ${current.cases.length} промтов`);
console.log(`diff: ${path.relative(process.cwd(), LAST_DIFF)}`);
for (const { after } of diffs) console.log(`- ${after.id}`);
process.exit(1);
