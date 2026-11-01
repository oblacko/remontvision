import sharp from 'sharp';
import { generateTextImage, visionJson } from './openrouter.js';
import { getActivePrompt } from './searchprompts.js';

export function buildGridPrompt(objects, template) {
  const list = Array.isArray(objects) ? objects : [];
  const lines = list.map((o, i) =>
    `${i + 1}. ${o.label} — ${o.description || ''} (${[o.color, o.material, o.size].filter(Boolean).join(', ')})`
  );
  const block = lines.join('\n');
  const text = String(template || '');
  if (text.includes('{objects}')) return text.replace('{objects}', block);
  return `${text}\n\nТовары:\n${block}`;
}

export async function generateGridImage(objects, { prompt, model, resolution, aspect = '21:9' } = {}) {
  const finalPrompt = buildGridPrompt(objects, prompt || getActivePrompt('grid').prompt);
  const out = await generateTextImage({
    prompt: finalPrompt,
    aspectRatio: aspect,
    model,
    resolution,
  });
  return { b64: out.b64, cost: out.cost, model: out.model };
}

async function gridMetrics(buffer, rows, cols, margin) {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  const cellW = meta.width / cols;
  const cellH = meta.height / rows;
  const pad = Math.round(margin * Math.min(cellW, cellH));
  return { width: meta.width, height: meta.height, cellW, cellH, pad };
}

export async function sliceGrid(buffer, { rows = 2, cols = 5, margin = 0.045 } = {}) {
  const { cellW, cellH, pad } = await gridMetrics(buffer, rows, cols, margin);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = Math.round(c * cellW + pad);
      const top = Math.round(r * cellH + pad);
      const width = Math.max(1, Math.round(cellW - 2 * pad));
      const height = Math.max(1, Math.round(cellH - 2 * pad));
      const cell = await sharp(buffer, { failOn: 'none' })
        .extract({ left, top, width, height })
        .jpeg({ quality: 90 })
        .toBuffer();
      cells.push({ index: r * cols + c, buffer: cell });
    }
  }
  return cells;
}

export async function drawGridOverlay(buffer, { rows = 2, cols = 5, margin = 0.045 } = {}) {
  const { width, height, cellW, cellH, pad } = await gridMetrics(buffer, rows, cols, margin);
  const shapes = [
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#00a3ff" stroke-width="3"/>`,
  ];

  for (let c = 1; c < cols; c++) {
    const x = c * cellW;
    shapes.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#00a3ff" stroke-width="3"/>`);
  }
  for (let r = 1; r < rows; r++) {
    const y = r * cellH;
    shapes.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#00a3ff" stroke-width="3"/>`);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      shapes.push(
        `<rect x="${c * cellW + pad}" y="${r * cellH + pad}" width="${cellW - 2 * pad}" height="${cellH - 2 * pad}" fill="none" stroke="#ffb000" stroke-width="2" stroke-dasharray="6 6"/>`
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join('')}</svg>`;

  return sharp(buffer, { failOn: 'none' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function checkGridCell(cellBuffer, expectedLabel, { prompt, model } = {}) {
  const dataUrl = 'data:image/jpeg;base64,' + Buffer.from(cellBuffer).toString('base64');
  const sys = String(prompt || getActivePrompt('cell').prompt).replaceAll('{label}', String(expectedLabel || ''));
  const { parsed, cost } = await visionJson({
    system: sys,
    user: `Проверь ячейку. Ожидаемый товар: ${expectedLabel || ''}`,
    images: [dataUrl],
    model,
  });
  return {
    ok: Boolean(parsed.ok),
    label: String(parsed.label || '').slice(0, 160),
    category: String(parsed.category || '').slice(0, 40),
    description: String(parsed.description || '').slice(0, 300),
    cost,
  };
}
