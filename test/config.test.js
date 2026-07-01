"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const gameConfig = require("../config/game");

test("config/game.js экспортирует размеры поля", () => {
  assert.ok(gameConfig.GRID, "GRID должен быть определён");
  assert.equal(typeof gameConfig.GRID.width, "number");
  assert.equal(typeof gameConfig.GRID.height, "number");
  assert.ok(gameConfig.GRID.width > 0);
  assert.ok(gameConfig.GRID.height > 0);
});

test("MAX_PLAYERS — положительное число", () => {
  assert.equal(typeof gameConfig.MAX_PLAYERS, "number");
  assert.ok(gameConfig.MAX_PLAYERS > 0);
});

test("BONUS_TYPES содержит ожидаемые бонусы с длительностью", () => {
  assert.ok(gameConfig.BONUS_TYPES.shield);
  assert.ok(gameConfig.BONUS_TYPES.shield.duration > 0);
});
