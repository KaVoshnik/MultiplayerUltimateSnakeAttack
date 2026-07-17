const profileNameInput = document.querySelector("#profileName");
const avatarGrid = document.querySelector("#avatarGrid");
const equippedList = document.querySelector("#equippedList");
const previewCanvas = document.querySelector("#snakePreview");
const previewCtx = previewCanvas.getContext("2d");
const saveBtn = document.querySelector("#saveProfile");
const accountGuest = document.querySelector("#accountGuest");
const accountUser = document.querySelector("#accountUser");
const profileLoginHint = document.querySelector("#profileLoginHint");
const profileContent = document.querySelector("#profileContent");
const avatarUploadInput = document.querySelector("#avatarUploadInput");
const btnUploadAvatar = document.querySelector("#btnUploadAvatar");
const btnRemoveCustomAvatar = document.querySelector("#btnRemoveCustomAvatar");
const btnReportAvatar = document.querySelector("#btnReportAvatar");
const btnFriendAction = document.querySelector("#btnFriendAction");

const AVATAR_UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;

const state = {
  socket: null,
  shopData: null,
  catalog: [],
  avatars: [],
  selectedAvatar: "😎",
  oldName: "",
  loggedIn: false,
  wsAuthed: false,
  me: null,
  viewMode: false,
  reporterLoggedIn: false,
};

const viewPlayerName = new URLSearchParams(location.search).get("player")?.trim() || "";

function setProfileEditable(enabled) {
  profileNameInput.disabled = !enabled;
  saveBtn.disabled = !enabled;
  profileLoginHint?.classList.toggle("hidden", enabled);
  profileContent?.classList.toggle("profileLocked", !enabled);
  avatarGrid.querySelectorAll(".avatarBtn").forEach((btn) => {
    btn.disabled = !enabled;
  });
  if (avatarUploadInput) avatarUploadInput.disabled = !enabled;
  if (btnUploadAvatar) btnUploadAvatar.disabled = !enabled;
  if (btnRemoveCustomAvatar) btnRemoveCustomAvatar.disabled = !enabled;
}

// Показываем только от 2 дней подряд — на первый день это неотличимо от
// обычного захода и просто шумит рядом с именем.
function streakBadgeHtml(streak) {
  if (!streak || streak < 2) return "";
  return ` <span class="streakBadge" title="${I18N.t("profile.streakDays", { n: streak })}">🔥${streak}</span>`;
}

async function loadAchievements(name) {
  const grid = document.querySelector("#achievementsGrid");
  if (!grid || !name) return;
  try {
    const res = await fetch(`/achievements?name=${encodeURIComponent(name)}`);
    state.lastAchievements = await res.json();
    renderAchievements();
  } catch { /* тихо игнорируем — не критично для остального профиля */ }
}

function renderAchievements() {
  const grid = document.querySelector("#achievementsGrid");
  const countEl = document.querySelector("#achievementsCount");
  const list = state.lastAchievements;
  if (!grid || !list) return;
  grid.innerHTML = "";
  const unlockedCount = list.filter((a) => a.unlocked).length;
  if (countEl) countEl.textContent = `${unlockedCount}/${list.length}`;
  for (const ach of list) {
    const name = I18N.achName(ach.id, ach.name);
    const desc = I18N.achDesc(ach.id, ach.desc);
    const badge = document.createElement("div");
    badge.className = `achBadge${ach.unlocked ? "" : " locked"}`;
    badge.title = desc;
    badge.innerHTML = `
      <span class="achIcon">${ach.icon}</span>
      <span class="achName">${escapeHtml(name)}</span>
      <span class="achDesc">${escapeHtml(desc)}</span>
    `;
    grid.append(badge);
  }
}

// Приоритет: своя загруженная фотка > эмодзи-пресет.
function applyAvatarVisuals({ customAvatarUrl, avatar }) {
  const customImg = document.querySelector("#accountCustomAvatar");
  const emojiEl = document.querySelector("#accountAvatarEmoji");

  customImg?.classList.add("hidden");
  emojiEl?.classList.add("hidden");

  if (customAvatarUrl && customImg) {
    customImg.src = customAvatarUrl;
    customImg.classList.remove("hidden");
  } else if (emojiEl) {
    emojiEl.textContent = avatar || "😎";
    emojiEl.classList.remove("hidden");
  }

  if (btnRemoveCustomAvatar) btnRemoveCustomAvatar.classList.toggle("hidden", !customAvatarUrl);
}

