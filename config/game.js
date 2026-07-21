"use strict";

const GRID = { width: 210, height: 140 };

const SPAWN_FREEZE_MS = 3000;

// Доп. неуязвимость к боссам после того, как заморозка спавна закончилась
// и змейка реально начала двигаться. Итого игрок недостижим для боссов
// (не таргетится и не может быть убит боссом) SPAWN_FREEZE_MS + это время
// после спавна. От стены и плохой еды по-прежнему можно умереть в любой
// момент — это защита именно от "спавн килла" боссами, а не иммунитет вообще.
const SPAWN_BOSS_INVULN_MS = 2000;

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

// Колесо фраз (chat wheel, клавиша R в игре): кулдаун на произнесение
// одной фразы — общий для всех 4 слотов на аккаунт, не по отдельности.
const PHRASE_COOLDOWN_MS = 60 * 1000;

// Дальность "слышимости" фразы намеренно не отдельная константа — фраза
// рассылается тем же клиентам, что уже видят игрока в своей области
// видимости (AOI, см. lib/game-sync.js PLAYER_AOI_RADIUS / lib/phrases.js),
// то есть слышно ровно в радиусе видимости змейки на миникарте.

const BONUS_TYPES = {
  shield: { label: "SH", duration: 10000, color: "#62a0ea", desc: "защита от яда" },
  speed_up: { label: "SP", duration: 8000, color: "#f9f06b", desc: "оверклок +30% очков" },
  slow_down: { label: "SL", duration: 10000, color: "#dc8add", desc: "замедление" },
  double: { label: "x2", duration: 12000, color: "#33d17a", desc: "двойные очки" },
  ghost: { label: "GH", duration: 8000, color: "#8ff0a4", desc: "призрак" },
};

// Сколько бонус на карте лежит, прежде чем исчезнуть (см. _spawnBonus /
// spawnBonuses). Раньше пропадал молча — игрок полз к нему и видел пустую
// клетку. Теперь клиенту дополнительно шлётся expiresAt (см. compactBonus
// в lib/game-sync.js), и последние BONUS_BLINK_WARNING_MS перед исчезновением
// бонус мигает, чтобы было видно, что он вот-вот пропадёт.
const BONUS_LIFETIME_MS = 15000;
const BONUS_BLINK_WARNING_MS = 5000;

// Комбо раньше не сгорало никогда — можно было копить его бесконечно
// долго между едой. Теперь на каждое съеденное хорошее яблоко ставится
// таймер (player.comboExpires, см. lib/bonus-effects.js comboTimeoutMs),
// и если не успеть съесть следующее до истечения — комбо сбрасывается в 0.
// Чем выше текущее комбо, тем короче становится таймер (действует как
// нарастающая сложность), но не короче COMBO_TIMEOUT_MIN_MS.
const COMBO_TIMEOUT_BASE_MS = 12000;
const COMBO_TIMEOUT_STEP_MS = 400;
const COMBO_TIMEOUT_MIN_MS  = 5000;

// Чисто хвастовские пороги комбо для события в ленте — никаких бонусов
// не дают, просто красивая отметка на весь сервер/комнату.
const COMBO_BRAG_MILESTONES = [50, 100, 200, 300, 400, 500];

module.exports = {
  GRID,
  SPAWN_FREEZE_MS,
  SPAWN_BOSS_INVULN_MS,
  DEFAULT_TICK_MS,
  BAD_FOOD_RATIO,
  MAX_PLAYERS,
  INVENTORY_CAP,
  AVATAR_UPLOAD_MAX_BYTES,
  KILL_REWARD_COINS,
  BONUS_TYPES,
  BONUS_LIFETIME_MS,
  BONUS_BLINK_WARNING_MS,
  COMBO_TIMEOUT_BASE_MS,
  COMBO_TIMEOUT_STEP_MS,
  COMBO_TIMEOUT_MIN_MS,
  COMBO_BRAG_MILESTONES,
  PHRASE_COOLDOWN_MS,
};