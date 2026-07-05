"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const db = require("./db");
const auth = require("./auth");
const gameSync = require("./lib/game-sync");
const bossMod = require("./lib/bosses");
const foodMod = require("./lib/food");
const gameConfig = require("./config/game");
const bonusEffects = require("./lib/bonus-effects");
const engine = require("./lib/engine");

// ============================================================
// CONSTANTS
// ============================================================

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const AVATARS_DIR = path.join(PUBLIC_DIR, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

// Определяем реальный тип файла по магическим байтам — клиент может соврать
// про content-type, но подделать первые байты валидного изображения смысла нет.
function sniffImageType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function removeAvatarFile(url) {
  if (!url || !url.startsWith("/avatars/")) return;
  const filePath = path.join(AVATARS_DIR, path.basename(url));
  fs.unlink(filePath, () => {}); // не критично, если файла уже нет
}

const { GRID, SPAWN_FREEZE_MS, BONUS_TYPES, KILL_REWARD_COINS, DEFAULT_TICK_MS, AVATAR_UPLOAD_MAX_BYTES } = gameConfig;
const MAX_LEADERS = 20;
const BATTLE_PASS_SCORE_STEP = 1000;
const BATTLE_PASS_MAX_TIER = 60;

const { FOOD_TYPES } = foodMod;
const { BOSS_SPAWN_BUFFER, BOSS_MOVE_EVERY } = bossMod;

const BATTLE_PASS_NICK_COLORS = [
  { id: "bp_gold", label: "Золото", color: "#ffd166", tier: 1 },
  { id: "bp_cyan", label: "Бирюза", color: "#22d3ee", tier: 4 },
  { id: "bp_magenta", label: "Магента", color: "#f472b6", tier: 7 },
  { id: "bp_lime", label: "Лайм", color: "#a3e635", tier: 10 },
  { id: "bp_crimson", label: "Багряный", color: "#f87171", tier: 13 },
  { id: "bp_violet", label: "Фиолет", color: "#a78bfa", tier: 16 },
  { id: "bp_orange", label: "Оранж", color: "#fb923c", tier: 19 },
  { id: "bp_ice", label: "Лёд", color: "#93c5fd", tier: 22 },
  { id: "bp_neon", label: "Неон", color: "#3de88a", tier: 25 },
  { id: "bp_royal", label: "Корона", color: "#fcd34d", tier: 28 },
  { id: "bp_plasma", label: "Плазма", color: "#e879f9", tier: 31 },
  { id: "bp_sunset", label: "Закат", color: "#fb7185", tier: 34 },
  { id: "bp_mint", label: "Мята", color: "#2dd4bf", tier: 37 },
  { id: "bp_ember", label: "Угли", color: "#ea580c", tier: 40 },
  { id: "bp_azure", label: "Лазурь", color: "#0ea5e9", tier: 43 },
  { id: "bp_sakura", label: "Сакура", color: "#f9a8d4", tier: 46 },
  { id: "bp_poison", label: "Яд", color: "#84cc16", tier: 49 },
  { id: "bp_shadow", label: "Тень", color: "#94a3b8", tier: 52 },
  { id: "bp_aurora", label: "Аврора", color: "#34d399", tier: 55 },
  { id: "bp_legendary", label: "Легенда", color: "#f59e0b", tier: 60 },
];

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
  { id: "custom_hat_1", name: "Своя шляпа 1", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat1.png" },
  { id: "custom_hat_2", name: "Своя шляпа 2", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat2.png" },
  { id: "custom_hat_3", name: "Своя шляпа 3", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat3.png" },
];

const AVATAR_PRESETS = [
  "😎", "🤠", "🧙‍♂️", "🦸‍♂️", "🧝‍♂️", "👾", "🤖", "👽", "🐍", "🐲",
  "🦊", "🐺", "🦁", "🐯", "🐼", "🐸", "🐙", "🦄", "🎃", "💀",
];

const COLORS = ["#33d17a", "#62a0ea", "#ffbe6f", "#dc8add", "#f66151", "#8ff0a4", "#99c1f1", "#f9f06b"];
const SHOP_SKINS = SHOP_CATALOG.filter((i) => i.category === "skin").map((s) => ({
  id: s.id, label: s.name, price: s.price, color: s.color, headColor: s.headColor, trailColor: s.color,
}));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

// ============================================================
// BATTLE PASS
// ============================================================

function getBattlePassTierDef(tier) {
  const nickColor = BATTLE_PASS_NICK_COLORS.find((c) => c.tier === tier) || null;
  // Монеты: 30 за первые уровни, плавно растёт к 60-му (~120 на уровне 60)
  const coins = Math.round(30 + (tier - 1) * 1.5);
  return { tier, scoreRequired: tier * BATTLE_PASS_SCORE_STEP, coins, nickColor };
}

function getBattlePassConfig() {
  return {
    scoreStep: BATTLE_PASS_SCORE_STEP,
    maxTier: BATTLE_PASS_MAX_TIER,
    tiers: Array.from({ length: BATTLE_PASS_MAX_TIER }, (_, i) => getBattlePassTierDef(i + 1)),
    nickColors: [{ id: "default", label: "Стандарт", color: null }, ...BATTLE_PASS_NICK_COLORS],
  };
}

function resolveNickColorHex(entry) {
  const id = entry.stats?.activeNickColor;
  if (!id || id === "default") return null;
  return BATTLE_PASS_NICK_COLORS.find((c) => c.id === id)?.color || null;
}

// ============================================================
// GAME STATE
// ============================================================

const roomMod = require("./lib/room");

let nextClientId = 1;
const sockets = new Map(); // id -> socket
const players = new Map(); // id -> player
const food = [];
const bonuses = [];
const bosses = bossMod.createBosses(GRID);

// Map для O(1) поиска профилей по нижнему регистру имени
// lowerName -> canonicalName
const profileIndex = new Map();
let shopData = {}; // canonicalName -> profile entry

const shopClients = new Map(); // socket id -> player name
const socketSessions = new Map(); // socket id -> auth session
let leaderboard = [];
let tickCount = 0;
let tickJournal = gameSync.createJournal();
const clientAoi = new Map();
const feedLog = [];
const feedDedupe = new Map();
let feedBroadcastTimer = null;

const FEED_DEDUPE_MS = 4000;
const FEED_BROADCAST_MS = 1200;

// Occupancy set для O(1) проверки занятых клеток
const occupancySet = new Set();
function occupancyAdd(point) { occupancySet.add(`${point.x}:${point.y}`); }
function occupancyDel(point) { occupancySet.delete(`${point.x}:${point.y}`); }
function occupancyHas(point) { return occupancySet.has(`${point.x}:${point.y}`); }
function occupancyRebuild() {
  occupancySet.clear();
  for (const item of food) occupancyAdd(item);
  for (const b of bonuses) occupancyAdd(b);
  for (const player of players.values()) {
    for (const part of player.snake) occupancyAdd(part);
  }
}

let tickInterval = null;

// ============================================================
// ROOMS
// ============================================================

const rooms      = new Map(); // code -> Room
const socketRoom = new Map(); // socketId -> roomCode

function _roomDeps(room) {
  room.send                 = send;
  room.getProfile           = getProfile;
  room.persistProfile       = persistProfile;
  room.getSkinDef           = getSkinDef;
  room.startNewLife         = startNewLife;
  room.resolveNickColorHex  = resolveNickColorHex;
  room.getPlayerCosmetics   = getPlayerCosmetics;
  room.recordScore          = recordScore;
  room.awardSessionCoins    = awardSessionCoins;
  room.awardKillCoins       = awardKillCoins;
  room.trackDeathStats      = trackDeathStats;
  room.trackDisconnectStats = trackDisconnectStats;
  room.savePlayerCoins      = savePlayerCoins;
  room.getOnlineCount       = () => sockets.size;
  room.bestForName          = bestForName;
}

function createRoom(hostId, isPublic) {
  let code;
  do { code = roomMod.genCode(); } while (rooms.has(code));
  const room = new roomMod.Room({
    code, hostId, isPublic,
    onEmpty: (c) => { rooms.delete(c); },
  });
  _roomDeps(room);
  rooms.set(code, room);
  return room;
}

function getRoomOf(socketId) {
  const code = socketRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function leaveRoom(socketId) {
  const room = getRoomOf(socketId);
  if (!room) return;
  socketRoom.delete(socketId);
  room.removePlayer(socketId);
}

function joinRoom(socketId, code, name) {
  leaveRoom(socketId);
  const room = rooms.get(code);
  if (!room) return { ok: false, text: "Комната не найдена." };
  if (!room.canJoin()) return { ok: false, text: "Комната заполнена или игра уже началась." };
  const cos = getPlayerCosmetics(name);
  room.addWaiter(socketId, name, cos);
  socketRoom.set(socketId, code);
  return { ok: true, room };
}

// Публичное лобби — одна постоянная комната


// ============================================================
// PROFILE INDEX (O(1) lookup)
// ============================================================

function rebuildProfileIndex() {
  profileIndex.clear();
  for (const name of Object.keys(shopData)) {
    profileIndex.set(name.toLowerCase(), name);
  }
}

function profileIndexSet(name) {
  profileIndex.set(name.toLowerCase(), name);
}

function profileIndexDelete(name) {
  profileIndex.delete(name.toLowerCase());
}

function findCanonicalName(name) {
  if (!name) return null;
  return profileIndex.get(name.toLowerCase()) || null;
}

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
    db, shopData, getProfile, persistProfile,
    cleanName, defaultShopEntry, getRequestOrigin, sendJson,
  };

  auth.handleRequest(req, res, url, authCtx).then((handled) => {
    if (handled) return;
    handleHttpRequest(req, res, url).catch((err) => {
      console.error("HTTP handler:", err.message);
      if (!res.headersSent) { res.writeHead(500); res.end("Server error"); }
    });
  }).catch((err) => {
    console.error("HTTP:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  });
});

async function handleHttpRequest(req, res, url) {
  if (url.pathname === "/health") {
    sendJson(res, { ok: true, uptime: process.uptime(), players: players.size, sockets: sockets.size });
    return;
  }
  if (url.pathname === "/info") {
    const base = getRequestOrigin(req);
    sendJson(res, { name: "THE ULTIMATE MULTIPLAYER SNAKE ATTACK", publicUrl: base.http, wsUrl: base.ws, playersOnline: players.size });
    return;
  }
  if (url.pathname === "/leaderboard") {
    const sort = url.searchParams.get("sort");
    sendJson(res, sort === "coins" ? getWealthLeaderboard() : getEnrichedLeaderboard());
    return;
  }
  if (url.pathname === "/shop") {
    sendJson(res, { skins: SHOP_SKINS, catalog: SHOP_CATALOG, playerData: shopData });
    return;
  }
  if (url.pathname === "/catalog") {
    sendJson(res, { catalog: SHOP_CATALOG, skins: SHOP_SKINS, avatars: AVATAR_PRESETS, battlePass: getBattlePassConfig() });
    return;
  }
  if (url.pathname === "/profile") {
    const name = profileName(url.searchParams.get("name") || "");
    if (!name) { sendJson(res, { error: "no name" }); return; }
    const key = findCanonicalName(name);
    if (!key) { sendJson(res, { error: "not_found" }); return; }
    const prof = getProfile(key);
    sendJson(res, {
      id: prof.id || null, name: key, coins: prof.coins, activeSkin: prof.activeSkin,
      avatar: prof.avatar, googlePicture: prof.stats?.googlePicture || null, customAvatarUrl: prof.stats?.customAvatarUrl || null,
      stats: { games: prof.stats?.games || 0, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, best: prof.stats?.best || 0, playTimeMs: prof.stats?.playTimeMs || 0 },
    });
    return;
  }
  if (url.pathname === "/api/players") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const list = Object.entries(shopData)
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .map(([name, prof]) => {
        const p = normalizeProfile(prof);
        return { name, avatar: p.avatar, googlePicture: p.stats?.googlePicture || null, customAvatarUrl: p.stats?.customAvatarUrl || null, games: p.stats.games || 0, deaths: p.stats.deaths || 0, best: p.stats.best || 0, coins: p.coins || 0, playTimeMs: p.stats.playTimeMs || 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .slice(0, 50);
    sendJson(res, list);
    return;
  }
  if (url.pathname === "/upload_avatar" && req.method === "POST") {
    const session = await auth.getSession(req, db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return; }

    let raw;
    try { raw = await readBodyLimited(req, Math.ceil(AVATAR_UPLOAD_MAX_BYTES * 1.4)); }
    catch { res.writeHead(413); res.end("payload too large"); return; }

    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return; }

    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(body.dataUrl || ""));
    if (!match) { res.writeHead(400); res.end("expected a png/jpeg/webp data URL"); return; }

    const declaredExt = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > AVATAR_UPLOAD_MAX_BYTES) {
      res.writeHead(413); res.end(`image must be under ${(AVATAR_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(1)} MB`); return;
    }

    // Не доверяем заявленному MIME — сверяем с реальными байтами файла.
    const sniffedExt = sniffImageType(bytes);
    if (!sniffedExt || sniffedExt !== declaredExt) {
      res.writeHead(400); res.end("file content doesn't match declared image type"); return;
    }

    const name = session.player_name;
    const entry = getProfile(name);
    const oldUrl = entry.stats.customAvatarUrl;
    const filename = `${crypto.randomUUID()}.${sniffedExt}`;
    await fs.promises.writeFile(path.join(AVATARS_DIR, filename), bytes);
    entry.stats.customAvatarUrl = `/avatars/${filename}`;
    await persistProfile(name, entry);
    if (oldUrl) removeAvatarFile(oldUrl); // подчищаем старый файл, чтобы не копился мусор на диске

    sendJson(res, { ok: true, customAvatarUrl: entry.stats.customAvatarUrl });
    return;
  }

  if (url.pathname === "/remove_avatar" && req.method === "POST") {
    const session = await auth.getSession(req, db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return; }
    const entry = getProfile(session.player_name);
    if (entry.stats.customAvatarUrl) removeAvatarFile(entry.stats.customAvatarUrl);
    entry.stats.customAvatarUrl = null;
    await persistProfile(session.player_name, entry);
    sendJson(res, { ok: true });
    return;
  }

  if (url.pathname === "/report_avatar" && req.method === "POST") {
    const session = await auth.getSession(req, db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return; }

    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return; }

    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return; }

    const target = profileName(body.target);
    if (!target) { res.writeHead(400); res.end("bad request"); return; }
    if (target.toLowerCase() === session.player_name.toLowerCase()) {
      res.writeHead(400); res.end("can't report yourself"); return;
    }

    await db.reportAvatar(session.player_name, target);
    sendJson(res, { ok: true });
    return;
  }

  // ---- ADMIN API ----
  if (url.pathname.startsWith("/admin")) {
    const session = await auth.getSession(req, db).catch(() => null);
    const adminOk  = session && await db.isAdmin(session.google_id).catch(() => false);
    if (!adminOk) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }

    if (url.pathname === "/admin/players" && req.method === "GET") {
      const rows = await db.getAdminPlayerList();
      sendJson(res, rows.map((p) => ({
        name: p.name, googleId: p.google_id || null,
        coins: p.coins, isAdmin: p.is_admin,
        bestScore: p.best_score || 0,
        games: p.stats?.games || 0,
        deaths: p.stats?.deaths || 0,
        updatedAt: p.updated_at,
      })));
      return;
    }

    if (url.pathname === "/admin/set_admin" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      await new Promise((r) => req.on("end", r));
      const { name, value } = JSON.parse(body);
      if (!name) { res.writeHead(400); res.end("bad request"); return; }
      await db.setAdmin(name, Boolean(value));
      sendJson(res, { ok: true });
      return;
    }

    if (url.pathname === "/admin/delete_player" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      await new Promise((r) => req.on("end", r));
      const { name } = JSON.parse(body);
      if (!name) { res.writeHead(400); res.end("bad request"); return; }
      const target = await db.findGoogleUserByPlayerName(name).catch(() => null);
      const superIds = (process.env.ADMIN_GOOGLE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (target && superIds.includes(target.google_id)) {
        res.writeHead(403); res.end("cannot delete superadmin"); return;
      }
      await db.deletePlayer(name);
      sendJson(res, { ok: true });
      return;
    }

    if (url.pathname === "/admin/set_coins" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      await new Promise((r) => req.on("end", r));
      const { name, coins } = JSON.parse(body);
      if (!name || coins === undefined) { res.writeHead(400); res.end("bad request"); return; }
      const entry = getProfile(name);
      entry.coins = Math.max(0, Math.floor(Number(coins)));
      await persistProfile(name, entry);
      sendJson(res, { ok: true, coins: entry.coins });
      return;
    }

    if (url.pathname === "/admin/avatar_reports" && req.method === "GET") {
      const reports = await db.loadAvatarReports();
      sendJson(res, reports.map((r) => ({
        target: r.target_name,
        reports: r.reports,
        lastReportedAt: r.last_reported_at,
        hasCustomAvatar: Boolean(getProfile(r.target_name).stats?.customAvatarUrl),
      })));
      return;
    }

    if (url.pathname === "/admin/reset_avatar" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      await new Promise((r) => req.on("end", r));
      const { name } = JSON.parse(body);
      if (!name) { res.writeHead(400); res.end("bad request"); return; }
      const entry = getProfile(name);
      if (entry.stats.customAvatarUrl) removeAvatarFile(entry.stats.customAvatarUrl);
      entry.stats.customAvatarUrl = null;
      await persistProfile(name, entry);
      await db.clearAvatarReports(name);
      sendJson(res, { ok: true });
      return;
    }

    if (url.pathname === "/admin/me" && req.method === "GET") {
      sendJson(res, { name: session.player_name, googleId: session.google_id });
      return;
    }

    res.writeHead(404); res.end("not found");
    return;
  }

  const requestPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.([/\\]|$))+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store", ...corsHeaders() });
    res.end(content);
  });
}

