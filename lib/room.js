"use strict";

const bossMod  = require("./bosses");
const foodMod  = require("./food");
const gameSync = require("./game-sync");

const TICK_MS        = 115;
const GRID           = { width: 210, height: 140 };
const SPAWN_FREEZE_MS = 3000;
const MAX_PLAYERS    = 16;
const ROOM_TTL_MS    = 30 * 60 * 1000; // 30 мин без активности → удаление

const BONUS_TYPES = {
  shield:    { label: "SH", duration: 10000, color: "#62a0ea" },
  speed_up:  { label: "SP", duration:  8000, color: "#f9f06b" },
  slow_down: { label: "SL", duration: 10000, color: "#dc8add" },
  double:    { label: "x2", duration: 12000, color: "#33d17a" },
  ghost:     { label: "GH", duration:  8000, color: "#8ff0a4" },
};

const FOOD_TYPES = foodMod.FOOD_TYPES;

function genCode(len = 9) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

class Room {
  constructor({ code, hostId, isPublic = false, onEmpty }) {
    this.code      = code;
    this.hostId    = hostId;
    this.isPublic  = isPublic;
    this.onEmpty   = onEmpty; // callback when room should be destroyed
    this.started   = false;
    this.createdAt = Date.now();
    this.lastActive = Date.now();

    // Game state
    this.players    = new Map();   // socketId -> player
    this.food       = [];
    this.bonuses    = [];
    this.bosses     = bossMod.createBosses(GRID);
    this.tickCount  = 0;
    this.tickJournal = gameSync.createJournal();
    this.clientAoi  = new Map();
    this.feedLog    = [];
    this.feedDedupe = new Map();

    // Occupancy
    this.occupancySet = new Set();

    this._tickInterval    = null;
    this._bonusInterval   = null;
    this._presenceInterval = null;
    this._ttlTimeout      = null;

    // send function injected after construction
    this.send      = null;
    this.broadcast = null;
    this.getProfile       = null;
    this.extrasFor        = null;
    this.persistProfile   = null;
    this.recordScore      = null;
    this.awardSessionCoins = null;
    this.awardKillCoins    = null;
    this.trackDeathStats   = null;
    this.trackDisconnectStats = null;
    this.savePlayerCoins   = null;
    this.getSkinDef        = null;
    this.startNewLife      = null;
    this.resolveNickColorHex = null;
    this.getPlayerCosmetics  = null;

    this._scheduleTTL();
  }

  // ---- TTL ----

  _scheduleTTL() {
    if (this._ttlTimeout) clearTimeout(this._ttlTimeout);
    this._ttlTimeout = setTimeout(() => {
      if (this.players.size === 0) this._destroy();
    }, ROOM_TTL_MS);
  }

  _resetTTL() {
    this.lastActive = Date.now();
    this._scheduleTTL();
  }

  _destroy() {
    this._stop();
    if (this._ttlTimeout) clearTimeout(this._ttlTimeout);
    if (this.onEmpty) this.onEmpty(this.code);
  }

  // ---- Lobby ----

  lobbySnapshot() {
    const members = [];
    for (const [id, p] of this.players) {
      members.push({ id, name: p.name, avatar: p.avatar, isHost: id === this.hostId, ready: true });
    }
    return {
      type: "room_state",
      code: this.code,
      isPublic: this.isPublic,
      started: this.started,
      hostId: this.hostId,
      members,
      maxPlayers: MAX_PLAYERS,
    };
  }

  broadcastLobby() {
    const snap = this.lobbySnapshot();
    for (const id of this.players.keys()) this.send(id, snap);
  }

  // ---- Join / Leave ----

  canJoin() {
    return !this.started && this.players.size < MAX_PLAYERS;
  }

