import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVariety, pickStyleAccent, resolveStylePalette, variabilityPrompt } from '../src/variety.js';
import { DESIGN_STYLES } from '../src/designdata.js';

const SCANDI = resolveStylePalette({ styleName: 'Скандинавский' });
const SCANDI_COLORS = new Set([SCANDI.accent, SCANDI.support, SCANDI.dark]);

test('pickVariety is deterministic for the same seed', () => {
  const used = [{ focalZone: 'window', mainMove: 'accent wall', palette: ['terracotta'] }];
  const a = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, 'render-42', used);
  const b = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, 'render-42', used);
  assert.deepEqual(a, b);
});

test('accent is always a hex from the style palette', () => {
  for (let i = 0; i < 20; i += 1) {
    const out = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, `seed-${i}`);
    assert.match(out.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(SCANDI_COLORS.has(out.accent), `${out.accent} must come from the style palette`);
  }
});

test('seed rotates the accent across the palette', () => {
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    seen.add(pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, `room-${i}`).accent);
  }
  assert.ok(seen.size >= 2, 'different seeds should not always pick the same accent');
});

test('unknown style has no palette accent', () => {
  const out = pickVariety({ keep_furniture: true }, { name: 'Неизвестный стиль', key: '' }, 'x');
  assert.equal(out.accent, null);
  assert.equal(pickStyleAccent(null, 'x'), null);
});

test('axes are selected deterministically per seed', () => {
  const a = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, 'render-42');
  const b = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, 'render-42');
  assert.deepEqual(a.axes, b.axes);
  assert.ok(a.axes.length >= 3 && a.axes.length <= 6, 'a style exposes 3–6 axes');
});

test('different seeds produce different axes for the same style', () => {
  const seen = new Set();
  for (let i = 0; i < 12; i += 1) {
    const axes = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, `room-${i}`).axes;
    seen.add(JSON.stringify(axes));
  }
  assert.ok(seen.size >= 2, 'different seeds should not always pick identical axes');
});

