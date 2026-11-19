// Neon Harbor — the contract chain. Five jobs, one neon city: run hot cargo
// to the pier, lose the two-star heat, sprint three checkpoints, jack a GT
// that does not want to be caught, and come home through a 4-star storm.
import {
  DOCK, SAFEHOUSE, MISSION_R, JACK_R, TILE, ROAD, C,
} from './config.js';
import { roadPoint } from './city.js';
import { carXY } from './traffic.js';

const TAU = Math.PI * 2;

export const MISSIONS = [
  { id: 'cargo', title: 'HOT CARGO', reward: 500 },
  { id: 'heat', title: 'LOSE THE HEAT', reward: 400 },
  { id: 'race', title: 'HARBOR RUSH', reward: 600 },
  { id: 'jack', title: 'GRAND THEFT', reward: 800 },
  { id: 'home', title: 'HOME RUN', reward: 1500 },
];

export class Missions {
  constructor(rand, player, traffic, police) {
    this.rand = rand;
    this.player = player;
    this.traffic = traffic;
    this.police = police;
    this.idx = 0;
    this.state = 'armed'; // armed -> active -> ... -> done
    this.arm = 4;
    this.stage = 0;
    this.timer = 0;
    this.pickup = null;
    this.checkpoints = null;
    this.targetCar = null;
    this.target = null;
  }

  /** Lay out the current mission (marker, timers, heat). Seeded, so a
      ?seed= query pins the whole chain. */
  begin() {
    const r = this.rand;
    const p = this.player;
    this.stage = 0;
    this.target = null;
    const m = MISSIONS[this.idx];
    if (m.id === 'cargo') {
      const pt = roadPoint(r, p.x, p.y, 380, 900) || roadPoint(r, p.x, p.y, 150, 1500);
      this.pickup = pt !== null ? { x: pt.x, y: pt.y } : { x: 6 * TILE + ROAD / 2, y: 6 * TILE + ROAD / 2 };
      this.target = this.pickup;
    } else if (m.id === 'heat') {
      this.police.setStars(2);
    } else if (m.id === 'race') {
      this.checkpoints = [];
      let anchor = { x: p.x, y: p.y };
      for (let k = 0; k < 3; k++) {
        let pt = null;
        for (let tries = 0; tries < 30 && pt === null; tries++) {
          pt = roadPoint(r, anchor.x, anchor.y, 900, 1600);
        }
        if (pt === null) pt = { x: 6 * TILE + ROAD / 2, y: 8 * TILE + ROAD / 2 };
        this.checkpoints.push(pt);
        anchor = pt;
      }
      this.timer = 60;
      this.target = this.checkpoints[0];
    } else if (m.id === 'jack') {
      this.targetCar = this.traffic.spawnTarget(p);
      this.target = carXY(this.targetCar);
    } else if (m.id === 'home') {
      this.police.setStars(4);
      this.target = { x: SAFEHOUSE.x, y: SAFEHOUSE.y };
    }
  }

