const CustomSkins = (() => {
  const cache = new Map();
  let slots = [
    { id: "custom_1", file: "slot1.png" },
    { id: "custom_2", file: "slot2.png" },
    { id: "custom_3", file: "slot3.png" },
  ];

  function loadSlot(slot) {
    const img = new Image();
    img.src = `/custom-skins/${slot.file}?v=${encodeURIComponent(slot.file)}`;
    img.onload = () => cache.set(slot.id, img);
    img.onerror = () => cache.delete(slot.id);
    cache.set(slot.id, img);
  }

  function loadAll() {
    cache.clear();
    for (const slot of slots) loadSlot(slot);
  }

  async function init() {
    try {
      const res = await fetch("/custom-skins/config.json");
      const cfg = await res.json();
      if (Array.isArray(cfg.slots) && cfg.slots.length) slots = cfg.slots;
    } catch { /* defaults */ }
    loadAll();
  }

  function isCustom(skinId) {
    return typeof skinId === "string" && skinId.startsWith("custom_");
  }

  function get(skinId) {
    const img = cache.get(skinId);
    return img?.complete && img.naturalWidth > 0 ? img : null;
  }

  init();
  return { isCustom, get, reload: loadAll };
})();
