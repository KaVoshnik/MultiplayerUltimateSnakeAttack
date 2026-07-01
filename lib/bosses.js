"use strict";

// === Глобальные константы ===
const BOSS_MOVE_EVERY = 5;          // немного быстрее (было 6)
const BOSS_CHASE_RANGE = 24;
const BOSS_RANDOM_MOVE_CHANCE = 0.18;
const BOSS_HUNT_RANGE = 6;
const BOSS_SPAWN_BUFFER = 14;

// Виды "плохой" еды — должны совпадать с lib/food.js (BAD_FOOD_KINDS)
const BAD_FOOD_KINDS = ["rotten", "spider", "mushroom", "bone"];

// === Фабрика боссов ===
function createBosses(GRID) {
  const voidHome  = { x: 20, y: 20 };
  const nyxHome   = { x: GRID.width - 24, y: 20 };
  const scrapHome = { x: Math.floor(GRID.width / 2) - 2, y: GRID.height - 24 };

  const defs = [
    {
      id: "void", name: "VØIDR", color: "#f66151", trait: "dash",
      x: voidHome.x, y: voidHome.y,
      homeX: voidHome.x, homeY: voidHome.y,
      // Берсерк-охотник: всегда гонится, рывки и телепорты — только у него
      chaseRange: BOSS_CHASE_RANGE + 10,
      randomChance: 0.05,
      dashChance: 0.42,      // шанс двойного/тройного хода за тик
      dashSteps: 3,          // максимальное число шагов за рывок
      patrolMode: "chase",   // всегда в режиме охоты
    },
    {
      id: "nyx", name: "NYX-7", color: "#7c3aed", trait: "eater",
      x: nyxHome.x, y: nyxHome.y,
      homeX: nyxHome.x, homeY: nyxHome.y,
      // Падальщик: патрулирует углы, подъедает яд/несъедобную еду
      // со змеиного поля и на время впадает в ярость, когда "наедается"
      chaseRange: BOSS_CHASE_RANGE - 4,
      randomChance: 0.3,      // случайные ходы во время патруля (обманывает)
      eatRadius: 4,           // дистанция, на которой замечает плохую еду
      eatThreshold: 4,        // сколько съесть, чтобы впасть в раж
      eatenCount: 0,
      frenzyDuration: 50,     // длительность ража короче обычной ярости
      patrolMode: "corners",  // патрулирует углы карты
      patrolIdx: 0,
    },
    {
      id: "scrap", name: "SCR4P", color: "#ea580c", trait: "poison",
      x: scrapHome.x, y: scrapHome.y,
      homeX: scrapHome.x, homeY: scrapHome.y,
      // Территориальный: зигзаг, изредка ядовитый след, AOE при ярости
      chaseRange: BOSS_CHASE_RANGE,
      randomChance: 0.22,
      poisonAlways: true,    // яд возможен даже без ярости, но редко
      poisonChance: 0.22,    // было 0.55 — гадит заметно реже
      aoeRadius: 2,          // было 3 — меньше радиус AOE-яда при ярости
      aoeChance: 0.15,       // было 0.35 — реже разбрасывает яд в AOE
      zigzag: true,          // движется зигзагом
      zigzagDir: 1,
      zigzagTick: 0,
      patrolMode: "spiral",  // спиральный патруль вокруг СВОЕЙ точки спавна
      spiralAngle: 0,
    },
  ];
  return defs.map((def) => ({
    ...def,
    size: 1, pulse: 0, angry: false, phase: "idle",
    enragedTicks: 0, agitatedTicks: 0, kills: 0, moveCooldown: 0,
    lastDir: null,
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
  const dirs = shuffledDirs().filter((m) => bossCanMove(bosses, boss, m, GRID));
  return dirs[0] || null;
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
  // VØIDR злится дольше и сильнее
  const duration = boss.trait === "dash" ? 120 : 90;
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

// Короткий, более слабый "раж" для NYX-7 — наелась плохой еды и беснуется
function triggerNyxFrenzy(boss, bosses, pushFeed, broadcast) {
  const wasEnraged = boss.enragedTicks > 0;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, boss.frenzyDuration || 50);
  boss.size = 2;
  boss.phase = "enraged";
  boss.angry = true;
  boss.eatenCount = 0;

  if (!wasEnraged) {
    pushFeed("boss", `🤢 ${boss.name} объелась дряни и беснуется!`, "");
    broadcast({ type: "notice", text: `⚠ ${boss.name} в пищевом раже!` });
  }
}

// === Применение шага ===
function applyBossStep(boss, move, avoidCells, GRID, deps) {
  const prevX = boss.x;
  const prevY = boss.y;
  boss.x += move.x;
  boss.y += move.y;
  clampBossInGrid(boss, GRID);
  boss.lastDir = move;

  const { food, pushFoodItem, createBadFood, insideGrid, anyBossOccupies: anyOccupies, pointKey } = deps;

  // SCR4P изредка оставляет яд позади себя (заметно реже, чем раньше)
  if (boss.trait === "poison") {
    const chance = boss.poisonAlways
      ? (boss.phase === "enraged" ? 0.35 : boss.poisonChance || 0.22)
      : (boss.phase === "enraged" ? 0.2 : 0);
    leavePoisonCell({ x: prevX, y: prevY }, avoidCells,
      { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey }, chance);
  }
}

function leavePoisonCell(prev, avoidCells, { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey }, chance = 0.22) {
  if (Math.random() > chance) return;
  const { x, y } = prev;
  if (!insideGrid({ x, y }) || anyOccupies({ x, y })) return;
  if (avoidCells?.has(pointKey({ x, y }))) return;
  if (food.some((item) => item.x === x && item.y === y)) return;
  if (food.length >= 374) return;
  pushFoodItem(createBadFood({ x, y }));
}

// Находит ближайшую "плохую" еду в радиусе боcса (для NYX-7)
function findNearbyBadFood(food, boss, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const item of food) {
    if (!BAD_FOOD_KINDS.includes(item.kind)) continue;
    const d = distanceToBoss(item, boss);
    if (d <= radius && d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

// === Паттерны патруля (все — НЕ в центре карты) ===

// NYX-7: обходит четыре угла карты по кругу
function getCornerTarget(boss, GRID) {
  const margin = 6;
  const corners = [
    { x: margin, y: margin },
    { x: GRID.width - margin, y: margin },
    { x: GRID.width - margin, y: GRID.height - margin },
    { x: margin, y: GRID.height - margin },
  ];
  const idx = boss.patrolIdx || 0;
  const tgt = corners[idx];
  // Переключаем угол когда добрались
  if (Math.abs(boss.x - tgt.x) + Math.abs(boss.y - tgt.y) <= 4) {
    boss.patrolIdx = (idx + 1) % corners.length;
  }
  return tgt;
}

// VØIDR: когда некого преследовать, патрулирует широкий круг вокруг
// своей точки спавна (а не дрейфует к центру карты)
function getVoidrPatrolTarget(boss, GRID) {
  const home = { x: boss.homeX ?? boss.x, y: boss.homeY ?? boss.y };
  const t = (Date.now() / 4000) % (Math.PI * 2);
  const r = 16;
  return {
    x: Math.max(4, Math.min(GRID.width - 4, Math.round(home.x + Math.cos(t) * r))),
    y: Math.max(4, Math.min(GRID.height - 4, Math.round(home.y + Math.sin(t) * r))),
  };
}

// SCR4P: медленная расширяющаяся спираль вокруг СОБСТВЕННОЙ точки
// спавна (раньше крутилась вокруг центра карты — там все боссы и сидели)
function getSpiralTarget(boss, GRID) {
  const home = { x: boss.homeX ?? Math.floor(GRID.width / 2), y: boss.homeY ?? Math.floor(GRID.height / 2) };
  boss.spiralAngle = (boss.spiralAngle || 0) + 0.08;
  const r = 10 + (boss.spiralAngle % (Math.PI * 2) / (Math.PI * 2)) * 8;
  return {
    x: Math.max(4, Math.min(GRID.width - 4, Math.round(home.x + Math.cos(boss.spiralAngle) * r))),
    y: Math.max(4, Math.min(GRID.height - 4, Math.round(home.y + Math.sin(boss.spiralAngle) * r))),
  };
}

// === Уникальная логика движения ===

// VØIDR — всегда преследует, рывки и телепорты — только у этого босса
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

    // Рывок: несколько дополнительных шагов подряд — фирменная фишка VØIDR
    if (boss.phase === "enraged" || boss.agitatedTicks > 0 || dist < 14) {
      const steps = boss.phase === "enraged" ? boss.dashSteps || 3 : 2;
      const chance = boss.phase === "enraged" ? 0.72 : (boss.dashChance || 0.42);
      if (Math.random() < chance) {
        for (let i = 0; i < steps; i++) {
          const m2 = pickDirectMove(bosses, boss, head, GRID);
          if (m2) applyBossStep(boss, m2, avoidCells, GRID, deps);
        }
      }
    }
  } else {
    // Никого нет рядом — патрулирует свою зону, а не дрейфует к центру
    const patrol = getVoidrPatrolTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, patrol, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// NYX-7 — падальщик: патрулирует углы, подъедает яд/несъедобную еду,
// на время впадает в раж, когда наестся
function moveNyx(boss, bosses, alive, GRID, avoidCells, deps) {
  const targetEntry = alive.reduce((best, p) => {
    const d = distanceToBoss(p.snake[0], boss);
    return !best || d < best.dist ? { player: p, dist: d } : best;
  }, null);
  const head = targetEntry?.player?.snake?.[0];
  const dist = head ? distanceToBoss(head, boss) : 999;

  // Сначала проверяем, нет ли рядом плохой еды — она в приоритете
  const badFood = findNearbyBadFood(deps.food, boss, boss.eatRadius || 4);

  if (badFood) {
    if (distanceToBoss(badFood, boss) === 0) {
      // Уже на клетке с едой — съедаем
      deps.removeFoodAt(badFood);
      boss.eatenCount = (boss.eatenCount || 0) + 1;
      if (boss.eatenCount >= (boss.eatThreshold || 4)) {
        triggerNyxFrenzy(boss, bosses, deps.pushFeed, deps.broadcast);
      }
    } else {
      const m = pickDirectMove(bosses, boss, badFood, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
    return dist;
  }

  if (head && dist <= (boss.chaseRange || BOSS_CHASE_RANGE)) {
    // Средняя/близкая дистанция — иногда обманное движение
    if (Math.random() < (boss.randomChance || 0.3)) {
      const m = pickRandomLegal(bosses, boss, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    } else {
      const m = pickDirectMove(bosses, boss, head, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
  } else {
    // Патруль по углам
    const corner = getCornerTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, corner, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// SCR4P — территориальный: зигзаг + спираль вокруг своей точки спавна,
// яд оставляет заметно реже, чем раньше
function moveScrap(boss, bosses, alive, GRID, avoidCells, deps) {
  const targetEntry = alive.reduce((best, p) => {
    const d = distanceToBoss(p.snake[0], boss);
    return !best || d < best.dist ? { player: p, dist: d } : best;
  }, null);
  const head = targetEntry?.player?.snake?.[0];
  const dist = head ? distanceToBoss(head, boss) : 999;

  if (head && dist <= BOSS_HUNT_RANGE + 4) {
    // Рядом — атакует напрямую
    const m = pickDirectMove(bosses, boss, head, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);

    // AOE яд при ярости — реже и в меньшем радиусе, чем раньше
    if (boss.phase === "enraged") {
      const r = boss.aoeRadius || 2;
      const chance = boss.aoeChance || 0.15;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= r && Math.random() < chance) {
            leavePoisonCell({ x: boss.x + dx, y: boss.y + dy }, avoidCells, deps, 1.0);
          }
        }
      }
    }
  } else if (head && dist <= (boss.chaseRange || BOSS_CHASE_RANGE)) {
    // Средняя дистанция — зигзаг: чередует прямое движение и перпендикуляр
    boss.zigzagTick = (boss.zigzagTick || 0) + 1;
    const useZigzag = boss.zigzag && boss.zigzagTick % 3 === 0;
    if (useZigzag) {
      boss.zigzagDir = -boss.zigzagDir;
      const preferred = bossMovesToward(boss, head);
      const main = preferred[0];
      const perp = main
        ? { x: main.y * boss.zigzagDir, y: main.x * boss.zigzagDir }
        : pickRandomLegal(bosses, boss, GRID);
      const m = (perp && bossCanMove(bosses, boss, perp, GRID) ? perp : null)
        || pickDirectMove(bosses, boss, head, GRID)
        || pickRandomLegal(bosses, boss, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    } else {
      const m = pickDirectMove(bosses, boss, head, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
  } else {
    // Патруль — спираль вокруг собственной точки спавна, не центра карты
    const spiral = getSpiralTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, spiral, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// === Главный цикл ===
function moveBosses({ bosses, players, food, tickCount, GRID, avoidCells, pushFeed, broadcast, killPlayer, pushFoodItem, createBadFood, removeFoodAt, insideGrid, pointKey }) {
  const alive = [...players.values()].filter((p) => p.alive);

  // Убрать еду под боссами
  for (let i = food.length - 1; i >= 0; i--) {
    if (anyBossOccupies(bosses, food[i])) food.splice(i, 1);
  }

  const _anyOccupies = (pt) => anyBossOccupies(bosses, pt);
  const deps = {
    food, pushFoodItem, createBadFood, insideGrid,
    removeFoodAt: removeFoodAt || (() => {}),
    pushFeed, broadcast,
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

    // Быстрый подсчёт дистанции до ближайшего игрока
    const nearestDist = alive.length
      ? alive.reduce((min, p) => Math.min(min, distanceToBoss(p.snake[0], boss)), 999)
      : 999;

    boss.angry = nearestDist <= BOSS_HUNT_RANGE || boss.phase === "enraged";
    updateBossPhase(boss, nearestDist);

    let dist = 999;
    if (boss.trait === "dash") {
      dist = moveVoidr(boss, bosses, alive, GRID, avoidCells, deps);
    } else if (boss.trait === "eater") {
      dist = moveNyx(boss, bosses, alive, GRID, avoidCells, deps);
    } else if (boss.trait === "poison") {
      dist = moveScrap(boss, bosses, alive, GRID, avoidCells, deps);
    }

    boss.pulse = (boss.pulse + 1) % 1000;
  }

  // Проверить коллизии после движения
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
