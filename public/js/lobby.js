let settings = SnakeStore.load();
const nameInput = document.querySelector("#nameInput");
const settingsModal = document.querySelector("#settingsModal");
const audioToggle = document.querySelector("#audioToggle");
const liveFeed = document.querySelector("#liveFeed");
let shopData = { avatar: "😎", coins: 0 };

if (settings.name) nameInput.value = settings.name;
if (audioToggle) {
  audioToggle.checked = SnakeAudio.isEnabled();
  audioToggle.addEventListener("change", () => SnakeAudio.setEnabled(audioToggle.checked));
}
updateUserBar(shopData, settings.name);

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

// Settings
document.querySelector("#btnSettings").addEventListener("click", () => settingsModal.classList.remove("hidden"));
document.querySelector("#closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.querySelector("#saveSettings").addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) { showToast("Введи никнейм!"); return; }
  SnakeAudio.play("ui");
  SnakeStore.save({ name, audio: SnakeAudio.isEnabled() });
  updateUserBar(shopData, name);
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "shop_connect", name }));
    socket.send(JSON.stringify({ type: "save_profile", name, oldName: settings.name, avatar: shopData.avatar }));
  }
  settings.name = name;
  settingsModal.classList.add("hidden");
  showToast("Настройки сохранены!");
});

function goPlay() {
  const name = nameInput.value.trim() || SnakeStore.getName();
  if (!name) {
    settingsModal.classList.remove("hidden");
    showToast("Сначала введи никнейм в настройках!");
    return;
  }
  SnakeAudio.play("ui");
  SnakeStore.save({ name, audio: SnakeAudio.isEnabled() });
  location.href = "/game.html";
}

document.querySelector("#btnPlay").addEventListener("click", goPlay);

function setLiveFeed(text) {
  if (!liveFeed) return;
  liveFeed.textContent = text;
  liveFeed.style.color = "var(--text)";
}

// Socket + public URL
let socket = null;

async function loadServerInfo() {
  try {
    const res = await fetch("/info");
    if (!res.ok) return;
    const info = await res.json();
    const box = document.querySelector("#shareBox");
    const urlEl = document.querySelector("#publicUrl");
    if (box && urlEl && info.publicUrl) {
      urlEl.textContent = info.publicUrl;
      box.classList.remove("hidden");
    }
  } catch { /* офлайн */ }
}

document.querySelector("#copyUrlBtn")?.addEventListener("click", async () => {
  const url = document.querySelector("#publicUrl")?.textContent;
  if (!url || url === "…") return;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Ссылка скопирована!");
    SnakeAudio.play("ui");
  } catch {
    showToast(url);
  }
});

loadServerInfo();

function connect() {
  socket = new WebSocket(getWebSocketUrl());
  socket.addEventListener("open", () => {
    const name = SnakeStore.getName();
    if (name) socket.send(JSON.stringify({ type: "shop_connect", name }));
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") return;
    if (msg.type === "shop_update") {
      shopData = msg.shopData;
      updateUserBar(shopData, SnakeStore.getName());
    }
    if (msg.type === "state" && msg.players) {
      const alive = msg.players.filter((p) => p.alive).length;
      document.querySelector("#onlineCount").textContent =
        `${msg.players.length} в сети · ${alive} в бою`;
      if (msg.boss?.phase === "enraged" && liveFeed) {
        setLiveFeed(`⚠ VØIDR в ярости! Убийств: ${msg.boss.kills || 0}`);
      }
    }
    if (msg.type === "feed" && msg.feed?.[0]) {
      setLiveFeed(msg.feed[0].text);
    }
    if (msg.type === "hello") {
      document.querySelector("#onlineCount").textContent = "Сервер онлайн · NEON DISTRICT";
    }
  });
  socket.addEventListener("close", () => setTimeout(connect, 1500));
}
connect();