function renderAccount(me) {
  if (me.loggedIn) {
    accountGuest?.classList.add("hidden");
    accountUser?.classList.remove("hidden");

    const displayName = document.querySelector("#accountDisplayName");

    if (displayName) displayName.innerHTML = `${escapeHtml(me.name)}${streakBadgeHtml(me.shopData?.stats?.streak)}`;

    applyAvatarVisuals({
      customAvatarUrl: me.shopData?.stats?.customAvatarUrl,
      avatar: me.shopData?.avatar,
    });

    state.oldName = me.name;
    profileNameInput.value = me.name;
    setProfileEditable(true);
    loadAchievements(me.name);
  } else {
    accountGuest?.classList.remove("hidden");
    accountUser?.classList.add("hidden");
    setProfileEditable(false);
    profileNameInput.value = "";
  }
}

function connect() {
  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    if (!state.viewMode && state.loggedIn && state.oldName) {
      socket.send(JSON.stringify({ type: "shop_connect", name: state.oldName }));
    }
  });

  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "auth_ready") {
      // На странице чужого публичного профиля свою сессию подхватывать нельзя —
      // иначе ник останется чужим, а данные подменятся своими (shop_update ниже).
      if (state.viewMode) return;
      state.wsAuthed = true;
      state.oldName = msg.name || state.oldName;
      socket.send(JSON.stringify({ type: "shop_connect", name: msg.name }));
      return;
    }
    if (msg.type === "hello") {
      state.avatars = msg.avatars || [];
      state.catalog = msg.catalog || [];
      renderAvatars();
      if (!state.viewMode && state.loggedIn && state.oldName) {
        socket.send(JSON.stringify({ type: "shop_connect", name: state.oldName }));
      }
    }
    if (msg.type === "shop_update") {
      // Тот же случай: пока смотрим чужой публичный профиль, свои shop_update
      // прилетать не должны (см. auth_ready выше), но подстрахуемся и здесь.
      if (state.viewMode) return;
      state.shopData = msg.shopData;
      if (state.loggedIn) state.wsAuthed = true;
      if (msg.catalog) state.catalog = msg.catalog;
      if (msg.avatars) state.avatars = msg.avatars;
      state.selectedAvatar = state.shopData.avatar || "😎";
      renderStats();
      renderEquipped();
      drawPreview();
      renderAvatars();
    }
    if (msg.type === "profile_saved") {
      if (msg.name) {
        state.oldName = msg.name;
        SnakeStore.save({ name: msg.name, loggedIn: true, playerId: msg.playerId || state.me?.playerId || null });
        profileNameInput.value = msg.name;
        const displayName = document.querySelector("#accountDisplayName");
        if (displayName) displayName.textContent = msg.name;
      }
      if (msg.shopData) {
        state.shopData = msg.shopData;
        renderStats();
        renderEquipped();
        drawPreview();
      }
      showToast(I18N.t("profile.savedToast"));
    }
    if (msg.type === "notice") {
      showToast(msg.text);
    }
    if (msg.type === "achievement_unlocked") {
      showAchievementToast(msg.achievement);
      SnakeAudio.play("achievement");
      if (!state.viewMode) loadAchievements(state.oldName);
    }
  });
}

function send(payload) {
  if (state.socket?.readyState !== WebSocket.OPEN) {
    showToast(I18N.t("profile.noConnection"));
    return false;
  }
  state.socket.send(JSON.stringify(payload));
  return true;
}

function renderAvatars() {
  avatarGrid.innerHTML = "";
  for (const emoji of state.avatars) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `avatarBtn${emoji === state.selectedAvatar ? " active" : ""}`;
    btn.textContent = emoji;
    btn.disabled = !state.loggedIn;
    btn.addEventListener("click", () => {
      if (!state.loggedIn) return;
      state.selectedAvatar = emoji;
      renderAvatars();
      drawPreview();
    });
    avatarGrid.append(btn);
  }
}

function renderStats() {
  const s = state.shopData?.stats || {};
  document.querySelector("#statGames").textContent = s.games || 0;
  document.querySelector("#statDeaths").textContent = s.deaths ?? s.losses ?? 0;
  document.querySelector("#statBest").textContent = s.best || 0;
  document.querySelector("#statTime").textContent = formatPlayTime(s.playTimeMs);
  document.querySelector("#statCoins").textContent = state.shopData?.coins || 0;
}