test('axes are soft modifiers: never a palette or accent colour', () => {
  for (const style of DESIGN_STYLES) {
    const paletteHexes = new Set(Object.values(style.palette).filter(value => /^#[0-9a-f]{6}$/i.test(String(value))));
    for (let i = 0; i < 10; i += 1) {
      const out = pickVariety({ keep_furniture: true }, { name: style.name, key: style.id }, `seed-${i}`);
      for (const axis of out.axes) {
        assert.doesNotMatch(String(axis.value), /^#/, `${style.id} axis ${axis.key} must not be a colour`);
        assert.ok(!paletteHexes.has(axis.value), `${style.id} axis ${axis.key} must not reuse a palette hex`);
      }
    }
  }
});

test('unknown style has no axes', () => {
  const out = pickVariety({ keep_furniture: true }, { name: 'Неизвестный стиль', key: '' }, 'x');
  assert.deepEqual(out.axes, []);
});

test('axes render as a separate soft-modifier block without touching the accent line', () => {
  const out = pickVariety({ keep_furniture: true }, { name: 'Скандинавский', key: 'scandinavian' }, 'render-42');
  const text = variabilityPrompt(out);
  assert.match(text, /STYLE AXES — SOFT VARIATION/);
  assert.match(text, /- temperature: /);
  assert.ok(text.includes(`Use exactly one accent colour from the style palette: ${out.accent}.`), 'accent line is preserved');
  assert.ok(!text.includes(out.accent + '\nSTYLE AXES'), 'axes block starts after the accent line');
});

// Поведенческая регрессия: фиксированные выходы реализации pickVariety.
const GOLDEN = [
  {
    "seed": "render-1",
    "style": {
      "name": "Скандинавский",
      "key": "scandinavian"
    },
    "keepFurniture": true,
    "used": [],
    "expect": {
      "version": 1,
      "seed": "render-1",
      "styleName": "Скандинавский",
      "keepFurniture": true,
      "accent": "#C26D5A",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "tactile"
        },
        {
          "key": "contrast",
          "value": "tonal"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with textile layering and a calm wall finish",
      "avoid": [],
      "previousCount": 0
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with textile layering and a calm wall finish.\nThis is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea.\nUse exactly one accent colour from the style palette: #C26D5A. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: tactile — Emphasize touchable irregularity: hand-trowelled plaster, nubby textiles, live wood grain.\n- contrast: tonal — Build interest with value shifts within one hue family.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  },
  {
    "seed": "render-2",
    "style": {
      "name": "Скандинавский",
      "key": "scandinavian"
    },
    "keepFurniture": true,
    "used": [],
    "expect": {
      "version": 1,
      "seed": "render-2",
      "styleName": "Скандинавский",
      "keepFurniture": true,
      "accent": "#8A9A8B",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "matte"
        },
        {
          "key": "contrast",
          "value": "low"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with textile layering and a calm wall finish",
      "avoid": [],
      "previousCount": 0
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with textile layering and a calm wall finish.\nThis is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea.\nUse exactly one accent colour from the style palette: #8A9A8B. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: matte — Prefer matte, absorbent surfaces: lime plaster, raw linen, unpolished wood.\n- contrast: low — Keep tonal transitions gentle and harmonious.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  },
  {
    "seed": "render-3",
    "style": {
      "name": "",
      "key": "scandinavian"
    },
    "keepFurniture": true,
    "used": [],
    "expect": {
      "version": 1,
      "seed": "render-3",
      "styleName": "",
      "keepFurniture": true,
      "accent": "#C26D5A",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "matte"
        },
        {
          "key": "contrast",
          "value": "tonal"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with light and material contrast",
      "avoid": [],
      "previousCount": 0
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with light and material contrast.\nThis is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea.\nUse exactly one accent colour from the style palette: #C26D5A. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: matte — Prefer matte, absorbent surfaces: lime plaster, raw linen, unpolished wood.\n- contrast: tonal — Build interest with value shifts within one hue family.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  },
  {
    "seed": "render-4",
    "style": {
      "name": "Современный минимализм",
      "key": "minimalism"
    },
    "keepFurniture": true,
    "used": [],
    "expect": {
      "version": 1,
      "seed": "render-4",
      "styleName": "Современный минимализм",
      "keepFurniture": true,
      "accent": "#D2A24C",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "even"
        },
        {
          "key": "texture",
          "value": "matte"
        },
        {
          "key": "density",
          "value": "tonal"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with wall finish, art and one sculptural accent",
      "avoid": [],
      "previousCount": 0
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with wall finish, art and one sculptural accent.\nThis is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea.\nUse exactly one accent colour from the style palette: #D2A24C. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: even — Keep illumination uniform across the frame with no single dominant hotspot.\n- texture: matte — Prefer matte, absorbent surfaces: lime plaster, raw linen, unpolished wood.\n- density: tonal — Layer similar tones at different values to create depth without clutter.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  },
  {
    "seed": "x",
    "style": {
      "name": "Неизвестный стиль",
      "key": ""
    },
    "keepFurniture": true,
    "used": [],
    "expect": {
      "version": 1,
      "seed": "x",
      "styleName": "Неизвестный стиль",
      "keepFurniture": true,
      "accent": null,
      "axes": [],
      "emphasis": "lead with textile layering and a calm wall finish",
      "avoid": [],
      "previousCount": 0
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with textile layering and a calm wall finish.\nThis is the first render of this room: there are no previous choices to avoid. Set a clear room-level idea."
  },
  {
    "seed": "render-keep",
    "style": {
      "name": "Скандинавский",
      "key": "scandinavian"
    },
    "keepFurniture": true,
    "used": [
      {
        "focalZone": "window",
        "mainMove": "accent wall",
        "palette": [
          "terracotta"
        ]
      }
    ],
    "expect": {
      "version": 1,
      "seed": "render-keep",
      "styleName": "Скандинавский",
      "keepFurniture": true,
      "accent": "#C26D5A",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "matte"
        },
        {
          "key": "contrast",
          "value": "low"
        },
        {
          "key": "styling",
          "value": "curated"
        },
        {
          "key": "composition",
          "value": "asymmetric"
        }
      ],
      "emphasis": "lead with light and material contrast",
      "avoid": [
        "focal zone: window",
        "main move: accent wall",
        "palette direction: terracotta"
      ],
      "previousCount": 1
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with light and material contrast.\nDo not repeat: focal zone: window; main move: accent wall; palette direction: terracotta. Keep the existing furniture positions and layout; vary only finish, decor, lighting and the accent within the style palette.\nUse exactly one accent colour from the style palette: #C26D5A. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: matte — Prefer matte, absorbent surfaces: lime plaster, raw linen, unpolished wood.\n- contrast: low — Keep tonal transitions gentle and harmonious.\n- styling: curated — Build 3–5 styled vignettes with layered textiles, art, plants, books and ceramics; every area feels finished.\n- composition: asymmetric — Place the main visual weight off-center and balance it with smaller counterweights; avoid perfect mirroring."
  },
  {
    "seed": "render-empty",
    "style": {
      "name": "Скандинавский",
      "key": "scandinavian"
    },
    "keepFurniture": false,
    "used": [
      {
        "focalZone": "window",
        "mainMove": "accent wall",
        "palette": [
          "terracotta"
        ]
      }
    ],
    "expect": {
      "version": 1,
      "seed": "render-empty",
      "styleName": "Скандинавский",
      "keepFurniture": false,
      "accent": "#8A9A8B",
      "axes": [
        {
          "key": "temperature",
          "value": "neutral"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "tactile"
        },
        {
          "key": "contrast",
          "value": "tonal"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with a single sculptural accent object on the existing focal plane",
      "avoid": [
        "focal zone: window",
        "main move: accent wall",
        "palette direction: terracotta",
        "the same furniture arrangement and decor vignette as the previous render of this room"
      ],
      "previousCount": 1
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with a single sculptural accent object on the existing focal plane.\nDo not repeat: focal zone: window; main move: accent wall; palette direction: terracotta; the same furniture arrangement and decor vignette as the previous render of this room. Choose a visibly different composition while keeping the geometry lock and the style palette.\nUse exactly one accent colour from the style palette: #8A9A8B. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: neutral — Keep the palette in the middle: greige, taupe, soft grey woods, brushed steel.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: tactile — Emphasize touchable irregularity: hand-trowelled plaster, nubby textiles, live wood grain.\n- contrast: tonal — Build interest with value shifts within one hue family.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  },
  {
    "seed": "s",
    "style": {
      "name": "Скандинавский",
      "key": "scandinavian"
    },
    "keepFurniture": true,
    "used": [
      {
        "focalZone": "zone-0",
        "mainMove": "move-0",
        "palette": [
          "palette-0"
        ]
      },
      {
        "focalZone": "zone-1",
        "mainMove": "move-1",
        "palette": [
          "palette-1"
        ]
      },
      {
        "focalZone": "zone-2",
        "mainMove": "move-2",
        "palette": [
          "palette-2"
        ]
      },
      {
        "focalZone": "zone-3",
        "mainMove": "move-3",
        "palette": [
          "palette-3"
        ]
      },
      {
        "focalZone": "zone-4",
        "mainMove": "move-4",
        "palette": [
          "palette-4"
        ]
      },
      {
        "focalZone": "zone-5",
        "mainMove": "move-5",
        "palette": [
          "palette-5"
        ]
      },
      {
        "focalZone": "zone-6",
        "mainMove": "move-6",
        "palette": [
          "palette-6"
        ]
      },
      {
        "focalZone": "zone-7",
        "mainMove": "move-7",
        "palette": [
          "palette-7"
        ]
      },
      {
        "focalZone": "zone-8",
        "mainMove": "move-8",
        "palette": [
          "palette-8"
        ]
      }
    ],
    "expect": {
      "version": 1,
      "seed": "s",
      "styleName": "Скандинавский",
      "keepFurniture": true,
      "accent": "#D8B98A",
      "axes": [
        {
          "key": "temperature",
          "value": "warm"
        },
        {
          "key": "light",
          "value": "airy"
        },
        {
          "key": "texture",
          "value": "matte"
        },
        {
          "key": "contrast",
          "value": "low"
        },
        {
          "key": "styling",
          "value": "minimal"
        },
        {
          "key": "composition",
          "value": "symmetric"
        }
      ],
      "emphasis": "lead with light and material contrast",
      "avoid": [
        "focal zone: zone-4, zone-5, zone-6, zone-7, zone-8",
        "main move: move-4, move-5, move-6, move-7, move-8",
        "palette direction: palette-4, palette-5, palette-6, palette-7, palette-8"
      ],
      "previousCount": 5
    },
    "prompt": "VARIABILITY — ROOM-LEVEL NOVELTY\nComposition emphasis: lead with light and material contrast.\nDo not repeat: focal zone: zone-4, zone-5, zone-6, zone-7, zone-8; main move: move-4, move-5, move-6, move-7, move-8; palette direction: palette-4, palette-5, palette-6, palette-7, palette-8. Keep the existing furniture positions and layout; vary only finish, decor, lighting and the accent within the style palette.\nUse exactly one accent colour from the style palette: #D8B98A. Do not introduce any other accent hue.\nSTYLE AXES — SOFT VARIATION\nThese are soft style modifiers that differentiate this render inside the chosen style. They never override the style palette, the single accent colour, the composition emphasis or the geometry lock.\n- temperature: warm — Favor warm woods, cream plasters, honey metals and soft terracotta notes.\n- light: airy — Maximize the sense of daylight with sheer treatments and light-reflecting surfaces.\n- texture: matte — Prefer matte, absorbent surfaces: lime plaster, raw linen, unpolished wood.\n- contrast: low — Keep tonal transitions gentle and harmonious.\n- styling: minimal — Keep the frame airy: fewer objects, generous negative space, one sculptural accent and calm surfaces.\n- composition: symmetric — Compose around a clear central axis; mirror visual weight left-to-right or around the focal plane."
  }
];

test('pickVariety matches golden outputs on fixed inputs', () => {
  for (const g of GOLDEN) {
    const out = pickVariety({ keep_furniture: g.keepFurniture }, g.style, g.seed, g.used);
    assert.deepEqual(out, g.expect, `case seed=${g.seed}`);
  }
});

test('variabilityPrompt matches golden prompts', () => {
  for (const g of GOLDEN) {
    if (!g.prompt) continue;
    const out = pickVariety({ keep_furniture: g.keepFurniture }, g.style, g.seed, g.used);
    assert.equal(variabilityPrompt(out), g.prompt, `case seed=${g.seed}`);
  }
});
