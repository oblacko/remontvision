-- 013: чистка старого демо-каталога и room-agnostic описания стилей.
-- Новый каталог сидируется приложением из catalog/seed.json (idempotent по seed_key).

UPDATE products
SET active = false
WHERE seed_key IS NULL
  AND name IN (
    'Керамогранит Atlas Concorde Brave',
    'Плитка Kerama Marazzi Баккара',
    'Смеситель Am.Pm Spirit F0730100',
    'Смеситель Grohe Eurosmart',
    'Подсветка Arlight LED-лента 24В 3000К',
    'Люстра Maytoni Cluster',
    'Розетки Schneider Electric AtlasDesign',
    'Столешница кварцевая Technistone',
    'Краска Tikkurila Harmony',
    'Фасады МДФ эмаль матовая графит'
  );

UPDATE styles SET prompt_description = CASE key
  WHEN 'modern'  THEN 'modern minimalist interior, clean architectural lines, handleless matte cabinetry, warm layered lighting, refined materials, calm neutral palette, high-end editorial photography'
  WHEN 'scandi'  THEN 'scandinavian interior, light oak, white walls, linen, soft natural daylight, functional minimalism, warm and airy'
  WHEN 'loft'    THEN 'industrial loft, exposed concrete or brick, black metal, warm wood, large windows, raw tactile textures'
  WHEN 'japandi' THEN 'japandi interior, warm minimalism, natural oak, linen, wabi-sabi, calm earthy palette, tactile materials'
  WHEN 'neo'     THEN 'neoclassical interior, elegant wall moldings, warm neutrals, subtle brass, timeless proportions'
  WHEN 'minimal' THEN 'minimalist interior, clean lines, neutral palette, hidden storage, soft indirect lighting, uncluttered'
  WHEN 'dark'    THEN 'dark modern interior, graphite and walnut, moody layered lighting, premium materials, dramatic contrast'
  WHEN 'boho'    THEN 'bohemian interior, layered textiles, rattan, plants, warm earthy colors, relaxed artisanal styling'
  WHEN 'deco'    THEN 'art deco interior, brass, velvet, geometric patterns, rich jewel tones, glamorous'
  WHEN 'country' THEN 'country interior, natural wood, cozy textiles, warm rustic details, handmade character'
  ELSE prompt_description
END
WHERE key IN ('modern','scandi','loft','japandi','neo','minimal','dark','boho','deco','country');