async function loadPublicProfile(name) {
  const res = await fetch(`/profile?name=${encodeURIComponent(name)}`);
  const data = await res.json();
  if (data.error) {
    showToast(I18N.t("profile.playerNotFound"));
    return false;
  }

  try {
    const catRes = await fetch("/catalog");
    const catData = await catRes.json();
    state.catalog = catData.catalog || [];
    state.avatars = catData.avatars || [];
  } catch { /* ignore */ }

  state.viewMode = true;
  state.friendStatus = data.friendStatus;
  state.shopData = {
    coins: data.coins,
    activeSkin: data.activeSkin,
    avatar: data.avatar,
    equipped: data.equipped || {},
    inventory: data.inventory || [],
    stats: { ...data.stats, customAvatarUrl: data.customAvatarUrl },
  };
  state.selectedAvatar = data.avatar || "😎";
  state.oldName = data.name;
  profileNameInput.value = data.name;
  setProfileEditable(false);
  profileLoginHint?.classList.add("hidden");

  accountGuest?.classList.add("hidden");
  accountUser?.classList.remove("hidden");
  document.querySelector(".accountBadge").textContent = I18N.t("profile.publicProfile");

  // Своё состояние логина не выставляется в viewMode (чтобы не перепутать
  // с данными просматриваемого профиля), поэтому для жалобы проверяем
  // реальный статус отдельно, лёгким запросом.
  try {
    const meRes = await fetch("/api/me", { credentials: "same-origin" });
    const me = await meRes.json();
    state.reporterLoggedIn = Boolean(me.loggedIn);
  } catch {
    state.reporterLoggedIn = false;
  }

  // В чужом профиле нет своих кнопок загрузки/удаления фото — только жалоба.
  document.querySelector(".avatarUploadRow")?.classList.add("hidden");
  if (btnReportAvatar) {
    btnReportAvatar.classList.remove("hidden");
    btnReportAvatar.onclick = () => reportAvatar(data.name);
  }
  renderFriendButton(data.name, data.friendStatus);

  const displayName = document.querySelector("#accountDisplayName");

  if (displayName) displayName.innerHTML = `${escapeHtml(data.name)}${streakBadgeHtml(data.streak)}`;

  applyAvatarVisuals({ customAvatarUrl: data.customAvatarUrl, avatar: data.avatar });
  btnRemoveCustomAvatar?.classList.add("hidden"); // не своё фото — удалять его отсюда нельзя

  document.title = `${data.name} — ${I18N.t("profile.profileTitleSuffix")}`;
  renderStats();
  renderEquipped();
  drawPreview();
  renderAvatars();
  loadAchievements(data.name);
  return true;
}

function renderFriendButton(targetName, status) {
  if (!btnFriendAction) return;
  state.friendStatus = status;
  if (!state.reporterLoggedIn) { btnFriendAction.classList.add("hidden"); return; }

  btnFriendAction.classList.remove("hidden");
  btnFriendAction.disabled = false;
  btnFriendAction.onclick = null;

  if (status === "friends") {
    btnFriendAction.textContent = I18N.t("profile.friendsRemove");
    btnFriendAction.onclick = async () => {
      if (!confirm(I18N.t("profile.confirmRemoveFriend", { name: targetName }))) return;
      btnFriendAction.disabled = true;
      const ok = await friendPost("/friends/remove", targetName);
      showToast(ok ? I18N.t("profile.friendRemoved", { name: targetName }) : I18N.t("profile.removeFailed"));
      renderFriendButton(targetName, ok ? "none" : status);
    };
  } else if (status === "outgoing") {
    btnFriendAction.textContent = I18N.t("profile.requestSentCancel");
    btnFriendAction.onclick = async () => {
      btnFriendAction.disabled = true;
      const ok = await friendPost("/friends/cancel", targetName);
      showToast(ok ? I18N.t("profile.requestCancelled") : I18N.t("profile.cancelFailed"));
      renderFriendButton(targetName, ok ? "none" : status);
    };
  } else if (status === "incoming") {
    btnFriendAction.textContent = I18N.t("profile.acceptRequest");
    btnFriendAction.onclick = async () => {
      btnFriendAction.disabled = true;
      const ok = await friendPost("/friends/accept", targetName);
      showToast(ok ? I18N.t("profile.nowFriends", { name: targetName }) : I18N.t("profile.acceptFailed"));
      renderFriendButton(targetName, ok ? "friends" : status);
    };
  } else {
    btnFriendAction.textContent = I18N.t("profile.addFriend");
    btnFriendAction.onclick = async () => {
      btnFriendAction.disabled = true;
      try {
        const res = await fetch("/friends/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ target: targetName }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === "accepted") {
          showToast(I18N.t("profile.mutualFriends", { name: targetName }));
          renderFriendButton(targetName, "friends");
        } else if (res.ok) {
          showToast(I18N.t("profile.requestSentTo", { name: targetName }));
          renderFriendButton(targetName, "outgoing");
        } else {
          showToast(I18N.t("profile.requestFailed"));
          renderFriendButton(targetName, "none");
        }
      } catch {
        showToast(I18N.t("profile.requestFailed"));
        renderFriendButton(targetName, "none");
      }
    };
  }
}

