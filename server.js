const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");
const SHOP_FILE = path.join(__dirname, "shop.json");

const GRID = { width: 34, height: 22 };
const FOOD_TARGET = 32;
const MIN_GOOD_FOOD = 12;
const BOSS_MOVE_EVERY = 9;
const BOSS_CHASE_RANGE = 14;
const BOSS_RANDOM_MOVE_CHANCE = 0.38;
const MAX_LEADERS = 20;

const FOOD_TYPES = {
  apple: { good: true, points: 6, label: "яблоко" },
  cherry: { good: true, points: 7, label: "вишню" },
  grape: { good: true, points: 6, label: "виноград" },
  rotten: { good: false, label: "гниль" },
  spider: { good: false, label: "паука" },
  mushroom: { good: false, label: "ядовитый гриб" },
  bone: { good: false, label: "кость" },
};

const GOOD_FOOD_KINDS = ["apple", "cherry", "grape"];
const BAD_FOOD_KINDS = ["rotten", "spider", "mushroom", "bone"];

// --- DIFFICULTIES ---
const DIFFICULTIES = {
  easy: { label: "Easy", tickMs: 160, wallDeath: false, badFoodRatio: 0.22 },
  normal: { label: "Normal", tickMs: 115, wallDeath: true, badFoodRatio: 0.32 },
  hard: { label: "Hard", tickMs: 80, wallDeath: true, badFoodRatio: 0.45 },
  insane: { label: "Insane", tickMs: 50, wallDeath: true, badFoodRatio: 0.58 },
};

// --- GAME MODES ---
const MODES = {
  classic: { label: "Classic" },
  tag_time: { label: "Tag Time" }, // один игрок - "тэгер", другие убегают
};

// --- BONUSES ---
// Бонусы появляются на поле как особые клетки
const BONUS_TYPES = {
  shield: { label: "SH", duration: 5000, color: "#62a0ea", desc: "защита от яда" },
  speed_up: { label: "SP", duration: 4000, color: "#f9f06b", desc: "ускорение" },
  slow_down: { label: "SL", duration: 5000, color: "#dc8add", desc: "замедление" },
  double: { label: "x2", duration: 6000, color: "#33d17a", desc: "двойные очки" },
  ghost: { label: "GH", duration: 4000, color: "#8ff0a4", desc: "призрак" },
};

// --- SHOP SKINS ---
const SHOP_SKINS = [
  { id: "default", label: "Default", price: 0, color: "#33d17a", headColor: "#ffffff", trailColor: "#33d17a" },
  { id: "fire", label: "Fire", price: 50, color: "#f66151", headColor: "#ffbe6f", trailColor: "#f66151" },
  { id: "ocean", label: "Ocean", price: 50, color: "#62a0ea", headColor: "#8ff0a4", trailColor: "#62a0ea" },
  { id: "neon", label: "Neon", price: 100, color: "#f9f06b", headColor: "#dc8add", trailColor: "#f9f06b" },
  { id: "void", label: "Void", price: 150, color: "#323a46", headColor: "#aab4c2", trailColor: "#323a46" },
  { id: "rainbow", label: "Rainbow", price: 300, color: "rainbow", headColor: "#ffffff", trailColor: "rainbow" },
];

const COLORS = ["#33d17a", "#62a0ea", "#ffbe6f", "#dc8add", "#f66151", "#8ff0a4", "#99c1f1", "#f9f06b"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

let nextClientId = 1;
const sockets = new Map();
const players = new Map();
const food = [];
const bonuses = []; // активные бонус-клетки на поле
const boss = createBoss();
let leaderboard = loadLeaderboard();
let shopData = loadShop(); // { playerName -> { coins, unlockedSkins, activeSkin } }
const shopClients = new Map(); // socket id -> player name (shop-only sessions)
let tickCount = 0;
let gameMode = "classic";
let taggedPlayerId = null; // для Tag Time

// Тик-интервалы по сложности (отдельный тик для каждого игрока не делаем — берём минимальный)
let currentTickMs = DIFFICULTIES.normal.tickMs;
let tickInterval = null;

function restartTickInterval() {
  if (tickInterval) clearInterval(tickInterval);
  // Найти минимальный тик среди живых игроков
  let minTick = DIFFICULTIES.normal.tickMs;
  for (const p of players.values()) {
    const diff = DIFFICULTIES[p.difficulty] || DIFFICULTIES.normal;
    if (p.alive && diff.tickMs < minTick) minTick = diff.tickMs;
  }
  currentTickMs = minTick;
  tickInterval = setInterval(tick, currentTickMs);
}

const server = http.createServer((req, res) => {
  if (req.url === "/leaderboard") { sendJson(res, leaderboard); return; }
  if (req.url === "/shop") { sendJson(res, { skins: SHOP_SKINS, playerData: shopData }); return; }
  if (req.url === "/modes") { sendJson(res, { modes: MODES, difficulties: DIFFICULTIES }); return; }

  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }

  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") { socket.destroy(); return; }

  const accept = crypto.createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = String(nextClientId++);
  sockets.set(id, socket);
  socket.on("data", (chunk) => readFrames(id, chunk));
  socket.on("close", () => removeClient(id));
  socket.on("error", () => removeClient(id));
  send(id, {
    type: "hello", id, grid: GRID, leaderboard,
    skins: SHOP_SKINS, modes: MODES, difficulties: DIFFICULTIES,
    shopData: shopData[id] || defaultShopEntry(),
  });
});

