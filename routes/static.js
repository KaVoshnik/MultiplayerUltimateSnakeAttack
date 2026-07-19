"use strict";

const fs = require("fs");
const path = require("path");
const { MIME } = require("../data/shop-catalog");
const { corsHeaders } = require("../lib/utils");

// Всегда возвращает true — это последний обработчик в цепочке (либо отдаёт
// файл, либо честный 404), см. routes/index.js.
function serveStatic(req, res, url, ctx) {
  const requestPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.([/\\]|$))+/, "");
  const filePath = path.join(ctx.PUBLIC_DIR, safePath);

  if (!filePath.startsWith(ctx.PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return true; }

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store", ...corsHeaders() });
    res.end(content);
  });
  return true;
}

module.exports = { serveStatic };
