const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, ".env") });

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.PGUSER || "snake";
  const password = encodeURIComponent(process.env.PGPASSWORD || "snake");
  const host = process.env.PGHOST || "127.0.0.1";
  const port = process.env.PGPORT || "5432";
  const database = process.env.PGDATABASE || "snake_attack";
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

let pool;

async function migratePlayersTable() {
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS google_id VARCHAR(128)`);
  await pool.query(`UPDATE players SET id = gen_random_uuid() WHERE id IS NULL`);

  const { rows: pkRows } = await pool.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'players'::regclass AND i.indisprimary
  `);
  if (pkRows[0]?.attname === "name") {
    await pool.query(`ALTER TABLE players DROP CONSTRAINT players_pkey`);
    await pool.query(`ALTER TABLE players ADD PRIMARY KEY (id)`);
  }

  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS players_google_id_key
    ON players (google_id) WHERE google_id IS NOT NULL
  `);

  await pool.query(`
    UPDATE players p
    SET google_id = g.google_id
    FROM google_users g
    WHERE p.google_id IS NULL AND LOWER(p.name) = LOWER(g.player_name)
  `);
}

async function migrateLeaderboardTable() {
  // Система сложностей убрана — колонка больше не нужна.
  // DROP COLUMN трогает только её; остальные колонки и все строки
  // (name, score, recorded_at) остаются нетронутыми.
  await pool.query(`ALTER TABLE leaderboard DROP COLUMN IF EXISTS difficulty`);
}

async function init() {
  pool = new Pool({ connectionString: getDatabaseUrl() });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id VARCHAR(128),
      name VARCHAR(32) NOT NULL,
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
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard (score DESC);

    CREATE TABLE IF NOT EXISTS google_users (
      google_id VARCHAR(128) PRIMARY KEY,
      player_name VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255),
      display_name VARCHAR(64),
      picture_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(64) PRIMARY KEY,
      google_id VARCHAR(128) NOT NULL,
      player_name VARCHAR(32) NOT NULL,
      email VARCHAR(255),
      picture_url TEXT,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at);
  `);

  await migratePlayersTable();
  await migrateLeaderboardTable();
}

async function findGoogleUser(googleId) {
  const { rows } = await pool.query(
    "SELECT google_id, player_name, email, display_name, picture_url FROM google_users WHERE google_id = $1",
    [googleId],
  );
  return rows[0] || null;
}

async function findGoogleUserByPlayerName(playerName) {
  const { rows } = await pool.query(
    "SELECT google_id, player_name FROM google_users WHERE LOWER(player_name) = LOWER($1) LIMIT 1",
    [playerName],
  );
  return rows[0] || null;
}

async function findPlayerByGoogleId(googleId) {
  const { rows } = await pool.query(
    "SELECT * FROM players WHERE google_id = $1 LIMIT 1",
    [googleId],
  );
  return rows[0] || null;
}

async function findPlayerById(playerId) {
  const { rows } = await pool.query(
    "SELECT * FROM players WHERE id = $1 LIMIT 1",
    [playerId],
  );
  return rows[0] || null;
}

async function isPlayerNameTaken(playerName, exceptName = null) {
  const lower = String(playerName || "").toLowerCase();
  if (!lower) return true;
  if (exceptName && exceptName.toLowerCase() === lower) return false;

  const { rows } = await pool.query(
    "SELECT name FROM players WHERE name_lower = $1 LIMIT 1",
    [lower],
  );
  if (rows.length) return true;

  const { rows: googleRows } = await pool.query(
    "SELECT player_name FROM google_users WHERE LOWER(player_name) = $1 LIMIT 1",
    [lower],
  );
  return googleRows.length > 0;
}

async function updateGoogleUserPlayerName(googleId, newName) {
  await pool.query(
    "UPDATE google_users SET player_name = $1 WHERE google_id = $2",
    [newName, googleId],
  );
  await pool.query(
    "UPDATE auth_sessions SET player_name = $1 WHERE google_id = $2",
    [newName, googleId],
  );
}

async function linkGoogleUser({ googleId, playerName, email, displayName, pictureUrl }) {
  await pool.query(
    `INSERT INTO google_users (google_id, player_name, email, display_name, picture_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (google_id) DO UPDATE SET
       player_name = EXCLUDED.player_name,
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       picture_url = EXCLUDED.picture_url`,
    [googleId, playerName, email || null, displayName || playerName, pictureUrl || null],
  );
}

async function createAuthSession(token, { googleId, playerName, email, pictureUrl }) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_sessions (token, google_id, player_name, email, picture_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, googleId, playerName, email || null, pictureUrl || null, expiresAt],
  );
  return { token, player_name: playerName, email, picture_url: pictureUrl, expires_at: expiresAt };
}

