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
let lastFriendsData = null;

function miniAvatarHtml(entry, className = "") {
  if (entry.customAvatarUrl) return `<img class="${className} lbAvatarImg" src="${escapeHtml(entry.customAvatarUrl)}" alt="" />`;
  return `<span class="${className} lbAvatarEmoji">${entry.avatar || "😎"}</span>`;
}

// Бейдж стрика показываем только начиная с 2 дней подряд — на первый день
// это просто шум, ничем не отличающийся от обычного захода.
function streakBadgeHtml(streak) {
  if (!streak || streak < 2) return "";
  return `<span class="streakBadge" title="${I18N.t("profile.streakDays", { n: streak })}">🔥${streak}</span>`;
}

function friendStatusText(entry) {
  return entry.room ? I18N.t("lobby.inRoom") : entry.online ? I18N.t("lobby.online") : I18N.t("lobby.offline");
}

function friendRow(entry, actionsHtml) {
  const li = document.createElement("li");
  li.className = "friendItem";
  const statusText = friendStatusText(entry);
  li.innerHTML = `
    <div class="friendAvatarWrap">
      ${miniAvatarHtml(entry)}
      <span class="onlineDot ${entry.online ? "on" : ""}" title="${entry.online ? I18N.t("lobby.online") : I18N.t("lobby.offline")}"></span>
    </div>
    <div class="friendInfo">
      <div class="friendName">${escapeHtml(entry.name)} ${streakBadgeHtml(entry.streak)}</div>
      <div class="friendMeta">${statusText} · ${I18N.t("friends.recordShort", { n: entry.best || 0 })}</div>
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
  lastFriendsData = data;
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
      <button type="button" class="actionBtn accept">${I18N.t("friends.accept")}</button>
      <button type="button" class="actionBtn decline">${I18N.t("friends.decline")}</button>
    `);
    li.querySelector(".accept").addEventListener("click", async () => {
      if (await callFriendAction("/friends/accept", entry.name)) { showToast(I18N.t("profile.nowFriends", { name: entry.name })); loadFriends(); }
      else showToast(I18N.t("friends.acceptFailed"));
    });
    li.querySelector(".decline").addEventListener("click", async () => {
      if (await callFriendAction("/friends/decline", entry.name)) loadFriends();
      else showToast(I18N.t("friends.declineFailed"));
    });
    incomingList.append(li);
  }

  for (const entry of data.friends) {
    let actions = `<button type="button" class="actionBtn remove">${I18N.t("friends.remove")}</button>`;
    if (entry.room?.joinable) {
      actions = `<button type="button" class="actionBtn accept join">${I18N.t("friends.join")}</button>` + actions;
    }
    const li = friendRow(entry, actions);
    li.querySelector(".join")?.addEventListener("click", () => {
      location.href = `/rooms.html?code=${encodeURIComponent(entry.room.code)}`;
    });
    li.querySelector(".remove").addEventListener("click", async () => {
      if (!confirm(I18N.t("profile.confirmRemoveFriend", { name: entry.name }))) return;
      if (await callFriendAction("/friends/remove", entry.name)) { showToast(I18N.t("profile.friendRemoved", { name: entry.name })); loadFriends(); }
      else showToast(I18N.t("profile.removeFailed"));
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
        <div class="friendMeta">${I18N.t("game.best")}: ${entry.best || 0}</div>
      </div>
    `;
    friendsTopList.append(li);
  });

  for (const entry of data.outgoing) {
    const li = friendRow(entry, `<button type="button" class="actionBtn cancel">${I18N.t("friends.cancelRequest")}</button>`);
    li.querySelector(".cancel").addEventListener("click", async () => {
      if (await callFriendAction("/friends/cancel", entry.name)) loadFriends();
      else showToast(I18N.t("profile.cancelFailed"));
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
    showToast(I18N.t("friends.loadFailed"));
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
        const row = document.createElement("div");
        row.className = "lbSearchRow";
        row.innerHTML = `
          ${miniAvatarHtml(p, "lbSearchAvatar")}
          <span class="lbSearchName">${escapeHtml(p.name)} ${streakBadgeHtml(p.streak)}</span>
          <span class="lbSearchMeta">🎮 ${p.games || 0}</span>
          <button type="button" class="lbSearchAddBtn">${I18N.t("profile.addFriend")}</button>
        `;
        row.querySelector(".lbSearchName").addEventListener("click", () => {
          location.href = `/profile.html?player=${encodeURIComponent(p.name)}`;
        });
        row.querySelector(".lbSearchAddBtn").addEventListener("click", async () => {
          if (!loggedIn) { showToast(I18N.t("friends.loginToAdd")); return; }
          const res2 = await fetch("/friends/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ target: p.name }),
          });
          const data = await res2.json().catch(() => ({}));
          if (res2.ok && data.status === "accepted") showToast(I18N.t("profile.mutualFriends", { name: p.name }));
          else if (res2.ok) showToast(I18N.t("profile.requestSentTo", { name: p.name }));
          else showToast(I18N.t("profile.requestFailed"));
          loadFriends();
        });
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

window.addEventListener("i18n:change", () => {
  if (lastFriendsData) renderLists(lastFriendsData);
});
