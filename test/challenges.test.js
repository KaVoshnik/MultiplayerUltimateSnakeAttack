"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const challenges = require("../lib/challenges");
const profiles = require("../lib/profiles");
const { DAILY_POOL, DAILY_PICK_COUNT, WEEKLY_PICK_COUNT } = require("../data/challenges");

function freshEntry() {
  return profiles.normalizeProfile({});
}

// ============================================================
// РОТАЦИЯ НАБОРА
// ============================================================

test("getActiveDaily: детерминирован — одна и та же дата всегда даёт один и тот же набор", () => {
  const day = new Date("2026-07-27T12:00:00Z");
  const a = challenges.getActiveDaily(day).map((t) => t.id);
  const b = challenges.getActiveDaily(new Date("2026-07-27T23:59:59Z")).map((t) => t.id);
  assert.deepEqual(a, b, "разное время суток той же UTC-даты не должно менять набор");
  assert.equal(a.length, DAILY_PICK_COUNT);
  assert.equal(new Set(a).size, DAILY_PICK_COUNT, "не должно быть дублей в наборе");
});

test("getActiveDaily: разные даты обычно дают разные наборы", () => {
  const a = challenges.getActiveDaily(new Date("2026-07-27T00:00:00Z")).map((t) => t.id).sort();
  const b = challenges.getActiveDaily(new Date("2026-07-28T00:00:00Z")).map((t) => t.id).sort();
  assert.notDeepEqual(a, b, "сосед по дате не должен давать идентичный набор (пул достаточно большой)");
});

test("getActiveWeekly: любой день одной ISO-недели (UTC) даёт одинаковый набор", () => {
  // 2026-07-27 — понедельник; 2026-08-02 — воскресенье той же недели.
  const monday = challenges.getActiveWeekly(new Date("2026-07-27T00:00:01Z")).map((t) => t.id);
  const sunday = challenges.getActiveWeekly(new Date("2026-08-02T23:00:00Z")).map((t) => t.id);
  assert.deepEqual(monday, sunday);
  assert.equal(monday.length, WEEKLY_PICK_COUNT);
});

test("getActiveWeekly: следующий понедельник — уже другая (или как минимум пересчитанная) неделя", () => {
  const key1 = challenges.weeklyPeriodKey(new Date("2026-07-27T00:00:00Z"));
  const key2 = challenges.weeklyPeriodKey(new Date("2026-08-03T00:00:00Z"));
  assert.notEqual(key1, key2, "ключ недели должен смениться через 7 дней");
});

// ============================================================
// ПРОГРЕСС: ЕДА
// ============================================================

test("applyFoodProgress: конкретный foodKind считает только свой вид", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const template = DAILY_POOL.find((t) => t.foodKind === "apple");
  assert.ok(template, "в пуле должен быть челлендж на конкретный вид еды для этого теста");

  challenges.applyFoodProgress(entry, { apple: 4, cherry: 100 }, now);
  const state = entry.stats.challenges;
  if (challenges.getActiveDaily(now).some((t) => t.id === template.id)) {
    assert.equal(state.dailyProgress[template.id], 4, "должны посчитаться только яблоки, не вишни");
  }
});

test("applyFoodProgress: foodKind=null суммирует все виды еды", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const anyTemplate = [...challenges.getActiveDaily(now), ...challenges.getActiveWeekly(now)].find((t) => t.kind === "food" && !t.foodKind);
  if (!anyTemplate) return; // в наборе этого дня такого шаблона может не быть — тест не применим

  challenges.applyFoodProgress(entry, { apple: 3, cherry: 2, grape: 1 }, now);
  const scope = challenges.getActiveDaily(now).includes(anyTemplate) ? "dailyProgress" : "weeklyProgress";
  assert.equal(entry.stats.challenges[scope][anyTemplate.id], 6);
});

test("applyFoodProgress: накопление суммируется через несколько вызовов (несколько жизней за день)", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const template = DAILY_POOL.find((t) => t.foodKind === "apple");
  challenges.applyFoodProgress(entry, { apple: 4 }, now);
  challenges.applyFoodProgress(entry, { apple: 5 }, now);
  if (challenges.getActiveDaily(now).some((t) => t.id === template.id)) {
    assert.equal(entry.stats.challenges.dailyProgress[template.id], 9);
  }
});

// ============================================================
// ПРОГРЕСС: УБИЙСТВА / ИГРЫ / СЧЁТ
// ============================================================

test("applyKillProgress: увеличивает прогресс всех активных kill-челленджей на 1", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  challenges.applyKillProgress(entry, now);
  challenges.applyKillProgress(entry, now);
  challenges.applyKillProgress(entry, now);
  const killTemplates = [...challenges.getActiveDaily(now), ...challenges.getActiveWeekly(now)].filter((t) => t.kind === "kill");
  for (const t of killTemplates) {
    const scope = challenges.getActiveDaily(now).includes(t) ? "dailyProgress" : "weeklyProgress";
    assert.equal(entry.stats.challenges[scope][t.id], 3);
  }
});

