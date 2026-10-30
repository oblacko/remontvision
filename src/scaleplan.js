const num = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const fmt = value => String(Math.round(value * 100) / 100);

export function bedWidthForRoom(width) {
  if (width < 2.2) return 140;
  if (width < 3.4) return 160;
  if (width < 3.8) return 180;
  return 200;
}

export function childBedWidthForRoom(width) {
  if (width < 2.4) return 90;
  if (width < 3.2) return 120;
  return 140;
}

function bedroomPlan({ width, length, height, bedLength, child = false }) {
  const bedWidth = child ? childBedWidthForRoom(width) : bedWidthForRoom(width);
  const side = (width - bedWidth / 100) / 2;
  const lines = [`${child ? "Children's room" : 'Bedroom'}: choose a ${bedWidth} cm wide bed for a ${fmt(width)} m wide room.`];
  if (bedLength) lines.push(`The bed's overall external length must be exactly ${fmt(bedLength)} m including the frame.`);
  if (side < 0.5) {
    lines.push('Tight sides: use wall-mounted bedside shelves instead of freestanding nightstands, leave one 30–40 cm walkway, and prefer under-bed storage over a floor wardrobe.');
  } else if (side < 0.75) {
    lines.push('Use compact 30–40 cm nightstands or wall-mounted shelves and keep at least 30 cm of clear passage on both sides; add a wardrobe only if it leaves a 60 cm path.');
  } else if (side < 1.0) {
    lines.push('Use two 40 cm nightstands and keep at least 40 cm of clear passage on both sides; add storage only if it preserves a 60 cm path.');
  } else {
    lines.push('Use two 40–45 cm nightstands and keep generous passages on both sides; add storage only if it preserves a 60 cm path.');
  }
  if (child) lines.push('Use a single or small double bed (90–140 cm), never a king-size bed; keep a clear play zone and child-height storage.');
  if (bedLength && length < bedLength + 1.2) {
    lines.push('Omit a bench or storage at the foot of the bed and keep at least 60 cm between the bed foot and the opposite wall or door.');
  } else if (bedLength) {
    lines.push('A slim bench at the foot is allowed only if it leaves at least 60 cm of circulation.');
  }
  if (height < 2.6) lines.push('Low ceiling: omit pendants over the bed and circulation, use low-profile furniture and avoid floor-to-ceiling cabinetry.');
  return lines.join(' ');
}

function livingPlan({ width, height }) {
  const lines = [];
  if (width < 2.8) {
    lines.push('Living room: sofa no wider than 200 cm, at most one compact armchair or a pouf, and a narrow coffee table no larger than 90 × 50 cm.');
  } else if (width < 3.6) {
    lines.push('Living room: sofa 220–240 cm plus one armchair, a coffee table with a 35–45 cm gap, and a rug that anchors the seating zone.');
  } else if (width < 4.5) {
    lines.push('Living room: sofa plus two armchairs, a full-size coffee table, a floor lamp and a generous rug.');
  } else {
    lines.push('Living room: use the width for clear seating and dining zones; a rug and separate lighting layers may divide the space without blocking the window or door.');
  }
  lines.push('Keep a minimum 60 cm circulation path and a 35–45 cm gap between sofa and coffee table.');
  if (height < 2.6) lines.push('Low ceiling: no pendant over circulation, no oversized shelving, no floor-to-ceiling cabinetry, and keep the ceiling plane unaltered.');
  return lines.join(' ');
}

function kitchenPlan({ width, length, height }) {
  const area = width * length;
  let line;
  if (area < 6) {
    line = 'Kitchen under 6 m²: single linear run along one wall, 60 cm deep, at least 90 cm clear passage, no island, compact folding table only.';
  } else if (area < 10) {
    line = 'Kitchen 6–10 m²: L-shaped run; an island is allowed only with at least 100 cm passage, maximum 180 × 60 cm.';
  } else if (area < 16) {
    line = 'Kitchen 10–16 m²: U-shape or a 200 × 90 cm island; bar stools only with at least 90 cm behind them.';
  } else {
    line = 'Kitchen over 16 m²: island plus dining table, separate lighting layers over each zone, at least 100 cm main paths.';
  }
  if (height < 2.6) line += ' Low ceiling: no pendant over the main path and no floor-to-ceiling tall cabinets.';
  return line;
}

