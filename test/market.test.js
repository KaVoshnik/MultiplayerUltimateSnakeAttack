"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const market = require("../lib/market");
const profiles = require("../lib/profiles");

// Лёгкий фейковый ctx: реальные profiles.js/market.js работают поверх него,
// в отличие от room.test.js мы НЕ мокаем market.js — это как раз тот модуль,
// который двигает деньги/инвентарь игроков, поэтому его логика должна
// исполняться по-настоящему, мокается только "внешний мир" (БД, сеть).
function makeCtx() {
  const sent = [];
  const broadcasts = [];
  const ctx = {
    shopData: {},
    profileIndex: new Map(),
    marketListings: new Map(),
    players: new Map(),
    shopClients: new Map(),
    socketSessions: new Map(),
    db: {
      upsertPlayer: async () => null,
      upsertFoodListing: async () => {},
      deleteFoodListing: async () => {},
    },
    send: (id, payload) => sent.push({ id, payload }),
    broadcast: (payload) => broadcasts.push(payload),
    sendShopPayload: () => {},
  };
  return { ctx, sent, broadcasts };
}

// nameHint — резолвится напрямую в marketList/marketCancel/marketBuy через
// profiles.resolveName, когда для clientId нет активной сессии/сокета —
// удобно для тестов: не нужно эмулировать WS-подключение целиком.
function seedPlayer(ctx, name, { coins = 0, foodInventory = {} } = {}) {
  const entry = profiles.normalizeProfile({ coins, stats: { foodInventory } });
  ctx.shopData[name] = entry;
  return entry;
}

function listingsFor(ctx, sellerName) {
  return [...ctx.marketListings.values()].filter((l) => l.sellerName === sellerName);
}

test("marketList: выставленное количество списывается с инвентаря и появляется лотом", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Kirill", { foodInventory: { apple: 5 } });

  market.marketList(ctx, "c1", "apple", 3, 10, "Kirill");

  const entry = profiles.getProfile(ctx, "Kirill");
  assert.equal(entry.stats.foodInventory.apple, 2, "3 из 5 яблок должны уйти в лот");
  const listings = listingsFor(ctx, "Kirill");
  assert.equal(listings.length, 1);
  assert.equal(listings[0].quantity, 3);
  assert.equal(listings[0].pricePerUnit, 10);
});

test("marketList: нельзя выставить больше еды, чем есть в инвентаре", () => {
  const { ctx, sent } = makeCtx();
  seedPlayer(ctx, "Kirill", { foodInventory: { apple: 2 } });

  market.marketList(ctx, "c1", "apple", 5, 10, "Kirill");

  assert.equal(listingsFor(ctx, "Kirill").length, 0, "лот не должен создаться");
  assert.equal(profiles.getProfile(ctx, "Kirill").stats.foodInventory.apple, 2, "инвентарь не должен измениться");
  assert.ok(sent.some((s) => s.payload.type === "notice"), "игрок должен получить уведомление об ошибке");
});

test("marketList: цена выше потолка (500/шт) отклоняется", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Kirill", { foodInventory: { apple: 10 } });

  market.marketList(ctx, "c1", "apple", 1, 501, "Kirill");
  assert.equal(listingsFor(ctx, "Kirill").length, 0, "цена 501 должна быть отклонена");

  market.marketList(ctx, "c1", "apple", 1, 500, "Kirill");
  assert.equal(listingsFor(ctx, "Kirill").length, 1, "цена ровно 500 должна пройти");
});

test("marketList: у одного игрока не может быть больше 10 активных лотов", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Kirill", { foodInventory: { apple: 20 } });

  for (let i = 0; i < 10; i++) market.marketList(ctx, "c1", "apple", 1, 5, "Kirill");
  assert.equal(listingsFor(ctx, "Kirill").length, 10);

  market.marketList(ctx, "c1", "apple", 1, 5, "Kirill"); // 11-й лот
  assert.equal(listingsFor(ctx, "Kirill").length, 10, "11-й лот не должен создаться");
});

