// Neon Harbor — the loop: fixed-timestep sim, a camera that leans with the
// throttle and pulls back with speed, a day/night grade, and the
// title / paused / busted / wasted screens. No network, no libraries.
import {
  W, H, C, TILE, ROAD, GRID, WORLD, WATER_COL, PIER_ROW, BRIDGE_ROW,
} from './config.js';
import { createCity, drawCity, drawCityLights, drawHarbor, makeRand } from './city.js';
import { PlayerCar, SkidMarks, FX, CAR_TYPES } from './car.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions, drawMarker, drawMarkerGlow } from './missions.js';
import { buildMinimap, drawHUD } from './hud.js';
import { createDayNight, phaseOf } from './daynight.js';
import { createInput } from './input.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const query = new URLSearchParams(location.search);
const SHOTS = ['start', 'play', 'mission'];
const shot = SHOTS.includes(query.get('shot')) ? query.get('shot') : null;
const seed = query.has('seed')
  ? (parseInt(query.get('seed'), 10) || 1)
  : (((Date.now() / 1000) | 0) & 0x7fffffff);

const rand = makeRand((seed ^ 0x2f6e) >>> 0);
const city = createCity(seed);
const dn = createDayNight();
const player = new PlayerCar(CAR_TYPES[0], 0, 0, 0);
const marks = new SkidMarks();
const fx = new FX(rand);
const traffic = new Traffic(city, rand);
const police = new Police(city, rand);
const missions = new Missions(rand, player, traffic, police);
const input = createInput();
const cam = { fx: 0, fy: 0, z: 1.06 };

