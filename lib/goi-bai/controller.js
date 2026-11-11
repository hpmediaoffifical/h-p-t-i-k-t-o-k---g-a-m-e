'use strict';
/**
 * 🎧 Gọi Bài — BỘ ĐIỀU PHỐI phía server: nối luật thuần (logic.js) ↔ yt-dlp ↔ trình phát ẩn ↔ overlay/panel.
 * server.js chỉ gọi: addGift / addComment / onRoom / onConfig / attachSocket / mountRoutes / start.
 * Spec: docs/superpowers/specs/2026-11-11-goibai-design.md §3.
 *
 * Socket:
 *  - 'goibai:state'       server → mọi client (overlay, panel), tối đa 4 lần/giây.
 *  - 'goibai:cmd'         server → phòng 'goibai-player' {cmd: play|stop|pause|resume|volume}.
 *  - 'goibai:player:hello' / 'goibai:player'  trình phát → server (chỉ socket tin cậy).
 */
const fs = require('fs');
const path = require('path');
const { createGoiBai, normalizeConfig } = require('./logic');
const { createYtdlp, isStale } = require('./ytdlp');

const PLAYER_ROOM = 'goibai-player';
const RESTORE_MAX_MS = 30 * 60000;
const CHUNK = 1 << 20;           // googlevideo hãm tốc độ yêu cầu lớn → kéo từng khúc 1 MB
const STALL_MS = 30000;          // trình phát im lặng quá lâu khi đang phát → lấy link mới / bỏ bài
const YTDLP_MAX_AGE_DAYS = 21;   // yt-dlp cũ hơn ngần này → tự cập nhật khi bật game