function diningPlan({ width, length }) {
  const tableWidth = Math.max(80, Math.min(180, Math.round((width - 1.2) * 100)));
  return `Dining room: table no wider than ${tableWidth} cm, at least 90 cm behind a pulled-out chair, and a sideboard no deeper than 45 cm only if it preserves the 60 cm path.`;
}

function officePlan({ width, height }) {
  const lines = [`Office: desk 60–70 cm deep and no wider than ${fmt(Math.max(100, width * 100 - 120))} cm, with at least 90 cm behind the chair.`];
  lines.push('Use shallow 40 cm storage and keep the window and door clear.');
  if (height < 2.6) lines.push('Low ceiling: no pendant over the desk; use a desk or floor lamp instead.');
  return lines.join(' ');
}

function bathroomPlan() {
  return 'Bathroom: keep at least 60 cm clear in front of every fixture, avoid an oversized vanity, and preserve access to plumbing and ventilation.';
}

function hallwayPlan({ width }) {
  if (width < 1.6) return 'Narrow hallway: furniture deeper than 35 cm is forbidden, keep one clear 60 cm path, and prefer wall-mounted storage, a slim bench and a shallow console.';
  return 'Hallway: keep a 60 cm clear path, use shallow storage and do not block the door swing or radiator.';
}

function balconyPlan() {
  return 'Balcony or loggia: use only shallow, lightweight furniture, keep the door and window fully operable, and do not block ventilation or drainage.';
}

function genericPlan({ width, height }) {
  const lines = ['Keep at least 60 cm clear circulation, 80 cm where comfortable, and preserve the door swing, window access and heating controls.'];
  if (width < 2.2) lines.push('Narrow room: use wall-mounted or shallow storage, avoid bulky freestanding pieces and keep one clear path.');
  if (height < 2.6) lines.push('Low ceiling: no pendant over circulation, no floor-to-ceiling cabinetry and low-profile furniture.');
  return lines.join(' ');
}

export function buildScalePlan({ roomType = '', width, length, height, bedLength } = {}) {
  const w = num(width);
  const l = num(length);
  const h = num(height);
  if (!w || !l || !h) return '';
  const b = num(bedLength);
  const name = String(roomType || '');
  const lines = [
    `Scale reality: the room is ${fmt(w)} m wide, ${fmt(l)} m long and ${fmt(h)} m high, measured inside the finished surfaces.`,
    'Minimum clear circulation is 60 cm; 80 cm is comfortable. Keep door swings, windows, heating controls and ventilation clear.',
  ];

  if (/детск|child/i.test(name)) {
    lines.push(bedroomPlan({ width: w, length: l, height: h, bedLength: b, child: true }));
  } else if (/спальн|bedroom/i.test(name)) {
    lines.push(bedroomPlan({ width: w, length: l, height: h, bedLength: b }));
  } else if (/гостин|зал|living/i.test(name)) {
    lines.push(livingPlan({ width: w, height: h }));
  } else if (/кухн|kitchen/i.test(name)) {
    lines.push(kitchenPlan({ width: w, length: l, height: h }));
  } else if (/столов|dining/i.test(name)) {
    lines.push(diningPlan({ width: w, length: l }));
  } else if (/кабинет|office|desk/i.test(name)) {
    lines.push(officePlan({ width: w, height: h }));
  } else if (/санузел|ванн|bath/i.test(name)) {
    lines.push(bathroomPlan());
  } else if (/прихож|коридор|hall|corridor/i.test(name)) {
    lines.push(hallwayPlan({ width: w }));
  } else if (/балкон|лоджи|balcony/i.test(name)) {
    lines.push(balconyPlan());
  } else {
    lines.push(genericPlan({ width: w, height: h }));
  }

  if (w / l < 0.4 || l / w > 2.5) {
    lines.push('Long narrow room: use furniture and a rug to define zones, keep the central path clear and avoid placing storage across the room width.');
  }
  lines.push('Do not overscale furniture, do not shrink it unnaturally and do not change the room dimensions to make the plan fit. If the requested layout is impossible, choose smaller furniture and show the honest compromise.');
  return lines.join('\n');
}

