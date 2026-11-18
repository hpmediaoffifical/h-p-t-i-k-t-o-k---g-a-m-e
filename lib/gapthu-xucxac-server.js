'use strict';
/**
 * 🕹️ Gắp Thú + 🎲 Xúc Xắc — phần chạy trên server (spec 2026-11-12-gapthu-xucxac-design.md §2, §3.3).
 * Server giữ hàng chờ + quyết kết quả từng lượt → phát '<id>:turn' cho overlay & khung xem thử cùng lúc,
 * '<id>:state' (hàng chờ + lượt gần đây) cho panel. Luật thuần ở lib/gift-turns.js, lib/gapthu.js, lib/xucxac.js.
 *
 * Gắp Thú có lượt TỰ LÁI (quà ≥ steerMinCoins): runner giữ lượt ({hold}), bình luận của người tặng (onChat) đẩy càng
 * → 'gapthu:steer'; "gắp" hoặc hết giờ → resolveSteer → 'gapthu:drop' → runner.release.
 *
 * install({ app, io, getConfig(id), publicDir }) → { onGift(enrichedGift), onChat({uniqueId, nickname, comment}) }
 */
const path = require('path');
const fs = require('fs');
const Turns = require('./gift-turns');
const GapThu = require('./gapthu');
const XucXac = require('./xucxac');

