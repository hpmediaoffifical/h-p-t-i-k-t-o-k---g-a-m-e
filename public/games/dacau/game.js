// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🏸 Đá Cầu - engine thuần (không DOM). Dùng chung cho overlay (browser, game.js) và server/test (node, game.cjs - cùng nội dung).
 * Đơn vị: px sân khấu 1080×1920, thời gian ms (step nhận ms), y tăng xuống dưới.
 *
 * Cầu lông bay KHÁC bóng: lên thì vút nhanh (chỉ trọng lực), xuống thì lông cản → rơi chậm, đều (tiến tới vận tốc
 * giới hạn vt). Rơi chậm vừa giống thật vừa bù độ trễ camera (~0,1–0,2 s).
 *
 * Chạm hợp lệ (engine.contact):
 *   1. cầu đang RƠI (vy > -100 px/s, tức là quanh đỉnh hoặc đang xuống),
 *   2. cầu nằm trong vùng chạm: ĐẦU = vòng tròn, ĐÙI = đoạn hông→quá gối một chút (hình con nhộng),
 *      và nằm ở nửa TRÊN của vùng (đỡ từ dưới lên, không tính cầu đập vào mặt dưới đùi),
 *   3. bộ phận đó đang NHẤC LÊN (tốc độ đi lên ≥ ngưỡng, tính theo bề vai cho đứng xa/gần như nhau) -
 *      đứng yên thì cầu rơi xuyên qua (requireLift). Nhấc mạnh → cầu bay cao hơn; chạm lệch mép → cầu dạt sang bên kia.
 * Rơi qua vạch sàn (floorPercent) = cầu "chết": sự kiện 'drop' (kèm fxId vé 💥 Rổ PHẠT nếu server cấp).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.dacau = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Loại cầu theo quà: mult = nhân điểm, size = cỡ, fall = nhân tốc độ rơi.
    const BALL_TYPES = {
        normal: { icon: '🏸', name: hpT('Cầu thường'), mult: 1, size: 1, fall: 1 },
        gold: { icon: '🟡', name: hpT('Cầu vàng (điểm ×3)'), mult: 3, size: 1, fall: 1 },
        big: { icon: '🎈', name: hpT('Cầu khổng lồ (to, rơi chậm)'), mult: 1, size: 1.5, fall: 0.75 },
        fire: { icon: '🔥', name: hpT('Cầu lửa (rơi nhanh, điểm ×2)'), mult: 2, size: 1, fall: 1.3 }
    };
    const TYPE_IDS = Object.keys(BALL_TYPES);
    // gUp: trọng lực lúc bay lên · gDown + vt: lúc rơi (vt = vận tốc rơi giới hạn) · apex: độ cao cú đỡ (phần chiều cao sân)
    // hit: nhân vùng chạm · liftThigh / liftHead: ngưỡng NHẤC LÊN (px/s khi bề vai 300 px).
    // ĐẦU: cầu rơi từ trên xuống luôn đi qua đầu TRƯỚC → chỉ tính khi có CÚ ĐỘI ĐẦU thật: tốc độ đi lên ≥ liftHead VÀ quãng nhấc
    // trong ~0,2 s ≥ headRise × bề vai (part.rise). Đứng yên / lắc nhẹ / đi bộ trên máy tập thì cầu rơi xuyên qua đầu xuống đùi.
    const DIFFICULTY = {
        easy: { name: hpT('Dễ'), gUp: 2400, gDown: 1100, vt: 600, apex: 0.44, hit: 1.35, liftThigh: 140, liftHead: 150, headRise: 0.1 },
        normal: { name: hpT('Vừa'), gUp: 2600, gDown: 1300, vt: 780, apex: 0.42, hit: 1.15, liftThigh: 220, liftHead: 220, headRise: 0.14 },
        hard: { name: hpT('Khó'), gUp: 2800, gDown: 1500, vt: 980, apex: 0.4, hit: 0.95, liftThigh: 300, liftHead: 280, headRise: 0.18 }
    };
    const PARTS = ['both', 'head', 'thigh'];
    const BALL_R = 46;            // bán kính va chạm cầu thường (px)
    const MAX_PER_GIFT = 999;     // combo ×N = N quả lần lượt tới hết (user 29/10/2026), trần an toàn 999
    const MILESTONES = [10, 25, 50, 100, 200, 500];
    const HIST_MS = 600;          // giữ vị trí cầu 0,6 s để so với khung camera trễ

    function defaultConfig() {
        return {
            enabled: true,
            gifts: [],                 // [{ giftId, giftName, giftImage, ball: 'normal'|'gold'|'big'|'fire' }]
            difficulty: 'normal',
            parts: 'both',             // 'both' | 'head' | 'thigh'
            requireLift: true,
            floorPercent: 92,          // vạch sàn (% chiều cao sân khấu) - cầu rơi qua là chết
            maxBalls: 3,               // cầu bay cùng lúc (1–5); quà sau xếp hàng
            queueMax: 999,
            hitScale: 100,             // % vùng chạm
            headPower: 100,            // % độ mạnh cú đội đầu cần có (cao = phải đội rõ hơn)
            latencyMs: 120,            // độ trễ camera bù khi so vị trí
            rampEvery: 10, rampPct: 6, // mỗi N chạm cầu rơi nhanh thêm %
            fxOnDrop: true,            // 💥 cầu rơi → bật hiệu ứng trong Rổ PHẠT (rổ trống = không làm gì)
            safeAfter: 0,              // đỡ đủ N chạm thì rơi KHÔNG phạt (0 = luôn phạt)
            // showStats: dòng Kỷ lục · điểm · hudY: mép trên khối số chạm (% chiều cao sân khấu)
            display: { showHud: true, showStats: true, hudY: 7, showGuide: true, showNames: true, showZones: false,
                listXPercent: 50, listYPercent: 80, listScale: 90 },   // list*: danh sách người tặng (% khung thấy, % cỡ) - ngang cẳng chân, không đè mặt
            sound: { enabled: true, volume: 0.6 },
            fx: { pool: [], pickMin: 1, pickMax: 1, cooldownSec: 4, maxPending: 3, spacingSec: 3 }
        };
    }

    const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
    function normalizeGift(g) {
        if (!g || typeof g !== 'object') return null;
        const giftId = String(g.giftId ?? '').slice(0, 40);
        if (!giftId) return null;
        return { giftId, giftName: String(g.giftName || '').slice(0, 80), giftImage: String(g.giftImage || '').slice(0, 1000),
            ball: TYPE_IDS.includes(g.ball) ? g.ball : 'normal' };
    }
    function normalizeConfig(raw) {
        const d = defaultConfig();
        const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const seen = new Set();
        const gifts = [];
        for (const g of Array.isArray(c.gifts) ? c.gifts : []) {
            const n = normalizeGift(g);
            if (!n || seen.has(n.giftId)) continue;
            seen.add(n.giftId); gifts.push(n);
            if (gifts.length >= 30) break;
        }
        const disp = c.display && typeof c.display === 'object' ? c.display : {};
        const snd = c.sound && typeof c.sound === 'object' ? c.sound : {};
        return {
            ...c,
            enabled: c.enabled !== false,
            gifts,
            difficulty: DIFFICULTY[c.difficulty] ? c.difficulty : d.difficulty,
            parts: PARTS.includes(c.parts) ? c.parts : d.parts,
            requireLift: c.requireLift !== false,
            floorPercent: num(c.floorPercent, 50, 100, d.floorPercent),
            maxBalls: Math.round(num(c.maxBalls, 1, 5, d.maxBalls)),
            queueMax: Math.round(num(c.queueMax, 1, 999, d.queueMax)),
            hitScale: num(c.hitScale, 50, 200, d.hitScale),
            headPower: num(c.headPower, 30, 250, d.headPower),
            latencyMs: num(c.latencyMs, 0, 400, d.latencyMs),
            rampEvery: Math.round(num(c.rampEvery, 0, 100, d.rampEvery)),
            rampPct: num(c.rampPct, 0, 30, d.rampPct),
            fxOnDrop: c.fxOnDrop !== false,
            safeAfter: Math.round(num(c.safeAfter, 0, 500, d.safeAfter)),
            display: { ...d.display, ...disp, showStats: disp.showStats !== false, hudY: num(disp.hudY, 0, 80, d.display.hudY) },
            sound: { enabled: snd.enabled !== false, volume: num(snd.volume, 0, 1, d.sound.volume) },
            fx: c.fx && typeof c.fx === 'object' ? c.fx : d.fx
        };
    }

    // Quà → { type, count } (combo ×N = N quả, trần MAX_PER_GIFT) | null. Chỉ so id (giống Chém Trái Cây / Bắn Cung).
    function ballsForGift(cfg, giftId, repeat) {
        const id = String(giftId ?? '');
        if (!id) return null;
        const g = (cfg.gifts || []).find(x => String(x.giftId) === id);
        if (!g) return null;
        return { type: TYPE_IDS.includes(g.ball) ? g.ball : 'normal', count: Math.min(MAX_PER_GIFT, Math.max(1, Math.floor(Number(repeat) || 1))) };
    }

    // Khoảng cách điểm → đoạn thẳng, trả cả điểm gần nhất.
    function segDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + dx * t, cy = ay + dy * t;
        return { d: Math.hypot(px - cx, py - cy), cx, cy };
    }

    function createEngine(cfgIn, opts = {}) {
        const W = opts.width || 1080, H = opts.height || 1920;
        const random = opts.random || Math.random;
        let cfg = normalizeConfig(cfgIn);
        // 👁 Vùng chơi = phần sân khấu còn thấy trên OBS (Scene PK cắt ô khung cam - overlay gọi setArea): tung cầu từ đáy vùng, vạch sàn /
        // đỉnh bay / tường dội theo vùng. Mặc định cả sân khấu (y hệt bản cũ).
        let A = { x: 0, y: 0, w: W, h: H };
        function setArea(r) {
            const ok = r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
            A = ok ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: 0, y: 0, w: W, h: H };
        }
        let balls = [];
        let queue = [];               // { type, meta, fxId }
        let events = [];
        let clock = 0, seq = 0;
        let nextLaunchAt = 0;
        let ready = true, waitSince = -1;
        let best = 0, score = 0, kicks = 0, drops = 0;

        const diff = () => DIFFICULTY[cfg.difficulty] || DIFFICULTY.normal;
        const floorY = () => A.y + A.h * cfg.floorPercent / 100;
        function speedOf(b) {
            const f = cfg.rampEvery > 0 ? Math.min(1.6, 1 + Math.floor(b.touches / cfg.rampEvery) * cfg.rampPct / 100) : 1;
            const t = BALL_TYPES[b.type] || BALL_TYPES.normal;
            const D = diff();
            return { gUp: D.gUp, gDown: D.gDown * t.fall * f, vt: D.vt * t.fall * f };
        }

        function enqueue(type, count, meta = {}) {
            const n = Math.max(1, Math.min(MAX_PER_GIFT, Math.floor(Number(count) || 1)));
            const ids = Array.isArray(meta.fxIds) ? meta.fxIds : [];
            let added = 0;
            for (let i = 0; i < n; i++) {
                if (queue.length >= cfg.queueMax) { events.push({ type: 'queueFull' }); break; }
                queue.push({ type: TYPE_IDS.includes(type) ? type : 'normal', meta: { nickname: meta.nickname || '', avatar: meta.avatar || '' }, fxId: ids[i] || '' });
                added++;
            }
            if (added && waitSince < 0) waitSince = clock;
            return added;
        }

        function launch(item) {
            const t = BALL_TYPES[item.type] || BALL_TYPES.normal;
            const r = BALL_R * t.size;
            const m = Math.min(160, A.w * 0.15);
            const x = Math.min(A.x + A.w - m, Math.max(A.x + m, (opts.centerX ? opts.centerX() : A.x + A.w / 2) + (random() - 0.5) * 240));
            const y = A.y + A.h + r + 20;
            const apexY = A.y + A.h * (0.1 + random() * 0.06);
            const b = {
                id: ++seq, type: item.type, r, x, y, vx: (A.x + A.w / 2 - x) * 0.25 + (random() - 0.5) * 120,
                vy: -Math.sqrt(2 * diff().gUp * (y - apexY)), angle: -Math.PI / 2, touches: 0, lastSide: '', points: 0,
                by: item.meta.nickname, avatar: item.meta.avatar, fxId: item.fxId, cooldownUntil: 0, phase: random() * 6.28,
                born: clock, hist: [], lastKick: null
            };
            balls.push(b);
            events.push({ type: 'launch', id: b.id, ball: b.type, by: b.by, x: b.x });
            return b;
        }

        function maybeLaunch() {
            if (!queue.length) { waitSince = -1; return; }
            if (balls.length >= cfg.maxBalls || clock < nextLaunchAt) return;
            // Chờ người vào khung (overlay báo ready); quá 8 s vẫn tung để quà không mất trắng.
            if (!ready && waitSince >= 0 && clock - waitSince < 8000) return;
            launch(queue.shift());
            nextLaunchAt = clock + 700;   // nhiều quả cùng lúc: tung cách nhau 0,7 s cho dễ nhìn
            waitSince = queue.length ? clock : -1;
        }

        function physics(b, dt) {
            const s = speedOf(b), sec = dt / 1000;
            if (b.vy < 0) { b.vy += s.gUp * sec; b.vx *= Math.max(0, 1 - 0.3 * sec); }
            else {
                b.vy += s.gDown * (1 - b.vy / s.vt) * sec;
                b.vx *= Math.exp(-1.6 * sec);
                b.x += Math.sin(clock / 1000 * 6 + b.phase) * 28 * sec;   // lông cầu chao nhẹ khi rơi
            }
            b.x += b.vx * sec; b.y += b.vy * sec;
            if (b.x < A.x + b.r) { b.x = A.x + b.r; b.vx = Math.abs(b.vx) * 0.6; }
            if (b.x > A.x + A.w - b.r) { b.x = A.x + A.w - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
            if (b.y < A.y + b.r && b.vy < 0) { b.y = A.y + b.r; b.vy = 0; }
            // Đầu cầu (núm) đi trước theo hướng bay; xoay mượt.
            const want = Math.atan2(b.vy, b.vx);
            let da = want - b.angle; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
            b.angle += da * Math.min(1, sec * 10);
        }

        function step(dtMs) {
            let left = Math.max(0, Math.min(200, Number(dtMs) || 0));
            while (left > 0) {
                const dt = Math.min(16, left); left -= dt; clock += dt;
                maybeLaunch();
                for (const b of balls) {
                    physics(b, dt);
                    b.hist.push({ t: clock, x: b.x, y: b.y, vy: b.vy });
                    while (b.hist.length && clock - b.hist[0].t > HIST_MS) b.hist.shift();
                }
                const fy = floorY();
                for (const b of balls.slice()) {
                    if (b.vy > 0 && b.y - b.r > fy) {
                        balls = balls.filter(x => x !== b);
                        drops++;
                        const safe = cfg.safeAfter > 0 && b.touches >= cfg.safeAfter;
                        events.push({ type: 'drop', id: b.id, ball: b.type, x: b.x, y: fy, touches: b.touches, points: b.points, by: b.by, avatar: b.avatar,
                            fxId: cfg.fxOnDrop && !safe ? b.fxId : '', safe });
                        nextLaunchAt = Math.max(nextLaunchAt, clock + 1200);
                    }
                }
            }
        }

        // Vị trí cầu ở thời điểm t (đồng hồ engine) - lấy mẫu gần nhất trong lịch sử.
        function posAt(b, t) {
            let pick = null, bd = Infinity;
            for (const h of b.hist) { const d = Math.abs(h.t - t); if (d < bd) { bd = d; pick = h; } }
            return pick && bd <= 80 ? pick : null;
        }

        function partHit(b, p, bx, by) {
            const sc = (diff().hit * cfg.hitScale / 100);
            if (p.kind === 'head') {
                const r = p.r * sc;
                const d = Math.hypot(bx - p.x, by - p.y);
                if (d > r + b.r || by > p.y + r * 0.25) return null;
                return { cx: p.x, cy: p.y, reach: r + b.r };
            }
            const r = p.r * sc;
            const s = segDist(bx, by, p.ax, p.ay, p.bx, p.by);
            if (s.d > r + b.r || by > s.cy + r * 0.35) return null;
            return { cx: s.cx, cy: s.cy, reach: r + b.r };
        }

        // parts: [{ kind:'head', x, y, r, up, sw } | { kind:'thigh', side:'L'|'R', ax, ay, bx, by, r, up, sw }]
        //   up = tốc độ đi LÊN (px/s, dương = lên), sw = bề vai (px) để quy ngưỡng nhấc theo khoảng cách người–camera.
        // atClock: đồng hồ engine lúc camera chụp khung đó (đã trừ trễ) - so cả vị trí cầu lúc ấy lẫn hiện tại.
        function contact(parts, atClock) {
            if (!Array.isArray(parts) || !parts.length) return 0;
            const D = diff();
            let n = 0;
            for (const b of balls) {
                if (b.vy < -100 || clock < b.cooldownUntil) continue;
                let hit = null;
                for (const p of parts) {
                    if (!p) continue;
                    if (cfg.parts === 'head' && p.kind !== 'head') continue;
                    if (cfg.parts === 'thigh' && p.kind !== 'thigh') continue;
                    const scale = Math.max(0.4, Math.min(2.5, (Number(p.sw) || 300) / 300));
                    const hp = cfg.headPower / 100;
                    const min = (p.kind === 'head' ? D.liftHead * hp : D.liftThigh) * scale;
                    if (cfg.requireLift && !(Number(p.up) >= min)) continue;
                    // đội đầu phải có quãng nhấc thật (lọc rung / nhịp đi bộ); part.rise không có (đầu vào cũ) thì chỉ xét tốc độ
                    if (cfg.requireLift && p.kind === 'head' && p.rise != null && !(Number(p.rise) >= D.headRise * hp * (Number(p.sw) || 300))) continue;
                    const cands = [{ x: b.x, y: b.y }];
                    if (Number.isFinite(atClock)) { const h = posAt(b, atClock); if (h) cands.push(h); }
                    for (const c of cands) {
                        const h = partHit(b, p, c.x, c.y);
                        if (h) { hit = { p, ...h, lift: Math.max(0, Math.min(1, ((Number(p.up) || 0) - min) / (min * 2 + 1))) }; break; }
                    }
                    if (hit) break;
                }
                if (hit) { kick(b, hit); n++; }
            }
            return n;
        }

        function kick(b, hit) {
            const D = diff(), p = hit.p;
            const isHead = p.kind === 'head';
            let h = A.h * D.apex * (0.85 + 0.35 * hit.lift) * (isHead ? 0.8 : 1);
            h = Math.min(h, Math.max(120, b.y - A.y - A.h * 0.05));
            b.vy = -Math.sqrt(2 * D.gUp * h);
            const off = Math.max(-1, Math.min(1, (b.x - hit.cx) / (hit.reach || 1)));
            let vx = off * 380 + (random() - 0.5) * 80;
            if (b.x < A.x + A.w * 0.2) vx += 160; else if (b.x > A.x + A.w * 0.8) vx -= 160;   // kéo về giữa sân
            b.vx = vx;
            b.cooldownUntil = clock + 260;
            b.touches++;
            const side = isHead ? 'H' : (p.side || '');
            const alt = !isHead && b.lastSide && b.lastSide !== 'H' && side && side !== b.lastSide;
            b.lastSide = side;
            const t = BALL_TYPES[b.type] || BALL_TYPES.normal;
            const pts = (isHead ? 2 : 1) * t.mult * (alt ? 2 : 1);
            b.points += pts; score += pts; kicks++;
            if (b.touches > best) best = b.touches;
            b.lastKick = { t: clock, part: p.kind };
            events.push({ type: 'kick', id: b.id, part: p.kind, side, x: b.x, y: b.y, touches: b.touches, points: pts, alt: !!alt,
                milestone: MILESTONES.includes(b.touches) ? b.touches : 0, record: b.touches === best && b.touches >= 5 });
        }

        // Dự báo chỗ cầu (đang RƠI hoặc sắp rơi) đi qua độ cao y: { x, ms } | null. Mô phỏng trên bản sao, tối đa 3 s.
        function predict(b, y) {
            const c = { ...b, hist: [] };
            const saved = clock;
            let t = 0;
            for (; t < 3000; t += 16) {
                physics(c, 16); clock += 16;
                if (c.vy > 0 && c.y >= y) break;
            }
            clock = saved;
            return t < 3000 ? { x: c.x, ms: t } : null;
        }

        function snapshot() {
            const out = {
                clock, balls: balls.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, angle: b.angle, touches: b.touches,
                    points: b.points, by: b.by, avatar: b.avatar, falling: b.vy > -100, lastKick: b.lastKick })),
                queue: queue.length, best, score, kicks, drops,
                combo: balls.reduce((m, b) => Math.max(m, b.touches), 0), floorY: floorY(), waiting: queue.length > 0 && !ready && balls.length === 0,
                events
            };
            events = [];
            return out;
        }

        return {
            setConfig(c) { cfg = normalizeConfig(c); },
            setArea,
            get config() { return cfg; },
            setReady(v) { ready = !!v; },
            enqueue, step, contact, predict,
            ballById: id => balls.find(b => b.id === id) || null,
            get balls() { return balls; },
            snapshot,
            clear() { balls = []; queue = []; waitSince = -1; },
            reset() { balls = []; queue = []; waitSince = -1; best = 0; score = 0; kicks = 0; drops = 0; }
        };
    }

    return { BALL_TYPES, TYPE_IDS, DIFFICULTY, PARTS, MAX_PER_GIFT, MILESTONES, defaultConfig, normalizeConfig, ballsForGift, segDist, createEngine };
});
