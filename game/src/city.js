// Neon Harbor — the procedural city. One seeded LCG lays out every block,
// window, tree and lamp; nothing here uses Math.random, so a seed always
// rebuilds the same harbor. The east column is open water with a cargo pier
// and a bridge road; two blocks inland are parks.
import {
  TILE, ROAD, GRID, WORLD, LANE, C,
  WATER_COL, PIER_ROW, BRIDGE_ROW, PIER_DECK,
} from './config.js';

/** Deterministic RNG (LCG). Every random roll in the game goes through one. */
export function makeRand(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ACCENTS = [C.cyan, C.magenta, C.amber, C.blue, C.purple, C.green];
const PARKS = [[2, 8], [6, 3], [9, 9]]; // cell coords of the green blocks

export function createCity(seed) {
  const rand = makeRand((seed ^ 0x51ed) >>> 0);
  const cells = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) cells.push(makeCell(i, j, rand));
  }
  return { seed, cells };
}

function makeCell(i, j, rand) {
  const x = i * TILE, y = j * TILE;
  const cell = { i, j, x, y };
  if (i === WATER_COL) {
    cell.type = 'water';
    cell.wavePhase = rand() * 6.283;
  } else if (PARKS.some(([pi, pj]) => pi === i && pj === j)) {
    cell.type = 'park';
    cell.trees = [];
    const n = 5 + ((rand() * 5) | 0);
    for (let k = 0; k < n; k++) {
      cell.trees.push({
        x: x + ROAD + 26 + rand() * (TILE - ROAD - 52),
        y: y + ROAD + 26 + rand() * (TILE - ROAD - 52),
        r: 9 + rand() * 9,
      });
    }
    cell.pond = {
      x: x + ROAD + 150 + rand() * 60,
      y: y + ROAD + 150 + rand() * 60,
      rx: 34 + rand() * 22,
      ry: 24 + rand() * 14,
    };
  } else {
    cell.type = 'building';
    const inset = 16 + rand() * 12; // sidewalk margin around the block
    cell.x0 = x + ROAD + inset;
    cell.y0 = y + ROAD + inset;
    cell.x1 = x + TILE - inset;
    cell.y1 = y + TILE - inset;
    cell.accent = ACCENTS[(rand() * ACCENTS.length) | 0];
    cell.tall = rand() < 0.4;
    const hue = 0.85 + rand() * 0.55; // body lightness
    cell.bodyA = shade('#0e1526', hue);
    cell.bodyB = shade('#1a2742', hue);
    cell.winCols = 5 + ((rand() * 5) | 0);
    cell.winRows = 4 + ((rand() * 4) | 0);
    cell.lit = [];
    const n = cell.winCols * cell.winRows;
    for (let k = 0; k < n; k++) cell.lit.push(rand() < 0.58 ? (rand() < 0.28 ? 2 : 1) : 0);
    cell.sign = rand() < 0.5 ? ((rand() * 4) | 0) : -1; // neon sign edge
  }
  return cell;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * f) | 0;
  const b = Math.min(255, (n & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}

export function cellAt(city, x, y) {
  if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return null;
  return city.cells[((y / TILE) | 0) * GRID + ((x / TILE) | 0)];
}

/** Fixed (lateral) coordinate of a lane. Right-hand traffic. */
export function laneFixed(axis, line, sgn) {
  const c = line * TILE + ROAD / 2;
  return axis === 'h' ? c + sgn * LANE : c - sgn * LANE;
}

/** A random drivable lane point within a ring around (cx, cy), or null. */
export function roadPoint(rand, cx, cy, rMin, rMax) {
  for (let tries = 0; tries < 24; tries++) {
    if (rand() < 0.5) {
      const line = 1 + ((rand() * (GRID - 2)) | 0); // vertical roads: cols 1..10
      const sgn = rand() < 0.5 ? 1 : -1;
      const u = cy + (rMin + rand() * (rMax - rMin)) * (rand() < 0.5 ? 1 : -1);
      if (u < ROAD || u > WORLD - ROAD) continue;
      return { axis: 'v', line, sgn, u, v: laneFixed('v', line, sgn), x: laneFixed('v', line, sgn), y: u };
    }
    const line = ((rand() * GRID) | 0); // horizontal roads: rows 0..11
    const sgn = rand() < 0.5 ? 1 : -1;
    const uMax = (line === PIER_ROW || line === BRIDGE_ROW) ? WORLD - ROAD : (GRID - 1) * TILE - ROAD;
    const u = cx + (rMin + rand() * (rMax - rMin)) * (rand() < 0.5 ? 1 : -1);
    if (u < ROAD || u > uMax) continue;
    return { axis: 'h', line, sgn, u, v: laneFixed('h', line, sgn), x: u, y: laneFixed('h', line, sgn) };
  }
  return null;
}

function inPier(x, y) {
  return x >= PIER_DECK.x0 && x <= PIER_DECK.x1 && y >= PIER_DECK.y0 && y <= PIER_DECK.y1;
}
function inBridge(y) {
  return y >= BRIDGE_ROW * TILE && y <= BRIDGE_ROW * TILE + ROAD;
}

function circleVsRect(x, y, r, x0, y0, x1, y1) {
  const cx = Math.max(x0, Math.min(x1, x));
  const cy = Math.max(y0, Math.min(y1, y));
  const dx = x - cx, dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  const left = x - x0, right = x1 - x, top = y - y0, bottom = y1 - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: r + left };
  if (m === right) return { nx: 1, ny: 0, depth: r + right };
  if (m === top) return { nx: 0, ny: -1, depth: r + top };
  return { nx: 0, ny: 1, depth: r + bottom };
}

