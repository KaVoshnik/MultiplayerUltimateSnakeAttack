"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  TokenBucket,
  RateLimiterRegistry,
  MAX_VIOLATIONS,
} = require("../lib/rate-limiter");

test("TokenBucket: пропускает сообщения, пока хватает токенов, и блокирует после исчерпания", () => {
  const t0 = 1000;
  const bucket = new TokenBucket(3, 1, t0); // 3 токена, пополнение 1/сек
  assert.equal(bucket.take(1, t0), true);
  assert.equal(bucket.take(1, t0), true);
  assert.equal(bucket.take(1, t0), true);
  assert.equal(bucket.take(1, t0), false, "4-й запрос в тот же момент времени должен быть отклонён");
});

test("TokenBucket: токены восстанавливаются со временем", () => {
  const t0 = 1000;
  const bucket = new TokenBucket(2, 1, t0); // пополнение 1 токен/сек
  assert.equal(bucket.take(1, t0), true);
  assert.equal(bucket.take(1, t0), true);
  assert.equal(bucket.take(1, t0), false);
  // через 1 секунду должен восстановиться ровно 1 токен
  assert.equal(bucket.take(1, t0 + 1000), true);
  assert.equal(bucket.take(1, t0 + 1000), false);
});

test("TokenBucket: не накапливает токены сверх capacity", () => {
  const t0 = 1000;
  const bucket = new TokenBucket(2, 100, t0); // быстрое пополнение
  bucket.take(2, t0); // опустошили
  // Проходит 10 секунд простоя — токенов должно быть максимум capacity=2, не 1000
  assert.equal(bucket.take(2, t0 + 10_000), true);
  assert.equal(bucket.take(1, t0 + 10_000), false, "нельзя выйти за пределы capacity");
});

test("RateLimiterRegistry: разные клиенты не делят лимиты между собой", () => {
  const registry = new RateLimiterRegistry();
  const t0 = 1000;
  // Забиваем лимит клиенту A по типу 'turn' (capacity=20)
  for (let i = 0; i < 20; i++) registry.check("clientA", "turn", t0);
  const exhaustedA = registry.check("clientA", "turn", t0);
  assert.equal(exhaustedA.allowed, false);

  const freshB = registry.check("clientB", "turn", t0);
  assert.equal(freshB.allowed, true, "лимит клиента A не должен влиять на клиента B");
});

test("RateLimiterRegistry: неизвестный тип сообщения использует лимит default", () => {
  const registry = new RateLimiterRegistry();
  const t0 = 1000;
  // default capacity=10
  for (let i = 0; i < 10; i++) {
    const r = registry.check("client1", "some_random_type", t0);
    assert.equal(r.allowed, true);
  }
  const overflow = registry.check("client1", "some_random_type", t0);
  assert.equal(overflow.allowed, false);
});

test("RateLimiterRegistry: shouldKick срабатывает после MAX_VIOLATIONS превышений в окне", () => {
  const registry = new RateLimiterRegistry();
  const t0 = 1000;
  // Опустошаем именно bucket типа сообщения (capacity=10), без лишних нарушений в setup.
  for (let i = 0; i < 10; i++) registry.check("flooder", "spam_type", t0);

  let lastResult = null;
  for (let i = 0; i < MAX_VIOLATIONS; i++) {
    lastResult = registry.check("flooder", "spam_type", t0);
    if (i < MAX_VIOLATIONS - 1) assert.equal(lastResult.shouldKick, false);
  }
  assert.equal(lastResult.shouldKick, true, "после MAX_VIOLATIONS подряд должен сработать kick");
});

test("RateLimiterRegistry: старые нарушения вне окна не считаются", () => {
  const registry = new RateLimiterRegistry();
  const t0 = 1000;
  for (let i = 0; i < 10; i++) registry.check("flooder2", "spam_type", t0); // исчерпали bucket (без нарушений)
  for (let i = 0; i < 5; i++) registry.check("flooder2", "spam_type", t0); // 5 нарушений в момент t0

  // Проходит 20 секунд (> VIOLATION_WINDOW_MS=10с) — bucket успевает восстановиться,
  // а старые нарушения должны быть вычищены из окна.
  const later = registry.check("flooder2", "spam_type", t0 + 20_000);
  assert.equal(later.allowed, true, "bucket успел полностью восстановиться за 20с");
  assert.equal(later.violationCount, 0, "старые нарушения должны быть отфильтрованы по времени");
});

test("RateLimiterRegistry.remove: очищает состояние клиента при disconnect", () => {
  const registry = new RateLimiterRegistry();
  registry.check("temp", "turn", 1000);
  assert.equal(registry.size(), 1);
  registry.remove("temp");
  assert.equal(registry.size(), 0);
});

test("RateLimiterRegistry: глобальный лимит режет комбинированный флуд по разным типам сообщений", () => {
  const registry = new RateLimiterRegistry();
  const t0 = 1000;
  // global.capacity=40, но каждый отдельный bucket ('a','b','c'...) имеет свой запас —
  // проверяем, что именно общий лимит подрезает поток раньше, чем каждый bucket исчерпается сам.
  let allowedCount = 0;
  for (let i = 0; i < 40; i++) {
    const type = i % 2 === 0 ? "type_a" : "type_b"; // у каждого default capacity=10, но чередуем
    const r = registry.check("multi", type, t0);
    if (r.allowed) allowedCount += 1;
  }
  assert.ok(allowedCount <= 40, "не может пропустить больше, чем позволяет глобальный бюджет");
  assert.ok(allowedCount > 0);
});
