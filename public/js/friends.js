const guestCard = document.querySelector("#guestCard");
const friendsContent = document.querySelector("#friendsContent");

const incomingList = document.querySelector("#incomingList");
const friendsListEl = document.querySelector("#friendsList");
const outgoingList = document.querySelector("#outgoingList");
const friendsTopList = document.querySelector("#friendsTopList");
const friendsTopEmpty = document.querySelector("#friendsTopEmpty");

const incomingCount = document.querySelector("#incomingCount");
const friendsCount = document.querySelector("#friendsCount");
const outgoingCount = document.querySelector("#outgoingCount");

const incomingEmpty = document.querySelector("#incomingEmpty");
const friendsEmpty = document.querySelector("#friendsEmpty");
const outgoingEmpty = document.querySelector("#outgoingEmpty");

const searchInput = document.querySelector("#friendsSearch");
const searchResults = document.querySelector("#friendsSearchResults");

let loggedIn = false;
let searchTimer = null;

function miniAvatarHtml(entry, className = "") {
  if (entry.customAvatarUrl) return `<img class="${className} lbAvatarImg" src="${escapeHtml(entry.customAvatarUrl)}" alt="" />`;
  if (entry.googlePicture) return `<img class="${className} lbAvatarImg" src="${escapeHtml(entry.googlePicture)}" alt="" referrerpolicy="no-referrer" />`;
  return `<span class="${className} lbAvatarEmoji">${entry.avatar || "😎"}</span>`;
}

// Бейдж стрика показываем только начиная с 2 дней подряд — на первый день
// это просто шум, ничем не отличающийся от обычного захода.
function streakBadgeHtml(streak) {
  if (!streak || streak < 2) return "";
  return `<span class="streakBadge" title="${streak} дней подряд">🔥${streak}</span>`;
}

function friendRow(entry, actionsHtml) {
  const li = document.createElement("li");
  li.className = "friendItem";
  const statusText = entry.room ? "В комнате" : entry.online ? "В сети" : "Не в сети";
  li.innerHTML = `
    <div class="friendAvatarWrap">
      ${miniAvatarHtml(entry)}
      <span class="onlineDot ${entry.online ? "on" : ""}" title="${entry.online ? "В сети" : "Не в сети"}"></span>
    </div>
    <div class="friendInfo">
      <div class="friendName">${escapeHtml(entry.name)} ${streakBadgeHtml(entry.streak)}</div>
      <div class="friendMeta">${statusText} · рекорд ${entry.best || 0}</div>
    </div>
    <div class="friendActions">${actionsHtml}</div>
  `;
  li.querySelector(".friendName").addEventListener("click", () => {
    location.href = `/profile.html?player=${encodeURIComponent(entry.name)}`;
  });
  li.querySelector(".friendName").style.cursor = "pointer";
  return li;
}

