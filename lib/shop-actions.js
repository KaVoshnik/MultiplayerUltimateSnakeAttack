"use strict";

const profiles = require("./profiles");
const { SHOP_CATALOG, SHOP_SKINS, AVATAR_PRESETS } = require("../data/shop-catalog");
const { getBattlePassConfig } = require("../data/battle-pass");

function sendShopPayload(ctx, clientId, name) {
  const entry = profiles.getProfile(ctx, name);
  profiles.syncProfileCoins(ctx, name, entry);
  ctx.shopData[name] = entry;
  ctx.send(clientId, { type: "shop_update", shopData: entry, skins: SHOP_SKINS, catalog: SHOP_CATALOG, avatars: AVATAR_PRESETS, battlePass: getBattlePassConfig() });
}

function buyItem(ctx, clientId, itemId, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = profiles.getProfile(ctx, name);
  const player = ctx.players.get(clientId);
  profiles.syncProfileCoins(ctx, name, entry);
  const coins = Number(entry.coins) || 0;
  const price = Number(item.price) || 0;

  if (entry.inventory.includes(itemId)) { equipItem(ctx, clientId, itemId, name); return; }
  if (price === 0) {
    if (!entry.inventory.includes(itemId)) entry.inventory.push(itemId);
    ctx.shopData[name] = entry;
    profiles.persistProfile(ctx, name, entry);
    equipItem(ctx, clientId, itemId, name);
    return;
  }
  if (coins < price) { ctx.send(clientId, { type: "notice", text: "Недостаточно монет!" }); sendShopPayload(ctx, clientId, name); return; }

  const newCoins = coins - price;
  if (player) player.coins = newCoins;
  entry.coins = newCoins;
  entry.inventory.push(itemId);
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);
  equipItem(ctx, clientId, itemId, name);
  ctx.send(clientId, { type: "notice", text: `Куплено: ${item.name}!` });
  profiles.checkAchievements(ctx, name, entry).catch((err) => console.error("Achievements:", err.message));
}

function equipItem(ctx, clientId, itemId, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = profiles.getProfile(ctx, name);
  if (!profiles.ownsItem(entry, itemId)) { ctx.send(clientId, { type: "notice", text: "Сначала купи предмет!" }); return; }
  const player = ctx.players.get(clientId);

  if (item.category === "skin") {
    entry.activeSkin = entry.activeSkin === itemId && itemId !== "default" ? "default" : itemId;
    if (player) ctx.applySkinToPlayer(player, profiles.getSkinDef(entry.activeSkin));
  } else if (item.category === "snake_hat") {
    entry.equipped.snakeHat = entry.equipped.snakeHat === itemId ? null : itemId;
    profiles.applyCosmeticsToPlayer(ctx, player, name);
  }

  profiles.syncProfileCoins(ctx, name, entry);
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);
  sendShopPayload(ctx, clientId, name);
  if (player) ctx.resyncPlayer(clientId);
  ctx.broadcastGameSync();
}

function unequipItem(ctx, clientId, itemId, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return;
  const entry = profiles.getProfile(ctx, name);
  const player = ctx.players.get(clientId);

  if (item.category === "skin") {
    if (itemId !== "default") entry.activeSkin = "default";
    if (player) ctx.applySkinToPlayer(player, profiles.getSkinDef("default"));
  } else if (item.category === "snake_hat") {
    entry.equipped.snakeHat = null;
    profiles.applyCosmeticsToPlayer(ctx, player, name);
  }

  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);
  sendShopPayload(ctx, clientId, name);
  if (player) ctx.resyncPlayer(clientId);
  ctx.broadcastGameSync();
}

function equipNickColor(ctx, clientId, colorId, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const entry = profiles.getProfile(ctx, name);

  if (!colorId || colorId === "default") {
    entry.stats.activeNickColor = null;
  } else if (!entry.stats.battlePassUnlocked?.includes(colorId)) {
    ctx.send(clientId, { type: "notice", text: "Сначала открой цвет в боевом пропуске!" }); return;
  } else {
    entry.stats.activeNickColor = colorId;
  }

  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);
  const player = ctx.players.get(clientId);
  if (player) { profiles.applyCosmeticsToPlayer(ctx, player, name); ctx.resyncPlayer(clientId); ctx.broadcastGameSync(); }
  sendShopPayload(ctx, clientId, name);
}

module.exports = { sendShopPayload, buyItem, equipItem, unequipItem, equipNickColor };
