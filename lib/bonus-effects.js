"use strict";

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

module.exports = {
  comboMultiplier,
  tickBonusEffects,
};
