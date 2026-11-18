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
const Turns = require('./gift-turns');
const GapThu = require('./gapthu');
const XucXac = require('./xucxac');

const HISTORY_MAX = 12;
const MIN_STEER_SEC = 8;

function install({ app, io, getConfig, publicDir, clock }) {
    const ck = clock || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: t => clearTimeout(t), now: () => Date.now() };
    const toAll = (ev, data) => io.to('overlay').to('preview').emit(ev, data);

    const games = {
        gapthu: {
            norm: GapThu.normalizeConfig,
            misses: 0,
            layout: null,
            steer: null,
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
    function gtLayout(cfg) { gt.layout = GapThu.fixLayout(gt.layout, cfg.prizes, Math.random); return gt.layout; }
    const pityLeft = cfg => cfg.pity > 0 ? Math.max(0, cfg.pity - gt.misses) : 0;
    const clawXOf = cell => Math.round((0.12 + (GapThu.cellPos(cell).col + 0.5) / GapThu.GRID.cols * 0.76) * 1000) / 1000;

    function gtAutoTurn(cfg, item, ms, left) {
        const layout = gtLayout(cfg);
        const r = GapThu.rollGrab(cfg, { sure: item.sure, misses: gt.misses }, Math.random);
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
        emitState(gt);
        console.log(`[gapthu] 🎮 ${s.turn.nickname || '?'} thả càng (${reason}) ô ${r.cell} → ${gt.brief(result)}`);
        gt.runner.release(ms);
    }

    /** Bình luận: chỉ người đang lái điều khiển; câu không phải lệnh = trò chuyện (bỏ qua). */
    function onChat(chat) {
        const s = gt.steer;
        if (!s || !chat) return false;
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
                toAll(id + ':turn', turn);
                emitState(g);
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
        }
        return out;
    }
    function emitState(g) { io.to('preview').emit(g.id + ':state', snapshot(g)); }

    function enqueue(g, base, n, sure, mode) {
        const item = {
            uniqueId: String(base.uniqueId || ''),
            nickname: String(base.nickname || base.uniqueId || '').slice(0, 40),
            avatar: String(base.profilePictureUrl || base.profilePicture || ''),
            giftName: String(base.giftName || '').slice(0, 40),
            giftImage: String(base.image || base.giftPicture || base.giftImage || ''),
            sure: !!sure, mode: mode || 'auto', test: !!base.test || base.source === 'test'
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
            else if (cmd === 'history') g.history = [];
            else return res.status(400).json({ ok: false, error: 'cmd không hợp lệ' });
            emitState(g);
            res.json({ ok: true, ...snapshot(g) });
        });
    }

    return { onGift, onChat, snapshot: id => games[id] ? snapshot(games[id]) : null };
}

module.exports = { install };
