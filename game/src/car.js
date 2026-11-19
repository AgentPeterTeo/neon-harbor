// Neon Harbor — vehicles: the player coupe, six civilian silhouettes, the marked
// mission car and the police cruiser. One arcade physics step (forward/lateral
// velocity split, grip that drops into a drift when you yank the wheel) and one
// top-down painter (shadow, wheels, body, glass, lights, siren bar).

import { PLAYER, COP, PALETTE, clamp, lerp, roundRect } from './config.js';

export const CIVILIAN_STYLES = [
  { name: 'coupe', len: 40, wid: 20, body: '#31405f', roof: '#26334e' },
  { name: 'sedan', len: 44, wid: 20, body: '#5f4a63', roof: '#4a3a50' },
  { name: 'taxi', len: 44, wid: 21, body: '#c9a13b', roof: '#9a7a2c' },
  { name: 'van', len: 50, wid: 24, body: '#4a5a52', roof: '#3a4a44' },
  { name: 'truck', len: 60, wid: 24, body: '#3d5c66', roof: '#31505a' },
  { name: 'hatch', len: 38, wid: 19, body: '#5f3550', roof: '#4a2a40' },
];

export function createCar(kind, x, y, heading, style) {
  return {
    kind,
    x, y, heading,
    vx: 0, vy: 0,
    steer: 0,
    wheel: 0,           // wheel spin accumulator for the rolling ticks
    brakeGlow: 0,
    damage: 0,
    style: style || styleFor(kind),
  };
}

function styleFor(kind) {
  if (kind === 'player') {
    return { name: 'player', len: PLAYER.len, wid: PLAYER.wid, body: '#1d2f4f', roof: '#152441', stripe: PALETTE.cyan };
  }
  if (kind === 'police') {
    return { name: 'police', len: COP.len, wid: COP.wid, body: '#dfe6ee', roof: '#20242c' };
  }
  if (kind === 'target') {
    return { name: 'target', len: 44, wid: 21, body: '#ff2ea6', roof: '#c92185' };
  }
  return CIVILIAN_STYLES[0];
}

// Circle-ish radius for bump checks.
export function carRadius(car) {
  return (car.style.len + car.style.wid) / 4;
}

// The shared arcade step. throttle in [-1, 1] (brake then reverse), steerInput
// in [-1, 1] (right positive). Returns the forward speed component.
export function stepVehicle(car, throttle, steerInput, dt) {
  const spec = car.kind === 'police' ? COP : PLAYER;
  const h = car.heading;
  const fx = Math.cos(h), fy = Math.sin(h);
  const rx = -fy, ry = fx;

  // Velocity split into the car's own frame.
  let vf = car.vx * fx + car.vy * fy;
  let vl = car.vx * rx + car.vy * ry;

  // Steering eases toward the input; yanking it at speed is what breaks grip.
  car.steer = lerp(car.steer, steerInput, Math.min(1, 14 * dt));
  car.heading += car.steer * spec.turn * dt * clamp(vf / 150, -1, 1);

  if (throttle > 0) {
    vf += (vf < 0 ? spec.brake : spec.accel) * throttle * dt;
  } else if (throttle < 0) {
    if (vf > 12) vf += spec.brake * throttle * dt;       // braking hard
    else vf += spec.accel * 0.55 * throttle * dt;        // reverse crawl
  }
  vf -= vf * 0.45 * dt;                                   // drag
  vf = clamp(vf, -spec.maxRev, spec.maxFwd);

  const drifting = Math.abs(car.steer) > 0.55 && Math.abs(vf) > 260;
  const grip = drifting ? spec.driftGrip : spec.grip;
  vl -= vl * Math.min(1, grip * dt);                      // tires bite back

  car.brakeGlow = throttle < 0 && vf > 8 ? 1 : 0;

  // Recompose onto the (possibly rotated) heading.
  const nfx = Math.cos(car.heading), nfy = Math.sin(car.heading);
  car.vx = nfx * vf - nfy * vl;
  car.vy = nfy * vf + nfx * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.wheel += vf * dt / 6;
  return vf;
}

