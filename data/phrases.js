"use strict";

// Фразы для колеса чата (клавиша R → цифра 1-4 в игре, см. lib/phrases.js).
// price: 0 — доступна всем по умолчанию (4 базовые фразы).
// price > 0 — продаётся в магазине, категория "phrase" (см. data/shop-catalog.js).
//
// Озвучка (актёрская) появится позже отдельными файлами:
//   /public/audio/phrases/<id>_ru.ogg
//   /public/audio/phrases/<id>_en.ogg
// Сейчас там лежат сгенерированные звуковые заглушки с теми же именами —
// их можно просто заменить финальными файлами без изменений в коде
// (см. public/js/audio.js: playPhrase()).
const PHRASES = [
  // ---- Базовые (бесплатные, доступны всем) ----
  { id: "ops", ru: "Упс", en: "Oops", price: 0, rarity: "common" },
  { id: "wrong_way", ru: "Ты не туда заполз", en: "Wrong way, buddy", price: 0, rarity: "common" },
  { id: "thanks_for_eat", ru: "Спасибо за еду", en: "Thanks for the meal", price: 0, rarity: "common" },
  { id: "nyam", ru: "Ням", en: "Nom nom", price: 0, rarity: "common" },

  // ---- Обычные платные (~5к монет) ----
  { id: "crawl_away", ru: "Ползи отсюда", en: "Crawl away from here", price: 4500, rarity: "rare" },
  { id: "no_effort", ru: "Я даже не старался", en: "Didn't even try", price: 4800, rarity: "rare" },
  { id: "worm_king", ru: "Король червей вступил в игру", en: "The Worm King has entered the game", price: 5200, rarity: "rare" },
  { id: "my_territory", ru: "Здесь ползаю я", en: "This is my turf", price: 4700, rarity: "rare" },
  { id: "slippery", ru: "Скользко получилось", en: "That was slippery", price: 4500, rarity: "rare" },
  { id: "one_more", ru: "Еще один", en: "One more", price: 4500, rarity: "rare" },
  { id: "pro_random", ru: "Это был проффесиональный рандом", en: "That was professional RNG", price: 5000, rarity: "rare" },
  { id: "on_skill", ru: "На скиле, наверное", en: "Must be skill", price: 5000, rarity: "rare" },
  { id: "ctrl_z", ru: "Ctrl + z", en: "Ctrl + Z", price: 5500, rarity: "rare" },

  // ---- Самые дорогие (легендарные) ----
  { id: "vip_worm", ru: "VIP червь на сервере", en: "VIP worm on the server", price: 9000, rarity: "legendary" },
  { id: "legend_here", ru: "Легенда уже здесь", en: "The legend has arrived", price: 9500, rarity: "legendary" },
  { id: "length_matters", ru: "Длинна имеет значение", en: "Length matters", price: 10000, rarity: "legendary" },
];

// Слоты колеса чата по умолчанию (1-4) — 4 бесплатные фразы, в этом порядке.
const DEFAULT_WHEEL = ["ops", "thanks_for_eat", "nyam", "wrong_way"];

function getPhrase(id) {
  return PHRASES.find((p) => p.id === id) || null;
}

module.exports = { PHRASES, DEFAULT_WHEEL, getPhrase };
