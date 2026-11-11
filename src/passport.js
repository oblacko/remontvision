// Паспорт дизайна: документ «что в этом интерьере и что проверить на объекте».
// Собирается из уже полученного разбора (breakdown) и направления — без новых
// AI-вызовов. Отдельно от роадмапа: паспорт описывает решения, роадмап — порядок работ.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const SURFACE_TITLES = {
  floor: 'Пол',
  walls: 'Стены',
  ceiling: 'Потолок',
  doors: 'Двери',
  windows: 'Окна',
};

const LIMITS_TEXT = [
  'Паспорт собран по изображению, сгенерированному ИИ. Это не рабочая документация,',
  'не смета и не инженерный проект: размеры, материалы и узлы нужно проверить на объекте.',
  'Цвета на экране и в печати могут отличаться от реальных образцов.',
];

const clean = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const color = value => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : null);

export function buildPassport({ render, room, now = new Date() } = {}) {
  const analysis = render?.analysis || {};
  const breakdown = analysis.breakdown || null;
  const direction = render?.meta?.design_direction || room?.design_direction || null;
  const dimensions = render?.meta?.room_dimensions_estimate || null;

  const surfaces = Array.isArray(analysis.surfaces)
    ? analysis.surfaces
        .map(surface => ({
          key: String(surface?.key || surface?.surface || '').toLowerCase(),
          material: clean(surface?.material, 160),
          look: clean(surface?.look || surface?.finish || surface?.color, 160),
        }))
        .filter(surface => surface.material || surface.look)
    : [];

  const objects = Array.isArray(breakdown?.objects)
    ? breakdown.objects.slice(0, 12).map(object => ({
        label: clean(object.label, 80),
        category: clean(object.category, 40),
        description: clean(object.description, 240),
        note: clean(object.note, 240),
        confidence: Number.isFinite(object.confidence) ? object.confidence : null,
      }))
    : [];

  const cards = Array.isArray(breakdown?.cards)
    ? breakdown.cards.map(card => ({
        name: clean(card.name, 120),
        keep: clean(card.traits, 300),
        measure: clean(card.clarify, 300),
        why: clean(card.why, 300),
        hex: color(card.hex),
      }))
    : [];

  const palette = [];
  const pushColor = (hex, name = '') => {
    const normalized = color(hex);
    if (normalized && !palette.some(item => item.hex === normalized)) palette.push({ hex: normalized, name: clean(name, 60) });
  };
  for (const item of Array.isArray(direction?.palette) ? direction.palette : []) {
    pushColor(item?.hex || item, item?.name || '');
  }
  for (const card of cards) pushColor(card.hex, card.name);

  const measure = [
    ...cards.map(card => card.measure).filter(Boolean),
    'Высоту потолка, ширину проёмов и габариты мебели — по месту.',
  ];

  const keep = cards.map(card => card.keep).filter(Boolean);

  return {
    version: 1,
    render_id: render?.id || null,
    room_id: room?.id || null,
    title: `Паспорт дизайна · ${clean(room?.style, 60) || 'интерьер'}${room?.room_type ? ` · ${clean(room.room_type, 40)}` : ''}`,
    concept: clean(direction?.concept || breakdown?.lead, 400),
    mood: clean(direction?.mood, 300),
    focal_point: clean(direction?.focalPoint, 200),
    materials: clean(direction?.materials || (Array.isArray(direction?.materialsStory) ? direction.materialsStory.join(', ') : ''), 400),
    palette,
    surfaces: surfaces.map(surface => ({ title: SURFACE_TITLES[surface.key] || surface.key || 'Поверхность', material: surface.material, look: surface.look })),
    objects,
    lighting: breakdown?.lighting
      ? {
          plan: clean(breakdown.lighting.plan, 400),
          temperature: clean(breakdown.lighting.temperature, 120),
          why: clean(breakdown.lighting.why, 300),
        }
      : null,
    keep,
    measure,
    limitations: LIMITS_TEXT,
    dimensions: dimensions
      ? { width: dimensions.width ?? null, length: dimensions.length ?? null, height: dimensions.height ?? null, note: 'оценка по изображению, требует замера' }
      : null,
    generated_at: now.toISOString(),
  };
}

