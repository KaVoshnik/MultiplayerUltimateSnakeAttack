let settings = SnakeStore.load();
const nameInput = document.querySelector("#nameInput");
const settingsModal = document.querySelector("#settingsModal");
let difficulty = settings.difficulty || "normal";
let mode = settings.mode || "classic";
let shopData = { avatar: "😎", coins: 0 };

if (settings.name) nameInput.value = settings.name;
updateUserBar(shopData, settings.name);

// Particles
const pCanvas = document.querySelector("#particles");
const pCtx = pCanvas.getContext("2d");
const particles = [];

function resizeParticles() {
  pCanvas.width = window.innerWidth;
  pCanvas.height = window.innerHeight;
}

function initParticles() {
  particles.length = 0;
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * pCanvas.width,
      y: Math.random() * pCanvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 0.5,
      hue: Math.random() > 0.5 ? 145 : 200,
    });
  }
}

function drawParticles() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = pCanvas.width;
    if (p.x > pCanvas.width) p.x = 0;
    if (p.y < 0) p.y = pCanvas.height;
    if (p.y > pCanvas.height) p.y = 0;
    pCtx.fillStyle = `hsla(${p.hue}, 80%, 60%, 0.35)`;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pCtx.fill();
  }
  requestAnimationFrame(drawParticles);
}

resizeParticles();
initParticles();
drawParticles();
window.addEventListener("resize", () => { resizeParticles(); initParticles(); });

// Settings
document.querySelectorAll("#diffRow .diffBtn").forEach((btn) => {
  if (btn.dataset.diff === difficulty) btn.classList.add("active");
  btn.addEventListener("click", () => {
    document.querySelectorAll("#diffRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    difficulty = btn.dataset.diff;
  });
});

document.querySelectorAll("#modeRow .diffBtn").forEach((btn) => {
  if (btn.dataset.mode === mode) btn.classList.add("active");
  btn.addEventListener("click", () => {
    document.querySelectorAll("#modeRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
  });
});

document.querySelector("#btnSettings").addEventListener("click", () => settingsModal.classList.remove("hidden"));
document.querySelector("#closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
document.querySelector("#saveSettings").addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) { showToast("Введи никнейм!"); return; }
  SnakeStore.save({ name, difficulty, mode });
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
  SnakeStore.save({ name, difficulty, mode });
  location.href = "/game.html";
}

document.querySelector("#btnPlay").addEventListener("click", goPlay);

// Socket
let socket = null;
function connect() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  socket.addEventListener("open", () => {
    const name = SnakeStore.getName();
    if (name) socket.send(JSON.stringify({ type: "shop_connect", name }));
  });
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "shop_update") {
      shopData = msg.shopData;
      updateUserBar(shopData, SnakeStore.getName());
    }
    if (msg.type === "state" && msg.players) {
      document.querySelector("#onlineCount").textContent =
        `${msg.players.length} игроков · ${msg.players.filter((p) => p.alive).length} в игре`;
    }
    if (msg.type === "hello") {
      document.querySelector("#onlineCount").textContent = "Сервер онлайн";
    }
  });
  socket.addEventListener("close", () => setTimeout(connect, 1500));
}
connect();
