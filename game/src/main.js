// Neon Harbor — the loop: fixed-timestep simulation, an arcade car under the
// keyboard, the traffic/police/mission systems, a camera that leads and zooms
// with speed, and the title -> play -> busted/wasted -> respawn state machine.

import {
  VIEW_W, VIEW_H, WORLD_W, WORLD_H, PITCH, PLAYER, PALETTE,
  makeRng, clamp, lerp, dist, hexA,
} from './config.js';
import { createCity, drawCity, collideStatic } from './city.js';
import { createCar, stepVehicle, drawCar, carRadius } from './car.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createPolice, updatePolice, addStars, witnessCrash } from './police.js';
import { createMissions, startMission, updateMissions, resetMission, drawMissionMarkers } from './missions.js';
import { initHUD, drawHUD, drawTitle, drawEndScreen, drawPause } from './hud.js';
import { createClock, updateClock, dayLight, drawLighting } from './daynight.js';
import { initInput, input } from './input.js';
import { parseShot, applyShot } from './shots.js';

const STEP = 1 / 60;

// ---------------------------------------------------------------------------
// World construction.
// ---------------------------------------------------------------------------

function createWorld(seed) {
  const rng = makeRng(seed);
  const rngV = makeRng((seed ^ 0x9e37) >>> 0);
  const world = {
    seed, rng, rngV,
    city: createCity(seed),
    clock: createClock(9),
    traffic: createTraffic(null, rng, 26),
    police: createPolice(),
    missions: createMissions(),
    player: null,
    money: 0,
    toasts: [],
    skids: [],
    particles: [],
    cam: { x: 0, y: 0, zoom: 1 },
    shake: 0,
    state: 'title',
    paused: false,
    shotMode: null,
    crashCd: 0,
    smokeCd: 0,
    litCars: [],
  };

  world.player = createCar('player', PITCH, PITCH, -Math.PI / 2);

  world.setWanted = (n) => {
    world.police.wanted = clamp(n, 0, 5);
    world.police.evadeT = 0;
  };
  world.addStars = (n) => addStars(world.police, world, n);
  world.gameOver = (kind) => {
    if (world.state !== 'play') return;
    world.state = kind;
    world.shake = kind === 'busted' ? 10 : 14;
    world.spawnSparks(world.player.x, world.player.y, kind === 'wasted' ? 26 : 10);
    if (kind === 'wasted') world.player.damage = 100;
  };
  world.spawnSparks = (x, y, n) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      world.particles.push({
        x, y, vx: Math.cos(a) * (60 + rng() * 160), vy: Math.sin(a) * (60 + rng() * 160),
        life: 0.5 + rng() * 0.3, max: 0.8, color: rng() < 0.5 ? '#ffd166' : '#ff5d8f', size: 2 + rng() * 2,
      });
    }
  };
  world.spawnSmoke = (x, y) => {
    world.particles.push({
      x: x + (rng() - 0.5) * 10, y: y + (rng() - 0.5) * 10,
      vx: (rng() - 0.5) * 20, vy: (rng() - 0.5) * 20 - 10,
      life: 0.9 + rng() * 0.6, max: 1.5, color: 'rgba(160,170,190,0.45)', size: 5 + rng() * 5,
    });
  };

  world.cam.x = world.player.x;
  world.cam.y = world.player.y;
  return world;
}

// ---------------------------------------------------------------------------
// Simulation.
// ---------------------------------------------------------------------------