function fontPath() {
  const candidates = [
    process.env.PASSPORT_FONT,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  ].filter(Boolean);
  return candidates.find(candidate => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) || null;
}

function fontBoldPath() {
  const regular = fontPath();
  if (!regular) return null;
  const bold = path.join(path.dirname(regular), 'DejaVuSans-Bold.ttf');
  return fs.existsSync(bold) ? bold : null;
}

// PDF на A4: заголовок, блоки, перенос строк. Кириллица — через DejaVuSans,
// который ставится в образ (см. Dockerfile).
export function renderPassportPdf(passport) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const regular = fontPath();
    const bold = fontBoldPath();
    if (regular) doc.registerFont('body', regular);
    if (bold) doc.registerFont('bold', bold);
    const setBody = () => { if (regular) doc.font('body'); };
    const setBold = () => { if (bold) doc.font('bold'); else setBody(); };

    const heading = text => {
      setBold();
      doc.fontSize(13).fillColor('#111111').text(text, { paragraphGap: 4 });
      setBody();
    };
    const paragraph = text => {
      if (!text) return;
      setBody();
      doc.fontSize(10).fillColor('#222222').text(text, { lineGap: 2, paragraphGap: 6 });
    };
    const bullet = text => {
      if (!text) return;
      setBody();
      doc.fontSize(10).fillColor('#222222').text(`• ${text}`, { lineGap: 2 });
    };

    setBold();
    doc.fontSize(20).fillColor('#111111').text(passport.title);
    setBody();
    doc.moveDown(0.6);
    if (passport.concept) paragraph(passport.concept);
    if (passport.mood) paragraph(passport.mood);

    if (passport.palette.length) {
      doc.moveDown(0.3);
      heading('Палитра');
      for (const item of passport.palette) {
        doc.rect(doc.x, doc.y + 1, 12, 12).fill(item.hex);
        doc.fillColor('#222222').fontSize(10).text(`  ${item.hex}${item.name ? ` — ${item.name}` : ''}`, doc.x + 4, doc.y + 2);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.4);
    }

    if (passport.surfaces.length) {
      heading('Отделка по поверхностям');
      for (const surface of passport.surfaces) {
        bullet([surface.title, surface.material, surface.look].filter(Boolean).join(': '));
      }
      doc.moveDown(0.4);
    }

    if (passport.objects.length) {
      heading('Что в интерьере');
      for (const object of passport.objects) {
        bullet([object.label, object.description].filter(Boolean).join(' — '));
        if (object.note) paragraph(`   Уточнить: ${object.note}`);
      }
      doc.moveDown(0.4);
    }

    if (passport.lighting) {
      heading('Освещение');
      if (passport.lighting.plan) bullet(passport.lighting.plan);
      if (passport.lighting.temperature) bullet(`Температура: ${passport.lighting.temperature}`);
      if (passport.lighting.why) bullet(passport.lighting.why);
      doc.moveDown(0.4);
    }

    if (passport.keep.length) {
      heading('Что важно сохранить');
      for (const item of passport.keep) bullet(item);
      doc.moveDown(0.4);
    }

    if (passport.measure.length) {
      heading('Что замерить и проверить на объекте');
      for (const item of passport.measure) bullet(item);
      doc.moveDown(0.4);
    }

    doc.moveDown(0.6);
    heading('Ограничения');
    for (const line of passport.limitations) paragraph(line);

    setBody();
    doc.fontSize(8).fillColor('#666666').text(
      `Паспорт дизайна RemontVision · сформирован ${new Date(passport.generated_at).toLocaleDateString('ru-RU')} · не является рабочей документацией`,
      { align: 'center' },
    );
    doc.end();
  });
}
