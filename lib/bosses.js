"use strict";

// === Глобальные константы ===
const BOSS_MOVE_EVERY = 5;
const BOSS_CHASE_RANGE = 24;
const BOSS_HUNT_RANGE = 6;
const BOSS_SPAWN_BUFFER = 14;

const BAD_FOOD_KINDS = ["rotten", "spider", "mushroom", "bone"];

// NYX_7: порог сытости до ярости
const NYX_HUNGER_MAX = 10;
const NYX_ENRAGE_TICKS = 90;

// === Фабрика боссов ===
function createBosses(GRID) {
  const defs = [
    {
      id: "void", name: "VØIDR", color: "#f66151", trait: "dash",
      // Угол: верхний-левый
      x: 8, y: 8,
      chaseRange: BOSS_CHASE_RANGE + 10,
      dashChance: 0.45,
      dashSteps: 3,
    },
    {
      id: "nyx", name: "NYX-7", color: "#7c3aed", trait: "blink",
      // Угол: верхний-правый
      x: GRID.width - 10, y: 8,
      chaseRange: BOSS_CHASE_RANGE - 2,
      hunger: 0,
      patrolIdx: 0,
    },
    {
      id: "scrap", name: "SCR4P", color: "#ea580c", trait: "poison",
      // Угол: нижний-левый
      x: 8, y: GRID.height - 10,
      chaseRange: BOSS_CHASE_RANGE,
      poisonChance: 0.18,         // меньше яда в обычном режиме
      poisonChanceEnraged: 0.38,  // и при ярости тоже умеренно
      zigzagDir: 1,
      zigzagTick: 0,
      perimIdx: 0,
      perimDir: 1,
    },
  ];
  return defs.map((def) => ({
    ...def,
    size: 1, pulse: 0, angry: false, phase: "idle",
    enragedTicks: 0, agitatedTicks: 0, kills: 0, moveCooldown: 0,
    lastDir: null,
    // для клиентской интерполяции
    prevX: def.x, prevY: def.y, moveAt: 0,
  }));
}

// === Утилиты ===
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

function shuffledDirs() {
  return [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].sort(() => Math.random() - 0.5);
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

function bossMovesToward(boss, point) {
  const dx = point.x - boss.x;
  const dy = point.y - boss.y;
  const h = dx === 0 ? [] : [{ x: Math.sign(dx), y: 0 }];
  const v = dy === 0 ? [] : [{ x: 0, y: Math.sign(dy) }];
  return Math.abs(dx) > Math.abs(dy) ? [...h, ...v, ...shuffledDirs()] : [...v, ...h, ...shuffledDirs()];
}

function pickDirectMove(bosses, boss, target, GRID) {
  const preferred = bossMovesToward(boss, target);
  return preferred.find((m) => bossCanMove(bosses, boss, m, GRID)) || null;
}

function pickRandomLegal(bosses, boss, GRID) {
  return shuffledDirs().filter((m) => bossCanMove(bosses, boss, m, GRID))[0] || null;
}

// === Фазы ===
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
  const duration = boss.trait === "dash" ? 130 : 90;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, duration);
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

// === Применение шага (записывает prevX/prevY для клиентской интерполяции) ===
function applyBossStep(boss, move, avoidCells, GRID, deps) {
  boss.prevX = boss.x;
  boss.prevY = boss.y;
  boss.x += move.x;
  boss.y += move.y;
  clampBossInGrid(boss, GRID);
  boss.lastDir = move;
  boss.moveAt = Date.now();

  // SCR4P — ядовитый след
  if (boss.trait === "poison") {
    const chance = boss.phase === "enraged"
      ? (boss.poisonChanceEnraged || 0.38)
      : (boss.poisonChance || 0.18);
    leavePoisonCell({ x: boss.prevX, y: boss.prevY }, avoidCells, deps, chance);
  }
}

function leavePoisonCell(prev, avoidCells, deps, chance) {
  if (Math.random() > chance) return;
  const { x, y } = prev;
  const { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey } = deps;
  if (!insideGrid({ x, y }) || anyOccupies({ x, y })) return;
  if (avoidCells?.has(pointKey({ x, y }))) return;
  if (food.some((item) => item.x === x && item.y === y)) return;
  if (food.length >= 374) return;
  pushFoodItem(createBadFood({ x, y }));
}

