// Данные для обложек стилей: комната, дверь, цветовая история, плотность, стилинг.
// Цветовые схемы — по правилам колористики: тёплый/холодный контраст,
// комплементарные пары и акцент 10–20% площади.

const ROOM_PROGRAM = {
  living: 'a complete living room: sofa, armchair(s), coffee table, large rug, floor lamp, sideboard or console, wall art, books, ceramics, plants and floor-length curtains.',
  bedroom: 'a complete bedroom: bed with layered bedding, nightstand(s), table lamps, wardrobe or chest of drawers, rug, wall art, plants and curtains.',
  study: 'a complete home office: desk, ergonomic chair, bookcase or shelving of appropriate height, reading chair, floor lamp, rug, art, plants and desk accessories.',
  dining: 'a complete dining room: dining table for six, six chairs, sideboard or buffet, large rug, pendant light, wall art or mirror, plants, tableware, candles and curtains.',
};

const WALLS = {
  living: 'Style each wall with art, a mirror, a console or a sideboard; avoid bare walls. Keep furniture away from windows and door swings.',
  bedroom: 'Style the bed wall with art or a mirror; use a chest of drawers or wardrobe on the furniture wall. Keep the door wall clear of large furniture.',
  study: 'Style the desk wall with art, shelves or a pinboard; keep large storage off the window wall.',
  dining: 'Style the table wall with a sideboard and art; keep circulation clear around doors and the window.',
};

const DOOR_BY_STYLE = {
  modern: 'flush walnut door leaf with a concealed hinge and a slim brass handle.',
  loft: 'black steel-framed glass door leaf or matte black painted door with factory hardware.',
  scandinavian: 'pale oak door leaf with a simple vertical panel and a matte black handle.',
  provence: 'aged oak door leaf with carved panels and a wrought-iron handle.',
  minimalism: 'flush white door leaf with a hidden frame and no visible handle.',
  neoclassic: 'white door leaf with classical mouldings and a brass handle.',
  boho: 'carved wood door leaf with a rattan insert and a brass handle.',
  baroque: 'dark wood door leaf with gilded mouldings and a crystal handle.',
  japandi: 'oak door leaf with a rice-paper panel and a black handle.',
  classic: 'dark mahogany door leaf with raised panels and a brass handle.',
  country: 'painted wood door leaf with horizontal boards and an iron handle.',
  art_nouveau: 'curved wood door leaf with a stained-glass panel and a brass handle.',
  english: 'dark green painted door leaf with raised panels and a brass handle.',
  eclectic: 'vintage painted door leaf in a bold colour with a mixed-metal handle.',
  mediterranean: 'whitewashed wood door leaf with a wrought-iron handle.',
  eco: 'light oak door leaf with a linen panel and a wooden handle.',
  art_deco: 'black lacquer door leaf with brass geometric inlay.',
  dark_contemporary: 'smoked oak door leaf with a black handle.',
  memphis_accent: 'glossy coral or cobalt door leaf with a chrome handle.',
  mid_century: 'teak door leaf with a horizontal handle.',
  soviet_modern: 'veneer door leaf with a simple brass handle.',
  bauhaus: 'white door leaf with a tubular steel handle.',
  dark_academia: 'dark oak door leaf with a brass handle and a small brass number.',
  modern_farmhouse: 'white painted door leaf with black hardware.',
  coastal: 'whitewashed wood door leaf with a rope-wrapped handle.',
  space_age: 'rounded white door leaf with a chrome handle.',
  grandmillennial: 'pink or sage painted door leaf with a pleated fabric panel.',
  desert_modern: 'terracotta painted door leaf with a carved wood handle.',
  tropical_modern: 'teak door leaf with a rattan panel and a brass handle.',
  neo_deco: 'red lacquer door leaf with brass inlay.',
  high_tech: 'flush glass door leaf with a chrome frame.',
  chalet: 'solid oak door leaf with iron hinges and a carved handle.',
};

