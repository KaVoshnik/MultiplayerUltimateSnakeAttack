const SnakeStore = {
  KEY: "snakeSettings",

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || sessionStorage.getItem(this.KEY) || "{}");
    } catch {
      return {};
    }
  },

  save(data) {
    const merged = { ...this.load(), ...data };
    localStorage.setItem(this.KEY, JSON.stringify(merged));
    sessionStorage.setItem(this.KEY, JSON.stringify(merged));
    if (merged.name) localStorage.setItem("snakeName", merged.name);
    return merged;
  },

  getName() {
    return this.load().name || localStorage.getItem("snakeName") || "";
  },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function showToast(text) {
  let wrap = document.querySelector(".toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toastWrap";
    document.body.append(wrap);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  wrap.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

function markActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".siteNav .links a").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", markActiveNav);
} else {
  markActiveNav();
}
