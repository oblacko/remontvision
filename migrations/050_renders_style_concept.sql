-- 050: стиль и концепт конкретного рендера.
-- Мульти-стиль генерация создаёт в одной комнате рендеры разных стилей;
-- NULL у старых рендеров = брать стиль/концепт из комнаты.
ALTER TABLE renders ADD COLUMN style text;
ALTER TABLE renders ADD COLUMN concept text;
