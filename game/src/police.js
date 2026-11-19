// Neon Harbor — the Harbor PD. Crimes need a witness (or a cop) to raise the
// wanted level; stars then bring arcade chasers that corner, ram and arrest.
// Keep it quiet and out of sight and the heat drains away.
import { POLICE_SPEC, drawCarBody, drawCarLights } from './car.js';
import { blockedCircle, roadPoint } from './city.js';

const TAU = Math.PI * 2;

export class Police {
  constructor(city, rand) {
    this.city = city;
    this.rand = rand;
    this.stars = 0;
    this.cars = [];
    this.quiet = 0; // seconds since the last witnessed crime
    this.drain = 0; // progress toward losing a star
  }

  setStars(n) {
    this.stars = Math.max(0, Math.min(5, n));
    this.quiet = 0;
    this.drain = 0;
  }

  reportCrime(kind, spot, traffic, offender) {
    // 'cop': an officer saw it, no witnesses needed. 'traffic': somebody
    // nearby has to see it or the hit never happened.
    let seen = kind === 'cop';
    if (!seen) {
      seen = traffic.cars.some((c) => {
        if (c === offender) return false;
        const dx = (c.axis === 'h' ? c.u : c.v) - spot.x;
        const dy = (c.axis === 'h' ? c.v : c.u) - spot.y;
        return dx * dx + dy * dy < 300 * 300;
      });
    }
    if (seen && this.stars < 5) this.setStars(this.stars + 1);
    this.quiet = 0;
    this.drain = 0;
    return seen;
  }

  update(dt, game) {
    const player = game.player;
    if (this.stars === 0) {
      this.cars.length = 0;
      return;
    }
    this.quiet += dt;

    // staffing: one unit per star, two from three stars up, six max
    const want = Math.min(6, this.stars + (this.stars >= 3 ? 2 : 1));
    while (this.cars.length < want) {
      const p = roadPoint(this.rand, player.x, player.y, 650, 1150);
      if (p === null) break;
      this.cars.push({
        x: p.x, y: p.y,
        angle: p.axis === 'h' ? (p.sgn > 0 ? 0 : Math.PI) : (p.sgn > 0 ? Math.PI / 2 : -Math.PI / 2),
        speed: 130, stuck: 0, hitCool: 0,
      });
    }
    if (this.cars.length > want) this.cars.length = want;

    let nearest = 1e9;
    for (const cop of this.cars) nearest = Math.min(nearest, Math.hypot(cop.x - player.x, cop.y - player.y));
    for (const cop of this.cars) this.chase(dt, cop, player, game);

    // heat drain: nine quiet seconds with no unit within 520 px, then ~5s a star
    if (this.quiet > 9 && nearest > 520) {
      this.drain += dt;
      if (this.drain > 5) {
        this.setStars(this.stars - 1);
      }
    } else {
      this.drain = 0;
    }
  }

  chase(dt, cop, player, game) {
    const dx = player.x - cop.x, dy = player.y - cop.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 30 && player.speed < 55) {
      game.doBusted();
      return;
    }
    let da = Math.atan2(dy, dx) - cop.angle;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    const rate = 2.5 + this.stars * 0.18;
    cop.angle += Math.max(-rate * dt, Math.min(rate * dt, da));

    const cruise = 205 + this.stars * 20 + (d > 900 ? 90 : 0);
    cop.speed += Math.max(-320 * dt, Math.min(230 * dt, cruise - cop.speed));
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;

    // nose circle against the world; a graze nudges the heading loose
    const nx = cop.x + Math.cos(cop.angle) * 12;
    const ny = cop.y + Math.sin(cop.angle) * 12;
    const hit = blockedCircle(this.city, nx, ny, 12);
    if (hit) {
      cop.x += hit.nx * hit.depth;
      cop.y += hit.ny * hit.depth;
      cop.angle += (this.rand() - 0.5) * 0.6;
      cop.speed *= 0.72;
    }

    // wedged against a wall: call it in and re-deploy
    if (cop.speed < 30 && d > 140) cop.stuck += dt;
    else cop.stuck = Math.max(0, cop.stuck - dt);
    if (cop.stuck > 1.8) {
      const p = roadPoint(this.rand, player.x, player.y, 500, 900);
      if (p !== null) {
        cop.x = p.x;
        cop.y = p.y;
        cop.angle = p.axis === 'h' ? (p.sgn > 0 ? 0 : Math.PI) : (p.sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
        cop.speed = 130;
      }
      cop.stuck = 0;
    }

    // contact: slow busts above, fast rams shove and hurt
    cop.hitCool -= dt;
    if (d < 30 && cop.hitCool <= 0) {
      cop.hitCool = 0.5;
      const ux = dx / d, uy = dy / d;
      player.vx += ux * 130;
      player.vy += uy * 130;
      player.hull -= 7;
      cop.speed *= 0.55;
      game.fx.spark((player.x + cop.x) / 2, (player.y + cop.y) / 2, 8, '#ffd27a');
      game.shake(6);
    }
  }

  draw(ctx, t) {
    for (let k = 0; k < this.cars.length; k++) {
      const cop = this.cars[k];
      drawCarBody(ctx, POLICE_SPEC, {
        x: cop.x, y: cop.y, angle: cop.angle, roll: cop.speed * t, flash: t + k * 0.31,
      });
    }
  }

  drawLights(ctx, night, t) {
    for (let k = 0; k < this.cars.length; k++) {
      const cop = this.cars[k];
      drawCarLights(ctx, cop.x, cop.y, cop.angle, Math.max(night, 0.35), { len: 110 });
      // red/blue splash under the cruiser, day or night once it's hunting
      const red = Math.sin((t + k * 0.31) * 14) > 0;
      ctx.fillStyle = red ? 'rgba(255,60,70,0.16)' : 'rgba(70,100,255,0.16)';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y, 46, 0, TAU);
      ctx.fill();
    }
  }
}
