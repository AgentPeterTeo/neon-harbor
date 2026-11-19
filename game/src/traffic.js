// Traffic: the living city. Civilian cars are one shell + one trim InstancedMesh
// per type, driving lanes in both directions, obeying lights, braking for the car
// (or player) ahead. Pedestrians are two instanced meshes walking the sidewalks,
// scattering from fast cars, and getting knocked down if they don't make it.
import * as THREE from 'three';
import { GRID, ISLAND_HALF, CAR_TYPES, lightPhase } from './config.js';
import { carGeometries } from './vehicles.js';

const CIV_TYPES = ['sedan', 'taxi', 'sports', 'van'];
const PED_SHIRTS = [0xd85a7a, 0x5ab0d8, 0xd8c05a, 0x8a6ad8, 0x5ad8a0, 0xd88a5a, 0xa0a0b0];

export function createTraffic(scene, world, rand, particles) {
  const MAXCARS = 64;
  const MAXPEDS = 48;
  const DESPAWN = 300;
  const SPAWN_MIN = 60;
  const SPAWN_MAX = 240;

  const fleets = {};      // type -> {shell, trim, cars: []}
  for (const t of CIV_TYPES) {
    const geo = carGeometries(t);
    const shell = new THREE.InstancedMesh(geo.shell, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 }), MAXCARS);
    const trim = new THREE.InstancedMesh(geo.trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAXCARS);
    shell.count = 0;
    trim.count = 0;
    shell.frustumCulled = false;
    trim.frustumCulled = false;
    scene.add(shell, trim);
    fleets[t] = { shell, trim, cars: [] };
  }

  const pedBody = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.46, 1.1, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    MAXPEDS,
  );
  const pedHead = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.17, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8a88a, roughness: 0.9 }),
    MAXPEDS,
  );
  pedBody.count = 0;
  pedHead.count = 0;
  pedBody.frustumCulled = false;
  pedHead.frustumCulled = false;
  scene.add(pedBody, pedHead);

  const cars = [];       // all traffic car states
  const peds = [];
  const tmp = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpC = new THREE.Color();
  const tmpV = new THREE.Vector3();

  /* ---------------- helpers ---------------- */
  function laneCenter(roadIndex, dirSign) {
    // right-hand traffic: offset toward +x/+z when driving in the + direction
    return GRID.lineAt(roadIndex) + dirSign * GRID.laneOff;
  }

  function spawnPoint(randFn) {
    const axis = randFn() < 0.5 ? 'v' : 'h';
    const roadIndex = 1 + Math.floor(randFn() * (GRID.lines - 2));
    const dirSign = randFn() < 0.5 ? 1 : -1;
    const along = (randFn() * 2 - 1) * ISLAND_HALF * 0.9;
    return { axis, roadIndex, dirSign, along };
  }

  function carAt(x, z, r) {
    for (const c of cars) {
      if (Math.hypot(c.x - x, c.z - z) < r) return true;
    }
    return false;
  }

  function spawnCar(player, randFn) {
    if (cars.length >= MAXCARS) return;
    for (let tries = 0; tries < 8; tries += 1) {
      const p = spawnPoint(randFn);
      const x = p.axis === 'v' ? laneCenter(p.roadIndex, p.dirSign) : p.along;
      const z = p.axis === 'v' ? p.along : laneCenter(p.roadIndex, p.dirSign);
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      if (carAt(x, z, 14)) continue;
      const type = CIV_TYPES[Math.floor(randFn() * CIV_TYPES.length)];
      const fleet = fleets[type];
      if (fleet.cars.length >= MAXCARS) continue;
      const yaw = p.axis === 'v' ? (p.dirSign > 0 ? 0 : Math.PI) : (p.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = {
        traffic: true,
        type,
        x, z, yaw,
        vx: 0, vz: 0, speed: 0,
        hp: 100, driver: true,
        axis: p.axis, roadIndex: p.roadIndex, dirSign: p.dirSign,
        target: 13 + randFn() * 7,
        panic: 0,
        parked: false,
      };
      cars.push(car);
      fleet.cars.push(car);
      return car;
    }
    return null;
  }

  function spawnParked(player, randFn) {
    if (cars.length >= MAXCARS) return null;
    const p = spawnPoint(randFn);
    const side = randFn() < 0.5 ? 1 : -1;
    // just past the asphalt, half on the curb: far enough from the ±3 lanes
    // that the "car ahead" scan never sees a parked car as an obstacle
    const off = GRID.roadW / 2 + 0.95;
    const x = p.axis === 'v' ? GRID.lineAt(p.roadIndex) + side * off : p.along;
    const z = p.axis === 'v' ? p.along : GRID.lineAt(p.roadIndex) + side * off;
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < SPAWN_MIN || d > SPAWN_MAX || carAt(x, z, 8)) return null;
    const type = CIV_TYPES[Math.floor(randFn() * CIV_TYPES.length)];
    const fleet = fleets[type];
    if (fleet.cars.length >= MAXCARS) return null;
    const yaw = p.axis === 'v' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = {
      traffic: true, type, x, z, yaw, vx: 0, vz: 0, speed: 0, hp: 100, driver: false,
      parked: true,
    };
    cars.push(car);
    fleet.cars.push(car);
    return car;
  }

  function spawnPed(player, randFn) {
    if (peds.length >= MAXPEDS) return null;
    for (let tries = 0; tries < 6; tries += 1) {
      const p = spawnPoint(randFn);
      const side = randFn() < 0.5 ? 1 : -1;
      const off = GRID.roadW / 2 + 1.75;
      const x = p.axis === 'v' ? GRID.lineAt(p.roadIndex) + side * off : p.along;
      const z = p.axis === 'v' ? p.along : GRID.lineAt(p.roadIndex) + side * off;
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < 20 || d > SPAWN_MAX) continue;
      const ped = {
        x, z,
        axis: p.axis, roadIndex: p.roadIndex, dirSign: p.dirSign, side,
        speed: 1.5 + randFn() * 1.1,
        state: 'walk',
        flee: 0, fx: 0, fz: 0,
        downTime: 0,
        bob: randFn() * 10,
        shirt: PED_SHIRTS[Math.floor(randFn() * PED_SHIRTS.length)],
      };
      peds.push(ped);
      return ped;
    }
    return null;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    const fleet = fleets[car.type];
    const j = fleet.cars.indexOf(car);
    if (j >= 0) fleet.cars.splice(j, 1);
  }

  function removePed(ped) {
    const i = peds.indexOf(ped);
    if (i >= 0) peds.splice(i, 1);
  }

  /* ---------------- per-frame sim ---------------- */
  const hooks = {
    onPedHit: null,      // (ped, speed) -> wanted heat etc
    onCarBump: null,      // (car, closing) -> panic/heat
  };

  function update(dt, player, playerCar, simTime, policeCars) {
    // top up the world around the player
    let movingCars = 0;
    for (const c of cars) if (!c.parked) movingCars += 1;
    let attempts = 0;
    while (movingCars < 34 && attempts < 6) {
      attempts += 1;
      if (spawnCar(player, rand)) movingCars += 1;
    }
    attempts = 0;
    let parkedCount = 0;
    for (const c of cars) if (c.parked) parkedCount += 1;
    while (parkedCount < 8 && attempts < 8) {
      attempts += 1;
      if (spawnParked(player, rand)) parkedCount += 1;
    }
    attempts = 0;
    while (peds.length < 30 && attempts < 6) {
      attempts += 1;
      spawnPed(player, rand);
    }

    const ph = lightPhase(simTime);

    // cars
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const c = cars[i];
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d > DESPAWN) {
        removeCar(c);
        continue;
      }
      if (c.parked) continue;

      if (c.panic > 0) {
        c.panic -= dt;
        c.speed = Math.max(0, c.speed - 14 * dt);
      } else {
        // desired speed, with braking for the car ahead
        let desired = c.target;
        const ax = c.axis === 'v' ? 0 : c.dirSign;
        const az = c.axis === 'v' ? c.dirSign : 0;
        // red light: stop before the next intersection
        const light = c.axis === 'v' ? ph.ns : ph.ew;
        const nextCross = GRID.nextLine(c.x * ax + c.z * az + c.dirSign * 48, c.dirSign);
        const stopAt = (nextCross - c.dirSign * 8);
        const distToStop = (stopAt - (c.x * ax + c.z * az)) * c.dirSign;
        if (light === 2 && distToStop > 0 && distToStop < 40) {
          desired = Math.min(desired, Math.max(0, distToStop * 0.45 - 0.6));
        } else if (light === 1 && distToStop > 0 && distToStop < 18) {
          desired = Math.min(desired, Math.max(0, distToStop * 0.5 - 0.8));
        }
        // car ahead / player car
        for (const o of cars) {
          if (o === c) continue;
          const dx = o.x - c.x;
          const dz = o.z - c.z;
          const alongDist = dx * ax + dz * az;
          const lat = Math.abs(dx * az - dz * ax);
          if (alongDist > 0 && alongDist < 14 && lat < 3.2) {
            desired = Math.min(desired, Math.max(0, (alongDist - 6) * 1.2));
          }
        }
        if (playerCar) {
          const dx = playerCar.x - c.x;
          const dz = playerCar.z - c.z;
          const alongDist = dx * ax + dz * az;
          const lat = Math.abs(dx * az - dz * ax);
          if (alongDist > 0 && alongDist < 16 && lat < 3.4) {
            desired = Math.min(desired, Math.max(0, (alongDist - 7) * 1.2));
          }
        }
        c.speed += Math.max(-16 * dt, Math.min(7 * dt, desired - c.speed));
      }

      const ax = c.axis === 'v' ? 0 : c.dirSign;
      const az = c.axis === 'v' ? c.dirSign : 0;
      c.x += ax * c.speed * dt;
      c.z += az * c.speed * dt;

      // pass an intersection: occasionally turn (snap lane, keep it simple + smooth yaw)
      const pos = c.x * ax + c.z * az;
      const cross = GRID.lineNear(pos);
      if (cross !== null && Math.abs(pos - cross) < 1.2 && c.speed > 0.5) {
        const prev = c.lastCross;
        if (prev !== cross) {
          c.lastCross = cross;
          if (rand() < 0.25) {
            c.axis = c.axis === 'v' ? 'h' : 'v';
            c.roadIndex = GRID.indexAt(cross);
            c.dirSign = rand() < 0.5 ? 1 : -1;
            // snap onto the new lane
            const alongAxis = c.axis === 'v' ? 'x' : 'z';
            const lane = laneCenter(c.roadIndex, c.dirSign);
            if (c.axis === 'v') c.x = lane; else c.z = lane;
          }
        }
      }
      const targetYaw = c.axis === 'v' ? (c.dirSign > 0 ? 0 : Math.PI) : (c.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2);
      let dy = targetYaw - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, 5 * dt);

      // player car overlap: shove civilians (wanted heat handled by hook)
      if (playerCar && !playerCar.dead) {
        const dx = c.x - playerCar.x;
        const dz = c.z - playerCar.z;
        const ra = CAR_TYPES[c.type].size[2] * 0.33;
        const rb = CAR_TYPES[playerCar.type].size[2] * 0.33;
        const dist = Math.hypot(dx, dz);
        if (dist < ra + rb && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = ra + rb - dist;
          c.x += nx * overlap * 0.7;
          c.z += nz * overlap * 0.7;
          playerCar.x -= nx * overlap * 0.3;
          playerCar.z -= nz * overlap * 0.3;
          const pSpeed = Math.hypot(playerCar.vx, playerCar.vz);
          if (pSpeed > 4) {
            c.speed = Math.max(0, c.speed - 3);
            if (hooks.onCarBump) hooks.onCarBump(c, pSpeed);
            // driver panics and may bail out
            if (pSpeed > 10 && c.driver) {
              c.driver = false;
              c.speed = 0;
              c.parked = true;
              c.panic = 0;
              if (hooks.onDriverFled) hooks.onDriverFled(c);
            }
          }
          playerCar.vx *= 0.86;
          playerCar.vz *= 0.86;
        }
      }
    }

    // peds
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      const ped = peds[i];
      const d = Math.hypot(ped.x - player.x, ped.z - player.z);
      if (d > DESPAWN) {
        removePed(ped);
        continue;
      }
      ped.bob += dt * (ped.state === 'run' ? 11 : 5.5);

      if (ped.state === 'down') {
        ped.downTime -= dt;
        if (ped.downTime <= 0) {
          ped.state = 'flee';
          ped.downTime = 4 + rand() * 3;
        }
      } else {
        let mx = 0;
        let mz = 0;
        if (ped.state === 'flee') {
          ped.flee -= dt;
          if (ped.flee <= 0) ped.state = 'walk';
          mx = ped.fx;
          mz = ped.fz;
          ped.x += mx * 4.4 * dt;
          ped.z += mz * 4.4 * dt;
          if (world.collideCircle(ped.x, ped.z, 0.3).depth > 0) {
            ped.x -= mx * 4.4 * dt;
            ped.z -= mz * 4.4 * dt;
            ped.fx = -ped.fx;
            ped.fz = -ped.fz;
          }
        } else if (ped.state === 'walk') {
          const ax = ped.axis === 'v' ? 0 : ped.dirSign;
          const az = ped.axis === 'v' ? ped.dirSign : 0;
          ped.x += ax * ped.speed * dt;
          ped.z += az * ped.speed * dt;
          // corners: sometimes turn with the sidewalk
          const pos = ped.x * ax + ped.z * az;
          const cross = GRID.lineNear(pos);
          if (cross !== null && ped.lastCross !== cross && Math.abs(pos - cross) < 1) {
            ped.lastCross = cross;
            if (rand() < 0.35) {
              ped.axis = ped.axis === 'v' ? 'h' : 'v';
              ped.roadIndex = GRID.indexAt(cross);
              ped.dirSign = rand() < 0.5 ? 1 : -1;
            }
          }
          // keep to the sidewalk offset
          const lane = GRID.lineAt(ped.roadIndex) + ped.side * (GRID.roadW / 2 + 1.75);
          if (ped.axis === 'v') ped.x += (lane - ped.x) * Math.min(1, 3 * dt);
          else ped.z += (lane - ped.z) * Math.min(1, 3 * dt);
          // scatter from any approaching car
          const threats = [playerCar, ...(policeCars || [])];
          for (const t of threats) {
            if (!t || t.dead) continue;
            const speed = Math.hypot(t.vx, t.vz);
            if (speed < 8) continue;
            const dx = ped.x - t.x;
            const dz = ped.z - t.z;
            const dd = Math.hypot(dx, dz);
            if (dd < 14) {
              const fx = Math.sin(t.yaw);
              const fz = Math.cos(t.yaw);
              if (dx * fx + dz * fz > 0) {   // in front of the car
                ped.state = 'flee';
                ped.flee = 2.5 + rand();
                ped.fx = dx / (dd || 1);
                ped.fz = dz / (dd || 1);
              }
            }
          }
          // got hit?
          for (const t of threats) {
            if (!t || t.dead) continue;
            const speed = Math.hypot(t.vx, t.vz);
            if (speed < 5) continue;
            if (Math.hypot(ped.x - t.x, ped.z - t.z) < CAR_TYPES[t.type].size[2] * 0.42 + 0.5) {
              ped.state = 'down';
              ped.downTime = 3.5 + rand() * 2;
              if (hooks.onPedHit) hooks.onPedHit(ped, speed);
              if (particles) {
                for (let s = 0; s < 6; s += 1) {
                  particles.spawn(ped.x, 0.6, ped.z, {
                    vx: (rand() - 0.5) * 5, vy: 2 + rand() * 3, vz: (rand() - 0.5) * 5,
                    color: 0xd8a0a0, ttl: 0.5 + rand() * 0.4,
                  });
                }
              }
              break;
            }
          }
        }
      }
    }

    /* ---------------- instance upload ---------------- */
    for (const type of CIV_TYPES) {
      const fleet = fleets[type];
      const geo = carGeometries(type);
      for (let i = 0; i < fleet.cars.length; i += 1) {
        const c = fleet.cars[i];
        tmpE.set(0, c.yaw, 0);
        tmpQ.setFromEuler(tmpE);
        tmpV.set(c.x, 0, c.z);
        tmp.compose(tmpV, tmpQ, new THREE.Vector3(1, 1, 1));
        fleet.shell.setMatrixAt(i, tmp);
        fleet.trim.setMatrixAt(i, tmp);
        if (!c.tinted) {
          tmpC.setHex(c.parked ? 0x3a3f4a : CAR_TYPES[type].colors[Math.floor(rand() * CAR_TYPES[type].colors.length)]);
          fleet.shell.setColorAt(i, tmpC);
          c.tinted = true;
        }
      }
      fleet.shell.count = fleet.cars.length;
      fleet.trim.count = fleet.cars.length;
      fleet.shell.instanceMatrix.needsUpdate = true;
      fleet.trim.instanceMatrix.needsUpdate = true;
      if (fleet.shell.instanceColor) fleet.shell.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      const lying = ped.state === 'down';
      const y = lying ? 0.18 : 0.62 + Math.abs(Math.sin(ped.bob)) * 0.045;
      tmpE.set(lying ? Math.PI / 2 : 0, lying ? ped.bob : (ped.axis === 'v' ? (ped.dirSign > 0 ? 0 : Math.PI) : (ped.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2)), 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpV.set(ped.x, y, ped.z);
      tmp.compose(tmpV, tmpQ, new THREE.Vector3(1, 1, 1));
      pedBody.setMatrixAt(i, tmp);
      tmpC.setHex(ped.shirt);
      pedBody.setColorAt(i, tmpC);
      tmpV.set(ped.x, lying ? 0.36 : y + 0.68, ped.z);
      tmp.compose(tmpV, tmpQ, new THREE.Vector3(1, 1, 1));
      pedHead.setMatrixAt(i, tmp);
    }
    pedBody.count = peds.length;
    pedHead.count = peds.length;
    pedBody.instanceMatrix.needsUpdate = true;
    pedHead.instanceMatrix.needsUpdate = true;
    if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;
    pedHead.instanceMatrix.needsUpdate = true;
  }

  return {
    cars,
    peds,
    update,
    hooks,
    removeCar,
    spawnParked,
    spawnCar,
    spawnPed,
  };
}
