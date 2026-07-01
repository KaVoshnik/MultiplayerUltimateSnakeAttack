"use strict";

const js = require("@eslint/js");

// Общие глобальные переменные Node.js (CommonJS-бэкенд: server.js, lib/*, config/*, db.js, auth.js)
const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
  Buffer: "readonly",
  global: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
};

// Глобальные переменные браузера (фронтенд: public/js/*)
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  fetch: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  WebSocket: "readonly",
  navigator: "readonly",
  location: "readonly",
  alert: "readonly",
  confirm: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
};

module.exports = [
  js.configs.recommended,
  {
    ignores: ["node_modules/**", "public/custom-skins/**"],
  },
  {
    files: ["**/*.js"],
    ignores: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
