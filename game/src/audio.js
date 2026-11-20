// Neon Harbor — the sound system. A tiny WebAudio synthesizer, no audio files:
// the engine is a sawtooth that follows the speed, the siren is a two-tone
// whistle that tracks the wanted level, drifting tires hiss, and one-shot
// blips punctuate missions, busts and wrecks. M toggles everything; a blocked
// AudioContext (autoplay policy) degrades to silence until the first keypress.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenTimer = 0;
let skidGain = null;
let muted = false;

function ensureCtx() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  engineOsc = ctx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 55;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 480;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter).connect(engineGain).connect(master);
  engineOsc.start();

  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let nz = 0x2f6e2b1;
  for (let i = 0; i < len; i++) {
    nz = (nz * 1664525 + 1013904223) >>> 0;
    d[i] = (nz / 0xffffffff) * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  skidGain = ctx.createGain();
  skidGain.gain.value = 0;
  noise.connect(skidGain).connect(master);
  noise.start();
  return true;
}

function unlock() {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function initAudio() {
  if (!ensureCtx()) return;
  const kick = () => unlock();
  window.addEventListener('keydown', kick, { once: true });
  window.addEventListener('pointerdown', kick, { once: true });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.repeat) {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
    }
  });
}

function blip(freq, dur, type, vol) {
  if (!ctx || ctx.state !== 'running' || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + dur);
}

export function stingMission() {
  blip(660, 0.12, 'square', 0.2);
  setTimeout(() => blip(990, 0.22, 'square', 0.2), 120);
}

export function stingBusted() {
  blip(320, 0.28, 'sawtooth', 0.24);
  setTimeout(() => blip(160, 0.5, 'sawtooth', 0.24), 180);
}

export function stingWasted() {
  blip(200, 0.8, 'sawtooth', 0.26);
}

export function updateAudio(world, dt) {
  if (!ctx || !engineGain) return;
  const running = ctx.state === 'running';
  const p = world.player;
  const driving = world.state === 'play' && !world.paused;
  const speed = Math.hypot(p.vx, p.vy);
  const load = Math.min(1, speed / 420);

  // Engine hum: pitch and volume follow the wheels.
  if (running) {
    engineOsc.frequency.value = 55 + load * 175;
    engineGain.gain.value = driving && !muted ? 0.05 + load * 0.13 : 0;
  }

  // Siren: a two-tone whistle that gets faster with the wanted level.
  sirenTimer -= dt;
  if (running && driving && world.police.wanted > 0 && sirenTimer <= 0) {
    sirenTimer = Math.max(0.28, 0.62 - world.police.wanted * 0.07);
    blip(world.police.wanted > 2 ? 760 : 620, 0.26, 'square', 0.05 + world.police.wanted * 0.015);
  }

  // Tires: hiss while the rear is out.
  if (skidGain && running) {
    const hiss = driving && !muted && Math.abs(p.drift || 0) > 0.2 && speed > 90;
    skidGain.gain.value = hiss ? 0.08 : 0;
  }
}