// === Патруль по периметру для SCR4P ===
function getPerimeterTarget(boss, GRID) {
  const margin = 5;
  const step = 8;
  const pts = [];
  for (let x = margin; x < GRID.width - margin; x += step)  pts.push({ x, y: margin });
  for (let y = margin; y < GRID.height - margin; y += step)  pts.push({ x: GRID.width - margin, y });
  for (let x = GRID.width - margin; x > margin; x -= step)   pts.push({ x, y: GRID.height - margin });
  for (let y = GRID.height - margin; y > margin; y -= step)  pts.push({ x: margin, y });

  const idx = (boss.perimIdx || 0) % pts.length;
  const tgt = pts[idx];
  if (Math.abs(boss.x - tgt.x) + Math.abs(boss.y - tgt.y) <= 5) {
    boss.perimIdx = (idx + boss.perimDir) % pts.length;
    if (boss.perimIdx < 0) boss.perimIdx = pts.length - 1;
  }
  return tgt;
}

// === Патруль по углам для NYX-7 ===
function getCornerTarget(boss, GRID) {
  const margin = 8;
  const corners = [
    { x: margin,               y: margin },
    { x: GRID.width - margin,  y: margin },
    { x: GRID.width - margin,  y: GRID.height - margin },
    { x: margin,               y: GRID.height - margin },
  ];
  const idx = boss.patrolIdx || 0;
  const tgt = corners[idx];
  if (Math.abs(boss.x - tgt.x) + Math.abs(boss.y - tgt.y) <= 4) {
    boss.patrolIdx = (idx + 1) % corners.length;
  }
  return tgt;
}