test("marketBuy: монеты и еда переходят между покупателем и продавцом", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Seller", { foodInventory: { apple: 5 } });
  seedPlayer(ctx, "Buyer", { coins: 100 });
  market.marketList(ctx, "sellerSocket", "apple", 5, 10, "Seller"); // лот: 5 яблок по 10 монет

  const [listing] = listingsFor(ctx, "Seller");
  market.marketBuy(ctx, "buyerSocket", listing.id, 2, "Buyer");

  const buyer = profiles.getProfile(ctx, "Buyer");
  const seller = profiles.getProfile(ctx, "Seller");
  assert.equal(buyer.coins, 80, "у покупателя должно списаться 2×10=20 монет");
  assert.equal(buyer.stats.foodInventory.apple, 2, "покупатель должен получить 2 яблока");
  assert.equal(seller.coins, 20, "продавец должен получить 20 монет");
});

test("marketBuy: частичная покупка уменьшает лот, но не удаляет его", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Seller", { foodInventory: { apple: 5 } });
  seedPlayer(ctx, "Buyer", { coins: 100 });
  market.marketList(ctx, "sellerSocket", "apple", 5, 10, "Seller");

  const [listing] = listingsFor(ctx, "Seller");
  market.marketBuy(ctx, "buyerSocket", listing.id, 2, "Buyer");

  const remaining = ctx.marketListings.get(listing.id);
  assert.ok(remaining, "лот должен остаться, пока не раскуплен полностью");
  assert.equal(remaining.quantity, 3);
});

test("marketBuy: покупка последней единицы удаляет лот целиком", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Seller", { foodInventory: { apple: 2 } });
  seedPlayer(ctx, "Buyer", { coins: 100 });
  market.marketList(ctx, "sellerSocket", "apple", 2, 10, "Seller");

  const [listing] = listingsFor(ctx, "Seller");
  market.marketBuy(ctx, "buyerSocket", listing.id, 2, "Buyer");

  assert.equal(ctx.marketListings.has(listing.id), false, "лот должен быть удалён после полной раскупки");
});

test("marketBuy: нельзя купить свой же лот", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Kirill", { coins: 100, foodInventory: { apple: 5 } });
  market.marketList(ctx, "c1", "apple", 5, 10, "Kirill");
  const [listing] = listingsFor(ctx, "Kirill");

  market.marketBuy(ctx, "c1", listing.id, 1, "Kirill");

  const entry = profiles.getProfile(ctx, "Kirill");
  assert.equal(entry.coins, 100, "монеты не должны были измениться");
  assert.equal(ctx.marketListings.get(listing.id).quantity, 5, "лот не должен уменьшиться");
});

test("marketBuy: недостаточно монет — покупка отклоняется, состояние не меняется", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Seller", { foodInventory: { apple: 5 } });
  seedPlayer(ctx, "Buyer", { coins: 5 }); // хватит только на меньше 1 штуки по цене 10
  market.marketList(ctx, "sellerSocket", "apple", 5, 10, "Seller");
  const [listing] = listingsFor(ctx, "Seller");

  market.marketBuy(ctx, "buyerSocket", listing.id, 1, "Buyer");

  const buyer = profiles.getProfile(ctx, "Buyer");
  assert.equal(buyer.coins, 5, "монеты покупателя не должны были списаться");
  assert.equal(buyer.stats.foodInventory.apple ?? 0, 0, "еда не должна была зачислиться");
  assert.equal(ctx.marketListings.get(listing.id).quantity, 5, "лот должен остаться нетронутым");
});

test("marketCancel: возвращает еду в инвентарь и удаляет лот", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Kirill", { foodInventory: { apple: 5 } });
  market.marketList(ctx, "c1", "apple", 3, 10, "Kirill");
  const [listing] = listingsFor(ctx, "Kirill");

  market.marketCancel(ctx, "c1", listing.id, "Kirill");

  const entry = profiles.getProfile(ctx, "Kirill");
  assert.equal(entry.stats.foodInventory.apple, 5, "все 3 яблока должны вернуться в инвентарь");
  assert.equal(ctx.marketListings.has(listing.id), false);
});

test("marketCancel: нельзя отменить чужой лот", () => {
  const { ctx } = makeCtx();
  seedPlayer(ctx, "Seller", { foodInventory: { apple: 5 } });
  seedPlayer(ctx, "Someone", {});
  market.marketList(ctx, "sellerSocket", "apple", 3, 10, "Seller");
  const [listing] = listingsFor(ctx, "Seller");

  market.marketCancel(ctx, "otherSocket", listing.id, "Someone");

  assert.equal(ctx.marketListings.has(listing.id), true, "чужой лот не должен быть удалён");
  assert.equal(profiles.getProfile(ctx, "Seller").stats.foodInventory.apple, 2, "инвентарь продавца не должен измениться");
});