async function getAuthSession(token) {
  const { rows } = await pool.query(
    `SELECT token, google_id, player_name, email, picture_url, expires_at
     FROM auth_sessions WHERE token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query("DELETE FROM auth_sessions WHERE token = $1", [token]);
    return null;
  }
  return row;
}

async function deleteAuthSession(token) {
  await pool.query("DELETE FROM auth_sessions WHERE token = $1", [token]);
}

async function cleanupAuthSessions() {
  await pool.query("DELETE FROM auth_sessions WHERE expires_at < NOW()");
}

function rowToRawProfile(row) {
  return {
    id: row.id,
    googleId: row.google_id || null,
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
    `SELECT name, score, recorded_at
     FROM leaderboard
     ORDER BY score DESC, name ASC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    name: row.name,
    score: row.score,
    date: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
  }));
}

async function upsertPlayer(name, entry) {
  const playerId = entry.id || crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO players (id, google_id, name, name_lower, coins, active_skin, avatar, snake_hat, inventory, stats, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (name_lower) DO UPDATE SET
       google_id = COALESCE(EXCLUDED.google_id, players.google_id),
       name = EXCLUDED.name,
       coins = EXCLUDED.coins,
       active_skin = EXCLUDED.active_skin,
       avatar = EXCLUDED.avatar,
       snake_hat = EXCLUDED.snake_hat,
       inventory = EXCLUDED.inventory,
       stats = EXCLUDED.stats,
       updated_at = NOW()
     RETURNING id`,
    [
      playerId,
      entry.googleId || null,
      name,
      name.toLowerCase(),
      Number(entry.coins) || 0,
      entry.activeSkin || "default",
      entry.avatar || "😎",
      entry.equipped?.snakeHat || null,
      JSON.stringify(entry.inventory || ["default"]),
      JSON.stringify(entry.stats || {}),
    ],
  );
  return rows[0]?.id || playerId;
}

async function deletePlayer(name) {
  await pool.query("DELETE FROM players WHERE name_lower = $1", [name.toLowerCase()]);
}

async function renamePlayer(oldName, newName, entry) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const playerId = entry.id;
    if (!playerId) throw new Error("rename_missing_player_id");

    await client.query(
      `UPDATE players
       SET name = $1, name_lower = $2, coins = $3, active_skin = $4, avatar = $5,
           snake_hat = $6, inventory = $7, stats = $8, google_id = COALESCE($9, google_id), updated_at = NOW()
       WHERE id = $10::uuid`,
      [
        newName,
        newName.toLowerCase(),
        Number(entry.coins) || 0,
        entry.activeSkin || "default",
        entry.avatar || "😎",
        entry.equipped?.snakeHat || null,
        JSON.stringify(entry.inventory || ["default"]),
        JSON.stringify(entry.stats || {}),
        entry.googleId || null,
        playerId,
      ],
    );
    await client.query(
      `UPDATE leaderboard SET name = $1, name_lower = $2 WHERE name_lower = $3`,
      [newName, newName.toLowerCase(), oldName.toLowerCase()],
    );
    await client.query(
      "UPDATE google_users SET player_name = $1 WHERE LOWER(player_name) = LOWER($2)",
      [newName, oldName],
    );
    await client.query(
      "UPDATE auth_sessions SET player_name = $1 WHERE LOWER(player_name) = LOWER($2)",
      [newName, oldName],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertLeaderboard(name, score) {
  await pool.query(
    `INSERT INTO leaderboard (name, name_lower, score, recorded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name_lower) DO UPDATE SET
       name = EXCLUDED.name,
       score = GREATEST(leaderboard.score, EXCLUDED.score),
       recorded_at = CASE WHEN EXCLUDED.score > leaderboard.score THEN NOW() ELSE leaderboard.recorded_at END`,
    [name, name.toLowerCase(), score],
  );
}

async function resetAll() {
  await pool.query("TRUNCATE players, leaderboard, google_users, auth_sessions RESTART IDENTITY");
}

async function isAdmin(googleId) {
  if (!googleId) return false;
  const superIds = (process.env.ADMIN_GOOGLE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (superIds.includes(googleId)) return true;
  const { rows } = await pool.query(
    "SELECT is_admin FROM players WHERE google_id = $1 LIMIT 1",
    [googleId]
  );
  return rows[0]?.is_admin === true;
}

async function setAdmin(playerName, value) {
  await pool.query(
    "UPDATE players SET is_admin = $1 WHERE name_lower = $2",
    [value, playerName.toLowerCase()]
  );
}

async function getAdminPlayerList() {
  const { rows } = await pool.query(`
    SELECT p.name, p.google_id, p.coins, p.is_admin, p.stats,
           p.updated_at, l.score AS best_score
    FROM players p
    LEFT JOIN leaderboard l ON l.name = p.name
    ORDER BY p.updated_at DESC
  `);
  return rows;
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
  isAdmin,
  setAdmin,
  getAdminPlayerList,
  findGoogleUser,
  findGoogleUserByPlayerName,
  findPlayerByGoogleId,
  findPlayerById,
  isPlayerNameTaken,
  updateGoogleUserPlayerName,
  linkGoogleUser,
  createAuthSession,
  getAuthSession,
  deleteAuthSession,
  cleanupAuthSessions,
};
