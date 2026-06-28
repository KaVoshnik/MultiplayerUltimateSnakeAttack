const shopCoins  = document.querySelector("#shopCoins");
const headerCoins = document.querySelector("#headerCoins");
const itemGrid   = document.querySelector("#itemGrid");

const state = {
  socket: null,
  battlePass: null,
  shopData: {
    coins: 0,
    inventory: [],
    activeSkin: "default",
    equipped: { snakeHat: null },
    stats: { battlePassScore: 0, battlePassClaimed: [], battlePassUnlocked: [], activeNickColor: null },
  },
};

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
      if (msg.battlePass) state.battlePass = msg.battlePass;
      const name = SnakeStore.getName();
      if (name) send({ type: "shop_connect", name });
    }
    if (msg.type === "shop_update") {
      state.shopData = msg.shopData;
      if (msg.battlePass) state.battlePass = msg.battlePass;
      updateCoins();
      renderBattlePass();
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

async function loadConfig() {
  try {
    const res = await fetch("/catalog");
    if (!res.ok) return;
    const data = await res.json();
    if (data.battlePass) {
      state.battlePass = data.battlePass;
      renderBattlePass();
    }
  } catch { /* сервер ещё не поднят */ }
}

function updateCoins() {
  const coins = state.shopData.coins || 0;
  if (shopCoins)   shopCoins.textContent  = coins.toLocaleString("ru");
  if (headerCoins) headerCoins.textContent = coins.toLocaleString("ru");
}

function renderBattlePass() {
  const bp      = state.battlePass;
  const stats   = state.shopData.stats || {};
  const score   = Number(stats.battlePassScore) || 0;
  const claimed = stats.battlePassClaimed  || [];
  const unlocked = stats.battlePassUnlocked || [];
  const activeColor = stats.activeNickColor || "default";
  const step    = bp?.scoreStep || 1000;
  const tiers   = bp?.tiers    || [];
  const nickColors = bp?.nickColors || [{ id: "default", label: "Стандарт", color: null }];

  const currentTier     = Math.floor(score / step);
  const progressInTier  = score % step;
  const pct             = Math.round((progressInTier / step) * 100);
  const nextAt          = (currentTier + 1) * step;

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

  // Цвета ника
  const nickGrid = document.querySelector("#bpNickGrid");
  for (const color of nickColors) {
    const isUnlocked = color.id === "default" || unlocked.includes(color.id);
    const equipped   = (color.id === "default" && !stats.activeNickColor) || activeColor === color.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bpNickBtn${isUnlocked ? "" : " locked"}${equipped ? " equipped" : ""}`;
    btn.disabled = !isUnlocked;
    btn.innerHTML = `
      <span class="bpNickSwatch" style="${color.color ? `background:${color.color}` : "background:linear-gradient(90deg,#fff,#3de88a)"}"></span>
      <span>${escapeHtml(color.label)}</span>
    `;
    btn.addEventListener("click", () => {
      send({ type: "equip_nick_color", colorId: color.id });
    });
    nickGrid.append(btn);
  }

  // Уровни
  const tiersEl = document.querySelector("#bpTiers");
  if (!tiers.length) {
    tiersEl.innerHTML = `<p class="shopEmpty">Загрузка уровней…</p>`;
    return;
  }
  for (const tier of tiers) {
    const done   = claimed.includes(tier.tier);
    const locked = score < tier.scoreRequired;
    const hasColor = tier.nickColor !== null;
    const rewardDesc = hasColor
      ? `+${tier.coins} 🪙 · цвет ника «<span style="color:${tier.nickColor.color}">${escapeHtml(tier.nickColor.label)}</span>»`
      : `+${tier.coins} 🪙`;
    const card = document.createElement("div");
    card.className = `bpTier${done ? " done" : ""}${locked ? " locked" : ""}${hasColor ? " hasColor" : ""}`;
    card.innerHTML = `
      <div class="bpTierNum">${tier.tier}</div>
      <div class="bpTierBody">
        <strong>${tier.scoreRequired.toLocaleString("ru")} очков</strong>
        <span>${rewardDesc}</span>
      </div>
      ${hasColor ? `<div class="bpTierColorDot" style="background:${tier.nickColor.color}"></div>` : ""}
      <div class="bpTierStatus">${done ? "✓" : locked ? "🔒" : "ЗАБРАТЬ"}</div>
    `;
    tiersEl.append(card);
  }
}

connect();
loadConfig();
