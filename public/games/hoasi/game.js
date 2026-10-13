/* Họa Sĩ — engine thuần (không DOM). Dùng chung cho overlay (browser), server (luật quà) và test (node).
 * Đơn vị: px sân khấu 1080×1920, thời gian ms, y tăng xuống dưới.
 * Quà ném cục sơn lên màn (nhắm mặt trước), streamer lau bằng tay (overlay), phủ kín thì tự rửa.
 * Spec: docs/superpowers/specs/2026-10-13-hoasi-design.md — thông số gốc từ HP LIVE Studio painter_game.h. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.hoasi = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const COLS = 12, ROWS = 18;     // lưới đích 216 ô như Studio
    const PALETTE = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#7ee03a', '#1fd6a8', '#22c7ff', '#3d7bff', '#8f5cff',
        '#e04bff', '#ff5ca8', '#ff6f4d', '#b8ff3d'];

    const ACTION_TYPES = ['paint', 'storm', 'water', 'shield', 'wash'];
    const ACTION_PRESET = {
        paint:  { icon: '🎨', name: 'Ném sơn' },
        storm:  { icon: '🌧', name: 'Mưa sơn' },
        water:  { icon: '💧', name: 'Xô nước' },
        shield: { icon: '🛡', name: 'Khiên che mặt' },
        wash:   { icon: '🧽', name: 'Rửa sạch' }
    };
    const ACTION_DEFAULT_PARAMS = {
        paint: { count: 5 }, storm: { seconds: 10, percent: 100 }, water: { count: 3 }, shield: { seconds: 10 }, wash: {}
    };
    // Giới hạn tham số theo loại — cũng là danh sách KHOÁ hợp lệ: khoá lạ bị bỏ.
    const ACTION_LIMITS = {
        paint: { count: [1, 100] }, storm: { seconds: [2, 30], percent: [10, 100] }, water: { count: [1, 30] },
        shield: { seconds: [1, 60] }, wash: {}
    };
    const ACTION_ICONS = ['🎨', '🌧', '💧', '🛡', '🧽', '🖌', '🪣', '🌈'];
    const STORM_MAX_SEC = 30, SHIELD_MAX_SEC = 60;

    const NUM_LIMITS = {
        paintSize: [5, 20], waterSize: [5, 25], paintOpacity: [40, 100], flightMs: [200, 1500], shotsPerSecond: [1, 30],
        shieldScale: [50, 200], wipeSpeed: [25, 400], minFingers: [1, 5], maxPerGift: [1, 500], coinsPerShot: [0, 5000]
    };
    const FULL_LIMITS = { percent: [50, 100], holdSec: [0.5, 10], washAfterSec: [1, 30] };

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
    function clamp(v, min, max) { const n = Number(v); if (!Number.isFinite(n)) return min; return Math.min(max, Math.max(min, n)); }
    function str(v, max) { return String(v == null ? '' : v).slice(0, max); }
    // Có giá trị số hợp lệ → kẹp; rỗng/chữ/null → mặc định (không kẹp về min — bài học Đập Muỗi).
    function pick(v, [min, max], def) { return (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) ? clamp(v, min, max) : def; }

    function normalizeAction(raw, index) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const type = ACTION_TYPES.includes(raw.type) ? raw.type : 'paint';
        const saved = raw.params && typeof raw.params === 'object' ? raw.params : {};
        const params = {};
        for (const [k, lim] of Object.entries(ACTION_LIMITS[type])) params[k] = pick(saved[k], lim, ACTION_DEFAULT_PARAMS[type][k]);
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
            aimFace: true, paintSize: 10.5, waterSize: 14.5, paintOpacity: 92,   // % W, % W, %
            flightMs: 460, shotsPerSecond: 6, shieldScale: 100,
            wipeSpeed: 100, minFingers: 2, wristFallback: true,
            full: { enabled: true, percent: 95, holdSec: 1.5, autoWash: true, washAfterSec: 4 },
            maxPerGift: 50, coinsPerShot: 1, giftRules: [],
            actions: defaultActions(),
            sound: { enabled: true, volume: 0.5 },
            display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showLastThrower: true, showWipe: false },
            quality: 'auto'
        };
    }

    function normalizeConfig(raw) {
        const def = defaultConfig();
        raw = raw && typeof raw === 'object' ? raw : {};
        const cfg = { ...def };
        cfg.enabled = raw.enabled !== false;
        cfg.aimFace = raw.aimFace !== false;
        cfg.wristFallback = raw.wristFallback !== false;
        for (const [k, lim] of Object.entries(NUM_LIMITS)) cfg[k] = pick(raw[k], lim, def[k]);
        cfg.minFingers = Math.round(cfg.minFingers);
        const f = raw.full && typeof raw.full === 'object' ? raw.full : {};
        cfg.full = {
            enabled: f.enabled !== false,
            percent: pick(f.percent, FULL_LIMITS.percent, def.full.percent),
            holdSec: pick(f.holdSec, FULL_LIMITS.holdSec, def.full.holdSec),
            autoWash: f.autoWash !== false,
            washAfterSec: pick(f.washAfterSec, FULL_LIMITS.washAfterSec, def.full.washAfterSec)
        };
        cfg.quality = ['low', 'auto', 'high'].includes(raw.quality) ? raw.quality : 'auto';
        cfg.giftRules = Array.isArray(raw.giftRules) ? raw.giftRules.map(normalizeRule) : [];
        // Thiếu khoá (config cũ/rác) → 5 hành động mặc định; mảng rỗng là người dùng đã xoá hết → giữ rỗng.
        cfg.actions = Array.isArray(raw.actions)
            ? raw.actions.filter(a => a && typeof a === 'object').map((a, i) => normalizeAction(a, i))
            : defaultActions();
        const snd = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
        cfg.sound = { enabled: snd.enabled !== false, volume: pick(snd.volume, [0, 1], def.sound.volume) };
        const d = raw.display && typeof raw.display === 'object' ? raw.display : {};
        cfg.display = {
            showHud: d.showHud !== false,
            hudXPercent: pick(d.hudXPercent, [0, 100], 50),
            hudYPercent: pick(d.hudYPercent, [0, 100], 8),
            hudScale: pick(d.hudScale, [30, 300], 100),
            showLastThrower: d.showLastThrower !== false,
            showWipe: d.showWipe === true
        };
        return cfg;
    }

    function matches(item, id, name) {
        return (id && String(item.giftId || '') === id) || (name && String(item.giftName || '').toLowerCase() === name);
    }

    // Hành động đang bật khớp quà: ưu tiên id, dự phòng tên không phân biệt hoa thường.
    function actionForGift(cfg, giftId, giftName) {
        if (!cfg || !Array.isArray(cfg.actions)) return null;
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        return cfg.actions.find(a => a && a.enabled !== false && matches(a, id, name)) || null;
    }

    // Số cục sơn một quà: quà thuộc hành động → 0; rule → count×repeat (rule tắt → 0);
    // không rule → xu/coinsPerShot; trần maxPerGift.
    function shotsForGift(cfg, giftId, giftName, coinValue, repeatCount) {
        if (!cfg) return 0;
        if (actionForGift(cfg, giftId, giftName)) return 0;
        const repeat = Math.max(1, parseInt(repeatCount, 10) || 1);
        const max = Math.max(1, Math.floor(num(cfg.maxPerGift, 50)));
        const id = String(giftId == null ? '' : giftId), name = String(giftName || '').toLowerCase();
        const rule = (Array.isArray(cfg.giftRules) ? cfg.giftRules : []).find(r => r && matches(r, id, name));
        if (rule) {
            if (rule.enabled === false) return 0;
            const c = parseInt(rule.count, 10);
            return c > 0 ? Math.min(max, c * repeat) : 0;
        }
        const perOne = num(cfg.coinsPerShot, 1);
        if (!(perOne > 0)) return 0;
        const coins = Math.max(0, Math.round(num(coinValue, 0))) * repeat;
        return Math.min(max, Math.floor(coins / perOne));
    }

    // Quà → việc overlay phải làm (đã nhân combo + trần). null = quà không làm gì.
    function giftPlan(cfg, gift) {
        if (!cfg || cfg.enabled === false) return null;
        gift = gift || {};
        const repeat = Math.max(1, parseInt(gift.repeatCount, 10) || 1);
        const max = Math.max(1, Math.floor(num(cfg.maxPerGift, 50)));
        const act = actionForGift(cfg, gift.giftId, gift.giftName);
        if (act) {
            const p = act.params || {}, d = ACTION_DEFAULT_PARAMS[act.type];
            let params;
            if (act.type === 'paint' || act.type === 'water') params = { count: Math.min(max, Math.floor(num(p.count, d.count)) * repeat) };
            else if (act.type === 'storm') params = { seconds: Math.min(STORM_MAX_SEC, num(p.seconds, d.seconds) * repeat), percent: num(p.percent, d.percent) };
            else if (act.type === 'shield') params = { seconds: Math.min(SHIELD_MAX_SEC, num(p.seconds, d.seconds) * repeat) };
            else params = {};
            return { action: act.type, params, name: act.name, icon: act.icon };
        }
        const n = shotsForGift(cfg, gift.giftId, gift.giftName, gift.coinValue, repeat);
        return n > 0 ? { action: 'paint', params: { count: n }, name: ACTION_PRESET.paint.name, icon: ACTION_PRESET.paint.icon } : null;
    }

    const MAX_QUEUE = 500;          // trần hàng đợi cục sơn — bão quà không thành hàng giờ ném
    const MAX_FLIGHTS = 60;         // cục bay cùng lúc tối đa; dư thì chờ
    const WATER_GAP_MS = 240;       // nhịp tia nước (như Studio giữ V)
    const FACE_FRESH_MS = 1000;     // mặt cũ hơn ngần này coi như mất (không nhắm, không khiên)
    const SUB_MS = 50;              // step lớn (test / trang ẩn) chia nhỏ cho đúng thứ tự sự kiện

    function createEngine(config, opts) {
        opts = opts || {};
        const W = opts.width || 1080, H = opts.height || 1920;
        const rng = opts.random || Math.random;
        const N = COLS * ROWS, CW = W / COLS, CH = H / ROWS;
        let cfg = normalizeConfig(config);
        let clock = 0, nextId = 1, budget = 0;
        const cells = new Float32Array(N);
        let coverage = 0;
        let queue = [];                 // người ném từng cục đang chờ
        let scheduled = [];             // { at, kind, cell (−1 = chọn lúc phóng), by } — mưa sơn, tia nước
        let flights = [];               // cục đang bay
        let face = null, faceAt = -Infinity;
        let shieldUntil = 0;
        let lastBy = '';
        let events = [], pending = [], stepping = false;
        // Pha: 'play' → (phủ ≥ percent giữ holdSec) 'full' → (tự rửa / Rửa sạch) 'washing' → washDone → 'play'.
        let phase = 'play', held = 0, latched = false, fullAt = 0, washAt = 0, washMs = 0;
        const emit = (e) => (stepping ? events : pending).push(e);

        const cellOf = (x, y) => Math.min(ROWS - 1, Math.max(0, Math.floor(y / CH))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(x / CW)));
        const center = (i) => ({ x: (i % COLS + 0.5) * CW, y: (Math.floor(i / COLS) + 0.5) * CH });
        const faceValid = () => !!face && clock - faceAt <= FACE_FRESH_MS;
        const shieldMs = () => Math.max(0, shieldUntil - clock);

        // Vòm khiên quanh đầu (px sân khấu). Mất mặt → không có vòm: thà không chặn còn hơn chặn nhầm chỗ.
        function dome() {
            if (shieldMs() <= 0 || !faceValid()) return null;
            const rx = clamp(face.width * 0.8 * cfg.shieldScale / 100, 0.12 * W, 0.40 * W), ry = rx * 1.15;
            return { cx: face.x, cy: face.y + 0.18 * ry, rx, ry };
        }
        const inDome = (d, x, y) => !!d && ((x - d.cx) / d.rx) ** 2 + ((y - d.cy) / d.ry) ** 2 <= 1;

        function inflight(kind) {
            const m = new Uint8Array(N);
            for (const f of flights) if (f.kind === kind) m[f.cell] = 1;
            return m;
        }

        // Ô cho cục sơn (theo Studio cleanCell): ô quanh mặt chưa phủ 55% thì chỉ bắn vào đó, rồi mới lan ra.
        function cleanCell() {
            const aim = cfg.aimFace && faceValid();
            const fc = aim ? cellOf(face.x, face.y) : -1, fr = Math.floor(fc / COLS), fcol = fc % COLS;
            let faceOpen = false;
            if (aim) {
                let sum = 0, n = 0;
                for (let r = fr - 1; r <= fr + 1; r++) for (let c = fcol - 1; c <= fcol + 1; c++) {
                    if (r >= 0 && c >= 0 && r < ROWS && c < COLS) { sum += cells[r * COLS + c]; n++; }
                }
                faceOpen = n > 0 && sum / n < 0.55;
            }
            const d = dome(), fly = inflight('paint');
            // Ô sau khiên luôn sạch → không loại ra thì mọi phát nhắm vào đó và bị chặn hết (game đứng).
            const best = (restrict, near) => {
                let bi = -1, bv = Infinity;
                for (let i = 0; i < N; i++) {
                    const dist = aim ? Math.abs(Math.floor(i / COLS) - fr) + Math.abs(i % COLS - fcol) : 0;
                    if (restrict && dist > 1.5) continue;
                    const c = center(i);
                    if (inDome(d, c.x, c.y)) continue;
                    const q = cells[i] + rng() * 0.10 + (near ? dist * 0.006 : 0) + (fly[i] ? 0.5 : 0);
                    if (q < bv) { bv = q; bi = i; }
                }
                return bi;
            };
            let i = aim && faceOpen ? best(true, false) : -1;
            if (i < 0) i = best(false, aim);
            return i >= 0 ? i : Math.floor(rng() * N);
        }

        // Ô cho tia nước: bẩn nhất trên cả lưới; màn sạch → mặt (không mặt thì giữa màn).
        function dirtyCell() {
            let max = 0;
            for (let i = 0; i < N; i++) if (cells[i] > max) max = cells[i];
            if (max < 0.08) return faceValid() ? cellOf(face.x, face.y) : Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);
            const fly = inflight('water');
            let bi = 0, bv = -Infinity;
            for (let i = 0; i < N; i++) {
                const q = cells[i] + rng() * 0.16 - (fly[i] ? 0.5 : 0);
                if (q > bv) { bv = q; bi = i; }
            }
            return bi;
        }

        function launch(kind, cell, by) {
            if (cell < 0) cell = kind === 'water' ? dirtyCell() : cleanCell();
            const col = cell % COLS, row = Math.floor(cell / COLS);
            const x1 = clamp((col + 0.25 + rng() * 0.5) * CW, 0.03 * W, 0.97 * W);
            const y1 = clamp((row + 0.25 + rng() * 0.5) * CH, 0.03 * H, 0.97 * H);
            const x0 = W * (0.3 + rng() * 0.4), y0 = 0.98 * H;
            const f = {
                id: nextId++, kind, cell, by: by || '',
                x0, y0, cx: (x0 + x1) / 2 + (rng() - 0.5) * 0.2 * W, cy: Math.min(y0, y1) - 0.18 * H, x1, y1,
                t0: clock, ms: cfg.flightMs,
                r: (kind === 'water' ? cfg.waterSize : cfg.paintSize) / 100 * W,
                color: kind === 'water' ? '#8fe3ff' : PALETTE[Math.floor(rng() * PALETTE.length) % PALETTE.length]
            };
            flights.push(f);
            emit({ type: 'launch', id: f.id, kind, cell, by: f.by });
        }

        function impact(f) {
            if (f.kind === 'water') {
                // Nước luôn xuyên khiên: nước là của phe cứu streamer.
                emit({ type: 'wash', x: f.x1, y: f.y1, r: f.r, strength: 0.9 });
                emit({ type: 'wash', x: clamp(f.x1 + (rng() - 0.5) * 0.16 * W, 0.03 * W, 0.97 * W),
                    y: clamp(f.y1 + (rng() - 0.5) * 0.12 * H, 0.03 * H, 0.97 * H), r: f.r * 0.62, strength: 0.76 });
                cells[f.cell] *= 0.1;
                return;
            }
            if (inDome(dome(), f.x1, f.y1)) { emit({ type: 'block', x: f.x1, y: f.y1, color: f.color }); return; }
            emit({ type: 'splat', x: f.x1, y: f.y1, r: f.r, color: f.color, cell: f.cell, by: f.by, seed: Math.floor(rng() * 2147483647) });
            cells[f.cell] = 1;
            if (f.by) lastBy = f.by;
        }

        function startWash(ms) { phase = 'washing'; washAt = clock; washMs = ms; emit({ type: 'washStart', ms }); }
        function cleared(type) {
            cells.fill(0); coverage = 0; phase = 'play'; held = 0; latched = false;
            emit({ type });
        }
        function washDone() { if (phase === 'washing') cleared('washDone'); }
        function clear() { cleared('clear'); }
        function wash() { if (phase !== 'washing') startWash(800); }
        function reset() {
            queue = []; scheduled = []; flights = []; shieldUntil = 0; lastBy = ''; budget = 0;
            cleared('clear');
        }

        function tickPhase(dt) {
            const f = cfg.full, low = (f.percent - 10) / 100;
            if (phase === 'play') {
                if (latched && coverage < low) latched = false;
                if (f.enabled && !latched && coverage >= f.percent / 100) {
                    held += dt;
                    if (held >= f.holdSec * 1000) { phase = 'full'; latched = true; fullAt = clock; held = 0; emit({ type: 'full', by: lastBy }); }
                } else held = 0;
            } else if (phase === 'full') {
                if (f.autoWash) { if (clock - fullAt >= f.washAfterSec * 1000) startWash(1200); }
                else if (coverage < low) { phase = 'play'; latched = false; }
            } else if (phase === 'washing' && clock - washAt >= washMs + 3000) {
                cleared('washDone');      // overlay không báo xong (đang ẩn / lỗi) → tự xong, game không kẹt
            }
        }

        function tick(dt) {
            clock += dt;
            tickPhase(dt);
            // Đang PHỦ KÍN / đang rửa: hàng đợi đứng, lịch dời theo (không bắn dồn sau khi rửa); cục đang bay vẫn bay.
            if (phase !== 'play') {
                for (const s of scheduled) s.at += dt;
                landFlights();
                return;
            }
            // Lịch (mưa sơn, nước): tới giờ là phóng, không chịu nhịp shotsPerSecond; đủ cục bay thì chờ.
            if (scheduled.length) {
                scheduled.sort((a, b) => a.at - b.at);
                while (scheduled.length && scheduled[0].at <= clock && flights.length < MAX_FLIGHTS) {
                    const s = scheduled.shift();
                    launch(s.kind, s.cell, s.by);
                }
            }
            // Hàng đợi ném: nhịp shotsPerSecond; hàng rỗng chỉ để dành 1 phát (quà tới là bay ngay, không dồn cục).
            const rate = cfg.shotsPerSecond;
            budget = Math.min(queue.length ? rate : 1, budget + dt / 1000 * rate);
            while (budget >= 1 - 1e-9 && queue.length && flights.length < MAX_FLIGHTS) { budget -= 1; launch('paint', -1, queue.shift()); }
            landFlights();
        }
        function landFlights() {
            for (let k = flights.length - 1; k >= 0; k--) {
                const f = flights[k];
                if (clock - f.t0 >= f.ms) { flights.splice(k, 1); impact(f); }
            }
        }

        function step(dtMs) {
            events = pending; pending = []; stepping = true;
            let left = Math.max(0, num(dtMs, 0));
            try { while (left > 0) { const d = Math.min(SUB_MS, left); tick(d); left -= d; } }
            finally { stepping = false; }
            return events;
        }

        function enqueuePaint(n, by) {
            const add = Math.max(0, Math.min(Math.floor(num(n, 0)), MAX_QUEUE - queue.length));
            for (let i = 0; i < add; i++) queue.push(by || '');
            return add;
        }
        function storm(seconds, percent, by) {
            const sec = clamp(num(seconds, 10), 2, STORM_MAX_SEC);
            const n = Math.round(N * clamp(num(percent, 100), 10, 100) / 100);
            const order = Array.from({ length: N }, (_, i) => i);
            for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
            const gap = sec * 1000 / n;
            for (let i = 0; i < n; i++) scheduled.push({ at: clock + i * gap, kind: 'paint', cell: order[i], by: by || '' });
            return n;
        }
        function water(n, by) {
            const k = Math.max(1, Math.min(MAX_QUEUE, Math.floor(num(n, 1))));
            for (let i = 0; i < k; i++) scheduled.push({ at: clock + i * WATER_GAP_MS, kind: 'water', cell: -1, by: by || '' });
            return k;
        }
        function shield(seconds) {
            shieldUntil = Math.min(clock + SHIELD_MAX_SEC * 1000, Math.max(clock, shieldUntil) + clamp(num(seconds, 10), 0, SHIELD_MAX_SEC) * 1000);
            return shieldMs();
        }
        function applyAction(a, by) {
            if (!a || !ACTION_TYPES.includes(a.type)) return;
            const p = a.params || {}, d = ACTION_DEFAULT_PARAMS[a.type];
            if (a.type === 'paint') enqueuePaint(num(p.count, d.count), by);
            else if (a.type === 'storm') storm(num(p.seconds, d.seconds), num(p.percent, d.percent), by);
            else if (a.type === 'water') water(num(p.count, d.count), by);
            else if (a.type === 'shield') shield(num(p.seconds, d.seconds));
            else if (a.type === 'wash') wash(by);
        }

        function setFace(head) {
            if (head && Number.isFinite(Number(head.x)) && Number.isFinite(Number(head.y))) {
                face = { x: Number(head.x), y: Number(head.y), width: num(head.width, 300) };
                faceAt = clock;
            } else face = null;
        }
        function setCoverage(list, total) {
            if (list && list.length === N) for (let i = 0; i < N; i++) cells[i] = clamp(list[i], 0, 1);
            coverage = clamp(num(total, 0), 0, 1);
        }
        function setConfig(c) { cfg = normalizeConfig(c); }

        function flightView(f) {
            const t = Math.min(1, (clock - f.t0) / f.ms), u = 1 - t;
            return { id: f.id, kind: f.kind, t, r: f.r, color: f.color,
                x: u * u * f.x0 + 2 * u * t * f.cx + t * t * f.x1, y: u * u * f.y0 + 2 * u * t * f.cy + t * t * f.y1 };
        }
        function snapshot() {
            return {
                clock, flights: flights.map(flightView), queue: queue.length, scheduled: scheduled.length,
                coverage, cells, phase, shieldMs: shieldMs(), dome: dome(), lastBy, events
            };
        }

        return { step, applyAction, enqueuePaint, storm, water, shield, wash, washDone, clear, reset, setFace, setCoverage, setConfig, snapshot };
    }

    return {
        COLS, ROWS, PALETTE, ACTION_TYPES, ACTION_PRESET, ACTION_DEFAULT_PARAMS, ACTION_LIMITS, ACTION_ICONS,
        defaultConfig, normalizeConfig, normalizeAction, actionForGift, shotsForGift, giftPlan, createEngine
    };
});