const game = {
  state: 'title',
  time: 0,
  cash: 0,
  campaignDone: false,
  toasts: [],
  shakeAmp: 0,
  overlayT: 0,
  titleFocus: { x: 5 * TILE + ROAD / 2, y: 4 * TILE + ROAD / 2 },
  player, city, dn, traffic, police, missions, fx, marks, rand, cam,
  mm: null,
  toast(text, color) {
    this.toasts.push({ text, color: color || C.amber, age: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  },
  shake(a) {
    this.shakeAmp = Math.min(11, this.shakeAmp + a);
  },
  doBusted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.overlayT = 0;
  },
};
game.mm = buildMinimap(city);

// tiny debug handle so the verify harness can read live state (screenshots
// and automated checks read this; the game itself never touches it)
window.__nh = {
  get() {
    return {
      state: game.state,
      seed,
      speed: Math.round(player.speed),
      x: Math.round(player.x),
      y: Math.round(player.y),
      angle: +player.angle.toFixed(3),
      stars: police.stars,
      cash: game.cash,
      hull: Math.round(player.hull),
      mission: missions.hudLine(),
      hour: +phaseOf(dn).hour.toFixed(2),
      night: +phaseOf(dn).night.toFixed(2),
      trafficCars: traffic.cars.length,
      policeCars: police.cars.length,
    };
  },
};

function placePlayer(x, y, angle) {
  player.x = x;
  player.y = y;
  player.angle = angle;
  player.vx = 0;
  player.vy = 0;
  player.steer = 0;
  player.hull = 100;
  player.spec = CAR_TYPES[0];
}

function startPlay() {
  placePlayer(1 * TILE + ROAD / 2 + 30, 1 * TILE + ROAD / 2 + 30, 0);
  game.cash = 0;
  game.campaignDone = false;
  game.state = 'play';
  game.toasts.length = 0;
  police.setStars(0);
  police.cars.length = 0;
  missions.idx = 0;
  missions.state = 'armed';
  missions.arm = 4;
  missions.stage = 0;
  missions.target = null;
  missions.checkpoints = null;
  missions.targetCar = null;
  traffic.removeTarget();
  traffic.cars.length = 0;
  traffic.prime(player, player, 12, 200, 800);
  marks.list.length = 0;
  cam.fx = player.x;
  cam.fy = player.y;
  cam.z = 1.08;
  game.toast('NEON HARBOR — contract 1 incoming', C.cyan);
}

function restartAfterBust() {
  placePlayer(1 * TILE + ROAD / 2 + 30, 1 * TILE + ROAD / 2 + 30, 0);
  game.state = 'play';
  game.toasts.length = 0;
  police.setStars(0);
  police.cars.length = 0;
  traffic.removeTarget();
  traffic.cars.length = 0;
  traffic.prime(player, player, 10, 200, 800);
  marks.list.length = 0;
  // progress survives; the interrupted contract arms again from the top
  missions.state = 'armed';
  missions.arm = 4;
  missions.stage = 0;
  missions.target = null;
  game.toast('Back on the street — the contract reopens', C.amber);
}

function tick(dt) {
  game.time += dt;
  for (const t of game.toasts) t.age += dt;
  game.toasts = game.toasts.filter((t) => t.age < 3.6);
  game.shakeAmp = Math.max(0, game.shakeAmp - dt * 22);

  const edges = input.consumeEdges();
  if (game.state === 'title') {
    for (const e of edges) {
      if (e === 'enter' || e === 'action') startPlay();
    }
  } else if (game.state === 'play') {
    for (const e of edges) {
      if (e === 'pause') game.state = 'paused';
    }
  } else if (game.state === 'paused') {
    for (const e of edges) {
      if (e === 'pause' || e === 'enter' || e === 'action') game.state = 'play';
    }
  } else if (game.state === 'busted' || game.state === 'wasted') {
    game.overlayT += dt;
    for (const e of edges) {
      if (e === 'enter' || e === 'action') restartAfterBust();
    }
  }

  if (game.state === 'play') {
    player.update(dt, input, city, marks, fx, (a) => game.shake(a));
    traffic.update(dt, player, player);
    traffic.collidePlayer(player, game);
    police.update(dt, game);
    missions.update(dt, game);
    marks.update(dt);
    fx.update(dt);
    dn.t += dt;
    if (player.hull <= 0 && game.state === 'play') {
      game.state = 'wasted';
      game.overlayT = 0;
      fx.smoke(player.x, player.y, 14);
    }
  } else if (game.state === 'title') {
    // the city breathes behind the logo without the player
    traffic.update(dt, game.titleFocus, player);
    dn.t += dt * 0.4;
  }

  // camera: lean after the focus, pull back with speed
  const isTitle = game.state === 'title';
  const tfx = isTitle ? game.titleFocus.x + Math.sin(game.time * 0.13) * 30 : player.x;
  const tfy = isTitle ? game.titleFocus.y + Math.cos(game.time * 0.11) * 22 : player.y;
  const k = Math.min(1, 4.5 * dt);
  cam.fx += (tfx - cam.fx) * k;
  cam.fy += (tfy - cam.fy) * k;
  const zt = isTitle ? 1.05 : Math.max(0.94, Math.min(1.1, 1.12 - player.speed * 0.0005));
  cam.z += (zt - cam.z) * Math.min(1, 2.5 * dt);
}

function render() {
  const phase = phaseOf(dn);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  const shx = Math.sin(game.time * 43) * game.shakeAmp;
  const shy = Math.cos(game.time * 61) * game.shakeAmp;
  ctx.save();
  ctx.translate(W / 2 + shx, H / 2 + shy);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.fx, -cam.fy);
  const view = {
    x0: cam.fx - W / (2 * cam.z) - 40,
    y0: cam.fy - H / (2 * cam.z) - 40,
    x1: cam.fx + W / (2 * cam.z) + 40,
    y1: cam.fy + H / (2 * cam.z) + 40,
  };

  drawCity(ctx, city, view, phase, game.time);
  drawHarbor(ctx, view, phase, game.time);
  marks.draw(ctx);
  traffic.draw(ctx);
  police.draw(ctx, game.time);
  player.draw(ctx);
  fx.draw(ctx);
  if (missions.target && game.state === 'play') drawMarker(ctx, missions.target, game.time);

  // the grade: cool dark at night, a warm smear through dusk and dawn
  if (phase.night > 0.02) {
    ctx.fillStyle = `rgba(5,8,22,${(phase.night * 0.52).toFixed(3)})`;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  }
  if (phase.dusk > 0.03) {
    ctx.fillStyle = `rgba(255,110,60,${(phase.dusk * 0.07).toFixed(3)})`;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.fillStyle = `rgba(255,43,214,${(phase.dusk * 0.05).toFixed(3)})`;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  }

  ctx.globalCompositeOperation = 'lighter';
  drawCityLights(ctx, city, view, phase, game.time);
  traffic.drawLights(ctx, phase.night);
  police.drawLights(ctx, phase.night, game.time);
  player.drawLights(ctx, phase.night);
  fx.drawLights(ctx);
  if (missions.target && game.state === 'play') drawMarkerGlow(ctx, missions.target, game.time);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // vignette for depth
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  if (game.state === 'title') {
    drawTitleScreen();
  } else {
    drawHUD(ctx, game, phase);
    if (game.state === 'paused') drawBanner('PAUSED', C.cyan, 'P to get back on the road');
    if (game.state === 'busted') drawBanner('BUSTED', C.red, 'The Harbor PD took you in — ENTER to get back out there');
    if (game.state === 'wasted') drawBanner('WASTED', C.magenta, 'Your ride gave out — ENTER for fresh wheels');
  }
}

