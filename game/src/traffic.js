// Neon Harbor — traffic. Lane-locked AI drivers: keep to the right, brake
// behind whatever rolls in front of you, pick a way through each junction,
// never take to the water. The jackable sportscar of mission 4 lives here too.
import {
  TILE, ROAD, GRID, WORLD, WATER_COL, PIER_ROW, BRIDGE_ROW, TRAFFIC_N,
} from './config.js';
import { CAR_TYPES, SPORT_SPEC, drawCarBody, drawCarLights } from './car.js';
import { laneFixed, roadPoint } from './city.js';

const center = (k) => k * TILE + ROAD / 2;

export function carXY(car) {
  return car.axis === 'h' ? { x: car.u, y: car.v } : { x: car.v, y: car.u };
}
export function carAngle(car) {
  if (car.axis === 'h') return car.sgn > 0 ? 0 : Math.PI;
  return car.sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export class Traffic {
  constructor(city, rand) {
    this.city = city;
    this.rand = rand;
    this.cars = [];
    this.target = null; // the mission-4 sportscar
  }

  makeCar(axis, line, sgn, u, spec, cruise) {
    return {
      spec, axis, line, sgn, u,
      v: laneFixed(axis, line, sgn),
      cruise, speed: cruise * 0.6, roll: 0,
      braking: false, target: false, _d: 0,
    };
  }

  trySpawn(anchor, player, rMin, rMax) {
    const p = roadPoint(this.rand, anchor.x, anchor.y, rMin, rMax);
    if (p === null) return false;
    if (player && Math.hypot(p.x - player.x, p.y - player.y) < 260) return false;
    for (const c of this.cars) {
      const { x, y } = carXY(c);
      if (Math.hypot(x - p.x, y - p.y) < 110) return false;
    }
    const spec = CAR_TYPES[(this.rand() * CAR_TYPES.length) | 0];
    const cruise = 72 + this.rand() * 46;
    this.cars.push(this.makeCar(p.axis, p.line, p.sgn, p.u, spec, cruise));
    return true;
  }

  /** Burst-fill for a composed scene (title backdrop, shot setup). */
  prime(anchor, player, n, rMin, rMax) {
    for (let k = 0; k < n; k++) this.trySpawn(anchor, player, rMin, rMax);
  }

  spawnTarget(player) {
    if (this.target) return this.target;
    let p = roadPoint(this.rand, player.x, player.y, 500, 900);
    if (p === null) p = roadPoint(this.rand, player.x, player.y, 300, 1400);
    const car = this.makeCar(p.axis, p.line, p.sgn, p.u, SPORT_SPEC, 150);
    car.target = true;
    this.target = car;
    this.cars.push(car);
    return car;
  }

  removeTarget() {
    if (this.target === null) return;
    this.cars = this.cars.filter((c) => c !== this.target);
    this.target = null;
  }

  update(dt, anchor, player) {
    const r = this.rand;
    for (const c of this.cars) {
      const { x, y } = carXY(c);
      c._d = Math.hypot(x - anchor.x, y - anchor.y);
    }
    let spawns = 0;
    while (this.cars.length < TRAFFIC_N && spawns < 2) {
      if (!this.trySpawn(anchor, player, 700, 1500)) break;
      spawns++;
    }

    for (const car of this.cars) {
      // what is directly in front of this driver?
      const fwdX = car.axis === 'h' ? car.sgn : 0;
      const fwdY = car.axis === 'v' ? car.sgn : 0;
      const px = car.axis === 'h' ? car.u : car.v;
      const py = car.axis === 'h' ? car.v : car.u;
      const blocks = (ox, oy) => {
        const rx = ox - px, ry = oy - py;
        const along = rx * fwdX + ry * fwdY;
        const lat = Math.abs(rx * -fwdY + ry * fwdX);
        return along > 6 && along < 120 && lat < 28;
      };
      let want = car.target && car._d < 220 ? car.cruise + 30 : car.cruise;
      for (const other of this.cars) {
        if (other === car) continue;
        const { x, y } = carXY(other);
        if (blocks(x, y)) { want = 0; break; }
      }
      if (want > 0 && blocks(player.x, player.y)) want = 0;

      const prev = car.u;
      car.speed += Math.max(-280 * dt, Math.min(115 * dt, want - car.speed));
      if (want === 0 && car.speed < 2) car.speed = 0;
      car.braking = want === 0 && car.speed > 4;
      car.u += car.sgn * car.speed * dt;
      car.roll += car.speed * dt;

      // junctions: the crossed perpendicular line, if any
      const kMax = car.axis === 'h' ? GRID - 2 : GRID - 1;
      const lo = Math.max(0, Math.floor(Math.min(prev, car.u) / TILE) - 1);
      const hi = Math.min(kMax, Math.floor(Math.max(prev, car.u) / TILE) + 1);
      for (let k = lo; k <= hi; k++) {
        const cU = center(k);
        if ((prev - cU) * (car.u - cU) >= 0) continue; // not crossed this frame
        this.junction(car, k, r);
        break;
      }
      // offworld cars vanish; only the pier and bridge rows run to the edge
      if (car.u < 70) car._gone = true;
      else if (car.axis === 'v') {
        if (car.u > WORLD - 70) car._gone = true;
      } else if (car.sgn > 0) {
        const edge = (car.line === PIER_ROW || car.line === BRIDGE_ROW) ? WORLD - 70 : (GRID - 1) * TILE - 40;
        if (car.u > edge) car._gone = true;
      }
    }
    this.cars = this.cars.filter((c) => !c._gone && (c.target || c._d < 2400));

    // the jackable GT stays in play near the player
    if (this.target && this.target._d > 2400) {
      this.removeTarget();
      this.spawnTarget(player);
    }
  }

  /** Decide at line k: cruise through, or turn onto it. */
  junction(car, k, r) {
    const straightOK = this.canGoStraight(car, k);
    const turns = this.turnOptions(car, k);
    if (straightOK && (turns.length === 0 || r() < 0.55)) return;
    if (turns.length === 0) {
      if (!straightOK) car._gone = true;
      return;
    }
    const sgn = turns[(r() * turns.length) | 0];
    const oldLine = car.line;
    car.axis = car.axis === 'h' ? 'v' : 'h';
    car.line = k;
    car.sgn = sgn;
    car.v = laneFixed(car.axis, k, sgn);
    car.u = center(oldLine) + sgn * 18;
    car.speed *= 0.8;
  }

  canGoStraight(car, k) {
    if (car.axis === 'v') return true; // rows run the whole map height
    if (car.sgn > 0) {
      // eastbound: past the last line k=GRID-2 only the pier and bridge run on
      if (k === GRID - 2) return car.line === PIER_ROW || car.line === BRIDGE_ROW;
      return true;
    }
    return k - 1 >= 0; // westbound: runs out of map at line 0
  }

  turnOptions(car, k) {
    const out = [];
    if (car.axis === 'h') {
      // onto vertical line k: south needs rows below, north rows above
      if (car.line <= GRID - 2) out.push(1);
      if (car.line >= 1) out.push(-1);
    } else {
      // onto horizontal line k: east is always a road, west needs a column
      out.push(1);
      if (car.line >= 1) out.push(-1);
    }
    return out;
  }

  /** Push the player off any car they drive into; hard hits are crimes. */
  collidePlayer(player, game) {
    for (const car of this.cars) {
      const { x, y } = carXY(car);
      const dx = player.x - x, dy = player.y - y;
      const d = Math.hypot(dx, dy);
      if (d > 26 || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      const overlap = 26 - d;
      player.x += nx * overlap * 0.6;
      player.y += ny * overlap * 0.6;
      const vn = player.vx * nx + player.vy * ny;
      if (vn < -60) {
        player.vx -= 1.35 * vn * nx;
        player.vy -= 1.35 * vn * ny;
        player.hull -= 3;
        car.speed *= 0.35;
        car.braking = true;
        game.fx.spark((x + player.x) / 2, (y + player.y) / 2, 6, '#ffd27a');
        game.shake(4);
        if (!car.target) game.police.reportCrime('traffic', { x, y }, this, car);
      } else {
        player.vx += nx * 40;
        player.vy += ny * 40;
      }
    }
  }

  draw(ctx) {
    for (const car of this.cars) {
      const { x, y } = carXY(car);
      drawCarBody(ctx, car.spec, { x, y, angle: carAngle(car), braking: car.braking, roll: car.roll });
    }
  }

  drawLights(ctx, night) {
    for (const car of this.cars) {
      const { x, y } = carXY(car);
      drawCarLights(ctx, x, y, carAngle(car), night, { len: 95, dim: true, braking: car.braking });
    }
  }
}
