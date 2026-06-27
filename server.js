const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const db = require("./db");
const auth = require("./auth");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const GRID = { width: 210, height: 140 };
const FOOD_TARGET = 200;
const MIN_GOOD_FOOD = 70;
const SNAKE_SPAWN_LEN = 4;
const SPAWN_MARGIN = 18;
const SPAWN_CLEAR_RADIUS = 5;
const BAD_FOOD_HEAD_BUFFER = 3;
const BOSS_MOVE_EVERY = 6;
const BOSS_CHASE_RANGE = 22;
const BOSS_RANDOM_MOVE_CHANCE = 0.24;
const BOSS_HUNT_RANGE = 7;
const BOSS_SPAWN_BUFFER = 14;
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
  speed_up: { label: "SP", duration: 4000, color: "#f9f06b", desc: "оверклок +30% очков" },
  slow_down: { label: "SL", duration: 5000, color: "#dc8add", desc: "замедление" },
  double: { label: "x2", duration: 6000, color: "#33d17a", desc: "двойные очки" },
  ghost: { label: "GH", duration: 4000, color: "#8ff0a4", desc: "призрак" },
};

const SPAWN_FREEZE_MS = 1000;

// --- СКИНЫ (цвет тела) + ШЛЯПЫ в едином каталоге ---
const SHOP_CATALOG = [
  { id: "default", name: "Классик", emoji: "🟢", price: 0, rarity: "common", category: "skin", color: "#33d17a", headColor: "#ffffff" },
  { id: "fire", name: "Огненная", emoji: "🔥", price: 150, rarity: "common", category: "skin", color: "#f66151", headColor: "#ffbe6f" },
  { id: "ocean", name: "Океан", emoji: "🌊", price: 150, rarity: "common", category: "skin", color: "#62a0ea", headColor: "#8ff0a4" },
  { id: "toxic", name: "Токсичная", emoji: "☢️", price: 120, rarity: "common", category: "skin", color: "#84cc16", headColor: "#ecfccb" },
  { id: "coral", name: "Коралл", emoji: "🪸", price: 140, rarity: "common", category: "skin", color: "#ff7f7f", headColor: "#ffe4e6" },
  { id: "ice", name: "Ледяная", emoji: "❄️", price: 240, rarity: "rare", category: "skin", color: "#67e8f9", headColor: "#ecfeff" },
  { id: "midnight", name: "Полночь", emoji: "🌑", price: 260, rarity: "rare", category: "skin", color: "#475569", headColor: "#cbd5e1" },
  { id: "neon", name: "Неон", emoji: "💛", price: 320, rarity: "rare", category: "skin", color: "#f9f06b", headColor: "#dc8add" },
  { id: "gold", name: "Золото", emoji: "✨", price: 290, rarity: "rare", category: "skin", color: "#ffd166", headColor: "#fff8e7" },
  { id: "candy", name: "Кэнди", emoji: "🍬", price: 390, rarity: "epic", category: "skin", color: "#f9a8d4", headColor: "#fce7f3" },
  { id: "void", name: "Пустота", emoji: "🕳️", price: 480, rarity: "epic", category: "skin", color: "#323a46", headColor: "#aab4c2" },
  { id: "plasma", name: "Плазма", emoji: "⚡", price: 560, rarity: "epic", category: "skin", color: "#e879f9", headColor: "#fae8ff" },
  { id: "shadow", name: "Тень", emoji: "🌚", price: 500, rarity: "epic", category: "skin", color: "#1e293b", headColor: "#94a3b8" },
  { id: "rainbow", name: "Радуга", emoji: "🌈", price: 1000, rarity: "legendary", category: "skin", color: "rainbow", headColor: "#ffffff" },
  { id: "royal", name: "Королевская", emoji: "💜", price: 1300, rarity: "legendary", category: "skin", color: "#7c3aed", headColor: "#ffd166" },
  { id: "lime", name: "Лайм", emoji: "🍋", price: 110, rarity: "common", category: "skin", color: "#a3e635", headColor: "#f7fee7" },
  { id: "crimson", name: "Багровая", emoji: "🩸", price: 170, rarity: "common", category: "skin", color: "#dc2626", headColor: "#fecaca" },
  { id: "azure", name: "Лазурь", emoji: "💎", price: 220, rarity: "rare", category: "skin", color: "#0ea5e9", headColor: "#e0f2fe" },
  { id: "ember", name: "Угли", emoji: "🌋", price: 350, rarity: "rare", category: "skin", color: "#ea580c", headColor: "#fdba74" },
  { id: "mint", name: "Мята", emoji: "🌿", price: 200, rarity: "common", category: "skin", color: "#2dd4bf", headColor: "#ccfbf1" },
  { id: "custom_1", name: "Свой скин 1", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#33d17a", headColor: "#ffffff", customTexture: "slot1.png" },
  { id: "custom_2", name: "Свой скин 2", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#62a0ea", headColor: "#ffffff", customTexture: "slot2.png" },
  { id: "custom_3", name: "Свой скин 3", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#f66151", headColor: "#ffffff", customTexture: "slot3.png" },
  { id: "hat_top", name: "Цилиндр змеи", emoji: "🎩", price: 390, rarity: "epic", category: "snake_hat" },
  { id: "hat_cap", name: "Кепка змеи", emoji: "🧢", price: 80, rarity: "common", category: "snake_hat" },
  { id: "hat_beanie", name: "Вязаная шапка", emoji: "🧶", price: 100, rarity: "common", category: "snake_hat" },
  { id: "hat_straw", name: "Соломенная шляпа", emoji: "👒", price: 240, rarity: "rare", category: "snake_hat" },
  { id: "hat_grad", name: "Выпускная шапка", emoji: "🎓", price: 270, rarity: "rare", category: "snake_hat" },
  { id: "hat_hard", name: "Строительная каска", emoji: "⛑️", price: 140, rarity: "common", category: "snake_hat" },
  { id: "hat_party", name: "Праздничный колпак", emoji: "🎉", price: 420, rarity: "epic", category: "snake_hat" },
  { id: "hat_mushroom", name: "Грибная шляпка", emoji: "🍄", price: 300, rarity: "rare", category: "snake_hat" },
  { id: "hat_flame", name: "Огненная корона", emoji: "🔥", price: 520, rarity: "epic", category: "snake_hat" },
  { id: "hat_royal", name: "Королевская корона", emoji: "👸", price: 1400, rarity: "legendary", category: "snake_hat" },
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
  ".png": "image/png",
};

let nextClientId = 1;
const sockets = new Map();
const players = new Map();
const food = [];
const bonuses = []; // активные бонус-клетки на поле
const bosses = createBosses();
let leaderboard = [];
let shopData = {};
const shopClients = new Map(); // socket id -> player name (shop-only sessions)
const socketSessions = new Map(); // socket id -> auth session row
let tickCount = 0;
let gameMode = "classic";
let taggedPlayerId = null; // для Tag Time
const feedLog = [];
const feedDedupe = new Map();
let feedBroadcastTimer = null;
const FEED_DEDUPE_MS = 4000;
const FEED_BROADCAST_MS = 1200;

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
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const authCtx = {
    db,
    shopData,
    getProfile,
    persistProfile,
    cleanName,
    defaultShopEntry,
    getRequestOrigin,
    sendJson,
  };

  auth.handleRequest(req, res, url, authCtx).then((handled) => {
    if (handled) return;
    handleHttpRequest(req, res, url);
  }).catch((error) => {
    console.error("HTTP:", error.message);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  });
});

function handleHttpRequest(req, res, url) {

  if (url.pathname === "/health") {
    sendJson(res, { ok: true, uptime: process.uptime(), players: players.size, sockets: sockets.size });
    return;
  }

  if (url.pathname === "/info") {
    const base = getRequestOrigin(req);
    sendJson(res, {
      name: "THE ULTIMATE MULTIPLAYER SNAKE ATTACK",
      publicUrl: base.http,
      wsUrl: base.ws,
      playersOnline: players.size,
    });
    return;
  }

  if (url.pathname === "/leaderboard") {
    const sort = url.searchParams.get("sort");
    sendJson(res, sort === "coins" ? getWealthLeaderboard() : getEnrichedLeaderboard());
    return;
  }
  if (url.pathname === "/shop") { sendJson(res, { skins: SHOP_SKINS, catalog: SHOP_CATALOG, playerData: shopData }); return; }
  if (url.pathname === "/catalog") { sendJson(res, { catalog: SHOP_CATALOG, skins: SHOP_SKINS, avatars: AVATAR_PRESETS }); return; }
  if (url.pathname === "/profile") {
    const name = profileName(url.searchParams.get("name") || "");
    if (!name) { sendJson(res, { error: "no name" }); return; }
    const key = Object.keys(shopData).find((k) => k.toLowerCase() === name.toLowerCase());
    if (!key) { sendJson(res, { error: "not_found" }); return; }
    const prof = getProfile(key);
    sendJson(res, {
      name: key,
      coins: prof.coins,
      activeSkin: prof.activeSkin,
      avatar: prof.avatar,
      googlePicture: prof.stats?.googlePicture || null,
      stats: {
        games: prof.stats?.games || 0,
        deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0,
        best: prof.stats?.best || 0,
        playTimeMs: prof.stats?.playTimeMs || 0,
      },
    });
    return;
  }
  if (url.pathname === "/api/players") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const list = Object.entries(shopData)
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .map(([name, prof]) => {
        const p = normalizeProfile(prof);
        return {
          name,
          avatar: p.avatar,
          googlePicture: p.stats?.googlePicture || null,
          games: p.stats.games || 0,
          deaths: p.stats.deaths || 0,
          best: p.stats.best || 0,
          coins: p.coins || 0,
          playTimeMs: p.stats.playTimeMs || 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .slice(0, 50);
    sendJson(res, list);
    return;
  }
  if (url.pathname === "/modes") { sendJson(res, { modes: MODES, difficulties: DIFFICULTIES }); return; }

  const requestPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }

  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...corsHeaders(),
    });
    res.end(content);
  });
}

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
  auth.getSession(req, db).then((session) => {
    if (session) socketSessions.set(id, session);
  }).catch(() => { });
  socket.on("data", (chunk) => readFrames(id, chunk));
  socket.on("close", () => removeClient(id));
  socket.on("error", () => removeClient(id));
  send(id, {
    type: "hello", id, grid: GRID, leaderboard: getEnrichedLeaderboard(),
    skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS,
    modes: MODES, difficulties: DIFFICULTIES,
    shopData: defaultShopEntry(),
    feed: feedLog.slice(0, 8),
  });
});

