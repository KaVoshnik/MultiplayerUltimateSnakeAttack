"use strict";

const profiles = require("../lib/profiles");
const { sendJson, readBodyLimited } = require("../lib/utils");

async function handle(req, res, url, ctx) {
  if (url.pathname === "/friends" && req.method === "GET") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    const me = session.player_name;

    const enrich = (row, extraDate) => {
      const prof = profiles.getProfile(ctx, row.name);
      const online = profiles.isPlayerOnline(ctx, row.name);
      return {
        name: row.name,
        avatar: prof.avatar,
        customAvatarUrl: prof.stats?.customAvatarUrl || null,
        best: prof.stats?.best || 0,
        streak: prof.stats?.streak || 0,
        online,
        room: online ? profiles.getPlayerRoomInfo(ctx, row.name) : null,
        since: extraDate ? row[extraDate] : undefined,
      };
    };

    const [friends, incoming, outgoing] = await Promise.all([
      ctx.db.listFriends(me), ctx.db.listIncomingRequests(me), ctx.db.listOutgoingRequests(me),
    ]);
    sendJson(res, {
      friends: friends.map((r) => enrich(r, "responded_at")).sort((a, b) => Number(b.online) - Number(a.online)),
      incoming: incoming.map((r) => enrich(r, "created_at")),
      outgoing: outgoing.map((r) => enrich(r, "created_at")),
    });
    return true;
  }

  if (url.pathname === "/friends/request" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }
    const target = profiles.findCanonicalName(ctx, profiles.profileName(body.target) || "");
    if (!target) { res.writeHead(400); res.end("player not found"); return true; }
    if (target.toLowerCase() === session.player_name.toLowerCase()) {
      res.writeHead(400); res.end("can't friend yourself"); return true;
    }
    const status = await ctx.db.sendFriendRequest(session.player_name, target);
    sendJson(res, { ok: true, status }); // "requested" | "accepted" (если запрос был встречным)
    return true;
  }

  if (url.pathname === "/friends/accept" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }
    const requester = profiles.profileName(body.name);
    if (!requester) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.respondFriendRequest(session.player_name, requester, true);
    for (const person of [session.player_name, requester]) {
      const friendsCount = await ctx.db.listFriends(person).then((r) => r.length).catch(() => 0);
      const entry = profiles.getProfile(ctx, person);
      profiles.checkAchievements(ctx, person, entry, { friendsCount }).catch((err) => console.error("Achievements:", err.message));
    }
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/friends/decline" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }
    const requester = profiles.profileName(body.name);
    if (!requester) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.respondFriendRequest(session.player_name, requester, false);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/friends/cancel" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }
    const target = profiles.profileName(body.name);
    if (!target) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.cancelFriendRequest(session.player_name, target);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/friends/remove" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }
    const target = profiles.profileName(body.name);
    if (!target) { res.writeHead(400); res.end("bad request"); return true; }
    await ctx.db.removeFriend(session.player_name, target);
    sendJson(res, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handle };
