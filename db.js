const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL
  || "postgresql://snake:snake@127.0.0.1:5432/snake_attack";

let pool;

async function init() {
  pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      name VARCHAR(32) PRIMARY KEY,
      name_lower VARCHAR(32) NOT NULL UNIQUE,
      coins INTEGER NOT NULL DEFAULT 0,
      active_skin VARCHAR(64) NOT NULL DEFAULT 'default',
      avatar VARCHAR(16) NOT NULL DEFAULT '😎',
      snake_hat VARCHAR(64),
      inventory JSONB NOT NULL DEFAULT '["default"]'::jsonb,
      stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leaderboard (
      name VARCHAR(32) PRIMARY KEY,
      name_lower VARCHAR(32) NOT NULL UNIQUE,
      score INTEGER NOT NULL DEFAULT 0,
      difficulty VARCHAR(16) NOT NULL DEFAULT 'normal',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);
  `);
}

function rowToRawProfile(row) {
  return {
    coins: row.coins,
    activeSkin: row.active_skin,
    avatar: row.avatar,
    inventory: row.inventory,
    equipped: { snakeHat: row.snake_hat },
    stats: row.stats,
  };
}

async function loadAllPlayers() {
  const { rows } = await pool.query("SELECT * FROM players ORDER BY name");
  const map = {};
  for (const row of rows) map[row.name] = rowToRawProfile(row);
  return map;
}

async function loadLeaderboard(limit = 20) {
  const { rows } = await pool.query(
    `SELECT name, score, difficulty, recorded_at
     FROM leaderboard
     ORDER BY score DESC, name ASC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    name: row.name,
    score: row.score,
    difficulty: row.difficulty,
    date: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
  }));
}

async function upsertPlayer(name, entry) {
  await pool.query(
    `INSERT INTO players (name, name_lower, coins, active_skin, avatar, snake_hat, inventory, stats, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (name) DO UPDATE SET
       coins = EXCLUDED.coins,
       active_skin = EXCLUDED.active_skin,
       avatar = EXCLUDED.avatar,
       snake_hat = EXCLUDED.snake_hat,
       inventory = EXCLUDED.inventory,
       stats = EXCLUDED.stats,
       updated_at = NOW()`,
    [
      name,
      name.toLowerCase(),
      entry.coins || 0,
      entry.activeSkin || "default",
      entry.avatar || "😎",
      entry.equipped?.snakeHat || null,
      JSON.stringify(entry.inventory || ["default"]),
      JSON.stringify(entry.stats || {}),
    ],
  );
}

async function deletePlayer(name) {
  await pool.query("DELETE FROM players WHERE name_lower = $1", [name.toLowerCase()]);
}

async function renamePlayer(oldName, newName, entry) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM players WHERE name_lower = $1", [oldName.toLowerCase()]);
    await client.query(
      `INSERT INTO players (name, name_lower, coins, active_skin, avatar, snake_hat, inventory, stats, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        newName,
        newName.toLowerCase(),
        entry.coins || 0,
        entry.activeSkin || "default",
        entry.avatar || "😎",
        entry.equipped?.snakeHat || null,
        JSON.stringify(entry.inventory || ["default"]),
        JSON.stringify(entry.stats || {}),
      ],
    );
    await client.query(
      `UPDATE leaderboard SET name = $1, name_lower = $2 WHERE name_lower = $3`,
      [newName, newName.toLowerCase(), oldName.toLowerCase()],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertLeaderboard(name, score, difficulty) {
  await pool.query(
    `INSERT INTO leaderboard (name, name_lower, score, difficulty, recorded_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (name_lower) DO UPDATE SET
       name = EXCLUDED.name,
       score = GREATEST(leaderboard.score, EXCLUDED.score),
       difficulty = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.difficulty ELSE leaderboard.difficulty END,
       recorded_at = CASE WHEN EXCLUDED.score > leaderboard.score THEN NOW() ELSE leaderboard.recorded_at END`,
    [name, name.toLowerCase(), score, difficulty || "normal"],
  );
}

async function resetAll() {
  await pool.query("TRUNCATE players, leaderboard RESTART IDENTITY");
}

async function close() {
  if (pool) await pool.end();
}

module.exports = {
  init,
  loadAllPlayers,
  loadLeaderboard,
  upsertPlayer,
  deletePlayer,
  renamePlayer,
  upsertLeaderboard,
  resetAll,
  close,
};
