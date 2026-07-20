"use strict";

const gameSync = require("./game-sync");
const bossMod = require("./bosses");
const foodMod = require("./food");
const bonusEffects = require("./bonus-effects");
const engine = require("./engine");
const gameConfig = require("../config/game");
const { COLORS } = require("../data/shop-catalog");
const { resolveNickColorHex } = require("../data/battle-pass");
const profiles = require("./profiles");
const leaderboard = require("./leaderboard");
const statsRewards = require("./stats-rewards");

const { GRID, SPAWN_FREEZE_MS, SPAWN_BOSS_INVULN_MS, BONUS_TYPES, BONUS_LIFETIME_MS, DEFAULT_TICK_MS } = gameConfig;
const { FOOD_TYPES } = foodMod;
const { BOSS_SPAWN_BUFFER } = bossMod;

const FEED_DEDUPE_MS = 4000;
const FEED_BROADCAST_MS = 1200;

// ============================================================
// СИНХРОНИЗАЦИЯ С КЛИЕНТАМИ
// ============================================================

function buildSyncCtx(ctx) {
  return {
    grid: GRID, players: ctx.players, food: ctx.food, bonuses: ctx.bonuses, bosses: ctx.bosses, bonusTypes: BONUS_TYPES,
    tickCount: ctx.tickCount, tickMs: DEFAULT_TICK_MS,
    clientAoi: ctx.clientAoi, extrasFor: (p) => extrasForPlayer(ctx, p),
  };
}

function sendSnapshot(ctx, clientId) {
  const snap = gameSync.buildSnapshot(buildSyncCtx(ctx), clientId);
  if (snap) ctx.send(clientId, snap);
}

function broadcastGameSync(ctx) {
  const syncCtx = buildSyncCtx(ctx);
  for (const clientId of ctx.players.keys()) {
    const delta = gameSync.buildDelta(syncCtx, clientId, ctx.tickJournal);
    if (delta) ctx.send(clientId, delta);
  }
}

function broadcastGameDelta(ctx, journal) {
  const syncCtx = buildSyncCtx(ctx);
  for (const clientId of ctx.players.keys()) {
    const delta = gameSync.buildDelta(syncCtx, clientId, journal);
    if (delta) ctx.send(clientId, delta);
  }
}

function broadcastPresence(ctx) {
  const presence = gameSync.buildPresence(buildSyncCtx(ctx));
  presence.players = ctx.sockets.size; // реальный онлайн всего сервера
  ctx.broadcast(presence);
}

function resyncPlayer(ctx, clientId) {
  sendSnapshot(ctx, clientId);
}

// Заставляет всех остальных клиентов, которые уже "видели" этого
// игрока (он был в их AOI), получить его свежую позицию как полный
// join вместо обычного mv. Нужно после респавна: broadcastGameSync()
// использует journal последнего тика, который не содержит информации
// о респавне (он произошёл вне тика), поэтому без этого другие клиенты
// продолжали бы хранить позицию игрока на месте смерти до следующего
// тика — и увидели бы резкий "телепорт" через карту при следующем mv.
function forceAoiResync(ctx, playerId) {
  for (const aoiSet of ctx.clientAoi.values()) aoiSet.delete(playerId);
}

function pushFeed(ctx, kind, text, playerName = "", meta = {}) {
  const dedupeKey = `${kind}:${text}`;
  const now = Date.now();
  const lastAt = ctx.feedDedupe.get(dedupeKey);
  if (lastAt && now - lastAt < FEED_DEDUPE_MS) return;
  ctx.feedDedupe.set(dedupeKey, now);
  ctx.feedLog.unshift({
    id: `${now}-${ctx.feedLog.length}`, kind, text, playerName, at: now,
    key: meta.key || null, params: meta.params || null,
  });
  if (ctx.feedLog.length > 12) ctx.feedLog.length = 12;
  scheduleFeedBroadcast(ctx);
}

function scheduleFeedBroadcast(ctx) {
  if (ctx.feedBroadcastTimer) return;
  ctx.feedBroadcastTimer = setTimeout(() => {
    ctx.feedBroadcastTimer = null;
    if (ctx.feedLog.length) ctx.broadcast({ type: "feed", feed: ctx.feedLog.slice(0, 8) });
  }, FEED_BROADCAST_MS);
}

function extrasForPlayer(ctx, p) {
  const cos = profiles.getPlayerCosmetics(ctx, p.name);
  return {
    best: Math.max(p.best, leaderboard.bestForName(ctx, p.name)),
    spawnFrozenLeft: p.frozenUntil ? Math.max(0, p.frozenUntil - Date.now()) : 0,
    heat: Math.min(100, Math.round((p.score || 0) * 0.4 + (p.combo || 0) * 9)),
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji, snakeHatId: cos.snakeHatId,
    nickColor: resolveNickColorHex(profiles.getProfile(ctx, p.name)),
  };
}

