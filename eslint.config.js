"use strict";

const js = require("@eslint/js");


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

  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",

  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
};


const browserGlobals = {
  window: "readonly",
  document: "readonly",

  console: "readonly",

  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",

  localStorage: "readonly",
  sessionStorage: "readonly",

  WebSocket: "readonly",
  navigator: "readonly",

  location: "readonly",
  history: "readonly",

  Image: "readonly",

  performance: "readonly",
  ResizeObserver: "readonly",
  getComputedStyle: "readonly",

  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",

  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
};


const projectGlobals = {
  SnakeStore: "readonly",
  SnakeFX: "readonly",
  SnakeAudio: "readonly",
  GameSyncClient: "readonly",
  CustomSkins: "readonly",

  showToast: "readonly",
  escapeHtml: "readonly",

  getWebSocketUrl: "readonly",

  formatPlayTime: "readonly",
  sortCatalog: "readonly",
  ownsShopItem: "readonly",
  isItemEquipped: "readonly",

  initProfileAuth: "readonly",
  updateUserBar: "readonly",
  syncSessionUser: "readonly",

  RARITY_LABELS: "readonly",
};


module.exports = [

  js.configs.recommended,


  {
    ignores: [
      "node_modules/**",
      "public/custom-skins/**",
    ],
  },


  // backend
  {
    files: [
      "**/*.js",
    ],

    ignores: [
      "public/js/**/*.js",
    ],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",

      globals: {
        ...nodeGlobals,
      },
    },

    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },


  // frontend creators
  {
    files: [
      "public/js/audio.js",
      "public/js/fx.js",
      "public/js/custom-skins.js",
      "public/js/game-sync.js",
      "public/js/common.js",
    ],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",

      globals: {
        ...browserGlobals,
      },
    },

    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },


  // frontend consumers
  {
    files: [
      "public/js/game.js",
      "public/js/shop.js",
      "public/js/profile.js",
      "public/js/lobby.js",
      "public/js/battlepass.js",
      "public/js/leaderboard.js",
    ],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",

      globals: {
        ...browserGlobals,
        ...projectGlobals,
      },
    },

    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  },

];