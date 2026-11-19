// The HUD: DOM overlay — money counter that rolls to its target, wanted stars,
// health, speedo, mission objective + timer, district/clock readout, the rotating
// minimap (roads, water, cars, cops, marker), banners (WASTED / BUSTED / MISSION
// PASSED), the neon title screen and the pause card. Everything built from JS so
// index.html stays a one-line shell.
import { GRID, ISLAND_HALF } from './config.js';

const STYLE = `
  #nh-root { position: fixed; inset: 0; pointer-events: none; font-family: "Arial Black", Arial, sans-serif;
    user-select: none; z-index: 10; }
  .nh { position: absolute; }
  #nh-money { top: 14px; left: 18px; font-size: 26px; color: #9ffcc0; letter-spacing: 1px;
    text-shadow: 0 0 10px #34e07a88, 0 2px 0 #000; }
  #nh-stars { top: 48px; left: 20px; font-size: 22px; letter-spacing: 4px; color: #2a2a33;
    text-shadow: 0 1px 0 #000; }
  #nh-stars b { color: #ffd24a; text-shadow: 0 0 8px #ffb020; }
  #nh-timer { top: 74px; left: 20px; font-size: 20px; color: #ff5a5a; display: none; text-shadow: 0 2px 0 #000; }
  #nh-district { top: 14px; right: 18px; font-size: 15px; color: #cfd6e4; opacity: 0.9;
    letter-spacing: 2px; text-shadow: 0 2px 0 #000; text-align: right; }
  #nh-clock { top: 36px; right: 18px; font-size: 13px; color: #8a93a8; letter-spacing: 2px; text-shadow: 0 2px 0 #000; }
  #nh-objective { top: 14px; left: 50%; transform: translateX(-50%); max-width: 60%; text-align: center;
    font-size: 14px; color: #e8ecf4; background: rgba(10,12,24,0.55); padding: 6px 14px; border-radius: 6px;
    border: 1px solid rgba(120, 160, 255, 0.25); letter-spacing: 1px; display: none; text-shadow: 0 1px 0 #000; }
  #nh-objective b { color: #ffd24a; }
  #nh-minimap { bottom: 18px; left: 18px; border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(255,255,255,0.12), 0 0 22px rgba(34,230,255,0.25), 0 4px 18px rgba(0,0,0,0.6); }
  #nh-health-wrap { bottom: 24px; right: 18px; width: 190px; }
  #nh-health-label { font-size: 11px; color: #8a93a8; letter-spacing: 3px; margin-bottom: 4px; text-align: right;
    text-shadow: 0 1px 0 #000; }
  #nh-health { height: 9px; background: rgba(0,0,0,0.55); border-radius: 4px; border: 1px solid rgba(255,255,255,0.18);
    overflow: hidden; }
  #nh-health-bar { height: 100%; width: 100%; background: linear-gradient(90deg, #ff3d6e, #ff7a5a);
    box-shadow: 0 0 8px #ff3d6e; transition: width 0.25s; }
  #nh-speed { bottom: 48px; right: 18px; font-size: 24px; color: #e8ecf4; text-align: right; display: none;
    text-shadow: 0 0 10px rgba(34,230,255,0.5), 0 2px 0 #000; }
  #nh-speed small { font-size: 11px; color: #8a93a8; letter-spacing: 2px; }
  #nh-banner { top: 34%; left: 50%; transform: translate(-50%, -50%); font-size: 64px; letter-spacing: 10px;
    color: #ff2d7a; text-shadow: 0 0 18px #ff2d7a, 0 0 60px #ff2d7a, 0 3px 0 #000; opacity: 0;
    transition: opacity 0.3s; white-space: nowrap; }
  #nh-banner-sub { top: calc(34% + 44px); left: 50%; transform: translateX(-50%); font-size: 16px; color: #cfd6e4;
    letter-spacing: 4px; opacity: 0; transition: opacity 0.3s; white-space: nowrap; text-shadow: 0 2px 0 #000; }
  #nh-toast { bottom: 148px; left: 50%; transform: translateX(-50%); font-size: 15px; color: #9fd8ff;
    letter-spacing: 2px; opacity: 0; transition: opacity 0.4s; text-shadow: 0 0 10px rgba(34,230,255,0.6), 0 2px 0 #000; }
  #nh-brief { bottom: 84px; left: 50%; transform: translateX(-50%); width: 420px; max-width: 80vw;
    background: linear-gradient(160deg, rgba(16,18,34,0.92), rgba(8,10,20,0.92)); border-radius: 10px;
    border: 1px solid rgba(255,45,122,0.45); box-shadow: 0 0 24px rgba(255,45,122,0.25), 0 8px 30px rgba(0,0,0,0.6);
    padding: 14px 18px; display: none; }
  #nh-brief h3 { margin: 0 0 6px; font-size: 17px; color: #ff2d7a; letter-spacing: 2px;
    text-shadow: 0 0 12px rgba(255,45,122,0.7); }
  #nh-brief p { margin: 0 0 8px; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #cfd6e4; }
  #nh-brief .go { font-size: 12px; color: #9ffcc0; letter-spacing: 2px; animation: nhblink 1.1s infinite; }
  @keyframes nhblink { 50% { opacity: 0.35; } }
  #nh-title { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
    flex-direction: column; background: radial-gradient(ellipse at 50% 42%, rgba(12,10,30,0.0) 0%, rgba(6,6,16,0.75) 100%); }
  #nh-title h1 { font-size: 84px; margin: 0; color: #ff2d7a; letter-spacing: 6px;
    text-shadow: 0 0 8px #ff2d7a, 0 0 30px #ff2d7a, 0 0 90px #ff2d7a, 0 4px 0 #000; }
  #nh-title h1 span { color: #22e6ff; text-shadow: 0 0 8px #22e6ff, 0 0 30px #22e6ff, 0 0 90px #22e6ff, 0 4px 0 #000; }
  #nh-title .tag { margin-top: 6px; font-size: 14px; color: #cfd6e4; letter-spacing: 6px; text-shadow: 0 2px 0 #000; }
  #nh-title .press { margin-top: 66px; font-size: 17px; color: #9ffcc0; letter-spacing: 4px;
    text-shadow: 0 0 12px rgba(52,224,122,0.8); animation: nhblink 1.2s infinite; }
  #nh-title .controls { margin-top: 26px; font-family: Arial, sans-serif; font-size: 12.5px; color: #8a93a8;
    letter-spacing: 1px; line-height: 1.8; text-align: center; text-shadow: 0 1px 0 #000; }
  #nh-title .controls b { color: #cfd6e4; }
  #nh-pause { position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
    flex-direction: column; background: rgba(4,5,12,0.55); }
  #nh-pause h2 { font-size: 42px; color: #22e6ff; letter-spacing: 10px; margin: 0;
    text-shadow: 0 0 20px #22e6ff, 0 3px 0 #000; }
  #nh-pause p { font-family: Arial, sans-serif; color: #8a93a8; letter-spacing: 2px; margin-top: 14px; }
  #nh-pause .jobs { margin-top: 26px; font-family: Arial, sans-serif; font-size: 13px;
    letter-spacing: 2px; line-height: 2.1; text-align: left; text-shadow: 0 1px 0 #000; }
  #nh-pause .jobs div { color: #565d70; }
  #nh-pause .jobs .done { color: #9ffcc0; }
  #nh-pause .jobs .current { color: #ffd24a; text-shadow: 0 0 8px #ffb020; }
  #nh-root.nh-hide-game .nh-game { display: none !important; }
`;

