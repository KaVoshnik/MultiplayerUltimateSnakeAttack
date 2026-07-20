"use strict";

const profiles = require("./profiles");
const roomsSetup = require("./rooms-setup");
const gameLoop = require("./game-loop");
const shopActions = require("./shop-actions");
const market = require("./market");
const phrasesMod = require("./phrases");
const { directionFromKey, isOpposite } = require("./utils");
const { AVATAR_PRESETS } = require("../data/shop-catalog");

// ============================================================
// SHOP CONNECT
// ============================================================

async function handleShopConnect(ctx, id, message) {
  const resolved = await profiles.resolvePlayName(ctx, id, message.name);
  if (!resolved.ok) { ctx.send(id, { type: "notice", text: resolved.text }); return; }
  ctx.shopClients.set(id, resolved.name);
  ctx.sendShopPayload(id, resolved.name);
}

// ============================================================
// ROOM HANDLERS
// ============================================================

async function handleRoomCreate(ctx, id, message) {
  const resolved = await profiles.resolvePlayName(ctx, id, message.name);
  if (!resolved.ok) { ctx.send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  // Регистрируем имя в shopClients если ещё нет
  if (!ctx.shopClients.has(id)) ctx.shopClients.set(id, name);
  roomsSetup.leaveRoom(ctx, id);
  const room = roomsSetup.createRoom(ctx, id, false);
  const cos = profiles.getPlayerCosmetics(ctx, name);
  room.addWaiter(id, name, cos);
  ctx.socketRoom.set(id, room.code);
  ctx.send(id, { ...room.lobbySnapshot(), type: "room_created", code: room.code });
}

async function handleRoomJoin(ctx, id, message) {
  const resolved = await profiles.resolvePlayName(ctx, id, message.name);
  if (!resolved.ok) { ctx.send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  if (!ctx.shopClients.has(id)) ctx.shopClients.set(id, name);
  const code = String(message.code || "").toUpperCase().trim();
  const result = roomsSetup.joinRoom(ctx, id, code, name);
  if (!result.ok) { ctx.send(id, { type: "room_error", text: result.text }); return; }
  ctx.send(id, { type: "room_joined", code, ...result.room.lobbySnapshot() });
}

async function handleRoomRejoin(ctx, id, message) {
  // Игрок перешёл из rooms.html в game.html — переподключаем к уже запущенной комнате
  const resolved = await profiles.resolvePlayName(ctx, id, message.name);
  if (!resolved.ok) { ctx.send(id, { type: "room_error", text: resolved.text }); return; }
  const name = resolved.name;
  const code = String(message.code || "").toUpperCase().trim();
  const room = ctx.rooms.get(code);
  if (!room) { ctx.send(id, { type: "notice", text: "Комната не найдена." }); sendJoinFallback(ctx, id, name); return; }

  if (!ctx.shopClients.has(id)) ctx.shopClients.set(id, name);
  ctx.socketRoom.set(id, code);

  if (room.started) {
    // Комната уже запущена — обновляем socket в players и шлём снэпшот
    const existing = [...room.players.entries()].find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const [oldId, player] = existing;
      if (oldId !== id) {
        room.players.delete(oldId);
        room.clientAoi.delete(oldId);
        player.id = id;
        room.players.set(id, player);
      }
    } else {
      // Новый игрок заходит в уже запущенную комнату
      const prof = profiles.getProfile(ctx, name);
      const skin = profiles.getSkinDef(prof.activeSkin);
      const cos = profiles.getPlayerCosmetics(ctx, name);
      profiles.startNewLife(ctx, name);
      room.players.set(id, room._createPlayer(id, name, skin, cos));
    }
    room._sendSnapshot(id);
  } else {
    // Комната есть но не запущена — добавляем в лобби
    const cos = profiles.getPlayerCosmetics(ctx, name);
    room.addWaiter(id, name, cos);
    room.broadcastLobby();
  }
}

function sendJoinFallback(ctx, id, name) {
  // Комната пропала — кидаем в обычную игру
  const prof = profiles.getProfile(ctx, name);
  const skin = profiles.getSkinDef(prof.activeSkin);
  profiles.startNewLife(ctx, name);
  ctx.players.set(id, gameLoop.createPlayer(ctx, id, name, skin));
  gameLoop.sendSnapshot(ctx, id);
  gameLoop.forceAoiResync(ctx, id);
  gameLoop.broadcastGameSync(ctx);
}

async function handleRoomStart(ctx, id) {
  const room = roomsSetup.getRoomOf(ctx, id);
  if (!room) { ctx.send(id, { type: "room_error", text: "Вы не в комнате." }); return; }
  const result = room.start(id);
  if (!result.ok) { ctx.send(id, { type: "room_error", text: result.text }); return; }
}

async function handleRoomLeave(ctx, id) {
  roomsSetup.leaveRoom(ctx, id);
  ctx.send(id, { type: "room_left" });
}

async function handleRoomInvite(ctx, id, message) {
  const session = ctx.socketSessions.get(id);
  if (!session) { ctx.send(id, { type: "notice", text: "Войди в аккаунт, чтобы приглашать друзей." }); return; }
  const code = ctx.socketRoom.get(id);
  if (!code || !ctx.rooms.has(code)) { ctx.send(id, { type: "notice", text: "Ты сейчас не в комнате." }); return; }
  const targetName = profiles.profileName(message.name);
  if (!targetName) return;
  const status = await ctx.db.getFriendshipStatus(session.player_name, targetName).catch(() => "none");
  if (status !== "friends") { ctx.send(id, { type: "notice", text: "Приглашать в комнату можно только друзей." }); return; }
  const targetIds = profiles.findSocketIdsByName(ctx, targetName);
  if (targetIds.length === 0) { ctx.send(id, { type: "notice", text: `${targetName} сейчас не в сети.` }); return; }
  for (const targetId of targetIds) {
    ctx.send(targetId, { type: "room_invite", from: session.player_name, code });
  }
  ctx.send(id, { type: "notice", text: `Приглашение отправлено игроку ${targetName}.` });
}

// ============================================================
// JOIN / PROFILE
// ============================================================

async function handleJoin(ctx, id, message) {
  const resolved = await profiles.resolvePlayName(ctx, id, message.name);
  if (!resolved.ok) { ctx.send(id, { type: "notice", text: resolved.text }); return; }
  const name = resolved.name;
  const prof = profiles.getProfile(ctx, name);
  const skin = profiles.getSkinDef(prof.activeSkin);
  profiles.startNewLife(ctx, name);
  ctx.shopClients.set(id, name);
  ctx.players.set(id, gameLoop.createPlayer(ctx, id, name, skin));
  gameLoop.sendSnapshot(ctx, id);
  gameLoop.forceAoiResync(ctx, id);
  gameLoop.broadcastGameSync(ctx);
  gameLoop.broadcastPresence(ctx);
}

async function saveProfile(ctx, clientId, message) {
  const session = ctx.socketSessions.get(clientId);
  const newName = profiles.profileName(message.name);
  if (!newName) { ctx.send(clientId, { type: "notice", text: "Никнейм не может быть пустым!" }); return; }
  if (!session) { ctx.send(clientId, { type: "notice", text: "Войди в аккаунт, чтобы редактировать профиль." }); return; }

  const oldName = session.player_name;
  const avatar = AVATAR_PRESETS.includes(message.avatar) ? message.avatar : "😎";
  const entry = profiles.getProfile(ctx, oldName);
  entry.avatar = avatar;
  profiles.syncProfileCoins(ctx, oldName, entry);
  if (!entry.id) await profiles.persistProfile(ctx, oldName, entry);

  if (oldName.toLowerCase() !== newName.toLowerCase()) {
    if (await profiles.isNameTaken(ctx, newName, oldName)) { ctx.send(clientId, { type: "notice", text: "Это имя уже занято!" }); return; }
    profiles.syncProfileCoins(ctx, oldName, entry);
    delete ctx.shopData[oldName];
    profiles.profileIndexDelete(ctx, oldName);
    ctx.shopClients.set(clientId, newName);
    const player = ctx.players.get(clientId);
    if (player) player.name = newName;
    ctx.shopData[newName] = entry;
    profiles.profileIndexSet(ctx, newName);
    session.player_name = newName;
    ctx.socketSessions.set(clientId, session);
    await ctx.db.renamePlayer(oldName, newName, entry);
  } else {
    profiles.syncProfileCoins(ctx, newName, entry);
    ctx.shopData[newName] = entry;
    await profiles.persistProfile(ctx, newName, entry);
  }

  ctx.send(clientId, { type: "profile_saved", shopData: entry, name: newName, playerId: entry.id || null });
  ctx.sendShopPayload(clientId, newName);
}

// ============================================================
// PLAYER HANDLERS (требуют наличия player)
// ============================================================

function handleTurn(ctx, id, msg) {
  // Сначала пробуем комнату
  const room = roomsSetup.getRoomOf(ctx, id);
  if (room && room.started) { room.handleTurn(id, msg.direction); return; }
  // Фоллбэк — глобальная игра
  const player = ctx.players.get(id);
  if (!player) return;
  if (player.frozenUntil && Date.now() < player.frozenUntil) return;
  const next = directionFromKey(msg.direction);
  if (next && !isOpposite(player.direction, next)) player.nextDirection = next;
}

// Колесо чата (R → 1-4 в игре). Тот же паттерн, что и handleTurn выше:
// сначала пробуем активную комнату, иначе — публичное лобби. lib/phrases.js
// одинаково работает с обоими (см. комментарий там).
function handleSayPhrase(ctx, id, msg) {
  const room = roomsSetup.getRoomOf(ctx, id);
  if (room && room.started) { phrasesMod.sayPhrase(room, id, msg.slot); return; }
  phrasesMod.sayPhrase(ctx, id, msg.slot);
}

function handleRestart(ctx, id) {
  const room = roomsSetup.getRoomOf(ctx, id);
  if (room && room.started) { room.restartPlayer(id); return; }
  const player = ctx.players.get(id);
  if (!player) return;
  ctx.recordScore(player);
  profiles.startNewLife(ctx, player.name);
  const skin = profiles.getSkinDef(profiles.getProfile(ctx, player.name).activeSkin);
  ctx.players.set(id, gameLoop.createPlayer(ctx, id, player.name, skin));
  gameLoop.sendSnapshot(ctx, id);
  gameLoop.forceAoiResync(ctx, id);
  gameLoop.broadcastGameSync(ctx);
  gameLoop.broadcastPresence(ctx);
}

// ============================================================
// ТАБЛИЦЫ ДИСПЕТЧЕРА (для lib/net.js createMessageHandler)
// ============================================================

const asyncHandlers = {
  shop_connect: handleShopConnect,
  save_profile: saveProfile,
  join: handleJoin,
  room_create: handleRoomCreate,
  room_join: handleRoomJoin,
  room_rejoin: handleRoomRejoin,
  room_start: handleRoomStart,
  room_leave: handleRoomLeave,
  room_invite: handleRoomInvite,
};

const prePlayerHandlers = {
  ping: () => { },
  buy_item: (ctx, id, msg) => shopActions.buyItem(ctx, id, msg.itemId, msg.name),
  equip_item: (ctx, id, msg) => shopActions.equipItem(ctx, id, msg.itemId, msg.name),
  unequip_item: (ctx, id, msg) => shopActions.unequipItem(ctx, id, msg.itemId, msg.name),
  equip_nick_color: (ctx, id, msg) => shopActions.equipNickColor(ctx, id, msg.colorId, msg.name),
  buy_skin: (ctx, id, msg) => shopActions.buyItem(ctx, id, msg.skinId),
  equip_skin: (ctx, id, msg) => shopActions.equipItem(ctx, id, msg.skinId),
  market_list: (ctx, id, msg) => market.marketList(ctx, id, msg.kind, msg.quantity, msg.pricePerUnit, msg.name),
  market_cancel: (ctx, id, msg) => market.marketCancel(ctx, id, msg.listingId, msg.name),
  market_buy: (ctx, id, msg) => market.marketBuy(ctx, id, msg.listingId, msg.quantity, msg.name),
  set_phrase_wheel: (ctx, id, msg) => shopActions.setPhraseWheel(ctx, id, msg.slots, msg.name),
};

const playerHandlers = {
  turn: handleTurn,
  restart: handleRestart,
  say_phrase: handleSayPhrase,
};

module.exports = { asyncHandlers, prePlayerHandlers, playerHandlers, sendJoinFallback };
