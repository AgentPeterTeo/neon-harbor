// Missions: the five-job story chain — First Shift (tutorial), Chop Shop
// (marked cars, timed), Hot Cargo (two-star courier run), Shake Them (3-star
// survival) and Harbor Run (the finale). Free roam between jobs; glowing
// markers show where the next one starts. Progress persists via the caller
// through localStorage.
import { PLACES } from './config.js';

/** Where the chop shop's marked cars are stashed: [x, z, yaw, color] — on docks roads. */
export const MARKED_SPOTS = [
  [579, 700, 0, 0xff2d7a],
  [300, 579, Math.PI / 2, 0x22e6ff],
  [675, 920, 0, 0x9a4dff],
];

const MARKED_NAMES = ['PINK', 'AZURE', 'VIOLET'];

/** Each step: text, kind, optional place / inCar / hold / timeLimit / marked. */
export const MISSIONS = [
  {
    id: 'welcome',
    title: 'First Shift',
    giver: 'club',
    reward: 250,
    brief: 'New in town? Prove it. Grab any car on the street and drive it up the strip to the diner.',
    steps: [
      { text: 'Steal any parked or driving car', kind: 'steal' },
      { text: 'Drive to the diner', place: 'diner', kind: 'goto', inCar: true },
    ],
  },
  {
    id: 'repo',
    title: 'Chop Shop',
    giver: 'garage',
    reward: 600,
    brief: 'The shop wants three marked cars stashed around the docks. Jack one and the clock starts — don\'t wreck the merchandise.',
    steps: [
      { text: 'Car 1 of 3: steal the PINK Vortex GT', kind: 'stealMarked', car: 0 },
      { text: 'Car 1 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, marked: true, arrive: 'deliver', timeLimit: 90 },
      { text: 'Car 2 of 3: steal the AZURE Vortex GT', kind: 'stealMarked', car: 1 },
      { text: 'Car 2 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, marked: true, arrive: 'deliver', timeLimit: 90 },
      { text: 'Car 3 of 3: steal the VIOLET Vortex GT', kind: 'stealMarked', car: 2 },
      { text: 'Car 3 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, marked: true, arrive: 'deliver', timeLimit: 90 },
    ],
  },
  {
    id: 'delivery',
    title: 'Hot Cargo',
    giver: 'bank',
    reward: 800,
    brief: 'A package at the bank needs to reach the ferry tonight. The cops watch the bank — the second you lift it, you\'re a two-star story.',
    steps: [
      { text: 'Pick up the package at the bank', place: 'bank', kind: 'goto' },
      { text: 'Deliver it to the ferry dock — GO!', place: 'ferry', kind: 'goto', inCar: true, timeLimit: 105 },
    ],
  },
  {
    id: 'shake',
    title: 'Shake Them',
    giver: 'safehouse',
    reward: 1000,
    brief: 'The last job went loud. You\'re flagged at three stars — lose the heat inside a minute, then walk into the safehouse clean.',
    steps: [
      { text: 'Lose the cops — 60 s on the clock', kind: 'evade', timeLimit: 60 },
      { text: 'Return to the safehouse', place: 'safehouse', kind: 'goto' },
    ],
  },
  {
    id: 'heist',
    title: 'Harbor Run',
    giver: 'ferry',
    reward: 2500,
    brief: 'The big one: the bank vault downtown, then the boat out of here — straight across the docks. Everything you have. Good luck.',
    steps: [
      { text: 'Get to the bank vault', place: 'bank', kind: 'goto', hold: 3 },
      { text: 'Reach the escape boat at the ferry dock', place: 'ferry', kind: 'goto', timeLimit: 150 },
    ],
  },
];

const GIVER_SPOTS = {
  club: [-88.2, 40],          // neon strip sidewalk, a short walk from spawn
  garage: PLACES.garage,
  safehouse: PLACES.safehouse,
  bank: PLACES.bank,
  ferry: PLACES.ferry,
};

export function createMissions(saved) {
  const done = saved?.done || [];
  let active = null;       // { def, stepIdx, timeLeft, holdT, targetCar }

  function nextIndex() {
    for (let i = 0; i < MISSIONS.length; i += 1) {
      if (!done.includes(MISSIONS[i].id)) return i;
    }
    return -1;
  }

  function startMarker() {
    const i = nextIndex();
    if (i < 0) return null;
    const def = MISSIONS[i];
    const spot = GIVER_SPOTS[def.giver];
    return { x: spot[0], z: spot[1], title: def.title, index: i };
  }

  function begin(index) {
    const def = MISSIONS[index];
    if (!def) return false;
    active = { def, stepIdx: 0, timeLeft: null, holdT: 0, targetCar: null };
    const step = def.steps[0];
    if (step.timeLimit) active.timeLeft = step.timeLimit;
    return true;
  }

  /** The chop shop's current target car (set by the caller after spawning it). */
  function setTarget(car) {
    if (active) active.targetCar = car;
  }

  function fail(events, reason) {
    events.push({ type: 'missionFail', title: active.def.title, reason });
    active = null;
    return events;
  }

  /** ctx: { x, z, playerCar, stolen, stars } */
  function update(dt, ctx) {
    const events = [];
    if (!active) return events;
    const step = active.def.steps[active.stepIdx];

    // wrecked merchandise fails the job (cleared on delivery by the caller)
    if (active.targetCar && active.targetCar.dead) {
      return fail(events, 'wrecked');
    }

    if (step.timeLimit) {
      active.timeLeft -= dt;
      if (active.timeLeft <= 0) {
        return fail(events, 'time');
      }
    }

    const spot = step.place ? PLACES[step.place] : null;
    if (step.kind === 'steal') {
      if (ctx.playerCar && ctx.stolen) {
        events.push({ type: 'step' });
        advance(events);
      }
    } else if (step.kind === 'stealMarked') {
      if (ctx.playerCar && ctx.playerCar === active.targetCar) {
        events.push({ type: 'step' });
        advance(events);
      }
    } else if (step.kind === 'evade') {
      if (ctx.stars === 0) {
        events.push({ type: 'step' });
        advance(events);
      }
    } else if (step.kind === 'goto' && spot) {
      const d = Math.hypot(ctx.x - spot[0], ctx.z - spot[1]);
      const carOk = step.marked
        ? ctx.playerCar === active.targetCar
        : !step.inCar || !!ctx.playerCar;
      if (d < 9 && carOk) {
        if (step.hold) {
          active.holdT += dt;
          if (active.holdT >= step.hold) {
            events.push({ type: 'step' });
            advance(events);
          }
        } else {
          events.push({ type: 'step', arrive: step.arrive });
          advance(events);
        }
      } else {
        active.holdT = 0;
      }
    }
    return events;
  }

  function advance(events) {
    active.stepIdx += 1;
    active.holdT = 0;
    if (active.stepIdx >= active.def.steps.length) {
      if (!done.includes(active.def.id)) done.push(active.def.id);
      events.push({ type: 'missionComplete', def: active.def });
      active = null;
    } else {
      const step = active.def.steps[active.stepIdx];
      active.timeLeft = step.timeLimit || null;
    }
  }

  return {
    MISSIONS,
    MARKED_SPOTS,
    MARKED_NAMES,
    done,
    startMarker,
    begin,
    setTarget,
    update,
    get active() { return active; },
  };
}
