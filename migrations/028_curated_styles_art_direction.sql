-- 028: кураторский набор стилей с сильными брифами и дизайн по умолчанию без демо-сметы.
-- Активны 8 стилей: 2 базовых с подробным брифом + 6 трендовых 2026.
UPDATE styles SET active = false;
UPDATE styles SET active = true
WHERE key IN ('scandi', 'japandi', 'wabi-sabi', 'organic', 'warm-minimal', 'biophilic', 'heritage', 'mediterranean');

-- Демо-каталог без реальных URL не должен формировать «смету» по умолчанию.
ALTER TABLE rooms ALTER COLUMN use_catalog SET DEFAULT false;