// Детерминированная проверка текстового плана арт-директора.
// Модель часто пишет «80 см проход», хотя арифметика даёт 40–50 см.
export function layoutCorrection(items = [], dimensions = null, { bedType = '' } = {}) {
  const widthCm = Number(dimensions?.width) * 100;
  const lengthCm = Number(dimensions?.length) * 100;
  if (!widthCm || !Array.isArray(items) || !items.length) return '';
  const bed = items.find(item => /bed|кровать/i.test(item.type || ''));
  if (!bed) return '';
  const notes = [];
  const bedWidth = Number(bed.widthCm) || 0;
  const bedDepth = Number(bed.depthCm) || 0;
  const bedPosition = String(bed.position || '').toLowerCase();
  const againstBack = /back wall|задн|centered|по центру/i.test(bedPosition);
  const againstSide = /left wall|right wall|боков/i.test(bedPosition);

  if (bedWidth && againstBack) {
    const side = Math.round((widthCm - bedWidth) / 2);
    if (side < 60) {
      const maxBed = bedType === 'single' ? 120 : Math.max(90, Math.floor((widthCm - 120) / 10) * 10);
      const target = Math.min(bedWidth, maxBed);
      notes.push(`Bed ${bedWidth} cm against the back wall leaves only ${side} cm per side (<60 cm). Use a ${target} cm ${bedType === 'single' ? 'single' : 'small double'} bed so each side keeps at least 60 cm.`);
    }
  } else if (bedWidth && againstSide) {
    const side = Math.round(widthCm - bedWidth);
    if (side < 60) {
      const target = Math.max(90, Math.floor((widthCm - 60) / 10) * 10);
      notes.push(`Bed ${bedWidth} cm against the side wall leaves only ${side} cm on the other side (<60 cm). Use a ${target} cm bed or move the bed.`);
    }
  }

  const storage = items.find(item => /wardrobe|storage|closet|шкаф|хран/i.test(item.type || ''));
  if (storage) {
    const storageWidth = Number(storage.widthCm) || 0;
    const storageDepth = Number(storage.depthCm) || 0;
    const storagePosition = String(storage.position || '').toLowerCase();
    if (lengthCm && /left wall|right wall|боков/i.test(storagePosition) && bedDepth && storageWidth && bedDepth + storageWidth + 60 > lengthCm) {
      notes.push(`Wardrobe ${storageWidth} cm on the side wall + bed length ${bedDepth} cm + 60 cm path needs ${bedDepth + storageWidth + 60} cm, but the room is ${Math.round(lengthCm)} cm long. Shrink or remove the wardrobe.`);
    }
    if (/back wall|задн/i.test(storagePosition) && storageWidth && bedWidth && bedWidth + storageWidth + 120 > widthCm) {
      notes.push(`Wardrobe ${storageWidth} cm on the back wall + bed ${bedWidth} cm + side clearances needs ${bedWidth + storageWidth + 120} cm, but the room is ${Math.round(widthCm)} cm wide. Move the wardrobe to a side wall or remove it.`);
    }
    if (/opposite|напротив/i.test(storagePosition) && storageDepth && bedWidth && storageDepth + bedWidth + 60 > widthCm) {
      notes.push(`Wardrobe ${storageDepth} cm deep opposite the bed + bed ${bedWidth} cm + 60 cm path needs ${storageDepth + bedWidth + 60} cm, but the room is ${Math.round(widthCm)} cm wide. Remove or shrink the wardrobe.`);
    }
  }

  const opposite = items.find(item => item !== bed
    && /storage|wardrobe|desk|sideboard|console|шкаф|стол|комод/i.test(item.type || '')
    && /opposite|напротив/i.test(String(item.position || '').toLowerCase()));
  if (opposite) {
    const depth = Number(opposite.depthCm) || 0;
    const walkway = Math.round(widthCm - bedWidth - depth);
    if (walkway < 60) notes.push(`Bed ${bedWidth} cm + opposite ${opposite.type} ${depth} cm leaves only ${walkway} cm (<60 cm). Remove or shrink the opposite item, or reduce the bed.`);
  }

  return notes.length ? `LAYOUT CORRECTION — ${notes.join(' ')}` : '';
}