// ============================================================
// WEBSOCKET
// ============================================================

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") { socket.destroy(); return; }

  const accept = crypto.createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = String(nextClientId++);
  sockets.set(id, socket);

  auth.getSession(req, db).then((session) => {
    if (session) {
      socketSessions.set(id, session);
      send(id, { type: "auth_ready", name: session.player_name, googleId: session.google_id });
    }
  }).catch(() => { });

  socket.on("data", (chunk) => readFrames(id, chunk));
  socket.on("close", () => removeClient(id));
  socket.on("error", () => removeClient(id));

  send(id, {
    type: "hello", id, grid: GRID,
    leaderboard: getEnrichedLeaderboard(),
    skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS,
    shopData: defaultShopEntry(),
    feed: feedLog.slice(0, 8),
    presence: gameSync.buildPresence(buildSyncCtx()),
    battlePass: getBattlePassConfig(),
  });
});

function readFrames(id, buffer) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) return;
      length = buffer.readUInt16BE(offset); offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) return;
      const h = buffer.readUInt32BE(offset); const l = buffer.readUInt32BE(offset + 4);
      length = h * 2 ** 32 + l; offset += 8;
    }

    let mask;
    if (masked) {
      if (offset + 4 > buffer.length) return;
      mask = buffer.subarray(offset, offset + 4); offset += 4;
    }
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
  if (length < 65536) {
    const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(length, 2);
    return Buffer.concat([h, payload]);
  }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(length, 6);
  return Buffer.concat([h, payload]);
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
  clientAoi.delete(id);

  // Уйти из комнаты если был в ней
  leaveRoom(id);

  const player = players.get(id);
  if (player) {
    trackDisconnectStats(player);
    recordScore(player);
    players.delete(id);
    broadcastGameSync();
    broadcastPresence();
  }
}

