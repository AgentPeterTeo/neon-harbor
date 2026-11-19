// The procedural city: one seeded build pass that returns a full island — road grid
// with markings and sidewalks, downtown towers with emissive windows, the neon main
// street, container docks with cranes, palm suburbs, two bridge-linked islets —
// all as merged or instanced geometry so the whole city is ~35 draw calls.
import * as THREE from 'three';
import { GRID, ISLAND_HALF, PALETTE, lightPhase } from './config.js';
import { box, cyl, makeSignAtlas, mergeParts } from './geo.js';

const WINDOW_LIT = [0xffd9a0, 0xffd9a0, 0x9fd8ff, 0x9fd8ff, 0xff9fd0];
const SIGN_WORDS = ['LUNA', 'CLUB NEON', 'HARBOR', 'SUSHI', 'HOTEL', '24H DINER',
  'PYRAMID', 'MOTEL', 'CASINO', 'TATTOO', 'ARCADE', 'NOODLE BAR', 'PAWN', 'LIQUOR', 'VINYL', 'KARAOKE'];

export function districtAt(x, z) {
  const i = Math.max(0, Math.min(19, Math.floor((x + 10 * GRID.cell) / GRID.cell)));
  const j = Math.max(0, Math.min(19, Math.floor((z + 10 * GRID.cell) / GRID.cell)));
  const a = GRID.isletA;
  if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return 'Harbor Park';
  const b = GRID.isletB;
  if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return 'Lighthouse Point';
  if (x > ISLAND_HALF || x < -ISLAND_HALF || z > ISLAND_HALF || z < -ISLAND_HALF) return 'Neon Harbor';
  if (j >= 15) return 'The Docks';
  if (i <= 4 && j <= 4) return 'Palm Bay';
  if (i >= 8 && i <= 11 && j >= 8 && j <= 11) return 'Downtown';
  if ((j === 9 || j === 10) && i >= 3 && i <= 16) return 'Neon Strip';
  return 'Midtown';
}

function blockKind(i, j) {
  if (i >= 8 && i <= 11 && j >= 8 && j <= 11) return 'downtown';
  if ((j === 9 || j === 10) && i >= 3 && i <= 16) return 'neon';
  if (j >= 15) return 'docks';
  if (i <= 4 && j <= 4) return 'suburb';
  return 'commercial';
}

const BLOCK_TOP_COLORS = {
  downtown: 0x23242e, neon: 0x1d1a24, docks: 0x33363c, suburb: 0x1c3324, commercial: 0x24272f,
};

/** Compose an instance matrix: translate, yaw, scale. */
function mat(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(sx, sy, sz),
  );
  return m;
}

