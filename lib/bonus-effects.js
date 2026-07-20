"use strict";

const gameConfig = require("../config/game");
const { COMBO_TIMEOUT_BASE_MS, COMBO_TIMEOUT_STEP_MS, COMBO_TIMEOUT_MIN_MS } = gameConfig;

// ============================================================
// BONUS EFFECTS
// Чистые функции игровой логики бонусов, ранее продублированные
// между server.js (публичное лобби) и lib/room.js (приватные комнаты).
//
// activateBonus устанавливает сам бафф одинаково в обеих средах,
// но уведомление игроков различается (server.js шлёт pushFeed в
// ленту событий + broadcast с описанием def.desc, room.js — только
// notice без feed и без desc). Это различие сохранено через колбэк
// onNotify, а не унифицировано — комнаты не имеют отдельной ленты
// событий, и менять видимое поведение не входит в задачу рефакторинга.
// ============================================================

/**
 * Множитель очков за съеденную хорошую еду в зависимости от комбо.
 * Идентична в обоих файлах: 10+ → x2, 6-9 → x1.5, 3-5 → x1.25, иначе x1.
 */
function comboMultiplier(combo) {
  if (combo >= 10) return 2;
  if (combo >= 6) return 1.5;
  if (combo >= 3) return 1.25;
  return 1;
}

/**
 * Снимает истёкшие баффы (activeBonus/bonusExpires) у всех живых
 * игроков в переданной коллекции. Принимает Map<id, player> —
 * подходит и для глобального players (server.js), и для
 * room.players (lib/room.js).
 */
function tickBonusEffects(players) {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.activeBonus && player.bonusExpires && now > player.bonusExpires) {
      player.activeBonus = null;
      player.bonusExpires = null;
    }
  }
}

/**
 * Сколько мс есть у игрока с текущим combo, чтобы съесть следующее
 * хорошее яблоко, прежде чем комбо сгорит. Чем выше комбо — тем
 * короче окно (жёстче держать серию), но не короче COMBO_TIMEOUT_MIN_MS.
 */
function comboTimeoutMs(combo) {
  return Math.max(COMBO_TIMEOUT_MIN_MS, COMBO_TIMEOUT_BASE_MS - combo * COMBO_TIMEOUT_STEP_MS);
}

/**
 * Сжигает комбо игрокам, которые слишком долго не ели хорошую еду.
 * Вызывается каждый тик, аналогично tickBonusEffects. comboExpires
 * выставляется в момент съедения хорошего яблока (см. lib/game-loop.js /
 * lib/room.js) — здесь только проверяем истечение.
 */
function tickComboTimers(players) {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.combo > 0 && player.comboExpires && now > player.comboExpires) {
      player.combo = 0;
      player.comboExpires = null;
    }
  }
}

/**
 * Вычисляет, где и какой бонус нужно заспавнить — без побочных
 * эффектов (ничего не пушит в массивы, ничего не рассылает).
 * Вызывающая сторона сама решает, что делать с результатом
 * (push в bonuses[], отправка journal-дельты, setTimeout на удаление).
 *
 * Возвращает null, если спавнить не нужно (нет игроков, лимит
 * бонусов уже достигнут, или не нашлось свободной точки).
 *
 * @param {object} state
 * @param {Map} state.players
 * @param {Array} state.bonuses
 * @param {Array} state.food
 * @param {Array} state.bosses
 * @param {Set}   state.occupancySet
 * @param {object} state.foodMod   - модуль lib/food.js (randomEmptyPoint)
 * @param {object} state.bossMod   - модуль lib/bosses.js (anyBossOccupies)
 * @param {object} state.GRID      - размеры поля
 * @param {object} state.BONUS_TYPES - доступные типы бонусов
 * @param {number} [state.maxBonuses=3] - лимит одновременных бонусов
 * @returns {{point: {x:number,y:number}, bonusType: string} | null}
 */
function pickBonusSpawn(state) {
  const {
    players, bonuses, food, bosses, occupancySet,
    foodMod, bossMod, GRID, BONUS_TYPES, maxBonuses = 3,
  } = state;

  if (players.size === 0 || bonuses.length >= maxBonuses) return null;

  const point = foodMod.randomEmptyPoint(food, {
    avoidCells: null,
    anyBossOccupies: (pt) => bossMod.anyBossOccupies(bosses, pt),
    occupancySet, GRID, avoidNearHeads: true, players,
  });
  if (!point) return null;

  const types = Object.keys(BONUS_TYPES);
  const bonusType = types[Math.floor(Math.random() * types.length)];

  return { point, bonusType };
}

/**
 * Активирует бонус для игрока: проверяет, что тип существует,
 * выставляет activeBonus/bonusExpires. Уведомление игроков —
 * на стороне вызывающего кода через onNotify(def), т.к. оно
 * различается между лобби (pushFeed + broadcast с desc) и
 * комнатами (только notice без desc).
 *
 * Если bonusType не найден в BONUS_TYPES — ничего не делает
 * и не вызывает onNotify (как и в исходном коде обеих сред).
 *
 * @param {object} player
 * @param {string} bonusType
 * @param {object} BONUS_TYPES
 * @param {(def: object) => void} onNotify
 */
function activateBonus(player, bonusType, BONUS_TYPES, onNotify) {
  const def = BONUS_TYPES[bonusType];
  if (!def) return;
  player.activeBonus = bonusType;
  player.bonusExpires = Date.now() + def.duration;
  onNotify(def);
}

module.exports = {
  comboMultiplier,
  comboTimeoutMs,
  tickBonusEffects,
  tickComboTimers,
  pickBonusSpawn,
  activateBonus,
};