# ГЕНЕРАТОР ПРОМТОВ ДЛЯ РЕДИЗАЙНА ИНТЕРЬЕРА
## Система: стиль × тип комнаты × геометрия × масштаб × референсы
### 10 трендовых стилей 2026 × 5 примеров = 50 готовых промтов

> Промты написаны на английском — так image-модели (OpenRouter Image API, Midjourney, SDXL, Flux) дают стабильно более точный результат. Структура опирается на практики Prompt Architects (6 слотов: комната+масштаб → стиль → геометрия → материалы → свет → камера) и библиотеку monju252/AI-Prompts-for-Interior-Design.

---

## 1. КАК УСТРОЕН ГЕНЕРАТОР

### Универсальный шаблон (7 блоков)

```
[БЛОК 0 — BASE]   Use the source room photo as an immutable architectural base.
                  Preserve exactly: room geometry, camera angle and perspective,
                  wall / window / door positions, ceiling height, natural light direction.

[БЛОК 1 — ROOM]   Redesign of a {room_type}, {W} × {L} m, {H} m ceiling.

[БЛОК 2 — STYLE]  Style: {style_name} — {style_definition_in_3_lines}.

[БЛОК 3 — SCALE]  Scale-aware furniture plan: {furniture_plan_derived_from_dimensions}.

[БЛОК 4 — RECIPE] Feature wall: {...}. Focal point: {...}. Materials: {...}.
                  Palette: {...}. Textiles: {...}. Decor: {...}.
                  Lighting: ambient {...}, task {...}, accent {...}, {temperature}K.

[БЛОК 5 — REFS]  Match the mood and materiality of the attached design reference(s):
                  {reference_description}. Incorporate the attached product
                  reference(s): {product_placement_instructions}.

[БЛОК 6 — AVOID] Avoid: empty visible walls, flat overhead-only lighting, generic
                  showroom furniture, all-grey palette, random clutter,
                  distorted proportions, overscaled furniture, plastic-looking materials.

[БЛОК 7 — CAMERA] Editorial architectural interior photography, realistic furniture
                  scale, correct perspective, {lens}mm lens, eye-level, --ar 3:2
```

### Почему порядок важен

Промт идёт от неизменного (архитектура, геометрия) к изменяемому (стиль, материалы, декор). Модель «читает» слева направо: сначала она фиксирует, что запрещено трогать, потом — что создавать. Если переставить блоки местами, модель начнёт выдумывать геометрию под мебель.

---

## 2. ЛОГИКА МАСШТАБА (БЛОК 3) — ГЛАВНОЕ ОТЛИЧИЕ ОТ «СКУЧНЫХ» ГЕНЕРАТОРОВ

Скучные результаты рождаются из фразы «make this room Japandi». Модель не знает размеров и рисует среднестатистическую комнату со среднестатистическим диваном. Генератор обязан **вычислять план мебели из размеров комнаты** и писать его в промт явно.

### Таблица соответствия: ширина спальни → кровать

| Ширина комнаты | Кровать | Проходы | Что писать в промт |
|---|---|---|---|
| 2.0–2.2 м | 140–160 см | 20–40 см с одной стороны | "the bed spans nearly the full width of the narrow 2.0 m room, one narrow walkway of 30 cm along one side, bed headboard against the long wall" |
| 2.4–2.7 м | 160–180 см | 40–60 см с двух сторон | "a 160 cm bed centered on the wall, narrow but walkable passages on both sides" |
| 2.8–3.2 м | 180–200 см | 60+ см | "a generous 180 cm bed with comfortable circulation on both sides, space for two nightstands" |
| >3.5 м | 200 см + зона | — | "a king bed plus a reading corner / bench at the foot" |

### Таблица соответствия: гостиная → мягкая мебель

| Ширина / площадь | Комплектация |
|---|---|
| < 2.8 м ширина | Диван ≤ 200 см, узкий журнальный стол, без кресел либо одно компактное; пуф вместо второго кресла |
| 2.8–3.6 м | Диван 220–240 см + 1 кресло; ковёр якорит зону |
| 3.6–4.5 м | Диван + 2 кресла, торшер, полноценный кофейный стол |
| > 4.5 м или студия | Зонирование: ковёр + свет делят на seating и dining; двусторонний диван-барьер |

### Таблица соответствия: кухня

| Площадь кухни | Решение |
|---|---|
| < 6 м² | Однорядная (linear) кухня вдоль одной стены, глубина 60 см, остаётся ≥ 90 см проход; складной столик |
| 6–10 м² | Г-образная (L-shape), встраиваемая техника, узкий остров 180×60 см если проход ≥ 100 см |
| 10–16 м² | П-образная или остров 200×90 см, барные стулья со стороны гостиной |
| > 16 м², кухня-гостиная | Остров + dining table, разные уровни света над зонами |

### Жёсткие нормы, которые генератор вшивает в промт

- Проход между мебелью и стеной: **не менее 60 см**, комфортно — 80 см.
- Между диваном и кофейным столом: **35–45 см**.
- Между обеденным стулом (выдвинутым) и стеной/мебелью: **90 см**.
- Ширина дверного проёма сохраняется как в исходном фото — дверь не «переносится».
- Тумба у кровати: **не уже 40 см**, иначе пишем "wall-mounted shelf instead of a nightstand".
- Ширина коридора в кадре: мебель глубиной > 35 см запрещена.

### Формулировки для нестандартной геометрии (копировать в БЛОК 3)

```
// Комната-щель (2 м)
"narrow 2.0 m wide room: the 160 cm bed spans almost the entire width,
 headboard on the long wall, a single 40 cm walkway on one side,
 wall-mounted bedside shelf, no freestanding nightstands"

// Низкие потолки (< 2.6 м)
"low 2.45 m ceiling: no pendant lights, no floor-to-ceiling cabinetry,
 low-profile furniture, curtain track mounted at ceiling line to fake height"

// Проходная комната
"walk-through living room: furniture only along the two solid walls,
 a clear diagonal circulation path from door to window, no blocking pieces"

// Мансарда / скосы
"sloped ceiling down to 1.2 m on one side: bed and full-height storage
 placed under the highest zone, a low reading bench follows the slope"
```

---

## 3. КАК ПОДКЛЮЧАТЬ РЕФЕРЕНСЫ (БЛОК 5)

Правило из спецификации: **1 фото комнаты + 1–2 design anchors + 1–3 product references**. Больше несогласованных картинок = меньше управляемость.

### Design anchor (стиль-референс)

Используется для передачи настроения и качества света, НЕ для копирования мебели:

```
Match the mood, light quality and material honesty of the attached design
reference: {e.g. "soft diffused daylight, limewash texture, quiet negative
space"}. Do not copy its furniture — adapt its atmosphere to this room.
```

### Product reference (товар пользователя)

Режимы из спецификации — `must_use` / `preferred` / `inspiration`:

```
// must_use — объект обязан попасть в кадр
"Place the referenced {product} exactly as the focal {slot} of the room,
centered on {wall}, true to its shape and proportions from the reference image."

// preferred — адаптировать характер, не копировать
"Use the referenced {product} as the main inspiration for the {slot}:
keep its {color / silhouette / material character}, adapt size to this room."

// inspiration — только для палитры/фактуры
"Echo the palette and texture of the referenced {product} in the
{category} choices."
```

### Чего НИКОГДА не писать

- «exactly this product» без подтверждения каталогом — модель нарисует вымышленный товар, а пользователь получит ложное обещание shopping list. В промте визуализации можно, но в UI обязан дисклеймер «concept render, not a product photo».
- Несколько product references в одном слоте — конфликт масштабов.

---

## 4. ДЕСЯТЬ СТИЛЕЙ: РЕЦЕПТЫ И 50 ПРОМТОВ

Для каждого стиля: карточка-рецепт (палитра, материалы, свет, avoid) + 5 промтов на разные комнаты и масштабы. Плейсхолдеры: `{W}×{L}` — размеры комнаты из анализа фото (`analyze_room`), `{refs}` — блок референсов из раздела 3.

---

## СТИЛЬ 1 — JAPANDI (Джапанди) 🌿

**Тренд 2026:** самый запрашиваемый стиль; эволюция в «Japandi 2.0 with color» — приглушённые индиго, шалфей, терракота поверх нейтральной базы.

| Рецепт | Значение |
|---|---|
| Base palette | warm white, oatmeal, light oak |
| Contrast | charcoal, muted indigo |
| Accent | aged bronze, blackened steel |
| Materials | rift-sawn oak, bouclé, washed linen, rice-paper, handmade ceramics |
| Feature wall | limewash + one oversized ink artwork, или тонкое рейковое панно |
| Light | 2700K, бумажные/тканевые абажуры, скрытая подсветка |
| Avoid | холодный белый, глянец, обилие мелкого декора, «showroom» |

### Пример 1.1 — Гостиная 4.2×5.0 м, средний масштаб

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.2 × 5.0 m, 2.7 m ceiling. Style: Japandi —
Japanese restraint meets Scandinavian warmth: purposeful negative space,
low furniture, tactile natural materials, craftsmanship over decoration.

Scale-aware plan: a 240 cm low linen sofa against the solid wall, one curved
bouclé armchair at 80° to it, oak coffee table 110 cm leaving a 40 cm gap,
a paper-floor-lamp corner. The window wall stays completely clear.

Feature wall: warm ivory limewash with one oversized indigo ink artwork,
picture light above. Focal point: the low sofa zone anchored by a
300×200 cm wool rug. Materials: light oak, ivory bouclé, washed linen,
rice paper, handmade ceramics. Palette: warm white and oatmeal base,
deep indigo contrast, aged bronze accents.

Lighting: ambient — warm 2700K indirect wash from a cove; task — paper
floor lamp and a table lamp; accent — picture light over the artwork.
Textiles: wool rug, full-height washed-linen curtains, two cushions and
a soft throw in oatmeal. Decor: one ceramic vessel, one stack of art books,
one ikebana branch arrangement. Ma — calm negative space is intentional.

{refs}

Avoid: empty walls, flat overhead-only lighting, generic showroom furniture,
all-grey palette, random clutter, overscaled furniture, plastic materials.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 1.2 — Спальня 2.1×3.4 м — узкая (кровать во всю ширину)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a narrow bedroom, 2.1 × 3.4 m, 2.6 m ceiling. Style: Japandi —
quiet, low, tactile; every object earns its place.

Scale-aware plan (critical): the room is only 2.1 m wide — a 160 cm bed
spans nearly the entire width. Headboard on the long solid wall, a single
35–40 cm walkway on the window side. No freestanding nightstands: two
wall-mounted oak shelves 30 cm deep above the bed line. Under-bed drawers
replace a wardrobe for linens. Nothing else on the floor except a slim bench
at the foot if 60 cm of passage remains.

Feature wall: warm limewash behind the bed, one horizontal sumi-e ink
print, 2700K picture light. Focal point: the low platform bed (25 cm
height) with rumpled oatmeal linen. Materials: light oak, linen, washi
paper, unglazed ceramic. Palette: warm white, oatmeal, a single charcoal
accent in the artwork. Lighting: ambient — concealed LED cove at ceiling
line (no pendants in this low room); task — one paper table lamp on the
wall shelf; accent — picture light.

Textiles: rumpled linen bedding, one wool throw, a flatweave cotton rug
along the walkway only. Decor: one ceramic vase with a single dried branch,
nothing on the shelves but a book.

