// Neon Harbor — the five-mission chain: run the hot cargo to the docks, shake a
// two-star tail, a three-checkpoint city race against 60 seconds, steal the
// marked car that's already rolling, and the four-star sprint home to the
// safehouse. One glowing marker, one HUD line per mission, cash on completion.

import { PITCH, NX, NY, WATER_ROW, PALETTE, dist, clamp } from './config.js';
import { DOCK_CELL, SAFE_CELL } from './city.js';
import { placeCar } from './traffic.js';

const DEFS = [
  {
    id: 1, type: 'deliver', reward: 400,
    text: 'MISSION 1 — RUN THE HOT CARGO TO THE DOCKS',
    marker: { x: (DOCK_CELL.i) * PITCH, y: (DOCK_CELL.j) * PITCH },
  },
  { id: 2, type: 'escape', reward: 600, wanted: 2, text: 'MISSION 2 — LOSE THE 2-STAR HEAT' },
  {
    id: 3, type: 'race', reward: 800, time: 60,
    text: 'MISSION 3 — CITY RACE: 3 CHECKPOINTS IN 60S',
    cps: [
      { x: 1 * PITCH, y: 1 * PITCH },
      { x: (NX - 2) * PITCH, y: 1 * PITCH },
      { x: 2 * PITCH, y: (NY - 2) * PITCH },
    ],
  },
  { id: 4, type: 'steal', reward: 1000, text: 'MISSION 4 — STEAL THE MARKED CAR: CATCH AND TOUCH IT' },
  {
    id: 5, type: 'home', reward: 2000, wanted: 4,
    text: 'MISSION 5 — 4 STARS ON YOUR BACK: GET HOME',
    marker: { x: SAFE_CELL.i * PITCH, y: SAFE_CELL.j * PITCH },
  },
];

export function createMissions() {
  return { idx: 0, def: null, marker: null, race: null, target: null, done: false };
}

// (Re)start mission `idx` — idempotent, so a respawn just replays the current job.
export function startMission(m, world, idx) {
  m.idx = idx;
  m.def = DEFS[idx] || null;
  m.marker = null;
  m.race = null;
  m.target = null;
  m.done = idx >= DEFS.length;
  if (m.done) {
    world.toasts.push({ text: 'ALL JOBS DONE — NEON HARBOR IS YOURS', color: PALETTE.green, t: 0 });
    return;
  }
  const d = m.def;
  if (d.type === 'deliver' || d.type === 'home') m.marker = { x: d.marker.x, y: d.marker.y };
  if (d.type === 'escape') world.setWanted(d.wanted);
  if (d.type === 'race') {
    m.race = { cp: 0, t: d.time };
    m.marker = { x: d.cps[0].x, y: d.cps[0].y };
  }
  if (d.type === 'steal') spawnTarget(m, world);
  world.toasts.push({ text: d.text, color: PALETTE.cyan, t: 0 });
}

// Replay the current mission after a bust/wasted.
export function resetMission(m, world) {
  startMission(m, world, m.idx);
}

function spawnTarget(m, world) {
  const traffic = world.traffic;
  const p = world.player;
  const rng = world.rng;
  // Borrow the civilian farthest from the player and repaint it as the mark.
  let far = null;
  let fd = -1;
  for (const c of traffic.cars) {
    if (c.kind !== 'civilian') continue;
    const dd = dist(c.x, c.y, p.x, p.y);
    if (dd > fd) { fd = dd; far = c; }
  }
  if (!far) far = traffic.cars[0];
  far._orig = { kind: far.kind, style: far.style };
  far.kind = 'target';
  far.style = { name: 'target', len: 44, wid: 21, body: '#ff2ea6', roof: '#c92185' };

  // Put it on a lane a few blocks out, already driving.
  const axis = rng() < 0.5 ? 'v' : 'h';
  if (axis === 'v') {
    const line = clamp(Math.round(p.x / PITCH) + (rng() < 0.5 ? 2 : -2), 0, NX);
    const dir = rng() < 0.5 ? 1 : -1;
    placeCar(far, 'v', line, dir, clamp(p.y + 520, 100, NY * PITCH - 100));
  } else {
    let line = Math.floor(rng() * (NY + 1));
    if (line === WATER_ROW) line = WATER_ROW - 1;
    const dir = rng() < 0.5 ? 1 : -1;
    placeCar(far, 'h', line, dir, clamp(p.x + 520, 100, NX * PITCH - 100));
  }
  m.target = far;
}

export function updateMissions(m, dt, world) {
  if (!m.def || m.done) return;
  const d = m.def;
  const p = world.player;

  if (d.type === 'deliver' || d.type === 'home') {
    if (dist(p.x, p.y, m.marker.x, m.marker.y) < 52) complete(m, world);
  } else if (d.type === 'escape') {
    if (world.police.wanted === 0) complete(m, world);
  } else if (d.type === 'race') {
    m.race.t -= dt;
    if (dist(p.x, p.y, m.marker.x, m.marker.y) < 52) {
      m.race.cp++;
      if (m.race.cp >= d.cps.length) {
        complete(m, world);
        return;
      }
      m.marker = { x: d.cps[m.race.cp].x, y: d.cps[m.race.cp].y };
      world.toasts.push({ text: `CHECKPOINT ${m.race.cp}/3`, color: PALETTE.amber, t: 0 });
    }
    if (m.race.t <= 0) {
      m.race.cp = 0;
      m.race.t = d.time;
      m.marker = { x: d.cps[0].x, y: d.cps[0].y };
      world.toasts.push({ text: 'RACE CLOCK RESET', color: PALETTE.red, t: 0 });
    }
  } else if (d.type === 'steal') {
    const tg = m.target;
    if (tg && dist(p.x, p.y, tg.x, tg.y) < 46) {
      tg.kind = tg._orig.kind;
      tg.style = tg._orig.style;
      tg._orig = null;
      m.target = null;
      complete(m, world);
    }
  }
}

function complete(m, world) {
  world.money += m.def.reward;
  world.toasts.push({ text: `MISSION COMPLETE +$${m.def.reward}`, color: PALETTE.green, t: 0 });
  if (m.def.type === 'home') world.setWanted(0);
  startMission(m, world, m.idx + 1);
}

// The one HUD line for the current mission.
export function missionText(m) {
  if (m.done) return 'NEON HARBOR IS YOURS — FREE ROAM';
  if (!m.def) return 'PRESS ENTER TO START THE RUN';
  if (m.def.type === 'race') {
    return `${m.def.text} — ${Math.max(0, m.race.t).toFixed(1)}s CP ${m.race.cp + 1}/3`;
  }
  return m.def.text;
}

// World-space marker: pulsing magenta ring + the tracked car's halo.
export function drawMissionMarkers(ctx, m, t) {
  if (m.marker && !m.done) {
    const pulse = 1 + Math.sin(t * 4) * 0.12;
    ctx.save();
    ctx.translate(m.marker.x, m.marker.y);
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = 3;
    ctx.shadowColor = PALETTE.magenta;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, 7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,46,166,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, 7);
    ctx.fill();
    ctx.fillStyle = PALETTE.magenta;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  if (m.target) {
    ctx.save();
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = PALETTE.magenta;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(m.target.x, m.target.y, 30 + Math.sin(t * 6) * 4, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
}
