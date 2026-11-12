# AI-интеграция

Провайдер генерации/vision изолирован в `src/openrouter.js`; direction — часть одного vision-вызова арт-директора (`src/artdirector.js`) с кэшем `room_analysis`. Актуальный пайплайн — [GENERATION.md](GENERATION.md).

## Текущая конфигурация

| Роль | Модель (код-дефолт) | Где менять |
|---|---|---|
| Render | `black-forest-labs/flux-3-image` | `app_settings.model.render` / `RENDER_MODEL` / админка |
| Edit | пусто = render | `app_settings.model.edit` / `EDIT_MODEL` |
| Vision | `google/gemini-3.1-pro-preview` | `app_settings.model.vision` / `VISION_MODEL` |
| Direction | `deepseek/deepseek-v4.1-flash-1017` | `DIRECTION_MODEL` / `ART_DIRECTOR_MODEL` |
| Cleanup | `black-forest-labs/flux-3-image-klein` | `cleanup.config.v1` |
| Layout | DeepSeek Flash | `LAYOUT_MODEL` / `DIRECTION_MODEL` |

Прокси — `src/proxy.js`, применяется без рестарта. `MOCK_MODE` включается отсутствием `OPENROUTER_API_KEY`.

## Контракт модуля

```js
export const MOCK_MODE;
export function log(obj);
export async function assertConfig();
export async function listImageModels();
export function buildPrompt({ style, priceTier, roomType, imageMap, keepFurniture, dimensions, artDirection, repairScope, layoutPlan, ... });
export function buildEditPrompt({ roomType, target, instruction, hasRef, refLabel, refDimensions });
export async function generateRender({ prompt, sourceImageB64, referenceImagesB64, aspectRatio, resolution, model });
export async function generateCleanupRender({ prompt, sourceImageB64, aspectRatio, model, resolution, aspect });
export async function visionJson({ system, user, images, model });
export async function buildArtDirection({ imageDataUrl, roomType, style, styleDescription, dimensions, keepFurniture });
export async function analyzeRoomBrief({ imageDataUrl, roomType });
export async function parseRender(renderB64, mime);
export function snapAspect(width, height, allowed);
export const MAX_REFERENCES; // 4
```

## Direction и кэш

- `buildDesignDirection` — один шаг агента (`maxSteps: 1`); повтор только при нераспарсенном JSON.
- `generation_cache`: 3 варианта на `стиль|концепт|комната|размеры|версия промта`, TTL 30 дней.
- Выбор — `sessionId` hash; новизна — при выборе из вариантов.
- Кэш-хит: `cached: true`, `cost: null`; пустой `prompt_en` — негативный маркер на сутки.
- Настройки: `DIRECTION_CACHE_ENABLED/VARIANTS/TTL_DAYS`.

## Арт-директор и repair scope

- `buildArtDirection` — vision по фото: размеры, объектив, мебель, палитра, свет.
- `buildRepairScope` — объём ремонта; запускается параллельно с арт-директором.
- `buildLayoutPlan` — только пустая комната; `fitLayoutPlan` проверяет проходы.
- Стоимость каждого вызова — в `renders.cost_breakdown`.

## Возможности моделей

`src/modelcaps.js`:

- Seedream: resolution 1K/2K, aspect.
- FLUX 3 Image/Klein: 768/1K/1.5K/2K/4K, aspect.
- FLUX 2 Pro: **resolution не отправляется**; content moderation возможен.
- Gemini: resolution не отправляется; aspect из безопасного списка.
- Image-only модели (Seedream/FLUX) не используют chat-fallback.

## Провайдерские грабли

- `/images` 400 — смотреть тело; не маскировать chat-fallback.
- FLUX 2 Pro: без resolution; BFL может блокировать спальни/кровати.
- Формат выхода JPEG/WebP/PNG — определять по сигнатуре (`detectImageExt`).
- Стоимость — `usage.cost`.
- `withImageSlot` + глобальный advisory lock: не обходить слот и не повторять упавший вызов.
- 429: до 4 попыток 10/20/40 с + `Retry-After`.
- Прокси: OpenRouter WAF может блокировать IP VPS.

## Добавить провайдера

1. Создать `src/provider-<name>.js` с контрактом выше.
2. Переключить импорты в `server.js`/`jobs.js` (или фабрику по env).
3. Добавить ключи в env.
4. Проверить `assertConfig`, `/api/models`, живой рендер, итерацию, вертикальное фото.
5. Обновить `modelcaps.js` и docs.

## Не входит в провайдера

- Эмбеддинг-матчинг товаров (catalog-service).
- Metric depth/размеры комнаты.
- Inpainting/маски.
- Стадийная оркестрация — `jobs.js`.

## Связанные документы

- [GENERATION.md](GENERATION.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [OPERATIONS.md](OPERATIONS.md)
