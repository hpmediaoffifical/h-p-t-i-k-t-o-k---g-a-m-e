'use strict';
/**
 * 🕹️ Gắp Thú + 🎲 Xúc Xắc — phần chạy trên server (spec 2026-11-12-gapthu-xucxac-design.md §2).
 * Server giữ hàng chờ + quyết kết quả từng lượt → phát '<id>:turn' cho overlay & khung xem thử cùng lúc,
 * '<id>:state' (hàng chờ + lượt gần đây) cho panel. Luật thuần ở lib/gift-turns.js, lib/gapthu.js, lib/xucxac.js.
 *
 * install({ app, io, getConfig(id) }) → { onGift(enrichedGift) }
 */
const path = require('path');
const Turns = require('./gift-turns');
const GapThu = require('./gapthu');
const XucXac = require('./xucxac');

const HISTORY_MAX = 12;

function install({ app, io, getConfig, publicDir }) {
    const games = {
        gapthu: {
            norm: GapThu.normalizeConfig,
            misses: 0,
            roll(cfg, item) {
                const result = GapThu.rollGrab(cfg, { sure: item.sure, misses: this.misses }, Math.random);
                this.misses = GapThu.nextMisses(this.misses, result);
                return { ...result, pityLeft: cfg.pity > 0 ? Math.max(0, cfg.pity - this.misses) : 0 };
            },
            brief: r => r.win ? `${r.prize.icon} ${r.prize.name}` : 'trượt'
        },
        xucxac: {
            norm: XucXac.normalizeConfig,
            roll: cfg => XucXac.rollTurn(cfg, Math.random),
            brief: r => `${r.values.join('+')}${r.values.length > 1 ? '=' + r.total : ''}${r.text ? ' · ' + r.text : ''}`
        }
    };

    for (const [id, g] of Object.entries(games)) {
        g.id = id;
        g.seq = 0;
        g.current = null;
        g.history = [];
        g.cfg = () => g.norm(getConfig(id));
        g.runner = Turns.createRunner({
            max: 30,
            turnSec: () => g.cfg().turnSec,
            onTurn: (item, ms, left) => {
                const cfg = g.cfg();
                const result = g.roll(cfg, item);
                const turn = { id: ++g.seq, ms, left, ts: Date.now(), result,
                    nickname: item.nickname, avatar: item.avatar, giftName: item.giftName, giftImage: item.giftImage, test: !!item.test };
                g.current = turn;
                g.history.unshift({ ts: turn.ts, nickname: turn.nickname, giftName: turn.giftName, test: turn.test, result, brief: g.brief(result) });
                g.history.length = Math.min(g.history.length, HISTORY_MAX);
                io.to('overlay').to('preview').emit(id + ':turn', turn);
                emitState(g);
                console.log(`[${id}] ${turn.nickname || '?'} → ${g.brief(result)} (${ms} ms, còn ${left})`);
            }
        });
    }

    function snapshot(g) {
        return { queue: g.runner.size(), busy: g.runner.busy(), history: g.history, current: g.current, misses: g.misses || 0 };
    }
    function emitState(g) { io.to('preview').emit(g.id + ':state', snapshot(g)); }

    function enqueue(g, base, n, sure) {
        const item = {
            nickname: String(base.nickname || base.uniqueId || '').slice(0, 40),
            avatar: String(base.profilePictureUrl || base.profilePicture || ''),
            giftName: String(base.giftName || '').slice(0, 40),
            giftImage: String(base.image || base.giftPicture || base.giftImage || ''),
            sure: !!sure, test: !!base.test || base.source === 'test'
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
                if (turns > 0) enqueue(g, gift, turns, sure);
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
        // ▶ Thử: đi đúng runner như quà thật (không cần LIVE, không cần game bật).
        app.post(`/api/${id}/test`, (req, res) => {
            const cfg = g.cfg();
            const rule = cfg.gifts.find(x => x.giftId === String(req.body?.giftId || ''));
            const n = Math.min(10, Math.max(1, Math.floor(Number(req.body?.count) || (rule ? rule.turns : 1))));
            const got = enqueue(g, { nickname: String(req.body?.nickname || 'Thử nghiệm'), giftName: rule ? rule.giftName : 'Lượt thử',
                image: rule ? rule.giftImage : '', test: true }, n, rule ? rule.sure : false);
            res.json({ ok: true, added: got, queue: g.runner.size() });
        });
        app.post(`/api/${id}/control`, (req, res) => {
            const cmd = String(req.body?.cmd || '');
            if (cmd === 'clear') g.runner.clear();
            else if (cmd === 'resetPity' && id === 'gapthu') g.misses = 0;
            else if (cmd === 'history') g.history = [];
            else return res.status(400).json({ ok: false, error: 'cmd không hợp lệ' });
            emitState(g);
            res.json({ ok: true, ...snapshot(g) });
        });
    }

    return { onGift, snapshot: id => games[id] ? snapshot(games[id]) : null };
}

module.exports = { install };
