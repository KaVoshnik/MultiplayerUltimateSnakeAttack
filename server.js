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

// --- СКИНЫ (цвет тела) + ШЛЯПЫ в едином каталоге ---
const SHOP_CATALOG = [
  { id: "default", name: "Классик", emoji: "🟢", price: 0, rarity: "common", category: "skin", color: "#33d17a", headColor: "#ffffff" },
  { id: "fire", name: "Огненная", emoji: "🔥", price: 50, rarity: "common", category: "skin", color: "#f66151", headColor: "#ffbe6f" },
  { id: "ocean", name: "Океан", emoji: "🌊", price: 50, rarity: "common", category: "skin", color: "#62a0ea", headColor: "#8ff0a4" },
  { id: "toxic", name: "Токсичная", emoji: "☢️", price: 40, rarity: "common", category: "skin", color: "#84cc16", headColor: "#ecfccb" },
  { id: "coral", name: "Коралл", emoji: "🪸", price: 45, rarity: "common", category: "skin", color: "#ff7f7f", headColor: "#ffe4e6" },
  { id: "ice", name: "Ледяная", emoji: "❄️", price: 75, rarity: "rare", category: "skin", color: "#67e8f9", headColor: "#ecfeff" },
  { id: "midnight", name: "Полночь", emoji: "🌑", price: 80, rarity: "rare", category: "skin", color: "#475569", headColor: "#cbd5e1" },
  { id: "neon", name: "Неон", emoji: "💛", price: 100, rarity: "rare", category: "skin", color: "#f9f06b", headColor: "#dc8add" },
  { id: "gold", name: "Золото", emoji: "✨", price: 90, rarity: "rare", category: "skin", color: "#ffd166", headColor: "#fff8e7" },
  { id: "candy", name: "Кэнди", emoji: "🍬", price: 120, rarity: "epic", category: "skin", color: "#f9a8d4", headColor: "#fce7f3" },
  { id: "void", name: "Пустота", emoji: "🕳️", price: 150, rarity: "epic", category: "skin", color: "#323a46", headColor: "#aab4c2" },
  { id: "plasma", name: "Плазма", emoji: "⚡", price: 180, rarity: "epic", category: "skin", color: "#e879f9", headColor: "#fae8ff" },
  { id: "shadow", name: "Тень", emoji: "🌚", price: 160, rarity: "epic", category: "skin", color: "#1e293b", headColor: "#94a3b8" },
  { id: "rainbow", name: "Радуга", emoji: "🌈", price: 300, rarity: "legendary", category: "skin", color: "rainbow", headColor: "#ffffff" },
  { id: "royal", name: "Королевская", emoji: "💜", price: 400, rarity: "legendary", category: "skin", color: "#7c3aed", headColor: "#ffd166" },
  { id: "lime", name: "Лайм", emoji: "🍋", price: 35, rarity: "common", category: "skin", color: "#a3e635", headColor: "#f7fee7" },
  { id: "crimson", name: "Багровая", emoji: "🩸", price: 55, rarity: "common", category: "skin", color: "#dc2626", headColor: "#fecaca" },
  { id: "azure", name: "Лазурь", emoji: "💎", price: 70, rarity: "rare", category: "skin", color: "#0ea5e9", headColor: "#e0f2fe" },
  { id: "ember", name: "Угли", emoji: "🌋", price: 110, rarity: "rare", category: "skin", color: "#ea580c", headColor: "#fdba74" },
  { id: "mint", name: "Мята", emoji: "🌿", price: 65, rarity: "common", category: "skin", color: "#2dd4bf", headColor: "#ccfbf1" },
  { id: "hat_top", name: "Цилиндр змеи", emoji: "🎩", price: 120, rarity: "epic", category: "snake_hat" },
  { id: "hat_cap", name: "Кепка змеи", emoji: "🧢", price: 20, rarity: "common", category: "snake_hat" },
  { id: "hat_beanie", name: "Вязаная шапка", emoji: "🧶", price: 30, rarity: "common", category: "snake_hat" },
  { id: "hat_straw", name: "Соломенная шляпа", emoji: "👒", price: 75, rarity: "rare", category: "snake_hat" },
  { id: "hat_grad", name: "Выпускная шапка", emoji: "🎓", price: 85, rarity: "rare", category: "snake_hat" },
  { id: "hat_hard", name: "Строительная каска", emoji: "⛑️", price: 45, rarity: "common", category: "snake_hat" },
  { id: "hat_party", name: "Праздничный колпак", emoji: "🎉", price: 130, rarity: "epic", category: "snake_hat" },
  { id: "hat_mushroom", name: "Грибная шляпка", emoji: "🍄", price: 95, rarity: "rare", category: "snake_hat" },
  { id: "hat_flame", name: "Огненная корона", emoji: "🔥", price: 160, rarity: "epic", category: "snake_hat" },
  { id: "hat_royal", name: "Королевская корона", emoji: "👸", price: 450, rarity: "legendary", category: "snake_hat" },
];

