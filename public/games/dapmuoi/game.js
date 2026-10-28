// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* Đập Muỗi - engine thuần (không DOM). Dùng chung cho overlay (browser) và test (node).
 * Đơn vị: px sân khấu 1080×1920, thời gian ms, y tăng xuống dưới.
 * Spec: docs/superpowers/specs/2026-10-13-dapmuoi-design.md */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.dapmuoi = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const MAX_QUEUE = 2000;     // trần tổng muỗi chờ sinh - bão quà không thành hàng giờ muỗi
    const BASE_SIZE = 100;      // bề ngang muỗi (px) khi mosquitoScale = 100 - NPC: 150 → 100 (user 2026-10-16: muỗi hơi to)
    const GRAVITY = 1600;       // px/s² lúc rơi
    const EDGE = 120;           // ra khỏi mép quá ngần này thì kéo về

    const ACTION_TYPES = ['release', 'spray', 'racket', 'net', 'cream', 'boss'];
    const ACTION_PRESET = {
        release: { icon: '🦟', name: hpT('Thả muỗi') },
        spray:   { icon: '🧴', name: hpT('Bình xịt') },
        racket:  { icon: '🏸', name: hpT('Vợt điện') },
        net:     { icon: '🛏', name: hpT('Mắc màn') },
        cream:   { icon: '🩹', name: hpT('Kem chống muỗi') },
        boss:    { icon: '👑', name: hpT('Muỗi Chúa') }
    };
    const ACTION_DEFAULT_PARAMS = {
        release: { count: 20 },
        spray:   { radius: 600, ms: 2500, count: 50, percent: 0 },
        racket:  { seconds: 10 },
        net:     { seconds: 15 },
        cream:   { seconds: 30 },
        // 👑 Muỗi Chúa: con to có thanh máu, đập đủ hp cú mới chết → bật hiệu ứng trong 💥 Rổ hiệu ứng (lib/camgames-fx.cjs).
        // Bỏ qua quá fleeSec giây thì tự bay đi (mặc định 5 phút).
        boss:    { count: 1, hp: 5, fleeSec: 300, size: 160 }   // size: % so với muỗi thường
    };
    // Muỗi chích (GĐ2): bay quá afterSec và thấy người → tìm điểm đậu → đậu landSec → chích.
    // Đốt TOÀN THÂN nhưng dồn vào MẶT (theo HP LIVE NPC) - facePercent % điểm đậu ở mặt (trán/má/cằm), còn lại cổ/vai/
    // bụng/hông hai bên/bắp tay (KHÔNG ngực, háng - public/lib/body-frames.mjs isSensitiveSpot). Nhịp chích giữ như HP Action
    // LIVE (user chốt 28/10/2026: không lấy bản "chích dồn dập" afterSec 8 / gapSec 0.5 / 15 con đậu / 20 nốt của NPC).
    function defaultBite() {
        return { enabled: true, afterSec: 20, landSec: 1.2, gapSec: 3, bumpSec: 30, maxBumps: 12, maxLanded: 3, facePercent: 70,
            zones: { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true, body: true } };
    }
    const BITE_LIMITS = { afterSec: [1, 600], landSec: [0.3, 10], gapSec: [0, 60], bumpSec: [1, 600], maxBumps: [1, 50], maxLanded: [1, 40], facePercent: [0, 100] };
    const BITE_ZONE_KEYS = ['forehead', 'cheeks', 'chin', 'neck', 'shoulders', 'body'];
    const FACE_SPOT_ZONES = new Set(['forehead', 'cheekL', 'cheekR', 'chin']);   // = FACE_ZONES trong overlays/lib/body-frames.mjs
    const SEEK_ARRIVE = 25;      // px: tới gần điểm đậu ngần này là đậu
    const SLOW_AFTER_BITE_MS = 5000;

    // Giới hạn từng tham số theo loại - cũng là DANH SÁCH KHOÁ hợp lệ: khoá lạ bị bỏ.
    const ACTION_LIMITS = {
        release: { count: [1, 1000] },
        spray:   { radius: [100, 1500], ms: [300, 10000], count: [0, 2000], percent: [0, 100] },
        racket:  { seconds: [1, 60] },
        net:     { seconds: [1, 120] },
        cream:   { seconds: [1, 120] },
        boss:    { count: [1, 5], hp: [1, 50], fleeSec: [10, 3600], size: [100, 400] }
    };
    // Combo ×N = N lần thời lượng, chạy tới hết (user 29/10/2026) - chỉ trần an toàn 6 giờ.
    const RACKET_MAX_MS = 6 * 3600000, NET_MAX_MS = 6 * 3600000, CREAM_MAX_MS = 6 * 3600000;
    const ACTION_ICONS = ['🦟', '🧴', '🏸', '🛏', '💨', '⚡', '🌿', '🪰', '👑'];
    const BOSS_SIZE_DEFAULT = 160;   // Muỗi Chúa mặc định to bằng 160% muỗi thường (params.size chỉnh 100–400%)
    const BOSS_MAX_ALIVE = 3;        // tối đa 3 con trên màn, dư thì chờ
    const BOSS_QUEUE_MAX = 999;
    const BOSS_RACKET_GAP_MS = 500;  // vợt điện lướt qua: mỗi 0,5 s trừ 1 máu (không chết ngay như muỗi thường)
    const BOSS_POINTS = 10;
    const FX_DEFAULT = { pool: [], pickMin: 1, pickMax: 2, cooldownSec: 4, maxPending: 3 };

    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
    function clamp(v, min, max) { const n = Number(v); if (!Number.isFinite(n)) return min; return Math.min(max, Math.max(min, n)); }
    function str(v, max) { return String(v == null ? '' : v).slice(0, max); }

    function normalizeAction(raw, index, cfg) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const type = ACTION_TYPES.includes(raw.type) ? raw.type : 'release';
        const params = { ...ACTION_DEFAULT_PARAMS[type] };
        const saved = raw.params && typeof raw.params === 'object' ? raw.params : {};
        // Giá trị không phải số (config sửa tay / API) → giữ MẶC ĐỊNH của loại, không kẹp về min
        // (min của spray.count là 0 → bình xịt không giết con nào mà không ai hiểu vì sao).
        for (const [k, [min, max]] of Object.entries(ACTION_LIMITS[type])) {
            const v = saved[k];
            if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) params[k] = clamp(v, min, max);
        }
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
        smartPercent: [0, 100], smartLives: [2, 6], sidePercent: [0, 100], spawnPerSecond: [1, 30], maxOnScreen: [20, 600], idleSpawnSeconds: [0, 60],
        maxPerGift: [1, 1000], coinsPerMosquito: [0, 5000]
    };

    function normalizeConfig(raw) {
        const def = defaultConfig();
        raw = raw && typeof raw === 'object' ? raw : {};
        const cfg = { ...def, ...raw };
        cfg.enabled = raw.enabled !== false;
        cfg.hitMode = ['clap', 'slap', 'both'].includes(raw.hitMode) ? raw.hitMode : 'clap';
        cfg.killMode = raw.killMode === 'all' ? 'all' : 'one';
        for (const [k, [min, max]] of Object.entries(NUM_LIMITS)) {
            const v = raw[k];
            cfg[k] = (v !== '' && v !== null && Number.isFinite(Number(v))) ? clamp(v, min, max) : def[k];
        }
        cfg.faceAttract = raw.faceAttract !== false;
        cfg.quality = ['low', 'auto', 'high'].includes(raw.quality) ? raw.quality : 'auto';
        cfg.giftRules = Array.isArray(raw.giftRules) ? raw.giftRules.map(normalizeRule) : [];
        // Thiếu khoá (config cũ) → 4 hành động mặc định; mảng rỗng là người dùng đã xoá hết → giữ rỗng.
        cfg.actions = Array.isArray(raw.actions)
            ? raw.actions.filter(a => a && typeof a === 'object').map((a, i) => normalizeAction(a, i, cfg))
            : defaultActions();
        // Config lưu trước GĐ2 (chưa có khoá bite) → thêm hành động Kem chống muỗi một lần; lần lưu sau có bite nên không thêm lại.
        if (raw.bite === undefined && Array.isArray(raw.actions) && raw.actions.length && !cfg.actions.some(a => a.type === 'cream')) {
            cfg.actions.push(normalizeAction({ type: 'cream' }, cfg.actions.length, cfg));
        }
        // 💥 Rổ hiệu ứng: server chuẩn hoá đầy đủ (lib/camgames-fx.cjs) - ở đây chỉ giữ khung để panel/overlay đọc an toàn.
        const fx = raw.fx && typeof raw.fx === 'object' && !Array.isArray(raw.fx) ? raw.fx : {};
        cfg.fx = { ...FX_DEFAULT, ...fx, pool: Array.isArray(fx.pool) ? fx.pool.filter(e => e && typeof e === 'object' && e.src && e.id) : [] };
        const b = raw.bite && typeof raw.bite === 'object' ? raw.bite : {};
        const bite = defaultBite();
        bite.enabled = b.enabled !== false;
        for (const [k, [min, max]] of Object.entries(BITE_LIMITS)) {
            const v = b[k];
            if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) bite[k] = clamp(v, min, max);
        }
        const z = b.zones && typeof b.zones === 'object' ? b.zones : {};
        for (const k of BITE_ZONE_KEYS) bite.zones[k] = z[k] !== false;
        cfg.bite = bite;
        const snd = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
        cfg.sound = { enabled: snd.enabled !== false, volume: clamp(snd.volume != null ? snd.volume : def.sound.volume, 0, 1) };
        const d = raw.display && typeof raw.display === 'object' ? raw.display : {};
        cfg.display = {
            showHud: d.showHud !== false,
            hudXPercent: clamp(d.hudXPercent != null ? d.hudXPercent : 50, 0, 100),
            hudYPercent: clamp(d.hudYPercent != null ? d.hudYPercent : 8, 0, 100),
            hudScale: clamp(d.hudScale != null ? d.hudScale : 100, 30, 300),
            // Danh sách người tặng quà (dòng "Rowan · Thả muỗi 1 con"): tâm ngang + mép TRÊN theo % khung cam, cỡ %.
            listXPercent: clamp(d.listXPercent != null ? d.listXPercent : 50, 0, 100),
            listYPercent: clamp(d.listYPercent != null ? d.listYPercent : 50, 0, 95),
            listScale: clamp(d.listScale != null ? d.listScale : 100, 30, 300),
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
            killMode: 'one',               // 'one' = mỗi cú vỗ chết 1 con gần nhất | 'all' = chết cả bầy trong vòng
            sidePercent: 60,               // % đích bay nằm ở 2 mép khi còn ít muỗi (đỡ dồn giữa mặt)
            speed: 180, mosquitoScale: 100, faceAttract: true, faceRadius: 260,
            gentlePercent: 35, crowdFrom: 120, smartPercent: 10, smartLives: 3,
            spawnPerSecond: 6, maxOnScreen: 300, idleSpawnSeconds: 8, maxPerGift: 1000,
            coinsPerMosquito: 1, giftRules: [],
            actions: defaultActions(),
            fx: { ...FX_DEFAULT, pool: [] },
            bite: defaultBite(),
            sound: { enabled: true, volume: 0.5 },
            display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, listXPercent: 50, listYPercent: 50, listScale: 100, showHitRing: true, showSkeleton: false },
            quality: 'auto'
        };
    }

    function createEngine(config, opts) {
        opts = opts || {};
        const width = opts.width || 1080;
        const height = opts.height || 1920;
        const rng = opts.random || Math.random;
        // 👁 Vùng chơi = phần sân khấu còn thấy trên OBS (Scene PK cắt ô khung cam - overlay gọi setArea). Muỗi sinh / lượn / trốn
        // theo vùng này; mặc định cả sân khấu (dãy rng() y hệt bản cũ).
        let A = { x: 0, y: 0, w: width, h: height };
        function setArea(r) {
            const ok = r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;
            A = ok ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: 0, y: 0, w: width, h: height };
        }
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
        let racketMs = 0, netMs = 0, creamMs = 0;
        let spray = null;         // { x, y, radius, ms, elapsed, limit, killed }
        // Lượt xịt còn chờ: combo ×N / quà xịt mới lúc đang xịt → xịt NỐI TIẾP từng mây (trước đây combo chỉ ra 1 mây).
        let sprayPending = 0, sprayParams = null;
        const SPRAY_MAX_PENDING = 999;
        let personSeen = false;   // overlay báo pose còn tươi
        let spots = [];           // điểm đậu trên người (sân khấu + cục bộ), overlay cập nhật mỗi khung
        let bites = 0;
        let lastBiteAt = -Infinity;   // giãn cách toàn cục giữa hai lần chích (bite.gapSec)
        let bossQueue = [];           // 👑 Muỗi Chúa chờ ra: { hp, fleeSec, fxId }

        function halfSize(m) { return 0.5 * BASE_SIZE * m.scale * (m.smart ? 1.15 : 1); }   // con thông minh vẽ to hơn 15%

        // Giết một con: lật úp, nảy nhẹ lên rồi rơi.
        function kill(m) {
            m.state = 'dead'; m.deadAt = clock; m.vy = -250; m.vx *= 0.3; m.spot = null;
            score += m.boss ? BOSS_POINTS : 1; killed += 1;
            if (m.boss) { m.hp = 0; events.push({ type: 'bossKill', id: m.id, x: m.x, y: m.y, fxId: m.fxId || '' }); }
        }
        // 👑 Một cú trúng Muỗi Chúa: trừ 1 máu; hết máu thì chết, còn máu thì bị hất văng ngắn (vẫn dính đòn, không né).
        function bossDamage(m, px, py) {
            m.hp = Math.max(0, m.hp - 1);
            if (m.hp <= 0) { kill(m); return true; }
            let dx = m.x - px, dy = m.y - py; const d = Math.hypot(dx, dy);
            if (d < 1) { const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
            if (m.state !== 'flee') { m.state = 'dodge'; m.dodgeUntil = clock + 250; m.vx = dx * 900; m.vy = dy * 900; }   // đang bay đi thì cứ bay đi
            if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
            m.hurtAt = clock;
            events.push({ type: 'bossHit', id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp });
            return false;
        }
        function bossAlive() { let n = 0; for (const m of mosquitoes) if (m.boss && m.state !== 'dead' && m.state !== 'gone') n++; return n; }
        function spawnBoss(b) {
            const left = rng() < 0.5;
            const hp = Math.max(1, Math.floor(num(b.hp, 5)));
            const m = {
                id: nextId++, x: left ? A.x - 60 : A.x + A.w + 60, y: A.y + A.h * (0.2 + 0.4 * rng()), vx: left ? 1 : -1, vy: 0, dir: left ? 1 : -1,
                age: 0, biteAt: Infinity, spot: null, landedMs: 0, slowUntil: 0,
                scale: num(cfg.mosquitoScale, 100) / 100 * Math.min(4, Math.max(1, num(b.size, BOSS_SIZE_DEFAULT) / 100)), gentle: false, speedMul: 0.55, smart: false, livesLeft: 1,
                phase: rng() * Math.PI * 2, state: 'fly', deadAt: 0, dodgeUntil: 0, target: null, turnAt: 0,
                boss: true, hp, maxHp: hp, fxId: b.fxId || '', bornAt: clock,
                fleeAt: clock + Math.max(10, num(b.fleeSec, 300)) * 1000, zapAt: -Infinity, hurtAt: -Infinity
            };
            m.target = pickTarget(m); m.turnAt = clock + turnDelay(m);
            mosquitoes.push(m);
            events.push({ type: 'bossSpawn', id: m.id, x: m.x, y: m.y, hp, fleeMs: m.fleeAt - clock });
        }
        // combo đếm theo CÚ đập tay có trúng (một cú giết nhiều con vẫn +1), cách cú trước < 1.5 s.
        function registerHit() { combo = clock - lastKillAt < 1500 ? combo + 1 : 1; lastKillAt = clock; }

        // Muỗi thông minh né: vụt ngược hướng điểm đập 350 ms, đích mới cách điểm đập ≥ 400 px.
        function dodge(m, px, py) {
            m.livesLeft -= 1; m.state = 'dodge'; m.dodgeUntil = clock + 350; m.spot = null; m.landedMs = 0;
            let dx = m.x - px, dy = m.y - py; const d = Math.hypot(dx, dy);
            if (d < 1) { const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
            m.vx = dx * 1400; m.vy = dy * 1400;
            if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
            let t = null;
            for (let i = 0; i < 12; i++) { t = { x: A.x + rng() * A.w, y: A.y + rng() * A.h }; if (Math.hypot(t.x - px, t.y - py) >= 400) break; }
            m.target = t; m.turnAt = clock + turnDelay(m);
            events.push({ type: 'dodge', id: m.id, x: m.x, y: m.y, livesLeft: m.livesLeft });
        }

        // Vợt điện: tay lướt qua là chết (không né được). Chỉ khi vợt đang bật.
        // Vợt trúng một con: muỗi thường chết luôn; Muỗi Chúa mất 1 máu mỗi BOSS_RACKET_GAP_MS (true = có chết).
        function zap(m, px, py) {
            if (!m.boss) { kill(m); return true; }
            if (clock - m.zapAt < BOSS_RACKET_GAP_MS) return false;
            m.zapAt = clock;
            return bossDamage(m, px, py);
        }
        function sweep(x, y, r) {
            if (racketMs <= 0) return 0;
            const px = num(x, 0), py = num(y, 0), pr = Math.max(0, num(r, 0));
            let n = 0;
            for (const m of mosquitoes) {
                if (m.state === 'dead' || m.state === 'gone') continue;
                if (Math.hypot(m.x - px, m.y - py) > pr + halfSize(m)) continue;
                if (zap(m, px, py)) n++;
            }
            if (n) events.push({ type: 'zap', n, x: px, y: py });
            return n;
        }

        // Vợt quẹt nhanh: giết mọi con nằm trong bán kính r quanh ĐOẠN đường mặt vợt đi qua giữa hai khung
        // (một điểm mỗi khung AI ~15 lần/giây thì vung nhanh là bỏ sót muỗi ở giữa).
        function sweepSegment(ax, ay, bx, by, r) {
            if (racketMs <= 0) return 0;
            const x1 = num(ax, 0), y1 = num(ay, 0), x2 = num(bx, x1), y2 = num(by, y1), pr = Math.max(0, num(r, 0));
            const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
            let n = 0;
            for (const m of mosquitoes) {
                if (m.state === 'dead' || m.state === 'gone') continue;
                let t = l2 > 0 ? ((m.x - x1) * dx + (m.y - y1) * dy) / l2 : 0;
                t = Math.max(0, Math.min(1, t));
                const cx = x1 + t * dx, cy = y1 + t * dy;
                if (Math.hypot(m.x - cx, m.y - cy) > pr + halfSize(m)) continue;
                if (zap(m, cx, cy)) n++;
            }
            if (n) events.push({ type: 'zap', n, x: x2, y: y2 });
            return n;
        }
        function release(n) { return enqueue(n); }
        function racket(seconds) { racketMs = Math.min(RACKET_MAX_MS, racketMs + Math.max(0, num(seconds, 0)) * 1000); events.push({ type: 'racket', ms: racketMs }); }
        // Mắc màn: người ở TRONG màn - muỗi không vào chích được: đẩy con đang tìm/đậu ra, dừng sinh muỗi mới.
        function net(seconds) {
            netMs = Math.min(NET_MAX_MS, netMs + Math.max(0, num(seconds, 0)) * 1000);
            let n = 0;
            for (const m of mosquitoes) if (m.state === 'seek' || m.state === 'landed') { repel(m); n++; }
            events.push({ type: 'net', ms: netMs });
            if (n) events.push({ type: 'repel', n });
        }

        // Bình xịt: đám mây tại tâm đàn (không có muỗi → giữa sân), nở tới radius trong ms,
        // giết tối đa limit con lọt vào mây. Gọi thẳng khi đang có mây → thay mây mới (quà / combo đi qua sprayQueue).
        function sprayStart(p) {
            p = p && typeof p === 'object' ? p : {};
            const alive = mosquitoes.filter(m => m.state !== 'dead');
            let cx = A.x + A.w / 2, cy = A.y + A.h / 2;
            if (alive.length) { cx = alive.reduce((s, m) => s + m.x, 0) / alive.length; cy = alive.reduce((s, m) => s + m.y, 0) / alive.length; }
            const percent = num(p.percent, 0);
            const limit = percent > 0 ? Math.ceil(alive.length * percent / 100) : Math.max(0, Math.floor(num(p.count, 50)));
            spray = { x: cx, y: cy, radius: Math.max(1, num(p.radius, 600)), ms: Math.max(1, num(p.ms, 2500)), elapsed: 0, limit, killed: 0 };
            events.push({ type: 'spray', x: cx, y: cy, radius: spray.radius, ms: spray.ms });
        }
        // n lượt xịt: chưa có mây thì xịt ngay 1, còn lại xếp chờ - mây trước tan mới xịt mây sau (tâm đàn tính lại lúc xịt).
        function sprayQueue(p, n) {
            n = Math.max(1, Math.floor(num(n, 1)));
            sprayParams = p;
            if (!spray) { sprayStart(p); n--; }
            sprayPending = Math.min(SPRAY_MAX_PENDING, sprayPending + n);
        }
        function sprayTick(dtm) {
            if (!spray) return;
            spray.elapsed += dtm;
            const r = spray.radius * Math.min(1, spray.elapsed / spray.ms);
            for (const m of mosquitoes) {
                if (spray.killed >= spray.limit) break;
                if (m.state === 'dead' || m.state === 'gone' || m.boss) continue;   // 👑 Muỗi Chúa không sợ bình xịt
                if (Math.hypot(m.x - spray.x, m.y - spray.y) > r + halfSize(m)) continue;
                kill(m); spray.killed++;
            }
            if (spray.elapsed >= spray.ms) {
                spray = null;
                if (sprayPending > 0) { sprayPending--; sprayStart(sprayParams); }
            }
        }

        // 👑 Thả Muỗi Chúa: mỗi con một id vé (server cấp) - đập chết thì overlay gửi lại id để bật hiệu ứng.
        function boss(p, fxIds) {
            p = p && typeof p === 'object' ? p : {};
            const n = Math.max(1, Math.floor(num(p.count, 1)));
            const ids = Array.isArray(fxIds) ? fxIds : [];
            let added = 0;
            for (let i = 0; i < n && bossQueue.length < BOSS_QUEUE_MAX; i++) { bossQueue.push({ hp: p.hp, fleeSec: p.fleeSec, size: p.size, fxId: String(ids[i] || '') }); added++; }
            return added;
        }

        // Chạy một hành động đã chuẩn hoá qty lần (release: count×qty; spray: qty mây nối tiếp; racket/net: giây×qty; boss: count con).
        function applyAction(action, qty, extra) {
            if (!action || !ACTION_TYPES.includes(action.type)) return;
            const n = Math.max(1, Math.floor(num(qty, 1)));
            const p = action.params || {};
            if (action.type === 'boss') { boss(p, extra && extra.fxIds); return; }
            if (action.type === 'release') release(Math.floor(num(p.count, 20)) * n);
            else if (action.type === 'spray') sprayQueue(p, n);
            else if (action.type === 'racket') racket(num(p.seconds, 10) * n);
            else if (action.type === 'net') net(num(p.seconds, 15) * n);
            else if (action.type === 'cream') cream(num(p.seconds, 30) * n);
        }

        // Cú đập tay tại (x,y) bán kính r → số muỗi chết.
        function hit(x, y, r) {
            const px = num(x, 0), py = num(y, 0), pr = Math.max(0, num(r, 0));
            let n = 0, dodged = 0;
            // Muỗi Chúa đang bị hất (dodge ngắn sau cú trước) vẫn đập tiếp được - đập liên hoàn.
            const hittable = m => m.state === 'fly' || m.state === 'seek' || m.state === 'landed' || (m.boss && (m.state === 'dodge' || m.state === 'flee'));
            let targets = mosquitoes.filter(m => hittable(m) && Math.hypot(m.x - px, m.y - py) <= pr + halfSize(m));
            if (cfg.killMode !== 'all' && targets.length > 1) {
                // Đập từng con: chỉ con gần điểm vỗ nhất.
                targets = [targets.reduce((a, b) => Math.hypot(a.x - px, a.y - py) <= Math.hypot(b.x - px, b.y - py) ? a : b)];
            }
            let caught = 0, bossHits = 0;
            for (const m of targets) {
                if (m.boss) { bossHits++; if (bossDamage(m, px, py)) n++; }
                else if (m.smart && m.livesLeft > 1) { dodge(m, px, py); dodged++; }
                else { if (m.state === 'seek' || m.state === 'landed') { caught++; score += 1; } kill(m); n++; }   // kịp đập con đang chích: +2
            }
            if (n) { registerHit(); events.push({ type: 'kill', n, x: px, y: py, combo, caught: caught > 0 }); }
            else if (bossHits) registerHit();
            else if (!dodged) events.push({ type: 'miss', x: px, y: py });
            return n;
        }

        function flyingCount() { let n = 0; for (const m of mosquitoes) if (m.state !== 'dead' && m.state !== 'gone') n++; return n; }

        // Đích bay: còn ít muỗi thì ưu tiên 2 mép (đổi bên so với vị trí hiện tại → bay qua lại ngang mặt),
        // đông lên mới lấp dần vào giữa; thỉnh thoảng ghé quanh mặt (15%) chứ không bu kín mặt.
        function pickTarget(m) {
            const flying = flyingCount();
            const sparse = flying < Math.max(1, num(cfg.crowdFrom, 120)) / 2;
            const sideP = num(cfg.sidePercent, 60) / 100 * (sparse ? 1 : 0.5);
            if (rng() < sideP) {
                const band = 0.28 * A.w, L = A.x, R = A.x + A.w;
                // Đang ở giữa → bay ra mép gần; đã ở mép → nửa lượn cùng mép, nửa bay sang mép kia (qua lại ngang mặt).
                const atLeft = m.x < L + band, atRight = m.x > R - band;
                const goRight = atLeft ? rng() < 0.5 : atRight ? rng() >= 0.5 : m.x >= L + A.w / 2;
                // keep: giữ đích tới khi tới nơi (không rẽ giữa chừng) - nếu không muỗi quay đầu ở giữa mặt mãi
                return { x: goRight ? R - rng() * band : L + rng() * band, y: A.y + rng() * A.h, keep: true };
            }
            if (cfg.faceAttract !== false && creamMs <= 0 && netMs <= 0 && clock - face.at <= 500 && rng() < 0.15) {
                const r = num(cfg.faceRadius, 260) * Math.sqrt(rng()), a = rng() * Math.PI * 2;
                return { x: face.x + Math.cos(a) * r, y: face.y + Math.sin(a) * r };
            }
            return { x: A.x + rng() * A.w, y: A.y + rng() * A.h };
        }
        function turnDelay(m) { return m.gentle ? 2000 + rng() * 3000 : 600 + rng() * 1200; }
        // Sau ngần này ms bay thì đi tìm người: afterSec ± 30% (không chích đồng loạt), thông minh nhanh hơn (×0.6).
        function biteDelay(m) { return num(cfg.bite?.afterSec, 20) * 1000 * (0.7 + 0.6 * rng()) * (m.smart ? 0.6 : 1); }
        function seekingCount() { let n = 0; for (const m of mosquitoes) if (m.state === 'seek' || m.state === 'landed') n++; return n; }
        function landedCount() { let n = 0; for (const m of mosquitoes) if (m.state === 'landed') n++; return n; }
        // Chọn điểm đậu: facePercent % ở MẶT, còn lại khắp thân (thiếu một nhóm thì lấy nhóm kia).
        function pickSpot(bite) {
            const face = [], body = [];
            for (const sp of spots) (FACE_SPOT_ZONES.has(sp.zone) ? face : body).push(sp);
            const fp = num(bite && bite.facePercent, 70) / 100;
            const list = !body.length ? face : !face.length ? body : (rng() < fp ? face : body);
            return list[Math.floor(rng() * list.length)] || spots[0];
        }
        // Điểm đậu của con đang bám: theo id (biến thể) nếu có, không thì theo vùng.
        function spotFor(cur) { for (const sp of spots) if (cur.id ? sp.id === cur.id : sp.zone === cur.zone) return sp; return null; }
        function setPersonSeen(seen) { personSeen = !!seen; }
        // Overlay đẩy điểm đậu theo pose mỗi khung; con đang seek/landed bám theo điểm cùng vùng.
        function setBiteSpots(list) {
            spots = Array.isArray(list) ? list.filter(sp => sp && Number.isFinite(sp.x) && Number.isFinite(sp.y) && sp.zone) : [];
            for (const m of mosquitoes) if (m.spot && (m.state === 'seek' || m.state === 'landed')) { const sp = spotFor(m.spot); if (sp) m.spot = sp; }
        }
        // Đẩy một con đang tìm/đậu văng khỏi người (kem): vụt ngược hướng điểm đậu 350 ms rồi bay thường.
        function repel(m) {
            const px = m.spot ? m.spot.x : m.x, py = m.spot ? m.spot.y : m.y;
            let dx = m.x - px, dy = m.y - py; const d = Math.hypot(dx, dy);
            if (d < 1) { const a = rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
            m.state = 'dodge'; m.dodgeUntil = clock + 350; m.vx = dx * 1400; m.vy = dy * 1400;
            if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
            m.spot = null; m.landedMs = 0; m.age = 0; m.biteAt = biteDelay(m);
            m.target = { x: A.x + rng() * A.w, y: A.y + rng() * A.h }; m.turnAt = clock + turnDelay(m);
        }
        function cream(seconds) {
            creamMs = Math.min(CREAM_MAX_MS, creamMs + Math.max(0, num(seconds, 0)) * 1000);
            let n = 0;
            for (const m of mosquitoes) if (m.state === 'seek' || m.state === 'landed') { repel(m); n++; }
            events.push({ type: 'cream', ms: creamMs });
            if (n) events.push({ type: 'repel', n });
        }
        // Đích ở mép (keep) giữ đủ thời gian bay tới + 0.5 s; đích thường đổi theo turnDelay.
        function retarget(m) {
            m.target = pickTarget(m);
            if (m.target.keep) {
                const d = Math.hypot(m.target.x - m.x, m.target.y - m.y), sp = Math.max(20, num(cfg.speed, 180) * m.speedMul * 0.4);
                m.turnAt = clock + Math.min(12000, d / sp * 1000 + 500);
            } else m.turnAt = clock + turnDelay(m);
        }

        function spawn() {
            const left = rng() < 0.5;
            const gentle = rng() * 100 < num(cfg.gentlePercent, 35);
            const smart = rng() * 100 < num(cfg.smartPercent, 10);
            const m = {
                id: nextId++, x: left ? A.x : A.x + A.w, y: A.y + rng() * A.h, vx: left ? 1 : -1, vy: 0, dir: left ? 1 : -1,
                age: 0, biteAt: 0, spot: null, landedMs: 0, slowUntil: 0,
                scale: num(cfg.mosquitoScale, 100) / 100, gentle,
                speedMul: gentle ? 0.25 + rng() * 0.25 : 0.8 + rng() * 0.5,
                smart, livesLeft: smart ? Math.max(2, Math.floor(num(cfg.smartLives, 3))) : 1,
                phase: rng() * Math.PI * 2, state: 'fly', deadAt: 0, dodgeUntil: 0,
                target: null, turnAt: 0
            };
            m.biteAt = biteDelay(m);
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
                || m.x < A.x - EDGE || m.x > A.x + A.w + EDGE || m.y < A.y - EDGE || m.y > A.y + A.h + EDGE) retarget(m);
            const sp = num(cfg.speed, 180) * m.speedMul * crowd * (clock < m.slowUntil ? 0.7 : 1) * (netMs > 0 ? 0.55 : 1);   // có màn: bò chậm trên màn
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
            creamMs = Math.max(0, creamMs - dtm);
            const maxOn = Math.max(1, num(cfg.maxOnScreen, 300));
            if (netMs > 0) { spawnAcc = 0; idleAcc = 0; }   // mắc màn: không sinh gì, hàng đợi giữ nguyên
            else {
                // xả hàng đợi
                spawnAcc += num(cfg.spawnPerSecond, 6) * dt;
                while (spawnAcc >= 1 && queue > 0 && flying < maxOn) { spawnAcc -= 1; queue--; spawn(); flying++; }
                // Hết hàng đợi HOẶC màn đầy thì không tích luỹ: giết xong màn phải lấp lại theo
                // spawnPerSecond, không bật ra cả loạt trong một khung.
                if (!queue || flying >= maxOn) spawnAcc = Math.min(spawnAcc, 1);
                // sinh nền
                const idle = num(cfg.idleSpawnSeconds, 8);
                if (idle > 0 && !queue) { idleAcc += dt; if (idleAcc >= idle) { idleAcc = 0; if (flying < maxOn) { spawn(); flying++; } } } else idleAcc = 0;
                // 👑 Muỗi Chúa: ra ngay khi còn chỗ (tối đa BOSS_MAX_ALIVE con cùng lúc), không tính trần maxOnScreen
                if (bossQueue.length) { let alive = bossAlive(); while (bossQueue.length && alive < BOSS_MAX_ALIVE) { spawnBoss(bossQueue.shift()); alive++; flying++; } }
            }
            sprayTick(dtm);
            // bay
            const crowdFrom = Math.max(1, num(cfg.crowdFrom, 120));
            const crowd = flying > crowdFrom ? Math.max(0.4, crowdFrom / flying) : 1;
            if (combo && clock - lastKillAt > 1500) combo = 0;
            const bite = cfg.bite || defaultBite();
            const canSeek = bite.enabled !== false && personSeen && creamMs <= 0 && netMs <= 0 && spots.length > 0 && clock - lastBiteAt >= num(bite.gapSec, 3) * 1000;
            let seeking = seekingCount();
            for (const m of mosquitoes) {
                // 👑 Bỏ qua quá fleeSec: Muỗi Chúa vụt bay ra mép gần nhất rồi biến mất (vé hiệu ứng bỏ).
                if (m.boss && !m.fled && (m.state === 'fly' || m.state === 'dodge') && clock >= m.fleeAt) {
                    m.state = 'flee'; m.fled = true;
                    m.target = { x: m.x < A.x + A.w / 2 ? A.x - 400 : A.x + A.w + 400, y: Math.max(A.y - 200, m.y - 500) };
                    events.push({ type: 'bossFlee', id: m.id, x: m.x, y: m.y, fxId: m.fxId || '' });
                }
                if (m.state === 'flee') {
                    const dx = m.target.x - m.x, dy = m.target.y - m.y, d = Math.hypot(dx, dy) || 1;
                    m.vx = dx / d * 900; m.vy = dy / d * 900; m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt * 140;
                    if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1;
                    if (m.x < A.x - 300 || m.x > A.x + A.w + 300 || m.y < A.y - 300) m.state = 'gone';
                    continue;
                }
                if (m.state === 'fly') {
                    fly(m, dt, crowd);
                    m.age += dtm;
                    if (canSeek && !m.boss && m.age >= m.biteAt && seeking < Math.max(1, num(bite.maxLanded, 3))) {
                        m.spot = pickSpot(bite);
                        m.state = 'seek'; m.landedMs = 0; seeking++;
                    }
                } else if (m.state === 'seek') {
                    if (!personSeen || !m.spot || netMs > 0) { m.state = 'fly'; m.spot = null; continue; }
                    const sp = num(cfg.speed, 180) * m.speedMul * 1.2;
                    const dx = m.spot.x - m.x, dy = m.spot.y - m.y, d = Math.hypot(dx, dy) || 1;
                    if (d <= SEEK_ARRIVE) { m.x = m.spot.x; m.y = m.spot.y; m.vx = 0; m.vy = 0; m.state = 'landed'; m.landedMs = 0; }
                    else { m.vx = dx / d * sp; m.vy = dy / d * sp; m.x += m.vx * dt; m.y += m.vy * dt; if (Math.abs(m.vx) > 1) m.dir = m.vx < 0 ? -1 : 1; m.phase += dt * 110; }
                } else if (m.state === 'landed') {
                    if (!m.spot) { m.state = 'fly'; continue; }
                    m.x = m.spot.x; m.y = m.spot.y; m.vx = 0; m.vy = 0;
                    if (personSeen) m.landedMs += dtm;      // mất người: dừng đếm, không chích "ảo"
                    if (m.landedMs >= num(bite.landSec, 1.2) * 1000) {
                        bites += 1; lastBiteAt = clock;
                        events.push({ type: 'bite', id: m.id, x: m.x, y: m.y, frame: m.spot.frame, a: m.spot.a, b: m.spot.b, zone: m.spot.zone });
                        m.state = 'fly'; m.spot = null; m.landedMs = 0; m.age = 0; m.biteAt = biteDelay(m); m.slowUntil = clock + SLOW_AFTER_BITE_MS;
                        m.target = pickTarget(m); m.turnAt = clock + turnDelay(m);
                    }
                }
                else if (m.state === 'dodge') {
                    m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt * 120;
                    if (clock >= m.dodgeUntil) m.state = 'fly';
                } else {
                    m.vy += GRAVITY * dt; m.x += m.vx * dt; m.y += m.vy * dt;
                }
            }
            mosquitoes = mosquitoes.filter(m => m.state !== 'gone' && (m.state !== 'dead' || (m.y <= A.y + A.h + 100 && clock - m.deadAt <= 2500)));
        }

        function setFace(x, y) { face.x = num(x, face.x); face.y = num(y, face.y); face.at = clock; }
        function setConfig(c) { cfg = Object.assign(defaultConfig(), c || {}); }
        function clear() { mosquitoes = []; queue = 0; spawnAcc = 0; idleAcc = 0; spray = null; sprayPending = 0; bossQueue = []; }
        function reset() { clear(); score = 0; killed = 0; combo = 0; bites = 0; lastKillAt = -Infinity; lastBiteAt = -Infinity; racketMs = 0; netMs = 0; creamMs = 0; events = []; }

        function snapshot() {
            const ev = events; events = [];
            return {
                mosquitoes: mosquitoes.map(m => ({
                    id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy, dir: m.dir, scale: m.scale, speedMul: m.speedMul,
                    smart: m.smart, livesLeft: m.livesLeft, phase: m.phase, state: m.state, deadAt: m.deadAt, dodgeUntil: m.dodgeUntil,
                    age: m.age, spot: m.spot, landedMs: m.landedMs, slowUntil: m.slowUntil,
                    boss: !!m.boss, hp: m.hp, maxHp: m.maxHp, fleeAt: m.fleeAt, bornAt: m.bornAt, hurtAt: m.hurtAt, fxId: m.fxId
                })),
                clock, queue, flying: flyingCount(), score, killed, combo, racketMs, netMs, creamMs, bites, landed: landedCount(),
                bosses: bossAlive(), bossQueue: bossQueue.length,
                sprayLeft: sprayPending + (spray ? 1 : 0),
                spray: spray ? { x: spray.x, y: spray.y, r: spray.radius * Math.min(1, spray.elapsed / spray.ms), msLeft: Math.max(0, spray.ms - spray.elapsed) } : null,
                events: ev
            };
        }

        return { enqueue, step, hit, sweep, sweepSegment, release, spray: sprayStart, racket, net, cream, boss, applyAction, setFace, setPersonSeen, setBiteSpots, setConfig, setArea, clear, reset, snapshot };
    }

    return { ACTION_TYPES, ACTION_PRESET, ACTION_LIMITS, ACTION_ICONS, BITE_LIMITS, BITE_ZONE_KEYS, defaultConfig, normalizeConfig, normalizeAction,
        actionForGift, mosquitoesForGift, createEngine, BASE_SIZE, GRAVITY, MAX_QUEUE };
});
