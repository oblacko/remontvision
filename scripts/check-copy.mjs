#!/usr/bin/env node
// Проверка копирайта пользовательских текстов.
//
// Правила (источник истины — «Решения владельца» в плане):
//   - в пользовательских текстах нет слов «генераци…» и фразы «реальные товары»;
//   - слово «смета» запрещено, кроме:
//       (a) public/offer.html в отрицательной формулировке («Сервис не составляет смету»);
//       (b) строк с пометками «демо-пример» / «демонстрационный пример».
//
// Проверяются: web/src/**/*.{ts,tsx}, web/index.html, public/*.html.
// Запуск: npm run check:copy  (exit 1 при нарушениях, 0 если чисто).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Файлы, которые пока не входят в проверку (не пользовательский текст или
// отложены на другие задачи). При выполнении Task 0.8 строки offer.html и
// privacy.html убираются из этого списка.
const EXCLUDED = new Set([
  'web/src/pages/Admin.tsx', // админ-консоль — внутренний, не пользовательский текст
  'public/app.html',         // устаревший редактор /app: 301 на главную, только dev-fallback
  'public/offer.html',       // Task 0.8 (оферта) — добавит явное «не составляет смету»
  'public/privacy.html',     // Task 0.8 (политика конфиденциальности)
]);

// Убирает //- и /* */-комментарии, не трогая текст внутри строк и шаблонов.
function stripJsComments(source) {
  let out = '';
  let i = 0;
  let quote = null; // null | "'" | '"' | '`'
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && next === '/') {
      out += ' ';
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      out += ' ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// Убирает <!-- -->-комментарии в HTML.
function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, ' ');
}

// files: Array<{ path: string, content: string }>.
// Возвращает Array<{ path, line, word }>.
export function findCopyViolations(files) {
  const violations = [];
  const matchWord = (line, re) => {
    const m = line.match(re);
    return m ? m[0].trim() : null;
  };
  for (const file of files) {
    const isSource = /\.(ts|tsx)$/.test(file.path);
    const text = isSource ? stripJsComments(file.content) : stripHtmlComments(file.content);
    const isOffer = file.path.replaceAll('\\', '/').endsWith('offer.html');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineNo = i + 1;
      if (/генераци/i.test(line)) {
        violations.push({ path: file.path, line: lineNo, word: matchWord(line, /генераци[а-яё]*/i) || 'генераци…' });
      }
      if (/реальные\s+товары/i.test(line)) {
        violations.push({ path: file.path, line: lineNo, word: matchWord(line, /реальные\s+товары/i) || 'реальные товары' });
      }
      if (/смет[ауеыой]/i.test(line)) {
        const negates = /не[^.!?\n]{0,50}смет/i.test(line);
        const demo = /демо[- ]пример|демонстрационный\s+пример/i.test(line);
        if (!((isOffer && negates) || demo)) {
          violations.push({ path: file.path, line: lineNo, word: matchWord(line, /смет[а-яё]*/i) || 'смета…' });
        }
      }
    }
  }
  return violations;
}

export function collectFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).replaceAll(path.sep, '/');
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !EXCLUDED.has(rel)) {
        files.push({ path: rel, content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(path.join(ROOT, 'web', 'src'));
  for (const rel of ['web/index.html']) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) files.push({ path: rel, content: fs.readFileSync(full, 'utf8') });
  }
  const pubDir = path.join(ROOT, 'public');
  if (fs.existsSync(pubDir)) {
    for (const entry of fs.readdirSync(pubDir)) {
      if (!entry.endsWith('.html')) continue;
      const rel = `public/${entry}`;
      if (EXCLUDED.has(rel)) continue;
      files.push({ path: rel, content: fs.readFileSync(path.join(pubDir, entry), 'utf8') });
    }
  }
  return files;
}

function main() {
  const files = collectFiles();
  const violations = findCopyViolations(files);
  if (violations.length === 0) {
    console.log(`check-copy: ok (${files.length} files)`);
    process.exit(0);
  }
  for (const v of violations) {
    console.log(`${v.path}:${v.line}: ${v.word}`);
  }
  console.log(`check-copy: ${violations.length} violation(s)`);
  process.exit(1);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) main();
