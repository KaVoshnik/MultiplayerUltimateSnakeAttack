const crypto = require("crypto");

const SESSION_COOKIE = "snake_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const pendingStates = new Map();

function getGoogleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    sessionSecret: process.env.SESSION_SECRET || "",
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
    redirectUri: (process.env.GOOGLE_REDIRECT_URI || "").replace(/\/$/, ""),
  };
}

function resolveRedirectUri(req, ctx) {
  const cfg = getGoogleConfig();
  if (cfg.redirectUri) return cfg.redirectUri;
  if (cfg.publicUrl) return `${cfg.publicUrl}/auth/google/callback`;
  const origin = ctx.getRequestOrigin(req).http.replace(/\/$/, "");
  return `${origin}/auth/google/callback`;
}

function isGoogleAuthEnabled() {
  const { clientId, clientSecret, sessionSecret } = getGoogleConfig();
  return Boolean(clientId && clientSecret && sessionSecret);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

function isSecureRequest(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return proto === "https";
}

function setSessionCookie(res, token, req) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function createState() {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

function consumeState(state) {
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  if (!expires || expires < Date.now()) return false;
  return true;
}

function cleanupStates() {
  const now = Date.now();
  for (const [state, expires] of pendingStates) {
    if (expires < now) pendingStates.delete(state);
  }
}

async function getSession(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  return db.getAuthSession(token);
}

async function ensureGooglePlayer(ctx, googleUser) {
  const existing = await ctx.db.findGoogleUser(googleUser.sub);
  if (existing) return existing.player_name;

  const base = ctx.cleanName(googleUser.name || googleUser.email?.split("@")[0] || "Snake");
  let playerName = base;
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : ctx.cleanName(`${base.slice(0, 12)}${i + 1}`);
    const taken = await ctx.db.findGoogleUserByPlayerName(candidate);
    if (!taken) {
      playerName = candidate;
      break;
    }
  }

  await ctx.db.linkGoogleUser({
    googleId: googleUser.sub,
    playerName,
    email: googleUser.email || "",
    displayName: googleUser.name || playerName,
    pictureUrl: googleUser.picture || "",
  });

  if (!ctx.shopData[playerName]) {
    const entry = ctx.defaultShopEntry();
    entry.stats = { ...(entry.stats || {}), googlePicture: googleUser.picture || null };
    ctx.shopData[playerName] = entry;
    await ctx.persistProfile(playerName, entry);
  } else if (googleUser.picture) {
    const entry = ctx.getProfile(playerName);
    entry.stats = { ...(entry.stats || {}), googlePicture: googleUser.picture };
    ctx.shopData[playerName] = entry;
    await ctx.persistProfile(playerName, entry);
  }

  return playerName;
}

async function exchangeCode(code, redirectUri) {
  const { clientId, clientSecret } = getGoogleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    throw new Error(tokens.error_description || tokens.error || "token_exchange_failed");
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const user = await userRes.json();
  if (!userRes.ok || !user.sub) {
    throw new Error("userinfo_failed");
  }
  return user;
}

async function handleRequest(req, res, url, ctx) {
  if (!isGoogleAuthEnabled()) {
    if (url.pathname === "/auth/config") {
      ctx.sendJson(res, { enabled: false });
      return true;
    }
    if (url.pathname.startsWith("/auth/")) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Google OAuth не настроен");
      return true;
    }
    return false;
  }

  const redirectUri = resolveRedirectUri(req, ctx);

  if (url.pathname === "/auth/config") {
    ctx.sendJson(res, { enabled: true, redirectUri });
    return true;
  }

  if (url.pathname === "/api/me") {
    const session = await getSession(req, ctx.db);
    if (!session) {
      ctx.sendJson(res, { loggedIn: false });
      return true;
    }
    const profile = ctx.getProfile(session.player_name);
    ctx.sendJson(res, {
      loggedIn: true,
      name: session.player_name,
      email: session.email,
      picture: profile.stats?.googlePicture || session.picture_url || null,
      shopData: profile,
    });
    return true;
  }

  if (url.pathname === "/auth/google" && req.method === "GET") {
    const state = createState();
    const params = new URLSearchParams({
      client_id: getGoogleConfig().clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    res.end();
    return true;
  }

  if (url.pathname === "/auth/google/callback" && req.method === "GET") {
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(error)}` });
      res.end();
      return true;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || !consumeState(state)) {
      res.writeHead(302, { Location: "/?auth_error=invalid_state" });
      res.end();
      return true;
    }

    try {
      const googleUser = await exchangeCode(code, redirectUri);
      const playerName = await ensureGooglePlayer(ctx, googleUser);
      const token = crypto.randomBytes(32).toString("hex");
      await ctx.db.createAuthSession(token, {
        googleId: googleUser.sub,
        playerName,
        email: googleUser.email || "",
        pictureUrl: googleUser.picture || "",
      });
      setSessionCookie(res, token, req);
      res.writeHead(302, { Location: "/?auth=ok" });
      res.end();
    } catch (err) {
      console.error("Google OAuth:", err.message);
      res.writeHead(302, { Location: "/?auth_error=oauth_failed" });
      res.end();
    }
    return true;
  }

  if (url.pathname === "/auth/logout" && (req.method === "GET" || req.method === "POST")) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) await ctx.db.deleteAuthSession(token);
    clearSessionCookie(res, req);
    res.writeHead(302, { Location: "/" });
    res.end();
    return true;
  }

  return false;
}

setInterval(cleanupStates, 5 * 60 * 1000);

module.exports = {
  isGoogleAuthEnabled,
  getSession,
  handleRequest,
  resolveRedirectUri,
};