const AVATAR_PRESETS = [
  "😎", "🤠", "🧙‍♂️", "🦸‍♂️", "🧝‍♂️", "👾", "🤖", "👽", "🐍", "🐲",
  "🦊", "🐺", "🦁", "🐯", "🐼", "🐸", "🐙", "🦄", "🎃", "💀",
];

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };

function getSkinDef(id) {
  const item = SHOP_CATALOG.find((i) => i.id === id && i.category === "skin");
  if (!item) return getSkinDef("default");
  return { id: item.id, label: item.name, price: item.price, color: item.color, headColor: item.headColor, trailColor: item.color };
}

function ownsItem(entry, itemId) {
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return false;
  if (item.category === "skin" && item.price === 0) return true;
  return entry.inventory.includes(itemId);
}

const SHOP_SKINS = SHOP_CATALOG.filter((i) => i.category === "skin").map((s) => ({
  id: s.id, label: s.name, price: s.price, color: s.color, headColor: s.headColor, trailColor: s.color,
}));

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
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/leaderboard") { sendJson(res, getEnrichedLeaderboard()); return; }
  if (url.pathname === "/shop") { sendJson(res, { skins: SHOP_SKINS, catalog: SHOP_CATALOG, playerData: shopData }); return; }
  if (url.pathname === "/catalog") { sendJson(res, { catalog: SHOP_CATALOG, skins: SHOP_SKINS, avatars: AVATAR_PRESETS }); return; }
  if (url.pathname === "/profile") {
    const name = cleanName(url.searchParams.get("name") || "");
    sendJson(res, name ? getProfile(name) : { error: "no name" });
    return;
  }
  if (url.pathname === "/modes") { sendJson(res, { modes: MODES, difficulties: DIFFICULTIES }); return; }

  const requestPath = decodeURIComponent(url.pathname);
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
    type: "hello", id, grid: GRID, leaderboard: getEnrichedLeaderboard(),
    skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS,
    modes: MODES, difficulties: DIFFICULTIES,
    shopData: defaultShopEntry(),
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
  trackDeathStats(player);
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
    broadcast({ type: "leaderboard", leaderboard: getEnrichedLeaderboard() });
  }
}

