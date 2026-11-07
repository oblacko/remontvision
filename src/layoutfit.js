// Детерминированная проверка расстановки ДО промта: мебель должна влезать.
// Не доверяем арифметике LLM — считаем сами по size_cm.

const FLOORLESS = new Set(['rug', 'light', 'decor', 'decor_art', 'plant', 'mirror', 'curtain', 'textile']);
const CENTRAL = new Set(['coffee_table', 'dining_table']);
const STORAGE = new Set(['storage', 'sideboard', 'cabinet', 'wardrobe', 'desk', 'office_chair', 'dining_chair', 'bench']);

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
  return {
    neededCm: opposing.reduce((sum, entry) => sum + entry.depth, 0) + centralDepth + 60,
    opposing: opposing.map(entry => entry.item.label || entry.item.type),
    central: central?.label || null,
  };
};

export function fitLayoutPlan({ plan, dimensions, roomType = '', artDirection = '' } = {}) {
  const width = Number(dimensions?.width);
  if (!plan?.items?.length || !Number.isFinite(width) || width <= 0) {
    return { plan, fit: null, dropped: [] };
  }
  const widthCm = Math.round(width * 100);
  const items = [...plan.items];
  const dropped = [];
  const drop = item => {
    const index = items.indexOf(item);
    if (index >= 0) { items.splice(index, 1); dropped.push(item); }
  };

  // В узкой гостиной центральный стол не ставим в принципе (проход важнее).
  const narrowLiving = /гостин|зал|living/i.test(String(roomType)) && width < 3.0;
  if (narrowLiving) {
    for (const item of items.filter(entry => CENTRAL.has(String(entry.type || '')))) drop(item);
  }

  let section = crossSection(items);
  if (section.neededCm > widthCm) {
    for (const item of items.filter(entry => CENTRAL.has(String(entry.type || '')))) {
      drop(item);
      section = crossSection(items);
      if (section.neededCm <= widthCm) break;
    }
  }

  if (section.neededCm > widthCm) {
    const candidates = items
      .filter(item => STORAGE.has(String(item?.type || '')))
      .sort((a, b) => depthOf(b) - depthOf(a));
    for (const item of candidates) {
      drop(item);
      section = crossSection(items);
      if (section.neededCm <= widthCm) break;
    }
  }

  const accepted = section.neededCm <= widthCm;
  const constraints = dropped.map(item => CENTRAL.has(String(item?.type || ''))
    ? `Use one compact side table instead of a central ${item.type === 'dining_table' ? 'dining' : 'coffee'} table: the ${width} m room width leaves no 60 cm passage with it.`
    : `Omit ${item.label || item.type}: the ${width} m room width cannot fit it together with a 60 cm passage.`);
  if (!accepted) constraints.push(`The room is only ${width} m wide: keep at most one deep furniture piece and a 60 cm passage.`);

  const centralDropped = dropped.some(item => CENTRAL.has(String(item?.type || '')));
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
      accepted,
      opposing: section.opposing,
      central: section.central,
      dropped: dropped.map(item => item.label || item.type),
    },
    dropped,
  };
}
