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
const bonusActive = document.querySelector("#bonusActive");
const bonusHud = document.querySelector("#bonusHud");
const bossHud = document.querySelector("#bossHud");
const bossLabel = document.querySelector("#bossLabel");
const playersEl = document.querySelector("#players");
const deathPanel = document.querySelector("#deathPanel");
const deathReason = document.querySelector("#deathReason");
const deathStats = document.querySelector("#deathStats");
const pausePanel = document.querySelector("#pausePanel");

const settings = SnakeStore.load();
if (!settings.name) {
  location.href = "/";
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
  grid: { width: 34, height: 22 },
  food: [],
  bonuses: [],
  players: [],
  boss: null,
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
  if (!direction || state.menuOpen || !state.joined) return;
  event.preventDefault();
  send({ type: "turn", direction });
});

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.menuOpen || !state.joined) return;
    send({ type: "turn", direction: button.dataset.dir });
  });
});

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
      state.boss = message.boss || null;
      state.gameMode = message.gameMode || "classic";
      state.taggedPlayerId = message.taggedPlayerId;
      const me = message.players.find((p) => p.id === state.id);
      updateHud(me, prevScore, prevCombo);
      renderPlayers();
      SnakeFX.updateTrails(state.players);
      if (state.boss?.phase === "enraged" && !state.bossRageSound) {
        state.bossRageSound = true;
        SnakeAudio.play("boss");
        SnakeFX.addShake(8);
      }
      if (state.boss?.phase !== "enraged") state.bossRageSound = false;
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

  if (state.boss) {
    const enraged = state.boss.phase === "enraged";
    bossHud.classList.toggle("hidden", !state.boss.angry && !enraged);
    bossLabel.textContent = enraged ? "ЯРОСТЬ!" : state.boss.angry ? "РЯДОМ!" : "ОХОТА";
    canvasStage.classList.toggle("bossRage", enraged);
  } else {
    bossHud.classList.add("hidden");
    canvasStage.classList.remove("bossRage");
  }

  if (state.joined && me) {
    if (me.alive) {
      state.wasAlive = true;
      deathPanel.classList.add("hidden");
    } else if (state.wasAlive) {
      state.wasAlive = false;
      deathReason.textContent = me.reason || "Змейка умерла";
      deathStats.innerHTML = `
        <span>Очки <b>${me.score}</b></span>
        <span>Макс. комбо <b>×${me.maxCombo || 0}</b></span>
        <span>Монеты <b>${me.coins || 0}</b></span>
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

function draw() {
  const ratio = window.devicePixelRatio || 1;
  const width = board.width / ratio;
  const height = board.height / ratio;
  const cell = Math.min(width / state.grid.width, height / state.grid.height);
  const offsetX = (width - cell * state.grid.width) / 2;
  const offsetY = (height - cell * state.grid.height) / 2;
  const shake = SnakeFX.getShakeOffset();

  ctx.save();
  ctx.translate(shake.x, shake.y);
  ctx.clearRect(-shake.x, -shake.y, width, height);
  drawBackground(width, height, cell, offsetX, offsetY);
  SnakeFX.drawTrails(ctx, cell, offsetX, offsetY);
  drawFood(cell, offsetX, offsetY);
  drawBonuses(cell, offsetX, offsetY);
  drawBoss(cell, offsetX, offsetY);
  drawPlayers(cell, offsetX, offsetY);
  drawParticles(cell, offsetX, offsetY);
  SnakeFX.drawFloaters(ctx, cell, offsetX, offsetY);
  ctx.restore();

  SnakeFX.drawConfetti(ctx, width, height);
  SnakeFX.drawCrt(width, height);
  requestAnimationFrame(draw);
}

function drawBackground(width, height, cell, offsetX, offsetY) {
  const enraged = state.boss?.phase === "enraged";
  const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.65);
  grad.addColorStop(0, enraged ? "#180808" : "#0c1218");
  grad.addColorStop(1, enraged ? "#080202" : "#040608");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const t = Date.now() / 1000;
  ctx.strokeStyle = enraged ? "rgba(255,59,46,0.07)" : "rgba(61, 232, 138, 0.04)";
  ctx.lineWidth = Math.max(1, cell * 0.03);
  for (let x = 0; x <= state.grid.width; x++) {
    const px = Math.round(offsetX + x * cell);
    ctx.beginPath();
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + state.grid.height * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= state.grid.height; y++) {
    const py = Math.round(offsetY + y * cell);
    ctx.beginPath();
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + state.grid.width * cell, py);
    ctx.stroke();
  }

  if (enraged) {
    ctx.fillStyle = `rgba(255,59,46,${0.03 + Math.sin(t * 6) * 0.02})`;
    ctx.fillRect(offsetX, offsetY, state.grid.width * cell, state.grid.height * cell);
  }
}

function drawFood(cell, offsetX, offsetY) {
  const t = Date.now() / 1000;
  for (const item of state.food) {
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

function drawBonuses(cell, offsetX, offsetY) {
  const t = Date.now() / 1000;
  for (const bonus of state.bonuses) {
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

function drawBoss(cell, offsetX, offsetY) {
  if (!state.boss) return;
  const bossSize = state.boss.size || 1;
  const x = offsetX + state.boss.x * cell;
  const y = offsetY + state.boss.y * cell;
  const size = bossSize * cell;
  const angry = state.boss.angry;
  const enraged = state.boss.phase === "enraged";
  const t = Date.now() / 1000;
  ctx.save();
  if (enraged) {
    ctx.shadowColor = "rgba(255,30,20,.95)";
    ctx.shadowBlur = cell * 1.1;
  } else if (angry) {
    ctx.shadowColor = "rgba(246,97,81,.8)";
    ctx.shadowBlur = cell * 0.7;
  }
  const pulse = 1 + Math.sin(t * 8) * (enraged ? 0.06 : 0.02);
  const pad = cell * 0.08;
  const w = (size - pad * 2) * pulse;
  const h = (size - pad * 2) * pulse;
  const ox = x + (size - w) / 2;
  const oy = y + (size - h) / 2;
  ctx.fillStyle = enraged ? "#ff1a0a" : angry ? "#ff3b2e" : "#f66151";
  roundRect(ox, oy, w, h, cell * 0.22);
  ctx.fill();
  const cx = x + size / 2, cy = y + size / 2;
  ctx.fillStyle = "#1a0a0a";
  ctx.beginPath();
  ctx.arc(cx - cell * 0.14, cy - cell * 0.05, cell * 0.09, 0, Math.PI * 2);
  ctx.arc(cx + cell * 0.14, cy - cell * 0.05, cell * 0.09, 0, Math.PI * 2);
  ctx.fill();
  if (enraged) {
    ctx.fillStyle = "#ff6b5a";
    ctx.font = `800 ${cell * 0.22}px Orbitron, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("VØIDR", cx, cy + cell * 0.35);
  }
  ctx.restore();
}

