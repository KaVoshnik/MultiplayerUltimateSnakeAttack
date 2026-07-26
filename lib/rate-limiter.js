"use strict";

// Token bucket + violation tracking для WS-сообщений от одного клиента.
// Чистый модуль без setInterval/setTimeout — время всегда передаётся снаружи
// (now = Date.now() по умолчанию), поэтому легко тестируется без реальных таймеров.

class TokenBucket {
  constructor(capacity, refillPerSec, now = Date.now()) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.lastRefill = now;
  }

  _refill(now) {
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefill = now;
  }

  take(cost = 1, now = Date.now()) {
    this._refill(now);
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

// Лимиты по типу WS-сообщения. Всё, что не перечислено явно, попадает в "default".
// turn — самый частый тип (может слаться на каждое нажатие/свайп), даём запас побольше.
//
// auth_login/auth_register/auth_claim используют этот же механизм, но с ключом
// по IP вместо clientId (см. lib/utils.js getClientIp + auth.js) — там нет
// постоянного соединения, поэтому лимитим сам HTTP-запрос на логин/регистрацию.
const LIMITS = {
  turn: { capacity: 20, refillPerSec: 20 },
  ping: { capacity: 5, refillPerSec: 2 },
  default: { capacity: 10, refillPerSec: 5 },
  // 5 попыток логина сразу, дальше по одной раз в минуту — защита от брутфорса пароля.
  auth_login: { capacity: 5, refillPerSec: 5 / 300 },
  // Регистрация нужна редко — 3 сразу, дальше одна в 20 минут (защита от спама аккаунтов).
  auth_register: { capacity: 3, refillPerSec: 3 / 3600 },
  // Claim-токен — как логин: 5 попыток, потом медленный рефилл (защита от перебора токена).
  auth_claim: { capacity: 5, refillPerSec: 5 / 300 },
};

// Общий потолок на клиента поверх покаждотипных лимитов — защита от комбинированного
// флуда сразу по нескольким типам сообщений (турн + бай + рестарт одновременно).
const GLOBAL_LIMIT = { capacity: 40, refillPerSec: 30 };

// Сколько превышений лимита в скользящем окне нужно, чтобы разорвать соединение.
const MAX_VIOLATIONS = 15;
const VIOLATION_WINDOW_MS = 10_000;

class ClientLimiter {
  constructor(now = Date.now()) {
    this.buckets = new Map(); // messageType -> TokenBucket
    this.global = new TokenBucket(GLOBAL_LIMIT.capacity, GLOBAL_LIMIT.refillPerSec, now);
    this.violations = []; // timestamps превышений в пределах VIOLATION_WINDOW_MS
    this.lastSeenAt = now;
  }

  _bucketFor(type, now) {
    if (!this.buckets.has(type)) {
      const cfg = LIMITS[type] || LIMITS.default;
      this.buckets.set(type, new TokenBucket(cfg.capacity, cfg.refillPerSec, now));
    }
    return this.buckets.get(type);
  }

  check(type, now = Date.now()) {
    this.lastSeenAt = now;
    const globalOk = this.global.take(1, now);
    const bucketOk = this._bucketFor(type, now).take(1, now);
    const allowed = globalOk && bucketOk;

    if (!allowed) this.violations.push(now);
    this.violations = this.violations.filter((t) => now - t <= VIOLATION_WINDOW_MS);

    return {
      allowed,
      violationCount: this.violations.length,
      shouldKick: this.violations.length >= MAX_VIOLATIONS,
    };
  }
}

class RateLimiterRegistry {
  constructor() {
    this.clients = new Map(); // clientId -> ClientLimiter
  }

  check(clientId, type, now = Date.now()) {
    if (!this.clients.has(clientId)) this.clients.set(clientId, new ClientLimiter(now));
    return this.clients.get(clientId).check(type, now);
  }

  remove(clientId) {
    this.clients.delete(clientId);
  }

  size() {
    return this.clients.size;
  }

  // Для WS-клиентов remove() дергается на disconnect, но для реестров,
  // ключами которых служит IP (auth-эндпоинты), явного "disconnect" нет —
  // без этого Map будет расти пока сервер жив. Дергаем по таймеру снаружи.
  cleanup(maxIdleMs, now = Date.now()) {
    for (const [key, limiter] of this.clients) {
      if (now - limiter.lastSeenAt > maxIdleMs) this.clients.delete(key);
    }
  }
}

module.exports = {
  TokenBucket,
  ClientLimiter,
  RateLimiterRegistry,
  LIMITS,
  GLOBAL_LIMIT,
  MAX_VIOLATIONS,
  VIOLATION_WINDOW_MS,
};