async function bootstrap() {
  try {
    await db.init();
    shopData = await db.loadAllPlayers();
    leaderboard = await db.loadLeaderboard(MAX_LEADERS);
    console.log(`PostgreSQL: ${Object.keys(shopData).length} игроков, ${leaderboard.length} рекордов`);
  } catch (error) {
    console.error("PostgreSQL недоступен:", error.message);
    console.error("Проверь DATABASE_URL и что база запущена. Пример: npm run db:reset");
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    food.length = 0;
    fillFood();
    tickInterval = setInterval(tick, DIFFICULTIES.normal.tickMs);
    setInterval(broadcastState, 250);
    setInterval(spawnBonuses, 8000);
    setInterval(pingClients, 25000);
    setInterval(() => db.cleanupAuthSessions().catch(() => { }), 60 * 60 * 1000);
    if (auth.isGoogleAuthEnabled()) {
      const sampleRedirect = process.env.GOOGLE_REDIRECT_URI
        || (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/auth/google/callback` : "(из запроса)");
      console.log("Google OAuth: включён");
      console.log(`Google OAuth redirect: ${sampleRedirect}`);
    } else console.log("Google OAuth: выключен (заполни GOOGLE_CLIENT_ID/SECRET в .env)");
    console.log(`Snake Attack → http://localhost:${PORT}`);
    for (const address of getLanAddresses()) console.log(`LAN → http://${address}:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") console.error(`Порт ${PORT} занят.`);
  else console.error("Ошибка сервера:", error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal}: остановка…`);
  if (tickInterval) clearInterval(tickInterval);
  for (const socket of sockets.values()) {
    try { socket.destroy(); } catch { /* ignore */ }
  }
  server.close(() => {
    db.close().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function pingClients() {
  const frame = makeFrame(JSON.stringify({ type: "ping", t: Date.now() }));
  for (const [id, socket] of sockets) {
    if (socket.destroyed || socket.writableEnded) continue;
    try { socket.write(frame); } catch { removeClient(id); }
  }
}

function getRequestOrigin(req) {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const wsProto = proto === "https" ? "wss" : "ws";
  return { http: `${proto}://${host}`, ws: `${wsProto}://${host}` };
}

// ============================================================
// GAME LOGIC
// ============================================================

function pushFeed(kind, text, playerName = "") {
  const dedupeKey = `${kind}:${text}`;
  const now = Date.now();
  const lastAt = feedDedupe.get(dedupeKey);
  if (lastAt && now - lastAt < FEED_DEDUPE_MS) return;
  feedDedupe.set(dedupeKey, now);

  feedLog.unshift({ id: `${now}-${feedLog.length}`, kind, text, playerName, at: now });
  if (feedLog.length > 12) feedLog.length = 12;
  scheduleFeedBroadcast();
}

function scheduleFeedBroadcast() {
  if (feedBroadcastTimer) return;
  feedBroadcastTimer = setTimeout(() => {
    feedBroadcastTimer = null;
    if (feedLog.length) broadcast({ type: "feed", feed: feedLog.slice(0, 8) });
  }, FEED_BROADCAST_MS);
}

function comboMultiplier(combo) {
  if (combo >= 10) return 2;
  if (combo >= 6) return 1.5;
  if (combo >= 3) return 1.25;
  return 1;
}

function tick() {
  if (players.size === 0) return;
  tickCount += 1;
  fillFood();
  if (tickCount % (bosses.some((b) => b.enragedTicks > 0) ? 3 : BOSS_MOVE_EVERY) === 0) moveBosses();
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
    if (player.frozenUntil && Date.now() < player.frozenUntil) continue;
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
    const killer = bossAt(nextHead);
    if (killer) {
      killPlayer(player, `${killer.name} поймал змейку`, { at: nextHead, boss: killer });
      continue;
    }

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
        player.combo = (player.combo || 0) + 1;
        player.maxCombo = Math.max(player.maxCombo || 0, player.combo);
        let mult = comboMultiplier(player.combo);
        if (player.activeBonus === "double") mult *= 2;
        if (player.activeBonus === "speed_up") mult *= 1.3;
        const pts = Math.round(eaten.points * mult);
        player.score += pts;
        player.best = Math.max(player.best, player.score);
        if (player.combo === 5 || player.combo === 10) {
          pushFeed("combo", `🔥 ${player.name}: COMBO ×${player.combo}!`, player.name);
        }
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
  pushFeed("bonus", `⚡ ${player.name} → ${def.label}`, player.name);
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
  if (bonuses.length >= 3) return;
  const point = randomEmptyPoint({ avoidNearHeads: true });
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

function killPlayer(player, reason, opts = {}) {
  if (!player.alive) return;
  trackDeathStats(player);
  player.alive = false;
  player.deaths += 1;
  player.reason = reason;
  player.activeBonus = null;
  player.bonusExpires = null;
  player.combo = 0;
  const reward = awardSessionCoins(player);
  player.coinsEarned = reward;
  if (reward > 0) {
    player.coins = (player.coins || 0) + reward;
    savePlayerCoins(player);
    pushFeed("bonus", `💰 ${player.name}: +${reward} монет`, player.name);
  }
  recordScore(player);
  pushFeed("death", `💀 ${player.name}: ${reason}`, player.name);
  const hitCell = opts.at || player.snake[0];
  const killerBoss = opts.boss || bossAt(hitCell) || bosses.find((b) => reason.includes(b.name));
  if (killerBoss) enrageBoss(killerBoss);
}

function recordScore(player) {
  if (!player || player.score <= 0) return;
  const existing = leaderboard.find((e) => e.name.toLowerCase() === player.name.toLowerCase());
  if (!existing || player.score > existing.score) {
    if (existing) { existing.score = player.score; existing.date = new Date().toISOString(); existing.difficulty = player.difficulty; }
    else leaderboard.push({ name: player.name, score: player.score, date: new Date().toISOString(), difficulty: player.difficulty });
    leaderboard.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    leaderboard = leaderboard.slice(0, MAX_LEADERS);
    persistLeaderboardEntry(player.name, player.score, player.difficulty);
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
        combo: p.combo || 0, maxCombo: p.maxCombo || 0,
        coinsEarned: p.coinsEarned || 0,
        frozenUntil: p.frozenUntil || 0,
        heat: Math.min(100, Math.round((p.score || 0) * 0.4 + (p.combo || 0) * 9)),
        isTagged: gameMode === "tag_time" && p.id === taggedPlayerId,
        avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji,
      };
    }),
    bosses, leaderboard: getEnrichedLeaderboard(), gameMode, taggedPlayerId,
    shopMeta: { skins: SHOP_SKINS, catalog: SHOP_CATALOG },
  });
}

// ============================================================
// BOSSES
// ============================================================

function createBosses() {
  const defs = [
    { id: "void", name: "VØIDR", color: "#f66151", trait: "dash", x: 20, y: 20 },
    { id: "nyx", name: "NYX-7", color: "#7c3aed", trait: "blink", x: GRID.width - 24, y: 20 },
    { id: "scrap", name: "SCR4P", color: "#ea580c", trait: "poison", x: Math.floor(GRID.width / 2) - 2, y: GRID.height - 24 },
  ];
  return defs.map((def) => ({
    ...def,
    size: 1,
    pulse: 0,
    angry: false,
    phase: "idle",
    enragedTicks: 0,
    agitatedTicks: 0,
    kills: 0,
    moveCooldown: 0,
  }));
}

function clampBossInGrid(boss) {
  boss.x = Math.max(0, Math.min(boss.x, GRID.width - boss.size));
  boss.y = Math.max(0, Math.min(boss.y, GRID.height - boss.size));
}

function enrageBoss(boss) {
  boss.kills = (boss.kills || 0) + 1;
  const wasEnraged = boss.enragedTicks > 0;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, 90);
  boss.size = 2;
  boss.phase = "enraged";
  boss.angry = true;
  clampBossInGrid(boss);
  if (!wasEnraged) {
    pushFeed("boss", `👹 ${boss.name} в ЯРОСТИ!`, "");
    broadcast({ type: "notice", text: `⚠ ${boss.name} вошёл в ярость!` });
    for (const other of bosses) {
      if (other.id !== boss.id) other.agitatedTicks = Math.max(other.agitatedTicks || 0, 50);
    }
  }
}

function updateBossPhase(boss, dist) {
  if (boss.enragedTicks > 0) {
    boss.enragedTicks -= 1;
    boss.phase = "enraged";
    boss.size = 2;
    if (boss.enragedTicks <= 0) {
      boss.size = 1;
      boss.phase = dist <= BOSS_HUNT_RANGE ? "hunt" : "idle";
    }
    return;
  }
  boss.size = 1;
  boss.phase = dist <= BOSS_HUNT_RANGE ? "hunt" : dist <= BOSS_CHASE_RANGE ? "stalk" : "idle";
}

function moveBosses() {
  const alive = [...players.values()].filter((p) => p.alive);
  removeFoodUnderBosses();

  for (const boss of bosses) {
    if (boss.agitatedTicks > 0) boss.agitatedTicks -= 1;

    if (boss.moveCooldown > 0) {
      boss.moveCooldown -= 1;
      boss.pulse = (boss.pulse + 1) % 1000;
      continue;
    }

    const target = alive.length
      ? alive.reduce((best, p) => {
        const d = distanceToBoss(p.snake[0], boss);
        return !best || d < best.dist ? { player: p, dist: d } : best;
      }, null)?.player
      : null;
    const dist = target ? distanceToBoss(target.snake[0], boss) : 999;
    boss.angry = dist <= BOSS_HUNT_RANGE || boss.phase === "enraged";
    updateBossPhase(boss, dist);

    const head = target?.snake?.[0];
    let move = pickBossMove(boss, head, dist);
    if (move) applyBossStep(boss, move);

    if (boss.trait === "dash" && boss.phase === "enraged" && head && Math.random() < 0.38) {
      move = pickBossMove(boss, head, distanceToBoss(head, boss));
      if (move) applyBossStep(boss, move);
    }
    if (boss.trait === "blink" && (boss.phase === "stalk" || boss.agitatedTicks > 0) && head && dist <= BOSS_CHASE_RANGE && Math.random() < 0.22) {
      move = pickBossMove(boss, head, distanceToBoss(head, boss));
      if (move) applyBossStep(boss, move);
    }

    boss.pulse = (boss.pulse + 1) % 1000;
  }

  for (const player of alive) {
    const head = player.snake[0];
    const killer = bossAt(head);
    if (killer) {
      killPlayer(player, `${killer.name} схватил за голову`, { at: head, boss: killer });
      killer.moveCooldown = killer.phase === "enraged" ? 2 : 4;
    }
  }
}

function applyBossStep(boss, move) {
  const prevX = boss.x;
  const prevY = boss.y;
  boss.x += move.x;
  boss.y += move.y;
  clampBossInGrid(boss);

  if (boss.trait === "poison" && boss.phase === "enraged") {
    leavePoisonCell(boss, prevX, prevY);
  }
}

function leavePoisonCell(boss, x, y) {
  if (Math.random() > 0.45) return;
  if (!insideGrid({ x, y }) || anyBossOccupies({ x, y })) return;
  if (food.some((item) => item.x === x && item.y === y)) return;
  if (food.length >= FOOD_TARGET + 24) return;
  food.push(createBadFood({ x, y }));
}

function pickBossMove(boss, target, dist) {
  const legal = shuffledDirs().filter((m) => bossCanMove(boss, m));
  if (!legal.length) return null;

  const chaseRange = boss.phase === "enraged"
    ? BOSS_CHASE_RANGE + 12
    : boss.agitatedTicks > 0
      ? BOSS_CHASE_RANGE + 8
      : boss.trait === "blink"
        ? BOSS_CHASE_RANGE + 6
        : BOSS_CHASE_RANGE;
  const randomChance = boss.phase === "enraged" ? 0.03 : boss.agitatedTicks > 0 ? 0.1 : BOSS_RANDOM_MOVE_CHANCE;
  const shouldChase = target && dist <= chaseRange && Math.random() > randomChance;

  const scoreMove = (m) => {
    const nx = boss.x + m.x;
    const ny = boss.y + m.y;
    let score = Math.min(nx, ny, GRID.width - nx - boss.size, GRID.height - ny - boss.size) * 2;
    if (shouldChase) score -= Math.abs(target.x - nx) + Math.abs(target.y - ny);
    return score;
  };

  if (shouldChase) {
    const preferred = bossMovesToward(boss, target);
    const direct = preferred.find((m) => bossCanMove(boss, m));
    if (direct) return direct;
  }

  legal.sort((a, b) => scoreMove(b) - scoreMove(a));
  return legal[0];
}

function bossMovesToward(boss, point) {
  const dx = point.x - boss.x;
  const dy = point.y - boss.y;
  const h = dx === 0 ? [] : [{ x: Math.sign(dx), y: 0 }];
  const v = dy === 0 ? [] : [{ x: 0, y: Math.sign(dy) }];
  return Math.abs(dx) > Math.abs(dy) ? [...h, ...v, ...shuffledDirs()] : [...v, ...h, ...shuffledDirs()];
}

function bossCanMove(boss, move) {
  const next = { x: boss.x + move.x, y: boss.y + move.y };
  if (next.x < 0 || next.y < 0 || next.x + boss.size > GRID.width || next.y + boss.size > GRID.height) return false;
  for (const other of bosses) {
    if (other.id === boss.id) continue;
    if (rectsOverlap(next.x, next.y, boss.size, boss.size, other.x, other.y, other.size)) return false;
  }
  return true;
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function distanceToBoss(point, boss) {
  return Math.abs(point.x - boss.x) + Math.abs(point.y - boss.y);
}

function distanceToNearestBoss(point) {
  if (!bosses.length) return 999;
  return Math.min(...bosses.map((boss) => distanceToBoss(point, boss)));
}

function bossOccupies(boss, point) {
  return point.x >= boss.x && point.x < boss.x + boss.size && point.y >= boss.y && point.y < boss.y + boss.size;
}

function bossAt(point) {
  return bosses.find((boss) => bossOccupies(boss, point)) || null;
}

function anyBossOccupies(point) {
  return bosses.some((boss) => bossOccupies(boss, point));
}

function removeFoodUnderBosses() {
  for (let i = food.length - 1; i >= 0; i--) {
    if (anyBossOccupies(food[i])) food.splice(i, 1);
  }
}

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
    const wantBad = Math.random() < diff;
    const point = randomEmptyPoint({ avoidNearHeads: wantBad });
    if (!point) return;
    food.push(wantBad ? createBadFood(point) : createGoodFood(point));
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
  if (message.type === "ping") return;

  if (message.type === "shop_connect") {
    handleShopConnect(id, message).catch((err) => console.error("shop_connect:", err.message));
    return;
  }

  if (message.type === "save_profile") {
    saveProfile(id, message).catch((err) => console.error("save_profile:", err.message));
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
    handleJoin(id, message).catch((err) => console.error("join:", err.message));
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
    if (player.frozenUntil && Date.now() < player.frozenUntil) return;
    const next = directionFromKey(message.direction);
    if (next && !isOpposite(player.direction, next)) player.nextDirection = next;
  }

  if (message.type === "restart") {
    recordScore(player);
    startNewLife(player.name);
    const skin = getSkinDef(getProfile(player.name).activeSkin);
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
    persistProfile(name, entry);
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
  persistProfile(name, entry);
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
  persistProfile(name, entry);
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
  persistProfile(name, entry);
  sendShopPayload(clientId, name);
  broadcastState();
}

async function isNameTaken(name, exceptName = null) {
  const n = profileName(name);
  if (!n) return true;
  const lower = n.toLowerCase();
  if (exceptName && exceptName.toLowerCase() === lower) return false;
  const inShop = Object.keys(shopData).some((k) => k.toLowerCase() === lower);
  if (inShop) return true;
  return db.isPlayerNameTaken(n, exceptName);
}

async function resolvePlayName(id, requestedName) {
  const session = socketSessions.get(id);
  if (session) return { ok: true, name: session.player_name };

  const name = profileName(requestedName);
  if (!name) return { ok: false, text: "Укажи никнейм в профиле!" };
  if (await isNameTaken(name)) {
    return { ok: false, text: "Это имя уже занято! Войди через Google в профиле." };
  }
  return { ok: true, name };
}

async function handleShopConnect(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) {
    send(id, { type: "notice", text: resolved.text });
    return;
  }
  shopClients.set(id, resolved.name);
  sendShopPayload(id, resolved.name);
}

async function handleJoin(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) {
    send(id, { type: "notice", text: resolved.text });
    return;
  }
  const name = resolved.name;
  const difficulty = DIFFICULTIES[message.difficulty] ? message.difficulty : "normal";
  const mode = MODES[message.mode] ? message.mode : "classic";
  gameMode = mode;
  const prof = getProfile(name);
  const skin = getSkinDef(prof.activeSkin);
  startNewLife(name);
  shopClients.set(id, name);
  players.set(id, createPlayer(id, name, difficulty, skin));
  if (mode === "tag_time" && !taggedPlayerId) taggedPlayerId = id;
  restartTickInterval();
  broadcastState();
}

async function saveProfile(clientId, message) {
  const session = socketSessions.get(clientId);
  const newName = profileName(message.name);
  if (!newName) {
    send(clientId, { type: "notice", text: "Никнейм не может быть пустым!" });
    return;
  }

  if (!session) {
    send(clientId, { type: "notice", text: "Войди через Google, чтобы редактировать профиль." });
    return;
  }

  const oldName = session.player_name;
  const avatar = AVATAR_PRESETS.includes(message.avatar) ? message.avatar : "😎";
  let entry = getProfile(oldName);
  entry.avatar = avatar;

  if (oldName.toLowerCase() !== newName.toLowerCase()) {
    if (await isNameTaken(newName, oldName)) {
      send(clientId, { type: "notice", text: "Это имя уже занято!" });
      return;
    }
    delete shopData[oldName];
    entry = { ...getProfile(oldName), avatar };
    shopClients.set(clientId, newName);
    const player = players.get(clientId);
    if (player) player.name = newName;
    shopData[newName] = entry;
    session.player_name = newName;
    socketSessions.set(clientId, session);
    await db.updateGoogleUserPlayerName(session.google_id, newName);
    await db.renamePlayer(oldName, newName, entry);
  } else {
    shopData[newName] = entry;
    persistProfile(newName, entry);
  }

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

function startNewLife(name) {
  const entry = getProfile(name);
  entry.stats.games = (entry.stats.games || 0) + 1;
  entry.stats.sessionStart = Date.now();
  shopData[name] = entry;
  persistProfile(name, entry);
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
      deaths: raw.stats?.deaths ?? raw.stats?.losses ?? 0,
      best: raw.stats?.best || 0,
      playTimeMs: raw.stats?.playTimeMs || 0,
      sessionStart: raw.stats?.sessionStart || null,
      googlePicture: raw.stats?.googlePicture || null,
    },
  };
  for (const id of entry.unlockedSkins) {
    if (!entry.inventory.includes(id)) entry.inventory.push(id);
  }
  if (!entry.inventory.includes("default")) entry.inventory.unshift("default");
  for (const custom of SHOP_CATALOG.filter((i) => i.customTexture)) {
    if (!entry.inventory.includes(custom.id)) entry.inventory.push(custom.id);
  }
  const skinValid = SHOP_CATALOG.find((i) => i.id === entry.activeSkin && i.category === "skin");
  if (!skinValid) entry.activeSkin = "default";
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
  entry.stats.deaths = (entry.stats.deaths ?? entry.stats.losses ?? 0) + 1;
  const prevBest = entry.stats.best || 0;
  entry.stats.best = Math.max(prevBest, player.score);
  player.beatPersonalBest = player.score > prevBest;
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  const rivalScores = [...players.values()].filter((p) => p.id !== player.id).map((p) => p.score);
  const sessionTop = Math.max(player.score, ...rivalScores, 0);
  player.sessionMvp = player.score > 0 && player.score >= sessionTop;
  shopData[player.name] = entry;
  persistProfile(player.name, entry);
}