{refs}

Avoid: floor lamps, freestanding furniture in the walkway, pendants,
all-grey palette, clutter, overscaled furniture.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 20mm lens, eye-level from the door, --ar 3:2
```

### Пример 1.3 — Кухня 3.0×3.6 м (9 м²)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 3.0 × 3.6 m, 2.7 m ceiling. Style: Japandi —
functional calm, honest materials, hidden storage.

Scale-aware plan: L-shaped layout along the two solid walls — 300 cm run
with sink under the window, 240 cm run with induction hob and 60 cm
integrated appliances; 100 cm central walkway stays clear. A 140×70 cm
oak dining table for two against the third wall, two low wooden stools
that tuck fully underneath. No island in this footprint.

Feature wall: open oak shelving (two 80 cm shelves only) with handmade
ceramics and stacked bowls — nothing else. Focal point: the fluted oak
range hood panel and a single ceramic bowl on the counter. Materials:
white oak, matte lacquer in warm white, honed grey limestone counter,
washi pendant. Palette: warm white, light oak, soft charcoal grout lines,
one indigo ceramic accent. Lighting: ambient — 3000K ceiling cove; task —
LED strip under shelves; accent — washi paper pendant (28 cm diameter)
over the table; pendant bottom at 185 cm above floor.

Textiles: linen curtain on the lower half of the window, cotton runner.
Decor: one wooden tray, one stoneware teapot set, a small potted moss.

{refs}

Avoid: glossy cabinets, visible small appliances, decorative clutter,
top cabinets on every wall, showroom styling.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 3:2
```

### Пример 1.4 — Ванная 1.8×2.6 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 1.8 × 2.6 m, 2.5 m ceiling. Style: Japandi —
onsen-like serenity, stone and wood, nothing decorative without purpose.

Scale-aware plan: the 1.8 m width fits exactly — a 90 cm walk-in shower
with clear glass on the short end, a 100 cm floating oak vanity with
round mirror, a compact wall-hung WC. Heated stone floor. No freestanding
anything: every centimetre of floor stays visible to make the room read
larger.

Feature wall: large-format honed travertine behind the vanity, one
recessed niche with a ceramic vase. Focal point: the round 60 cm mirror
with a warm sconce. Materials: travertine, white oak, matte white ceramic,
fluted glass. Palette: warm white, sand, light oak, one charcoal accent
towel. Lighting: ambient — 3000K IP44 downlights; task — sconces at face
level both sides of mirror; accent — concealed niche LED.

Textiles: two linen towels in oatmeal, bamboo bath mat. Decor: one
unglazed ceramic vessel, one branch in a bud vase.

{refs}

Avoid: glossy tiles, chrome overload, decor clutter, dark palette,
overscaled fittings.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 1.5 — Кабинет 2.4×3.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a home office, 2.4 × 3.0 m, 2.65 m ceiling. Style: Japandi —
a room for deep focus, warm minimalism with craft.

Scale-aware plan: a 160×75 cm solid oak desk placed perpendicular to the
window so daylight falls on the work surface from the left; an ergonomic
chair in charcoal fabric; a 40 cm deep floor-to-ceiling bookcase on the
solid wall (custom, flush); a 60 cm round tatami-side low table with one
floor cushion for reading — placed to keep a clear 90 cm path from door
to window.

Feature wall: bookcase wall in white oak with 30% empty shelves —
deliberate ma. Focal point: the desk zone, one task lamp. Materials:
oak, linen, paper, ceramic. Palette: warm white walls, oak floor,
charcoal chair, indigo book spines as the only color note. Lighting:
ambient — 3000K indirect ceiling wash; task — adjustable paper-shade
desk lamp; accent — one shelf with a small uplight and a ceramic object.

Decor: one bonsai or moss bowl, one ceramic cup, a wooden box for cables.
Everything else hidden in the flush cabinets.

{refs}

Avoid: overhead-only light, cable clutter, more than 3 objects per shelf,
white plastic, generic office furniture.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

---

## СТИЛЬ 2 — WABI-SABI (Ваби-саби) 🏺

**Тренд 2026:** эстетика несовершенства; новая ветвь — **Dark Wabi-Sabi** (уголь, полночный синий, воронёная бронза).

| Рецепт | Значение |
|---|---|
| Base palette | warm grey, clay, mushroom, weathered white |
| Contrast | umber, deep charcoal (для Dark Wabi-Sabi) |
| Accent | oxidized bronze, raw blackened steel |
| Materials | rough lime plaster with trowel marks, reclaimed wood, unglazed ceramics, undyed linen, raw stone |
| Feature wall | фактурная штукатурка с видимыми мазками; ни одной гладкой поверхности |
| Light | мягкий северный дневной свет, свечи, 2200–2700K |
| Avoid | идеально белое, глянец, новодел «под старину», симметрия по линейке |

### Пример 2.1 — Гостиная 3.8×4.5 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 3.8 × 4.5 m, 2.75 m ceiling. Style: Wabi-Sabi —
beauty of imperfection and age: visible hand-troweled plaster, asymmetry,
objects that look lived-with, not staged.

Scale-aware plan: a 210 cm low sofa in undyed slubby linen along the long
wall; a reclaimed elm coffee table with visible wear; one rough-hewn
wooden stool as side table; a floor cushion in raw cotton near the window.
A 250×180 cm undyed wool rug with uneven edges. Minimum 70 cm clear
circulation from door to window.

Feature wall: hand-applied lime plaster with visible trowel texture and
natural tonal variation — no paint, no artwork needed. Focal point: a
large unglazed ceramic jar (60 cm) in the corner catching daylight.
Materials: rough lime plaster, reclaimed elm, raw linen, handmade paper,
aged clay. Palette: warm grey, clay, mushroom, weathered white — nothing
pure white or pure black. Lighting: ambient — soft north-facing daylight,
no ceiling fixture visible; task — one ceramic-base table lamp 2200K;
accent — a single candle group on the coffee table.

Textiles: slubby linen sofa cover that wrinkles naturally, undyed wool
rug, raw cotton curtain with a slightly uneven hem. Decor: three vessels
in different stages of patina, one weathered wooden bowl, a branch with
dried seed pods in a tall floor vase.

{refs}

Avoid: perfect symmetry, glossy surfaces, new-looking furniture, decor
sets bought as one collection, bright accent colors.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 35mm lens, eye-level, --ar 3:2
```

### Пример 2.2 — Спальня 3.0×3.6 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 3.0 × 3.6 m, 2.7 m ceiling. Style: Wabi-Sabi — a
quiet retreat; the room should feel like it has settled over decades.

Scale-aware plan: a 180 cm low platform bed (28 cm) with a reclaimed wood
headboard against the plaster wall; a 90 cm walkway on each side; one
rough wooden stool 35 cm as a nightstand on the right only — the left
side stays empty on purpose; a shallow linen wardrobe (55 cm deep) built
into the alcove if present, otherwise a single oak clothes rail.

Feature wall: behind the bed — clay-toned lime plaster, applied in
visible horizontal strokes, slightly darker at the base. Focal point:
the rumpled bed itself, layered linen in mushroom and undyed white.
Materials: raw linen, reclaimed oak, clay plaster, aged brass (one small
sconce). Palette: mushroom, warm grey, clay, off-white. Lighting: ambient —
morning window light through sheer undyed curtains; task — one adjustable
brass wall sconce 2400K; accent — none; darkness at the room's edges is
part of the design.

Textiles: three layers of rumpled linen bedding, a heavy undyed wool
throw, a flat cotton rug beside the bed. Decor: one cracked ceramic bowl
on the stool (kintsugi visible), a small stack of worn cloth-bound books.

{refs}

Avoid: matching nightstand pairs, ironed bedding, white walls, fitted
carpets, overhead pendants.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 35mm lens, eye-level, --ar 4:5
```

### Пример 2.3 — Столовая 2.8×3.4 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a dining room, 2.8 × 3.4 m, 2.65 m ceiling. Style: Wabi-Sabi —
the table as centerpiece; honesty of use over decoration.

Scale-aware plan: a solid reclaimed wood table 180×90 cm placed parallel
to the long wall with 85 cm clearance on all used sides; four chairs —
intentionally mismatched, all wood, two with woven rush seats; a 45 cm
deep sideboard against the short wall; one paper lantern (50 cm) above
the table. With chairs pushed in, a clear 90 cm passage from door to
window remains.

Feature wall: raw clay-plaster in warm grey with the shadow line of a
former doorway left visible — history preserved, not erased. Focal point:
the heavy wood table, visibly worn, oiled not varnished. Materials:
reclaimed elm, rush, clay plaster, unglazed stoneware, undyed linen.
Palette: warm grey, clay, natural wood, charcoal shadows. Lighting:
ambient — overcast daylight through sheer linen; task — none needed;
accent — the paper lantern 2200K over the table, off-center by 20 cm.

Textiles: undyed linen napkins, a heavy slubby table runner, a flatweave
jute rug under the table. Decor: a low ceramic fruit bowl, a wooden
candlestick group (three heights, all used), one branch in a tall vase
on the sideboard.

{refs}

Avoid: matching furniture sets, glossy table varnish, tablecloths,
symmetrical wall art, bright color.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 35mm lens, eye-level, --ar 3:2
```

### Пример 2.4 — Dark Wabi-Sabi — Гостиная 4.0×5.2 м (тёмная ветвь)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.0 × 5.2 m, 2.8 m ceiling. Style: Dark
Wabi-Sabi — wabi-sabi philosophy in a moody, intimate palette of charcoal,
midnight umber and burnished bronze.

Scale-aware plan: a 230 cm sofa in charcoal slubby linen on the long wall;
a heavy reclaimed wood coffee table 130 cm; one oversized floor cushion in
raw umber cotton; a single low wooden bench against the window wall.
A dark undyed wool rug 300×220 cm. Circulation 80 cm clear.

Feature wall: deep charcoal lime plaster with pronounced trowel texture,
catching raking light from one picture light. Focal point: a massive
unglazed ceramic vessel (75 cm) lit like a sculpture. Materials: charcoal
plaster, smoked oak, raw linen, aged bronze, hand-forged iron. Palette:
charcoal, midnight umber, warm black, burnished bronze. Lighting: ambient
— very low, 2400K; task — one bronze floor lamp with a small shade;
accent — picture light and two candles; most of the room stays in soft
shadow — that is intentional, not a rendering error.

Textiles: charcoal and umber linen layers, a heavy nubby wool throw,
blackened-steel curtain rod with thick undyed curtains. Decor: one
weathered wooden tray, two bronze bowls with patina, dried grasses in a
blackened vessel.

{refs}

Avoid: bright accents, white ceilings (keep warm off-white), glossy
finishes, even lighting, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 35mm lens, eye-level, moody exposure, --ar 3:2
```

### Пример 2.5 — Ванная 2.0×2.4 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 2.0 × 2.4 m, 2.5 m ceiling. Style: Wabi-Sabi —
stone, wood and shadow; a private ritual space.

Scale-aware plan: in the 2.0 m width — a 90 cm walk-in rain shower behind
a single fixed fluted glass panel, a 90 cm floating vanity in smoked oak,
wall-hung WC. A cedar bath mat. Floor stays fully visible; nothing on the
floor except one wooden stool.

