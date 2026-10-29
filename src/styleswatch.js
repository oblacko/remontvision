import sharp from 'sharp';
import { putBuffer } from './storage.js';

const memory = new Map();

const escapeXml = value => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const FALLBACK = [
  { hex: '#F2EFE9', name: 'chalk white' },
  { hex: '#D8D0C4', name: 'warm greige' },
  { hex: '#C9A77C', name: 'pale oak' },
  { hex: '#A8B3A0', name: 'muted sage' },
  { hex: '#3F4340', name: 'soft charcoal' },
  { hex: '#B08D57', name: 'brushed brass' },
];

function swatchSvg(style) {
  const colors = (Array.isArray(style.swatches) && style.swatches.length ? style.swatches : FALLBACK)
    .filter(s => /^#[0-9a-f]{6}$/i.test(String(s.hex || '')))
    .slice(0, 6);
  const width = 1400;
  const height = 760;
  const gap = 24;
  const pad = 56;
  const cardW = (width - pad * 2 - gap * (colors.length - 1)) / colors.length;
  const cardH = 360;
  const top = 210;
  const cards = colors.map((color, index) => {
    const x = pad + index * (cardW + gap);
    return `<g>
      <rect x="${x}" y="${top}" width="${cardW}" height="${cardH}" rx="4" fill="${escapeXml(color.hex)}" stroke="#D8D2C8"/>
      <text x="${x}" y="${top + cardH + 48}" font-family="Arial, sans-serif" font-size="24" fill="#24221F">${escapeXml(color.name)}</text>
      <text x="${x}" y="${top + cardH + 82}" font-family="Arial, sans-serif" font-size="20" fill="#766F66">${escapeXml(color.hex.toUpperCase())}</text>
    </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#F7F5F0"/>
    <text x="${pad}" y="86" font-family="Arial, sans-serif" font-size="24" letter-spacing="5" fill="#7B746A">STYLE MATERIAL BOARD</text>
    <text x="${pad}" y="146" font-family="Arial, sans-serif" font-size="46" fill="#24221F">${escapeXml(style.name || style.key || 'Interior style')}</text>
    <text x="${pad}" y="184" font-family="Arial, sans-serif" font-size="20" fill="#766F66">Palette, materials and light temperature only. Do not copy architecture, windows, doors, layout or composition.</text>
    ${cards}
    <line x1="${pad}" y1="700" x2="${width - pad}" y2="700" stroke="#D8D2C8"/>
    <text x="${pad}" y="736" font-family="Arial, sans-serif" font-size="18" fill="#8A8278">Use as color and material guidance. The source room remains the only authority for architecture.</text>
  </svg>`;
}

export async function getStyleSwatchDataUrl(style) {
  const key = `${style?.key || style?.id || 'style'}:${JSON.stringify(style?.swatches || [])}`;
  if (memory.has(key)) return memory.get(key);
  const buffer = await sharp(Buffer.from(swatchSvg(style || {}))).png().toBuffer();
  const path = `style-swatches/${String(style?.key || style?.id || 'style').replace(/[^a-z0-9_-]/gi, '_')}.png`;
  await putBuffer(path, buffer, 'image/png');
  const url = `data:image/png;base64,${buffer.toString('base64')}`;
  memory.set(key, url);
  return url;
}
