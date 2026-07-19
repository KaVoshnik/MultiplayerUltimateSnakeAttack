"use strict";

const profiles = require("../lib/profiles");
const { SHOP_CATALOG } = require("../data/shop-catalog");
const { sendJson } = require("../lib/utils");

async function handle(req, res, url, ctx) {
  if (url.pathname === "/daily_chest/status" && req.method === "GET") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    const entry = profiles.getProfile(ctx, session.player_name);
    const today = new Date().toISOString().slice(0, 10);
    sendJson(res, {
      available: Boolean(entry.stats.dailyChestAvailable && entry.stats.dailyChestDate === today),
      streak: entry.stats.streak || 0,
    });
    return true;
  }

  if (url.pathname === "/daily_chest/open" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    const name = session.player_name;
    const entry = profiles.getProfile(ctx, name);
    const today = new Date().toISOString().slice(0, 10);
    if (!entry.stats.dailyChestAvailable || entry.stats.dailyChestDate !== today) {
      res.writeHead(400); res.end("chest not available"); return true;
    }
    entry.stats.dailyChestAvailable = false;

    // Мини-сундук: чаще всего монеты (немного растут вместе со стриком),
    // изредка новый скин, очень редко — джекпот.
    const streakBonus = Math.min(30, (entry.stats.streak || 0) * 2);
    const roll = Math.random();
    let reward;
    if (roll < 0.05) {
      const amount = 200 + Math.floor(Math.random() * 201);
      entry.coins = (entry.coins || 0) + amount;
      reward = { type: "coins", amount, label: `Джекпот! +${amount} монет` };
    } else if (roll < 0.20) {
      const owned = new Set(entry.inventory);
      const candidates = SHOP_CATALOG.filter((i) => i.category === "skin" && i.rarity === "common" && i.price > 0 && !owned.has(i.id));
      if (candidates.length > 0) {
        const item = candidates[Math.floor(Math.random() * candidates.length)];
        entry.inventory.push(item.id);
        reward = { type: "skin", skinId: item.id, skinName: item.name, label: `Новый скин: ${item.name}!` };
      } else {
        const amount = 30 + Math.floor(Math.random() * 51) + streakBonus;
        entry.coins = (entry.coins || 0) + amount;
        reward = { type: "coins", amount, label: `+${amount} монет` };
      }
    } else {
      const amount = 30 + Math.floor(Math.random() * 51) + streakBonus;
      entry.coins = (entry.coins || 0) + amount;
      reward = { type: "coins", amount, label: `+${amount} монет` };
    }

    if (reward.type === "coins") {
      for (const p of ctx.players.values()) {
        if (p.name.toLowerCase() === name.toLowerCase()) p.coins = entry.coins;
      }
    }

    ctx.shopData[name] = entry;
    await profiles.persistProfile(ctx, name, entry);
    const fresh = await profiles.checkAchievements(ctx, name, entry, {}).catch(() => []);
    sendJson(res, { ok: true, reward, achievements: fresh.map((a) => ({ id: a.id, name: a.name, icon: a.icon })) });
    return true;
  }

  return false;
}

module.exports = { handle };
