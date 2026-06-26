const SnakeFX = (() => {
  const trails = new Map();
  const floaters = [];
  const confetti = [];
  let shake = 0;
  let crtCanvas = null;
  let crtCtx = null;

  function initCrt(container) {
    if (crtCanvas) return;
    crtCanvas = document.createElement("canvas");
    crtCanvas.className = "crtOverlay";
    crtCanvas.setAttribute("aria-hidden", "true");
    container.append(crtCanvas);
    crtCtx = crtCanvas.getContext("2d");
    resizeCrt(container);
    window.addEventListener("resize", () => resizeCrt(container));
  }

  function resizeCrt(container) {
    if (!crtCanvas) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    crtCanvas.width = Math.floor(w * ratio);
    crtCanvas.height = Math.floor(h * ratio);
    crtCanvas.style.width = `${w}px`;
    crtCanvas.style.height = `${h}px`;
    crtCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawCrt(w, h) {
    if (!crtCtx) return;
    crtCtx.clearRect(0, 0, w, h);
    const t = Date.now() / 1000;
    crtCtx.fillStyle = "rgba(0,0,0,0.08)";
    for (let y = 0; y < h; y += 3) {
      crtCtx.fillRect(0, y, w, 1);
    }
    const vig = crtCtx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    crtCtx.fillStyle = vig;
    crtCtx.fillRect(0, 0, w, h);
    crtCtx.fillStyle = `rgba(61,232,138,${0.02 + Math.sin(t * 2) * 0.01})`;
    crtCtx.fillRect((Math.sin(t * 7) * 0.5 + 0.5) * w, 0, 2, h);
  }

  function addShake(amount = 6) {
    shake = Math.min(18, shake + amount);
  }

  function getShakeOffset() {
    if (shake <= 0) return { x: 0, y: 0 };
    shake *= 0.86;
    return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
  }

  function updateTrails(players) {
    for (const p of players) {
      if (!p.alive) continue;
      const head = p.snake?.[0];
      if (!head) continue;
      let list = trails.get(p.id);
      if (!list) { list = []; trails.set(p.id, list); }
      list.unshift({ x: head.x, y: head.y, life: 1, color: p.rainbow ? `hsl(${(Date.now() / 8) % 360},85%,60%)` : p.color });
      if (list.length > 14) list.length = 14;
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= 0.07;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }
    for (const id of trails.keys()) {
      if (!players.find((p) => p.id === id && p.alive)) trails.delete(id);
    }
  }

  function drawTrails(ctx, cell, offsetX, offsetY) {
    for (const list of trails.values()) {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const alpha = t.life * 0.35 * (1 - i / list.length);
        const size = cell * (0.5 + t.life * 0.25);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.color;
        ctx.shadowColor = t.color;
        ctx.shadowBlur = cell * 0.35;
        ctx.beginPath();
        ctx.arc(offsetX + t.x * cell + cell / 2, offsetY + t.y * cell + cell / 2, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  function spawnFloater(text, x, y, color = "#3de88a") {
    floaters.push({ text, x, y, life: 1, color, vy: -0.02 });
  }

  function drawFloaters(ctx, cell, offsetX, offsetY) {
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.max(12, cell * 0.38)}px Orbitron, sans-serif`;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= 0.025;
      f.y += f.vy;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = f.life;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, offsetX + f.x * cell + cell / 2, offsetY + f.y * cell);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function burstConfetti(count = 80) {
    const colors = ["#3de88a", "#62a0ea", "#f9f06b", "#dc8add", "#f66151"];
    for (let i = 0; i < count; i++) {
      confetti.push({
        x: Math.random(),
        y: -0.05 - Math.random() * 0.1,
        vx: (Math.random() - 0.5) * 0.012,
        vy: 0.004 + Math.random() * 0.012,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[i % colors.length],
        life: 1,
      });
    }
  }

  function drawConfetti(ctx, w, h) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vr;
      c.life -= 0.004;
      if (c.life <= 0 || c.y > 1.2) { confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = c.life;
      ctx.translate(c.x * w, c.y * h);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
  }

  return {
    initCrt, drawCrt, addShake, getShakeOffset,
    updateTrails, drawTrails, spawnFloater, drawFloaters,
    burstConfetti, drawConfetti,
  };
})();
