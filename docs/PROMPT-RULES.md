# Правила промта

Промт = **код** + **редактируемые правила**.

- Код: `src/openrouter.js` (структура, KEEP/CHANGE, output), `src/roomtypes.js` (комнаты, слоты), `src/artdirector.js` (факты + direction одним вызовом).
- Правила: `src/promptconfig.js` (дефолты) + `app_settings.prompt.rules.v1` (админка «Промт»).

## Поля

| Ключ | Что задаёт | Применяется |
|---|---|---|
| `lighting` | тёплый многослойный свет, cove, лампы, запрет плоского света | да |
| `cleanup` | убрать/спрятать ТВ, провода, радиатор, старые зеркала/люстры | да |
| `window` | шторы, тюль, римские/рулонные, скрытый карниз | да |
| `pinterest` | арт, полки, мелочи, техника, плюш, сцены | да |
| `photo` | 24–35 мм, golden hour, film grain, grading, не CGI | да |
| `dimensions` | блок размеров комнаты | да |
| `geometryLock` | нерушимая геометрия: метры + запреты проёмов/высоты/перспективы | да |
| `scalePlan` | план мебели/проходов | да |
| `bed` | длина кровати (спальня/детская) | да |
| `radiators` | вентилируемые экраны | да |
| `furnitureOn` | «оставить мебель» | да |
| `furnitureOff` | «мебель не учитывать» | да |
| `catalogOn` / `catalogOff` | товары/смета | **нет — известный баг** |
| `styling` (room) | Pinterest-стайлинг комнаты | **нет — известный баг** |
| `extra` | свободный текст | да |
| `avoid` | негативный список | да |

Оставшийся баг (`catalogOn`/`styling`) зафиксирован в [docs/redesign](redesign/2026-11-11-redesign-codebase/redesign.md); `furnitureOff` исправлен. Регрессия промтов — `npm run test:regression`.

## Структура base-промта

1. `IMAGE ROLES` — исходник + максимум один art ref; product refs нет.
2. `TASK` — глубокий редизайн, WOW, Pinterest, не шоурум.
3. `ARCHITECTURE LOCK` — архитектура/камера/пропорции.
4. `GEOMETRY LOCK` — дословные метры и запреты окон/дверей/высоты/перспективы.
5. `ART DIRECTION` + `VARIABILITY` — замысел и новизна комнаты из одного vision-вызова.
6. `ROOM DIMENSIONS AND SCALE`, `SCALE PLAN`, `BED SIZE`, `RADIATOR COVERS`.
7. `KEEP EXACTLY`, `FURNITURE MODE`.
8. `CHANGE / DEEP TRANSFORMATION`, `COMPOSITION`, `LIGHTING DESIGN`.
9. `CLEANUP / REALISM`, `WINDOW STYLING`, `LIFE & STYLING`, `PINTEREST-LEVEL STYLING`.
10. `STYLE`, `MATERIAL CLASS`, `OUTPUT`, `AVOID`.

## Direction

- Один vision-вызов `buildArtDirection`: факты по фото + поле `direction` (карточки стиля/концепции и история на входе).
- Без концепции или при конфликтной паре — `facts_only`; `prompt_en` (60–120 слов) идёт в `ART DIRECTION`.
- Повторные рендеры — из `room_analysis`; новизна — `src/variability.js`. См. [GENERATION.md](GENERATION.md#5-direction-и-кэш).

## Очистка комнаты

Отдельный промт/модель (`cleanup.config.v1`, админка «Очистка»), не часть base. Только при `keep_furniture=false`, запускается асинхронно при первом enqueue; shell хранится на комнате. Плейсхолдеры `{room}`, `{keep}`, `{remove}`. Выключена по умолчанию.

## Правки

Edit-промт короткий: «Image 1 — current render, Image 2 — reference, change only target». Правила `lighting/cleanup/...` к нему не применяются. У товарной карточки игнорируются фон, свет, ракурс, стейджинг. После правки — vision QA.

## Как менять

1. Малые изменения — в админке «Промт», сохранить, тестовая генерация.
2. Дефолт — обновить `DEFAULT_PROMPT_CONFIG` в `src/promptconfig.js`.
3. Не дублировать текст в `openrouter.js` и `promptconfig.js`.
4. После изменения — `npm test`, `npm run test:regression`, canary, `docs/HISTORY.md`.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [ADMIN.md](ADMIN.md)
- [HISTORY.md](HISTORY.md)