// ============================================================
// VØIDR — берсерк-охотник. Только он делает рывки.
// ============================================================
function moveVoidr(boss, bosses, alive, GRID, avoidCells, deps) {
  const targetEntry = alive.reduce((best, p) => {
    const d = distanceToBoss(p.snake[0], boss);
    return !best || d < best.dist ? { player: p, dist: d } : best;
  }, null);
  const head = targetEntry?.player?.snake?.[0];
  const dist = head ? distanceToBoss(head, boss) : 999;

  if (head) {
    const move = pickDirectMove(bosses, boss, head, GRID);
    if (move) applyBossStep(boss, move, avoidCells, GRID, deps);

    // Рывок — только VØIDR
    const dashThreshold = boss.phase === "enraged" ? 999 : (boss.agitatedTicks > 0 ? 18 : 12);
    if (dist <= dashThreshold || boss.phase === "enraged") {
      const steps = boss.phase === "enraged" ? (boss.dashSteps || 3) : 2;
      const chance = boss.phase === "enraged" ? 0.78 : (boss.dashChance || 0.45);
      if (Math.random() < chance) {
        for (let i = 0; i < steps; i++) {
          const m2 = pickDirectMove(bosses, boss, head, GRID);
          if (m2) applyBossStep(boss, m2, avoidCells, GRID, deps);
        }
      }
    }
  } else {
    const m = pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// ============================================================
// NYX-7 — пожиратель bad food. Ест rotten/spider/mushroom/bone,
// накапливает голод (hunger), при заполнении — ярость.
// ============================================================
function moveNyx(boss, bosses, alive, food, GRID, avoidCells, deps, pushFeed, broadcast) {
  // Ищем ближайшую плохую еду
  let nearestBadFood = null;
  let nearestBadDist = 999;
  for (const item of food) {
    if (!BAD_FOOD_KINDS.includes(item.kind)) continue;
    const d = Math.abs(item.x - boss.x) + Math.abs(item.y - boss.y);
    if (d < nearestBadDist) { nearestBadDist = d; nearestBadFood = item; }
  }

  const targetEntry = alive.reduce((best, p) => {
    const d = distanceToBoss(p.snake[0], boss);
    return !best || d < best.dist ? { player: p, dist: d } : best;
  }, null);
  const playerHead = targetEntry?.player?.snake?.[0];
  const playerDist = playerHead ? distanceToBoss(playerHead, boss) : 999;

  // В ярости — атакует игроков
  if (boss.phase === "enraged") {
    if (playerHead) {
      const m = pickDirectMove(bosses, boss, playerHead, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    } else {
      const m = pickRandomLegal(bosses, boss, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
    return playerDist;
  }

  // Идёт к плохой еде (приоритет) или патрулирует углы
  if (nearestBadFood && nearestBadDist < 35) {
    const m = pickDirectMove(bosses, boss, nearestBadFood, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  } else {
    const corner = getCornerTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, corner, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return playerDist;
}

// NYX-7 проверяет — стоит ли он на bad food и съедает её
function nyxEatFood(boss, food, pushFeed, broadcast, bosses) {
  for (let i = food.length - 1; i >= 0; i--) {
    const item = food[i];
    if (item.x !== boss.x || item.y !== boss.y) continue;
    if (!BAD_FOOD_KINDS.includes(item.kind)) continue;
    food.splice(i, 1);
    boss.hunger = (boss.hunger || 0) + 1;
    if (boss.hunger >= NYX_HUNGER_MAX && boss.enragedTicks === 0) {
      boss.hunger = 0;
      boss.enragedTicks = NYX_ENRAGE_TICKS;
      boss.size = 2;
      boss.phase = "enraged";
      boss.angry = true;
      pushFeed("boss", `🍖 ${boss.name} наелся и взбесился!`, "");
      broadcast({ type: "notice", text: `⚠ ${boss.name} наелся — ЯРОСТЬ!` });
      for (const other of bosses) {
        if (other.id !== boss.id) other.agitatedTicks = Math.max(other.agitatedTicks || 0, 40);
      }
    }
  }
}

// ============================================================
// SCR4P — территориальный, периметр + зигзаг. Меньше яда.
// ============================================================
function moveScrap(boss, bosses, alive, GRID, avoidCells, deps) {
  const targetEntry = alive.reduce((best, p) => {
    const d = distanceToBoss(p.snake[0], boss);
    return !best || d < best.dist ? { player: p, dist: d } : best;
  }, null);
  const head = targetEntry?.player?.snake?.[0];
  const dist = head ? distanceToBoss(head, boss) : 999;

  if (head && dist <= BOSS_HUNT_RANGE + 6) {
    // Атака в упор
    const m = pickDirectMove(bosses, boss, head, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);

    // AOE яд при ярости — компактный, с меньшим шансом
    if (boss.phase === "enraged") {
      const r = 2;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= r && Math.random() < 0.18) {
            leavePoisonCell({ x: boss.x + dx, y: boss.y + dy }, avoidCells, deps, 1.0);
          }
        }
      }
    }
  } else if (head && dist <= (boss.chaseRange || BOSS_CHASE_RANGE)) {
    // Зигзаг при преследовании
    boss.zigzagTick = (boss.zigzagTick || 0) + 1;
    if (boss.zigzagTick % 4 === 0) {
      boss.zigzagDir = -boss.zigzagDir;
      const preferred = bossMovesToward(boss, head);
      const main = preferred[0];
      const perp = main ? { x: main.y * boss.zigzagDir, y: main.x * boss.zigzagDir } : null;
      const m = (perp && bossCanMove(bosses, boss, perp, GRID) ? perp : null)
        || pickDirectMove(bosses, boss, head, GRID)
        || pickRandomLegal(bosses, boss, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    } else {
      const m = pickDirectMove(bosses, boss, head, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
  } else {
    // Патруль по периметру — не сидит в центре
    const perim = getPerimeterTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, perim, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// ============================================================
// Главный цикл
// ============================================================
function moveBosses({ bosses, players, food, tickCount, GRID, avoidCells, pushFeed, broadcast, killPlayer, pushFoodItem, createBadFood, insideGrid, pointKey }) {
  const alive = [...players.values()].filter((p) => p.alive);

  // Убрать еду под боссами (кроме NYX — он ест сам через nyxEatFood)
  for (let i = food.length - 1; i >= 0; i--) {
    const f = food[i];
    for (const boss of bosses) {
      if (boss.trait === "blink") continue;
      if (bossOccupies(boss, f)) { food.splice(i, 1); break; }
    }
  }

  const _anyOccupies = (pt) => anyBossOccupies(bosses, pt);
  const deps = {
    food, pushFoodItem, createBadFood, insideGrid,
    anyBossOccupies: _anyOccupies,
    anyOccupies: _anyOccupies,
    pointKey,
  };

  for (const boss of bosses) {
    if (boss.agitatedTicks > 0) boss.agitatedTicks -= 1;

    if (boss.moveCooldown > 0) {
      boss.moveCooldown -= 1;
      boss.pulse = (boss.pulse + 1) % 1000;
      continue;
    }

    const nearestDist = alive.length
      ? alive.reduce((min, p) => Math.min(min, distanceToBoss(p.snake[0], boss)), 999)
      : 999;

    boss.angry = nearestDist <= BOSS_HUNT_RANGE || boss.phase === "enraged";
    updateBossPhase(boss, nearestDist);

    if (boss.trait === "dash") {
      moveVoidr(boss, bosses, alive, GRID, avoidCells, deps);
    } else if (boss.trait === "blink") {
      moveNyx(boss, bosses, alive, food, GRID, avoidCells, deps, pushFeed, broadcast);
      nyxEatFood(boss, food, pushFeed, broadcast, bosses);
    } else if (boss.trait === "poison") {
      moveScrap(boss, bosses, alive, GRID, avoidCells, deps);
    }

    boss.pulse = (boss.pulse + 1) % 1000;
  }

  // Коллизии с игроками
  for (const player of alive) {
    const head = player.snake[0];
    const killer = bossAt(bosses, head);
    if (killer) {
      killPlayer(player, `${killer.name} схватил за голову`, { at: head, boss: killer });
      killer.moveCooldown = killer.phase === "enraged" ? 2 : 3;
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