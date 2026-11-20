// Neon Harbor — the readouts: cash, clock, wanted stars, speed, the mission bar,
// toasts, the bottom-left minimap, the off-screen marker arrow and the big state
// screens (title / busted / wasted / paused).

import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, PALETTE, KMH, clamp, roundRect, starPath } from './config.js';
import { drawMinimapBase } from './city.js';
import { missionText } from './missions.js';
import { clockText } from './daynight.js';

const FONT = '"Courier New", ui-monospace, monospace';
const MM_W = 170, MM_H = 122, MM_X = 14, MM_Y = VIEW_H - MM_H - 14;

let minimapBase = null;

// The minimap backdrop only depends on the (seeded) city, so draw it once.
export function initHUD(city) {
  minimapBase = document.createElement('canvas');
  minimapBase.width = MM_W;
  minimapBase.height = MM_H;
  drawMinimapBase(minimapBase.getContext('2d'), city, MM_W, MM_H);
}

export function drawHUD(ctx, world, t) {
  // --- top-right: cash, clock, wanted stars ---
  ctx.textAlign = 'right';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = PALETTE.amber;
  ctx.shadowColor = PALETTE.amber;
  ctx.shadowBlur = 10;
  ctx.fillText(`$${world.money.toLocaleString()}`, VIEW_W - 16, 32);
  ctx.shadowBlur = 0;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText(clockText(world.clock.t), VIEW_W - 16, 54);

  const w = world.police.wanted;
  for (let k = 0; k < 5; k++) {
    const x = VIEW_W - 22 - (4 - k) * 26;
    starPath(ctx, x, 78, 10, 4.5);
    if (k < w) {
      ctx.globalAlpha = 0.78 + 0.22 * Math.sin(t * 7);
      ctx.fillStyle = PALETTE.amber;
      ctx.shadowColor = PALETTE.amber;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(255,179,71,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  // Busted progress when a cruiser has you boxed in.
  if (world.police.bustT > 0.1) {
    ctx.fillStyle = 'rgba(255,77,94,0.85)';
    ctx.fillRect(VIEW_W - 112, 94, 90 * Math.min(1, world.police.bustT), 5);
  }

  // --- bottom-right: speedometer ---
  const kmh = Math.round(Math.hypot(world.player.vx, world.player.vy) * KMH);
  ctx.textAlign = 'right';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = kmh > 150 ? PALETTE.cyan : '#cfe6ff';
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = kmh > 150 ? 12 : 0;
  ctx.fillText(String(kmh), VIEW_W - 16, VIEW_H - 28);
  ctx.shadowBlur = 0;
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = 'rgba(207,230,255,0.6)';
  ctx.fillText('KM/H', VIEW_W - 16, VIEW_H - 12);

  // --- bottom-centre: mission bar ---
  const text = missionText(world.missions);
  ctx.font = `700 14px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const bw = Math.min(tw + 44, VIEW_W - MM_W - 120);
  const bx = VIEW_W / 2 - bw / 2;
  const by = VIEW_H - 42;
  ctx.fillStyle = 'rgba(8,12,26,0.78)';
  roundRect(ctx, bx, by, bw, 28, 8);
  ctx.fill();
  ctx.strokeStyle = world.missions.done ? 'rgba(57,255,136,0.6)' : 'rgba(255,46,166,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(text, VIEW_W / 2, by + 19);

  // --- top-centre: toasts ---
  ctx.textAlign = 'center';
  let ty = 64;
  for (const toast of world.toasts) {
    const a = toast.t < 0.15 ? toast.t / 0.15 : toast.t > 2.4 ? clamp((2.8 - toast.t) / 0.4, 0, 1) : 1;
    ctx.globalAlpha = a;
    const tw2 = ctx.measureText(toast.text).width;
    ctx.fillStyle = 'rgba(8,12,26,0.82)';
    roundRect(ctx, VIEW_W / 2 - tw2 / 2 - 14, ty - 15, tw2 + 28, 26, 6);
    ctx.fill();
    ctx.strokeStyle = toast.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, VIEW_W / 2, ty + 3);
    ty += 34;
    ctx.globalAlpha = 1;
  }

  drawMinimap(ctx, world);
  drawMarkerArrow(ctx, world);
}

function drawMinimap(ctx, world) {
  ctx.save();
  roundRect(ctx, MM_X, MM_Y, MM_W, MM_H, 8);
  ctx.clip();
  ctx.drawImage(minimapBase, MM_X, MM_Y);
  const sx = MM_W / WORLD_W;
  const sy = MM_H / WORLD_H;
  // Traffic as faint dots.
  ctx.fillStyle = 'rgba(160,180,220,0.5)';
  for (const c of world.traffic.cars) {
    ctx.fillRect(MM_X + c.x * sx - 1, MM_Y + c.y * sy - 1, 2, 2);
  }
  // Cruisers.
  ctx.fillStyle = PALETTE.red;
  for (const cop of world.police.cops) {
    ctx.fillRect(MM_X + cop.x * sx - 2, MM_Y + cop.y * sy - 2, 4, 4);
  }
  // Mission marker + target car.
  const m = world.missions;
  if (m.done) {
    // nothing to track in free roam
  } else if (m.marker) {
    ctx.fillStyle = PALETTE.magenta;
    ctx.fillRect(MM_X + m.marker.x * sx - 3, MM_Y + m.marker.y * sy - 3, 6, 6);
    ctx.strokeStyle = 'rgba(255,46,166,0.5)';
    ctx.strokeRect(MM_X + m.marker.x * sx - 6, MM_Y + m.marker.y * sy - 6, 12, 12);
  } else if (m.target) {
    ctx.fillStyle = PALETTE.magenta;
    ctx.fillRect(MM_X + m.target.x * sx - 3, MM_Y + m.target.y * sy - 3, 6, 6);
  }
  // Player arrow.
  ctx.translate(MM_X + world.player.x * sx, MM_Y + world.player.y * sy);
  ctx.rotate(world.player.heading);
  ctx.fillStyle = PALETTE.cyan;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, 3.5);
  ctx.lineTo(-4, -3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Frame on top so it isn't clipped.
  ctx.strokeStyle = 'rgba(37,230,255,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, MM_X, MM_Y, MM_W, MM_H, 8);
  ctx.stroke();
}

// Screen-edge arrow when the mission marker/target is off-screen.
function drawMarkerArrow(ctx, world) {
  const m = world.missions;
  if (m.done) return;
  const target = m.marker || (m.target && { x: m.target.x, y: m.target.y });
  if (!target) return;
  const zoom = world.cam.zoom;
  const sx = (target.x - world.cam.x) * zoom + VIEW_W / 2;
  const sy = (target.y - world.cam.y) * zoom + VIEW_H / 2;
  const margin = 34;
  if (sx > margin && sx < VIEW_W - margin && sy > margin && sy < VIEW_H - margin) return;
  const cx = clamp(sx, margin, VIEW_W - margin);
  const cy = clamp(sy, margin, VIEW_H - margin);
  const ang = Math.atan2(sy - VIEW_H / 2, sx - VIEW_W / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = PALETTE.magenta;
  ctx.shadowColor = PALETTE.magenta;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-9, 8);
  ctx.lineTo(-9, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// State screens.
// ---------------------------------------------------------------------------

export function drawTitle(ctx, t, seed, save) {
  // A light veil only — the live city should still read through the title.
  ctx.fillStyle = 'rgba(5,7,13,0.26)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Scanlines for the CRT mood.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.globalAlpha = 0.09;
  for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 2);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  const g = ctx.createLinearGradient(0, 196, VIEW_W, 240);
  g.addColorStop(0, PALETTE.magenta);
  g.addColorStop(0.55, PALETTE.violet);
  g.addColorStop(1, PALETTE.cyan);
  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = PALETTE.magenta;
  ctx.shadowColor = PALETTE.magenta;
  ctx.shadowBlur = 28;
  ctx.fillText('NEON HARBOR', VIEW_W / 2 + 2, 236);
  ctx.fillStyle = g;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 16;
  ctx.fillText('NEON HARBOR', VIEW_W / 2, 234);
  ctx.shadowBlur = 0;

  ctx.font = `700 15px ${FONT}`;
  ctx.fillStyle = 'rgba(207,230,255,0.85)';
  ctx.fillText('A TOP-DOWN SYNTHWAVE CRIME CHASE', VIEW_W / 2, 272);

  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3);
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText('PRESS ENTER TO START THE RUN', VIEW_W / 2, 330);
  ctx.globalAlpha = 1;

  // A banked run invites you back onto the job.
  if (save) {
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = PALETTE.cyan;
    ctx.shadowColor = PALETTE.cyan;
    ctx.shadowBlur = 10;
    ctx.fillText(save.idx >= 6
      ? 'C — CONTINUE: ALL JOBS DONE, THE CITY IS YOURS'
      : `C — CONTINUE: JOB ${save.idx + 1} AT $${save.cash.toLocaleString()} BANKED`, VIEW_W / 2, 360);
    ctx.shadowBlur = 0;
  }

  ctx.font = `700 13px ${FONT}`;
  ctx.fillStyle = 'rgba(207,230,255,0.55)';
  ctx.fillText('WASD / ARROWS — DRIVE      P — PAUSE      M — SOUND      6 JOBS, 5 STARS, C — CONTINUE', VIEW_W / 2, VIEW_H - 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(207,230,255,0.35)';
  ctx.fillText(`city seed ${seed}`, VIEW_W - 12, VIEW_H - 10);
  ctx.textAlign = 'left';
  ctx.fillText('NEON HARBOR — SESSION 7 BUILD', 12, VIEW_H - 10);
}

export function drawEndScreen(ctx, kind, t) {
  const conf = {
    busted: ['BUSTED', PALETTE.red, 'BAIL $200 — PRESS ENTER'],
    wasted: ['WASTED', '#9fb4d8', 'TOW FEE $150 — PRESS ENTER'],
  }[kind];
  if (!conf) return;
  const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 120, VIEW_W / 2, VIEW_H / 2, 620);
  vg.addColorStop(0, 'rgba(4,6,12,0.25)');
  vg.addColorStop(1, 'rgba(4,6,12,0.88)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const jit = kind === 'busted' ? Math.sin(t * 30) * 1.5 : 0;
  ctx.textAlign = 'center';
  ctx.font = `700 72px ${FONT}`;
  ctx.fillStyle = conf[1];
  ctx.shadowColor = conf[1];
  ctx.shadowBlur = 24;
  ctx.fillText(conf[0], VIEW_W / 2 + jit, VIEW_H / 2 - 4);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3);
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = '#e8f2ff';
  ctx.fillText(conf[2], VIEW_W / 2, VIEW_H / 2 + 52);
  ctx.globalAlpha = 1;
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(4,6,12,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillStyle = PALETTE.cyan;
  ctx.shadowColor = PALETTE.cyan;
  ctx.shadowBlur = 18;
  ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 6);
  ctx.shadowBlur = 0;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = 'rgba(207,230,255,0.7)';
  ctx.fillText('P — RESUME      M — SOUND ON/OFF', VIEW_W / 2, VIEW_H / 2 + 30);
}
