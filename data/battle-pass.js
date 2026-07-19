"use strict";

const BATTLE_PASS_SCORE_STEP = 1000;
const BATTLE_PASS_MAX_TIER = 60;

const BATTLE_PASS_NICK_COLORS = [
  { id: "bp_gold", label: "Золото", color: "#ffd166", tier: 1 },
  { id: "bp_cyan", label: "Бирюза", color: "#22d3ee", tier: 4 },
  { id: "bp_magenta", label: "Магента", color: "#f472b6", tier: 7 },
  { id: "bp_lime", label: "Лайм", color: "#a3e635", tier: 10 },
  { id: "bp_crimson", label: "Багряный", color: "#f87171", tier: 13 },
  { id: "bp_violet", label: "Фиолет", color: "#a78bfa", tier: 16 },
  { id: "bp_orange", label: "Оранж", color: "#fb923c", tier: 19 },
  { id: "bp_ice", label: "Лёд", color: "#93c5fd", tier: 22 },
  { id: "bp_neon", label: "Неон", color: "#3de88a", tier: 25 },
  { id: "bp_royal", label: "Корона", color: "#fcd34d", tier: 28 },
  { id: "bp_plasma", label: "Плазма", color: "#e879f9", tier: 31 },
  { id: "bp_sunset", label: "Закат", color: "#fb7185", tier: 34 },
  { id: "bp_mint", label: "Мята", color: "#2dd4bf", tier: 37 },
  { id: "bp_ember", label: "Угли", color: "#ea580c", tier: 40 },
  { id: "bp_azure", label: "Лазурь", color: "#0ea5e9", tier: 43 },
  { id: "bp_sakura", label: "Сакура", color: "#f9a8d4", tier: 46 },
  { id: "bp_poison", label: "Яд", color: "#84cc16", tier: 49 },
  { id: "bp_shadow", label: "Тень", color: "#94a3b8", tier: 52 },
  { id: "bp_aurora", label: "Аврора", color: "#34d399", tier: 55 },
  { id: "bp_legendary", label: "Легенда", color: "#f59e0b", tier: 60 },
];

function getBattlePassTierDef(tier) {
  const nickColor = BATTLE_PASS_NICK_COLORS.find((c) => c.tier === tier) || null;
  // Монеты: 30 за первые уровни, плавно растёт к 60-му (~120 на уровне 60)
  const coins = Math.round(30 + (tier - 1) * 1.5);
  return { tier, scoreRequired: tier * BATTLE_PASS_SCORE_STEP, coins, nickColor };
}

function getBattlePassConfig() {
  return {
    scoreStep: BATTLE_PASS_SCORE_STEP,
    maxTier: BATTLE_PASS_MAX_TIER,
    tiers: Array.from({ length: BATTLE_PASS_MAX_TIER }, (_, i) => getBattlePassTierDef(i + 1)),
    nickColors: [{ id: "default", label: "Стандарт", color: null }, ...BATTLE_PASS_NICK_COLORS],
  };
}

function resolveNickColorHex(entry) {
  const id = entry.stats?.activeNickColor;
  if (!id || id === "default") return null;
  return BATTLE_PASS_NICK_COLORS.find((c) => c.id === id)?.color || null;
}

module.exports = {
  BATTLE_PASS_SCORE_STEP,
  BATTLE_PASS_MAX_TIER,
  BATTLE_PASS_NICK_COLORS,
  getBattlePassTierDef,
  getBattlePassConfig,
  resolveNickColorHex,
};
