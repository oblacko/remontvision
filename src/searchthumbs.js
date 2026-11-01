import sharp from 'sharp';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function validBox(box) {
  if (!box || !Array.isArray(box.bbox) || box.bbox.length < 4) return null;
  const [x, y, w, h] = box.bbox.map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

export async function composeCard(buffer, { size = 1024, background = '#ffffff' } = {}) {
  const pad = 48;
  const inner = size - pad * 2;
  const fitted = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  const { width, height } = await sharp(fitted).metadata();

  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([
      {
        input: fitted,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

export async function drawBboxOverlay(buffer, boxes) {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  const W = meta.width;
  const H = meta.height;

  const shapes = [];
  for (const box of Array.isArray(boxes) ? boxes : []) {
    const valid = validBox(box);
    if (!valid) continue;
    const { x, y, w, h } = valid;
    shapes.push(
      `<rect x="${x * W}" y="${y * H}" width="${w * W}" height="${h * H}" fill="none" stroke="#ff2d55" stroke-width="4"/>`
    );
    const label = box.label == null ? '' : String(box.label);
    if (label) {
      shapes.push(
        `<text x="${x * W + 6}" y="${y * H + 22}" font-size="20" fill="#ff2d55" font-family="sans-serif">${escapeXml(label)}</text>`
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shapes.join('')}</svg>`;

  return sharp(buffer, { failOn: 'none' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
