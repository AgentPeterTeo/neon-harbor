// Deterministic screenshot modes (?shot=start|play|mission&seed=1): fixed
// placements, fixed time of day, no per-run randomness in the framing, so the
// same URL always renders the same scene.
import { GRID, PLACES, WANTED } from './config.js';

export function readShot() {
  const params = new URLSearchParams(window.location.search);
  return { mode: params.get('shot'), seed: params.get('seed') };
}

/**
 * ctx: { world, player, police, hud, enterShotCar(type, color, x, z, yaw),
 *         setCopAt(x, z), playerCar, setMode }
 */
export function setupShot(mode, ctx) {
  const { world, player, police, hud } = ctx;

  if (mode === 'start') {
    world.tod = 0.115;
    world.frozen = true;
    // parked showcase cars with glowing headlights along the neon strip
    const stripX = GRID.lineAt(9);
    ctx.enterShotCar('sports', 0xff2d7a, stripX + 3, -44, 0);
    ctx.enterShotCar('taxi', 0xf7c531, stripX - 3, 36, Math.PI);
    ctx.enterShotCar('sedan', 0x3d5a80, stripX + 3, 104, 0);
    ctx.enterShotCar('van', 0x4b5d6e, stripX - 3, 150, Math.PI);
    player.state.x = stripX + 12;
    player.state.z = -20;
    player.state.yaw = -0.6;
    hud.setHudVisible(false);
    hud.showTitle(true);
    return { camOrbit: { x: stripX + 30, z: -10, r: 150, h: 62, speed: 0.018, lookY: 12 } };
  }

  if (mode === 'play') {
    world.tod = 0.16;
    world.frozen = true;
    const stripX = GRID.lineAt(9);
    // the player, mid-chase, hammering down the neon strip
    const car = ctx.enterShotCar('sports', 0x22e6ff, stripX + 3, 60, Math.PI);
    car.vx = 0;
    car.vz = -39;
    ctx.setCopAt(stripX + 3, 150);
    ctx.setCopAt(stripX - 2.5, 200);
    ctx.setCopAt(stripX + 3, 250);
    police.heat = WANTED.thresholds[1] + 12;
    hud.setHudVisible(true);
    hud.setStars(2);
    hud.setSpeed(140);
    hud.setMoney(2350, false);
    hud.setObjective('<b>MISSION</b> · Hot Package — deliver it to the ferry dock');
    return { chase: true };
  }

  if (mode === 'mission') {
    world.tod = 0.13;
    world.frozen = true;
    const [sx, sz] = PLACES.start;
    player.state.x = sx;
    player.state.z = sz;
    player.state.yaw = 0.5;
    ctx.enterShotCar('sedan', 0x9aa4b2, GRID.lineAt(9) - 3, sz + 6, Math.PI / 2);
    hud.setHudVisible(true);
    hud.setStars(0);
    hud.setMoney(500, false);
    hud.showBrief({ title: 'Welcome to the Harbor', brief: 'New in town? Prove it. Grab any car on the street and bring it to the safehouse.' });
    hud.setObjective('<b>MISSION</b> · Welcome to the Harbor');
    return { chase: true };
  }

  return null;
}

/** Camera pose for the orbiting cover shot (deterministic in t). */
export function shotCameraPose(orbit, t) {
  const a = t * orbit.speed + 0.8;
  return {
    x: orbit.x + Math.cos(a) * orbit.r,
    y: orbit.h,
    z: orbit.z + Math.sin(a) * orbit.r,
    lookX: orbit.x,
    lookY: orbit.lookY,
    lookZ: orbit.z,
  };
}
