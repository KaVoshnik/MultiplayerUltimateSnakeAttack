/**
 * Level-2 net sync: AOI filtering + tick deltas (compact arrays).
 */

const AOI_RADIUS = 58;
const FOOD_AOI_SYNC_TICKS = 80;

function dist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function inAoi(x, y, cx, cy, radius = AOI_RADIUS) {
  return dist(x, y, cx, cy) <= radius;
}

function createJournal() {
  return {
    moves: [],
    foodRemoved: [],
    foodAdded: [],
    bonusRemoved: [],
    bonusAdded: [],
    deaths: [],
    joins: [],
    meta: [],
    bossesChanged: false,
  };
}

function foodKey(x, y) {
  return `${x},${y}`;
}

function compactFood(item) {
  return [item.x, item.y, item.kind || (item.good ? "apple" : "rotten")];
}

function compactBonus(item, bonusTypes) {
  const def = bonusTypes[item.bonusType];
  return [item.x, item.y, item.bonusType, def?.color || "#fff", def?.label || "?"];
}

function getAoiCenter(player, grid) {
  const head = player?.snake?.[0];
  if (head) return head;
  return { x: Math.floor(grid.width / 2), y: Math.floor(grid.height / 2) };
}

function packPlayerFull(player, extras) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    headColor: player.headColor,
    snake: player.snake,
    alive: player.alive,
    score: player.score,
    coins: player.coins || 0,
    best: extras.best,
    reason: player.reason,
    activeBonus: player.activeBonus,
    bonusExpires: player.bonusExpires,
    difficulty: player.difficulty,
    skin: player.skin,
    rainbow: player.rainbow,
    combo: player.combo || 0,
    maxCombo: player.maxCombo || 0,
    coinsEarned: player.coinsEarned || 0,
    spawnFrozenLeft: extras.spawnFrozenLeft,
    heat: extras.heat,
    isTagged: extras.isTagged,
    avatar: extras.avatar,
    snakeHatEmoji: extras.snakeHatEmoji,
    snakeHatId: extras.snakeHatId,
  };
}

function packPlayerMove(player) {
  const head = player.snake[0];
  return [
    player.id,
    head.x,
    head.y,
    player.direction.x,
    player.direction.y,
    player.snake.length,
    player._grewTick ? 1 : 0,
  ];
}

function packPlayerMeta(player, extras) {
  return [
    player.id,
    player.score,
    player.combo || 0,
    player.alive ? 1 : 0,
    player.activeBonus || "",
    player.bonusExpires || 0,
    extras.spawnFrozenLeft,
    extras.heat,
    player.coins || 0,
    player.coinsEarned || 0,
    player.reason || "",
  ];
}

function filterFoodAoi(allFood, cx, cy) {
  const out = [];
  for (const item of allFood) {
    if (inAoi(item.x, item.y, cx, cy)) out.push(compactFood(item));
  }
  return out;
}

function filterBonusesAoi(allBonuses, cx, cy, bonusTypes) {
  const out = [];
  for (const item of allBonuses) {
    if (inAoi(item.x, item.y, cx, cy)) out.push(compactBonus(item, bonusTypes));
  }
  return out;
}

function filterPlayersAoi(allPlayers, cx, cy, selfId) {
  const ids = new Set();
  for (const p of allPlayers) {
    if (p.id === selfId) {
      ids.add(p.id);
      continue;
    }
    const head = p.snake?.[0];
    if (head && inAoi(head.x, head.y, cx, cy)) ids.add(p.id);
  }
  return ids;
}

