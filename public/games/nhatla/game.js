/* ============================================================
   HP Nhặt Lá — Engine helpers (client)
   ============================================================
   Module: window.HpGame.nhatla
   Overlay engine (rơi lá / chồng xếp / kéo thả) nằm trong overlay.html.
   File này chỉ giữ defaultConfig + tiện ích dùng chung cho panel & overlay.
   ============================================================ */
(function () {
    'use strict';
    window.HpGame = window.HpGame || {};

    function defaultConfig() {
        return {
            enabled: true,
            display: {
                hatSkin: 'la-mua-thu', // bộ ảnh hạt rơi — xem public/games/nhatla/skins/hat/
                binSkin: 'mac-dinh',   // bộ ảnh thùng rác — xem public/games/nhatla/skins/thung/
                leafScale: 100,
                handScale: 50,
                binScale: 100,
                // Bốn toạ độ chốt theo bố cục đã chạy live thật ở v1.7.0 — phải khớp từng số
                // với makeDefaultNhatLaConfig() trong server.js, lệch là panel và overlay
                // vẽ hai chỗ khác nhau lúc chưa có config lưu.
                binXPercent: 67,
                binYPercent: 72.6,
                hudXPercent: 66.3,
                hudYPercent: 14.1,
                showHud: true,
                reviewEditMode: true
            },
            drop: {
                minFallSec: 3.2,
                maxFallSec: 6.5,
                spawnGapMs: 60,
                maxLeaves: 6000
            },
            // Gió cục bộ: thổi tung một VÙNG lá quanh một điểm.
            // maxLeaves = số lá được đánh thức mỗi cơn. Đây là cần gạt THẨM MỸ (gió cuốn cả
            // mảng hay chỉ lác đác vài chiếc), KHÔNG phải cần gạt hiệu năng — đo được là
            // giảm 600 xuống 300 gần như không đổi frame time. Muốn nhẹ máy thì giảm
            // drop.maxLeaves. Chi tiết số đo nằm ở startGust() trong overlay.html.
            wind: {
                enabled: true,
                radius: 420,        // px — bán kính vùng gió
                strength: 640,      // px/s — vận tốc gió mục tiêu tại tâm
                turbulence: 55,     // % — tỉ lệ nhiễu xoáy trộn vào luồng thẳng
                durationMs: 1500,   // tổng thời gian một cơn (attack+sustain+decay)
                maxLeaves: 600,     // số lá cuốn lên mỗi cơn (cần gạt thẩm mỹ)
                drag: 32,           // /10 = hệ số bám gió (lá nhẹ bám nhanh)
                lift: 35,           // % — lực nâng theo vận tốc góc (rotational lift)
                direction: 'random',// 'left' | 'right' | 'random'
                windGifts: []       // quà TikTok kích hoạt gió
            },
            // Lốc xoáy: gom lá quay tròn quanh một trục rồi bốc lên.
            // spin đo bằng px/s TẠI RÌA chứ không phải vận tốc góc — cách tham số hoá này
            // khử sạch phép chia cho r, nên không có điểm kỳ dị ở tâm (xem tornadoAt()).
            tornado: {
                enabled: true,
                radius: 380,        // px — bán kính vùng xoáy
                spin: 800,          // px/s — vận tốc quay tại rìa
                // inward PHẢI đủ lớn so với spin, nếu không lá loe ra thay vì gom vào.
                // Không phải chuyện thẩm mỹ mà là chuyện số học: tích phân Euler đi theo
                // tiếp tuyến nên bán kính quỹ đạo tự phình ra ~v²/r mỗi bước. Đo thực tế
                // (avgDx sau 2s, spin 900): inward 220 → 96.9 loe thành 123.1;
                // inward 1000 → 139.4 gom lại còn 47.5. Đừng hạ inward xuống dưới ~2/3 spin.
                inward: 1000,       // px/s — lực hút vào tâm (phần "gom lá")
                lift: 380,          // px/s — lực bốc lên
                durationMs: 3200,   // thời gian một cơn lốc
                maxLeaves: 700,     // số lá bị cuốn vào
                drift: 90,          // px/s — tốc độ lốc trườn ngang qua sân
                gifts: []           // quà TikTok kích hoạt lốc
            },
            effects: {
                effectGifts: []
            },
            // Hành động CỨU: quà chỉ định bật chế độ tự nhặt lá trong N giây.
            autoClean: {
                enabled: true,
                durationMs: 5000,
                leavesPerSec: 40,
                gifts: []
            },
            // GIẢI CỨU: một danh sách phẳng, MỖI hành động = 1 quà + 1 bộ thông số RIÊNG.
            // Cấu trúc cũ để thông số ở khối chung (wind/tornado/autoClean) còn quà chỉ là
            // danh sách trỏ vào đó, nên gắn quà cứu thứ 2 là không có cách nào cho nó thời
            // lượng khác quà thứ 1. Hạ thông số xuống từng hành động thì hết ràng buộc đó.
            // Ba khối cũ vẫn giữ: làm MẪU cho hành động mới + công tắc tắt cả loại +
            // giữ wind.drag/wind.lift (xem ghi chú ở khối wind).
            rescue: {
                actions: []
            },
            // TOP người tặng lá: bảng xếp hạng theo BUỔI LIVE (server cộng dồn, reset tay).
            // Hai kiểu hiển thị bật/tắt độc lập — chữ bay để không chiếm chỗ overlay,
            // bảng đứng cho ai muốn TOP hiện thường trực.
            topDonors: {
                enabled: true,
                count: 5,
                minLeaves: 1,
                flyEnabled: true,
                // Chốt theo bố cục live thật: chữ nhỏ, xoay vòng từng người, bay nhanh rồi
                // nghỉ lâu — 'train' chữ to choán hết overlay, chỉ hợp lúc demo.
                flyMode: 'solo',     // 'train' = cả TOP nối đuôi 1 lượt | 'solo' = xoay vòng từng người
                flyIntervalSec: 31,
                flyDurationSec: 4,
                flyYPercent: 48,
                flyScale: 48,
                boardEnabled: false,
                boardXPercent: 62,
                boardYPercent: 6,
                boardScale: 100
            },
            giftRules: [],
            coinsPerLeaf: 1,
            defaultLeavesPerGift: 0
        };
    }

    // ===== GIẢI CỨU =====
    const RESCUE_TYPES = ['wind', 'tornado', 'autoClean'];
    const RESCUE_PRESET = {
        wind:      { icon: '🌬', name: 'Gió thổi bay lá' },
        tornado:   { icon: '🌪', name: 'Lốc xoáy gom lá' },
        autoClean: { icon: '🧹', name: 'Tự nhặt lá' }
    };
    const RESCUE_ICONS = ['🌬', '🌪', '🧹', '🍃', '🌀', '💨', '✨', '🧺', '🪄', '⚡', '🔥', '❄️', '🌊', '🎐', '🌟', '🫧'];
    // Giới hạn từng thông số theo loại. Đây cũng là DANH SÁCH KHOÁ hợp lệ: khoá lạ bị bỏ,
    // nên config cũ/hỏng không nhét được rác vào payload gửi xuống overlay.
    const RESCUE_LIMITS = {
        wind:      { radius: [80, 1600], strength: [40, 4000], turbulence: [0, 100], durationMs: [200, 10000], maxLeaves: [10, 4000] },
        tornado:   { radius: [80, 1400], spin: [60, 4000], inward: [0, 2000], lift: [0, 2000], durationMs: [400, 20000], maxLeaves: [10, 4000], drift: [0, 600] },
        autoClean: { durationMs: [500, 60000], leavesPerSec: [1, 500] }
    };

    function rescueTypeOf(value) {
        return RESCUE_TYPES.includes(value) ? value : 'wind';
    }

    // Thông số mặc định của một loại, lấy từ khối cũ tương ứng để hành động mới tạo ra
    // chạy y như bản cũ chứ không nhảy về số lạ.
    function rescueDefaultParams(type, cfg) {
        const src = (type === 'autoClean' ? cfg?.autoClean : type === 'tornado' ? cfg?.tornado : cfg?.wind) || {};
        const out = {};
        for (const [key, [min, max]] of Object.entries(RESCUE_LIMITS[type])) {
            out[key] = clamp(src[key], min, max);
        }
        if (type === 'wind') out.direction = ['left', 'right', 'random'].includes(src.direction) ? src.direction : 'random';
        return out;
    }

    function normalizeRescueAction(raw, index, cfg) {
        const type = rescueTypeOf(raw?.type);
        const preset = RESCUE_PRESET[type];
        const params = { ...rescueDefaultParams(type, cfg) };
        const saved = raw?.params && typeof raw.params === 'object' ? raw.params : {};
        for (const [key, [min, max]] of Object.entries(RESCUE_LIMITS[type])) {
            if (saved[key] != null) params[key] = clamp(saved[key], min, max);
        }
        if (type === 'wind' && ['left', 'right', 'random'].includes(saved.direction)) params.direction = saved.direction;
        return {
            id: String(raw?.id || `rescue-${index}-${Date.now()}`),
            type,
            icon: String(raw?.icon || preset.icon).slice(0, 8),
            name: String(raw?.name || preset.name).slice(0, 60),
            enabled: raw?.enabled !== false,
            giftId: String(raw?.giftId || ''),
            giftName: String(raw?.giftName || ''),
            giftImage: String(raw?.giftImage || ''),
            diamond: clamp(raw?.diamond, 0, 1000000),
            hotkey: normalizeHotkey(raw?.hotkey),
            params
        };
    }

    // Chuyển config cũ: mỗi quà trong wind.windGifts / tornado.gifts / autoClean.gifts thành
    // MỘT hành động, kế thừa đúng thông số của khối nó thuộc về nên người dùng không thấy
    // khác gì. Xong thì DỌN RỖNG danh sách cũ — để lại là quà bắn hai lần (một qua đường cũ,
    // một qua đường mới). Chỉ chạy khi cfg.rescue chưa tồn tại nên gọi lại bao nhiêu lần
    // cũng không nhân bản.
    function migrateRescue(cfg) {
        const actions = [];
        const take = (list, type) => {
            if (!Array.isArray(list)) return;
            for (const rule of list) {
                if (!rule) continue;
                actions.push({ ...rule, type, params: rescueDefaultParams(type, cfg) });
            }
        };
        take(cfg.wind?.windGifts, 'wind');
        take(cfg.tornado?.gifts, 'tornado');
        take(cfg.autoClean?.gifts, 'autoClean');
        if (cfg.wind) cfg.wind.windGifts = [];
        if (cfg.tornado) cfg.tornado.gifts = [];
        if (cfg.autoClean) cfg.autoClean.gifts = [];
        return actions;
    }

    function clamp(v, min, max) {
        v = Number(v);
        if (!isFinite(v)) v = min;
        return Math.max(min, Math.min(max, v));
    }

    // ── TRẦN VỊ TRÍ DỌC CỦA THÙNG RÁC ──────────────────────────────────────
    // Thùng được phép TỤT XUỐNG DƯỚI mép sân khấu, thò tối đa 1/3 thân ra ngoài.
    // #nl-root có overflow:hidden nên phần thò ra bị cắt gọn — nhìn ra đúng cảm giác
    // thùng hạ hẳn xuống để hớt hàng lá nằm sát đáy, thay vì lơ lửng phía trên chúng.
    //
    // binYPercent tính theo TÂM ảnh thùng: đáy = tâm + h/2. Muốn đáy thò xuống đúng
    // h/3 dưới mép thì tâm = 1920 − h/6 → đó là trần tính ra dưới đây.
    //
    // Chiều cao thùng suy được từ binScale, KHÔNG cần đo DOM: mọi bộ thùng đều được
    // tools/build-nhatla-skins.py đệm vào đúng khung 200×231 (BIN_CANVAS) và hiển thị
    // ở bề ngang 260px khi Kích thước = 100%. Nhờ vậy panel (không có thùng để đo)
    // và overlay ra cùng một con số.
    const BIN_CANVAS = { width: 200, height: 231 };
    const BIN_BASE_WIDTH = 260;
    const BIN_OUT_RATIO = 1 / 3;
    const STAGE_HEIGHT = 1920;

    function binHeightPx(binScale) {
        return BIN_BASE_WIDTH * (BIN_CANVAS.height / BIN_CANVAS.width) * clamp(binScale, 30, 400) / 100;
    }

    function binYMaxPercent(binScale) {
        // tâm tối đa = 1920 − (h/2 − h/3) = 1920 − h/6
        const overhang = binHeightPx(binScale) * (0.5 - BIN_OUT_RATIO);
        return clamp(100 - overhang / STAGE_HEIGHT * 100, 5, 100);
    }

    // Id bộ skin cũng chính là tên thư mục trên đĩa, nên chỉ nhận chữ-số-gạch ngang.
    // Chặn ở đây là chặn luôn ../ đi vào đường dẫn ảnh mà overlay ghép ra.
    function skinId(value, fallback) {
        value = String(value || '').trim().toLowerCase();
        return /^[a-z0-9][a-z0-9-]{0,39}$/.test(value) ? value : fallback;
    }

    function normalizeHotkey(value) {
        value = String(value || '').trim();
        // Các config cũ chỉ lưu 1 phím; giữ hành vi cũ bằng Ctrl+Shift+<phím>.
        if (/^[a-z0-9]$/i.test(value)) return `Control+Shift+${value.toUpperCase()}`;
        return value.slice(0, 80);
    }

    // Chuẩn hoá config cũ/thiếu field về đúng schema (giữ dữ liệu người dùng)
    function normalizeConfig(cfg) {
        const def = defaultConfig();
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        cfg.enabled = cfg.enabled !== false;
        cfg.display = { ...def.display, ...(cfg.display || {}) };
        cfg.drop = { ...def.drop, ...(cfg.drop || {}) };
        cfg.wind = { ...def.wind, ...(cfg.wind || {}) };
        cfg.tornado = { ...def.tornado, ...(cfg.tornado || {}) };
        const savedEffects = cfg.effects && typeof cfg.effects === 'object' ? cfg.effects : {};
        cfg.effects = { ...def.effects, ...savedEffects };
        const effectGifts = Array.isArray(savedEffects.effectGifts) ? savedEffects.effectGifts : savedEffects.tomGifts;
        cfg.effects.effectGifts = Array.isArray(effectGifts) ? effectGifts.map((rule, index) => ({
            id: String(rule?.id || `tom-${index}-${Date.now()}`),
            giftId: String(rule?.giftId || ''),
            giftName: String(rule?.giftName || ''),
            giftImage: String(rule?.giftImage || ''),
            diamond: clamp(rule?.diamond, 0, 1000000),
            name: String(rule?.name || rule?.giftName || ''),
            // Config cũ dùng giây; giữ đúng thời lượng khi đổi sang mili-giây.
            releaseAfterMs: clamp(rule?.releaseAfterMs != null ? rule.releaseAfterMs : Number(rule?.releaseAfterSec || 0) * 1000, 0, 60000),
            mediaUrl: String(rule?.mediaUrl || ''),
            mediaName: String(rule?.mediaName || ''),
            hotkey: normalizeHotkey(rule?.hotkey),
            scale: clamp(rule?.scale != null ? rule.scale : 100, 20, 500),
            positionXPercent: clamp(rule?.positionXPercent != null ? rule.positionXPercent : 50, 0, 100),
            positionYPercent: clamp(rule?.positionYPercent != null ? rule.positionYPercent : 50, 0, 100),
            followHand: rule?.followHand !== false,
            positionLocked: rule?.positionLocked === true
        })) : [];
        cfg.giftRules = Array.isArray(cfg.giftRules) ? cfg.giftRules : [];
        // Config cũ autoByCoin=false tương đương coinsPerLeaf=0; các config khác mặc định 1 coin/1 lá.
        cfg.coinsPerLeaf = clamp(cfg.coinsPerLeaf != null ? cfg.coinsPerLeaf : (cfg.autoByCoin === false ? 0 : 1), 0, 5000);
        cfg.defaultLeavesPerGift = clamp(
            cfg.defaultLeavesPerGift != null ? cfg.defaultLeavesPerGift : def.defaultLeavesPerGift,
            0, 5000
        );
        // Không kiểm tra bộ skin có thật hay không ở đây: danh sách nằm trên đĩa, chỉ server
        // và overlay mới biết. Overlay tự lùi về bộ mặc định nếu id trỏ vào bộ đã bị xoá.
        cfg.display.hatSkin = skinId(cfg.display.hatSkin, def.display.hatSkin);
        cfg.display.binSkin = skinId(cfg.display.binSkin, def.display.binSkin);
        cfg.display.leafScale = clamp(cfg.display.leafScale, 30, 400);
        cfg.display.handScale = clamp(cfg.display.handScale, 30, 400);
        cfg.display.binScale = clamp(cfg.display.binScale, 30, 400);
        cfg.display.binXPercent = clamp(cfg.display.binXPercent, 5, 95);
        // Trần dọc nới theo cỡ thùng (xem binYMaxPercent): hạ hết cỡ là thùng thò 1/3
        // xuống dưới mép overlay. Thùng to hơn thì trần % thấp hơn — vẫn đúng 1/3.
        cfg.display.binYPercent = clamp(cfg.display.binYPercent, 5, binYMaxPercent(cfg.display.binScale));
        cfg.display.hudXPercent = clamp(cfg.display.hudXPercent, 0, 90);
        cfg.display.hudYPercent = clamp(cfg.display.hudYPercent, 0, 90);
        cfg.display.reviewEditMode = cfg.display.reviewEditMode === true;
        cfg.drop.maxLeaves = clamp(cfg.drop.maxLeaves, 50, 20000);
        cfg.wind.enabled = cfg.wind.enabled !== false;
        cfg.wind.radius = clamp(cfg.wind.radius, 80, 1600);
        cfg.wind.strength = clamp(cfg.wind.strength, 40, 4000);
        cfg.wind.turbulence = clamp(cfg.wind.turbulence, 0, 100);
        cfg.wind.durationMs = clamp(cfg.wind.durationMs, 200, 10000);
        // Trần cứng 4000: quá mức đó thì DOM không thể giữ 60fps dù máy nào.
        cfg.wind.maxLeaves = clamp(cfg.wind.maxLeaves, 10, 4000);
        cfg.wind.drag = clamp(cfg.wind.drag, 2, 200);
        cfg.wind.lift = clamp(cfg.wind.lift, 0, 200);
        cfg.wind.direction = ['left', 'right', 'random'].includes(cfg.wind.direction) ? cfg.wind.direction : 'random';
        cfg.wind.windGifts = Array.isArray(cfg.wind.windGifts) ? cfg.wind.windGifts.map((rule, index) => ({
            id: String(rule?.id || `wind-${index}-${Date.now()}`),
            giftId: String(rule?.giftId || ''),
            giftName: String(rule?.giftName || ''),
            giftImage: String(rule?.giftImage || ''),
            diamond: clamp(rule?.diamond, 0, 1000000),
            hotkey: normalizeHotkey(rule?.hotkey)
        })) : [];
        cfg.tornado.enabled = cfg.tornado.enabled !== false;
        cfg.tornado.radius = clamp(cfg.tornado.radius, 80, 1400);
        cfg.tornado.spin = clamp(cfg.tornado.spin, 60, 4000);
        cfg.tornado.inward = clamp(cfg.tornado.inward, 0, 2000);
        cfg.tornado.lift = clamp(cfg.tornado.lift, 0, 2000);
        cfg.tornado.durationMs = clamp(cfg.tornado.durationMs, 400, 20000);
        cfg.tornado.maxLeaves = clamp(cfg.tornado.maxLeaves, 10, 4000);
        cfg.tornado.drift = clamp(cfg.tornado.drift, 0, 600);
        cfg.tornado.gifts = Array.isArray(cfg.tornado.gifts) ? cfg.tornado.gifts.map((rule, index) => ({
            id: String(rule?.id || `torn-${index}-${Date.now()}`),
            giftId: String(rule?.giftId || ''),
            giftName: String(rule?.giftName || ''),
            giftImage: String(rule?.giftImage || ''),
            diamond: clamp(rule?.diamond, 0, 1000000),
            hotkey: normalizeHotkey(rule?.hotkey)
        })) : [];
        // Config lưu từ bản cũ không có khối autoClean — dựng lại từ mặc định để panel không vỡ.
        cfg.autoClean = cfg.autoClean && typeof cfg.autoClean === 'object' ? cfg.autoClean : {};
        cfg.autoClean.enabled = cfg.autoClean.enabled !== false;
        cfg.autoClean.durationMs = clamp(cfg.autoClean.durationMs ?? 5000, 500, 60000);
        cfg.autoClean.leavesPerSec = clamp(cfg.autoClean.leavesPerSec ?? 40, 1, 500);
        cfg.autoClean.gifts = Array.isArray(cfg.autoClean.gifts) ? cfg.autoClean.gifts.map((rule, index) => ({
            id: String(rule?.id || `auto-${index}-${Date.now()}`),
            giftId: String(rule?.giftId || ''),
            giftName: String(rule?.giftName || ''),
            giftImage: String(rule?.giftImage || ''),
            diamond: clamp(rule?.diamond, 0, 1000000),
            hotkey: normalizeHotkey(rule?.hotkey)
        })) : [];
        // GIẢI CỨU. Phải chạy SAU khi wind/tornado/autoClean đã chuẩn hoá xong, vì thông số
        // mặc định của mỗi hành động lấy từ chính ba khối đó.
        const hadRescue = cfg.rescue && typeof cfg.rescue === 'object';
        const migrated = hadRescue ? null : migrateRescue(cfg);
        cfg.rescue = hadRescue ? cfg.rescue : {};
        const rawActions = Array.isArray(cfg.rescue.actions) ? cfg.rescue.actions : (migrated || []);
        cfg.rescue.actions = rawActions.map((raw, index) => normalizeRescueAction(raw, index, cfg));
        // Config lưu trước v1.7.2 chưa có khối topDonors — dựng lại từ mặc định.
        cfg.topDonors = { ...def.topDonors, ...(cfg.topDonors && typeof cfg.topDonors === 'object' ? cfg.topDonors : {}) };
        cfg.topDonors.enabled = cfg.topDonors.enabled !== false;
        cfg.topDonors.count = clamp(cfg.topDonors.count, 1, 10);
        cfg.topDonors.minLeaves = clamp(cfg.topDonors.minLeaves, 0, 100000);
        cfg.topDonors.flyEnabled = cfg.topDonors.flyEnabled !== false;
        cfg.topDonors.flyMode = cfg.topDonors.flyMode === 'solo' ? 'solo' : 'train';
        cfg.topDonors.flyIntervalSec = clamp(cfg.topDonors.flyIntervalSec, 5, 600);
        cfg.topDonors.flyDurationSec = clamp(cfg.topDonors.flyDurationSec, 4, 60);
        cfg.topDonors.flyYPercent = clamp(cfg.topDonors.flyYPercent, 0, 92);
        cfg.topDonors.flyScale = clamp(cfg.topDonors.flyScale, 40, 250);
        cfg.topDonors.boardEnabled = cfg.topDonors.boardEnabled === true;
        cfg.topDonors.boardXPercent = clamp(cfg.topDonors.boardXPercent, 0, 92);
        cfg.topDonors.boardYPercent = clamp(cfg.topDonors.boardYPercent, 0, 92);
        cfg.topDonors.boardScale = clamp(cfg.topDonors.boardScale, 40, 250);
        cfg.drop.spawnGapMs = clamp(cfg.drop.spawnGapMs, 0, 2000);
        cfg.drop.minFallSec = clamp(cfg.drop.minFallSec, 0.5, 30);
        cfg.drop.maxFallSec = clamp(Math.max(cfg.drop.maxFallSec, cfg.drop.minFallSec), 0.5, 60);
        return cfg;
    }

    // Đếm số lá cho 1 gift event theo rules — trả về số lá rơi (0 = bỏ qua)
    function leavesForGift(cfg, giftId, giftName, coinValue, repeatCount) {
        if (!cfg || !Array.isArray(cfg.giftRules)) return 0;
        const id = String(giftId == null ? '' : giftId);
        const name = String(giftName || '');
        const rule = cfg.giftRules.find(r => r && (
            (id && String(r.giftId || '') === id) ||
            (name && String(r.giftName || '').toLowerCase() === name.toLowerCase())
        ));
        if (rule) {
            const c = parseInt(rule.count, 10);
            return isFinite(c) && c > 0 ? c * Math.max(1, parseInt(repeatCount, 10) || 1) : 0;
        }
        const coins = Math.max(0, Math.round(Number(coinValue) || 0)) * Math.max(1, parseInt(repeatCount, 10) || 1);
        const perLeaf = Number(cfg.coinsPerLeaf);
        return perLeaf > 0 ? Math.floor(coins / perLeaf) : 0;
    }

    function effectGiftForGift(cfg, giftId, giftName) {
        if (!Array.isArray(cfg?.effects?.effectGifts)) return null;
        const id = String(giftId == null ? '' : giftId);
        const name = String(giftName || '').toLowerCase();
        return cfg.effects.effectGifts.find(rule => rule && (
            (id && String(rule.giftId || '') === id) ||
            (name && String(rule.giftName || '').toLowerCase() === name)
        )) || null;
    }

    // Tìm hành động giải cứu khớp một quà. Dùng chung cho panel; server có bản song song
    // trong server.js (rescueActionForGift) vì server không nạp file này.
    function rescueActionForGift(cfg, giftId, giftName) {
        if (!Array.isArray(cfg?.rescue?.actions)) return null;
        const id = String(giftId == null ? '' : giftId);
        const name = String(giftName || '').toLowerCase();
        return cfg.rescue.actions.find(action => action && action.enabled !== false && (
            (id && String(action.giftId || '') === id) ||
            (name && String(action.giftName || '').toLowerCase() === name)
        )) || null;
    }

    window.HpGame.nhatla = {
        defaultConfig, normalizeConfig, clamp, binYMaxPercent, leavesForGift, effectGiftForGift,
        RESCUE_TYPES, RESCUE_PRESET, RESCUE_ICONS, RESCUE_LIMITS,
        rescueDefaultParams, rescueActionForGift
    };
})();
