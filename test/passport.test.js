import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassport, renderPassportPdf } from '../src/passport.js';

const render = {
  id: 'r1',
  analysis: {
    surfaces: [{ key: 'floor', material: 'инженерная доска', look: 'тёплый дуб' }],
    breakdown: {
      version: 4,
      title: 'Что подобрать',
      lead: 'Тёплый минимализм с дубом и льном',
      cards: [
        { name: 'Диван', traits: 'низкий, светлая ткань', clarify: 'ширину по стене', why: 'задаёт линию', hex: '#C9B79A' },
      ],
      lighting: { plan: 'трековый свет по потолку', temperature: '2700K', why: 'мягкие тени' },
      objects: [
        { id: 'door-1', category: 'door', label: 'дверь', description: 'белая, скрытая', bbox: [0.1, 0.2, 0.2, 0.5], confidence: 0.7, note: 'наличник не видно' },
      ],
    },
  },
  meta: {
    design_direction: { concept: 'Тёплый минимализм', palette: [{ hex: '#C9B79A', name: 'дуб' }] },
  },
};

const room = { id: 'room-1', style: 'Тёплый минимализм', room_type: 'Гостиная' };

test('passport collects palette, surfaces, objects and checklists', () => {
  const passport = buildPassport({ render, room, now: new Date('2026-11-11T10:00:00Z') });
  assert.equal(passport.render_id, 'r1');
  assert.equal(passport.palette[0].hex, '#C9B79A');
  assert.equal(passport.surfaces[0].title, 'Пол');
  assert.equal(passport.objects[0].label, 'дверь');
  assert.ok(passport.keep.some(item => item.includes('низкий')));
  assert.ok(passport.measure.some(item => item.includes('ширину')));
  assert.ok(passport.limitations.length > 0);
});

test('passport works without breakdown objects', () => {
  const passport = buildPassport({
    render: { id: 'r2', analysis: { breakdown: { version: 4, cards: [{ name: 'Стол', traits: 'дерево' }] } }, meta: {} },
    room,
  });
  assert.equal(passport.objects.length, 0);
  assert.equal(passport.surfaces.length, 0);
  assert.equal(passport.keep[0], 'дерево');
});

test('passport PDF is generated and is a real PDF', async () => {
  const passport = buildPassport({ render, room });
  const pdf = await renderPassportPdf(passport);
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 1000, `pdf слишком маленький: ${pdf.length}`);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
