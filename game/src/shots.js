// Neon Harbor — the screenshot contract. ?shot=start|play|mission with an
// optional ?seed=N freezes the world into a composed frame:
//   start   — dusk title scene: the coupe parked mid-city, traffic rolling past.
//   play    — bright daylight run up the 5th avenue, HUD live, wanted 1 star.
//   mission — night job: mission 1 active, the dock marker glowing ahead.
// Any other query (or none) just plays the game normally.

import { PITCH, LANE, NX, NY, PALETTE, clamp } from './config.js';
import { placeCar } from './traffic.js';
import { startMission } from './missions.js';

export function parseShot() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('shot');
  const seedRaw = parseInt(q.get('seed'), 10);
  return {
    mode: mode === 'start' || mode === 'play' || mode === 'mission' ? mode : null,
    seed: Number.isFinite(seedRaw) ? seedRaw : null,
  };
}

export function applyShot(world, shot) {
  if (!shot.mode) return;
  world.shotMode = shot.mode;
  world.clock.frozen = true;
  const p = world.player;
  const cars = world.traffic.cars;

  if (shot.mode === 'start') {
    world.state = 'title';
    world.clock.t = 18.6; // warm dusk
    p.x = 5 * PITCH + LANE;      // 1424 — parked on the northbound lane
    p.y = 4 * PITCH + 96;       // 1216
    p.heading = -Math.PI / 2;
    p.vx = 0; p.vy = 0;
    world.cam.x = p.x - 60;
    world.cam.y = p.y - 80;
    dress(cars, [
      [0, 'v', 5, 1, 4 * PITCH + 260],
      [1, 'v', 5, -1, 4 * PITCH - 140],
      [2, 'h', 4, 1, 5 * PITCH + 160],
      [3, 'h', 4, -1, 5 * PITCH - 120],
      [4, 'v', 6, -1, 4 * PITCH + 40],
      [5, 'h', 4, -1, 6 * PITCH - 160],
    ]);
  } else if (shot.mode === 'play') {
    world.state = 'play';
    world.clock.t = 12.55; // high noon
    startMission(world.missions, world, 0);
    p.x = 5 * PITCH + LANE;      // northbound lane of the 5th avenue
    p.y = 4 * PITCH + 240;
    p.heading = -Math.PI / 2;
    p.vx = 0; p.vy = -330;
    world.cam.x = p.x;
    world.cam.y = p.y - 60;
    world.money = 1250;
    world.setWanted(1);
    dress(cars, [
      [0, 'v', 5, -1, 4 * PITCH - 200],  // same lane, rolling north
      [1, 'v', 5, -1, 3 * PITCH + 160],
      [2, 'v', 5, 1, 4 * PITCH + 160],   // oncoming southbound
      [3, 'v', 5, 1, 3 * PITCH - 80],
      [4, 'h', 4, 1, 5 * PITCH + 60],    // crossing the node ahead
      [5, 'h', 4, -1, 4 * PITCH - 200],
      [6, 'v', 6, -1, 4 * PITCH - 100],
      [7, 'v', 4, 1, 4 * PITCH + 120],
    ]);
  } else if (shot.mode === 'mission') {
    world.state = 'play';
    world.clock.t = 21.6; // deep night
    startMission(world.missions, world, 0); // mission 1: hot cargo -> docks
    p.x = 8 * PITCH + 60;
    p.y = 2 * PITCH + LANE;      // eastbound lane
    p.heading = 0;
    p.vx = 110; p.vy = 0;
    world.cam.x = p.x + 40;
    world.cam.y = p.y;
    world.money = 1250;
    dress(cars, [
      [0, 'h', 2, 1, 8 * PITCH - 220],
      [1, 'h', 2, -1, 8 * PITCH + 260],
      [2, 'v', 9, 1, 2 * PITCH + 140],
      [3, 'v', 8, 1, 2 * PITCH - 200],
      [4, 'v', 7, -1, 2 * PITCH + 180],
    ]);
  }
}

function dress(cars, placements) {
  for (const [k, axis, line, dir, pos] of placements) {
    const car = cars[k];
    if (!car || car.kind !== 'civilian') continue;
    placeCar(car, axis, line, dir, pos);
  }
}
