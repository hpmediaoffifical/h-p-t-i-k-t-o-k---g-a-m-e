/* Chém Trái Cây — engine thuần (không DOM). Dùng chung cho overlay (browser) và test (node).
 * Đơn vị: px overlay 1080×1920, thời gian ms, y tăng xuống dưới. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.chemtraicay = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const FRUITS = ['apple', 'orange', 'lemon', 'pear', 'peach', 'strawberry', 'plum', 'watermelon', 'pineapple', 'kiwi'];
    const ACTIONS = FRUITS.concat(['bomb', 'god', 'fast', 'slow', 'rescue']);
    const ACTION_LABELS = {
        apple: 'Táo đỏ', orange: 'Cam', lemon: 'Chanh vàng', pear: 'Lê', peach: 'Đào', strawberry: 'Dâu tây',
        plum: 'Mận tím', watermelon: 'Dưa hấu', pineapple: 'Dứa', kiwi: 'Kiwi', bomb: 'Bom',
        god: 'Thần Chém', fast: 'Tăng Tốc', slow: 'Giảm Tốc', rescue: 'Giải Cứu'
    };

    const BASE_RADIUS = 40;      // px khi objectScale = 1
    const GRAVITY = 1800;        // px/s²

    function defaultConfig() {
        return {
            enabled: true,
            showNotices: true, showScore: true, showDanger: true, volume: 0.5, quality: 'auto',
            cutRadius: 15, baseSpeed: 0.65, objectScale: 1.5, peak: 72, points: 10, bombPenalty: 50, blast: 24,
            danger: 50, cuts: 2, pileStep: 5, godSeconds: 10, fastFactor: 1.7, fastSeconds: 10,
            slowFactor: 0.55, slowSeconds: 10, rescuePercent: 100, holdSeconds: 0.85,
            spawnPerSecond: 3, maxPerGift: 30, idleSpawnSeconds: 0,
            camRect: null,
            mirror: true,
            giftRules: [],
            obsScene: { enabled: false, playScene: '', backScene: '' },
            display: { scale: 100, xPercent: 50, yPercent: 50 }
        };
    }

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

    function createEngine(config, opts) {
        opts = opts || {};
        const width = opts.width || 1080;
        const height = opts.height || 1920;
        let rng = opts.random || Math.random;
        let cfg = Object.assign(defaultConfig(), config || {});

        let playing = false;
        let score = 0;
        let pile = 0;
        let queue = [];          // action kind chờ sinh
        let spawnAcc = 0;        // bộ tích lũy sinh quả
        let objects = [];
        let events = [];
        let nextId = 1;
        let combo = 0;
        let comboAt = -Infinity;   // thời điểm nhát gần nhất (ms engine)
        let clock = 0;             // thời gian engine tích lũy (ms)
        const blades = { L: mkBlade(), R: mkBlade(), M: mkBlade() };

        function mkBlade() { return { x: 0, y: 0, present: false, px: 0, py: 0, pprev: false }; }

        function setBlade(side, x, y, present) {
            const b = blades[side]; if (!b) return;
            b.x = num(x, b.x); b.y = num(y, b.y); b.present = !!present;
        }

        // khoảng cách từ điểm (px,py) tới đoạn thẳng AB
        function segDist(ax, ay, bx, by, px, py) {
            const dx = bx - ax, dy = by - ay;
            const l2 = dx * dx + dy * dy;
            let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx, cy = ay + t * dy;
            return Math.hypot(px - cx, py - cy);
        }

        function registerHit() {
            if (clock - comboAt <= 1000) combo += 1; else combo = 1;
            comboAt = clock;
        }

        function cutObject(o, ax, ay, bx, by) {
            const pts = num(cfg.points, 10);
            score += pts;
            registerHit();
            events.push({ type: 'cut', kind: o.kind, x: o.x, y: o.y, points: pts, combo, depth: o.depth + 1 });
            // pháp tuyến của đoạn cắt → 2 mảnh văng ngược chiều
            let nx = -(by - ay), ny = bx - ax;
            const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
            const maxDepth = Math.max(1, num(cfg.cuts, 2));
            for (const sgn of [1, -1]) {
                objects.push({ id: nextId++, kind: o.kind, x: o.x + nx * sgn * o.r * 0.3, y: o.y + ny * sgn * o.r * 0.3,
                    r: o.r * 0.7, vx: o.vx + nx * sgn * 180, vy: o.vy - 150, rot: o.rot, spin: o.spin + sgn * 2,
                    depth: o.depth + 1, golden: o.golden, cutAngle: Math.atan2(by - ay, bx - ax), half: sgn });
            }
            void maxDepth;
        }

        function runBlades() {
            const maxDepth = Math.max(1, num(cfg.cuts, 2));
            const reach = num(cfg.cutRadius, 15);
            for (const side of ['L', 'R']) {
                const b = blades[side];
                if (b.present && b.pprev) {
                    const hit = [];
                    for (const o of objects) {
                        if (o.depth >= maxDepth) continue;
                        if (segDist(b.px, b.py, b.x, b.y, o.x, o.y) <= o.r + reach) hit.push(o);
                    }
                    for (const o of hit) {
                        objects = objects.filter(q => q !== o);
                        cutObject(o, b.px, b.py, b.x, b.y);
                    }
                }
                b.px = b.x; b.py = b.y; b.pprev = b.present;
            }
        }

        function setConfig(c) { cfg = Object.assign(defaultConfig(), c || {}); }

        function radius() { return BASE_RADIUS * num(cfg.objectScale, 1.5); }

        function enqueue(action, qty) {
            if (ACTIONS.indexOf(action) < 0) return 0;
            const max = Math.max(1, num(cfg.maxPerGift, 30));
            const n = Math.min(max, Math.max(1, Math.floor(num(qty, 1))));
            for (let i = 0; i < n; i++) queue.push(action);
            return n;
        }

        function spawn(kind) {
            const r = radius();
            const x = width * (0.15 + 0.70 * rng());
            const h = height * num(cfg.peak, 72) / 100 + r;
            const vy = -Math.sqrt(2 * GRAVITY * h) * num(cfg.baseSpeed, 0.65);
            const toward = x < width / 2 ? 1 : -1;
            const vx = toward * 120 * rng();
            objects.push({ id: nextId++, kind, x, y: height + r, r, vx, vy, rot: rng() * Math.PI * 2, spin: (rng() - 0.5) * 3, depth: 0, golden: false });
        }

        function step(dtMs) {
            const dtm = Math.max(0, num(dtMs, 16));
            clock += dtm;
            if (combo && clock - comboAt > 1000) combo = 0;
            if (!playing) { for (const k in blades) { blades[k].px = blades[k].x; blades[k].py = blades[k].y; blades[k].pprev = blades[k].present; } return; }
            const dt = dtm / 1000;
            runBlades();
            // xả hàng đợi
            spawnAcc += num(cfg.spawnPerSecond, 3) * dt;
            while (spawnAcc >= 1 && queue.length) { spawnAcc -= 1; spawn(queue.shift()); }
            if (!queue.length) spawnAcc = Math.min(spawnAcc, 1);
            // bay
            const speedMul = 1;
            const g = GRAVITY * num(cfg.baseSpeed, 0.65) * num(cfg.baseSpeed, 0.65);
            const dte = dt * speedMul;
            for (const o of objects) {
                o.vy += g * dte;
                o.x += o.vx * dte;
                o.y += o.vy * dte;
                o.rot += o.spin * dte;
            }
            objects = objects.filter(o => !(o.vy > 0 && o.y > height + 2 * o.r));
        }

        function start() { playing = true; pile = 0; spawnAcc = 0; events.push({ type: 'start' }); }
        function stop() { playing = false; objects = []; queue = []; }
        function reset() { stop(); score = 0; pile = 0; }

        function snapshot() {
            const ev = events; events = [];
            const bl = {};
            for (const k in blades) bl[k] = { x: blades[k].x, y: blades[k].y, present: blades[k].present };
            return { playing, score, pile, combo, queue: queue.length, objects: objects.map(o => o), events: ev, blades: bl };
        }

        return { enqueue, step, start, stop, reset, snapshot, setConfig, setBlade };
    }

    return { ACTIONS, FRUITS, ACTION_LABELS, defaultConfig, createEngine };
});