Feature wall: tadelakt-style waterproof plaster in warm grey behind the
vanity, softly undulating. Focal point: a stone vessel sink on the oak
vanity, hand-chiseled edges. Materials: tadelakt plaster, smoked oak,
river stone, fluted glass, blackened brass. Palette: warm grey, sand,
smoked oak, charcoal shadows. Lighting: ambient — one 2700K downlight;
task — a single blackened-brass sconce; accent — candlelight on the stool;
shadows welcome.

Textiles: two heavy undyed linen towels on a wooden ladder. Decor: one
stone soap dish, one small ceramic cup, a eucalyptus branch hanging in
the shower.

{refs}

Avoid: white glossy tiles, chrome, mirrored cabinets, bright lighting,
plastic accessories.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

---

## СТИЛЬ 3 — ORGANIC MODERN / ORGANIC LUXE 🪨

**Тренд 2026:** главный кроссовер-стиль; чистые силуэты contemporary + природные материалы, изогнутые формы, «wellness-retreat» ощущение. Organic Luxe — его более дорогая ветвь: драматичная текстура камня, латунь, скульптурный свет.

| Рецепт | Значение |
|---|---|
| Base palette | cream, camel, warm beige |
| Contrast | olive, terracotta |
| Accent | brushed brass, travertine |
| Materials | travertine, white oak, bouclé/sherpa, raw linen, rattan |
| Feature wall | камень с выраженной текстурой или изогнутая ниша |
| Light | тёплый 2700–3000K, косвенный, скульптурные светильники |
| Avoid | острые углы визуально доминируют, холодный серый, хром |

### Пример 3.1 — Гостиная 4.5×6.0 м (большой масштаб)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a large living room, 4.5 × 6.0 m, 3.0 m ceiling. Style:
Organic Luxe — contemporary silhouettes softened by nature: curved forms,
pronounced stone texture, warm earthy palette, quiet luxury.

Scale-aware plan: a 280 cm curved bouclé sofa as the anchor, facing a
freeform travertine coffee table (140 cm) — a generous 45 cm between them;
two sculptural armchairs in sherpa at a conversational angle; a 350×250 cm
wool rug defining the seating zone; one monumental floor lamp with an
organic plaster shade near the reading chair; the far end holds a 6-seat
walnut dining table if an open plan, otherwise a media console in fluted
oak. All passages ≥ 90 cm.

Feature wall: book-matched travertine slab with pronounced veining behind
the sofa, or — if budget-bound — a full-height arched niche in textured
plaster holding one sculptural ceramic. Focal point: the curved sofa and
the stone table as one composition. Materials: travertine, white oak,
ivory bouclé, sherpa, raw linen, brushed brass. Palette: cream and camel
base, olive contrast, travertine beige, brass accents. Lighting: ambient —
2700K indirect cove; task — sculptural floor lamp; accent — two picture
lights and concealed shelf lighting; temperature 2700K.

Textiles: layered wool rug, full-height linen curtains in oatmeal, four
cushions mixing bouclé and velvet in olive and cream, one heavy throw.
Decor: one oversized organic ceramic vase, a stack of design books,
one abstract plaster wall relief, a tall olive tree in a stone planter.

{refs}

Avoid: sharp-cornered furniture dominating the room, chrome, cool grey,
flat overhead lighting, generic showroom styling, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 3.2 — Спальня 2.6×3.2 м (компактная)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a compact bedroom, 2.6 × 3.2 m, 2.6 m ceiling. Style: Organic
Modern — warm contemporary curves scaled honestly to a small room.

Scale-aware plan: a 160 cm bed with a curved, fully upholstered headboard
against the solid wall; walkways of 45–50 cm on each side; one floating
oak nightstand 40 cm wide (right side), a wall sconce on the left instead
of a second table — asymmetry saves 40 cm; a 200×300 cm rug placed
crosswise under the lower two-thirds of the bed. Full-height wardrobe
(60 cm deep) with curved-edge doors on the wall opposite the bed if it
fits with 70 cm clearance; otherwise open rail + closed overhead cabinets.

Feature wall: soft olive limewash behind the bed with one arched recess
containing a small ceramic and an uplight. Focal point: the rounded
headboard in warm oat bouclé. Materials: white oak, bouclé, washed linen,
matte ceramic, brushed brass (one touch only). Palette: warm cream walls,
oat and olive bedding, light oak floor, brass sconce. Lighting: ambient —
2700K concealed cove along the ceiling line (makes the low ceiling float);
task — adjustable brass sconce; accent — uplight in the niche.

Textiles: linen duvet in warm white, chunky knit throw in camel, two
velvet cushions in olive. Decor: one ceramic vessel, one small framed
print in the niche, nothing on the floor.

{refs}

Avoid: two nightstands in this footprint, pendants hanging into the sight
line, sharp dark furniture mass, cool lighting, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level from the door corner, --ar 4:5
```

### Пример 3.3 — Кухня-гостиная 5.0×6.5 м (остров)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of an open-plan kitchen-living space, 5.0 × 6.5 m, 2.8 m
ceiling. Style: Organic Luxe — chef's kitchen meets sculptural living.

Scale-aware plan: a 240×100 cm rounded-corner island in travertine-look
quartzite, seating for three on the living side (105 cm walkway behind
stools); rear wall — full-height fluted oak cabinetry with integrated
appliances and a 120 cm run of open shelving; dining for six in oak with
a sculptural paper-and-brass pendant; the living zone keeps a 240 cm
curved sofa. Every walkway ≥ 100 cm around the island.

Feature wall: the fluted oak cabinetry run with one tall arched display
niche and concealed warm LED. Focal point: the monolithic island with a
single oversized ceramic bowl. Materials: fluted white oak, honed quartzite,
brushed brass, rattan (two bar stools), linen. Palette: warm white,
oak, travertine beige, olive accents in textiles, brass. Lighting:
ambient — 2700K perimeter cove; task — under-shelf and under-cabinet LED;
accent — two pendants (island + dining) at staggered heights; temperature
2700K throughout.

Textiles: linen seat pads, oatmeal Roman shades, one jute rug in the
living zone. Decor: oversized ceramic vessels (one per zone), a wooden
fruit bowl, one abstract artwork in the dining zone, herbs in stone pots.

{refs}

Avoid: glossy acrylic cabinets, chrome handles, sharp island corners,
cool white lighting, clutter on worktops.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 16:9
```

### Пример 3.4 — Кабинет 2.8×3.2 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a home office, 2.8 × 3.2 m, 2.7 m ceiling. Style: Organic
Modern — calm productivity, natural materials, one sculptural statement.

Scale-aware plan: a 180×80 cm curved-edge oak desk facing the window;
an upholstered desk chair in camel wool; a 200×140 cm rug under the desk
zone; one curved-back reading chair with a small travertine side table
and a floor lamp in the corner; a 45 cm deep bookcase on the solid wall,
flush and handleless. Walkways ≥ 80 cm.

Feature wall: textured plaster in warm clay behind the bookcase, with one
horizontal oak ledge holding two ceramics and a small framed print.
Focal point: the desk zone with a sculptural paper task lamp. Materials:
white oak, camel wool, travertine, textured plaster, linen. Palette:
warm white, oak, camel, clay, one olive accent cushion. Lighting: ambient
— 3000K indirect wash; task — sculptural desk lamp; accent — floor lamp
and ledge uplight; 3000K.

Textiles: wool rug, linen curtain, one sheepskin over the reading chair.
Decor: ceramic vessels, a small stack of books, one plant in a terracotta
pot — no more.

{refs}

Avoid: black office furniture, monitor arms dominating the room, cable
clutter, cool lighting.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 3.5 — Ванная 2.4×3.0 м (спа-уровень)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 2.4 × 3.0 m, 2.6 m ceiling. Style: Organic Luxe —
hotel-spa serenity: stone, oak, steam-friendly warmth.

Scale-aware plan: a freestanding oval stone-resin tub (170 cm) under the
window if the structure allows, otherwise against the short wall; a 120 cm
floating double vanity in oak; a 100 cm walk-in shower with frameless
glass. A wooden bath caddy over the tub. Heated stone-look floor.

Feature wall: full-height travertine slabs with book-matched veining
behind the vanity and tub. Focal point: the oval tub as sculpture, filled
or styled with a wooden tray. Materials: travertine, white oak, brushed
brass, fluted glass, tadelakt wet-zone plaster. Palette: warm cream,
travertine, oak, brass; one sage-green accent in towels. Lighting: ambient
— 2700K dimmable downlights; task — sconces at mirror, both sides; accent
— waterproof LED niche lighting and a candle group by the tub.

Textiles: waffle linen towels in cream and sage, a teak bath mat.
Decor: one large ceramic vase with pampas, amber glass dispensers.

{refs}

Avoid: chrome, glossy white tiles, plastic accessories, cool lighting,
cluttered vanity top.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

---

## СТИЛЬ 4 — SCANDINAVIAN / NEW NORDIC ❄️

**Тренд 2026:** «New Nordic» — от стерильного белого к тёплым белым, много дерева, много текстиля, крафтовая керамика.

| Рецепт | Значение |
|---|---|
| Base palette | warm white, cream, soft greige |
| Contrast | pale sage, dusty blue |
| Accent | light oak, birch |
| Materials | светлое дерево во всём (пол, мебель, полки), шерсть, лён, ратанг |
| Feature wall | тёплая белая штукатурка + галерея в светлых рамах ИЛИ светлые рейки |
| Light | максимум дневного света, 3000K, много торшеров |
| Avoid | стерильный белый 2015-го, синтетика, тёмный массив |

### Пример 4.1 — Гостиная 3.6×4.2 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 3.6 × 4.2 m, 2.65 m ceiling. Style: New Nordic
Scandinavian — bright functional warmth: layered wood tones, soft textiles,
daylight maximized.

Scale-aware plan: a 220 cm light-grey linen sofa on the long wall; a birch
coffee table 100 cm; one rattan armchair with a sheepskin; a pale oak TV
bench (180 cm) opposite; layered rugs — one flatweave wool 240×170 cm plus
one small sheepskin by the armchair. Walkways ≥ 75 cm.

Feature wall: warm white limewash with a light oak picture ledge holding
three framed prints in pale wood frames and two ceramics. Focal point:
the seating group around the birch coffee table. Materials: birch and
light oak, light grey linen, rattan, sheepskin, wool. Palette: warm
white, soft greige, pale sage accents, light oak. Lighting: ambient —
bright 3000K ceiling spots only as backup; the room lives on daylight;
task — one arched floor lamp in off-white by the armchair; accent — a
small table lamp on the TV bench; temperature 3000K.

Textiles: layered wool rug + sheepskin, sheer linen curtains at ceiling
height, knitted throw in soft sage, four mixed cushions (two patterned,
two plain). Decor: pale ceramics, a glass vase with eucalyptus, woven
baskets for storage, framed botanical prints.

{refs}

