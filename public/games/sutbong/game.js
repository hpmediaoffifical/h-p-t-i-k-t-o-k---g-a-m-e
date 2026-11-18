// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
/* ⚽ Sút Bóng Vào Gôn - engine thuần (không DOM). Dùng chung cho overlay (browser) và server/test (node).
 * Spec: docs/superpowers/specs/2026-11-12-sutbong-design.md. Đơn vị px sân khấu 1080×1920, ms; y tăng xuống dưới.
 *
 * Camera = mắt người sút. Cú sút: pha 'spot' (bóng nằm chấm phạt đền mép dưới, báo trước) → 'fly' (bay tới đích trong khung
 * thành, phối cảnh thật: to → nhỏ, nhanh → chậm) → 'saved' (thủ môn đẩy ra) | 'goal' (lọt lưới) → xoá.
 * Cản (engine.contact): tay trong tầm bóng khi bóng đã tới gần mặt phẳng thủ môn (u ≥ BLOCK_U). Tới đích rồi vẫn chờ
 * latencyMs để khung camera trễ kịp báo; khung chụp lúc atClock so với vị trí bóng LÚC ĐÓ (lịch sử).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.sutbong = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // mult = nhân điểm · time = nhân thời gian bay · curve = độ cong (px thế giới) · size = cỡ bóng
    const SHOT_TYPES = {
        normal: { icon: '⚽', name: hpT('Sút thường'), mult: 1, time: 1, curve: 0, size: 1 },
        curve: { icon: '🌀', name: hpT('Sút cong'), mult: 1, time: 1.1, curve: 420, size: 1 },
        rocket: { icon: '⚡', name: hpT('Sấm sét (×2 điểm)'), mult: 2, time: 0.6, curve: 0, size: 1 },
        gold: { icon: '🟡', name: hpT('Bóng vàng (×3 điểm)'), mult: 3, time: 1, curve: 0, size: 1.1 }
    };
    const SHOT_IDS = Object.keys(SHOT_TYPES);
    // flight = ms bay của cú thường · hit = nhân tầm tay
    const DIFFICULTY = {
        easy: { name: hpT('Dễ'), flight: 1500, hit: 1.3 },
        normal: { name: hpT('Vừa'), flight: 1200, hit: 1.1 },
        hard: { name: hpT('Khó'), flight: 950, hit: 0.9 }
    };
    const R0 = 150;              // bán kính bóng lúc ở chấm phạt đền (gần camera)
    const R1 = 46;               // bán kính bóng ở mặt phẳng thủ môn
    const ARC = 260;             // độ vồng nhẹ mọi cú (px thế giới)
    const SPOT_MS = 650;         // bóng nằm chờ trước khi sút
    const BLOCK_U = 0.8;         // từ tiến độ này mới cản được
    const GRACE_MS = 60;         // chờ thêm sau bù trễ trước khi phán vào lưới
    const END_MS = 900;          // hoạt cảnh cản / vào lưới
    const GAP_MS = 900;          // cách nhau giữa 2 cú sút
    const HIST_MS = 600;
    const MAX_PER_GIFT = 999;
    const MILESTONES = [5, 10, 20, 50, 100];
    const VIS = 0.5;

    function defaultConfig() {
        return {
            enabled: true,
            gifts: [],                 // [{ giftId, giftName, giftImage, shot: 'normal'|'curve'|'rocket'|'gold' }]
            difficulty: 'normal',
            maxBalls: 1,               // cú sút bay cùng lúc (1–3); quà sau xếp hàng
            queueMax: 999,
            hitScale: 100,             // % tầm tay
            latencyMs: 120,            // bù trễ camera
            goal: { width: 86, top: 34, bottom: 86 },   // khung thành, % vùng thấy: rộng (giữa) · xà ngang · vạch vôi
            display: { showHud: true, hudY: 3, showTop: true, showNames: true, showAim: true, showHands: true, showZones: false,
                showPitch: true, showLights: true,           // thảm cỏ dưới vạch vôi · dàn đèn sân 2 góc trên
                listXPercent: 50, listYPercent: 19, listScale: 90 },   // list*: thông báo quà (dưới bảng tỷ số)
            sound: { enabled: true, volume: 0.6 }
        };
    }

    const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    function normalizeGift(g) {
        if (!g || typeof g !== 'object') return null;
        const giftId = String(g.giftId ?? '').slice(0, 40);
        if (!giftId) return null;
        return { giftId, giftName: String(g.giftName || '').slice(0, 80), giftImage: String(g.giftImage || '').slice(0, 1000),
            shot: SHOT_IDS.includes(g.shot) ? g.shot : 'normal' };
    }
    function normalizeConfig(raw) {
        const d = defaultConfig();
        const c = obj(raw);
        const seen = new Set(), gifts = [];
        for (const g of Array.isArray(c.gifts) ? c.gifts : []) {
            const n = normalizeGift(g);
            if (!n || seen.has(n.giftId)) continue;
            seen.add(n.giftId); gifts.push(n);
            if (gifts.length >= 30) break;
        }
        const go = obj(c.goal), disp = obj(c.display), snd = obj(c.sound);
        const top = num(go.top, 0, 70, d.goal.top);
        return {
            ...c,
            enabled: c.enabled !== false,
            gifts,
            difficulty: DIFFICULTY[c.difficulty] ? c.difficulty : d.difficulty,
            maxBalls: Math.round(num(c.maxBalls, 1, 3, d.maxBalls)),
            queueMax: Math.round(num(c.queueMax, 1, 999, d.queueMax)),
            hitScale: num(c.hitScale, 50, 200, d.hitScale),
            latencyMs: num(c.latencyMs, 0, 400, d.latencyMs),
            goal: { width: num(go.width, 30, 100, d.goal.width), top, bottom: Math.max(top + 25, num(go.bottom, 0, 100, d.goal.bottom)) },
            display: { ...d.display, ...disp, hudY: num(disp.hudY, 0, 80, d.display.hudY) },
            sound: { enabled: snd.enabled !== false, volume: num(snd.volume, 0, 1, d.sound.volume) }
        };
    }

    // Quà → { type, count } | null. Chỉ so id (như Đá Cầu / Chém Trái Cây).
    function shotsForGift(cfg, giftId, repeat) {
        const id = String(giftId ?? '');
        if (!id) return null;
        const g = (cfg.gifts || []).find(x => String(x.giftId) === id);
        if (!g) return null;
        return { type: SHOT_IDS.includes(g.shot) ? g.shot : 'normal', count: Math.min(MAX_PER_GIFT, Math.max(1, Math.floor(Number(repeat) || 1))) };
    }

    // Vị trí + bán kính trên màn của cú sút ở tiến độ u (0 = chấm phạt đền, 1 = đích; >1 = lọt sâu vào lưới).
    // Chiếu phối cảnh: 2 đầu là hình chiếu của 2 điểm 3D ở độ sâu z0 = 1 và z1 = r0/r1 quanh tâm phối cảnh (cx, cy).
    function shotPos(b, u) {
        const z1 = b.r0 / b.r1, z = 1 + (z1 - 1) * u;
        const k = 4 * u * (1 - u);
        const px = (b.sx - b.cx) * (1 - u) + (b.tx - b.cx) * z1 * u + b.curve * k;
        const py = (b.sy - b.cy) * (1 - u) + (b.ty - b.cy) * z1 * u - b.arc * k;
        return { x: b.cx + px / z, y: b.cy + py / z, r: b.r0 / z };
    }

    // Tay từ 33 điểm pose (toạ độ sân khấu {x,y,v}): tâm lòng bàn tay = cổ tay đẩy 60 % về phía các ngón (trỏ + út).
    // r = 0,3 × bề vai (tối thiểu 40; không đo được bề vai thì 40).
    function handsFromPose(P) {
        if (!Array.isArray(P) || P.length < 21) return [];
        const ok = i => P[i] && P[i].v >= VIS && Number.isFinite(P[i].x) && Number.isFinite(P[i].y);
        const sw = ok(11) && ok(12) ? Math.hypot(P[12].x - P[11].x, P[12].y - P[11].y) : 0;
        const r = sw ? Math.max(40, sw * 0.3) : 40;
        const out = [];
        for (const [side, wi, fingers] of [['L', 15, [17, 19]], ['R', 16, [18, 20]]]) {
            if (!ok(wi)) continue;
            const w = P[wi], fs = fingers.filter(ok).map(i => P[i]);
            let x = w.x, y = w.y, a = -Math.PI / 2;     // a = hướng cổ tay → ngón (găng vẽ xoay theo); không thấy ngón: chĩa lên
            if (fs.length) {
                const fx = fs.reduce((s, p) => s + p.x, 0) / fs.length, fy = fs.reduce((s, p) => s + p.y, 0) / fs.length;
                x += (fx - w.x) * 0.6; y += (fy - w.y) * 0.6;
                if (Math.hypot(fx - w.x, fy - w.y) > 1) a = Math.atan2(fy - w.y, fx - w.x);
            }
            out.push({ side, x, y, r, a });
        }
        return out;
    }

    function createEngine(cfgIn, opts = {}) {
        const W = opts.width || 1080, H = opts.height || 1920;
        const random = opts.random || Math.random;
        let cfg = normalizeConfig(cfgIn);
        let A = { x: 0, y: 0, w: W, h: H };
        function setArea(r) {
            const ok = r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
            A = ok ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: 0, y: 0, w: W, h: H };
        }
        let balls = [], queue = [], events = [];
        let clock = 0, seq = 0, nextLaunchAt = 0;
        let ready = true, waitSince = -1;
        let keeper = 0, viewers = 0, streak = 0, best = 0, saves = 0, goals = 0;
        let scorers = new Map();     // tên → { name, avatar, points, goals, at }

        const diff = () => DIFFICULTY[cfg.difficulty] || DIFFICULTY.normal;
        function goalRect() {
            const w = A.w * cfg.goal.width / 100;
            return { x: A.x + (A.w - w) / 2, y: A.y + A.h * cfg.goal.top / 100, w, h: A.h * (cfg.goal.bottom - cfg.goal.top) / 100 };
        }

        function enqueue(type, count, meta = {}) {
            const n = Math.max(1, Math.min(MAX_PER_GIFT, Math.floor(Number(count) || 1)));
            let added = 0;
            for (let i = 0; i < n; i++) {
                if (queue.length >= cfg.queueMax) { events.push({ type: 'queueFull' }); break; }
                queue.push({ type: SHOT_IDS.includes(type) ? type : 'normal', meta: { nickname: meta.nickname || '', avatar: meta.avatar || '' } });
                added++;
            }
            if (added && waitSince < 0) waitSince = clock;
            return added;
        }

        function launch(item) {
            const T = SHOT_TYPES[item.type] || SHOT_TYPES.normal;
            const g = goalRect(), r1 = R1 * T.size;
            // đích: 1 trong 6 ô (3 cột × 2 hàng) của khung đã trừ lề bán kính bóng
            const ix = g.x + r1, iw = Math.max(0, g.w - 2 * r1), iy = g.y + r1, ih = Math.max(0, g.h - 2 * r1);
            const col = Math.min(2, Math.floor(random() * 3)), row = Math.min(1, Math.floor(random() * 2));
            const tx = ix + iw * (col + 0.15 + 0.7 * random()) / 3;
            const ty = iy + ih * (row + 0.15 + 0.7 * random()) / 2;
            const cx = A.x + A.w / 2;
            // chấm phạt đền: cả quả bóng (kể cả lúc nảy) nằm trong khung thấy
            const sx = cx + (random() - 0.5) * 120, sy = A.y + A.h - R0 * 1.2;
            const b = {
                id: ++seq, type: item.type, phase: 'spot', t: 0, T: diff().flight * T.time, u: 0,
                sx, sy, tx, ty, cx, cy: A.y + A.h * 0.4, r0: R0 * T.size, r1, arc: ARC,
                curve: T.curve ? (tx >= cx ? -1 : 1) * T.curve : 0,
                by: item.meta.nickname, avatar: item.meta.avatar, hist: [], arriveAt: -1, vx: 0, vy: 0, alpha: 1, spin: 0
            };
            Object.assign(b, shotPos(b, 0));
            balls.push(b);
            events.push({ type: 'launch', id: b.id, shot: b.type, by: b.by, avatar: b.avatar, tx, ty });
            return b;
        }

        const live = () => balls.filter(b => b.phase === 'spot' || b.phase === 'fly').length;
        function maybeLaunch() {
            if (!queue.length) { waitSince = -1; return; }
            if (live() >= cfg.maxBalls || clock < nextLaunchAt) return;
            if (!ready && waitSince >= 0 && clock - waitSince < 8000) return;
            launch(queue.shift());
            nextLaunchAt = clock + GAP_MS;
            waitSince = queue.length ? clock : -1;
        }

        function resolveGoal(b) {
            b.phase = 'goal'; b.t = 0;
            const T = SHOT_TYPES[b.type] || SHOT_TYPES.normal;
            viewers += T.mult; goals++; streak = 0;
            const name = b.by || '';
            if (name) {
                const s = scorers.get(name) || { name, avatar: b.avatar || '', points: 0, goals: 0, at: 0 };
                s.points += T.mult; s.goals++; s.at = ++seq; if (b.avatar) s.avatar = b.avatar;
                scorers.set(name, s);
            }
            events.push({ type: 'goal', id: b.id, shot: b.type, x: b.x, y: b.y, by: b.by, avatar: b.avatar, points: T.mult, viewers, keeper });
            nextLaunchAt = Math.max(nextLaunchAt, clock + 700);
        }
        function save(b, hand, at) {
            b.phase = 'saved'; b.t = 0;
            if (at) { b.x = at.x; b.y = at.y; b.r = at.r; }
            const T = SHOT_TYPES[b.type] || SHOT_TYPES.normal;
            keeper += T.mult; saves++; streak++;
            const record = streak > best && streak >= 3;
            if (streak > best) best = streak;
            // bật ra theo hướng tay → bóng, về phía camera (to dần, rơi xuống)
            let dx = b.x - hand.x, dy = b.y - hand.y;
            const L = Math.hypot(dx, dy) || 1;
            if (L < 1e-3) { dx = b.x >= A.x + A.w / 2 ? 1 : -1; dy = -0.3; }
            b.vx = (dx / L) * 900 + (b.x >= A.x + A.w / 2 ? 250 : -250);
            b.vy = (dy / L) * 500 - 450;
            b.spin = b.vx > 0 ? 14 : -14;
            events.push({ type: 'save', id: b.id, shot: b.type, x: b.x, y: b.y, by: b.by, avatar: b.avatar, points: T.mult, streak, best,
                milestone: MILESTONES.includes(streak) ? streak : 0, record, keeper, viewers, side: hand.side || '' });
            nextLaunchAt = Math.max(nextLaunchAt, clock + 700);
        }

        function stepBall(b, dt) {
            b.t += dt;
            if (b.phase === 'spot') {
                if (b.t >= SPOT_MS) { b.phase = 'fly'; b.t = 0; events.push({ type: 'kick', id: b.id, shot: b.type, by: b.by }); }
                return;
            }
            if (b.phase === 'fly') {
                b.u = Math.min(1, b.t / b.T);
                Object.assign(b, shotPos(b, b.u));
                b.hist.push({ t: clock, x: b.x, y: b.y, r: b.r, u: b.u });
                while (b.hist.length && clock - b.hist[0].t > HIST_MS) b.hist.shift();
                if (b.u >= 1) {
                    if (b.arriveAt < 0) b.arriveAt = clock;
                    else if (clock - b.arriveAt >= cfg.latencyMs + GRACE_MS) resolveGoal(b);
                }
                return;
            }
            const sec = dt / 1000;
            if (b.phase === 'goal') {
                b.u = 1 + 0.1 * Math.min(1, b.t / 250);
                Object.assign(b, shotPos(b, b.u));
            } else if (b.phase === 'saved') {
                b.vy += 1800 * sec;
                b.x += b.vx * sec; b.y += b.vy * sec;
                b.r *= 1 + 0.9 * sec;
            }
            b.alpha = Math.max(0, 1 - Math.max(0, b.t - END_MS * 0.5) / (END_MS * 0.5));
        }

        function step(dtMs) {
            let left = Math.max(0, Math.min(200, Number(dtMs) || 0));
            while (left > 0) {
                const dt = Math.min(16, left); left -= dt; clock += dt;
                maybeLaunch();
                for (const b of balls) stepBall(b, dt);
                balls = balls.filter(b => !((b.phase === 'saved' || b.phase === 'goal') && b.t >= END_MS));
            }
        }

        function posAt(b, t) {
            let pick = null, bd = Infinity;
            for (const h of b.hist) { const d = Math.abs(h.t - t); if (d < bd) { bd = d; pick = h; } }
            return pick && bd <= 80 ? pick : null;
        }

        // hands: [{ x, y, r, side? }] toạ độ sân khấu. atClock: đồng hồ engine lúc camera chụp khung (đã trừ trễ) — NaN = bây giờ.
        function contact(hands, atClock) {
            if (!Array.isArray(hands) || !hands.length) return 0;
            const sc = diff().hit * cfg.hitScale / 100;
            let n = 0;
            for (const b of balls) {
                if (b.phase !== 'fly') continue;
                const cands = [];
                if (b.u >= BLOCK_U) cands.push(null);
                if (Number.isFinite(atClock)) { const h = posAt(b, atClock); if (h && h.u >= BLOCK_U) cands.push(h); }
                let hit = null;
                for (const hand of hands) {
                    if (!hand || !Number.isFinite(hand.x) || !Number.isFinite(hand.y)) continue;
                    const hr = (Number(hand.r) || 40) * sc;
                    for (const c of cands) {
                        const p = c || b;
                        if (Math.hypot(p.x - hand.x, p.y - hand.y) <= hr + p.r) { hit = { hand, at: c }; break; }
                    }
                    if (hit) break;
                }
                if (hit) { save(b, hit.hand, hit.at); n++; }
            }
            return n;
        }

        function topScorers(k = 3) {
            return [...scorers.values()].sort((a, b) => b.points - a.points || b.at - a.at).slice(0, k)
                .map(s => ({ name: s.name, avatar: s.avatar, points: s.points, goals: s.goals }));
        }
        function stats() {
            return { keeper, viewers, streak, best, saves, goals, scorers: [...scorers.values()].map(s => ({ name: s.name, avatar: s.avatar, points: s.points, goals: s.goals })) };
        }
        function loadStats(s) {
            s = obj(s);
            const int = v => Math.max(0, Math.floor(Number(v) || 0));
            keeper = int(s.keeper); viewers = int(s.viewers); streak = int(s.streak); best = Math.max(int(s.best), streak);
            saves = int(s.saves); goals = int(s.goals);
            scorers = new Map();
            let at = 0;
            for (const x of Array.isArray(s.scorers) ? s.scorers.slice(0, 500) : []) {
                if (!x || !x.name) continue;
                const name = String(x.name).slice(0, 80);
                scorers.set(name, { name, avatar: String(x.avatar || '').slice(0, 1000), points: int(x.points), goals: int(x.goals), at: ++at });
            }
            seq = Math.max(seq, at);
        }

        function snapshot() {
            const out = {
                clock,
                balls: balls.map(b => ({ id: b.id, type: b.type, phase: b.phase, x: b.x, y: b.y, r: b.r, u: b.u, t: b.t, T: b.T, tx: b.tx, ty: b.ty, r1: b.r1,
                    alpha: b.alpha, spin: b.spin, by: b.by, avatar: b.avatar })),
                queue: queue.length, keeper, viewers, streak, best, top: topScorers(3), goal: goalRect(),
                waiting: queue.length > 0 && !ready && live() === 0,
                events
            };
            events = [];
            return out;
        }

        return {
            setConfig(c) { cfg = normalizeConfig(c); },
            setArea, goalRect,
            get config() { return cfg; },
            get clock() { return clock; },
            setReady(v) { ready = !!v; },
            enqueue, step, contact, snapshot, stats, loadStats, topScorers,
            ballById: id => balls.find(b => b.id === id) || null,
            get balls() { return balls; },
            clear() { balls = []; queue = []; waitSince = -1; },
            reset() { balls = []; queue = []; waitSince = -1; keeper = 0; viewers = 0; streak = 0; best = 0; saves = 0; goals = 0; scorers = new Map(); }
        };
    }

    return { SHOT_TYPES, SHOT_IDS, DIFFICULTY, MAX_PER_GIFT, MILESTONES, BLOCK_U, SPOT_MS, defaultConfig, normalizeConfig, shotsForGift, shotPos, handsFromPose, createEngine };
});