server.listen(PORT, HOST, () => {
  food.length = 0;
  fillFood();
  tickInterval = setInterval(tick, DIFFICULTIES.normal.tickMs);
  setInterval(broadcastState, 250);
  setInterval(spawnBonuses, 8000); // каждые 8 сек новый бонус
  console.log(`THE ULTIMATE MULTIPLAYER SNAKE ATTACK is running at http://localhost:${PORT}`);
  for (const address of getLanAddresses()) console.log(`LAN: http://${address}:${PORT}`);
});

// ============================================================
// GAME LOGIC
// ============================================================

function tick() {
  if (players.size === 0) return;
  tickCount += 1;
  fillFood();
  if (tickCount % BOSS_MOVE_EVERY === 0) moveBoss();
  tickBonusEffects();

  const occupied = new Map();
  for (const player of players.values()) {
    if (!player.alive) continue;
    for (const part of player.snake) occupied.set(pointKey(part), player.id);
  }

  const planned = new Map();
  const targetCounts = new Map();
  for (const player of players.values()) {
    if (!player.alive) continue;
    // Speed up / slow down bonus
    if (player.activeBonus === "slow_down" && tickCount % 2 === 0) continue;
    player.direction = player.nextDirection;
    const head = player.snake[0];
    const nextHead = { x: head.x + player.direction.x, y: head.y + player.direction.y };
    planned.set(player.id, nextHead);
    const key = pointKey(nextHead);
    targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
  }

  for (const player of players.values()) {
    if (!player.alive || !planned.has(player.id)) continue;
    const nextHead = planned.get(player.id);
    const key = pointKey(nextHead);
    const diff = DIFFICULTIES[player.difficulty] || DIFFICULTIES.normal;

    // Стена
    if (!insideGrid(nextHead)) {
      if (diff.wallDeath) { killPlayer(player, "Врезался в стену"); continue; }
      else {
        // Easy: проходит сквозь стену
        nextHead.x = (nextHead.x + GRID.width) % GRID.width;
        nextHead.y = (nextHead.y + GRID.height) % GRID.height;
      }
    }

    // Лоб в лоб
    if (targetCounts.get(key) > 1) { killPlayer(player, "Столкновение лоб в лоб"); continue; }

    // Босс
    if (bossOccupies(nextHead)) { killPlayer(player, "Босс поймал змейку"); continue; }

    // Другая змейка (ghost бонус позволяет проходить сквозь)
    if (player.activeBonus !== "ghost" && occupied.has(key)) {
      if (gameMode === "tag_time" && player.id === taggedPlayerId && occupied.get(key) !== player.id) {
        const hitId = occupied.get(key);
        taggedPlayerId = hitId;
        send(player.id, { type: "tagged", tagger: true });
        if (sockets.has(hitId)) send(hitId, { type: "tagged", tagger: false });
      } else {
        killPlayer(player, "Столкнулся со змейкой");
        continue;
      }
    }

    const eatenBonusIdx = bonuses.findIndex((b) => b.x === nextHead.x && b.y === nextHead.y);
    const eatenBonus = eatenBonusIdx >= 0 ? bonuses[eatenBonusIdx] : null;
    if (eatenBonus) {
      bonuses.splice(eatenBonusIdx, 1);
      activateBonus(player, eatenBonus.bonusType);
    }

    const eatenIdx = food.findIndex((item) => item.x === nextHead.x && item.y === nextHead.y);
    const eaten = eatenIdx >= 0 ? food[eatenIdx] : null;
    player.snake.unshift(nextHead);

    if (eaten) {
      food.splice(eatenIdx, 1);
      if (eaten.good) {
        const mult = player.activeBonus === "double" ? 2 : 1;
        player.score += eaten.points * mult;
        player.coins = (player.coins || 0) + eaten.points;
        player.best = Math.max(player.best, player.score);
        savePlayerCoins(player);
      } else if (player.activeBonus === "shield") {
        player.activeBonus = null;
        broadcast({ type: "notice", text: `${player.name}: щит поглотил ${FOOD_TYPES[eaten.kind]?.label || "яд"}!` });
      } else {
        killPlayer(player, `Съел ${FOOD_TYPES[eaten.kind]?.label || "яд"}`);
      }
    } else {
      player.snake.pop();
    }
  }

  fillFood();
  broadcastState();
}

