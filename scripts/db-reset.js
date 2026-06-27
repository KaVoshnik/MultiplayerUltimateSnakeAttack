#!/usr/bin/env node
const db = require("../db");

(async () => {
  await db.init();
  await db.resetAll();
  console.log("PostgreSQL: все игроки и рекорды удалены.");
  await db.close();
})().catch((error) => {
  console.error("Ошибка:", error.message);
  process.exit(1);
});