const COLOR_STORY = {
  modern: 'warm greige base #F4F2EE, deep petrol #1F4E5F and terracotta #C26D4A as the complementary pair, walnut #5A3E2B for depth. Keep 60% light base, 30% walnut, 10% petrol + terracotta.',
  loft: 'painted white brick #F0EDE8, matte black #1C1C1C, mustard #D9A441 and cobalt #2F4B8F as the cool contrast, cognac leather #8B4A2F. 60% light brick, 30% black, 10% mustard + cobalt.',
  scandinavian: 'pale oak #D8B98A, cream #FAF8F4, terracotta #C26D5A and sage #8A9A8B. 60% cream, 30% oak, 10% terracotta + sage.',
  provence: 'cream #F6F1E7, lavender #8E7AA8, olive #7E8B72 and terracotta #C9856A. 60% cream, 30% aged wood, 10% lavender + olive.',
  minimalism: 'off-white #F5F3EF, greige #C9C4BB, olive #7C8A5A and saffron #D2A24C. 70% off-white, 20% greige, 10% olive + saffron.',
  neoclassic: 'ivory #F2EDE4, navy #1F3A5F, brass #C9A961 and burgundy #7A2E3A. 60% ivory, 30% navy, 10% brass + burgundy.',
  boho: 'terracotta #B4553F, saffron #D99A3D, turquoise #2E8B8B and olive #6E7A4A on cream. 60% cream, 30% terracotta, 10% turquoise + saffron.',
  baroque: 'burgundy #6E1F2E, emerald #1F5A45, gold #C9A961 and black. 50% burgundy, 30% emerald, 20% gold + black.',
  japandi: 'rice paper #EDE8DF, walnut #4A3B2A, moss #6E7A4A and terracotta #B76E4A. 60% rice paper, 30% walnut, 10% moss + terracotta.',
  classic: 'ivory #EDE4D3, dark walnut #4A2E22, burgundy #6E1F2A and forest #2F4A3A. 50% ivory, 30% walnut, 20% burgundy + forest.',
  country: 'cream #EFE7D8, brick #A0432F, forest #2F4A3A and mustard #D9A441. 60% cream, 20% brick, 20% forest + mustard.',
  art_nouveau: 'mauve #8A5A83, olive #8A9A5B, gold #C9A961 and dusty rose #C98A9A. 50% cream, 30% mauve, 20% olive + gold.',
  english: 'deep green #2F3B33, burgundy #6B2B2B, tan leather #A47A52 and brass. 50% deep green, 30% leather, 20% burgundy + brass.',
  eclectic: 'teal #2E6B6B, mustard #D9A441, burgundy #7A2E3A and cream. 50% cream, 30% teal, 20% mustard + burgundy.',
  mediterranean: 'white #F7F3EA, terracotta #C26D4A, olive #7E8B5A and cobalt #2F5D8A. 60% white, 20% terracotta, 20% olive + cobalt.',
  eco: 'stone #EAE4D8, moss #6E7A4A, terracotta #A4713E and cream. 60% stone, 30% moss, 10% terracotta.',
  art_deco: 'black #1A1A1A, gold #C9A961, emerald #1F5A45 and burgundy #6E1F2E. 50% black, 30% gold, 20% emerald + burgundy.',
  dark_contemporary: 'graphite #232323, brass #C9A227, petrol #2F5D62 and burgundy #5A1F2A. 70% graphite, 20% brass, 10% petrol + burgundy.',
  memphis_accent: 'coral #E4583E, cobalt #2F4B8F, mustard #E4A83A and black. 60% cream, 20% coral, 20% cobalt + mustard.',
  mid_century: 'teak #B07A4A, mustard #D9A441, olive #6E7A4A and terracotta #C26D3A. 50% cream, 30% teak, 20% mustard + olive.',
  soviet_modern: 'ochre #B58A3F, forest #4A5A3A, burgundy #7A2E3A and walnut. 60% ochre, 30% walnut, 10% forest + burgundy.',
  bauhaus: 'red #C23A2E, blue #2A5A8A, yellow #E4A83A, white and black. 60% white, 20% red, 10% blue, 10% yellow.',
  dark_academia: 'deep green #2A3A2A, burgundy #5A1F2A, brass #8A6B3F and brown. 60% deep green, 30% brown, 10% burgundy + brass.',
  modern_farmhouse: 'white #F6F3EA, black #1C1C1C, sage #8A9A7A and terracotta #B76E4A. 70% white, 20% black, 10% sage + terracotta.',
  coastal: 'white #F5F2EA, soft blue #A8C4D4, navy #2F4B6A and coral #E07A5F. 60% white, 20% blue, 20% navy + coral.',
  space_age: 'cream #F0E8E0, mustard #E4A83A, orange #E07A3F and cobalt #2F4B8F. 50% cream, 20% mustard, 20% orange, 10% cobalt.',
  grandmillennial: 'cream #F2EAE0, dusty rose #C28A8A, sage #8A9A7A and lavender #9B7FA6. 50% cream, 30% rose, 20% sage + lavender.',
  desert_modern: 'sand #E8D4C0, terracotta #C47A4A, cactus #6E7A4A and cobalt #2F5D8A. 60% sand, 20% terracotta, 20% cactus + cobalt.',
  tropical_modern: 'cream #F0E8D8, emerald #1F6B4A, palm #4A7A3A and coral #E07A5F. 50% cream, 30% emerald, 20% palm + coral.',
  neo_deco: 'cream #F0E4D8, red #A83A3A, gold #C9A961 and black. 50% cream, 30% red, 20% gold + black.',
  high_tech: 'white #F0F2F4, chrome #C0C6CC, cobalt #2F5D8A and black. 60% white, 20% chrome, 20% cobalt + black.',
  chalet: 'cream #E8DFD0, honey #B07A4A, rust #8B4A2F and forest #2F4A3A. 50% cream, 30% honey, 20% rust + forest.',
};

