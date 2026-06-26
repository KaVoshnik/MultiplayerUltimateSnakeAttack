const podiumEl = document.querySelector("#podium");
const listEl = document.querySelector("#leaderboard");
const paginationEl = document.querySelector("#pagination");
const emptyEl = document.querySelector("#emptyState");

const PAGE_SIZE = 7;
let allEntries = [];
let currentPage = 0;

const MEDALS = ["🥇", "🥈", "🥉"];

async function loadLeaderboard() {
  try {
    const res = await fetch("/leaderboard");
    allEntries = await res.json();
    currentPage = 0;
    render();
  } catch {
    emptyEl.classList.remove("hidden");
    emptyEl.textContent = "Не удалось загрузить рекорды.";
  }
}

function renderPodium(top3) {
  podiumEl.innerHTML = "";
  if (!top3.length) return;

  const order = [top3[1], top3[0], top3[2]].filter(Boolean);

  for (const entry of order) {
    const place = entry.rank;
    const card = document.createElement("div");
    card.className = `podiumCard place-${place}`;
    card.innerHTML = `
      <div class="podiumMedal">${MEDALS[place - 1] || ""}</div>
      <div class="podiumAvatar">${entry.avatar || "😎"}</div>
      <div class="podiumName">${escapeHtml(entry.name)}</div>
      <div class="podiumStats">
        <span>🏆 Побед<strong>${entry.wins || 0}</strong></span>
        <span>📈 Рекорд<strong>${entry.best || entry.score}</strong></span>
      </div>
      <div class="podiumScore">${entry.score}</div>
    `;
    podiumEl.append(card);
  }
}

function renderList(rest) {
  listEl.innerHTML = "";
  const start = currentPage * PAGE_SIZE;
  const page = rest.slice(start, start + PAGE_SIZE);

  page.forEach((entry, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${i * 0.05}s`;
    const diff = entry.difficulty
      ? `<span class="diffBadge ${entry.difficulty}">${entry.difficulty}</span>`
      : "";
    li.innerHTML = `
      <span class="rank">#${entry.rank}</span>
      <span class="name">${entry.avatar || "😎"} ${escapeHtml(entry.name)}${diff}<br><small style="color:var(--muted)">🏆 ${entry.wins || 0} побед</small></span>
      <span class="score">${entry.score}</span>
    `;
    listEl.append(li);
  });

  renderPagination(rest.length);
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  paginationEl.innerHTML = "";
  if (pages <= 1) return;

  for (let i = 0; i < pages; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pageBtn${i === currentPage ? " active" : ""}`;
    btn.textContent = i + 1;
    btn.addEventListener("click", () => {
      currentPage = i;
      renderList(allEntries.slice(3));
    });
    paginationEl.append(btn);
  }
}

function render() {
  if (!allEntries.length) {
    emptyEl.classList.remove("hidden");
    podiumEl.innerHTML = "";
    listEl.innerHTML = "";
    return;
  }
  emptyEl.classList.add("hidden");

  const ranked = allEntries.map((e, i) => ({ ...e, rank: e.rank || i + 1 }));
  renderPodium(ranked.slice(0, 3));
  renderList(ranked.slice(3));
}

loadLeaderboard();
setInterval(loadLeaderboard, 12000);
