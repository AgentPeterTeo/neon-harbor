// Police + wanted: crimes raise heat; stars come from heat thresholds. Cruisers
// spawn per star and pursue with the same arcade physics as the player, sirens
// and light bars flashing, ramming your car. Hide and the heat cools; get
// cornered on foot and you're BUSTED.
import * as THREE from 'three';
import { WANTED, POLICE, GRID, CAR_TYPES } from './config.js';
import { makeCarMesh, stepCar, collideCars } from './vehicles.js';

export function starsFor(heat) {
  let s = 0;
  for (const t of WANTED.thresholds) if (heat >= t) s += 1;
  return s;
}

export function createPolice(scene, world, rand, particles) {
  const cops = [];
  const hooks = {
    onBusted: null,       // called when the player is cornered on foot
    onCopBump: null,
    onCopKilled: null,
    onCopSeesYou: null,    // resets the hide timer
  };

  let heat = 0;
  let lastCrime = -99;
  let coolTimer = 0;
  let bustTimer = 0;
  let sirenPhase = 0;

  function spawnCop(player, randFn) {
    if (cops.length >= POLICE.maxCars) return null;
    const angle = randFn() * Math.PI * 2;
    const dist = 130 + randFn() * 110;
    // snap onto the nearest road line so they don't spawn inside a building
    let x = player.x + Math.cos(angle) * dist;
    let z = player.z + Math.sin(angle) * dist;
    const i = GRID.indexAt(x);
    const j = GRID.indexAt(z);
    if (Math.abs(x - GRID.lineAt(i)) < Math.abs(z - GRID.lineAt(j))) x = GRID.lineAt(i);
    else z = GRID.lineAt(j);
    if (world.collideCircle(x, z, 2).depth > 0) return null;
    const mesh = makeCarMesh('police', 0x0d0d12, scene);
    const cop = {
      cop: true,
      type: 'police',
      x, z,
      yaw: randFn() * Math.PI * 2,
      vx: 0, vz: 0, speed: 0,
      hp: 100,
      boost: 1,
      mesh,
      stuck: 0,
      reverse: 0,
      dead: false,
      fireT: 0,
      tableau: false,   // set by shot modes: scripted chase, no AI
    };
    cops.push(cop);
    return cop;
  }

  function killCop(cop) {
    cop.dead = true;
    if (particles) {
      for (let s = 0; s < 22; s += 1) {
        particles.spawn(cop.x, 0.8, cop.z, {
          vx: (rand() - 0.5) * 9, vy: 3 + rand() * 6, vz: (rand() - 0.5) * 9,
          color: 0xff8830, ttl: 0.9 + rand() * 0.6,
        });
      }
    }
    addHeat(WANTED.copKilled);
    if (hooks.onCopKilled) hooks.onCopKilled(cop);
  }

  function addHeat(amount) {
    heat = Math.min(WANTED.thresholds[WANTED.thresholds.length - 1] * 1.6, heat + amount);
    lastCrime = performance.now() / 1000;
    coolTimer = 0;
  }

  function update(dt, player, playerCar, playerMeshVisible, simTime) {
    sirenPhase += dt * 9;
    const stars = starsFor(heat);

    // maintain fleet
    const want = Math.min(POLICE.maxCars, stars);
    let alive = 0;
    for (const c of cops) if (!c.dead) alive += 1;
    let tries = 0;
    while (alive < want && tries < 3) {
      tries += 1;
      if (spawnCop(player, rand)) alive += 1;
    }

    // clean up the dead
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      const c = cops[i];
      if (c.dead) {
        if (c.mesh) {
          scene.remove(c.mesh.group);
          c.mesh.shell.material.dispose();
        }
        cops.splice(i, 1);
      } else if (Math.hypot(c.x - player.x, c.z - player.z) > 420) {
        scene.remove(c.mesh.group);
        cops.splice(i, 1);
      }
    }

    let seen = false;

    for (const c of cops) {
      if (c.dead) continue;

      // Shot-mode cruisers: scripted chase, hold formation and flash.
      if (c.tableau) {
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        const flash = Math.sin(sirenPhase) > 0;
        c.mesh.lightbar.red.material.color.setHex(flash ? 0xff2020 : 0x300808);
        c.mesh.lightbar.blue.material.color.setHex(flash ? 0x081030 : 0x3050ff);
        c.mesh.group.position.set(c.x, 0, c.z);
        c.mesh.group.rotation.y = c.yaw;
        continue;
      }

      const tx = playerCar ? playerCar.x : player.x;
      const tz = playerCar ? playerCar.z : player.z;
      const dx = tx - c.x;
      const dz = tz - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 150) seen = true;

      // pursuit steering; cruisers press harder with every star
      c.boost = 1 + stars * 0.05;
      let targetYaw = Math.atan2(dx, dz);
      let dy = targetYaw - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;

      let ctl;
      if (c.reverse > 0) {
        c.reverse -= dt;
        ctl = { throttle: -1, steer: -Math.sign(dy), handbrake: false };
      } else if (!playerCar && dist < 16) {
        // on foot: creep in until the cruiser noses the player, then hold
        const creep = dist > WANTED.bustDist - 0.8;
        ctl = {
          throttle: creep ? 0.5 * Math.min(1, (dist - 2.2) / 4) : 0,
          steer: Math.sign(dy) * Math.min(1, Math.abs(dy) * 2),
          handbrake: !creep,
        };
      } else {
        ctl = {
          throttle: Math.abs(dy) > 2.4 && dist < 40 ? 0.25 : 1,
          steer: Math.max(-1, Math.min(1, dy * 2.2)),
          handbrake: false,
        };
      }
      const impact = stepCar(c, dt, ctl, world);
      if (impact > 6) c.hp -= impact * 1.6;

      // stuck? back up and turn
      if (c.speed < 1.2 && ctl.throttle > 0.5) c.stuck += dt;
      else c.stuck = Math.max(0, c.stuck - dt * 2);
      if (c.stuck > 1.6) {
        c.reverse = 1.1;
        c.stuck = 0;
      }

      // player car contact: damage both, shove the player
      if (playerCar && !playerCar.dead) {
        const closing = collideCars(playerCar, c);
        if (closing > 3) {
          playerCar.hp -= closing * 1.3;
          c.hp -= closing * 1.7;
          if (hooks.onCopBump) hooks.onCopBump(c, closing);
        }
      }

      // busted: cornered on foot near a stopped cruiser
      if (!playerCar && stars > 0 && dist < WANTED.bustDist && c.speed < 3) {
        bustTimer += dt;
        if (bustTimer > WANTED.bustTime && hooks.onBusted) {
          hooks.onBusted();
          bustTimer = 0;
        }
      }

      // lightbar flash + sync mesh
      const flash = Math.sin(sirenPhase) > 0;
      c.mesh.lightbar.red.material.color.setHex(flash ? 0xff2020 : 0x300808);
      c.mesh.lightbar.blue.material.color.setHex(flash ? 0x081030 : 0x3050ff);
      c.mesh.group.position.set(c.x, 0, c.z);
      c.mesh.group.rotation.y = c.yaw;

      // fire + death
      if (c.hp < 30 && particles && Math.random() < 0.3) {
        particles.spawn(c.x, 1.1, c.z, {
          vx: (Math.random() - 0.5), vy: 2.5, vz: (Math.random() - 0.5),
          color: 0x776655, ttl: 0.8,
        });
      }
      if (c.hp <= 0 && !c.dead) killCop(c);
    }

    if (!seen) bustTimer = Math.max(0, bustTimer - dt * 2);

    // heat decay while hidden
    if (!seen && stars > 0) {
      coolTimer += dt;
      if (coolTimer > WANTED.evadeTime) heat = Math.max(0, heat - WANTED.decay * dt * (0.6 + stars * 0.4));
    } else if (stars > 0) {
      coolTimer = Math.max(0, coolTimer - dt);
    }

    // despawn when clean
    if (stars === 0) {
      for (let i = cops.length - 1; i >= 0; i -= 1) {
        const c = cops[i];
        scene.remove(c.mesh.group);
        cops.splice(i, 1);
      }
      heat = Math.max(0, heat - WANTED.decay * 2 * dt);
    }

    return { stars, heat, seen, siren: stars > 0 && cops.length > 0 };
  }

  return {
    cops,
    update,
    hooks,
    addHeat,
    starsFor,
    get heat() { return heat; },
    set heat(v) { heat = v; },
  };
}
