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
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${sec % 60}с`;
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
  const picture = shopData?.stats?.googlePicture;
  if (avatarEl) {
    if (picture) {
      avatarEl.innerHTML = `<img src="${escapeHtml(picture)}" alt="" class="userAvatarImg" referrerpolicy="no-referrer" />`;
    } else {
      avatarEl.textContent = shopData?.avatar || "😎";
    }
  }
  if (nameEl) nameEl.textContent = name || SnakeStore.getName() || "Гость";
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
      google: true,
      playerId: me.playerId || me.shopData?.id || null,
    });
    updateUserBar(me.shopData || {}, me.name);
    options.onLogin?.(me);
  } else {
    updateUserBar(options.shopData || {}, SnakeStore.getName());
  }
  return me;
}

async function initProfileAuth(options = {}) {
  const loginBtn = document.querySelector("#btnGoogleLogin");
  const logoutBtn = document.querySelector("#btnGoogleLogout");
  const accountGuest = document.querySelector("#accountGuest");
  const accountUser = document.querySelector("#accountUser");

  let config = { enabled: false };
  try {
    const res = await fetch("/auth/config");
    config = await res.json();
  } catch { /* offline */ }

  if (!config.enabled) {
    accountGuest?.classList.add("hidden");
    showToast("Google OAuth не настроен на сервере");
    return { loggedIn: false };
  }

  let me = { loggedIn: false };
  try {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    me = await res.json();
  } catch { /* ignore */ }

  if (me.loggedIn) {
    SnakeStore.save({
      name: me.name,
      google: true,
      playerId: me.playerId || me.shopData?.id || null,
    });
    loginBtn?.classList.add("hidden");
    accountGuest?.classList.add("hidden");
    accountUser?.classList.remove("hidden");
    options.onLogin?.(me);
  } else {
    loginBtn?.classList.remove("hidden");
    accountGuest?.classList.remove("hidden");
    accountUser?.classList.add("hidden");
    options.onLogout?.();
  }

  logoutBtn?.addEventListener("click", () => {
    location.href = "/auth/logout";
  });

  handleAuthQueryParams();
  return me;
}

function handleAuthQueryParams() {
  const params = new URLSearchParams(location.search);
  if (params.get("auth") === "ok") {
    showToast("Вход через Google выполнен!");
    history.replaceState({}, "", location.pathname);
  }
  if (params.get("auth_error")) {
    showToast("Не удалось войти через Google");
    history.replaceState({}, "", location.pathname);
  }
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