Avoid: sterile pure-white walls, black metal overload, dark heavy
furniture, flat overhead-only light, synthetic fabrics.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, bright airy exposure, --ar 3:2
```

### Пример 4.2 — Спальня 2.4×3.0 м (маленькая, светлая)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a small bedroom, 2.4 × 3.0 m, 2.55 m ceiling. Style: New
Nordic — light colors and smart small-space storage to visually double
the room.

Scale-aware plan: a 140 cm bed with a slim oak headboard against the
short wall; 50 cm walkways; one wall-mounted oak shelf as nightstand
(right), a small plug-in sconce (left) — no floor lamps; a shallow
150 cm wardrobe (55 cm deep) with mirrored or light oak sliding doors
on the opposite wall; under-bed storage drawers. Every vertical surface
light-colored.

Feature wall: pale sage matte paint behind the bed — the only colored
wall. Focal point: the crisp layered bed in warm white and sage.
Materials: light oak, white lacquer, linen, cotton. Palette: warm white,
pale sage, light oak, soft grey. Lighting: ambient — one 3000K ceiling
point; task — two plug-in sconces; accent — none needed in a room this
size; daylight is the design.

Textiles: white linen duvet, sage throw, sheer curtains, a small cotton
rug. Decor: one framed print, one ceramic on the shelf, one plant —
nothing more in a 7 m² room.

{refs}

Avoid: dark furniture mass, floor-standing lamps in walkways, heavy
curtains, more than 3 decor objects, glossy surfaces.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 20mm lens, eye-level from the door, --ar 4:5
```

### Пример 4.3 — Кухня 2.8×3.5 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 2.8 × 3.5 m, 2.6 m ceiling. Style: Scandinavian —
functional brightness, honest materials, everything within reach.

Scale-aware plan: a single-wall 300 cm run plus a 180 cm return forming
an L; 95 cm central walkway; wall cabinets only on one wall and only up
to 210 cm height — open oak shelves above; a foldable oak wall table
(70 cm deep open, 25 cm folded) with two stools for dining; fridge and
oven stacked in a tall unit to free the run. No island — footprint too
small.

Feature wall: white handmade-look zellige tile backsplash with visible
glaze variation. Focal point: the oak open shelves styled with ceramics
and two plants. Materials: matte white lacquer fronts, light oak
worktop and shelves, zellige tile, linen curtain. Palette: warm white,
light oak, pale grey stone-look counter, one dusty-blue ceramic set.
Lighting: ambient — 3000K recessed points; task — LED under shelves;
accent — one opal-glass pendant over the foldable table.

Textiles: linen café curtain on the lower window, striped cotton
tea towels. Decor: ceramics in white and dusty blue, wooden cutting
boards on the counter, one trailing pothos on the shelf.

{refs}

Avoid: dark cabinets, glossy fronts, clutter on worktops, heavy pendant
rows, cool light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 3:2
```

### Пример 4.4 — Детская 2.8×3.2 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a child's bedroom, 2.8 × 3.2 m, 2.6 m ceiling. Style:
Playful Scandinavian — calm base, joyful accents, furniture that grows
with the child.

Scale-aware plan: a 90×200 cm extendable bed or a low loft (max 120 cm
height) freeing 140 cm of play floor beneath; toy storage in open
40 cm modules at child height plus two closed boxes; a 100 cm children's
table with two chairs near the window; a small desk 100 cm along the
solid wall for drawing. All edges rounded; 80 cm clear play area in the
center.

Feature wall: warm white with a painted pale-yellow arch or a low
removable botanical mural — playful but calm. Focal point: the loft bed
corner with a reading nest underneath. Materials: light birch, washable
cotton, wool rug, felt baskets. Palette: warm white, pale yellow, light
oak, dusty blue accents. Lighting: ambient — 3000K points; task — one
adjustable table lamp; accent — a paper star lantern; all child-safe,
no reachable sockets styled bare.

Textiles: round wool rug, cotton curtains with a subtle pattern, knitted
blanket. Decor: height-chart wall decal in oak, framed children's art in
light frames, a small house-shaped bookshelf, three plush toys maximum.

{refs}

Avoid: dark themes, character-branded everything, overstimulation,
sharp furniture corners, clutter beyond storage capacity.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 20mm lens, eye-level, --ar 3:2
```

### Пример 4.5 — Прихожая-коридор 1.4×4.0 м (узкая)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a narrow hallway, 1.4 × 4.0 m, 2.6 m ceiling. Style:
Scandinavian — make a corridor feel like a room: light, order, warmth.

Scale-aware plan (critical): only 1.4 m wide — all furniture is
wall-mounted or max 30 cm deep. A 250 cm bench-hallway unit 35 cm deep:
bench + shoe drawers + rail with five oak hooks at 170 cm; one slim
12 cm console shelf above the bench for keys and a small vase; a tall
30 cm deep mirrored cabinet at the far end to visually double the length;
nothing on the floor except shoes inside the bench. The clear walking
line stays at ≥ 90 cm.

Feature wall: warm white vertical paneling (tongue-and-groove) on one
long wall painted the wall color — texture without depth. Focal point:
the mirror cabinet reflecting daylight from the far window/door.
Materials: light oak, white lacquer, linen, mirror. Palette: warm white,
oak, one black accent (hooks), sage ceramic dish. Lighting: ambient —
3000K points every 150 cm down the corridor; accent — one small sconce
above the console shelf; temperature 3000K.

Textiles: a flatweave runner rug 70 cm wide. Decor: one ceramic bowl
for keys, one framed print at the far end, one small plant on the
console.

{refs}

Avoid: freestanding shoe cabinets, dark walls, clutter on the floor,
cold light, deep furniture.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 20mm lens, eye-level down the corridor, --ar 4:5
```

---

## СТИЛЬ 5 — WARM MINIMALISM (Тёплый минимализм) 🕯️

**Тренд 2026:** эволюция минимализма — скрытое хранение, «less but better», wellness-подтекст. Меньше предметов, но каждый — правильный.

| Рецепт | Значение |
|---|---|
| Base palette | off-white, warm greige, sand |
| Contrast | soft black (точечно) |
| Accent | один насыщенный акцент (терракота, глубокий синий) |
| Materials | светлое дерево, текстурная штукатурка, мягкий камень, лён |
| Feature wall | архитектурная: ниши, редкий камень, однотонная фактурная отделка |
| Light | 2700–3000K, косвенный, никаких люстр в центре |
| Avoid | пустота ради пустоты, холодный белый, склад вещей в кадре, «дисплейный» вид |

### Пример 5.1 — Гостиная 4.0×4.8 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.0 × 4.8 m, 2.7 m ceiling. Style: Warm
Minimalism — radical edit, warm materials, architectural interest instead
of decoration.

Scale-aware plan: a 240 cm low-profile sofa in warm greige fabric; one
round coffee table 90 cm in travertine; a single sculptural floor lamp;
one 60 cm side table. A 280×200 cm rug. All storage is concealed:
handleless wall-to-wall cabinet wall 40 cm deep along the solid wall,
flush. Walkways ≥ 85 cm. Total freestanding furniture in the room: four
pieces — nothing else.

Feature wall: the concealed cabinet wall in the exact wall color, with
two open niches (one with a ceramic, one empty) breaking the plane.
Focal point: the negative space itself plus the one oversized artwork
(120 cm) on the opposite wall. Materials: textured plaster, light oak
floor, travertine, wool, linen. Palette: off-white walls, warm greige,
sand, one soft-black line (lamp stem), one terracotta accent cushion only.
Lighting: ambient — 2700K concealed perimeter cove; task — the floor
lamp; accent — one picture light over the artwork; no central fixture.

Textiles: one wool rug, full-height sheer linen curtains, two cushions
and one throw — the entire textile count of the room. Decor: one ceramic
vessel, one artwork, one book stack of three. Every object visible is
deliberate.

{refs}

Avoid: visible storage, decor sets, multiple accent colors, clutter,
cold white, chrome, pendant clusters.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 5.2 — Спальня 2.7×3.4 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 2.7 × 3.4 m, 2.6 m ceiling. Style: Warm Minimalism
— a room that holds only what serves rest.

Scale-aware plan: a 170 cm bed with a plain upholstered headboard (no
decorative stitching) centered on the solid wall; 55 cm walkways;
one wall-mounted oak shelf 35 cm as a nightstand; wall sconces both
sides; wardrobe with push-latch flush doors 60 cm deep spanning the
opposite wall, visually disappearing into it. No bench, no rug beyond
the bedside flatweave.

Feature wall: warm sand limewash behind the bed — the only texture.
Focal point: the perfectly made bed with one tonal linen set.
Materials: limewash, light oak, linen, matte ceramic. Palette: off-white,
warm sand, oak, a single deep-blue cushion as the room's only accent.
Lighting: ambient — 2700K cove at ceiling line; task — two wall sconces
with fabric shades; accent — none. All light sources dimmable.

Textiles: tonal linen bedding, one flatweave rug, sheer curtains.
Decor: zero on surfaces; one shelf object (a small ceramic) total.

{refs}

Avoid: decorative pillows arrays, wall art galleries, floor lamps,
visible wardrobes, more than one accent color.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

### Пример 5.3 — Кухня 3.2×4.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 3.2 × 4.0 m, 2.7 m ceiling. Style: Warm
Minimalism — invisible functionality, one beautiful material gesture.

Scale-aware plan: handleless galley-plus-island layout: 300 cm run along
the wall, a 180×80 cm island parallel with 110 cm clearance on both
sides, seating for two. All appliances integrated behind push-latch
fronts; worktop clear except one wooden board. One oak shelf (120 cm)
above the run instead of wall cabinets.

Feature wall / focal point: the island clad in the same material as the
floor — warm microcement — reading as a carved monolith. Materials:
microcement, light oak, matte ceramic, brushed black (one tap).
Palette: warm off-white fronts, oak shelf, sand microcement, black tap
as the single dark note. Lighting: ambient — 2700K recessed grid;
task — under-shelf LED; accent — one linear pendant (120 cm) over the
island, 2700K, black.

Textiles: linen curtain, two linen seat pads. Decor: one ceramic bowl,
one plant, wooden board — nothing more on any surface.

{refs}

Avoid: visible appliances, handle rows, open shelving beyond one shelf,
colorful decor, glossy fronts.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 3:2
```

### Пример 5.4 — Студия 5.5×7.0 м (зонирование одной комнаты)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a studio apartment main room, 5.5 × 7.0 m, 2.75 m ceiling.
Style: Warm Minimalism — one calm volume divided into three zones by
furniture and light, never by walls.

Scale-aware plan: sleeping zone at the quiet end — a 160 cm bed against
the wall, screen-divider 40 cm deep (open shelving, acts as headboard
wall and room divider); living zone in the middle — 210 cm sofa, round
coffee table, floor lamp; dining/work zone near the window — 140 cm
table, two chairs; kitchenette along the entry wall. Zones are anchored
by one rug each, different pendant over each zone, and a 90 cm clear
spine from entry to window.

Feature wall: behind the bed — a full-height fluted panel in oak, the
studio's one architectural gesture. Focal points: one per zone (bed
wall, a single artwork over sofa, pendant over dining table). Materials:
light oak, textured plaster, linen, travertine-look stone. Palette:
off-white and warm greige throughout, sand, one sage accent in bedding,
one black line per zone. Lighting: three-zone scheme — 2700K cove in
sleeping zone, floor lamp in living, pendant in dining; each zone
switches independently.

Textiles: three tonal rugs, full-height linen curtains, restrained
cushion count. Decor: one object per shelf bay, one plant per zone,
nothing stored visibly.

{refs}