function createGoiBaiController(deps) {
    const { io, dataDir, fetch } = deps;
    const log = deps.log || console.log;
    const getCfg = () => normalizeConfig(deps.getConfig());
    const isBlocked = deps.isBlocked || (() => false);
    const player = () => (typeof deps.playerApi === 'function' ? deps.playerApi() : null);
    const sessionFile = path.join(dataDir, 'goibai-session.json');

    const so = createGoiBai({ config: getCfg(), isBlocked: (t) => { try { return !!isBlocked(t); } catch (_) { return false; } } });
    const yt = createYtdlp({ dir: path.join(dataDir, 'tools'), fetch, log });
    const audioCache = new Map();   // videoId → { url, headers, validUntil, contentType }
    let paused = false;
    let position = { id: '', pos: 0, dur: 0 };
    let attempt = 0;
    let lastError = '';
    let roomId = '';
    let pushTimer = null, lastPush = 0, saveTimer = null, tickTimer = null;
    let resumeAt = null;    // mở lại app giữa bài → bài đó phát tiếp từ giây đã lưu
    let lastPlayerAt = 0;   // lần cuối trình phát báo tin (chống kẹt)
    let hotkeyBusy = [];    // phím tắt app khác đang giữ (Electron báo về) → panel cảnh báo

    const enabled = () => getCfg().enabled === true;
    const playerOnline = () => { try { return (io.sockets.adapter.rooms.get(PLAYER_ROOM)?.size || 0) > 0; } catch (_) { return false; } };
    const toPlayer = (msg) => io.to(PLAYER_ROOM).emit('goibai:cmd', msg);

    // ── trạng thái công khai ───────────────────────────────────────────────
    function publicState() {
        const c = getCfg();
        const s = so.snapshot();
        const now = Date.now();
        return {
            enabled: c.enabled, paused, playerOnline: playerOnline(), now,
            ytdlp: yt.status(), lastError, hotkeyBusy,
            playing: s.playing ? Object.assign(s.playing, { pos: position.id === s.playing.id ? position.pos : 0, dur: (position.id === s.playing.id && position.dur) || s.playing.duration }) : null,
            queue: s.queue.slice(0, 30), queueTotal: s.queue.length,
            passes: s.passes.filter(g => g.validUntil > now),
            cfg: { listRows: c.listRows, idleHint: c.idleHint, countdownSec: c.countdownSec, gifts: c.gifts, songGifts: c.songGifts, volume: c.volume }
        };
    }
    function push(immediate) {
        if (pushTimer) return;
        const wait = immediate ? 0 : Math.max(0, 250 - (Date.now() - lastPush));
        pushTimer = setTimeout(() => { pushTimer = null; lastPush = Date.now(); io.emit('goibai:state', publicState()); }, wait);
        scheduleSave();
    }

    // ── lưu phiên ──────────────────────────────────────────────────────────
    function saveNow() {
        clearTimeout(saveTimer); saveTimer = null;
        const p = so.playing;
        const resumeAt = p && position.id === p.id ? { id: p.id, pos: position.pos } : null;
        try { fs.writeFileSync(sessionFile, JSON.stringify(Object.assign({ savedAt: Date.now(), roomId, resumeAt }, so.serialize()))); }
        catch (e) { log('[goibai] lưu phiên lỗi: ' + e.message); }
    }
    // Nhịp tiến độ / quà: gom 1 giây. Lệnh streamer + hết bài: ghi NGAY (bỏ bài rồi tắt app liền → lần mở sau
    // bài vừa bỏ không được sống lại — gặp khi thử thật 12/11/2026).
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 1000);
    }
    function restore() {
        try {
            const d = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            if (!d || Date.now() - Number(d.savedAt) > RESTORE_MAX_MS) return;
            so.restore(d);
            roomId = String(d.roomId || '');
            if (d.resumeAt && d.resumeAt.id) resumeAt = { id: String(d.resumeAt.id), pos: Math.max(0, Number(d.resumeAt.pos) || 0) };
            log(`[goibai] khôi phục phiên: ${so.snapshot().queue.length} bài, ${so.snapshot().passes.length} lượt`);
        } catch (_) {}
    }
    function dropSession() { try { fs.unlinkSync(sessionFile); } catch (_) {} }

    // ── tìm bài ────────────────────────────────────────────────────────────
    async function resolve(row) {
        if (!row) return;
        push();
        if (!yt.status().installed) {
            so.rejectRow(row.id, 'noengine');
            if (!yt.busy && enabled()) yt.install(() => push());
            push(); return;
        }
        try {
            const items = await yt.search(row.query, 5);
            const r = so.applySearch(row.id, items);
            if (!r.ok && r.reason !== 'gone') log(`[goibai] "${row.query}" bị loại: ${r.reason}`);
        } catch (e) {
            so.rejectRow(row.id, e.code === 'noengine' ? 'noengine' : 'error');
            log(`[goibai] tìm "${row.query}" lỗi: ${e.message}`);
        }
        push();
        pump();
    }

    async function getAudio(videoId, fresh) {
        const c = audioCache.get(videoId);
        if (!fresh && c && c.validUntil > Date.now() + 60000) return c;
        const a = await yt.resolveAudio(videoId);
        audioCache.set(videoId, a);
        if (audioCache.size > 20) audioCache.delete(audioCache.keys().next().value);
        return a;
    }

    // ── phát ───────────────────────────────────────────────────────────────
    let pumping = false;
    async function pump() {
        if (pumping || !enabled() || paused || so.playing || !playerOnline()) return;
        const next = so.peekNext();
        if (!next) return;
        pumping = true;
        try {
            so.beginPlay(next.id);
            const startAt = resumeAt && resumeAt.id === next.id ? resumeAt.pos : 0;
            resumeAt = null;
            position = { id: next.id, pos: startAt, dur: next.duration };
            attempt = 0;
            push(true);
            await sendPlay(next, startAt, false);
        } finally { pumping = false; }
    }
    async function sendPlay(row, startAt, fresh) {
        try {
            await getAudio(row.videoId, fresh);
            if (!so.playing || so.playing.id !== row.id) return;
            toPlayer({ cmd: 'play', id: row.id, src: `/api/goibai/stream?v=${encodeURIComponent(row.videoId)}${fresh ? '&r=' + Date.now() : ''}`, startAt, volume: getCfg().volume, title: row.title });
            lastPlayerAt = Date.now();
            lastError = '';
            prefetchNext();
        } catch (e) {
            lastError = `Không phát được "${row.title}": ${e.message}`;
            log('[goibai] ' + lastError);
            if (so.playing && so.playing.id === row.id) so.endPlay();
            push(true);
            setTimeout(pump, 500);
        }
    }
    function prefetchNext() {
        const n = so.peekNext();
        if (n && n.videoId) getAudio(n.videoId).catch(() => {});
    }
    function onPlayerEvent(ev) {
        const p = so.playing;
        if (!ev || !p || ev.id !== p.id) return;
        if (ev.type !== 'error') lastPlayerAt = Date.now();
        if (ev.type === 'progress' || ev.type === 'started') {
            position = { id: p.id, pos: Number(ev.pos) || 0, dur: Number(ev.dur) || p.duration };
            push();
        } else if (ev.type === 'ended') {
            so.endPlay(); position = { id: '', pos: 0, dur: 0 };
            push(true); saveNow(); pump();
        } else if (ev.type === 'error') {
            if (attempt < 1) { attempt++; sendPlay(p, Number(ev.pos) || position.pos || 0, true); return; }
            lastError = `Bỏ qua "${p.title}" — trình phát báo lỗi ${String(ev.message || '').slice(0, 80)}`;
            log('[goibai] ' + lastError);
            so.endPlay(); push(true); pump();
        }
    }

    // ── điều khiển ─────────────────────────────────────────────────────────
    function control(cmd, payload = {}) {
        switch (cmd) {
            case 'skip': if (so.playing) { toPlayer({ cmd: 'stop' }); so.endPlay(); } break;
            case 'pause': paused = true; toPlayer({ cmd: 'pause' }); break;
            case 'resume': paused = false; toPlayer({ cmd: 'resume' }); break;
            case 'togglePause': return control(paused ? 'resume' : 'pause');
            case 'clear': toPlayer({ cmd: 'stop' }); so.clear(); break;
            case 'remove': so.remove(String(payload.id || '')); break;
            case 'pinTop': so.pinTop(String(payload.id || '')); break;
            default: return { ok: false, error: 'Lệnh không hợp lệ' };
        }
        push(true);
        saveNow();
        setTimeout(pump, 50);
        return { ok: true };
    }

    // ── móc từ server.js ───────────────────────────────────────────────────
    const userOf = (e) => ({ key: String(e.uniqueId || e.userId || ''), nickname: String(e.nickname || e.uniqueId || ''), avatar: String(e.profilePictureUrl || e.profilePicture || '') });

    function addGift(g) {
        if (!enabled() || !g) return;
        const coins = (Number(g.coinValue) || 0) * Math.max(1, parseInt(g.repeatCount, 10) || 1);
        const cfg = getCfg();
        if (g.musicGift && g.song && g.song.song && cfg.songGifts) {
            const row = so.addSongGift({ user: userOf(g), coins, song: g.song.song, artist: g.song.artist, giftImage: g.image || g.giftPicture || '' });
            if (row) resolve(row);
            return;
        }
        const r = so.addGift({ user: userOf(g), giftId: String(g.giftId ?? ''), coins, giftImage: g.image || g.giftPicture || '' });
        if (r.action !== 'ignored') push(true);
    }
    function addComment(c) {
        if (!enabled() || !c) return;
        const row = so.addComment({ user: userOf(c), text: c.comment });
        if (row) resolve(row);
    }
    function onRoom(id) {
        const rid = String(id || '');
        if (!rid) return;
        if (roomId && rid !== roomId && (so.snapshot().queue.length || so.snapshot().passes.length)) {
            log('[goibai] phòng LIVE mới → bỏ hàng chờ của buổi trước');
            toPlayer({ cmd: 'stop' }); so.clear(); push(true);
        }
        roomId = rid;
        scheduleSave();
    }
    function applyEnabled(on) {
        try { player()?.ensure?.(on); } catch (e) { log('[goibai] trình phát: ' + e.message); }
        if (!on || yt.busy) return;
        if (!yt.status().installed) { yt.install(() => push()); return; }
        // YouTube đổi cách chặn liên tục → bản yt-dlp quá 21 ngày thì tự lấy bản mới (vẫn qua kiểm SHA-256)
        yt.version().then(v => { if (isStale(v, Date.now(), YTDLP_MAX_AGE_DAYS) && !yt.busy) { log(`[goibai] yt-dlp ${v} đã cũ → cập nhật`); yt.install(() => push()); } }).catch(() => {});
    }
    function onConfig(prevEnabled) {
        const c = getCfg();
        so.setConfig(c);
        if (c.enabled && !prevEnabled) applyEnabled(true);
        if (!c.enabled && prevEnabled) { toPlayer({ cmd: 'stop' }); so.clear(); paused = false; dropSession(); applyEnabled(false); }
        toPlayer({ cmd: 'volume', volume: c.volume });
        push(true);
        pump();
    }

    function attachSocket(socket, onTrusted) {
        socket.emit('goibai:state', publicState());
        onTrusted('goibai:player:hello', () => {
            socket.join(PLAYER_ROOM);
            socket.emit('goibai:cmd', { cmd: 'volume', volume: getCfg().volume });
            const p = so.playing;
            if (p) sendPlay(p, position.id === p.id ? position.pos : 0, false);   // cửa sổ phát vừa nạp lại → phát tiếp
            if (paused) socket.emit('goibai:cmd', { cmd: 'pause' });
            push(true); pump();
        });
        onTrusted('goibai:player', (ev) => onPlayerEvent(ev));
        // Trình phát rời phòng → báo lại trạng thái "loa" cho panel (đợi socket.io gỡ phòng xong)
        socket.on('disconnect', () => setTimeout(() => push(true), 50));
    }

    // ── route ──────────────────────────────────────────────────────────────
    async function streamRoute(req, res) {
        const v = String(req.query.v || '');
        const a = audioCache.get(v);
        if (!a) return res.status(404).end();
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
        let start = m && m[1] ? Number(m[1]) : 0;
        let end = m && m[2] ? Number(m[2]) : null;
        let closed = false;
        req.on('close', () => { closed = true; });
        const getChunk = (s, e) => fetch(a.url, { headers: Object.assign({}, a.headers, { Range: `bytes=${s}-${e}` }) });
        try {
            const first = await getChunk(start, end != null ? Math.min(end, start + CHUNK - 1) : start + CHUNK - 1);
            if (first.status !== 206 && first.status !== 200) {
                audioCache.delete(v);
                return res.status(502).end();
            }
            const cr = /\/(\d+)\s*$/.exec(String(first.headers.get('content-range') || ''));
            const total = cr ? Number(cr[1]) : Number(first.headers.get('content-length')) || 0;
            if (!total || start >= total) { first.body.resume?.(); return res.status(416).set('Content-Range', `bytes */${total}`).end(); }
            end = end == null ? total - 1 : Math.min(end, total - 1);
            const headers = { 'Content-Type': a.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': String(end - start + 1) };
            if (m) { headers['Content-Range'] = `bytes ${start}-${end}/${total}`; res.writeHead(206, headers); }
            else res.writeHead(200, headers);
            const pipeBody = (r) => new Promise((ok, bad) => {
                r.body.on('data', (d) => { if (closed) { r.body.destroy(); ok(); return; } res.write(d); });
                r.body.on('end', ok); r.body.on('error', bad);
            });
            await pipeBody(first);
            let pos = Math.min(end, start + CHUNK - 1) + 1;
            while (!closed && pos <= end) {
                const e = Math.min(end, pos + CHUNK - 1);
                const r = await getChunk(pos, e);
                if (r.status !== 206 && r.status !== 200) throw new Error('googlevideo ' + r.status);
                await pipeBody(r);
                pos = e + 1;
            }
            res.end();
        } catch (e) {
            if (!res.headersSent) res.status(502).end(); else res.destroy();
        }
    }

    function mountRoutes(app, { publicDir }) {
        app.get('/api/goibai/state', (req, res) => res.json(publicState()));
        app.post('/api/goibai/control', (req, res) => {
            const b = req.body || {};
            res.json(control(String(b.cmd || ''), b));
        });
        app.post('/api/goibai/test', (req, res) => {
            const b = req.body || {};
            const nickname = String(b.nickname || 'Người xem thử').slice(0, 40);
            const user = { key: 'test:' + nickname, nickname, avatar: '' };
            const coins = Math.max(1, Math.min(100000, Number(b.coins) || 1));
            const song = String(b.song || '').trim().slice(0, 100);
            if (b.music) {
                const row = so.addSongGift({ user, coins: coins || 199, song: song || 'Nơi Này Có Anh', artist: String(b.artist || '') });
                if (!row) return res.json({ ok: false, error: 'Đang tắt nhận quà Ca khúc' });
                resolve(row);
                return res.json({ ok: true, row: row.id });
            }
            const r = so.addGift({ user, giftId: '', coins, force: true });
            let row = null;
            if (song) { row = so.addComment({ user, text: song }); if (row) resolve(row); }
            push(true);
            res.json({ ok: true, action: r.action, row: row && row.id });
        });
        app.post('/api/goibai/ytdlp', async (req, res) => {
            const act = String((req.body || {}).action || 'install');
            if (act !== 'install' && act !== 'update') return res.status(400).json({ ok: false, error: 'action sai' });
            yt.install(() => push(true));
            res.json({ ok: true, status: yt.status() });
        });
        app.get('/api/goibai/stream', streamRoute);
        app.get('/overlay/goibai', (req, res) => res.sendFile(path.join(publicDir, 'games', 'goibai', 'overlay.html')));
        app.get('/player/goibai', (req, res) => res.sendFile(path.join(publicDir, 'games', 'goibai', 'player.html')));
    }

    function start() {
        restore();
        if (yt.status().installed) yt.version().then(() => push()).catch(() => {});
        tickTimer = setInterval(() => {
            if (!enabled()) return;
            const changed = so.tick();
            if (changed || so.snapshot().passes.length) push();
            // Chống kẹt: đang phát mà trình phát im lặng quá lâu (mạng đứt giữa chừng, link hết hạn…) → coi như lỗi:
            // lần 1 lấy link mới phát tiếp, lần 2 bỏ bài. Không có cái này, hàng chờ đứng im cả buổi LIVE.
            const p = so.playing;
            if (p && !paused && playerOnline() && Date.now() - lastPlayerAt > STALL_MS) {
                lastPlayerAt = Date.now();
                onPlayerEvent({ type: 'error', id: p.id, pos: position.pos, message: 'trình phát không phản hồi' });
            }
            pump();
        }, 1000);
        if (tickTimer.unref) tickTimer.unref();
        if (enabled()) setTimeout(() => applyEnabled(true), 1500);
    }

    function setHotkeyBusy(list) { hotkeyBusy = Array.isArray(list) ? list.map(String).slice(0, 4) : []; push(true); }

    return { addGift, addComment, onRoom, onConfig, setHotkeyBusy, attachSocket, mountRoutes, start, control, publicState, _so: so, _yt: yt };
}

module.exports = { createGoiBaiController, PLAYER_ROOM };