/** Where a collision circle rests against the world: a push-out vector or null. */
export function blockedCircle(city, x, y, r) {
  if (x < r) return { nx: 1, ny: 0, depth: r - x };
  if (y < r) return { nx: 0, ny: 1, depth: r - y };
  if (x > WORLD - r) return { nx: -1, ny: 0, depth: x - (WORLD - r) };
  if (y > WORLD - r) return { nx: 0, ny: -1, depth: y - (WORLD - r) };
  const cell = cellAt(city, x, y);
  if (cell === null) return null;
  if (cell.type === 'building') return circleVsRect(x, y, r, cell.x0, cell.y0, cell.x1, cell.y1);
  if (cell.type === 'water') {
    if (inPier(x, y) || inBridge(y)) return null;
    return circleVsRect(x, y, r, cell.x, cell.y, cell.x + TILE, cell.y + TILE);
  }
  return null; // parks are drivable, the trees are decoration
}

function cellRange(view) {
  return {
    i0: Math.max(0, (view.x0 / TILE) | 0),
    i1: Math.min(GRID - 1, (view.x1 / TILE) | 0),
    j0: Math.max(0, (view.y0 / TILE) | 0),
    j1: Math.min(GRID - 1, (view.y1 / TILE) | 0),
  };
}

/** The world layer: asphalt, markings, blocks, parks, water, pier and bridge. */
export function drawCity(ctx, city, view, phase, t) {
  const night = phase.night;
  ctx.fillStyle = C.road;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

  // dashed centrelines
  ctx.strokeStyle = C.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 30]);
  ctx.beginPath();
  for (let ki = Math.max(0, (view.x0 / TILE) | 0); ki <= Math.min(GRID - 2, (view.x1 / TILE) | 0); ki++) {
    const x = ki * TILE + ROAD / 2;
    ctx.moveTo(x, view.y0);
    ctx.lineTo(x, view.y1);
  }
  for (let kj = Math.max(0, (view.y0 / TILE) | 0); kj <= Math.min(GRID - 1, (view.y1 / TILE) | 0); kj++) {
    const y = kj * TILE + ROAD / 2;
    ctx.moveTo(view.x0, y);
    ctx.lineTo(view.x1, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const { i0, i1, j0, j1 } = cellRange(view);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) drawCell(ctx, city.cells[j * GRID + i], night, t);
  }
}