function activateBonus(player, bonusType) {
  const def = BONUS_TYPES[bonusType];
  if (!def) return;
  player.activeBonus = bonusType;
  player.bonusExpires = Date.now() + def.duration;
  broadcast({ type: "notice", text: `${player.name} получил бонус ${def.label} ${def.desc}!` });
}

function tickBonusEffects() {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.activeBonus && player.bonusExpires && now > player.bonusExpires) {
      player.activeBonus = null;
      player.bonusExpires = null;
    }
  }
}

function spawnBonuses() {
  if (players.size === 0) return;
  if (bonuses.length >= 3) return; // максимум 3 бонуса одновременно
  const point = randomEmptyPoint();
  if (!point) return;
  const types = Object.keys(BONUS_TYPES);
  const bonusType = types[Math.floor(Math.random() * types.length)];
  bonuses.push({ ...point, bonusType, spawnedAt: Date.now() });
  // Бонус исчезает через 15 сек если никто не взял
  setTimeout(() => {
    const idx = bonuses.findIndex((b) => b.x === point.x && b.y === point.y);
    if (idx >= 0) bonuses.splice(idx, 1);
  }, 15000);
}

function killPlayer(player, reason) {
  savePlayerCoins(player);
  player.alive = false;
  player.deaths += 1;
  player.reason = reason;
  player.activeBonus = null;
  player.bonusExpires = null;
  recordScore(player);
}

function recordScore(player) {
  if (!player || player.score <= 0) return;
  const existing = leaderboard.find((e) => e.name.toLowerCase() === player.name.toLowerCase());
  if (!existing || player.score > existing.score) {
    if (existing) { existing.score = player.score; existing.date = new Date().toISOString(); existing.difficulty = player.difficulty; }
    else leaderboard.push({ name: player.name, score: player.score, date: new Date().toISOString(), difficulty: player.difficulty });
    leaderboard.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    leaderboard = leaderboard.slice(0, MAX_LEADERS);
    saveLeaderboard();
    broadcast({ type: "leaderboard", leaderboard });
  }
}

function broadcastState() {
  broadcast({
    type: "state",
    grid: GRID,
    food,
    bonuses: bonuses.map((b) => ({ ...b, def: BONUS_TYPES[b.bonusType] })),
    players: [...players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, headColor: p.headColor,
      snake: p.snake, alive: p.alive, score: p.score, coins: p.coins || 0,
      best: Math.max(p.best, bestForName(p.name)), reason: p.reason,
      activeBonus: p.activeBonus, bonusExpires: p.bonusExpires,
      difficulty: p.difficulty, skin: p.skin, rainbow: p.rainbow,
      isTagged: gameMode === "tag_time" && p.id === taggedPlayerId,
    })),
    boss, leaderboard, gameMode, taggedPlayerId,
    shopMeta: { skins: SHOP_SKINS },
  });
}

// ============================================================
// BOSS
// ============================================================

function createBoss() {
  return {
    x: 2,
    y: 2,
    size: 1,
    color: "#f66151",
    name: "BOSS",
    pulse: 0,
    angry: false,
    moveCooldown: 0,
  };
}

