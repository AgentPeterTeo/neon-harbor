// Neon Harbor: the game loop. Boots the seeded city, runs the fixed-step
// simulation (60 Hz), drives the player, cars, traffic, police and missions,
// renders, and keeps money + mission progress in localStorage.
import * as THREE from 'three';
import {
  STEP, PLAYER, WANTED, ECON, CAR_TYPES, SAVE_KEY, SEED,
  START_TOD, PLACES, WORLD, GRID,
} from './config.js';
import { createRandom } from './random.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER } from './input.js';
import { createWorld } from './world.js';
import { buildCity, districtAt } from './city.js';
import { createParticles } from './particles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { makeCarMesh, stepCar, collideCars } from './vehicles.js';
import { createPlayer } from './player.js';
import { createMissions, MARKED_SPOTS } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createRender } from './render.js';
import { readShot, setupShot, shotCameraPose } from './shots.js';

/* ---------------- boot ---------------- */
const shot = readShot();
const { renderer } = createRender();
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x241a38, WORLD.fogNight);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.12, 2800);
window.__nhCamera = camera;

const world = createWorld(scene);
world.tod = START_TOD;
const rand = createRandom(SEED);
const city = buildCity(scene, world, rand);
const particles = createParticles(scene);
const traffic = createTraffic(scene, world, rand, particles);
const police = createPolice(scene, world, rand, particles);
const player = createPlayer(scene, world);
player.state.x = PLACES.start[0];
player.state.z = PLACES.start[1];
player.update(0, 0, 0, false);      // place the figure on the sidewalk
const hud = createHUD();
const audio = createAudio();
const input = createInput(renderer.domElement || document.body);

/* ---------------- save ---------------- */
let saved = { money: ECON.start, missions: { done: [] } };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (typeof parsed.money === 'number') saved.money = parsed.money;
    if (parsed.missions && Array.isArray(parsed.missions.done)) saved.missions = parsed.missions;
  }
} catch (err) { /* private mode or blocked storage: play without persistence */ }
let money = saved.money;
const missions = createMissions(saved.missions);

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money, missions: { done: missions.done } }));
  } catch (err) { /* ignore */ }
}

/* ---------------- state ---------------- */
let mode = 'title';          // title | play | dead
let paused = false;
let simTime = 0;
let playerCar = null;       // {type,x,z,yaw,vx,vz,speed,hp,mesh,dead,stolen}
let carCooldown = 0;
let deadTimer = 0;
let camYaw = 0;
const camPos = new THREE.Vector3(0, 6, 14);
const lookPos = new THREE.Vector3();
let pendingMission = -1;    // index offered at the marker
let displayCars = [];        // shot-mode showcase cars / abandoned cars
let orbit = null;            // shot 'start' camera orbit
let fireT = 0;
let legendAt = 0;            // CITY LEGEND banner time, once all five jobs pay

/* ---------------- mission marker ---------------- */
const markerGroup = new THREE.Group();
const markerBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(2.8, 2.8, 7, 20, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffd24a, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
markerBeam.position.y = 3.5;
const markerCore = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.32, 7, 8),
  new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85 }),
);
markerCore.position.y = 3.5;
const markerGem = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.05),
  new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95 }),
);
markerGem.position.y = 8.4;
markerGroup.add(markerBeam, markerCore, markerGem);
markerGroup.visible = false;
scene.add(markerGroup);

/* ---------------- car helpers ---------------- */
function spawnRealCar(type, colorHex, x, z, yaw) {
  const mesh = makeCarMesh(type, colorHex ?? CAR_TYPES[type].colors[0], scene);
  return {
    type, x, z, yaw, vx: 0, vz: 0, speed: 0, hp: 100, mesh, dead: false, stolen: false,
  };
}

function disposeCar(car) {
  scene.remove(car.mesh.group);
  car.mesh.dispose();
}

function enterShotCar(type, color, x, z, yaw) {
  const car = spawnRealCar(type, color, x, z, yaw);
  if (shot.mode === 'play') {
    playerCar = car;
    player.state.inCar = true;
    player.group.visible = false;
    car.stolen = true;
  } else {
    displayCars.push(car);
  }
  return car;
}

function setCopAt(x, z, yaw = Math.PI, tableau = false, vx = 0, vz = 0) {
  const mesh = makeCarMesh('police', 0x0d0d12, scene);
  police.cops.push({
    cop: true, type: 'police', x, z, yaw, vx, vz, speed: Math.hypot(vx, vz),
    hp: 100, boost: 1, mesh, stuck: 0, reverse: 0, dead: false, fireT: 0, tableau,
  });
}

