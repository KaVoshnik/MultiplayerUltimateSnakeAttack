"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const profiles = require("../lib/profiles");
const { sendJson, readBodyLimited } = require("../lib/utils");

// Определяем реальный тип файла по магическим байтам — клиент может соврать
// про content-type, но подделать первые байты валидного изображения смысла нет.
function sniffImageType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function removeAvatarFile(ctx, url) {
  if (!url || !url.startsWith("/avatars/")) return;
  const filePath = path.join(ctx.AVATARS_DIR, path.basename(url));
  fs.unlink(filePath, () => {}); // не критично, если файла уже нет
}

async function handle(req, res, url, ctx) {
  if (url.pathname === "/upload_avatar" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }

    let raw;
    try { raw = await readBodyLimited(req, Math.ceil(ctx.AVATAR_UPLOAD_MAX_BYTES * 1.4)); }
    catch { res.writeHead(413); res.end("payload too large"); return true; }

    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }

    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(body.dataUrl || ""));
    if (!match) { res.writeHead(400); res.end("expected a png/jpeg/webp data URL"); return true; }

    const declaredExt = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > ctx.AVATAR_UPLOAD_MAX_BYTES) {
      res.writeHead(413); res.end(`image must be under ${(ctx.AVATAR_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(1)} MB`); return true;
    }

    // Не доверяем заявленному MIME — сверяем с реальными байтами файла.
    const sniffedExt = sniffImageType(bytes);
    if (!sniffedExt || sniffedExt !== declaredExt) {
      res.writeHead(400); res.end("file content doesn't match declared image type"); return true;
    }

    const name = session.player_name;
    const entry = profiles.getProfile(ctx, name);
    const oldUrl = entry.stats.customAvatarUrl;
    const filename = `${crypto.randomUUID()}.${sniffedExt}`;
    await fs.promises.writeFile(path.join(ctx.AVATARS_DIR, filename), bytes);
    entry.stats.customAvatarUrl = `/avatars/${filename}`;
    await profiles.persistProfile(ctx, name, entry);
    if (oldUrl) removeAvatarFile(ctx, oldUrl); // подчищаем старый файл, чтобы не копился мусор на диске

    sendJson(res, { ok: true, customAvatarUrl: entry.stats.customAvatarUrl });
    return true;
  }

  if (url.pathname === "/remove_avatar" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }
    const entry = profiles.getProfile(ctx, session.player_name);
    if (entry.stats.customAvatarUrl) removeAvatarFile(ctx, entry.stats.customAvatarUrl);
    entry.stats.customAvatarUrl = null;
    await profiles.persistProfile(ctx, session.player_name, entry);
    sendJson(res, { ok: true });
    return true;
  }

  if (url.pathname === "/report_avatar" && req.method === "POST") {
    const session = await ctx.auth.getSession(req, ctx.db).catch(() => null);
    if (!session) { res.writeHead(401); res.end("unauthorized"); return true; }

    let raw;
    try { raw = await readBodyLimited(req, 2048); } catch { res.writeHead(413); res.end("payload too large"); return true; }

    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { res.writeHead(400); res.end("bad json"); return true; }

    const target = profiles.profileName(body.target);
    if (!target) { res.writeHead(400); res.end("bad request"); return true; }
    if (target.toLowerCase() === session.player_name.toLowerCase()) {
      res.writeHead(400); res.end("can't report yourself"); return true;
    }

    await ctx.db.reportAvatar(session.player_name, target);
    sendJson(res, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handle, removeAvatarFile, sniffImageType };
