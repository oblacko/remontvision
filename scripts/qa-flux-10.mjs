// Vision-QA по результатам scripts/tune-flux-10.mjs.
// Запуск: node --env-file=.env scripts/qa-flux-10.mjs
import fs from 'node:fs';
import path from 'node:path';
import { visionJson } from '../src/openrouter.js';
import { detectImageExt } from '../src/imagesize.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const dir = path.join(process.cwd(), 'tmp', 'flux-tests');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
const dataUrl = buf => `data:${MIME[detectImageExt(buf)] || 'image/jpeg'};base64,${buf.toString('base64')}`;

const sys = `Ты строгий арт-директор интерьерного бюро и QA-рецензент. Сравни два изображения: 1 — исходная реальная комната, 2 — сгенерированный дизайн.
Верни строго JSON без текста вокруг:
{"style_match":0-10,"photorealism":0-10,"architecture_preserved":0-10,"scale_honesty":0-10,"authorial_quality":0-10,"issues":["кратко по-русски"]}
style_match — насколько результат соответствует заявленному стилю.
photorealism — похоже ли на реальную фотографию, а не на CGI/рендер.
architecture_preserved — сохранены ли стены, окна, двери, потолок, ракурс и пропорции.
scale_honesty — честен ли масштаб мебели и проходов относительно комнаты.
authorial_quality — уровень авторского дизайна: цельная композиция, свет, материалы, стилинг, а не шаблонный шоурум.
issues — только реальные проблемы, максимум 3.`;

const out = [];
for (const item of report.items) {
  if (!item.ok || !item.file) continue;
  const src = fs.readFileSync(path.join(process.cwd(), item.source));
  const gen = fs.readFileSync(path.join(dir, item.file));
  try {
    const { parsed, cost } = await visionJson({
      system: sys,
      user: `Стиль: ${item.style}. Тип комнаты: ${item.room_type}. Размеры: ${JSON.stringify(item.dimensions)}. Оцени результат.`,
      images: [dataUrl(src), dataUrl(gen)],
    });
    const num = v => Math.max(0, Math.min(10, Number(v) || 0));
    const row = {
      n: item.n, key: item.key, style: item.style, room_type: item.room_type,
      style_match: num(parsed.style_match),
      photorealism: num(parsed.photorealism),
      architecture_preserved: num(parsed.architecture_preserved),
      scale_honesty: num(parsed.scale_honesty),
      authorial_quality: num(parsed.authorial_quality),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 3) : [],
      cost: cost ?? null,
    };
    out.push(row);
    console.log(`${row.n} ${row.style}/${row.room_type}: style ${row.style_match} · photo ${row.photorealism} · arch ${row.architecture_preserved} · scale ${row.scale_honesty} · authorial ${row.authorial_quality}`);
  } catch (e) {
    out.push({ n: item.n, key: item.key, error: String(e.message || e).slice(0, 300) });
    console.log(`${item.n} QA FAIL: ${e.message}`);
  }
}
const ok = out.filter(r => !r.error);
const avg = key => ok.length ? (ok.reduce((s, r) => s + r[key], 0) / ok.length).toFixed(2) : '0';
const summary = { count: ok.length, avg_style: avg('style_match'), avg_photo: avg('photorealism'), avg_arch: avg('architecture_preserved'), avg_scale: avg('scale_honesty'), avg_authorial: avg('authorial_quality'), items: out };
fs.writeFileSync(path.join(dir, 'report-qa.json'), JSON.stringify(summary, null, 2));
console.log(`\nAVG style ${summary.avg_style} · photo ${summary.avg_photo} · arch ${summary.avg_arch} · scale ${summary.avg_scale} · authorial ${summary.avg_authorial}`);
process.exit(0);
