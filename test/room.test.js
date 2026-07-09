"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { Room, genCode } = require("../lib/room");

// Комнаты сами по себе используют реальные setInterval/setTimeout (TTL, tick,
// bonus-spawn). В тестах мы их не запускаем (не вызываем room.start()), но
// TTL-таймер стартует уже в конструкторе — обязательно чистим его руками,
// иначе process зависает в ожидании таймера на 30 минут.
function makeRoom(opts = {}) {
  const room = new Room({ code: "TEST123", hostId: "p1", isPublic: false, ...opts });
  room.send = () => {};
  room.broadcast = () => {};
  room.getProfile = () => ({ activeSkin: "default", coins: 0 });
  room.getSkinDef = () => ({ id: "default", color: "#33d17a" });
  room.getPlayerCosmetics = () => ({});
  return room;
}

function cleanup(room) {
  room._stop();
  if (room._ttlTimeout) clearTimeout(room._ttlTimeout);
}

test("genCode: генерирует код нужной длины из допустимых символов", () => {
  const code = genCode(9);
  assert.equal(code.length, 9);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
});

test("canJoin: false для уже начатой игры или полной комнаты", () => {
  const room = makeRoom();
  assert.equal(room.canJoin(), true);
  room.started = true;
  assert.equal(room.canJoin(), false);
  cleanup(room);
});

test("handleTurn: разворот на 180° (реверс) игнорируется", () => {
  const room = makeRoom();
  room.players.set("p1", {
    id: "p1", alive: true, direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 },
    frozenUntil: 0,
  });
  room.handleTurn("p1", "left"); // left = {x:-1,y:0}, реверс относительно {x:1,y:0}
  const player = room.players.get("p1");
  assert.deepEqual(player.nextDirection, { x: 1, y: 0 }, "реверс не должен применяться");
  cleanup(room);
});

test("handleTurn: валидный поворот на 90° применяется", () => {
  const room = makeRoom();
  room.players.set("p1", {
    id: "p1", alive: true, direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 },
    frozenUntil: 0,
  });
  room.handleTurn("p1", "up");
  const player = room.players.get("p1");
  assert.deepEqual(player.nextDirection, { x: 0, y: -1 });
  cleanup(room);
});

test("handleTurn: ввод игнорируется, пока игрок заморожен после спавна", () => {
  const room = makeRoom();
  room.players.set("p1", {
    id: "p1", alive: true, direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 },
    frozenUntil: Date.now() + 5000, // заморожен ещё 5с
  });
  room.handleTurn("p1", "up");
  const player = room.players.get("p1");
  assert.deepEqual(player.nextDirection, { x: 1, y: 0 }, "поворот во время заморозки должен игнорироваться");
  cleanup(room);
});

test("handleTurn: мёртвый игрок не может поворачивать", () => {
  const room = makeRoom();
  room.players.set("p1", {
    id: "p1", alive: false, direction: { x: 1, y: 0 }, nextDirection: { x: 1, y: 0 },
    frozenUntil: 0,
  });
  room.handleTurn("p1", "up");
  const player = room.players.get("p1");
  assert.deepEqual(player.nextDirection, { x: 1, y: 0 });
  cleanup(room);
});

test("_forceAoiResync: убирает игрока из AOI-множеств всех клиентов (регрессия десинка при респавне)", () => {
  const room = makeRoom();
  room.clientAoi.set("viewerA", new Set(["p1", "p2"]));
  room.clientAoi.set("viewerB", new Set(["p1"]));
  room._forceAoiResync("p1");
  assert.equal(room.clientAoi.get("viewerA").has("p1"), false);
  assert.equal(room.clientAoi.get("viewerB").has("p1"), false);
  assert.equal(room.clientAoi.get("viewerA").has("p2"), true, "другие игроки не должны затрагиваться");
  cleanup(room);
});

test("removePlayer: при выходе хоста роль передаётся следующему игроку", () => {
  const room = makeRoom({ hostId: "p1" });
  room.started = true; // чтобы не удалило комнату целиком при опустении не-started
  room.players.set("p1", { id: "p1", alive: false, name: "host" });
  room.players.set("p2", { id: "p2", alive: false, name: "guest" });
  room.removePlayer("p1");
  assert.equal(room.hostId, "p2");
  cleanup(room);
});

test("addWaiter: добавляет игрока в лобби-состоянии без змейки", () => {
  const room = makeRoom();
  room.addWaiter("p1", "Kirill", {});
  const player = room.players.get("p1");
  assert.equal(player.inLobby, true);
  assert.equal(player.alive, false);
  assert.deepEqual(player.snake, []);
  cleanup(room);
});

test("start: нельзя начать игру не-хосту", () => {
  const room = makeRoom({ hostId: "p1" });
  room.addWaiter("p1", "Host", {});
  const result = room.start("p2");
  assert.equal(result.ok, false);
  cleanup(room);
});

test("start: нельзя начать уже начатую игру повторно", () => {
  const room = makeRoom({ hostId: "p1" });
  room.addWaiter("p1", "Host", {});
  room.start("p1");
  const second = room.start("p1");
  assert.equal(second.ok, false);
  cleanup(room);
});