function awardSessionCoins(player) {
  const score = player.score || 0;
  if (score <= 0) return 0;

  let coins = Math.floor(Math.sqrt(score) * 4);
  coins += Math.floor((player.maxCombo || 0) * 2);
  if (player.beatPersonalBest) coins += 30;
  if (player.sessionMvp) coins += 25;
  if (score >= 200) coins += 15;
  if (score >= 500) coins += 35;
  if (score >= 1000) coins += 60;

  return Math.max(3, Math.min(coins, 220));
}

function trackDisconnectStats(player) {
  const entry = getProfile(player.name);
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  shopData[player.name] = entry;
  persistProfile(player.name, entry);
}

function getEnrichedLeaderboard() {
  return leaderboard.map((e, index) => {
    const prof = getProfile(e.name);
    return {
      ...e,
      rank: index + 1,
      avatar: prof.avatar,
      googlePicture: prof.stats?.googlePicture || null,
      deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0,
      games: prof.stats?.games || 0,
      best: Math.max(e.score, prof.stats?.best || 0),
      coins: prof.coins || 0,
    };
  });
}

function getWealthLeaderboard() {
  return Object.entries(shopData)
    .map(([name, prof]) => ({
      name,
      coins: prof.coins || 0,
      score: prof.coins || 0,
      avatar: prof.avatar || "😎",
      googlePicture: prof.stats?.googlePicture || null,
      deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0,
      games: prof.stats?.games || 0,
      best: prof.stats?.best || 0,
    }))
    .filter((e) => e.coins > 0)
    .sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name, "ru"))
    .slice(0, MAX_LEADERS)
    .map((e, index) => ({ ...e, rank: index + 1 }));
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
  persistProfile(player.name, entry);
}