function broadcastState() {
  broadcast({
    type: "state",
    grid: GRID,
    food,
    bonuses: bonuses.map((b) => ({ ...b, def: BONUS_TYPES[b.bonusType] })),
    players: [...players.values()].map((p) => {
      const cos = getPlayerCosmetics(p.name);
      return {
        id: p.id, name: p.name, color: p.color, headColor: p.headColor,
        snake: p.snake, alive: p.alive, score: p.score, coins: p.coins || 0,
        best: Math.max(p.best, bestForName(p.name)), reason: p.reason,
        activeBonus: p.activeBonus, bonusExpires: p.bonusExpires,
        difficulty: p.difficulty, skin: p.skin, rainbow: p.rainbow,
        isTagged: gameMode === "tag_time" && p.id === taggedPlayerId,
        avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji,
      };
    }),
    boss, leaderboard: getEnrichedLeaderboard(), gameMode, taggedPlayerId,
    shopMeta: { skins: SHOP_SKINS, catalog: SHOP_CATALOG },
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
    sendShopPayload(id, name);
    return;
  }

  if (message.type === "save_profile") {
    saveProfile(id, message);
    return;
  }

  if (message.type === "buy_item") {
    buyItem(id, message.itemId, message.name);
    return;
  }

  if (message.type === "equip_item") {
    equipItem(id, message.itemId, message.name);
    return;
  }

  if (message.type === "unequip_item") {
    unequipItem(id, message.itemId, message.name);
    return;
  }

  if (message.type === "join") {
    const name = cleanName(message.name);
    const difficulty = DIFFICULTIES[message.difficulty] ? message.difficulty : "normal";
    const mode = MODES[message.mode] ? message.mode : "classic";
    gameMode = mode;
    const prof = getProfile(name);
    const skin = getSkinDef(prof.activeSkin);
    prof.stats.games = (prof.stats.games || 0) + 1;
    prof.stats.sessionStart = Date.now();
    shopData[name] = prof;
    saveShop();
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

function sendShopPayload(clientId, name) {
  const entry = getProfile(name);
  send(clientId, { type: "shop_update", shopData: entry, skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS });
}

function buyItem(clientId, itemId, nameHint) {
  const name = resolveName(clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = getProfile(name);
  const player = players.get(clientId);
  const coins = player?.coins ?? entry.coins ?? 0;

  if (entry.inventory.includes(itemId)) {
    equipItem(clientId, itemId, name);
    return;
  }
  if (item.price === 0) {
    if (!entry.inventory.includes(itemId)) entry.inventory.push(itemId);
    shopData[name] = entry;
    equipItem(clientId, itemId, name);
    return;
  }
  if (coins < item.price) {
    send(clientId, { type: "notice", text: "Недостаточно монет!" });
    return;
  }
  if (player) player.coins = coins - item.price;
  entry.coins = coins - item.price;
  entry.inventory.push(itemId);
  shopData[name] = entry;
  saveShop();
  equipItem(clientId, itemId, name);
  send(clientId, { type: "notice", text: `Куплено: ${item.name}!` });
}

function equipItem(clientId, itemId, nameHint) {
  const name = resolveName(clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = getProfile(name);
  if (!ownsItem(entry, itemId)) {
    send(clientId, { type: "notice", text: "Сначала купи предмет!" });
    return;
  }

  const player = players.get(clientId);

  if (item.category === "skin") {
    entry.activeSkin = entry.activeSkin === itemId && itemId !== "default" ? "default" : itemId;
    if (player) applySkinToPlayer(player, getSkinDef(entry.activeSkin));
  } else if (item.category === "snake_hat") {
    entry.equipped.snakeHat = entry.equipped.snakeHat === itemId ? null : itemId;
    applyCosmeticsToPlayer(player, name);
  }

  shopData[name] = entry;
  saveShop();
  sendShopPayload(clientId, name);
  broadcastState();
}

function unequipItem(clientId, itemId, nameHint) {
  const name = resolveName(clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = getProfile(name);
  const player = players.get(clientId);

  if (item.category === "skin") {
    if (itemId !== "default") entry.activeSkin = "default";
    if (player) applySkinToPlayer(player, getSkinDef("default"));
  } else if (item.category === "snake_hat") {
    entry.equipped.snakeHat = null;
    applyCosmeticsToPlayer(player, name);
  }

  shopData[name] = entry;
  saveShop();
  sendShopPayload(clientId, name);
  broadcastState();
}

function saveProfile(clientId, message) {
  const oldName = resolveName(clientId, message.oldName || message.name);
  const newName = profileName(message.name);
  if (!newName) {
    send(clientId, { type: "notice", text: "Никнейм не может быть пустым!" });
    return;
  }
  const avatar = AVATAR_PRESETS.includes(message.avatar) ? message.avatar : "😎";
  let entry = getProfile(oldName || newName);
  entry.avatar = avatar;

  if (oldName && oldName !== newName) {
    const taken = Object.keys(shopData).some((k) => k.toLowerCase() === newName.toLowerCase() && k !== oldName);
    if (taken) {
      send(clientId, { type: "notice", text: "Это имя уже занято!" });
      return;
    }
    delete shopData[oldName];
    entry = { ...getProfile(oldName), avatar };
    shopClients.set(clientId, newName);
    const player = players.get(clientId);
    if (player) player.name = newName;
  }

  shopData[newName] = entry;
  saveShop();
  send(clientId, { type: "profile_saved", shopData: entry, name: newName });
  sendShopPayload(clientId, newName);
}

function resolveName(clientId, hint) {
  return profileName(hint) || players.get(clientId)?.name || shopClients.get(clientId) || null;
}

function profileName(name) {
  const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return v || null;
}

function getProfile(name) {
  if (!name) return defaultShopEntry();
  const key = Object.keys(shopData).find((k) => k.toLowerCase() === name.toLowerCase()) || name;
  return normalizeProfile(shopData[key] || defaultShopEntry());
}

function normalizeProfile(raw) {
  const entry = {
    coins: raw.coins || 0,
    unlockedSkins: raw.unlockedSkins || ["default"],
    activeSkin: raw.activeSkin || "default",
    avatar: AVATAR_PRESETS.includes(raw.avatar) ? raw.avatar : "😎",
    inventory: Array.isArray(raw.inventory) ? [...raw.inventory] : [],
    equipped: { snakeHat: raw.equipped?.snakeHat || null },
    stats: {
      games: raw.stats?.games || 0,
      wins: raw.stats?.wins || 0,
      losses: raw.stats?.losses || 0,
      best: raw.stats?.best || 0,
      playTimeMs: raw.stats?.playTimeMs || 0,
      sessionStart: raw.stats?.sessionStart || null,
    },
  };
  for (const id of entry.unlockedSkins) {
    if (!entry.inventory.includes(id)) entry.inventory.push(id);
  }
  if (!entry.inventory.includes("default")) entry.inventory.unshift("default");
  if (!SHOP_CATALOG.find((i) => i.id === entry.activeSkin && i.category === "skin")) {
    entry.activeSkin = "default";
  }
  return entry;
}

function getPlayerCosmetics(name) {
  const entry = getProfile(name);
  const snakeHatEmoji = entry.equipped.snakeHat
    ? SHOP_CATALOG.find((i) => i.id === entry.equipped.snakeHat)?.emoji || null
    : null;
  return { avatar: entry.avatar, snakeHatEmoji };
}

function applyCosmeticsToPlayer(player, name) {
  if (!player) return;
  const cos = getPlayerCosmetics(name);
  player.avatar = cos.avatar;
  player.snakeHatEmoji = cos.snakeHatEmoji;
}

function trackDeathStats(player) {
  const entry = getProfile(player.name);
  entry.stats.losses = (entry.stats.losses || 0) + 1;
  entry.stats.best = Math.max(entry.stats.best || 0, player.score);
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = Date.now();
  }
  const topScore = Math.max(...[...players.values()].filter((p) => p.alive).map((p) => p.score), player.score);
  if (player.score > 0 && player.score >= topScore) entry.stats.wins = (entry.stats.wins || 0) + 1;
  shopData[player.name] = entry;
  saveShop();
}

function trackDisconnectStats(player) {
  const entry = getProfile(player.name);
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  shopData[player.name] = entry;
  saveShop();
}

function getEnrichedLeaderboard() {
  return leaderboard.map((e, index) => {
    const prof = getProfile(e.name);
    return {
      ...e,
      rank: index + 1,
      avatar: prof.avatar,
      wins: prof.stats?.wins || 0,
      best: Math.max(e.score, prof.stats?.best || 0),
    };
  });
}

function buySkin(playerId, skinId) {
  buyItem(playerId, skinId);
}

function equipSkin(playerId, skinId) {
  equipItem(playerId, skinId);
}

function applySkinToPlayer(player, skin) {
  player.skin = skin.id;
  player.color = skin.color !== "rainbow" ? skin.color : COLORS[(Number(player.id) - 1) % COLORS.length];
  player.headColor = skin.headColor || "#ffffff";
  player.rainbow = skin.color === "rainbow";
}

function savePlayerCoins(player) {
  const entry = getProfile(player.name);
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
  const shopEntry = getProfile(name);
  const cos = getPlayerCosmetics(name);
  const player = {
    id, name, difficulty,
    color: skin.color !== "rainbow" ? skin.color : COLORS[(Number(id) - 1) % COLORS.length],
    headColor: skin.headColor || "#ffffff",
    skin: skin.id,
    rainbow: skin.color === "rainbow",
    snake, direction, nextDirection: direction,
    alive: true, score: 0, coins: shopEntry.coins || 0,
    best: bestForName(name), deaths: 0, reason: "",
    activeBonus: null, bonusExpires: null,
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji,
  };
  return player;
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
  if (player) {
    trackDisconnectStats(player);
    recordScore(player);
    players.delete(id);
    broadcastState();
  }
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

function defaultShopEntry() {
  return normalizeProfile({ coins: 0, unlockedSkins: ["default"], activeSkin: "default" });
}

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