function buildSnapshot(ctx, clientId) {
  const player = ctx.players.get(clientId);
  if (!player) return null;
  const center = getAoiCenter(player, ctx.grid);
  const aoiIds = filterPlayersAoi(ctx.players.values(), center.x, center.y, clientId);
  ctx.clientAoi.set(clientId, aoiIds);

  const playersOut = [];
  for (const p of ctx.players.values()) {
    if (!aoiIds.has(p.id)) continue;
    playersOut.push(packPlayerFull(p, ctx.extrasFor(p)));
  }

  return {
    type: "snapshot",
    seq: ctx.tickCount,
    tickMs: ctx.tickMs,
    grid: ctx.grid,
    gameMode: ctx.gameMode,
    taggedPlayerId: ctx.taggedPlayerId,
    food: filterFoodAoi(ctx.food, center.x, center.y),
    bonuses: filterBonusesAoi(ctx.bonuses, center.x, center.y, ctx.bonusTypes),
    bosses: ctx.bosses,
    players: playersOut,
  };
}

function buildDelta(ctx, clientId, journal) {
  const player = ctx.players.get(clientId);
  if (!player) return null;

  const center = getAoiCenter(player, ctx.grid);
  const prevAoi = ctx.clientAoi.get(clientId) || new Set();
  const nextAoi = filterPlayersAoi(ctx.players.values(), center.x, center.y, clientId);
  ctx.clientAoi.set(clientId, nextAoi);

  const delta = {
    type: "delta",
    seq: ctx.tickCount,
    tickMs: ctx.tickMs,
    gameMode: ctx.gameMode,
    taggedPlayerId: ctx.taggedPlayerId,
  };

  const moves = [];
  for (const mv of journal.moves) {
    const id = mv[0];
    if (id === clientId || nextAoi.has(id)) moves.push(mv);
  }
  if (moves.length) delta.mv = moves;

  const joins = [];
  for (const p of ctx.players.values()) {
    if (!nextAoi.has(p.id)) continue;
    if (!prevAoi.has(p.id) && p.id !== clientId) {
      joins.push(packPlayerFull(p, ctx.extrasFor(p)));
    }
  }
  if (joins.length) delta.pj = joins;

  const left = [];
  for (const id of prevAoi) {
    if (!nextAoi.has(id) && id !== clientId) left.push(id);
  }
  if (left.length) delta.ple = left;

  const meta = [];
  for (const m of journal.meta) {
    const id = m[0];
    if (id === clientId || nextAoi.has(id)) meta.push(m);
  }
  for (const id of journal.deaths) {
    if (id === clientId || nextAoi.has(id)) {
      const p = ctx.players.get(id);
      if (p) meta.push(packPlayerMeta(p, ctx.extrasFor(p)));
    }
  }
  if (meta.length) delta.pm = meta;

  const foodRemoved = journal.foodRemoved.filter(([x, y]) => inAoi(x, y, center.x, center.y));
  const foodAdded = journal.foodAdded.filter(([x, y]) => inAoi(x, y, center.x, center.y));
  if (foodRemoved.length) delta.frm = foodRemoved;
  if (foodAdded.length) delta.fad = foodAdded;

  const bonusRemoved = journal.bonusRemoved.filter(([x, y]) => inAoi(x, y, center.x, center.y));
  const bonusAdded = journal.bonusAdded.filter(([x, y]) => inAoi(x, y, center.x, center.y));
  if (bonusRemoved.length) delta.brm = bonusRemoved;
  if (bonusAdded.length) delta.bad = bonusAdded;

  if (journal.bossesChanged) delta.bosses = ctx.bosses;

  if (ctx.tickCount % FOOD_AOI_SYNC_TICKS === 0) {
    delta.fsync = filterFoodAoi(ctx.food, center.x, center.y);
  }

  if (Object.keys(delta).length <= 5) return null;
  return delta;
}

function buildPresence(ctx) {
  let alive = 0;
  for (const p of ctx.players.values()) if (p.alive) alive += 1;
  return {
    type: "presence",
    players: ctx.players.size,
    alive,
  };
}

module.exports = {
  AOI_RADIUS,
  FOOD_AOI_SYNC_TICKS,
  createJournal,
  foodKey,
  compactFood,
  compactBonus,
  inAoi,
  buildSnapshot,
  buildDelta,
  buildPresence,
  packPlayerMove,
  packPlayerMeta,
  filterFoodAoi,
};
