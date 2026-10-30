const num = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const fmt = value => String(Math.round(value * 100) / 100);

export function bedWidthForRoom(width) {
  if (width < 2.2) return 140;
  if (width < 2.8) return 160;
  if (width < 3.4) return 180;
  return 200;
}

function bedroomPlan({ width, length, height, bedLength }) {
  const bedWidth = bedWidthForRoom(width);
  const lines = [`Bedroom: choose a ${bedWidth} cm wide bed for a ${fmt(width)} m wide room.`];
  if (bedLength) lines.push(`The bed's overall external length must be exactly ${fmt(bedLength)} m including the frame.`);
  if (width < 2.2) {
    lines.push('Keep the headboard on the longest solid wall, leave one 30–40 cm walkway, use wall-mounted bedside shelves instead of freestanding nightstands, and prefer under-bed storage over a floor wardrobe.');
  } else if (width < 2.8) {
    lines.push('Leave 40–60 cm walkable passages on both sides and use compact 40 cm nightstands; add a wardrobe only if it leaves at least 60 cm of passage.');
  } else {
    lines.push('Leave at least 60 cm on both sides and use two 40–45 cm nightstands; add storage only if it preserves a 60 cm path.');
  }
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

  if (/спальн|детск|bedroom/i.test(name)) {
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