  addWaiter(socketId, name, cosmetics) {
    // Добавляем как "ожидающего" — без snake, просто в лобби
    this.players.set(socketId, {
      id: socketId, name,
      avatar: cosmetics.avatar,
      snakeHatEmoji: cosmetics.snakeHatEmoji,
      snakeHatId: cosmetics.snakeHatId,
      alive: false, snake: [], score: 0,
      inLobby: true,
    });
    this._resetTTL();
    this.broadcastLobby();
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

    if (player.alive) {
      if (this.trackDisconnectStats) this.trackDisconnectStats(player);
      if (this.recordScore) this.recordScore(player);
    }

    this.players.delete(socketId);
    this.clientAoi.delete(socketId);
    this._resetTTL();

    if (this.players.size === 0) {
      this._destroy();
      return;
    }

    // Передать хоста следующему если хост вышел
    if (socketId === this.hostId) {
      this.hostId = this.players.keys().next().value;
      this.send(this.hostId, { type: "notice", text: "Ты теперь хост комнаты!" });
    }

    if (this.started) {
      this._broadcastGameSync();
      this._broadcastPresence();
    } else {
      this.broadcastLobby();
    }
  }

  // ---- Start ----

  start(hostSocketId) {
    if (hostSocketId !== this.hostId) return { ok: false, text: "Только хост может начать игру." };
    if (this.players.size < 1) return { ok: false, text: "Нужен хотя бы один игрок." };
    if (this.started) return { ok: false, text: "Игра уже идёт." };

    this.started = true;

    // Инициализируем змеек для всех ожидающих
    for (const [id, p] of this.players) {
      if (p.inLobby) {
        const prof = this.getProfile(p.name);
        const skin = this.getSkinDef(prof.activeSkin);
        const cos  = this.getPlayerCosmetics(p.name);
        if (this.startNewLife) this.startNewLife(p.name);
        this.players.set(id, this._createPlayer(id, p.name, skin, cos));
      }
    }

    // Заполняем еду
    this._fillFood();

    // Стартуем тик
    this._tickInterval = setInterval(() => this._tick(), TICK_MS);
    this._bonusInterval = setInterval(() => this._spawnBonus(), 8000);
    this._presenceInterval = setInterval(() => this._broadcastPresence(), 5000);

    // Шлём снэпшот каждому
    for (const id of this.players.keys()) this._sendSnapshot(id);

    return { ok: true };
  }

  // ---- Restart (individual) ----

  restartPlayer(socketId) {
    const old = this.players.get(socketId);
    if (!old) return;
    if (this.recordScore) this.recordScore(old);
    if (this.startNewLife) this.startNewLife(old.name);
    const prof = this.getProfile(old.name);
    const skin = this.getSkinDef(prof.activeSkin);
    const cos  = this.getPlayerCosmetics(old.name);
    this.players.set(socketId, this._createPlayer(socketId, old.name, skin, cos));
    this._sendSnapshot(socketId);
    this._broadcastGameSync();
    this._broadcastPresence();
  }

  // ---- Player creation ----

  _createPlayer(id, name, skin, cos) {
    const layout = foodMod.findSpawnLayout({
      players: this.players, food: this.food, bonuses: this.bonuses, GRID,
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(this.bosses, pt),
      distanceToNearestBoss: (pt) => bossMod.distanceToNearestBoss(this.bosses, pt),
      BOSS_SPAWN_BUFFER: bossMod.BOSS_SPAWN_BUFFER,
    });
    const direction = layout?.direction || { x: 1, y: 0 };
    const snake     = layout?.snake    || [{ x: Math.floor(GRID.width / 2), y: Math.floor(GRID.height / 2) }];
    foodMod.clearBoardAroundSpawn(snake[0], { food: this.food, bonuses: this.bonuses });

    const prof     = this.getProfile(name);
    const nickColor = this.resolveNickColorHex ? this.resolveNickColorHex(prof) : null;
    const COLORS   = ["#33d17a", "#62a0ea", "#ffbe6f", "#dc8add", "#f66151", "#8ff0a4", "#99c1f1", "#f9f06b"];

    const player = {
      id, name, inLobby: false,
      color:     skin.color !== "rainbow" ? skin.color : COLORS[(Number(id) - 1) % COLORS.length],
      headColor: skin.headColor || "#ffffff",
      skin:      skin.id,
      rainbow:   skin.color === "rainbow",
      snake, direction, nextDirection: direction,
      alive: true, score: 0, coins: prof.coins || 0,
      best: 0, deaths: 0, reason: "",
      coinsEarned: 0, beatPersonalBest: false, sessionMvp: false,
      activeBonus: null, bonusExpires: null,
      combo: 0, maxCombo: 0,
      avatar: cos.avatar,
      snakeHatEmoji: cos.snakeHatEmoji,
      snakeHatId: cos.snakeHatId,
      nickColor,
      frozenUntil: Date.now() + SPAWN_FREEZE_MS,
    };

    foodMod.removeEntitiesUnderSnake(player, { food: this.food, bonuses: this.bonuses });
    return player;
  }

