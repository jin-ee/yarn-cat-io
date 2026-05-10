const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const lengthStat = document.getElementById("lengthStat");
const popStat = document.getElementById("popStat");
const restartBtn = document.getElementById("restartBtn");

let W = window.innerWidth;
let H = window.innerHeight;
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shade = (hex, amount) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = clamp((value >> 16) + amount, 0, 255);
  const g = clamp(((value >> 8) & 255) + amount, 0, 255);
  const b = clamp((value & 255) + amount, 0, 255);
  return `rgb(${r}, ${g}, ${b})`;
};

let foods = [];
let cats = [];
let puffs = [];
let sparkles = [];
let keys = {};
let mouse = { x: W / 2, y: H / 2, active: false };
let nestYarn = 0;
let notice = "";
let noticeTime = 0;
let frame = 0;
let paused = false;
let timeLeft = 90;
let gameOver = false;
const START_FOOD_COUNT = 62;
const FOOD_YARN_VALUE = 3;
const MAX_CARRIED_YARN = 96;
const CM_PER_YARN = 5;
const MIN_FOOD_NEST_DISTANCE = 130;
const GAME_SECONDS = 90;
const JUMP_COOLDOWN = 10;
const BASE_JUMP = 138;
const MIN_JUMP = 86;

const catSheet = new Image();
catSheet.src = "assets/cat-sheet-v2.png";
const catFrames = [
  { x: 0, y: 0, w: 512, h: 512 },
  { x: 512, y: 0, w: 512, h: 512 },
  { x: 1024, y: 0, w: 512, h: 512 },
  { x: 0, y: 512, w: 512, h: 512 },
  { x: 512, y: 512, w: 512, h: 512 },
  { x: 1024, y: 512, w: 512, h: 512 },
];

const sofa = { type: "sofa", x: 54, y: 72, w: 250, h: 82 };
const tower = { type: "tower", x: 746, y: 398, r: 82 };
const nest = { x: 0, y: 0, r: 0 };
const rug = { x: 362, y: 184, w: 232, h: 162 };
const puddles = [
  { x: 0, y: 0, rx: 48, ry: 24, a: -0.2 },
  { x: 0, y: 0, rx: 38, ry: 19, a: 0.35 },
  { x: 0, y: 0, rx: 52, ry: 22, a: -0.45 },
  { x: 0, y: 0, rx: 34, ry: 17, a: 0.15 },
];
const obstacles = [sofa, tower];

const robot = {
  x: W / 2,
  y: H / 2,
  r: 26,
  a: 0,
  speed: 0.015,
  warning: 0,
};

function layoutRoom() {
  W = window.innerWidth;
  H = window.innerHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(W * ratio);
  canvas.height = Math.floor(H * ratio);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  sofa.x = Math.max(34, W * 0.055);
  sofa.y = Math.max(92, H * 0.14);
  sofa.w = clamp(W * 0.26, 210, 330);
  sofa.h = clamp(H * 0.12, 72, 104);

  tower.x = clamp(W * 0.78, W - 240, W - 90);
  tower.y = clamp(H * 0.66, 250, H - 130);
  tower.r = clamp(Math.min(W, H) * 0.09, 62, 92);
  nest.x = tower.x;
  nest.y = tower.y;
  nest.r = tower.r * 0.48;

  rug.w = clamp(W * 0.25, 200, 320);
  rug.h = clamp(H * 0.22, 132, 190);
  rug.x = W * 0.5 - rug.w * 0.5;
  rug.y = H * 0.5 - rug.h * 0.5;

  const minSide = Math.min(W, H);
  const spots = [
    [0.78, 0.18, 0.062, 0.029, -0.2],
    [0.28, 0.34, 0.048, 0.022, 0.36],
    [0.6, 0.78, 0.058, 0.025, -0.42],
    [0.88, 0.52, 0.042, 0.02, 0.18],
  ];
  for (let i = 0; i < puddles.length; i++) {
    const [px, py, rx, ry, a] = spots[i];
    puddles[i].x = clamp(W * px, 56, W - 56);
    puddles[i].y = clamp(H * py, 104, H - 86);
    puddles[i].rx = clamp(minSide * rx, 30, 62);
    puddles[i].ry = clamp(minSide * ry, 14, 30);
    puddles[i].a = a;
  }
}

function setNotice(text, time = 80) {
  notice = text;
  noticeTime = time;
}

function randomFoodSpot() {
  for (let i = 0; i < 40; i++) {
    const point = { x: rand(28, W - 28), y: rand(110, H - 36) };
    if (distance(point, nest) > MIN_FOOD_NEST_DISTANCE && distance(point, sofa) > 70) return point;
  }
  return { x: rand(28, W - 28), y: rand(110, H - 36) };
}

function spawnFood(x = null, y = null, amount = 1) {
  for (let i = 0; i < amount; i++) {
    const spot = x == null || y == null ? randomFoodSpot() : { x, y };
    foods.push({
      x: clamp(spot.x + rand(-34, 34), 18, W - 18),
      y: clamp(spot.y + rand(-34, 34), 96, H - 18),
      r: rand(5, 9),
      hue: rand(325, 390) % 360,
      wobble: rand(0, Math.PI * 2),
    });
  }
}

