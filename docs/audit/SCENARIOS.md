# Матрица прохождения сценариев

Дата: 2026-11-04. Прод: `https://www.remontvision.ru`. Метод: headless Chrome 156 + CDP, desktop 1440×900 / mobile 390×844.
Авторизованный контекст: изолированный тестовый аккаунт `audit-test-20261104@remontvision.test` (создан напрямую в БД, без OTP-письма; сессия через cookie). Read-only админка — по `ADMIN_KEY`.
Статусы: **PASS** / **FAIL** / **PARTIAL** / **NOT VERIFIED** / **NOT TESTED**.

| # | Роль | Сценарий | Шаги | Ожидание | Факт | Статус | Доказательство |
|---|---|---|---|---|---|---|---|
| S-01 | Аноним | Лендинг | Открыть `/`, проскроллить | Оффер, CTA, цены, FAQ; без ошибок | Hero, 8 стилей в примерах, 3 пакета, FAQ; 0 console errors | **PASS** | `screenshots/home-desktop.png`, `home-mobile.png`, `raw/home-desktop.json` |
| S-02 | Аноним | Мобайл лендинга | 390×844 | Без переполнения | Раскладка складывается | **PASS** | `screenshots/home-mobile.png` |
| S-03 | Аноним | Страница цен | `/prices` | Те же пакеты, что в БД/оплате | Старые 2/99, 5/229, 15/599; ЮKassa | **FAIL** A-01 | `screenshots/prices-desktop.png`, `raw/prices-desktop.json`, `public/prices.html:41-50,67` |
| S-04 | Аноним | Легальные страницы | `/offer`, `/privacy` | Доступны, читаемы | OK, 0 ошибок | **PASS** | `screenshots/offer-desktop.png`, `privacy-desktop.png` |
| S-05 | Пользователь | Вход (сессия) | Тестовый аккаунт + cookie `rv_sid` | Кабинет доступен | `/cabinet` открылся, баланс 2 кр., email тестовый | **PASS** (сессия) / OTP-поток **NOT VERIFIED** | `screenshots/auth-cabinet-desktop.png`, `raw/auth-cabinet-desktop.json` |
| S-06 | Пользователь | Кабинет (пусто) | Открыть `/cabinet` | Понятный empty state | «ПОКА ПУСТО» + «Создать дизайн», 0 кр. использовано | **PASS** | `screenshots/auth-cabinet-desktop.png`, `auth-cabinet-mobile.png` |
| S-07 | Пользователь | Генератор шаг 1 | `/?panel=1` → загрузить фото → тип «Спальня» | Панель, превью, авто-бриф | Фото принято, тип выбран, бриф готов | **PASS** | `raw/gen-result.json`, `screenshots/gen-style.png` |
| S-08 | Пользователь | Генератор шаг 2 | Стиль «Скандинавский» → «Дополнительно» → каталог on | Стили/класс/каталог | Стиль выбран, каталог `aria-pressed=true` | **PASS** | `screenshots/gen-style-extras.png`, `raw/gen-result.json` |
| S-09 | Пользователь | Генерация | «Сгенерировать» → ждать результат | Рендер, −1 кредит | `done` за 66 с, баланс 2→1, результат + бриф + смета | **PASS** | `screenshots/gen-result.png`, `raw/gen-result.json` |
| S-10 | Пользователь | Смета в результате | Проверить позиции и ссылки | Реальные товары/ссылки | 9 демо-позиций, ссылки `/go/13`, `/go/178`…, `total 456200`, `prices_as_of 2026-10-27` | **FAIL** A-16 | `/api/rooms/940f00ad…` → `raw/gen-result.json` |
| S-11 | Пользователь | Арт-директор | Проверить `cost_breakdown.art_direction` | Есть стоимость/бриф | `art_direction: null`, нет `art_direction_*` в логах | **FAIL** A-17 | `raw/gen-result.json`, логи прода |
| S-12 | Админ | Вход по ключу | `/admin` + `ADMIN_KEY` | Доступ к вкладкам | Админка открылась, 0 ошибок | **PASS** | `screenshots/admin-auth-desktop.png` |
| S-13 | Админ | Пакеты | Вкладка «Пакеты кредитов» | Новые пакеты активны | `room/flat/house` активны, старые выключены | **PASS** | `screenshots/admin-tab-Пакеты-кредитов-desktop.png` |
| S-14 | Админ | Read-only вкладки | Комнаты, Стили, Модели, Очистка, Генерация, Статьи, Каталог | Загружаются без ошибок | Все 7 вкладок ок; «Товары в рендере» off | **PASS** | `screenshots/admin-tab-*.png`, `raw/admin-tab-*.json` |
| S-15 | Админ | Статьи | Вкладка «Статьи» | Список + публикация | Есть published-статья `skandinavskiy-spalnya-c240e2` | **PASS** | `screenshots/admin-tab-Статьи-desktop.png` |
| S-16 | Аноним | Публичная статья | `/articles/skandinavskiy-spalnya-c240e2` | Обложка, текст, товары | 200, title, JSON-LD, красивый вид — **но 0 товаров** | **FAIL** A-18 (контент PASS) | `screenshots/article-live-desktop.png`, `/tmp/article.html` |
| S-17 | Аноним | Неизвестный маршрут | `/nonexistent` | Брендированная 404 | `Cannot GET /nonexistent` | **FAIL** A-04 | `screenshots/notfound-desktop.png` |
| S-18 | Аноним | 404 статьи | `/articles/nonexistent` | Брендированная 404 | Голый текст | **FAIL** A-05 | `screenshots/article-404-desktop.png` |
| S-19 | Аноним | Невалидный шаринг | `/s/invalid` | Понятная ошибка | Брендированное «Ссылка не найдена» | **PASS** | `screenshots/share-invalid-desktop.png` |
| S-20 | Аноним | Клавиатура | Tab ×22 | Логичный порядок | Skip-link → навигация → CTA → примеры → цены | **PASS** (базово) | `raw/keyboard-focus.json` |
| S-21 | Аноним | Консоль/сеть | 20+ загрузок | Без ошибок | 0 console errors; 401 `/api/me` ожидаем | **PASS** | `raw/*.json` |
| S-22 | Аноним | Кэш/производительность | `curl -I`, CDP | Разумные заголовки | TTFB ~136–151 мс; `max-age=0` у хешей (A-06) | **FAIL** A-06 | вывод `curl -I`, `raw/home-desktop.json` |
| S-23 | Аноним | SEO | robots/sitemap/мета | Индексируемость | robots OK, sitemap статических страниц полный (нет только статей), meta `/prices` старая | **PARTIAL** A-10/A-11 | `curl`, `raw/home-desktop.json` |

## Не проверено

- **OTP-поток** (письмо/код) — не отправляли письма; вход тестового аккаунта через сессию.
- **Платежи** — запрещены правилами.
- **Полный a11y** (screen reader/контраст) — не выполнялся.
- **Lighthouse** — не запускался (нельзя ставить зависимости).

Чтение кода использовалось для сверки ожиданий (дефолт `use_catalog`, `ART_DIRECTION_ENABLED`), но выводы о страницах подкреплены скриншотами/DOM/сетью/логами.
