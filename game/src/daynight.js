// Neon Harbor — the clock and the light: a sine-ish day/night cycle, the warm
// dawn/dusk wash, the night veil, and the additive pass that makes the city glow
// (street lamps, building neon, headlight cones, siren splashes).

import { PALETTE, hexA, clamp } from './config.js';
import { drawCarLights } from './car.js';

// 12 real seconds per game hour -> a full day in under five minutes.
export function createClock(t0 = 9) {
  return { t: t0, frozen: false };
}

export function updateClock(clock, dt) {
  if (!clock.frozen) clock.t = (clock.t + dt / 12) % 24;
}

// 0 = deep night, 1 = full day.
export function dayLight(t) {
  if (t >= 8 && t <= 17) return 1;
  if (t >= 20 || t <= 4.5) return 0;
  if (t < 8) return clamp((t - 4.5) / 3.5, 0, 1); // dawn
  return clamp(1 - (t - 17) / 3, 0, 1);          // dusk
}

// Orange wash strength around sunrise/sunset.
export function duskWarm(t) {
  const dawn = Math.max(0, 1 - Math.abs(t - 6.25) / 1.75);
  const dusk = Math.max(0, 1 - Math.abs(t - 18.5) / 1.5);
  return Math.max(dawn, dusk);
}

export function clockText(t) {
  const h = Math.floor(t) % 24;
  const m = Math.floor((t % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// The lighting stack, drawn over the world inside the camera transform:
// warm wash -> night veil -> additive lamps/neon/vehicle lights.
export function drawLighting(ctx, world, view, t) {
  const L = dayLight(world.clock.t);
  const warm = duskWarm(world.clock.t);
  const w = view.x1 - view.x0;
  const h = view.y1 - view.y0;

  if (warm > 0.02) {
    ctx.fillStyle = `rgba(255,120,50,${(0.11 * warm).toFixed(3)})`;
    ctx.fillRect(view.x0, view.y0, w, h);
  }
  if (L >= 0.995) return;

  const nl = 1 - L;
  ctx.fillStyle = `rgba(9,12,34,${(0.62 * nl).toFixed(3)})`;
  ctx.fillRect(view.x0, view.y0, w, h);

  ctx.globalCompositeOperation = 'lighter';

  // Street lamps at their intersections.
  for (const lamp of world.city.lamps) {
    if (lamp.x < view.x0 - 60 || lamp.x > view.x1 + 60) continue;
    if (lamp.y < view.y0 - 60 || lamp.y > view.y1 + 60) continue;
    const g = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 60);
    g.addColorStop(0, `rgba(120,190,255,${(0.16 * nl).toFixed(3)})`);
    g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 60, 0, 7);
    ctx.fill();
  }

  // Building neon blooms.
  for (const spot of world.city.neonSpots) {
    if (spot.x < view.x0 - 90 || spot.x > view.x1 + 90) continue;
    if (spot.y < view.y0 - 90 || spot.y > view.y1 + 90) continue;
    const g = ctx.createRadialGradient(spot.x, spot.y, 2, spot.x, spot.y, spot.r);
    g.addColorStop(0, hexA(spot.color, 0.12 * nl));
    g.addColorStop(1, hexA(spot.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r, 0, 7);
    ctx.fill();
  }

  // Vehicle lights (the caller pre-filters to what's on screen).
  for (const car of world.litCars) drawCarLights(ctx, car, nl, t);

  ctx.globalCompositeOperation = 'source-over';
}