Avoid: freestanding wardrobes in the main volume, visual clutter at the
entry, mismatched zone styles, cool light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 20mm lens, eye-level from entry, --ar 16:9
```

### Пример 5.5 — Ванная 1.9×2.8 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 1.9 × 2.8 m, 2.55 m ceiling. Style: Warm
Minimalism — spa clarity in under 6 m².

Scale-aware plan: 1.9 m width dictates everything — a 90 cm walk-in
shower with a single fixed screen on the short end; a 100 cm floating
vanity in warm oak with one integrated sink; wall-hung WC; concealed
cistern and concealed storage cabinet (30 cm deep) above it. Heated
floor, no bath mat needed — one wooden slat insert at the shower exit.

Feature wall: large-format warm beige porcelain behind the vanity with
a book-matched vein — the room's single decorative surface. Focal point:
the mirror (round, 70 cm) floating off the wall on a brass stem.
Materials: porcelain, warm oak, microcement floor, matte ceramic,
brushed brass. Palette: warm white, beige, oak, brass — zero pattern
elsewhere. Lighting: ambient — 2700K IP44 downlights; task — sconces
both sides of the mirror; accent — concealed niche LED; dimmable.

Textiles: two waffle towels in warm white. Decor: one amber glass
dispenser, one small ceramic dish.

{refs}

Avoid: visible bottles, chrome, patterned tiles, glossy surfaces,
countertop clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

---

## СТИЛЬ 6 — BIOPHILIC (Биофильный дизайн) 🌱

**Тренд 2026:** от офисов в жилые дома: living walls, внутренние сады, природные материалы; подтверждённый wellness-эффект (снижение стресса, рост продуктивности).

| Рецепт | Значение |
|---|---|
| Base palette | leaf green, warm wood, stone grey |
| Contrast | deep forest green |
| Accent | natural clay, water elements |
| Materials | живое дерево, камень с выраженной фактурой, пробка, джут, много растений (5–15 в комнате) |
| Feature wall | living wall ИЛИ максимальное остекление с видом на зелень |
| Light | полный спектр дневного света + 3000K вечером, grow-friendly |
| Avoid | одинокий кактус «для галочки», пластиковые горшки, пересушенный воздух по виду, блокирование окон |

### Пример 6.1 — Гостиная 4.2×5.5 м с living wall

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.2 × 5.5 m, 2.8 m ceiling. Style: Biophilic
— an indoor garden room: plants as architecture, natural materials,
daylight worship.

Scale-aware plan: a 240 cm low sofa in moss-green linen facing the window;
a reclaimed-wood coffee table 120 cm; two rattan chairs; plant placement
by layers — one tall tree-form (fiddle-leaf or olive, 180+ cm) in the
bright corner, a living wall panel (200×250 cm) on the solid wall, medium
plants (monstera, bird of paradise) on the floor flanking the living
wall, trailing pothos on the open shelf, herbs on the sill. All walkways
stay ≥ 75 cm clear of planters.

Feature wall: modular living wall with mixed ferns, pothos and philo-
dendron, integrated drip irrigation lines hidden, warm 3000K grow-friendly
uplights. Focal point: the living wall as a green painting. Materials:
reclaimed wood, stone, rattan, linen, cork. Palette: leaf green, warm
wood, stone grey, clay pots. Lighting: ambient — maximum daylight,
sheer curtains; task — rattan floor lamp; accent — uplights for plants;
evening scheme 3000K.

Textiles: jute rug, linen curtains, wool throw in forest green. Decor:
clay and terracotta pots (no plastic), a small tabletop water fountain
on the console, stone objects, one botanical print.

{refs}

Avoid: plastic pots, a single token succulent, blocked windows, synthetic
materials, cool sterile light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 6.2 — Спальня 3.2×3.8 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 3.2 × 3.8 m, 2.65 m ceiling. Style: Biophilic —
sleeping in a garden: air, green, wood, morning light.

Scale-aware plan: a 180 cm bed in warm oak with linen bedding in leaf
green and white; walkways 70 cm; nightstands 45 cm in oak with one plant
each (small, in clay); a tall plant (180 cm) in the brightest corner; a
low planter shelf (25 cm deep) under the window continuing the sill line;
sheer curtains to diffuse light onto leaves. No furniture blocking the
window or radiator.

Feature wall: behind the bed — warm wood paneling with a shelf ledge
holding trailing plants at headboard height. Focal point: the bed framed
by greenery, morning light through leaves. Materials: oak, linen, clay,
wool, live plants. Palette: leaf green, warm white, oak, clay terracotta.
Lighting: ambient — morning daylight through sheers; task — bedside
sconces 2700K; accent — concealed LED washing the plant shelf from
above; a sunrise-spectrum bulb in the reading sconce.

Textiles: layered linen bedding, wool rug in undyed white with green
border, cotton sheers. Decor: clay pots only, one stone object, one
pressed-plant frame — plants are the decor.

{refs}

Avoid: fake plants, plastic anything, dark heavy furniture, blackout
curtains as the only option, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

### Пример 6.3 — Кабинет 2.6×3.0 м (продуктивность)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a home office, 2.6 × 3.0 m, 2.6 m ceiling. Style: Biophilic —
a workspace proven to lower stress: greenery at eye level, natural light
on the desk, honest materials.

Scale-aware plan: a 160×75 cm desk of reclaimed wood placed to face the
window (view of greenery outside if any, plants inside otherwise);
ergonomic chair in sage mesh-free fabric; a 40 cm plant shelf (three
levels) beside the desk at eye level; a tall floor plant behind the
chair softening the corner; a cork pinboard (90×60 cm) on the solid
wall. Walkways ≥ 80 cm.

Feature wall: one accent surface in cork or wood fiber panel — acoustic
and tactile. Focal point: the desk-to-window axis. Materials: reclaimed
wood, cork, linen, clay, stone paperweights. Palette: sage green, warm
white, oak, cork brown. Lighting: ambient — daylight-first, 4000K
daylight-balanced task zone at the desk (only place cool light is
allowed); accent — one 2700K table lamp for evening; grow light bar
integrated under the plant shelf.

Textiles: flatweave wool rug, linen curtain. Decor: plants on every
level of the shelf, one ceramic mug, a small water carafe — workspace
stays work-ready, not cluttered.

{refs}

Avoid: fake plants, plastic pots, desk facing a blank wall, cool light
everywhere, cable clutter on the floor.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 6.4 — Кухня 3.0×4.2 м с зимним садом у окна

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 3.0 × 4.2 m, 2.7 m ceiling. Style: Biophilic —
herb garden at the window, wood and stone, cooking among plants.

Scale-aware plan: L-shaped kitchen along the two windowless walls — 300
cm sink/dishwasher run, 240 cm hob run, 100 cm walkway; the entire
window end kept free for a 60 cm deep plant bench: herb garden in
terracotta (basil, rosemary, mint), a small citrus tree in a half-barrel,
grow-light strip mounted above; a 140 cm oak table with two benches
tucked between kitchen and window. No upper cabinets on the window wall.

Feature wall: the window zone itself — a framed green composition of
herbs and the sky. Focal point: the herb bench catching the light.
Materials: oak, stone-look porcelain, terracotta, linen, steel (one
shelf). Palette: warm white, oak, leaf green, terracotta, stone grey.
Lighting: ambient — daylight from the window wall; task — under-cabinet
LED 3000K; accent — grow light above herbs (subtle, warm-white blend);
pendant over the table in rattan.

Textiles: linen café curtain only on the lower sash, jute runner.
Decor: herb pots, one wooden bowl of fruit, a ceramic utensil holder —
kitchen tools double as decor.

{refs}

Avoid: blocking the window with furniture, plastic pots, upper cabinets
everywhere, cool lighting, clutter on worktops.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 3:2
```

### Пример 6.5 — Ванная 2.2×2.8 м (спа-джунгли)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 2.2 × 2.8 m, 2.6 m ceiling. Style: Biophilic —
showering in a greenhouse: steam, leaves, stone.

Scale-aware plan: a 100×100 cm walk-in shower with a skylight or bright
window inside it if present in the photo — the wet zone doubles as plant
zone (humidity-loving plants: ferns, calathea, asplenium on a teak
corner shelf); a 110 cm floating teak vanity; wall-hung WC; plants also
on the sill and one tall bamboo in a stone planter outside the shower
splash zone.

Feature wall: large-format stone-look porcelain in moss tones in the
shower, continuing to the floor. Focal point: the green shower niche —
plants lit by the window. Materials: teak, stone porcelain, matte
ceramic, river pebbles at the shower drain. Palette: stone grey, moss
green, teak, warm white. Lighting: ambient — daylight as primary;
task — sconces at mirror 3000K; accent — waterproof LED in the shower
niche washing the plants.

Textiles: two linen towels in sage. Decor: pebble tray, wooden bath
brush, amber glass bottles — no plastic in sight.

{refs}