// ============================================================
// MESSAGE DISPATCHER
// ============================================================

// Асинхронные хендлеры — вызываются с catch
const asyncHandlers = {
  shop_connect: (id, msg) => handleShopConnect(id, msg),
  save_profile: (id, msg) => saveProfile(id, msg),
  join:         (id, msg) => handleJoin(id, msg),
  room_create:  (id, msg) => handleRoomCreate(id, msg),
  room_join:    (id, msg) => handleRoomJoin(id, msg),
  room_rejoin:  (id, msg) => handleRoomRejoin(id, msg),
  room_start:   (id, msg) => handleRoomStart(id, msg),
  room_leave:   (id, msg) => handleRoomLeave(id, msg),
};

// Синхронные хендлеры не требующие наличия player
const prePlayerHandlers = {
  ping: () => { },
  buy_item:         (id, msg) => buyItem(id, msg.itemId, msg.name),
  equip_item:       (id, msg) => equipItem(id, msg.itemId, msg.name),
  unequip_item:     (id, msg) => unequipItem(id, msg.itemId, msg.name),
  equip_nick_color: (id, msg) => equipNickColor(id, msg.colorId, msg.name),
  buy_skin:         (id, msg) => buyItem(id, msg.skinId),
  equip_skin:       (id, msg) => equipItem(id, msg.skinId),
};

