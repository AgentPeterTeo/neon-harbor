// Vehicles: low-poly car geometry per type (a body shell tinted per instance plus
// one merged trim mesh — glass, wheels, lights — so a whole fleet is a couple of
// draw calls), the arcade car physics shared by player, traffic and police, and
// the damage -> smoke -> fire -> explosion chain.
import * as THREE from 'three';
import { CAR_TYPES } from './config.js';
import { box, cyl, makeGlowTexture, mergeParts } from './geo.js';

const geoCache = new Map();

/** Body shell (white, tinted per instance) + fixed-colour trim, local +z forward. */
export function carGeometries(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const spec = CAR_TYPES[type];
  const [w, h, len] = spec.size;
  const bodyH = spec.van ? h * 0.86 : h * 0.52;
  const cabinH = spec.van ? h * 0.06 : h * 0.42;
  const cabinLen = spec.van ? len * 0.62 : len * (spec.sports ? 0.44 : 0.5);
  const cabinOff = spec.van ? len * 0.16 : len * (spec.sports ? -0.04 : -0.05);

  const shell = mergeParts([
    { geo: new THREE.BoxGeometry(w, bodyH, len), matrix: new THREE.Matrix4().makeTranslation(0, 0.34 + bodyH / 2, 0) },
    ...(spec.van ? [] : [{ geo: new THREE.BoxGeometry(w * 0.86, cabinH, cabinLen), matrix: new THREE.Matrix4().makeTranslation(0, 0.34 + bodyH + cabinH / 2 - 0.03, cabinOff) }]),
    ...(spec.sports ? [box(w * 0.9, 0.1, 0.5, 0, 0.34 + bodyH + cabinH + 0.05, -len * 0.42)] : []),
  ]);
  const trim = mergeParts([
    box(w * 0.94, 0.14, 0.3, 0, 0.42, len * 0.5 - 0.06, 0x23262c),
    box(w * 0.94, 0.14, 0.3, 0, 0.42, -len * 0.5 + 0.06, 0x23262c),
    // windshield + rear glass + sides
    box(w * 0.8, cabinH * 0.8, 0.1, 0, 0.34 + bodyH + cabinH / 2, cabinOff + cabinLen * 0.5 - 0.02, 0x101826),
    box(w * 0.8, cabinH * 0.8, 0.1, 0, 0.34 + bodyH + cabinH / 2, cabinOff - cabinLen * 0.5 + 0.02, 0x101826),
    box(0.08, cabinH * 0.55, cabinLen * 0.8, -w * 0.43, 0.34 + bodyH + cabinH / 2, cabinOff, 0x101826),
    box(0.08, cabinH * 0.55, cabinLen * 0.8, w * 0.43, 0.34 + bodyH + cabinH / 2, cabinOff, 0x101826),
    // wheels
    cyl(0.34, 0.34, 0.26, 8, -w * 0.5 + 0.13, 0.34, len * 0.3, 0x0c0c0f, 0, Math.PI / 2),
    cyl(0.34, 0.34, 0.26, 8, w * 0.5 - 0.13, 0.34, len * 0.3, 0x0c0c0f, 0, Math.PI / 2),
    cyl(0.34, 0.34, 0.26, 8, -w * 0.5 + 0.13, 0.34, -len * 0.3, 0x0c0c0f, 0, Math.PI / 2),
    cyl(0.34, 0.34, 0.26, 8, w * 0.5 - 0.13, 0.34, -len * 0.3, 0x0c0c0f, 0, Math.PI / 2),
    // head/tail lights (bright baked colours, MeshBasicMaterial glow)
    box(0.5, 0.22, 0.1, -w * 0.32, 0.34 + bodyH * 0.7, len * 0.5, 0xfff2c8),
    box(0.5, 0.22, 0.1, w * 0.32, 0.34 + bodyH * 0.7, len * 0.5, 0xfff2c8),
    box(0.5, 0.18, 0.1, -w * 0.32, 0.34 + bodyH * 0.7, -len * 0.5, 0xff2222),
    box(0.5, 0.18, 0.1, w * 0.32, 0.34 + bodyH * 0.7, -len * 0.5, 0xff2222),
    ...(spec.taxi ? [box(0.9, 0.32, 0.5, 0, 0.34 + bodyH + cabinH + 0.2, cabinOff, 0x222222)] : []),
    ...(spec.police ? [box(w * 0.9, 0.16, len * 0.5, 0, 0.34 + bodyH * 0.62, 0, 0xe8e8ee)] : []),
  ]);
  const entry = { shell, trim, len, w };
  geoCache.set(type, entry);
  return entry;
}

let glowTex = null;
function glowTexture() {
  if (!glowTex) glowTex = makeGlowTexture('rgba(255,240,200,1)');
  return glowTex;
}