let repoCar = null;        // the chop shop's current marked target
function spawnMarkedCar(n) {
  const [x, z, yaw, color] = MARKED_SPOTS[n];
  repoCar = spawnRealCar('sports', color, x, z, yaw);
  displayCars.push(repoCar);
  missions.setTarget(repoCar);
}

function tryEnterCar() {
  let best = null;
  let bestD = PLAYER.enterDist;
  for (const c of traffic.cars) {
    const d = Math.hypot(c.x - player.state.x, c.z - player.state.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  for (const c of displayCars) {
    const d = Math.hypot(c.x - player.state.x, c.z - player.state.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return;
  if (best.mesh) {
    // abandoned real car: take it back
    playerCar = best;
    displayCars.splice(displayCars.indexOf(best), 1);
    playerCar.stolen = true;
  } else {
    const wasDriving = !best.parked && best.driver;
    traffic.removeCar(best);
    const colors = CAR_TYPES[best.type].colors;
    playerCar = spawnRealCar(best.type, colors[Math.floor(rand() * colors.length)], best.x, best.z, best.yaw);
    playerCar.stolen = true;
    if (wasDriving) {
      police.addHeat(WANTED.carjack);
      hud.showToast('CARJACKED — DRIVER RAN');
      audio.crash(2);
    } else {
      police.addHeat(7);
      hud.showToast('CAR STOLEN');
    }
  }
  player.state.inCar = true;
  player.group.visible = false;
  carCooldown = 0.45;
}

function exitCar() {
  if (!playerCar) return;
  const side = playerCar.yaw + Math.PI / 2;
  const px = playerCar.x + Math.sin(side) * 2.4;
  const pz = playerCar.z + Math.cos(side) * 2.4;
  const push = world.collideCircle(px, pz, PLAYER.radius);
  player.state.x = push.x;
  player.state.z = push.z;
  player.state.yaw = playerCar.yaw;
  playerCar.vx = 0;
  playerCar.vz = 0;
  playerCar.stolen = false;   // it's yours now, not "just stolen"
  displayCars.push(playerCar);
  if (displayCars.length > 5) disposeCar(displayCars.shift());
  playerCar = null;
  player.state.inCar = false;
  player.group.visible = true;
  carCooldown = 0.45;
}

/* ---------------- wasted / busted ---------------- */
function wasted(reason) {
  mode = 'dead';
  deadTimer = 2.9;
  money = Math.max(0, money - ECON.wastedFee);
  hud.setMoney(money);
  hud.showBanner('WASTED', `${reason} · -$${ECON.wastedFee}`, 2.6);
  audio.explosion();
  if (playerCar) {
    playerCar.dead = true;   // wrecked merchandise fails any marked-car job
    for (let i = 0; i < 26; i += 1) {
      particles.spawn(playerCar.x, 1, playerCar.z, {
        vx: (rand() - 0.5) * 10, vy: 2 + rand() * 7, vz: (rand() - 0.5) * 10,
        color: i % 3 === 0 ? 0xffd24a : 0xff5522, ttl: 0.8 + rand() * 0.7,
      });
    }
    disposeCar(playerCar);
    playerCar = null;
    player.state.inCar = false;
  }
  player.group.visible = true;
  police.heat = 0;
  saveGame();
}

function busted() {
  mode = 'dead';
  deadTimer = 2.9;
  money = Math.max(0, money - ECON.bustedFee);
  hud.setMoney(money);
  hud.showBanner('BUSTED', `-$${ECON.bustedFee}`, 2.6);
  police.heat = 0;
  if (playerCar) {
    displayCars.push(playerCar);
    playerCar = null;
    player.state.inCar = false;
  }
  player.group.visible = true;
  saveGame();
}

function respawn() {
  mode = 'play';
  player.state.x = PLACES.hospital[0];
  player.state.z = PLACES.hospital[1];
  player.state.hp = PLAYER.health;
  player.state.down = 0;
  player.state.inCar = false;
  player.group.visible = true;
  hud.setHealth(1);
}

/* ---------------- hooks ---------------- */
police.hooks.onBusted = busted;
police.hooks.onCopBump = () => police.addHeat(WANTED.copBump);
traffic.hooks.onPedHit = () => {
  police.addHeat(WANTED.pedHit);
  hud.showToast('PEDESTRIAN DOWN');
};
traffic.hooks.onCarBump = () => police.addHeat(WANTED.carBump);
traffic.hooks.onDriverFled = () => hud.showToast('DRIVER BAILED');

/* ---------------- mission helpers ---------------- */
function activeMarkerPos() {
  if (missions.active) {
    const a = missions.active;
    const step = a.def.steps[a.stepIdx];
    if (step.kind === 'stealMarked' && a.targetCar && !a.targetCar.dead) return [a.targetCar.x, a.targetCar.z];
    if (step.place) return PLACES[step.place];
    return null;
  }
  const mk = missions.startMarker();
  return mk ? [mk.x, mk.z] : null;
}

function missionLog() {
  const offer = missions.startMarker();
  return missions.MISSIONS.map((m, i) => {
    const done = missions.done.includes(m.id);
    const current = !!missions.active && missions.active.def.id === m.id;
    const state = done ? 'done' : (current || (offer && offer.index === i)) ? 'current' : 'locked';
    return { title: m.title, state };
  });
}

/* ---------------- mission events ---------------- */
function onMissionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'step') {
      audio.jingle();
      const a = missions.active;
      if (a) {
        const step = a.def.steps[a.stepIdx];
        if (a.def.id === 'delivery' && step && step.place === 'ferry') {
          police.addHeat(WANTED.thresholds[1] + 10);   // the bank was watched: two stars
          hud.showToast('THE COPS SAW YOU — RUN!');
        }
        if (a.def.id === 'heist' && step && step.place === 'ferry') {
          police.addHeat(WANTED.thresholds[1] + 10);   // the vault alarm: getaway heat
          hud.showToast('THE ALARM WENT OFF — RUN FOR THE BOAT!');
        }
        if (a.def.id === 'shake' && a.stepIdx === 1) hud.showToast('HEAT OFF — GET HOME CLEAN');
        if (ev.arrive === 'deliver' && playerCar) {
          // the chop shop keeps the car
          disposeCar(playerCar);
          if (repoCar === playerCar) repoCar = null;
          playerCar = null;
          player.state.inCar = false;
          player.group.visible = true;
          player.state.x = PLACES.garage[0] + 6;
          player.state.z = PLACES.garage[1];
          hud.showToast('CAR DELIVERED');
        }
        if (a.def.id === 'repo' && step && step.kind === 'stealMarked') {
          spawnMarkedCar(step.car);   // the next car on the shop's list
        }
      }
    } else if (ev.type === 'missionComplete') {
      money += ev.def.reward;
      hud.setMoney(money);
      hud.showBanner('MISSION PASSED', `${ev.def.title} · +$${ev.def.reward}`, 2.8);
      audio.jingle();
      hud.hideBrief();
      hud.setObjective(null);
      saveGame();
      if (missions.done.length >= missions.MISSIONS.length) legendAt = simTime + 3.2;
    } else if (ev.type === 'missionFail') {
      hud.showBanner(
        'MISSION FAILED',
        ev.reason === 'wrecked' ? 'you wrecked the merchandise' : 'the marker is still out there',
        2.4,
      );
      hud.hideBrief();
      if (repoCar && repoCar !== playerCar && !repoCar.dead) {
        const di = displayCars.indexOf(repoCar);
        if (di >= 0) displayCars.splice(di, 1);
        disposeCar(repoCar);
        repoCar = null;
      }
    }
  }
}

/* ---------------- simulation step ---------------- */
function simulate(dt) {
  simTime += dt;
  world.tick(dt);
  carCooldown = Math.max(0, carCooldown - dt);
  if (player.state.down > 0) player.state.down = Math.max(0, player.state.down - dt);
  if (mode === 'dead') {
    deadTimer -= dt;
    if (deadTimer <= 0) respawn();
  }

  if (mode === 'title') {
    // the city lives behind the title screen
    traffic.update(dt, player.state, null, simTime, police.cops);
    police.update(dt, player.state, null, false, simTime);
    return;
  }
  if (mode !== 'play') return;

  /* ----- player driving ----- */
  if (playerCar && !playerCar.dead) {
    if (shot.mode === 'play') {
      // scripted chase for the screenshot: hold speed and heading — no input,
      // no damage, no city shoving; the cruisers hold formation behind
      playerCar.x += playerCar.vx * dt;
      playerCar.z += playerCar.vz * dt;
      playerCar.speed = Math.hypot(playerCar.vx, playerCar.vz);
      player.state.x = playerCar.x;
      player.state.z = playerCar.z;
      playerCar.mesh.group.position.set(playerCar.x, 0, playerCar.z);
      playerCar.mesh.group.rotation.y = playerCar.yaw;
    } else {
      const ctl = {
        throttle: input.throttle(),
        steer: input.steer(),
        handbrake: input.held.brake,
      };
      const impact = stepCar(playerCar, dt, ctl, world);
      if (impact > 5) {
        audio.crash(impact);
        if (impact > 12) police.addHeat(WANTED.carBump);
        playerCar.hp -= impact * 0.9;
        if (impact > 9) {
          particles.burst(playerCar.x, 0.8, playerCar.z, 5, { color: 0xffcc66, ttl: 0.5 });
        }
      }
      // shove traffic, take damage, panic the neighbourhood
      for (let i = traffic.cars.length - 1; i >= 0; i -= 1) {
        const c = traffic.cars[i];
        const closing = collideCars(playerCar, c);
        if (closing > 3) {
          audio.crash(closing);
          police.addHeat(WANTED.carBump);
          c.panic = 3.5;
          playerCar.hp -= closing * 0.7;
          c.hp -= closing * 1.6;
          if (c.hp <= 0) traffic.removeCar(c);
        }
      }
      // burning chain
      if (playerCar.hp < 45 && rand() < 0.35) {
        particles.spawn(playerCar.x, 1.1, playerCar.z, {
          vx: (rand() - 0.5), vy: 2.6, vz: (rand() - 0.5), color: 0x555a66, ttl: 0.9,
        });
      }
      if (playerCar.hp < 18) {
        fireT += dt;
        playerCar.hp -= 4.5 * dt;
        if (fireT > 0.08) {
          fireT = 0;
          particles.spawn(playerCar.x, 1.0, playerCar.z, {
            vx: (rand() - 0.5) * 1.4, vy: 3.2, vz: (rand() - 0.5) * 1.4,
            color: rand() < 0.5 ? 0xff5522 : 0xffd24a, ttl: 0.7,
          });
        }
      }
      if (playerCar.hp <= 0) {
        wasted('YOUR RIDE WENT UP IN FLAMES');
        return;
      }
      player.state.x = playerCar.x;
      player.state.z = playerCar.z;
      playerCar.mesh.group.position.set(playerCar.x, 0, playerCar.z);
      playerCar.mesh.group.rotation.y = playerCar.yaw;
    }
  } else {
    /* ----- player on foot ----- */
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const inY = shot.mode ? 0 : input.throttle();
    const inX = shot.mode ? 0 : input.steer();
    const moveX = fx * inY + rx * inX;
    const moveZ = fz * inY + rz * inX;
    player.update(dt, moveX, moveZ, input.held.run);
    // run-down check
    const threats = [...traffic.cars, ...police.cops];
    for (const t of threats) {
      const speed = Math.hypot(t.vx || 0, t.vz || 0);
      if (speed < 6) continue;
      if (Math.hypot(t.x - player.state.x, t.z - player.state.z) < 2.1) {
        if (player.damage(speed * 2.4)) {
          wasted('FLATTENED ON THE ASPHALT');
          return;
        }
        player.knockdown();
        audio.crash(6);
        particles.burst(player.state.x, 0.8, player.state.z, 8, { color: 0xd8a0a0, ttl: 0.5 });
        hud.setHealth(player.state.hp / PLAYER.health);
        break;
      }
    }
  }

  // CITY LEGEND: the chain is done — one last banner, then free roam
  if (legendAt && simTime >= legendAt) {
    legendAt = 0;
    hud.showBanner('CITY LEGEND', 'ALL FIVE JOBS DONE — THE HARBOR IS YOURS', 4);
    audio.jingle();
  }

  /* ----- living city ----- */
  // shot=play: keep civilian spawns far off the chase street
  const trafficPos = shot.mode === 'play'
    ? { x: player.state.x + 640, z: player.state.z }
    : player.state;
  traffic.update(dt, trafficPos, shot.mode === 'play' ? null : (playerCar && !playerCar.dead ? playerCar : null), simTime, police.cops);
  const pr = police.update(dt, player.state, playerCar && !playerCar.dead ? playerCar : null, true, simTime);
  hud.setStars(pr.stars);
  audio.siren(pr.siren && !paused);

  /* ----- missions ----- */
  if (missions.active) {
    const a = missions.active;
    const step = a.def.steps[a.stepIdx];
    hud.setObjective(`<b>${a.def.title.toUpperCase()}</b> · ${step.text}`);
    hud.setTimer(a.timeLeft);
    const events = missions.update(dt, {
      x: playerCar ? playerCar.x : player.state.x,
      z: playerCar ? playerCar.z : player.state.z,
      playerCar: playerCar && !playerCar.dead ? playerCar : null,
      stolen: !!(playerCar && playerCar.stolen),
      stars: pr.stars,
    });
    onMissionEvents(events);
    if (missions.active) {
      const mp = activeMarkerPos();
      markerGroup.visible = !!mp;
      if (mp) markerGroup.position.set(mp[0], 0, mp[1]);
    }
  } else {
    hud.setTimer(null);
    if (shot.mode) {
      // screenshot modes: fixed objective/brief text set by shots.js; the marker
      // belongs to the mission-banner shot only, never the cover orbit
      const mk = missions.startMarker();
      markerGroup.visible = shot.mode === 'mission' && !!mk;
      if (mk) markerGroup.position.set(mk.x, 0, mk.z);
      return;
    }
    const mk = missions.startMarker();
    if (mk) {
      markerGroup.visible = true;
      markerGroup.position.set(mk.x, 0, mk.z);
      const d = Math.hypot(player.state.x - mk.x, player.state.z - mk.z);
      if (d < 10) {
        hud.showBrief(missions.MISSIONS[mk.index]);
        hud.setObjective('PRESS <b>E</b> TO START THE JOB');
        pendingMission = mk.index;
      } else {
        hud.hideBrief();
        pendingMission = -1;
        hud.setObjective(null);
      }
    } else {
      markerGroup.visible = false;
      hud.hideBrief();
      pendingMission = -1;
      hud.setObjective('<b>THE HARBOR IS YOURS</b> · free roam');
    }
  }
}

/* ---------------- shot modes ---------------- */
if (shot.mode) {
  mode = 'play';
  const cfg = setupShot(shot.mode, { world, player, police, hud, enterShotCar, setCopAt }, shot.seed);
  if (cfg && cfg.camOrbit) orbit = cfg.camOrbit;
}

/* ---------------- input actions (once per frame) ---------------- */
function handleActions(act) {
  if (mode === 'title' && act & ACTION_CONFIRM) {
    mode = 'play';
    orbit = null;
    hud.showTitle(false);
    hud.setHudVisible(true);
    hud.setMoney(money, false);
    hud.setHealth(1);
    audio.resume();
    return;
  }
  if (mode === 'dead' || mode === 'title') return;
  if (shot.mode) {
    // screenshot modes are hands-off: stray keys must not break the frame
    if (act & ACTION_CONFIRM) audio.resume();
    return;
  }
  if (act & ACTION_PAUSE) {
    paused = !paused;
    hud.showPause(paused);
    if (paused) {
      hud.setMissionLog(missionLog());
      audio.siren(false);
    }
  }
  if (paused) return;
  if (act & ACTION_ENTER && carCooldown <= 0) {
    if (pendingMission >= 0) {
      const def = missions.MISSIONS[pendingMission];
      missions.begin(pendingMission);
      hud.hideBrief();
      hud.showBanner(def.title.toUpperCase(), def.brief, 2.4);
      if (def.id === 'shake') {
        police.heat = WANTED.thresholds[2] + 6;   // flagged at three stars
        hud.showToast('THEY KNOW YOUR FACE — SHAKE THEM!');
      }
      if (def.id === 'heist') hud.showToast('GET IN, GET OUT, GET GONE');
      if (def.id === 'repo') spawnMarkedCar(0);
      pendingMission = -1;
      audio.resume();
    } else if (playerCar) {
      exitCar();
    } else {
      tryEnterCar();
    }
  }
  if (act & ACTION_CONFIRM) audio.resume();
}

/* ---------------- camera ---------------- */
function updateCamera(dtReal) {
  if (orbit) {
    const pose = shotCameraPose(orbit, performance.now() / 1000);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    return;
  }
  const inCar = !!(playerCar && !playerCar.dead);
  const tx = inCar ? playerCar.x : player.state.x;
  const tz = inCar ? playerCar.z : player.state.z;
  const tYaw = inCar ? playerCar.yaw : player.state.yaw;
  // On foot the camera only follows the heading while walking forward.
  // Chasing the yaw during a strafe feeds back into the camera-relative
  // move vector, and the player + camera spin in circles forever.
  const follow = inCar || input.throttle() > 0;
  let dy = follow ? tYaw - camYaw : 0;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  camYaw += dy * Math.min(1, (inCar ? 4.5 : 3.5) * dtReal);

  const dist = inCar ? 10.4 : 6.4;
  const height = inCar ? 4.4 : 3.2;
  const desiredX = tx - Math.sin(camYaw) * dist;
  const desiredZ = tz - Math.cos(camYaw) * dist;
  camPos.x += (desiredX - camPos.x) * Math.min(1, 6 * dtReal);
  camPos.y += (height - camPos.y) * Math.min(1, 5 * dtReal);
  camPos.z += (desiredZ - camPos.z) * Math.min(1, 6 * dtReal);
  camera.position.copy(camPos);
  lookPos.set(tx + Math.sin(camYaw) * 6, 1.7, tz + Math.cos(camYaw) * 6);
  camera.lookAt(lookPos);
}

/* ---------------- render frame ---------------- */
let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;

  handleActions(input.takeActions());

  if (!paused) {
    acc += dtReal;
    let guard = 0;
    while (acc >= STEP && guard < 6) {
      simulate(STEP);
      acc -= STEP;
      guard += 1;
    }
    if (acc > STEP * 6) acc = 0;
  }

  /* atmosphere */
  const k = world.applyTime();
  world.waterTime(simTime * 0.7);
  city.update(simTime, k.lamps);
  particles.update(dtReal);

  /* headlights + marker bob */
  const night = k.lamps > 0.42;
  const allCars = [
    ...displayCars,
    ...(playerCar ? [playerCar] : []),
    ...police.cops.filter((c) => !c.dead),
  ];
  for (const c of allCars) {
    if (!c.mesh) continue;
    c.mesh.headL.visible = night;
    c.mesh.headR.visible = night;
    c.mesh.tailL.visible = true;
    c.mesh.tailR.visible = true;
  }
  markerGem.position.y = 8.4 + Math.sin(now / 500) * 0.7;
  markerGem.rotation.y += dtReal * 1.8;

  /* audio hum tracks the ride */
  const inCar = !!(playerCar && !playerCar.dead);
  audio.engine(inCar && !paused, inCar ? Math.min(1, playerCar.speed / 50) : 0);

  /* hud */
  hud.tick(dtReal);
  if (mode === 'play' || mode === 'dead') {
    hud.setDistrict(districtAt(player.state.x, player.state.z));
    hud.setClock(world.tod);
    hud.setSpeed(inCar ? playerCar.speed * 3.6 : null);
    hud.setHealth(player.state.hp / PLAYER.health);
    const blips = [];
    for (const c of traffic.cars) blips.push({ x: c.x, z: c.z, kind: 'car' });
    for (const c of police.cops) if (!c.dead) blips.push({ x: c.x, z: c.z, kind: 'cop' });
    let markerBlip = activeMarkerPos();
    if (markerBlip) blips.push({ x: markerBlip[0], z: markerBlip[1], kind: 'marker' });
    hud.drawMinimap({
      x: inCar ? playerCar.x : player.state.x,
      z: inCar ? playerCar.z : player.state.z,
      yaw: inCar ? playerCar.yaw : player.state.yaw,
      blips,
    });
  }

  updateCamera(dtReal);
  renderer.render(scene, camera);
}

/* ---------------- title ---------------- */
// shot modes set their own HUD visibility inside setupShot()
if (!shot.mode) {
  hud.showTitle(true);
  hud.setHudVisible(false);
  // cinematic slow orbit over the neon strip behind the title
  orbit = { x: GRID.lineAt(9) + 10, z: 20, r: 165, h: 68, speed: 0.02, lookY: 14 };
}

// dev probe, only with #debug in the URL — the game ignores it entirely
if (location.hash === '#debug') {
  window.__NH = {
    traffic, police, player, missions, world, input,
    get money() { return money; },
    get playerCar() { return playerCar; },
    get mode() { return mode; },
    cam: () => ({ x: +camera.position.x.toFixed(1), y: +camera.position.y.toFixed(1), z: +camera.position.z.toFixed(1) }),
    p: () => ({ x: +player.state.x.toFixed(1), z: +player.state.z.toFixed(1), hp: +player.state.hp.toFixed(0), inCar: player.state.inCar }),
  };
}

requestAnimationFrame(frame);
