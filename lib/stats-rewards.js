"use strict";

const gameConfig = require("../config/game");
const profiles = require("./profiles");
const { BATTLE_PASS_MAX_TIER, BATTLE_PASS_SCORE_STEP, getBattlePassTierDef } = require("../data/battle-pass");

const { KILL_REWARD_COINS } = gameConfig;

// ============================================================
// СТАТИСТИКА ПРИ СМЕРТИ / ДИСКОННЕКТЕ
// ============================================================

function trackDeathStats(ctx, player) {
  const entry = profiles.getProfile(ctx, player.name);
  entry.stats.deaths = (entry.stats.deaths ?? entry.stats.losses ?? 0) + 1;
  const prevBest = entry.stats.best || 0;
  entry.stats.best = Math.max(prevBest, player.score);
  player.beatPersonalBest = player.score > prevBest;
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  const rivalScores = [...ctx.players.values()].filter((p) => p.id !== player.id).map((p) => p.score);
  const sessionTop = Math.max(player.score, ...rivalScores, 0);
  player.sessionMvp = player.score > 0 && player.score >= sessionTop;
  entry.stats.battlePassScore = (entry.stats.battlePassScore || 0) + (player.score || 0);
  if (player.inventory) entry.stats.foodInventory = { ...player.inventory };
  ctx.shopData[player.name] = entry;
  profiles.persistProfile(ctx, player.name, entry);
  processBattlePassRewards(ctx, player.name, entry);
  profiles.checkAchievements(ctx, player.name, entry).catch((err) => console.error("Achievements:", err.message));
}

function trackDisconnectStats(ctx, player) {
  const entry = profiles.getProfile(ctx, player.name);
  if (entry.stats.sessionStart) {
    entry.stats.playTimeMs = (entry.stats.playTimeMs || 0) + (Date.now() - entry.stats.sessionStart);
    entry.stats.sessionStart = null;
  }
  if (player.alive && player.score > 0) {
    entry.stats.battlePassScore = (entry.stats.battlePassScore || 0) + player.score;
    processBattlePassRewards(ctx, player.name, entry);
  }
  if (player.inventory) entry.stats.foodInventory = { ...player.inventory };
  ctx.shopData[player.name] = entry;
  profiles.persistProfile(ctx, player.name, entry);
}

// ============================================================
// НАГРАДЫ
// ============================================================

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

function awardKillCoins(ctx, killer, victim) {
  killer.coins = (killer.coins || 0) + KILL_REWARD_COINS;
  const entry = profiles.getProfile(ctx, killer.name);
  entry.stats.kills = (entry.stats.kills || 0) + 1;
  entry.coins = killer.coins;
  ctx.shopData[killer.name] = entry;
  profiles.persistProfile(ctx, killer.name, entry);
  ctx.pushFeed("kill", `💰 ${killer.name}: +${KILL_REWARD_COINS} за убийство ${victim.name}`, killer.name,
    { key: "feed.killReward", params: { killer: killer.name, victim: victim.name, coins: KILL_REWARD_COINS } });
  ctx.send(killer.id, { type: "notice", text: `+${KILL_REWARD_COINS} монет за убийство!` });
  profiles.checkAchievements(ctx, killer.name, entry).catch((err) => console.error("Achievements:", err.message));
}

function processBattlePassRewards(ctx, name, entry) {
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
    ctx.pushFeed("bonus", `🎖 ${name}: боевой пропуск ур.${tier} — +${def.coins}🪙${colorText}`, name,
      { key: "feed.battlePassTier", params: { name, tier, coins: def.coins, colorId: def.nickColor?.id || null } });
  }

  if (!granted.length) return granted;
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);

  for (const p of ctx.players.values()) {
    if (p.name.toLowerCase() !== name.toLowerCase()) continue;
    p.coins = entry.coins;
    ctx.send(p.id, { type: "notice", text: `Боевой пропуск: +${granted.reduce((s, r) => s + r.coins, 0)} монет!` });
    ctx.sendShopPayload(p.id, name);
    ctx.resyncPlayer(p.id);
  }
  for (const [clientId, clientName] of ctx.shopClients) {
    if (clientName.toLowerCase() === name.toLowerCase() && !ctx.players.has(clientId)) {
      ctx.sendShopPayload(clientId, name);
    }
  }
  return granted;
}

module.exports = { trackDeathStats, trackDisconnectStats, awardSessionCoins, awardKillCoins, processBattlePassRewards };