function moveBoss() {
  if (boss.moveCooldown > 0) {
    boss.moveCooldown -= 1;
    boss.pulse = (boss.pulse + 1) % 1000;
    return;
  }

  const alive = [...players.values()].filter((p) => p.alive);
  const target = alive.sort((a, b) => distanceToBoss(a.snake[0]) - distanceToBoss(b.snake[0]))[0];
  const dist = target ? distanceToBoss(target.snake[0]) : 999;
  boss.angry = dist <= 5;

  let nextMove = null;
  if (target && dist <= BOSS_CHASE_RANGE && Math.random() > BOSS_RANDOM_MOVE_CHANCE) {
    const moves = bossMovesToward(target.snake[0]);
    nextMove = moves.find((m) => bossCanMove(m));
  } else {
    const wander = shuffledDirs().find((m) => bossCanMove(m));
    nextMove = wander;
  }

  if (nextMove) boss.x += nextMove.x; boss.y += nextMove.y;
  removeFoodUnderBoss();
  boss.pulse = (boss.pulse + 1) % 1000;

  for (const player of alive) {
    const head = player.snake[0];
    if (bossOccupies(head)) {
      killPlayer(player, "Босс схватил за голову");
      boss.moveCooldown = 6;
    }
  }
}

function bossMovesToward(point) {
  const dx = point.x - boss.x;
  const dy = point.y - boss.y;
  const h = dx === 0 ? [] : [{ x: Math.sign(dx), y: 0 }];
  const v = dy === 0 ? [] : [{ x: 0, y: Math.sign(dy) }];
  return Math.abs(dx) > Math.abs(dy) ? [...h, ...v, ...shuffledDirs()] : [...v, ...h, ...shuffledDirs()];
}

function bossCanMove(move) {
  const next = { x: boss.x + move.x, y: boss.y + move.y };
  return next.x >= 0 && next.y >= 0 && next.x + boss.size <= GRID.width && next.y + boss.size <= GRID.height;
}

function distanceToBoss(point) { return Math.abs(point.x - boss.x) + Math.abs(point.y - boss.y); }
function bossOccupies(point) { return point.x >= boss.x && point.x < boss.x + boss.size && point.y >= boss.y && point.y < boss.y + boss.size; }
function removeFoodUnderBoss() { for (let i = food.length - 1; i >= 0; i--) { if (bossOccupies(food[i])) food.splice(i, 1); } }

// ============================================================
// FOOD
// ============================================================

function fillFood() {
  for (let i = food.length - 1; i >= 0; i--) {
    if (!food[i].kind) {
      const pt = { x: food[i].x, y: food[i].y };
      if (food[i].good === true || food[i].value === 6 || food[i].value === 7) {
        food[i] = createGoodFood(pt);
      } else if (food[i].good === false || (food[i].value !== undefined && food[i].value !== 6 && food[i].value !== 7)) {
        food[i] = createBadFood(pt);
      } else {
        food.splice(i, 1);
      }
    }
  }

  const diff = getAverageBadFoodRatio();
  while (food.filter((i) => i.good).length < MIN_GOOD_FOOD) {
    const point = randomEmptyPoint();
    if (!point) return;
    food.push(createGoodFood(point));
  }
  while (food.length < FOOD_TARGET) {
    const point = randomEmptyPoint();
    if (!point) return;
    food.push(Math.random() < diff ? createBadFood(point) : createGoodFood(point));
  }
}

function createGoodFood(point) {
  const kind = GOOD_FOOD_KINDS[Math.floor(Math.random() * GOOD_FOOD_KINDS.length)];
  return { ...point, kind, good: true, points: FOOD_TYPES[kind].points };
}

function createBadFood(point) {
  const kind = BAD_FOOD_KINDS[Math.floor(Math.random() * BAD_FOOD_KINDS.length)];
  return { ...point, kind, good: false, points: 0 };
}