function drawCell(ctx, cell, night, t) {
  const { x, y } = cell;
  if (cell.type === 'water') {
    ctx.fillStyle = C.water;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = 'rgba(23, 80, 144, 0.4)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const wy = y + ((t * 16 + k * 84 + cell.wavePhase * 60) % TILE);
      ctx.beginPath();
      for (let wx = x; wx <= x + TILE; wx += 40) {
        const dy = Math.sin((wx + t * 34) / 74 + cell.wavePhase + k) * 4;
        if (wx === x) ctx.moveTo(wx, wy + dy);
        else ctx.lineTo(wx, wy + dy);
      }
      ctx.stroke();
    }
    return;
  }
  if (cell.type === 'park') {
    ctx.fillStyle = C.sidewalk;
    ctx.fillRect(x + ROAD - 16, y + ROAD - 16, TILE - ROAD + 32, TILE - ROAD + 32);
    ctx.fillStyle = C.park;
    ctx.fillRect(x + ROAD, y + ROAD, TILE - ROAD, TILE - ROAD);
    // pond
    ctx.fillStyle = C.water;
    ctx.beginPath();
    ctx.ellipse(cell.pond.x, cell.pond.y, cell.pond.rx, cell.pond.ry, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = 'rgba(23, 80, 144, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // trees
    for (const tr of cell.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(tr.x + 3, tr.y + 4, tr.r, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#123c22';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#1d5c33';
      ctx.beginPath();
      ctx.arc(tr.x - tr.r * 0.25, tr.y - tr.r * 0.25, tr.r * 0.55, 0, 6.283);
      ctx.fill();
    }
    return;
  }

  // building block
  const w = cell.x1 - cell.x0, h = cell.y1 - cell.y0;
  ctx.fillStyle = C.sidewalk;
  ctx.fillRect(cell.x0 - 14, cell.y0 - 14, w + 28, h + 28);
  const g = ctx.createLinearGradient(cell.x0, cell.y0, cell.x1, cell.y1);
  g.addColorStop(0, cell.bodyA);
  g.addColorStop(1, cell.bodyB);
  ctx.fillStyle = g;
  ctx.fillRect(cell.x0, cell.y0, w, h);
  if (cell.tall) { // second tier of the tower
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(cell.x0 + 26, cell.y0 + 26, w - 52, h - 52);
    ctx.strokeStyle = cell.accent;
    ctx.globalAlpha = 0.35 + night * 0.5;
    ctx.lineWidth = 2;
    ctx.strokeRect(cell.x0 + 26, cell.y0 + 26, w - 52, h - 52);
    ctx.globalAlpha = 1;
  }
  // windows (dim glass; the lights pass makes the lit ones glow at night)
  const wx0 = cell.x0 + 16, wy0 = cell.y0 + 16;
  const gx = (w - 32) / (cell.winCols - 1), gy = (h - 32) / (cell.winRows - 1);
  for (let r = 0; r < cell.winRows; r++) {
    for (let c = 0; c < cell.winCols; c++) {
      ctx.fillStyle = cell.lit[r * cell.winCols + c] && night > 0.4 ? '#3c4f7d' : '#1a2340';
      ctx.fillRect(wx0 + c * gx - 3, wy0 + r * gy - 4.5, 6, 9);
    }
  }
  // neon roof trim
  ctx.strokeStyle = cell.accent;
  ctx.globalAlpha = 0.4 + night * 0.6;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cell.x0 + 2, cell.y0 + 1);
  ctx.lineTo(cell.x1 - 2, cell.y0 + 1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // a neon sign strip on one edge
  if (cell.sign >= 0) {
    ctx.fillStyle = cell.accent;
    ctx.globalAlpha = 0.55 + night * 0.45;
    if (cell.sign === 0) ctx.fillRect(cell.x0, cell.y0 + 8, 4, 64);
    if (cell.sign === 1) ctx.fillRect(cell.x1 - 4, cell.y0 + 8, 4, 64);
    if (cell.sign === 2) ctx.fillRect(cell.x0 + 8, cell.y0, 64, 4);
    if (cell.sign === 3) ctx.fillRect(cell.x0 + 8, cell.y1 - 4, 64, 4);
    ctx.globalAlpha = 1;
  }
}

/** Harbor furniture drawn over the water: the pier deck and the bridge road. */
export function drawHarbor(ctx, view, phase, t) {
  const night = phase.night;
  const rows = [PIER_ROW, BRIDGE_ROW];
  for (const row of rows) {
    const y = row * TILE;
    if (y + ROAD < view.y0 || y > view.y1 || WATER_COL * TILE > view.x1 || WORLD < view.x0) continue;
    const isPier = row === PIER_ROW;
    ctx.fillStyle = isPier ? '#1c2336' : C.road;
    ctx.fillRect(WATER_COL * TILE, y, WORLD - WATER_COL * TILE, ROAD);
    // edge railings with lamp posts
    ctx.strokeStyle = 'rgba(255, 180, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WATER_COL * TILE, y + 3);
    ctx.lineTo(WORLD, y + 3);
    ctx.moveTo(WATER_COL * TILE, y + ROAD - 3);
    ctx.lineTo(WORLD, y + ROAD - 3);
    ctx.stroke();
    ctx.fillStyle = C.amber;
    for (let lx = WATER_COL * TILE + 40; lx < WORLD - 30; lx += 96) {
      ctx.fillRect(lx - 2, y + 5, 4, 4);
      ctx.fillRect(lx - 2, y + ROAD - 9, 4, 4);
    }
    if (isPier) {
      // container stacks near the drop point
      const cs = [
        [WORLD - 560, y + 14, C.magenta], [WORLD - 560 + 46, y + 14, C.blue],
        [WORLD - 560 + 92, y + 14, C.cyan], [WORLD - 560 + 23, y + 46, C.purple],
        [WORLD - 620, y + 40, C.green],
      ];
      for (const [cx2, cy2, col] of cs) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(cx2 + 3, cy2 + 4, 40, 22);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(cx2, cy2, 40, 22);
        ctx.globalAlpha = 0.28 + night * 0.3;
        ctx.strokeStyle = '#e8f4ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx2, cy2, 40, 22);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/** The additive pass at night: lit windows, signs, lamps over the water. */
export function drawCityLights(ctx, city, view, phase, t) {
  const night = phase.night;
  if (night < 0.12) return;
  const { i0, i1, j0, j1 } = cellRange(view);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cell = city.cells[j * GRID + i];
      if (cell.type !== 'building') continue;
      const w = cell.x1 - cell.x0, h = cell.y1 - cell.y0;
      const wx0 = cell.x0 + 16, wy0 = cell.y0 + 16;
      const gx = (w - 32) / (cell.winCols - 1), gy = (h - 32) / (cell.winRows - 1);
      for (let r = 0; r < cell.winRows; r++) {
        for (let c = 0; c < cell.winCols; c++) {
          const lit = cell.lit[r * cell.winCols + c];
          if (!lit) continue;
          ctx.fillStyle = lit === 2 ? 'rgba(154, 220, 255, 0.75)' : 'rgba(255, 217, 160, 0.8)';
          ctx.fillRect(wx0 + c * gx - 3, wy0 + r * gy - 4.5, 6, 9);
        }
      }
      if (cell.sign >= 0) {
        ctx.shadowColor = cell.accent;
        ctx.shadowBlur = 14;
        ctx.fillStyle = cell.accent;
        if (cell.sign === 0) ctx.fillRect(cell.x0 - 2, cell.y0 + 8, 5, 64);
        if (cell.sign === 1) ctx.fillRect(cell.x1 - 3, cell.y0 + 8, 5, 64);
        if (cell.sign === 2) ctx.fillRect(cell.x0 + 8, cell.y0 - 2, 64, 5);
        if (cell.sign === 3) ctx.fillRect(cell.x0 + 8, cell.y1 - 3, 64, 5);
        ctx.shadowBlur = 0;
      }
    }
  }
  // lamps along pier and bridge
  ctx.fillStyle = `rgba(255, 180, 0, ${0.16 * night})`;
  for (const row of [PIER_ROW, BRIDGE_ROW]) {
    const y = row * TILE;
    if (y + ROAD < view.y0 || y > view.y1 || WATER_COL * TILE > view.x1 || WORLD < view.x0) continue;
    for (let lx = WATER_COL * TILE + 40; lx < WORLD - 30; lx += 96) {
      ctx.beginPath();
      ctx.arc(lx, y + 7, 10, 0, 6.283);
      ctx.arc(lx, y + ROAD - 7, 10, 0, 6.283);
      ctx.fill();
    }
  }
}
