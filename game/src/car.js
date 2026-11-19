// Neon Harbor — cars. One sprite painter draws every vehicle in the game
// (player, traffic, police, the jackable sportscar); the player adds arcade
// physics with a lateral-grip model so hard corners slide into drifts, and
// skid marks + sparks + floating cash text live here too.
import { C, PHYS } from './config.js';
import { blockedCircle } from './city.js';

export const CAR_TYPES = [
  { name: 'Pulse GT', body: '#39ff88', w: 34, h: 17 },
  { name: 'Driftline', body: '#00d0e8', w: 32, h: 16 },
  { name: 'Vagrant', body: '#ff2bd6', w: 33, h: 17 },
  { name: 'Boxer', body: '#8fa3c8', w: 36, h: 18 },
  { name: 'Kabu', body: '#ffb400', w: 34, h: 17 },
  { name: 'Silhouette', body: '#5a6a8c', w: 35, h: 18 },
];
export const SPORT_SPEC = { name: 'Jackpot GT', body: '#ff2bd6', w: 36, h: 17, sport: true };
export const POLICE_SPEC = { name: 'Harbor PD', body: '#e8eef8', w: 37, h: 18, police: true };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * f) | 0;
  const b = Math.min(255, (n & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The shared car sprite. o = { x, y, angle, steer, braking, roll, flash }.
 * roll drives the spinning hub lines, flash the police light bar.
 */
export function drawCarBody(ctx, spec, o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);
  const w = spec.w, h = spec.h;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(1, 3, w * 0.54, h * 0.68, 0, 0, 6.283);
  ctx.fill();

  // wheels; the front pair points with the steer, hub lines show the spin
  const wheel = (wx, wy, rot) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(rot);
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(-4, -2.7, 8, 5.4);
    const ph = ((o.roll || 0) * 0.11) % 6.283;
    ctx.strokeStyle = 'rgba(130,150,190,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ph) * 3, Math.sin(ph) * 3);
    ctx.lineTo(-Math.cos(ph) * 3, -Math.sin(ph) * 3);
    ctx.stroke();
    ctx.restore();
  };
  const st = o.steer || 0;
  wheel(w * 0.3, -h * 0.64, st);
  wheel(w * 0.3, h * 0.64, st);
  wheel(-w * 0.32, -h * 0.64, 0);
  wheel(-w * 0.32, h * 0.64, 0);

  // body with a vertical light gradient
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, shade(spec.body, 1.3));
  g.addColorStop(0.5, spec.body);
  g.addColorStop(1, shade(spec.body, 0.62));
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, -h / 2, w, h, 4.5);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(6,8,16,0.85)';
  ctx.stroke();

  if (spec.police) {
    ctx.fillStyle = '#101425';
    ctx.fillRect(-w * 0.16, -h / 2, w * 0.3, h);
  }
  if (spec.sport) {
    ctx.fillStyle = shade(spec.body, 0.55);
    ctx.fillRect(-w / 2 - 2, -h * 0.5, 2.5, h); // spoiler lip
  }

  // glass: windshield at the nose, rear window, roof between
  ctx.fillStyle = 'rgba(9,14,28,0.92)';
  roundRect(ctx, w * 0.08, -h * 0.36, w * 0.17, h * 0.72, 2);
  ctx.fill();
  roundRect(ctx, -w * 0.3, -h * 0.34, w * 0.13, h * 0.68, 2);
  ctx.fill();
  ctx.fillStyle = shade(spec.body, 0.86);
  roundRect(ctx, -w * 0.17, -h * 0.38, w * 0.25, h * 0.76, 2);
  ctx.fill();

  // police light bar
  if (spec.police) {
    const on = o.flash != null ? Math.sin(o.flash * 14) > 0 : false;
    ctx.fillStyle = on ? '#ff4757' : '#7a1626';
    ctx.fillRect(-w * 0.05, -h * 0.32, 5, 4);
    ctx.fillStyle = on ? '#3d5dff' : '#16267a';
    ctx.fillRect(-w * 0.05, h * 0.32 - 4, 5, 4);
  }

  // head and tail lights
  ctx.fillStyle = '#ffedbe';
  ctx.fillRect(w / 2 - 3, -h * 0.4, 2.4, 3.4);
  ctx.fillRect(w / 2 - 3, h * 0.4 - 3.4, 2.4, 3.4);
  ctx.fillStyle = o.braking ? '#ff4757' : '#7a1626';
  ctx.fillRect(-w / 2 + 0.6, -h * 0.42, 2.2, 3.2);
  ctx.fillRect(-w / 2 + 0.6, h * 0.42 - 3.2, 2.2, 3.2);
  ctx.restore();
}

