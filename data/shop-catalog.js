"use strict";

// Статические данные магазина/каталога — вынесено из server.js как есть,
// это просто данные, без логики и без зависимостей от состояния сервера.

const { PHRASES } = require("./phrases");

const SHOP_CATALOG = [
  { id: "default", name: "Классик", emoji: "🟢", price: 0, rarity: "common", category: "skin", color: "#33d17a", headColor: "#ffffff" },
  { id: "fire", name: "Огненная", emoji: "🔥", price: 150, rarity: "common", category: "skin", color: "#f66151", headColor: "#ffbe6f" },
  { id: "ocean", name: "Океан", emoji: "🌊", price: 150, rarity: "common", category: "skin", color: "#62a0ea", headColor: "#8ff0a4" },
  { id: "toxic", name: "Токсичная", emoji: "☢️", price: 120, rarity: "common", category: "skin", color: "#84cc16", headColor: "#ecfccb" },
  { id: "coral", name: "Коралл", emoji: "🪸", price: 140, rarity: "common", category: "skin", color: "#ff7f7f", headColor: "#ffe4e6" },
  { id: "ice", name: "Ледяная", emoji: "❄️", price: 240, rarity: "rare", category: "skin", color: "#67e8f9", headColor: "#ecfeff" },
  { id: "midnight", name: "Полночь", emoji: "🌑", price: 260, rarity: "rare", category: "skin", color: "#475569", headColor: "#cbd5e1" },
  { id: "neon", name: "Неон", emoji: "💛", price: 320, rarity: "rare", category: "skin", color: "#f9f06b", headColor: "#dc8add" },
  { id: "gold", name: "Золото", emoji: "✨", price: 290, rarity: "rare", category: "skin", color: "#ffd166", headColor: "#fff8e7" },
  { id: "candy", name: "Кэнди", emoji: "🍬", price: 390, rarity: "epic", category: "skin", color: "#f9a8d4", headColor: "#fce7f3" },
  { id: "void", name: "Пустота", emoji: "🕳️", price: 480, rarity: "epic", category: "skin", color: "#323a46", headColor: "#aab4c2" },
  { id: "plasma", name: "Плазма", emoji: "⚡", price: 560, rarity: "epic", category: "skin", color: "#e879f9", headColor: "#fae8ff" },
  { id: "shadow", name: "Тень", emoji: "🌚", price: 500, rarity: "epic", category: "skin", color: "#1e293b", headColor: "#94a3b8" },
  { id: "rainbow", name: "Радуга", emoji: "🌈", price: 1000, rarity: "legendary", category: "skin", color: "rainbow", headColor: "#ffffff" },
  { id: "royal", name: "Королевская", emoji: "💜", price: 1300, rarity: "legendary", category: "skin", color: "#7c3aed", headColor: "#ffd166" },
  { id: "lime", name: "Лайм", emoji: "🍋", price: 110, rarity: "common", category: "skin", color: "#a3e635", headColor: "#f7fee7" },
  { id: "crimson", name: "Багровая", emoji: "🩸", price: 170, rarity: "common", category: "skin", color: "#dc2626", headColor: "#fecaca" },
  { id: "azure", name: "Лазурь", emoji: "💎", price: 220, rarity: "rare", category: "skin", color: "#0ea5e9", headColor: "#e0f2fe" },
  { id: "ember", name: "Угли", emoji: "🌋", price: 350, rarity: "rare", category: "skin", color: "#ea580c", headColor: "#fdba74" },
  { id: "mint", name: "Мята", emoji: "🌿", price: 200, rarity: "common", category: "skin", color: "#2dd4bf", headColor: "#ccfbf1" },
  { id: "custom_1", name: "Свой скин 1", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#33d17a", headColor: "#ffffff", customTexture: "slot1.png" },
  { id: "custom_2", name: "Свой скин 2", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#62a0ea", headColor: "#ffffff", customTexture: "slot2.png" },
  { id: "custom_3", name: "Свой скин 3", emoji: "🖼️", price: 0, rarity: "common", category: "skin", color: "#f66151", headColor: "#ffffff", customTexture: "slot3.png" },
  { id: "hat_top", name: "Цилиндр змеи", emoji: "🎩", price: 390, rarity: "epic", category: "snake_hat" },
  { id: "hat_cap", name: "Кепка змеи", emoji: "🧢", price: 80, rarity: "common", category: "snake_hat" },
  { id: "hat_beanie", name: "Вязаная шапка", emoji: "🧶", price: 100, rarity: "common", category: "snake_hat" },
  { id: "hat_straw", name: "Соломенная шляпа", emoji: "👒", price: 240, rarity: "rare", category: "snake_hat" },
  { id: "hat_grad", name: "Выпускная шапка", emoji: "🎓", price: 270, rarity: "rare", category: "snake_hat" },
  { id: "hat_hard", name: "Строительная каска", emoji: "⛑️", price: 140, rarity: "common", category: "snake_hat" },
  { id: "hat_party", name: "Праздничный колпак", emoji: "🎉", price: 420, rarity: "epic", category: "snake_hat" },
  { id: "hat_mushroom", name: "Грибная шляпка", emoji: "🍄", price: 300, rarity: "rare", category: "snake_hat" },
  { id: "hat_flame", name: "Огненная корона", emoji: "🔥", price: 520, rarity: "epic", category: "snake_hat" },
  { id: "hat_royal", name: "Королевская корона", emoji: "👸", price: 1400, rarity: "legendary", category: "snake_hat" },
  { id: "custom_hat_1", name: "Своя шляпа 1", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat1.png" },
  { id: "custom_hat_2", name: "Своя шляпа 2", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat2.png" },
  { id: "custom_hat_3", name: "Своя шляпа 3", emoji: "🖼️", price: 0, rarity: "common", category: "snake_hat", customTexture: "hat3.png" },

  // Колесо чата (R → 1-4 в игре, см. lib/phrases.js). Id каталога с префиксом
  // phrase_, чтобы не пересекаться с id скинов/шляп; phraseId — ссылка на
  // саму фразу (data/phrases.js), нужна и на сервере, и на клиенте (shop.js).
  ...PHRASES.map((p) => ({
    id: `phrase_${p.id}`, name: p.ru, emoji: "💬", price: p.price,
    rarity: p.rarity || (p.price === 0 ? "common" : "rare"), category: "phrase", phraseId: p.id,
  })),
];

const AVATAR_PRESETS = [
  "😎", "🤠", "🧙‍♂️", "🦸‍♂️", "🧝‍♂️", "👾", "🤖", "👽", "🐍", "🐲",
  "🦊", "🐺", "🦁", "🐯", "🐼", "🐸", "🐙", "🦄", "🎃", "💀",
];

const COLORS = ["#33d17a", "#62a0ea", "#ffbe6f", "#dc8add", "#f66151", "#8ff0a4", "#99c1f1", "#f9f06b"];

const SHOP_SKINS = SHOP_CATALOG.filter((i) => i.category === "skin").map((s) => ({
  id: s.id, label: s.name, price: s.price, color: s.color, headColor: s.headColor, trailColor: s.color,
}));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".ogg": "audio/ogg",
};

module.exports = { SHOP_CATALOG, AVATAR_PRESETS, COLORS, SHOP_SKINS, MIME };
