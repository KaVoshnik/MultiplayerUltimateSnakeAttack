"use strict";

const profiles = require("./profiles");

const MAX_LEADERS = 20;

function bestForName(ctx, name) {
  return ctx.leaderboard.find((e) => e.name.toLowerCase() === name.toLowerCase())?.score || 0;
}

function getEnrichedLeaderboard(ctx) {
  return ctx.leaderboard.map((e, index) => {
    const prof = profiles.getProfile(ctx, e.name);
    return { ...e, rank: index + 1, avatar: prof.avatar, customAvatarUrl: prof.stats?.customAvatarUrl || null, streak: prof.stats?.streak || 0, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, games: prof.stats?.games || 0, best: Math.max(e.score, prof.stats?.best || 0), coins: prof.coins || 0 };
  });
}

function getWealthLeaderboard(ctx) {
  return Object.entries(ctx.shopData)
    .map(([name, prof]) => ({ name, coins: prof.coins || 0, score: prof.coins || 0, avatar: prof.avatar || "😎", customAvatarUrl: prof.stats?.customAvatarUrl || null, streak: prof.stats?.streak || 0, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, games: prof.stats?.games || 0, best: prof.stats?.best || 0 }))
    .filter((e) => e.coins > 0)
    .sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name, "ru"))
    .slice(0, MAX_LEADERS)
    .map((e, index) => ({ ...e, rank: index + 1 }));
}

function persistLeaderboardEntry(ctx, name, score) {
  ctx.db.upsertLeaderboard(name, score).catch((err) => console.error("DB leaderboard:", err.message));
}

function recordScore(ctx, player) {
  if (!player || player.score <= 0) return;
  const existing = ctx.leaderboard.find((e) => e.name.toLowerCase() === player.name.toLowerCase());
  if (!existing || player.score > existing.score) {
    if (existing) { existing.score = player.score; existing.date = new Date().toISOString(); }
    else ctx.leaderboard.push({ name: player.name, score: player.score, date: new Date().toISOString() });
    ctx.leaderboard.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ru"));
    ctx.leaderboard = ctx.leaderboard.slice(0, MAX_LEADERS);
    persistLeaderboardEntry(ctx, player.name, player.score);
    ctx.broadcast({ type: "leaderboard", leaderboard: getEnrichedLeaderboard(ctx) });
  }
}

module.exports = { MAX_LEADERS, bestForName, getEnrichedLeaderboard, getWealthLeaderboard, persistLeaderboardEntry, recordScore };
