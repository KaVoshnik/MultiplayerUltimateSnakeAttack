const shopCoins = document.querySelector("#shopCoins");
const headerCoins = document.querySelector("#headerCoins");
const itemGrid = document.querySelector("#itemGrid");
const sortSelect = document.querySelector("#sortBy");

const state = {
  socket: null,
  catalog: [],
  battlePass: null,
  shopData: {
    coins: 0,
    inventory: [],
    activeSkin: "default",
    equipped: { snakeHat: null },
    stats: { battlePassScore: 0, battlePassClaimed: [], battlePassUnlocked: [], activeNickColor: null },
  },
  activeTab: "skin",
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

function skinPreviewHtml(item) {
  if (item.customTexture && typeof CustomSkins !== "undefined" && CustomSkins.isBody(item.id)) {
    const img = CustomSkins.get(item.id);
    if (img) {
      return `<div class="itemEmoji customSkinPreview"><img src="${img.src}" alt="" /></div>`;
    }
    return `<div class="itemEmoji customSkinPreview placeholder">🖼️</div>`;
  }
  const rainbow = item.color === "rainbow";
  const body = rainbow ? "" : item.color;
  const head = item.headColor || "#ffffff";
  return `
    <div class="skinPreview${rainbow ? " rainbow" : ""}"${body ? ` style="--body:${body};--head:${head}"` : ""}>
      <span class="skinSegment skinHead"></span>
      <span class="skinSegment skinBody"></span>
      <span class="skinSegment skinTail"></span>
    </div>
  `;
}

async function loadCatalog() {
  try {
    const res = await fetch("/catalog");
    if (!res.ok) return;
    const data = await res.json();
    if (data.catalog?.length) {
      state.catalog = data.catalog;
      if (data.battlePass) state.battlePass = data.battlePass;
      renderItems();
    }
  } catch {
    /* сервер ещё не поднят */
  }
}

function connect() {
  const socket = new WebSocket(getWebSocketUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    const name = SnakeStore.getName();
    if (name) send({ type: "shop_connect", name });
    else showToast("Задай никнейм в лобби или профиле!");
  });

  socket.addEventListener("close", () => setTimeout(connect, 1200));
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "hello") {
      state.catalog = msg.catalog || state.catalog;
      if (msg.battlePass) state.battlePass = msg.battlePass;
      renderItems();
      const name = SnakeStore.getName();
      if (name) send({ type: "shop_connect", name });
    }
    if (msg.type === "shop_update") {
      state.shopData = msg.shopData;
      if (msg.catalog) state.catalog = msg.catalog;
      if (msg.battlePass) state.battlePass = msg.battlePass;
      renderItems();
    }
    if (msg.type === "notice") showToast(msg.text);
  });
}

function send(payload) {
  if (state.socket?.readyState !== WebSocket.OPEN) {
    showToast("Нет связи с сервером");
    return;
  }
  state.socket.send(JSON.stringify(payload));
}

function hatPreviewHtml(item) {
  if (item.customTexture && typeof CustomSkins !== "undefined" && CustomSkins.isHat(item.id)) {
    const img = CustomSkins.get(item.id);
    if (img) {
      return `<div class="itemEmoji customHatPreview"><img src="${img.src}" alt="" /></div>`;
    }
    return `<div class="itemEmoji customHatPreview placeholder">🖼️</div>`;
  }
  return `<div class="itemEmoji">${item.emoji}</div>`;
}

