function getWebSocketUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
}

function connectWebSocket(handlers = {}) {
  const socket = new WebSocket(getWebSocketUrl());
  socket.addEventListener("open", () => handlers.onOpen?.(socket));
  socket.addEventListener("close", () => {
    handlers.onClose?.();
    if (handlers.reconnect !== false) {
      setTimeout(() => connectWebSocket(handlers), handlers.reconnectMs || 1500);
    }
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    handlers.onMessage?.(msg, socket);
  });
  return socket;
}

const SnakeStore = {
  KEY: "snakeSettings",

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || sessionStorage.getItem(this.KEY) || "{}");
    } catch {
      return {};
    }
  },

  save(data) {
    const merged = { ...this.load(), ...data };
    localStorage.setItem(this.KEY, JSON.stringify(merged));
    sessionStorage.setItem(this.KEY, JSON.stringify(merged));
    if (merged.name) localStorage.setItem("snakeName", merged.name);
    return merged;
  },

  getName() {
    return this.load().name || localStorage.getItem("snakeName") || "";
  },
};

const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };
const RARITY_LABELS = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function showToast(text) {
  let wrap = document.querySelector(".toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toastWrap";
    document.body.append(wrap);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  wrap.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Отдельный, более заметный тост для разблокировки ачивки — держится дольше
// обычного и с иконкой.
function showAchievementToast(achievement) {
  let wrap = document.querySelector(".toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toastWrap";
    document.body.append(wrap);
  }
  const toast = document.createElement("div");
  toast.className = "toast achievementToast";
  toast.innerHTML = `
    <span class="achToastIcon">${achievement.icon || "🏆"}</span>
    <span class="achToastText">
      <strong>${I18N.t("common.achievementUnlocked")}</strong>
      <span>${escapeHtml(achievement.name)}</span>
    </span>
  `;
  wrap.append(toast);
  setTimeout(() => toast.remove(), 6000);
}

function markActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".siteNav .links a").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
}

function formatPlayTime(ms) {
  const sec = Math.floor((ms || 0) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return I18N.t("common.timeHM", { h, m });
  return I18N.t("common.timeMS", { m, s: sec % 60 });
}

function sortCatalog(items, sortBy, dir) {
  const list = [...items];
  const mult = dir === "desc" ? -1 : 1;
  list.sort((a, b) => {
    if (sortBy === "rarity") {
      return (RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]) * mult || a.price - b.price;
    }
    return (a.price - b.price) * mult || a.name.localeCompare(b.name, "ru");
  });
  return list;
}

function isItemEquipped(shopData, item) {
  if (!shopData || !item) return false;
  if (item.category === "skin") return shopData.activeSkin === item.id;
  if (item.category === "snake_hat") return shopData.equipped?.snakeHat === item.id;
  return false;
}

function ownsShopItem(shopData, item) {
  if (!item) return false;
  if (Number(item.price) === 0) return true;
  return (shopData?.inventory || []).includes(item.id);
}

function updateUserBar(shopData, name) {
  const avatarEl = document.querySelector("#userAvatar");
  const nameEl = document.querySelector("#userName");
  const coinsEl = document.querySelector("#headerCoins");
  const customUrl = shopData?.stats?.customAvatarUrl;
  if (avatarEl) {
    if (customUrl) {
      avatarEl.innerHTML = `<img src="${escapeHtml(customUrl)}" alt="" class="userAvatarImg" />`;
    } else {
      avatarEl.textContent = shopData?.avatar || "😎";
    }
  }
  if (nameEl) nameEl.textContent = name || SnakeStore.getName() || I18N.t("index.guest");
  if (coinsEl) coinsEl.textContent = shopData?.coins ?? 0;
}

