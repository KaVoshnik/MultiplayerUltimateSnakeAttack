"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const db = require("./db");
const auth = require("./auth");
const gameConfig = require("./config/game");
const bossMod = require("./lib/bosses");
const foodMod = require("./lib/food");
const gameSync = require("./lib/game-sync");
const { RateLimiterRegistry } = require("./lib/rate-limiter");
const wsProtocol = require("./lib/ws-protocol");
const net = require("./lib/net");
const profiles = require("./lib/profiles");
const leaderboardMod = require("./lib/leaderboard");
const statsRewards = require("./lib/stats-rewards");
const shopActions = require("./lib/shop-actions");
const gameLoop = require("./lib/game-loop");
const roomsSetup = require("./lib/rooms-setup");
const messageHandlers = require("./lib/message-handlers");
const { corsHeaders, getLanAddresses, getRequestOrigin, sendJson } = require("./lib/utils");
const routes = require("./routes");
const avatarRoutes = require("./routes/avatar");
const { SHOP_CATALOG, SHOP_SKINS, AVATAR_PRESETS } = require("./data/shop-catalog");
const { getBattlePassConfig } = require("./data/battle-pass");

// ============================================================
// CONSTANTS
// ============================================================

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const AVATARS_DIR = path.join(PUBLIC_DIR, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const { GRID, DEFAULT_TICK_MS, AVATAR_UPLOAD_MAX_BYTES } = gameConfig;

// ============================================================
// СБОРКА ОБЩЕГО СОСТОЯНИЯ (ctx)
// ============================================================
// Все модули в lib/ и routes/ получают этот объект и общаются через него —
// это тот же паттерн инжекции зависимостей, что уже использовался для
// комнат (lib/room.js) и авторизации (auth.js), просто применённый ко
// всему серверу. Мутируемые поля (shopData, leaderboard, tickJournal и т.д.)
// переприсваиваются прямо на ctx, а не через let-переменные модуля — так
// все части сервера всегда видят актуальное значение.

const ctx = {
  // конфиг / константы
  PORT, HOST, PUBLIC_DIR, AVATARS_DIR, GRID,
  AVATAR_UPLOAD_MAX_BYTES,

  // внешние модули
  db, auth,

  // состояние подключений
  nextClientId: 1,
  sockets: new Map(),        // id -> socket
  socketSessions: new Map(), // id -> auth session
  shopClients: new Map(),    // socket id -> player name
  clientAoi: new Map(),
  rateLimiters: new RateLimiterRegistry(),

  // игровое состояние (публичное лобби)
  players: new Map(),
  food: [],
  bonuses: [],
  bosses: bossMod.createBosses(GRID),
  occupancySet: new Set(),
  tickCount: 0,
  tickJournal: gameSync.createJournal(),
  tickInterval: null,

  // профили
  profileIndex: new Map(), // lowerName -> canonicalName
  shopData: {},             // canonicalName -> profile entry

  // лидерборд / рынок
  leaderboard: [],
  marketListings: new Map(),

  // лента событий
  feedLog: [],
  feedDedupe: new Map(),
  feedBroadcastTimer: null,

  // комнаты
  rooms: new Map(),      // code -> Room
  socketRoom: new Map(), // socketId -> roomCode
};

// ---- сеть ----
ctx.send = (id, payload) => net.send(ctx, id, payload);
ctx.broadcast = (payload) => net.broadcast(ctx, payload);
ctx.closeSocket = (id) => net.closeSocket(ctx, id);
ctx.removeClient = (id) => net.removeClient(ctx, id);

// ---- комнаты ----
ctx.leaveRoom = (id) => roomsSetup.leaveRoom(ctx, id);

// ---- профиль / статистика / награды ----
ctx.trackDisconnectStats = (player) => statsRewards.trackDisconnectStats(ctx, player);
ctx.recordScore = (player) => leaderboardMod.recordScore(ctx, player);
ctx.removeAvatarFile = (url) => avatarRoutes.removeAvatarFile(ctx, url);
// lib/phrases.js трактует ctx и Room одинаково (duck typing) — обоим нужен
// .getProfile(name); у Room он уже инжектится в rooms-setup.js.
ctx.getProfile = (name) => profiles.getProfile(ctx, name);

// ---- игровой цикл / синк ----
ctx.broadcastGameSync = () => gameLoop.broadcastGameSync(ctx);
ctx.broadcastPresence = () => gameLoop.broadcastPresence(ctx);
ctx.resyncPlayer = (id) => gameLoop.resyncPlayer(ctx, id);
ctx.pushFeed = (...args) => gameLoop.pushFeed(ctx, ...args);
ctx.applySkinToPlayer = gameLoop.applySkinToPlayer;

// ---- магазин ----
ctx.sendShopPayload = (id, name) => shopActions.sendShopPayload(ctx, id, name);

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const authCtx = {
    db, shopData: ctx.shopData,
    getProfile: (name) => profiles.getProfile(ctx, name),
    persistProfile: (name, entry) => profiles.persistProfile(ctx, name, entry),
    cleanName: (name) => profiles.profileName(name),
    defaultShopEntry: profiles.defaultShopEntry,
    getRequestOrigin: (r) => getRequestOrigin(r, PORT),
    sendJson,
  };

  auth.handleRequest(req, res, url, authCtx).then((handled) => {
    if (handled) return;
    routes.handleHttpRequest(req, res, url, ctx).catch((err) => {
      console.error("HTTP handler:", err.message);
      if (!res.headersSent) { res.writeHead(500); res.end("Server error"); }
    });
  }).catch((err) => {
    console.error("HTTP:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  });
});

// ============================================================
// WEBSOCKET
// ============================================================

const handleMessage = net.createMessageHandler(ctx, messageHandlers);

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") { socket.destroy(); return; }

  const accept = crypto.createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = String(ctx.nextClientId++);
  ctx.sockets.set(id, socket);

  auth.getSession(req, db).then((session) => {
    if (session) {
      // Один активный сокет на аккаунт: если тот же логин уже подключён
      // (другая вкладка/устройство) — выгоняем старую сессию, не оставляем дубль.
      if (session.player_name) {
        for (const [otherId, otherSession] of ctx.socketSessions) {
          if (otherId !== id && otherSession.player_name.toLowerCase() === session.player_name.toLowerCase()) {
            ctx.send(otherId, { type: "notice", text: "Вы вошли с другого устройства — это соединение закрыто." });
            ctx.closeSocket(otherId);
          }
        }
      }
      ctx.socketSessions.set(id, session);
      ctx.send(id, { type: "auth_ready", name: session.player_name });
    }
  }).catch(() => { });

  socket.on("data", (chunk) => wsProtocol.readFrames(chunk, {
    onMessage: (msg) => handleMessage(id, msg),
    onClose: () => ctx.removeClient(id),
    onParseError: () => ctx.send(id, { type: "notice", text: "Ошибка чтения сообщения." }),
  }));
  socket.on("close", () => ctx.removeClient(id));
  socket.on("error", () => ctx.removeClient(id));

  ctx.send(id, {
    type: "hello", id, grid: GRID,
    leaderboard: leaderboardMod.getEnrichedLeaderboard(ctx),
    skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS,
    shopData: profiles.defaultShopEntry(),
    feed: ctx.feedLog.slice(0, 8),
    presence: gameSync.buildPresence(gameLoop.buildSyncCtx(ctx)),
    battlePass: getBattlePassConfig(),
  });
});

