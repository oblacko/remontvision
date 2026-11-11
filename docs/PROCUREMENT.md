# Подбор товаров

**Статус на 2026-11-11:** пользовательский путь — MCP/catalog-service. Старый Yandex-procurement не подключён к API и подлежит удалению [STATUS.md](STATUS.md).

## Текущий путь (работает)

`POST /api/renders/:id/product-search` (авторизован, owner-check):

1. `src/visionagent.js` запускает агента с MCP-инструментами.
2. `src/catalogclient.js` вызывает `catalog-service` (FastAPI + pgvector): поиск по картинке/тексту/атрибутам.
3. Ответ — до 20 предметов, `top_k=4`, `max_steps=10`; результат сохраняется в `render.analysis.products`.
4. UI показывает карточки; ссылки ведут напрямую на `offer.url` (демо-каталог — без URL).

Особенности:

- **Бесплатно**: отдельный кредит не списывается, входит в кредит генерации.
- **Один проход**; визуального score нет (`score: null`).
- Клики в `product_clicks` этим путём **не** логируются.
- Выключатель — `render.product_matching_enabled` (админка «Генерация»), не вкладка «Поиск».
- Модель/лимиты — `src/modelconfig.js`, `src/searchconfig.js`; MCP — `catalog-service/mcp_server.py`.

## Legacy: Yandex procurement (не подключён)

Код и таблицы остались, но пользовательский путь удалён:

- `src/procurement.js` (642 строки), `procurementjobs.js`, `procurementtemplates.js`, `procurementconfig.js`, `yandexsearch.js`.
- Маршрутов `POST /api/renders/:id/procurement` и `GET /api/procurement/:id` **нет**; `startProcurementWorker` не стартует; `/buy/:id` читает `procurement_candidates` и обычно отдаёт 404.
- `migrations/023_procurement.sql` и таблицы `procurement_*` остаются до отдельной миграции удаления.
- В документации старый путь иногда описан как текущий — это устарело.
- «1 кредит за запуск» относилось к legacy; текущий MCP-поиск бесплатный.

## catalog-service

Отдельный сервис `catalog-service/` (Python, FastAPI, Postgres + pgvector):

- импорт CPA YML, DINOv2 ViT-B/14 (768d), гибридный поиск (image/text/attrs, color/attr rerank);
- MCP-инструменты и `scripts/vision_agent.py`;
- Search Lab использует его как источник `catalog` (выключен по умолчанию);
- статистика Hoff 793: ~36 092 оффера, эмбеддинги ~36 074;
- ограничения: ViT-B (не L), нет text→image (dino.txt), ADE20K — семантика, в Hoff нет `tile`.

Подробно: [CATALOG-SERVICE.md](CATALOG-SERVICE.md), [CATALOG.md](CATALOG.md).

## Админка

| Вкладка | Что настраивает | Влияет ли |
|---|---|---|
| «Поиск» | `procurement.settings.v1` (legacy Yandex) | нет, legacy |
| «Генерация» | `product_matching_enabled`, `max_products`, `image_min_gap_ms` | да (MCP-поиск) |
| «Каталог» | товары, импорт, активность | да (каталог/стили) |

## Ограничения

- Каталог демо: 0 реальных URL; заказы невозможны.
- MCP-поиск не пишет клики и не считает стоимость по товару.
- Legacy-код увеличивает кодовую базу и путает документацию; удаление — в плане redesign.

## Связанные документы

- [STATUS.md](STATUS.md)
- [CATALOG.md](CATALOG.md)
- [CATALOG-SERVICE.md](CATALOG-SERVICE.md)
- [API.md](API.md)