function renderItems() {
  const coins = Number(state.shopData.coins) || 0;
  shopCoins.textContent = coins;
  if (headerCoins) headerCoins.textContent = coins;

  const sortWrap = document.querySelector(".shopSort");
  if (sortWrap) sortWrap.style.display = state.activeTab === "battle_pass" ? "none" : "";

  if (state.activeTab === "battle_pass") {
    renderBattlePass();
    return;
  }

  const [sortBy, dir] = sortSelect.value.split("-");
  const filtered = state.catalog.filter((i) => i.category === state.activeTab);
  const sorted = sortCatalog(filtered, sortBy, dir);

  itemGrid.innerHTML = "";
  if (!sorted.length) {
    const hint = state.catalog.length
      ? "В этой вкладке пока ничего нет"
      : "Загрузка каталога…";
    itemGrid.innerHTML = `<p class="shopEmpty">${hint}</p>`;
    return;
  }

  for (const item of sorted) {
    const owned = ownsShopItem(state.shopData, item);
    const equipped = isItemEquipped(state.shopData, item);

    const card = document.createElement("div");
    card.className = `itemCard rarity-${item.rarity}${owned ? " owned" : ""}${equipped ? " equipped" : ""}`;

    const price = Number(item.price) || 0;
    let actionText = `${price} 🪙`;
    let actionClass = "buy";
    if (owned) {
      actionText = equipped ? "СНЯТЬ" : "НАДЕТЬ";
      actionClass = equipped ? "unequip" : "equip";
    } else if (coins < price) {
      actionClass = "buy";
    }

    const preview = item.category === "skin"
      ? skinPreviewHtml(item)
      : hatPreviewHtml(item);

    card.innerHTML = `
      ${preview}
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
      } else if (price === 0 || coins >= price) {
        send({ type: "buy_item", itemId: item.id });
      } else {
        showToast("Недостаточно монет!");
      }
    });

    itemGrid.append(card);
  }
}

function renderBattlePass() {
  const bp = state.battlePass;
  const stats = state.shopData.stats || {};
  const score = Number(stats.battlePassScore) || 0;
  const claimed = stats.battlePassClaimed || [];
  const unlocked = stats.battlePassUnlocked || [];
  const activeColor = stats.activeNickColor || "default";
  const step = bp?.scoreStep || 1000;
  const tiers = bp?.tiers || [];
  const nickColors = bp?.nickColors || [{ id: "default", label: "Стандарт", color: null }];

  const currentTier = Math.floor(score / step);
  const progressInTier = score % step;
  const pct = Math.round((progressInTier / step) * 100);
  const nextAt = (currentTier + 1) * step;

  itemGrid.innerHTML = `
    <div class="bpPanel glass">
      <div class="bpHeader">
        <div>
          <h2>Бесплатный боевой пропуск</h2>
          <p>Очки из всех игр суммируются. Каждые <strong>${step}</strong> очков — награда.</p>
        </div>
        <div class="bpScoreBadge">${score.toLocaleString("ru")} очков</div>
      </div>
      <div class="bpProgressWrap">
        <div class="bpProgressMeta">
          <span>До ур. ${currentTier + 1}</span>
          <span>${progressInTier} / ${step}</span>
        </div>
        <div class="bpProgressBar"><div class="bpProgressFill" style="width:${pct}%"></div></div>
        <p class="bpProgressHint">Следующая награда на <strong>${nextAt.toLocaleString("ru")}</strong> очков</p>
      </div>
      <div class="bpNickSection">
        <h3>Цвет ника</h3>
        <div class="bpNickGrid" id="bpNickGrid"></div>
      </div>
      <div class="bpTiers" id="bpTiers"></div>
    </div>
  `;

  const nickGrid = document.querySelector("#bpNickGrid");
  for (const color of nickColors) {
    const isUnlocked = color.id === "default" || unlocked.includes(color.id);
    const equipped = (color.id === "default" && !stats.activeNickColor) || activeColor === color.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bpNickBtn${isUnlocked ? "" : " locked"}${equipped ? " equipped" : ""}`;
    btn.disabled = !isUnlocked;
    btn.innerHTML = `
      <span class="bpNickSwatch" style="${color.color ? `background:${color.color}` : "background:linear-gradient(90deg,#fff,#3de88a)"}"></span>
      <span>${escapeHtml(color.label)}</span>
    `;
    btn.addEventListener("click", () => {
      send({ type: "equip_nick_color", colorId: color.id === "default" ? "default" : color.id });
    });
    nickGrid.append(btn);
  }

  const tiersEl = document.querySelector("#bpTiers");
  if (!tiers.length) {
    tiersEl.innerHTML = `<p class="shopEmpty">Загрузка уровней…</p>`;
    return;
  }

  for (const tier of tiers) {
    const done = claimed.includes(tier.tier);
    const locked = score < tier.scoreRequired;
    const card = document.createElement("div");
    card.className = `bpTier${done ? " done" : ""}${locked ? " locked" : ""}`;
    card.innerHTML = `
      <div class="bpTierNum">${tier.tier}</div>
      <div class="bpTierBody">
        <strong>${tier.scoreRequired.toLocaleString("ru")} очков</strong>
        <span>+${tier.coins} 🪙 · цвет «${escapeHtml(tier.nickColor.label)}»</span>
      </div>
      <div class="bpTierStatus">${done ? "ПОЛУЧЕНО" : locked ? "ЗАКРЫТО" : "ГОТОВО"}</div>
    `;
    tiersEl.append(card);
  }
}

connect();
loadCatalog();
renderItems();
