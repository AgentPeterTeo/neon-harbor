// Neon Harbor — the procedural city: a seeded grid of neon-lit blocks with a
// canal cutting east-west (vertical roads bridge over it), a guaranteed park,
// container docks on the east bank and the safehouse garage block in the west.
// Owns road drawing, building collision, the canal barrier and the minimap base.

import { PITCH, ROAD_W, NX, NY, WORLD_W, WORLD_H, WATER_ROW, PALETTE, makeRng } from './config.js';

const BASES = ['#1c2438', '#212c46', '#262043', '#1e2a35', '#2a2148', '#182334'];
const NEONS = [PALETTE.cyan, PALETTE.magenta, PALETTE.amber, PALETTE.violet, PALETTE.green];

// Fixed landmarks the mission chain points at.
export const DOCK_CELL = { i: NX - 1, j: WATER_ROW - 1 }; // east bank of the canal
export const SAFE_CELL = { i: 1, j: NY - 2 };             // west-side safehouse block

function cellRect(i, j) {
  return {
    x: i * PITCH + ROAD_W / 2,
    y: j * PITCH + ROAD_W / 2,
    w: PITCH - ROAD_W,
    h: PITCH - ROAD_W,
  };
}

export function createCity(seed) {
  const rng = makeRng(seed);
  const cells = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const r = cellRect(i, j);
      let kind = 'blocks';
      if (i === DOCK_CELL.i && j === DOCK_CELL.j) kind = 'docks';
      else if (i === SAFE_CELL.i && j === SAFE_CELL.j) kind = 'safe';
      const cell = { i, j, x: r.x, y: r.y, w: r.w, h: r.h, kind, items: [] };
      if (kind === 'blocks') fillBuildings(cell, rng, false);
      else if (kind === 'safe') fillBuildings(cell, rng, true);
      else if (kind === 'docks') fillDocks(cell, rng);
      else fillPark(cell, rng);
      cells.push(cell);
    }
  }
  // One guaranteed park so the skyline has breathing room somewhere mid-grid.
  const blocksCells = cells.filter((c) => c.kind === 'blocks');
  const park = blocksCells[Math.floor(rng() * blocksCells.length)];
  park.kind = 'park';
  park.items = [];
  fillPark(park, rng);

  // Street lamps: every other intersection, for the night bloom pass.
  const lamps = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      if ((i * 7 + j * 3) % 2 === 0) lamps.push({ x: i * PITCH, y: j * PITCH });
    }
  }
  // Neon bloom spots: one per signed building, so night can breathe light.
  const neonSpots = [];
  for (const c of cells) {
    for (const b of c.items) {
      if (b.neon) {
        neonSpots.push({
          x: b.x + b.w / 2, y: b.y + b.h / 2,
          color: b.neon, r: 30 + Math.max(b.w, b.h) * 0.45,
        });
      }
    }
  }
  return { seed, cells, lamps, neonSpots, docks: DOCK_CELL, safe: SAFE_CELL };
}

function fillBuildings(cell, rng, isSafe) {
  // Split the block into 1-2 x 1-2 buildings separated by thin alleys.
  const cols = rng() < 0.5 ? 2 : 1;
  const rows = rng() < 0.55 ? 2 : 1;
  const m = 9 + rng() * 6;
  const gap = 9 + rng() * 7;
  const cw = (cell.w - m * 2 - gap * (cols - 1)) / cols;
  const ch = (cell.h - m * 2 - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const b = {
        x: cell.x + m + c * (cw + gap),
        y: cell.y + m + r * (ch + gap),
        w: cw, h: ch,
        base: BASES[Math.floor(rng() * BASES.length)],
        seed: Math.floor(rng() * 97),
        neon: rng() < 0.42 ? NEONS[Math.floor(rng() * NEONS.length)] : null,
        sign: null,
      };
      if (isSafe && r === 0 && c === 0) {
        b.neon = PALETTE.amber;
        b.sign = 'SAFEHOUSE';
      } else if (b.neon && rng() < 0.5) {
        b.sign = b.neon;
      }
      cell.items.push(b);
    }
  }
}

function fillPark(cell, rng) {
  for (let k = 0; k < 9; k++) {
    cell.items.push({
      kind: 'tree',
      x: cell.x + 16 + rng() * (cell.w - 32),
      y: cell.y + 16 + rng() * (cell.h - 32),
      r: 7 + rng() * 6,
    });
  }
  cell.items.push({
    kind: 'pond',
    x: cell.x + cell.w / 2, y: cell.y + cell.h / 2,
    rx: 34 + rng() * 16, ry: 22 + rng() * 10,
  });
}

