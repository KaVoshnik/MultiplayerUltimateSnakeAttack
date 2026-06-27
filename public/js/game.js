const board = document.querySelector("#board");
const ctx = board.getContext("2d");
const canvasStage = document.querySelector("#canvasStage");
const statusEl = document.querySelector("#connectionStatus");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const coinsEl = document.querySelector("#coins");
const comboHud = document.querySelector("#comboHud");
const comboVal = document.querySelector("#comboVal");
const heatFill = document.querySelector("#heatFill");
const feedList = document.querySelector("#feedList");
const minimap = document.querySelector("#minimap");
const minimapCtx = minimap?.getContext("2d");
const bonusActive = document.querySelector("#bonusActive");
const bonusHud = document.querySelector("#bonusHud");
const bossHud = document.querySelector("#bossHud");
const bossName = document.querySelector("#bossName");
const bossLabel = document.querySelector("#bossLabel");
const playersEl = document.querySelector("#players");
const deathPanel = document.querySelector("#deathPanel");
const deathReason = document.querySelector("#deathReason");
const deathStats = document.querySelector("#deathStats");
const pausePanel = document.querySelector("#pausePanel");

const settings = SnakeStore.load();
if (!settings.name || !settings.google) {
  location.href = "/profile.html";
}

const BONUS_LABELS = {
  shield: "🛡 Щит",
  speed_up: "⚡ Скор",
  slow_down: "🐢 Медл",
  double: "x2",
  ghost: "👻",
};

const BAD_KINDS = ["rotten", "spider", "mushroom", "bone"];
const particles = [];

const state = {
  socket: null,
  id: null,
  grid: { width: 210, height: 140 },
  food: [],
  bonuses: [],
  players: [],
  bosses: [],
  skins: [],
  shopData: { coins: 0, unlockedSkins: ["default"], activeSkin: "default" },
  joined: false,
  name: settings.name,
  menuOpen: false,
  gameMode: "classic",
  taggedPlayerId: null,
  feed: [],
  lastCombo: 0,
  wasAlive: true,
  personalBest: 0,
  bossRageSound: false,
  camera: { x: 0, y: 0, ready: false },
};

SnakeFX.initCrt(canvasStage);
document.body.addEventListener("pointerdown", () => { SnakeAudio.ensure(); SnakeAudio.startAmbient(); }, { once: true });
document.querySelector("#audioBtn").addEventListener("click", () => {
  SnakeAudio.setEnabled(!SnakeAudio.isEnabled());
  document.querySelector("#audioBtn").textContent = SnakeAudio.isEnabled() ? "🔊" : "🔇";
});
document.querySelector("#audioBtn").textContent = SnakeAudio.isEnabled() ? "🔊" : "🔇";

const keys = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

connect();
requestAnimationFrame(draw);

document.querySelector("#pauseBtn").addEventListener("click", () => toggleMenu());
document.querySelector("#resumeBtn").addEventListener("click", () => setMenu(false));
document.querySelector("#restartBtn").addEventListener("click", () => { send({ type: "restart" }); setMenu(false); });
document.querySelector("#retryBtn").addEventListener("click", () => { send({ type: "restart" }); deathPanel.classList.add("hidden"); });

document.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    toggleMenu();
    return;
  }
  const direction = keys[event.code];
  if (!direction || state.menuOpen || !state.joined || isSpawnFrozen()) return;
  event.preventDefault();
  send({ type: "turn", direction });
});

setupTouchControls();

function setupTouchControls() {
  let touchStart = null;
  const SWIPE_MIN = 18;

  const sendTurn = (direction) => {
    if (state.menuOpen || !state.joined || isSpawnFrozen()) return;
    send({ type: "turn", direction });
  };

  canvasStage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });

  canvasStage.addEventListener("touchmove", (event) => {
    if (touchStart) event.preventDefault();
  }, { passive: false });

  canvasStage.addEventListener("touchend", (event) => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    event.preventDefault();
    if (Math.abs(dx) > Math.abs(dy)) sendTurn(dx > 0 ? "right" : "left");
    else sendTurn(dy > 0 ? "down" : "up");
  }, { passive: false });

  canvasStage.addEventListener("touchcancel", () => { touchStart = null; });
}

function getMe() {
  return state.players.find((p) => p.id === state.id);
}