const HISTORY_MAX = 12;
// cắt theo ký tự thật (không chẻ đôi emoji) + dấu … khi dài
const cut = (v, n) => { const a = Array.from(String(v || '')); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
const MIN_STEER_SEC = 8;

function install({ app, io, getConfig, publicDir, dataDir, clock, express }) {
    const ck = clock || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: t => clearTimeout(t), now: () => Date.now() };
    const toAll = (ev, data) => io.to('overlay').to('preview').emit(ev, data);

    const games = {
        gapthu: {
            norm: GapThu.normalizeConfig,
            misses: 0,
            layout: null,
            steer: null,
            dance: null,             // 💃 { phase: 'wait'|'on', nickname, avatar, test, endsAt, timers }
            danceLastEnd: -Infinity, // lúc lần nhảy trước KẾT THÚC (tính hồi)
            danceLog: [],
            brief: (r, mode) => (mode === 'steer' ? '🎮 ' : '') + (r.win ? `${r.prize.icon} ${r.prize.name}` : (r.kind === 'empty' ? 'hụt' : 'trượt'))
        },
        xucxac: {
            norm: XucXac.normalizeConfig,
            brief: r => `${r.values.join('+')}${r.values.length > 1 ? '=' + r.total : ''}${r.text ? ' · ' + r.text : ''}`
        }
    };

    function pushHistory(g, turn, result, mode) {
        g.history.unshift({ ts: ck.now(), nickname: turn.nickname, giftName: turn.giftName, test: turn.test, mode: mode || 'auto', result, brief: g.brief(result, mode) });
        g.history.length = Math.min(g.history.length, HISTORY_MAX);
    }
    function baseTurn(g, item, ms, left) {
        return { id: ++g.seq, ms, left, ts: ck.now(), nickname: item.nickname, uniqueId: item.uniqueId, avatar: item.avatar,
            giftName: item.giftName, giftImage: item.giftImage, test: !!item.test };
    }

    // ---------- 🕹️ Gắp Thú ----------
    const gt = games.gapthu;
    const danceOn = cfg => GapThu.danceReady(cfg, { now: ck.now(), lastEndAt: gt.danceLastEnd, active: !!gt.dance });
    function gtLayout(cfg) {
        gt.layout = GapThu.syncDance(GapThu.fixLayout(gt.layout, cfg.prizes, Math.random), cfg.prizes, danceOn(cfg), Math.random);
        return gt.layout;
    }
    const DANCE_PRIZE = { id: GapThu.DANCE_ID, name: 'Streamer nhảy', icon: '💃', dance: true };

    // ---------- 💃 Streamer nhảy: diễn xong lượt → khung đếm ngược, hàng chờ đứng tới hết giờ / Xong / Bỏ qua ----------
    function scheduleDance(afterMs, who) {
        gt.dance = { phase: 'wait', nickname: who.nickname, avatar: who.avatar, test: !!who.test, timers: [] };
        gt.dance.timers.push(ck.setTimeout(startDance, Math.max(0, afterMs)));
    }
    function startDance() {
        const d = gt.dance; if (!d) return;
        const cfg = gt.cfg(), sec = cfg.dance.sec;
        d.phase = 'on'; d.endsAt = ck.now() + sec * 1000;
        toAll('gapthu:dance', { phase: 'start', nickname: d.nickname, avatar: d.avatar, sec, secLeft: sec,
            text: cfg.dance.text.replace(/\{name\}/g, d.nickname || 'Ẩn danh'), image: cfg.dance.image, sound: cfg.dance.sound });
        d.timers.push(ck.setTimeout(() => endDance('timeout'), sec * 1000));
        emitState(gt);
        console.log(`[gapthu] 💃 ${d.nickname || '?'} gắp trúng Streamer — nhảy ${sec}s, hàng chờ tạm dừng`);
    }
    function endDance(reason) {
        const d = gt.dance; if (!d) return false;
        d.timers.forEach(t => ck.clearTimeout(t));
        gt.dance = null;
        gt.danceLastEnd = ck.now();
        gt.danceLog.unshift({ ts: ck.now(), nickname: d.nickname, reason, test: d.test });
        gt.danceLog.length = Math.min(gt.danceLog.length, 30);
        toAll('gapthu:dance', { phase: 'end', reason, sound: gt.cfg().dance.sound });
        emitState(gt);
        console.log(`[gapthu] 💃 hết nhảy (${reason}) — hồi ${gt.cfg().dance.cooldownSec}s, hàng chờ chạy tiếp`);
        gt.runner.release(300);
        return true;
    }
    // chưa có giải nào trúng được (rỗng / mọi tỉ trọng 0) → không hứa "còn N lượt nữa là chắc trúng"
    const pityLeft = cfg => cfg.pity > 0 && (cfg.prizes || []).some(p => Number(p.weight) > 0) ? Math.max(0, cfg.pity - gt.misses) : 0;
    const clawXOf = cell => Math.round((0.12 + (GapThu.cellPos(cell).col + 0.5) / GapThu.GRID.cols * 0.76) * 1000) / 1000;

    function gtAutoTurn(cfg, item, ms, left) {
        const layout = gtLayout(cfg);
        const r = item.forceDance
            ? { win: true, prize: { ...DANCE_PRIZE }, clawX: 0.5, slipAt: 0, pityHit: false, dance: true }   // 🧪 ép trúng (bỏ qua hồi)
            : GapThu.rollGrab(cfg, { sure: item.sure, misses: gt.misses, dance: danceOn(cfg) }, Math.random);
        gt.misses = GapThu.nextMisses(gt.misses, r);
        const a = GapThu.autoCell(layout, r, Math.random);
        const result = { ...r, cell: a.cell, clawX: clawXOf(a.cell), kind: r.win ? 'grab' : 'slip', pityLeft: pityLeft(cfg) };
        const layoutAfter = r.win ? GapThu.refillCell(a.layout, a.cell, cfg.prizes, Math.random) : a.layout;
        gt.layout = layoutAfter;
        const turn = { ...baseTurn(gt, item, ms, left), mode: 'auto', result, layout: a.layout, layoutAfter };
        return turn;
    }

    function gtStartSteer(cfg, item, ms, left) {
        const layout = gtLayout(cfg);
        const sec = Math.max(MIN_STEER_SEC, Math.round(cfg.steerSec / Turns.speedFactor(left)));
        const turn = { ...baseTurn(gt, item, ms, left), mode: 'steer', layout,
            steer: { pos: { ...GapThu.START }, stepsLeft: cfg.steerSteps, steps: cfg.steerSteps, sec, secLeft: sec } };
        gt.steer = { turn, item, pos: { ...GapThu.START }, stepsLeft: cfg.steerSteps, endsAt: ck.now() + sec * 1000, left,
            timer: ck.setTimeout(() => gtFinishSteer('timeout'), sec * 1000) };
        return turn;
    }
    const secLeft = s => Math.max(0, Math.ceil((s.endsAt - ck.now()) / 1000));

    function gtFinishSteer(reason) {
        const s = gt.steer;
        if (!s) return;
        gt.steer = null;
        ck.clearTimeout(s.timer);
        const cfg = gt.cfg();
        const layout = gtLayout(cfg);
        const r = GapThu.resolveSteer(cfg, layout, s.pos, { sure: s.item.sure, misses: gt.misses }, Math.random);
        gt.misses = GapThu.nextMisses(gt.misses, r);
        const result = { ...r, clawX: clawXOf(r.cell), pityLeft: pityLeft(cfg) };
        const layoutAfter = r.win ? GapThu.refillCell(layout, r.cell, cfg.prizes, Math.random) : layout;
        gt.layout = layoutAfter;
        // phần thả càng (hạ → kẹp → nâng → về cửa) + thẻ kết quả: cùng nhịp tăng tốc như lượt thường
        const ms = Math.max(2400, Math.round(Turns.turnMs(cfg.turnSec, gt.runner.size()) * 0.9));
        const drop = { id: s.turn.id, ms, reason, pos: s.pos, result, layout, layoutAfter, nickname: s.turn.nickname, avatar: s.turn.avatar };
        gt.current = { ...s.turn, mode: 'steer', result, steer: null };
        pushHistory(gt, s.turn, result, 'steer');
        toAll('gapthu:drop', drop);
        console.log(`[gapthu] 🎮 ${s.turn.nickname || '?'} thả càng (${reason}) ô ${r.cell} → ${gt.brief(result)}`);
        if (result.win && result.prize && result.prize.dance) scheduleDance(Math.round(ms * 0.85), s.turn);
        else gt.runner.release(ms);
        emitState(gt);
    }

    /** Bình luận: chỉ người đang lái điều khiển; câu không phải lệnh = trò chuyện (bỏ qua). */
    function onChat(chat) {
        const s = gt.steer;
        if (!s || !chat) return false;
        if (gt.cfg().enabled === false) return false;   // game đã tắt: người lái không điều khiển được nữa
        const sameId = s.item.uniqueId && chat.uniqueId && String(s.item.uniqueId) === String(chat.uniqueId);
        const sameName = !s.item.uniqueId && s.item.nickname && chat.nickname === s.item.nickname;
        if (!sameId && !sameName) return false;
        const cmd = GapThu.parseSteer(chat.comment);
        if (!cmd) return false;
        const m = GapThu.applyMoves(s.pos, cmd.moves, s.stepsLeft);
        if (m.used) {
            s.pos = m.pos; s.stepsLeft -= m.used;
            toAll('gapthu:steer', { id: s.turn.id, pos: s.pos, stepsLeft: s.stepsLeft, secLeft: secLeft(s), dir: m.last });
        }
        if (cmd.grab) gtFinishSteer('grab');
        return true;
    }

    gt.onTurn = (cfg, item, ms, left) => item.mode === 'steer' ? gtStartSteer(cfg, item, ms, left) : gtAutoTurn(cfg, item, ms, left);

    // ---------- 🎲 Xúc Xắc ----------
    games.xucxac.onTurn = (cfg, item, ms, left) => ({ ...baseTurn(games.xucxac, item, ms, left), result: XucXac.rollTurn(cfg, Math.random) });

    for (const [id, g] of Object.entries(games)) {
        g.id = id;
        g.seq = 0;
        g.current = null;
        g.history = [];
        g.cfg = () => g.norm(getConfig(id));
        g.runner = Turns.createRunner({
            max: 30, clock: ck,
            turnSec: () => g.cfg().turnSec,
            onTurn: (item, ms, left) => {
                const turn = g.onTurn(g.cfg(), item, ms, left);
                g.current = turn;
                if (turn.mode !== 'steer') pushHistory(g, turn, turn.result, turn.mode);
                // 💃 trúng Streamer ở lượt tự gắp: diễn xong phần gắp (~85 % ms, lúc hiện thẻ) rồi mới mở khung nhảy
                const dance = g === gt && turn.mode !== 'steer' && turn.result.win && turn.result.prize && turn.result.prize.dance;
                if (dance) scheduleDance(Math.round(ms * 0.85), turn);
                toAll(id + ':turn', turn);
                emitState(g);
                if (dance) { console.log(`[${id}] ${turn.nickname || '?'} → 💃 Streamer nhảy`); return { hold: true }; }
                if (turn.mode === 'steer') {
                    console.log(`[${id}] 🎮 ${turn.nickname || '?'} tự lái ${turn.steer.sec}s / ${turn.steer.steps} bước (còn ${left})`);
                    return { hold: true };
                }
                console.log(`[${id}] ${turn.nickname || '?'} → ${g.brief(turn.result, turn.mode)} (${ms} ms, còn ${left})`);
                return undefined;
            }
        });
    }

    function snapshot(g) {
        const out = { queue: g.runner.size(), busy: g.runner.busy(), history: g.history, current: g.current, misses: g.misses || 0 };
        if (g === gt) {
            out.layout = gtLayout(gt.cfg());
            out.steer = gt.steer ? { id: gt.steer.turn.id, nickname: gt.steer.turn.nickname, pos: gt.steer.pos, stepsLeft: gt.steer.stepsLeft, secLeft: secLeft(gt.steer) } : null;
            const cfg = gt.cfg();
            out.dance = gt.dance ? { phase: gt.dance.phase, nickname: gt.dance.nickname, avatar: gt.dance.avatar, sec: cfg.dance.sec,
                secLeft: gt.dance.endsAt ? Math.max(0, Math.ceil((gt.dance.endsAt - ck.now()) / 1000)) : null,
                text: cfg.dance.text.replace(/\{name\}/g, gt.dance.nickname || 'Ẩn danh'), image: cfg.dance.image } : null;
            out.danceCooldown = gt.dance || !cfg.dance.enabled ? 0 : Math.max(0, Math.ceil((gt.danceLastEnd + cfg.dance.cooldownSec * 1000 - ck.now()) / 1000));
            out.danceLog = gt.danceLog;
        }
        return out;
    }
    function emitState(g) { io.to('preview').emit(g.id + ':state', snapshot(g)); }

    function enqueue(g, base, n, sure, mode) {
        const item = {
            uniqueId: String(base.uniqueId || ''),
            nickname: cut(base.nickname || base.uniqueId, 40),
            avatar: String(base.profilePictureUrl || base.profilePicture || ''),
            giftName: cut(base.giftName, 40),
            giftImage: String(base.image || base.giftPicture || base.giftImage || ''),
            sure: !!sure, mode: mode || 'auto', test: !!base.test || base.source === 'test', forceDance: !!base.forceDance
        };
        const got = g.runner.add(Array.from({ length: n }, () => ({ ...item })));
        if (got < n) console.warn(`[${g.id}] hàng chờ đầy — bỏ ${n - got} lượt của ${item.nickname || '?'}`);
        emitState(g);
        return got;
    }

    function onGift(gift) {
        for (const g of Object.values(games)) {
            try {
                const cfg = g.cfg();
                if (cfg.enabled === false) continue;
                const { turns, sure } = Turns.turnsForGift(cfg, gift);
                const mode = g === gt ? GapThu.turnMode(cfg, gift.coinValue) : 'auto';
                if (turns > 0) enqueue(g, gift, turns, sure, mode);
            } catch (e) { console.warn(`[${g.id}] quà lỗi:`, e?.message || e); }
        }
    }

    // Bảng kết quả mặc định theo số viên (panel nút "Bảng mặc định" / đổi số viên) — 1 nguồn duy nhất ở lib/xucxac.js.
    app.get('/api/xucxac/default-outcomes', (req, res) => res.json(XucXac.defaultOutcomes(req.query.n)));

    for (const [id, g] of Object.entries(games)) {
        app.get('/overlay/' + id, (req, res) => {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.sendFile(path.join(publicDir, 'games', id, 'overlay.html'));
        });
        app.get(`/api/${id}/state`, (req, res) => res.json(snapshot(g)));
        // ▶ Thử: đi đúng runner như quà thật (không cần LIVE, không cần game bật). {steer:true} = lượt tự lái thử.
        app.post(`/api/${id}/test`, (req, res) => {
            const cfg = g.cfg();
            const rule = cfg.gifts.find(x => x.giftId === String(req.body?.giftId || ''));
            const n = Math.min(10, Math.max(1, Math.floor(Number(req.body?.count) || (rule ? rule.turns : 1))));
            const mode = g === gt && req.body?.steer ? 'steer' : 'auto';
            const got = enqueue(g, { uniqueId: String(req.body?.uniqueId || 'tester'), nickname: String(req.body?.nickname || 'Thử nghiệm'),
                giftName: rule ? rule.giftName : 'Lượt thử', image: rule ? rule.giftImage : '', test: true }, n, rule ? rule.sure : false, mode);
            res.json({ ok: true, added: got, queue: g.runner.size(), mode });
        });
        app.post(`/api/${id}/control`, (req, res) => {
            const cmd = String(req.body?.cmd || '');
            if (cmd === 'clear') g.runner.clear();
            else if (cmd === 'resetPity' && id === 'gapthu') g.misses = 0;
            else if (cmd === 'drop' && id === 'gapthu') gtFinishSteer('panel');   // streamer bấm thả hộ người đang lái
            else if ((cmd === 'danceDone' || cmd === 'danceSkip') && id === 'gapthu') endDance(cmd === 'danceDone' ? 'done' : 'skip');
            else if (cmd === 'forceDance' && id === 'gapthu') enqueue(g, { uniqueId: 'tester', nickname: String(req.body?.nickname || 'Thử nghiệm'), giftName: 'Ép trúng Streamer', test: true, forceDance: true }, 1, false, 'auto');
            else if (cmd === 'history') g.history = [];
            else return res.status(400).json({ ok: false, error: 'cmd không hợp lệ' });
            emitState(g);
            res.json({ ok: true, ...snapshot(g) });
        });
    }

    // 💃 Ảnh giải Streamer (PNG nền trong) — lưu <DATA_DIR>/gapthu/dance.png; panel tự ghi cfg.dance.image = URL trả về.
    if (dataDir && express) {
        const imgFile = path.join(dataDir, 'gapthu', 'dance.png');
        app.get('/api/gapthu/dance-image', (req, res) => {
            if (!fs.existsSync(imgFile)) return res.status(404).end();
            res.setHeader('Cache-Control', 'no-cache');
            res.type('png').sendFile(imgFile);
        });
        app.post('/api/gapthu/dance-image', express.raw({ limit: '3mb', type: () => true }), (req, res) => {
            const chk = GapThu.checkPng(Buffer.isBuffer(req.body) ? req.body : null);
            if (!chk.ok) {
                const msg = { not_png: 'Chỉ nhận ảnh PNG', too_big_file: 'Ảnh quá 2 MB', too_big_dim: 'Ảnh tối đa 2048×2048' }[chk.error] || 'Ảnh không hợp lệ';
                return res.status(400).json({ ok: false, error: msg });
            }
            try {
                fs.mkdirSync(path.dirname(imgFile), { recursive: true });
                fs.writeFileSync(imgFile, req.body);
            } catch (e) { return res.status(500).json({ ok: false, error: 'Không lưu được ảnh' }); }
            res.json({ ok: true, image: '/api/gapthu/dance-image?v=' + Date.now().toString(36), width: chk.width, height: chk.height });
        });
        app.delete('/api/gapthu/dance-image', (req, res) => {
            try { fs.rmSync(imgFile, { force: true }); } catch (e) {}
            res.json({ ok: true, image: '' });
        });
    }

    // Tắt game giữa chừng: bỏ hàng chờ, huỷ lượt tự lái / khung nhảy đang chờ — không để lượt chạy ngầm khi overlay đã ẩn.
    function stopGame(id) {
        const g = games[id];
        if (!g) return;
        if (g === gt) {
            if (gt.steer) { ck.clearTimeout(gt.steer.timer); gt.steer = null; }
            toAll('gapthu:cancel', { reason: 'disabled' });   // overlay dọn bảng lệnh lái đang treo
            if (gt.dance) { try { endDance('skip'); } catch (_) {} }
        }
        g.runner.stop();
        g.current = null;
        emitState(g);
    }

    return { onGift, onChat, stopGame, snapshot: id => games[id] ? snapshot(games[id]) : null };
}

module.exports = { install };
