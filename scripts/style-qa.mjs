// Vision-QA одной обложки стиля.
// Запуск: node --env-file=.env scripts/style-qa.mjs <generated.png> <source.jpg> [styleName] [roomType]
import fs from 'node:fs';
import path from 'node:path';
import { visionJson } from '../src/openrouter.js';
import { detectImageExt } from '../src/imagesize.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const [, , generated, source, styleName = '', roomType = ''] = process.argv;
if (!generated || !source) {
  console.error('usage: node --env-file=.env scripts/style-qa.mjs <generated> <source> [style] [room]');
  process.exit(2);
}
const dataUrl = file => {
  const buf = fs.readFileSync(file);
  const ext = detectImageExt(buf);
  return `data:${MIME[ext] || 'image/jpeg'};base64,${buf.toString('base64')}`;
};

const system = `Ты строгий архитектурный QA и арт-директор. Сравни два изображения:
1 — исходная реальная комната, 2 — сгенерированный дизайн.
Верни строго JSON без текста вокруг:
{
  "architecture_preserved": 0-10,
  "window_exact": 0-10,
  "doors_clear": 0-10,
  "radiators_visible": 0-10,
  "door_leaf_style": 0-10,
  "style_match": 0-10,
  "color_contrast": 0-10,
  "lived_in": 0-10,
  "walls_styled": 0-10,
  "floor_style": 0-10,
  "issues": ["кратко по-русски"]
}
Правила:
- architecture_preserved: стены, потолок, камера, пропорции, число окон и дверей.
- window_exact: ширина, высота и положение окна или балконного блока как на исходнике; рисунок стекла и полотно двери могут отличаться, оценивай только размер и позицию проёма.
- doors_clear: обе двери видны, не перекрыты мебелью, проход свободен.
- radiators_visible: радиаторы под окнами видны и не закрыты мебелью или шторами.
- door_leaf_style: полотно двери может отличаться, но проём и рама на месте.
- style_match: стиль читается и не смешан с соседним.
- color_contrast: есть база, материалы и 1–2 насыщенных акцента; комната не только бежевая.
- lived_in: текстиль, подушки, книги, керамика, растение, свет — комната обжитая.
- walls_styled: все стены решены — комод, консоль, стеллаж, полки, панно, зеркало; нет пустых стен.
- floor_style: пол соответствует стилю и не повторяет старый геометрический ковёр или плитку исходника.
- issues: только реальные проблемы, максимум 5.`;

const { parsed, cost } = await visionJson({
  system,
  user: `Стиль: ${styleName || 'не указан'}. Тип комнаты: ${roomType || 'не указан'}. Оцени результат.`,
  images: [dataUrl(source), dataUrl(generated)],
});
const num = value => Math.max(0, Math.min(10, Number(value) || 0));
const result = {
  style: styleName,
  room: roomType,
  architecture_preserved: num(parsed.architecture_preserved),
  window_exact: num(parsed.window_exact),
  doors_clear: num(parsed.doors_clear),
  radiators_visible: num(parsed.radiators_visible),
  door_leaf_style: num(parsed.door_leaf_style),
  style_match: num(parsed.style_match),
  color_contrast: num(parsed.color_contrast),
  lived_in: num(parsed.lived_in),
  walls_styled: num(parsed.walls_styled),
  floor_style: num(parsed.floor_style),
  issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 5) : [],
  cost: cost ?? null,
};
// Радиаторы — предупреждение, не блокер: пользователь просил сохранять
// окно, двери и пространство, а не конкретный тип отопительного прибора.
const pass = result.architecture_preserved >= 8
  && result.window_exact >= 7
  && result.doors_clear >= 9
  && result.style_match >= 7
  && result.color_contrast >= 6
  && result.lived_in >= 6
  && result.walls_styled >= 7
  && result.floor_style >= 7;
result.pass = pass;
fs.writeFileSync(path.join(process.cwd(), 'tmp', 'style-illustrations', `qa-${path.basename(generated, path.extname(generated))}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(pass ? 0 : 1);
