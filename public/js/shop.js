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
    else showToast(I18N.t("shop.setNickname"));
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
    showToast(I18N.t("shop.noConnection"));
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
      ? I18N.t("shop.emptyTab")
      : I18N.t("shop.loadingCatalog");
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
    if (item.category === "phrase" && owned) {
      // У фраз нет "экипировки" на месте в магазине — владение просто
      // открывает фразу для колеса чата, а слот 1-4 выбирается в настройках.
      actionText = I18N.t("shop.owned");
      actionClass = "owned";
    } else if (owned) {
      actionText = equipped ? I18N.t("shop.unequip") : I18N.t("shop.equip");
      actionClass = equipped ? "unequip" : "equip";
    } else if (coins < price) {
      actionClass = "buy";
    }

    const preview = item.category === "skin"
      ? skinPreviewHtml(item)
      : hatPreviewHtml(item);

    card.innerHTML = `
      ${preview}
      <div class="itemName">${escapeHtml(I18N.itemName(item.id, item.name))}</div>
      <div class="itemRarity ${item.rarity}">${RARITY_LABELS[item.rarity]}</div>
      <div class="itemAction ${actionClass}">${actionText}</div>
    `;

    card.addEventListener("click", () => {
      const name = SnakeStore.getName();
      if (!name) { showToast(I18N.t("shop.enterNickname")); return; }
      if (item.category === "phrase" && owned) {
        showToast(I18N.t("shop.phraseGoToSettings"));
        return;
      }
      if (owned) {
        if (equipped) send({ type: "unequip_item", itemId: item.id });
        else send({ type: "equip_item", itemId: item.id });
      } else if (price === 0 || coins >= price) {
        send({ type: "buy_item", itemId: item.id });
      } else {
        showToast(I18N.t("shop.notEnoughCoins"));
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
  const nickColors = bp?.nickColors || [{ id: "default", label: I18N.t("shop.bpDefaultColor"), color: null }];

  const currentTier = Math.floor(score / step);
  const progressInTier = score % step;
  const pct = Math.round((progressInTier / step) * 100);
  const nextAt = (currentTier + 1) * step;
  const numLocale = I18N.getLang() === "en" ? "en-US" : "ru-RU";

  itemGrid.innerHTML = `
    <div class="bpPanel glass">
      <div class="bpHeader">
        <div>
          <h2>${I18N.t("shop.bpTitle")}</h2>
          <p>${I18N.t("shop.bpDesc", { step })}</p>
        </div>
        <div class="bpScoreBadge">${I18N.t("shop.bpPoints", { n: score.toLocaleString(numLocale) })}</div>
      </div>
      <div class="bpProgressWrap">
        <div class="bpProgressMeta">
          <span>${I18N.t("shop.bpToLevel", { n: currentTier + 1 })}</span>
          <span>${progressInTier} / ${step}</span>
        </div>
        <div class="bpProgressBar"><div class="bpProgressFill" style="width:${pct}%"></div></div>
        <p class="bpProgressHint">${I18N.t("shop.bpNextReward", { n: nextAt.toLocaleString(numLocale) })}</p>
      </div>
      <div class="bpNickSection">
        <h3>${I18N.t("shop.bpNickColor")}</h3>
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
      <span>${escapeHtml(I18N.nickColorLabel(color.id, color.label))}</span>
    `;
    btn.addEventListener("click", () => {
      send({ type: "equip_nick_color", colorId: color.id === "default" ? "default" : color.id });
    });
    nickGrid.append(btn);
  }

  const tiersEl = document.querySelector("#bpTiers");
  if (!tiers.length) {
    tiersEl.innerHTML = `<p class="shopEmpty">${I18N.t("shop.bpLoadingTiers")}</p>`;
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
        <strong>${I18N.t("shop.bpPoints", { n: tier.scoreRequired.toLocaleString(numLocale) })}</strong>
        <span>+${tier.coins} 🪙 · ${I18N.t("shop.bpColorLabel", { label: escapeHtml(I18N.nickColorLabel(tier.nickColor.id, tier.nickColor.label)) })}</span>
      </div>
      <div class="bpTierStatus">${done ? I18N.t("shop.bpClaimed") : locked ? I18N.t("shop.bpLocked") : I18N.t("shop.bpReady")}</div>
    `;
    tiersEl.append(card);
  }
}

connect();
loadCatalog();
renderItems();

window.addEventListener("i18n:change", renderItems);