// Хендлеры требующие наличия player
const playerHandlers = {
  turn: (id, msg) => {
    // Сначала пробуем комнату
    const room = getRoomOf(id);
    if (room && room.started) { room.handleTurn(id, msg.direction); return; }
    // Фоллбэк — глобальная игра
    const player = players.get(id);
    if (!player) return;
    if (player.frozenUntil && Date.now() < player.frozenUntil) return;
    const next = directionFromKey(msg.direction);
    if (next && !isOpposite(player.direction, next)) player.nextDirection = next;
  },
  restart: (id, msg) => {
    const room = getRoomOf(id);
    if (room && room.started) { room.restartPlayer(id); return; }
    const player = players.get(id);
    if (!player) return;
    recordScore(player);
    startNewLife(player.name);
    const skin = getSkinDef(getProfile(player.name).activeSkin);
    players.set(id, createPlayer(id, player.name, skin));
    sendSnapshot(id);
    forceAoiResync(id);
    broadcastGameSync();
    broadcastPresence();
  },
};


function handleMessage(id, message) {
  const { type } = message;

  if (asyncHandlers[type]) {
    asyncHandlers[type](id, message).catch((err) => console.error(`${type}:`, err.message));
    return;
  }

  if (prePlayerHandlers[type]) {
    prePlayerHandlers[type](id, message);
    return;
  }

  if (playerHandlers[type]) {
    playerHandlers[type](id, message);
  }
}

// ============================================================
// GAME LOGIC
// ============================================================

function buildSyncCtx() {
  return {
    grid: GRID, players, food, bonuses, bosses, bonusTypes: BONUS_TYPES,
    tickCount, tickMs: DEFAULT_TICK_MS,
    clientAoi, extrasFor: extrasForPlayer,
  };
}

function sendSnapshot(clientId) {
  const snap = gameSync.buildSnapshot(buildSyncCtx(), clientId);
  if (snap) send(clientId, snap);
}

function broadcastGameSync() {
  const ctx = buildSyncCtx();
  for (const clientId of players.keys()) {
    const delta = gameSync.buildDelta(ctx, clientId, tickJournal);
    if (delta) send(clientId, delta);
  }
}

function broadcastGameDelta(journal) {
  const ctx = buildSyncCtx();
  for (const clientId of players.keys()) {
    const delta = gameSync.buildDelta(ctx, clientId, journal);
    if (delta) send(clientId, delta);
  }
}

function broadcastPresence() {
  const presence = gameSync.buildPresence(buildSyncCtx());
  presence.players = sockets.size; // реальный онлайн всего сервера
  broadcast(presence);
}

function resyncPlayer(clientId) {
  sendSnapshot(clientId);
}

// Заставляет всех остальных клиентов, которые уже "видели" этого
// игрока (он был в их AOI), получить его свежую позицию как полный
// join вместо обычного mv. Нужно после респавна: broadcastGameSync()
// использует journal последнего тика, который не содержит информации
// о респавне (он произошёл вне тика), поэтому без этого другие клиенты
// продолжали бы хранить позицию игрока на месте смерти до следующего
// тика — и увидели бы резкий "телепорт" через карту при следующем mv.
function forceAoiResync(playerId) {
  for (const aoiSet of clientAoi.values()) aoiSet.delete(playerId);
}

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

function extrasForPlayer(p) {
  const cos = getPlayerCosmetics(p.name);
  return {
    best: Math.max(p.best, bestForName(p.name)),
    spawnFrozenLeft: p.frozenUntil ? Math.max(0, p.frozenUntil - Date.now()) : 0,
    heat: Math.min(100, Math.round((p.score || 0) * 0.4 + (p.combo || 0) * 9)),
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji, snakeHatId: cos.snakeHatId,
    nickColor: resolveNickColorHex(getProfile(p.name)),
  };
}