function isSpawnFrozen() {
  const me = getMe();
  return Boolean(me?.frozenUntil && Date.now() < me.frozenUntil);
}

function resizeCanvas() {
  const w = canvasStage.clientWidth;
  const h = canvasStage.clientHeight;
  if (w < 2 || h < 2) return;
  const ratio = window.devicePixelRatio || 1;
  board.width = Math.floor(w * ratio);
  board.height = Math.floor(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(canvasStage);
resizeCanvas();

function isGoodFood(item) {
  return item.good === true || item.value === 6 || item.value === 7;
}

function resolveFoodKind(item) {
  if (item.kind) return item.kind;
  if (isGoodFood(item)) return item.value === 7 ? "cherry" : item.value === 6 ? "apple" : "grape";
  return BAD_KINDS[(item.x + item.y) % BAD_KINDS.length];
}

function connect() {
  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    statusEl.textContent = "В сети";
    statusEl.className = "status ok";
    if (state.joined) sendJoin();
  });
  socket.addEventListener("close", () => {
    statusEl.textContent = "Нет связи";
    statusEl.className = "status bad";
    setTimeout(connect, 1200);
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "ping") return;
    if (message.type === "hello") {
      state.id = message.id;
      state.grid = message.grid;
      state.camera.ready = false;
      state.skins = message.skins || [];
      if (message.shopData) {
        state.shopData = message.shopData;
        state.personalBest = message.shopData.stats?.best || state.personalBest;
      }
      if (message.feed?.length) {
        state.feed = message.feed;
        renderFeed();
      }
      sendJoin();
    }
    if (message.type === "state") {
      const prevScore = state.players.find((p) => p.id === state.id)?.score || 0;
      const prevCombo = state.players.find((p) => p.id === state.id)?.combo || 0;
      state.grid = message.grid;
      state.food = message.food;
      state.bonuses = message.bonuses || [];
      state.players = message.players;
      state.bosses = message.bosses || (message.boss ? [message.boss] : []);
      state.gameMode = message.gameMode || "classic";
      state.taggedPlayerId = message.taggedPlayerId;
      const me = message.players.find((p) => p.id === state.id);
      updateHud(me, prevScore, prevCombo);
      renderPlayers();
      SnakeFX.updateTrails(state.players);
      const anyEnraged = state.bosses.some((b) => b.phase === "enraged");
      if (anyEnraged && !state.bossRageSound) {
        state.bossRageSound = true;
        SnakeAudio.play("boss");
        SnakeFX.addShake(8);
      }
      if (!anyEnraged) state.bossRageSound = false;
    }
    if (message.type === "feed") {
      state.feed = message.feed || [];
      renderFeed();
    }
    if (message.type === "notice") { showToast(message.text); SnakeAudio.play("feed"); }
    if (message.type === "tagged") showToast(message.tagger ? "Тэг передан!" : "Тебе передали тэг!");
    if (message.type === "shop_update") {
      state.shopData = message.shopData;
      if (message.skins) state.skins = message.skins;
    }
  });
}

function sendJoin() {
  state.joined = true;
  send({
    type: "join",
    name: state.name,
    skin: state.shopData.activeSkin || "default",
  });
}

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(payload));
  }
}

