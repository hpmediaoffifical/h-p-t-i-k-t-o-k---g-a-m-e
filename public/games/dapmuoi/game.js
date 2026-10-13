/* Đập Muỗi — engine thuần (không DOM). Dùng chung cho overlay (browser) và test (node).
 * Đơn vị: px sân khấu 1080×1920, thời gian ms, y tăng xuống dưới.
 * Spec: docs/superpowers/specs/2026-10-13-dapmuoi-design.md */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.dapmuoi = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const MAX_QUEUE = 2000;     // trần tổng muỗi chờ sinh — bão quà không thành hàng giờ muỗi
    const BASE_SIZE = 150;      // bề ngang muỗi (px) khi mosquitoScale = 100
    const GRAVITY = 1600;       // px/s² lúc rơi
    const EDGE = 120;           // ra khỏi mép quá ngần này thì kéo về

    const ACTION_TYPES = ['release', 'spray', 'racket', 'net'];
    const ACTION_PRESET = {
        release: { icon: '🦟', name: 'Thả muỗi' },
        spray:   { icon: '🧴', name: 'Bình xịt' },
        racket:  { icon: '🏸', name: 'Vợt điện' },
        net:     { icon: '🛏', name: 'Mắc màn' }
    };
    const ACTION_DEFAULT_PARAMS = {
        release: { count: 20 },
        spray:   { radius: 600, ms: 2500, count: 50, percent: 0 },
        racket:  { seconds: 10 },
        net:     { seconds: 15 }
    };

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

    function defaultActions() {
        return ACTION_TYPES.map(type => ({
            id: 'act-' + type, type, icon: ACTION_PRESET[type].icon, name: ACTION_PRESET[type].name,
            enabled: true, giftId: '', giftName: '', giftImage: '', diamond: 0, hotkey: '',
            params: { ...ACTION_DEFAULT_PARAMS[type] }
        }));
    }

    function defaultConfig() {
        return {
            enabled: true,
            hitMode: 'clap', clapDistance: 1.2, clapSpeed: 900, slapSpeed: 1200, clapCooldownMs: 250,
            hitRadius: 14,                 // % bề rộng sân khấu
            speed: 180, mosquitoScale: 100, faceAttract: true, faceRadius: 260,
            gentlePercent: 35, crowdFrom: 120, smartPercent: 10, smartLives: 3,
            spawnPerSecond: 6, maxOnScreen: 300, idleSpawnSeconds: 8, maxPerGift: 100,
            coinsPerMosquito: 1, giftRules: [],
            actions: defaultActions(),
            sound: { enabled: true, volume: 0.5 },
            display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showHitRing: true, showSkeleton: false },
            quality: 'auto'
        };
    }

    function createEngine(config, opts) {
        opts = opts || {};
        const width = opts.width || 1080;
        const height = opts.height || 1920;
        const rng = opts.random || Math.random;
        let cfg = Object.assign(defaultConfig(), config || {});

        let mosquitoes = [];
        let queue = 0;            // số muỗi chờ sinh
        let spawnAcc = 0;
        let idleAcc = 0;
        let nextId = 1;
        let clock = 0;
        let score = 0, killed = 0, combo = 0;
        let face = { x: 0, y: 0, at: -Infinity };
        let events = [];

        function flyingCount() { let n = 0; for (const m of mosquitoes) if (m.state !== 'dead') n++; return n; }

        function pickTarget(m) {
            if (cfg.faceAttract !== false && clock - face.at <= 500 && rng() < 0.4) {
                const r = num(cfg.faceRadius, 260) * Math.sqrt(rng()), a = rng() * Math.PI * 2;
                return { x: face.x + Math.cos(a) * r, y: face.y + Math.sin(a) * r };
            }
            return { x: rng() * width, y: rng() * height };
        }
        function turnDelay(m) { return m.gentle ? 2000 + rng() * 3000 : 600 + rng() * 1200; }

        function spawn() {
            const left = rng() < 0.5;
            const gentle = rng() * 100 < num(cfg.gentlePercent, 35);
            const smart = rng() * 100 < num(cfg.smartPercent, 10);
            const m = {
                id: nextId++, x: left ? 0 : width, y: rng() * height, vx: left ? 1 : -1, vy: 0, dir: left ? 1 : -1,
                scale: num(cfg.mosquitoScale, 100) / 100, gentle,
                speedMul: gentle ? 0.25 + rng() * 0.25 : 0.8 + rng() * 0.5,
                smart, livesLeft: smart ? Math.max(2, Math.floor(num(cfg.smartLives, 3))) : 1,
                phase: rng() * Math.PI * 2, state: 'fly', deadAt: 0, dodgeUntil: 0,
                target: null, turnAt: 0
            };
            m.target = pickTarget(m); m.turnAt = clock + turnDelay(m);
            mosquitoes.push(m);
        }

        function enqueue(n) {
            const want = Math.max(0, Math.floor(num(n, 0)));
            const added = Math.min(want, MAX_QUEUE - queue);
            queue += added;
            return added;
        }

        function fly(m, dt, crowd) {
            if (!m.target || clock >= m.turnAt || Math.hypot(m.target.x - m.x, m.target.y - m.y) < 40
                || m.x < -EDGE || m.x > width + EDGE || m.y < -EDGE || m.y > height + EDGE) {
                m.target = pickTarget(m); m.turnAt = clock + turnDelay(m);
            }
            const sp = num(cfg.speed, 180) * m.speedMul * crowd;
            const dx = m.target.x - m.x, dy = m.target.y - m.y, d = Math.hypot(dx, dy) || 1;
            m.vx = dx / d * sp; m.vy = dy / d * sp;
            m.x += m.vx * dt; m.y += m.vy * dt;
            if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
            m.phase += dt * 90;
        }

        function step(dtMs) {
            const dtm = Math.max(0, num(dtMs, 16));
            clock += dtm;
            const dt = dtm / 1000;
            let flying = flyingCount();
            // xả hàng đợi
            const maxOn = Math.max(1, num(cfg.maxOnScreen, 300));
            spawnAcc += num(cfg.spawnPerSecond, 6) * dt;
            while (spawnAcc >= 1 && queue > 0 && flying < maxOn) { spawnAcc -= 1; queue--; spawn(); flying++; }
            if (!queue) spawnAcc = Math.min(spawnAcc, 1);
            // sinh nền
            const idle = num(cfg.idleSpawnSeconds, 8);
            if (idle > 0 && !queue) { idleAcc += dt; if (idleAcc >= idle) { idleAcc = 0; if (flying < maxOn) { spawn(); flying++; } } } else idleAcc = 0;
            // bay
            const crowdFrom = Math.max(1, num(cfg.crowdFrom, 120));
            const crowd = flying > crowdFrom ? Math.max(0.4, crowdFrom / flying) : 1;
            for (const m of mosquitoes) {
                if (m.state === 'fly') fly(m, dt, crowd);
            }
        }

        function setFace(x, y) { face.x = num(x, face.x); face.y = num(y, face.y); face.at = clock; }
        function setConfig(c) { cfg = Object.assign(defaultConfig(), c || {}); }
        function reset() { mosquitoes = []; queue = 0; spawnAcc = 0; idleAcc = 0; score = 0; killed = 0; combo = 0; events = []; }

        function snapshot() {
            const ev = events; events = [];
            return {
                mosquitoes: mosquitoes.map(m => ({
                    id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy, dir: m.dir, scale: m.scale, speedMul: m.speedMul,
                    smart: m.smart, livesLeft: m.livesLeft, phase: m.phase, state: m.state, deadAt: m.deadAt, dodgeUntil: m.dodgeUntil
                })),
                queue, flying: flyingCount(), score, killed, combo, racketMs: 0, netMs: 0, spray: null, events: ev
            };
        }

        return { enqueue, step, setFace, setConfig, reset, snapshot };
    }

    return { ACTION_TYPES, ACTION_PRESET, defaultConfig, createEngine, BASE_SIZE, GRAVITY, MAX_QUEUE };
});
