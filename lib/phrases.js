"use strict";

// Колесо чата (chat wheel): игрок жмёт R → выбирает 1-4 → фраза уходит
// остальным. Работает одинаково и с публичным лобби (ctx из server.js), и
// с приватными комнатами (Room из lib/room.js) — оба "duck type"-совместимы:
// у обоих есть .players (Map socketId -> player), .clientAoi (Map socketId ->
// Set видимых player.id, см. lib/game-sync.js), .send(id, payload) и
// .getProfile(name). Ни один явный класс/интерфейс под это не заводим —
// это тот же паттерн, что уже используют lib/message-handlers.js (handleTurn)
// и lib/rooms-setup.js (wireRoomDeps).

const profiles = require("./profiles");
const { getPhrase, DEFAULT_WHEEL } = require("../data/phrases");
const { PHRASE_COOLDOWN_MS } = require("../config/game");

// Произнести фразу из слота колеса (1-4).
function sayPhrase(target, socketId, slot) {
  const player = target.players.get(socketId);
  if (!player || !player.alive) return;

  const slotIndex = Number(slot);
  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > 4) return;

  const entry = target.getProfile(player.name);
  const wheel = Array.isArray(entry.equipped?.phrases) && entry.equipped.phrases.length === 4
    ? entry.equipped.phrases
    : DEFAULT_WHEEL;
  const phraseId = wheel[slotIndex - 1];
  if (!phraseId) return; // пустой слот

  const phrase = getPhrase(phraseId);
  if (!phrase) return;
  // Подстраховка от рассинхрона клиента: слот мог ссылаться на фразу,
  // которую игрок больше не владеет (продал/потерял доступ и т.п.) —
  // на сервере всегда перепроверяем владение перед рассылкой.
  if (!profiles.ownsItem(entry, `phrase_${phraseId}`)) return;

  const now = Date.now();
  if (player._phraseCooldownUntil && now < player._phraseCooldownUntil) {
    const waitSec = Math.ceil((player._phraseCooldownUntil - now) / 1000);
    target.send(socketId, { type: "notice", text: `Фраза перезаряжается ещё ${waitSec} сек.` });
    return;
  }
  player._phraseCooldownUntil = now + PHRASE_COOLDOWN_MS;

  broadcastPhrase(target, socketId, player, phrase);
}

// Рассылает фразу самому игроку + всем, у кого он сейчас в AOI (то есть
// виден на экране/миникарте) — то самое "слышно только в районе видимости".
function broadcastPhrase(target, socketId, player, phrase) {
  const payload = { type: "phrase", id: player.id, phraseId: phrase.id };
  target.send(socketId, payload);
  for (const [listenerId, visibleIds] of target.clientAoi) {
    if (listenerId === socketId) continue;
    if (visibleIds.has(player.id)) target.send(listenerId, payload);
  }
}

module.exports = { sayPhrase };
