# AGENTS: catalog-service — что именно нужно

## Главное правило
Не придумывать альтернативы и не подменять технологии. Делать ровно то, что написано ниже.
Если реально непонятно — задать один короткий конкретный вопрос, а не предлагать «варианты».

## Что нужно (запрос пользователя)
1. Тестовая страница: загрузить фото → две кнопки:
   - **«Маски (DINOv2)»** — сегменты/маски на основе DINOv2 (patch-фичи + кластеризация + связные компоненты).
     **НЕ SAM, НЕ segment-anything.**
   - **«Сетка (ИИ)»** — как в приложении: vision извлекает до 10 объектов, затем FLUX генерирует
     сетку 2×5 = 10 изолированных товаров на белом фоне; нарезка на 10 ячеек.
2. После кнопки — список миниатюр; выбрать одну → «Искать» → результаты из каталога.
3. Поиск — как в приложении: DINOv2-эмбеддинг + цветовой re-rank, фильтры категория/цена.

## Как это устроено в приложении (источник истины)
- `src/searchvision.js` — `DEFAULT_VISION_PROMPT` (JSON с `objects`).
- `src/searchservice.js` — `processVisionStep`, `processGridStep`, `processCropsStep`, `processObjectSearch`.
- `src/searchgrid.js` — `buildGridPrompt`, `generateGridImage`, `sliceGrid` (rows=2, cols=5, margin=0.045).
- `src/searchprompts.js` — `DEFAULT_GRID_PROMPT` (2×5, белый фон) и `DEFAULT_CELL_PROMPT`.
- `src/openrouter.js` — `visionJson` (`POST /chat/completions`) и `generateTextImage`
  (`POST /images` с `{model, prompt, aspect_ratio, resolution}`).
- Модели: `SEARCH_VISION_MODEL` (по умолчанию `google/gemini-3.1-pro-preview`),
  `SEARCH_GRID_MODEL` (`black-forest-labs/flux-3-image-klein`), aspect `21:9`, resolution `1K`.
- Роуты приложения: `POST /api/admin/search/jobs/:id/vision|grid|crops`,
  `POST /api/admin/search/jobs/:id/objects/:objId/search`.

## Чего НЕ делать
- Не использовать SAM / `segment-anything` вместо DINO-масок.
- Не заменять AI-сетку на нарезку фото (tiling).
- Не менять концепцию и не предлагать «а может так» без просьбы.

## Проверка
- `cd catalog-service && python3 -m pytest -q`
- Пересборка: `CATALOG_INSTALL_ML=1 docker compose up -d --build catalog`
- Health: `curl http://127.0.0.1:8000/health`
