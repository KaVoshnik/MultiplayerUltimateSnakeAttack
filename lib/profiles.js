"use strict";

const achievementsMod = require("./achievements");
const foodMod = require("./food");
const { SHOP_CATALOG, AVATAR_PRESETS } = require("../data/shop-catalog");
const { resolveNickColorHex } = require("../data/battle-pass");

const TOTAL_SKINS_COUNT = SHOP_CATALOG.filter((i) => i.category === "skin").length;

// ============================================================
// ИМЕНА / ИНДЕКС ПРОФИЛЕЙ
// ============================================================

function profileName(name) {
  const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 16);
  return v || null;
}

function rebuildProfileIndex(ctx) {
  ctx.profileIndex.clear();
  for (const name of Object.keys(ctx.shopData)) {
    ctx.profileIndex.set(name.toLowerCase(), name);
  }
}

function profileIndexSet(ctx, name) {
  ctx.profileIndex.set(name.toLowerCase(), name);
}

function profileIndexDelete(ctx, name) {
  ctx.profileIndex.delete(name.toLowerCase());
}

function findCanonicalName(ctx, name) {
  if (!name) return null;
  return ctx.profileIndex.get(name.toLowerCase()) || null;
}

function isPlayerOnline(ctx, name) {
  const lower = name.toLowerCase();
  for (const clientName of ctx.shopClients.values()) {
    if (clientName && clientName.toLowerCase() === lower) return true;
  }
  return false;
}

function findSocketIdsByName(ctx, name) {
  const lower = name.toLowerCase();
  const ids = [];
  for (const [id, clientName] of ctx.shopClients) {
    if (clientName && clientName.toLowerCase() === lower) ids.push(id);
  }
  return ids;
}

// Возвращает { code, joinable } если игрок сейчас сидит в приватной комнате,
// иначе null. Смотрим через все его открытые сокеты (может быть открыто
// несколько вкладок).
function getPlayerRoomInfo(ctx, name) {
  for (const id of findSocketIdsByName(ctx, name)) {
    const code = ctx.socketRoom.get(id);
    const room = code && ctx.rooms.get(code);
    if (room) return { code, joinable: room.canJoin() };
  }
  return null;
}

// ============================================================
// ПРОФИЛЬ: ЧТЕНИЕ / НОРМАЛИЗАЦИЯ / ЗАПИСЬ
// ============================================================

function defaultShopEntry() {
  return normalizeProfile({ coins: 0, unlockedSkins: ["default"], activeSkin: "default" });
}

function normalizeProfile(raw) {
  const entry = {
    id: raw.id || null,
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
      customAvatarUrl: raw.stats?.customAvatarUrl || null,
      battlePassScore: raw.stats?.battlePassScore || 0,
      battlePassClaimed: Array.isArray(raw.stats?.battlePassClaimed) ? [...raw.stats.battlePassClaimed] : [],
      battlePassUnlocked: Array.isArray(raw.stats?.battlePassUnlocked) ? [...raw.stats.battlePassUnlocked] : [],
      activeNickColor: raw.stats?.activeNickColor || null,
      streak: raw.stats?.streak || 0,
      bestStreak: raw.stats?.bestStreak || 0,
      lastStreakDate: raw.stats?.lastStreakDate || null,
      unlockedAchievements: Array.isArray(raw.stats?.unlockedAchievements) ? [...raw.stats.unlockedAchievements] : [],
      dailyChestAvailable: raw.stats?.dailyChestAvailable || false,
      dailyChestDate: raw.stats?.dailyChestDate || null,
      // Персистентный инвентарь еды — живёт в аккаунте, не в одной жизни змейки.
      foodInventory: {
        ...Object.fromEntries(foodMod.GOOD_FOOD_KINDS.map((k) => [k, 0])),
        ...(raw.stats?.foodInventory && typeof raw.stats.foodInventory === "object" ? raw.stats.foodInventory : {}),
      },
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

function getProfile(ctx, name) {
  if (!name) return defaultShopEntry();
  const canonical = findCanonicalName(ctx, name) || name;
  return normalizeProfile(ctx.shopData[canonical] || defaultShopEntry());
}

function persistProfile(ctx, name, entry) {
  ctx.shopData[name] = entry;
  profileIndexSet(ctx, name);
  return ctx.db.upsertPlayer(name, entry).then((id) => {
    if (id) entry.id = id;
    ctx.shopData[name] = entry;
    return entry;
  }).catch((err) => { console.error("DB player:", err.message); return entry; });
}

// Считаем стрик по календарным дням (UTC), идемпотентно в рамках одного дня —
// startNewLife может дёргаться много раз за день (респауны), это не проблема.
function touchDailyStreak(entry) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (entry.stats.lastStreakDate === today) return;
  const oneDay = 24 * 60 * 60 * 1000;
  const last = entry.stats.lastStreakDate;
  const gapDays = last ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / oneDay) : null;
  entry.stats.streak = gapDays === 1 ? (entry.stats.streak || 0) + 1 : 1;
  entry.stats.bestStreak = Math.max(entry.stats.bestStreak || 0, entry.stats.streak);
  entry.stats.lastStreakDate = today;
  entry.stats.dailyChestAvailable = true;
  entry.stats.dailyChestDate = today;
}

function countOwnedSkins(entry) {
  return entry.inventory.filter((id) => SHOP_CATALOG.some((i) => i.id === id && i.category === "skin")).length;
}

