// Neon Harbor — the shared constants of the game: the city's geometry, the
// neon palette and the arcade numbers every other module tunes to.
export const W = 960;
export const H = 540;

// The city is a GRID x GRID lattice of tiles; every tile is one city block
// plus the road strips along its west and north edges.
export const TILE = 480;
export const ROAD = 120;
export const BLOCK = TILE - ROAD; // 360: the block inside its tile
export const GRID = 12;
export const WORLD = GRID * TILE; // 5760 px square
export const LANE = ROAD / 4; // lane centre offset from a road's centreline

// The east column is the harbor: open water, one pier and one bridge road.
export const WATER_COL = GRID - 1;
export const PIER_ROW = 2;
export const BRIDGE_ROW = 7;
export const PIER_DECK = {
  x0: WATER_COL * TILE + 6,
  y0: PIER_ROW * TILE + ROAD / 2 - 42,
  x1: WORLD - 6,
  y1: PIER_ROW * TILE + ROAD / 2 + 42,
};
export const DOCK = { x: WATER_COL * TILE + ROAD * 2.35, y: PIER_ROW * TILE + ROAD / 2 };
export const SAFEHOUSE = { x: 1 * TILE + ROAD / 2, y: 1 * TILE + ROAD / 2 };

export const C = {
  bg: '#0a0e1a',
  road: '#141a2b',
  roadLine: '#2c3a5e',
  sidewalk: '#1d2436',
  block: '#10182e',
  park: '#0e2417',
  water: '#0b1d33',
  waterHi: '#175090',
  cyan: '#00f0ff',
  magenta: '#ff2bd6',
  amber: '#ffb400',
  blue: '#4d7cff',
  green: '#39ff88',
  purple: '#a86bff',
  red: '#ff4757',
  white: '#e8f4ff',
};

// The player's car: arcade numbers tuned for a loose, drifty GTA2 feel.
export const PHYS = {
  accel: 430, // px/s gained per second of throttle
  brake: 920, // px/s lost per second of braking
  reverse: 260,
  maxFwd: 355, // px/s
  maxRev: 150,
  drag: 0.9, // rolling drag per second
  turn: 3.2, // rad/s at full lock
  grip: 7.0, // lateral damping per second (high: glued to the road)
  driftGrip: 1.6, // lateral damping while sliding (low: the car drifts)
  radius: 11, // collision circle at nose and tail
};

export const KMH = 0.48; // px/s shown as km/h
export const TRAFFIC_N = 26;
export const DAY_SECONDS = 150; // one 24-hour cycle, in seconds of play
export const START_HOUR = 9.5;
export const MISSION_R = 62; // arrival radius of a mission marker
export const JACK_R = 66; // reach for jacking the target car
