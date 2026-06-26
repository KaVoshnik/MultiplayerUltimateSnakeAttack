const listEl = document.querySelector("#leaderboard");
const emptyEl = document.querySelector("#emptyState");

async function loadLeaderboard() {
  try {
    const res = await fetch("/leaderboard");
    const data = await res.json();
    render(data);
  } catch {
    emptyEl.classList.remove("hidden");
    emptyEl.textContent = "Не удалось загрузить рекорды.";
  }
}

function render(entries) {
  listEl.innerHTML = "";
  if (!entries.length) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  entries.forEach((entry, index) => {
    const li = document.createElement("li");
    const diff = entry.difficulty
      ? `<span class="diffBadge ${entry.difficulty}">${entry.difficulty}</span>`
      : "";
    li.innerHTML = `
      <span class="rank">#${index + 1}</span>
      <span class="name">${escapeHtml(entry.name)}${diff}</span>
      <span class="score">${entry.score}</span>
    `;
    listEl.append(li);
  });
}

loadLeaderboard();
setInterval(loadLeaderboard, 10000);
