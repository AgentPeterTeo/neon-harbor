// Neon Harbor: every tuning number, colour and layout rule in one place.
// The city is a fixed 2 km square island so no rule below depends on the screen size.

/** Fixed-step simulation: 60 updates a second regardless of the display's rate. */
export const STEP = 1 / 60;

/** The city grid: 21 road lines per axis, 96 m apart, covering a ~2 km square island. */
export const GRID = {
  lines: 21,          // road centre lines at lineAt(i) = (i - 10) * cell, i in 0..20
  cell: 96,           // block pitch
  roadW: 12,          // asphalt width (two lanes)
  laneOff: 3,         // lane centre offset from the road centre
  sideW: 3.5,         // sidewalk width
  sideH: 0.18,        // sidewalk height
  lineAt(i) { return (i - 10) * this.cell; },
  indexAt(coord) { return Math.max(0, Math.min(20, Math.round(coord / this.cell) + 10)); },
  /** Nearest road-line coordinate to `pos`, or null if not within 1.5 m of one. */
  lineNear(pos) {
    const i = Math.round(pos / this.cell) + 10;
    if (i < 0 || i > 20) return null;
    const line = (i - 10) * this.cell;
    return Math.abs(pos - line) < 1.5 ? line : null;
  },
  /** The first road line strictly ahead of `pos` in direction `dir` (+1/-1). */
  nextLine(pos, dir) {
    const eps = 1e-6;
    let i = dir > 0 ? Math.ceil(pos / this.cell + 10 + eps) : Math.floor(pos / this.cell + 10 - eps);
    i = Math.max(0, Math.min(20, i));
    return (i - 10) * this.cell;
  },
  isletA: { z0: -1408, z1: -1120, x0: -176, x1: 176 },   // north park islet
  isletB: { x0: 1120, x1: 1440, z0: 136, z1: 424 },      // east lighthouse islet
};
export const ISLAND_HALF = 984;    // seawall edge of the main island

export const WORLD = {
  waterY: -0.55,
  fogDay: 0.0012,
  fogNight: 0.0036,
};

/** Day length in seconds; the clock starts at dusk so the neon carries the first impression. */
export const DAY_LEN = 600;
export const START_TOD = 0.05;

export const PALETTE = {
  asphalt: 0x15161d,
  sidewalk: 0x383d49,
  blockTop: 0x1d2129,
  waterDeep: 0x041826,
  waterCrest: 0x0d4a66,
  waterFoam: 0x1a7fa0,
  neonPink: 0xff2d7a,
  neonCyan: 0x22e6ff,
  neonYellow: 0xffd24a,
  neonPurple: 0x9a4dff,
};

export const CAR_TYPES = {
  sedan: {
    key: 'sedan', label: 'Pride', size: [2.0, 1.35, 4.6],
    colors: [0x9aa4b2, 0x3d5a80, 0x7a2e2e, 0x2f4f4f, 0xd8d8d8, 0x27262b],
    maxSpeed: 34, accel: 14, brake: 26, grip: 5.2, turn: 2.1, mass: 1.0,
  },
  taxi: {
    key: 'taxi', label: 'Harbor Cab', size: [2.0, 1.4, 4.6], colors: [0xf7c531],
    maxSpeed: 32, accel: 13, brake: 24, grip: 5.0, turn: 2.0, mass: 1.0, taxi: true,
  },
  sports: {
    key: 'sports', label: 'Vortex GT', size: [2.05, 1.05, 4.4],
    colors: [0xff2d7a, 0x22e6ff, 0xd8212d, 0x111116, 0xffd24a],
    maxSpeed: 52, accel: 24, brake: 34, grip: 6.4, turn: 2.5, mass: 0.9, sports: true,
  },
  van: {
    key: 'van', label: 'Mule', size: [2.25, 2.0, 5.0],
    colors: [0x8a8f9a, 0x4b5d6e, 0x6e4b3a, 0x37474f],
    maxSpeed: 28, accel: 10, brake: 20, grip: 4.6, turn: 1.7, mass: 1.4, van: true,
  },
  police: {
    key: 'police', label: 'Interceptor', size: [2.05, 1.35, 4.7], colors: [0x0d0d12],
    maxSpeed: 46, accel: 19, brake: 30, grip: 6.0, turn: 2.4, mass: 1.05, police: true,
  },
};
export const CIV_TYPES = ['sedan', 'taxi', 'sports', 'van'];

export const PLAYER = {
  walk: 4.4, run: 8.0, radius: 0.55, height: 1.75,
  enterDist: 3.6, health: 100,
};

export const WANTED = {
  thresholds: [22, 60, 120, 220, 340],
  pedHit: 34, carBump: 7, copBump: 14, copKilled: 80, carjack: 26,
  evadeTime: 12, decay: 2.2,      // seconds hidden before a star cools; heat lost per second
  bustTime: 1.8, bustDist: 3.4,   // cornered this close, for this long, on foot -> BUSTED
};

export const ECON = { start: 500, bustedFee: 100, wastedFee: 100 };

export const TRAFFIC = {
  driveTarget: 44,        // driving cars kept alive around the player
  parkedTarget: 22,       // parked cars kept around the player
  pedTarget: 44,          // pedestrians on sidewalks
  maxInst: 24,            // instances per type pool
  speed: 10.5, speedJit: 2.5,
  spawnMin: 70, spawnMax: 150, despawn: 270,
};

export const POLICE = { maxCars: 6 };

export const SAVE_KEY = 'neon-harbor.save.v1';
export const SEED = 1337;      // city layout: identical every run and in shot modes

/** Traffic-light cycle: 6.5s green, 1.5s yellow, per axis, north-south first. */
export function lightPhase(t) {
  const c = t % 16;
  if (c < 6.5) return { ns: 0, ew: 2 };        // 0 green, 1 yellow, 2 red
  if (c < 8) return { ns: 1, ew: 2 };
  if (c < 14.5) return { ns: 2, ew: 0 };
  return { ns: 2, ew: 1 };
}

/** Named places, in grid coordinates resolved at load: player start, respawn, chop shop... */
export const PLACES = {
  start: [-88.2, 16],          // sidewalk of the neon main street, by the club
  hospital: [-392, -392],      // street corner by the north-west clinic block
  garage: [772, 792],          // chop-shop dropoff, docks
  safehouse: [-816, -720],
  bank: [8.6, -190],           // east sidewalk of the main avenue, downtown
  ferry: [860, 860],
  diner: [-88.2, -150],       // two blocks north on the neon strip; tutorial stop
};
