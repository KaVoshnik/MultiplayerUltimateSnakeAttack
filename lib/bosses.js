"use strict";

const BOSS_MOVE_EVERY = 6;
const BOSS_CHASE_RANGE = 22;
const BOSS_RANDOM_MOVE_CHANCE = 0.24;
const BOSS_HUNT_RANGE = 7;
const BOSS_SPAWN_BUFFER = 14;

function createBosses(GRID) {
  const defs = [
    { id: "void",  name: "VØIDR", color: "#f66151", trait: "dash",   x: 20,                        y: 20 },
    { id: "nyx",   name: "NYX-7", color: "#7c3aed", trait: "blink",  x: GRID.width - 24,           y: 20 },
    { id: "scrap", name: "SCR4P", color: "#ea580c", trait: "poison", x: Math.floor(GRID.width / 2) - 2, y: GRID.height - 24 },
  ];
  return defs.map((def) => ({
    ...def,
    size: 1, pulse: 0, angry: false, phase: "idle",
    enragedTicks: 0, agitatedTicks: 0, kills: 0, moveCooldown: 0,
  }));
}

function clampBossInGrid(boss, GRID) {
  boss.x = Math.max(0, Math.min(boss.x, GRID.width  - boss.size));
  boss.y = Math.max(0, Math.min(boss.y, GRID.height - boss.size));
}

function bossOccupies(boss, point) {
  return point.x >= boss.x && point.x < boss.x + boss.size
      && point.y >= boss.y && point.y < boss.y + boss.size;
}

function bossAt(bosses, point) {
  return bosses.find((b) => bossOccupies(b, point)) || null;
}

function anyBossOccupies(bosses, point) {
  return bosses.some((b) => bossOccupies(b, point));
}

function distanceToBoss(point, boss) {
  return Math.abs(point.x - boss.x) + Math.abs(point.y - boss.y);
}

function distanceToNearestBoss(bosses, point) {
  if (!bosses.length) return 999;
  return Math.min(...bosses.map((b) => distanceToBoss(point, b)));
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function bossCanMove(bosses, boss, move, GRID) {
  const next = { x: boss.x + move.x, y: boss.y + move.y };
  if (next.x < 0 || next.y < 0 || next.x + boss.size > GRID.width || next.y + boss.size > GRID.height) return false;
  for (const other of bosses) {
    if (other.id === boss.id) continue;
    if (rectsOverlap(next.x, next.y, boss.size, boss.size, other.x, other.y, other.size, other.size)) return false;
  }
  return true;
}

function shuffledDirs() {
  return [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].sort(() => Math.random() - 0.5);
}

function bossMovesToward(boss, point) {
  const dx = point.x - boss.x;
  const dy = point.y - boss.y;
  const h = dx === 0 ? [] : [{ x: Math.sign(dx), y: 0 }];
  const v = dy === 0 ? [] : [{ x: 0, y: Math.sign(dy) }];
  return Math.abs(dx) > Math.abs(dy) ? [...h, ...v, ...shuffledDirs()] : [...v, ...h, ...shuffledDirs()];
}

function pickBossMove(bosses, boss, target, dist, GRID) {
  const legal = shuffledDirs().filter((m) => bossCanMove(bosses, boss, m, GRID));
  if (!legal.length) return null;

  const chaseRange = boss.phase === "enraged"
    ? BOSS_CHASE_RANGE + 12
    : boss.agitatedTicks > 0
      ? BOSS_CHASE_RANGE + 8
      : boss.trait === "blink"
        ? BOSS_CHASE_RANGE + 6
        : BOSS_CHASE_RANGE;

  const randomChance = boss.phase === "enraged" ? 0.03 : boss.agitatedTicks > 0 ? 0.1 : BOSS_RANDOM_MOVE_CHANCE;
  const shouldChase = target && dist <= chaseRange && Math.random() > randomChance;

  const scoreMove = (m) => {
    const nx = boss.x + m.x;
    const ny = boss.y + m.y;
    let score = Math.min(nx, ny, GRID.width - nx - boss.size, GRID.height - ny - boss.size) * 2;
    if (shouldChase) score -= Math.abs(target.x - nx) + Math.abs(target.y - ny);
    return score;
  };

  if (shouldChase) {
    const preferred = bossMovesToward(boss, target);
    const direct = preferred.find((m) => bossCanMove(bosses, boss, m, GRID));
    if (direct) return direct;
  }

  legal.sort((a, b) => scoreMove(b) - scoreMove(a));
  return legal[0];
}

function updateBossPhase(boss, dist) {
  if (boss.enragedTicks > 0) {
    boss.enragedTicks -= 1;
    boss.phase = "enraged";
    boss.size = 2;
    if (boss.enragedTicks <= 0) {
      boss.size = 1;
      boss.phase = dist <= BOSS_HUNT_RANGE ? "hunt" : "idle";
    }
    return;
  }
  boss.size = 1;
  boss.phase = dist <= BOSS_HUNT_RANGE ? "hunt" : dist <= BOSS_CHASE_RANGE ? "stalk" : "idle";
}

function enrageBoss(boss, bosses, pushFeed, broadcast) {
  boss.kills = (boss.kills || 0) + 1;
  const wasEnraged = boss.enragedTicks > 0;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, 90);
  boss.size = 2;
  boss.phase = "enraged";
  boss.angry = true;

  if (!wasEnraged) {
    pushFeed("boss", `👹 ${boss.name} в ЯРОСТИ!`, "");
    broadcast({ type: "notice", text: `⚠ ${boss.name} вошёл в ярость!` });
    for (const other of bosses) {
      if (other.id !== boss.id) other.agitatedTicks = Math.max(other.agitatedTicks || 0, 50);
    }
  }
}