// ============================================================
// BOOTSTRAP & SHUTDOWN
// ============================================================

async function bootstrap() {
  try {
    await db.init();
    ctx.shopData = await db.loadAllPlayers();
    ctx.leaderboard = await db.loadLeaderboard(leaderboardMod.MAX_LEADERS);
    const listingRows = await db.loadFoodListings();
    for (const row of listingRows) {
      ctx.marketListings.set(row.id, {
        id: row.id, sellerName: row.seller_name, kind: row.kind,
        quantity: row.quantity, pricePerUnit: row.price_per_unit, createdAt: row.created_at,
      });
    }
    profiles.rebuildProfileIndex(ctx);
    console.log(`PostgreSQL: ${Object.keys(ctx.shopData).length} игроков, ${ctx.leaderboard.length} рекордов, ${ctx.marketListings.size} лотов рынка`);
  } catch (err) {
    console.error("PostgreSQL недоступен:", err.message);
    console.error("Проверь DATABASE_URL и что база запущена. Пример: npm run db:reset");
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    ctx.food.length = 0;
    foodMod.fillFood({
      food: ctx.food, players: ctx.players, occupancySet: ctx.occupancySet, tickJournal: gameSync.createJournal(), GRID,
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(ctx.bosses, pt),
    });
    ctx.tickInterval = setInterval(() => gameLoop.tick(ctx), DEFAULT_TICK_MS);
    setInterval(() => gameLoop.spawnBonuses(ctx), 8000);
    setInterval(() => gameLoop.broadcastPresence(ctx), 5000);
    setInterval(() => net.pingClients(ctx), 25000);
    setInterval(() => db.cleanupAuthSessions().catch(() => { }), 60 * 60 * 1000);
    setInterval(() => db.cleanupClaimTokens().catch(() => { }), 60 * 60 * 1000);

    console.log("Авторизация: локальный логин/пароль (без внешних провайдеров)");
    console.log(`Snake Attack → http://localhost:${PORT}`);
    for (const address of getLanAddresses()) console.log(`LAN → http://${address}:${PORT}`);
  });
}

bootstrap().catch((err) => { console.error(err); process.exit(1); });

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Порт ${PORT} занят.`);
  else console.error("Ошибка сервера:", err.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal}: остановка…`);
  if (ctx.tickInterval) clearInterval(ctx.tickInterval);
  for (const socket of ctx.sockets.values()) { try { socket.destroy(); } catch { /* ignore */ } }
  server.close(() => { db.close().finally(() => process.exit(0)); });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