function createPlayer(id, name, difficulty, skin) {
  const layout = findSpawnLayout();
  const direction = layout?.direction || { x: 1, y: 0 };
  const snake = layout?.snake || [{ x: Math.floor(GRID.width / 2), y: Math.floor(GRID.height / 2) }];
  clearBoardAroundSpawn(snake[0]);
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
    coinsEarned: 0, beatPersonalBest: false, sessionMvp: false,
    activeBonus: null, bonusExpires: null,
    combo: 0, maxCombo: 0,
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji,
    frozenUntil: Date.now() + SPAWN_FREEZE_MS,
  };
  removeEntitiesUnderSnake(player);
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
  socketSessions.delete(id);
  const player = players.get(id);
  if (player) {
    trackDisconnectStats(player);
    recordScore(player);
    players.delete(id);
    broadcastState();
  }
}

// ============================================================
// PERSISTENCE (PostgreSQL)
// ============================================================

function persistProfile(name, entry) {
  shopData[name] = entry;
  db.upsertPlayer(name, entry).catch((err) => console.error("DB player:", err.message));
}

function persistLeaderboardEntry(name, score, difficulty) {
  db.upsertLeaderboard(name, score, difficulty).catch((err) => console.error("DB leaderboard:", err.message));
}

function defaultShopEntry() {
  return normalizeProfile({ coins: 0, unlockedSkins: ["default"], activeSkin: "default" });
}