function applyBossStep(boss, move, avoidCells, GRID, { food, pushFoodItem, createBadFood, insideGrid, anyBossOccupies: anyOccupies, pointKey }) {
  const prevX = boss.x;
  const prevY = boss.y;
  boss.x += move.x;
  boss.y += move.y;
  clampBossInGrid(boss, GRID);

  if (boss.trait === "poison" && boss.phase === "enraged") {
    leavePoisonCell({ x: prevX, y: prevY }, avoidCells, { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey });
  }
}

function leavePoisonCell(prev, avoidCells, { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey }) {
  if (Math.random() > 0.45) return;
  const { x, y } = prev;
  if (!insideGrid({ x, y }) || anyOccupies({ x, y })) return;
  if (avoidCells?.has(pointKey({ x, y }))) return;
  if (food.some((item) => item.x === x && item.y === y)) return;
  if (food.length >= 374) return; // FOOD_TARGET + 24
  pushFoodItem(createBadFood({ x, y }));
}

function moveBosses({ bosses, players, food, tickCount, GRID, avoidCells, pushFeed, broadcast, killPlayer, pushFoodItem, createBadFood, insideGrid, pointKey }) {
  const alive = [...players.values()].filter((p) => p.alive);

  // Убрать еду под боссами
  for (let i = food.length - 1; i >= 0; i--) {
    if (anyBossOccupies(bosses, food[i])) food.splice(i, 1);
  }

  for (const boss of bosses) {
    if (boss.agitatedTicks > 0) boss.agitatedTicks -= 1;

    if (boss.moveCooldown > 0) {
      boss.moveCooldown -= 1;
      boss.pulse = (boss.pulse + 1) % 1000;
      continue;
    }

    const targetEntry = alive.length
      ? alive.reduce((best, p) => {
          const d = distanceToBoss(p.snake[0], boss);
          return !best || d < best.dist ? { player: p, dist: d } : best;
        }, null)
      : null;

    const target = targetEntry?.player;
    const dist = target ? distanceToBoss(target.snake[0], boss) : 999;

    boss.angry = dist <= BOSS_HUNT_RANGE || boss.phase === "enraged";
    updateBossPhase(boss, dist);

    const head = target?.snake?.[0];
    const deps = {
      food, pushFoodItem, createBadFood, insideGrid,
      anyBossOccupies: (pt) => anyBossOccupies(bosses, pt),
      pointKey,
    };

    let move = pickBossMove(bosses, boss, head, dist, GRID);
    if (move) applyBossStep(boss, move, avoidCells, GRID, deps);

    if (boss.trait === "dash" && boss.phase === "enraged" && head && Math.random() < 0.38) {
      move = pickBossMove(bosses, boss, head, distanceToBoss(head, boss), GRID);
      if (move) applyBossStep(boss, move, avoidCells, GRID, deps);
    }
    if (boss.trait === "blink" && (boss.phase === "stalk" || boss.agitatedTicks > 0) && head && dist <= BOSS_CHASE_RANGE && Math.random() < 0.22) {
      move = pickBossMove(bosses, boss, head, distanceToBoss(head, boss), GRID);
      if (move) applyBossStep(boss, move, avoidCells, GRID, deps);
    }

    boss.pulse = (boss.pulse + 1) % 1000;
  }

  // Проверить коллизии после движения боссов
  for (const player of alive) {
    const head = player.snake[0];
    const killer = bossAt(bosses, head);
    if (killer) {
      killPlayer(player, `${killer.name} схватил за голову`, { at: head, boss: killer });
      killer.moveCooldown = killer.phase === "enraged" ? 2 : 4;
    }
  }
}

module.exports = {
  createBosses,
  bossAt,
  anyBossOccupies,
  distanceToNearestBoss,
  enrageBoss,
  moveBosses,
  BOSS_SPAWN_BUFFER,
  BOSS_MOVE_EVERY,
};
