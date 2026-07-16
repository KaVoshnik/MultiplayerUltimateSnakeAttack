const podiumEl = document.querySelector("#podium");
const listEl = document.querySelector("#leaderboard");
const paginationEl = document.querySelector("#pagination");
const emptyEl = document.querySelector("#emptyState");
const tabButtons = document.querySelectorAll(".lbTab");
const searchInput = document.querySelector("#lbSearch");
const searchResults = document.querySelector("#lbSearchResults");

const PAGE_SIZE = 7;
let allEntries = [];
let currentPage = 0;
let sortMode = "score";
let searchTimer = null;

const MEDALS = ["🥇", "🥈", "🥉"];

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.sort;
    if (next === sortMode) return;
    sortMode = next;
    tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    loadLeaderboard();
  });
});

function avatarHtml(entry, className = "lbAvatar") {
  if (entry.customAvatarUrl) {
    return `<img class="${className} lbAvatarImg" src="${escapeHtml(entry.customAvatarUrl)}" alt="" />`;
  }
  return `<span class="${className} lbAvatarEmoji">${entry.avatar || "😎"}</span>`;
}

// Показываем только от 2 дней подряд — на первый день это неотличимо от
// обычного захода и просто шумит рядом с именем.
function streakBadgeHtml(streak) {
  if (!streak || streak < 2) return "";
  return `<span class="streakBadge" title="${I18N.t("profile.streakDays", { n: streak })}">🔥${streak}</span>`;
}

function openPlayerProfile(name) {
  location.href = `/profile.html?player=${encodeURIComponent(name)}`;
}

function bindProfileClick(el, name) {
  el.classList.add("lbClickable");
  el.title = I18N.t("lb.openProfile", { name });
  el.addEventListener("click", () => openPlayerProfile(name));
}

async function loadLeaderboard() {
  try {
    const url = sortMode === "coins" ? "/leaderboard?sort=coins" : "/leaderboard";
    const res = await fetch(url);
    allEntries = await res.json();
    currentPage = 0;
    render();
  } catch {
    emptyEl.classList.remove("hidden");
    emptyEl.textContent = I18N.t("lb.loadError");
  }
}

async function runSearch(query) {
  const q = query.trim();
  if (!q) {
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
    return;
  }
  try {
    const res = await fetch(`/api/players?q=${encodeURIComponent(q)}`);
    const players = await res.json();
    searchResults.innerHTML = "";
    if (!players.length) {
      searchResults.innerHTML = `<div class="lbSearchEmpty">${I18N.t("lb.nobodyFound")}</div>`;
    } else {
      for (const p of players) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "lbSearchRow";
        row.innerHTML = `
          ${avatarHtml(p, "lbSearchAvatar")}
          <span class="lbSearchName">${escapeHtml(p.name)} ${streakBadgeHtml(p.streak)}</span>
          <span class="lbSearchMeta">🎮 ${p.games || 0} · 💀 ${p.deaths || 0}</span>
        `;
        row.addEventListener("click", () => openPlayerProfile(p.name));
        searchResults.append(row);
      }
    }
    searchResults.classList.remove("hidden");
  } catch {
    searchResults.innerHTML = `<div class="lbSearchEmpty">${I18N.t("lb.searchError")}</div>`;
    searchResults.classList.remove("hidden");
  }
}

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 250);
});

searchInput?.addEventListener("focus", () => {
  if (searchInput.value.trim()) runSearch(searchInput.value);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".lbSearchWrap")) {
    searchResults?.classList.add("hidden");
  }
});

function entryValue(entry) {
  return sortMode === "coins" ? (entry.coins ?? entry.score) : entry.score;
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
      ${avatarHtml(entry, "podiumAvatar")}
      <div class="podiumName">${escapeHtml(entry.name)} ${streakBadgeHtml(entry.streak)}</div>
      <div class="podiumStats">
        <span>🎮 ${I18N.t("profile.games")}<strong>${entry.games || 0}</strong></span>
        <span>📈 ${I18N.t("game.best")}<strong>${entry.best || entry.score}</strong></span>
      </div>
      <div class="podiumScore">${sortMode === "coins" ? "💰 " : ""}${entryValue(entry)}</div>
    `;
    bindProfileClick(card, entry.name);
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
    const extra = sortMode === "coins"
      ? `<small class="lbPlayerExtra">📈 ${I18N.t("lb.recordShort", { n: entry.best || 0 })}</small>`
      : `<small class="lbPlayerExtra">🎮 ${I18N.t("lb.gamesShort", { n: entry.games || 0 })} · 💀 ${entry.deaths || 0} · 💰 ${entry.coins || 0}</small>`;
    li.innerHTML = `
      <span class="rank">#${entry.rank}</span>
      <div class="lbPlayerMain">
        <span class="lbListAvatarWrap">${avatarHtml(entry, "lbListAvatar")}</span>
        <div class="lbPlayerText">
          <span class="name">${escapeHtml(entry.name)} ${streakBadgeHtml(entry.streak)}</span>
          ${extra}
        </div>
      </div>
      <span class="score">${sortMode === "coins" ? "💰 " : ""}${entryValue(entry)}</span>
    `;
    bindProfileClick(li, entry.name);
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
    emptyEl.textContent = sortMode === "coins"
      ? I18N.t("lb.nobodyRich")
      : I18N.t("lb.empty");
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

window.addEventListener("i18n:change", render);
