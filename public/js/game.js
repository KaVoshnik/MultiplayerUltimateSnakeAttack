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
  gameMode: "classic",
  taggedPlayerId: null,
  feed: [],
  lastCombo: 0,
  wasAlive: true,
  personalBest: 0,
  bossRageSound: false,
  camera: { x: 0, y: 0, ready: false },
  freezeEndsAt: 0,
  renderSnap: null,
  lastMinimapDraw: 0,
  // Буфер для нажатий во время spawn freeze
  bufferedDirection: null,
  // FPS / ping
  fps: 0,
  ping: 0,
  showStats: Boolean(settings.showStats),
  _fpsFrames: 0,
  _fpsLast: 0,
  _pingSentAt: 0,
};

let isCoarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
window.matchMedia("(hover: none) and (pointer: coarse)").addEventListener("change", (e) => {
  isCoarsePointer = e.matches;
});

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

document.querySelector("#retryBtn").addEventListener("click", () => { send({ type: "restart" }); state.freezeEndsAt = 0; deathPanel.classList.add("hidden"); });

document.addEventListener("keydown", (event) => {
  const direction = keys[event.code];
  if (!direction || !state.joined) return;
  event.preventDefault();
  if (isSpawnFrozen()) {
    // Буферизируем — отправим сразу как freeze снимется
    state.bufferedDirection = direction;
    return;
  }
  send({ type: "turn", direction });
});

setupTouchControls();