function makeCat(name, x, y, color, belly, player = false, sheetIndex = 0) {
  const baseYarn = 0;
  return {
    name,
    x,
    y,
    vx: 0,
    vy: 0,
    color,
    belly,
    player,
    alive: true,
    yarn: [],
    baseYarn,
    maxYarn: baseYarn,
    nestScore: 0,
    sheetIndex,
    target: { x: rand(60, W - 60), y: rand(60, H - 60) },
    face: 1,
    jump: null,
    cooldown: rand(0, 10),
    aiDir: { x: 1, y: 0 },
    slide: 0,
    sofaDash: 0,
    towerSpin: 0,
    bob: rand(0, Math.PI * 2),
  };
}

function reset() {
  layoutRoom();
  foods = [];
  puffs = [];
  sparkles = [];
  frame = 0;
  timeLeft = GAME_SECONDS;
  gameOver = false;
  paused = false;
  cats = [
    makeCat("나비", W / 2, H / 2, "#ff748c", "#fff0e4", true, 0),
    makeCat("콩이", W * 0.16, H * 0.78, "#8b6bf0", "#efe8ff", false, 2),
    makeCat("모찌", W * 0.84, H * 0.78, "#28b892", "#e9fff6", false, 4),
    makeCat("치즈", W * 0.84, H * 0.3, "#f2a43a", "#fff3d1", false, 3),
    makeCat("루루", W * 0.16, H * 0.4, "#b78bea", "#fff0fb", false, 5),
  ];
  nestYarn = 0;
  setNotice("실 조각을 물고 캣타워 둥지에 놓아봐!", 150);
  for (let i = 0; i < START_FOOD_COUNT; i++) spawnFood();
}

function jumpDistance(cat) {
  const burden = clamp(carriedYarn(cat) / MAX_CARRIED_YARN, 0, 1);
  return clamp(BASE_JUMP - burden * 36, MIN_JUMP, BASE_JUMP);
}

function startJump(cat, dx, dy) {
  if (!cat.alive || cat.jump || cat.cooldown > 0 || gameOver) return false;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return false;
  const nx = dx / len;
  const ny = dy / len;
  const distancePx = jumpDistance(cat);
  let tx = clamp(cat.x + nx * distancePx, 18, W - 18);
  let ty = clamp(cat.y + ny * distancePx, 96, H - 18);
  const projected = { x: tx, y: ty };
  if (carriedYarn(cat) > 0 && distance(projected, nest) < nest.r + 118) {
    tx += (nest.x - tx) * 0.38;
    ty += (nest.y - ty) * 0.38;
  }
  cat.face = nx < 0 ? -1 : 1;
  cat.jump = {
    sx: cat.x,
    sy: cat.y,
    tx,
    ty,
    t: 0,
    duration: cat.player ? 13 : 15,
  };
  cat.cooldown = JUMP_COOLDOWN;
  cat.yarn.unshift({ x: cat.x, y: cat.y, wet: inPuddlePoint(cat.x, cat.y) ? 90 : 0, wiggle: 0 });
  return true;
}

function nearestFood(cat) {
  if (!cat.player && carriedYarn(cat) >= MAX_CARRIED_YARN * 0.75) return null;
  const candidates = [];
  for (const food of foods) {
    if (!cat.player && distance(food, nest) < MIN_FOOD_NEST_DISTANCE) continue;
    const d = distance(cat, food);
    candidates.push({ food, d });
  }
  candidates.sort((a, b) => a.d - b.d);
  const pickFrom = candidates.slice(0, cat.player ? 1 : 5);
  if (pickFrom.length === 0) return null;
  return pickFrom[Math.floor(rand(0, pickFrom.length))].food;
}