// Проверяет ачивки и, если что-то разблокировалось, персистит профиль и
// толкает тост игроку (если у него сейчас открыт сокет).
async function checkAchievements(ctx, name, entry, extraCtx = {}) {
  const achCtx = { skinsCount: countOwnedSkins(entry), totalSkins: TOTAL_SKINS_COUNT, ...extraCtx };
  const fresh = achievementsMod.evaluateAchievements(entry, achCtx);
  if (fresh.length === 0) return fresh;
  await persistProfile(ctx, name, entry);
  for (const id of findSocketIdsByName(ctx, name)) {
    for (const ach of fresh) {
      ctx.send(id, { type: "achievement_unlocked", achievement: { id: ach.id, name: ach.name, desc: ach.desc, icon: ach.icon } });
    }
  }
  return fresh;
}

function startNewLife(ctx, name) {
  const entry = getProfile(ctx, name);
  entry.stats.games = (entry.stats.games || 0) + 1;
  entry.stats.sessionStart = Date.now();
  touchDailyStreak(entry);
  ctx.shopData[name] = entry;
  profileIndexSet(ctx, name);
  persistProfile(ctx, name, entry);
  checkAchievements(ctx, name, entry).catch((err) => console.error("Achievements:", err.message));
}

function syncProfileCoins(ctx, name, entry) {
  if (!entry || !name) return 0;
  let coins = Number(entry.coins) || 0;
  const lower = name.toLowerCase();
  for (const p of ctx.players.values()) {
    if (p.name.toLowerCase() === lower) coins = Math.max(coins, Number(p.coins) || 0);
  }
  entry.coins = coins;
  return coins;
}

function savePlayerCoins(ctx, player) {
  const entry = getProfile(ctx, player.name);
  entry.coins = player.coins;
  ctx.shopData[player.name] = entry;
  persistProfile(ctx, player.name, entry);
}

// ============================================================
// СКИНЫ / КОСМЕТИКА
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

function getPlayerCosmetics(ctx, name) {
  const entry = getProfile(ctx, name);
  const hatId = entry.equipped.snakeHat || null;
  const hatItem = hatId ? SHOP_CATALOG.find((i) => i.id === hatId) : null;
  const isCustom = hatId?.startsWith("custom_hat_");
  return { avatar: entry.avatar, snakeHatId: hatId, snakeHatEmoji: hatItem && !isCustom ? hatItem.emoji : null };
}

function applyCosmeticsToPlayer(ctx, player, name) {
  if (!player) return;
  const cos = getPlayerCosmetics(ctx, name);
  const entry = getProfile(ctx, name);
  player.avatar = cos.avatar;
  player.snakeHatEmoji = cos.snakeHatEmoji;
  player.snakeHatId = cos.snakeHatId;
  player.nickColor = resolveNickColorHex(entry);
}

// ============================================================
// РАЗРЕШЕНИЕ ИМЕНИ ИГРОКА
// ============================================================

function resolveName(ctx, clientId, hint) {
  const session = ctx.socketSessions.get(clientId);
  if (session?.player_name) return session.player_name;
  return profileName(hint) || ctx.players.get(clientId)?.name || ctx.shopClients.get(clientId) || null;
}

async function isNameTaken(ctx, name, exceptName = null) {
  const n = profileName(name);
  if (!n) return true;
  const lower = n.toLowerCase();
  if (exceptName && exceptName.toLowerCase() === lower) return false;
  if (ctx.profileIndex.has(lower)) return true;
  return ctx.db.isPlayerNameTaken(n, exceptName);
}

async function resolvePlayName(ctx, id, requestedName) {
  const session = ctx.socketSessions.get(id);
  const name = session ? session.player_name : profileName(requestedName);
  if (!name) return { ok: false, text: "Укажи никнейм в профиле!" };

  // try/catch, а не .catch() на цепочке промисов: если db.getActiveBan вообще
  // не существует (например при частичном деплое — server.js уже новый,
  // а db.js ещё старый), вызов кинет TypeError СИНХРОННО, до того как .catch
  // успеет на что-то подписаться — и тогда join молча падает целиком для
  // абсолютно всех, а не только для забаненных. Бан-система не должна иметь
  // возможность уронить вход в игру всем остальным — fail-open с логом.
  try {
    const ban = await ctx.db.getActiveBan(name);
    if (ban) {
      const text = ban.banned_until
        ? `Вы забанены до ${new Date(ban.banned_until).toLocaleString("ru-RU")}${ban.reason ? `. Причина: ${ban.reason}` : ""}`
        : `Вы забанены навсегда${ban.reason ? `. Причина: ${ban.reason}` : ""}`;
      return { ok: false, text };
    }
  } catch (err) {
    console.error("resolvePlayName: ban check failed, failing open —", err.message);
  }

  if (session) return { ok: true, name };
  // Не блокируем имя если оно уже принадлежит этому сокету
  // (учитываем shopClients, players, и само переданное имя если профиль уже существует)
  const currentName = ctx.shopClients.get(id) || ctx.players.get(id)?.name || null;
  const exceptName = currentName || (ctx.profileIndex.has(name.toLowerCase()) ? name : null);
  if (await isNameTaken(ctx, name, exceptName)) return { ok: false, text: "Это имя уже занято." };
  return { ok: true, name };
}

module.exports = {
  TOTAL_SKINS_COUNT,
  profileName,
  rebuildProfileIndex,
  profileIndexSet,
  profileIndexDelete,
  findCanonicalName,
  isPlayerOnline,
  findSocketIdsByName,
  getPlayerRoomInfo,
  defaultShopEntry,
  normalizeProfile,
  getProfile,
  persistProfile,
  touchDailyStreak,
  countOwnedSkins,
  checkAchievements,
  startNewLife,
  syncProfileCoins,
  savePlayerCoins,
  getSkinDef,
  ownsItem,
  getPlayerCosmetics,
  applyCosmeticsToPlayer,
  resolveName,
  isNameTaken,
  resolvePlayName,
};