// ============================================================
// СОЗДАНИЕ ИГРОКА
// ============================================================

function createPlayer(ctx, id, name, skin) {
  const layout = foodMod.findSpawnLayout({
    players: ctx.players, food: ctx.food, bonuses: ctx.bonuses, GRID,
    anyBossOccupies: (pt) => bossMod.anyBossOccupies(ctx.bosses, pt),
    distanceToNearestBoss: (pt) => bossMod.distanceToNearestBoss(ctx.bosses, pt),
    BOSS_SPAWN_BUFFER,
  });
  const direction = layout?.direction || { x: 1, y: 0 };
  const snake = layout?.snake || [{ x: Math.floor(GRID.width / 2), y: Math.floor(GRID.height / 2) }];

  foodMod.clearBoardAroundSpawn(snake[0], { food: ctx.food, bonuses: ctx.bonuses });
  const shopEntry = profiles.getProfile(ctx, name);
  const cos = profiles.getPlayerCosmetics(ctx, name);

  const player = {
    id, name,
    color: skin.color !== "rainbow" ? skin.color : COLORS[(Number(id) - 1) % COLORS.length],
    headColor: skin.headColor || "#ffffff",
    skin: skin.id,
    rainbow: skin.color === "rainbow",
    snake, direction, nextDirection: direction,
    alive: true, score: 0, coins: shopEntry.coins || 0,
    best: leaderboard.bestForName(ctx, name), deaths: 0, reason: "",
    coinsEarned: 0, beatPersonalBest: false, sessionMvp: false,
    activeBonus: null, bonusExpires: null,
    combo: 0, maxCombo: 0,
    inventory: { ...shopEntry.stats.foodInventory },
    avatar: cos.avatar, snakeHatEmoji: cos.snakeHatEmoji, snakeHatId: cos.snakeHatId,
    nickColor: resolveNickColorHex(shopEntry),
    frozenUntil: Date.now() + SPAWN_FREEZE_MS,
    // Боссы не могут убить (и не таргетят) игрока, пока не пройдёт заморозка
    // спавна + ещё немного времени после того, как он реально начал двигаться.
    // От стены/плохой еды это не защищает.
    bossInvulnerableUntil: Date.now() + SPAWN_FREEZE_MS + SPAWN_BOSS_INVULN_MS,
  };

  foodMod.removeEntitiesUnderSnake(player, { food: ctx.food, bonuses: ctx.bonuses });
  return player;
}

function applySkinToPlayer(player, skin) {
  player.skin = skin.id;
  player.color = skin.color !== "rainbow" ? skin.color : COLORS[(Number(player.id) - 1) % COLORS.length];
  player.headColor = skin.headColor || "#ffffff";
  player.rainbow = skin.color === "rainbow";
}

// ============================================================
// БОНУСЫ / СМЕРТЬ / СЧЁТ
// ============================================================

function activateBonus(ctx, player, bonusType) {
  bonusEffects.activateBonus(player, bonusType, BONUS_TYPES, (def) => {
    pushFeed(ctx, "bonus", `⚡ ${player.name} → ${def.label}`, player.name,
      { key: "feed.bonusPickup", params: { name: player.name, label: def.label } });
    ctx.broadcast({ type: "notice", text: `${player.name} получил бонус ${def.label} ${def.desc}!` });
  });
}

function spawnBonuses(ctx) {
  const spawn = bonusEffects.pickBonusSpawn({
    players: ctx.players, bonuses: ctx.bonuses, food: ctx.food, bosses: ctx.bosses, occupancySet: ctx.occupancySet,
    foodMod, bossMod, GRID, BONUS_TYPES,
  });
  if (!spawn) return;
  const { point, bonusType } = spawn;
  const expiresAt = Date.now() + BONUS_LIFETIME_MS;
  ctx.bonuses.push({ ...point, bonusType, spawnedAt: Date.now(), expiresAt });

  const journal = gameSync.createJournal();
  journal.bonusAdded.push(gameSync.compactBonus({ x: point.x, y: point.y, bonusType, expiresAt }, BONUS_TYPES));
  broadcastGameDelta(ctx, journal);

  setTimeout(() => {
    const idx = ctx.bonuses.findIndex((b) => b.x === point.x && b.y === point.y);
    if (idx >= 0) {
      const b = ctx.bonuses[idx];
      ctx.bonuses.splice(idx, 1);
      const expJournal = gameSync.createJournal();
      expJournal.bonusRemoved.push([b.x, b.y]);
      broadcastGameDelta(ctx, expJournal);
    }
  }, BONUS_LIFETIME_MS);
}

