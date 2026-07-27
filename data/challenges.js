"use strict";

// Пулы шаблонов челленджей. Активный набор на день/неделю выбирается
// детерминированно по UTC-дате (см. lib/challenges.js: getActiveDaily/
// getActiveWeekly) — все игроки в один и тот же день видят один и тот же
// набор, сид зависит только от даты, а не от игрока.
//
// kind:
//   "food"             — съедена хорошая еда. foodKind: null = любой вид,
//                         иначе конкретный (см. lib/food.js GOOD_FOOD_KINDS).
//   "kill"              — убийство другого игрока.
//   "games"             — начата новая жизнь (аналог entry.stats.games).
//   "score"             — очки за ОДНУ игру за период (берётся максимум).
//   "no_poison_death"   — жизнь завершилась смертью НЕ от яда.

const DAILY_POOL = [
  { id: "daily_eat_apple_15", kind: "food", foodKind: "apple", name: "Яблочный день", desc: "Съешь 15 яблок", icon: "🍎", target: 15, reward: 30 },
  { id: "daily_eat_any_30", kind: "food", foodKind: null, name: "Обжора", desc: "Съешь 30 фруктов (любых)", icon: "🍇", target: 30, reward: 35 },
  { id: "daily_kills_5", kind: "kill", name: "Охотник", desc: "Убей 5 игроков", icon: "⚔️", target: 5, reward: 45 },
  { id: "daily_score_150", kind: "score", name: "Рывок", desc: "Набери 150 очков за одну игру", icon: "📈", target: 150, reward: 35 },
  { id: "daily_games_3", kind: "games", name: "Разминка", desc: "Сыграй 3 игры", icon: "🎮", target: 3, reward: 25 },
  { id: "daily_no_poison_3", kind: "no_poison_death", name: "Осторожный", desc: "Заверши 3 игры, не съев яд", icon: "🧪", target: 3, reward: 30 },
];

const WEEKLY_POOL = [
  { id: "weekly_kills_25", kind: "kill", name: "Гроза сервера", desc: "Убей 25 игроков за неделю", icon: "🗡️", target: 25, reward: 150 },
  { id: "weekly_eat_any_150", kind: "food", foodKind: null, name: "Фуражир", desc: "Собери 150 фруктов за неделю", icon: "🧺", target: 150, reward: 140 },
  { id: "weekly_score_400", kind: "score", name: "На пределе", desc: "Набери 400 очков за одну игру", icon: "🚀", target: 400, reward: 160 },
];

const DAILY_PICK_COUNT = 3;
const WEEKLY_PICK_COUNT = 1;

module.exports = { DAILY_POOL, WEEKLY_POOL, DAILY_PICK_COUNT, WEEKLY_PICK_COUNT };
