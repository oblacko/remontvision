# Каталог, товары и стили

## Текущее состояние (2026-11-11)

- **100 активных демо-товаров, 0 с реальным URL.**
- 120 style references, 25 approved.
- `catalog/seed.json` содержит 100 товаров, но **на чистой установке сид каталога не запускается**: `src/catalogseed.js` удалён; миграция `001` вставляет только 10 демо-товаров.
- `upsertSeedProduct` не вызывается.
- Стилей: 10 канонических (миграция `040`), 10 концепций, 12 типов комнат.
- `style_products`: закреплённые товары стиля (для будущего каталога).

Это демонстрационный каталог: он проверяет дизайн, стили, смету и UI. Реальные заказы невозможны — ссылки ведут в поиск.

## Модель товара

`products`: `category`, `surface`, `price`, `unit`, `qty`, `price_tier`, `room_types`, `style_tags`, `url`, `image_path`/`image_url`, `dimensions`, `keywords`, `attrs`, `active`, `seed_key`.

Основные категории: `floor`, `paint`, `wallpaper`, `tile`, `skirting`, `countertop`, `cabinet`, `faucet`, `sink`, `toilet`, `shower`, `bathtub`, `light`, `outlets`, `appliance`, `textile`, `bed`, `wardrobe`, `sofa`, `armchair`, `coffee_table`, `dining_table`, `dining_chair`, `sideboard`, `desk`, `office_chair`, `storage`, `bench`, `rug`.

## Классы материалов

| Класс | Название | Смысл |
|---|---|---|
| `start` | Старт | ламинат, керамика, painted MDF |
| `comfort` | Комфорт | инженерная доска, кварц, качественные фасады |
| `premium` | Премиум | камень, массив, дизайнерский свет |
| `atelier` | Ателье | редкие фактуры, кастом |

## Комнаты и слоты

`src/roomtypes.js`: `categories`, `slots`, `keep`/`change`, `styling`, `forbid`, `electrical`. Справочник редактируется в админке «Комнаты» (`app_settings.roomtypes.config.v1`).

## Стили

- `styles`: `key`, `name`, `prompt_description`, `swatches`, `active`.
- `style_references`: hero/board/upload, комната, score, approved. В генерацию идут только approved при режиме `reference`.
- `style_products`: избранные товары стиля/комнаты.
- Генератор комплекта: комната + класс → товары только с URL → недостающие слоты → «Добавить всё в стиль».

## Импорт товара по URL

`POST /api/admin/products/import`:

- allowlist доменов (`PRODUCT_IMPORT_DOMAINS`);
- JSON-LD/OpenGraph/HTML: название, бренд, цена, картинка, рейтинг, артикул;
- габариты из JSON-LD/свойств (мм/см/м/дюймы → см);
- категория/класс/комнаты/стили по ключевым словам;
- quality score и issues;
- картинка через `fetchRemoteImage` (SSRF-safe), EXIF чистится;
- товар создаётся черновиком (`active=false`).

Массовый импорт — до 20 URL.

## Заказ

- Есть URL → `/go/:productId?r=renderId`, label «Заказать», лог клика.
- Нет URL → поиск, label «Найти похожие».
- Партнёрские ссылки — в `url`; CPA/subid позже.

## catalog-service

Отдельный сервис `catalog-service/`: CPA YML, DINOv2 ViT-B/14 (768d), pgvector, гибридный поиск, MCP. Hoff 793: ~36 092 оффера, ~36 074 эмбеддинга. Подробно — [CATALOG-SERVICE.md](CATALOG-SERVICE.md).

## Что делать дальше

1. Выбрать 1 стиль + 1 комнату.
2. Импортировать 20–50 реальных товаров с URL.
3. Собрать комплект и закрепить.
4. Перегенерировать hero под реальный набор.
5. Проверить смету и переходы.
6. Только потом расширять.

## Связанные документы

- [STATUS.md](STATUS.md)
- [PROCUREMENT.md](PROCUREMENT.md)
- [GENERATION.md](GENERATION.md)
- [ADMIN.md](ADMIN.md)
