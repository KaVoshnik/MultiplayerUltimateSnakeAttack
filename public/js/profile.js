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

const state = {
  socket: null,
  shopData: null,
  catalog: [],
  avatars: [],
  selectedAvatar: "😎",
  oldName: "",
  loggedIn: false,
  me: null,
};

function setProfileEditable(enabled) {
  profileNameInput.disabled = !enabled;
  saveBtn.disabled = !enabled;
  profileLoginHint?.classList.toggle("hidden", enabled);
  profileContent?.classList.toggle("profileLocked", !enabled);
  avatarGrid.querySelectorAll(".avatarBtn").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function renderAccount(me) {
  const loginBtn = document.querySelector("#btnGoogleLogin");
  if (me.loggedIn) {
    accountGuest?.classList.add("hidden");
    accountUser?.classList.remove("hidden");
    loginBtn?.classList.add("hidden");

    const displayName = document.querySelector("#accountDisplayName");
    const emailEl = document.querySelector("#accountEmail");
    const googleImg = document.querySelector("#accountGoogleAvatar");
    const emojiEl = document.querySelector("#accountAvatarEmoji");

    if (displayName) displayName.textContent = me.name;
    if (emailEl) emailEl.textContent = me.email || "";

    const picture = me.picture || me.shopData?.stats?.googlePicture;
    if (picture && googleImg) {
      googleImg.src = picture;
      googleImg.classList.remove("hidden");
      emojiEl?.classList.add("hidden");
    } else {
      googleImg?.classList.add("hidden");
      if (emojiEl) {
        emojiEl.textContent = me.shopData?.avatar || "😎";
        emojiEl.classList.remove("hidden");
      }
    }

    state.oldName = me.name;
    profileNameInput.value = me.name;
    setProfileEditable(true);
  } else {
    accountGuest?.classList.remove("hidden");
    accountUser?.classList.add("hidden");
    loginBtn?.classList.remove("hidden");
    setProfileEditable(false);
    profileNameInput.value = "";
  }
}

function connect() {
  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "shop_connect", name: state.oldName || SnakeStore.getName() }));
  });

  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "hello") {
      state.avatars = msg.avatars || [];
      state.catalog = msg.catalog || [];
      renderAvatars();
      if (state.loggedIn && state.oldName) {
        socket.send(JSON.stringify({ type: "shop_connect", name: state.oldName }));
      }
    }
    if (msg.type === "shop_update") {
      state.shopData = msg.shopData;
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
        SnakeStore.save({ name: msg.name, google: true });
        profileNameInput.value = msg.name;
        const displayName = document.querySelector("#accountDisplayName");
        if (displayName) displayName.textContent = msg.name;
      }
      showToast("Профиль сохранён!");
    }
    if (msg.type === "notice") showToast(msg.text);
  });
}

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(payload));
  }
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
  document.querySelector("#statWins").textContent = s.wins || 0;
  document.querySelector("#statLosses").textContent = s.losses || 0;
  document.querySelector("#statBest").textContent = s.best || 0;
  document.querySelector("#statTime").textContent = formatPlayTime(s.playTimeMs);
  document.querySelector("#statCoins").textContent = state.shopData?.coins || 0;
}

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
    equippedList.innerHTML = "<span>Ничего не надето — зайди в магазин!</span>";
    return;
  }

  for (const item of items) {
    const tag = document.createElement("span");
    tag.className = "equippedTag";
    if (item.category === "skin") {
      tag.innerHTML = `<span class="equippedSwatch" style="background:${item.color === "rainbow" ? "linear-gradient(90deg,#f66151,#f9f06b,#33d17a,#62a0ea,#c77dff)" : item.color}"></span> ${escapeHtml(item.name)}`;
    } else {
      tag.textContent = `${item.emoji} ${item.name}`;
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

  const skinItem = state.catalog.find((i) => i.id === (state.shopData?.activeSkin || "default") && i.category === "skin");
  const bodyColor = skinItem?.color === "rainbow" ? "#3de88a" : (skinItem?.color || "#3de88a");
  const headColor = skinItem?.headColor || "#ffffff";

  segments.forEach((seg, i) => {
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
    previewCtx.font = "22px sans-serif";
    previewCtx.textAlign = "center";
    previewCtx.fillText(hatItem.emoji, head.x + 13, head.y - 4);
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
    showToast("Сначала войди через Google!");
    return;
  }
  const name = profileNameInput.value.trim();
  if (!name) {
    showToast("Никнейм не может быть пустым!");
    return;
  }
  send({
    type: "save_profile",
    name,
    oldName: state.oldName,
    avatar: state.selectedAvatar,
  });
});

initProfileAuth({
  onLogin(me) {
    state.loggedIn = true;
    state.me = me;
    state.shopData = me.shopData || state.shopData;
    SnakeStore.save({ name: me.name, google: true });
    renderAccount(me);
    if (state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: "shop_connect", name: me.name }));
    }
  },
  onLogout() {
    state.loggedIn = false;
    state.me = null;
    state.shopData = null;
    state.oldName = "";
    renderAccount({ loggedIn: false });
  },
}).then((me) => {
  if (me?.loggedIn) {
    state.loggedIn = true;
    state.me = me;
    state.shopData = me.shopData;
    renderAccount(me);
  } else {
    renderAccount({ loggedIn: false });
  }
});

connect();