function killPlayer(ctx, player, reason, opts = {}) {
  if (!player.alive) return;
  ctx.tickJournal.deaths.push(player.id);
  statsRewards.trackDeathStats(ctx, player);
  player.alive = false;
  player.deaths += 1;
  if (opts.killerPlayer) {
    player.reason = `${opts.killerPlayer.name} убил тебя`;
    player.reasonKey = "death.killedByPlayer";
    player.reasonParams = { name: opts.killerPlayer.name };
  } else {
    player.reason = reason;
    player.reasonKey = opts.reasonKey || null;
    player.reasonParams = opts.reasonParams || null;
  }
  player.activeBonus = null;
  player.bonusExpires = null;
  player.combo = 0;
  const reward = statsRewards.awardSessionCoins(player);
  player.coinsEarned = reward;
  if (reward > 0) {
    player.coins = (player.coins || 0) + reward;
    profiles.savePlayerCoins(ctx, player);
    pushFeed(ctx, "bonus", `💰 ${player.name}: +${reward} монет`, player.name,
      { key: "feed.coinsEarned", params: { name: player.name, reward } });
  }
  leaderboard.recordScore(ctx, player);
  if (opts.killerPlayer?.alive) {
    statsRewards.awardKillCoins(ctx, opts.killerPlayer, player);
  } else if (opts.killerPlayer) {
    pushFeed(ctx, "kill", `⚔ ${opts.killerPlayer.name} убил ${player.name}`, opts.killerPlayer.name,
      { key: "feed.killedPlayer", params: { killer: opts.killerPlayer.name, victim: player.name } });
  } else {
    pushFeed(ctx, "death", `💀 ${player.name}: ${reason}`, player.name,
      { key: player.reasonKey, params: { name: player.name, ...player.reasonParams } });
  }
  const hitCell = opts.at || player.snake[0];
  const killerBoss = opts.boss || bossMod.bossAt(ctx.bosses, hitCell) || ctx.bosses.find((b) => reason.includes(b.name));
  if (killerBoss) bossMod.enrageBoss(killerBoss, ctx.bosses, (...a) => pushFeed(ctx, ...a), ctx.broadcast);
}

// ============================================================
// ТИК
// ============================================================