function updateHud(me, prevScore = 0, prevCombo = 0) {
  scoreEl.textContent = me?.score || 0;
  bestEl.textContent = me?.best || 0;
  coinsEl.textContent = me?.coins ?? state.shopData.coins ?? 0;

  if (me?.combo >= 3) {
    comboHud.classList.remove("hidden");
    comboVal.textContent = `×${me.combo}`;
    if (me.combo > prevCombo) {
      comboHud.classList.add("pulse");
      setTimeout(() => comboHud.classList.remove("pulse"), 400);
      if (me.combo >= 3) SnakeAudio.play("combo");
      const head = me.snake?.[0];
      if (head) SnakeFX.spawnFloater(`COMBO ×${me.combo}`, head.x, head.y - 0.5, "#f9f06b");
    }
  } else {
    comboHud.classList.add("hidden");
  }

  const heat = me?.heat || 0;
  if (heatFill) {
    heatFill.style.width = `${heat}%`;
    heatFill.style.filter = heat > 70 ? "hue-rotate(-40deg) brightness(1.2)" : "";
  }

  if (me && me.score > prevScore) {
    spawnEatParticles(me);
    SnakeAudio.play("eat");
    const head = me.snake?.[0];
    if (head) SnakeFX.spawnFloater(`+${me.score - prevScore}`, head.x, head.y - 0.3, me.color);
  }

  if (me?.activeBonus) {
    const left = me.bonusExpires ? Math.max(0, Math.ceil((me.bonusExpires - Date.now()) / 1000)) : "";
    bonusActive.textContent = `${BONUS_LABELS[me.activeBonus] || "?"}${left ? ` ${left}s` : ""}`;
    bonusHud.classList.add("accent");
  } else {
    bonusActive.textContent = "—";
    bonusHud.classList.remove("accent");
  }

  const nearestBoss = getNearestBoss(me?.snake?.[0]);
  if (nearestBoss) {
    const enraged = nearestBoss.phase === "enraged";
    const close = nearestBoss.angry || enraged;
    bossHud.classList.toggle("hidden", !close);
    if (bossName) bossName.textContent = nearestBoss.name;
    bossLabel.textContent = enraged ? "ЯРОСТЬ!" : nearestBoss.angry ? "РЯДОМ!" : "ОХОТА";
    canvasStage.classList.toggle("bossRage", state.bosses.some((b) => b.phase === "enraged"));
  } else {
    bossHud.classList.add("hidden");
    canvasStage.classList.remove("bossRage");
  }

  if (state.joined && me) {
    if (me.alive) {
      if (!state.wasAlive) state.camera.ready = false;
      state.wasAlive = true;
      deathPanel.classList.add("hidden");
    } else if (state.wasAlive) {
      state.wasAlive = false;
      deathReason.textContent = me.reason || "Змейка умерла";
      deathStats.innerHTML = `
        <span>Очки <b>${me.score}</b></span>
        <span>Макс. комбо <b>×${me.maxCombo || 0}</b></span>
        <span>Монеты <b>+${me.coinsEarned || 0}</b></span>
      `;
      deathPanel.classList.remove("hidden");
      SnakeFX.addShake(14);
      SnakeFX.burstConfetti(me.score >= (me.best || 0) && me.score > 0 ? 100 : 20);
      SnakeAudio.play(me.score >= state.personalBest && me.score > 0 ? "highscore" : "death");
      if (me.score >= state.personalBest) state.personalBest = me.score;
    }
  }
}

function renderFeed() {
  if (!feedList) return;
  const items = (state.feed || []).slice(0, 8);
  const key = items.map((ev) => ev.id).join("|");
  if (key === renderFeed.lastKey) return;
  renderFeed.lastKey = key;

  const keepIds = new Set(items.map((ev) => ev.id));
  for (const li of [...feedList.children]) {
    if (!keepIds.has(li.dataset.id)) li.remove();
  }

  const have = new Set([...feedList.children].map((li) => li.dataset.id));
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const ev = items[i];
    if (have.has(ev.id)) continue;
    const li = document.createElement("li");
    li.className = ev.kind || "";
    if (i === 0) li.classList.add("feed-new");
    li.dataset.id = ev.id;
    li.textContent = ev.text;
    feedList.prepend(li);
  }
}

function renderPlayers() {
  playersEl.innerHTML = "";
  for (const player of state.players) {
    const li = document.createElement("li");
    const tag = state.gameMode === "tag_time" && player.id === state.taggedPlayerId ? " 🏷" : "";
    li.innerHTML = `<span><span class="swatch" style="background:${player.color}"></span>${escapeHtml(player.name)}${tag}</span><span>${player.alive ? player.score : "💀"}</span>`;
    playersEl.append(li);
  }
}

function toggleMenu() {
  if (!state.joined) return;
  setMenu(!state.menuOpen);
}