async function callFriendAction(path, name) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function renderLists(data) {
  incomingList.innerHTML = "";
  friendsListEl.innerHTML = "";
  outgoingList.innerHTML = "";

  incomingCount.textContent = data.incoming.length;
  friendsCount.textContent = data.friends.length;
  outgoingCount.textContent = data.outgoing.length;

  incomingEmpty.classList.toggle("hidden", data.incoming.length > 0);
  friendsEmpty.classList.toggle("hidden", data.friends.length > 0);
  outgoingEmpty.classList.toggle("hidden", data.outgoing.length > 0);

  for (const entry of data.incoming) {
    const li = friendRow(entry, `
      <button type="button" class="actionBtn accept">Принять</button>
      <button type="button" class="actionBtn decline">Отклонить</button>
    `);
    li.querySelector(".accept").addEventListener("click", async () => {
      if (await callFriendAction("/friends/accept", entry.name)) { showToast(`Теперь вы друзья с ${entry.name}`); loadFriends(); }
      else showToast("Не получилось принять заявку.");
    });
    li.querySelector(".decline").addEventListener("click", async () => {
      if (await callFriendAction("/friends/decline", entry.name)) loadFriends();
      else showToast("Не получилось отклонить заявку.");
    });
    incomingList.append(li);
  }

  for (const entry of data.friends) {
    let actions = `<button type="button" class="actionBtn remove">Удалить</button>`;
    if (entry.room?.joinable) {
      actions = `<button type="button" class="actionBtn accept join">Присоединиться</button>` + actions;
    }
    const li = friendRow(entry, actions);
    li.querySelector(".join")?.addEventListener("click", () => {
      location.href = `/rooms.html?code=${encodeURIComponent(entry.room.code)}`;
    });
    li.querySelector(".remove").addEventListener("click", async () => {
      if (!confirm(`Удалить ${entry.name} из друзей?`)) return;
      if (await callFriendAction("/friends/remove", entry.name)) { showToast(`${entry.name} удалён из друзей`); loadFriends(); }
      else showToast("Не получилось удалить.");
    });
    friendsListEl.append(li);
  }

  friendsTopList.innerHTML = "";
  const ranked = [...data.friends].sort((a, b) => (b.best || 0) - (a.best || 0));
  friendsTopEmpty.classList.toggle("hidden", ranked.length > 0);
  ranked.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "friendItem";
    li.innerHTML = `
      <div class="friendAvatarWrap">
        ${miniAvatarHtml(entry)}
        <span class="onlineDot ${entry.online ? "on" : ""}"></span>
      </div>
      <div class="friendInfo">
        <div class="friendName">#${index + 1} ${escapeHtml(entry.name)} ${streakBadgeHtml(entry.streak)}</div>
        <div class="friendMeta">Рекорд: ${entry.best || 0}</div>
      </div>
    `;
    friendsTopList.append(li);
  });

  for (const entry of data.outgoing) {
    const li = friendRow(entry, `<button type="button" class="actionBtn cancel">Отменить</button>`);
    li.querySelector(".cancel").addEventListener("click", async () => {
      if (await callFriendAction("/friends/cancel", entry.name)) loadFriends();
      else showToast("Не получилось отменить заявку.");
    });
    outgoingList.append(li);
  }

  const badge = document.querySelector("#friendsBadge");
  if (badge) {
    badge.textContent = String(data.incoming.length);
    badge.classList.toggle("hidden", data.incoming.length === 0);
  }
}

async function loadFriends() {
  try {
    const res = await fetch("/friends", { credentials: "same-origin" });
    if (!res.ok) return;
    renderLists(await res.json());
  } catch {
    showToast("Не удалось загрузить список друзей.");
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
      searchResults.innerHTML = `<div class="lbSearchEmpty">Никого не найдено</div>`;
    } else {
      for (const p of players) {
        const row = document.createElement("div");
        row.className = "lbSearchRow";
        row.innerHTML = `
          ${miniAvatarHtml(p, "lbSearchAvatar")}
          <span class="lbSearchName">${escapeHtml(p.name)} ${streakBadgeHtml(p.streak)}</span>
          <span class="lbSearchMeta">🎮 ${p.games || 0}</span>
          <button type="button" class="lbSearchAddBtn">Добавить</button>
        `;
        row.querySelector(".lbSearchName").addEventListener("click", () => {
          location.href = `/profile.html?player=${encodeURIComponent(p.name)}`;
        });
        row.querySelector(".lbSearchAddBtn").addEventListener("click", async () => {
          if (!loggedIn) { showToast("Войди через Google, чтобы добавлять друзей."); return; }
          const res2 = await fetch("/friends/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ target: p.name }),
          });
          const data = await res2.json().catch(() => ({}));
          if (res2.ok && data.status === "accepted") showToast(`Вы с ${p.name} теперь друзья! (взаимная заявка)`);
          else if (res2.ok) showToast(`Заявка отправлена игроку ${p.name}`);
          else showToast("Не получилось отправить заявку.");
          loadFriends();
        });
        searchResults.append(row);
      }
    }
    searchResults.classList.remove("hidden");
  } catch {
    searchResults.innerHTML = `<div class="lbSearchEmpty">Ошибка поиска</div>`;
    searchResults.classList.remove("hidden");
  }
}

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 250);
});

document.addEventListener("click", (e) => {
  if (!searchInput?.contains(e.target) && !searchResults?.contains(e.target)) {
    searchResults?.classList.add("hidden");
  }
});

syncSessionUser({
  shopData: { avatar: "😎", coins: 0 },
  onLogin() {
    loggedIn = true;
    guestCard?.classList.add("hidden");
    friendsContent?.classList.remove("hidden");
    loadFriends();
  },
}).then((me) => {
  if (!me?.loggedIn) {
    guestCard?.classList.remove("hidden");
    friendsContent?.classList.add("hidden");
  }
});