// ============================================================
// UTILS
// ============================================================

function randomEmptyPoint(opts = {}) {
  for (let attempt = 0; attempt < 800; attempt++) {
    const point = { x: Math.floor(Math.random() * GRID.width), y: Math.floor(Math.random() * GRID.height) };
    if (isEmpty(point, opts)) return point;
  }
  return null;
}

const SPAWN_DIRECTIONS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function snakeSegmentsFromHead(head, direction, length = SNAKE_SPAWN_LEN) {
  const tailDir = { x: -direction.x, y: -direction.y };
  const segments = [head];
  for (let i = 1; i < length; i++) {
    segments.push({ x: head.x + tailDir.x * i, y: head.y + tailDir.y * i });
  }
  return segments;
}

function allSegmentsInsideGrid(segments) {
  return segments.every(insideGrid);
}

function segmentsConflict(segments, ignorePlayerId = null) {
  for (const part of segments) {
    if (anyBossOccupies(part)) return true;
    if (food.some((item) => item.x === part.x && item.y === part.y)) return true;
    if (bonuses.some((bonus) => bonus.x === part.x && bonus.y === part.y)) return true;
  }
  for (const player of players.values()) {
    if (ignorePlayerId && player.id === ignorePlayerId) continue;
    for (const part of player.snake) {
      if (segments.some((seg) => seg.x === part.x && seg.y === part.y)) return true;
    }
  }
  return false;
}

