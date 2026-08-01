"use strict";

// Минималистичный structured-логгер: без зависимостей, без транспортов —
// просто JSON-строка на событие (ts, level, msg, ...meta) вместо голого
// console.log/console.error по всему серверу. Формат специально плоский
// и однострочный, чтобы grep/jq и любой лог-агрегатор читали его без
// дополнительного парсинга.
//
// Уровень регулируется LOG_LEVEL в окружении (error|warn|info|debug),
// по умолчанию info. debug стоит включать только локально — на проде
// объём логов от него может быть избыточным (например, потенциальный
// будущий дебаг тика или рассинхрона AOI).

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, msg, meta) {
  if (LEVELS[level] > CURRENT) return;
  const line = { ts: new Date().toISOString(), level, msg, ...meta };
  (level === "error" || level === "warn" ? console.error : console.log)(JSON.stringify(line));
}

module.exports = {
  error: (msg, meta) => log("error", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};
