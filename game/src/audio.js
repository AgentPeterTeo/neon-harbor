// Audio: everything synthesized with oscillators, no files. Engine hum tracks
// speed, the siren wails when wanted, crashes and explosions are filtered noise.
// Starts only after a user gesture (browser autoplay policy).
export function createAudio() {
  let ctx = null;
  let master = null;
  let engOsc = null;
  let engGain = null;
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // engine: saw -> lowpass, silent until a car is entered
    engOsc = ctx.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 60;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 400;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engOsc.connect(engFilter).connect(engGain).connect(master);
    engOsc.start();

    // siren: triangle whose pitch is wailed by a slow LFO
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenLfo = ctx.createOscillator();
    sirenLfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenLfo.start();

    const len = ctx.sampleRate * 0.6;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  return {
    resume,
    /** inCar + speed01 0..1 */
    engine(on, speed01) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.08);
      engOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.05);
    },
    siren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.25);
    },
    crash(intensity) {
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900 + intensity * 200;
      const gain = ctx.createGain();
      const vol = Math.min(0.35, 0.08 + intensity * 0.02);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    },
    explosion() {
      if (!ctx) return;
      this.crash(14);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.7);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 0.85);
    },
    /** mission complete jingle */
    jingle() {
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
        osc.connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + 0.35);
      });
    },
  };
}
