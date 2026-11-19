// Particles: one pooled Points cloud (one draw call) for smoke, fire, sparks and
// explosion debris. Additive blending, so a particle fades by dimming to black —
// no per-particle opacity attribute needed.
import * as THREE from 'three';
import { makeGlowTexture } from './geo.js';

const MAX = 260;
const GRAVITY = 3.2;

export function createParticles(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const base = new Float32Array(MAX * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.6,
    map: makeGlowTexture('rgba(255,255,255,1)'),
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;

  /** Spawn one particle; options: velocity, ttl, rgb colour (fades to black). */
  function spawn(x, y, z, options = {}) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    vel[i * 3] = options.vx ?? 0;
    vel[i * 3 + 1] = options.vy ?? 2.2;
    vel[i * 3 + 2] = options.vz ?? 0;
    maxLife[i] = life[i] = options.ttl ?? 0.9;
    const c = options.color ?? 0xffaa33;
    base[i * 3] = ((c >> 16) & 255) / 255;
    base[i * 3 + 1] = ((c >> 8) & 255) / 255;
    base[i * 3 + 2] = (c & 255) / 255;
  }

  function burst(x, y, z, count, options = {}) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + (options.phase ?? 0);
      const speed = (options.speed ?? 6) * (0.5 + 0.5 * ((i * 7 + 3) % 10) / 10);
      spawn(x, y, z, {
        vx: Math.cos(a) * speed,
        vy: (options.vy ?? 4) + ((i * 13) % 7) / 3,
        vz: Math.sin(a) * speed,
        ttl: (options.ttl ?? 0.9) * (0.7 + ((i * 11) % 6) / 12),
        color: options.color ?? 0xffaa33,
      });
    }
  }

  function update(dt) {
    for (let i = 0; i < MAX; i += 1) {
      if (life[i] <= 0) {
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0;
        continue;
      }
      life[i] -= dt;
      positions[i * 3] += vel[i * 3] * dt;
      positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 1 - 1.4 * dt;
      vel[i * 3 + 1] -= GRAVITY * dt;
      vel[i * 3 + 2] *= 1 - 1.4 * dt;
      const fade = Math.max(0, life[i] / maxLife[i]);
      colors[i * 3] = base[i * 3] * fade;
      colors[i * 3 + 1] = base[i * 3 + 1] * fade;
      colors[i * 3 + 2] = base[i * 3 + 2] * fade;
    }
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;
  }

  return { spawn, burst, update };
}
