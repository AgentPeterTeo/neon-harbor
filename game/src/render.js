// Rendering: one WebGL renderer with a gentle filmic tone-map so the neon pops,
// sized to the window, pixel ratio capped for laptop GPUs.
import * as THREE from 'three';

export function createRender() {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  function resize(camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', () => {
    resize(window.__nhCamera);
  });

  return { renderer, canvas, resize };
}
