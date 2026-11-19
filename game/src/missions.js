// Missions: five story jobs told through step chains — goto, steal, deliver,
// timed runs, a wanted-level survival and the heist finale. Free roam between
// missions; markers show where the next job starts. Progress persists via the
// caller through localStorage.
import { PLACES, WANTED } from './config.js';

/** Each step: text, place key or fn(ctx), optional inCar / hold seconds / timeLimit. */
export const MISSIONS = [
  {
    id: 'welcome',
    title: 'Welcome to the Harbor',
    giver: 'club',
    reward: 250,
    brief: 'New in town? Prove it. Grab any car on the street and bring it to the safehouse.',
    steps: [
      { text: 'Steal any parked or driving car', place: null, kind: 'steal' },
      { text: 'Drive to the safehouse', place: 'safehouse', kind: 'goto', inCar: true },
    ],
  },
  {
    id: 'repo',
    title: 'Repo Rush',
    giver: 'garage',
    reward: 600,
    brief: 'The chop shop wants metal. Three cars, no questions. Don\'t wreck them on the way in.',
    steps: [
      { text: 'Car 1 of 3: steal any car', place: null, kind: 'steal' },
      { text: 'Car 1 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, arrive: 'deliver' },
      { text: 'Car 2 of 3: steal any car', place: null, kind: 'steal' },
      { text: 'Car 2 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, arrive: 'deliver' },
      { text: 'Car 3 of 3: steal any car', place: null, kind: 'steal' },
      { text: 'Car 3 of 3: deliver it to the chop shop', place: 'garage', kind: 'goto', inCar: true, arrive: 'deliver' },
    ],
  },
  {
    id: 'delivery',
    title: 'Hot Package',
    giver: 'bank',
    reward: 800,
    brief: 'A friend needs a package moved from the bank to the ferry, fast. The cops watch the bank — expect heat.',
    steps: [
      { text: 'Pick up the package at the bank', place: 'bank', kind: 'goto' },
      { text: 'Deliver it to the ferry dock — GO!', place: 'ferry', kind: 'goto', inCar: true, timeLimit: 105 },
    ],
  },
  {
    id: 'shake',
    title: 'Shake the Heat',
    giver: 'safehouse',
    reward: 1000,
    brief: 'A botched job left you flagged. Lose the cops and get to the safehouse clean.',
    steps: [
      { text: 'Lose the cops (3 stars)', place: null, kind: 'evade' },
      { text: 'Return to the safehouse', place: 'safehouse', kind: 'goto' },
    ],
  },
  {
    id: 'heist',
    title: 'Harbor Heist',
    giver: 'ferry',
    reward: 2500,
    brief: 'The big one: the bank vault, then the boat out of here. Everything you have. Good luck.',
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
  let active = null;       // { def, stepIdx, timeLeft, holdT, delivered }
  let announceT = 0;

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
    active = { def, stepIdx: 0, timeLeft: null, holdT: 0, delivered: 0 };
    const step = def.steps[0];
    if (step.timeLimit) active.timeLeft = step.timeLimit;
    return true;
  }

  function fail() {
    active = null;
    return 'failed';
  }

  /** ctx: { player, playerCar, stolenCar, stars, dist } */
  function update(dt, ctx) {
    const events = [];
    if (announceT > 0) announceT -= dt;
    if (!active) return events;
    const step = active.def.steps[active.stepIdx];

    if (step.timeLimit) {
      active.timeLeft -= dt;
      if (active.timeLeft <= 0) {
        events.push({ type: 'missionFail', title: active.def.title });
        active = null;
        return events;
      }
    }

    const spot = step.place ? PLACES[step.place] : null;
    if (step.kind === 'steal') {
      if (ctx.playerCar && ctx.stolen) {
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
      const carOk = !step.inCar || !!ctx.playerCar;
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
    done,
    startMarker,
    begin,
    update,
    fail,
    get active() { return active; },
  };
}