function tick() {
  if (players.size === 0) return;
  tickJournal = gameSync.createJournal();
  tickCount += 1;

  const pathCells = foodMod.getMovementPathCells(players, { GRID, tickCount });

  foodMod.fillFood({
    food, players, occupancySet, tickJournal, GRID,
    avoidCells: pathCells,
    anyBossOccupies: (pt) => bossMod.anyBossOccupies(bosses, pt),
  });

  if (tickCount % (bosses.some((b) => b.enragedTicks > 0) ? 3 : BOSS_MOVE_EVERY) === 0) {
    bossMod.moveBosses({
      bosses, players, food, tickCount, GRID,
      avoidCells: pathCells,
      pushFeed, broadcast, killPlayer,
      pushFoodItem: (item) => { food.push(item); tickJournal.foodAdded.push(gameSync.compactFood(item)); },
      removeFoodAt: (item) => {
        const idx = food.findIndex((f) => f.x === item.x && f.y === item.y);
        if (idx >= 0) {
          food.splice(idx, 1);
          tickJournal.foodRemoved.push([item.x, item.y]);
        }
      },
      createBadFood: foodMod.createBadFood,
      insideGrid: (pt) => foodMod.insideGrid(pt, GRID),
      pointKey: foodMod.pointKey,
    });
    tickJournal.bossesChanged = true;
  }

  bonusEffects.tickBonusEffects(players);
  occupancyRebuild();

  const { occupied, planned, targetCounts } = engine.planMoves(players, {
    GRID, tickCount, applySlowDown: true,
  });

  for (const player of players.values()) {
    if (!player.alive || !planned.has(player.id)) continue;
    const nextHead = planned.get(player.id);
    const key = foodMod.pointKey(nextHead);

    if (!foodMod.insideGrid(nextHead, GRID)) { killPlayer(player, "Врезался в стену"); continue; }

    const resolvedKey = key;

    if (targetCounts.get(key) > 1) { killPlayer(player, "Столкновение лоб в лоб"); continue; }

    const killerBoss = bossMod.bossAt(bosses, nextHead);
    if (killerBoss) { killPlayer(player, `${killerBoss.name} поймал змейку`, { at: nextHead, boss: killerBoss }); continue; }

    // Баффы проверяем ДО occupied — бафф важнее хвоста
    const eatenBonusIdx = bonuses.findIndex((b) => b.x === nextHead.x && b.y === nextHead.y);
    if (eatenBonusIdx >= 0) {
      const bonus = bonuses[eatenBonusIdx];
      tickJournal.bonusRemoved.push([bonus.x, bonus.y]);
      bonuses.splice(eatenBonusIdx, 1);
      activateBonus(player, bonus.bonusType);
    }

    if (player.activeBonus !== "ghost" && occupied.has(resolvedKey)) {
      const killerId = occupied.get(resolvedKey);
      const killer = killerId && killerId !== player.id ? players.get(killerId) : null;
      killPlayer(player, killer ? `${killer.name} убил ${player.name}` : "Столкнулся со змейкой", { at: nextHead, killerPlayer: killer });
      continue;
    }

    const eatenIdx = food.findIndex((item) => item.x === nextHead.x && item.y === nextHead.y);
    const eaten = eatenIdx >= 0 ? food[eatenIdx] : null;
    player._grewTick = Boolean(eaten);
    player.snake.unshift(nextHead);

    if (eaten) {
      tickJournal.foodRemoved.push([eaten.x, eaten.y]);
      food.splice(eatenIdx, 1);
      if (eaten.good) {
        player.combo = (player.combo || 0) + 1;
        player.maxCombo = Math.max(player.maxCombo || 0, player.combo);
        let mult = bonusEffects.comboMultiplier(player.combo);
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

    tickJournal.moves.push(gameSync.packPlayerMove(player));
    tickJournal.meta.push(gameSync.packPlayerMeta(player, extrasForPlayer(player)));
  }

  broadcastGameSync();
}

function activateBonus(player, bonusType) {
  bonusEffects.activateBonus(player, bonusType, BONUS_TYPES, (def) => {
    pushFeed("bonus", `⚡ ${player.name} → ${def.label}`, player.name);
    broadcast({ type: "notice", text: `${player.name} получил бонус ${def.label} ${def.desc}!` });
  });
}

function spawnBonuses() {
  const spawn = bonusEffects.pickBonusSpawn({
    players, bonuses, food, bosses, occupancySet,
    foodMod, bossMod, GRID, BONUS_TYPES,
  });
  if (!spawn) return;
  const { point, bonusType } = spawn;
  bonuses.push({ ...point, bonusType, spawnedAt: Date.now() });

  const journal = gameSync.createJournal();
  journal.bonusAdded.push(gameSync.compactBonus({ x: point.x, y: point.y, bonusType }, BONUS_TYPES));
  broadcastGameDelta(journal);

  setTimeout(() => {
    const idx = bonuses.findIndex((b) => b.x === point.x && b.y === point.y);
    if (idx >= 0) {
      const b = bonuses[idx];
      bonuses.splice(idx, 1);
      const expJournal = gameSync.createJournal();
      expJournal.bonusRemoved.push([b.x, b.y]);
      broadcastGameDelta(expJournal);
    }
  }, 15000);
}

function killPlayer(player, reason, opts = {}) {
  if (!player.alive) return;
  tickJournal.deaths.push(player.id);
  trackDeathStats(player);
  player.alive = false;
  player.deaths += 1;
  player.reason = opts.killerPlayer ? `${opts.killerPlayer.name} убил тебя` : reason;
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
  if (opts.killerPlayer?.alive) {
    awardKillCoins(opts.killerPlayer, player);
  } else if (opts.killerPlayer) {
    pushFeed("kill", `⚔ ${opts.killerPlayer.name} убил ${player.name}`, opts.killerPlayer.name);
  } else {
    pushFeed("death", `💀 ${player.name}: ${reason}`, player.name);
  }
  const hitCell = opts.at || player.snake[0];
  const killerBoss = opts.boss || bossMod.bossAt(bosses, hitCell) || bosses.find((b) => reason.includes(b.name));
  if (killerBoss) bossMod.enrageBoss(killerBoss, bosses, pushFeed, broadcast);
}

function recordScore(player) {
  if (!player || player.score <= 0) return;
  const existing = leaderboard.find((e) => e.name.toLowerCase() === player.name.toLowerCase());
  if (!existing || player.score > existing.score) {
    if (existing) { existing.score = player.score; existing.date = new Date().toISOString(); }
    else leaderboard.push({ name: player.name, score: player.score, date: new Date().toISOString() });
    leaderboard.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    leaderboard = leaderboard.slice(0, MAX_LEADERS);
    persistLeaderboardEntry(player.name, player.score);
    broadcast({ type: "leaderboard", leaderboard: getEnrichedLeaderboard() });
  }
}

// ============================================================
// PLAYER CREATION
// ============================================================

function createPlayer(id, name, skin) {
  const layout = foodMod.findSpawnLayout({
    players, food, bonuses, GRID,
    anyBossOccupies: (pt) => bossMod.anyBossOccupies(bosses, pt),
    distanceToNearestBoss: (pt) => bossMod.distanceToNearestBoss(bosses, pt),
    BOSS_SPAWN_BUFFER,
  });
  const direction = layout?.direction || { x: 1, y: 0 };
  const snake = layout?.snake || [{ x: Math.floor(GRID.width / 2), y: Math.floor(GRID.height / 2) }];

  foodMod.clearBoardAroundSpawn(snake[0], { food, bonuses });
  const shopEntry = getProfile(name);
  const cos = getPlayerCosmetics(name);

  const player = {
    id, name,
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
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji, snakeHatId: cos.snakeHatId,
    nickColor: resolveNickColorHex(shopEntry),
    frozenUntil: Date.now() + SPAWN_FREEZE_MS,
  };

  foodMod.removeEntitiesUnderSnake(player, { food, bonuses });
  return player;
}

function applySkinToPlayer(player, skin) {
  player.skin = skin.id;
  player.color = skin.color !== "rainbow" ? skin.color : COLORS[(Number(player.id) - 1) % COLORS.length];
  player.headColor = skin.headColor || "#ffffff";
  player.rainbow = skin.color === "rainbow";
}

// ============================================================
// SHOP / PROFILE
// ============================================================

function getSkinDef(id) {
  const item = SHOP_CATALOG.find((i) => i.id === id && i.category === "skin");
  if (!item) return getSkinDef("default");
  return { id: item.id, label: item.name, price: item.price, color: item.color, headColor: item.headColor, trailColor: item.color };
}

function ownsItem(entry, itemId) {
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return false;
  if (Number(item.price) === 0) return true;
  return entry.inventory.includes(itemId);
}

function getProfile(name) {
  if (!name) return defaultShopEntry();
  const canonical = findCanonicalName(name) || name;
  return normalizeProfile(shopData[canonical] || defaultShopEntry());
}

function profileName(name) {
  const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return v || null;
}

function defaultShopEntry() {
  return normalizeProfile({ coins: 0, unlockedSkins: ["default"], activeSkin: "default" });
}

function normalizeProfile(raw) {
  const entry = {
    id: raw.id || null,
    googleId: raw.googleId || raw.google_id || null,
    coins: Number(raw.coins) || 0,
    unlockedSkins: raw.unlockedSkins || ["default"],
    activeSkin: raw.activeSkin || "default",
    avatar: AVATAR_PRESETS.includes(raw.avatar) ? raw.avatar : "😎",
    inventory: Array.isArray(raw.inventory) ? [...raw.inventory] : [],
    equipped: { snakeHat: raw.equipped?.snakeHat || null },
    stats: {
      games: raw.stats?.games || 0,
      deaths: raw.stats?.deaths ?? raw.stats?.losses ?? 0,
      kills: raw.stats?.kills || 0,
      best: raw.stats?.best || 0,
      playTimeMs: raw.stats?.playTimeMs || 0,
      sessionStart: raw.stats?.sessionStart || null,
      googlePicture: raw.stats?.googlePicture || null,
      customAvatarUrl: raw.stats?.customAvatarUrl || null,
      battlePassScore: raw.stats?.battlePassScore || 0,
      battlePassClaimed: Array.isArray(raw.stats?.battlePassClaimed) ? [...raw.stats.battlePassClaimed] : [],
      battlePassUnlocked: Array.isArray(raw.stats?.battlePassUnlocked) ? [...raw.stats.battlePassUnlocked] : [],
      activeNickColor: raw.stats?.activeNickColor || null,
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

function persistProfile(name, entry) {
  shopData[name] = entry;
  profileIndexSet(name);
  return db.upsertPlayer(name, entry).then((id) => {
    if (id) entry.id = id;
    shopData[name] = entry;
    return entry;
  }).catch((err) => { console.error("DB player:", err.message); return entry; });
}

function persistLeaderboardEntry(name, score) {
  db.upsertLeaderboard(name, score).catch((err) => console.error("DB leaderboard:", err.message));
}

function startNewLife(name) {
  const entry = getProfile(name);
  entry.stats.games = (entry.stats.games || 0) + 1;
  entry.stats.sessionStart = Date.now();
  shopData[name] = entry;
  profileIndexSet(name);
  persistProfile(name, entry);
}

function syncProfileCoins(name, entry) {
  if (!entry || !name) return 0;
  let coins = Number(entry.coins) || 0;
  const lower = name.toLowerCase();
  for (const p of players.values()) {
    if (p.name.toLowerCase() === lower) coins = Math.max(coins, Number(p.coins) || 0);
  }
  entry.coins = coins;
  return coins;
}

function sendShopPayload(clientId, name) {
  const entry = getProfile(name);
  syncProfileCoins(name, entry);
  shopData[name] = entry;
  send(clientId, { type: "shop_update", shopData: entry, skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS, battlePass: getBattlePassConfig() });
}

function resolveName(clientId, hint) {
  const session = socketSessions.get(clientId);
  if (session?.player_name) return session.player_name;
  return profileName(hint) || players.get(clientId)?.name || shopClients.get(clientId) || null;
}

async function isNameTaken(name, exceptName = null) {
  const n = profileName(name);
  if (!n) return true;
  const lower = n.toLowerCase();
  if (exceptName && exceptName.toLowerCase() === lower) return false;
  if (profileIndex.has(lower)) return true;
  return db.isPlayerNameTaken(n, exceptName);
}

async function resolvePlayName(id, requestedName) {
  const session = socketSessions.get(id);
  if (session) return { ok: true, name: session.player_name };
  const name = profileName(requestedName);
  if (!name) return { ok: false, text: "Укажи никнейм в профиле!" };
  // Не блокируем имя если оно уже принадлежит этому сокету
  // (учитываем shopClients, players, и само переданное имя если профиль уже существует)
  const currentName = shopClients.get(id) || players.get(id)?.name || null;
  const exceptName  = currentName || (profileIndex.has(name.toLowerCase()) ? name : null);
  if (await isNameTaken(name, exceptName)) return { ok: false, text: "Это имя уже занято! Войди через Google в профиле." };
  return { ok: true, name };
}

async function handleShopConnect(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) { send(id, { type: "notice", text: resolved.text }); return; }
  shopClients.set(id, resolved.name);
  sendShopPayload(id, resolved.name);
}

// ============================================================
// ROOM HANDLERS
// ============================================================

async function handleRoomCreate(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) { send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  // Регистрируем имя в shopClients если ещё нет
  if (!shopClients.has(id)) shopClients.set(id, name);
  leaveRoom(id);
  const room = createRoom(id, false);
  const cos  = getPlayerCosmetics(name);
  room.addWaiter(id, name, cos);
  socketRoom.set(id, room.code);
  send(id, { ...room.lobbySnapshot(), type: "room_created", code: room.code });
}

async function handleRoomJoin(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) { send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  if (!shopClients.has(id)) shopClients.set(id, name);
  const code = String(message.code || "").toUpperCase().trim();
  const result = joinRoom(id, code, name);
  if (!result.ok) { send(id, { type: "room_error", text: result.text }); return; }
  send(id, { type: "room_joined", code, ...result.room.lobbySnapshot() });
}

async function handleRoomRejoin(id, message) {
  // Игрок перешёл из rooms.html в game.html — переподключаем к уже запущенной комнате
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) { send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  const code = String(message.code || "").toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) { send(id, { type: "notice", text: "Комната не найдена." }); sendJoinFallback(id, name); return; }

  if (!shopClients.has(id)) shopClients.set(id, name);
  socketRoom.set(id, code);

  if (room.started) {
    // Комната уже запущена — обновляем socket в players и шлём снэпшот
    const existing = [...room.players.entries()].find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const [oldId, player] = existing;
      if (oldId !== id) {
        room.players.delete(oldId);
        room.clientAoi.delete(oldId);
        player.id = id;
        room.players.set(id, player);
      }
    } else {
      // Новый игрок заходит в уже запущенную комнату
      const prof = getProfile(name);
      const skin = getSkinDef(prof.activeSkin);
      const cos  = getPlayerCosmetics(name);
      if (startNewLife) startNewLife(name);
      room.players.set(id, room._createPlayer(id, name, skin, cos));
    }
    room._sendSnapshot(id);
  } else {
    // Комната есть но не запущена — добавляем в лобби
    const cos = getPlayerCosmetics(name);
    room.addWaiter(id, name, cos);
    room.broadcastLobby();
  }
}

function sendJoinFallback(id, name) {
  // Комната пропала — кидаем в обычную игру
  const prof = getProfile(name);
  const skin = getSkinDef(prof.activeSkin);
  startNewLife(name);
  players.set(id, createPlayer(id, name, "normal", skin));
  sendSnapshot(id);
  forceAoiResync(id);
  broadcastGameSync();
}

async function handleRoomStart(id, message) {
  const room = getRoomOf(id);
  if (!room) { send(id, { type: "room_error", text: "Вы не в комнате." }); return; }
  const result = room.start(id);
  if (!result.ok) { send(id, { type: "room_error", text: result.text }); return; }
}

async function handleRoomLeave(id, message) {
  leaveRoom(id);
  send(id, { type: "room_left" });
}

async function handleJoin(id, message) {
  const resolved = await resolvePlayName(id, message.name);
  if (!resolved.ok) { send(id, { type: "notice", text: resolved.text }); return; }
  const name = resolved.name;
  const prof = getProfile(name);
  const skin = getSkinDef(prof.activeSkin);
  startNewLife(name);
  shopClients.set(id, name);
  players.set(id, createPlayer(id, name, skin));
  sendSnapshot(id);
  forceAoiResync(id);
  broadcastGameSync();
  broadcastPresence();
}

async function saveProfile(clientId, message) {
  const session = socketSessions.get(clientId);
  const newName = profileName(message.name);
  if (!newName) { send(clientId, { type: "notice", text: "Никнейм не может быть пустым!" }); return; }
  if (!session) { send(clientId, { type: "notice", text: "Войди через Google, чтобы редактировать профиль." }); return; }

  const oldName = session.player_name;
  const avatar = AVATAR_PRESETS.includes(message.avatar) ? message.avatar : "😎";
  let entry = getProfile(oldName);
  entry.avatar = avatar;
  syncProfileCoins(oldName, entry);
  if (session.google_id) entry.googleId = session.google_id;
  if (!entry.id) await persistProfile(oldName, entry);

  if (oldName.toLowerCase() !== newName.toLowerCase()) {
    if (await isNameTaken(newName, oldName)) { send(clientId, { type: "notice", text: "Это имя уже занято!" }); return; }
    syncProfileCoins(oldName, entry);
    delete shopData[oldName];
    profileIndexDelete(oldName);
    shopClients.set(clientId, newName);
    const player = players.get(clientId);
    if (player) player.name = newName;
    shopData[newName] = entry;
    profileIndexSet(newName);
    session.player_name = newName;
    socketSessions.set(clientId, session);
    await db.updateGoogleUserPlayerName(session.google_id, newName);
    await db.renamePlayer(oldName, newName, entry);
  } else {
    syncProfileCoins(newName, entry);
    if (session.google_id) entry.googleId = session.google_id;
    shopData[newName] = entry;
    await persistProfile(newName, entry);
  }

  send(clientId, { type: "profile_saved", shopData: entry, name: newName, playerId: entry.id || null });
  sendShopPayload(clientId, newName);
}

function buyItem(clientId, itemId, nameHint) {
  const name = resolveName(clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = getProfile(name);
  const player = players.get(clientId);
  syncProfileCoins(name, entry);
  const coins = Number(entry.coins) || 0;
  const price = Number(item.price) || 0;

  if (entry.inventory.includes(itemId)) { equipItem(clientId, itemId, name); return; }
  if (price === 0) {
    if (!entry.inventory.includes(itemId)) entry.inventory.push(itemId);
    shopData[name] = entry;
    persistProfile(name, entry);
    equipItem(clientId, itemId, name);
    return;
  }
  if (coins < price) { send(clientId, { type: "notice", text: "Недостаточно монет!" }); sendShopPayload(clientId, name); return; }

  const newCoins = coins - price;
  if (player) player.coins = newCoins;
  entry.coins = newCoins;
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
  if (!ownsItem(entry, itemId)) { send(clientId, { type: "notice", text: "Сначала купи предмет!" }); return; }
  const player = players.get(clientId);

  if (item.category === "skin") {
    entry.activeSkin = entry.activeSkin === itemId && itemId !== "default" ? "default" : itemId;
    if (player) applySkinToPlayer(player, getSkinDef(entry.activeSkin));
  } else if (item.category === "snake_hat") {
    entry.equipped.snakeHat = entry.equipped.snakeHat === itemId ? null : itemId;
    applyCosmeticsToPlayer(player, name);
  }

  syncProfileCoins(name, entry);
  shopData[name] = entry;
  persistProfile(name, entry);
  sendShopPayload(clientId, name);
  if (player) resyncPlayer(clientId);
  broadcastGameSync();
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
  if (player) resyncPlayer(clientId);
  broadcastGameSync();
}

function equipNickColor(clientId, colorId, nameHint) {
  const name = resolveName(clientId, nameHint);
  if (!name) return;
  const entry = getProfile(name);

  if (!colorId || colorId === "default") {
    entry.stats.activeNickColor = null;
  } else if (!entry.stats.battlePassUnlocked?.includes(colorId)) {
    send(clientId, { type: "notice", text: "Сначала открой цвет в боевом пропуске!" }); return;
  } else {
    entry.stats.activeNickColor = colorId;
  }

  shopData[name] = entry;
  persistProfile(name, entry);
  const player = players.get(clientId);
  if (player) { applyCosmeticsToPlayer(player, name); resyncPlayer(clientId); broadcastGameSync(); }
  sendShopPayload(clientId, name);
}

function getPlayerCosmetics(name) {
  const entry = getProfile(name);
  const hatId = entry.equipped.snakeHat || null;
  const hatItem = hatId ? SHOP_CATALOG.find((i) => i.id === hatId) : null;
  const isCustom = hatId?.startsWith("custom_hat_");
  return { avatar: entry.avatar, snakeHatId: hatId, snakeHatEmoji: hatItem && !isCustom ? hatItem.emoji : null };
}

function applyCosmeticsToPlayer(player, name) {
  if (!player) return;
  const cos = getPlayerCosmetics(name);
  const entry = getProfile(name);
  player.avatar = cos.avatar;
  player.snakeHatEmoji = cos.snakeHatEmoji;
  player.snakeHatId = cos.snakeHatId;
  player.nickColor = resolveNickColorHex(entry);
}

function savePlayerCoins(player) {
  const entry = getProfile(player.name);
  entry.coins = player.coins;
  shopData[player.name] = entry;
  persistProfile(player.name, entry);
}

// ============================================================
// STATS & REWARDS
// ============================================================

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
  entry.stats.battlePassScore = (entry.stats.battlePassScore || 0) + (player.score || 0);
  shopData[player.name] = entry;
  persistProfile(player.name, entry);
  processBattlePassRewards(player.name, entry);
}

function trackDisconnectStats(player) {
  const entry = getProfile(player.name);
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  if (player.alive && player.score > 0) {
    entry.stats.battlePassScore = (entry.stats.battlePassScore || 0) + player.score;
    processBattlePassRewards(player.name, entry);
  }
  shopData[player.name] = entry;
  persistProfile(player.name, entry);
}

function awardSessionCoins(player) {
  const score = player.score || 0;
  if (score <= 0) return 0;
  // Базовая формула: 10 * (score/100)^1.5
  // score=100  → 10 монет
  // score=500  → ~111 монет
  // score=1000 → ~316 монет
  // score=3000 → ~1643 монет (без кэпа)
  let coins = Math.floor(10 * Math.pow(score / 100, 1.5));
  // Бонусы сверху (небольшие, не ломают кривую)
  if (player.beatPersonalBest) coins += 20;
  if (player.sessionMvp) coins += 15;
  coins += Math.floor((player.maxCombo || 0) * 1.5);
  return Math.max(1, coins);
}

function awardKillCoins(killer, victim) {
  killer.coins = (killer.coins || 0) + KILL_REWARD_COINS;
  const entry = getProfile(killer.name);
  entry.stats.kills = (entry.stats.kills || 0) + 1;
  entry.coins = killer.coins;
  shopData[killer.name] = entry;
  persistProfile(killer.name, entry);
  pushFeed("kill", `💰 ${killer.name}: +${KILL_REWARD_COINS} за убийство ${victim.name}`, killer.name);
  send(killer.id, { type: "notice", text: `+${KILL_REWARD_COINS} монет за убийство!` });
}

function processBattlePassRewards(name, entry) {
  entry.stats.battlePassClaimed = entry.stats.battlePassClaimed || [];
  entry.stats.battlePassUnlocked = entry.stats.battlePassUnlocked || [];
  const granted = [];

  for (let tier = 1; tier <= BATTLE_PASS_MAX_TIER; tier++) {
    if ((entry.stats.battlePassScore || 0) < tier * BATTLE_PASS_SCORE_STEP) break;
    if (entry.stats.battlePassClaimed.includes(tier)) continue;
    const def = getBattlePassTierDef(tier);
    entry.stats.battlePassClaimed.push(tier);
    entry.coins = (Number(entry.coins) || 0) + def.coins;

    if (def.nickColor && def.nickColor.id && !entry.stats.battlePassUnlocked.includes(def.nickColor.id)) {
      entry.stats.battlePassUnlocked.push(def.nickColor.id);
    }

    granted.push(def);

    let colorText = "";
    if (def.nickColor && def.nickColor.label) {
      colorText = `, цвет «${def.nickColor.label}»`;
    }
    pushFeed("bonus", `🎖 ${name}: боевой пропуск ур.${tier} — +${def.coins}🪙${colorText}`, name);
  }

  if (!granted.length) return granted;
  shopData[name] = entry;
  persistProfile(name, entry);

  for (const p of players.values()) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    p.coins = entry.coins;
    send(p.id, { type: "notice", text: `Боевой пропуск: +${granted.reduce((s, r) => s + r.coins, 0)} монет!` });
    sendShopPayload(p.id, name);
    resyncPlayer(p.id);
  }
  for (const [clientId, clientName] of shopClients) {
    if (clientName.toLowerCase() === name.toLowerCase() && !players.has(clientId)) {
      sendShopPayload(clientId, name);
    }
  }
  return granted;
}

// ============================================================
// LEADERBOARD
// ============================================================

function getEnrichedLeaderboard() {
  return leaderboard.map((e, index) => {
    const prof = getProfile(e.name);
    return { ...e, rank: index + 1, avatar: prof.avatar, googlePicture: prof.stats?.googlePicture || null, customAvatarUrl: prof.stats?.customAvatarUrl || null, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, games: prof.stats?.games || 0, best: Math.max(e.score, prof.stats?.best || 0), coins: prof.coins || 0 };
  });
}

function getWealthLeaderboard() {
  return Object.entries(shopData)
    .map(([name, prof]) => ({ name, coins: prof.coins || 0, score: prof.coins || 0, avatar: prof.avatar || "😎", googlePicture: prof.stats?.googlePicture || null, customAvatarUrl: prof.stats?.customAvatarUrl || null, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, games: prof.stats?.games || 0, best: prof.stats?.best || 0 }))
    .filter((e) => e.coins > 0)
    .sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name, "ru"))
    .slice(0, MAX_LEADERS)
    .map((e, index) => ({ ...e, rank: index + 1 }));
}

