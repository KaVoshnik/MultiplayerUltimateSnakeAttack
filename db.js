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

// Разово переносит players.id с UUID на обычный SERIAL (простой числовой id).
// Если колонка уже не UUID — секция ничего не делает.
async function migrateIdToSerial() {
  const { rows } = await pool.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'id'
  `);
  if (rows[0]?.data_type !== "uuid") return;

  await pool.query(`ALTER TABLE players DROP CONSTRAINT IF EXISTS players_pkey`);
  await pool.query(`ALTER TABLE players ADD COLUMN new_id SERIAL`);
  await pool.query(`ALTER TABLE players ADD PRIMARY KEY (new_id)`);
  await pool.query(`ALTER TABLE players DROP COLUMN id`);
  await pool.query(`ALTER TABLE players RENAME COLUMN new_id TO id`);
}

async function migratePlayersTable() {
  await migrateIdToSerial();

  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);

  // Наследие старой Google-авторизации — больше не используется.
  await pool.query(`DROP INDEX IF EXISTS players_google_id_key`);
  await pool.query(`ALTER TABLE players DROP COLUMN IF EXISTS google_id`);
  await pool.query(`DROP TABLE IF EXISTS google_users`);

  await pool.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS google_id`);
  await pool.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS email`);
  await pool.query(`ALTER TABLE auth_sessions DROP COLUMN IF EXISTS picture_url`);
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
      id SERIAL PRIMARY KEY,
      name VARCHAR(32) NOT NULL,
      name_lower VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
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

    -- Локальные сессии логин/пароль (без внешних провайдеров).
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(64) PRIMARY KEY,
      player_name VARCHAR(32) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at);

    -- Одноразовые ссылки для восстановления доступа к старым аккаунтам
    -- (созданным раньше через Google, у которых нет пароля). Выдаются вручную
    -- админом после проверки владельца — без email/внешних сервисов.
    CREATE TABLE IF NOT EXISTS claim_tokens (
      token VARCHAR(64) PRIMARY KEY,
      player_name VARCHAR(32) NOT NULL,
      created_by VARCHAR(32),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_claim_tokens_expires ON claim_tokens (expires_at);

    CREATE TABLE IF NOT EXISTS avatar_reports (
      id SERIAL PRIMARY KEY,
      reporter_name VARCHAR(32) NOT NULL,
      target_name VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (reporter_name, target_name)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      requester_name VARCHAR(32) NOT NULL,
      target_name VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      UNIQUE (requester_name, target_name)
    );

    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships (requester_name);
    CREATE INDEX IF NOT EXISTS idx_friendships_target ON friendships (target_name);

    CREATE TABLE IF NOT EXISTS bans (
      name_lower VARCHAR(32) PRIMARY KEY,
      name VARCHAR(32) NOT NULL,
      banned_until TIMESTAMPTZ,
      reason TEXT,
      banned_by VARCHAR(32),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_actions (
      id SERIAL PRIMARY KEY,
      admin_name VARCHAR(32) NOT NULL,
      action VARCHAR(32) NOT NULL,
      target_name VARCHAR(32) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC);

    CREATE TABLE IF NOT EXISTS food_listings (
      id UUID PRIMARY KEY,
      seller_name VARCHAR(32) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      quantity INTEGER NOT NULL,
      price_per_unit INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_food_listings_seller ON food_listings (seller_name);
  `);

  await migratePlayersTable();
  await migrateLeaderboardTable();
}

// ---- Локальные аккаунты (логин/пароль) ----

