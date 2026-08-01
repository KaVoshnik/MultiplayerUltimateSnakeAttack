"use strict";

const os = require("os");

function directionFromKey(d) {
  return ({ up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[d] || null;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function cleanName(name, fallbackId) {
  const v = String(name || "").trim().replace(/\s+/g, " ").slice(0, 18);
  return v || `Игрок ${fallbackId}`;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
}

// Тот же trust-модель, что и у getRequestOrigin: за nginx доверяем
// x-forwarded-for (первый адрес в списке — исходный клиент), иначе берём
// адрес сокета напрямую. Используется для лимитов по IP на /auth/* (см.
// LIMITS.auth_login и т.д. в lib/rate-limiter.js).
function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function getRequestOrigin(req, port) {
  const host = (req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`).split(",")[0].trim();
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const wsProto = proto === "https" ? "wss" : "ws";
  return { http: `${proto}://${host}`, ws: `${wsProto}://${host}` };
}

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(payload));
}

// Читаем тело запроса с жёстким лимитом байт — иначе злоумышленник может
// стримить сколько угодно данных и посадить память процесса.
function readBodyLimited(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error("payload_too_large")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = {
  directionFromKey, isOpposite, cleanName, getLanAddresses,
  getRequestOrigin, getClientIp, corsHeaders, sendJson, readBodyLimited,
};