  update(dt, game) {
    if (this.idx >= MISSIONS.length) return;
    if (this.state === 'armed') {
      this.arm -= dt;
      if (this.arm <= 0) {
        this.state = 'active';
        this.begin();
        game.toast(`CONTRACT ${this.idx + 1} — ${MISSIONS[this.idx].title}`, C.cyan);
      }
      return;
    }
    const m = MISSIONS[this.idx];
    const p = this.player;
    const d = (x, y) => Math.hypot(p.x - x, p.y - y);

    if (m.id === 'cargo') {
      if (this.stage === 0 && d(this.pickup.x, this.pickup.y) < MISSION_R) {
        this.stage = 1;
        this.target = { x: DOCK.x, y: DOCK.y };
        this.police.setStars(1);
        game.toast('Cargo aboard — run it out to the pier. They know.', C.amber);
      } else if (this.stage === 1 && d(DOCK.x, DOCK.y) < MISSION_R) {
        this.complete(game, 'Delivered. The dock crew owes you one.');
      }
    } else if (m.id === 'heat') {
      this.target = null;
      if (this.police.stars === 0) {
        this.complete(game, 'Clean again. The heat lost you.');
      }
    } else if (m.id === 'race') {
      this.timer -= dt;
      if (this.timer <= 0) {
        game.toast('Too slow — the route resets. Hit checkpoint 1.', C.red);
        this.begin();
        return;
      }
      const cp = this.checkpoints[this.stage];
      this.target = cp;
      if (d(cp.x, cp.y) < MISSION_R + 24) {
        this.stage++;
        if (this.stage >= 3) {
          this.complete(game, 'Clean sweep. You own these streets.');
        } else {
          game.toast(`CHECKPOINT ${this.stage}/3`, C.cyan);
        }
      }
    } else if (m.id === 'jack') {
      if (this.targetCar === null || this.traffic.cars.indexOf(this.targetCar) < 0) {
        this.targetCar = this.traffic.spawnTarget(p); // it got away; a new GT rolls out
      }
      const pos = carXY(this.targetCar);
      this.target = pos;
      if (d(pos.x, pos.y) < JACK_R && this.targetCar.speed < 70) {
        // take the ride
        p.spec = this.targetCar.spec;
        this.traffic.removeTarget();
        this.targetCar = null;
        this.police.setStars(Math.min(5, Math.max(1, this.police.stars + 1)));
        this.complete(game, 'Sweet ride. Now everyone wants it back.');
      }
    } else if (m.id === 'home') {
      if (d(SAFEHOUSE.x, SAFEHOUSE.y) < MISSION_R + 20) {
        this.police.setStars(0);
        this.complete(game, 'Home safe. The harbor is yours.');
      }
    }
  }

  complete(game, msg) {
    const m = MISSIONS[this.idx];
    game.cash += m.reward;
    game.fx.cash(this.player.x, this.player.y - 24, `+$${m.reward}`, C.green);
    game.toast(`${m.title} COMPLETE — +$${m.reward}`, C.green);
    if (msg !== '') game.toast(msg, C.white);
    game.police.setStars(0);
    this.idx += 1;
    this.target = null;
    if (this.idx >= MISSIONS.length) {
      this.state = 'done';
      game.campaignDone = true;
      game.toast('CAMPAIGN COMPLETE — free roam unlocked', C.magenta);
      return;
    }
    this.state = 'armed';
    this.arm = 4;
  }

  /** The one-line status the HUD shows. */
  hudLine() {
    if (this.idx >= MISSIONS.length) return 'ALL CONTRACTS COMPLETE — free roam';
    const m = MISSIONS[this.idx];
    if (this.state === 'armed') return `NEXT CONTRACT — ${m.title} (in ${Math.max(1, Math.ceil(this.arm))}s)`;
    switch (m.id) {
      case 'cargo':
        return this.stage === 0 ? 'HOT CARGO — grab the stash at the marker' : 'HOT CARGO — run it to the pier dock';
      case 'heat':
        return 'LOSE THE HEAT — get the stars off your tail';
      case 'race':
        return `HARBOR RUSH — checkpoint ${this.stage + 1}/3, ${Math.ceil(this.timer)}s`;
      case 'jack':
        return 'GRAND THEFT — ram the neon GT, then take it';
      case 'home':
        return 'HOME RUN — get to the safehouse, do not stop';
    }
    return '';
  }
}

/** Ground marker for the current goal: pulsing ring + rotating chevrons. */
export function drawMarker(ctx, target, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = C.magenta;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, MISSION_R + pulse * 10, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = C.magenta;
  ctx.beginPath();
  ctx.arc(0, 0, MISSION_R * (0.72 + 0.1 * pulse), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.rotate(t * 0.8);
  ctx.fillStyle = C.magenta;
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * TAU) / 4);
    ctx.beginPath();
    ctx.moveTo(MISSION_R + 24, 0);
    ctx.lineTo(MISSION_R + 4, -11);
    ctx.lineTo(MISSION_R + 4, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Additive glow so the marker burns through the dark. */
export function drawMarkerGlow(ctx, target, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.fillStyle = `rgba(255,43,214,${(0.13 + 0.09 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(target.x, target.y, MISSION_R * 1.55, 0, TAU);
  ctx.fill();
}
