const profileName = document.querySelector("#profileName");
const avatarGrid = document.querySelector("#avatarGrid");
const equippedList = document.querySelector("#equippedList");
const previewCanvas = document.querySelector("#snakePreview");
const previewCtx = previewCanvas.getContext("2d");

const state = {
  socket: null,
  shopData: null,
  catalog: [],
  avatars: [],
  selectedAvatar: "😎",
  oldName: SnakeStore.getName(),
};

profileName.value = state.oldName;

function connect() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    if (state.oldName) send({ type: "shop_connect", name: state.oldName });
  });

  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "hello") {
      state.avatars = msg.avatars || [];
      state.catalog = msg.catalog || [];
      renderAvatars();
      if (state.oldName) send({ type: "shop_connect", name: state.oldName });
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
        SnakeStore.save({ name: msg.name });
        profileName.value = msg.name;
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
    btn.addEventListener("click", () => {
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
  const eq = state.shopData?.equipped;
  if (!eq) return;

  const items = [
    ...(eq.equipment || []).map((id) => state.catalog.find((i) => i.id === id)),
    eq.snakeHat ? state.catalog.find((i) => i.id === eq.snakeHat) : null,
  ].filter(Boolean);

  if (!items.length) {
    equippedList.innerHTML = "<span>Ничего не надето — зайди в магазин!</span>";
    return;
  }

  for (const item of items) {
    const tag = document.createElement("span");
    tag.className = "equippedTag";
    tag.textContent = `${item.emoji} ${item.name}`;
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

  const color = "#3de88a";
  segments.forEach((seg, i) => {
    previewCtx.fillStyle = i === segments.length - 1 ? "#fff" : color;
    roundRect(previewCtx, seg.x, seg.y, 26, 26, 8);
    previewCtx.fill();
    if (i === segments.length - 1) {
      previewCtx.fillStyle = color;
      roundRect(previewCtx, seg.x + 6, seg.y + 6, 14, 14, 4);
      previewCtx.fill();
    }
  });

  const head = segments[segments.length - 1];
  const eq = state.shopData?.equipped;
  const hatItem = eq?.snakeHat ? state.catalog.find((i) => i.id === eq.snakeHat) : null;
  const gearItems = (eq?.equipment || []).map((id) => state.catalog.find((i) => i.id === id)).filter(Boolean);

  if (hatItem) {
    previewCtx.font = "22px sans-serif";
    previewCtx.textAlign = "center";
    previewCtx.fillText(hatItem.emoji, head.x + 13, head.y - 4);
  }

  gearItems.forEach((g, i) => {
    previewCtx.font = "14px sans-serif";
    previewCtx.fillText(g.emoji, head.x + 13 + (i - 1) * 16, head.y + 38);
  });

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

document.querySelector("#saveProfile").addEventListener("click", () => {
  const name = profileName.value.trim();
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

connect();