  // ---- Sync helpers ----

  _syncCtx() {
    const self = this;
    return {
      grid: GRID, players: this.players, food: this.food, bonuses: this.bonuses,
      bosses: this.bosses, bonusTypes: BONUS_TYPES,
      tickCount: this.tickCount, tickMs: TICK_MS,
      gameMode: "classic", taggedPlayerId: null,
      clientAoi: this.clientAoi,
      extrasFor: (p) => self._extrasFor(p),
    };
  }

  _extrasFor(p) {
    const cos = this.getPlayerCosmetics ? this.getPlayerCosmetics(p.name) : {};
    return {
      best: p.best || 0,
      spawnFrozenLeft: p.frozenUntil || 0,
      heat: Math.min(100, Math.round((p.score || 0) * 0.4 + (p.combo || 0) * 9)),
      isTagged: false,
      avatar: cos.avatar || p.avatar,
      snakeHatEmoji: cos.snakeHatEmoji || p.snakeHatEmoji,
      snakeHatId: cos.snakeHatId || p.snakeHatId,
      nickColor: p.nickColor || null,
    };
  }

  _sendSnapshot(clientId) {
    const snap = gameSync.buildSnapshot(this._syncCtx(), clientId);
    if (snap) this.send(clientId, snap);
  }

  _broadcastGameSync() {
    const ctx = this._syncCtx();
    for (const clientId of this.players.keys()) {
      const delta = gameSync.buildDelta(ctx, clientId, this.tickJournal);
      if (delta) this.send(clientId, delta);
    }
  }

  _broadcastPresence() {
    const snap = gameSync.buildPresence(this._syncCtx());
    for (const id of this.players.keys()) this.send(id, snap);
  }

  // ---- Input ----