function makeInstanced(geo, material, list, { shadow = false, colors = null } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const tint = new THREE.Color();
  for (let i = 0; i < list.length; i += 1) {
    mesh.setMatrixAt(i, list[i]);
    if (colors) {
      tint.setHex(colors[i]);
      mesh.setColorAt(i, tint);
    }
  }
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function buildCity(scene, world, rand) {
  /* ---------------- island slab, block tops, water edge ---------------- */
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(ISLAND_HALF * 2 + 8, 2.2, ISLAND_HALF * 2 + 8),
    new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: 0.95 }),
  );
  slab.position.y = -1.1;
  scene.add(slab);

  const topList = [];
  const topColors = [];
  for (let i = 0; i < 20; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      const cx = GRID.lineAt(i) + GRID.cell / 2;
      const cz = GRID.lineAt(j) + GRID.cell / 2;
      topList.push(mat(cx, 0.012, cz));
      topColors.push(BLOCK_TOP_COLORS[blockKind(i, j)]);
    }
  }
  const blockTopGeo = new THREE.PlaneGeometry(GRID.cell - 13, GRID.cell - 13);
  blockTopGeo.rotateX(-Math.PI / 2);
  scene.add(makeInstanced(blockTopGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), topList, { colors: topColors }));

  // Seawall ring: visible curb the car bounces off instead of swimming.
  const wallGeo = new THREE.BoxGeometry(ISLAND_HALF * 2 + 10, 1.1, 2.4);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2e38, roughness: 0.9 });
  for (let side = 0; side < 4; side += 1) {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    if (side < 2) {
      wall.position.set(0, 0.42, side === 0 ? -ISLAND_HALF - 1.2 : ISLAND_HALF + 1.2);
      world.addStatic(0, side === 0 ? -ISLAND_HALF - 1.2 : ISLAND_HALF + 1.2, ISLAND_HALF + 8, 1.2);
    } else {
      wall.rotation.y = Math.PI / 2;
      wall.position.set(side === 2 ? -ISLAND_HALF - 1.2 : ISLAND_HALF + 1.2, 0.42, 0);
      world.addStatic(side === 2 ? -ISLAND_HALF - 1.2 : ISLAND_HALF + 1.2, 0, 1.2, ISLAND_HALF + 8);
    }
    scene.add(wall);
  }

  /* ---------------- roads, markings, sidewalks ---------------- */
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.9, metalness: 0.08 });
  const roadVGeo = new THREE.PlaneGeometry(GRID.roadW, ISLAND_HALF * 2);
  roadVGeo.rotateX(-Math.PI / 2);
  const roadHGeo = new THREE.PlaneGeometry(ISLAND_HALF * 2, GRID.roadW);
  roadHGeo.rotateX(-Math.PI / 2);
  const vList = [];
  const hList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    vList.push(mat(GRID.lineAt(i), 0.02, 0));
    hList.push(mat(0, 0.02, GRID.lineAt(i)));
  }
  scene.add(makeInstanced(roadVGeo, roadMat, vList));
  scene.add(makeInstanced(roadHGeo, roadMat, hList));

  const patchList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    for (let j = 0; j < GRID.lines; j += 1) patchList.push(mat(GRID.lineAt(i), 0.045, GRID.lineAt(j)));
  }
  const patchGeo = new THREE.PlaneGeometry(GRID.roadW + 0.6, GRID.roadW + 0.6);
  patchGeo.rotateX(-Math.PI / 2);
  scene.add(makeInstanced(patchGeo, roadMat, patchList));

  const dashGeo = new THREE.PlaneGeometry(0.34, 3.1);
  dashGeo.rotateX(-Math.PI / 2);
  const dashList = [];
  const dashStep = 9;
  for (let i = 0; i < GRID.lines; i += 1) {
    for (let z = -ISLAND_HALF + 4; z < ISLAND_HALF; z += dashStep) {
      let nearCross = false;
      for (let j = 0; j < GRID.lines; j += 1) if (Math.abs(z - GRID.lineAt(j)) < 8) nearCross = true;
      if (!nearCross) dashList.push(mat(GRID.lineAt(i), 0.05, z));
    }
    for (let x = -ISLAND_HALF + 4; x < ISLAND_HALF; x += dashStep) {
      let nearCross = false;
      for (let j = 0; j < GRID.lines; j += 1) if (Math.abs(x - GRID.lineAt(j)) < 8) nearCross = true;
      if (!nearCross) dashList.push(mat(x, 0.05, GRID.lineAt(i)));
    }
  }
  scene.add(makeInstanced(dashGeo, new THREE.MeshBasicMaterial({ color: 0xd8c56a }), dashList));

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xb8bcc8 });
  const edgeVGeo = new THREE.PlaneGeometry(0.22, ISLAND_HALF * 2);
  edgeVGeo.rotateX(-Math.PI / 2);
  const edgeHGeo = new THREE.PlaneGeometry(ISLAND_HALF * 2, 0.22);
  edgeHGeo.rotateX(-Math.PI / 2);
  const edgeVList = [];
  const edgeHList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    edgeVList.push(mat(GRID.lineAt(i) - 5.7, 0.045, 0), mat(GRID.lineAt(i) + 5.7, 0.045, 0));
    edgeHList.push(mat(0, 0.045, GRID.lineAt(i) - 5.7), mat(0, 0.045, GRID.lineAt(i) + 5.7));
  }
  scene.add(makeInstanced(edgeVGeo, edgeMat, edgeVList));
  scene.add(makeInstanced(edgeHGeo, edgeMat, edgeHList));

  const sideMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const sideVGeo = new THREE.BoxGeometry(GRID.sideW, GRID.sideH, ISLAND_HALF * 2);
  const sideHGeo = new THREE.BoxGeometry(ISLAND_HALF * 2, GRID.sideH, GRID.sideW);
  const sideVList = [];
  const sideHList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    const off = GRID.roadW / 2 + GRID.sideW / 2;
    sideVList.push(mat(GRID.lineAt(i) - off, 0, 0), mat(GRID.lineAt(i) + off, 0, 0));
    sideHList.push(mat(0, 0, GRID.lineAt(i) - off), mat(0, 0, GRID.lineAt(i) + off));
  }
  scene.add(makeInstanced(sideVGeo, sideMat, sideVList));
  scene.add(makeInstanced(sideHGeo, sideMat, sideHList));

  /* ---------------- buildings + windows ---------------- */
  const buildings = [];       // {x,z,hx,hz,h,kind,color} for colliders & windows
  const bList = [];
  const bColors = [];
  const bTint = new THREE.Color();
  const VARY = (hex, amount) => {
    bTint.setHex(hex);
    const f = 1 + (rand() - 0.5) * amount;
    bTint.r = Math.min(1, bTint.r * f);
    bTint.g = Math.min(1, bTint.g * f);
    bTint.b = Math.min(1, bTint.b * f);
    return bTint.getHex();
  };

  function addBuilding(x, z, w, d, h, color) {
    const half = GRID.cell / 2 - 6.5;
    const hx = Math.min(w / 2, half);
    const hz = Math.min(d / 2, half);
    buildings.push({ x, z, hx, hz, h, color });
    world.addStatic(x, z, hx, hz);
    bList.push(mat(x, h / 2, z, 0, w, h, d));
    bColors.push(color);
  }

  for (let i = 0; i < 20; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      const kind = blockKind(i, j);
      const cx = GRID.lineAt(i) + GRID.cell / 2;
      const cz = GRID.lineAt(j) + GRID.cell / 2;
      const q = 19;   // quadrant size: interior is ~77 wide
      for (let qx = 0; qx < 2; qx += 1) {
        for (let qz = 0; qz < 2; qz += 1) {
          const ox = cx + (qx === 0 ? -q : q) + (rand() - 0.5) * 6;
          const oz = cz + (qz === 0 ? -q : q) + (rand() - 0.5) * 6;
          if (kind === 'downtown') {
            const w = 22 + rand() * 14;
            const d = 22 + rand() * 14;
            const h = 48 + rand() * 88;
            addBuilding(ox, oz, w, d, h, VARY(0x1b2233, 0.35));
            if (rand() < 0.7) addBuilding(ox, oz, w * 0.62, d * 0.62, h + 10 + rand() * 22, VARY(0x161c2b, 0.3));
          } else if (kind === 'neon') {
            const w = 20 + rand() * 12;
            const d = 26 + rand() * 12;
            const h = 12 + rand() * 24;
            addBuilding(ox, oz, w, d, h, VARY(0x1c1626, 0.4));
          } else if (kind === 'commercial') {
            const w = 16 + rand() * 12;
            const d = 16 + rand() * 12;
            const h = 9 + rand() * 18;
            addBuilding(ox, oz, w, d, h, VARY(0x2a2f3c, 0.4));
          } else if (kind === 'docks') {
            if (rand() < 0.55) {
              const w = 24 + rand() * 16;
              const d = 20 + rand() * 16;
              const h = 7 + rand() * 7;
              addBuilding(ox, oz, w, d, h, VARY(0x323a46, 0.3));
            }
          } else if (kind === 'suburb') {
            // houses are handled below (instanced shells), not big blocks
          }
        }
      }
    }
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  scene.add(makeInstanced(unitBox, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.12 }), bList, { colors: bColors }));

  // Windows: instanced glow planes on every facade tall enough to deserve them.
  const winList = [];
  const winColors = [];
  const winGeo = new THREE.PlaneGeometry(1.5, 1.9);
  const litTint = new THREE.Color();
  for (const b of buildings) {
    if (b.h < 9 || b.hx < 5 || b.hz < 5) continue;
    const rows = Math.max(2, Math.min(14, Math.floor(b.h / 3.6)));
    for (let side = 0; side < 4; side += 1) {
      const yaw = side * Math.PI / 2;
      const nx = Math.sin(yaw);
      const nz = Math.cos(yaw);
      const tx = Math.cos(yaw);
      const tz = -Math.sin(yaw);
      const off = (side % 2 === 0 ? b.hz : b.hx) + 0.09;
      const span = side % 2 === 0 ? b.hx : b.hz;
      const cols = Math.max(3, Math.min(8, Math.floor(span / 2.4)));
      const stepY = Math.max(2.8, b.h / rows);
      for (let r = 0; r < rows; r += 1) {
        const y = 2.6 + r * stepY;
        if (y > b.h - 1.4) break;
        for (let c = 0; c < cols; c += 1) {
          const along = (c - (cols - 1) / 2) * (span * 2 / cols);
          winList.push(mat(b.x + nx * off + tx * along, y, b.z + nz * off + tz * along, yaw));
          if (rand() < 0.45) litTint.setHex(WINDOW_LIT[Math.floor(rand() * WINDOW_LIT.length)]);
          else litTint.setHex(0x0d1420);
          winColors.push(litTint.getHex());
        }
      }
    }
  }
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
  const windows = makeInstanced(winGeo, winMat, winList, { colors: winColors });
  scene.add(windows);

  /* ---------------- neon signs (one atlas, one merged mesh) ---------------- */
  const atlas = makeSignAtlas(SIGN_WORDS);
  const signParts = [];
  const uvFor = (geo, word) => {
    const r = atlas.words[word];
    const uv = geo.getAttribute('uv');
    uv.setXY(0, r.u0, r.v1); uv.setXY(1, r.u1, r.v1);
    uv.setXY(2, r.u0, r.v0); uv.setXY(3, r.u1, r.v0);
    return geo;
  };
  let signIndex = 0;
  for (const b of buildings) {
    const kind = districtAt(b.x, b.z);
    let made = false;
    if (kind === 'Neon Strip') {
      const faceDown = b.z < 0;
      const word = SIGN_WORDS[signIndex++ % SIGN_WORDS.length];
      const w = Math.min(13, Math.max(7, b.hx * 1.6));
      const geo = uvFor(new THREE.PlaneGeometry(w, w * 0.38), word);
      const y = Math.min(b.h - 1.8, 7 + rand() * 8);
      const m = new THREE.Matrix4();
      m.makeRotationY(faceDown ? Math.PI : 0);
      m.setPosition(b.x, y, b.z + (faceDown ? -b.hz - 0.35 : b.hz + 0.35));
      signParts.push({ geo, matrix: m, color: 0xffffff });
      if (rand() < 0.6) {
        const word2 = SIGN_WORDS[signIndex++ % SIGN_WORDS.length];
        const geo2 = uvFor(new THREE.PlaneGeometry(2.6, 7), word2);
        const m2 = new THREE.Matrix4();
        m2.makeRotationY(Math.PI / 2);
        m2.setPosition(b.x + b.hx + 0.35, 4.6 + rand() * 4, b.z + (rand() - 0.5) * b.hz);
        signParts.push({ geo: geo2, matrix: m2, color: 0xffffff });
      }
      made = true;
    } else if (kind === 'Midtown' && b.h > 14 && rand() < 0.35) {
      const word = SIGN_WORDS[signIndex++ % SIGN_WORDS.length];
      const geo = uvFor(new THREE.PlaneGeometry(6, 2.4), word);
      const m = new THREE.Matrix4();
      m.makeRotationY(b.x < 0 ? Math.PI / 2 : -Math.PI / 2);
      m.setPosition(b.x + (b.x < 0 ? b.hx + 0.35 : -b.hx - 0.35), 5 + rand() * 5, b.z);
      signParts.push({ geo, matrix: m, color: 0xffffff });
      made = true;
    } else if (kind === 'Downtown' && b.h > 70 && rand() < 0.5) {
      const word = SIGN_WORDS[signIndex++ % SIGN_WORDS.length];
      const geo = uvFor(new THREE.PlaneGeometry(11, 4.4), word);
      const m = new THREE.Matrix4();
      m.makeRotationY(rand() < 0.5 ? 0 : Math.PI / 2);
      m.setPosition(b.x, b.h + 2.6, b.z);
      signParts.push({ geo, matrix: m, color: 0xffffff });
      made = true;
    }
    if (made) {
      // roofline accent so sign buildings read as venues, not boxes
      signParts.push({ geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), matrix: mat(b.x, b.h + 0.2, b.z), color: 0x101218 });
    }
  }
  const signGeo = mergeParts(signParts.map((p) => ({ geo: p.geo, matrix: p.matrix, color: 0xffffff })));
  const signMat = new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(signGeo, signMat));

  /* ---------------- street lamps + glow pools ---------------- */
  const lampList = [];
  const headList = [];
  const poolList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    for (let s = -ISLAND_HALF + 24; s < ISLAND_HALF; s += 48) {
      const side = Math.floor(s / 48) % 2 === 0 ? 1 : -1;
      lampList.push(mat(GRID.lineAt(i) + 7.9 * side, 0, s, side < 0 ? Math.PI : 0));
      headList.push(mat(GRID.lineAt(i) + 7.9 * side - 1.1 * side, 5.55, s));
      poolList.push(mat(GRID.lineAt(i) + 7.9 * side - 1.1 * side, 0.06, s, 0, 1));
      lampList.push(mat(s, 0, GRID.lineAt(i) + 7.9 * side, side < 0 ? Math.PI / 2 : -Math.PI / 2));
      headList.push(mat(s, 5.55, GRID.lineAt(i) + 7.9 * side - 1.1 * side));
      poolList.push(mat(s, 0.06, GRID.lineAt(i) + 7.9 * side - 1.1 * side, 0, 1));
    }
  }
  const poleGeo = mergeParts([box(0.16, 5.4, 0.16, 0, 2.7, 0, 0x3c4048), box(1.5, 0.12, 0.14, -0.75, 5.4, 0, 0x3c4048)]);
  scene.add(makeInstanced(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), lampList));
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  scene.add(makeInstanced(new THREE.SphereGeometry(0.3, 8, 6), lampHeadMat, headList));

  const glowTexInner = 'rgba(255,214,140,0.9)';
  const poolMat = new THREE.MeshBasicMaterial({
    map: null, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  // glow pools built below once textures exist; placeholder opacity animated per frame
  const poolGeo = new THREE.PlaneGeometry(14, 14);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = makeInstanced(poolGeo, poolMat, poolList);
  scene.add(pools);

  /* ---------------- traffic lights ---------------- */
  const tlPoleList = [];
  const tlNSList = [];
  const tlEWList = [];
  const tlHeadList = [];
  for (let i = 0; i < GRID.lines; i += 1) {
    for (let j = 0; j < GRID.lines; j += 1) {
      const x = GRID.lineAt(i) - 7.4;
      const z = GRID.lineAt(j) - 7.4;
      tlPoleList.push(mat(x, 0, z));
      tlHeadList.push(mat(x, 4.4, z + 0.3));
      tlNSList.push(mat(x, 4.4, z + 0.62));
      tlEWList.push(mat(x + 0.32, 4.4, z + 0.3, Math.PI / 2));
    }
  }
  const tlPoleGeo = mergeParts([box(0.14, 4.4, 0.14, 0, 2.2, 0, 0x2c3038)]);
  scene.add(makeInstanced(tlPoleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), tlPoleList));
  scene.add(makeInstanced(new THREE.BoxGeometry(0.5, 1.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 }), tlHeadList));
  const nsMat = new THREE.MeshBasicMaterial({ color: 0x22ff66 });
  const ewMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  scene.add(makeInstanced(new THREE.SphereGeometry(0.17, 8, 6), nsMat, tlNSList));
  scene.add(makeInstanced(new THREE.SphereGeometry(0.17, 8, 6), ewMat, tlEWList));

  /* ---------------- docks: containers, cranes, ship ---------------- */
  const contList = [];
  const contColors = [];
  const CONT_COLORS = [0xa6402e, 0x2e6ea6, 0x3f8f7a, 0xc07a2a, 0x777f8c, 0x8f3f62];
  for (let i = 1; i < 19; i += 1) {
    for (let j = 15; j < 20; j += 1) {
      if (rand() > 0.62) continue;
      const cx = GRID.lineAt(i) + GRID.cell / 2;
      const cz = GRID.lineAt(j) + GRID.cell / 2;
      const rows = 2 + Math.floor(rand() * 2);
      for (let r = 0; r < rows; r += 1) {
        for (let s = 0; s < 5; s += 1) {
          if (rand() < 0.25) continue;
          const px = cx + (s - 2) * 7.4;
          const pz = cz + (r - 0.5) * 7.2;
          const stack = 1 + Math.floor(rand() * 3);
          for (let up = 0; up < stack; up += 1) {
            contList.push(mat(px, 1.3 + up * 2.55, pz, rand() < 0.5 ? 0 : Math.PI / 2));
            contColors.push(CONT_COLORS[Math.floor(rand() * CONT_COLORS.length)]);
          }
          world.addStatic(px, pz, 3.4, 1.4);
        }
      }
    }
  }
  const contGeo = new THREE.BoxGeometry(6.6, 2.5, 2.6);
  scene.add(makeInstanced(contGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.15 }), contList, { colors: contColors }));

  const craneParts = [];
  const craneAt = (x, z, yaw) => {
    const legH = 24;
    const parts = [
      box(2.2, legH, 2.2, -11, legH / 2, 0, 0xc78a2a), box(2.2, legH, 2.2, 11, legH / 2, 0, 0xc78a2a),
      box(44, 2.6, 2.6, 0, legH, 0, 0xd89a3a), box(6, 3.2, 5, 0, legH + 2.2, 0, 0x8a5f22),
      box(0.5, 8, 0.5, 13, legH - 4, 0, 0x333840),
    ];
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.setPosition(x, 0, z);
    for (const p of parts) {
      const pm = new THREE.Matrix4().makeTranslation(0, 0, 0);
      craneParts.push({ geo: p.geo, color: p.color, matrix: pm.multiplyMatrices(m, p.matrix) });
    }
    world.addStatic(x - 11, z, 1.6, 1.6);
    world.addStatic(x + 11, z, 1.6, 1.6);
  };
  craneAt(430, 930, 0.2);
  craneAt(560, 940, -0.15);
  craneAt(300, 935, 0.45);
  scene.add(new THREE.Mesh(mergeParts(craneParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));

  const ship = mergeParts([
    box(26, 9, 118, 0, 3.2, 0, 0x5a2430), box(24, 2, 110, 0, 8.6, 0, 0x3a2830),
    box(10, 9, 16, 0, 13, -38, 0x6a3844), box(26.5, 1, 40, 0, 9.4, 20, 0x33404a),
    cyl(1.2, 1.2, 6, 6, 0, 19, -38, 0x22262c, Math.PI / 2, 0),
    box(22, 0.9, 0.9, 0, 6.5, 34, 0xffe6b0), box(22, 0.9, 0.9, 0, 6.5, 6, 0xffe6b0),
    box(22, 0.9, 0.9, 0, 6.5, -20, 0xffe6b0),
    box(5, 2.4, 10, -6, 11, 16, 0xa6402e), box(5, 2.4, 10, 6, 11, 16, 0x2e6ea6),
    box(5, 2.4, 10, -6, 13.4, 16, 0x3f8f7a), box(5, 2.4, 10, 6, 13.4, 16, 0xc07a2a),
  ]);
  const shipMesh = new THREE.Mesh(ship, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  shipMesh.position.set(430, -0.4, 1090);
  shipMesh.rotation.y = 0.06;
  scene.add(shipMesh);

  /* ---------------- suburb houses + palms everywhere ---------------- */
  const houseList = [];
  const houseColors = [];
  const roofList = [];
  const palmTrunkList = [];
  const palmCrownList = [];
  const HOUSE_COLORS = [0xd8cfc0, 0xbcc8cc, 0xd8bfa8, 0xa8c4b8, 0xd8d2c0];
  for (let i = 0; i < 20; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      const kind = blockKind(i, j);
      const cx = GRID.lineAt(i) + GRID.cell / 2;
      const cz = GRID.lineAt(j) + GRID.cell / 2;
      if (kind === 'suburb') {
        for (let qx = 0; qx < 2; qx += 1) {
          for (let qz = 0; qz < 2; qz += 1) {
            const x = cx + (qx === 0 ? -19 : 19);
            const z = cz + (qz === 0 ? -19 : 19);
            const yaw = (qx === 0 ? 0 : Math.PI) + (rand() - 0.5) * 0.2;
            houseList.push(mat(x, 1.7, z, yaw));
            houseColors.push(HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)]);
            roofList.push(mat(x, 4.55, z, yaw + Math.PI / 4, 6.2, 1, 5.4));
            world.addStatic(x, z, 3.6, 3.4);
            if (rand() < 0.5) {
              palmTrunkList.push(mat(x + (rand() - 0.5) * 22, 0, z + (rand() - 0.5) * 22, 0, 1, 0.8 + rand() * 0.7, 1));
              palmCrownList.push(palmTrunkList[palmTrunkList.length - 1]);
            }
          }
        }
      } else if (kind === 'neon' && rand() < 0.5) {
        const x = cx + (rand() - 0.5) * 40;
        const z = cz + 32 * (rand() < 0.5 ? 1 : -1);
        palmTrunkList.push(mat(x, 0, z, 0, 1, 0.9 + rand() * 0.6, 1));
        palmCrownList.push(palmTrunkList[palmTrunkList.length - 1]);
      }
    }
  }
  // Harbor Park + Lighthouse islets get their palms during their builds below.

  const houseGeo = mergeParts([
    box(6.6, 3.4, 6, 0, 1.7, 0, 0xffffff), box(1.2, 2.2, 0.16, 0, 1.1, 3.05, 0x2a1f18),
    box(2.6, 1.6, 0.12, -1.6, 2.2, 3.02, 0x223548), box(2.6, 1.6, 0.12, 1.6, 2.2, 3.02, 0x223548),
  ]);
  scene.add(makeInstanced(houseGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), houseList, { colors: houseColors }));
  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  roofGeo.rotateY(Math.PI / 4);
  scene.add(makeInstanced(roofGeo, new THREE.MeshStandardMaterial({ color: 0x6e3a2a, roughness: 0.95 }), roofList));

  // Palms: instanced after every palm position (suburbs, main street, park) is known.

  /* ---------------- islets + bridges + lighthouse ---------------- */
  const isletA = GRID.isletA;
  const parkSlab = new THREE.Mesh(
    new THREE.BoxGeometry(isletA.x1 - isletA.x0, 2, isletA.z1 - isletA.z0),
    new THREE.MeshStandardMaterial({ color: 0x1a3020, roughness: 1 }),
  );
  parkSlab.position.set((isletA.x0 + isletA.x1) / 2, -0.95, (isletA.z0 + isletA.z1) / 2);
  scene.add(parkSlab);
  const isletB = GRID.isletB;
  const beachSlab = new THREE.Mesh(
    new THREE.BoxGeometry(isletB.x1 - isletB.x0, 2, isletB.z1 - isletB.z0),
    new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 }),
  );
  beachSlab.position.set((isletB.x0 + isletB.x1) / 2, -0.95, (isletB.z0 + isletB.z1) / 2);
  scene.add(beachSlab);

  const fountain = mergeParts([
    cyl(7, 7.6, 1.1, 12, 0, 0.55, 0, 0x3a4a58), cyl(0.8, 1.2, 3.4, 8, 0, 2.2, 0, 0x4a5a68),
    cyl(3.4, 3.4, 0.5, 12, 0, 1.35, 0, 0x1a7fa0),
  ]);
  const fountainMesh = new THREE.Mesh(fountain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  fountainMesh.position.set((isletA.x0 + isletA.x1) / 2, 0, (isletA.z0 + isletA.z1) / 2);
  scene.add(fountainMesh);
  for (let p = 0; p < 22; p += 1) {
    const a = (p / 22) * Math.PI * 2;
    palmTrunkList.push(mat(fountainMesh.position.x + Math.cos(a) * 60, 0, fountainMesh.position.z + Math.sin(a) * 44, 0, 1, 0.8 + (p % 5) * 0.16, 1));
    palmCrownList.push(palmTrunkList[palmTrunkList.length - 1]);
  }
  const lighthouse = mergeParts([
    cyl(3.2, 4.2, 17, 10, 0, 8.5, 0, 0xe8e4da), cyl(3.35, 3.35, 2.2, 10, 0, 6, 0, 0xc04040),
    cyl(3.35, 3.35, 2.2, 10, 0, 12, 0, 0xc04040), cyl(2.4, 3.4, 2.6, 8, 0, 18.4, 0, 0x2c3038),
    box(7, 4.4, 6, 9, 2.2, 2, 0xd8cfc0),
  ]);
  const lightMesh = new THREE.Mesh(lighthouse, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  lightMesh.position.set((isletB.x0 + isletB.x1) / 2, 0.05, (isletB.z0 + isletB.z1) / 2 - 30);
  scene.add(lightMesh);
  world.addStatic(lightMesh.position.x, lightMesh.position.z, 4.5, 4.5);
  world.addStatic(lightMesh.position.x + 9, lightMesh.position.z + 2, 3.6, 3.4);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), beaconMat);
  beaconMesh.position.set(lightMesh.position.x, 19.8, lightMesh.position.z);
  scene.add(beaconMesh);

  const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.9 });
  const railingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const deckA = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 140), bridgeDeckMat);
  deckA.position.set(0, -0.93, (-ISLAND_HALF + isletA.z1) / 2);
  scene.add(deckA);
  const deckB = new THREE.Mesh(new THREE.BoxGeometry(140, 2, 16), bridgeDeckMat);
  deckB.position.set((ISLAND_HALF + isletB.x0) / 2, -0.93, GRID.lineAt(13));
  scene.add(deckB);
  for (const deck of [[deckA, 'z'], [deckB, 'x']]) {
    const isA = deck[1] === 'z';
    const len = 140;
    for (let s = -1; s <= 1; s += 2) {
      const rail = new THREE.Mesh(
        mergeParts([box(0.4, 1.2, isA ? len : 0.4, 0, 0.5, 0, 0x3a4048), box(isA ? 0.4 : len, 0.5, isA ? 0.4 : 0.4, 0, 1.0, 0, 0x22e6ff)]),
        railingMat,
      );
      const rx = isA ? s * 7.6 : deck[0].position.x;
      const rz = isA ? deck[0].position.z : GRID.lineAt(13) + s * 7.6;
      rail.position.set(rx, 0.1, rz);
      scene.add(rail);
      world.addStatic(rx, rz, isA ? 0.5 : 70, isA ? 70 : 0.5);
    }
  }

  /* ---------------- palms (all positions collected by now) ---------------- */
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const frondParts = [];
  for (let f = 0; f < 7; f += 1) {
    const a = (f / 7) * Math.PI * 2;
    const rot = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(-0.42));
    rot.setPosition(Math.sin(a) * 1.15, 5.7, Math.cos(a) * 1.15);
    frondParts.push({ geo: new THREE.BoxGeometry(0.5, 0.08, 3.2), color: 0x1f7a3f, matrix: rot });
  }
  const crownGeo = mergeParts(frondParts);
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const crowns = palmCrownList.map((m) => {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(pos, quat, scale);
    return mat(pos.x, pos.y, pos.z, 0, 1, scale.y, 1);
  });
  scene.add(makeInstanced(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6e5136, roughness: 1 }), palmTrunkList));
  scene.add(makeInstanced(crownGeo, crownMat, crowns));

  /* ---------------- night-time glow pool texture (needs canvas) ---------------- */
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext('2d');
  const ggrad = gctx.createRadialGradient(32, 32, 3, 32, 32, 30);
  ggrad.addColorStop(0, glowTexInner);
  ggrad.addColorStop(1, 'rgba(255,180,90,0)');
  gctx.fillStyle = ggrad;
  gctx.fillRect(0, 0, 64, 64);
  const poolTex = new THREE.CanvasTexture(glowCanvas);
  poolMat.map = poolTex;
  poolMat.needsUpdate = true;

  /* ---------------- per-frame animation hooks ---------------- */
  const LIGHT_COLORS = [0x22ff66, 0xffd23a, 0xff3333];
  function update(time, lampFactor) {
    winMat.color.setScalar(0.25 + 0.75 * Math.min(1, lampFactor));
    lampHeadMat.color.setRGB(1, 0.86, 0.64).multiplyScalar(0.15 + 0.85 * Math.min(1, lampFactor));
    poolMat.opacity = 0.62 * lampFactor;
    signMat.color.setScalar(0.55 + 0.45 * Math.min(1, lampFactor * 1.2) * (0.94 + 0.06 * Math.sin(time * 2.3)));
    beaconMat.color.setScalar(0.4 + 0.6 * Math.max(0, Math.sin(time * 2.6)));
    const ph = lightPhase(time);
    nsMat.color.setHex(LIGHT_COLORS[ph.ns]);
    ewMat.color.setHex(LIGHT_COLORS[ph.ew]);
  }

  return {
    districtAt,
    update,
    windows,
    lampFactorMat: poolMat,
  };
}
