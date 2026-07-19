"use strict";

const achievementsMod = require("../lib/achievements");
const profiles = require("../lib/profiles");
const leaderboard = require("../lib/leaderboard");
const market = require("../lib/market");
const { SHOP_CATALOG, SHOP_SKINS, AVATAR_PRESETS } = require("../data/shop-catalog");
const { getBattlePassConfig } = require("../data/battle-pass");
const { sendJson, getRequestOrigin } = require("../lib/utils");

async function handle(req, res, url, ctx) {
  if (url.pathname === "/health") {
    sendJson(res, { ok: true, uptime: process.uptime(), players: ctx.players.size, sockets: ctx.sockets.size });
    return true;
  }
  if (url.pathname === "/info") {
    const base = getRequestOrigin(req, ctx.PORT);
    sendJson(res, { name: "THE ULTIMATE MULTIPLAYER SNAKE ATTACK", publicUrl: base.http, wsUrl: base.ws, playersOnline: ctx.players.size });
    return true;
  }
  if (url.pathname === "/leaderboard") {
    const sort = url.searchParams.get("sort");
    sendJson(res, sort === "coins" ? leaderboard.getWealthLeaderboard(ctx) : leaderboard.getEnrichedLeaderboard(ctx));
    return true;
  }
  if (url.pathname === "/market") {
    sendJson(res, market.getMarketPayload(ctx));
    return true;
  }
  if (url.pathname === "/shop") {
    sendJson(res, { skins: SHOP_SKINS, catalog: SHOP_CATALOG, playerData: ctx.shopData });
    return true;
  }
  if (url.pathname === "/catalog") {
    sendJson(res, { catalog: SHOP_CATALOG, skins: SHOP_SKINS, avatars: AVATAR_PRESETS, battlePass: getBattlePassConfig() });
    return true;
  }
  if (url.pathname === "/profile") {
    const name = profiles.profileName(url.searchParams.get("name") || "");
    if (!name) { sendJson(res, { error: "no name" }); return true; }
    const key = profiles.findCanonicalName(ctx, name);
    if (!key) { sendJson(res, { error: "not_found" }); return true; }
    const prof = profiles.getProfile(ctx, key);
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    let friendStatus = "none";
    if (session && session.player_name.toLowerCase() !== key.toLowerCase()) {
      friendStatus = await ctx.db.getFriendshipStatus(session.player_name, key).catch(() => "none");
    }
    sendJson(res, {
      id: prof.id || null, name: key, coins: prof.coins, activeSkin: prof.activeSkin,
      avatar: prof.avatar, customAvatarUrl: prof.stats?.customAvatarUrl || null,
      streak: prof.stats?.streak || 0,
      stats: { games: prof.stats?.games || 0, deaths: prof.stats?.deaths ?? prof.stats?.losses ?? 0, best: prof.stats?.best || 0, playTimeMs: prof.stats?.playTimeMs || 0 },
      online: profiles.isPlayerOnline(ctx, key),
      friendStatus,
    });
    return true;
  }

  if (url.pathname === "/achievements") {
    const name = profiles.profileName(url.searchParams.get("name") || "");
    const key = name ? profiles.findCanonicalName(ctx, name) : null;
    const unlocked = new Set(key ? (profiles.getProfile(ctx, key).stats?.unlockedAchievements || []) : []);
    sendJson(res, achievementsMod.ACHIEVEMENTS.map((a) => ({
      id: a.id, name: a.name, desc: a.desc, icon: a.icon, unlocked: unlocked.has(a.id),
    })));
    return true;
  }
  if (url.pathname === "/api/players") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const list = Object.entries(ctx.shopData)
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .map(([name, prof]) => {
        const p = profiles.normalizeProfile(prof);
        return { name, avatar: p.avatar, customAvatarUrl: p.stats?.customAvatarUrl || null, streak: p.stats?.streak || 0, games: p.stats.games || 0, deaths: p.stats.deaths || 0, best: p.stats.best || 0, coins: p.coins || 0, playTimeMs: p.stats.playTimeMs || 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
      .slice(0, 50);
    sendJson(res, list);
    return true;
  }

  return false;
}

module.exports = { handle };