function fillDocks(cell, rng) {
  const cols = ['#31465e', '#5e3146', '#315546', '#5e5331'];
  for (let k = 0; k < 10; k++) {
    cell.items.push({
      kind: 'crate',
      x: cell.x + 12 + rng() * (cell.w - 40),
      y: cell.y + 12 + rng() * (cell.h - 40),
      color: cols[Math.floor(rng() * cols.length)],
      rot: rng() < 0.5,
    });
  }
  cell.items.push({ kind: 'crane', x: cell.x + cell.w / 2, y: cell.y + 26 });
}

// ---------------------------------------------------------------------------
// World painter. Everything is culled against the camera view rectangle.
// ---------------------------------------------------------------------------

export function drawCity(ctx, city, view, night, t) {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

  const cy0 = WATER_ROW * PITCH - ROAD_W / 2;
  const cy1 = cy0 + ROAD_W;
  const canalVis = view.y1 > cy0 && view.y0 < cy1;
  if (canalVis) drawCanal(ctx, view, cy0, cy1, t);

  // Horizontal roads (the canal row is water, not road).
  for (let j = 0; j <= NY; j++) {
    if (j === WATER_ROW) continue;
    const y = j * PITCH;
    if (y + ROAD_W / 2 < view.y0 || y - ROAD_W / 2 > view.y1) continue;
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(view.x0, y - ROAD_W / 2, view.x1 - view.x0, ROAD_W);
    ctx.strokeStyle = PALETTE.roadEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(view.x0, y - ROAD_W / 2 + 2);
    ctx.lineTo(view.x1, y - ROAD_W / 2 + 2);
    ctx.moveTo(view.x0, y + ROAD_W / 2 - 2);
    ctx.lineTo(view.x1, y + ROAD_W / 2 - 2);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([16, 20]);
    ctx.beginPath();
    for (let i = 0; i < NX; i++) {
      const xa = i * PITCH + ROAD_W / 2 + 6;
      const xb = (i + 1) * PITCH - ROAD_W / 2 - 6;
      if (xb < view.x0 || xa > view.x1) continue;
      ctx.moveTo(Math.max(xa, view.x0), y);
      ctx.lineTo(Math.min(xb, view.x1), y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Vertical roads — these bridge over the canal.
  for (let i = 0; i <= NX; i++) {
    const x = i * PITCH;
    if (x + ROAD_W / 2 < view.x0 || x - ROAD_W / 2 > view.x1) continue;
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(x - ROAD_W / 2, view.y0, ROAD_W, view.y1 - view.y0);
    ctx.strokeStyle = PALETTE.roadEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - ROAD_W / 2 + 2, view.y0);
    ctx.lineTo(x - ROAD_W / 2 + 2, view.y1);
    ctx.moveTo(x + ROAD_W / 2 - 2, view.y0);
    ctx.lineTo(x + ROAD_W / 2 - 2, view.y1);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([16, 20]);
    ctx.beginPath();
    for (let j = 0; j < NY; j++) {
      let ya = j * PITCH + ROAD_W / 2 + 6;
      let yb = (j + 1) * PITCH - ROAD_W / 2 - 6;
      if (j === WATER_ROW - 1) yb = cy0 - 6;   // bridge deck: no centre dashes
      if (j === WATER_ROW) ya = cy1 + 6;
      if (yb < view.y0 || ya > view.y1) continue;
      ctx.moveTo(x, Math.max(ya, view.y0));
      ctx.lineTo(x, Math.min(yb, view.y1));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Glowing bridge railings across the canal.
    if (canalVis) {
      ctx.strokeStyle = PALETTE.amber;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.35 + night * 0.45;
      if (night > 0.3) {
        ctx.shadowColor = PALETTE.amber;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.moveTo(x - ROAD_W / 2 + 5, cy0 + 4);
      ctx.lineTo(x - ROAD_W / 2 + 5, cy1 - 4);
      ctx.moveTo(x + ROAD_W / 2 - 5, cy0 + 4);
      ctx.lineTo(x + ROAD_W / 2 - 5, cy1 - 4);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // Blocks.
  for (const cell of city.cells) {
    if (cell.x + cell.w < view.x0 || cell.x > view.x1) continue;
    if (cell.y + cell.h < view.y0 || cell.y > view.y1) continue;
    drawCell(ctx, cell, night);
  }
}

function drawCanal(ctx, view, cy0, cy1, t) {
  const g = ctx.createLinearGradient(0, cy0, 0, cy1);
  g.addColorStop(0, '#0c2030');
  g.addColorStop(0.5, PALETTE.water);
  g.addColorStop(1, '#0c2030');
  ctx.fillStyle = g;
  ctx.fillRect(view.x0, cy0, view.x1 - view.x0, cy1 - cy0);
  // Slow cyan shimmer drifting east.
  ctx.strokeStyle = 'rgba(37,230,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const span = view.x1 - view.x0;
  for (let k = 0; k < 4; k++) {
    const y = cy0 + 16 + k * 19 + Math.sin(t * 1.4 + k * 2) * 2.5;
    for (let m = 0; m < 6; m++) {
      const sx = view.x0 + ((m * 180 + t * 24 + k * 60) % span);
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + 26, y);
    }
  }
  ctx.stroke();
}

function drawCell(ctx, cell, night) {
  if (cell.kind === 'park') {
    drawPark(ctx, cell, night);
    return;
  }
  if (cell.kind === 'docks') {
    drawDocks(ctx, cell, night);
    return;
  }
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  for (const b of cell.items) drawBuilding(ctx, b, night);
}

function drawBuilding(ctx, b, night) {
  // South-east drop shadow gives the flat roofs a hint of height.
  ctx.fillStyle = 'rgba(4,6,12,0.5)';
  ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
  ctx.fillStyle = b.base;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = 'rgba(130,150,200,0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);

  // Window grid — how many are lit scales with the night.
  const cols = Math.max(2, Math.floor((b.w - 14) / 13));
  const rows = Math.max(2, Math.floor((b.h - 14) / 13));
  const x0 = b.x + (b.w - (cols * 13 - 5)) / 2;
  const y0 = b.y + (b.h - (rows * 13 - 5)) / 2;
  const litChance = 0.18 + night * 0.72;
  const litColor = b.neon || '#9fd8ff';
  for (let wy = 0; wy < rows; wy++) {
    for (let wx = 0; wx < cols; wx++) {
      const lit = ((wx * 31 + wy * 17 + b.seed) % 100) / 100 < litChance;
      if (lit) {
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = litColor;
      } else {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#8fa8d8';
      }
      ctx.fillRect(x0 + wx * 13, y0 + wy * 13, 8, 8);
    }
  }
  ctx.globalAlpha = 1;

  // Roof neon strip + the safehouse label.
  if (b.sign) {
    ctx.fillStyle = b.sign === 'SAFEHOUSE' ? PALETTE.amber : b.sign;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10 + night * 10;
    ctx.fillRect(b.x + 8, b.y + 5, b.w - 16, 4);
    ctx.shadowBlur = 0;
    if (b.sign === 'SAFEHOUSE') {
      ctx.font = '700 9px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SAFEHOUSE', b.x + b.w / 2, b.y + 22);
    }
  }
}

function drawPark(ctx, cell, night) {
  ctx.fillStyle = PALETTE.park;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  for (const it of cell.items) {
    if (it.kind === 'pond') {
      ctx.fillStyle = PALETTE.water;
      ctx.beginPath();
      ctx.ellipse(it.x, it.y, it.rx, it.ry, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = `rgba(37,230,255,${0.25 + night * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#0b2013';
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#12351f';
      ctx.beginPath();
      ctx.arc(it.x - 1.5, it.y - 1.5, it.r * 0.62, 0, 7);
      ctx.fill();
      if (night > 0.4) {
        ctx.strokeStyle = 'rgba(57,255,136,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, 7);
        ctx.stroke();
      }
    }
  }
}

function drawDocks(ctx, cell, night) {
  ctx.fillStyle = PALETTE.dock;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  // Painted guide lanes toward the quay.
  ctx.strokeStyle = 'rgba(255,179,71,0.25)';
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 1; k < 4; k++) {
    const x = cell.x + (cell.w / 4) * k;
    ctx.moveTo(x, cell.y + 12);
    ctx.lineTo(x, cell.y + cell.h - 10);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const it of cell.items) {
    if (it.kind === 'crate') {
      ctx.save();
      ctx.translate(it.x, it.y);
      if (it.rot) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = it.color;
      ctx.fillRect(-11, -6, 22, 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(-11, -6, 22, 12);
      ctx.restore();
    } else {
      // Container crane silhouette with a night warning light.
      ctx.strokeStyle = '#4a5872';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(it.x - 34, it.y);
      ctx.lineTo(it.x + 34, it.y);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(it.x, it.y - 8);
      ctx.lineTo(it.x, it.y + 26);
      ctx.moveTo(it.x + 26, it.y);
      ctx.lineTo(it.x + 26, it.y + 14);
      ctx.stroke();
      ctx.fillStyle = '#4a5872';
      ctx.fillRect(it.x - 6, it.y - 10, 12, 10);
      if (night > 0.4) {
        ctx.fillStyle = PALETTE.red;
        ctx.fillRect(it.x - 2, it.y - 13, 4, 4);
      }
    }
  }
  // Bollards along the quay edge.
  ctx.fillStyle = '#39415c';
  for (let k = 0; k < 6; k++) {
    ctx.fillRect(cell.x + 10 + k * 33, cell.y + cell.h - 6, 5, 5);
  }
}

// ---------------------------------------------------------------------------
// Static collision: buildings + the canal water.
// ---------------------------------------------------------------------------

function cellAt(city, i, j) {
  if (i < 0 || i >= NX || j < 0 || j >= NY) return null;
  return city.cells[j * NX + i];
}

// Returns the smallest push-out for a circle of radius r at (x, y), or null.
// axis tells the caller which velocity component to soften on impact.
export function collideStatic(city, x, y, r) {
  // Canal: you can only be on the water if you're on a bridge deck.
  const cy0 = WATER_ROW * PITCH - ROAD_W / 2 + r;
  const cy1 = WATER_ROW * PITCH + ROAD_W / 2 - r;
  if (y > cy0 && y < cy1) {
    const line = Math.round(x / PITCH);
    const onBridge = line >= 0 && line <= NX && Math.abs(x - line * PITCH) <= ROAD_W / 2 - 6;
    if (!onBridge) {
      const pushY = y < WATER_ROW * PITCH ? cy0 - y : cy1 - y;
      return { pushX: 0, pushY, axis: 'y' };
    }
  }
  // Buildings in the 3x3 cells around the point.
  const ci = Math.floor(x / PITCH);
  const cj = Math.floor(y / PITCH);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const cell = cellAt(city, ci + di, cj + dj);
      if (!cell) continue;
      for (const b of cell.items) {
        if (x <= b.x - r || x >= b.x + b.w + r) continue;
        if (y <= b.y - r || y >= b.y + b.h + r) continue;
        const dxl = x - (b.x - r);
        const dxr = (b.x + b.w + r) - x;
        const dyt = y - (b.y - r);
        const dyb = (b.y + b.h + r) - y;
        const m = Math.min(dxl, dxr, dyt, dyb);
        if (m === dxl) return { pushX: -dxl, pushY: 0, axis: 'x' };
        if (m === dxr) return { pushX: dxr, pushY: 0, axis: 'x' };
        if (m === dyt) return { pushX: 0, pushY: -dyt, axis: 'y' };
        return { pushX: 0, pushY: dyb, axis: 'y' };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimap base (drawn once into an offscreen canvas by the HUD).
// ---------------------------------------------------------------------------

export function drawMinimapBase(ctx, city, w, h) {
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, 0, w, h);
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.fillStyle = '#12304a';
  ctx.fillRect(0, WATER_ROW * PITCH * sy - 2.5, w, 5);
  for (const cell of city.cells) {
    if (cell.kind === 'park') ctx.fillStyle = '#173a28';
    else if (cell.kind === 'docks') ctx.fillStyle = '#33314d';
    else if (cell.kind === 'safe') ctx.fillStyle = '#3d3218';
    else continue;
    ctx.fillRect(cell.x * sx, cell.y * sy, cell.w * sx, cell.h * sy);
  }
  ctx.strokeStyle = '#2b3a5e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= NX; i++) {
    ctx.moveTo(i * PITCH * sx, 0);
    ctx.lineTo(i * PITCH * sx, h);
  }
  for (let j = 0; j <= NY; j++) {
    if (j === WATER_ROW) continue;
    ctx.moveTo(0, j * PITCH * sy);
    ctx.lineTo(w, j * PITCH * sy);
  }
  ctx.stroke();
}
