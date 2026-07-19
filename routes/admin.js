"use strict";

const profiles = require("../lib/profiles");
const { sendJson, getRequestOrigin } = require("../lib/utils");

function superAdminNames() {
  return (process.env.ADMIN_USERNAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function readJsonBody(req) {
  let body = "";
  req.on("data", (c) => (body += c));
  await new Promise((r) => req.on("end", r));
  return JSON.parse(body);
}

// Именно "/admin/" со слэшем — иначе сюда же попадает и статика /admin.html,
// не находит подходящий под-роут и улетает в 404 в конце блока.
async function handle(req, res, url, ctx) {
  if (!url.pathname.startsWith("/admin/")) return false;

  const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
  const adminOk = session && await ctx.db.isAdmin(session.player_name).catch(() => false);
  if (!adminOk) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden" }));
    return true;
  }

  if (url.pathname === "/admin/players" && req.method === "GET") {
    const rows = await ctx.db.getAdminPlayerList();
    sendJson(res, rows.map((p) => ({
      name: p.name,
      coins: p.coins, isAdmin: p.is_admin,
      bestScore: p.best_score || 0,
      games: p.stats?.games || 0,
      deaths: p.stats?.deaths || 0,
      updatedAt: p.updated_at,
    })));
    return true;
  }

  // Разовая ссылка восстановления доступа для старых (Google-эпохи) аккаунтов
  // без пароля. Выдавать только после ручной проверки, что обратился реальный
  // владелец ника (скриншот профиля, совпадающая статистика и т.п.).
  if (url.pathname === "/admin/create_claim_link" && req.method === "POST") {
    const { name } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    const target = await ctx.db.findPlayerByName(name).catch(() => null);
    if (!target) { res.writeHead(404); res.end("player not found"); return true; }
    const { token, expiresAt } = await ctx.db.createClaimToken(target.name, session.player_name);
    await ctx.db.logAdminAction(session.player_name, "create_claim_link", target.name, null);
    const base = getRequestOrigin(req, ctx.PORT).http.replace(/\/$/, "");
    sendJson(res, { ok: true, token, url: `${base}/profile.html?claim=${token}`, expiresAt });
    return true;
  }

  if (url.pathname === "/admin/set_admin" && req.method === "POST") {
    const { name, value } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.setAdmin(name, Boolean(value));
    await ctx.db.logAdminAction(session.player_name, value ? "grant_admin" : "revoke_admin", name, null);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/admin/delete_player" && req.method === "POST") {
    const { name } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    if (superAdminNames().includes(name.toLowerCase())) {
      res.writeHead(403); res.end("cannot delete superadmin"); return true;
    }
    await ctx.db.deletePlayer(name);
    await ctx.db.logAdminAction(session.player_name, "delete_player", name, null);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/admin/set_coins" && req.method === "POST") {
    const { name, coins } = await readJsonBody(req);
    if (!name || coins === undefined) { res.writeHead(400); res.end("bad request"); return true; }
    const entry = profiles.getProfile(ctx, name);
    entry.coins = Math.max(0, Math.floor(Number(coins)));
    await profiles.persistProfile(ctx, name, entry);
    await ctx.db.logAdminAction(session.player_name, "set_coins", name, String(entry.coins));
    sendJson(res, { ok: true, coins: entry.coins });
    return true;
  }

  if (url.pathname === "/admin/avatar_reports" && req.method === "GET") {
    const reports = await ctx.db.loadAvatarReports();
    sendJson(res, reports.map((r) => ({
      target: r.target_name,
      reports: r.reports,
      lastReportedAt: r.last_reported_at,
      hasCustomAvatar: Boolean(profiles.getProfile(ctx, r.target_name).stats?.customAvatarUrl),
    })));
    return true;
  }

  if (url.pathname === "/admin/reset_avatar" && req.method === "POST") {
    const { name } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    const entry = profiles.getProfile(ctx, name);
    if (entry.stats.customAvatarUrl) ctx.removeAvatarFile(entry.stats.customAvatarUrl);
    entry.stats.customAvatarUrl = null;
    await profiles.persistProfile(ctx, name, entry);
    await ctx.db.clearAvatarReports(name);
    await ctx.db.logAdminAction(session.player_name, "reset_avatar", name, null);
    sendJson(res, { ok: true });
    return true;
  }

  // Мгновенно вышибает все активные сокеты игрока (все открытые вкладки),
  // без ban — игрок сможет зайти обратно сразу же. closeSocket() (не голый
  // removeClient()) — иначе TCP-соединение останется висеть и клиент сможет
  // продолжать слать сообщения с чистого rate-limit бюджетом.
  if (url.pathname === "/admin/kick" && req.method === "POST") {
    const { name, reason } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    const ids = profiles.findSocketIdsByName(ctx, name);
    for (const socketId of ids) {
      ctx.send(socketId, { type: "notice", text: reason ? `Вы отключены администратором: ${reason}` : "Вы отключены администратором." });
      ctx.closeSocket(socketId);
    }
    await ctx.db.logAdminAction(session.player_name, "kick", name, reason || null);
    sendJson(res, { ok: true, kicked: ids.length });
    return true;
  }

  // minutes не передан/пусто → перманентный бан.
  if (url.pathname === "/admin/ban" && req.method === "POST") {
    const { name, minutes, reason } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    if (superAdminNames().includes(name.toLowerCase())) {
      res.writeHead(403); res.end("cannot ban superadmin"); return true;
    }
    const mins = (minutes === undefined || minutes === null || minutes === "")
      ? null
      : Math.max(1, Math.floor(Number(minutes)));
    await ctx.db.banPlayer(name, mins, reason || null, session.player_name);
    const ids = profiles.findSocketIdsByName(ctx, name);
    for (const socketId of ids) {
      ctx.send(socketId, { type: "notice", text: reason ? `Вы забанены: ${reason}` : "Вы забанены администратором." });
      ctx.closeSocket(socketId);
    }
    await ctx.db.logAdminAction(session.player_name, "ban", name, reason || (mins ? `${mins} мин` : "навсегда"));
    sendJson(res, { ok: true, kicked: ids.length, permanent: mins === null });
    return true;
  }

  if (url.pathname === "/admin/unban" && req.method === "POST") {
    const { name } = await readJsonBody(req);
    if (!name) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.unbanPlayer(name);
    await ctx.db.logAdminAction(session.player_name, "unban", name, null);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/admin/bans" && req.method === "GET") {
    const bans = await ctx.db.listActiveBans();
    sendJson(res, bans.map((b) => ({
      name: b.name,
      bannedUntil: b.banned_until,
      reason: b.reason,
      bannedBy: b.banned_by,
      createdAt: b.created_at,
    })));
    return true;
  }

  if (url.pathname === "/admin/actions" && req.method === "GET") {
    const actions = await ctx.db.getAdminActions(200);
    sendJson(res, actions.map((a) => ({
      adminName: a.admin_name,
      action: a.action,
      targetName: a.target_name,
      reason: a.reason,
      createdAt: a.created_at,
    })));
    return true;
  }

  if (url.pathname === "/admin/me" && req.method === "GET") {
    sendJson(res, { name: session.player_name });
    return true;
  }

  res.writeHead(404); res.end("not found");
  return true;
}

module.exports = { handle };
