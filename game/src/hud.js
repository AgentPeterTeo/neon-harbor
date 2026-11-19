// Neon Harbor — the dashboard: cash, hull, speed, clock, wanted stars, the
// contract line, toasts, and the corner minimap with everything that matters.
import { W, H, GRID, TILE, ROAD, WORLD, WATER_COL, PIER_ROW, BRIDGE_ROW, C, KMH } from './config.js';
import { clockString } from './daynight.js';

const TAU = Math.PI * 2;
const MM = 168; // minimap size, px
const MM_SCALE = MM / WORLD;

export function buildMinimap(city) {
  const c = document.createElement('canvas');
  c.width = MM;
  c.height = MM;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2238'; // road base
  g.fillRect(0, 0, MM, MM);
  const s = TILE * MM_SCALE;
  const rs = ROAD * MM_SCALE;
  for (const cell of city.cells) {
    const x = cell.i * s;
    const y = cell.j * s;
    if (cell.type === 'water') {
      g.fillStyle = '#0e2c52';
      g.fillRect(x, y, s, s);
    } else if (cell.type === 'park') {
      g.fillStyle = '#123c22';
      g.fillRect(x + rs, y + rs, s - rs, s - rs);
    } else {
      g.fillStyle = '#161e33';
      g.fillRect(x + rs, y + rs, s - rs, s - rs);
    }
  }
  // pier + bridge glow in amber on the water
  g.fillStyle = 'rgba(255,180,0,0.55)';
  g.fillRect(WATER_COL * s, PIER_ROW * s, WORLD * MM_SCALE - WATER_COL * s, rs);
  g.fillRect(WATER_COL * s, BRIDGE_ROW * s, WORLD * MM_SCALE - WATER_COL * s, rs);
  return c;
}

function panel(ctx, x, y, w, h, stroke) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,10,20,0.72)';
  ctx.beginPath();
  ctx.moveTo(x + 10, y);
  ctx.arcTo(x + w, y, x + w, y + h, 10);
  ctx.arcTo(x + w, y + h, x, y + h, 10);
  ctx.arcTo(x, y + h, x, y, 10);
  ctx.arcTo(x, y, x + w, y, 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = stroke || 'rgba(0,240,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawHUD(ctx, game, phase) {
  const t = game.time;
  const p = game.player;
  ctx.textBaseline = 'alphabetic';

  // top-left: cash + hull
  panel(ctx, 14, 12, 196, 58);
  ctx.font = '700 21px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.green;
  ctx.shadowColor = C.green;
  ctx.shadowBlur = 8;
  ctx.fillText(`$ ${game.cash.toLocaleString('en-US')}`, 28, 36);
  ctx.shadowBlur = 0;
  ctx.font = '700 11px Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,244,255,0.75)';
  ctx.fillText('HULL', 28, 57);
  const hull = Math.max(0, p.hull);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(64, 48, 124, 9);
  ctx.fillStyle = hull > 50 ? C.green : hull > 25 ? C.amber : C.red;
  ctx.fillRect(64, 48, 124 * hull / 100, 9);

  // top-center: contract line
  const line = game.missions.hudLine();
  if (line) {
    ctx.font = '700 15px Arial, sans-serif';
    const w2 = ctx.measureText(line).width + 36;
    panel(ctx, W / 2 - w2 / 2, 12, w2, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.white;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 10;
    ctx.fillText(line, W / 2, 34);
    ctx.shadowBlur = 0;
  }

  // top-right: clock + wanted stars
  const starW = 128;
  const sx = W - 14 - starW;
  panel(ctx, sx, 12, starW, 58);
  ctx.textAlign = 'center';
  ctx.font = '700 17px "Courier New", monospace';
  ctx.fillStyle = C.cyan;
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 6;
  ctx.fillText(clockString(phase.hour), sx + starW / 2, 33);
  ctx.shadowBlur = 0;
  for (let k = 0; k < 5; k++) {
    const on = k < game.police.stars;
    if (on) {
      ctx.fillStyle = C.amber;
      ctx.shadowColor = C.amber;
      ctx.shadowBlur = 9;
      starPath(ctx, sx + 16 + k * 24, 52, 8.5);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(232,244,255,0.25)';
      ctx.lineWidth = 1;
      starPath(ctx, sx + 16 + k * 24, 52, 8.5);
      ctx.stroke();
    }
  }

  // bottom-right: speed
  const kmh = Math.round(p.speed * KMH);
  const fast = kmh > 150;
  ctx.textAlign = 'right';
  ctx.font = '700 40px "Arial Black", Arial, sans-serif';
  ctx.fillStyle = fast ? C.amber : C.white;
  if (fast) {
    ctx.shadowColor = C.amber;
    ctx.shadowBlur = 14;
  }
  ctx.fillText(`${kmh}`, W - 78, H - 34);
  ctx.shadowBlur = 0;
  ctx.font = '700 15px Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,244,255,0.8)';
  ctx.fillText('KM/H', W - 26, H - 34);

  // bottom-left: minimap
  const mx = 16;
  const my = H - 16 - MM;
  panel(ctx, mx - 7, my - 7, MM + 14, MM + 14, 'rgba(0,240,255,0.35)');
  ctx.drawImage(game.mm, mx, my);
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx + wx * MM_SCALE, my + wy * MM_SCALE, r, 0, TAU);
    ctx.fill();
  };
  if (game.missions.target) {
    const pulse = 3.4 + 1.8 * Math.sin(t * 5);
    dot(game.missions.target.x, game.missions.target.y, `rgba(255,43,214,${(0.55 + 0.35 * Math.sin(t * 5)).toFixed(3)})`, Math.max(2.6, pulse));
  }
  for (const cop of game.police.cars) dot(cop.x, cop.y, C.red, 2.6);
  const hx = mx + p.x * MM_SCALE;
  const hy = my + p.y * MM_SCALE;
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(p.angle) * 8, hy + Math.sin(p.angle) * 8);
  ctx.stroke();
  dot(p.x, p.y, C.cyan, 3.2);

  // toasts
  ctx.textAlign = 'center';
  let ty = 96;
  for (const toast of game.toasts) {
    let a = 1;
    if (toast.age < 0.25) a = toast.age / 0.25;
    const left = 3.6 - toast.age;
    if (left < 0.5) a *= Math.max(0, left / 0.5);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.font = '700 17px Arial, sans-serif';
    const w3 = ctx.measureText(toast.text).width + 44;
    panel(ctx, W / 2 - w3 / 2, ty, w3, 32);
    ctx.fillStyle = toast.color;
    ctx.shadowColor = toast.color;
    ctx.shadowBlur = 12;
    ctx.fillText(toast.text, W / 2, ty + 21);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ty += 38;
  }
}
