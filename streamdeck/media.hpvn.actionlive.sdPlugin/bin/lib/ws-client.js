// WebSocket client tối giản (RFC 6455) để nói chuyện với app Stream Deck trên 127.0.0.1.
// Node 20 (bản Stream Deck nạp) chưa có WebSocket toàn cục → tự viết, không mang thư viện ngoài.
// Chỉ khung text, ping/pong, close; khung gửi đi luôn có mask (bắt buộc với client).
'use strict';
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');

function encodeFrame(opcode, payload) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    const len = data.length;
    const head = len < 126 ? 2 : len < 65536 ? 4 : 10;
    const buf = Buffer.alloc(head + 4 + len);
    buf[0] = 0x80 | opcode;
    if (len < 126) buf[1] = 0x80 | len;
    else if (len < 65536) { buf[1] = 0x80 | 126; buf.writeUInt16BE(len, 2); }
    else { buf[1] = 0x80 | 127; buf.writeUInt32BE(Math.floor(len / 2 ** 32), 2); buf.writeUInt32BE(len >>> 0, 6); }
    const mask = crypto.randomBytes(4);
    mask.copy(buf, head);
    for (let i = 0; i < len; i++) buf[head + 4 + i] = data[i] ^ mask[i & 3];
    return buf;
}

// Tách khung từ bộ đệm. Trả { frames:[{fin,opcode,payload}], rest }.
function decodeFrames(buf) {
    const frames = [];
    let off = 0;
    while (buf.length - off >= 2) {
        const b0 = buf[off], b1 = buf[off + 1];
        let len = b1 & 0x7F, p = off + 2;
        if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
        else if (len === 127) { if (buf.length - p < 8) break; len = buf.readUInt32BE(p) * 2 ** 32 + buf.readUInt32BE(p + 4); p += 8; }
        const masked = (b1 & 0x80) !== 0;
        let mask = null;
        if (masked) { if (buf.length - p < 4) break; mask = buf.subarray(p, p + 4); p += 4; }
        if (buf.length - p < len) break;
        let payload = Buffer.from(buf.subarray(p, p + len));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        frames.push({ fin: (b0 & 0x80) !== 0, opcode: b0 & 0x0F, payload });
        off = p + len;
    }
    return { frames, rest: buf.subarray(off) };
}

// events: 'open', 'message' (string), 'close', 'error'
function connect(url) {
    const ev = new EventEmitter();
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    let sock = null, pending = Buffer.alloc(0), fragments = [], closed = false;
    const finish = () => { if (closed) return; closed = true; try { sock && sock.destroy(); } catch (_) {} ev.emit('close'); };
    const req = http.request({
        host: u.hostname, port: u.port || 80, path: u.pathname + u.search,
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key },
    });
    req.on('upgrade', (res, s, head) => {
        const expect = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if (res.headers['sec-websocket-accept'] !== expect) { s.destroy(); ev.emit('error', new Error('bad_accept')); return finish(); }
        sock = s;
        s.setNoDelay(true);
        const onData = (chunk) => {
            pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
            const { frames, rest } = decodeFrames(pending);
            pending = Buffer.from(rest);
            for (const f of frames) {
                if (f.opcode === 0x8) { try { s.write(encodeFrame(0x8, Buffer.alloc(0))); } catch (_) {} return finish(); }
                if (f.opcode === 0x9) { try { s.write(encodeFrame(0xA, f.payload)); } catch (_) {} continue; }
                if (f.opcode === 0xA) continue;
                if (f.opcode === 0x1 || f.opcode === 0x2 || f.opcode === 0x0) {
                    fragments.push(f.payload);
                    if (f.fin) { const msg = Buffer.concat(fragments).toString('utf8'); fragments = []; ev.emit('message', msg); }
                }
            }
        };
        s.on('data', onData);
        s.on('close', finish);
        s.on('error', (e) => { ev.emit('error', e); finish(); });
        ev.emit('open');
        if (head && head.length) onData(head);
    });
    req.on('response', (res) => { res.resume(); ev.emit('error', new Error('http_' + res.statusCode)); finish(); });
    req.on('error', (e) => { ev.emit('error', e); finish(); });
    req.end();
    ev.send = (text) => { if (!sock || closed) return false; sock.write(encodeFrame(0x1, text)); return true; };
    ev.close = () => { if (sock && !closed) { try { sock.write(encodeFrame(0x8, Buffer.alloc(0))); } catch (_) {} } finish(); };
    return ev;
}

module.exports = { connect, encodeFrame, decodeFrames };
