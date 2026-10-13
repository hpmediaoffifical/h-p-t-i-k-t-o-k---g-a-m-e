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

    // Giới hạn từng tham số theo loại — cũng là DANH SÁCH KHOÁ hợp lệ: khoá lạ bị bỏ.
    const ACTION_LIMITS = {
        release: { count: [1, 1000] },
        spray:   { radius: [100, 1500], ms: [300, 10000], count: [0, 2000], percent: [0, 100] },
        racket:  { seconds: [1, 60] },
        net:     { seconds: [1, 120] }
    };
    const RACKET_MAX_MS = 60000, NET_MAX_MS = 120000;
    const ACTION_ICONS = ['🦟', '🧴', '🏸', '🛏', '💨', '⚡', '🌿', '🪰'];

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
    function clamp(v, min, max) { const n = Number(v); if (!Number.isFinite(n)) return min; return Math.min(max, Math.max(min, n)); }
    function str(v, max) { return String(v == null ? '' : v).slice(0, max); }

    function normalizeAction(raw, index, cfg) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const type = ACTION_TYPES.includes(raw.type) ? raw.type : 'release';
        const params = { ...ACTION_DEFAULT_PARAMS[type] };
        const saved = raw.params && typeof raw.params === 'object' ? raw.params : {};
        for (const [k, [min, max]] of Object.entries(ACTION_LIMITS[type])) if (saved[k] != null) params[k] = clamp(saved[k], min, max);
        return {
            id: str(raw.id || ('act-' + index + '-' + Date.now()), 60),
            type, icon: str(raw.icon || ACTION_PRESET[type].icon, 8), name: str(raw.name || ACTION_PRESET[type].name, 60),
            enabled: raw.enabled !== false,
            giftId: str(raw.giftId, 40), giftName: str(raw.giftName, 80), giftImage: str(raw.giftImage, 600),
            diamond: clamp(raw.diamond, 0, 1000000), hotkey: str(raw.hotkey, 80), params
        };
    }

    function normalizeRule(raw, index) {
        raw = raw && typeof raw === 'object' ? raw : {};
        return {
            id: str(raw.id || ('rule-' + index + '-' + Date.now()), 60),
            giftId: str(raw.giftId, 40), giftName: str(raw.giftName, 80), giftImage: str(raw.giftImage, 600),
            diamond: clamp(raw.diamond, 0, 1000000), count: Math.floor(clamp(raw.count != null ? raw.count : 1, 1, 1000)),
            enabled: raw.enabled !== false
        };
    }

    const NUM_LIMITS = {
        clapDistance: [0.6, 3], clapSpeed: [200, 3000], slapSpeed: [300, 4000], clapCooldownMs: [100, 1000], hitRadius: [4, 40],
        speed: [40, 600], mosquitoScale: [40, 250], faceRadius: [100, 600], gentlePercent: [0, 100], crowdFrom: [20, 300],
        smartPercent: [0, 100], smartLives: [2, 6], spawnPerSecond: [1, 30], maxOnScreen: [20, 600], idleSpawnSeconds: [0, 60],
        maxPerGift: [1, 1000], coinsPerMosquito: [0, 5000]
    };

    function normalizeConfig(raw) {
        const def = defaultConfig();
        raw = raw && typeof raw === 'object' ? raw : {};
        const cfg = { ...def, ...raw };
        cfg.enabled = raw.enabled !== false;
        cfg.hitMode = ['clap', 'slap', 'both'].includes(raw.hitMode) ? raw.hitMode : 'clap';
        for (const [k, [min, max]] of Object.entries(NUM_LIMITS)) {
            const v = raw[k];
            cfg[k] = (v !== '' && v !== null && Number.isFinite(Number(v))) ? clamp(v, min, max) : def[k];
        }
        cfg.faceAttract = raw.faceAttract !== false;
        cfg.quality = ['low', 'auto', 'high'].includes(raw.quality) ? raw.quality : 'auto';
        cfg.giftRules = Array.isArray(raw.giftRules) ? raw.giftRules.map(normalizeRule) : [];
        cfg.actions = Array.isArray(raw.actions) && raw.actions.length ? raw.actions.map((a, i) => normalizeAction(a, i, cfg)) : defaultActions();
        const snd = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
        cfg.sound = { enabled: snd.enabled !== false, volume: clamp(snd.volume != null ? snd.volume : def.sound.volume, 0, 1) };
        const d = raw.display && typeof raw.display === 'object' ? raw.display : {};
        cfg.display = {
            showHud: d.showHud !== false,
            hudXPercent: clamp(d.hudXPercent != null ? d.hudXPercent : 50, 0, 100),
            hudYPercent: clamp(d.hudYPercent != null ? d.hudYPercent : 8, 0, 100),
            hudScale: clamp(d.hudScale != null ? d.hudScale : 100, 30, 300),
            showHitRing: d.showHitRing !== false, showSkeleton: d.showSkeleton === true
        };
        return cfg;
    }

    // Hành động đang bật khớp quà: ưu tiên id, dự phòng tên không phân biệt hoa thường.
    function actionForGift(cfg, giftId, giftName) {
        if (!cfg || !Array.isArray(cfg.actions)) return null;
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        return cfg.actions.find(a => a && a.enabled !== false && (
            (id && String(a.giftId || '') === id) || (name && String(a.giftName || '').toLowerCase() === name)
        )) || null;
    }

    // Số muỗi một quà sinh ra: quà thuộc hành động → 0; rule → count×repeat (rule tắt → 0);
    // không rule → xu/coinsPerMosquito; trần maxPerGift.
    function mosquitoesForGift(cfg, giftId, giftName, coinValue, repeatCount) {
        if (!cfg) return 0;
        if (actionForGift(cfg, giftId, giftName)) return 0;
        const repeat = Math.max(1, parseInt(repeatCount, 10) || 1);
        const max = Math.max(1, Math.floor(num(cfg.maxPerGift, 100)));
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        const rule = (Array.isArray(cfg.giftRules) ? cfg.giftRules : []).find(r => r && (
            (id && String(r.giftId || '') === id) || (name && String(r.giftName || '').toLowerCase() === name)
        ));
        if (rule) {
            if (rule.enabled === false) return 0;
            const c = parseInt(rule.count, 10);
            return c > 0 ? Math.min(max, c * repeat) : 0;
        }
        const perOne = num(cfg.coinsPerMosquito, 1);
        if (!(perOne > 0)) return 0;
        const coins = Math.max(0, Math.round(num(coinValue, 0))) * repeat;
        return Math.min(max, Math.floor(coins / perOne));
    }

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
        let lastKillAt = -Infinity;
        let racketMs = 0, netMs = 0;
        let spray = null;         // { x, y, radius, ms, elapsed, limit, killed }

        function halfSize(m) { return 0.5 * BASE_SIZE * m.scale; }

        // Giết một con: lật úp, nảy nhẹ lên rồi rơi.
        function kill(m) {
            m.state = 'dead'; m.deadAt = clock; m.vy = -250; m.vx *= 0.3;
            score += 1; killed += 1;
        }
        // combo đếm theo CÚ đập tay có trúng (một cú giết nhiều con vẫn +1), cách cú trước < 1.5 s.
        function registerHit() { combo = clock - lastKillAt < 1500 ? combo + 1 : 1; lastKillAt = clock; }

        // Muỗi thông minh né: vụt ngược hướng điểm đập 350 ms, đích mới cách điểm đập ≥ 400 px.
        function dodge(m, px, py) {
            m.livesLeft -= 1; m.state = 'dodge'; m.dodgeUntil = clock + 350;
            let dx = m.x - px, dy = m.y - py; const d = Math.hypot(dx, dy);
            if (d < 1) { const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
            m.vx = dx * 1400; m.vy = dy * 1400;
            if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
            let t = null;
            for (let i = 0; i < 12; i++) { t = { x: rng() * width, y: rng() * height }; if (Math.hypot(t.x - px, t.y - py) >= 400) break; }
            m.target = t; m.turnAt = clock + turnDelay(m);
            events.push({ type: 'dodge', id: m.id, x: m.x, y: m.y, livesLeft: m.livesLeft });
        }

        // Vợt điện: tay lướt qua là chết (không né được). Chỉ khi vợt đang bật.
        function sweep(x, y, r) {
            if (racketMs <= 0) return 0;
            const px = num(x, 0), py = num(y, 0), pr = Math.max(0, num(r, 0));
            let n = 0;
            for (const m of mosquitoes) {
                if (m.state === 'dead') continue;
                if (Math.hypot(m.x - px, m.y - py) > pr + halfSize(m)) continue;
                kill(m); n++;
            }
            if (n) events.push({ type: 'zap', n, x: px, y: py });
            return n;
        }

        function release(n) { return enqueue(n); }
        function racket(seconds) { racketMs = Math.min(RACKET_MAX_MS, racketMs + Math.max(0, num(seconds, 0)) * 1000); events.push({ type: 'racket', ms: racketMs }); }
        function net(seconds) { netMs = Math.min(NET_MAX_MS, netMs + Math.max(0, num(seconds, 0)) * 1000); events.push({ type: 'net', ms: netMs }); }

        // Bình xịt: đám mây tại tâm đàn (không có muỗi → giữa sân), nở tới radius trong ms,
        // giết tối đa limit con lọt vào mây. Gọi lại khi đang có mây → thay mây mới.
        function sprayStart(p) {
            p = p && typeof p === 'object' ? p : {};
            const alive = mosquitoes.filter(m => m.state !== 'dead');
            let cx = width / 2, cy = height / 2;
            if (alive.length) { cx = alive.reduce((s, m) => s + m.x, 0) / alive.length; cy = alive.reduce((s, m) => s + m.y, 0) / alive.length; }
            const percent = num(p.percent, 0);
            const limit = percent > 0 ? Math.ceil(alive.length * percent / 100) : Math.max(0, Math.floor(num(p.count, 50)));
            spray = { x: cx, y: cy, radius: Math.max(1, num(p.radius, 600)), ms: Math.max(1, num(p.ms, 2500)), elapsed: 0, limit, killed: 0 };
            events.push({ type: 'spray', x: cx, y: cy, radius: spray.radius, ms: spray.ms });
        }
        function sprayTick(dtm) {
            if (!spray) return;
            spray.elapsed += dtm;
            const r = spray.radius * Math.min(1, spray.elapsed / spray.ms);
            for (const m of mosquitoes) {
                if (spray.killed >= spray.limit) break;
                if (m.state === 'dead') continue;
                if (Math.hypot(m.x - spray.x, m.y - spray.y) > r + halfSize(m)) continue;
                kill(m); spray.killed++;
            }
            if (spray.elapsed >= spray.ms) spray = null;
        }

        // Chạy một hành động đã chuẩn hoá qty lần (release: count×qty; spray: 1 mây; racket/net: giây×qty).
        function applyAction(action, qty) {
            if (!action || !ACTION_TYPES.includes(action.type)) return;
            const n = Math.max(1, Math.floor(num(qty, 1)));
            const p = action.params || {};
            if (action.type === 'release') release(Math.floor(num(p.count, 20)) * n);
            else if (action.type === 'spray') sprayStart(p);
            else if (action.type === 'racket') racket(num(p.seconds, 10) * n);
            else if (action.type === 'net') net(num(p.seconds, 15) * n);
        }

        // Cú đập tay tại (x,y) bán kính r → số muỗi chết.
        function hit(x, y, r) {
            const px = num(x, 0), py = num(y, 0), pr = Math.max(0, num(r, 0));
            let n = 0, dodged = 0;
            for (const m of mosquitoes) {
                if (m.state !== 'fly') continue;
                if (Math.hypot(m.x - px, m.y - py) > pr + halfSize(m)) continue;
                if (m.smart && m.livesLeft > 1) { dodge(m, px, py); dodged++; }
                else { kill(m); n++; }
            }
            if (n) { registerHit(); events.push({ type: 'kill', n, x: px, y: py, combo }); }
            else if (!dodged) events.push({ type: 'miss', x: px, y: py });
            return n;
        }

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
            racketMs = Math.max(0, racketMs - dtm);
            netMs = Math.max(0, netMs - dtm);
            const maxOn = Math.max(1, num(cfg.maxOnScreen, 300));
            if (netMs > 0) { spawnAcc = 0; idleAcc = 0; }   // mắc màn: không sinh gì, hàng đợi giữ nguyên
            else {
                // xả hàng đợi
                spawnAcc += num(cfg.spawnPerSecond, 6) * dt;
                while (spawnAcc >= 1 && queue > 0 && flying < maxOn) { spawnAcc -= 1; queue--; spawn(); flying++; }
                if (!queue) spawnAcc = Math.min(spawnAcc, 1);
                // sinh nền
                const idle = num(cfg.idleSpawnSeconds, 8);
                if (idle > 0 && !queue) { idleAcc += dt; if (idleAcc >= idle) { idleAcc = 0; if (flying < maxOn) { spawn(); flying++; } } } else idleAcc = 0;
            }
            sprayTick(dtm);
            // bay
            const crowdFrom = Math.max(1, num(cfg.crowdFrom, 120));
            const crowd = flying > crowdFrom ? Math.max(0.4, crowdFrom / flying) : 1;
            if (combo && clock - lastKillAt > 1500) combo = 0;
            for (const m of mosquitoes) {
                if (m.state === 'fly') fly(m, dt, crowd);
                else if (m.state === 'dodge') {
                    m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt * 120;
                    if (clock >= m.dodgeUntil) m.state = 'fly';
                } else {
                    m.vy += GRAVITY * dt; m.x += m.vx * dt; m.y += m.vy * dt;
                }
            }
            mosquitoes = mosquitoes.filter(m => m.state !== 'dead' || (m.y <= height + 100 && clock - m.deadAt <= 2500));
        }

        function setFace(x, y) { face.x = num(x, face.x); face.y = num(y, face.y); face.at = clock; }
        function setConfig(c) { cfg = Object.assign(defaultConfig(), c || {}); }
        function clear() { mosquitoes = []; queue = 0; spawnAcc = 0; idleAcc = 0; spray = null; }
        function reset() { clear(); score = 0; killed = 0; combo = 0; lastKillAt = -Infinity; racketMs = 0; netMs = 0; events = []; }

        function snapshot() {
            const ev = events; events = [];
            return {
                mosquitoes: mosquitoes.map(m => ({
                    id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy, dir: m.dir, scale: m.scale, speedMul: m.speedMul,
                    smart: m.smart, livesLeft: m.livesLeft, phase: m.phase, state: m.state, deadAt: m.deadAt, dodgeUntil: m.dodgeUntil
                })),
                queue, flying: flyingCount(), score, killed, combo, racketMs, netMs,
                spray: spray ? { x: spray.x, y: spray.y, r: spray.radius * Math.min(1, spray.elapsed / spray.ms), msLeft: Math.max(0, spray.ms - spray.elapsed) } : null,
                events: ev
            };
        }

        return { enqueue, step, hit, sweep, release, spray: sprayStart, racket, net, applyAction, setFace, setConfig, clear, reset, snapshot };
    }

    return { ACTION_TYPES, ACTION_PRESET, ACTION_LIMITS, ACTION_ICONS, defaultConfig, normalizeConfig, normalizeAction,
        actionForGift, mosquitoesForGift, createEngine, BASE_SIZE, GRAVITY, MAX_QUEUE };
});