/** Additive headlight cones + tail glow, drawn in the lights pass. */
export function drawCarLights(ctx, x, y, angle, night, opts = {}) {
  if (night < 0.1) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const len = opts.len || 120;
  const a = 0.13 * night * (opts.dim ? 0.6 : 1);
  ctx.fillStyle = `rgba(255,240,196,${a})`;
  for (const side of [-1, 1]) {
    const tx = x + cos * len - sin * side * 8;
    const ty = y + sin * len + cos * side * 8;
    const ox2 = x + cos * len - sin * side * 34;
    const oy2 = y + sin * len + cos * side * 34;
    ctx.beginPath();
    ctx.moveTo(x + cos * 14 - sin * side * 6, y + sin * 14 + cos * side * 6);
    ctx.lineTo(tx, ty);
    ctx.lineTo(ox2, oy2);
    ctx.closePath();
    ctx.fill();
  }
  const bx = x - cos * 17, by = y - sin * 17;
  ctx.fillStyle = opts.braking ? 'rgba(255,60,70,0.5)' : `rgba(255,60,70,${0.2 * night})`;
  ctx.beginPath();
  ctx.arc(bx, by, 5, 0, 6.283);
  ctx.fill();
}

/** The player's ride. Arcade physics: throttle/brake along the heading,
 * lateral grip that lets go at speed -> drifts, skids and sparks. */
export class PlayerCar {
  constructor(spec, x, y, angle) {
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0;
    this.roll = 0;
    this.hull = 100;
    this.braking = false;
    this.driftHeat = 0;
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt, inp, city, marks, fx, shake) {
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    let vf = this.vx * cos + this.vy * sin; // forward speed
    let vr = -this.vx * sin + this.vy * cos; // lateral slide
    const steerIn = (inp.right() ? 1 : 0) - (inp.left() ? 1 : 0);

    if (inp.up()) vf += PHYS.accel * dt;
    if (inp.down()) vf += (vf > 6 ? -PHYS.brake : -PHYS.reverse) * dt;
    vf -= vf * PHYS.drag * dt;
    vf = Math.max(-PHYS.maxRev, Math.min(PHYS.maxFwd, vf));

    // steering locks with speed and flips in reverse
    const sp01 = Math.min(1, Math.abs(vf) / 120);
    const turn = steerIn * PHYS.turn * sp01 * (vf >= 0 ? 1 : -1);
    this.angle += turn * dt;
    this.steer += (steerIn * 0.45 - this.steer) * Math.min(1, 9 * dt);

    // grip: firm while planted, loose when hauling into a corner
    const sliding = Math.abs(steerIn) > 0 && Math.abs(vf) > 200;
    vr -= vr * (sliding ? PHYS.driftGrip : PHYS.grip) * dt;

    // recompose (basis captured before the turn, so rotation is not doubled)
    this.vx = vf * cos - vr * sin;
    this.vy = vf * sin + vr * cos;
    const sp = this.speed;
    if (sp > PHYS.maxFwd) {
      const k = PHYS.maxFwd / sp;
      this.vx *= k;
      this.vy *= k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.braking = inp.down() && vf > 8;
    this.roll += sp * dt;
    this.driftHeat = Math.max(0, this.driftHeat - dt * 40);
    if (Math.abs(vr) > 50) this.driftHeat = Math.min(1, this.driftHeat + dt * 2);

    // rubber down while sliding
    if (Math.abs(vr) > 58) {
      const rx = this.x - cos * 13, ry = this.y - sin * 13;
      marks.add(rx + sin * 5.5, ry - cos * 5.5, this.angle, Math.abs(vr));
      marks.add(rx - sin * 5.5, ry + cos * 5.5, this.angle, Math.abs(vr));
    }

    // nose and tail circles against the world
    for (const s of [13, -13]) {
      const px = this.x + cos * s, py = this.y + sin * s;
      const hit = blockedCircleSafe(city, px, py, PHYS.radius);
      if (hit === null) continue;
      this.x += hit.nx * hit.depth;
      this.y += hit.ny * hit.depth;
      const vn = this.vx * hit.nx + this.vy * hit.ny;
      if (vn < 0) {
        this.vx -= 1.55 * vn * hit.nx;
        this.vy -= 1.55 * vn * hit.ny;
        const impact = Math.min(1, -vn / 240);
        if (impact > 0.14) {
          fx.spark(px, py, 3 + ((impact * 9) | 0), '#ffd27a');
          this.hull -= impact * 24;
          shake(impact * 8);
        }
      }
    }
  }

  draw(ctx) {
    drawCarBody(ctx, this.spec, {
      x: this.x, y: this.y, angle: this.angle,
      steer: this.steer, braking: this.braking, roll: this.roll,
    });
  }

  drawLights(ctx, night) {
    drawCarLights(ctx, this.x, this.y, this.angle, night, { len: 130, braking: this.braking });
    if (night > 0.1 && this.spec.sport) {
      ctx.fillStyle = `rgba(255,43,214,${0.1 * night})`;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 27, 15, this.angle, 0, 6.283);
      ctx.fill();
    }
  }
}