async function syncSessionUser(options = {}) {
  let me = { loggedIn: false };
  try {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    me = await res.json();
  } catch { /* offline */ }

  if (me.loggedIn) {
    SnakeStore.save({
      name: me.name,
      loggedIn: true,
      playerId: me.playerId || me.shopData?.id || null,
    });
    updateUserBar(me.shopData || {}, me.name);
    options.onLogin?.(me);
  } else {
    updateUserBar(options.shopData || {}, SnakeStore.getName());
  }
  return me;
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

async function initProfileAuth(options = {}) {
  const accountGuest = document.querySelector("#accountGuest");
  const accountUser = document.querySelector("#accountUser");
  const authForm = document.querySelector("#authForm");
  const authNameInput = document.querySelector("#authName");
  const authPasswordInput = document.querySelector("#authPassword");
  const authError = document.querySelector("#authFormError");
  const btnRegister = document.querySelector("#btnRegister");
  const logoutBtn = document.querySelector("#btnLogout");

  const accountClaim = document.querySelector("#accountClaim");
  const claimForm = document.querySelector("#claimForm");
  const claimPasswordInput = document.querySelector("#claimPassword");
  const claimError = document.querySelector("#claimFormError");
  const claimToken = new URLSearchParams(location.search).get("claim");

  function showAuthError(text) {
    if (!authError) { showToast(text); return; }
    authError.textContent = text;
    authError.classList.remove("hidden");
  }

  async function applySession(me) {
    if (me.loggedIn) {
      SnakeStore.save({
        name: me.name,
        loggedIn: true,
        playerId: me.playerId || me.shopData?.id || null,
      });
      accountGuest?.classList.add("hidden");
      accountClaim?.classList.add("hidden");
      accountUser?.classList.remove("hidden");
      options.onLogin?.(me);
    } else if (claimToken) {
      accountGuest?.classList.add("hidden");
      accountClaim?.classList.remove("hidden");
      accountUser?.classList.add("hidden");
      options.onLogout?.();
    } else {
      accountGuest?.classList.remove("hidden");
      accountClaim?.classList.add("hidden");
      accountUser?.classList.add("hidden");
      options.onLogout?.();
    }
  }

  async function fetchMe() {
    let me = { loggedIn: false };
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      me = await res.json();
    } catch { /* ignore */ }
    return me;
  }

  async function doLogin() {
    const name = authNameInput?.value.trim();
    const password = authPasswordInput?.value || "";
    if (!name || !password) { showAuthError(I18N.t("auth.enterNameAndPassword")); return; }
    authError?.classList.add("hidden");
    const { ok, body } = await postJson("/auth/login", { name, password });
    if (!ok) { showAuthError(body.error || I18N.t("auth.loginFailed")); return; }
    await applySession(await fetchMe());
  }

  async function doRegister() {
    const name = authNameInput?.value.trim();
    const password = authPasswordInput?.value || "";
    if (!name || !password) { showAuthError(I18N.t("auth.enterNameAndPassword")); return; }
    authError?.classList.add("hidden");
    const { ok, body } = await postJson("/auth/register", { name, password });
    if (!ok) { showAuthError(body.error || I18N.t("auth.registerFailed")); return; }
    await applySession(await fetchMe());
  }

  async function doClaim() {
    const password = claimPasswordInput?.value || "";
    if (!password) { claimError?.classList.remove("hidden"); return; }
    claimError?.classList.add("hidden");
    const { ok, body } = await postJson("/auth/claim", { token: claimToken, password });
    if (!ok) {
      if (claimError) {
        claimError.textContent = body.error || I18N.t("auth.claimFailed");
        claimError.classList.remove("hidden");
      } else {
        showToast(body.error || I18N.t("auth.claimFailed"));
      }
      return;
    }
    history.replaceState({}, "", location.pathname);
    showToast(I18N.t("auth.claimSuccess"));
    await applySession(await fetchMe());
  }

  authForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin();
  });
  btnRegister?.addEventListener("click", doRegister);
  claimForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    doClaim();
  });

  logoutBtn?.addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => { });
    SnakeStore.save({ loggedIn: false });
    location.reload();
  });

  const me = await fetchMe();
  await applySession(me);
  return me;
}

/** @deprecated use initProfileAuth on profile page or syncSessionUser elsewhere */
async function initAuth(options = {}) {
  return syncSessionUser(options);
}

function connectProfileSocket(onMessage) {
  const socket = new WebSocket(getWebSocketUrl());
  let clientId = null;

  socket.addEventListener("open", () => {
    const name = SnakeStore.getName();
    if (name) socket.send(JSON.stringify({ type: "shop_connect", name }));
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "hello") clientId = msg.id;
    if (msg.type === "hello" && SnakeStore.getName()) {
      socket.send(JSON.stringify({ type: "shop_connect", name: SnakeStore.getName() }));
    }
    onMessage?.(msg, socket);
  });

  socket.addEventListener("close", () => setTimeout(() => connectProfileSocket(onMessage), 1500));
  return () => socket;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", markActiveNav);
} else {
  markActiveNav();
}