Avoid: fake plants, dark windowless feel, chrome overload, clutter,
cold light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, steam-soft light, --ar 4:5
```

---

## СТИЛЬ 7 — MODERN HERITAGE / CONTEMPORARY CLASSIC 🏛️

**Тренд 2026:** классические молдинги, филёнки, латунь — обновлены современной мебелью и светом. «Дом со слоями истории», анти-«флип-хаус».

| Рецепт | Значение |
|---|---|
| Base palette | warm white, cream, tobacco |
| Contrast | oxblood, deep green |
| Accent | unlacquered brass, antique bronze |
| Materials | филёнки и молдинги (обновлённые), орех/вишня, бархат, мрамор, жаккард |
| Feature wall | панели с молдингами, окрашенные в стеновой цвет + крупное искусство |
| Light | 2700K, латунные бра и торшеры, многослойный |
| Avoid | «музейная» подача, всё-антиквариат, глянцевая позолота, симметрия-под-копирку |

### Пример 7.1 — Гостиная 4.0×5.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.0 × 5.0 m, 3.0 m ceiling. Style: Modern
Heritage — classical bones, contemporary life: paneled walls, inherited
warmth, modern comfort.

Scale-aware plan: a 230 cm contemporary sofa in warm cream bouclé
(centered on the panelled wall); a pair of mid-century walnut armchairs;
an antique-look marble-and-brass coffee table 120 cm between them (45 cm
gap); a 45 cm deep sideboard in dark walnut on the opposite wall; a
modern arc floor lamp in unlacquered brass arcing over the sofa. Walkways
≥ 85 cm; the room's symmetry is anchored by architecture, not furniture.

Feature wall: full-height wall paneling with moldings, painted the same
warm white as the walls, hung with one oversized classical-modern
artwork (140 cm) in a thin brass frame. Focal point: the artwork flanked
by two brass picture lights. Materials: painted paneling, walnut, marble,
bouclé, brass, velvet (one cushion pair in oxblood). Palette: warm white,
cream, walnut, oxblood accent, brass. Lighting: ambient — 2700K
recessed spots washing the paneling; task — brass arc lamp and a table
lamp on the sideboard; accent — two picture lights, one sconce pair
flanking the artwork.

Textiles: wool rug with a faint classical pattern, full-length velvet-
lined curtains in warm cream, tasseled cushions in oxblood and cream.
Decor: a marble bust or large ceramic on the sideboard, a stack of
cloth-bound books, one silver-framed photo — collected, not matched.

{refs}

Avoid: museum-like staging, all-antique rooms, glossy gold, matched
furniture sets, clutter of small porcelain.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 7.2 — Спальня 3.0×3.8 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 3.0 × 3.8 m, 2.7 m ceiling. Style: Modern
Heritage — a classic bedroom without the dust: paneled headboard wall,
tailored bedding, one antique note.

Scale-aware plan: a 180 cm bed with an upholstered headboard placed
against the paneled wall; matching walnut nightstands 50 cm with brass
pulls — deliberately symmetrical here (heritage allows it); a 100 cm
bench in velvet at the foot of the bed if 70 cm walkway remains, else a
slim 35 cm bench; a period-style walnut tallboy (80 cm wide) in the
alcove. Walkways ≥ 65 cm.

Feature wall: headboard wall with applied molding rectangles painted
warm white, the inner rectangle upholstered in oatmeal linen panels.
Focal point: the upholstered panel wall with two brass sconces.
Materials: painted moldings, linen upholstery, walnut, velvet, aged
brass. Palette: warm white, oatmeal, walnut, one deep-green throw,
brass. Lighting: ambient — 2700K recessed; task — swing-arm brass
sconces; accent — one table lamp with a pleated shade on each
nightstand; all warm 2700K.

Textiles: crisp hotel-style bedding with a tailored coverlet, one
deep-green wool throw, full-length interlined curtains in warm cream.
Decor: one framed botanical print pair above the tallboy, a small
silver tray on the nightstand, one fresh flowers vase.

{refs}

Avoid: frilly vintage overload, matched antique suites, heavy drapes
blocking light, glossy finishes.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

### Пример 7.3 — Столовая 3.2×4.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a dining room, 3.2 × 4.0 m, 2.75 m ceiling. Style: Modern
Heritage — dinner-party room: classic scale, modern edge.

Scale-aware plan: a 200×100 cm oval walnut dining table (better flow
than rectangular in 3.2 m width) with six chairs — four upholstered in
cream velvet, two carver chairs in oxblood velvet at the ends; 90 cm
clearance all around for pulled-out chairs; a 50 cm deep walnut
sideboard with marble top on the long wall; a classic-modern brass
chandelier (80 cm diameter) centered on the table. Walkways ≥ 90 cm.

Feature wall: paneling painted deep green (heritage allows one dark
room) with a large gilt-framed mirror leaning, not hung, on the
sideboard. Focal point: the chandelier over the table against the green
wall. Materials: walnut, marble, velvet, aged brass, painted paneling.
Palette: deep green wall, warm white ceiling, walnut, cream, oxblood,
brass. Lighting: ambient — 2700K recessed; accent — the chandelier with
real candle-warm bulbs, a pair of brass wall sconces on the green wall.

Textiles: linen tablecloth only when set, cream velvet chair seats,
a wool rug under the table (sound-softening) in a muted heritage
pattern. Decor: a silver candelabra group, a cut-glass decanter set,
one large ceramic urn on the sideboard — set for dinner or styled
empty, never cluttered.

{refs}

Avoid: matchy-matchy suites, modern chrome, bare minimalist styling,
cheap gold, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, warm evening practical light,
--ar 3:2
```

### Пример 7.4 — Кабинет-библиотека 3.0×4.2 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a study-library, 3.0 × 4.2 m, 2.8 m ceiling. Style: Modern
Heritage — the gentleman's library, updated: floor-to-ceiling shelves,
a modern desk, no stuffiness.

Scale-aware plan: the full long wall as floor-to-ceiling bookcases (35
cm deep) in warm walnut with a rolling ladder only if 90 cm clearance in
front (else fixed); a 170×80 cm modern desk in smoked oak placed facing
the window; a leather desk chair in cognac; a 200 cm modern sofa in
olive velvet near the shelves for reading; a library floor lamp in
antique brass. Walkways ≥ 85 cm.

Feature wall: the bookcase wall itself, styled 70% books (mixed
vertical and horizontal) and 30% objects — ceramics, one bust, framed
photos. Focal point: the desk in front of the window with the bookcase
wall as backdrop. Materials: walnut, leather, velvet, smoked oak,
antique brass, wool. Palette: warm white, walnut, cognac, olive, brass.
Lighting: ambient — 2700K recessed washing shelves; task — green-shade
banker's lamp (modernized in matte black and brass); accent — library
floor lamp and one picture light over a map or print.

Textiles: a Persian-style flatweave rug in muted reds, full-length
velvet curtains in olive, one tartan throw on the sofa. Decor:
glasses on the desk, a globe or large ceramic on a shelf, framed
architectural prints — a working library, not a showroom.

{refs}

Avoid: dust-jacket-less staged shelves, all-brown palette, modern
chrome, clutter on the desk, formal symmetry.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 7.5 — Прихожая 1.6×3.5 м (hotel-style arrival)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of an entryway, 1.6 × 3.5 m, 2.7 m ceiling. Style: Modern
Heritage — a boutique-hotel arrival moment in a narrow footprint.

Scale-aware plan: 1.6 m width means everything wall-mounted or ≤ 30 cm
deep: a 30 cm deep console in dark walnut with a marble top running
200 cm; a large round antique-brass mirror (80 cm) above it; a slim
picture-light over the mirror; a small upholstered bench 35 cm deep
opposite the console if 90 cm clearance remains, else a wall-mounted
fold-down seat; black-and-white stone floor in a heritage checker or
herringbone.

Feature wall: applied molding panels painted warm white with the
console floating in front. Focal point: the brass mirror with the
picture light — the classic hotel move. Materials: walnut, marble,
brass, painted paneling, stone floor. Palette: warm white, walnut,
black-and-cream floor, brass, one oxblood accent in a small runner.
Lighting: ambient — none harsh; a small 2700K recessed pair; accent —
the picture light and a small table lamp on the console; arrival glow,
not corridor brightness.

Textiles: a slim 70 cm runner in a muted heritage pattern. Decor: a
ceramic bowl for keys, one small framed print at the far end, a slim
vase with branches on the console.

{refs}

Avoid: shoe clutter visible, deep furniture, cold corridor lighting,
plastic anything, more than 3 objects on the console.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level down the entry, --ar 4:5
```

---

## СТИЛЬ 8 — INDUSTRIAL LOFT (Лофт) 🏭

**Тренд 2026:** мягкая версия лофта — «warm industrial»: кирпич/бетон смягчены деревом, кожей, тёплым светом. Чистый фабричный лофт уступает место «urbane industrial» для квартир.

| Рецепт | Значение |
|---|---|
| Base palette | warm brick, concrete grey, charcoal |
| Contrast | blackened steel |
| Accent | cognac leather, aged copper |
| Materials | кирпич (existing or clad), microcement, сталь, кожа, массивное дерево |
| Feature wall | оставленный как есть материал: кирпич, бетон, сталь — патина приветствуется |
| Light | 2700–3000K, Edison bulbs, трековые системы, торшеры |
| Avoid | стерильный «фабричный» холод, фальш-кирпич без фактуры, хром, однотонная серость |

### Пример 8.1 — Гостиная 4.5×6.0 м с высокими потолками

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a loft living room, 4.5 × 6.0 m, 3.4 m ceiling. Style:
Warm Industrial Loft — raw architecture, furnished with warmth: brick,
steel, leather, wood.

Scale-aware plan: a 260 cm low sofa in cognac leather against the brick
wall; a heavy reclaimed-wood coffee table 130 cm; two canvas-and-steel
armchairs; a 45 cm deep steel-and-wood console under the window line;
a blackened-steel floor lamp with a large linen shade. A large vintage-
look rug (350×250 cm) softening the concrete floor. With 4.5 m width,
the seating floats 60 cm off the brick wall — no furniture crammed to
walls. Walkways ≥ 90 cm.

Feature wall: original brick, cleaned but not repainted, with one
oversized abstract canvas (160 cm) hung directly on it. Focal point:
the leather sofa zone against the brick. Materials: brick, microcement
floor, blackened steel, cognac leather, reclaimed wood, canvas.
Palette: brick red-brown, concrete grey, charcoal, cognac, aged copper
(one lamp detail). Lighting: ambient — exposed-filament Edison bulbs
on black steel pendants (two, over the coffee table, 2700K); task —
floor lamp with linen drum; accent — a copper picture light over the
canvas; track system along the steel beam.

Textiles: vintage Persian or kilim rug, heavy linen curtains on a black
steel rod, wool throw in rust. Decor: factory-cart coffee table or
wooden crate stack, one large ceramic, art books, a tall cactus or olive
tree in a steel planter.

{refs}

Avoid: fake flat brick, chrome, cold white light, empty warehouse feel,
matching showroom sets.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 8.2 — Спальня 3.0×4.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 3.0 × 4.0 m, 2.8 m ceiling. Style: Warm
Industrial — raw shell, soft heart: steel and linen, leather and wood.

Scale-aware plan: a 180 cm metal-frame bed with leather headboard strap
detail against the concrete wall; 60 cm walkways; two factory-style
nightstands (steel frame, wood top, 45 cm); a steel-clad wardrobe (60 cm
deep) with sliding mesh doors along the long wall; a 90 cm leather
armchair in the window corner with a floor lamp. Walkways ≥ 70 cm.

Feature wall: board-formed concrete or microcement behind the bed,
light-washed by two wall sconces. Focal point: the leather headboard
against raw concrete. Materials: concrete, blackened steel, cognac
leather, oak, linen. Palette: concrete grey, charcoal, cognac, warm
white linen, one rust accent. Lighting: ambient — 3000K spots on
tracks; task — articulated steel sconces; accent — cage-style table
lamp on one nightstand; Edison filament visible.

Textiles: washed linen bedding, wool blanket in rust, jute rug beside
the bed. Decor: one vintage factory lamp, a wooden crate as magazine
holder, one large plant in a concrete pot.

{refs}

Avoid: cold blue-grey light, chrome, pristine white bedding overload,
minimalism so strict it erases warmth.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

### Пример 8.3 — Кухня 3.4×4.5 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 3.4 × 4.5 m, 2.9 m ceiling. Style: Industrial —
chef's loft kitchen: steel, wood, honest hardware.

Scale-aware plan: a 300 cm main run with 90 cm range cooker as anchor;
a 200×90 cm island in butcher-block top with steel frame, three stools
on the long side (105 cm clearance behind); open steel shelving (two
rows, 30 cm deep) instead of upper cabinets on the brick wall; a 45 cm
deep pantry cabinet wall. Walkways ≥ 100 cm around the island.

Feature wall: existing brick behind open shelving — pots, copper pans
and ceramics as the decoration. Focal point: the range cooker with a
steel canopy hood on exposed duct. Materials: brick, stainless/blackened
steel, butcher block, concrete-look counter, leather stool seats.
Palette: brick, steel grey, wood tones, black, copper accents.
Lighting: ambient — 3000K track on the ceiling; task — under-shelf
strips and hood lights; accent — three Edison pendants over the island
at 200 cm from floor.

Textiles: leather or wood stool seats, one linen curtain, striped
cotton towels. Decor: hanging copper pans, wooden boards, one large
ceramic jug, herbs in steel pots.

{refs}

Avoid: glossy acrylic fronts, hidden-everything minimalism, chrome
everywhere, fake distressing, clutter beyond the shelf rows.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 16:9
```

### Пример 8.4 — Кабинет 2.8×3.4 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a home office, 2.8 × 3.4 m, 2.8 m ceiling. Style: Warm
Industrial — a workshop-studio: steel shelving, wood desk, no
pretension.

