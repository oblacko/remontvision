# AGENTS: catalog-service — что именно нужно

## Главное правило
Не придумывать альтернативы и не подменять технологии. Делать ровно то, что написано ниже.
Если реально непонятно — задать один короткий конкретный вопрос, а не предлагать «варианты».

## Разрешение перед действием (обязательно)
- **Перед эмбеддингом, импортом, удалением/откатом данных, пересборкой и любыми долгими или платными операциями — СПРОСИТЬ и дождаться явного «да».**
- Не запускать эмбеддинг без явной команды (например, «запускай эмбеддинг»).
- Не удалять и не откатывать данные без явной просьбы.
- Если сомневаешься, спрашивай — лучше один вопрос, чем самовольное действие.

## Что нужно (текущая тестовая страница)
1. `http://127.0.0.1:8000/` — загрузить фото:
   - **«Контур (DINOv2)»** — ADE20K-разметка (`/segment-head`), клик по объекту → маска по контуру
     (`/mask-at`) → белая вырезка → поиск.
   - **«Маски (DINOv2)»** — patch-фичи + кластеризация + компоненты (`/segment`). **НЕ SAM.**
   - **«Сетка (ИИ)»** — vision → FLUX (2×5 / 3×4 / 3×5 / 4×5) → ячейки; каждая ячейка проверяется
     vision (`check_cell`), несовпавшие отбрасываются.
   - **«Vision (список)»** — room (стены/пол/потолок) + до 20 объектов с атрибутами и bbox;
     под каждым результаты из каталога (`/vision-search`); кнопка «Сетка по списку».
2. Две вкладки результатов: **гибридный** (`/search`) и **ключевые слова/атрибуты** (`/search-text`).
3. Поиск: категория (жёсткий фильтр) → DINOv2-вектор → цветовой re-rank → атрибуты.
4. MCP-сервер и vision-агент (DeepSeek tool-calling) — см. ниже.

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

## Текущее состояние (2026-11-03)
- Импорт: фид Hoff 793 — **36 092 оффера, 0 без категории**; фид 789 — 918.
- Эмбеддинги Hoff: **36 074 / 36 092**. Остальные 18 нереально: 16 картинок **404** на hoff.ru, 2 без `picture_url`.
- Модель: DINOv2 **ViT-B/14** через timm, **768d**, 224px. Не ViT-L, не dino.txt.
- Поиск: категория (жёстко) → DINOv2 cosine → цвет (`COLOR_RERANK_WEIGHT=0.3`) → атрибуты (`ATTR_RERANK_WEIGHT=0.25`); `/search-text` со стеммингом.
- MCP: `mcp_server.py` (FastMCP, `mcp<2`), 5 инструментов: `list_categories`, `search_offers`, `category_stats`, `get_offer`, `resolve_category`.
- Агент: `scripts/vision_agent.py` на `deepseek/deepseek-v4.1-flash-1017` (tool-calling, принудительный финальный JSON). На кухне 16 предметов, room заполнен, `tile=0` честно.
- Исправлено: кухонные навесные шкафы → `cabinet` (259), «прикроватная тумба» → `sideboard`, пустые категории без чужого fallback, переподключение БД, приоритет офферов с картинкой в очереди.
- Полное описание: `../docs/CATALOG-SERVICE.md`.

## Следующее
- **Task 12:** `visual_check` (DINOv2-cosine + vision двух картинок для top-2) + correction loop; логи вердиктов для дообучения (reranker/metric learning).
- `/vision-agent` эндпоинт + вкладка в UI.
- DINOv3-бенчмарк (`scripts/bench_dino.py`) — веса gated, нужен HF-токен; другой базис → полный re-embed.
