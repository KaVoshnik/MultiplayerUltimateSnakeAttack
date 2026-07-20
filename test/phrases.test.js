"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const profiles = require("../lib/profiles");
const { sayPhrase } = require("../lib/phrases");
const { PHRASE_COOLDOWN_MS } = require("../config/game");

// Минимальный "duck type"-таргет, совместимый и с ctx (лобби), и с Room —
// см. комментарий в lib/phrases.js.
function makeTarget() {
  const target = {
    shopData: {},
    profileIndex: new Map(),
    players: new Map(),
    clientAoi: new Map(),
    sent: [],
    getProfile(name) { return profiles.getProfile(target, name); },
    send(id, payload) { target.sent.push([id, payload]); },
  };
  return target;
}

function addPlayer(target, id, name) {
  target.players.set(id, { id, name, alive: true });
}

test("sayPhrase: слово уходит говорящему и тем, у кого он есть в AOI", () => {
  const target = makeTarget();
  addPlayer(target, "A", "Alice");
  addPlayer(target, "B", "Bob");
  addPlayer(target, "C", "Carol");
  target.clientAoi.set("A", new Set(["A", "B"]));
  target.clientAoi.set("B", new Set(["A", "B"]));
  target.clientAoi.set("C", new Set(["C"])); // Carol не видит Alice

  sayPhrase(target, "A", 1); // slot 1 по умолчанию = "ops"

  const recipients = target.sent.map(([id]) => id).sort();
  assert.deepEqual(recipients, ["A", "B"]);
  for (const [, payload] of target.sent) {
    assert.equal(payload.type, "phrase");
    assert.equal(payload.id, "A");
    assert.equal(payload.phraseId, "ops");
  }
});

test("sayPhrase: пустой слот колеса ничего не отправляет", () => {
  const target = makeTarget();
  addPlayer(target, "A", "Alice");
  target.clientAoi.set("A", new Set(["A"]));
  const entry = profiles.getProfile(target, "Alice");
  entry.equipped.phrases = ["ops", null, null, null];
  target.shopData.Alice = entry;

  sayPhrase(target, "A", 2);
  assert.deepEqual(target.sent, []);
});

test("sayPhrase: кулдаун общий на игрока, а не на слот, и отдаёт notice только говорящему", () => {
  const target = makeTarget();
  addPlayer(target, "A", "Alice");
  addPlayer(target, "B", "Bob");
  target.clientAoi.set("A", new Set(["A", "B"]));
  target.clientAoi.set("B", new Set(["A", "B"]));

  sayPhrase(target, "A", 1);
  target.sent.length = 0;

  sayPhrase(target, "A", 4); // другой слот, тот же игрок — всё равно на кулдауне
  assert.equal(target.sent.length, 1);
  const [[recipient, payload]] = target.sent;
  assert.equal(recipient, "A");
  assert.equal(payload.type, "notice");
});

test("sayPhrase: кулдаун снимается через PHRASE_COOLDOWN_MS", () => {
  const target = makeTarget();
  addPlayer(target, "A", "Alice");
  target.clientAoi.set("A", new Set(["A"]));

  sayPhrase(target, "A", 1);
  const player = target.players.get("A");
  player._phraseCooldownUntil -= PHRASE_COOLDOWN_MS; // имитируем, что время прошло
  target.sent.length = 0;

  sayPhrase(target, "A", 1);
  assert.equal(target.sent.length, 1);
  assert.equal(target.sent[0][1].type, "phrase");
});

test("sayPhrase: неоплаченная фраза в слоте не рассылается, даже если клиент её туда прописал", () => {
  const target = makeTarget();
  addPlayer(target, "A", "Alice");
  target.clientAoi.set("A", new Set(["A"]));
  const entry = profiles.getProfile(target, "Alice");
  entry.equipped.phrases = ["ctrl_z", null, null, null]; // платная фраза, не куплена
  target.shopData.Alice = entry;

  sayPhrase(target, "A", 1);
  assert.deepEqual(target.sent, []);
});

test("sayPhrase: мёртвый игрок не может говорить", () => {
  const target = makeTarget();
  target.players.set("A", { id: "A", name: "Alice", alive: false });
  target.clientAoi.set("A", new Set(["A"]));

  sayPhrase(target, "A", 1);
  assert.deepEqual(target.sent, []);
});
