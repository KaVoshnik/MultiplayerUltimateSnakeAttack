"use strict";

const { makeFrame } = require("./ws-protocol");

// Низкоуровневая работа с сокетами клиентов. Всё завязано на ctx —
// общий объект состояния, который собирает server.js (см. ctx.md / README
// секции "Архитектура модулей" в корне, если появится).
//
// Ожидаемые поля ctx: sockets, shopClients, socketSessions, clientAoi,
// rateLimiters, players, rooms-логика (leaveRoom), профили/статистика
// (trackDisconnectStats, recordScore), синк (broadcastGameSync,
// broadcastPresence).

function send(ctx, id, payload) {
  const socket = ctx.sockets.get(id);
  if (!socket || socket.destroyed) return;
  try { socket.write(makeFrame(JSON.stringify(payload))); } catch { removeClient(ctx, id); }
}

function broadcast(ctx, payload) {
  for (const id of ctx.sockets.keys()) send(ctx, id, payload);
}

function removeClient(ctx, id) {
  ctx.sockets.delete(id);
  ctx.shopClients.delete(id);
  ctx.socketSessions.delete(id);
  ctx.clientAoi.delete(id);
  ctx.rateLimiters.remove(id);

  // Уйти из комнаты если был в ней
  ctx.leaveRoom(id);

  const player = ctx.players.get(id);
  if (player) {
    ctx.trackDisconnectStats(player);
    ctx.recordScore(player);
    ctx.players.delete(id);
    ctx.broadcastGameSync();
    ctx.broadcastPresence();
  }
}

// removeClient() сам по себе только чистит серверные Map'ы — обработчик
// socket.on("data", ...) остаётся привязан к живому сокету и продолжит дёргать
// readFrames()/handleMessage() для уже "удалённого" клиента (с чистого листа
// для rate-limiter, т.к. rateLimiters.remove(id) уже отработал). Поэтому там,
// где мы сами разрываем соединение (rate-limit kick, admin kick/ban, дубль
// сессии) — используем closeSocket(), а не голый removeClient().
function closeSocket(ctx, id) {
  const socket = ctx.sockets.get(id);
  removeClient(ctx, id);
  if (socket && !socket.destroyed) {
    try { socket.end(); } catch { /* сокет уже в процессе закрытия — не критично */ }
  }
}

function pingClients(ctx) {
  const frame = makeFrame(JSON.stringify({ type: "ping", t: Date.now() }));
  for (const [id, socket] of ctx.sockets) {
    if (socket.destroyed || socket.writableEnded) continue;
    try { socket.write(frame); } catch { removeClient(ctx, id); }
  }
}

// tables: { asyncHandlers, prePlayerHandlers, playerHandlers } — карты
// type -> (ctx, id, message) => void|Promise, собираются в server.js из
// функций всех остальных модулей (это чистая проводка/wiring, поэтому
// естественно живёт в композиционном корне, а не здесь).
function createMessageHandler(ctx, tables) {
  return function handleMessage(id, message) {
    const { type } = message;

    // #19: rate-limit / anti-flood. Проверяем ДО диспетчеризации — превышающие лимит
    // сообщения тихо дропаются (без ошибки клиенту, чтобы не давать обратную связь чит-скриптам),
    // а при систематическом флуде (MAX_VIOLATIONS нарушений подряд в окне) — рвём соединение.
    const rl = ctx.rateLimiters.check(id, type);
    if (!rl.allowed) {
      if (rl.shouldKick) {
        send(ctx, id, { type: "notice", text: "Отключён за превышение лимита сообщений." });
        closeSocket(ctx, id);
      }
      return;
    }

    if (tables.asyncHandlers[type]) {
      tables.asyncHandlers[type](ctx, id, message).catch((err) => console.error(`${type}:`, err.message));
      return;
    }

    if (tables.prePlayerHandlers[type]) {
      tables.prePlayerHandlers[type](ctx, id, message);
      return;
    }

    if (tables.playerHandlers[type]) {
      tables.playerHandlers[type](ctx, id, message);
    }
  };
}

module.exports = { send, broadcast, removeClient, closeSocket, pingClients, createMessageHandler };
