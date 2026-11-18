'use strict';
/**
 * 🎲 Bộ Đấu Trường Mini — BỘ ĐIỀU PHỐI phía server: nối luật thuần (table.js) ↔ socket ↔ route.
 * server.js chỉ gọi: addGift / addComment / onRoom / onConfig / attachSocket / mountRoutes / start.
 * Spec: docs/superpowers/specs/2026-11-12-luotchoi-design.md §3.
 *
 * Socket 'luotchoi:state' server → mọi client (overlay, panel): khi có thay đổi, tối đa 4 lần/giây.
 * Overlay tự đếm ngược theo `now` của server (bù lệch giờ) nên không cần đẩy mỗi giây.
 */
const path = require('path');
const { createTable, normalizeConfig } = require('./table');
const { GAME_LIST } = require('./games');

const TICK_MS = 250;

function createLuotChoiController(deps) {
    const { io } = deps;
    const log = deps.log || console.log;
    const getCfg = () => normalizeConfig(deps.getConfig());
    const table = createTable({ config: getCfg() });
    let roomId = '';
    let pushTimer = null, lastPush = 0, lastSig = '', tickTimer = null;

    function publicState() {
        const s = table.snapshot();
        s.games = GAME_LIST.map(g => ({ id: g.id, name: g.name, icon: g.icon, unit: g.unit, kind: g.kind }));
        return s;
    }
    function signature(s) {
        const ev = s.events.length ? s.events[s.events.length - 1].seq : 0;
        return [s.phase, ev, s.lobbyUntil, s.turnUntil, s.holdUntil, s.resultUntil, s.seats.length, s.queue.length, s.cfg.enabled].join('|');
    }
    function push(immediate) {
        if (pushTimer) return;
        const wait = immediate ? 0 : Math.max(0, 250 - (Date.now() - lastPush));
        pushTimer = setTimeout(() => {
            pushTimer = null; lastPush = Date.now();
            const s = publicState();
            lastSig = signature(s);
            io.emit('luotchoi:state', s);
        }, wait);
    }
    function tick() {
        table.tick();
        if (signature(table.snapshot()) !== lastSig) push();
    }

    // ── móc từ server.js ───────────────────────────────────────────────────
    const userOf = (e) => ({ key: String(e.uniqueId || e.userId || ''), nickname: String(e.nickname || e.uniqueId || ''), avatar: String(e.profilePictureUrl || e.profilePicture || '') });

    function addGift(g) {
        if (!g) return;
        const r = table.addGift({ user: userOf(g), giftId: String(g.giftId ?? '') });
        if (r.action !== 'ignored') push(true);
        return r;
    }
    function addComment(c) {
        if (!c) return false;
        const ok = table.comment({ user: userOf(c), text: c.comment });
        if (ok) push(true);
        return ok;
    }
    function onRoom(id) {
        const rid = String(id || '');
        if (!rid) return;
        if (roomId && rid !== roomId) { log('[luotchoi] phòng LIVE mới → xoá bàn + bảng vô địch buổi trước'); table.clear(); push(true); }
        roomId = rid;
    }
    function onConfig() { table.setConfig(getCfg()); push(true); }

    function control(cmd, b = {}) {
        let r = { ok: true };
        switch (cmd) {
            case 'host': r = table.hostJoin(); break;
            case 'start': r = table.startNow(); break;
            case 'cancel': r = table.cancel(); break;
            case 'kick': r = table.kick(String(b.key || '')); break;
            case 'pick': r = { ok: table.hostPick(Number(b.n)) }; break;
            case 'clear': table.clear(); break;
            case 'rotate': {   // 🔄 creator xoay mô hình 3D trên overlay (núi đá / hà mã / tháp) cho người xem thấy hốc + số phía sau
                const dir = Number(b.dir);
                if (![-1, 0, 1].includes(dir)) return { ok: false, error: 'hướng xoay lạ' };
                io.emit('luotchoi:rotate', { dir });
                return { ok: true };
            }
            case 'test': {   // 🧪 người xem thử vào ghế / nhận khiên (bỏ kiểm quà)
                const nickname = String(b.nickname || 'Người xem thử').slice(0, 40);
                const key = String(b.uniqueId || ('test_' + nickname.replace(/\s+/g, '_'))).slice(0, 64);
                r = table.addGift({ user: { key, nickname, avatar: String(b.avatar || '') }, as: b.kind === 'shield' ? 'shield' : 'seat' });
                r.uniqueId = key;
                break;
            }
            default: return { ok: false, error: 'lệnh lạ' };
        }
        push(true);
        return r;
    }

    /**
     * Bàn mẫu cho overlay ?demo=<trò>: dựng bàn TẠM (không đụng bàn thật) với 4 người giả, chạy `step` bước bằng
     * đúng luật thật, đồng hồ giả. Cùng (game, step) → cùng kết quả, overlay hỏi step tăng dần là thấy ván chạy.
     */
    function demoState(game, step) {
        let t = 1e12, seed = 7;
        const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        const tb = createTable({ config: { enabled: true, game, seats: 4, turnSec: 20, lobbySec: 5, resultSec: 6, seatGifts: [], shieldGifts: [] }, now: () => t, rng });
        const seatBots = () => {
            ['Mây', 'Gió', 'Nắng', 'Sương'].forEach((n, i) => tb.addGift({ user: { key: 'demo' + i, nickname: n }, as: 'seat' }));
            tb.addGift({ user: { key: 'demo2' }, as: 'shield' });
        };
        seatBots();
        const n = Math.max(0, Math.min(400, Number(step) || 0));
        for (let i = 0; i < n; i++) {
            const s = tb.snapshot();
            if (s.phase === 'lobby') { if (s.seats.length < 2) seatBots(); t = Math.max(t + 1000, s.lobbyUntil); }
            else if (s.phase === 'result') { t = Math.min(s.resultUntil, t + 1500); }   // kết quả đứng vài nhịp cho overlay kịp hiện
            else if (s.holdUntil) { t = s.holdUntil; }
            else if (s.options.length) { tb.comment({ user: { key: s.turnKey }, text: String(s.options[Math.floor(rng() * s.options.length)]) }); }
            tb.tick();
        }
        const s = tb.snapshot();
        s.now = t; s.demo = true;
        s.games = GAME_LIST.map(g => ({ id: g.id, name: g.name, icon: g.icon, unit: g.unit, kind: g.kind }));
        return s;
    }

    function attachSocket(socket) { socket.emit('luotchoi:state', publicState()); }

    function mountRoutes(app, { publicDir }) {
        app.get('/api/luotchoi/state', (req, res) => res.json(publicState()));
        app.get('/api/luotchoi/demo', (req, res) => res.json(demoState(String(req.query.game || 'hama'), req.query.step)));
        app.post('/api/luotchoi/cmd', (req, res) => {
            const b = req.body || {};
            res.json(control(String(b.cmd || ''), b));
        });
        app.get('/overlay/luotchoi', (req, res) => res.sendFile(path.join(publicDir, 'games', 'luotchoi', 'overlay.html')));
    }

    function start() {
        if (tickTimer) return;
        tickTimer = setInterval(() => { try { tick(); } catch (e) { log('[luotchoi] tick lỗi: ' + (e && e.message)); } }, TICK_MS);
        if (tickTimer.unref) tickTimer.unref();
    }

    return { addGift, addComment, onRoom, onConfig, control, attachSocket, mountRoutes, start, publicState, demoState, _table: table };
}

module.exports = { createLuotChoiController };