async function friendPost(path, name) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function reportAvatar(target) {
  if (!state.reporterLoggedIn) {
    showToast(I18N.t("profile.loginToReport"));
    return;
  }
  btnReportAvatar.disabled = true;
  try {
    const res = await fetch("/report_avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ target }),
    });
    if (res.ok) showToast(I18N.t("profile.reportSent"));
    else if (res.status === 401) showToast(I18N.t("profile.sessionExpired"));
    else showToast(I18N.t("profile.reportFailed"));
  } catch {
    showToast(I18N.t("profile.reportFailed"));
  } finally {
    btnReportAvatar.disabled = false;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

btnUploadAvatar?.addEventListener("click", () => avatarUploadInput?.click());

avatarUploadInput?.addEventListener("change", async () => {
  const file = avatarUploadInput.files?.[0];
  avatarUploadInput.value = ""; // сразу сбрасываем, чтобы можно было выбрать тот же файл повторно
  if (!file) return;

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    showToast(I18N.t("profile.fileTypeError"));
    return;
  }
  if (file.size > AVATAR_UPLOAD_MAX_BYTES) {
    showToast(I18N.t("profile.fileTooLarge", { mb: (AVATAR_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(1) }));
    return;
  }

  btnUploadAvatar.disabled = true;
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch("/upload_avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dataUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast(I18N.t("profile.uploadFailed"));
      return;
    }
    if (state.shopData) state.shopData.stats = { ...state.shopData.stats, customAvatarUrl: data.customAvatarUrl };
    applyAvatarVisuals({ customAvatarUrl: data.customAvatarUrl, avatar: state.selectedAvatar });
    showToast(I18N.t("profile.photoUpdated"));
  } catch {
    showToast(I18N.t("profile.uploadFailedGeneric"));
  } finally {
    btnUploadAvatar.disabled = false;
  }
});

btnRemoveCustomAvatar?.addEventListener("click", async () => {
  btnRemoveCustomAvatar.disabled = true;
  try {
    const res = await fetch("/remove_avatar", { method: "POST", credentials: "include" });
    if (res.ok) {
      if (state.shopData) state.shopData.stats = { ...state.shopData.stats, customAvatarUrl: null };
      applyAvatarVisuals({ customAvatarUrl: null, avatar: state.selectedAvatar });
      showToast(I18N.t("profile.photoRemoved"));
    } else {
      showToast(I18N.t("profile.removePhotoFailed"));
    }
  } catch {
    showToast(I18N.t("profile.removePhotoFailed"));
  } finally {
    btnRemoveCustomAvatar.disabled = false;
  }
});


function renderEquipped() {
  equippedList.innerHTML = "";
  const data = state.shopData;
  if (!data) return;

  const items = [];
  const skin = state.catalog.find((i) => i.id === data.activeSkin && i.category === "skin");
  if (skin) items.push(skin);
  if (data.equipped?.snakeHat) {
    const hat = state.catalog.find((i) => i.id === data.equipped.snakeHat);
    if (hat) items.push(hat);
  }

  if (!items.length) {
    equippedList.innerHTML = `<span>${I18N.t("profile.nothingEquipped")}</span>`;
    return;
  }

  for (const item of items) {
    const tag = document.createElement("span");
    tag.className = "equippedTag";
    const name = I18N.itemName(item.id, item.name);
    if (item.category === "skin") {
      tag.innerHTML = `<span class="equippedSwatch" style="background:${item.color === "rainbow" ? "linear-gradient(90deg,#f66151,#f9f06b,#33d17a,#62a0ea,#c77dff)" : item.color}"></span> ${escapeHtml(name)}`;
    } else {
      tag.textContent = `${item.emoji} ${name}`;
    }
    equippedList.append(tag);
  }
}

