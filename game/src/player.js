// The player on foot: a small low-poly figure with swinging arms and legs,
// walking and running, pushed out of buildings and shoving through the crowd.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { box, mergeParts } from './geo.js';

export function createPlayer(scene, world) {
  const group = new THREE.Group();

  const torsoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const torso = new THREE.Mesh(mergeParts([
    box(0.52, 0.62, 0.3, 0, 1.18, 0, 0xe84a8a),       // neon pink jacket
    box(0.56, 0.16, 0.32, 0, 1.42, 0, 0x22e6ff),       // cyan collar
    box(0.3, 0.14, 0.2, 0, 1.52, -0.12, 0x1a1622),     // hair
  ]), torsoMat);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a88a, roughness: 0.9 }),
  );
  head.position.y = 1.62;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 });
  const legGeo = new THREE.BoxGeometry(0.17, 0.6, 0.2);
  legGeo.translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, legMat);
  const legR = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.13, 0.9, 0);
  legR.position.set(0.13, 0.9, 0);
  const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.15);
  armGeo.translate(0, -0.27, 0);
  const armMat = new THREE.MeshStandardMaterial({ color: 0xe84a8a, roughness: 0.85 });
  const armL = new THREE.Mesh(armGeo, armMat);
  const armR = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.34, 1.4, 0);
  armR.position.set(0.34, 1.4, 0);
  group.add(torso, head, legL, legR, armL, armR);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);
  scene.add(group);

  const state = {
    x: 0, z: 0, yaw: 0,
    hp: PLAYER.health,
    walkPhase: 0,
    speed: 0,
    inCar: false,
    down: 0,
  };

  /** move: camera-relative desired direction; returns nothing, mutates state. */
  function update(dt, moveX, moveZ, running) {
    const mag = Math.hypot(moveX, moveZ);
    if (state.down > 0) {
      state.down -= dt;
      state.speed = 0;
      syncMesh(dt, true);
      return;
    }
    if (mag > 0.01) {
      const targetYaw = Math.atan2(moveX, moveZ);
      let dy = targetYaw - state.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      state.yaw += dy * Math.min(1, 12 * dt);
      const max = running ? PLAYER.run : PLAYER.walk;
      state.speed = max;
      const nx = state.x + Math.sin(state.yaw) * state.speed * dt * (mag > 1 ? 1 : mag);
      const nz = state.z + Math.cos(state.yaw) * state.speed * dt * (mag > 1 ? 1 : mag);
      const push = world.collideCircle(nx, nz, PLAYER.radius);
      state.x = push.x;
      state.z = push.z;
    } else {
      state.speed *= Math.exp(-10 * dt);
    }
    state.walkPhase += dt * state.speed * 1.35;
    syncMesh(dt, false);
  }

  function syncMesh(dt, lying) {
    group.visible = !state.inCar;
    group.position.set(state.x, lying ? 0.1 : 0, state.z);
    group.rotation.y = state.yaw;
    const swing = Math.sin(state.walkPhase * 6) * Math.min(1, state.speed / 4) * 0.7;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    torso.position.y = 1.18 + Math.abs(Math.sin(state.walkPhase * 6)) * Math.min(1, state.speed / 4) * 0.03;
    head.position.y = 1.62;
    group.rotation.x = lying ? Math.PI / 2 : 0;
    if (lying) group.position.y = 0.35;
  }

  function damage(amount) {
    state.hp = Math.max(0, state.hp - amount);
    return state.hp <= 0;
  }

  function knockdown() {
    state.down = 2.4;
  }

  return { state, group, update, damage, knockdown };
}
