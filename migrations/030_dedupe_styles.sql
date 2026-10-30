-- 030: дедупликация стилей.
-- Оставляем 8 богатых активных стилей. Удаляем неиспользуемые смысловые дубли:
--   minimal → warm-minimal, neo → heritage.
-- modern не удаляем: им пользуются старые комнаты (8 комнат / 11 рендеров).
-- Перед удалением переносим референсы, чтобы не потерять ассеты.

UPDATE style_references
SET style_id = (SELECT id FROM styles WHERE key = 'heritage')
WHERE style_id = (SELECT id FROM styles WHERE key = 'neo');

UPDATE style_references
SET style_id = (SELECT id FROM styles WHERE key = 'warm-minimal')
WHERE style_id = (SELECT id FROM styles WHERE key = 'minimal');

-- На всякий случай выключаем дубли, даже если удалить не получится.
UPDATE styles SET active = false WHERE key IN ('minimal', 'neo');

-- Удаляем только те дубли, которыми не пользуются комнаты.
-- Если старая комната использует стиль, он остаётся в таблице (неактивным),
-- чтобы будущие правки этой комнаты продолжали работать.
DELETE FROM styles s
WHERE s.key IN ('minimal', 'neo')
  AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.style = s.name);