Scale-aware plan: a 180×80 cm desk of steel frame and reclaimed wood
top against the window; a leather-and-steel task chair; a full-height
steel shelving unit (40 cm deep) on the solid wall — open, styled with
boxes, books and objects; a 70 cm leather sofa or daybed along the
second wall for reading; a steel pharmacy floor lamp. Walkways ≥ 80 cm.

Feature wall: the shelving wall — the office's working archive.
Focal point: the desk with a green-shaded steel lamp against the window
light. Materials: blackened steel, reclaimed wood, leather, concrete-look
floor. Palette: grey, charcoal, wood brown, cognac leather, one deep-
green banker's shade. Lighting: ambient — 3000K track; task — desk
lamp; accent — floor lamp; all with warm filaments.

Textiles: one wool rug, canvas curtain. Decor: blueprint-style framed
prints, a wooden toolbox as desk organizer, one plant in a galvanized
pot.

{refs}

Avoid: corporate office furniture, white melamine, cool light, cable
spaghetti.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

### Пример 8.5 — Ванная 2.0×2.6 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 2.0 × 2.6 m, 2.6 m ceiling. Style: Industrial —
concrete, steel and subway tile: a utilitarian space made warm.

Scale-aware plan: in the 2.0 m width — a 90 cm walk-in shower with
black-framed grid glass; a 100 cm floating vanity in steel frame with
reclaimed wood top; wall-hung black fixtures; a small black heated
rail. Concrete-look large-format floor. Nothing freestanding.

Feature wall: white subway tile with dark grout behind the vanity —
classic industrial utility. Focal point: a round black-framed mirror
with two exposed-bulb sconces. Materials: subway tile, microcement,
blackened steel, reclaimed wood, matte black ceramic. Palette: white
tile, concrete grey, black steel, wood, one rust or copper towel accent.
Lighting: ambient — 3000K downlights; task — exposed Edison sconces;
accent — none; warmth comes from filaments.

Textiles: two heavyweight cotton towels in rust. Decor: a steel tray,
amber glass bottles, one wooden stool.

{refs}

Avoid: chrome, glossy marble, spa styling, plastic accessories, cold
light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

---

## СТИЛЬ 9 — NEW MAXIMALISM (Новый максимализм) 🎨

**Тренд 2026:** ответ на уравновешенные нейтрали — смелые jewel tones, curated глэмура. «Нейтральные уходят, максимализм приходит» (House Beautiful). Ключевое отличие от старого: curated, color-coherent, layered — не хаос.

| Рецепт | Значение |
|---|---|
| Base palette | deep emerald, burgundy/oxblood, sapphire |
| Contrast | gold, brass |
| Accent | jewel tones по единой палитре (не всё сразу) |
| Materials | бархат, шёлк, латунь, тёмное дерево, винтаж, галерея стен |
| Feature wall | глубокий цвет / обои с рисунком + gallery wall |
| Light | 2700K, множество источников, драматичные тени |
| Avoid | random clutter, «всё-в-одном» без палитры, дешёвый блеск, визуальный шум без иерархии |

### Пример 9.1 — Гостиная 4.0×5.0 м (emerald & brass)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.0 × 5.0 m, 2.8 m ceiling. Style: New
Maximalism — curated boldness: one disciplined jewel palette, layered
pattern, collected objects.

Scale-aware plan: a 240 cm sofa in deep emerald velvet against the
gallery wall; a pair of mismatched vintage armchairs reupholstered in
complementary patterns (one botanical, one geometric — same palette); a
brass-and-glass coffee table 110 cm; a 45 cm deep lacquered console in
burgundy; one oversized floor lamp with a fringed shade. A large
patterned rug (300×200 cm) layering over wall-to-wall sisal. Walkways
≥ 80 cm — maximalism, never blocked circulation.

Feature wall: gallery wall of 12–16 pieces (art, mirrors, plates,
objects) arranged salon-style but within an invisible oval boundary,
anchored by one large central piece. Walls elsewhere: deep emerald or
burgundy paint. Focal point: the central artwork with a brass picture
light. Materials: velvet, brass, dark lacquer, silk lampshades, aged
mirror. Palette: emerald, burgundy, brass/gold, cream grounding —
one palette, no exceptions. Lighting: ambient — 2700K; task — fringed
floor lamp; accent — three picture lights, a table lamp on the console,
candles; layered pools of light, not even brightness.

Textiles: layered rugs, silk and velvet cushions (mixed patterns,
same palette), a fringed throw, full-length velvet curtains in emerald.
Decor: stacked art books, a brass tray with collected objects, one
sculptural vase with dramatic branches, a vintage mirror leaning.

{refs}

Avoid: random clutter without palette discipline, more than one metal
finish beyond brass/gold, white walls, even flat lighting, plastic.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, rich saturated exposure, --ar 3:2
```

### Пример 9.2 — Спальня 3.2×3.8 м (moody jewel)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 3.2 × 3.8 m, 2.75 m ceiling. Style: New
Maximalism — a jewel-box bedroom: deep color, pattern, collected
glamour, disciplined palette.

Scale-aware plan: a 180 cm upholstered bed in sapphire velvet against
the darkest wall; two mismatched nightstands (one brass, one lacquered
wood) with unmatching lamps that share a brass finish; a 45 cm deep
vintage dresser with a mirror; one small chaise in patterned velvet at
the window if 70 cm remains, else skip. Walkways ≥ 65 cm.

Feature wall: behind the bed — a patterned wallpaper (large-scale
botanical in navy/sapphire/gold) or deep sapphire lacquer paint with a
large gilded mirror. Focal point: the bed wall; the wallpaper itself is
the art. Materials: velvet, brass, lacquer, silk, antique mirror.
Palette: sapphire, navy, gold, cream, one burgundy accent cushion.
Lighting: ambient — 2700K; task — brass swing sconces; accent — a
small crystal table lamp on the dresser, candlesticks; dim, glamorous,
layered.

Textiles: velvet headboard and bedding accents, silk cushions in mixed
patterns (same palette), a heavy brocade throw, full-length interlined
curtains in navy velvet. Decor: a crystal decanter set, framed vintage
fashion prints pair, fresh peonies in a brass vase, one art object on
the dresser.

{refs}

Avoid: pattern mixing outside the palette, white ceiling contrast too
harsh (use cream), flat bright light, clutter on nightstands.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, moody saturated exposure, --ar 4:5
```

### Пример 9.3 — Столовая 3.0×4.2 м (drama dining)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a dining room, 3.0 × 4.2 m, 2.8 m ceiling. Style: New
Maximalism — dinner theatre: near-black walls, brass, candles, a table
set like a stage.

Scale-aware plan: a 200×95 cm dark wood table (vintage, with patina) —
rectangular works in 3.0 m width with 90 cm chair clearance; six
mismatched dining chairs unified by reupholstery in one velvet; a 50 cm
deep dark lacquered sideboard; a sculptural brass chandelier (90 cm)
over the table. Walkways ≥ 90 cm when chairs are used.

Feature wall: near-black (deep ink green-black) with a salon grid of
small gilded frames — 9 pieces in a strict 3×3, the room's one
geometric moment. Focal point: the chandelier and candlelit table
against the dark wall. Materials: dark wood, brass, velvet, lacquer,
cut glass. Palette: ink black-green, brass, burgundy velvet, cream
plates — one strong palette. Lighting: practical-light-only evening
scheme — chandelier + candles + one table lamp on the sideboard, 2700K,
deep shadow at edges is intentional.

Textiles: velvet chair seats in burgundy, a patterned runner, full-
length velvet curtains in the wall color. Decor: a silver candelabra
cluster, cut-crystal glasses catching light, one large Dutch-style
still-life print, a fruit bowl as centerpiece.

{refs}

Avoid: white walls, matchy dining sets, overhead flat lighting, chrome,
clutter beyond the sideboard top.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 35mm lens, eye-level, candlelit exposure, --ar 3:2
```

### Пример 9.4 — Прихожая 1.5×3.0 м (maximalist entry)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a narrow entryway, 1.5 × 3.0 m, 2.7 m ceiling. Style: New
Maximalism — proof that bold works in small spaces: one patterned
surface, one mirror, one console, high drama per square meter.

Scale-aware plan: 1.5 m width: a 25 cm deep wall-mounted console in
dark wood; a tall arched antique-brass mirror (170 cm) on the long wall
doubling the space visually; a runner 80 cm wide; a single wall sconce;
nothing deeper than 25 cm anywhere; the walk line stays at 100 cm.

Feature wall: the short end wall covered floor-to-ceiling in a bold
botanical wallpaper (deep green with gold) — the entry's one maximalist
gesture, high impact, zero floor cost. Focal point: the arched mirror
reflecting the wallpaper. Materials: brass, dark wood, wallpaper, aged
mirror glass. Palette: deep green, brass, dark wood, cream ceiling.
Lighting: ambient — none harsh; one 2700K sconce with a silk shade;
accent — the mirror reflection doing the work.

Textiles: a patterned runner in the palette. Decor: one sculptural
vase with branches on the console, one small framed print, a brass
dish — three objects maximum in this footprint.

{refs}

Avoid: wallpaper on both walls (visual noise in a corridor), deep
furniture, multiple patterns, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level down the corridor, --ar 4:5
```

### Пример 9.5 — Кабинет-библиотека 3.4×4.0 м (collector's study)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a collector's study, 3.4 × 4.0 m, 2.8 m ceiling. Style:
New Maximalism — a cabinet of curiosities, contemporary edition:
collected, layered, palette-locked.

Scale-aware plan: full-wall open shelving (35 cm deep) covering the
4.0 m wall — books two-deep in places, objects interleaved; a 170 cm
vintage leather-top desk in front of the window; a Chesterfield sofa
in oxblood leather (200 cm) against the opposite wall; a brass pharmacy
lamp; a bar cart in brass and glass. Walkways ≥ 85 cm; the sofa zone
floats 50 cm off the wall.

Feature wall: the shelving wall, curated in vertical rhythm: books
vertical, horizontal stacks as punctuation, objects on every third bay.
Focal point: one oversized statement piece in the center bay — a
sculpture or large ceramic. Materials: walnut shelving, leather,
brass, glass, velvet (one chair). Palette: oxblood, walnut, brass,
deep green (one wall), cream — collected but disciplined.
Lighting: ambient — 2700K spots; task — pharmacy lamp; accent — two
small picture lights, a table lamp on the bar cart, candle group;
pools of warm light among the shelves.

Textiles: a Persian-style rug in worn reds and blues, velvet curtain
in deep green, one kilim cushion on the Chesterfield. Decor: globe,
mineral specimens, framed natural-history prints, a decanter set on
the cart — every object a find, nothing mass-produced.

{refs}