function setMenu(open) {
  state.menuOpen = open;
  pausePanel.classList.toggle("hidden", !open);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function updateCameraFollow() {
  const me = state.players.find((p) => p.id === state.id);
  const head = me?.snake?.[0];
  const targetX = head ? head.x + 0.5 : state.grid.width / 2;
  const targetY = head ? head.y + 0.5 : state.grid.height / 2;

  if (!state.camera.ready) {
    state.camera.x = targetX;
    state.camera.y = targetY;
    state.camera.ready = true;
    return;
  }

  const ease = head && me.alive ? 0.22 : 0.1;
  state.camera.x += (targetX - state.camera.x) * ease;
  state.camera.y += (targetY - state.camera.y) * ease;
}

function getNearestBoss(point) {
  if (!point || !state.bosses.length) return null;
  return state.bosses.reduce((best, boss) => {
    const dist = Math.abs(point.x - boss.x) + Math.abs(point.y - boss.y);
    if (!best || dist < best.dist) return { boss, dist };
    return best;
  }, null)?.boss || null;
}

function computeCameraView(width, height) {
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const cell = coarse ? 22 : 40;
  const halfW = width / cell / 2;
  const halfH = height / cell / 2;

  let camX = state.camera.x;
  let camY = state.camera.y;

  if (state.grid.width <= halfW * 2) camX = state.grid.width / 2;
  else camX = clamp(camX, halfW, state.grid.width - halfW);

  if (state.grid.height <= halfH * 2) camY = state.grid.height / 2;
  else camY = clamp(camY, halfH, state.grid.height - halfH);

  const offsetX = width / 2 - camX * cell;
  const offsetY = height / 2 - camY * cell;

  return {
    cell,
    offsetX,
    offsetY,
    camX,
    camY,
    mapL: offsetX,
    mapT: offsetY,
    mapW: state.grid.width * cell,
    mapH: state.grid.height * cell,
    left: camX - halfW,
    right: camX + halfW,
    top: camY - halfH,
    bottom: camY + halfH,
  };
}

function isInCameraView(gx, gy, view, margin = 1) {
  return gx >= view.left - margin && gx <= view.right + margin
    && gy >= view.top - margin && gy <= view.bottom + margin;
}

function draw() {
  const ratio = window.devicePixelRatio || 1;
  const width = board.width / ratio;
  const height = board.height / ratio;
  updateCameraFollow();
  const view = computeCameraView(width, height);
  const shake = SnakeFX.getShakeOffset();

  ctx.save();
  ctx.translate(shake.x, shake.y);
  ctx.clearRect(-shake.x, -shake.y, width, height);
  drawBackground(width, height, view);
  SnakeFX.drawTrails(ctx, view.cell, view.offsetX, view.offsetY);
  drawFood(view);
  drawBonuses(view);
  drawBoss(view);
  drawPlayers(view);
  drawParticles(view);
  SnakeFX.drawFloaters(ctx, view.cell, view.offsetX, view.offsetY);
  drawSpawnOverlay(width, height);
  ctx.restore();

  SnakeFX.drawConfetti(ctx, width, height);
  SnakeFX.drawCrt(width, height);
  drawMinimap(view);
  requestAnimationFrame(draw);
}

function drawSpawnOverlay(width, height) {
  if (!isSpawnFrozen()) return;
  const me = getMe();
  const left = Math.max(0, (me?.frozenUntil || 0) - Date.now());
  const sec = (left / 1000).toFixed(1);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.max(18, width * 0.04)}px Orbitron, sans-serif`;
  ctx.fillStyle = "#3de88a";
  ctx.shadowColor = "#3de88a";
  ctx.shadowBlur = 12;
  ctx.fillText(`СТАРТ ${sec}`, width / 2, height / 2);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.max(11, width * 0.018)}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Приготовься…", width / 2, height / 2 + width * 0.05);
  ctx.restore();
}

function drawMinimap(view) {
  if (!minimapCtx || !minimap) return;
  const gw = state.grid.width;
  const gh = state.grid.height;
  const w = minimap.width;
  const h = minimap.height;
  const cell = Math.min(w / gw, h / gh);
  const ox = (w - gw * cell) / 2;
  const oy = (h - gh * cell) / 2;

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = "#060a0e";
  minimapCtx.fillRect(ox, oy, gw * cell, gh * cell);
  minimapCtx.strokeStyle = "rgba(61,232,138,0.45)";
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(ox + 0.5, oy + 0.5, gw * cell - 1, gh * cell - 1);

  for (let i = 0; i < state.food.length; i += 2) {
    const item = state.food[i];
    minimapCtx.fillStyle = isGoodFood(item) ? "rgba(61,232,138,0.55)" : "rgba(246,97,81,0.65)";
    minimapCtx.fillRect(ox + item.x * cell + 0.5, oy + item.y * cell + 0.5, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
  }

  for (const boss of state.bosses) {
    const bs = boss.size || 1;
    minimapCtx.fillStyle = boss.phase === "enraged" ? "#ff3b2e" : boss.color || "#f66151";
    minimapCtx.fillRect(ox + boss.x * cell, oy + boss.y * cell, bs * cell, bs * cell);
  }

  for (const player of state.players) {
    const head = player.snake?.[0];
    if (!head) continue;
    minimapCtx.fillStyle = player.id === state.id ? "#ffffff" : player.color;
    minimapCtx.beginPath();
    minimapCtx.arc(ox + head.x * cell + cell / 2, oy + head.y * cell + cell / 2, Math.max(1.5, cell * 0.35), 0, Math.PI * 2);
    minimapCtx.fill();
  }

  if (view) {
    const vx = ox + view.left * cell;
    const vy = oy + view.top * cell;
    const vw = (view.right - view.left) * cell;
    const vh = (view.bottom - view.top) * cell;
    minimapCtx.strokeStyle = "rgba(249,240,107,0.9)";
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
  }
}

function drawBackground(width, height, view) {
  const enraged = state.bosses.some((b) => b.phase === "enraged");
  const { cell, mapL, mapT, mapW, mapH, left, right, top, bottom } = view;

  ctx.fillStyle = "#020304";
  ctx.fillRect(0, 0, width, height);

  const mapGrad = ctx.createRadialGradient(
    mapL + mapW / 2, mapT + mapH / 2, 0,
    mapL + mapW / 2, mapT + mapH / 2, Math.max(mapW, mapH) * 0.65,
  );
  mapGrad.addColorStop(0, enraged ? "#180808" : "#0c1218");
  mapGrad.addColorStop(1, enraged ? "#080202" : "#040608");
  ctx.fillStyle = mapGrad;
  ctx.fillRect(mapL, mapT, mapW, mapH);

  const t = Date.now() / 1000;
  ctx.strokeStyle = enraged ? "rgba(255,59,46,0.12)" : "rgba(61, 232, 138, 0.07)";
  ctx.lineWidth = Math.max(1, cell * 0.04);

  const gridLeft = Math.max(0, Math.floor(left - 1));
  const gridRight = Math.min(state.grid.width, Math.ceil(right + 1));
  const gridTop = Math.max(0, Math.floor(top - 1));
  const gridBottom = Math.min(state.grid.height, Math.ceil(bottom + 1));

  for (let x = gridLeft; x <= gridRight; x++) {
    const px = Math.round(mapL + x * cell);
    ctx.beginPath();
    ctx.moveTo(px, mapT);
    ctx.lineTo(px, mapT + mapH);
    ctx.stroke();
  }
  for (let y = gridTop; y <= gridBottom; y++) {
    const py = Math.round(mapT + y * cell);
    ctx.beginPath();
    ctx.moveTo(mapL, py);
    ctx.lineTo(mapL + mapW, py);
    ctx.stroke();
  }

  ctx.strokeStyle = enraged ? "rgba(255,59,46,0.55)" : "rgba(61, 232, 138, 0.35)";
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.strokeRect(mapL, mapT, mapW, mapH);

  if (enraged) {
    ctx.fillStyle = `rgba(255,59,46,${0.03 + Math.sin(t * 6) * 0.02})`;
    ctx.fillRect(mapL, mapT, mapW, mapH);
  }

  const edge = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.58);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
}

function drawFood(view) {
  const { cell, offsetX, offsetY } = view;
  const t = Date.now() / 1000;
  for (const item of state.food) {
    if (!isInCameraView(item.x, item.y, view)) continue;
    const kind = resolveFoodKind(item);
    const good = isGoodFood(item);
    const cx = offsetX + item.x * cell + cell / 2;
    const cy = offsetY + item.y * cell + cell / 2;
    const r = cell * 0.34;
    const bob = Math.sin(t * 3 + item.x + item.y) * cell * 0.03;

    if (good) {
      ctx.save();
      ctx.shadowColor = "rgba(61, 232, 138, 0.45)";
      ctx.shadowBlur = cell * 0.22;
      drawFoodShape(kind, cx, cy + bob, r, cell);
      ctx.restore();
    } else {
      drawFoodShape(kind, cx, cy + bob, r, cell);
    }
  }
}

function drawFoodShape(kind, cx, cy, r, cell) {
  switch (kind) {
    case "apple":
      ctx.fillStyle = "#e8453c";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3de88a";
      ctx.beginPath(); ctx.ellipse(cx + r * 0.2, cy - r * 0.9, r * 0.35, r * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx + r * 0.15, cy - r * 1.1); ctx.stroke();
      break;
    case "cherry":
      ctx.fillStyle = "#c41e3a";
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy + r * 0.1, r * 0.72, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.35, cy + r * 0.1, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a8f29"; ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.beginPath(); ctx.moveTo(cx - r * 0.35, cy - r * 0.5); ctx.quadraticCurveTo(cx, cy - r * 1.3, cx + r * 0.35, cy - r * 0.5); ctx.stroke();
      break;
    case "grape":
      ctx.fillStyle = "#9b59b6";
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col <= row; col++) {
          ctx.beginPath();
          ctx.arc(cx + (col - row / 2) * r * 0.55, cy + (row - 1) * r * 0.5, r * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "rotten":
      ctx.fillStyle = "#6b7c3d";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a5528";
      ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    case "spider":
      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = Math.max(1, cell * 0.03);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1); ctx.stroke();
      }
      ctx.fillStyle = "#f25f4c";
      ctx.beginPath();
      ctx.arc(cx - r * 0.15, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.15, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "mushroom":
      ctx.fillStyle = "#f5f0e1";
      roundRect(cx - r * 0.35, cy, r * 0.7, r * 0.7, r * 0.15); ctx.fill();
      ctx.fillStyle = "#e8453c";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, r * 0.75, Math.PI, 0); ctx.fill();
      break;
  default:
      ctx.fillStyle = "#d4cfc7";
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.strokeStyle = "#d4cfc7"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - r, cy, r * 0.28, 0, Math.PI * 2);
      ctx.arc(cx + r, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawBonuses(view) {
  const { cell, offsetX, offsetY } = view;
  const t = Date.now() / 1000;
  for (const bonus of state.bonuses) {
    if (!isInCameraView(bonus.x, bonus.y, view)) continue;
    const x = offsetX + bonus.x * cell;
    const y = offsetY + bonus.y * cell;
    const color = bonus.def?.color || "#c77dff";
    const pulse = 0.85 + Math.sin(t * 4 + bonus.x) * 0.08;
    const pad = cell * 0.14 * pulse;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.setLineDash([cell * 0.12, cell * 0.08]);
    roundRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color + "55";
    roundRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${cell * 0.28}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(bonus.def?.label || "?", x + cell / 2, y + cell / 2);
    ctx.restore();
  }
}

function drawBoss(view) {
  for (const boss of state.bosses) {
    const bossSize = boss.size || 1;
    if (!isInCameraView(boss.x + bossSize / 2, boss.y + bossSize / 2, view, bossSize + 1)) continue;
    const { cell, offsetX, offsetY } = view;
    const x = offsetX + boss.x * cell;
    const y = offsetY + boss.y * cell;
    const size = bossSize * cell;
    const angry = boss.angry;
    const enraged = boss.phase === "enraged";
    const t = Date.now() / 1000;
    ctx.save();
    if (enraged) {
      ctx.shadowColor = "rgba(255,30,20,.95)";
      ctx.shadowBlur = cell * 1.1;
    } else if (angry) {
      ctx.shadowColor = "rgba(246,97,81,.8)";
      ctx.shadowBlur = cell * 0.7;
    }
    const pulse = 1 + Math.sin(t * 8 + boss.x) * (enraged ? 0.06 : 0.02);
    const pad = cell * 0.08;
    const w = (size - pad * 2) * pulse;
    const h = (size - pad * 2) * pulse;
    const ox = x + (size - w) / 2;
    const oy = y + (size - h) / 2;
    ctx.fillStyle = enraged ? "#ff1a0a" : angry ? "#ff3b2e" : boss.color || "#f66151";
    roundRect(ox, oy, w, h, cell * 0.22);
    ctx.fill();
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.fillStyle = "#1a0a0a";
    ctx.beginPath();
    ctx.arc(cx - cell * 0.14, cy - cell * 0.05, cell * 0.09, 0, Math.PI * 2);
    ctx.arc(cx + cell * 0.14, cy - cell * 0.05, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
    if (enraged || size >= cell * 1.5) {
      ctx.fillStyle = "#ff6b5a";
      ctx.font = `800 ${cell * 0.2}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(boss.name, cx, cy + cell * 0.35);
    }
    ctx.restore();
  }
}

