// Geometry helpers: merge simple parts into one BufferGeometry with baked vertex
// colours (one draw call for whole props), plus the tiny runtime-generated canvas
// textures (glow discs, neon-sign atlas) — generated locally, never downloaded.
import * as THREE from 'three';

/** parts: [{ geo, color?, matrix? }] -> one non-indexed geometry with a color attribute. */
export function mergeParts(parts) {
  const itemized = parts.map((part) => {
    const geo = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) geo.applyMatrix4(part.matrix);
    return { geo, color: part.color ?? 0xffffff };
  });
  const total = itemized.reduce((sum, item) => sum + item.geo.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const tint = new THREE.Color();
  let offset = 0;
  for (const item of itemized) {
    const pos = item.geo.getAttribute('position');
    const nor = item.geo.getAttribute('normal');
    position.set(pos.array, offset * 3);
    if (nor) normal.set(nor.array, offset * 3);
    tint.setHex(item.color);
    for (let i = 0; i < pos.count; i += 1) {
      color[(offset + i) * 3] = tint.r;
      color[(offset + i) * 3 + 1] = tint.g;
      color[(offset + i) * 3 + 2] = tint.b;
    }
    offset += pos.count;
    item.geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** A plain box part for mergeParts, sized and placed, no rotation. */
export function box(w, h, d, x, y, z, color) {
  return { geo: new THREE.BoxGeometry(w, h, d), color, matrix: new THREE.Matrix4().makeTranslation(x, y, z) };
}

export function cyl(rt, rb, h, seg, x, y, z, color, rotX, rotZ) {
  const m = new THREE.Matrix4();
  const euler = new THREE.Euler(rotX ?? 0, 0, rotZ ?? 0);
  m.makeRotationFromEuler(euler);
  m.setPosition(x, y, z);
  return { geo: new THREE.CylinderGeometry(rt, rb, h, seg), color, matrix: m };
}

/** Radial soft disc texture for glow pools, headlight quads and particles. */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, inner.replace('1)', '0.55)'));
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * One atlas texture holding every glowing word used on the neon signs: the whole
 * main street's signage is then a single merged, one-draw-call mesh. Returns
 * { texture, words: { word: {u0,v0,u1,v1} } } in atlas UV space.
 */
export function makeSignAtlas(words) {
  const cols = 4;
  const rows = Math.ceil(words.length / cols);
  const cw = 256;
  const ch = 96;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07070c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const map = {};
  words.forEach((word, index) => {
    const cx = (index % cols) * cw;
    const cy = Math.floor(index / cols) * ch;
    const tint = index % 4 === 0 ? '#ff2d7a' : index % 4 === 1 ? '#22e6ff' : index % 4 === 2 ? '#ffd24a' : '#9a4dff';
    ctx.save();
    ctx.font = `bold ${word.length > 7 ? 46 : 58}px "Arial Black", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = tint;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    for (let pass = 0; pass < 3; pass += 1) ctx.fillText(word, cx + cw / 2, cy + ch / 2 + 4);
    ctx.restore();
    map[word] = {
      u0: cx / canvas.width, v0: 1 - (cy + ch) / canvas.height,
      u1: (cx + cw) / canvas.width, v1: 1 - cy / canvas.height,
    };
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, words: map };
}
