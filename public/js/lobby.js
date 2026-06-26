const settings = SnakeStore.load();
const nameInput = document.querySelector("#nameInput");
const playBtn = document.querySelector("#playBtn");
const statusEl = document.querySelector("#connectionStatus");
const onlineEl = document.querySelector("#onlineCount");

let difficulty = settings.difficulty || "normal";
let mode = settings.mode || "classic";

if (settings.name) nameInput.value = settings.name;

document.querySelectorAll("#diffRow .diffBtn").forEach((btn) => {
  if (btn.dataset.diff === difficulty) {
    document.querySelectorAll("#diffRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  }
  btn.addEventListener("click", () => {
    document.querySelectorAll("#diffRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    difficulty = btn.dataset.diff;
  });
});

document.querySelectorAll("#modeRow .diffBtn").forEach((btn) => {
  if (btn.dataset.mode === mode) {
    document.querySelectorAll("#modeRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  }
  btn.addEventListener("click", () => {
    document.querySelectorAll("#modeRow .diffBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
  });
});

function goPlay() {
  const name = nameInput.value.trim();
  if (!name) {
    showToast("Введи имя игрока!");
    nameInput.focus();
    return;
  }
  SnakeStore.save({ name, difficulty, mode });
  location.href = "/game.html";
}

playBtn.addEventListener("click", goPlay);
document.querySelector("#quickPlay").addEventListener("click", (e) => {
  e.preventDefault();
  goPlay();
});
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goPlay();
});

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
socket.addEventListener("open", () => {
  statusEl.textContent = "В сети";
  statusEl.className = "status ok";
});
socket.addEventListener("close", () => {
  statusEl.textContent = "Офлайн";
  statusEl.className = "status bad";
});
socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "state" && msg.players) {
    const alive = msg.players.filter((p) => p.alive).length;
    onlineEl.textContent = `${msg.players.length} игроков · ${alive} в игре`;
  }
  if (msg.type === "hello") {
    onlineEl.textContent = "Сервер онлайн · ждём игроков";
  }
});
