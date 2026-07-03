/**
 * Client-side apply for snapshot + delta (Level 2 net).
 */
const GameSyncClient = (() => {
  const FOOD_KINDS = {
    apple: true, cherry: true, grape: true,
    rotten: true, spider: true, mushroom: true, bone: true,
  };

  function expandFood(compact) {
    const [x, y, kind] = compact;
    const good = kind === "apple" || kind === "cherry" || kind === "grape";
    const points = kind === "cherry" ? 7 : 6;
    return { x, y, kind, good, points: good ? points : 0 };
  }

  function expandBonus(compact) {
    const [x, y, bonusType, color, label] = compact;
    return {
      x, y, bonusType,
      def: { color, label },
    };
  }

  function findPlayer(players, id) {
    return players.find((p) => p.id === id);
  }

  function applyMove(players, mv) {
    const [id, x, y, dx, dy, len, grew] = mv;
    let p = findPlayer(players, id);
    if (!p) return null;
    const head = { x, y };
    p.snake = p.snake || [];
    p.snake.unshift(head);
    if (!grew) {
      while (p.snake.length > len) p.snake.pop();
    }
    p.direction = { x: dx, y: dy };
    p.alive = p.alive !== false;
    return p;
  }

  function applyMeta(p, meta) {
    const [
      id, score, combo, alive, activeBonus, bonusExpires,
      spawnFrozenLeft, heat, coins, coinsEarned, reason,
    ] = meta;
    p.score = score;
    p.combo = combo;
    p.alive = alive === 1;
    p.activeBonus = activeBonus || null;
    p.bonusExpires = bonusExpires || null;
    p.spawnFrozenLeft = spawnFrozenLeft;
    p.heat = heat;
    p.coins = coins;
    p.coinsEarned = coinsEarned;
    p.reason = reason;
    return p;
  }

  function foodIndex(food, x, y) {
    return food.findIndex((f) => f.x === x && f.y === y);
  }

  function applySnapshot(state, msg) {
    state.grid = msg.grid || state.grid;
    state.food = (msg.food || []).map(expandFood);
    state.bonuses = (msg.bonuses || []).map(expandBonus);
    state.bosses = msg.bosses || [];
    if (msg.tickMs) state.estimatedTickMs = msg.tickMs;
    return msg.players || [];
  }

  function applyDelta(state, msg) {
    if (msg.tickMs) state.estimatedTickMs = msg.tickMs;
    if (msg.bosses) state.bosses = msg.bosses;

    if (msg.fsync) {
      state.food = msg.fsync.map(expandFood);
    }
    if (msg.bsync) {
      state.bonuses = msg.bsync.map(expandBonus);
    }

    if (msg.frm) {
      for (const [x, y] of msg.frm) {
        const idx = foodIndex(state.food, x, y);
        if (idx >= 0) state.food.splice(idx, 1);
      }
    }
    if (msg.fad) {
      for (const f of msg.fad) {
        const item = expandFood(f);
        if (foodIndex(state.food, item.x, item.y) < 0) state.food.push(item);
      }
    }

    if (msg.brm) {
      for (const [x, y] of msg.brm) {
        const idx = state.bonuses.findIndex((b) => b.x === x && b.y === y);
        if (idx >= 0) state.bonuses.splice(idx, 1);
      }
    }
    if (msg.bad) {
      for (const b of msg.bad) {
        const item = expandBonus(b);
        if (state.bonuses.every((x) => x.x !== item.x || x.y !== item.y)) {
          state.bonuses.push(item);
        }
      }
    }

    let players = state.players;

    if (msg.pj) {
      for (const pj of msg.pj) {
        const existing = findPlayer(players, pj.id);
        if (existing) Object.assign(existing, pj);
        else players.push(pj);
      }
    }

    if (msg.ple) {
      for (const id of msg.ple) {
        const idx = players.findIndex((p) => p.id === id);
        if (idx >= 0) players.splice(idx, 1);
      }
    }

    if (msg.mv) {
      for (const mv of msg.mv) applyMove(players, mv);
    }

    if (msg.pm) {
      for (const meta of msg.pm) {
        let p = findPlayer(players, meta[0]);
        if (!p) continue;
        applyMeta(p, meta);
      }
    }

    return players;
  }

  return { applySnapshot, applyDelta, applyMove };
})();