function el(parent, tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  parent.appendChild(node);
  return node;
}

export function createHUD() {
  const root = el(document.body, 'div');
  root.id = 'nh-root';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const money = el(root, 'div', 'nh', '$0'); money.id = 'nh-money';
  const stars = el(root, 'div', 'nh', ''); stars.id = 'nh-stars';
  const timer = el(root, 'div', 'nh', ''); timer.id = 'nh-timer';
  const district = el(root, 'div', 'nh', ''); district.id = 'nh-district';
  const clockEl = el(root, 'div', 'nh', ''); clockEl.id = 'nh-clock';
  const objective = el(root, 'div', 'nh', ''); objective.id = 'nh-objective';
  const mapCanvas = el(root, 'canvas', 'nh'); mapCanvas.id = 'nh-minimap';
  const MAP_PX = 210;
  mapCanvas.width = mapCanvas.height = MAP_PX;
  const mapCtx = mapCanvas.getContext('2d');
  const healthLabel = el(root, 'div', 'nh', 'HEALTH'); healthLabel.id = 'nh-health-label';
  const healthWrap = el(root, 'div', 'nh'); healthWrap.id = 'nh-health-wrap'; healthWrap.appendChild(healthLabel);
  const health = el(healthWrap, 'div'); health.id = 'nh-health';
  const healthBar = el(health, 'div'); healthBar.id = 'nh-health-bar';
  const speed = el(root, 'div', 'nh', '0 <small>KM/H</small>'); speed.id = 'nh-speed';
  const banner = el(root, 'div', 'nh', ''); banner.id = 'nh-banner';
  const bannerSub = el(root, 'div', 'nh', ''); bannerSub.id = 'nh-banner-sub';
  const toast = el(root, 'div', 'nh', ''); toast.id = 'nh-toast';
  const brief = el(root, 'div', 'nh'); brief.id = 'nh-brief';
  const briefTitle = el(brief, 'h3');
  const briefText = el(brief, 'p');
  const briefGo = el(brief, 'div', 'go', 'PRESS E TO START THE JOB');

  const title = el(root, 'div'); title.id = 'nh-title';
  el(title, 'h1', null, 'NEON <span>HARBOR</span>');
  el(title, 'div', 'tag', 'CRIME · DRIVING · ONE RAIN-SOAK ISLAND');
  el(title, 'div', 'press', 'PRESS ENTER');
  el(title, 'div', 'controls',
    '<b>WASD</b> walk / drive &nbsp;·&nbsp; <b>SHIFT</b> run &nbsp;·&nbsp; <b>E</b> enter / exit car &nbsp;·&nbsp; <b>SPACE</b> handbrake<br>'
    + 'Look for the golden marker to start a job. Stars fade when you hide.');

  const pause = el(root, 'div'); pause.id = 'nh-pause';
  el(pause, 'h2', null, 'PAUSED');
  el(pause, 'p', null, 'ESC to resume · the city waits for no one');
  const jobs = el(pause, 'div', 'jobs');

  /* ---------- state ---------- */
  let moneyShown = 0;
  let moneyTarget = 0;
  let bannerT = 0;
  let toastT = 0;
  let districtName = '';

  function setMoney(v, animate = true) {
    moneyTarget = v;
    if (!animate) {
      moneyShown = v;
      // write immediately: the roller in tick() only fires on a difference
      money.textContent = `$${v.toLocaleString('en-US')}`;
    }
  }

  function setStars(n) {
    let html = '';
    for (let i = 0; i < 5; i += 1) html += i < n ? '<b>★</b>' : '★';
    stars.innerHTML = html;
  }

  function setHealth(frac) {
    healthBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  function setSpeed(kmh) {
    if (kmh === null) {
      speed.style.display = 'none';
      return;
    }
    speed.style.display = 'block';
    speed.innerHTML = `${Math.round(kmh)} <small>KM/H</small>`;
  }

  function setObjective(text) {
    if (!text) {
      objective.style.display = 'none';
      return;
    }
    objective.style.display = 'block';
    objective.innerHTML = text;
  }

  function setDistrict(name) {
    if (name === districtName) return;
    districtName = name;
    district.textContent = name.toUpperCase();
  }

  function setClock(tod) {
    // in-world the cycle starts at dusk (19:00) so neon hours come first
    const total = ((tod * 24 + 19) % 24) * 60;
    const h = Math.floor(total / 60);
    const m = Math.floor(total % 60);
    clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function setTimer(seconds) {
    if (seconds === null) {
      timer.style.display = 'none';
      return;
    }
    timer.style.display = 'block';
    timer.textContent = `${Math.ceil(seconds)}s`;
    timer.style.color = seconds < 15 ? '#ff3d3d' : '#ff5a5a';
  }

  function showBanner(text, sub = '', hold = 2.2) {
    banner.textContent = text;
    banner.style.opacity = 1;
    bannerSub.textContent = sub;
    bannerSub.style.opacity = sub ? 1 : 0;
    bannerT = hold;
  }

  function showToast(text, hold = 2.4) {
    toast.textContent = text;
    toast.style.opacity = 1;
    toastT = hold;
  }

  function showBrief(def) {
    briefTitle.textContent = def.title.toUpperCase();
    briefText.textContent = def.brief;
    brief.style.display = 'block';
  }

  function hideBrief() {
    brief.style.display = 'none';
  }

  function showTitle(show) {
    title.style.display = show ? 'flex' : 'none';
  }

  function showPause(show) {
    pause.style.display = show ? 'flex' : 'none';
  }

  /** entries: [{ title, state: 'done' | 'current' | 'locked' }] — the job log. */
  function setMissionLog(entries) {
    jobs.innerHTML = entries.map((e) => {
      const mark = e.state === 'done' ? '✓' : e.state === 'current' ? '▶' : '·';
      return `<div class="${e.state}">${mark}&nbsp; ${e.title.toUpperCase()}</div>`;
    }).join('');
  }

  function setHudVisible(show) {
    // overlays (title/pause) manage their own display; this hides the in-game widgets
    root.classList.toggle('nh-hide-game', !show);
    for (const w of [money, stars, timer, district, clockEl, objective, mapCanvas,
      healthWrap, speed, toast, brief]) w.classList.add('nh-game');
  }

  /* ---------- minimap ---------- */
  // map px per world m: the 210px disc shows a 300 m window
  const SCALE = MAP_PX / 300;
  const R = MAP_PX / 2;
  let tmp = document.createElement('canvas');
  tmp.width = tmp.height = MAP_PX;
  const tmpCtx = tmp.getContext('2d');

  /** snap: {x, z, yaw, blips: [{x, z, kind}], marker} */
  function drawMinimap(snap) {
    const { x, z, yaw } = snap;
    tmpCtx.save();
    tmpCtx.clearRect(0, 0, MAP_PX, MAP_PX);
    tmpCtx.translate(R, R);
    // heading-up map: yaw 0 faces +z, so the world must be turned so the
    // player's heading always points at the top of the disc
    tmpCtx.rotate(yaw - Math.PI);
    tmpCtx.translate(-x * SCALE, -z * SCALE);
    // water
    tmpCtx.fillStyle = '#041018';
    tmpCtx.fillRect(x * SCALE - R, z * SCALE - R, MAP_PX, MAP_PX);
    // island
    tmpCtx.fillStyle = '#141824';
    tmpCtx.fillRect(-ISLAND_HALF * SCALE, -ISLAND_HALF * SCALE, ISLAND_HALF * 2 * SCALE, ISLAND_HALF * 2 * SCALE);
    // roads
    tmpCtx.strokeStyle = '#3d4658';
    tmpCtx.lineWidth = 2.4;
    tmpCtx.beginPath();
    for (let i = 0; i < GRID.lines; i += 1) {
      const line = GRID.lineAt(i) * SCALE;
      tmpCtx.moveTo(line, -ISLAND_HALF * SCALE);
      tmpCtx.lineTo(line, ISLAND_HALF * SCALE);
      tmpCtx.moveTo(-ISLAND_HALF * SCALE, line);
      tmpCtx.lineTo(ISLAND_HALF * SCALE, line);
    }
    tmpCtx.stroke();
    // blips
    for (const b of snap.blips || []) {
      if (b.kind === 'cop') tmpCtx.fillStyle = '#ff4040';
      else if (b.kind === 'marker') tmpCtx.fillStyle = '#ffd24a';
      else tmpCtx.fillStyle = '#9aa4b2';
      const bx = b.x * SCALE;
      const bz = b.z * SCALE;
      tmpCtx.beginPath();
      tmpCtx.arc(bx, bz, b.kind === 'marker' ? 5 : 2.6, 0, Math.PI * 2);
      tmpCtx.fill();
    }
    tmpCtx.restore();

    mapCtx.clearRect(0, 0, MAP_PX, MAP_PX);
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.arc(R, R, R - 1, 0, Math.PI * 2);
    mapCtx.clip();
    mapCtx.drawImage(tmp, 0, 0);
    mapCtx.restore();
    // gold marker off the disc: pin an arrow to the rim pointing the way
    const mk = (snap.blips || []).find((b) => b.kind === 'marker');
    if (mk) {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const ox = -(mk.x - x) * cy + (mk.z - z) * sy;      // heading-up offset
      const oy = -(mk.x - x) * sy - (mk.z - z) * cy;
      const d = Math.hypot(ox, oy);
      if (d * SCALE > R - 16) {
        mapCtx.save();
        mapCtx.translate(R + (ox / d) * (R - 13), R + (oy / d) * (R - 13));
        mapCtx.rotate(Math.atan2(oy, ox));
        mapCtx.fillStyle = '#ffd24a';
        mapCtx.beginPath();
        mapCtx.moveTo(9, 0);
        mapCtx.lineTo(-5, -6.5);
        mapCtx.lineTo(-5, 6.5);
        mapCtx.closePath();
        mapCtx.fill();
        mapCtx.restore();
      }
    }
    // player arrow, always centred and pointing up
    mapCtx.fillStyle = '#ff2d7a';
    mapCtx.beginPath();
    mapCtx.moveTo(R, R - 7);
    mapCtx.lineTo(R - 5, R + 5);
    mapCtx.lineTo(R + 5, R + 5);
    mapCtx.closePath();
    mapCtx.fill();
  }

  /** Call every frame. */
  function tick(dt) {
    if (moneyShown !== moneyTarget) {
      const diff = moneyTarget - moneyShown;
      const step = Math.max(1, Math.abs(diff) * 0.14);
      moneyShown += Math.sign(diff) * Math.min(Math.abs(diff), step);
      moneyShown = Math.round(moneyShown);
      money.textContent = `$${moneyShown.toLocaleString('en-US')}`;
    }
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) {
        banner.style.opacity = 0;
        bannerSub.style.opacity = 0;
      }
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toast.style.opacity = 0;
    }
  }

  return {
    setMoney, setStars, setHealth, setSpeed, setObjective, setDistrict, setClock, setTimer,
    showBanner, showToast, showBrief, hideBrief, showTitle, showPause, setHudVisible,
    setMissionLog, drawMinimap, tick,
  };
}