function findSpawnLayout(ignorePlayerId = null) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const head = {
      x: SPAWN_MARGIN + Math.floor(Math.random() * (GRID.width - SPAWN_MARGIN * 2)),
      y: SPAWN_MARGIN + Math.floor(Math.random() * (GRID.height - SPAWN_MARGIN * 2)),
    };
    const direction = SPAWN_DIRECTIONS[Math.floor(Math.random() * SPAWN_DIRECTIONS.length)];
    const snake = snakeSegmentsFromHead(head, direction);
    if (!allSegmentsInsideGrid(snake)) continue;
    if (segmentsConflict(snake, ignorePlayerId)) continue;
    if (distanceToNearestBoss(head) < BOSS_SPAWN_BUFFER) continue;
    return { direction, snake };
  }

  for (const direction of SPAWN_DIRECTIONS) {
    for (let y = SPAWN_MARGIN; y < GRID.height - SPAWN_MARGIN; y++) {
      for (let x = SPAWN_MARGIN; x < GRID.width - SPAWN_MARGIN; x++) {
        const snake = snakeSegmentsFromHead({ x, y }, direction);
        if (!allSegmentsInsideGrid(snake)) continue;
        if (segmentsConflict(snake, ignorePlayerId)) continue;
        return { direction, snake };
      }
    }
  }
  return null;
}