function getAverageBadFoodRatio() {
  const alive = [...players.values()].filter((p) => p.alive);
  if (alive.length === 0) return DIFFICULTIES.normal.badFoodRatio;
  const ratios = alive.map((p) => (DIFFICULTIES[p.difficulty] || DIFFICULTIES.normal).badFoodRatio);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

// ============================================================
// PLAYER / MESSAGE HANDLING
// ============================================================

function handleMessage(id, message) {
  if (message.type === "shop_connect") {
    const name = cleanName(message.name);
    shopClients.set(id, name);
    const entry = shopData[name] || defaultShopEntry();
    send(id, { type: "shop_update", shopData: entry, skins: SHOP_SKINS });
    return;
  }

  if (message.type === "join") {
    const name = cleanName(message.name);
    const difficulty = DIFFICULTIES[message.difficulty] ? message.difficulty : "normal";
    const mode = MODES[message.mode] ? message.mode : "classic";
    gameMode = mode;
    const skin = SHOP_SKINS.find((s) => s.id === message.skin) || SHOP_SKINS[0];
    players.set(id, createPlayer(id, name, difficulty, skin));
    if (mode === "tag_time" && !taggedPlayerId) taggedPlayerId = id; // первый — тэгер
    restartTickInterval();
    broadcastState();
    return;
  }

  if (message.type === "buy_skin") {
    buySkin(id, message.skinId);
    return;
  }

  if (message.type === "equip_skin") {
    equipSkin(id, message.skinId);
    return;
  }

  const player = players.get(id);
  if (!player) return;

  if (message.type === "turn") {
    const next = directionFromKey(message.direction);
    if (next && !isOpposite(player.direction, next)) player.nextDirection = next;
  }

  if (message.type === "restart") {
    recordScore(player);
    const skin = SHOP_SKINS.find((s) => s.id === player.skin) || SHOP_SKINS[0];
    players.set(id, createPlayer(id, player.name, player.difficulty, skin));
    broadcastState();
  }

  if (message.type === "change_difficulty") {
    if (DIFFICULTIES[message.difficulty]) {
      player.difficulty = message.difficulty;
      restartTickInterval();
    }
  }
}

function buySkin(playerId, skinId) {
  const name = players.get(playerId)?.name || shopClients.get(playerId);
  if (!name) return;
  const player = players.get(playerId);
  const skin = SHOP_SKINS.find((s) => s.id === skinId);
  if (!skin) return;
  const entry = shopData[name] || defaultShopEntry();
  const coins = player?.coins ?? entry.coins ?? 0;
  if (skin.price > 0 && entry.unlockedSkins.includes(skinId)) {
    equipSkin(playerId, skinId);
    return;
  }
  if (coins < skin.price) { send(playerId, { type: "notice", text: "Недостаточно монет!" }); return; }
  if (player) player.coins = coins - skin.price;
  entry.coins = coins - skin.price;
  if (!entry.unlockedSkins.includes(skinId)) entry.unlockedSkins.push(skinId);
  entry.activeSkin = skinId;
  shopData[name] = entry;
  if (player) applySkinToPlayer(player, skin);
  saveShop();
  send(playerId, { type: "shop_update", shopData: entry, skins: SHOP_SKINS });
  broadcastState();
}

function equipSkin(playerId, skinId) {
  const name = players.get(playerId)?.name || shopClients.get(playerId);
  if (!name) return;
  const player = players.get(playerId);
  const skin = SHOP_SKINS.find((s) => s.id === skinId);
  if (!skin) return;
  const entry = shopData[name] || defaultShopEntry();
  if (skin.price > 0 && !entry.unlockedSkins.includes(skinId)) {
    send(playerId, { type: "notice", text: "Сначала купи скин!" });
    return;
  }
  entry.activeSkin = skinId;
  shopData[name] = entry;
  if (player) applySkinToPlayer(player, skin);
  saveShop();
  send(playerId, { type: "shop_update", shopData: entry, skins: SHOP_SKINS });
  broadcastState();
}

function applySkinToPlayer(player, skin) {
  player.skin = skin.id;
  player.color = skin.color !== "rainbow" ? skin.color : COLORS[(Number(player.id) - 1) % COLORS.length];
  player.headColor = skin.headColor || "#ffffff";
  player.rainbow = skin.color === "rainbow";
}

function savePlayerCoins(player) {
  const entry = shopData[player.name] || defaultShopEntry();
  entry.coins = player.coins;
  shopData[player.name] = entry;
  saveShop();
}

function createPlayer(id, name, difficulty, skin) {
  const direction = { x: 1, y: 0 };
  const head = findSpawnPoint();
  const snake = [head];
  const tailDir = { x: -direction.x, y: -direction.y };
  for (let i = 1; i < 4; i++) snake.push(wrapPoint({ x: head.x + tailDir.x * i, y: head.y + tailDir.y * i }));
  const shopEntry = shopData[name] || defaultShopEntry();
  return {
    id, name, difficulty,
    color: skin.color !== "rainbow" ? skin.color : COLORS[(Number(id) - 1) % COLORS.length],
    headColor: skin.headColor || "#ffffff",
    skin: skin.id,
    rainbow: skin.color === "rainbow",
    snake, direction, nextDirection: direction,
    alive: true, score: 0, coins: shopEntry.coins || 0,
    best: bestForName(name), deaths: 0, reason: "",
    activeBonus: null, bonusExpires: null,
  };
}

// ============================================================
// WEBSOCKET
// ============================================================

function readFrames(id, buffer) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    if (length === 126) { if (offset + 2 > buffer.length) return; length = buffer.readUInt16BE(offset); offset += 2; }
    else if (length === 127) { if (offset + 8 > buffer.length) return; const h = buffer.readUInt32BE(offset); const l = buffer.readUInt32BE(offset + 4); length = h * 2 ** 32 + l; offset += 8; }
    let mask;
    if (masked) { if (offset + 4 > buffer.length) return; mask = buffer.subarray(offset, offset + 4); offset += 4; }
    if (offset + length > buffer.length) return;
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    if (opcode === 8) { removeClient(id); return; }
    if (opcode === 1) {
      try { handleMessage(id, JSON.parse(payload.toString("utf8"))); }
      catch { send(id, { type: "notice", text: "Ошибка чтения сообщения." }); }
    }
  }
}

function makeFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  if (length < 65536) { const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(length, 2); return Buffer.concat([h, payload]); }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(length, 6); return Buffer.concat([h, payload]);
}

function send(id, payload) {
  const socket = sockets.get(id);
  if (!socket || socket.destroyed) return;
  try { socket.write(makeFrame(JSON.stringify(payload))); } catch { removeClient(id); }
}

function broadcast(payload) { for (const id of sockets.keys()) send(id, payload); }

function removeClient(id) {
  sockets.delete(id);
  shopClients.delete(id);
  const player = players.get(id);
  if (player) { recordScore(player); players.delete(id); broadcastState(); }
}

// ============================================================
// PERSISTENCE
// ============================================================

function loadLeaderboard() {
  try { const p = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8")); return Array.isArray(p) ? p.slice(0, MAX_LEADERS) : []; }
  catch { return []; }
}

function saveLeaderboard() { fs.writeFile(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), () => { }); }

function loadShop() {
  try { return JSON.parse(fs.readFileSync(SHOP_FILE, "utf8")) || {}; }
  catch { return {}; }
}

function saveShop() { fs.writeFile(SHOP_FILE, JSON.stringify(shopData, null, 2), () => { }); }

function defaultShopEntry() { return { coins: 0, unlockedSkins: ["default"], activeSkin: "default" }; }

// ============================================================
// UTILS
// ============================================================

function randomEmptyPoint() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const point = { x: Math.floor(Math.random() * GRID.width), y: Math.floor(Math.random() * GRID.height) };
    if (isEmpty(point)) return point;
  }
  return null;
}

function findSpawnPoint() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const point = { x: 7 + Math.floor(Math.random() * (GRID.width - 16)), y: 7 + Math.floor(Math.random() * (GRID.height - 14)) };
    if (isEmpty(point)) return point;
  }
  return { x: Math.floor(GRID.width / 2), y: Math.floor(GRID.height / 2) };
}

function isEmpty(point) {
  if (bossOccupies(point)) return false;
  if (food.some((i) => i.x === point.x && i.y === point.y)) return false;
  if (bonuses.some((b) => b.x === point.x && b.y === point.y)) return false;
  for (const player of players.values()) if (player.snake.some((p) => p.x === point.x && p.y === point.y)) return false;
  return true;
}

function insideGrid(point) { return point.x >= 0 && point.x < GRID.width && point.y >= 0 && point.y < GRID.height; }
function wrapPoint(point) { return { x: (point.x + GRID.width) % GRID.width, y: (point.y + GRID.height) % GRID.height }; }
function pointKey(point) { return `${point.x}:${point.y}`; }
function cleanName(name) { const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 18); return v || `Игрок ${nextClientId - 1}`; }
function directionFromKey(d) { return ({ up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[d] || null; }
function isOpposite(a, b) { return a.x + b.x === 0 && a.y + b.y === 0; }
function shuffledDirs() { return [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].sort(() => Math.random() - 0.5); }
function bestForName(name) { return leaderboard.find((e) => e.name.toLowerCase() === name.toLowerCase())?.score || 0; }
function getLanAddresses() { return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address); }
function sendJson(res, payload) { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(payload)); }