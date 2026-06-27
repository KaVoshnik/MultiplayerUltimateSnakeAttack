const CustomSkins = (() => {
  const cache = new Map();
  let bodySlots = [
    { id: "custom_1", file: "slot1.png" },
    { id: "custom_2", file: "slot2.png" },
    { id: "custom_3", file: "slot3.png" },
  ];
  let hatSlots = [
    { id: "custom_hat_1", file: "hat1.png" },
    { id: "custom_hat_2", file: "hat2.png" },
    { id: "custom_hat_3", file: "hat3.png" },
  ];

  function allSlots() {
    return [...bodySlots, ...hatSlots];
  }

  function loadSlot(slot) {
    const img = new Image();
    img.src = `/custom-skins/${slot.file}?v=${encodeURIComponent(slot.file)}`;
    img.onload = () => cache.set(slot.id, img);
    img.onerror = () => cache.delete(slot.id);
    cache.set(slot.id, img);
  }

  function loadAll() {
    cache.clear();
    for (const slot of allSlots()) loadSlot(slot);
  }

  async function init() {
    try {
      const res = await fetch("/custom-skins/config.json");
      const cfg = await res.json();
      if (Array.isArray(cfg.bodySlots) && cfg.bodySlots.length) bodySlots = cfg.bodySlots;
      else if (Array.isArray(cfg.slots) && cfg.slots.length) bodySlots = cfg.slots;
      if (Array.isArray(cfg.hatSlots) && cfg.hatSlots.length) hatSlots = cfg.hatSlots;
    } catch { /* defaults */ }
    loadAll();
  }

  function isBody(id) {
    return typeof id === "string" && id.startsWith("custom_") && !id.startsWith("custom_hat_");
  }

  function isHat(id) {
    return typeof id === "string" && id.startsWith("custom_hat_");
  }

  function isCustom(id) {
    return isBody(id) || isHat(id);
  }

  function get(id) {
    const img = cache.get(id);
    return img?.complete && img.naturalWidth > 0 ? img : null;
  }

  init();
  return { isCustom, isBody, isHat, get, reload: loadAll };
})();