/** A real (non-instanced) car Group: shell tinted, trims, night light quads, blob shadow. */
export function makeCarMesh(type, colorHex, scene) {
  const geo = carGeometries(type);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(geo.shell, new THREE.MeshStandardMaterial({
    color: colorHex, roughness: 0.45, metalness: 0.35,
  }));
  const trim = new THREE.Mesh(geo.trim, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, metalness: 0.1,
  }));
  group.add(shell, trim);

  const quad = (color, x, y, z, sx, sy) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sy),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = z > 0 ? 0 : Math.PI;
    group.add(mesh);
    return mesh;
  };
  const headL = quad(0xfff0c0, -0.32, 0.72, geo.len * 0.5 + 0.02, 1.6, 1.6);
  const headR = quad(0xfff0c0, 0.32, 0.72, geo.len * 0.5 + 0.02, 1.6, 1.6);
  const tailL = quad(0xff3030, -0.32, 0.7, -geo.len * 0.5 - 0.02, 1.1, 0.9);
  const tailR = quad(0xff3030, 0.32, 0.7, -geo.len * 0.5 - 0.02, 1.1, 0.9);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(geo.w + 1.1, geo.len + 0.9),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  let bar = null;
  if (CAR_TYPES[type].police) {
    const h = CAR_TYPES[type].size[1];
    const bodyH = h * 0.52;
    const cabinH = h * 0.42;
    const barY = 0.34 + bodyH + cabinH + 0.1;
    const mkHalf = (x, color) => {
      const geo = new THREE.BoxGeometry(0.5, 0.24, 0.35);
      geo.translate(x, barY, -0.2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
      group.add(mesh);
      return mesh;
    };
    bar = { red: mkHalf(-0.33, 0xff2020), blue: mkHalf(0.33, 0x2040ff) };
  }

  if (scene) scene.add(group);
  return {
    group,
    headL, headR, tailL, tailR, shadow,
    lightbar: bar,
    shell,
    dispose(sceneNext) {
      if (sceneNext) sceneNext.remove(group);
      shell.material.dispose();
      headL.material.dispose();
    },
  };
}

/** Arcade car physics. car: {x, z, yaw, vx, vz, hp, type}; ctl: {throttle, steer, handbrake}. */
export function stepCar(car, dt, ctl, world) {
  const spec = CAR_TYPES[car.type];
  const boost = car.boost || 1;   // pursuit cruisers scale their spec with wanted stars
  const maxSpeed = spec.maxSpeed * boost;
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const fwdSpeed = car.vx * fx + car.vz * fz;
  const latX = car.vx - fx * fwdSpeed;
  const latZ = car.vz - fz * fwdSpeed;

  let accel = 0;
  if (ctl.throttle > 0) accel = spec.accel * boost * ctl.throttle * Math.max(0.15, 1 - Math.max(0, fwdSpeed) / maxSpeed);
  else if (ctl.throttle < 0) accel = fwdSpeed > 0.5 ? -spec.brake : -spec.accel * 0.55;

  const grip = (ctl.handbrake ? spec.grip * 0.35 : spec.grip) * (car.slippery ? 0.6 : 1);
  const latDamp = Math.exp(-grip * dt);
  car.vx = fx * (fwdSpeed + accel * dt) + latX * latDamp;
  car.vz = fz * (fwdSpeed + accel * dt) + latZ * latDamp;

  const roll = Math.exp(-(ctl.handbrake ? 1.6 : 0.06) * dt);
  car.vx *= roll ** 0.25;
  car.vz *= roll ** 0.25;

  const speed = Math.hypot(car.vx, car.vz);
  const steerAuthority = Math.min(1, Math.abs(fwdSpeed) / 5) * (1 - Math.min(0.55, Math.abs(fwdSpeed) / maxSpeed * 0.55));
  const dirSign = fwdSpeed < -0.5 ? -1 : 1;
  car.yaw += ctl.steer * spec.turn * steerAuthority * dirSign * dt * (ctl.handbrake ? 1.5 : 1);

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Static collisions: front and rear circles.
  const halfLen = spec.size[2] / 2;
  let impact = 0;
  for (const s of [1, -1]) {
    const px = car.x + fx * halfLen * 0.62 * s;
    const pz = car.z + fz * halfLen * 0.62 * s;
    const hit = world.collideCircle(px, pz, spec.size[0] * 0.5 + 0.15);
    if (hit.depth > 0.001) {
      car.x += hit.x - px;
      car.z += hit.z - pz;
      const into = -(car.vx * hit.nx + car.vz * hit.nz);
      if (into > 0) {
        impact = Math.max(impact, into);
        car.vx += hit.nx * into * 1.35;
        car.vz += hit.nz * into * 1.35;
        car.vx *= 0.72;
        car.vz *= 0.72;
      }
    }
  }
  car.speed = Math.hypot(car.vx, car.vz);
  return impact;
}

/** Separating-circle impulse between two cars; returns the closing speed. */
export function collideCars(a, b) {
  const ra = CAR_TYPES[a.type].size[2] * 0.33;
  const rb = CAR_TYPES[b.type].size[2] * 0.33;
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  let dist = Math.hypot(dx, dz);
  if (dist === 0 || dist > ra + rb) return 0;
  if (dist < 0.01) { dx = 1; dz = 0; dist = 0.01; }
  const nx = dx / dist;
  const nz = dz / dist;
  const overlap = ra + rb - dist;
  const ma = CAR_TYPES[a.type].mass;
  const mb = CAR_TYPES[b.type].mass;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.z -= nz * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.z += nz * overlap * (ma / total);
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing > 0) {
    const impulse = closing * 1.15;
    a.vx -= nx * impulse * (mb / total);
    a.vz -= nz * impulse * (mb / total);
    b.vx += nx * impulse * (ma / total);
    b.vz += nz * impulse * (ma / total);
    return closing;
  }
  return 0;
}