function nearestEnemyYarn(cat) {
  let best = null;
  let bestD = Infinity;
  for (const owner of cats) {
    if (owner === cat || !owner.alive || carriedYarn(owner) <= 0) continue;
    for (let i = 18; i < owner.yarn.length; i += 6) {
      const p = owner.yarn[i];
      if (!p || p.wet > 0) continue;
      const d = Math.hypot(cat.x - p.x, cat.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return bestD < 340 ? best : null;
}

function inSofa(cat) {
  return cat.x > sofa.x + 12 && cat.x < sofa.x + sofa.w - 12 && cat.y > sofa.y + 22 && cat.y < sofa.y + sofa.h - 10;
}

function inPuddlePoint(x, y) {
  for (const puddle of puddles) {
    const dx = x - puddle.x;
    const dy = y - puddle.y;
    const cos = Math.cos(-puddle.a);
    const sin = Math.sin(-puddle.a);
    const px = dx * cos - dy * sin;
    const py = dx * sin + dy * cos;
    if ((px * px) / (puddle.rx * puddle.rx) + (py * py) / (puddle.ry * puddle.ry) <= 1) {
      return true;
    }
  }
  return false;
}

function updateCat(cat) {
  if (!cat.alive) return;

  let tx = cat.target.x;
  let ty = cat.target.y;

  if (cat.player) {
    let ax = 0;
    let ay = 0;
    if (keys.ArrowLeft || keys.a) ax -= 1;
    if (keys.ArrowRight || keys.d) ax += 1;
    if (keys.ArrowUp || keys.w) ay -= 1;
    if (keys.ArrowDown || keys.s) ay += 1;
    if (ax || ay) {
      tx = cat.x + ax * 130;
      ty = cat.y + ay * 130;
      if (ax !== 0) cat.face = ax < 0 ? -1 : 1;
      mouse.active = false;
    } else if (mouse.active) {
      tx = mouse.x;
      ty = mouse.y;
      const dx = mouse.x - cat.x;
      if (Math.abs(dx) > 10) cat.face = dx < 0 ? -1 : 1;
    }
  } else {
    const food = nearestFood(cat);
    const enemyYarn = nearestEnemyYarn(cat);
    const load = carriedYarn(cat);
    if (load >= 42 || (load >= 18 && distance(cat, nest) < Math.min(W, H) * 0.42)) {
      tx = nest.x + rand(-nest.r * 0.35, nest.r * 0.35);
      ty = nest.y + rand(-nest.r * 0.28, nest.r * 0.28);
    } else if (enemyYarn && load < MAX_CARRIED_YARN * 0.72 && Math.random() < 0.76) {
      tx = enemyYarn.x;
      ty = enemyYarn.y;
    } else if (food && Math.random() < 0.72) {
      tx = food.x;
      ty = food.y;
    }
    if (distance(cat, cat.target) < 26 || Math.random() < 0.004) {
      cat.target = { x: rand(40, W - 40), y: rand(40, H - 40) };
    }
  }

  let angle = Math.atan2(ty - cat.y, tx - cat.x);
  let speed = cat.player ? 4.25 : 3.55;
  let steer = cat.player ? 0.29 : 0.24;

  if (!cat.player && distance(cat, nest) < nest.r + 96) {
    if (carriedYarn(cat) < 10) {
      angle = Math.atan2(cat.y - nest.y, cat.x - nest.x);
      speed = 3.7;
      steer = 0.28;
    }
  }

  cat.sofaDash = inSofa(cat) ? 22 : Math.max(0, cat.sofaDash - 1);
  if (cat.sofaDash > 0) {
    speed = 4.75;
    steer = 0.26;
    if (cat.player && frame % 38 === 0) setNotice("소파 밑으로 슝!", 40);
  }

  const onPuddle = inPuddlePoint(cat.x, cat.y);
  if (onPuddle) {
    cat.slide = 48;
    speed = 4.1;
    steer = 0.035;
    if (cat.player && frame % 45 === 0) setNotice("흘린 물! 실이 젖어서 잠깐 무해해져!", 54);
  }

  cat.towerSpin = Math.max(0, cat.towerSpin - 1);

  if (cat.slide > 0) {
    steer = 0.055;
    cat.slide -= 1;
  }

  cat.vx += (Math.cos(angle) * speed - cat.vx) * steer;
  cat.vy += (Math.sin(angle) * speed - cat.vy) * steer;

  if (!cat.player && Math.abs(cat.vx) > 0.22) {
    cat.face = cat.vx < 0 ? -1 : 1;
  }

  for (const other of cats) {
    if (other === cat || !other.alive) continue;
    const d = distance(cat, other);
    if (d > 0 && d < 58) {
      const push = (58 - d) / 58;
      cat.vx += ((cat.x - other.x) / d) * push * 0.5;
      cat.vy += ((cat.y - other.y) / d) * push * 0.5;
    }
  }

  cat.x = clamp(cat.x + cat.vx, 14, W - 14);
  cat.y = clamp(cat.y + cat.vy, 14, H - 14);
  cat.bob += 0.22 + speed * 0.012;

  const wiggle = Math.sin(frame * 0.19 + cat.bob) * 1.4;
  cat.yarn.unshift({
    x: cat.x - Math.cos(angle) * 8,
    y: cat.y - Math.sin(angle) * 8,
    wiggle,
    wet: onPuddle ? 90 : 0,
  });
  for (const p of cat.yarn) {
    if (p.wet > 0) p.wet -= 1;
  }
  const visibleYarn = carriedYarn(cat) > 0 ? Math.max(12, cat.maxYarn) : 0;
  while (cat.yarn.length > visibleYarn) cat.yarn.pop();
}

function eatFood(cat) {
  let picked = 0;
  for (let i = foods.length - 1; i >= 0; i--) {
    if (Math.hypot(cat.x - foods[i].x, cat.y - foods[i].y) < 72) {
      const food = foods.splice(i, 1)[0];
      if (carriedYarn(cat) < MAX_CARRIED_YARN) {
        cat.maxYarn += FOOD_YARN_VALUE;
      } else {
        foods.push(food);
        if (cat.player) setNotice("입에 문 실이 너무 길어! 둥지에 먼저 놓자.", 52);
        return;
      }
      sparkles.push({ x: food.x, y: food.y, text: "+긴실", life: 34, color: cat.color });
      picked += 1;
      if (picked >= 3) break;
    }
  }
}

function carriedYarn(cat) {
  return Math.max(0, cat.maxYarn - cat.baseYarn);
}

function resetCatTrail(cat) {
  cat.maxYarn = cat.baseYarn;
  cat.yarn = [];
}

function depositYarn(cat) {
  const inNest = distance(cat, nest) < nest.r + 74;
  const amount = carriedYarn(cat);
  if (!inNest || amount <= 0) return;
  const combo = amount >= 72 ? 2 : amount >= 42 ? 1.5 : amount >= 24 ? 1.25 : 1;
  const scoreGain = Math.round(amount * CM_PER_YARN * combo);
  cat.nestScore += scoreGain;
  if (cat.player) nestYarn += scoreGain;
  resetCatTrail(cat);
  const bursts = clamp(Math.floor(amount / 18), 2, 6);
  for (let i = 0; i < bursts; i++) {
    sparkles.push({
      x: nest.x + rand(-nest.r * 0.5, nest.r * 0.5),
      y: nest.y + rand(-nest.r * 0.36, nest.r * 0.36),
      text: `+${scoreGain}cm`,
      life: 42,
      color: cat.color,
    });
  }
  if (cat.player) {
    setNotice(`둥지에 실 ${scoreGain}cm 놓고 왔어!`, 64);
  }
  if (cat.player) {
    setNotice(combo > 1 ? `콤보 x${combo}! ${scoreGain}cm 놓고 왔어!` : `둥지에 ${scoreGain}cm 놓고 왔어!`, 74);
  }
}

function burstAt(x, y, color, text) {
  puffs.push({ x, y, color, text, life: 62, max: 62 });
}

function biteYarn(thief, owner, yarnIndex) {
  if (!thief.alive || !owner.alive || carriedYarn(owner) <= 0) return;
  const cutLength = Math.max(1, owner.yarn.length - yarnIndex);
  const stolen = Math.min(
    Math.floor(cutLength * 0.85),
    carriedYarn(owner),
    MAX_CARRIED_YARN - carriedYarn(thief)
  );
  if (stolen <= 0) return;

  owner.yarn.splice(yarnIndex);
  owner.maxYarn = Math.max(owner.baseYarn, owner.maxYarn - stolen);
  thief.maxYarn = Math.min(thief.baseYarn + MAX_CARRIED_YARN, thief.maxYarn + stolen);

  const bitePoint = owner.yarn[Math.max(0, yarnIndex - 1)] || owner;
  burstAt(bitePoint.x, bitePoint.y, thief.color, "냠!");
  thief.vx *= 0.8;
  thief.vy *= 0.8;
  if (thief.player) {
    setNotice(`상대 실 ${stolen * CM_PER_YARN}cm를 물어왔어!`, 58);
  }
}

function chooseAiJump(cat) {
  const food = nearestFood(cat);
  const enemyYarn = nearestEnemyYarn(cat);
  const load = carriedYarn(cat);
  let target = cat.target;
  if (load >= 42 || (load >= 18 && distance(cat, nest) < Math.min(W, H) * 0.45)) {
    target = nest;
  } else if (enemyYarn && load < MAX_CARRIED_YARN * 0.72 && Math.random() < 0.68) {
    target = enemyYarn;
  } else if (food) {
    target = food;
  }
  if (distance(cat, cat.target) < 30 || Math.random() < 0.02) {
    cat.target = { x: rand(40, W - 40), y: rand(100, H - 40) };
  }
  let dx = target.x - cat.x;
  let dy = target.y - cat.y;
  if (carriedYarn(cat) < 10 && distance(cat, nest) < nest.r + 80) {
    dx = cat.x - nest.x;
    dy = cat.y - nest.y;
  }
  return Math.hypot(dx, dy) > 0 ? { x: dx, y: dy } : cat.aiDir;
}

function biteAtLanding(cat) {
  for (const owner of cats) {
    if (!owner.alive || owner === cat) continue;
    for (let i = 16; i < owner.yarn.length; i += 4) {
      if (owner.yarn[i].wet > 0) continue;
      if (Math.hypot(cat.x - owner.yarn[i].x, cat.y - owner.yarn[i].y) < 62) {
        biteYarn(cat, owner, i);
        return;
      }
    }
  }
}

function resolveLanding(cat) {
  if (inPuddlePoint(cat.x, cat.y)) {
    cat.slide = 20;
    if (cat.player) setNotice("미끄덩! 한 번 더 밀렸어.", 42);
    cat.cooldown = 0;
    startJump(cat, cat.face || 1, 0);
    return;
  }
  eatFood(cat);
  biteAtLanding(cat);
  depositYarn(cat);
}

function updateCatV2(cat) {
  if (!cat.alive) return;
  if (cat.cooldown > 0) cat.cooldown -= 1;
  cat.towerSpin = Math.max(0, cat.towerSpin - 1);
  if (cat.slide > 0) cat.slide -= 1;

  if (!cat.player && !cat.jump && cat.cooldown <= 0 && !gameOver) {
    const dir = chooseAiJump(cat);
    startJump(cat, dir.x, dir.y);
  }

  if (cat.jump) {
    const j = cat.jump;
    j.t += 1;
    const t = clamp(j.t / j.duration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 2);
    const hop = Math.sin(t * Math.PI) * 26;
    cat.x = j.sx + (j.tx - j.sx) * ease;
    cat.y = j.sy + (j.ty - j.sy) * ease - hop;
    cat.vx = j.tx - j.sx;
    cat.vy = j.ty - j.sy;
    cat.bob += 0.34;
    if (t >= 1) {
      cat.x = j.tx;
      cat.y = j.ty;
      cat.jump = null;
      resolveLanding(cat);
    }
  } else {
    cat.vx *= 0.72;
    cat.vy *= 0.72;
    cat.bob += 0.08;
  }

  for (const p of cat.yarn) {
    if (p.wet > 0) p.wet -= 1;
  }
  const visibleYarn = carriedYarn(cat) > 0 ? Math.max(12, cat.maxYarn) : 0;
  while (cat.yarn.length > visibleYarn) cat.yarn.pop();
}

function checkCollisions() {
  if (sparkles.length > 80) sparkles.splice(0, sparkles.length - 80);
  if (puffs.length > 30) puffs.splice(0, puffs.length - 30);

  robot.x = W / 2 + Math.cos(robot.a) * Math.min(320, W * 0.29);
  robot.y = H / 2 + Math.sin(robot.a * 1.32) * Math.min(250, H * 0.32);
  robot.a += robot.speed;
  robot.warning = Math.max(0, robot.warning - 1);

  for (const cat of cats) {
    if (!cat.alive) continue;
    for (let i = cat.yarn.length - 1; i > 20; i--) {
      if (Math.hypot(robot.x - cat.yarn[i].x, robot.y - cat.yarn[i].y) < robot.r + 10) {
        const cut = cat.yarn[i];
        const before = cat.maxYarn;
        cat.yarn.splice(i);
        cat.maxYarn = Math.max(cat.baseYarn, cat.yarn.length);
        const lost = Math.max(0, before - cat.maxYarn);
        if (lost > 0) spawnFood(cut.x, cut.y, Math.min(2, Math.ceil(lost / FOOD_YARN_VALUE)));
        robot.warning = 30;
        puffs.push({ x: cut.x, y: cut.y, color: "#cfd6df", text: "싹둑!", life: 42, max: 42 });
        if (cat.player) setNotice("로봇청소기가 실을 싹둑 잘랐어!", 58);
        break;
      }
    }
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoom() {
  const floorGradient = ctx.createLinearGradient(0, 0, W, H);
  floorGradient.addColorStop(0, "#f8f2e8");
  floorGradient.addColorStop(0.52, "#f3eadf");
  floorGradient.addColorStop(1, "#eadfd2");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, 0, W, H);

  const light = ctx.createRadialGradient(W * 0.2, H * 0.12, 20, W * 0.2, H * 0.12, Math.min(W, H) * 0.62);
  light.addColorStop(0, "rgba(255,255,255,.6)");
  light.addColorStop(0.55, "rgba(255,255,255,.16)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.fillStyle = "rgba(190, 220, 214, .24)";
  ctx.beginPath();
  ctx.ellipse(W * 0.2, H * 0.78, W * 0.34, H * 0.18, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(238, 183, 198, .18)";
  ctx.beginPath();
  ctx.ellipse(W * 0.8, H * 0.18, W * 0.25, H * 0.14, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(70, 44, 30, .14)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.translate(rug.x, rug.y);
  const rugGradient = ctx.createLinearGradient(0, 0, rug.w, rug.h);
  rugGradient.addColorStop(0, "#f2bbc8");
  rugGradient.addColorStop(0.52, "#eeb0c1");
  rugGradient.addColorStop(1, "#dca1b5");
  ctx.fillStyle = rugGradient;
  roundRect(0, 0, rug.w, rug.h, 30);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.58)";
  ctx.lineWidth = 5;
  roundRect(16, 16, rug.w - 32, rug.h - 32, 24);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundRect(rug.w * 0.1, rug.h * 0.16, rug.w * 0.34, rug.h * 0.12, 18);
  ctx.fill();
  ctx.restore();

  drawSofa();
  drawPuddles();
  drawTower();
}

function drawSofa() {
  ctx.save();
  ctx.shadowColor = "rgba(60, 38, 26, .12)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#7bbbc0";
  roundRect(sofa.x, sofa.y + 18, sofa.w, sofa.h, 20);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#a9d4d6";
  roundRect(sofa.x, sofa.y, sofa.w, sofa.h, 20);
  ctx.fill();
  ctx.fillStyle = "#91c8cc";
  roundRect(sofa.x + 18, sofa.y + 20, sofa.w - 36, sofa.h - 34, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.24)";
  roundRect(sofa.x + 24, sofa.y + 10, sofa.w - 48, 18, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(65, 48, 42, .12)";
  roundRect(sofa.x + 16, sofa.y + sofa.h - 19, sofa.w - 32, 16, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(58, 48, 44, .58)";
  ctx.font = "800 15px Segoe UI";
  ctx.fillText("소파", sofa.x + sofa.w / 2 - 15, sofa.y + 52);
  ctx.restore();
}

function drawPuddles() {
  ctx.save();
  for (const puddle of puddles) {
    ctx.save();
    ctx.translate(puddle.x, puddle.y);
    ctx.rotate(puddle.a);
    ctx.shadowColor = "rgba(52, 115, 146, .16)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "rgba(129, 206, 232, .46)";
    ctx.beginPath();
    ctx.ellipse(0, 0, puddle.rx, puddle.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245, 253, 255, .7)";
    ctx.beginPath();
    ctx.ellipse(-puddle.rx * 0.22, -puddle.ry * 0.22, puddle.rx * 0.38, puddle.ry * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.78)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, puddle.rx - 4, puddle.ry - 3, 0, 0.2, Math.PI * 1.25);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawTower() {
  ctx.save();
  ctx.shadowColor = "rgba(60, 38, 26, .18)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#9d765a";
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + 24, tower.r * 0.82, tower.r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(240, 111, 134, .24)";
  ctx.lineWidth = 5;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, tower.r + 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const towerGradient = ctx.createRadialGradient(tower.x - 24, tower.y - 28, 12, tower.x, tower.y, tower.r);
  towerGradient.addColorStop(0, "#eec89a");
  towerGradient.addColorStop(1, "#a87d5d");
  ctx.fillStyle = towerGradient;
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, tower.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#efd2aa";
  ctx.beginPath();
  ctx.arc(tower.x, tower.y, tower.r * 0.58, 0, Math.PI * 2);
  ctx.fill();

  const nestGradient = ctx.createRadialGradient(nest.x - 10, nest.y - 8, 4, nest.x, nest.y, nest.r);
  nestGradient.addColorStop(0, "#fff9f1");
  nestGradient.addColorStop(0.55, "#f9d6df");
  nestGradient.addColorStop(1, "#ef8fa3");
  ctx.fillStyle = nestGradient;
  ctx.beginPath();
  ctx.arc(nest.x, nest.y, nest.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(nest.x, nest.y, nest.r - 6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(240, 111, 134, .36)";
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 8]);
  ctx.beginPath();
  ctx.arc(nest.x, nest.y, nest.r + 8 + Math.sin(frame * 0.08) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(74, 52, 42, .76)";
  ctx.font = "800 15px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("내 둥지", nest.x, nest.y + 5);
  ctx.restore();
}

function drawFood() {
  for (const food of foods) {
    const pulse = Math.sin(frame * 0.08 + food.wobble) * 0.8;
    const r = food.r + 6 + pulse;
    ctx.save();
    ctx.translate(food.x, food.y);
    ctx.rotate(food.wobble + frame * 0.012);

    ctx.fillStyle = "rgba(60, 42, 36, .14)";
    ctx.beginPath();
    ctx.ellipse(2, r * 0.72, r * 1.1, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    const ballGradient = ctx.createRadialGradient(-r * 0.3, -r * 0.38, 2, 0, 0, r * 1.2);
    ballGradient.addColorStop(0, `hsl(${food.hue} 88% 82%)`);
    ballGradient.addColorStop(1, `hsl(${food.hue} 72% 56%)`);
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${food.hue} 80% 38% / .55)`;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r * 0.38, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 0.28, -0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.44, 0.25, Math.PI * 1.8);
    ctx.stroke();

    ctx.strokeStyle = `hsla(${food.hue} 82% 46% / .72)`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(r * 0.45, r * 0.2);
    ctx.quadraticCurveTo(r * 1.35, -r * 0.55, r * 1.75, r * 0.2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawYarn(cat) {
  if (carriedYarn(cat) <= 0 || cat.yarn.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = cat.player ? 9 : 7;

  const yarnPoint = (i) => {
    const p = cat.yarn[i];
    if (i === 0) return { x: p.x, y: p.y };
    const prev = cat.yarn[i - 1];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const off = Math.sin(i * 0.55 + frame * 0.09) * (i % 2 ? 2.4 : 1.4);
    return { x: p.x + (-dy / len) * off, y: p.y + (dx / len) * off };
  };

  for (let pass = 0; pass < 2; pass++) {
    let drawing = false;
    ctx.beginPath();
    for (let i = 1; i < cat.yarn.length; i++) {
      const p = cat.yarn[i];
      const prev = cat.yarn[i - 1];
      const wet = p.wet > 0 || prev.wet > 0;
      const shouldDraw = pass === 0 ? wet : !wet;
      if (!shouldDraw) {
        drawing = false;
        continue;
      }
      const from = yarnPoint(i - 1);
      const to = yarnPoint(i);
      if (!drawing) {
        ctx.moveTo(from.x, from.y);
        drawing = true;
      }
      ctx.lineTo(to.x, to.y);
    }
    ctx.strokeStyle = pass === 0 ? "rgba(106, 194, 238, .52)" : cat.color;
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,.68)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  const first = yarnPoint(0);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < cat.yarn.length; i++) {
    const p = yarnPoint(i);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  const tail = cat.yarn[cat.yarn.length - 1];
  ctx.fillStyle = cat.color;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(tail.x, tail.y, cat.player ? 11 : 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCat(cat) {
  if (!cat.alive) return;
  const angle = Math.atan2(cat.vy, cat.vx);
  const hop = Math.sin(cat.bob) * 2.6;
  const squish = 1 + Math.sin(cat.bob) * 0.04;
  const facingX = Math.cos(angle);

  if (catSheet.complete && catSheet.naturalWidth > 0) {
    drawCatSprite(cat, angle, hop);
    return;
  }

  ctx.save();
  ctx.translate(cat.x, cat.y + hop);
  ctx.rotate(angle);
  if (cat.sofaDash > 0) ctx.globalAlpha = 0.72;

  ctx.fillStyle = "rgba(55, 34, 25, .24)";
  ctx.beginPath();
  ctx.ellipse(-2, 17 - hop * 0.25, 26, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(squish, 1 / squish);

  ctx.strokeStyle = cat.color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-18, 4);
  ctx.quadraticCurveTo(-35, 2, -32, -14);
  ctx.stroke();

  ctx.fillStyle = shade(cat.color, -18);
  ctx.beginPath();
  ctx.ellipse(-3, 6, 21, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyGlow = ctx.createRadialGradient(-8, -5, 3, 0, 0, 25);
  bodyGlow.addColorStop(0, shade(cat.color, 28));
  bodyGlow.addColorStop(1, cat.color);
  ctx.fillStyle = bodyGlow;
  ctx.beginPath();
  ctx.ellipse(2, 1, 19, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shade(cat.color, -8);
  for (const paw of [[-6, -12], [8, -12], [-7, 14], [9, 14]]) {
    ctx.beginPath();
    ctx.ellipse(paw[0], paw[1], 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = cat.color;
  ctx.beginPath();
  ctx.moveTo(6, -17);
  ctx.lineTo(13, -29);
  ctx.lineTo(18, -14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, 17);
  ctx.lineTo(13, 29);
  ctx.lineTo(18, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffd6df";
  ctx.beginPath();
  ctx.moveTo(10, -17);
  ctx.lineTo(13, -24);
  ctx.lineTo(16, -15);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, 17);
  ctx.lineTo(13, 24);
  ctx.lineTo(16, 15);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = cat.belly;
  ctx.beginPath();
  ctx.ellipse(3, 0, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(10, -5, 4.3, 0, Math.PI * 2);
  ctx.arc(10, 5, 4.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d211d";
  ctx.beginPath();
  ctx.arc(11.5, -5, 1.8, 0, Math.PI * 2);
  ctx.arc(11.5, 5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d211d";
  ctx.beginPath();
  ctx.arc(15.5, 0, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2d211d";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.quadraticCurveTo(19, -3, 22, -2);
  ctx.moveTo(16, 0);
  ctx.quadraticCurveTo(19, 3, 22, 2);
  ctx.stroke();

  ctx.strokeStyle = "#f7f0d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.quadraticCurveTo(25, -5, 32, -1);
  ctx.stroke();
  ctx.fillStyle = cat.player ? "#ff5c7d" : "#ffd36b";
  ctx.beginPath();
  ctx.arc(35, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(55, 34, 25, .18)";
  ctx.beginPath();
  ctx.ellipse(cat.x - facingX * 8, cat.y + 22, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2d211d";
  ctx.font = "800 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(cat.player ? "YOU" : cat.name, cat.x, cat.y - 28 + hop);
  if (cat.slide > 0) {
    ctx.fillStyle = "#2a74a0";
    ctx.fillText("미끄덩", cat.x, cat.y + 34);
  }
  if (cat.towerSpin > 0) {
    ctx.fillStyle = "#b14d65";
    ctx.fillText("빙글!", cat.x, cat.y + 34);
  }
  ctx.restore();
}

function drawCatSprite(cat, angle, hop) {
  const frameInfo = catFrames[cat.sheetIndex % catFrames.length];
  const size = cat.player ? 120 : 104;
  // Source sprites face slightly left, so invert the stored gameplay direction.
  const flip = -(cat.face || 1);
  ctx.save();
  ctx.fillStyle = "rgba(55, 34, 25, .14)";
  ctx.beginPath();
  ctx.ellipse(cat.x - Math.cos(angle) * 10, cat.y + 24, size * 0.38, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(cat.x, cat.y + hop);
  ctx.scale(flip, 1);
  ctx.rotate(Math.sin(cat.bob) * 0.035);
  if (cat.sofaDash > 0) ctx.globalAlpha = 0.74;
  ctx.drawImage(
    catSheet,
    frameInfo.x,
    frameInfo.y,
    frameInfo.w,
    frameInfo.h,
    -size * 0.56,
    -size * 0.48,
    size * 1.22,
    size * 1.08
  );
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(58, 48, 44, .78)";
  ctx.font = "800 12px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText(cat.player ? "YOU" : cat.name, cat.x, cat.y - 34 + hop);
  if (cat.slide > 0) {
    ctx.fillStyle = "#2a74a0";
    ctx.fillText("미끄덩", cat.x, cat.y + 38);
  }
  if (cat.towerSpin > 0) {
    ctx.fillStyle = "#b14d65";
    ctx.fillText("둥지!", cat.x, cat.y + 38);
  }
  ctx.restore();
}

function drawRobot() {
  ctx.save();
  ctx.translate(robot.x, robot.y);
  if (robot.warning > 0) {
    ctx.strokeStyle = "rgba(232, 93, 117, .42)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, robot.r + 12 + Math.sin(frame * 0.3) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#dce3eb";
  ctx.beginPath();
  ctx.arc(0, 0, robot.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#657386";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#657386";
  ctx.fillRect(-11, -3, 22, 6);
  ctx.fillStyle = "#ff748c";
  ctx.beginPath();
  ctx.arc(8, -9, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEffects() {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const puff = puffs[i];
    const t = 1 - puff.life / puff.max;
    ctx.save();
    ctx.globalAlpha = puff.life / puff.max;
    ctx.fillStyle = puff.color;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, 18 + t * 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3d2d27";
    ctx.font = "900 26px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(puff.text, puff.x, puff.y - 24 - t * 18);
    ctx.restore();
    puff.life -= 1;
    if (puff.life <= 0) puffs.splice(i, 1);
  }

  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    ctx.save();
    ctx.globalAlpha = s.life / 34;
    ctx.fillStyle = s.color;
    ctx.font = "900 15px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(s.text, s.x, s.y - (34 - s.life));
    ctx.restore();
    s.life -= 1;
    if (s.life <= 0) sparkles.splice(i, 1);
  }
}

function drawNotice() {
  if (noticeTime <= 0) return;
  const boxW = Math.min(520, W - 32);
  ctx.save();
  ctx.globalAlpha = Math.min(1, noticeTime / 18);
  ctx.fillStyle = "rgba(255, 252, 246, .9)";
  roundRect(W / 2 - boxW / 2, 18, boxW, 46, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(95, 70, 60, .18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#3a302c";
  ctx.font = `800 ${W < 560 ? 16 : 21}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.fillText(notice, W / 2, 49);
  ctx.restore();
  noticeTime -= 1;
}

function drawPauseOverlay() {
  if (!paused) return;
  ctx.save();
  ctx.fillStyle = "rgba(58, 48, 44, .18)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 252, 246, .92)";
  roundRect(W / 2 - 118, H / 2 - 42, 236, 84, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(95, 70, 60, .16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#3a302c";
  ctx.font = "900 24px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("일시정지", W / 2, H / 2 - 4);
  ctx.font = "700 13px Segoe UI";
  ctx.fillStyle = "#8a7770";
  ctx.fillText("ESC로 다시 시작", W / 2, H / 2 + 22);
  ctx.restore();
}

function loop() {
  if (!paused) {
    frame += 1;
    if (!gameOver) {
      timeLeft = Math.max(0, GAME_SECONDS - Math.floor(frame / 60));
      if (timeLeft <= 0) {
        gameOver = true;
        setNotice("시간 종료! 둥지 실을 확인해봐.", 180);
      }
    }
    for (const cat of cats) updateCatV2(cat);
    checkCollisions();
  }

  drawRoom();
  drawFood();
  for (const cat of cats) drawYarn(cat);
  drawRobot();
  for (const cat of cats) drawCat(cat);
  drawEffects();
  drawNotice();
  drawPauseOverlay();

  const player = cats[0];
  const rivalBest = Math.max(...cats.slice(1).map((cat) => cat.nestScore));
  lengthStat.textContent = `${nestYarn}cm / 라이벌 ${rivalBest}cm / ${timeLeft}s`;
  popStat.textContent = `${carriedYarn(player) * CM_PER_YARN}cm`;
  requestAnimationFrame(loop);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * W;
  mouse.y = ((event.clientY - rect.top) / rect.height) * H;
  mouse.active = true;
});

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((touch.clientX - rect.left) / rect.width) * W;
  mouse.y = ((touch.clientY - rect.top) / rect.height) * H;
  mouse.active = true;
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    paused = !paused;
    return;
  }
  keys[event.key] = true;
  const player = cats[0];
  const dirs = {
    ArrowLeft: [-1, 0],
    a: [-1, 0],
    A: [-1, 0],
    ArrowRight: [1, 0],
    d: [1, 0],
    D: [1, 0],
    ArrowUp: [0, -1],
    w: [0, -1],
    W: [0, -1],
    ArrowDown: [0, 1],
    s: [0, 1],
    S: [0, 1],
  };
  if (dirs[event.key] && !paused && !gameOver) {
    event.preventDefault();
    startJump(player, dirs[event.key][0], dirs[event.key][1]);
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

restartBtn.addEventListener("click", reset);

window.addEventListener("resize", () => {
  const oldW = W;
  const oldH = H;
  layoutRoom();
  for (const cat of cats) {
    cat.x = clamp((cat.x / oldW) * W, 18, W - 18);
    cat.y = clamp((cat.y / oldH) * H, 18, H - 18);
    cat.yarn = cat.yarn.map((p) => ({
      x: clamp((p.x / oldW) * W, 0, W),
      y: clamp((p.y / oldH) * H, 0, H),
      wiggle: p.wiggle,
    }));
  }
  foods = foods.map((food) => ({
    ...food,
    x: clamp((food.x / oldW) * W, 18, W - 18),
    y: clamp((food.y / oldH) * H, 18, H - 18),
  }));
});

reset();
loop();
