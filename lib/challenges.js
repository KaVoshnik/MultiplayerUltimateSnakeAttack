"use strict";

// Ежедневные/недельные челленджи. Состояние живёт в entry.stats.challenges
// (та же stats JSONB-колонка, что и стрик/ачивки/инвентарь еды — новой
// миграции БД не требуется). Модуль намеренно не знает про ctx/сеть —
// принимает и мутирует только entry, вызывающий код (stats-rewards.js,
// profiles.js, message-handlers.js) сам решает, когда персистить профиль.

const { DAILY_POOL, WEEKLY_POOL, DAILY_PICK_COUNT, WEEKLY_PICK_COUNT } = require("../data/challenges");

// ============================================================
// ДЕТЕРМИНИРОВАННЫЙ ВЫБОР АКТИВНОГО НАБОРА ПО ДАТЕ
// ============================================================

// djb2 — не нужна крипто-стойкость, только стабильность и разброс для seed'а.
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

// mulberry32 — маленький детерминированный PRNG без внешних зависимостей.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN(pool, n, seedStr) {
  const rng = mulberry32(hashString(seedStr));
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

function dailyPeriodKey(now) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

// Понедельник (UTC) текущей ISO-недели, как YYYY-MM-DD.
function weeklyPeriodKey(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sun=0 -> 7
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function getActiveDaily(now = new Date()) {
  return pickN(DAILY_POOL, DAILY_PICK_COUNT, `daily:${dailyPeriodKey(now)}`);
}

function getActiveWeekly(now = new Date()) {
  return pickN(WEEKLY_POOL, WEEKLY_PICK_COUNT, `weekly:${weeklyPeriodKey(now)}`);
}

// ============================================================
// СОСТОЯНИЕ ИГРОКА (entry.stats.challenges)
// ============================================================

function blankState() {
  return { dailyDate: null, weeklyDate: null, dailyProgress: {}, weeklyProgress: {}, dailyClaimed: [], weeklyClaimed: [] };
}

// Гарантирует, что entry.stats.challenges существует и актуален периоду now.
// Если дата дневного/недельного периода сменилась — прогресс и клеймы
// соответствующего масштаба обнуляются. Это важно: шаблон из старого набора
// мог попасть и в новый (пул небольшой), без сброса челлендж пришёл бы к
// игроку уже "выполненным" на прогрессе из прошлого периода.
function ensureFreshState(entry, now = new Date()) {
  if (!entry.stats.challenges || typeof entry.stats.challenges !== "object") {
    entry.stats.challenges = blankState();
  }
  const state = entry.stats.challenges;
  const dKey = dailyPeriodKey(now);
  const wKey = weeklyPeriodKey(now);
  if (state.dailyDate !== dKey) { state.dailyDate = dKey; state.dailyProgress = {}; state.dailyClaimed = []; }
  if (state.weeklyDate !== wKey) { state.weeklyDate = wKey; state.weeklyProgress = {}; state.weeklyClaimed = []; }
  if (!state.dailyProgress || typeof state.dailyProgress !== "object") state.dailyProgress = {};
  if (!state.weeklyProgress || typeof state.weeklyProgress !== "object") state.weeklyProgress = {};
  if (!Array.isArray(state.dailyClaimed)) state.dailyClaimed = [];
  if (!Array.isArray(state.weeklyClaimed)) state.weeklyClaimed = [];
  return state;
}

// ============================================================
// НАЧИСЛЕНИЕ ПРОГРЕССА
// ============================================================

function bumpProgress(state, scope, template, amount, mode) {
  const bag = scope === "daily" ? state.dailyProgress : state.weeklyProgress;
  const claimed = scope === "daily" ? state.dailyClaimed : state.weeklyClaimed;
  if (claimed.includes(template.id)) return; // забрано — прогресс больше не двигаем
  const current = bag[template.id] || 0;
  bag[template.id] = mode === "max" ? Math.max(current, amount) : current + amount;
}

function forEachActiveTemplate(now, matchKind, fn) {
  for (const t of getActiveDaily(now)) if (t.kind === matchKind) fn("daily", t);
  for (const t of getActiveWeekly(now)) if (t.kind === matchKind) fn("weekly", t);
}

// lifeFoodCount копится за жизнь на самом player (см. game-loop.js/room.js,
// поле player.lifeFoodCount) и прилетает сюда одним вызовом при смерти или
// дисконнекте — та же экономия на трафике/записях в БД, что уже применяется
// к player.inventory (см. комментарий про foodInventory в lib/game-loop.js).
function applyFoodProgress(entry, lifeFoodCount, now = new Date()) {
  if (!lifeFoodCount) return;
  const state = ensureFreshState(entry, now);
  forEachActiveTemplate(now, "food", (scope, t) => {
    const amount = t.foodKind
      ? (lifeFoodCount[t.foodKind] || 0)
      : Object.values(lifeFoodCount).reduce((s, v) => s + (v || 0), 0);
    if (amount > 0) bumpProgress(state, scope, t, amount, "sum");
  });
}

function applyKillProgress(entry, now = new Date()) {
  const state = ensureFreshState(entry, now);
  forEachActiveTemplate(now, "kill", (scope, t) => bumpProgress(state, scope, t, 1, "sum"));
}

function applyGamePlayedProgress(entry, now = new Date()) {
  const state = ensureFreshState(entry, now);
  forEachActiveTemplate(now, "games", (scope, t) => bumpProgress(state, scope, t, 1, "sum"));
}

// score — максимум за ОДНУ игру в периоде (mode="max"); no_poison_death —
// счётчик жизней, закончившихся не от яда (смерть от игрока/стены/босса тоже
// засчитывается — важно "не от яда", а не "выжил").
function applyGameFinishedProgress(entry, { score, diedFromPoison }, now = new Date()) {
  const state = ensureFreshState(entry, now);
  forEachActiveTemplate(now, "score", (scope, t) => bumpProgress(state, scope, t, score || 0, "max"));
  if (!diedFromPoison) {
    forEachActiveTemplate(now, "no_poison_death", (scope, t) => bumpProgress(state, scope, t, 1, "sum"));
  }
}

// ============================================================
// ПОЛЕЗНАЯ НАГРУЗКА ДЛЯ КЛИЕНТА / КЛЕЙМ НАГРАДЫ
// ============================================================

function toPayloadItem(state, scope, template) {
  const bag = scope === "daily" ? state.dailyProgress : state.weeklyProgress;
  const claimed = scope === "daily" ? state.dailyClaimed : state.weeklyClaimed;
  const progress = Math.min(bag[template.id] || 0, template.target);
  return {
    id: template.id, name: template.name, desc: template.desc, icon: template.icon,
    target: template.target, reward: template.reward, progress,
    completed: progress >= template.target, claimed: claimed.includes(template.id),
  };
}

function nextDailyResetIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function nextWeeklyResetIso(now) {
  const monday = new Date(`${weeklyPeriodKey(now)}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString();
}

function getChallengesPayload(entry, now = new Date()) {
  const state = ensureFreshState(entry, now);
  return {
    daily: getActiveDaily(now).map((t) => toPayloadItem(state, "daily", t)),
    weekly: getActiveWeekly(now).map((t) => toPayloadItem(state, "weekly", t)),
    dailyResetAt: nextDailyResetIso(now),
    weeklyResetAt: nextWeeklyResetIso(now),
  };
}

// Забирает награду за выполненный челлендж ровно один раз — claimed-массив
// в state это гарантирует (повторный вызов вернёт ok:false).
function claimChallenge(entry, challengeId, now = new Date()) {
  const state = ensureFreshState(entry, now);
  const daily = getActiveDaily(now).find((t) => t.id === challengeId);
  const weekly = !daily && getActiveWeekly(now).find((t) => t.id === challengeId);
  const template = daily || weekly;
  if (!template) return { ok: false, text: "Такого челленджа сейчас нет в наборе." };
  const scope = daily ? "daily" : "weekly";
  const bag = scope === "daily" ? state.dailyProgress : state.weeklyProgress;
  const claimed = scope === "daily" ? state.dailyClaimed : state.weeklyClaimed;
  if (claimed.includes(template.id)) return { ok: false, text: "Награда уже получена." };
  if ((bag[template.id] || 0) < template.target) return { ok: false, text: "Челлендж ещё не выполнен." };
  claimed.push(template.id);
  return { ok: true, reward: template.reward, template };
}

module.exports = {
  getActiveDaily, getActiveWeekly, ensureFreshState, getChallengesPayload,
  applyFoodProgress, applyKillProgress, applyGamePlayedProgress, applyGameFinishedProgress,
  claimChallenge, dailyPeriodKey, weeklyPeriodKey,
};