test("applyGameFinishedProgress: score-челлендж хранит МАКСИМУМ за период, а не сумму", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const scoreTemplates = [...challenges.getActiveDaily(now), ...challenges.getActiveWeekly(now)].filter((t) => t.kind === "score");
  if (!scoreTemplates.length) return;

  challenges.applyGameFinishedProgress(entry, { score: 80, diedFromPoison: false }, now);
  challenges.applyGameFinishedProgress(entry, { score: 220, diedFromPoison: false }, now);
  challenges.applyGameFinishedProgress(entry, { score: 150, diedFromPoison: false }, now);

  for (const t of scoreTemplates) {
    const scope = challenges.getActiveDaily(now).includes(t) ? "dailyProgress" : "weeklyProgress";
    assert.equal(entry.stats.challenges[scope][t.id], 220, "должен остаться лучший результат из трёх игр, не сумма");
  }
});

test("applyGameFinishedProgress: смерть от яда НЕ засчитывается в no_poison_death, обычная смерть — засчитывается", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const t = DAILY_POOL.find((x) => x.kind === "no_poison_death");
  const isActive = challenges.getActiveDaily(now).some((x) => x.id === t.id);
  if (!isActive) return;

  challenges.applyGameFinishedProgress(entry, { score: 10, diedFromPoison: true }, now);
  assert.equal(entry.stats.challenges.dailyProgress[t.id] || 0, 0, "смерть от яда не должна двигать прогресс");

  challenges.applyGameFinishedProgress(entry, { score: 10, diedFromPoison: false }, now);
  assert.equal(entry.stats.challenges.dailyProgress[t.id], 1, "смерть не от яда должна засчитаться");
});

// ============================================================
// РОЛЛОВЕР ПЕРИОДА
// ============================================================

test("ensureFreshState: смена дня обнуляет только dailyProgress/dailyClaimed, недельный прогресс не трогает", () => {
  const entry = freshEntry();
  const day1 = new Date("2026-07-27T23:00:00Z"); // понедельник
  const day2 = new Date("2026-07-28T01:00:00Z"); // вторник — новый daily-период, та же неделя

  challenges.applyKillProgress(entry, day1);
  const weeklyBefore = { ...entry.stats.challenges.weeklyProgress };

  challenges.ensureFreshState(entry, day2);

  assert.deepEqual(entry.stats.challenges.dailyProgress, {}, "дневной прогресс должен обнулиться на новый день");
  assert.deepEqual(entry.stats.challenges.weeklyProgress, weeklyBefore, "недельный прогресс в пределах той же недели не должен обнуляться");
});

test("ensureFreshState: смена недели обнуляет weeklyProgress/weeklyClaimed", () => {
  const entry = freshEntry();
  const week1 = new Date("2026-07-27T10:00:00Z");
  const week2 = new Date("2026-08-03T10:00:00Z"); // следующий понедельник

  challenges.applyKillProgress(entry, week1);
  challenges.ensureFreshState(entry, week2);

  assert.deepEqual(entry.stats.challenges.weeklyProgress, {}, "недельный прогресс должен обнулиться на новую неделю");
});

// ============================================================
// ВЫДАЧА НАГРАДЫ (claimChallenge)
// ============================================================

test("claimChallenge: нельзя забрать награду, пока цель не достигнута", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const t = challenges.getActiveDaily(now)[0];
  challenges.applyKillProgress(entry, now); // могло случайно попасть, но точно меньше target для kill/food/score с большим target

  const result = challenges.claimChallenge(entry, t.id, now);
  if ((entry.stats.challenges.dailyProgress[t.id] || 0) < t.target) {
    assert.equal(result.ok, false);
  }
});

test("claimChallenge: успешный клейм один раз, повторный — отклоняется", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const t = challenges.getActiveDaily(now).find((x) => x.kind === "kill") || challenges.getActiveDaily(now)[0];

  // Догоняем прогресс до target напрямую, чтобы не зависеть от того, какой именно kind выпал.
  challenges.ensureFreshState(entry, now).dailyProgress[t.id] = t.target;

  const first = challenges.claimChallenge(entry, t.id, now);
  assert.equal(first.ok, true);
  assert.equal(first.reward, t.reward);

  const second = challenges.claimChallenge(entry, t.id, now);
  assert.equal(second.ok, false, "повторный клейм того же челленджа должен быть отклонён");
});

test("claimChallenge: неизвестный/неактивный id отклоняется", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const result = challenges.claimChallenge(entry, "not_a_real_challenge_id", now);
  assert.equal(result.ok, false);
});

// ============================================================
// ПОЛЕЗНАЯ НАГРУЗКА ДЛЯ КЛИЕНТА
// ============================================================

test("getChallengesPayload: прогресс никогда не превышает target в отдаваемом payload", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  for (let i = 0; i < 999; i++) challenges.applyKillProgress(entry, now);

  const payload = challenges.getChallengesPayload(entry, now);
  for (const item of [...payload.daily, ...payload.weekly]) {
    assert.ok(item.progress <= item.target, `${item.id}: progress не должен превышать target`);
  }
});

