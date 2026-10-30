-- 032: новые комнаты по умолчанию без сохранения мебели и без каталога.
-- Каталог в дизайне принудительно выключен в jobs.js/server.js; здесь фиксируем дефолты БД.
ALTER TABLE rooms ALTER COLUMN keep_furniture SET DEFAULT false;
ALTER TABLE rooms ALTER COLUMN use_catalog SET DEFAULT false;
