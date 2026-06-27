let settings = SnakeStore.load();
const settingsModal = document.querySelector("#settingsModal");
const audioToggle = document.querySelector("#audioToggle");
const showStatsToggle = document.querySelector("#showStatsToggle");
const liveFeed = document.querySelector("#liveFeed");
let shopData = { avatar: "😎", coins: 0 };
let sessionUser = null;

if (audioToggle) {
  audioToggle.checked = SnakeAudio.isEnabled();
  audioToggle.addEventListener("change", () => SnakeAudio.setEnabled(audioToggle.checked));
}
if (showStatsToggle) {
  showStatsToggle.checked = Boolean(settings.showStats);
}
updateUserBar(shopData, settings.name);

syncSessionUser({
  shopData,
  onLogin(me) {
    sessionUser = me;
    shopData = me.shopData || shopData;
    settings.name = me.name;
    SnakeStore.save({
      name: me.name,
      google: true,
      playerId: me.playerId || me.shopData?.id || null,
      showStats: SnakeStore.load().showStats,
    });
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "shop_connect", name: me.name }));
    }
  },
}).then((me) => {
  if (me?.loggedIn) sessionUser = me;
  connect();
});

// Matrix rain + particles hybrid
const pCanvas = document.querySelector("#particles");
const pCtx = pCanvas.getContext("2d");
const columns = [];
const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789SNAKE";

function resizeParticles() {
  pCanvas.width = window.innerWidth;
  pCanvas.height = window.innerHeight;
  columns.length = 0;
  const count = Math.floor(pCanvas.width / 18);
  for (let i = 0; i < count; i++) {
    columns.push({
      x: i * 18 + 4,
      y: Math.random() * pCanvas.height,
      speed: 1.2 + Math.random() * 2.8,
      len: 8 + Math.floor(Math.random() * 18),
      hue: Math.random() > 0.7 ? 145 : 195,
    });
  }
}

function drawMatrix() {
  pCtx.fillStyle = "rgba(2,4,6,0.12)";
  pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);
  pCtx.font = "14px monospace";
  for (const col of columns) {
    for (let i = 0; i < col.len; i++) {
      const y = col.y - i * 16;
      if (y < -20 || y > pCanvas.height + 20) continue;
      const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
      const alpha = Math.max(0, 1 - i / col.len);
      pCtx.fillStyle = i === 0
        ? `hsla(${col.hue},90%,75%,${0.7 + Math.random() * 0.3})`
        : `hsla(${col.hue},80%,50%,${alpha * 0.45})`;
      pCtx.fillText(ch, col.x, y);
    }
    col.y += col.speed;
    if (col.y - col.len * 16 > pCanvas.height) {
      col.y = -col.len * 16;
      col.speed = 1.2 + Math.random() * 2.8;
    }
  }
  requestAnimationFrame(drawMatrix);
}

resizeParticles();
drawMatrix();
window.addEventListener("resize", resizeParticles);
document.body.addEventListener("pointerdown", () => { SnakeAudio.ensure(); SnakeAudio.startAmbient(); }, { once: true });

// Settings — только звук
document.querySelector("#btnSettings").addEventListener("click", () => {
  if (showStatsToggle) showStatsToggle.checked = Boolean(SnakeStore.load().showStats);
  settingsModal.classList.remove("hidden");
});
document.querySelector("#closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.querySelector("#saveSettings").addEventListener("click", () => {
  SnakeAudio.play("ui");
  SnakeStore.save({
    audio: SnakeAudio.isEnabled(),
    showStats: showStatsToggle?.checked ?? false,
  });
  settingsModal.classList.add("hidden");
  showToast("Настройки сохранены!");
});

function goPlay() {
  const name = sessionUser?.name || SnakeStore.getName();
  if (!name || !sessionUser?.loggedIn) {
    showToast("Войди через Google в профиле!");
    location.href = "/profile.html";
    return;
  }
  SnakeAudio.play("ui");
  SnakeStore.save({ name, audio: SnakeAudio.isEnabled(), google: true, showStats: SnakeStore.load().showStats });
  location.href = "/game.html";
}

document.querySelector("#btnPlay").addEventListener("click", goPlay);

document.querySelector("#userBar")?.addEventListener("click", () => {
  location.href = "/profile.html";
});

function setLiveFeed(text) {
  if (!liveFeed) return;
  liveFeed.textContent = text;
  liveFeed.style.color = "var(--text)";
}

// Socket
let socket = null;

function connect() {
  socket = new WebSocket(getWebSocketUrl());
  socket.addEventListener("open", () => {
    if (sessionUser?.loggedIn && sessionUser.name) {
      socket.send(JSON.stringify({ type: "shop_connect", name: sessionUser.name }));
    }
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "shop_update") {
      shopData = msg.shopData;
      updateUserBar(shopData, sessionUser?.name || SnakeStore.getName());
    }
    if (msg.type === "state" && msg.players) {
      const alive = msg.players.filter((p) => p.alive).length;
      document.querySelector("#onlineCount").textContent =
        `${msg.players.length} в сети · ${alive} в бою`;
      const enragedBoss = (msg.bosses || (msg.boss ? [msg.boss] : [])).find((b) => b.phase === "enraged");
      if (enragedBoss && liveFeed) {
        setLiveFeed(`⚠ ${enragedBoss.name} в ярости! Убийств: ${enragedBoss.kills || 0}`);
      }
    }
    if (msg.type === "feed" && msg.feed?.[0]) {
      setLiveFeed(msg.feed[0].text);
    }
    if (msg.type === "hello") {
      document.querySelector("#onlineCount").textContent = "Сервер онлайн";
    }
  });
  socket.addEventListener("close", () => setTimeout(connect, 1500));
}
