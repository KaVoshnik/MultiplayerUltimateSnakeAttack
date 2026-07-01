"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { insideGrid, pointKey } = require("../lib/food");

const GRID = { width: 40, height: 30 };

test("insideGrid: точка внутри поля считается валидной", () => {
  assert.equal(insideGrid({ x: 0, y: 0 }, GRID), true);
  assert.equal(insideGrid({ x: 39, y: 29 }, GRID), true);
});

test("insideGrid: точка за пределами поля отбрасывается", () => {
  assert.equal(insideGrid({ x: -1, y: 0 }, GRID), false);
  assert.equal(insideGrid({ x: 40, y: 0 }, GRID), false);
  assert.equal(insideGrid({ x: 0, y: 30 }, GRID), false);
});

test("pointKey: формирует уникальный ключ для координат", () => {
  assert.equal(pointKey({ x: 3, y: 7 }), "3:7");
  assert.notEqual(pointKey({ x: 3, y: 7 }), pointKey({ x: 7, y: 3 }));
});
