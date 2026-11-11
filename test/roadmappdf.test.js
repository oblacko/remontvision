import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderRoadmapPdf, groupRoadmapItems } from '../src/roadmappdf.js';
import { renderPassportPdf, buildPassport } from '../src/passport.js';

const items = [
  { id: 1, section_key: 'walls', section_title: 'Стены и фартук', section_sort: 10, sort: 1, text: 'Краска — можно самому', done: false, active: true },
  { id: 2, section_key: 'walls', section_title: 'Стены и фартук', section_sort: 10, sort: 2, text: 'Плитка на фартук — сначала замер', done: true, active: true },
  { id: 3, section_key: 'light', section_title: 'Освещение', section_sort: 20, sort: 1, text: 'Трек — монтаж: мастер', done: false, active: true },
  { id: 4, section_key: 'light', section_title: 'Освещение', section_sort: 20, sort: 2, text: 'Удалённая строка', done: false, active: false },
];

test('roadmap groups sections by order and drops inactive items', () => {
  const groups = groupRoadmapItems(items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Стены и фартук');
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].items.length, 1);
});

test('roadmap PDF is generated', async () => {
  const pdf = await renderRoadmapPdf({ room: { room_type: 'Кухня', style: 'Скандинавский' }, items });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 1000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('passport PDF accepts a design image', async () => {
  const image = await sharp({ create: { width: 400, height: 260, channels: 3, background: '#ccbbaa' } }).jpeg().toBuffer();
  const passport = buildPassport({
    render: { id: 'r1', analysis: { breakdown: { version: 4, cards: [{ name: 'Стол', traits: 'дерево' }], objects: [{ label: 'стол', category: 'furniture_major', bbox: [0.1, 0.1, 0.2, 0.2] }] } }, meta: {} },
    room: { style: 'Скандинавский', room_type: 'Кухня' },
  });
  const withImage = await renderPassportPdf(passport, { imageBuffer: image });
  const withoutImage = await renderPassportPdf(passport);
  assert.equal(withImage.subarray(0, 5).toString(), '%PDF-');
  assert.ok(withImage.length > withoutImage.length, 'PDF с изображением должен быть больше');
});
