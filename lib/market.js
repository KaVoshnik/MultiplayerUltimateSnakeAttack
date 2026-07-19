"use strict";

// РЫНОК ОБМЕНА ЕДОЙ
// Источник правды — ctx.marketListings (in-memory, как leaderboard), БД только
// персистит для выживания рестарта. Все операции полностью синхронны (без
// await между чтением остатка/монет и записью) — гонка при одновременной
// покупке одного лота двумя игроками исключена самой природой event loop.

const crypto = require("crypto");
const foodMod = require("./food");
const profiles = require("./profiles");

const MAX_LISTINGS_PER_PLAYER = 10;
const MAX_LISTING_PRICE = 500; // за штуку — защита от абсурдных/спам-цен

function getMarketPayload(ctx) {
  return [...ctx.marketListings.values()]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((l) => ({ id: l.id, sellerName: l.sellerName, kind: l.kind, quantity: l.quantity, pricePerUnit: l.pricePerUnit }));
}

function broadcastMarket(ctx) {
  ctx.broadcast({ type: "market_update", listings: getMarketPayload(ctx) });
}

function marketList(ctx, clientId, kind, quantityRaw, priceRaw, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  if (!foodMod.GOOD_FOOD_KINDS.includes(kind)) { ctx.send(clientId, { type: "notice", text: "Неверный вид еды." }); return; }

  const quantity = Math.floor(Number(quantityRaw));
  const pricePerUnit = Math.floor(Number(priceRaw));
  if (!Number.isFinite(quantity) || quantity <= 0) { ctx.send(clientId, { type: "notice", text: "Некорректное количество." }); return; }
  if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0 || pricePerUnit > MAX_LISTING_PRICE) {
    ctx.send(clientId, { type: "notice", text: `Цена — от 1 до ${MAX_LISTING_PRICE} монет за штуку.` }); return;
  }

  const activeCount = [...ctx.marketListings.values()].filter((l) => l.sellerName.toLowerCase() === name.toLowerCase()).length;
  if (activeCount >= MAX_LISTINGS_PER_PLAYER) {
    ctx.send(clientId, { type: "notice", text: `Максимум ${MAX_LISTINGS_PER_PLAYER} лотов одновременно.` }); return;
  }

  const entry = profiles.getProfile(ctx, name);
  const have = entry.stats.foodInventory[kind] || 0;
  if (have < quantity) { ctx.send(clientId, { type: "notice", text: "Недостаточно еды для выставления." }); return; }

  entry.stats.foodInventory[kind] = have - quantity;
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);

  const listing = { id: crypto.randomUUID(), sellerName: name, kind, quantity, pricePerUnit, createdAt: new Date().toISOString() };
  ctx.marketListings.set(listing.id, listing);
  ctx.db.upsertFoodListing(listing).catch((err) => console.error("DB market list:", err.message));

  ctx.send(clientId, { type: "notice", text: `Выставлено на продажу: ${quantity}×.` });
  ctx.sendShopPayload(clientId, name);
  broadcastMarket(ctx);
}

function marketCancel(ctx, clientId, listingId, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const listing = ctx.marketListings.get(listingId);
  if (!listing) { ctx.send(clientId, { type: "notice", text: "Лот уже не существует." }); return; }
  if (listing.sellerName.toLowerCase() !== name.toLowerCase()) { ctx.send(clientId, { type: "notice", text: "Это не твой лот." }); return; }

  const entry = profiles.getProfile(ctx, name);
  entry.stats.foodInventory[listing.kind] = (entry.stats.foodInventory[listing.kind] || 0) + listing.quantity;
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);

  ctx.marketListings.delete(listingId);
  ctx.db.deleteFoodListing(listingId).catch((err) => console.error("DB market cancel:", err.message));

  ctx.send(clientId, { type: "notice", text: "Лот снят, еда вернулась в инвентарь." });
  ctx.sendShopPayload(clientId, name);
  broadcastMarket(ctx);
}

function marketBuy(ctx, clientId, listingId, quantityRaw, nameHint) {
  const name = profiles.resolveName(ctx, clientId, nameHint);
  if (!name) return;
  const listing = ctx.marketListings.get(listingId);
  if (!listing) { ctx.send(clientId, { type: "notice", text: "Лот уже раскупили." }); return; }
  if (listing.sellerName.toLowerCase() === name.toLowerCase()) { ctx.send(clientId, { type: "notice", text: "Нельзя купить свой же лот." }); return; }

  const qty = Math.min(Math.max(1, Math.floor(Number(quantityRaw) || 1)), listing.quantity);
  const totalPrice = qty * listing.pricePerUnit;

  const entry = profiles.getProfile(ctx, name);
  profiles.syncProfileCoins(ctx, name, entry);
  const coins = Number(entry.coins) || 0;
  if (coins < totalPrice) { ctx.send(clientId, { type: "notice", text: "Недостаточно монет." }); return; }

  entry.coins = coins - totalPrice;
  entry.stats.foodInventory[listing.kind] = (entry.stats.foodInventory[listing.kind] || 0) + qty;
  const buyerPlayer = ctx.players.get(clientId);
  if (buyerPlayer) buyerPlayer.coins = entry.coins;
  ctx.shopData[name] = entry;
  profiles.persistProfile(ctx, name, entry);

  listing.quantity -= qty;
  if (listing.quantity <= 0) {
    ctx.marketListings.delete(listing.id);
    ctx.db.deleteFoodListing(listing.id).catch((err) => console.error("DB market buy (delete):", err.message));
  } else {
    ctx.db.upsertFoodListing(listing).catch((err) => console.error("DB market buy (update):", err.message));
  }

  const sellerEntry = profiles.getProfile(ctx, listing.sellerName);
  sellerEntry.coins = (Number(sellerEntry.coins) || 0) + totalPrice;
  ctx.shopData[listing.sellerName] = sellerEntry;
  profiles.persistProfile(ctx, listing.sellerName, sellerEntry);
  const sellerPlayer = [...ctx.players.values()].find((p) => p.name.toLowerCase() === listing.sellerName.toLowerCase());
  if (sellerPlayer) sellerPlayer.coins = sellerEntry.coins;

  ctx.send(clientId, { type: "notice", text: `Куплено: ${qty}× за ${totalPrice} монет!` });
  ctx.sendShopPayload(clientId, name);
  for (const sid of profiles.findSocketIdsByName(ctx, listing.sellerName)) {
    ctx.send(sid, { type: "notice", text: `${name} купил у тебя ${qty}× за ${totalPrice} монет!` });
    ctx.sendShopPayload(sid, listing.sellerName);
  }
  broadcastMarket(ctx);
}

module.exports = { getMarketPayload, broadcastMarket, marketList, marketCancel, marketBuy };
