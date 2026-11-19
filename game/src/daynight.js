// Neon Harbor — the day/night clock. One cosine bends a full day over
// DAY_SECONDS; dusk and dawn carry a warm grade, deep night a cold one.
import { DAY_SECONDS, START_HOUR } from './config.js';

export function createDayNight() {
  return { t: 0 };
}

/** hour in [0,24), night in [0,1] (1 = midnight dark), dusk peaks on the ramps. */
export function phaseOf(dn) {
  const hour = (dn.t / DAY_SECONDS * 24 + START_HOUR) % 24;
  const night = 0.5 - 0.5 * Math.cos(((hour - 12) / 12) * Math.PI);
  const dusk = Math.max(0, 1 - Math.abs(night - 0.5) * 3.4);
  return { hour, night, dusk };
}

export function clockString(hour) {
  const h = hour | 0;
  const m = ((hour - h) * 60) | 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
