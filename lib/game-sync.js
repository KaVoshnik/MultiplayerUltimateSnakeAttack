/**
 * Net sync: AOI filtering + tick deltas (compact arrays).
 */

const PLAYER_AOI_RADIUS = 68;
const FOOD_AOI_RADIUS = 88;
const LOOKAHEAD_CELLS = 36;
const LOOKAHEAD_WIDTH = 10;
const FOOD_AOI_SYNC_TICKS = 24;

function dist(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function inRadius(x, y, cx, cy, radius) {
  return dist(x, y, cx, cy) <= radius;
}

function getFacingDir(player) {
  const dir = player?.nextDirection || player?.direction;
  if (!dir || (dir.x === 0 && dir.y === 0)) return null;
  return dir;
}

function inFoodAoi(x, y, cx, cy, player) {
  if (inRadius(x, y, cx, cy, FOOD_AOI_RADIUS)) return true;
  const dir = getFacingDir(player);
  if (!dir) return false;
  const dx = x - cx;
  const dy = y - cy;
  const along = dx * dir.x + dy * dir.y;
  if (along <= 0 || along > LOOKAHEAD_CELLS) return false;
  const perp = Math.abs(dx * dir.y - dy * dir.x);
  return perp <= LOOKAHEAD_WIDTH;
}

function inAoi(x, y, cx, cy, radius = PLAYER_AOI_RADIUS) {
  return inRadius(x, y, cx, cy, radius);
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
    nickColor: extras.nickColor || null,
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

function filterFoodAoi(allFood, cx, cy, player) {
  const out = [];
  for (const item of allFood) {
    if (inFoodAoi(item.x, item.y, cx, cy, player)) out.push(compactFood(item));
  }
  return out;
}

function filterBonusesAoi(allBonuses, cx, cy, bonusTypes, player) {
  const out = [];
  for (const item of allBonuses) {
    if (inFoodAoi(item.x, item.y, cx, cy, player)) out.push(compactBonus(item, bonusTypes));
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
    for (const seg of p.snake || []) {
      if (inAoi(seg.x, seg.y, cx, cy)) {
        ids.add(p.id);
        break;
      }
    }
  }
  return ids;
}

function bossNearPlayer(bosses, player, grid) {
  const center = getAoiCenter(player, grid);
  for (const boss of bosses) {
    const bs = boss.size || 1;
    for (let dy = 0; dy < bs; dy += 1) {
      for (let dx = 0; dx < bs; dx += 1) {
        if (inFoodAoi(boss.x + dx, boss.y + dy, center.x, center.y, player)) return true;
      }
    }
  }
  return false;
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
    food: filterFoodAoi(ctx.food, center.x, center.y, player),
    bonuses: filterBonusesAoi(ctx.bonuses, center.x, center.y, ctx.bonusTypes, player),
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

  const foodRemoved = journal.foodRemoved.filter(([x, y]) => inFoodAoi(x, y, center.x, center.y, player));
  const foodAdded = journal.foodAdded.filter(([x, y]) => inFoodAoi(x, y, center.x, center.y, player));
  if (foodRemoved.length) delta.frm = foodRemoved;
  if (foodAdded.length) delta.fad = foodAdded;

  const bonusRemoved = journal.bonusRemoved.filter(([x, y]) => inFoodAoi(x, y, center.x, center.y, player));
  const bonusAdded = journal.bonusAdded.filter(([x, y]) => inFoodAoi(x, y, center.x, center.y, player));
  if (bonusRemoved.length) delta.brm = bonusRemoved;
  if (bonusAdded.length) delta.bad = bonusAdded;

  if (journal.bossesChanged || bossNearPlayer(ctx.bosses, player, ctx.grid)) {
    delta.bosses = ctx.bosses;
  }

  if (ctx.tickCount % FOOD_AOI_SYNC_TICKS === 0) {
    delta.fsync = filterFoodAoi(ctx.food, center.x, center.y, player);
    delta.bsync = filterBonusesAoi(ctx.bonuses, center.x, center.y, ctx.bonusTypes, player);
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
  PLAYER_AOI_RADIUS,
  FOOD_AOI_RADIUS,
  LOOKAHEAD_CELLS,
  FOOD_AOI_SYNC_TICKS,
  createJournal,
  foodKey,
  compactFood,
  compactBonus,
  inAoi,
  inFoodAoi,
  buildSnapshot,
  buildDelta,
  buildPresence,
  packPlayerMove,
  packPlayerMeta,
  filterFoodAoi,
};
