// The shared world: sky dome and water shaders, the day/night clock, the static
// collider grid (buildings, seawalls, containers) and little road-maths helpers
// every other system speaks in terms of. Owns no gameplay.
import * as THREE from 'three';
import { GRID, ISLAND_HALF, WORLD, PALETTE, DAY_LEN } from './config.js';

/* ---------- day/night keyframes: [tod, skyTop, skyHorizon, fog, sun, ambient, lamps] ---------- */
const KEYS = [
  [0.00, 0x241a4e, 0xff5a3c, 0x241a38, 0.34, 0.55, 0.75],
  [0.10, 0x160f38, 0x8a2a5e, 0x140f28, 0.08, 0.34, 1.00],
  [0.20, 0x05060f, 0x101a34, 0x070a16, 0.02, 0.24, 1.00],
  [0.60, 0x05060f, 0x101a34, 0x070a16, 0.02, 0.24, 1.00],
  [0.72, 0x1c2a55, 0xd96a4a, 0x28203f, 0.16, 0.36, 0.65],
  [0.84, 0x2e63b8, 0x9fc4e8, 0x8fa8c8, 1.00, 0.85, 0.05],
  [0.96, 0x3a4a8a, 0xd9a0b0, 0x7a86a8, 0.70, 0.70, 0.20],
  [1.00, 0x241a4e, 0xff5a3c, 0x241a38, 0.34, 0.55, 0.75],
];

function sampleKeys(tod) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (tod >= KEYS[i][0] && tod <= KEYS[i + 1][0]) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const t = (tod - a[0]) / span;
  const mixHex = (ha, hb) => new THREE.Color(ha).lerp(new THREE.Color(hb), t);
  const lerp = (x, y) => x + (y - x) * t;
  return {
    skyTop: mixHex(a[1], b[1]),
    skyHor: mixHex(a[2], b[2]),
    fog: mixHex(a[3], b[3]),
    sun: lerp(a[4], b[4]),
    amb: lerp(a[5], b[5]),
    lamps: lerp(a[6], b[6]),
  };
}

/* ---------- static collider grid ---------- */
const CELL = 48;

