# Правила промта

Промт = **код** + **редактируемые правила**.

- Код: `src/openrouter.js` (структура, KEEP/CHANGE, product palette, output), `src/roomtypes.js` (комнаты, слоты, стиль).
- Правила: `src/promptconfig.js` (дефолты) + `app_settings.prompt.rules.v1` (админка «Промт»).

## Поля

| Ключ | Что задаёт |
|---|---|
| `lighting` | тёплый многослойный свет, cove, лампы, запрет плоского света |
| `cleanup` | убрать/спрятать ТВ, провода, радиатор, старые зеркала/люстры, мусор |
| `window` | шторы, тюль, римские/рулонные, скрытый карниз |
| `pinterest` | арт, полки, мелочи, техника, плюш, 3–5 сцен |
| `photo` | 24–35 мм, golden hour, film grain, color grading, не CGI |
| `furnitureOn` | правило «Оставить мебель» |
| `furnitureOff` | правило «Мебель не учитывать» — удалить всё и обставить заново |
| `catalogOn` | как использовать товары и смету |
| `catalogOff` | свободный дизайн без товаров |
| `extra` | свободный текст в конец art direction |
| `avoid` | негативный список |

## Структура base-промта

1. `IMAGE ROLES` — исходник, style ref, product refs.
2. `TASK` — глубокий редизайн, WOW, Pinterest, не шоурум.
3. `KEEP EXACTLY` — архитектура/камера/мебель.
4. `FURNITURE MODE`.
5. `CHANGE / DEEP TRANSFORMATION`.
6. `COMPOSITION`.
7. `LIGHTING DESIGN`.
8. `CLEANUP / REALISM`.
9. `WINDOW STYLING`.
10. `ROOM RULES` — guidance/forbid комнаты.
11. `LIFE & STYLING` + `PINTEREST-LEVEL STYLING`.
12. `CATALOG / MATERIALS` + product list.
13. `STYLE` — style ref/text/palette/accent.
14. `MATERIAL CLASS`.
15. `OUTPUT` + `AVOID`.

## Правила по умолчанию (смысл)

- Свет важнее мебели: cove/подсветка/лампы, без одной плоской люстры.
- Убрать визуальный мусор: ТВ, провода, радиатор, старые зеркала/люстры/жалюзи.
- Окна: новые шторы/жалюзи, без пластиковых старых.
- Pinterest: арт-группа, полка/консоль, текстиль, техника на поверхностях, плюш только в спальне/детской.
- Электроника не на полу, провода скрыты.
- Радиатор — за flush-решёткой или убрать.
- Светильник строго в стиле/референсе, без generic-хрусталя.
- Фото: editorial, 24–35 мм, natural/golden hour, film grain, не 3D/CGI.
- Если мебель не учитываем — удалить всё, кроме архитектуры/встроенного/сантехники/электрики, и обставить заново.
- Если каталог выключен — не добавлять товары/смету.

## Очистка комнаты

Очистка — **отдельный** промт/модель (`cleanup.config.v1`, админка «Очистка»), не часть base-промта. Она применяется только при `keep_furniture=false`. Плейсхолдеры: `{room}`, `{keep}`, `{remove}`. Подробнее: [ADMIN.md](ADMIN.md#очистка).

## Правки

Edit-промт **не** использует полный base. Он короткий: «Image 1 — current render, Image 2 — reference, change only target, keep everything else». Правила `lighting/cleanup/...` к нему не применяются.

## Как менять

1. Малые изменения — в админке «Промт», сохранить, сделать тестовую генерацию.
2. Если правило должно стать дефолтом — обновить `DEFAULT_PROMPT_CONFIG` в `src/promptconfig.js`.
3. Не дублировать один и тот же текст в `openrouter.js` и `promptconfig.js`.
4. После изменения — `npm test`, canary, `docs/HISTORY.md`.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [ADMIN.md](ADMIN.md)
- [HISTORY.md](HISTORY.md)