function drawPlayers(cell, offsetX, offsetY) {
  for (const player of state.players) {
    ctx.globalAlpha = player.alive ? 1 : 0.35;
    const isTagged = state.gameMode === "tag_time" && player.id === state.taggedPlayerId;
    const head = player.snake[0];
    const neck = player.snake[1] || head;
    const dirX = head.x - neck.x, dirY = head.y - neck.y;

    player.snake.forEach((part, index) => {
      const px = offsetX + part.x * cell;
      const py = offsetY + part.y * cell;
      const bodyColor = player.rainbow ? `hsl(${(index * 40 + Date.now() / 20) % 360}, 80%, 60%)` : player.color;
      const heatGlow = (player.heat || 0) > 50;
      if (index === 0) {
        ctx.fillStyle = player.headColor || "#fff";
        if (isTagged) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = cell * 0.1; roundRect(px + cell * 0.04, py + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2); ctx.stroke(); }
        if (player.activeBonus === "ghost") ctx.globalAlpha = 0.6;
        if (heatGlow) { ctx.shadowColor = player.color; ctx.shadowBlur = cell * 0.45; }
      } else {
        ctx.fillStyle = bodyColor;
        ctx.globalAlpha = player.alive ? (player.activeBonus === "ghost" ? 0.5 : 0.9) : 0.35;
      }
      roundRect(px + cell * 0.08, py + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.18);
      ctx.fill();
      if (index === 0) {
        ctx.globalAlpha = player.alive ? 1 : 0.35;
        ctx.fillStyle = bodyColor;
        roundRect(px + cell * 0.24, py + cell * 0.24, cell * 0.52, cell * 0.52, cell * 0.14);
        ctx.fill();
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

function drawParticles(cell, offsetX, offsetY) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
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
