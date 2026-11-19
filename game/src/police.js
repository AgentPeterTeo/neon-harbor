// Neon Harbor — the heat: crashes witnessed by a cruiser raise the wanted level,
// stars spawn cruisers that hunt along the grid and ram, and being pinned while
// slow ends in BUSTED. Stay out of any cruiser's reach for a few seconds and a
// star burns off. Ramming a cop is itself witnessed — heat feeds heat.

import { PITCH, NX, NY, PALETTE, clamp, dist, angleLerp } from './config.js';
import { createCar, stepVehicle } from './car.js';
import { collideStatic } from './city.js';

export function createPolice() {
  return { wanted: 0, bustT: 0, evadeT: 0, ramCd: 0, cops: [] };
}

export function addStars(pol, world, n) {
  const before = pol.wanted;
  pol.wanted = clamp(pol.wanted + n, 0, 5);
  if (pol.wanted > before) {
    world.toasts.push({ text: `WANTED ${'*'.repeat(pol.wanted)}`, color: PALETTE.red, t: 0 });
    pol.evadeT = 0;
  }
}

// Put a cruiser on a road a few blocks out, aimed at the player.
export function spawnCop(pol, world) {
  const p = world.player;
  const rng = world.rng;
  const ang = rng() * Math.PI * 2;
  const d = 560 + rng() * 260;
  let x = clamp(p.x + Math.cos(ang) * d, 60, NX * PITCH - 60);
  let y = clamp(p.y + Math.sin(ang) * d, 60, NY * PITCH - 60);
  const gi = Math.round(x / PITCH);
  const gj = Math.round(y / PITCH);
  if (Math.abs(x - gi * PITCH) < Math.abs(y - gj * PITCH)) x = clamp(gi, 0, NX) * PITCH;
  else y = clamp(gj, 0, NY) * PITCH;
  const cop = createCar('police', x, y, Math.atan2(p.y - y, p.x - x));
  cop.stuckT = 0;
  pol.cops.push(cop);
}

// A crash only counts if a cruiser is close enough to see it.
export function witnessCrash(pol, world) {
  const p = world.player;
  for (const cop of pol.cops) {
    if (dist(cop.x, cop.y, p.x, p.y) < 560) {
      addStars(pol, world, 1);
      return;
    }
  }
}

export function updatePolice(pol, dt, world) {
  const p = world.player;
  while (pol.cops.length < pol.wanted) spawnCop(pol, world);
  while (pol.cops.length > pol.wanted) pol.cops.pop();

  let nearest = Infinity;
  for (const cop of pol.cops) {
    // Chase a lead point so cruisers cut across your future, not your past.
    const tx = p.x + p.vx * 0.35;
    const ty = p.y + p.vy * 0.35;
    const want = Math.atan2(ty - cop.y, tx - cop.x);
    let dh = want - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(dh * 2.5, -1, 1);

    const d = dist(cop.x, cop.y, p.x, p.y);
    const throttle = d > 320 ? 1 : d > 120 ? 0.75 : -0.1;
    stepVehicle(cop, throttle, steer, dt);

    // Don't tunnel through buildings.
    const hit = collideStatic(world.city, cop.x, cop.y, 13);
    if (hit) {
      cop.x += hit.pushX;
      cop.y += hit.pushY;
      if (hit.axis === 'x') cop.vx *= -0.4;
      else cop.vy *= -0.4;
    }

    // Unstick: a cruiser wedged far away re-routes via a fresh spawn point.
    const spd = Math.hypot(cop.vx, cop.vy);
    if (spd < 30 && d > 200) cop.stuckT += dt;
    else cop.stuckT = 0;
    if (cop.stuckT > 2) {
      pol.cops.splice(pol.cops.indexOf(cop), 1);
      spawnCop(pol, world);
      continue;
    }

    // Ram separation + impulse.
    if (d < 34 && d > 0.01) {
      const nx = (p.x - cop.x) / d;
      const ny = (p.y - cop.y) / d;
      p.x += nx * 8;
      p.y += ny * 8;
      cop.x -= nx * 6;
      cop.y -= ny * 6;
      p.vx += nx * 30;
      p.vy += ny * 30;
      cop.vx -= nx * 20;
      cop.vy -= ny * 20;
      p.damage = Math.min(100, p.damage + 3);
      cop.damage = Math.min(100, cop.damage + 2);
      world.shake = Math.max(world.shake, 6);
      world.spawnSparks((p.x + cop.x) / 2, (p.y + cop.y) / 2, 6);
      // Ramming the law is itself a crime — once per beat.
      pol.ramCd -= dt;
      if (pol.ramCd <= 0) {
        addStars(pol, world, 1);
        pol.ramCd = 1.2;
      }
    }

    // Close and slow = they're boxing you in.
    if (d < 44) {
      const playerSpd = Math.hypot(p.vx, p.vy);
      if (playerSpd < 55) pol.bustT += dt * (1.2 - playerSpd / 60);
      else pol.bustT = Math.max(0, pol.bustT - dt * 2);
      if (pol.bustT > 1) world.gameOver('busted');
    }
    nearest = Math.min(nearest, d);
  }

  if (nearest > 60) pol.bustT = Math.max(0, pol.bustT - dt);

  // Evasion burns stars one at a time.
  if (pol.wanted > 0) {
    if (nearest > 620 || pol.cops.length === 0) pol.evadeT += dt;
    else pol.evadeT = 0;
    if (pol.evadeT > 6.5) {
      pol.wanted--;
      pol.evadeT = 0;
      if (pol.wanted === 0) {
        world.toasts.push({ text: 'HEAT LOST', color: PALETTE.green, t: 0 });
      }
    }
  }
}