function drawPlayers(view) {
  const { cell, offsetX, offsetY } = view;
  for (const player of state.players) {
    ctx.globalAlpha = player.alive ? 1 : 0.35;
    const isTagged = state.gameMode === "tag_time" && player.id === state.taggedPlayerId;
    const head = player.snake[0];
    const neck = player.snake[1] || head;
    const dirX = head.x - neck.x;
    const dirY = head.y - neck.y;
    const customTex = typeof CustomSkins !== "undefined" && CustomSkins.isCustom(player.skin)
      ? CustomSkins.get(player.skin)
      : null;

    player.snake.forEach((part, index) => {
      if (!isInCameraView(part.x, part.y, view, 0.5)) return;
      const px = offsetX + part.x * cell;
      const py = offsetY + part.y * cell;
      const bodyColor = player.rainbow ? `hsl(${(index * 40 + Date.now() / 20) % 360}, 80%, 60%)` : player.color;
      const heatGlow = (player.heat || 0) > 50;
      const segX = px + cell * 0.08;
      const segY = py + cell * 0.08;
      const segS = cell * 0.84;

      if (index === 0) {
        if (isTagged) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = cell * 0.1; roundRect(px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2); ctx.stroke(); }
        if (player.activeBonus === "ghost") ctx.globalAlpha = 0.6;
        if (heatGlow) { ctx.shadowColor = player.color; ctx.shadowBlur = cell * 0.45; }
      } else {
        ctx.globalAlpha = player.alive ? (player.activeBonus === "ghost" ? 0.5 : 0.9) : 0.35;
      }

      if (customTex) {
        ctx.drawImage(customTex, segX, segY, segS, segS);
      } else if (index === 0) {
        ctx.fillStyle = player.headColor || "#fff";
        roundRect(segX, segY, segS, segS, cell * 0.18);
        ctx.fill();
        ctx.globalAlpha = player.alive ? 1 : 0.35;
        ctx.fillStyle = bodyColor;
        roundRect(px + cell * 0.24, py + cell * 0.24, cell * 0.52, cell * 0.52, cell * 0.14);
        ctx.fill();
      } else {
        ctx.fillStyle = bodyColor;
        roundRect(segX, segY, segS, segS, cell * 0.18);
        ctx.fill();
      }

      if (index === 0) {
        ctx.globalAlpha = player.alive ? 1 : 0.35;
        drawSnakeEyes(px, py, cell, dirX, dirY);
        drawSnakeCosmetics(px, py, cell, player);
        ctx.shadowBlur = 0;
      }
    });
    ctx.globalAlpha = 1;
  }
}

