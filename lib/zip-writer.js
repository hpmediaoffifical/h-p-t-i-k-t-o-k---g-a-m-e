// Ghi file .zip tối giản (deflate, không mã hoá, không zip64) — đủ cho gói plugin Stream Deck
// (.streamDeckPlugin = zip chứa thư mục <uuid>.sdPlugin). Không cần thư viện ngoài.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
}

// entries: [{ name: 'a/b.txt', data: Buffer }] → Buffer zip. Tên dùng '/' và UTF-8 (cờ bit 11).
function buildZip(entries, { now = new Date() } = {}) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const { time, date } = dosTime(now);
    for (const e of entries) {
        const name = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
        const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
        const deflated = zlib.deflateRawSync(raw, { level: 9 });
        const useDeflate = deflated.length < raw.length;
        const body = useDeflate ? deflated : raw;
        const crc = crc32(raw);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
        lh.writeUInt16LE(useDeflate ? 8 : 0, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(raw.length, 22);
        lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, name, body);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
        ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(raw.length, 24);
        ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
        centrals.push(ch, name);
        offset += lh.length + name.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
}

// Gom cả thư mục `dir` vào zip, tên bắt đầu bằng `prefix` (vd 'media.hpvn.actionlive.sdPlugin/').
function zipDirectory(dir, prefix = '') {
    const entries = [];
    const walk = (abs, rel) => {
        for (const ent of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const a = path.join(abs, ent.name), r = rel ? rel + '/' + ent.name : ent.name;
            if (ent.isDirectory()) walk(a, r);
            else if (ent.isFile()) entries.push({ name: prefix + r, data: fs.readFileSync(a) });
        }
    };
    walk(dir, '');
    return buildZip(entries);
}

module.exports = { crc32, buildZip, zipDirectory };
