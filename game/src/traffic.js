// Neon Harbor — civilian traffic: cars ride the right-hand lanes of the grid,
// brake for whatever blocks their lane ahead (each other, the player, cruisers)
// and pick turns at every node from the seeded rng stream. Cars too far from
// the player respawn nearby so the streets stay busy. The canal row has no road,
// so nothing ever turns onto it; vertical roads bridge over the water instead.

import {
  PITCH, NX, NY, WORLD_W, WORLD_H, WATER_ROW,
  PALETTE, clamp, dist, angleLerp,
} from './config.js';
import { createCar, CIVILIAN_STYLES } from './car.js';

// Right-hand traffic: your lane sits on the right of your heading.
// axis 'v' -> the car travels along y on vertical road `line` (x is the lane coord)
// axis 'h' -> the car travels along x on horizontal road `line` (y is the lane coord)
export function laneCoord(axis, line, dir) {
  if (axis === 'v') return line * PITCH + (dir > 0 ? -24 : 24);
  return line * PITCH + (dir > 0 ? 24 : -24);
}

function nextNode(pos, dir) {
  return dir > 0
    ? (Math.floor(pos / PITCH) + 1) * PITCH
    : (Math.ceil(pos / PITCH) - 1) * PITCH;
}

function headingFor(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function createTraffic(city, rng, count) {
  const cars = [];
  for (let n = 0; n < count; n++) cars.push(spawnCar(rng));
  return { cars };
}

function spawnCar(rng) {
  const style = CIVILIAN_STYLES[Math.floor(rng() * CIVILIAN_STYLES.length)];
  const axis = rng() < 0.5 ? 'v' : 'h';
  const car = createCar('civilian', 0, 0, 0, style);
  const ai = { axis, line: 0, dir: 1, cruise: 90 + rng() * 55, next: 0 };
  car.ai = ai;
  seedLane(car, rng, null);
  return car;
}

// Drop the car on a random (or near-player) lane position.
function seedLane(car, rng, near) {
  const ai = car.ai;
  for (let tries = 0; tries < 14; tries++) {
    const axis = rng() < 0.5 ? 'v' : 'h';
    let line, pos;
    if (axis === 'v') {
      line = Math.floor(rng() * (NX + 1));
      pos = rng() * WORLD_H;
    } else {
      line = Math.floor(rng() * (NY + 1));
      if (line === WATER_ROW) continue;
      pos = rng() * WORLD_W;
    }
    const dir = rng() < 0.5 ? 1 : -1;
    const x = axis === 'v' ? laneCoord('v', line, dir) : pos;
    const y = axis === 'v' ? pos : laneCoord('h', line, dir);
    if (near && dist(x, y, near.x, near.y) < 240) continue;
    ai.axis = axis; ai.line = line; ai.dir = dir;
    ai.next = nextNode(pos, dir);
    car.x = x; car.y = y;
    car.heading = headingFor(axis, dir);
    car.vx = 0; car.vy = 0;
    return;
  }
}

// Deterministic placement used by the screenshot composer (and mission 4's mark).
export function placeCar(car, axis, line, dir, pos) {
  const ai = car.ai;
  ai.axis = axis; ai.line = line; ai.dir = dir;
  ai.next = nextNode(pos, dir);
  if (axis === 'v') {
    car.x = laneCoord('v', line, dir);
    car.y = pos;
  } else {
    car.y = laneCoord('h', line, dir);
    car.x = pos;
  }
  car.heading = headingFor(axis, dir);
  car.vx = 0; car.vy = 0;
}

function updateSpeeds(car, hx, hy, speedAlong) {
  car.vx = hx * speedAlong;
  car.vy = hy * speedAlong;
}

export function updateTraffic(traffic, dt, world) {
  const p = world.player;
  for (const car of traffic.cars) {
    const ai = car.ai;
    const hx = Math.cos(car.heading);
    const hy = Math.sin(car.heading);

    // Lane scan: closest obstacle ahead in my corridor.
    let blockDist = Infinity;
    let blockSpeed = 0;
    for (const other of world.obstacles) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const fwd = dx * hx + dy * hy;
      if (fwd < 8 || fwd > 130) continue;
      const side = Math.abs(dx * -hy + dy * hx);
      if (side > 30) continue;
      if (fwd < blockDist) {
        blockDist = fwd;
        blockSpeed = (other.vx || 0) * hx + (other.vy || 0) * hy;
      }
    }

    // Cruise / brake to match / full stop.
    let target = ai.cruise;
    if (blockDist < 130) target = blockDist < 62 ? 0 : Math.max(0, blockSpeed * 0.85);
    let s = car.vx * hx + car.vy * hy;
    s += clamp(target - s, -340 * dt, 150 * dt);
    if (s < 0) s = 0;
    car.x += hx * s * dt;
    car.y += hy * s * dt;
    updateSpeeds(car, hx, hy, s);

    // Node reached -> pick straight or a legal turn.
    const now = ai.axis === 'v' ? car.y : car.x;
    if ((ai.dir > 0 && now >= ai.next) || (ai.dir < 0 && now <= ai.next)) {
      decideAtNode(car, world.rng);
    }

    // Heading eases toward the lane direction (turns read as short arcs).
    car.heading = angleLerp(car.heading, headingFor(ai.axis, ai.dir), Math.min(1, 10 * dt));

    // Lane lock: the cross-axis coordinate eases back onto the lane centre, so
    // turns and player bumps don't leave cars drifting off their lanes.
    if (ai.axis === 'v') {
      car.x = car.x + (laneCoord('v', ai.line, ai.dir) - car.x) * Math.min(1, 3 * dt);
    } else {
      car.y = car.y + (laneCoord('h', ai.line, ai.dir) - car.y) * Math.min(1, 3 * dt);
    }

    // Keep the streets around the player populated.
    if (car.kind !== 'target' && dist(car.x, car.y, p.x, p.y) > 1500) {
      seedLane(car, world.rng, p);
    }
  }
}