  handleTurn(socketId, direction) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;
    if (player.frozenUntil && Date.now() < player.frozenUntil) return;
    const dirs = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const next = dirs[direction];
    if (!next) return;
    const cur = player.direction;
    if (cur.x + next.x === 0 && cur.y + next.y === 0) return; // reverse
    player.nextDirection = next;
  }

  // ---- Food ----

  _fillFood() {
    const journal = gameSync.createJournal();
    foodMod.fillFood({
      food: this.food, players: this.players,
      occupancySet: this.occupancySet, tickJournal: journal, GRID,
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(this.bosses, pt),
    });
  }

  _rebuildOccupancy() {
    this.occupancySet.clear();
    for (const item of this.food) this.occupancySet.add(`${item.x}:${item.y}`);
    for (const b of this.bonuses)  this.occupancySet.add(`${b.x}:${b.y}`);
    for (const player of this.players.values()) {
      for (const part of player.snake) this.occupancySet.add(`${part.x}:${part.y}`);
    }
  }

  // ---- Bonus spawn ----

  _spawnBonus() {
    if (this.players.size === 0 || this.bonuses.length >= 3) return;
    const point = foodMod.randomEmptyPoint(this.food, {
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(this.bosses, pt),
      occupancySet: this.occupancySet, GRID,
      avoidNearHeads: true, players: this.players,
    });
    if (!point) return;
    const types     = Object.keys(BONUS_TYPES);
    const bonusType = types[Math.floor(Math.random() * types.length)];
    this.bonuses.push({ ...point, bonusType, spawnedAt: Date.now() });

    const j = gameSync.createJournal();
    j.bonusAdded.push(gameSync.compactBonus({ x: point.x, y: point.y, bonusType }, BONUS_TYPES));
    const ctx = this._syncCtx();
    for (const id of this.players.keys()) {
      const delta = gameSync.buildDelta(ctx, id, j);
      if (delta) this.send(id, delta);
    }

    setTimeout(() => {
      const idx = this.bonuses.findIndex((b) => b.x === point.x && b.y === point.y);
      if (idx >= 0) {
        const b = this.bonuses[idx];
        this.bonuses.splice(idx, 1);
        const ej = gameSync.createJournal();
        ej.bonusRemoved.push([b.x, b.y]);
        const ectx = this._syncCtx();
        for (const id of this.players.keys()) {
          const delta = gameSync.buildDelta(ectx, id, ej);
          if (delta) this.send(id, delta);
        }
      }
    }, 15000);
  }

  // ---- Kill ----

  _killPlayer(player, reason, opts = {}) {
    if (!player.alive) return;
    this.tickJournal.deaths.push(player.id);
    if (this.trackDeathStats) this.trackDeathStats(player);
    player.alive       = false;
    player.deaths     += 1;
    player.reason      = opts.killerPlayer ? `${opts.killerPlayer.name} убил тебя` : reason;
    player.activeBonus = null;
    player.bonusExpires = null;
    player.combo       = 0;

    const reward = this.awardSessionCoins ? this.awardSessionCoins(player) : 0;
    player.coinsEarned = reward;
    if (reward > 0) {
      player.coins = (player.coins || 0) + reward;
      if (this.savePlayerCoins) this.savePlayerCoins(player);
    }
    if (this.recordScore) this.recordScore(player);

    if (opts.killerPlayer?.alive && this.awardKillCoins) {
      this.awardKillCoins(opts.killerPlayer, player);
    }

    // Push feed к игрокам комнаты
    const feedMsg = opts.killerPlayer
      ? { kind: "kill", text: `⚔ ${opts.killerPlayer.name} убил ${player.name}` }
      : { kind: "death", text: `💀 ${player.name}: ${reason}` };
    for (const id of this.players.keys()) {
      this.send(id, { type: "feed", feed: [{ ...feedMsg, at: Date.now() }] });
    }

    if (opts.boss) bossMod.enrageBoss(opts.boss, this.bosses,
      (kind, text) => {
        for (const id of this.players.keys()) this.send(id, { type: "feed", feed: [{ kind, text, at: Date.now() }] });
      },
      (msg) => { for (const id of this.players.keys()) this.send(id, msg); }
    );
  }

  // ---- Tick ----

  _tick() {
    if (this.players.size === 0) return;
    this.tickJournal = gameSync.createJournal();
    this.tickCount  += 1;

    const pathCells = foodMod.getMovementPathCells(this.players, { GRID, tickCount: this.tickCount });

    foodMod.fillFood({
      food: this.food, players: this.players,
      occupancySet: this.occupancySet, tickJournal: this.tickJournal, GRID,
      avoidCells: pathCells,
      anyBossOccupies: (pt) => bossMod.anyBossOccupies(this.bosses, pt),
    });

    const bossEvery = this.bosses.some((b) => b.enragedTicks > 0) ? 3 : bossMod.BOSS_MOVE_EVERY;
    if (this.tickCount % bossEvery === 0) {
      bossMod.moveBosses({
        bosses: this.bosses, players: this.players, food: this.food,
        tickCount: this.tickCount, GRID, avoidCells: pathCells,
        pushFeed: (kind, text) => {
          for (const id of this.players.keys()) this.send(id, { type: "feed", feed: [{ kind, text, at: Date.now() }] });
        },
        broadcast: (msg) => { for (const id of this.players.keys()) this.send(id, msg); },
        killPlayer: (p, reason, opts) => this._killPlayer(p, reason, opts),
        pushFoodItem: (item) => { this.food.push(item); this.tickJournal.foodAdded.push(gameSync.compactFood(item)); },
        createBadFood: foodMod.createBadFood,
        insideGrid: (pt) => foodMod.insideGrid(pt, GRID),
        pointKey: foodMod.pointKey,
      });
      this.tickJournal.bossesChanged = true;
    }

    this._tickBonusEffects();
    this._rebuildOccupancy();

    const occupied    = new Map();
    const planned     = new Map();
    const targetCounts = new Map();

    for (const player of this.players.values()) {
      if (!player.alive || player.inLobby) continue;
      for (const part of player.snake) occupied.set(foodMod.pointKey(part), player.id);
    }

    for (const player of this.players.values()) {
      if (!player.alive || player.inLobby) continue;
      if (player.frozenUntil && Date.now() < player.frozenUntil) continue;
      player.direction = player.nextDirection;
      const head     = player.snake[0];
      const nextHead = { x: head.x + player.direction.x, y: head.y + player.direction.y };
      planned.set(player.id, nextHead);
      const key = foodMod.pointKey(nextHead);
      targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
    }

    for (const player of this.players.values()) {
      if (!player.alive || player.inLobby || !planned.has(player.id)) continue;
      const nextHead = planned.get(player.id);
      const key      = foodMod.pointKey(nextHead);

      if (!foodMod.insideGrid(nextHead, GRID)) {
        // wall death (normal difficulty logic — стены убивают)
        this._killPlayer(player, "Врезался в стену"); continue;
      }

      const resolvedKey = foodMod.pointKey(nextHead);
      if (targetCounts.get(key) > 1) { this._killPlayer(player, "Столкновение лоб в лоб"); continue; }

      const killerBoss = bossMod.bossAt(this.bosses, nextHead);
      if (killerBoss) { this._killPlayer(player, `${killerBoss.name} поймал змейку`, { at: nextHead, boss: killerBoss }); continue; }

      // Баффы до occupied
      const eatenBonusIdx = this.bonuses.findIndex((b) => b.x === nextHead.x && b.y === nextHead.y);
      if (eatenBonusIdx >= 0) {
        const bonus = this.bonuses[eatenBonusIdx];
        this.tickJournal.bonusRemoved.push([bonus.x, bonus.y]);
        this.bonuses.splice(eatenBonusIdx, 1);
        this._activateBonus(player, bonus.bonusType);
      }

      if (player.activeBonus !== "ghost" && occupied.has(resolvedKey)) {
        const killerId = occupied.get(resolvedKey);
        const killer   = killerId && killerId !== player.id ? this.players.get(killerId) : null;
        this._killPlayer(player, killer ? `${killer.name} убил` : "Столкнулся со змейкой", { at: nextHead, killerPlayer: killer });
        continue;
      }

      const eatenIdx = this.food.findIndex((item) => item.x === nextHead.x && item.y === nextHead.y);
      const eaten    = eatenIdx >= 0 ? this.food[eatenIdx] : null;
      player._grewTick = Boolean(eaten);
      player.snake.unshift(nextHead);

      if (eaten) {
        this.tickJournal.foodRemoved.push([eaten.x, eaten.y]);
        this.food.splice(eatenIdx, 1);
        if (eaten.good) {
          player.combo    = (player.combo || 0) + 1;
          player.maxCombo = Math.max(player.maxCombo || 0, player.combo);
          let mult = this._comboMult(player.combo);
          if (player.activeBonus === "double")   mult *= 2;
          if (player.activeBonus === "speed_up") mult *= 1.3;
          player.score += Math.round(eaten.points * mult);
          player.best   = Math.max(player.best, player.score);
        } else if (player.activeBonus === "shield") {
          player.activeBonus = null;
        } else {
          this._killPlayer(player, `Съел яд`);
        }
      } else {
        player.snake.pop();
      }

      this.tickJournal.moves.push(gameSync.packPlayerMove(player));
      this.tickJournal.meta.push(gameSync.packPlayerMeta(player, this._extrasFor(player)));
    }

    this._broadcastGameSync();
  }

  _comboMult(combo) {
    if (combo >= 10) return 2;
    if (combo >= 6)  return 1.5;
    if (combo >= 3)  return 1.25;
    return 1;
  }

  _activateBonus(player, bonusType) {
    const def = BONUS_TYPES[bonusType];
    if (!def) return;
    player.activeBonus  = bonusType;
    player.bonusExpires = Date.now() + def.duration;
    for (const id of this.players.keys()) {
      this.send(id, { type: "notice", text: `${player.name} получил бонус ${def.label}!` });
    }
  }

  _tickBonusEffects() {
    const now = Date.now();
    for (const player of this.players.values()) {
      if (player.activeBonus && player.bonusExpires && now > player.bonusExpires) {
        player.activeBonus  = null;
        player.bonusExpires = null;
      }
    }
  }

  _stop() {
    if (this._tickInterval)    { clearInterval(this._tickInterval);    this._tickInterval    = null; }
    if (this._bonusInterval)   { clearInterval(this._bonusInterval);   this._bonusInterval   = null; }
    if (this._presenceInterval){ clearInterval(this._presenceInterval);this._presenceInterval = null; }
  }
}

module.exports = { Room, genCode, MAX_PLAYERS, TICK_MS, GRID, BONUS_TYPES };