async function findPlayerByName(playerName) {
  const { rows } = await pool.query(
    "SELECT * FROM players WHERE name_lower = $1 LIMIT 1",
    [String(playerName || "").toLowerCase()],
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
  return rows.length > 0;
}

// Создаёт новый локальный аккаунт с логином+паролем (passwordHash уже хеширован).
async function createPlayerAccount(playerName, passwordHash) {
  const { rows } = await pool.query(
    `INSERT INTO players (name, name_lower, password_hash, coins, active_skin, avatar, inventory, stats)
     VALUES ($1, $2, $3, 0, 'default', '😎', '["default"]'::jsonb, '{}'::jsonb)
     RETURNING *`,
    [playerName, playerName.toLowerCase(), passwordHash],
  );
  return rows[0];
}

async function setPlayerPassword(playerName, passwordHash) {
  await pool.query(
    "UPDATE players SET password_hash = $1 WHERE name_lower = $2",
    [passwordHash, playerName.toLowerCase()],
  );
}

async function createAuthSession(token, playerName) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_sessions (token, player_name, expires_at) VALUES ($1, $2, $3)`,
    [token, playerName, expiresAt],
  );
  return { token, player_name: playerName, expires_at: expiresAt };
}

async function getAuthSession(token) {
  const { rows } = await pool.query(
    `SELECT token, player_name, expires_at FROM auth_sessions WHERE token = $1`,
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

// ---- Claim-токены: разовое восстановление доступа к старым (Google-эпохи)
// аккаунтам без пароля. Выдаёт админ вручную, после проверки владельца. ----

async function createClaimToken(playerName, adminName, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO claim_tokens (token, player_name, created_by, expires_at) VALUES ($1, $2, $3, $4)`,
    [token, playerName, adminName || null, expiresAt],
  );
  return { token, expiresAt };
}

async function consumeClaimToken(token) {
  const { rows } = await pool.query("SELECT * FROM claim_tokens WHERE token = $1", [token]);
  const row = rows[0];
  if (!row) return null;
  await pool.query("DELETE FROM claim_tokens WHERE token = $1", [token]);
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.player_name;
}

async function cleanupClaimTokens() {
  await pool.query("DELETE FROM claim_tokens WHERE expires_at < NOW()");
}

