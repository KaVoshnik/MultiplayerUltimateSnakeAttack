"use strict";

// Локальная авторизация по логину/паролю. Никаких внешних провайдеров
// (Google/Яндекс/VK и т.п.) — всё живёт на нашем сервере, никуда не уходит.

const crypto = require("crypto");

const SESSION_COOKIE = "snake_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

const NAME_RE = /^[\p{L}\p{N}_ ]{2,16}$/u;

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

function isSecureRequest(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return proto === "https";
}

function setSessionCookie(res, token, req) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

// --- Пароли: соль + scrypt, храним как "salt:hash" (hex). Без внешних зависимостей. ---

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

async function readJsonBody(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

async function getSession(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  return db.getAuthSession(token);
}

async function startSession(res, req, db, playerName) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.createAuthSession(token, playerName);
  setSessionCookie(res, token, req);
}

function validateCredentials(name, password) {
  if (typeof name !== "string" || !NAME_RE.test(name.trim())) {
    return "Ник: 2–16 символов (буквы, цифры, пробел, _)";
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 128) {
    return "Пароль: от 6 символов";
  }
  return null;
}

async function handleRequest(req, res, url, ctx) {
  const { db, sendJson } = ctx;

  if (url.pathname === "/auth/config") {
    sendJson(res, { enabled: true, mode: "local" });
    return true;
  }

  if (url.pathname === "/api/me") {
    const session = await getSession(req, db).catch(() => null);
    if (!session) {
      sendJson(res, { loggedIn: false });
      return true;
    }
    const profile = ctx.getProfile(session.player_name);
    sendJson(res, {
      loggedIn: true,
      playerId: profile.id || null,
      name: session.player_name,
      customAvatarUrl: profile.stats?.customAvatarUrl || null,
      shopData: profile,
    });
    return true;
  }

  if (url.pathname === "/auth/register" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400); res.end("bad request"); return true;
    }
    const name = String(payload.name || "").trim();
    const password = String(payload.password || "");
    const error = validateCredentials(name, password);
    if (error) { sendJson(res, { ok: false, error }); return true; }

    const taken = await db.isPlayerNameTaken(name).catch(() => true);
    if (taken) { sendJson(res, { ok: false, error: "Этот ник уже занят" }); return true; }

    try {
      const passwordHash = hashPassword(password);
      const row = await db.createPlayerAccount(name, passwordHash);
      const entry = ctx.defaultShopEntry();
      entry.id = row.id;
      ctx.shopData[name] = entry;
      await ctx.persistProfile(name, entry);
      await startSession(res, req, db, name);
      sendJson(res, { ok: true, name });
    } catch (err) {
      console.error("Register:", err.message);
      sendJson(res, { ok: false, error: "Не получилось создать аккаунт" });
    }
    return true;
  }

  if (url.pathname === "/auth/login" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400); res.end("bad request"); return true;
    }
    const name = String(payload.name || "").trim();
    const password = String(payload.password || "");
    if (!name || !password) { sendJson(res, { ok: false, error: "Введите ник и пароль" }); return true; }

    const row = await db.findPlayerByName(name).catch(() => null);
    if (!row || !verifyPassword(password, row.password_hash)) {
      sendJson(res, { ok: false, error: "Неверный ник или пароль" });
      return true;
    }
    await startSession(res, req, db, row.name);
    sendJson(res, { ok: true, name: row.name });
    return true;
  }

  if (url.pathname === "/auth/claim" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      res.writeHead(400); res.end("bad request"); return true;
    }
    const token = String(payload.token || "").trim();
    const password = String(payload.password || "");
    if (!token) { sendJson(res, { ok: false, error: "Нет токена" }); return true; }
    if (password.length < 6 || password.length > 128) {
      sendJson(res, { ok: false, error: "Пароль: от 6 символов" });
      return true;
    }

    const playerName = await db.consumeClaimToken(token).catch(() => null);
    if (!playerName) {
      sendJson(res, { ok: false, error: "Ссылка недействительна или уже использована" });
      return true;
    }

    try {
      await db.setPlayerPassword(playerName, hashPassword(password));
      await startSession(res, req, db, playerName);
      sendJson(res, { ok: true, name: playerName });
    } catch (err) {
      console.error("Claim:", err.message);
      sendJson(res, { ok: false, error: "Не получилось задать пароль" });
    }
    return true;
  }

  if (url.pathname === "/auth/logout" && (req.method === "GET" || req.method === "POST")) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) await db.deleteAuthSession(token);
    clearSessionCookie(res, req);
    if (req.method === "GET") {
      res.writeHead(302, { Location: "/" });
      res.end();
    } else {
      sendJson(res, { ok: true });
    }
    return true;
  }

  return false;
}

module.exports = {
  getSession,
  handleRequest,
  hashPassword,
  verifyPassword,
};
