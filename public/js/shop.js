const nameInput = document.querySelector("#shopName");
const shopCoins = document.querySelector("#shopCoins");
const skinGrid = document.querySelector("#skinGrid");

const state = {
  socket: null,
  id: null,
  skins: [],
  shopData: { coins: 0, unlockedSkins: ["default"], activeSkin: "default" },
};

nameInput.value = SnakeStore.getName();

function connect() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    sendShopConnect();
  });
  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "hello") {
      state.id = msg.id;
      state.skins = msg.skins || [];
      sendShopConnect();
    }
    if (msg.type === "shop_update") {
      state.shopData = msg.shopData;
      if (msg.skins) state.skins = msg.skins;
      renderShop();
    }
    if (msg.type === "notice") showToast(msg.text);
  });
}

function sendShopConnect() {
  const name = nameInput.value.trim();
  if (!name || state.socket?.readyState !== WebSocket.OPEN) return;
  SnakeStore.save({ name });
  send({ type: "shop_connect", name });
}

nameInput.addEventListener("change", sendShopConnect);
nameInput.addEventListener("blur", sendShopConnect);

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(payload));
  }
}

function renderShop() {
  const coins = state.shopData.coins ?? 0;
  shopCoins.textContent = coins;
  skinGrid.innerHTML = "";

  for (const skin of state.skins) {
    const owned = state.shopData.unlockedSkins.includes(skin.id) || skin.price === 0;
    const active = state.shopData.activeSkin === skin.id;
    const card = document.createElement("div");
    card.className = `skinCard${owned ? " owned" : ""}${active ? " active-skin" : ""}`;

    const previewColor = skin.color === "rainbow"
      ? "linear-gradient(135deg,#f66151,#f9f06b,#33d17a,#62a0ea,#dc8add)"
      : skin.color;

    card.innerHTML = `
      <div class="skinPreview" style="background:${previewColor}">🐍</div>
      <div class="skinName">${escapeHtml(skin.label)}</div>
      <div class="skinPrice ${owned ? "owned-label" : skin.price === 0 ? "free" : ""}">
        ${active ? "✓ Активен" : owned ? "Выбрать" : skin.price === 0 ? "Бесплатно" : `${skin.price} 🪙`}
      </div>
    `;

    card.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) { showToast("Введи имя!"); return; }
      if (owned) {
        send({ type: "equip_skin", skinId: skin.id });
        state.shopData.activeSkin = skin.id;
      } else if (coins >= skin.price) {
        send({ type: "buy_skin", skinId: skin.id });
      } else {
        showToast("Недостаточно монет — играй и собирай фрукты!");
      }
    });

    skinGrid.append(card);
  }
}

connect();
