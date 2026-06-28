"use strict";

const FOOD_TARGET = 200;
const MIN_GOOD_FOOD = 70;
const SNAKE_SPAWN_LEN = 4;
const SPAWN_MARGIN = 18;
const SPAWN_CLEAR_RADIUS = 5;
const BAD_FOOD_HEAD_BUFFER = 6;
const FOOD_PATH_AVOID_CELLS = 7;

const FOOD_TYPES = {
  apple:    { good: true,  points: 6, label: "яблоко" },
  cherry:   { good: true,  points: 7, label: "вишню" },
  grape:    { good: true,  points: 6, label: "виноград" },
  rotten:   { good: false, label: "гниль" },
  spider:   { good: false, label: "паука" },
  mushroom: { good: false, label: "ядовитый гриб" },
  bone:     { good: false, label: "кость" },
};

const GOOD_FOOD_KINDS = ["apple", "cherry", "grape"];
const BAD_FOOD_KINDS  = ["rotten", "spider", "mushroom", "bone"];

const DIFFICULTIES = {
  easy:   { label: "Easy",   tickMs: 160, wallDeath: false, badFoodRatio: 0.22 },
  normal: { label: "Normal", tickMs: 115, wallDeath: true,  badFoodRatio: 0.32 },
  hard:   { label: "Hard",   tickMs: 80,  wallDeath: true,  badFoodRatio: 0.45 },
  insane: { label: "Insane", tickMs: 50,  wallDeath: true,  badFoodRatio: 0.58 },
};

const SPAWN_DIRECTIONS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
];

// --- Утилиты ---

function insideGrid(point, GRID) {
  return point.x >= 0 && point.x < GRID.width && point.y >= 0 && point.y < GRID.height;
}

function pointKey(point) {
  return `${point.x}:${point.y}`;
}

// --- Создание еды ---

function createGoodFood(point) {
  const kind = GOOD_FOOD_KINDS[Math.floor(Math.random() * GOOD_FOOD_KINDS.length)];
  return { ...point, kind, good: true, points: FOOD_TYPES[kind].points };
}

function createBadFood(point) {
  const kind = BAD_FOOD_KINDS[Math.floor(Math.random() * BAD_FOOD_KINDS.length)];
  return { ...point, kind, good: false, points: 0 };
}

function getAverageBadFoodRatio(players) {
  const alive = [...players.values()].filter((p) => p.alive);
  if (alive.length === 0) return DIFFICULTIES.normal.badFoodRatio;
  const ratios = alive.map((p) => (DIFFICULTIES[p.difficulty] || DIFFICULTIES.normal).badFoodRatio);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

// --- Заполнение поля едой ---

function fillFood({ food, players, occupancySet, anyBossOccupies, tickJournal, GRID, avoidCells } = {}) {
  // Мигрировать старые записи без поля kind
  for (let i = food.length - 1; i >= 0; i--) {
    if (!food[i].kind) {
      const pt = { x: food[i].x, y: food[i].y };
      if (food[i].good === true || food[i].value === 6 || food[i].value === 7) {
        food[i] = createGoodFood(pt);
      } else if (food[i].good === false || food[i].value !== undefined) {
        food[i] = createBadFood(pt);
      } else {
        tickJournal.foodRemoved.push([food[i].x, food[i].y]);
        food.splice(i, 1);
      }
    }
  }

  const spawnOpts = { avoidCells, anyBossOccupies, occupancySet, GRID };
  const badRatio = getAverageBadFoodRatio(players);

  while (food.filter((i) => i.good).length < MIN_GOOD_FOOD) {
    const point = randomEmptyPoint(food, spawnOpts);
    if (!point) return;
    const item = createGoodFood(point);
    food.push(item);
    tickJournal.foodAdded.push(compactFood(item));
  }

  while (food.length < FOOD_TARGET) {
    const wantBad = Math.random() < badRatio;
    const point = randomEmptyPoint(food, { ...spawnOpts, avoidNearHeads: wantBad, players });
    if (!point) return;
    const item = wantBad ? createBadFood(point) : createGoodFood(point);
    food.push(item);
    tickJournal.foodAdded.push(compactFood(item));
  }
}

function compactFood(item) {
  return { x: item.x, y: item.y, kind: item.kind, good: item.good, points: item.points };
}

// --- Поиск свободного места ---

function randomEmptyPoint(food, opts = {}) {
  const { avoidCells, anyBossOccupies, occupancySet, GRID, avoidNearHeads, players } = opts;
  for (let attempt = 0; attempt < 800; attempt++) {
    const point = { x: Math.floor(Math.random() * GRID.width), y: Math.floor(Math.random() * GRID.height) };
    if (isEmpty(point, food, { avoidCells, anyBossOccupies, occupancySet, avoidNearHeads, players, BAD_FOOD_HEAD_BUFFER })) return point;
  }
  return null;
}

function isEmpty(point, food, opts = {}) {
  const { anyBossOccupies, occupancySet, avoidCells, avoidNearHeads, players } = opts;
  if (anyBossOccupies && anyBossOccupies(point)) return false;
  if (occupancySet && occupancySet.has(pointKey(point))) return false;
  if (avoidCells?.has(pointKey(point))) return false;
  if (avoidNearHeads && players) {
    for (const player of players.values()) {
      if (!player.alive) continue;
      const head = player.snake[0];
      if (Math.abs(point.x - head.x) + Math.abs(point.y - head.y) <= BAD_FOOD_HEAD_BUFFER) return false;
    }
  }
  return true;
}

// --- Спавн змеек ---

function snakeSegmentsFromHead(head, direction, length = SNAKE_SPAWN_LEN) {
  const tailDir = { x: -direction.x, y: -direction.y };
  const segments = [head];
  for (let i = 1; i < length; i++) {
    segments.push({ x: head.x + tailDir.x * i, y: head.y + tailDir.y * i });
  }
  return segments;
}

function allSegmentsInsideGrid(segments, GRID) {
  return segments.every((s) => insideGrid(s, GRID));
}

function segmentsConflict(segments, { players, food, bonuses, anyBossOccupies, ignorePlayerId } = {}) {
  for (const part of segments) {
    if (anyBossOccupies && anyBossOccupies(part)) return true;
    if (food?.some((item) => item.x === part.x && item.y === part.y)) return true;
    if (bonuses?.some((b) => b.x === part.x && b.y === part.y)) return true;
  }
  if (players) {
    for (const player of players.values()) {
      if (ignorePlayerId && player.id === ignorePlayerId) continue;
      for (const part of player.snake) {
        if (segments.some((seg) => seg.x === part.x && seg.y === part.y)) return true;
      }
    }
  }
  return false;
}

function findSpawnLayout({ players, food, bonuses, anyBossOccupies, distanceToNearestBoss, GRID, ignorePlayerId, BOSS_SPAWN_BUFFER }) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const head = {
      x: SPAWN_MARGIN + Math.floor(Math.random() * (GRID.width  - SPAWN_MARGIN * 2)),
      y: SPAWN_MARGIN + Math.floor(Math.random() * (GRID.height - SPAWN_MARGIN * 2)),
    };
    const direction = SPAWN_DIRECTIONS[Math.floor(Math.random() * SPAWN_DIRECTIONS.length)];
    const snake = snakeSegmentsFromHead(head, direction);
    if (!allSegmentsInsideGrid(snake, GRID)) continue;
    if (segmentsConflict(snake, { players, food, bonuses, anyBossOccupies, ignorePlayerId })) continue;
    if (distanceToNearestBoss(head) < BOSS_SPAWN_BUFFER) continue;
    return { direction, snake };
  }

  // Фоллбэк: перебор
  for (const direction of SPAWN_DIRECTIONS) {
    for (let y = SPAWN_MARGIN; y < GRID.height - SPAWN_MARGIN; y++) {
      for (let x = SPAWN_MARGIN; x < GRID.width - SPAWN_MARGIN; x++) {
        const snake = snakeSegmentsFromHead({ x, y }, direction);
        if (!allSegmentsInsideGrid(snake, GRID)) continue;
        if (segmentsConflict(snake, { players, food, bonuses, anyBossOccupies, ignorePlayerId })) continue;
        return { direction, snake };
      }
    }
  }
  return null;
}

