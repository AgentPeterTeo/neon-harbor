// Neon Harbor — the screenshot contract. ?shot=start|play|mission (with
// &seed=1) parks the game in a postcard of exactly that moment; any other
// query just plays. Everything forced here is deterministic under a seed,
// because every roll in the game comes from the one seeded LCG.
import { TILE, ROAD, DAY_SECONDS, START_HOUR, DOCK, PIER_ROW, C } from './config.js';
import { CAR_TYPES } from './car.js';

export function applyShot(game, name) {
  const g = game;
  const p = g.player;

  if (name === 'start') {
    // title postcard: mid-city plaza, mid-morning, traffic rolling through
    g.state = 'title';
    g.dn.t = ((10.8 - START_HOUR) / 24) * DAY_SECONDS;
    g.titleFocus = { x: 5 * TILE + ROAD / 2, y: 4 * TILE + ROAD / 2 };
    g.cam.fx = g.titleFocus.x;
    g.cam.fy = g.titleFocus.y;
    g.cam.z = 1.05;
    p.x = g.titleFocus.x + 170;
    p.y = g.titleFocus.y + 30;
    p.angle = 0.18;
    p.vx = 0;
    p.vy = 0;
    g.traffic.cars.length = 0;
    g.traffic.prime(g.titleFocus, p, 15, 130, 900);
    return;
  }

  if (name === 'play') {
    // daylight, mid-city avenue, HUD up, contract 1 live, traffic around
    g.state = 'play';
    g.dn.t = ((12.4 - START_HOUR) / 24) * DAY_SECONDS;
    p.x = 3 * TILE + 220;
    p.y = 5 * TILE + ROAD / 2 + 30;
    p.angle = 0;
    p.vx = 230;
    p.vy = 0;
    g.cam.fx = p.x;
    g.cam.fy = p.y;
    g.cam.z = 0.98;
    g.traffic.cars.length = 0;
    g.traffic.prime(p, p, 12, 180, 760);
    // two cars sharing this avenue for depth
    g.traffic.cars.push(g.traffic.makeCar('h', 5, 1, p.x + 330, CAR_TYPES[2], 96));
    g.traffic.cars.push(g.traffic.makeCar('h', 5, -1, p.x + 560, CAR_TYPES[4], 88));
    g.missions.idx = 0;
    g.missions.state = 'active';
    g.missions.stage = 0;
    g.missions.begin(); // deterministic marker from the seeded rng
    g.toast('CONTRACT 1 — HOT CARGO', C.cyan);
    return;
  }

  if (name === 'mission') {
    // night on the pier approach: cargo aboard, dock marker burning
    g.state = 'play';
    g.dn.t = ((22.25 - START_HOUR) / 24) * DAY_SECONDS;
    p.x = 10 * TILE + 500;
    p.y = PIER_ROW * TILE + ROAD / 2 + 30;
    p.angle = 0;
    p.vx = 250;
    p.vy = 0;
    g.cam.fx = p.x;
    g.cam.fy = p.y;
    g.cam.z = 0.97;
    g.traffic.cars.length = 0;
    g.traffic.prime(p, p, 8, 200, 900);
    g.missions.idx = 0;
    g.missions.state = 'active';
    g.missions.stage = 1;
    g.missions.pickup = { x: 2 * TILE + ROAD / 2, y: 2 * TILE + ROAD / 2 };
    g.missions.target = { x: DOCK.x, y: DOCK.y };
    g.police.setStars(2);
    g.toast('Cargo aboard — run it out to the pier', C.amber);
  }
}
