"use strict";

const publicRoutes = require("./public");
const avatarRoutes = require("./avatar");
const friendsRoutes = require("./friends");
const dailyChestRoutes = require("./daily-chest");
const adminRoutes = require("./admin");
const staticRoutes = require("./static");

// Каждый под-роутер возвращает true, если он обработал запрос (и сам
// закрыл res), иначе false — тогда пробуем следующий. Порядок важен:
// admin/friends/daily_chest/avatar/public проверяют конкретные пути,
// static.serveStatic — всегда последний (либо файл, либо честный 404).
const ROUTERS = [publicRoutes, avatarRoutes, friendsRoutes, dailyChestRoutes, adminRoutes];

async function handleHttpRequest(req, res, url, ctx) {
  for (const router of ROUTERS) {
    if (await router.handle(req, res, url, ctx)) return;
  }
  staticRoutes.serveStatic(req, res, url, ctx);
}

module.exports = { handleHttpRequest };
