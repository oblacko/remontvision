// Детерминированная проверка расстановки ДО промта: мебель должна влезать.
// Правило по ширине комнаты:
//  - ширина >= 4.0 м: поперёк можно до 3 предметов (два у стен + центральный);
//  - ширина < 4.0 м: только 2 предмета, сумма их глубин <= 1.3 м; центральный стол убираем.
// Не доверяем арифметике LLM — считаем сами по size_cm.

const FLOORLESS = new Set(['rug', 'light', 'decor', 'decor_art', 'plant', 'mirror', 'curtain', 'textile']);
const CENTRAL = new Set(['coffee_table', 'dining_table']);
const STORAGE = new Set(['storage', 'sideboard', 'cabinet', 'wardrobe', 'desk', 'office_chair', 'dining_chair', 'bench']);
const MAIN = new Set(['sofa', 'bed']);

const priorityOf = item => Number(item?.priority) || 2;
const isCentral = item => CENTRAL.has(String(item?.type || ''));
const canDrop = item => !MAIN.has(String(item?.type || '')) && (isCentral(item) || priorityOf(item) > 1);

export const WIDE_ROOM_M = 4.0;
export const NARROW_MAX_DEPTH_SUM_CM = 130;

export function parseSizeCm(value) {
  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)\s*[x×х]\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const a = Number(match[1].replace(',', '.'));
  const b = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return { width: Math.max(a, b), depth: Math.min(a, b), raw: [a, b] };
}

const sizeOf = item => parseSizeCm(item?.size_cm);
const isFurniture = item => !FLOORLESS.has(String(item?.type || '')) && Boolean(sizeOf(item));
const depthOf = item => sizeOf(item)?.depth || 0;

const crossSection = items => {
  const deep = items.filter(isFurniture)
    .map(item => ({ item, depth: depthOf(item) }))
    .sort((a, b) => b.depth - a.depth);
  const opposing = deep.slice(0, 2);
  const central = items.find(item => CENTRAL.has(String(item?.type || '')));
  const centralDepth = central ? depthOf(central) : 0;
  const opposingSumCm = opposing.reduce((sum, entry) => sum + entry.depth, 0);
  return {
    opposingItems: opposing.map(entry => entry.item),
    opposingSumCm,
    centralDepthCm: centralDepth,
    neededCm: opposingSumCm + centralDepth + 60,
    central: central || null,
  };
};

export function fitLayoutPlan({ plan, dimensions, roomType = '', artDirection = '' } = {}) {
  const width = Number(dimensions?.width);
  if (!plan?.items?.length || !Number.isFinite(width) || width <= 0) {
    return { plan, artDirection, fit: null, dropped: [] };
  }
  const widthCm = Math.round(width * 100);
  const wide = width >= WIDE_ROOM_M;
  const items = [...plan.items];
  const dropped = [];
  const drop = item => {
    const index = items.indexOf(item);
    if (index >= 0) { items.splice(index, 1); dropped.push(item); }
  };

  // В комнате уже 4 м центральный стол — это третий предмет поперёк; убираем.
  if (!wide) {
    for (const item of items.filter(entry => CENTRAL.has(String(entry.type || '')))) drop(item);
  }

  const acceptedBy = section => wide
    ? section.neededCm <= widthCm
    : section.opposingSumCm <= NARROW_MAX_DEPTH_SUM_CM && section.neededCm <= widthCm;

  let section = crossSection(items);
  while (!acceptedBy(section)) {
    const central = items.find(entry => canDrop(entry) && CENTRAL.has(String(entry.type || '')));
    if (central) { drop(central); section = crossSection(items); continue; }

    const shallowOpposing = section.opposingItems
      .slice()
      .sort((a, b) => depthOf(a) - depthOf(b))
      .find(entry => canDrop(entry) && (STORAGE.has(String(entry.type || '')) || String(entry.type) === 'armchair'));
    const candidate = shallowOpposing
      || items.filter(entry => canDrop(entry) && (STORAGE.has(String(entry.type || '')) || String(entry.type) === 'armchair'))
        .sort((a, b) => depthOf(b) - depthOf(a))[0];
    if (!candidate) break;
    drop(candidate);
    section = crossSection(items);
  }

  const accepted = acceptedBy(section);
  const centralDropped = dropped.some(item => CENTRAL.has(String(item?.type || '')));
  const constraints = [];
  if (centralDropped) {
    constraints.push(`Use one compact side table instead of a central coffee or dining table: the ${width} m room leaves no 60 cm passage with a third piece.`);
  }
  if (!wide) {
    constraints.push(`With a ${width} m width, keep only two furniture pieces across the room and their total depth under 1.3 m.`);
  }
  for (const item of dropped.filter(entry => !CENTRAL.has(String(entry.type || '')))) {
    constraints.push(`Omit ${item.label || item.type}: the ${width} m room cannot fit it with a 60 cm passage.`);
  }
  if (!accepted) constraints.push(`The room is only ${width} m wide: keep fewer deep furniture pieces and a 60 cm passage.`);

  const replaceRu = value => String(value || '')
    .replace(/журнальн[а-яё]*\s+столик[а-яё]*/gi, 'компактный приставной столик')
    .replace(/обеденн[а-яё]*\s+стол[а-яё]*/gi, 'компактный приставной столик');
  const replaceEn = value => String(value || '')
    .replace(/a low dark stone table in front of it/gi, 'a compact side table')
    .replace(/\b(coffee|dining|stone|low dark stone) table\b/gi, 'compact side table');

  const nextPlan = centralDropped
    ? {
        ...plan,
        strategy: replaceRu(plan.strategy),
        zones: Array.isArray(plan.zones) ? plan.zones.map(zone => ({ ...zone, purpose: replaceRu(zone.purpose), position: replaceRu(zone.position) })) : plan.zones,
        circulation: replaceRu(plan.circulation),
        avoid: Array.isArray(plan.avoid) ? plan.avoid.map(replaceRu) : plan.avoid,
        items,
        constraints: [...(plan.constraints || []), ...constraints],
      }
    : { ...plan, items, constraints: [...(plan.constraints || []), ...constraints] };

  return {
    plan: nextPlan,
    artDirection: centralDropped ? replaceEn(artDirection) : artDirection,
    fit: {
      widthM: width,
      neededCm: Math.round(section.neededCm),
      opposingSumCm: Math.round(section.opposingSumCm),
      allowedPieces: wide ? 3 : 2,
      accepted,
      opposing: section.opposingItems.map(item => item.label || item.type),
      central: section.central?.label || null,
      dropped: dropped.map(item => item.label || item.type),
    },
    dropped,
  };
}