function playerStep(p, dt, world) {
  const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const before = { vx: p.vx, vy: p.vy };
  stepVehicle(p, throttle, steer, dt);

  // Building collision: push out and kill the offending velocity component.
  const hit = collideStatic(world.city, p.x, p.y, 13);
  if (hit) {
    p.x += hit.pushX;
    p.y += hit.pushY;
    if (hit.axis === 'x') p.vx *= -0.3;
    else p.vy *= -0.3;
    p.damage = Math.min(100, p.damage + 4 * Math.min(1, Math.hypot(before.vx, before.vy) / 200));
  }

  // Skid marks while drifting or braking hard.
  const speed = Math.hypot(p.vx, p.vy);
  const drifting = Math.abs(p.drift) > 0.2 && speed > 90;
  if (drifting) {
    const hx = Math.cos(p.heading);
    const hy = Math.sin(p.heading);
    const ex = -Math.sin(p.heading);
    const ey = Math.cos(p.heading);
    world.skids.push({ x: p.x - hx * 14 + ex * 9, y: p.y - hy * 14 + ey * 9, a: 0.5, r: p.heading });
    world.skids.push({ x: p.x - hx * 14 - ex * 9, y: p.y - hy * 14 - ey * 9, a: 0.5, r: p.heading });
    if (world.skids.length > 420) world.skids.splice(0, world.skids.length - 420);
  }

  // Damage smoke once the car is badly beaten.
  world.smokeCd -= dt;
  if (p.damage > 55 && world.smokeCd <= 0) {
    world.spawnSmoke(p.x, p.y);
    world.smokeCd = 0.12;
  }
  if (p.damage >= 100) world.gameOver('wasted');

  // Bumps against traffic and cruisers: sparks, wear, witnesses.
  world.crashCd -= dt;
  const bump = (o) => {
    const d = dist(p.x, p.y, o.x, o.y);
    if (d > 30 || d < 0.01) return;
    const nx = (p.x - o.x) / d;
    const ny = (p.y - o.y) / d;
    const impact = Math.max(0, (p.vx - (o.vx || 0)) * nx + (p.vy - (o.vy || 0)) * ny);
    p.x += nx * 6;
    o.x -= nx * 6;
    o.y -= ny * 6;
    p.y += ny * 6;
    p.vx += nx * 26;
    p.vy += ny * 26;
    if (o.ai) { o.vx -= nx * 18; o.vy -= ny * 18; }
    p.damage = Math.min(100, p.damage + Math.min(9, impact * 0.045));
    if (world.crashCd <= 0 && impact > 60) {
      world.crashCd = 0.4;
      world.shake = Math.max(world.shake, 5);
      world.spawnSparks((p.x + o.x) / 2, (p.y + o.y) / 2, 5);
      witnessCrash(world.police, world);
    }
  };
  for (const c of world.traffic.cars) bump(c);
}

function update(world, dt) {
  // Pause only ticks the toasts so they can fade out.
  if (world.paused) {
    tickToasts(world, dt);
    return;
  }

  updateClock(world.clock, dt);
  tickToasts(world, dt);
  world.shake = Math.max(0, world.shake - 26 * dt);

  // Traffic always rolls, on every screen.
  world.obstacles = [world.player, ...world.police.cops, ...world.traffic.cars];
  updateTraffic(world.traffic, dt, world);

  if (world.state === 'title') {
    if (input.enterPressed) {
      world.state = 'play';
      startMission(world.missions, world, 0);
      world.toasts.push({ text: 'JOB 1: HOT CARGO TO THE DOCKS', color: PALETTE.cyan, t: 0 });
    }
  } else if (world.state === 'play') {
    if (input.pausePressed) {
      world.paused = true;
      input.pausePressed = false;
    }
    playerStep(world.player, dt, world);
    updatePolice(world.police, dt, world);
    updateMissions(world.missions, dt, world);
  } else if (world.state === 'busted' || world.state === 'wasted') {
    if (input.enterPressed) respawn(world);
  }

  // Camera: lead into the velocity, tighten when slow, breathe out at speed.
  const p = world.player;
  const spd = Math.hypot(p.vx, p.vy);
  const lx = p.x + p.vx * 0.22;
  const ly = p.y + p.vy * 0.22;
  const k = Math.min(1, 4.2 * dt);
  world.cam.x += (lx - world.cam.x) * k;
  world.cam.y += (ly - world.cam.y) * k;
  const tz = lerp(1.02, 0.86, clamp(spd / PLAYER.maxFwd, 0, 1));
  world.cam.zoom += (tz - world.cam.zoom) * Math.min(1, 2.5 * dt);

  // Particles.
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { world.particles.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.97;
    pt.vy *= 0.97;
  }

  input.enterPressed = false;
  input.pausePressed = false;
}

