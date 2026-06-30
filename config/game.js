"use strict";

const GRID = { width: 210, height: 140 };

const SPAWN_FREEZE_MS = 3000;

const DEFAULT_TICK_MS = 115;

const BONUS_TYPES = {
  shield: { label: "SH", duration: 10000, color: "#62a0ea", desc: "защита от яда" },
  speed_up: { label: "SP", duration: 8000, color: "#f9f06b", desc: "оверклок +30% очков" },
  slow_down: { label: "SL", duration: 10000, color: "#dc8add", desc: "замедление" },
  double: { label: "x2", duration: 12000, color: "#33d17a", desc: "двойные очки" },
  ghost: { label: "GH", duration: 8000, color: "#8ff0a4", desc: "призрак" },
};

module.exports = {
  GRID,
  SPAWN_FREEZE_MS,
  DEFAULT_TICK_MS,
  BONUS_TYPES,
};
