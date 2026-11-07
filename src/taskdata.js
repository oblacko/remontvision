// Псевдо-задача для дока: разбор интерьера хранится в meta рендера.
import path from 'node:path';

export function roadmapTask(row) {
  const roadmap = row?.meta?.roadmap;
  const status = roadmap?.status || (roadmap?.version === 1 && roadmap?.at ? 'done' : null);
  if (!status) return null;
  return {
    id: `roadmap:${row.id}`,
    kind: 'roadmap',
    render_id: row.id,
    room_id: row.room_id,
    style: 'Роадмап ремонта',
    room_type: row.room_type || null,
    status,
    error: roadmap.error || null,
    created_at: roadmap.started_at || roadmap.finished_at || roadmap.at || row.created_at,
    image_url: row.image_path ? `/renders/${path.basename(row.image_path)}` : null,
    photo_url: row.photo_path ? `/files/${path.basename(row.photo_path)}` : null,
  };
}

export function breakdownTask(row) {
  const breakdown = row?.meta?.breakdown;
  // Старый формат { cost_usd, at } без версии не показываем: он требует перезапуска.
  const status = breakdown?.status || (breakdown?.version === 2 && breakdown?.at ? 'done' : null);
  if (!status) return null;
  return {
    id: `breakdown:${row.id}`,
    kind: 'breakdown',
    render_id: row.id,
    room_id: row.room_id,
    style: 'Разбор интерьера',
    room_type: row.room_type || null,
    status,
    error: breakdown.error || null,
    created_at: breakdown.started_at || breakdown.finished_at || breakdown.at || row.created_at,
    image_url: row.image_path ? `/renders/${path.basename(row.image_path)}` : null,
    photo_url: row.photo_path ? `/files/${path.basename(row.photo_path)}` : null,
  };
}
