const FOOD_META = {
  apple:  { icon: "🍎", label: "Яблоко" },
  cherry: { icon: "🍒", label: "Вишня" },
  grape:  { icon: "🍇", label: "Виноград" },
};

const state = { loggedIn: false, name: "", socket: null, foodInventory: {}, listings: [] };

const loginGate = document.querySelector("#invLoginGate");
const invGrid = document.querySelector("#invGrid");
const invMarket = document.querySelector("#invMarket");
const invListForm = document.querySelector("#invListForm");
const invListKind = document.querySelector("#invListKind");
const invListQty = document.querySelector("#invListQty");
const invListPrice = document.querySelector("#invListPrice");
const invMyListings = document.querySelector("#invMyListings");
const invAllListings = document.querySelector("#invAllListings");

function foodMeta(kind) {
  return FOOD_META[kind] || { icon: "❓", label: kind };
}

function renderInventory() {
  invGrid.innerHTML = "";
  const entries = Object.entries(state.foodInventory || {});
  if (!entries.length) {
    invGrid.innerHTML = '<div class="emptyState">Пока пусто — иди собирай еду в игре!</div>';
  } else {
    for (const [kind, count] of entries) {
      const meta = foodMeta(kind);
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
  invMarket.classList.remove("hidden");
  renderListForm();
}

// Селект «что выставить» показывает только то, что реально есть в наличии.
function renderListForm() {
  const owned = Object.entries(state.foodInventory || {}).filter(([, count]) => count > 0);
  if (!owned.length) {
    invListKind.innerHTML = '<option value="">Нечего продавать</option>';
    invListForm.querySelector("button").disabled = true;
    return;
  }
  invListForm.querySelector("button").disabled = false;
  invListKind.innerHTML = owned
    .map(([kind, count]) => `<option value="${kind}">${foodMeta(kind).icon} ${foodMeta(kind).label} (есть ${count})</option>`)
    .join("");
}

function renderMarket() {
  const mine = state.listings.filter((l) => l.sellerName.toLowerCase() === state.name.toLowerCase());
  const others = state.listings.filter((l) => l.sellerName.toLowerCase() !== state.name.toLowerCase());

  invMyListings.innerHTML = mine.length
    ? mine.map((l) => listingRowHtml(l, true)).join("")
    : '<div class="emptyState">Нет активных лотов.</div>';

  invAllListings.innerHTML = others.length
    ? others.map((l) => listingRowHtml(l, false)).join("")
    : '<div class="emptyState">Рынок пока пуст.</div>';

  invMyListings.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => cancelListing(btn.dataset.cancel));
  });
  invAllListings.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => buyListing(btn.dataset.buy));
  });
}

function listingRowHtml(listing, mine) {
  const meta = foodMeta(listing.kind);
  const total = listing.quantity * listing.pricePerUnit;
  const actionHtml = mine
    ? `<button type="button" class="btn ghost small" data-cancel="${listing.id}">Снять</button>`
    : `<button type="button" class="btn primary small" data-buy="${listing.id}">Купить всё за ${total} 🪙</button>`;
  return `
    <div class="invListingRow">
      <span class="invListingIcon">${meta.icon}</span>
      <span class="invListingInfo">
        <strong>${listing.quantity}× ${meta.label}</strong>
        <span class="invListingSeller">${mine ? "твой лот" : `у ${escapeHtml(listing.sellerName)}`} · ${listing.pricePerUnit} 🪙/шт</span>
      </span>
      ${actionHtml}
    </div>
  `;
}

function listMarketItem(event) {
  event.preventDefault();
  const kind = invListKind.value;
  const quantity = Number(invListQty.value);
  const pricePerUnit = Number(invListPrice.value);
  if (!kind || !quantity || quantity < 1 || !pricePerUnit || pricePerUnit < 1) return;
  state.socket?.send(JSON.stringify({ type: "market_list", kind, quantity, pricePerUnit, name: state.name }));
  invListQty.value = "";
  invListPrice.value = "";
}

function cancelListing(listingId) {
  state.socket?.send(JSON.stringify({ type: "market_cancel", listingId, name: state.name }));
}

function buyListing(listingId) {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing || !confirm(`Купить ${listing.quantity}× за ${listing.quantity * listing.pricePerUnit} монет?`)) return;
  state.socket?.send(JSON.stringify({ type: "market_buy", listingId, quantity: listing.quantity, name: state.name }));
}

invListForm?.addEventListener("submit", listMarketItem);

async function loadInitialMarket() {
  try {
    const res = await fetch("/market");
    state.listings = await res.json();
    renderMarket();
  } catch { /* WS market_update подхватит, когда подключимся */ }
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
      state.foodInventory = msg.shopData?.stats?.foodInventory || {};
      renderInventory();
      renderMarket();
    }
    if (msg.type === "market_update") {
      state.listings = msg.listings || [];
      renderMarket();
    }
    if (msg.type === "notice") showToast(msg.text);
  });
}

async function init() {
  const me = await syncSessionUser({});
  state.loggedIn = Boolean(me?.loggedIn);
  state.name = me?.name || "";

  await loadInitialMarket();

  if (!state.loggedIn) {
    loginGate.classList.remove("hidden");
    return;
  }
  loginGate.classList.add("hidden");
  connect();
}

init();