test("getChallengesPayload: completed=true только когда progress >= target", () => {
  const entry = freshEntry();
  const now = new Date("2026-07-27T10:00:00Z");
  const payload = challenges.getChallengesPayload(entry, now);
  for (const item of [...payload.daily, ...payload.weekly]) {
    assert.equal(item.completed, item.progress >= item.target);
    assert.equal(item.progress, 0, "свежий профиль не должен иметь прогресса");
  }
});

// ============================================================
// ОБЩИЙ (СЕРВЕРНЫЙ) НЕДЕЛЬНЫЙ ЧЕЛЛЕНДЖ
// ============================================================

function makeFakeCtx() {
  const broadcasts = [];
  const persisted = [];
  return {
    globalChallenge: null,
    broadcast: (payload) => broadcasts.push(payload),
    persistGlobalChallenge: () => persisted.push(true),
    _broadcasts: broadcasts,
    _persisted: persisted,
  };
}

test("getActiveGlobalWeekly: детерминирован по неделе и не зависит от личной недельной ротации", () => {
  const now = new Date("2026-07-27T10:00:00Z");
  const a = challenges.getActiveGlobalWeekly(now);
  const b = challenges.getActiveGlobalWeekly(new Date("2026-07-30T10:00:00Z"));
  assert.equal(a.id, b.id, "та же неделя — тот же общий челлендж");
  assert.ok(a.kind.endsWith("_sum"), "у общего челленджа всегда суммирующий kind");
});

test("ensureFreshGlobalState: сбрасывает progress при смене недели, сохраняет в пределах недели", () => {
  const week1 = new Date("2026-07-27T10:00:00Z");
  const week2 = new Date("2026-08-03T10:00:00Z");
  let state = challenges.ensureFreshGlobalState(null, week1);
  state.progress = 500;
  const sameWeek = challenges.ensureFreshGlobalState(state, week1);
  assert.equal(sameWeek.progress, 500, "в пределах той же недели прогресс не трогаем");
  const nextWeek = challenges.ensureFreshGlobalState(state, week2);
  assert.equal(nextWeek.progress, 0, "на новой неделе прогресс должен обнулиться");
});

test("applyGlobalKillProgress: копит на ctx.globalChallenge и не трогает kind, если активен другой тип", () => {
  const ctx = makeFakeCtx();
  const now = new Date("2026-07-27T10:00:00Z");
  const template = challenges.getActiveGlobalWeekly(now);

  challenges.applyGlobalKillProgress(ctx, now);
  if (template.kind === "kill_sum") {
    assert.equal(ctx.globalChallenge.progress, 1);
    assert.equal(ctx._broadcasts.length, 1, "изменение должно транслироваться всем сокетам");
    assert.equal(ctx._persisted.length, 1, "изменение должно помечаться на персист");
  } else {
    assert.equal(ctx.globalChallenge, null, "убийство не должно двигать активный челлендж другого типа");
    assert.equal(ctx._broadcasts.length, 0);
  }
});

test("applyGlobalScoreProgress: суммирует очки нескольких игр, а не берёт максимум (в отличие от личного score)", () => {
  const ctx = makeFakeCtx();
  const now = new Date("2026-07-27T10:00:00Z");
  const template = challenges.getActiveGlobalWeekly(now);
  if (template.kind !== "score_sum") return; // применимо только когда выпал именно этот тип

  challenges.applyGlobalScoreProgress(ctx, 100, now);
  challenges.applyGlobalScoreProgress(ctx, 250, now);
  assert.equal(ctx.globalChallenge.progress, 350, "общий счёт должен суммироваться, а не браться как максимум");
});

test("applyGlobalFoodProgress: игнорирует нулевой/пустой вклад (не шлёт лишний broadcast)", () => {
  const ctx = makeFakeCtx();
  const now = new Date("2026-07-27T10:00:00Z");
  const template = challenges.getActiveGlobalWeekly(now);
  if (template.kind !== "food_sum") return;

  challenges.applyGlobalFoodProgress(ctx, { apple: 0, cherry: 0 }, now);
  assert.equal(ctx._broadcasts.length, 0, "нулевой вклад не должен триггерить рассылку");
});

test("getGlobalChallengePayload: работает и с null-состоянием (первый запуск сервера), прогресс не превышает target", () => {
  const now = new Date("2026-07-27T10:00:00Z");
  const payload = challenges.getGlobalChallengePayload(null, now);
  assert.equal(payload.progress, 0);
  assert.ok(payload.target > 0);
  assert.equal(payload.completed, false);

  const overflowing = challenges.getGlobalChallengePayload({ weekKey: challenges.weeklyPeriodKey(now), progress: payload.target * 5 }, now);
  assert.equal(overflowing.progress, overflowing.target, "прогресс в payload не должен превышать target даже если реальное число больше");
});
