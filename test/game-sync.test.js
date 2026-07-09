"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const gameSync = require("../lib/game-sync");

function makePlayer(id, overrides = {}) {
  return {
    id,
    name: `player${id}`,
    color: "#fff",
    headColor: "#fff",
    snake: [{ x: 0, y: 0 }],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    alive: true,
    score: 0,
    coins: 0,
    combo: 0,
    maxCombo: 0,
    coinsEarned: 0,
    ...overrides,
  };
}

function makeCtx(players, overrides = {}) {
  const map = new Map(players.map((p) => [p.id, p]));
  return {
    grid: { width: 40, height: 30 },
    players: map,
    food: [],
    bonuses: [],
    bosses: [],
    bonusTypes: {},
    tickCount: 1,
    tickMs: 100,
    clientAoi: new Map(),
    extrasFor: () => ({ best: 0, spawnFrozenLeft: 0, heat: 0, avatar: null, snakeHatEmoji: null, snakeHatId: null }),
    ...overrides,
  };
}

test("inAoi: точка внутри радиуса (Манхэттенское расстояние)", () => {
  assert.equal(gameSync.inAoi(10, 0, 0, 0, 10), true);
  assert.equal(gameSync.inAoi(11, 0, 0, 0, 10), false);
  assert.equal(gameSync.inAoi(5, 5, 0, 0, 10), true); // |5|+|5|=10
});

test("inFoodAoi: точка внутри базового радиуса видна независимо от направления движения", () => {
  const player = makePlayer(1, { direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 } });
  assert.equal(gameSync.inFoodAoi(20, 0, 0, 0, player), true);
  // Даже позади по курсу — раз внутри FOOD_AOI_RADIUS (88), radius-проверка её всё равно пропускает.
  assert.equal(gameSync.inFoodAoi(-20, 0, 0, 0, player), true);
});

test("inFoodAoi: точка далеко за пределами и радиуса, и конуса — не видна", () => {
  const player = makePlayer(1, { direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 } });
  // dist=150 > FOOD_AOI_RADIUS(88); along=150 > LOOKAHEAD_CELLS(36) — не попадает ни туда, ни туда.
  assert.equal(gameSync.inFoodAoi(150, 0, 0, 0, player), false);
});

test("inFoodAoi: при текущих константах (RADIUS=88, LOOKAHEAD=36+10) конус целиком поглощён радиусом", () => {
  // Худший случай конуса: along=36, perp=10 → Манхэттен-дистанция = 46, что всегда < 88.
  // Т.е. ветка \"конус вперёд\" при текущих числах никогда не добавляет видимость сверх обычного радиуса.
  const player = makePlayer(1, { direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 } });
  const edgeOfCone = gameSync.inFoodAoi(36, 10, 0, 0, player);
  const plainRadius = gameSync.inAoi(36, 10, 0, 0, gameSync.FOOD_AOI_RADIUS);
  assert.equal(edgeOfCone, true);
  assert.equal(plainRadius, true, "и обычный радиус уже покрывает эту точку без учёта направления");
});

test("buildDelta: возвращает null, если после базовых полей (type/seq/tickMs) ничего не добавилось", () => {
  const p1 = makePlayer(1);
  const ctx = makeCtx([p1]);
  const journal = gameSync.createJournal(); // пустой журнал — ничего не изменилось
  const delta = gameSync.buildDelta(ctx, 1, journal);
  assert.equal(delta, null);
});

test("buildDelta: регрессия — дельта с mv+pm (5 ключей) не должна отбрасываться", () => {
  // Раньше был баг: дельты с <=5 ключами (mv+pm поверх 3 базовых) отбрасывались,
  // из-за чего движение игроков массово терялось на клиенте (десинк).
  const p1 = makePlayer(1);
  const ctx = makeCtx([p1]);
  const journal = gameSync.createJournal();
  journal.moves.push(gameSync.packPlayerMove(p1));
  journal.meta.push(gameSync.packPlayerMeta(p1, { spawnFrozenLeft: 0, heat: 0 }));

  const delta = gameSync.buildDelta(ctx, 1, journal);
  assert.notEqual(delta, null, "дельта с move+meta не должна отбрасываться как пустая");
  assert.ok(Array.isArray(delta.mv) && delta.mv.length === 1);
  assert.ok(Array.isArray(delta.pm) && delta.pm.length === 1);
});

test("buildDelta: игрок вне AOI не получает чужие move-события", () => {
  const self = makePlayer(1, { snake: [{ x: 0, y: 0 }] });
  const far = makePlayer(2, { snake: [{ x: 500, y: 500 }] }); // далеко за пределами PLAYER_AOI_RADIUS
  const ctx = makeCtx([self, far]);
  const journal = gameSync.createJournal();
  journal.moves.push(gameSync.packPlayerMove(far));

  const delta = gameSync.buildDelta(ctx, 1, journal);
  assert.equal(delta, null, "move далёкого игрока не должен просачиваться в дельту для self");
});

test("buildDelta: свои собственные move-события доходят всегда, независимо от AOI-фильтра", () => {
  const self = makePlayer(1, { snake: [{ x: 0, y: 0 }] });
  const ctx = makeCtx([self]);
  const journal = gameSync.createJournal();
  journal.moves.push(gameSync.packPlayerMove(self));

  const delta = gameSync.buildDelta(ctx, 1, journal);
  assert.notEqual(delta, null);
  assert.equal(delta.mv[0][0], 1);
});

test("buildSnapshot: возвращает null для несуществующего игрока", () => {
  const ctx = makeCtx([]);
  assert.equal(gameSync.buildSnapshot(ctx, "ghost"), null);
});

test("buildSnapshot: включает только игроков в радиусе видимости, но всегда включает себя", () => {
  const self = makePlayer(1, { snake: [{ x: 0, y: 0 }] });
  const near = makePlayer(2, { snake: [{ x: 5, y: 5 }] });
  const far = makePlayer(3, { snake: [{ x: 1000, y: 1000 }] });
  const ctx = makeCtx([self, near, far]);

  const snap = gameSync.buildSnapshot(ctx, 1);
  const ids = snap.players.map((p) => p.id);
  assert.ok(ids.includes(1), "self всегда должен быть в снапшоте");
  assert.ok(ids.includes(2), "игрок рядом должен быть виден");
  assert.ok(!ids.includes(3), "далёкий игрок не должен быть виден");
});

test("buildPresence: считает живых и общее число игроков", () => {
  const p1 = makePlayer(1, { alive: true });
  const p2 = makePlayer(2, { alive: false });
  const ctx = makeCtx([p1, p2]);
  const presence = gameSync.buildPresence(ctx);
  assert.equal(presence.players, 2);
  assert.equal(presence.alive, 1);
});