function clearBoardAroundSpawn(head, { food, bonuses }, radius = SPAWN_CLEAR_RADIUS) {
  for (let i = food.length   - 1; i >= 0; i--) {
    if (Math.abs(food[i].x   - head.x) + Math.abs(food[i].y   - head.y) <= radius) food.splice(i, 1);
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (Math.abs(bonuses[i].x - head.x) + Math.abs(bonuses[i].y - head.y) <= radius) bonuses.splice(i, 1);
  }
}

function removeEntitiesUnderSnake(player, { food, bonuses }) {
  const occupied = new Set(player.snake.map(pointKey));
  for (let i = food.length   - 1; i >= 0; i--) {
    if (occupied.has(pointKey(food[i])))   food.splice(i, 1);
  }
  for (let i = bonuses.length - 1; i >= 0; i--) {
    if (occupied.has(pointKey(bonuses[i]))) bonuses.splice(i, 1);
  }
}

// --- Путь движения (для избежания при спавне еды) ---

function getMovementPathCells(players, { GRID, tickCount, DIFFICULTIES: diff }) {
  const cells = new Set();
  for (const player of players.values()) {
    if (!player.alive) continue;
    if (player.frozenUntil && Date.now() < player.frozenUntil) continue;
    if (player.activeBonus === "slow_down" && tickCount % 2 === 0) continue;
    const dir = player.nextDirection || player.direction;
    if (!dir) continue;
    const d = (diff || DIFFICULTIES)[player.difficulty] || DIFFICULTIES.normal;
    let x = player.snake[0].x;
    let y = player.snake[0].y;
    for (let i = 0; i < FOOD_PATH_AVOID_CELLS; i++) {
      x += dir.x;
      y += dir.y;
      if (!insideGrid({ x, y }, GRID)) {
        if (d.wallDeath) break;
        x = (x + GRID.width)  % GRID.width;
        y = (y + GRID.height) % GRID.height;
      }
      cells.add(pointKey({ x, y }));
    }
  }
  return cells;
}

module.exports = {
  FOOD_TYPES,
  FOOD_TARGET,
  DIFFICULTIES,
  createGoodFood,
  createBadFood,
  fillFood,
  compactFood,
  randomEmptyPoint,
  isEmpty,
  findSpawnLayout,
  clearBoardAroundSpawn,
  removeEntitiesUnderSnake,
  getMovementPathCells,
  insideGrid,
  pointKey,
};
