# Каталог, товары и стили

## Текущее состояние (важно)

На 2026-10-28:

- **110 товаров всего, 100 активных.**
- **0 товаров с реальным URL.**
- 120 style references, 26 approved.
- 1 закреплённый товар стиля (`style_products`).

Это **демонстрационный каталог**. Он нужен, чтобы проверять дизайн, стили, смету, референсы и UI. Реальные заказы по нему невозможны: ссылки ведут в поиск, а не на карточку товара.

Чтобы включить реальные заказы:

1. Импортировать 20–50 реальных товаров с URL под один стиль/комнату.
2. Закрепить их за стилем (`style_products`) через «Генератор комплекта».
3. Проверить смету и `/go/:id`.
4. Только потом масштабировать на остальные стили.

## Модель товара

`products`:

| Поле | Смысл |
|---|---|
| `category` | `floor`, `paint`, `wallpaper`, `tile`, `skirting`, `countertop`, `cabinet`, `faucet`, `sink`, `toilet`, `shower`, `bathtub`, `light`, `outlets`, `appliance`, `textile`, `bed`, `wardrobe`, `sofa`, `armchair`, `coffee_table`, `dining_table`, `dining_chair`, `sideboard`, `desk`, `office_chair`, `storage`, `bench`, `rug` |
| `surface` | поверхность/слот: floor, walls, cabinet, … |
| `price` | цена |
| `unit`, `qty` | единица и типовое количество для сметы |
| `price_tier` | `start`, `comfort`, `premium`, `atelier` |
| `room_types` | допустимые комнаты, через запятую; пусто = все |
| `style_tags` | теги стилей через запятую |
| `url` | **реальная страница товара** или партнёрская ссылка |
| `image_path` / `image_url` | картинка-референс |
| `dimensions` | JSON: `width_cm`, `depth_cm`, `height_cm`, `diameter_cm`, `text` |
| `keywords`, `attrs` | поиск и свойства |
| `active`, `seed_key` | активность и идемпотентный сид |

## Классы материалов

| Класс | Название | Смысл |
|---|---|---|
| `start` | Старт | ламинат, керамика, painted MDF, базовые fixtures |
| `comfort` | Комфорт | инженерная доска, кварц, качественные фасады |
| `premium` | Премиум | камень, массив, дизайнерский свет |
| `atelier` | Ателье | редкие фактуры, кастом |

Класс влияет на подбор товаров и промт. Сумма бюджета больше не управляет подбором.

## Комнаты и слоты

`src/roomtypes.js` задаёт для каждого типа:

- `categories` — что допустимо;
- `slots` — что реально выбираем (bed, floor, wall, light, …);
- `keep` / `change` — что сохранять/менять;
- `styling` — Pinterest-детали;
- `forbid` — что запрещено;
- `electrical` — рекомендации.

Примеры:

- **Спальня** — bed, floor, wall, light, wardrobe, rug, skirting, outlets, textile.
- **Гостиная** — sofa, floor, wall, coffee_table, armchair, light, rug, skirting, outlets, textile.
- **Кухня** — floor, backsplash, countertop, cabinet, wall, faucet, sink, light, appliance, outlets.
- **Санузел** — floor, tile, cabinet, countertop, faucet, sink, toilet, light, outlets.
- **Столовая** — dining_table, floor, wall, dining_chair, sideboard, rug, light, textile.
- **Кабинет** — desk, floor, wall, office_chair, storage, rug, light.
- **Прихожая** — storage, floor, wall, bench, cabinet, light.
- **Гардеробная** — wardrobe, floor, wall, cabinet, light.

## Подбор товаров

`src/curate.js`:

- фильтр по комнате (`room_types`);
- фильтр по слоту/категории;
- `price_tier` — точный класс, затем ближайший;
- стиль — точный тег 1.0, синоним 0.6, нейтральный 0.5;
- `style_products` (избранные) — приоритет;
- `requireUrl` — режим style kit, только товары с URL.

## Стилевые комплекты

Два уровня:

1. **Style references** — hero-сцены/муды, сгенерированные из товаров. Хранят `product_ids`, комнату, score, approved.
2. **Style products** — явно закреплённые товары стиля/комнаты. Влияют на подбор.

«Админка → Стили → Генератор комплекта»:

- выбираешь комнату и класс;
- система собирает товары по слотам **только с реальным URL**;
- показывает недостающие слоты;
- «Добавить всё в стиль» → `style_products`.

Hero-референсы: `scripts/generate-style-references.mjs` (shells → 3 hero-варианта → vision score → seed JSON). Approved идут в генерацию.

## Импорт товара по URL

`POST /api/admin/products/import`:

- allowlist доменов (`PRODUCT_IMPORT_DOMAINS`, по умолчанию 10 магазинов);
- JSON-LD / OpenGraph / HTML;
- название, бренд, цена, картинка, рейтинг, отзывы, артикул;
- габариты из JSON-LD/additionalProperty/описания (мм/см/м/дюймы → см);
- категория, класс, комнаты, стили по ключевым словам;
- quality score и issues: домен, цена, картинка, б/у/уценка, рейтинг, дубли;
- картинка скачивается с SSRF-защитой, чистится EXIF;
- товар создаётся **черновиком** (`active=false`).

Массовый импорт в админке: до 20 URL, каждый разбирается отдельно, добавляется вручную.

## Заказ

Смета:

- если у товара есть `url`, ссылка идёт через `/go/:productId?r=renderId`, label «Заказать»;
- если URL нет — на поиск, label «Найти похожие»;
- `/go` логирует клик в `product_clicks` и делает 302.

Партнёрские ссылки: можно сохранять в `url`; позже — subid/CPA.

## Yandex Market

- OAuth-токен реферальной программы валиден, но API ссылок/заказов требует `clid`/`place_id` и активную площадку.
- Публичного поиска товаров у Yandex Market нет.
- Для каталога нужны CPA/фид или ручной импорт URL.
- Текущий импорт по URL — ручной мост; массовый импорт — следующий шаг.

## Что делать дальше

1. Выбрать 1 стиль + 1 комнату.
2. Импортировать 20–50 реальных товаров с URL.
3. Собрать комплект и закрепить.
4. Перегенерировать hero под реальные товары.
5. Проверить смету и переходы.
6. Только потом расширять.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [ADMIN.md](ADMIN.md)
- [ROADMAP.md](ROADMAP.md)