Avoid: uniform styled shelves, palette drift, more than 2 metals,
clutter without rhythm, cool light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 3:2
```

---

## СТИЛЬ 10 — MEDITERRANEAN MODERN / MODERN TUSCAN (Средиземноморский модерн) 🍋

**Тренд 2026:** Modern Tuscan Revival и Mediterranean — белая штукатурка, терракота, арки, латунь, indoor-outdoor living. Тёплая альтернатива скандинавскому белому.

| Рецепт | Значение |
|---|---|
| Base palette | warm white stucco, sand, terracotta |
| Contrast | olive green, dusty blue |
| Accent | aged brass, burnt sienna |
| Materials | известковая штукатурка, терракотовая плитка, ротанг, лён, необожжённая керамика |
| Feature wall | арка (real or painted), ниша с керамикой, текстурная штукатурка |
| Light | тёплый дневной свет 3000–3500K, закатный вечер |
| Avoid | кич «греческий отель», синий-белый клише, глянец, пластик |

### Пример 10.1 — Гостиная 4.0×5.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a living room, 4.0 × 5.0 m, 2.8 m ceiling. Style:
Mediterranean Modern — sun-warmed stucco, terracotta underfoot, linen
and rattan: a villa feeling in a city apartment.

Scale-aware plan: a 240 cm low sofa in warm white linen; two rattan
armchairs with cream cushions angled to conversation; a 110 cm
travertine coffee table; a 45 cm deep oak console with a large round
mirror; a rattan floor lamp. Terracotta-look tile or warm microcement
floor with layered jute and wool rugs. Walkways ≥ 85 cm.

Feature wall: textured limewash stucco in warm sand with an arched
niche holding two ceramics and a candle; an olive branch in a floor
vase beside it. Focal point: the arched niche as the room's
architectural moment. Materials: limewash, terracotta, travertine,
rattan, washed linen, aged brass. Palette: warm white, sand,
terracotta, olive green accents, brass. Lighting: ambient — warm
daylight through sheer linen; task — rattan floor lamp; accent — a
brass sconce in the niche, candle group; 3000K evening.

Textiles: layered jute + wool rugs, full-length washed-linen curtains,
olive and cream cushions, one striped throw. Decor: large unglazed
ceramics, a wooden bowl of lemons, one framed Mediterranean landscape
print, potted olive or citrus tree.

{refs}

Avoid: blue-and-white clichés, glossy hotel styling, plastic rattan,
cold light, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, golden afternoon light, --ar 3:2
```

### Пример 10.2 — Спальня 2.8×3.4 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bedroom, 2.8 × 3.4 m, 2.65 m ceiling. Style: Mediterranean
Modern — a room that breathes: stucco walls, linen, morning sun.

Scale-aware plan: a 160 cm bed with a rattan or woven-leather headboard
against the stucco wall; 55–60 cm walkways; two mismatched nightstands
— one wooden stool, one wall-mounted shelf; a linen curtain on a wooden
rod; a small 45 cm deep wardrobe in light wood. Nothing blocks the
window; sheer curtains diffuse the light. Walkways ≥ 60 cm.

Feature wall: warm sand limewash with one arched painted detail or
shallow niche above the bed holding a single ceramic. Focal point: the
woven headboard texture against stucco. Materials: limewash, rattan,
light wood, washed linen, terracotta pots. Palette: warm white, sand,
terracotta accents in pots, olive-green bedding detail. Lighting:
ambient — morning daylight; task — one plug-in sconce with a linen
shade; accent — a candle pair on the nightstand; 3000K.

Textiles: washed-linen bedding in warm white with one terracotta stripe,
a cotton rug, sheer curtains. Decor: one ceramic vase with dried
grasses, a small wooden cross or wall amulet if appropriate to user,
one framed line-drawing print.

{refs}

Avoid: heavy dark furniture, blackout-only curtains, glossy surfaces,
blue-white resort cliché, clutter.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, soft morning light, --ar 4:5
```

### Пример 10.3 — Кухня 3.2×4.0 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a kitchen, 3.2 × 4.0 m, 2.7 m ceiling. Style: Mediterranean
— farmhouse kitchen: terracotta floor, open shelves, copper and wood.

Scale-aware plan: an L-shaped run — 300 cm along the main wall, 180 cm
return; a 140×75 cm wooden table with two benches instead of chairs
(benches tuck fully under, saving 40 cm in the 95 cm walkway); open oak
shelves (two rows) instead of upper cabinets; range cooker or ceramic
hob with a plaster hood. Walkways ≥ 95 cm.

Feature wall: zellige or handmade-look glazed tile in warm white or
soft green behind the hob, hand-glaze variation visible. Focal point:
the plaster hood and the open shelf styled with ceramics and copper.
Materials: terracotta floor tile, oak, zellige, plaster, copper pots,
linen. Palette: warm white, oak, terracotta floor, soft green tile,
copper. Lighting: ambient — daylight; task — under-shelf LED 3000K;
accent — one ceramic pendant over the table; copper catches the light.

Textiles: linen curtain, striped cotton runner on the table. Decor:
hanging copper pans, wooden boards, a ceramic olive-oil cruet set,
herbs in terracotta pots, a bowl of citrus.

{refs}

Avoid: glossy modern fronts, stainless overload, cool light, plastic
storage, cluttered worktops.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, three-quarter height, --ar 3:2
```

### Пример 10.4 — Ванная 2.2×2.6 м

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a bathroom, 2.2 × 2.6 m, 2.6 m ceiling. Style: Mediterranean
— stone basin, terracotta, an arched mirror: bathhouse simplicity.

Scale-aware plan: a 90 cm walk-in shower with a curved plastered opening
or fluted glass; a 110 cm floating vanity in warm wood with a round
stone vessel sink; an arched mirror (70 cm) in aged brass; wall-hung WC;
terracotta-look floor tile with matching skirting detail. Floor stays
clear except one wooden stool.

Feature wall: tadelakt waterproof plaster in warm sand in the shower,
niche with a ceramic. Focal point: the arched brass mirror over the
stone basin. Materials: tadelakt, terracotta tile, stone basin, aged
brass, light wood. Palette: sand, terracotta, warm white, brass, one
sage towel. Lighting: ambient — 3000K; task — brass sconces; accent —
candle pair on the stool; soft shadows welcome.

Textiles: two linen towels in sage and cream. Decor: amber glass
bottles, a small olive-soap ceramic dish, one branch in a bud vase.

{refs}

Avoid: chrome, white glossy tiles, blue resort clichés, clutter,
cold light.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, --ar 4:5
```

### Пример 10.5 — Терраса/лоджия 3.0×4.5 м (indoor-outdoor)

```
Use the source room photo as an immutable architectural base. Preserve
exactly: room geometry, camera angle and perspective, wall / window / door
positions, ceiling height, natural light direction.

Redesign of a covered terrace/loggia, 3.0 × 4.5 m, open or glazed side
facing outdoors. Style: Mediterranean — the room that dissolves into
the evening: rattan, terracotta, candlelight.

Scale-aware plan: a 200 cm rattan or rope-weave sofa with cream
outdoor cushions against the solid wall; a low stone or terracotta
coffee table 100 cm; two rattan armchairs; a 40 cm deep terracotta
planter row along the railing line with lavender, rosemary and a small
citrus; a jute outdoor rug 240×170 cm. Walkways ≥ 80 cm to the
opening.

Feature wall: white stucco with one large sun-faded vintage-style
poster or a ceramic wall plate cluster. Focal point: the seating group
facing the view. Materials: rattan, rope weave, terracotta, stone,
outdoor linen. Palette: warm white, terracotta, cream, olive green,
aged brass lanterns. Lighting: ambient — sunset; task — none; accent —
string of warm festoon lights overhead, three brass hurricane lanterns
with candles, one floor lantern; 2700K as evening falls.

Textiles: outdoor linen cushions, one striped throw, the jute rug.
Decor: candle lanterns, a wooden tray with a carafe set, potted herbs,
a vintage clay amphora.

{refs}

Avoid: plastic furniture, cool white LED festoons, clutter on the
floor, blocking the view line.

Editorial architectural interior photography, realistic furniture scale,
correct perspective, 24mm lens, eye-level, golden-hour light, --ar 16:9
```

---

## 5. МАСШТАБНО-АГНОСТИЧНЫЕ БЛОКИ: КАК ГЕНЕРАТОР АДАПТИРУЕТ ПРОМТ ПОД КОНКРЕТНУЮ КОМНАТУ

### Алгоритм генерации (псевдокод для вашего backend)

```ts
function buildPrompt(project, roomAnalysis, recipe, refs) {
  // 1. Геометрия из analyze_room
  const { width, length, height, windows, doors, obstacles } = roomAnalysis;

  // 2. Масштабный план — ВЫЧИСЛЯЕТСЯ, а не пишется руками
  const furniturePlan = scalePlanner.solve({
    room: { width, length, height },
    style: recipe.id,
    userReferences: refs.filter(r => r.mode === "must_use"),
    circulationMinCm: 60
  });
  // Правило: если решение невозможно (кровать 180 в комнату 1.9 м),
  // планировщик БЕРЁТ МЕНЬШИЙ размер и сообщает об этом в промт явно.

  // 3. Подбор рецепта под тип комнаты и интенсивность
  const styleBlock = recipe.getBlock(roomType, intensity);

  // 4. Сборка 7 блоков в фиксированном порядке
  return [
    BLOCK_BASE,              // неизменная архитектура
    blockRoom(roomType, width, length, height),
    blockStyle(recipe),
    blockScale(furniturePlan),     // ← ключевой блок
    blockRecipe(styleBlock),
    blockRefs(refs.slice(0, 4)),   // максимум: 2 anchors + 2 products
    blockAvoid(recipe.avoid),
    blockCamera(lensFor(width))    // узкие комнаты → 20mm, стандарт → 24mm
  ].join("\n\n");
}
```

### Ключевое правило честности масштаба

Если пользователь просит кровать 200 см в комнату 2.0 м — генератор **не обещает невозможное**. Он вписывает в промт решение:

```
"a 140 cm bed spans nearly the full 2.0 m width; walkways of 30 cm on
 one side only — a deliberate, cozy ship-cabin layout; wall-mounted
 storage above replaces the wardrobe"
```

Такой промт даёт модели честную сцену вместо искажённой перспективы, где кровать 200 см «влезает» только за счёт нарушения геометрии.

---

## 6. QA-ЧЕКЛИСТ ДЛЯ ОТБРАКОВКИ РЕЗУЛЬТАТОВ

После генерации (vision-модель, JSON-оценка по спецификации):

```json
{
  "architecturePreserved": true,
  "scaleHonesty": true,
  "focalPointPresent": true,
  "featureWallPresent": true,
  "lightingLayers": 3,
  "furnitureFitsGeometry": true,
  "walkwaysPlausible": true,
  "styleCoherence": 0.9,
  "looksGeneric": false,
  "referencesVisible": ["must_use_sofa"]
}
```

**Порог публикации:** architecturePreserved ✓, scaleHonesty ✓ (новый пункт!), lightingLayers ≥ 2, furnitureFitsGeometry ✓, looksGeneric = false.

---

## 7. ИСТОЧНИКИ И ОГОВОРКИ

- Структура «6 слотов» (комната+масштаб → стиль → геометрия → материалы → свет → камера) и практики правки «один слот за раз» — по Prompt Architects (обновлено 27.10.2026).
- Категории атрибутов промта и приёмы усиления (терминология, стиль мебели, культурный контекст, освещение) — по monju252/AI-Prompts-for-Interior-Design (MIT).
- Подбор 10 стилей и их рецептуры — по трендовым обзорам 2026 (Japandi 2.0, Dark Wabi-Sabi, New Nordic, Warm Minimalism, Organic Luxe, Modern Heritage, New Maximalism, Mixed Wood Tones, Modern Tuscan Revival, Biophilic).
- Все тексты промтов написаны оригинально для этого генератора; коммерческие библиотеки (ArchiDot и пр.) не использовались.
- Промты — концепт-визуализации, не строительная документация: ничего в них не проверено по реальной площадке, бюджету или строительным нормам.
