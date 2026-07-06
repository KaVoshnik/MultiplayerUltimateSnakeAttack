"use strict";

// === Глобальные константы ===
const BOSS_MOVE_EVERY      = 5;
const BOSS_CHASE_RANGE     = 24;
const BOSS_HUNT_RANGE      = 6;
const BOSS_SPAWN_BUFFER    = 14;

// Насколько heat снижает "эффективную дистанцию" при выборе цели.
// Игрок с heat 100 кажется на HEAT_WEIGHT клеток ближе для боссов.
const HEAT_WEIGHT_VOID  = 28;  // VØIDR активно охотится за горячими
const HEAT_WEIGHT_NYX   = 10;  // NYX-7 немного предпочитает горячих
const HEAT_WEIGHT_SCRAP = 20;  // SCR4P территориальный, но горячих не любит

const BAD_FOOD_KINDS = ["rotten", "spider", "mushroom", "bone"];

// === Фабрика боссов ===
function createBosses(GRID) {
  const voidHome  = { x: 20,                         y: 20 };
  const nyxHome   = { x: GRID.width - 24,            y: 20 };
  const scrapHome = { x: Math.floor(GRID.width / 2), y: GRID.height - 24 };

  const defs = [
    {
      id: "void", name: "VØIDR", color: "#f66151", trait: "dash",
      x: voidHome.x, y: voidHome.y,
      homeX: voidHome.x, homeY: voidHome.y,
      chaseRange: BOSS_CHASE_RANGE + 10,
      // Рывок: 1 доп. шаг за тик в ярости (было 2), шанс рывка ниже в ярости
      dashChance: 0.38,
      dashSteps: 1,
      // После рывка обязательный cooldown (тиков), чтобы не пробегал полкарты
      dashCooldown: 0,
      dashCooldownMax: 3,
      heatWeight: HEAT_WEIGHT_VOID,
    },
    {
      id: "nyx", name: "NYX-7", color: "#7c3aed", trait: "eater",
      x: nyxHome.x, y: nyxHome.y,
      homeX: nyxHome.x, homeY: nyxHome.y,
      chaseRange: BOSS_CHASE_RANGE - 4,
      randomChance: 0.28,
      eatRadius: 5,
      eatThreshold: 4,
      eatenCount: 0,
      frenzyDuration: 55,
      heatWeight: HEAT_WEIGHT_NYX,
    },
    {
      id: "scrap", name: "SCR4P", color: "#ea580c", trait: "poison",
      x: scrapHome.x, y: scrapHome.y,
      homeX: scrapHome.x, homeY: scrapHome.y,
      chaseRange: BOSS_CHASE_RANGE,
      randomChance: 0.22,
      poisonAlways: true,
      poisonChance: 0.18,      // реже гадит
      aoeRadius: 2,
      aoeChance: 0.12,
      zigzag: true,
      zigzagDir: 1,
      zigzagTick: 0,
      heatWeight: HEAT_WEIGHT_SCRAP,
    },
  ];

  return defs.map((def) => ({
    ...def,
    size: 1, pulse: 0, angry: false, phase: "idle",
    enragedTicks: 0, agitatedTicks: 0, kills: 0, moveCooldown: 0,
    lastDir: null,
    // Блуждание: периодически меняют зону патруля
    wanderTarget: null,
    wanderExpiry: 0,
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
  return [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  ].sort(() => Math.random() - 0.5);
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

// === Heat ===
// Вычисляем прямо здесь, без доступа к профилям
function playerHeat(player) {
  return Math.min(100, Math.round((player.score || 0) * 0.4 + (player.combo || 0) * 9));
}

// === Выбор цели с учётом heat ===
// Возвращает { player, dist, heat }
// Горячие змейки кажутся ближе на `heatWeight * heat/100` клеток
function pickTarget(alive, boss) {
  const hw = boss.heatWeight || 0;
  let best = null;
  for (const p of alive) {
    const head = p.snake[0];
    if (!head) continue;
    const dist = distanceToBoss(head, boss);
    const heat = playerHeat(p);
    const effective = dist - hw * (heat / 100);
    if (!best || effective < best.effective) {
      best = { player: p, dist, heat, effective };
    }
  }
  return best;
}

// === Блуждание: рандомная точка на всей карте (с margin) ===
const WANDER_MARGIN     = 8;
const WANDER_DURATION   = 8000;  // ms
const WANDER_MIN_DIST   = 40;    // минимальное расстояние от текущей позиции

function getWanderTarget(boss, GRID) {
  const now = Date.now();
  if (boss.wanderTarget && now < boss.wanderExpiry) {
    // Если почти добрались — сразу обновляем
    const d = distanceToBoss(boss.wanderTarget, boss);
    if (d > 5) return boss.wanderTarget;
  }
  // Генерируем новую точку подальше от текущего положения
  let pt;
  let tries = 0;
  do {
    pt = {
      x: WANDER_MARGIN + Math.floor(Math.random() * (GRID.width  - WANDER_MARGIN * 2)),
      y: WANDER_MARGIN + Math.floor(Math.random() * (GRID.height - WANDER_MARGIN * 2)),
    };
    tries++;
  } while (distanceToBoss(pt, boss) < WANDER_MIN_DIST && tries < 30);

  boss.wanderTarget = pt;
  boss.wanderExpiry = now + WANDER_DURATION + Math.random() * 4000;
  return pt;
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
  const duration   = boss.trait === "dash" ? 100 : 80;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, duration);
  boss.size  = 2;
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

function triggerNyxFrenzy(boss, bosses, pushFeed, broadcast) {
  const wasEnraged = boss.enragedTicks > 0;
  boss.enragedTicks = Math.max(boss.enragedTicks || 0, boss.frenzyDuration || 55);
  boss.size  = 2;
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

  if (boss.trait === "poison") {
    const { food, pushFoodItem, createBadFood, insideGrid, anyBossOccupies: anyOcc, pointKey } = deps;
    const chance = boss.poisonAlways
      ? (boss.phase === "enraged" ? 0.28 : boss.poisonChance || 0.18)
      : (boss.phase === "enraged" ? 0.15 : 0);
    leavePoisonCell({ x: prevX, y: prevY }, avoidCells,
      { food, pushFoodItem, createBadFood, insideGrid, anyOccupies: anyOcc, pointKey }, chance);
  }
}

function leavePoisonCell(prev, avoidCells, { food, pushFoodItem, createBadFood, insideGrid, anyOccupies, pointKey }, chance) {
  if (Math.random() > chance) return;
  const { x, y } = prev;
  if (!insideGrid({ x, y }) || anyOccupies({ x, y })) return;
  if (avoidCells?.has(pointKey({ x, y }))) return;
  if (food.some((item) => item.x === x && item.y === y)) return;
  if (food.length >= 374) return;
  pushFoodItem(createBadFood({ x, y }));
}

function findNearbyBadFood(food, boss, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const item of food) {
    if (!BAD_FOOD_KINDS.includes(item.kind)) continue;
    const d = distanceToBoss(item, boss);
    if (d <= radius && d < bestDist) { best = item; bestDist = d; }
  }
  return best;
}

// === VØIDR — берсерк-охотник ===
// Только он делает рывки. Cooldown после рывка исключает
// пробежку с одного конца карты до другого.
function moveVoidr(boss, bosses, alive, GRID, avoidCells, deps) {
  // Cooldown после рывка
  if (boss.dashCooldown > 0) {
    boss.dashCooldown -= 1;
    return alive.length ? distanceToBoss(alive[0].snake[0], boss) : 999;
  }

  const target = pickTarget(alive, boss);
  const head   = target?.player?.snake?.[0];
  const dist   = head ? distanceToBoss(head, boss) : 999;

  if (head) {
    const move = pickDirectMove(bosses, boss, head, GRID);
    if (move) applyBossStep(boss, move, avoidCells, GRID, deps);

    // Рывок: только если достаточно близко ИЛИ в ярости,
    // и только если нет cooldown
    const isClose   = dist < 18;
    const inRage    = boss.phase === "enraged";
    const agitated  = boss.agitatedTicks > 0;

    if (isClose || inRage || agitated) {
      const maxSteps   = inRage ? boss.dashSteps || 1 : 1;
      const dashChance = inRage ? 0.30 : (boss.dashChance || 0.38);

      if (Math.random() < dashChance) {
        let stepped = 0;
        for (let i = 0; i < maxSteps; i++) {
          const m2 = pickDirectMove(bosses, boss, head, GRID);
          if (m2) { applyBossStep(boss, m2, avoidCells, GRID, deps); stepped++; }
        }
        if (stepped > 0) {
          // После рывка — cooldown, чтобы не было цепных дашей через всю карту
          boss.dashCooldown = inRage
            ? (boss.dashCooldownMax || 3) + 1
            : (boss.dashCooldownMax || 3) + 1;
        }
      }
    }
  } else {
    // Никого нет — блуждаем по всей карте
    const wander = getWanderTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, wander, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// === NYX-7 — падальщик ===
function moveNyx(boss, bosses, alive, GRID, avoidCells, deps) {
  const target = pickTarget(alive, boss);
  const head   = target?.player?.snake?.[0];
  const dist   = head ? distanceToBoss(head, boss) : 999;

  // Приоритет: плохая еда рядом
  const badFood = findNearbyBadFood(deps.food, boss, boss.eatRadius || 5);

  if (badFood) {
    if (distanceToBoss(badFood, boss) === 0) {
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
    if (Math.random() < (boss.randomChance || 0.28)) {
      const m = pickRandomLegal(bosses, boss, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    } else {
      const m = pickDirectMove(bosses, boss, head, GRID);
      if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
    }
  } else {
    // Блуждаем по всей карте в поисках плохой еды
    const wander = getWanderTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, wander, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// === SCR4P — территориальный ===
function moveScrap(boss, bosses, alive, GRID, avoidCells, deps) {
  const target = pickTarget(alive, boss);
  const head   = target?.player?.snake?.[0];
  const dist   = head ? distanceToBoss(head, boss) : 999;

  if (head && dist <= BOSS_HUNT_RANGE + 4) {
    const m = pickDirectMove(bosses, boss, head, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);

    if (boss.phase === "enraged") {
      const r      = boss.aoeRadius || 2;
      const chance = boss.aoeChance || 0.12;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= r && Math.random() < chance) {
            leavePoisonCell({ x: boss.x + dx, y: boss.y + dy }, avoidCells, deps, 1.0);
          }
        }
      }
    }
  } else if (head && dist <= (boss.chaseRange || BOSS_CHASE_RANGE)) {
    // Средняя дистанция — зигзаг + приоритет горячих
    boss.zigzagTick = (boss.zigzagTick || 0) + 1;
    const useZigzag = boss.zigzag && boss.zigzagTick % 3 === 0;

    if (useZigzag) {
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
    // Блуждание: уходит в разные части карты, не кружит на месте
    const wander = getWanderTarget(boss, GRID);
    const m = pickDirectMove(bosses, boss, wander, GRID) || pickRandomLegal(bosses, boss, GRID);
    if (m) applyBossStep(boss, m, avoidCells, GRID, deps);
  }

  return dist;
}

// === Главный цикл ===
function moveBosses({ bosses, players, food, tickCount, GRID, avoidCells, pushFeed, broadcast, killPlayer, pushFoodItem, createBadFood, removeFoodAt, insideGrid, pointKey }) {
  const alive = [...players.values()].filter((p) => p.alive && p.snake?.length);

  // Убрать еду под боссами
  for (let i = food.length - 1; i >= 0; i--) {
    if (anyBossOccupies(bosses, food[i])) food.splice(i, 1);
  }

  const _anyOcc = (pt) => anyBossOccupies(bosses, pt);
  const deps = {
    food, pushFoodItem, createBadFood, insideGrid,
    removeFoodAt: removeFoodAt || (() => {}),
    pushFeed, broadcast,
    anyBossOccupies: _anyOcc,
    anyOccupies: _anyOcc,
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
      ? Math.min(...alive.map((p) => distanceToBoss(p.snake[0], boss)))
      : 999;

    boss.angry = nearestDist <= BOSS_HUNT_RANGE || boss.phase === "enraged";
    updateBossPhase(boss, nearestDist);

    if (boss.trait === "dash")   moveVoidr(boss, bosses, alive, GRID, avoidCells, deps);
    else if (boss.trait === "eater")  moveNyx(boss, bosses, alive, GRID, avoidCells, deps);
    else if (boss.trait === "poison") moveScrap(boss, bosses, alive, GRID, avoidCells, deps);

    boss.pulse = (boss.pulse + 1) % 1000;
  }

  // Коллизии после движения
  for (const player of alive) {
    const head   = player.snake[0];
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