export function createWorld(scene) {
  const grid = new Map();   // "gx,gz" -> [aabb...]
  const statics = [];

  function addStatic(x, z, hx, hz) {
    const aabb = { x, z, hx, hz };
    statics.push(aabb);
    const x0 = Math.floor((x - hx) / CELL);
    const x1 = Math.floor((x + hx) / CELL);
    const z0 = Math.floor((z - hz) / CELL);
    const z1 = Math.floor((z + hz) / CELL);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(aabb);
      }
    }
  }

  /** Push a circle out of every static AABB it overlaps; returns {x, z, nx, nz, depth}. */
  function collideCircle(px, pz, r) {
    let x = px;
    let z = pz;
    let nx = 0;
    let nz = 0;
    let depth = 0;
    const gx0 = Math.floor((x - r) / CELL);
    const gx1 = Math.floor((x + r) / CELL);
    const gz0 = Math.floor((z - r) / CELL);
    const gz1 = Math.floor((z + r) / CELL);
    for (let gx = gx0; gx <= gx1; gx += 1) {
      for (let gz = gz0; gz <= gz1; gz += 1) {
        const bucket = grid.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const a of bucket) {
          const dx = x - a.x;
          const dz = z - a.z;
          const ox = a.hx + r - Math.abs(dx);
          const oz = a.hz + r - Math.abs(dz);
          if (ox <= 0 || oz <= 0) continue;
          if (ox < oz) {
            const sign = dx < 0 ? -1 : 1;
            x += ox * sign;
            nx = sign;
            depth = Math.max(depth, ox);
          } else {
            const sign = dz < 0 ? -1 : 1;
            z += oz * sign;
            nz = sign;
            depth = Math.max(depth, oz);
          }
        }
      }
    }
    return { x, z, nx, nz, depth };
  }

  /* ---------- road helpers ---------- */
  // Right-hand traffic: north (-z) keeps the +x lane, south the -x lane,
  // east (+x) keeps the +z lane, west the -z lane.
  function laneFor(axis, index, dirSign) {
    const line = GRID.lineAt(index);
    if (axis === 'v') return { fixed: line + 3 * dirSign, dir: [0, dirSign] };
    return { fixed: line + 3 * dirSign, dir: [dirSign, 0] };
  }

  function nearestLineIndex(value) {
    return Math.max(0, Math.min(GRID.lines - 1, Math.round(value / GRID.cell) + 10));
  }

  function onRoad(x, z) {
    const rx = Math.abs(x - GRID.lineAt(nearestLineIndex(x)));
    const rz = Math.abs(z - GRID.lineAt(nearestLineIndex(z)));
    return rx <= GRID.roadW / 2 || rz <= GRID.roadW / 2;
  }

  /** Inside the drivable island (bridges/islets included, water excluded). */
  function onLand(x, z) {
    if (Math.abs(x) <= ISLAND_HALF && Math.abs(z) <= ISLAND_HALF) return true;
    const a = GRID.isletA;
    if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return true;
    const b = GRID.isletB;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    // bridges: vertical x=0 north of the island, horizontal z=GRID.lineAt(13) east
    if (Math.abs(x) < 7 && z < -ISLAND_HALF && z > GRID.isletA.z1) return true;
    if (Math.abs(z - GRID.lineAt(13)) < 7 && x > ISLAND_HALF && x < GRID.isletB.x0) return true;
    return false;
  }

  /* ---------- environment ---------- */
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x241a4e) },
    horColor: { value: new THREE.Color(0xff5a3c) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2300, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 topColor; uniform vec3 horColor;
        void main(){ float h = pow(clamp(normalize(vDir).y, 0.0, 1.0), 0.55);
        vec3 col = mix(horColor, topColor, h);
        float band = pow(1.0 - abs(normalize(vDir).y), 8.0) * 0.35;
        col += horColor * band; gl_FragColor = vec4(col, 1.0); }`,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const waterUniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(PALETTE.waterDeep) },
    crest: { value: new THREE.Color(PALETTE.waterCrest) },
    foam: { value: new THREE.Color(PALETTE.waterFoam) },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(5200, 5200, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, waterUniforms]),
      fog: true,
      vertexShader: `#include <fog_pars_vertex>
        varying vec3 vPos;
        void main(){ vec4 world = modelMatrix * vec4(position,1.0); vPos = world.xyz;
        vec4 mvPosition = viewMatrix * world; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
      fragmentShader: `#include <fog_pars_fragment>
        uniform float time; uniform vec3 deep; uniform vec3 crest; uniform vec3 foam;
        varying vec3 vPos;
        void main(){
          float w = sin(vPos.x * 0.045 + time * 1.3) * 0.5 + sin(vPos.z * 0.03 - time * 0.9) * 0.5;
          vec3 col = mix(deep, crest, smoothstep(-0.35, 0.85, w));
          float spark = pow(max(0.0, sin(vPos.x * 0.31 + time * 2.6) * sin(vPos.z * 0.23 - time * 2.1)), 18.0);
          col += foam * spark * 0.5;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WORLD.waterY;
  scene.add(water);

  // Stars and a moon, both dimmed to nothing by day.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(700 * 3);
  let sp = 7;
  const srand = () => { sp = (sp * 16807) % 2147483647; return sp / 2147483647; };
  for (let i = 0; i < 700; i += 1) {
    const theta = srand() * Math.PI * 2;
    const phi = srand() * 0.9;
    starPos[i * 3] = Math.cos(theta) * Math.cos(phi) * 2100;
    starPos[i * 3 + 1] = Math.sin(phi) * 1900 + 120;
    starPos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * 2100;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xcfe0ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(46, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf4f0ff, transparent: true, opacity: 0, fog: false }),
  );
  scene.add(moon);

  const sun = new THREE.DirectionalLight(0xffe2b8, 0.34);
  sun.position.set(-300, 240, -500);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x8899cc, 0.5);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x35406a, 0x0c0e14, 0.45);
  scene.add(hemi);

  let tod = 0.05;
  let frozen = false;

  /** Apply the clock to sky, fog, lights, stars and water; returns the lamp factor. */
  function applyTime() {
    const k = sampleKeys(tod);
    skyUniforms.topColor.value.copy(k.skyTop);
    skyUniforms.horColor.value.copy(k.skyHor);
    scene.fog.color.copy(k.fog);
    scene.fog.density = THREE.MathUtils.lerp(WORLD.fogNight, WORLD.fogDay, Math.min(1, k.sun + k.amb * 0.4));
    sun.intensity = k.sun;
    sun.color.setHex(tod > 0.68 && tod < 0.8 ? 0xffc490 : 0xffe2b8);
    ambient.intensity = k.amb * 0.6;
    hemi.intensity = 0.18 + k.amb * 0.3;
    const night = 1 - Math.min(1, k.sun * 2 + k.amb * 0.35);
    starMat.opacity = night * 0.85;
    moon.material.opacity = night * 0.95;
    const ma = tod * Math.PI * 2 - Math.PI * 0.55;
    moon.position.set(Math.cos(ma) * 1500, Math.max(240, Math.sin(ma) * 1200), -Math.abs(Math.sin(ma)) * 900 - 300);
    return { ...k, night };
  }

  return {
    scene,
    addStatic,
    collideCircle,
    statics,
    laneFor,
    nearestLineIndex,
    onRoad,
    onLand,
    get tod() { return tod; },
    set tod(v) { tod = v; },
    get frozen() { return frozen; },
    set frozen(v) { frozen = v; },
    tick(dt) { if (!frozen) tod = (tod + dt / DAY_LEN) % 1; },
    applyTime,
    waterTime: (v) => { water.material.uniforms.time.value = v; },
  };
}
