"use strict";

// ============================================================
// GAME ENGINE
// Общие чистые функции игрового тика, выносимые постепенно из
// server.js (tick, публичное лобби) и lib/room.js (_tick,
// приватные комнаты).
//
// Слияние всего тика одним шагом небезопасно: реализации
// расходятся в нескольких местах (wall death/wraparound по
// сложности, slow_down skip хода, inLobby-фильтр в комнатах,
// shield-уведомление, текст причины смерти от яда). Эти
// расхождения сохраняются через опциональные колбэки/предикаты —
// не унифицируются.
//
// Tag Time режим удалён из игры — связанная ветка столкновений
// в server.js устранена, проверка столкновения со змейкой теперь
// идентична lib/room.js.
// ============================================================

const foodMod = require("./food");

/**
 * Фаза планирования хода: для каждого живого игрока вычисляет
 * nextHead (с учётом direction/nextDirection) и считает, сколько
 * игроков целятся в одну и ту же клетку (для проверки "лоб в лоб").
 *
 * Идентична в server.js и lib/room.js, кроме двух точечных условий:
 * - room.js дополнительно пропускает игроков с player.inLobby
 * - server.js дополнительно пропускает ход при activeBonus === "slow_down"
 *   на чётных тиках
 * Оба варианта передаются опциональными предикатами/флагами, чтобы
 * не терять ни одно из текущих поведений.
 *
 * @param {Map} players
 * @param {object} opts
 * @param {object} opts.GRID
 * @param {number} [opts.tickCount] - нужен только если applySlowDown=true
 * @param {boolean} [opts.applySlowDown=false] - пропускать ход при slow_down (server.js)
 * @param {(player) => boolean} [opts.skipPlayer] - доп. предикат пропуска (room.js передаёт p => p.inLobby)
 * @returns {{occupied: Map, planned: Map, targetCounts: Map}}
 */
function planMoves(players, opts) {
  const { GRID, tickCount, applySlowDown = false, skipPlayer } = opts;

  const occupied = new Map();
  const planned = new Map();
  const targetCounts = new Map();

  for (const player of players.values()) {
    if (!player.alive) continue;
    if (skipPlayer && skipPlayer(player)) continue;
    for (const part of player.snake) occupied.set(foodMod.pointKey(part), player.id);
  }

  for (const player of players.values()) {
    if (!player.alive) continue;
    if (skipPlayer && skipPlayer(player)) continue;
    if (player.frozenUntil && Date.now() < player.frozenUntil) continue;
    if (applySlowDown && player.activeBonus === "slow_down" && tickCount % 2 === 0) continue;

    player.direction = player.nextDirection;
    const head = player.snake[0];
    const nextHead = { x: head.x + player.direction.x, y: head.y + player.direction.y };
    planned.set(player.id, nextHead);
    const key = foodMod.pointKey(nextHead);
    targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
  }

  return { occupied, planned, targetCounts };
}

module.exports = {
  planMoves,
};
