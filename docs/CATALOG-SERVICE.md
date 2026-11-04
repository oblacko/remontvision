# Catalog Service (отдельный сервис каталога)

Состояние на 2026-11-03. Секреты сюда не писать.

## Зачем

Отдельный сервис для импорта CPA-фидов, хранения каталога и поиска товаров.
Раньше Search Lab искал через Yandex (платно, нестабильно, выдуманные URL). Теперь есть
свой каталог из фидов Pampadu (Hoff/divanboss) с реальными ценами, наличием,
картинками, `affiliate_url` и `erid`.

## Расположение и стек

- `app/catalog-service/` — Python 3.12, FastAPI, PostgreSQL+pgvector, torch/timm (DINOv2),
  Pillow, httpx, `mcp<2`.
- Своя БД в compose: `catalog-db` (`pgvector/pgvector:pg16`), том `app_catalogdata`.
- Кэш весов: `app_catalogcache`; кэш картинок и сохранённые запросы: `app_catalogfiles`.
- Порты: `catalog` — `127.0.0.1:8000`; `catalog-db` — только внутри сети.

## Данные (`sql/001`–`004`)

- `feeds` — источники: `name, url, format, adapter, active, root_category_id, last_synced_at, offer_count, error`.
- `offers` — **одна каноническая таблица для всех источников**:
  `id, feed_id, external_id, merchant, category (внутренняя), category_raw, supplier_category_id,
  name, vendor, model, description, price, old_price, currency, availability, picture_url,
  picture_path, canonical_url, affiliate_url, erid, params jsonb, raw jsonb, status,
  content_hash, color_hist real[]`, `UNIQUE(feed_id, external_id)`.
- `categories` — дерево категорий поставщика: `feed_id, external_id, name, parent_external_id, path, internal_category`.
- `offer_embeddings` — `offer_id, model, dim, embedding vector(768)`, HNSW cosine.
- `sync_jobs`.

## Фиды и импорт

- YML-парсер (`feed.py`) на `xml.etree`; категория определяется по **полному пути**
  (`categories.map_category_path`), а не только по листу.
- `parse_categories` сохраняет дерево; `import_offers` идемпотентно upsert'ит по `(feed_id, external_id)`.
- `canonical_url` извлекается из CPA-редиректа (`dl`), `affiliate_url` — исходный `trk.ppdu.ru` URL,
  `erid` — маркировка рекламы (ФЗ-38).
- Импорт и эмбеддинг разделены:
  - `POST /feeds/:id/import` — только запись в БД;
  - `POST /feeds/:id/sync` — импорт + эмбеддинг;
  - `POST /feeds/:id/embed` и `POST /embed` — только эмбеддинг.
- Загружены: фид 789 (918 мебель divanboss), фид 793 Hoff (36 092). Итого **37 010 офферов, 0 без категории**.
- Эмбеддинги Hoff: **36 074 / 36 092 (99.95%)**. Остальные 18 невозможно: 16 картинок отдают
  **404 на hoff.ru**, 2 оффера без `picture_url`.

## Эмбеддинги

- Модель: DINOv2 **ViT-B/14** через timm (`vit_base_patch14_dinov2.lvd142m`), **768d**, вход 224×224,
  L2-нормализация. Это НЕ ViT-L и не dino.txt.
- CPU: ~0.67 с/картинку; полный Hoff ~3–4 ч. Скачанные картинки кэшируются на диск
  (`IMAGE_CACHE_DIR`), повторно не качаются.
- `color_hist` — 512-бинная RGB-гистограмма по «обивочным» пикселям (без белого фона/белья).
- Приоритет в очереди: офферы **с картинкой** раньше (иначе пачка без картинок останавливала цикл).
- `PgOfferRepository` держит соединение с переподключением и локом (иначе после обрыва все DB-запросы падали).

## Поиск

- `POST /search` — `image_b64`/`text` + filters + product: DINOv2 + цветовой re-rank
  (`COLOR_RERANK_WEIGHT=0.3`) + атрибутный re-rank (`ATTR_RERANK_WEIGHT=0.25`).
  Категория — жёсткий фильтр; при пустой выдаче — fallback без категории (`category_fallback`).
- `POST /search-text` — ключевые слова/категории/атрибуты **без вектора** (работает для всех офферов):
  русский стемминг, приоритет совпадения в названии, fallback по категории.
- Атрибуты: `color_family`, `product_type` (soft/wood/metal/stone/glass), материал, размеры;
  синонимы цветов (коричневый ↔ мокко/капучино/какао).
- Пилот «коричневая кровать»: мокко поднялся с 7-го на **1-е место**.
- Таксономия: `cabinet` = кухонные гарнитуры/шкафы/фасады; `wardrobe` = шкафы для одежды.
  Кухонные навесные шкафы исправлены (259 офферов перемещены из `wardrobe` в `cabinet`);
  «прикроватная тумба» не улетает в `bed`.