function drawBanner(text, color, sub) {
  ctx.fillStyle = 'rgba(3,5,12,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '700 64px "Arial Black", Arial, sans-serif';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillText(text, W / 2, H / 2 - 6);
  ctx.shadowBlur = 0;
  ctx.font = '700 16px Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,244,255,0.85)';
  ctx.fillText(sub, W / 2, H / 2 + 38);
}

function drawTitleScreen() {
  ctx.fillStyle = 'rgba(4,7,16,0.35)';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 150, 0, 340);
  g.addColorStop(0, 'rgba(255,43,214,0)');
  g.addColorStop(0.5, 'rgba(255,43,214,0.12)');
  g.addColorStop(1, 'rgba(0,240,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 150, W, 190);

  ctx.textAlign = 'center';
  ctx.font = '700 84px "Arial Black", Arial, sans-serif';
  ctx.fillStyle = C.cyan;
  ctx.shadowColor = C.cyan;
  ctx.shadowBlur = 30;
  ctx.fillText('NEON HARBOR', W / 2 + 4, 272);
  ctx.fillStyle = C.magenta;
  ctx.shadowColor = C.magenta;
  ctx.fillText('NEON HARBOR', W / 2 - 4, 268);
  ctx.fillStyle = C.white;
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillText('NEON HARBOR', W / 2, 270);
  ctx.shadowBlur = 0;

  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,244,255,0.85)';
  ctx.fillText('A top-down joyride through the neon district', W / 2, 316);

  const pulse = 0.55 + 0.45 * Math.sin(game.time * 3.2);
  ctx.font = '700 24px "Arial Black", Arial, sans-serif';
  ctx.fillStyle = C.amber;
  ctx.shadowColor = C.amber;
  ctx.shadowBlur = 16 * pulse;
  ctx.fillText('PRESS ENTER', W / 2, 392);
  ctx.shadowBlur = 0;

  ctx.font = '700 14px Arial, sans-serif';
  ctx.fillStyle = 'rgba(232,244,255,0.6)';
  ctx.fillText('WASD / ARROWS to drive · P to pause · 5 contracts · 5 wanted stars', W / 2, 424);
  ctx.fillText('make.fun gta6-01 · AgentPeterTeo/neon-harbor', W / 2, H - 18);
}

// ---- boot ----
placePlayer(game.titleFocus.x + 170, game.titleFocus.y + 30, 0.18);
cam.fx = game.titleFocus.x;
cam.fy = game.titleFocus.y;
cam.z = 1.05;
traffic.prime(game.titleFocus, player, 14, 130, 900);
if (shot !== null) applyShot(game, shot);

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard < 6) {
    tick(STEP);
    acc -= STEP;
    guard += 1;
  }
  if (guard === 6) acc = 0;
  render();
}
requestAnimationFrame(frame);