// ============================================================
// BOOTSTRAP & SHUTDOWN
// ============================================================

async function bootstrap() {
  try {
    await db.init();
    shopData = await db.loadAllPlayers();
    leaderboard = await db.loadLeaderboard(MAX_LEADERS);
    rebuildProfileIndex();
    console.log(`PostgreSQL: ${Object.keys(shopData).length} игроков, ${leaderboard.length} рекордов`);
  } catch (err) {
    console.error("PostgreSQL недоступен:", err.message);
    console.error("Проверь DATABASE_URL и что база запущена. Пример: npm run db:reset");
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    food.length = 0;
    foodMod.fillFood({
      food, players, occupancySet, tickJournal: gameSync.createJournal(), GRID,
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(bosses, pt),
    });
    tickInterval = setInterval(tick, DEFAULT_TICK_MS);
    setInterval(spawnBonuses, 8000);
    setInterval(broadcastPresence, 5000);
    setInterval(pingClients, 25000);
    setInterval(() => db.cleanupAuthSessions().catch(() => { }), 60 * 60 * 1000);

    if (auth.isGoogleAuthEnabled()) {
      const sampleRedirect = process.env.GOOGLE_REDIRECT_URI
        || (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/auth/google/callback` : "(из запроса)");
      console.log("Google OAuth: включён");
      console.log(`Google OAuth redirect: ${sampleRedirect}`);
    } else {
      console.log("Google OAuth: выключен (заполни GOOGLE_CLIENT_ID/SECRET в .env)");
    }
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
  if (tickInterval) clearInterval(tickInterval);
  for (const socket of sockets.values()) { try { socket.destroy(); } catch { /* ignore */ } }
  server.close(() => { db.close().finally(() => process.exit(0)); });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ============================================================
// UTILS
// ============================================================

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

function bestForName(name) {
  return leaderboard.find((e) => e.name.toLowerCase() === name.toLowerCase())?.score || 0;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
}

function directionFromKey(d) {
  return ({ up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[d] || null;
}

function isOpposite(a, b) { return a.x + b.x === 0 && a.y + b.y === 0; }
function cleanName(name) { const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 18); return v || `Игрок ${nextClientId - 1}`; }

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}

function sendJson(res, payload) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(payload));
}

// Читаем тело запроса с жёстким лимитом байт — иначе злоумышленник может
// стримить сколько угодно данных и посадить память процесса.
function readBodyLimited(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error("payload_too_large")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