function setupTouchControls() {
  let touchStart = null;
  const SWIPE_MIN = 18;

  const sendTurn = (direction) => {
    if (!state.joined) return;
    if (isSpawnFrozen()) {
      state.bufferedDirection = direction;
      return;
    }
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
  return state.freezeEndsAt > Date.now();
}

function syncSpawnFreeze(me) {
  if (!me) return;
  const wasFrozen = state.freezeEndsAt > Date.now();
  const frozenUntil = me.spawnFrozenLeft || 0; // сервер шлёт абсолютный timestamp
  if (frozenUntil > Date.now()) {
    // Обновляем если новый timestamp дальше (не даём таймеру скакать назад)
    if (frozenUntil > state.freezeEndsAt) state.freezeEndsAt = frozenUntil;
  } else {
    state.freezeEndsAt = 0;
    if (wasFrozen && state.bufferedDirection) {
      send({ type: "turn", direction: state.bufferedDirection });
      state.bufferedDirection = null;
    }
  }
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

function finishGameUpdate(prevScore, prevCombo) {
  const me = state.players.find((p) => p.id === state.id);
  syncSpawnFreeze(me);
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

function applyMotionInterp() {
  const now = performance.now();
  const prevDuration = state.renderSnap ? now - state.renderSnap.at : (state.estimatedTickMs || 115);
  state.renderSnap = {
    prevSnakes: snapshotSnakes(state.players),
    at: now,
    duration: clamp(prevDuration, 40, 200),
  };
}

function handleSnapshot(message) {
  const prevScore = state.players.find((p) => p.id === state.id)?.score || 0;
  const prevCombo = state.players.find((p) => p.id === state.id)?.combo || 0;
  const players = GameSyncClient.applySnapshot(state, message);
  applyRenderSnap(players);
  finishGameUpdate(prevScore, prevCombo);
}

function handleDelta(message) {
  const prevScore = state.players.find((p) => p.id === state.id)?.score || 0;
  const prevCombo = state.players.find((p) => p.id === state.id)?.combo || 0;
  const needsInterp = Boolean(message.mv?.length || message.pj?.length);
  if (needsInterp) applyMotionInterp();
  GameSyncClient.applyDelta(state, message);
  if (!needsInterp && (message.pm?.length || message.ple?.length)) {
    renderPlayers();
  }
  finishGameUpdate(prevScore, prevCombo);
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
    if (message.type === "ping") {
      // Отвечаем pong для измерения RTT
      send({ type: "pong", t: message.t });
      if (message.t) state.ping = Math.round(Date.now() - message.t);
      return;
    }
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
      // Если пришли из комнаты — не шлём join, запрашиваем снэпшот комнаты
      const roomCode = sessionStorage.getItem("roomCode");
      if (roomCode) {
        sessionStorage.removeItem("roomCode");
        state.roomCode = roomCode;
        send({ type: "room_rejoin", name: state.name, code: roomCode });
      } else {
        sendJoin();
      }
    }
    if (message.type === "snapshot") {
      handleSnapshot(message);
      return;
    }
    if (message.type === "delta") {
      handleDelta(message);
      return;
    }
    if (message.type === "state") {
      const prevScore = state.players.find((p) => p.id === state.id)?.score || 0;
      const prevCombo = state.players.find((p) => p.id === state.id)?.combo || 0;
      state.grid = message.grid;
      state.food = message.food;
      state.bonuses = message.bonuses || [];
      applyRenderSnap(message.players);
      state.bosses = message.bosses || (message.boss ? [message.boss] : []);
      state.gameMode = message.gameMode || "classic";
      state.taggedPlayerId = message.taggedPlayerId;
      finishGameUpdate(prevScore, prevCombo);
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
  const players = state.players;
  const existingItems = [...playersEl.children];

  // Удаляем лишние строки
  while (playersEl.children.length > players.length) {
    playersEl.removeChild(playersEl.lastChild);
  }
  // Добавляем недостающие
  while (playersEl.children.length < players.length) {
    playersEl.appendChild(document.createElement("li"));
  }

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const li = playersEl.children[i];
    const tag = state.gameMode === "tag_time" && player.id === state.taggedPlayerId ? " 🏷" : "";
    const scoreText = player.alive ? String(player.score) : "💀";
    // Обновляем только если изменилось
    const nameStyle = player.nickColor ? ` style="color:${player.nickColor}"` : "";
    const newHtml = `<span><span class="swatch" style="background:${player.color}"></span><span class="playerNick"${nameStyle}>${escapeHtml(player.name)}</span>${tag}</span><span>${scoreText}</span>`;
    if (li.innerHTML !== newHtml) li.innerHTML = newHtml;
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Снимаем позиции ВСЕХ сегментов змейки, не только головы
function snapshotSnakes(players) {
  const map = new Map();
  for (const p of players) {
    if (p.snake?.length) map.set(p.id, p.snake.map(seg => ({ x: seg.x, y: seg.y })));
  }
  return map;
}

function applyRenderSnap(nextPlayers) {
  const now = performance.now();
  const prevDuration = state.renderSnap ? now - state.renderSnap.at : 115;
  state.renderSnap = {
    // Снимок всех сегментов до обновления стейта
    prevSnakes: state.players.length ? snapshotSnakes(state.players) : snapshotSnakes(nextPlayers),
    at: now,
    // Диапазон 40–200ms покрывает все сложности: insane=50ms, easy=160ms
    duration: clamp(prevDuration, 40, 200),
  };
  state.players = nextPlayers;
}

function getSnapT() {
  if (!state.renderSnap) return 1;
  const raw = clamp((performance.now() - state.renderSnap.at) / state.renderSnap.duration, 0, 1);
  return smoothstep(raw);
}

// Возвращает интерполированную позицию сегмента index для игрока playerId
// Каждый сегмент интерполируется от своей предыдущей позиции к текущей
function getSegmentPos(playerId, index, currentSeg, cell, offsetX, offsetY) {
  if (!state.renderSnap) return { px: offsetX + currentSeg.x * cell, py: offsetY + currentSeg.y * cell };
  const prevSnake = state.renderSnap.prevSnakes?.get(playerId);
  const prev = prevSnake?.[index];
  if (!prev) return { px: offsetX + currentSeg.x * cell, py: offsetY + currentSeg.y * cell };
  const t = getSnapT();
  const ix = prev.x + (currentSeg.x - prev.x) * t;
  const iy = prev.y + (currentSeg.y - prev.y) * t;
  return { px: offsetX + ix * cell, py: offsetY + iy * cell };
}

function getCameraHead(player) {
  const head = player?.snake?.[0];
  if (!head) return null;
  if (!state.renderSnap) return { x: head.x + 0.5, y: head.y + 0.5 };
  const prevSnake = state.renderSnap.prevSnakes?.get(player.id);
  const prev = prevSnake?.[0];
  if (!prev) return { x: head.x + 0.5, y: head.y + 0.5 };
  const t = getSnapT();
  return {
    x: prev.x + (head.x - prev.x) * t + 0.5,
    y: prev.y + (head.y - prev.y) * t + 0.5,
  };
}

function updateCameraFollow() {
  const me = state.players.find((p) => p.id === state.id);
  const camHead = getCameraHead(me);
  const targetX = camHead ? camHead.x : state.grid.width / 2;
  const targetY = camHead ? camHead.y : state.grid.height / 2;

  if (!state.camera.ready) {
    state.camera.x = targetX;
    state.camera.y = targetY;
    state.camera.ready = true;
    return;
  }

  const ease = camHead && me?.alive ? 0.28 : 0.12;
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
  const cell = isCoarsePointer ? 22 : 40;
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

let drawFrame = 0;

// Кэш градиентов фона — пересоздаются только при изменении размера или режима босса
const bgGradientCache = { mapGrad: null, edgeGrad: null, enraged: null, width: 0, height: 0, mapL: 0, mapT: 0, mapW: 0, mapH: 0 };

function draw() {
  drawFrame += 1;
  const ratio = window.devicePixelRatio || 1;
  const width = board.width / ratio;
  const height = board.height / ratio;

  // Подсчёт FPS
  const now = performance.now();
  state._fpsFrames += 1;
  if (now - state._fpsLast >= 500) {
    state.fps = Math.round(state._fpsFrames / ((now - state._fpsLast) / 1000));
    state._fpsFrames = 0;
    state._fpsLast = now;
  }

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
  if (drawFrame % 2 === 0) SnakeFX.drawCrt(width, height);
  if (now - state.lastMinimapDraw > 150) {
    drawMinimap(view);
    state.lastMinimapDraw = now;
  }

  if (state.showStats) drawStatsOverlay(width);

  requestAnimationFrame(draw);
}

function drawStatsOverlay(width) {
  const fps = state.fps;
  const ping = state.ping;
  const fpsColor = fps >= 55 ? "#33d17a" : fps >= 30 ? "#f9f06b" : "#f66151";
  const pingColor = ping < 60 ? "#33d17a" : ping < 120 ? "#f9f06b" : "#f66151";

  ctx.save();
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const lines = [
    { label: "FPS", value: `${fps}`, color: fpsColor },
    { label: "PING", value: ping > 0 ? `${ping}ms` : "—", color: pingColor },
  ];

  const padR = 10, padT = 10, lineH = 18, boxW = 110, boxH = lines.length * lineH + 10;
  const bx = width - padR - boxW;
  const by = padT;

  ctx.fillStyle = "rgba(2,3,4,0.72)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 6);
  ctx.fill();

  lines.forEach((line, i) => {
    const y = by + 5 + i * lineH;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "left";
    ctx.fillText(line.label, bx + 8, y);
    ctx.fillStyle = line.color;
    ctx.textAlign = "right";
    ctx.fillText(line.value, bx + boxW - 8, y);
  });

  ctx.restore();
}

function drawSpawnOverlay(width, height) {
  if (!isSpawnFrozen()) return;
  const left = Math.max(0, state.freezeEndsAt - Date.now());
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

  // Пересоздаём градиенты только если изменился размер или режим босса
  const c = bgGradientCache;
  if (c.enraged !== enraged || c.width !== width || c.height !== height ||
      c.mapL !== mapL || c.mapT !== mapT || c.mapW !== mapW || c.mapH !== mapH) {
    c.enraged = enraged;
    c.width = width; c.height = height;
    c.mapL = mapL; c.mapT = mapT; c.mapW = mapW; c.mapH = mapH;

    const mg = ctx.createRadialGradient(
      mapL + mapW / 2, mapT + mapH / 2, 0,
      mapL + mapW / 2, mapT + mapH / 2, Math.max(mapW, mapH) * 0.65,
    );
    mg.addColorStop(0, enraged ? "#180808" : "#0c1218");
    mg.addColorStop(1, enraged ? "#080202" : "#040608");
    c.mapGrad = mg;

    const eg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.58);
    eg.addColorStop(0, "rgba(0,0,0,0)");
    eg.addColorStop(1, "rgba(0,0,0,0.45)");
    c.edgeGrad = eg;
  }

  ctx.fillStyle = c.mapGrad;
  ctx.fillRect(mapL, mapT, mapW, mapH);

  const t = Date.now() / 1000;
  ctx.strokeStyle = enraged ? "rgba(255,59,46,0.12)" : "rgba(61, 232, 138, 0.07)";
  ctx.lineWidth = Math.max(1, cell * 0.04);

  const gridLeft = Math.max(0, Math.floor(left - 1));
  const gridRight = Math.min(state.grid.width, Math.ceil(right + 1));
  const gridTop = Math.max(0, Math.floor(top - 1));
  const gridBottom = Math.min(state.grid.height, Math.ceil(bottom + 1));

  ctx.beginPath();
  for (let x = gridLeft; x <= gridRight; x++) {
    const px = Math.round(mapL + x * cell);
    ctx.moveTo(px, mapT);
    ctx.lineTo(px, mapT + mapH);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let y = gridTop; y <= gridBottom; y++) {
    const py = Math.round(mapT + y * cell);
    ctx.moveTo(mapL, py);
    ctx.lineTo(mapL + mapW, py);
  }
  ctx.stroke();

  ctx.strokeStyle = enraged ? "rgba(255,59,46,0.55)" : "rgba(61, 232, 138, 0.35)";
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.strokeRect(mapL, mapT, mapW, mapH);

  if (enraged) {
    ctx.fillStyle = `rgba(255,59,46,${0.03 + Math.sin(t * 6) * 0.02})`;
    ctx.fillRect(mapL, mapT, mapW, mapH);
  }

  ctx.fillStyle = c.edgeGrad;
  ctx.fillRect(0, 0, width, height);
}

function drawFood(view) {
  const { cell, offsetX, offsetY } = view;
  const t = Date.now() / 1000;

  // Сначала рисуем плохую еду (без shadow) — один проход без save/restore
  for (const item of state.food) {
    if (!isInCameraView(item.x, item.y, view)) continue;
    if (isGoodFood(item)) continue;
    const kind = resolveFoodKind(item);
    const cx = offsetX + item.x * cell + cell / 2;
    const cy = offsetY + item.y * cell + cell / 2;
    const r = cell * 0.34;
    const bob = Math.sin(t * 3 + item.x + item.y) * cell * 0.03;
    drawFoodShape(kind, cx, cy + bob, r, cell);
  }

  // Затем хорошую еду — один общий shadow для всего прохода
  ctx.save();
  ctx.shadowColor = "rgba(61, 232, 138, 0.45)";
  ctx.shadowBlur = cell * 0.22;
  for (const item of state.food) {
    if (!isInCameraView(item.x, item.y, view)) continue;
    if (!isGoodFood(item)) continue;
    const kind = resolveFoodKind(item);
    const cx = offsetX + item.x * cell + cell / 2;
    const cy = offsetY + item.y * cell + cell / 2;
    const r = cell * 0.34;
    const bob = Math.sin(t * 3 + item.x + item.y) * cell * 0.03;
    drawFoodShape(kind, cx, cy + bob, r, cell);
  }
  ctx.restore();
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

// ============================================================
// Интерполяция позиции босса (клиент знает prevX/prevY/moveAt)
// ============================================================
const BOSS_CLIENT_MOVE_MS = 575; // ~BOSS_MOVE_EVERY(5) * TICK_MS(115)

function getBossInterp(boss, view) {
  const { cell, offsetX, offsetY } = view;
  if (boss.prevX === undefined || boss.moveAt === undefined) {
    return { bx: offsetX + boss.x * cell, by: offsetY + boss.y * cell };
  }
  const elapsed = Date.now() - boss.moveAt;
  const raw = Math.min(1, elapsed / BOSS_CLIENT_MOVE_MS);
  const t = raw * raw * (3 - 2 * raw); // smoothstep
  const ix = boss.prevX + (boss.x - boss.prevX) * t;
  const iy = boss.prevY + (boss.y - boss.prevY) * t;
  return { bx: offsetX + ix * cell, by: offsetY + iy * cell };
}

function drawBoss(view) {
  const t = Date.now() / 1000;
  const { cell, offsetX, offsetY } = view;

  for (const boss of state.bosses) {
    const bossSize = boss.size || 1;
    if (!isInCameraView(boss.x + bossSize / 2, boss.y + bossSize / 2, view, bossSize + 2)) continue;

    const { bx, by } = getBossInterp(boss, view);
    const size = bossSize * cell;
    const angry = boss.angry;
    const enraged = boss.phase === "enraged";

    ctx.save();

    // ── VØIDR (dash) ──────────────────────────────────────────
    if (boss.trait === "dash") {
      // Красная пульсация + motion blur при рывке
      const pulse = 1 + Math.sin(t * (enraged ? 14 : 8)) * (enraged ? 0.09 : 0.03);
      const pad = cell * 0.06;
      const w = (size - pad * 2) * pulse;
      const h = (size - pad * 2) * pulse;
      const ox = bx + (size - w) / 2;
      const oy = by + (size - h) / 2;

      // Glow
      ctx.shadowColor = enraged ? "#ff0000" : angry ? "#ff3b2e" : "#f66151";
      ctx.shadowBlur = enraged ? cell * 1.4 : (angry ? cell * 0.8 : cell * 0.3);

      // Тело
      ctx.fillStyle = enraged ? "#ff1a0a" : angry ? "#e83020" : boss.color;
      roundRect(ox, oy, w, h, cell * 0.18);
      ctx.fill();

      // "Заряд" — диагональные линии при ярости (вспышка скорости)
      if (enraged) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.abs(Math.sin(t * 20)) * 0.4;
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = cell * 0.05;
        ctx.beginPath();
        ctx.moveTo(bx + cell * 0.1, by + cell * 0.9);
        ctx.lineTo(bx + cell * 0.6, by + cell * 0.1);
        ctx.moveTo(bx + cell * 0.4, by + cell * 0.9);
        ctx.lineTo(bx + cell * 0.9, by + cell * 0.1);
        ctx.stroke();
        ctx.restore();
      }

      // Глаза — злые, острые
      const cx = bx + size / 2;
      const cy = by + size / 2;
      ctx.fillStyle = enraged ? "#ffee00" : "#fff";
      ctx.beginPath();
      ctx.arc(cx - cell * 0.13, cy - cell * 0.06, cell * 0.08, 0, Math.PI * 2);
      ctx.arc(cx + cell * 0.13, cy - cell * 0.06, cell * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // Зрачки
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx - cell * 0.12, cy - cell * 0.05, cell * 0.04, 0, Math.PI * 2);
      ctx.arc(cx + cell * 0.14, cy - cell * 0.05, cell * 0.04, 0, Math.PI * 2);
      ctx.fill();
      // Нахмуренные брови
      ctx.strokeStyle = enraged ? "#ffee00" : "#ff4422";
      ctx.lineWidth = cell * 0.06;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.22, cy - cell * 0.18);
      ctx.lineTo(cx - cell * 0.04, cy - cell * 0.12);
      ctx.moveTo(cx + cell * 0.22, cy - cell * 0.18);
      ctx.lineTo(cx + cell * 0.04, cy - cell * 0.12);
      ctx.stroke();

      // Имя
      ctx.shadowBlur = 0;
      ctx.fillStyle = enraged ? "#ffcc00" : "#ff9988";
      ctx.font = `700 ${Math.max(8, cell * 0.22)}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(boss.name, cx, by + size + cell * 0.32);

    // ── NYX-7 (blink) ─────────────────────────────────────────
    } else if (boss.trait === "blink") {
      const hungerPct = Math.min(1, (boss.hunger || 0) / 10);
      // Цвет меняется от фиолетового к красному по мере насыщения
      const hue = Math.round(270 - hungerPct * 90); // 270 (фиолетовый) → 0 (красный)
      const baseColor = enraged ? "#cc00ff" : `hsl(${hue},85%,55%)`;
      const pulse = 1 + Math.sin(t * (enraged ? 18 : 6)) * (enraged ? 0.07 : 0.025);

      const pad = cell * 0.06;
      const w = (size - pad * 2) * pulse;
      const h = (size - pad * 2) * pulse;
      const ox = bx + (size - w) / 2;
      const oy = by + (size - h) / 2;

      ctx.shadowColor = baseColor;
      ctx.shadowBlur = enraged ? cell * 1.5 : (cell * 0.4 + hungerPct * cell * 0.6);

      // Тело — восьмиугольник (блинк-форма)
      ctx.fillStyle = baseColor;
      roundRect(ox, oy, w, h, cell * 0.28);
      ctx.fill();

      // Индикатор сытости — дуга вокруг тела
      if (!enraged && hungerPct > 0) {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `hsl(${hue},90%,65%)`;
        ctx.lineWidth = cell * 0.07;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        const r = size * 0.52;
        ctx.arc(bx + size / 2, by + size / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hungerPct);
        ctx.stroke();
        ctx.restore();
      }

      // "Призрачный хвост" — след при движении
      if (boss.prevX !== undefined && boss.prevX !== boss.x) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = baseColor;
        roundRect(
          offsetX + boss.prevX * cell + pad,
          offsetY + boss.prevY * cell + pad,
          size - pad * 2, size - pad * 2, cell * 0.28
        );
        ctx.fill();
        ctx.restore();
      }

      // Глаза — круглые, светятся
      const cx = bx + size / 2;
      const cy = by + size / 2;
      ctx.fillStyle = enraged ? "#ff44ff" : "#e0c0ff";
      ctx.beginPath();
      ctx.arc(cx - cell * 0.12, cy - cell * 0.06, cell * 0.09, 0, Math.PI * 2);
      ctx.arc(cx + cell * 0.12, cy - cell * 0.06, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#200030";
      ctx.beginPath();
      ctx.arc(cx - cell * 0.12, cy - cell * 0.06, cell * 0.045, 0, Math.PI * 2);
      ctx.arc(cx + cell * 0.12, cy - cell * 0.06, cell * 0.045, 0, Math.PI * 2);
      ctx.fill();

      // Имя + индикатор голода
      ctx.shadowBlur = 0;
      ctx.fillStyle = enraged ? "#ff88ff" : `hsl(${hue},80%,75%)`;
      ctx.font = `700 ${Math.max(8, cell * 0.22)}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(boss.name, cx, by + size + cell * 0.32);
      if (!enraged) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `500 ${Math.max(7, cell * 0.18)}px sans-serif`;
        ctx.fillText(`${boss.hunger || 0}/${10}`, cx, by + size + cell * 0.56);
      }

    // ── SCR4P (poison) ────────────────────────────────────────
    } else if (boss.trait === "poison") {
      const pulse = 1 + Math.sin(t * (enraged ? 10 : 5)) * (enraged ? 0.05 : 0.02);
      const pad = cell * 0.07;
      const w = (size - pad * 2) * pulse;
      const h = (size - pad * 2) * pulse;
      const ox = bx + (size - w) / 2;
      const oy = by + (size - h) / 2;

      ctx.shadowColor = enraged ? "#ff6600" : (angry ? "#ea580c" : "#886633");
      ctx.shadowBlur = enraged ? cell * 1.2 : (angry ? cell * 0.6 : cell * 0.2);

      ctx.fillStyle = enraged ? "#ff4400" : angry ? "#cc4400" : boss.color;
      roundRect(ox, oy, w, h, cell * 0.14);
      ctx.fill();

      // Ядовитые "капли" вокруг при ярости
      if (enraged) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(t * 12) * 0.3;
        ctx.fillStyle = "#44ff44";
        const dropR = cell * 0.08;
        const dropDist = size * 0.6;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 + t * 2;
          const dx = Math.cos(angle) * dropDist;
          const dy = Math.sin(angle) * dropDist;
          ctx.beginPath();
          ctx.arc(bx + size / 2 + dx, by + size / 2 + dy, dropR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Яд-след (статичный призрак предыдущей позиции)
      if (boss.prevX !== undefined && (boss.prevX !== boss.x || boss.prevY !== boss.y)) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = "#44ff44";
        roundRect(
          offsetX + boss.prevX * cell + pad,
          offsetY + boss.prevY * cell + pad,
          size - pad * 2, size - pad * 2, cell * 0.14
        );
        ctx.fill();
        ctx.restore();
      }

      // Глаза — маленькие, прищуренные
      const cx = bx + size / 2;
      const cy = by + size / 2;
      ctx.fillStyle = "#aaff44";
      ctx.beginPath();
      ctx.ellipse(cx - cell * 0.13, cy - cell * 0.06, cell * 0.09, cell * 0.05, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cell * 0.13, cy - cell * 0.06, cell * 0.09, cell * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // Имя
      ctx.shadowBlur = 0;
      ctx.fillStyle = enraged ? "#ffaa44" : "#cc8844";
      ctx.font = `700 ${Math.max(8, cell * 0.22)}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(boss.name, cx, by + size + cell * 0.32);
    }

    ctx.restore();
  }
}


function drawPlayers(view) {
  const { cell, offsetX, offsetY } = view;
  for (const player of state.players) {
    ctx.globalAlpha = player.alive ? 1 : 0.35;
    const isTagged = state.gameMode === "tag_time" && player.id === state.taggedPlayerId;

    // Интерполированная позиция головы для направления
    const { px: headPx, py: headPy } = getSegmentPos(player.id, 0, player.snake[0], cell, offsetX, offsetY);
    const neck = player.snake[1] || player.snake[0];
    const { px: neckPx, py: neckPy } = getSegmentPos(player.id, 1, neck, cell, offsetX, offsetY);
    const dirX = headPx - neckPx;
    const dirY = headPy - neckPy;
    // Нормализуем в -1/0/1 для совместимости с drawSnakeEyes
    const dirXn = dirX === 0 ? 0 : dirX > 0 ? 1 : -1;
    const dirYn = dirY === 0 ? 0 : dirY > 0 ? 1 : -1;

    const customTex = typeof CustomSkins !== "undefined" && CustomSkins.isBody(player.skin)
      ? CustomSkins.get(player.skin)
      : null;

    player.snake.forEach((part, index) => {
      // Получаем интерполированную позицию этого конкретного сегмента
      const { px, py } = getSegmentPos(player.id, index, part, cell, offsetX, offsetY);

      // Проверяем видимость по интерполированной позиции
      const gx = (px - offsetX) / cell;
      const gy = (py - offsetY) / cell;
      if (!isInCameraView(gx, gy, view, 0.5)) return;

      const bodyColor = player.rainbow ? `hsl(${(index * 40 + Date.now() / 20) % 360}, 80%, 60%)` : player.color;
      const heatGlow = (player.heat || 0) > 50;
      const segX = px + cell * 0.08;
      const segY = py + cell * 0.08;
      const segS = cell * 0.84;

      if (index === 0) {
        if (isTagged) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = cell * 0.1; roundRect(px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2); ctx.stroke(); }
        if (player.activeBonus === "ghost") ctx.globalAlpha = 0.6;
        if (heatGlow) {
          ctx.strokeStyle = player.color;
          ctx.lineWidth = cell * 0.06;
          roundRect(px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2);
          ctx.stroke();
        }
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
        drawSnakeEyes(px, py, cell, dirXn, dirYn);
        drawPlayerNameLabel(px, py, cell, player);
      }
    });
    ctx.globalAlpha = 1;

    // Шапка рисуется последней — поверх всех сегментов
    if (player.snakeHatEmoji || (typeof CustomSkins !== "undefined" && player.snakeHatId && CustomSkins.isHat(player.snakeHatId))) {
      const { px, py } = getSegmentPos(player.id, 0, player.snake[0], cell, offsetX, offsetY);
      ctx.globalAlpha = player.alive ? 1 : 0.35;
      drawSnakeCosmetics(px, py, cell, player);
      ctx.globalAlpha = 1;
    }
  }
}

function getPlayerNickFill(player) {
  if (player.nickColor) return player.nickColor;
  if (player.id === state.id) return "#3de88a";
  return "rgba(255,255,255,0.92)";
}

function drawPlayerNameLabel(x, y, cell, player) {
  if (!player.alive || !player.name) return;
  const cx = x + cell / 2;
  const cy = y + cell + cell * 0.06;
  const fontSize = Math.max(9, Math.min(13, cell * 0.24));
  const label = player.name.length > 14 ? `${player.name.slice(0, 13)}…` : player.name;
  ctx.save();
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = Math.max(2, fontSize * 0.18);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = getPlayerNickFill(player);
  ctx.strokeText(label, cx, cy);
  ctx.fillText(label, cx, cy);
  ctx.restore();
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

  const hatId = player.snakeHatId || null;
  const customHat = typeof CustomSkins !== "undefined" && hatId && CustomSkins.isHat(hatId)
    ? CustomSkins.get(hatId)
    : null;

  if (customHat) {
    const size = cell * 0.9;
    ctx.drawImage(customHat, cx - size / 2, cy - cell * 0.78, size, size);
    return;
  }

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