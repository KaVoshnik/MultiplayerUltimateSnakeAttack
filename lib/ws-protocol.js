"use strict";

// Ручной парсер/сборщик WS-фреймов (RFC6455, только текстовые фреймы без
// фрагментации — этого достаточно для нашего протокола). Чистый модуль:
// не трогает sockets/players/etc, только буферы.

function readFrames(buffer, handlers) {
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset++];
    const second = buffer[offset++];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) return;
      length = buffer.readUInt16BE(offset); offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) return;
      const h = buffer.readUInt32BE(offset); const l = buffer.readUInt32BE(offset + 4);
      length = h * 2 ** 32 + l; offset += 8;
    }

    let mask;
    if (masked) {
      if (offset + 4 > buffer.length) return;
      mask = buffer.subarray(offset, offset + 4); offset += 4;
    }
    if (offset + length > buffer.length) return;

    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    offset += length;
    if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

    if (opcode === 8) { handlers.onClose(); return; }
    if (opcode === 1) {
      try { handlers.onMessage(JSON.parse(payload.toString("utf8"))); }
      catch { handlers.onParseError?.(); }
    }
  }
}

function makeFrame(text) {
  const payload = Buffer.from(text);
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x81, length]), payload]);
  if (length < 65536) {
    const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(length, 2);
    return Buffer.concat([h, payload]);
  }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(length, 6);
  return Buffer.concat([h, payload]);
}

module.exports = { readFrames, makeFrame };
