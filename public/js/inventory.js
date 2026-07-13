const FOOD_META = {
  apple:  { icon: "🍎", label: "Яблоко" },
  cherry: { icon: "🍒", label: "Вишня" },
  grape:  { icon: "🍇", label: "Виноград" },
};

const state = { loggedIn: false, name: "", socket: null };

const loginGate = document.querySelector("#invLoginGate");
const invGrid = document.querySelector("#invGrid");
const invComingSoon = document.querySelector("#invComingSoon");

function renderInventory(foodInventory) {
  invGrid.innerHTML = "";
  const entries = Object.entries(foodInventory || {});
  if (!entries.length) {
    invGrid.innerHTML = '<div class="emptyState">Пока пусто — иди собирай еду в игре!</div>';
  } else {
    for (const [kind, count] of entries) {
      const meta = FOOD_META[kind] || { icon: "❓", label: kind };
      const card = document.createElement("div");
      card.className = "invCard";
      card.innerHTML = `
        <span class="invCardIcon">${meta.icon}</span>
        <span class="invCardCount">${count}</span>
        <span class="invCardLabel">${meta.label}</span>
      `;
      invGrid.append(card);
    }
  }
  invGrid.classList.remove("hidden");
  invComingSoon.classList.remove("hidden");
}

function connect() {
  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    if (state.loggedIn && state.name) {
      socket.send(JSON.stringify({ type: "shop_connect", name: state.name }));
    }
  });

  socket.addEventListener("close", () => setTimeout(connect, 1500));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "auth_ready") {
      state.name = msg.name || state.name;
      socket.send(JSON.stringify({ type: "shop_connect", name: state.name }));
      return;
    }
    if (msg.type === "shop_update") {
      renderInventory(msg.shopData?.stats?.foodInventory);
    }
  });
}

async function init() {
  const me = await syncSessionUser({});
  state.loggedIn = Boolean(me?.loggedIn);
  state.name = me?.name || "";

  if (!state.loggedIn) {
    loginGate.classList.remove("hidden");
    return;
  }
  loginGate.classList.add("hidden");
  connect();
}

init();