function decideAtNode(car, rng) {
  const ai = car.ai;
  // Node grid indices.
  const nodeI = ai.axis === 'v' ? ai.line : Math.round(ai.next / PITCH);
  const nodeJ = ai.axis === 'v' ? Math.round(ai.next / PITCH) : ai.line;

  const options = [];
  const straight = { axis: ai.axis, line: ai.line, dir: ai.dir };
  if (ai.axis === 'v') {
    const j2 = nodeJ + ai.dir;
    if (j2 >= 0 && j2 <= NY) { options.push(straight, straight); }
    if (nodeJ !== WATER_ROW) {
      for (const d of [1, -1]) {
        if (nodeI + d >= 0 && nodeI + d <= NX) options.push({ axis: 'h', line: nodeJ, dir: d });
      }
    }
  } else {
    const i2 = nodeI + ai.dir;
    if (i2 >= 0 && i2 <= NX) { options.push(straight, straight); }
    for (const d of [1, -1]) {
      const j2 = nodeJ + d;
      if (j2 >= 0 && j2 <= NY) options.push({ axis: 'v', line: nodeI, dir: d });
    }
  }
  if (!options.length) {
    // Dead end (shouldn't happen on this grid): flip direction.
    ai.dir = -ai.dir;
    ai.next = nextNode(ai.axis === 'v' ? car.y : car.x, ai.dir);
    return;
  }

  const pick = options[Math.floor(rng() * options.length)];
  // Whichever way we go, we are standing ON the node: the next target along the
  // travel axis is one node index past it in the travel direction.
  if (pick.axis === 'v') {
    ai.line = pick.line;
    ai.dir = pick.dir;
    car.x = laneCoord('v', ai.line, ai.dir);
    ai.next = (nodeJ + ai.dir) * PITCH;
  } else {
    ai.line = pick.line;
    ai.dir = pick.dir;
    car.y = laneCoord('h', ai.line, ai.dir);
    ai.next = (nodeI + ai.dir) * PITCH;
  }
}
