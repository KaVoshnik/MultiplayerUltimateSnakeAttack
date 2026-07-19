"use strict";

const roomMod = require("./room");
const profiles = require("./profiles");
const leaderboard = require("./leaderboard");
const statsRewards = require("./stats-rewards");
const { resolveNickColorHex } = require("../data/battle-pass");

// Прокидывает в свежесозданную комнату все зависимости, которые ей нужны
// от остального сервера (сеть, профили, награды) — комната сама по себе
// не знает про глобальное состояние сервера, только про переданные функции.
// См. конструктор Room в ./room.js — там эти поля объявлены как null
// и ожидают инжекции именно отсюда.
function wireRoomDeps(ctx, room) {
  room.send = ctx.send;
  room.getProfile = (name) => profiles.getProfile(ctx, name);
  room.persistProfile = (name, entry) => profiles.persistProfile(ctx, name, entry);
  room.getSkinDef = profiles.getSkinDef;
  room.startNewLife = (name) => profiles.startNewLife(ctx, name);
  room.resolveNickColorHex = resolveNickColorHex;
  room.getPlayerCosmetics = (name) => profiles.getPlayerCosmetics(ctx, name);
  room.recordScore = (player) => leaderboard.recordScore(ctx, player);
  room.awardSessionCoins = statsRewards.awardSessionCoins;
  room.awardKillCoins = (killer, victim) => statsRewards.awardKillCoins(ctx, killer, victim);
  room.trackDeathStats = (player) => statsRewards.trackDeathStats(ctx, player);
  room.trackDisconnectStats = (player) => statsRewards.trackDisconnectStats(ctx, player);
  room.savePlayerCoins = (player) => profiles.savePlayerCoins(ctx, player);
  room.getOnlineCount = () => ctx.sockets.size;
  room.bestForName = (name) => leaderboard.bestForName(ctx, name);
}

function createRoom(ctx, hostId, isPublic) {
  let code;
  do { code = roomMod.genCode(); } while (ctx.rooms.has(code));
  const room = new roomMod.Room({
    code, hostId, isPublic,
    onEmpty: (c) => { ctx.rooms.delete(c); },
  });
  wireRoomDeps(ctx, room);
  ctx.rooms.set(code, room);
  return room;
}

function getRoomOf(ctx, socketId) {
  const code = ctx.socketRoom.get(socketId);
  return code ? ctx.rooms.get(code) : null;
}

function leaveRoom(ctx, socketId) {
  const room = getRoomOf(ctx, socketId);
  if (!room) return;
  ctx.socketRoom.delete(socketId);
  room.removePlayer(socketId);
}

function joinRoom(ctx, socketId, code, name) {
  leaveRoom(ctx, socketId);
  const room = ctx.rooms.get(code);
  if (!room) return { ok: false, text: "Комната не найдена." };
  if (!room.canJoin()) return { ok: false, text: "Комната заполнена или игра уже началась." };
  const cos = profiles.getPlayerCosmetics(ctx, name);
  room.addWaiter(socketId, name, cos);
  ctx.socketRoom.set(socketId, code);
  return { ok: true, room };
}

module.exports = { createRoom, getRoomOf, leaveRoom, joinRoom };
