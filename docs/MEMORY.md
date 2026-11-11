# Память проекта

Состояние на 2026-11-11. Секреты сюда не писать. Рабочая память для следующих сессий.

## Продукт и главное требование

- AI-редизайн интерьера по фото: визуализация, разбор, правки, план ремонта, подбор товаров.
- Главная ценность: новый дизайн при сохранении **пропорций, размеров и камеры** помещения.
- Окна/двери/потолок — часть архитектуры; их нельзя произвольно добавлять/двигать.
- Пользователь хочет новый дизайн, а не перестановку старой мебели; крупная мебель может меняться.

## Текущий поток

1. Загрузка фото.
2. Выбор типа комнаты, до 8 пар «стиль × концепция», класс материалов.
3. Генерация (design-first).
4. Правки (первые 3 бесплатны), разбор, роадмап, шаринг.
5. Подбор товаров (MCP, бесплатно).

## Генерация

- Render: FLUX 3 Image 1K (из `app_settings`/`.env`, код-дефолт `black-forest-labs/flux-3-image`).
- Vision: `google/gemini-3.1-pro-preview`; direction: DeepSeek Flash.
- Очистка: FLUX 3 Klein, **выключена по умолчанию**; работает только при `keep_furniture=false`.
- Design-first: исходник + один art ref, без product refs.
- Мульти-стиль: до 8 пар, каждая — отдельный рендер и кредит.
- QA архитектуры выключен по умолчанию (`ARCHITECTURE_QA_ENABLED=0`).
- Товарная правка: vision QA; при отказе `rejected` + refund.

## Очередь и скорость

- `claimNextRender`: `FOR UPDATE SKIP LOCKED` + lease 5 мин + `claimed_by`.
- Heartbeat 30 с; requeue/reaper — только истёкшие lease; processing > 60 мин → error + refund.
- `WORKER_CONCURRENCY` (1–8, default 2); image-вызовы — глобальный advisory-слот.
- Direction кэш: 3 варианта, TTL 30 дней, детерминированный выбор, негативный маркер на сутки.
- `IMAGE_MIN_GAP_MS=10000`; 429 — до 4 попыток (10/20/40 с).

## Промт и стиль

- `buildPrompt()`: TASK → ARCHITECTURE LOCK → ART DIRECTION → SCALE → KEEP → FURNITURE → RADIATOR/WINDOW/LIGHTING → STYLE → MATERIALS → OUTPUT/AVOID.
- Правила в `app_settings.prompt.rules.v1`, дефолты `src/promptconfig.js`.
- **Известный баг:** `furnitureOff`, `catalogOn`, `styling` не доходят до промта.
- Режимы стиля: `text` (default), `reference`, `swatches`.
- 10 стилей × 10 концепций; 12 типов комнат.
- Style-ref/hero-референсы при `text` не используются.

## Каталог и товары

- Демо: 100 активных товаров, 0 URL; заказы невозможны.
- Новые базовые рендеры: `render_items` пуст (design-first); смета — у старых рендеров/правок.
- Legacy Yandex procurement не подключён; текущий подбор — MCP/catalog-service (бесплатно, один проход).
- catalog-service: Hoff ~36k офферов, DINOv2 ViT-B/14, pgvector.

## Платежи

- Прод: Robokassa, `ROBOKASSA_TEST=false`, `PAYMENT_PROVIDER=robokassa`.
- Пакеты: 10/20/60 кредитов — 399/599/1499 ₽; первые 3 правки бесплатны.
- Возвраты выключены; чеки вручную; ЮKassa — fallback.
- `InvId` = `payments.id`; начисление идемпотентно.

## Инфраструктура

- VPS: `/root/remontvision`, Docker Compose: app, db, catalog, catalog-db.
- Публично: `https://www.remontvision.ru`; деплой — push в `main` → CI (test) → SSH → compose up.
- Миграции: `001–053`, файла `048` нет.
- Тесты: unit + integration (45) + catalog pytest (72); CI-гейт.
- **Эксплуатация:** диск 91%, бэкап 45 ч без `db_dump`, внешнего монитора нет.
- Прод-коммит на 2026-11-11: `092bdcd`.

## Открытые вопросы и риски

1. Реальный каталог (URL) — главный блокер запуска.
2. Смета для новых рендеров не собирается.
3. Часть правил админки не применяется.
4. Legacy procurement/статьи/Search Lab — что оставить.
5. Бэкапы/диск/алерты.
6. Inpainting и качество света/розеток.
7. Модели могут менять архитектуру при `reference`; нужен live-тест.

## Правила для следующих сессий

- Не делать широких изменений промта/модели/cleanup/QA/стилей без просьбы.
- Не коммитить и не деплоить без явной команды.
- Не менять активные стили/настройки поиска без подтверждения.
- Секреты — только env; не в репозиторий и не в этот файл.
- Перед изменениями читать [STATUS.md](STATUS.md) и [AGENTS.md](../AGENTS.md).