function drawPreview() {
  const w = previewCanvas.width;
  const h = previewCanvas.height;
  previewCtx.clearRect(0, 0, w, h);

  const grad = previewCtx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0a1018");
  grad.addColorStop(1, "#040608");
  previewCtx.fillStyle = grad;
  previewCtx.fillRect(0, 0, w, h);

  const segments = [
    { x: 40, y: 100 }, { x: 70, y: 100 }, { x: 100, y: 100 },
    { x: 130, y: 90 }, { x: 160, y: 80 }, { x: 190, y: 70 },
  ];

  const skinId = state.shopData?.activeSkin || "default";
  const skinItem = state.catalog.find((i) => i.id === skinId && i.category === "skin");
  const customBody = typeof CustomSkins !== "undefined" && CustomSkins.isBody(skinId)
    ? CustomSkins.get(skinId)
    : null;
  const bodyColor = skinItem?.color === "rainbow" ? "#3de88a" : (skinItem?.color || "#3de88a");
  const headColor = skinItem?.headColor || "#ffffff";

  segments.forEach((seg, i) => {
    if (customBody) {
      previewCtx.drawImage(customBody, seg.x, seg.y, 26, 26);
      return;
    }
    previewCtx.fillStyle = i === segments.length - 1 ? headColor : bodyColor;
    roundRect(previewCtx, seg.x, seg.y, 26, 26, 8);
    previewCtx.fill();
    if (i === segments.length - 1) {
      previewCtx.fillStyle = bodyColor;
      roundRect(previewCtx, seg.x + 6, seg.y + 6, 14, 14, 4);
      previewCtx.fill();
    }
  });

  const head = segments[segments.length - 1];
  const hatItem = state.shopData?.equipped?.snakeHat
    ? state.catalog.find((i) => i.id === state.shopData.equipped.snakeHat)
    : null;

  if (hatItem) {
    const hatId = hatItem.id;
    const customHat = typeof CustomSkins !== "undefined" && CustomSkins.isHat(hatId)
      ? CustomSkins.get(hatId)
      : null;
    if (customHat) {
      previewCtx.drawImage(customHat, head.x - 2, head.y - 28, 30, 30);
    } else {
      previewCtx.font = "22px sans-serif";
      previewCtx.textAlign = "center";
      previewCtx.fillText(hatItem.emoji, head.x + 13, head.y - 4);
    }
  }

  previewCtx.font = "28px sans-serif";
  previewCtx.textAlign = "right";
  previewCtx.fillText(state.selectedAvatar, w - 16, 36);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

saveBtn.addEventListener("click", () => {
  if (!state.loggedIn) {
    showToast(I18N.t("profile.loginFirst"));
    return;
  }
  if (!state.wsAuthed) {
    showToast(I18N.t("profile.waitConnection"));
    return;
  }
  const name = profileNameInput.value.trim();
  if (!name) {
    showToast(I18N.t("profile.nickEmpty"));
    return;
  }
  if (!send({
    type: "save_profile",
    name,
    oldName: state.oldName,
    avatar: state.selectedAvatar,
  })) return;
});

async function boot() {
  if (viewPlayerName) {
    await loadPublicProfile(viewPlayerName);
    connect();
    return;
  }

  const me = await initProfileAuth({
    onLogin(loginMe) {
      state.loggedIn = true;
      state.me = loginMe;
      state.shopData = loginMe.shopData || state.shopData;
      SnakeStore.save({
        name: loginMe.name,
        loggedIn: true,
        playerId: loginMe.playerId || loginMe.shopData?.id || null,
      });
      renderAccount(loginMe);
      if (state.socket?.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: "shop_connect", name: loginMe.name }));
      }
    },
    onLogout() {
      state.loggedIn = false;
      state.me = null;
      state.shopData = null;
      state.oldName = "";
      renderAccount({ loggedIn: false });
    },
  });

  if (me?.loggedIn) {
    state.loggedIn = true;
    state.me = me;
    state.shopData = me.shopData;
    renderAccount(me);
  } else {
    renderAccount({ loggedIn: false });
  }
  connect();
}

boot();

window.addEventListener("i18n:change", () => {
  renderEquipped();
  renderAchievements();
  if (state.viewMode && state.oldName) {
    renderFriendButton(state.oldName, state.friendStatus);
  }
});
