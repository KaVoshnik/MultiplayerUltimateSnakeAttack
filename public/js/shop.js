const shopCoins = document.querySelector("#shopCoins");
const headerCoins = document.querySelector("#headerCoins");
const itemGrid = document.querySelector("#itemGrid");
const sortSelect = document.querySelector("#sortBy");

const state = {
  socket: null,
  catalog: [],
  shopData: { coins: 0, inventory: [], equipped: { equipment: [], snakeHat: null } },
  activeTab: "equipment",
};

document.querySelectorAll(".shopTab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".shopTab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeTab = tab.dataset.tab;
    renderItems();
  });
});

sortSelect.addEventListener("change", renderItems);

function connect() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    const name = SnakeStore.getName();
    if (name) send({ type: "shop_connect", name });
    else showToast("Задай никнейм в лобби или профиле!");
  });

  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "hello") {
      state.catalog = msg.catalog || [];
      const name = SnakeStore.getName();
      if (name) send({ type: "shop_connect", name });
    }
    if (msg.type === "shop_update") {
      state.shopData = msg.shopData;
      if (msg.catalog) state.catalog = msg.catalog;
      renderItems();
    }
    if (msg.type === "notice") showToast(msg.text);
  });
}

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ ...payload, name: SnakeStore.getName() }));
  }
}

function renderItems() {
  const coins = state.shopData.coins ?? 0;
  shopCoins.textContent = coins;
  if (headerCoins) headerCoins.textContent = coins;

  const [sortBy, dir] = sortSelect.value.split("-");
  const filtered = state.catalog.filter((i) => i.category === state.activeTab);
  const sorted = sortCatalog(filtered, sortBy, dir);

  itemGrid.innerHTML = "";
  for (const item of sorted) {
    const owned = state.shopData.inventory?.includes(item.id);
    const equipped = isItemEquipped(state.shopData, item.id);

    const card = document.createElement("div");
    card.className = `itemCard rarity-${item.rarity}${owned ? " owned" : ""}${equipped ? " equipped" : ""}`;

    let actionText = `${item.price} 🪙`;
    let actionClass = "buy";
    if (owned) {
      actionText = equipped ? "СНЯТЬ" : "НАДЕТЬ";
      actionClass = equipped ? "unequip" : "equip";
    } else if (coins < item.price) {
      actionClass = "buy";
    }

    card.innerHTML = `
      <div class="itemEmoji">${item.emoji}</div>
      <div class="itemName">${escapeHtml(item.name)}</div>
      <div class="itemRarity ${item.rarity}">${RARITY_LABELS[item.rarity]}</div>
      <div class="itemAction ${actionClass}">${actionText}</div>
    `;

    card.addEventListener("click", () => {
      const name = SnakeStore.getName();
      if (!name) { showToast("Введи никнейм!"); return; }
      if (owned) {
        if (equipped) send({ type: "unequip_item", itemId: item.id });
        else send({ type: "equip_item", itemId: item.id });
      } else if (coins >= item.price) {
        send({ type: "buy_item", itemId: item.id });
      } else {
        showToast("Недостаточно монет!");
      }
    });

    itemGrid.append(card);
  }
}

connect();
