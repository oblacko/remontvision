// Собирает llms-full.txt из README, AGENTS и docs/*.md.
// Запуск: npm run docs:llms
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const files = [
  'README.md',
  'AGENTS.md',
  'llms.txt',
  'docs/ARCHITECTURE.md',
  'docs/GENERATION.md',
  'docs/PROMPT-RULES.md',
  'docs/CATALOG.md',
  'docs/ADMIN.md',
  'docs/API.md',
  'docs/OPERATIONS.md',
  'docs/ROADMAP.md',
  'docs/DECISIONS.md',
  'docs/AI-INTEGRATION.md',
  'docs/HISTORY.md',
];

const out = [
  '# Remontvision — full LLM context',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'This file concatenates the project documentation for LLM ingestion.',
  'The canonical source is the repository; if this file is stale, read the linked files.',
  '',
];

for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  out.push('', '---', '', `<!-- source: ${file} -->`, '', fs.readFileSync(full, 'utf8').trim(), '');
}

fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), out.join('\n') + '\n');
console.log(`llms-full.txt: ${files.filter(f => fs.existsSync(path.join(ROOT, f))).length} files`);