function drawSnakeEyes(x, y, cell, dirX, dirY) {
  const cx = x + cell / 2, cy = y + cell / 2;
  let ex1 = cx - cell * 0.14, ey1 = cy - cell * 0.14, ex2 = cx + cell * 0.14, ey2 = cy - cell * 0.14;
  if (dirX > 0) { ex1 += cell * 0.08; ex2 += cell * 0.08; }
  if (dirX < 0) { ex1 -= cell * 0.08; ex2 -= cell * 0.08; }
  if (dirY > 0) { ey1 += cell * 0.08; ey2 += cell * 0.08; }
  if (dirY < 0) { ey1 -= cell * 0.08; ey2 -= cell * 0.08; }
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(ex1, ey1, cell * 0.07, 0, Math.PI * 2);
  ctx.arc(ex2, ey2, cell * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnakeCosmetics(x, y, cell, player) {
  const cx = x + cell / 2;
  const cy = y + cell / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (player.snakeHatEmoji) {
    ctx.font = `${cell * 0.55}px sans-serif`;
    ctx.fillText(player.snakeHatEmoji, cx, cy - cell * 0.55);
  }
}

function spawnEatParticles(player) {
  const head = player?.snake?.[0];
  if (!head) return;
  for (let i = 0; i < 6; i++) {
    particles.push({ x: head.x + 0.5, y: head.y + 0.5, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12, life: 1, color: player.color });
  }
}

function drawParticles(view) {
  const { cell, offsetX, offsetY } = view;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!isInCameraView(p.x, p.y, view, 0.5)) continue;
    p.x += p.vx; p.y += p.vy; p.life -= 0.04;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(offsetX + p.x * cell, offsetY + p.y * cell, cell * 0.08 * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
