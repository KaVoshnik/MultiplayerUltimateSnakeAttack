"use strict";

const GRID = { width: 210, height: 140 };

const SPAWN_FREEZE_MS = 3000;

const DEFAULT_TICK_MS = 115;

const BAD_FOOD_RATIO = 0.32;

// Лимит игроков в приватной комнате (lib/room.js). В публичном
// лобби (server.js) лимита нет.
const MAX_PLAYERS = 16;

// Инвентарь еды (#новое): сколько штук каждого вида хорошей еды можно
// накопить всего на аккаунте. Персистентный ресурс (хранится в players.stats
// JSONB, как и остальная статистика) — не сбрасывается между жизнями/сессиями.
const INVENTORY_CAP = 99;

// Загрузка своей аватарки: жёсткий предел на декодированный размер файла.
const AVATAR_UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 МБ

// Награда за килл в публичном лобби (server.js). Комнаты вызывают
// awardKillCoins через инжектированную зависимость из server.js,
// так что используют то же значение, но напрямую не объявляют его.
const KILL_REWARD_COINS = 50;

const BONUS_TYPES = {
  shield: { label: "SH", duration: 10000, color: "#62a0ea", desc: "защита от яда" },
  speed_up: { label: "SP", duration: 8000, color: "#f9f06b", desc: "оверклок +30% очков" },
  slow_down: { label: "SL", duration: 10000, color: "#dc8add", desc: "замедление" },
  double: { label: "x2", duration: 12000, color: "#33d17a", desc: "двойные очки" },
  ghost: { label: "GH", duration: 8000, color: "#8ff0a4", desc: "призрак" },
};

module.exports = {
  GRID,
  SPAWN_FREEZE_MS,
  DEFAULT_TICK_MS,
  BAD_FOOD_RATIO,
  MAX_PLAYERS,
  INVENTORY_CAP,
  AVATAR_UPLOAD_MAX_BYTES,
  KILL_REWARD_COINS,
  BONUS_TYPES,
};
