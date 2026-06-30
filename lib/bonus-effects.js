"use strict";

// ============================================================
// BONUS EFFECTS
// Чистые функции игровой логики бонусов, ранее продублированные
// между server.js (публичное лобби, comboMultiplier/tickBonusEffects)
// и lib/room.js (приватные комнаты, _comboMult/_tickBonusEffects).
//
// ВНИМАНИЕ: activateBonus в server.js и room.js НЕ объединены —
// они отличаются по поведению (server.js шлёт pushFeed + broadcast
// с описанием бонуса, room.js — только notice без feed). Объединение
// activateBonus оставлено на отдельный, более осторожный подэтап.
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

module.exports = {
  comboMultiplier,
  tickBonusEffects,
  pickBonusSpawn,
};