const DENSITY = {
  minimalism: 'minimal: only essential furniture, generous negative space, one sculptural object.',
  japandi: 'minimal: low furniture, generous empty floor, one branch and one ceramic.',
  scandinavian: 'curated: complete but airy, layered textiles, a few plants and ceramics.',
  modern: 'curated: complete and layered, with art, books and ceramics.',
  art_deco: 'curated: rich but controlled, geometric repeats, no clutter.',
  high_tech: 'curated: precise, few objects, hidden storage.',
  coastal: 'curated: airy, complete, with books, ceramics and plants.',
  desert_modern: 'curated: sparse but complete, with pottery, textiles and one large plant.',
  tropical_modern: 'curated: layered greenery, complete but open.',
  chalet: 'curated: layered wool, wood, fire and tableware.',
};

const PLACEMENT = {
  living: 'Place the sofa on a solid wall, armchairs opposite, coffee table centered; keep both doors and the full window clear with 60–90 cm walkways.',
  bedroom: 'Place the bed against a solid wall, not in front of the window or doors; keep the radiator and window visible. Keep clear walkways in front of doors.',
  study: 'Place the desk against a solid wall, the bookcase or shelving on another solid wall, the reading chair in the far corner; keep both doors and the window clear.',
  dining: 'Center the dining table under the pendant, put the sideboard on a solid wall; keep both doors and the full window clear with 60–90 cm walkways.',
};

const STYLING = {
  living: 'bright layered textiles, cushions in contrasting colours, a chunky throw, a pouf, a tray with an open book and a tea mug, handmade ceramics, a plant in a woven basket and candles.',
  bedroom: 'rumpled linen bedding, a bright throw, contrasting cushions, an open book and a tea mug on a tray, handmade ceramics, a plant and candles.',
  study: 'a bright throw on the reading chair, an open book, a tea mug, handmade ceramics, a plant, framed art and a warm desk lamp.',
  dining: 'a linen table runner, bright napkins, candles, a bowl of fruit, handmade ceramics, fresh flowers and a sideboard with art and plants.',
};

export function designBrief(styleId, roomKey, sourceLayout = '') {
  return [
    `ROOM PROGRAM — ${roomKey}: ${ROOM_PROGRAM[roomKey]}`,
    `WALLS — ${WALLS[roomKey]}`,
    `PLACEMENT — ${PLACEMENT[roomKey]}`,
    sourceLayout ? `SOURCE LAYOUT — ${sourceLayout}` : '',
    'RADIATOR — the radiator stays in its original position under the window; do not cover it with furniture or long curtains, and keep the heating point unchanged.',
    `DOOR LEAF — restyle the leaf, keep the opening: ${DOOR_BY_STYLE[styleId] || 'a style-appropriate door leaf.'}`,
    `COLOUR STORY — ${COLOR_STORY[styleId] || 'a distinct style palette.'}`,
    `STYLING DENSITY — ${DENSITY[styleId] || 'curated: complete, layered and lived-in.'}`,
    `STYLING — ${STYLING[roomKey]}`,
    'LIVED-IN — warm 2700K layered light, golden-hour sun through sheer curtains, rumpled linen, an open book and a tea mug, handmade ceramics, a plant in a woven basket, one bright textile accent. Keep the same camera position and room geometry as the source.',
  ].filter(Boolean).join('\n');
}
