// Утилиты для FLUX 3 bbox JSON (layout-контроль).
// Гайд: сетка 0–1000, [top, left, bottom, right], строки {"id", "desc", from, src_bbox, tgt_bbox}.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Нормализованный [x, y, w, h] 0..1 → сетка 0–1000 [top, left, bottom, right].
export function normalizedToFluxBox([x, y, w, h]) {
  const left = clamp(Math.round(Number(x) * 1000), 0, 1000);
  const top = clamp(Math.round(Number(y) * 1000), 0, 1000);
  const right = clamp(Math.round((Number(x) + Number(w)) * 1000), 0, 1000);
  const bottom = clamp(Math.round((Number(y) + Number(h)) * 1000), 0, 1000);
  if (right - left < 20 || bottom - top < 20) return null;
  return [top, left, bottom, right];
}

// Keep-строка для заморозки элемента из исходника.
function keepRow({ id, desc, bbox }) {
  return { id, desc, from: 'ref_image_0', src_bbox: bbox, tgt_bbox: bbox };
}

// New-строка для добавления объекта по плану.
export function newRow({ id, desc, bbox }) {
  return { id, desc, from: null, src_bbox: null, tgt_bbox: bbox };
}

// Построить JSON-массив bbox из openings (Keep) и layout-плана (New).
export function buildBboxJson({ openings = null, layoutItems = null } = {}) {
  const rows = [];
  if (openings) {
    for (const item of openings.windows || []) {
      rows.push(keepRow({
        id: item.id,
        desc: item.kind === 'balcony_door'
          ? 'the existing balcony door with its exact frame, sill, handle and position, kept as a walkable opening'
          : 'the existing window with its exact frame, sill, mullions and full glazed area',
        bbox: item.bbox,
      }));
    }
    for (const item of openings.doors || []) {
      rows.push(keepRow({
        id: item.id,
        desc: 'the existing door with its exact frame, position and swing',
        bbox: item.bbox,
      }));
    }
    for (const item of openings.builtins || []) {
      rows.push(keepRow({
        id: item.id,
        desc: `the existing ${item.label || 'built-in'} with its exact footprint and position`,
        bbox: item.bbox,
      }));
    }
  }
  if (Array.isArray(layoutItems)) {
    for (const item of layoutItems) {
      if (item?.frame_bbox) {
        rows.push(newRow({
          id: item.id || item.label,
          desc: String(item.label || item.type || 'furniture').slice(0, 200),
          bbox: item.frame_bbox,
        }));
      }
    }
  }
  if (!rows.length) return '';
  return JSON.stringify(rows, null, 2);
}

// Упоминания id в теле промпта, чтобы upsampler не сбросил боксы.
export function bboxMentions(openings = null, layoutItems = null) {
  const ids = [];
  if (openings) {
    ids.push(...(openings.windows || []).map(i => i.id));
    ids.push(...(openings.doors || []).map(i => i.id));
    ids.push(...(openings.builtins || []).map(i => i.id));
  }
  if (Array.isArray(layoutItems)) {
    ids.push(...layoutItems.map(i => i.id || i.label).filter(Boolean));
  }
  return ids;
}