function tickToasts(world, dt) {
  for (let i = world.toasts.length - 1; i >= 0; i--) {
    world.toasts[i].t += dt;
    if (world.toasts[i].t > 2.8) world.toasts.splice(i, 1);
  }
}

function respawn(world) {
  const fee = world.state === 'busted' ? 200 : 150;
  const p = world.player;
  p.x = 2 * PITCH;
  p.y = 5 * PITCH;
  p.heading = -Math.PI / 2;
  p.vx = 0; p.vy = 0;
  p.damage = 0;
  p.drift = 0;
  world.money = Math.max(0, world.money - fee);
  world.police.wanted = 0;
  world.police.cops.length = 0;
  world.police.bustT = 0;
  world.police.evadeT = 0;
  world.state = 'play';
  world.paused = false;
  world.cam.x = p.x;
  world.cam.y = p.y;
  resetMission(world.missions, world);
  world.toasts.push({ text: 'BACK ON THE STREET', color: PALETTE.hud, t: 0 });
}

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

function updateAndRender(ctx, world, frameDt) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Pause is handled by the update tick; when paused we still draw the world.
  const shx = (world.rngV() - 0.5) * world.shake;
  const shy = (world.rngV() - 0.5) * world.shake;
  const zoom = world.cam.zoom;
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-world.cam.x + shx, -world.cam.y + shy);

  const view = {
    x0: world.cam.x - VIEW_W / (2 * zoom) - 40,
    x1: world.cam.x + VIEW_W / (2 * zoom) + 40,
    y0: world.cam.y - VIEW_H / (2 * zoom) - 40,
    y1: world.cam.y + VIEW_H / (2 * zoom) + 40,
  };

  const night = 1 - dayLight(world.clock.t);
  drawCity(ctx, world.city, view, night, world.clock.t);

  // Skid marks.
  for (const s of world.skids) {
    if (s.x < view.x0 || s.x > view.x1 || s.y < view.y0 || s.y > view.y1) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.r);
    ctx.fillStyle = `rgba(20,24,40,${s.a})`;
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }

  drawMissionMarkers(ctx, world.missions, world.clock.t);

  world.litCars = [];
  const drawMaybe = (car) => {
    if (car.x < view.x0 - 60 || car.x > view.x1 + 60) return;
    if (car.y < view.y0 - 60 || car.y > view.y1 + 60) return;
    drawCar(ctx, car, world.clock.t);
    if (night > 0.25) world.litCars.push(car);
  };
  for (const c of world.traffic.cars) drawMaybe(c);
  for (const cop of world.police.cops) drawMaybe(cop);
  drawMaybe(world.player);

  // Particles.
  for (const pt of world.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color.startsWith('rgba') ? pt.color : hexA(pt.color, a);
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }

  drawLighting(ctx, world, view, world.clock.t);
  ctx.restore();

  // UI layer.
  if (world.state === 'title') {
    drawTitle(ctx, world.clock.t, world.seed);
  } else {
    drawHUD(ctx, world, world.clock.t);
    if (world.paused) drawPause(ctx);
    else if (world.state === 'busted' || world.state === 'wasted') {
      drawEndScreen(ctx, world.state, world.clock.t);
    }
  }
}

// ---------------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------------

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const shot = parseShot();
  const seed = shot.seed !== null ? shot.seed : ((Date.now() >>> 6) % 100000) + 17;

  initInput();
  const world = createWorld(seed);
  initHUD(world.city);
  applyShot(world, shot);
  if (window.__nh) window.__nh.game = world;

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    acc += dt;
    while (acc >= STEP) {
      update(world, STEP);
      acc -= STEP;
    }
    updateAndRender(ctx, world, dt);
    if (window.__nh && !window.__nh.ready) window.__nh.ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