function rowToRawProfile(row) {
  return {
    id: row.id,
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
  const { rows } = await pool.query(
    `INSERT INTO players (name, name_lower, coins, active_skin, avatar, snake_hat, inventory, stats, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (name_lower) DO UPDATE SET
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
  return rows[0]?.id;
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
           snake_hat = $6, inventory = $7, stats = $8, updated_at = NOW()
       WHERE id = $9`,
      [
        newName,
        newName.toLowerCase(),
        Number(entry.coins) || 0,
        entry.activeSkin || "default",
        entry.avatar || "😎",
        entry.equipped?.snakeHat || null,
        JSON.stringify(entry.inventory || ["default"]),
        JSON.stringify(entry.stats || {}),
        playerId,
      ],
    );
    await client.query(
      `UPDATE leaderboard SET name = $1, name_lower = $2 WHERE name_lower = $3`,
      [newName, newName.toLowerCase(), oldName.toLowerCase()],
    );
    await client.query(
      "UPDATE auth_sessions SET player_name = $1 WHERE LOWER(player_name) = LOWER($2)",
      [newName, oldName],
    );
    await client.query(
      "UPDATE friendships SET requester_name = $1 WHERE LOWER(requester_name) = LOWER($2)",
      [newName, oldName],
    );
    await client.query(
      "UPDATE friendships SET target_name = $1 WHERE LOWER(target_name) = LOWER($2)",
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
  await pool.query("TRUNCATE players, leaderboard, auth_sessions, claim_tokens, avatar_reports, friendships, bans, admin_actions, food_listings RESTART IDENTITY");
}

async function isAdmin(playerName) {
  if (!playerName) return false;
  const superNames = (process.env.ADMIN_USERNAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (superNames.includes(playerName.toLowerCase())) return true;
  const { rows } = await pool.query(
    "SELECT is_admin FROM players WHERE name_lower = $1 LIMIT 1",
    [playerName.toLowerCase()]
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
    SELECT p.name, p.coins, p.is_admin, p.stats,
           p.updated_at, l.score AS best_score
    FROM players p
    LEFT JOIN leaderboard l ON l.name = p.name
    ORDER BY p.updated_at DESC
  `);
  return rows;
}

// minutes === null означает перманентный бан (banned_until остаётся NULL).
async function banPlayer(name, minutes, reason, adminName) {
  const bannedUntil = minutes ? new Date(Date.now() + minutes * 60_000) : null;
  await pool.query(
    `INSERT INTO bans (name_lower, name, banned_until, reason, banned_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name_lower) DO UPDATE
       SET name = $2, banned_until = $3, reason = $4, banned_by = $5, created_at = NOW()`,
    [name.toLowerCase(), name, bannedUntil, reason || null, adminName],
  );
}

async function unbanPlayer(name) {
  await pool.query("DELETE FROM bans WHERE name_lower = $1", [name.toLowerCase()]);
}

// Возвращает активный бан (ещё не истёкший или перманентный) либо null.
async function getActiveBan(name) {
  const { rows } = await pool.query(
    `SELECT * FROM bans WHERE name_lower = $1 AND (banned_until IS NULL OR banned_until > NOW()) LIMIT 1`,
    [name.toLowerCase()],
  );
  return rows[0] || null;
}

async function listActiveBans() {
  const { rows } = await pool.query(
    `SELECT * FROM bans WHERE banned_until IS NULL OR banned_until > NOW() ORDER BY created_at DESC`,
  );
  return rows;
}

async function logAdminAction(adminName, action, targetName, reason) {
  await pool.query(
    `INSERT INTO admin_actions (admin_name, action, target_name, reason) VALUES ($1, $2, $3, $4)`,
    [adminName, action, targetName, reason || null],
  );
}

async function getAdminActions(limit = 200) {
  const { rows } = await pool.query(
    `SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

// ---- Рынок обмена едой ----
// Источник правды во время работы сервера — in-memory Map в server.js (как и
// leaderboard); эти функции только персистят его на диск, чтобы лоты
// переживали рестарт. ID генерируется на сервере (crypto.randomUUID())
// синхронно, до похода в БД — поэтому запись сюда всегда fire-and-forget,
// без ожидания перед тем как показать лот другим игрокам.

async function loadFoodListings() {
  const { rows } = await pool.query("SELECT * FROM food_listings ORDER BY created_at ASC");
  return rows;
}

async function upsertFoodListing(listing) {
  await pool.query(
    `INSERT INTO food_listings (id, seller_name, kind, quantity, price_per_unit, created_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [listing.id, listing.sellerName, listing.kind, listing.quantity, listing.pricePerUnit, listing.createdAt],
  );
}

async function deleteFoodListing(id) {
  await pool.query("DELETE FROM food_listings WHERE id = $1::uuid", [id]);
}

// Один жалобщик — одна жалоба на цель (ON CONFLICT игнорируем повторную).
async function reportAvatar(reporterName, targetName) {
  await pool.query(
    `INSERT INTO avatar_reports (reporter_name, target_name)
     VALUES ($1, $2)
     ON CONFLICT (reporter_name, target_name) DO NOTHING`,
    [reporterName, targetName],
  );
}

async function loadAvatarReports() {
  const { rows } = await pool.query(`
    SELECT target_name, COUNT(*)::int AS reports, MAX(created_at) AS last_reported_at
    FROM avatar_reports
    GROUP BY target_name
    ORDER BY reports DESC, last_reported_at DESC
  `);
  return rows;
}

async function clearAvatarReports(targetName) {
  await pool.query("DELETE FROM avatar_reports WHERE target_name = $1", [targetName]);
}

// ---- FRIENDS ----

// Если у B уже есть входящий реквест от A — вместо второй pending-строки
// сразу принимаем существующую (взаимный запрос = дружба).
async function sendFriendRequest(fromName, toName) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: reverse } = await client.query(
      `SELECT id FROM friendships
       WHERE requester_name = $1 AND target_name = $2 AND status = 'pending'`,
      [toName, fromName],
    );
    if (reverse.length > 0) {
      await client.query(
        `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
        [reverse[0].id],
      );
      await client.query("COMMIT");
      return "accepted";
    }
    await client.query(
      `INSERT INTO friendships (requester_name, target_name, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (requester_name, target_name) DO NOTHING`,
      [fromName, toName],
    );
    await client.query("COMMIT");
    return "requested";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function respondFriendRequest(targetName, requesterName, accept) {
  if (accept) {
    await pool.query(
      `UPDATE friendships SET status = 'accepted', responded_at = NOW()
       WHERE requester_name = $1 AND target_name = $2 AND status = 'pending'`,
      [requesterName, targetName],
    );
  } else {
    await pool.query(
      `DELETE FROM friendships WHERE requester_name = $1 AND target_name = $2 AND status = 'pending'`,
      [requesterName, targetName],
    );
  }
}

async function cancelFriendRequest(requesterName, targetName) {
  await pool.query(
    `DELETE FROM friendships WHERE requester_name = $1 AND target_name = $2 AND status = 'pending'`,
    [requesterName, targetName],
  );
}

async function removeFriend(nameA, nameB) {
  await pool.query(
    `DELETE FROM friendships WHERE status = 'accepted'
     AND ((requester_name = $1 AND target_name = $2) OR (requester_name = $2 AND target_name = $1))`,
    [nameA, nameB],
  );
}

// 'friends' | 'outgoing' (я отправил, жду) | 'incoming' (мне прислали) | 'none'
async function getFriendshipStatus(nameA, nameB) {
  const { rows } = await pool.query(
    `SELECT requester_name, status FROM friendships
     WHERE (requester_name = $1 AND target_name = $2) OR (requester_name = $2 AND target_name = $1)
     LIMIT 1`,
    [nameA, nameB],
  );
  if (rows.length === 0) return "none";
  if (rows[0].status === "accepted") return "friends";
  return rows[0].requester_name.toLowerCase() === nameA.toLowerCase() ? "outgoing" : "incoming";
}

async function listFriends(name) {
  const { rows } = await pool.query(
    `SELECT CASE WHEN LOWER(requester_name) = LOWER($1) THEN target_name ELSE requester_name END AS name,
            responded_at
     FROM friendships
     WHERE status = 'accepted' AND (LOWER(requester_name) = LOWER($1) OR LOWER(target_name) = LOWER($1))
     ORDER BY responded_at DESC NULLS LAST`,
    [name],
  );
  return rows;
}

async function listIncomingRequests(name) {
  const { rows } = await pool.query(
    `SELECT requester_name AS name, created_at
     FROM friendships WHERE status = 'pending' AND LOWER(target_name) = LOWER($1)
     ORDER BY created_at DESC`,
    [name],
  );
  return rows;
}

async function listOutgoingRequests(name) {
  const { rows } = await pool.query(
    `SELECT target_name AS name, created_at
     FROM friendships WHERE status = 'pending' AND LOWER(requester_name) = LOWER($1)
     ORDER BY created_at DESC`,
    [name],
  );
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
  banPlayer,
  unbanPlayer,
  getActiveBan,
  listActiveBans,
  logAdminAction,
  getAdminActions,
  loadFoodListings,
  upsertFoodListing,
  deleteFoodListing,
  reportAvatar,
  loadAvatarReports,
  clearAvatarReports,
  sendFriendRequest,
  respondFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getFriendshipStatus,
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  findPlayerByName,
  findPlayerById,
  isPlayerNameTaken,
  createPlayerAccount,
  setPlayerPassword,
  createAuthSession,
  getAuthSession,
  deleteAuthSession,
  cleanupAuthSessions,
  createClaimToken,
  consumeClaimToken,
  cleanupClaimTokens,
};