function tick(ctx) {
  if (ctx.players.size === 0) return;
  ctx.tickJournal = gameSync.createJournal();
  ctx.tickCount += 1;

  const pathCells = foodMod.getMovementPathCells(ctx.players, { GRID, tickCount: ctx.tickCount });

  foodMod.fillFood({
    food: ctx.food, players: ctx.players, occupancySet: ctx.occupancySet, tickJournal: ctx.tickJournal, GRID,
    avoidCells: pathCells,
    anyBossOccupies: (pt) => bossMod.anyBossOccupies(ctx.bosses, pt),
  });

  // Раньше вызов троттлился общим модулем (что заставляло ярость ОДНОГО
  // босса ускорять ВСЕХ). Теперь moveBosses вызывается каждый тик, а
  // скорость каждого конкретного босса считается независимо внутри неё.
  bossMod.moveBosses({
    bosses: ctx.bosses, players: ctx.players, food: ctx.food, tickCount: ctx.tickCount, GRID,
    avoidCells: pathCells,
    pushFeed: (...a) => pushFeed(ctx, ...a), broadcast: ctx.broadcast, killPlayer: (player, reason, opts) => killPlayer(ctx, player, reason, opts),
    pushFoodItem: (item) => { ctx.food.push(item); ctx.tickJournal.foodAdded.push(gameSync.compactFood(item)); },
    removeFoodAt: (item) => {
      const idx = ctx.food.findIndex((f) => f.x === item.x && f.y === item.y);
      if (idx >= 0) {
        ctx.food.splice(idx, 1);
        ctx.tickJournal.foodRemoved.push([item.x, item.y]);
      }
    },
    createBadFood: foodMod.createBadFood,
    insideGrid: (pt) => foodMod.insideGrid(pt, GRID),
    pointKey: foodMod.pointKey,
  });
  ctx.tickJournal.bossesChanged = true;

  bonusEffects.tickBonusEffects(ctx.players);
  occupancyRebuild(ctx);

  const { occupied, planned, targetCounts } = engine.planMoves(ctx.players, {
    GRID, tickCount: ctx.tickCount, applySlowDown: true,
  });

  for (const player of ctx.players.values()) {
    if (!player.alive || !planned.has(player.id)) continue;
    const nextHead = planned.get(player.id);
    const key = foodMod.pointKey(nextHead);

    if (!foodMod.insideGrid(nextHead, GRID)) { killPlayer(ctx, player, "Врезался в стену", { reasonKey: "death.wall" }); continue; }

    const resolvedKey = key;

    if (targetCounts.get(key) > 1) { killPlayer(ctx, player, "Столкновение лоб в лоб", { reasonKey: "death.headOn" }); continue; }

    const killerBoss = bossMod.bossAt(ctx.bosses, nextHead);
    if (killerBoss && !bossMod.isBossProtected(player)) {
      killPlayer(ctx, player, `${killerBoss.name} поймал змейку`, {
        at: nextHead, boss: killerBoss,
        reasonKey: "death.caughtByBoss", reasonParams: { boss: killerBoss.name },
      });
      continue;
    }

    // Баффы проверяем ДО occupied — бафф важнее хвоста
    const eatenBonusIdx = ctx.bonuses.findIndex((b) => b.x === nextHead.x && b.y === nextHead.y);
    if (eatenBonusIdx >= 0) {
      const bonus = ctx.bonuses[eatenBonusIdx];
      ctx.tickJournal.bonusRemoved.push([bonus.x, bonus.y]);
      ctx.bonuses.splice(eatenBonusIdx, 1);
      activateBonus(ctx, player, bonus.bonusType);
    }

    if (player.activeBonus !== "ghost" && occupied.has(resolvedKey)) {
      const killerId = occupied.get(resolvedKey);
      const killer = killerId && killerId !== player.id ? ctx.players.get(killerId) : null;
      killPlayer(
        ctx, player,
        killer ? `${killer.name} убил ${player.name}` : "Столкнулся со змейкой",
        { at: nextHead, killerPlayer: killer, reasonKey: killer ? undefined : "death.collidedSnake" },
      );
      continue;
    }

    const eatenIdx = ctx.food.findIndex((item) => item.x === nextHead.x && item.y === nextHead.y);
    const eaten = eatenIdx >= 0 ? ctx.food[eatenIdx] : null;
    player._grewTick = Boolean(eaten);
    player.snake.unshift(nextHead);

    if (eaten) {
      ctx.tickJournal.foodRemoved.push([eaten.x, eaten.y]);
      ctx.food.splice(eatenIdx, 1);
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
          pushFeed(ctx, "combo", `🔥 ${player.name}: COMBO ×${player.combo}!`, player.name,
            { key: "feed.combo", params: { name: player.name, combo: player.combo } });
        }
        // Инвентарь копится в памяти живой змейки и разово синкается в
        // персистентный профиль при смерти/дисконнекте (trackDeathStats /
        // trackDisconnectStats) — не шлём отдельное сообщение на каждое яблоко.
        if (player.inventory[eaten.kind] !== undefined && player.inventory[eaten.kind] < gameConfig.INVENTORY_CAP) {
          player.inventory[eaten.kind] += 1;
        }
      } else if (player.activeBonus === "shield") {
        player.activeBonus = null;
        ctx.broadcast({ type: "notice", text: `${player.name}: щит поглотил ${FOOD_TYPES[eaten.kind]?.label || "яд"}!` });
      } else {
        killPlayer(ctx, player, `Съел ${FOOD_TYPES[eaten.kind]?.label || "яд"}`, {
          reasonKey: "death.ateBadFood", reasonParams: { kind: eaten.kind },
        });
      }
    } else {
      player.snake.pop();
    }

    ctx.tickJournal.moves.push(gameSync.packPlayerMove(player));
    ctx.tickJournal.meta.push(gameSync.packPlayerMeta(player, extrasForPlayer(ctx, player)));
  }

  broadcastGameSync(ctx);
}

// Occupancy set для O(1) проверки занятых клеток
function occupancyRebuild(ctx) {
  ctx.occupancySet.clear();
  const add = (pt) => ctx.occupancySet.add(`${pt.x}:${pt.y}`);
  for (const item of ctx.food) add(item);
  for (const b of ctx.bonuses) add(b);
  for (const player of ctx.players.values()) {
    for (const part of player.snake) add(part);
  }
}

module.exports = {
  buildSyncCtx, sendSnapshot, broadcastGameSync, broadcastGameDelta, broadcastPresence,
  resyncPlayer, forceAoiResync, pushFeed, scheduleFeedBroadcast, extrasForPlayer,
  createPlayer, applySkinToPlayer, activateBonus, spawnBonuses, killPlayer, tick,
  occupancyRebuild,
};