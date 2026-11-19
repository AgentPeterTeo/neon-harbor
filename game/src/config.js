// Neon Harbor — shared constants: view size, city scale, neon palette, handling
// numbers and the tiny math/draw helpers every other module leans on.
// One source of truth so the city, cars, cops and HUD always agree on scale.

export const VIEW_W = 960;
export const VIEW_H = 540;

// City grid: roads run along the lines x = i*PITCH and y = j*PITCH.
export const PITCH = 280;            // block-to-block distance
export const ROAD_W = 96;            // full road width (two lanes)
export const LANE = 24;              // lane centre offset from the road centre line
export const NX = 10;                // vertical road lines: 0..NX
export const NY = 7;                 // horizontal road lines: 0..NY
export const WORLD_W = NX * PITCH;   // 2800
export const WORLD_H = NY * PITCH;   // 1960
export const WATER_ROW = 3;         // this horizontal line is a canal, not a road

// Arcade handling (px, px/s, rad). Player coupe and police cruiser.
export const PLAYER = {
  accel: 320, brake: 640, maxFwd: 430, maxRev: 140,
  turn: 2.3, grip: 5.4, driftGrip: 1.7, len: 44, wid: 22,
};
export const COP = {
  accel: 300, brake: 560, maxFwd: 405, maxRev: 140,
  turn: 2.55, grip: 6.2, driftGrip: 2.0, len: 46, wid: 23,
};
export const KMH = 0.42; // px/s -> km/h display factor

// Synthwave palette: deep navy ground, neon cyan/magenta/amber accents.
export const PALETTE = {
  bg: '#0a0e1a',
  ground: '#0e1322',
  road: '#20263a',
  roadEdge: '#39415c',
  roadLine: '#55648e',
  sidewalk: '#161c2e',
  water: '#0d2438',
  park: '#102a1e',
  dock: '#1b2133',
  cyan: '#25e6ff',
  magenta: '#ff2ea6',
  amber: '#ffb347',
  green: '#39ff88',
  violet: '#8a5cff',
  red: '#ff4d5e',
  hud: '#cfe6ff',
};

// Seeded LCG. The city layout, traffic turns, cop spawns — everything random in
// the world draws from makeRng streams, never bare Math.random, so ?seed=1
// reproduces the exact same city and the same screenshot.
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// Shortest-way angle interpolation, for smooth car/cop heading swings.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}

// '#rrggbb' -> 'rgba(r,g,b,a)' so gradients can ride the palette.
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Five-pointed star path centred on (cx, cy) — the wanted-level icons.
export function starPath(ctx, cx, cy, ro, ri) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const ang = (Math.PI / 5) * k - Math.PI / 2;
    const r = k % 2 === 0 ? ro : ri;
    const px = cx + Math.cos(ang) * r;
    const py = cy + Math.sin(ang) * r;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