function blockedCircleSafe(city, x, y, r) {
  if (!city) return null;
  return blockedCircle(city, x, y, r);
}

/** Tyre marks: short dark strokes that fade over ~7 seconds. */
export class SkidMarks {
  constructor() {
    this.list = [];
  }
  add(x, y, angle, strength) {
    this.list.push({ x, y, a: angle, s: Math.min(1, strength / 150), life: 1 });
    if (this.list.length > 420) this.list.splice(0, this.list.length - 420);
  }
  update(dt) {
    for (const m of this.list) m.life -= dt * 0.14;
    this.list = this.list.filter((m) => m.life > 0);
  }
  draw(ctx) {
    ctx.lineWidth = 2.4;
    for (const m of this.list) {
      const cos = Math.cos(m.a), sin = Math.sin(m.a);
      ctx.strokeStyle = `rgba(5,8,16,${(0.4 * m.life * m.s).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(m.x - cos * 4 - sin * 5.5, m.y - sin * 4 + cos * 5.5);
      ctx.lineTo(m.x + cos * 4 - sin * 5.5, m.y + sin * 4 + cos * 5.5);
      ctx.moveTo(m.x - cos * 4 + sin * 5.5, m.y - sin * 4 - cos * 5.5);
      ctx.lineTo(m.x + cos * 4 + sin * 5.5, m.y + sin * 4 - cos * 5.5);
      ctx.stroke();
    }
  }
}

/** Sparks, smoke and floating cash text. All rolls come from the seeded RNG. */
export class FX {
  constructor(rand) {
    this.rand = rand;
    this.p = [];
    this.texts = [];
  }
  spark(x, y, n, color) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * 6.283;
      const sp = 40 + this.rand() * 200;
      this.p.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.2 + this.rand() * 0.3, color, r: 1 + this.rand() * 1.6,
      });
    }
  }
  smoke(x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * 6.283;
      this.p.push({
        kind: 'smoke', x, y,
        vx: Math.cos(a) * 26, vy: Math.sin(a) * 26 - 14,
        life: 0.7 + this.rand() * 0.5, r: 4 + this.rand() * 5,
      });
    }
  }
  cash(x, y, str, color) {
    this.texts.push({ x, y, str, color, life: 1.5 });
  }
  update(dt) {
    for (const p of this.p) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    this.p = this.p.filter((p) => p.life > 0);
    for (const tx of this.texts) {
      tx.y -= 34 * dt;
      tx.life -= dt;
    }
    this.texts = this.texts.filter((tx) => tx.life > 0);
  }
  draw(ctx) {
    // smoke in the world layer (dark, soft)
    for (const p of this.p) {
      if (p.kind !== 'smoke') continue;
      ctx.fillStyle = `rgba(120,130,150,${(0.25 * p.life).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.6 - p.life), 0, 6.283);
      ctx.fill();
    }
    for (const tx of this.texts) {
      const a = Math.min(1, tx.life);
      ctx.font = '700 17px "Arial Black", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = tx.color;
      ctx.globalAlpha = a;
      ctx.shadowColor = tx.color;
      ctx.shadowBlur = 12;
      ctx.fillText(tx.str, tx.x, tx.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }
  drawLights(ctx) {
    // sparks punch through the night in the additive pass
    for (const p of this.p) {
      if (p.kind !== 'spark') continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life * 2.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