## Vision / сегментация / AI-сетка

- `POST /vision` — Gemini/DeepSeek: `room` (type/style/lighting/walls/floor/ceiling) + до 20 объектов
  с атрибутами и `bbox`; дедуп по названию + IoU.
- `POST /vision-search` — `room` + по каждому объекту результаты из каталога (категория → поиск;
  пустые категории помечаются «нет в каталоге», без чужого fallback).
- `POST /segment-head` — DINOv2 + ADE20K linear head (`BNHead`: BN + 1×1 conv,
  `out_indices=[8,9,10,11]`, `in_index=[3]`, 150 классов) → разметка + компоненты.
  `POST /mask-at {x,y}` — клик → класс → связная компонента → **белая вырезка по контуру**.
- `POST /grid-ai` — vision → FLUX `flux-3-image-klein` → сетка (2×5 / 3×4 / 3×5 / 4×5 по числу объектов)
  → ячейки; каждая ячейка проверяется vision (`check_cell`), несовпавшие отбрасываются.
- `/` — тест-страница: загрузка, «Контур (DINOv2)», «Маски (DINOv2)», «Сетка (ИИ)»,
  «Vision (список)», две вкладки результатов (гибридный / ключевые слова).

## MCP и vision-агент

- `app/catalog_tools.py` — инструменты: `list_categories`, `search_offers`, `category_stats`,
  `get_offer`, `resolve_category`.
- `mcp_server.py` — MCP-сервер (FastMCP, `mcp<2`), 5 инструментов; проверен MCP-клиентом.
- `scripts/vision_agent.py` — агент на `deepseek/deepseek-v4.1-flash-1017` (tool-calling):
  смотрит фото → вызывает инструменты → проверяет категорию/цвет по реальной выдаче →
  финальный JSON `{room, items:[{label, category, search_query, offer_ids, why}]}`.
  Есть лимит шагов и принудительный финальный JSON без инструментов; дедуп; только реальные `offer_ids`.
- На кухне: **16 предметов**, `room` заполнен, `tile=0` честно, кухонные шкафы `cabinet`,
  без прикроватных тумб.
- Модель зрения: `SEARCH_VISION_MODEL=deepseek/deepseek-v4.1-flash-1017` (каталог/поиск);
  `VISION_MODEL=google/gemini-3.1-pro-preview` (остальное приложение).

## Команды

```bash
cd app
CATALOG_INSTALL_ML=1 docker compose up -d --build catalog
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/embed \
  -H "x-catalog-token: change-me" -H "content-type: application/json" \
  -d '{"feed_id":2}'
docker compose exec catalog env PYTHONPATH=/app \
  python /app/scripts/vision_agent.py --image /tmp/room.jpg --top-k 3 --max-steps 8
cd catalog-service && python3 -m pytest -q
```

- Токен: `CATALOG_SERVICE_TOKEN` (по умолчанию `change-me`).
- MCP: `docker compose exec catalog env PYTHONPATH=/app python /app/mcp_server.py` (stdio).

## Интеграция с remontvision

- `src/catalogclient.js`; ключи `search.v1` (`catalog_enabled`, `catalog_service_url`,
  `catalog_top_k`, `catalog_min_score`); источник `catalog` в
  `searchservice.processObjectSearch`; `mergeResults`; миграция `034`
  (`search_results.affiliate_url`, `erid`); бейдж «каталог» и «реклама · erid» в
  `SearchPipeline.tsx`. `catalog_enabled=false` по умолчанию.

## Известные ограничения

- DINOv2 ViT-B (не L); text→image (dino.txt) нет.
- ADE20K-сегментация семантическая, не инстансы; ~13 с/фото на CPU.
- В Hoff нет `tile` и почти нет `floor_covering` — не подставлять fallback из чужих категорий.
- 18 офферов без эмбеддинга (16 битых 404, 2 без картинки); при повторном `/embed` ретраятся.
- DINOv3 не тестирован: веса gated (нужен `HF_TOKEN`/форма Meta), другой базис →
  полный re-embed, отдельная лицензия.
- `mcp` закреплён `<2` (в 2.x FastMCP переименован в `MCPServer`).

## Следующие шаги

1. **Task 12 — визуальная проверка выдачи** (`visual_check`: DINOv2-cosine + vision двух картинок
   для top-2; уточнение категории/запроса; логи для дообучения).
2. `/vision-agent` эндпоинт + вкладка в UI (сейчас агент — CLI).
3. DINOv3-бенчмарк (`scripts/bench_dino.py`) после HF-доступа.
4. Рерanker / metric learning на накопленных парах.
