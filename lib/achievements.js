"use strict";

// Достижения — постоянные бейджи за прогресс. Раз разблокировано — остаётся
// навсегда, даже если статистика впоследствии не удовлетворяет условию
// (например потратил все монеты после ачивки "мешок с золотом").
//
// ctx, который получает check(ctx):
//   stats        — entry.stats (games, kills, deaths, best, streak, ...)
//   coins        — entry.coins (текущий баланс)
//   skinsCount   — сколько скинов в инвентаре (entry.inventory, category=skin)
//   friendsCount — сколько принятых друзей (не всегда известно на месте вызова)

const ACHIEVEMENTS = [
  { id: "first_blood", name: "Первая кровь", desc: "Убей первого игрока", icon: "🩸",
    check: (ctx) => (ctx.stats.kills || 0) >= 1 },
  { id: "butcher", name: "Мясник", desc: "50 убийств", icon: "⚔️",
    check: (ctx) => (ctx.stats.kills || 0) >= 50 },
  { id: "arena_legend", name: "Легенда арены", desc: "250 убийств", icon: "🗡️",
    check: (ctx) => (ctx.stats.kills || 0) >= 250 },

  { id: "rookie", name: "Новичок", desc: "Сыграй 10 игр", icon: "🎮",
    check: (ctx) => (ctx.stats.games || 0) >= 10 },
  { id: "veteran", name: "Ветеран", desc: "Сыграй 100 игр", icon: "🎖️",
    check: (ctx) => (ctx.stats.games || 0) >= 100 },
  { id: "obsessed", name: "Одержимый", desc: "Сыграй 500 игр", icon: "🏅",
    check: (ctx) => (ctx.stats.games || 0) >= 500 },

  { id: "scorer", name: "Рекордсмен", desc: "Рекорд 100+ очков за игру", icon: "📈",
    check: (ctx) => (ctx.stats.best || 0) >= 100 },
  { id: "pro", name: "Профи", desc: "Рекорд 300+ очков за игру", icon: "🚀",
    check: (ctx) => (ctx.stats.best || 0) >= 300 },
  { id: "legend", name: "Легенда", desc: "Рекорд 1000+ очков за игру", icon: "👑",
    check: (ctx) => (ctx.stats.best || 0) >= 1000 },

  { id: "collector", name: "Коллекционер", desc: "10 разных скинов", icon: "🎨",
    check: (ctx) => (ctx.skinsCount || 0) >= 10 },
  { id: "fashionista", name: "Модник", desc: "Собери все скины", icon: "🌈",
    check: (ctx) => (ctx.skinsCount || 0) >= (ctx.totalSkins || Infinity) },

  { id: "sociable", name: "Душа компании", desc: "5 друзей", icon: "🧑‍🤝‍🧑",
    check: (ctx) => (ctx.friendsCount || 0) >= 5 },
  { id: "popular", name: "Душа тусовки", desc: "20 друзей", icon: "🎉",
    check: (ctx) => (ctx.friendsCount || 0) >= 20 },

  { id: "streak_week", name: "На волне", desc: "Стрик 7 дней подряд", icon: "🔥",
    check: (ctx) => (ctx.stats.bestStreak || 0) >= 7 },
  { id: "streak_month", name: "Несгибаемый", desc: "Стрик 30 дней подряд", icon: "💪",
    check: (ctx) => (ctx.stats.bestStreak || 0) >= 30 },

  { id: "rich", name: "Мешок с золотом", desc: "Накопи 5000 монет", icon: "💰",
    check: (ctx) => (ctx.coins || 0) >= 5000 },
];

// Возвращает id-шники ачивок, которые стали true впервые в этом вызове.
function evaluateAchievements(entry, ctx) {
  if (!Array.isArray(entry.stats.unlockedAchievements)) entry.stats.unlockedAchievements = [];
  const unlocked = entry.stats.unlockedAchievements;
  const fresh = [];
  const fullCtx = { stats: entry.stats, coins: entry.coins, ...ctx };
  for (const ach of ACHIEVEMENTS) {
    if (unlocked.includes(ach.id)) continue;
    if (ach.check(fullCtx)) {
      unlocked.push(ach.id);
      fresh.push(ach);
    }
  }
  return fresh;
}

module.exports = { ACHIEVEMENTS, evaluateAchievements };