function clearBoardAroundSpawn(head, radius = SPAWN_CLEAR_RADIUS) {
  for (let i = food.length - 1; i >= 0; i--) {
    const item = food[i];
    if (Math.abs(item.x - head.x) + Math.abs(item.y - head.y) <= radius) food.splice(i, 1);
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    const bonus = bonuses[i];
    if (Math.abs(bonus.x - head.x) + Math.abs(bonus.y - head.y) <= radius) bonuses.splice(i, 1);
  }
}

function removeEntitiesUnderSnake(player) {
  const occupied = new Set(player.snake.map(pointKey));
  for (let i = food.length - 1; i >= 0; i--) {
    if (occupied.has(pointKey(food[i]))) food.splice(i, 1);
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (occupied.has(pointKey(bonuses[i]))) bonuses.splice(i, 1);
  }
}

function isEmpty(point, opts = {}) {
  if (anyBossOccupies(point)) return false;
  if (food.some((item) => item.x === point.x && item.y === point.y)) return false;
  if (bonuses.some((bonus) => bonus.x === point.x && bonus.y === point.y)) return false;
  for (const player of players.values()) {
    if (player.snake.some((part) => part.x === point.x && part.y === point.y)) return false;
    if (opts.avoidNearHeads && player.alive) {
      const head = player.snake[0];
      if (Math.abs(point.x - head.x) + Math.abs(point.y - head.y) <= BAD_FOOD_HEAD_BUFFER) return false;
    }
  }
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, payload) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(payload));
}