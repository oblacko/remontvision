// PDF плана закупки: разделы, позиции, отметки о покупке. Строится из roadmap_items,
// без новых AI-вызовов. Публичная страница /s/:token показывает то же самое в вебе.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function fontPath() {
  return [process.env.PASSPORT_FONT, '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf']
    .filter(Boolean)
    .find(candidate => { try { return fs.existsSync(candidate); } catch { return false; } }) || null;
}

export function groupRoadmapItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = item.section_key || 'other';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: item.section_title || 'Прочее',
        sort: Number(item.section_sort) || 99,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }
  return [...groups.values()]
    .map(group => ({ ...group, items: group.items.filter(item => item.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0)) }))
    .filter(group => group.items.length)
    .sort((a, b) => a.sort - b.sort);
}

export function renderRoadmapPdf({ room, items, now = new Date() }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const regular = fontPath();
    if (regular) doc.registerFont('body', regular);
    const boldPath = regular ? path.join(path.dirname(regular), 'DejaVuSans-Bold.ttf') : null;
    if (boldPath && fs.existsSync(boldPath)) doc.registerFont('bold', boldPath);
    const setBody = () => { if (regular) doc.font('body'); };
    const setBold = () => { if (boldPath && fs.existsSync(boldPath)) doc.font('bold'); else setBody(); };

    const all = items.filter(item => item.active !== false);
    const done = all.filter(item => item.done).length;
    const groups = groupRoadmapItems(items);

    setBold();
    doc.fontSize(20).text(`План закупки${room?.room_type ? ` · ${clean(room.room_type, 40)}` : ''}`);
    setBody();
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor('#333333').text(`Куплено ${done} из ${all.length}. ${clean(room?.style, 60)}`);
    doc.moveDown(0.8);

    for (const group of groups) {
      setBold();
      doc.fontSize(13).fillColor('#111111').text(group.title);
      setBody();
      doc.moveDown(0.3);
      for (const item of group.items) {
        const mark = item.done ? '☑' : '☐';
        const text = clean(item.text, 220);
        doc.fontSize(10).fillColor(item.done ? '#777777' : '#222222').text(`${mark} ${text}`, { lineGap: 2 });
        if (item.comment) doc.fontSize(9).fillColor('#666666').text(`   ${clean(item.comment, 200)}`, { lineGap: 1 });
      }
      doc.moveDown(0.7);
    }

    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#666666').text(
      'План собран по изображению, сгенерированному ИИ. Количество, объёмы и стоимость не рассчитаны: ' +
      'нужны размеры и проверка на объекте. Не является сметой или рабочей документацией.',
      { lineGap: 2 },
    );
    doc.moveDown(0.3);
    doc.text(`RemontVision · ${now.toLocaleDateString('ru-RU')}`, { align: 'center' });
    doc.end();
  });
}
