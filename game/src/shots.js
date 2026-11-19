// Screenshot modes for judging (?shot=start|play|mission&seed=1): every
// placement is fixed and the only randomness comes from the seed, so the same
// URL always renders the same composition.
import { GRID, PLACES, WANTED } from './config.js';
import { createRandom } from './random.js';

export function readShot() {
  const params = new URLSearchParams(window.location.search);
  return { mode: params.get('shot'), seed: params.get('seed') };
}

/**
 * ctx: { world, player, police, hud,
 *         enterShotCar(type, color, x, z, yaw) -> showcase car,
 *         setCopAt(x, z, yaw, tableau, vx, vz) }
 * Returns { camOrbit } consumed by main.js's camera.
 */
export function setupShot(mode, ctx, seed) {
  const { world, player, police, hud } = ctx;
  const rand = createRandom((Number(seed) || 1) * 7919 + 13);
  const j = () => (rand() - 0.5) * 1.6; // seeded jitter so props never clip

  if (mode === 'start') {
    // cover shot: low down the neon strip at golden dusk — cam horizon, pools
    // and car glows carry the frame instead of empty dark asphalt
    world.tod = 0.01;
    world.frozen = true;
    const stripX = GRID.lineAt(9);
    ctx.enterShotCar('sports', 0xff2d7a, stripX + 3.4 + j(), -46 + j(), 0);
    ctx.enterShotCar('taxi', 0xf7c531, stripX - 3.4 + j(), 34 + j(), Math.PI);
    ctx.enterShotCar('sedan', 0x3d5a80, stripX + 3.4 + j(), 106 + j(), 0);
    ctx.enterShotCar('van', 0x4b5d6e, stripX - 3.4 + j(), 152 + j(), Math.PI);
    player.state.x = stripX + 7;
    player.state.z = -22;
    player.state.yaw = -0.6;
    hud.setHudVisible(false);
    hud.showTitle(true);
    // slow drift so the title breathes while the shot stays composed
    return {
      camOrbit: { x: stripX + 44, z: -60, r: 124, h: 30, phase: 1.02, speed: 0.006, lookY: 8 },
    };
  }

  if (mode === 'play') {
    // mid-chase: the player hammering down the neon strip, two cruisers with
    // live lightbars stacked behind, full HUD on — bright day so the chase
    // reads on a store screenshot instead of a near-black frame
    world.tod = 0.84;
    world.frozen = true;
    const stripX = GRID.lineAt(9);
    const car = ctx.enterShotCar('sports', 0x22e6ff, stripX + 3, 60, Math.PI);
    car.vx = 0;
    car.vz = -39; // ~140 km/h
    ctx.setCopAt(stripX + 2.6, 86 + j(), Math.PI, true, 0, -39);
    ctx.setCopAt(stripX - 2.4, 104 + j(), Math.PI, true, 0, -39);
    police.heat = WANTED.thresholds[1] + 12; // steady 2 stars
    hud.setHudVisible(true);
    hud.setStars(2);
    hud.setMoney(2350, false);
    hud.setObjective('<b>HOT CARGO</b> · get it to the ferry dock — GO!');
    // chase cam locked low behind the car, looking down the street: the
    // player's ride mid-frame, both cruisers stacked behind with lights live;
    // pitched level so the dusk horizon sits mid-frame behind the skyline
    return {
      camOrbit: {
        getCenter: () => ({ x: car.x, z: car.z }),
        phase: 1.75, speed: 0, r: 15, h: 4.8,
        lookOz: -22, lookY: 4.2,
      },
    };
  }

  if (mode === 'mission') {
    // on foot at the first job's glowing marker, neon street at night
    world.tod = 0.13;
    world.frozen = true;
    const [sx, sz] = PLACES.start;
    player.state.x = sx;
    player.state.z = sz;
    player.state.yaw = 0.5;
    ctx.enterShotCar('sedan', 0x9aa4b2, GRID.lineAt(9) - 3, sz + 7, Math.PI / 2);
    hud.setHudVisible(true);
    hud.setStars(0);
    hud.setMoney(500, false);
    hud.setObjective('<b>FIRST SHIFT</b> · drive to the diner');
    hud.showBanner('FIRST SHIFT', 'NEW IN TOWN? GRAB ANY CAR AND DRIVE TO THE DINER', 1e9);
    // low tripod: player small against the marker beam and the neon strip
    return {
      camOrbit: { x: sx + 9, z: sz - 8, r: 0, h: 1.9, lookOx: -6, lookOz: 30, lookY: 4 },
    };
  }

  return {};
}

/** Fixed cinematic camera for all shot modes. Deterministic in t and orbit. */
export function shotCameraPose(orbit, t) {
  const c = orbit.getCenter ? orbit.getCenter() : orbit;
  const a = (orbit.phase || 0) + t * (orbit.speed || 0);
  return {
    x: c.x + Math.cos(a) * (orbit.r || 0),
    y: orbit.h,
    z: c.z + Math.sin(a) * (orbit.r || 0),
    lookX: c.x + (orbit.lookOx || 0),
    lookY: orbit.lookY || 0,
    lookZ: c.z + (orbit.lookOz || 0),
  };
}
