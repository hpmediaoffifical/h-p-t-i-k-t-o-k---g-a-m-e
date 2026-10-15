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
    const MAX_QUEUE = 300;       // trần tổng quả chờ sinh

    function defaultConfig() {
        return {
            enabled: true,
            showNotices: true, showScore: true, showDanger: true, volume: 0.5, quality: 'auto',
            cutRadius: 15, baseSpeed: 0.65, objectScale: 1.5, peak: 72, points: 10, bombPenalty: 50, blast: 24,
            danger: 50, cuts: 2, pileStep: 5, godSeconds: 10, fastFactor: 1.7, fastSeconds: 10,
            slowFactor: 0.55, slowSeconds: 10, rescuePercent: 100, holdSeconds: 0.85,
            spawnPerSecond: 3, maxPerGift: 30, idleSpawnSeconds: 0,
            camRect: null,
            videoSource: { mode: 'obs-source', scene: '', source: '', fps: 15, width: 640 },
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
        const buffs = { god: 0, fast: 0, slow: 0 };   // ms còn lại
        let hold = { x: 0, y: 0, r: 0, ms: 0, side: null };
        let idleAcc = 0;

        // Overlay gọi mỗi khung theo vị trí nút trên màn hình; chỉ reset tiến độ khi nút thật sự dời chỗ.
        function holdTarget(x, y, r) {
            const nx = num(x, 0), ny = num(y, 0), nr = Math.max(0, num(r, 0));
            const moved = Math.hypot(nx - hold.x, ny - hold.y) > 2 || Math.abs(nr - hold.r) > 2;
            hold.x = nx; hold.y = ny; hold.r = nr;
            if (moved) hold.ms = 0;
        }

        function applyBuff(action, qty) {
            const n = Math.max(1, Math.floor(num(qty, 1)));
            if (action === 'god') {
                buffs.god += num(cfg.godSeconds, 10) * 1000 * n;
                for (const o of objects) if (o.kind === 'bomb') o.golden = true;
            } else if (action === 'fast' || action === 'slow') {
                const other = action === 'fast' ? 'slow' : 'fast';
                let add = num(cfg[action + 'Seconds'], 10) * 1000 * n;
                const cancel = Math.min(buffs[other], add);
                buffs[other] -= cancel; add -= cancel;
                buffs[action] += add;
            } else if (action === 'rescue') {
                pile = Math.max(0, pile - num(cfg.rescuePercent, 100) * n);
                events.push({ type: 'rescue', pile });
                return;
            }
            events.push({ type: 'buff', kind: action, ms: buffs[action] });
        }

        function explode(bomb) {
            score -= num(cfg.bombPenalty, 50);
            events.push({ type: 'bomb', x: bomb.x, y: bomb.y });
            const radius = width * num(cfg.blast, 24) / 100;
            const gone = objects.filter(o => o !== bomb && o.kind !== 'bomb' && Math.hypot(o.x - bomb.x, o.y - bomb.y) <= radius + o.r);
            for (const o of gone) {
                objects = objects.filter(q => q !== o);
                pile += num(cfg.pileStep, 5);
                events.push({ type: 'blast', kind: o.kind, x: o.x, y: o.y });
            }
        }

        function endGame() {
            playing = false;
            events.push({ type: 'end', score, pile });
            objects = []; queue = [];
            buffs.god = 0; buffs.fast = 0; buffs.slow = 0;
        }

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
            for (const sgn of [1, -1]) {
                objects.push({ id: nextId++, kind: o.kind, x: o.x + nx * sgn * o.r * 0.3, y: o.y + ny * sgn * o.r * 0.3,
                    r: o.r * 0.7, vx: o.vx + nx * sgn * 180, vy: o.vy - 150, rot: o.rot, rot0: o.rot, spin: o.spin + sgn * 2,
                    depth: o.depth + 1, golden: o.golden, cutAngle: Math.atan2(by - ay, bx - ax), half: sgn });
            }
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
                    // bom nổ trước (nổ có thể cuốn luôn quả bị chém cùng nhát)
                    hit.sort((a, c) => (a.kind === 'bomb' && !a.golden ? -1 : 0) - (c.kind === 'bomb' && !c.golden ? -1 : 0));
                    for (const o of hit) {
                        if (!objects.includes(o)) continue;
                        objects = objects.filter(q => q !== o);
                        if (o.kind === 'bomb' && !o.golden) explode(o);
                        else cutObject(o, b.px, b.py, b.x, b.y);
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
            if (action === 'god' || action === 'fast' || action === 'slow' || action === 'rescue') { applyBuff(action, n); return n; }
            // Trần tổng hàng đợi: bão quà không biến thành hàng giờ quả bay.
            let added = 0;
            for (let i = 0; i < n && queue.length < MAX_QUEUE; i++) { queue.push(action); added++; }
            return added;
        }

        function spawn(kind) {
            const r = radius();
            const x = width * (0.15 + 0.70 * rng());
            const h = height * num(cfg.peak, 72) / 100 + r;
            const vy = -Math.sqrt(2 * GRAVITY * h) * num(cfg.baseSpeed, 0.65);
            const toward = x < width / 2 ? 1 : -1;
            const vx = toward * 120 * rng();
            objects.push({ id: nextId++, kind, x, y: height + r, r, vx, vy, rot: rng() * Math.PI * 2, spin: (rng() - 0.5) * 3, depth: 0, golden: kind === 'bomb' && buffs.god > 0 });
        }

        function step(dtMs) {
            const dtm = Math.max(0, num(dtMs, 16));
            clock += dtm;
            if (combo && clock - comboAt > 1000) combo = 0;
            if (!playing) {
                for (const k in blades) { blades[k].px = blades[k].x; blades[k].py = blades[k].y; blades[k].pprev = blades[k].present; }
                // giữ ngón trỏ (hoặc chuột) trên nút bắt đầu
                let inside = null;
                for (const k of ['L', 'R', 'M']) {
                    const b = blades[k];
                    if (b.present && hold.r > 0 && Math.hypot(b.x - hold.x, b.y - hold.y) <= hold.r) { inside = k; break; }
                }
                if (inside) { hold.ms += dtm; hold.side = inside; } else { hold.ms = 0; hold.side = null; }
                if (hold.ms >= num(cfg.holdSeconds, 0.85) * 1000) { hold.ms = 0; start(); }
                return;
            }
            const dt = dtm / 1000;
            for (const k of ['god', 'fast', 'slow']) buffs[k] = Math.max(0, buffs[k] - dtm);
            for (const o of objects) if (o.kind === 'bomb' && o.depth === 0) o.golden = buffs.god > 0;
            runBlades();
            // xả hàng đợi
            spawnAcc += num(cfg.spawnPerSecond, 3) * dt;
            while (spawnAcc >= 1 && queue.length) { spawnAcc -= 1; spawn(queue.shift()); }
            if (!queue.length) spawnAcc = Math.min(spawnAcc, 1);
            // tự sinh quả khi rảnh (chơi thử)
            const idle = num(cfg.idleSpawnSeconds, 0);
            if (idle > 0 && !queue.length) { idleAcc += dt; if (idleAcc >= idle) { idleAcc = 0; spawn(FRUITS[Math.floor(rng() * FRUITS.length)]); } } else idleAcc = 0;
            // bay
            const speedMul = buffs.fast > 0 ? num(cfg.fastFactor, 1.7) : buffs.slow > 0 ? num(cfg.slowFactor, 0.55) : 1;
            const g = GRAVITY * num(cfg.baseSpeed, 0.65) * num(cfg.baseSpeed, 0.65);
            const dte = dt * speedMul;
            for (const o of objects) {
                o.vy += g * dte;
                o.x += o.vx * dte;
                o.y += o.vy * dte;
                o.rot += o.spin * dte;
            }
            const maxDepth = Math.max(1, num(cfg.cuts, 2));
            const landed = objects.filter(o => o.vy > 0 && o.y > height + 2 * o.r);
            if (landed.length) {
                objects = objects.filter(o => !landed.includes(o));
                for (const o of landed) {
                    if (o.kind === 'bomb' || o.depth >= maxDepth) continue;
                    pile += num(cfg.pileStep, 5);
                    events.push({ type: 'land', kind: o.kind, x: o.x, depth: o.depth });
                }
            }
            if (pile >= num(cfg.danger, 50)) endGame();
        }

        function start() { playing = true; pile = 0; spawnAcc = 0; idleAcc = 0; hold.ms = 0; events.push({ type: 'start' }); }
        function stop() { playing = false; objects = []; queue = []; buffs.god = 0; buffs.fast = 0; buffs.slow = 0; }
        function reset() { stop(); score = 0; pile = 0; }

        function snapshot() {
            const ev = events; events = [];
            const bl = {};
            for (const k in blades) bl[k] = { x: blades[k].x, y: blades[k].y, present: blades[k].present };
            const holdSec = Math.max(0.05, num(cfg.holdSeconds, 0.85));
            return { playing, score, pile, combo, queue: queue.length, objects: objects.map(o => o), events: ev, blades: bl,
                buffs: { god: buffs.god, fast: buffs.fast, slow: buffs.slow },
                hold: { side: hold.side, progress: Math.min(1, hold.ms / (holdSec * 1000)) } };
        }

        return { enqueue, step, start, stop, reset, snapshot, setConfig, setBlade, holdTarget };
    }

    return { ACTIONS, FRUITS, ACTION_LABELS, defaultConfig, createEngine };
});
