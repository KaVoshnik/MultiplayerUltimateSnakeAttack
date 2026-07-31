"use strict";

// Ежедневные/недельные челленджи. Личный прогресс живёт в
// entry.stats.challenges (та же stats JSONB-колонка, что и стрик/ачивки/
// инвентарь еды — новой миграции БД не требуется). Общий (серверный)
// недельный челлендж — отдельная штука: один счётчик на всех игроков,
// живёт в ctx.globalChallenge + таблице server_state (см. db.js), т.к.
// это не персональные данные и в stats профиля ему не место.
//
// Личные функции (get/apply/ensureFreshState/claimChallenge) намеренно не
// знают про ctx/сеть — принимают и мутируют только entry, вызывающий код
// (stats-rewards.js, profiles.js, message-handlers.js) сам решает, когда
// персистить профиль. Общие applyGlobal*-функции по необходимости берут ctx
// (общий счётчик больше негде хранить) и сами дёргают ctx.persistGlobalChallenge/
// ctx.broadcast, если они подключены.

const {
  DAILY_POOL, WEEKLY_POOL, GLOBAL_WEEKLY_POOL,
  DAILY_PICK_COUNT, WEEKLY_PICK_COUNT, GLOBAL_WEEKLY_PICK_COUNT,
} = require("../data/challenges");

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

function getActiveGlobalWeekly(now = new Date()) {
  return pickN(GLOBAL_WEEKLY_POOL, GLOBAL_WEEKLY_PICK_COUNT, `globalweekly:${weeklyPeriodKey(now)}`)[0];
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

// ============================================================
// ОБЩИЙ (СЕРВЕРНЫЙ) НЕДЕЛЬНЫЙ ЧЕЛЛЕНДЖ
// ============================================================
// В отличие от личных, тут нет "прогресса игрока" — один счётчик, в который
// пишут вклад ВСЕ игроки сразу. Живёт в ctx.globalChallenge (см. server.js —
// грузится из server_state при старте, персистится раз в N секунд через
// ctx.persistGlobalChallenge, транслируется всем сокетам через ctx.broadcast).

function blankGlobalState() {
  return { weekKey: null, progress: 0 };
}

// raw — то, что лежит в ctx.globalChallenge (может быть null при первом
// запуске сервера или null из ещё пустой server_state).
function ensureFreshGlobalState(raw, now = new Date()) {
  const state = raw && typeof raw === "object" ? { ...blankGlobalState(), ...raw } : blankGlobalState();
  const key = weeklyPeriodKey(now);
  if (state.weekKey !== key) { state.weekKey = key; state.progress = 0; }
  if (typeof state.progress !== "number" || !Number.isFinite(state.progress)) state.progress = 0;
  return state;
}

function ensureCtxGlobalState(ctx, now = new Date()) {
  ctx.globalChallenge = ensureFreshGlobalState(ctx.globalChallenge, now);
  return ctx.globalChallenge;
}

function getGlobalChallengePayload(rawState, now = new Date()) {
  const template = getActiveGlobalWeekly(now);
  const state = ensureFreshGlobalState(rawState, now);
  return {
    id: template.id, name: template.name, desc: template.desc, icon: template.icon,
    target: template.target, progress: Math.min(state.progress, template.target),
    completed: state.progress >= template.target,
    resetAt: nextWeeklyResetIso(now),
  };
}

// После мутации ctx.globalChallenge зовём (если подключены) персист и
// бродкаст всем сокетам — обе функции опциональны, чтобы модуль оставался
// тестируемым без реального ctx (см. test/challenges.test.js).
function notifyGlobalChange(ctx, now) {
  if (ctx.persistGlobalChallenge) ctx.persistGlobalChallenge(ctx.globalChallenge);
  if (ctx.broadcast) ctx.broadcast({ type: "global_challenge", ...getGlobalChallengePayload(ctx.globalChallenge, now) });
}

// lifeFoodCount — то же самое накопление за жизнь, что уже используется для
// личного прогресса (applyFoodProgress), просто суммируется в общий счётчик,
// а не в entry конкретного игрока.
function applyGlobalFoodProgress(ctx, lifeFoodCount, now = new Date()) {
  if (!lifeFoodCount) return;
  const template = getActiveGlobalWeekly(now);
  if (template.kind !== "food_sum") return;
  const amount = template.foodKind
    ? (lifeFoodCount[template.foodKind] || 0)
    : Object.values(lifeFoodCount).reduce((s, v) => s + (v || 0), 0);
  if (amount <= 0) return;
  const state = ensureCtxGlobalState(ctx, now);
  state.progress += amount;
  notifyGlobalChange(ctx, now);
}

function applyGlobalKillProgress(ctx, now = new Date()) {
  const template = getActiveGlobalWeekly(now);
  if (template.kind !== "kill_sum") return;
  const state = ensureCtxGlobalState(ctx, now);
  state.progress += 1;
  notifyGlobalChange(ctx, now);
}

function applyGlobalScoreProgress(ctx, score, now = new Date()) {
  const template = getActiveGlobalWeekly(now);
  if (template.kind !== "score_sum" || !(score > 0)) return;
  const state = ensureCtxGlobalState(ctx, now);
  state.progress += score;
  notifyGlobalChange(ctx, now);
}

module.exports = {
  getActiveDaily, getActiveWeekly, ensureFreshState, getChallengesPayload,
  applyFoodProgress, applyKillProgress, applyGamePlayedProgress, applyGameFinishedProgress,
  claimChallenge, dailyPeriodKey, weeklyPeriodKey,
  getActiveGlobalWeekly, ensureFreshGlobalState, getGlobalChallengePayload,
  applyGlobalFoodProgress, applyGlobalKillProgress, applyGlobalScoreProgress,
};