// Top-down body painter. Local frame: +x is forward.
export function drawCar(ctx, car, t) {
  const { len, wid } = car.style;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);

  // Ground shadow.
  ctx.fillStyle = 'rgba(3,5,10,0.45)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 6);
  ctx.fill();

  // Wheels: front pair steers, every tire shows a rolling tick.
  ctx.fillStyle = '#0a0d16';
  const wx = len / 2 - 9;
  const wy = wid / 2 - 3;
  for (const [px, py, front] of [
    [wx, -wy, 1], [wx, wy, 1],
    [-wx + 2, -wy, 0], [-wx + 2, wy, 0],
  ]) {
    ctx.save();
    ctx.translate(px, py);
    if (front) ctx.rotate(car.steer * 0.42);
    ctx.fillRect(-4.5, -2.5, 9, 5);
    const sp = Math.sin(car.wheel) * 3;
    ctx.strokeStyle = 'rgba(140,160,200,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-sp, -2);
    ctx.lineTo(sp, 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body.
  ctx.fillStyle = car.style.body;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hood sheen.
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(-len / 2 + 4, -wid / 2 + 2, len - 8, wid - 4);

  // Roof block between the glass.
  ctx.fillStyle = car.style.roof;
  roundRect(ctx, -len * 0.13, -wid / 2 + 3, len * 0.34, wid - 6, 3);
  ctx.fill();

  // Windshield + rear glass.
  ctx.fillStyle = 'rgba(160,215,255,0.75)';
  ctx.fillRect(len * 0.21, -wid / 2 + 3.5, 6, wid - 7);
  ctx.fillStyle = 'rgba(120,170,220,0.5)';
  ctx.fillRect(-len * 0.18, -wid / 2 + 4, 5, wid - 8);

  // Player racing stripe.
  if (car.kind === 'player' && car.style.stripe) {
    ctx.fillStyle = car.style.stripe;
    ctx.fillRect(-len / 2 + 3, -2, len - 6, 4);
  }

  // Headlights on the nose.
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 4);
  ctx.fillRect(len / 2 - 3, wid / 2 - 7, 3, 4);

  // Brake lights bloom when the pedal is down.
  if (car.brakeGlow) {
    ctx.fillStyle = '#ff3b4e';
    ctx.shadowColor = '#ff3b4e';
    ctx.shadowBlur = 9;
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 4);
    ctx.fillRect(-len / 2, wid / 2 - 7, 3, 4);
    ctx.shadowBlur = 0;
  }

  // Police: livery band + flashing light bar.
  if (car.kind === 'police') {
    ctx.fillStyle = '#11151c';
    ctx.fillRect(-len * 0.05, -wid / 2, len * 0.32, wid);
    const phase = Math.floor(t * 7) % 2 === 0;
    ctx.shadowBlur = 14;
    ctx.fillStyle = phase ? '#ff2e3e' : '#2e6bff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-len * 0.16, -4, 8, 8);
    ctx.fillStyle = phase ? '#2e6bff' : '#ff2e3e';
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-len * 0.16 + 10, -4, 8, 8);
    ctx.shadowBlur = 0;
  }

  // Battle soot once the panel damage climbs.
  if (car.damage > 35) {
    ctx.fillStyle = `rgba(10,10,12,${Math.min(0.55, car.damage / 160)})`;
    ctx.fillRect(-len / 2 + 2, -wid / 2 + 2, len * 0.3, wid - 4);
  }
  ctx.restore();
}

// Additive light pass (caller sets globalCompositeOperation='lighter').
// Headlight cone, tail glow, and the police siren splash on the tarmac.
export function drawCarLights(ctx, car, night, t) {
  const { len } = car.style;
  const h = car.heading;
  if (night > 0.25 && car.kind !== 'police') {
    const hx = car.x + Math.cos(h) * len / 2;
    const hy = car.y + Math.sin(h) * len / 2;
    const reach = car.kind === 'player' ? 185 : 120;
    const cone = car.kind === 'player' ? 0.42 : 0.55;
    const g = ctx.createLinearGradient(hx, hy, hx + Math.cos(h) * reach, hy + Math.sin(h) * reach);
    g.addColorStop(0, `rgba(255,240,190,${cone * night})`);
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(h - 0.34) * reach, hy + Math.sin(h - 0.34) * reach);
    ctx.lineTo(hx + Math.cos(h + 0.34) * reach, hy + Math.sin(h + 0.34) * reach);
    ctx.closePath();
    ctx.fill();
    const tx = car.x - Math.cos(h) * len / 2;
    const ty = car.y - Math.sin(h) * len / 2;
    ctx.fillStyle = 'rgba(255,60,80,0.3)';
    ctx.beginPath();
    ctx.arc(tx, ty, 10, 0, 7);
    ctx.fill();
  }
  if (car.kind === 'police') {
    const phase = Math.floor(t * 7) % 2 === 0;
    const col = phase ? '255,46,62' : '46,107,255';
    const g2 = ctx.createRadialGradient(car.x, car.y, 4, car.x, car.y, 66);
    g2.addColorStop(0, `rgba(${col},0.34)`);
    g2.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 66, 0, 7);
    ctx.fill();
  }
}
