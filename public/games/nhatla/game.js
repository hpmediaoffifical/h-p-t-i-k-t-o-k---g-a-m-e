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
                bagSkin: 'mac-dinh',   // bộ ảnh túi nợ — xem public/games/nhatla/skins/tui/
                leafScale: 120,
                handScale: 50,
                binScale: 100,
                // % bề cao màn hình mà đống lá dâng tới KHI ĐẠT TRẦN drop.maxLeaves. Overlay
                // tự suy ra mỗi lá phải cộng bao nhiêu (xem pileFactor trong overlay.html),
                // nên đổi maxLeaves hay đổi bộ ảnh rơi là độ chồng tự tính lại.
                //
                // Vì sao chốt theo maxLeaves thay vì cho chỉnh độ chồng bằng tay: trần màn
                // hình giờ cũng chính là ngưỡng dồn sang túi rác, nên "đầy màn hình" và "đầy
                // một túi" phải là cùng một mốc. Để chỉnh tay thì mỗi lần đổi maxLeaves lại
                // phải dò lại thanh trượt — mà mức cần cho 500 lá (~1109%) còn vượt xa trần
                // 500% của thanh trượt cũ, tức có dò cũng không tới.
                pileFillPercent: 90,
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
                spawnGapMs: 300,
                maxLeaves: 600
            },
            // TÚI NỢ: lá vượt quá drop.maxLeaves không được vẽ mà dồn vào kho (biến `backlog`
            // trong overlay). Khối này chỉ làm hai việc: VẼ kho đó ra thành mấy bọc rác đen
            // cho người xem thấy còn nợ bao nhiêu, và quyết định LÚC NÀO xả kho ra.
            //
            // Vì sao chốt "dọn sạch mới bung" thay vì bù 1:1 liên tục: bù liên tục thì màn
            // hình lúc nào cũng đứng đúng trần maxLeaves, máy gánh mức tải cao nhất suốt cả
            // buổi. Đổ theo túi thì tải hình răng cưa — vơi dần rồi mới nạp lại — nên trung
            // bình nhẹ hơn hẳn, và số túi trừ dần cho idol một cái mốc rõ ràng để cày.
            bags: {
                enabled: true,
                size: 600,         // số lá mỗi túi (100–20000) — khớp maxLeaves: đầy màn = đầy một túi
                openAtLeaves: 0,   // màn hình còn ≤ ngần này lá thì bung túi kế tiếp
                // Giãn cách giữa 2 lá lúc xả túi. KHÁC HẲN drop.spawnGapMs (300ms): nhịp rơi
                // lúc nhận quà cố tình thong thả cho người xem kịp nhìn, nhưng đem nhịp đó đi
                // xả túi thì 300ms × 600 lá = 3 phút mới đổ xong một túi, idol đứng chờ dài.
                // 6ms ≈ 3.6 giây một túi, vẫn dưới trần SPAWN_PER_FRAME của overlay nên không
                // dội cục gây khựng.
                pourGapMs: 6,
                showList: true,
                orientation: 'horizontal', // 'horizontal' | 'vertical'
                xPercent: 4,
                yPercent: 6,
                scale: 100,        // % cỡ ảnh túi (30–300)
                // Trần SỐ ẢNH được vẽ, không phải trần số túi. Nợ nhiều hơn thì phần dư gộp
                // thành chữ "+N" — giữ danh sách không bao giờ tràn ra ngoài khung hình.
                maxIcons: 10
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
            //
            // 2s × 20 lá/s = 40 lá một lượt. Đây cũng là bộ thông số MẪU mà mỗi hành động
            // "Tự nhặt" mới tạo sẽ kế thừa (xem rescueDefaultParams), nên chỉnh ở đây là
            // chỉnh mặc định cho cả tab Giải cứu. Quà nào muốn mạnh hơn thì sửa riêng
            // trong thông số của hành động đó — không đụng tới số ở đây.
            autoClean: {
                enabled: true,
                durationMs: 2000,
                leavesPerSec: 20,
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
            // BẢNG QUÀ: danh sách icon + tên cho NGƯỜI XEM biết tặng gì thì được gì.
            // Vẽ ở overlay RIÊNG (/overlay/nhatla-gifts) chứ không nhét vào overlay chính:
            // overlay chính có lúc giữ tới drop.maxLeaves = 6000 phần tử DOM, thêm một bảng
            // chạy marquee vào cùng document là bắt chung luồng compositor với đống lá.
            // Tách ra thì OBS cấp cho bảng một tiến trình render riêng, và người dùng đặt
            // được bảng ở chỗ khác trên scene mà không phải kéo cả overlay game.
            //
            // Bảng KHÔNG giữ danh sách quà riêng — nó đọc lại ba nguồn đã gán quà sẵn
            // (giftRules / effects.effectGifts / rescue.actions) qua giftBoardEntries().
            // Thêm danh sách thứ tư là có ngày bảng nói một đằng game làm một nẻo.
            giftBoard: {
                enabled: true,
                layout: 'vertical',   // 'vertical' | 'horizontal'
                namePos: 'right',     // 'top' | 'bottom' | 'left' | 'right'
                scale: 100,
                iconScale: 100,
                gap: 80,              // % của khoảng cách gốc giữa hai thẻ
                nameScale: 100,
                showDiamond: false,   // hiện 💎 giá quà cạnh tên
                xPercent: 2,
                yPercent: 2,
                autoScroll: {
                    enabled: false,
                    visibleCount: 6,  // quá số này mới cuộn; ít hơn thì đứng yên
                    direction: 'up',  // 'up' | 'down' | 'left' | 'right'
                    speed: 2          // giây cho MỖI thẻ đi hết một vòng
                }
            },
            giftRules: [],
            coinsPerLeaf: 1,
            defaultLeavesPerGift: 0
        };
    }

    // ===== GIẢI CỨU =====
    const RESCUE_TYPES = ['wind', 'tornado', 'autoClean'];
    // Tên mặc định cố tình NGẮN: nó vừa là tên trong danh sách Giải cứu, vừa là nhãn mặc
    // định của thẻ trên bảng quà (giftBoardEntries lấy action.label || action.name). Tên dài
    // kiểu "Gió thổi bay lá" tràn thẻ bảng quà, mà bảng là thứ người xem đọc lướt trong lúc
    // LIVE. Muốn nhãn dài riêng cho bảng thì điền ô `label`, nó vẫn thắng.
    const RESCUE_PRESET = {
        wind:      { icon: '🌬', name: 'Gió thổi' },
        tornado:   { icon: '🌪', name: 'Lốc xoáy' },
        autoClean: { icon: '🧹', name: 'Tự nhặt' }
    };
    // Tên mặc định của bản trước. Hành động nào còn mang đúng chuỗi cũ thì đổi sang tên mới
    // — nếu không, config đang chạy giữ nguyên tên dài và bảng quà lệch hẳn so với bộ mới
    // tạo. Chỉ khớp ĐÚNG chuỗi cũ nên tên do người dùng tự đặt không bị đụng tới.
    const RESCUE_LEGACY_NAMES = {
        'Gió thổi bay lá': 'Gió thổi',
        'Lốc xoáy gom lá': 'Lốc xoáy',
        'Tự nhặt lá': 'Tự nhặt'
    };
    // Bộ số Tự nhặt của bản trước: 5s × 40 lá/s = 200 lá một lượt, quét sạch cả màn hình 600
    // lá chỉ trong 3 lượt quà. Nhận diện ĐÚNG cặp này để nâng lên mặc định mới — khớp cả hai
    // số mới đổi, vì chỉ khớp một số thì người đã chỉnh riêng thời lượng cũng bị đè mất.
    const LEGACY_AUTOCLEAN = { durationMs: 5000, leavesPerSec: 40 };

    function isLegacyAutoClean(params) {
        return !!params
            && Number(params.durationMs) === LEGACY_AUTOCLEAN.durationMs
            && Number(params.leavesPerSec) === LEGACY_AUTOCLEAN.leavesPerSec;
    }
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

    function renameLegacyRescue(name) {
        return RESCUE_LEGACY_NAMES[name.trim()] || name;
    }

    function normalizeRescueAction(raw, index, cfg) {
        const type = rescueTypeOf(raw?.type);
        const preset = RESCUE_PRESET[type];
        const params = { ...rescueDefaultParams(type, cfg) };
        // Hành động Tự nhặt còn mang đúng bộ số cũ (5s × 40) thì coi như CHƯA từng chỉnh: bỏ
        // qua params đã lưu để nó rơi về mặc định mới. Ai đã kéo sang số khác thì saved giữ
        // nguyên, y như mọi loại còn lại.
        const savedRaw = raw?.params && typeof raw.params === 'object' ? raw.params : {};
        const saved = type === 'autoClean' && isLegacyAutoClean(savedRaw) ? {} : savedRaw;
        for (const [key, [min, max]] of Object.entries(RESCUE_LIMITS[type])) {
            if (saved[key] != null) params[key] = clamp(saved[key], min, max);
        }
        if (type === 'wind' && ['left', 'right', 'random'].includes(saved.direction)) params.direction = saved.direction;
        return {
            id: String(raw?.id || `rescue-${index}-${Date.now()}`),
            type,
            icon: String(raw?.icon || preset.icon).slice(0, 8),
            name: renameLegacyRescue(String(raw?.name || preset.name)).slice(0, 60),
            enabled: raw?.enabled !== false,
            // enabled và boardHidden là HAI công tắc khác nhau, đừng gộp: enabled=false là
            // hành động chết hẳn (dùng khi quà lỗi), boardHidden=true là chỉ giấu khỏi bảng
            // cho người xem đỡ rối nhưng quà vẫn kích hoạt bình thường.
            boardHidden: raw?.boardHidden === true,
            // Nhãn RIÊNG cho bảng quà. Để trống thì bảng lấy `name`. Tách ra để đặt được
            // tên dài dễ hiểu cho người xem ("Thổi bay 500 lá") mà danh sách trong panel
            // vẫn gọn ("Gió thổi bay lá").
            label: String(raw?.label || '').slice(0, 60),
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

    // ===== BẢNG QUÀ =====
    const BOARD_LAYOUTS = ['vertical', 'horizontal'];
    const BOARD_NAME_POS = ['top', 'bottom', 'left', 'right'];
    const BOARD_SCROLL_DIRS = ['up', 'down', 'left', 'right'];

    function normalizeGiftBoard(raw, def) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const scroll = src.autoScroll && typeof src.autoScroll === 'object' ? src.autoScroll : {};
        return {
            enabled: src.enabled !== false,
            layout: BOARD_LAYOUTS.includes(src.layout) ? src.layout : def.layout,
            namePos: BOARD_NAME_POS.includes(src.namePos) ? src.namePos : def.namePos,
            scale: clamp(src.scale != null ? src.scale : def.scale, 40, 250),
            iconScale: clamp(src.iconScale != null ? src.iconScale : def.iconScale, 40, 250),
            gap: clamp(src.gap != null ? src.gap : def.gap, 0, 400),
            nameScale: clamp(src.nameScale != null ? src.nameScale : def.nameScale, 40, 250),
            showDiamond: src.showDiamond === true,
            xPercent: clamp(src.xPercent != null ? src.xPercent : def.xPercent, 0, 92),
            yPercent: clamp(src.yPercent != null ? src.yPercent : def.yPercent, 0, 92),
            autoScroll: {
                enabled: scroll.enabled === true,
                visibleCount: clamp(scroll.visibleCount != null ? scroll.visibleCount : def.autoScroll.visibleCount, 2, 30),
                direction: BOARD_SCROLL_DIRS.includes(scroll.direction) ? scroll.direction : def.autoScroll.direction,
                speed: clamp(scroll.speed != null ? scroll.speed : def.autoScroll.speed, 0.5, 20)
            }
        };
    }

    // Gom ba nguồn gán quà thành danh sách thẻ để vẽ bảng. Overlay bảng VÀ ô xem trước trong
    // panel đều gọi hàm này — một nguồn sự thật, không có chuyện hai bên vẽ lệch nhau.
    //
    // GỘP THEO giftId: một quà có thể vừa nằm ở giftRules (rơi lá) vừa ở rescue.actions (gọi
    // gió). Để nguyên là bảng ra hai thẻ cùng một icon, người xem tưởng hai quà khác nhau.
    // Gộp lại thành một thẻ, nhãn nối bằng " · " → "50 lá · Gió thổi bay lá".
    function giftBoardEntries(cfg) {
        const out = [];
        const byGift = new Map();   // giftId → entry đã tạo, để gộp
        const push = (source, item, label) => {
            const giftId = String(item?.giftId || '').trim();
            // Không có quà gán thì không có gì để bảo người xem tặng.
            if (!giftId) return;
            if (item?.enabled === false) return;
            if (item?.boardHidden === true) return;
            label = String(label || '').trim();
            if (!label) return;
            const existing = byGift.get(giftId);
            if (existing) {
                if (!existing.labels.includes(label)) existing.labels.push(label);
                existing.sources.push(source);
                // Ảnh quà có chỗ lưu chỗ không — lấy được cái nào thì giữ cái đó.
                if (!existing.image && item.giftImage) existing.image = String(item.giftImage);
                if (!existing.diamond && item.diamond) existing.diamond = Number(item.diamond) || 0;
                return;
            }
            const entry = {
                key: `${source}:${item.id || giftId}`,
                giftId,
                giftName: String(item.giftName || ''),
                image: String(item.giftImage || ''),
                diamond: Number(item.diamond) || 0,
                labels: [label],
                sources: [source]
            };
            byGift.set(giftId, entry);
            out.push(entry);
        };

        for (const rule of (Array.isArray(cfg?.giftRules) ? cfg.giftRules : [])) {
            const count = parseInt(rule?.count, 10);
            push('rule', rule, rule?.label || (count > 0 ? `${count} lá` : ''));
        }
        for (const rule of (Array.isArray(cfg?.effects?.effectGifts) ? cfg.effects.effectGifts : [])) {
            push('effect', rule, rule?.label || rule?.name || rule?.giftName);
        }
        for (const action of (Array.isArray(cfg?.rescue?.actions) ? cfg.rescue.actions : [])) {
            push('rescue', action, action?.label || action?.name);
        }
        return out.map(entry => ({ ...entry, label: entry.labels.join(' · ') }));
    }

    // Quà không có ảnh (rule tạo tay từ bản cũ, hoặc icon TikTok đổi URL) vẫn phải ra một
    // thẻ có hình, nếu không bảng thủng lỗ.
    const GIFT_BOARD_FALLBACK_ICON = '/hp-logo.png';

    // VẼ bảng vào một phần tử có sẵn. Đây là hàm động tới DOM duy nhất trong file — cố ý,
    // vì cả overlay board.html lẫn ô xem trước trong panel đều gọi nó. Tách làm hai bản thì
    // chỉnh cỡ chữ ở một nơi rồi quên nơi kia là chuyện sớm muộn, mà sai lệch kiểu đó chỉ
    // lộ ra lúc đã lên sóng.
    function giftBoardPaint(boardEl, cfg, entries, resolveIcon) {
        if (!boardEl) return;
        const board = cfg.giftBoard;
        const esc = value => String(value == null ? '' : value)
            .replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
        const iconOf = entry => (resolveIcon && resolveIcon(entry)) || entry.image || GIFT_BOARD_FALLBACK_ICON;

        // Game tắt là bảng tắt: bảo người xem tặng quà vào một game đang dừng thì họ tặng
        // xong không thấy gì — mất lòng tin hơn hẳn so với việc không thấy bảng.
        if (!board.enabled || cfg.enabled === false || !entries.length) {
            boardEl.className = 'nlb-board is-hidden';
            boardEl.innerHTML = '';
            return;
        }

        boardEl.className = `nlb-board layout-${board.layout}`;
        boardEl.style.left = `${board.xPercent}%`;
        boardEl.style.top = `${board.yPercent}%`;
        boardEl.style.setProperty('--s', board.scale / 100);
        boardEl.style.setProperty('--is', board.iconScale / 100);
        boardEl.style.setProperty('--ns', board.nameScale / 100);
        boardEl.style.setProperty('--gp', board.gap / 100);

        const cards = entries.map(entry => {
            const diamond = board.showDiamond && entry.diamond > 0
                ? `<div class="nlb-diamond">💎 ${Math.round(entry.diamond)}</div>` : '';
            return `<div class="nlb-card name-${board.namePos}" title="${esc(entry.giftName)}">
                <img class="nlb-ico" src="${esc(iconOf(entry))}" alt=""
                     onerror="this.onerror=null;this.src='${GIFT_BOARD_FALLBACK_ICON}'" />
                <div class="nlb-text"><div class="nlb-name">${esc(entry.label)}</div>${diamond}</div>
            </div>`;
        }).join('');

        const scroll = board.autoScroll;
        // Ít thẻ hơn cửa sổ nhìn thấy thì cuộn chỉ làm chữ trôi vô cớ — để đứng yên.
        const scrolling = scroll.enabled && entries.length > scroll.visibleCount;
        let html = entries.length >= 2 ? `<div class="nlb-counter">${entries.length}</div>` : '';
        if (scrolling) {
            // Hai bản danh sách nối nhau để vòng lặp liền mạch — xem .nlb-track trong board.css.
            html += `<div class="nlb-list is-scrolling dir-${scroll.direction}" style="--scroll-duration:${entries.length * scroll.speed}s"><div class="nlb-track">${cards}${cards}</div></div>`;
        } else {
            html += `<div class="nlb-list"><div class="nlb-track">${cards}</div></div>`;
        }
        boardEl.innerHTML = html;

        if (!scrolling) return;
        // Chặn vùng nhìn thấy đúng bằng visibleCount thẻ. ĐO thẻ thật vừa vẽ thay vì tính
        // lại từ hằng số px trong board.css: giữ cùng một con số ở hai file kiểu gì cũng có
        // ngày lệch, mà đoạn này chỉ chạy khi config đổi nên đo một lần không tốn gì.
        const list = boardEl.querySelector('.nlb-list');
        const card = boardEl.querySelector('.nlb-card');
        if (!list || !card) return;
        const gapPx = 18 * (board.gap / 100) * (board.scale / 100);
        const n = scroll.visibleCount;
        if (board.layout === 'horizontal') {
            list.style.maxWidth = `${card.offsetWidth * n + gapPx * (n - 1)}px`;
        } else {
            list.style.maxHeight = `${card.offsetHeight * n + gapPx * (n - 1)}px`;
        }
    }

    // Chuẩn hoá config cũ/thiếu field về đúng schema (giữ dữ liệu người dùng)
    function normalizeConfig(cfg) {
        const def = defaultConfig();
        cfg = cfg && typeof cfg === 'object' ? cfg : {};
        cfg.enabled = cfg.enabled !== false;
        cfg.display = { ...def.display, ...(cfg.display || {}) };
        cfg.drop = { ...def.drop, ...(cfg.drop || {}) };
        cfg.bags = { ...def.bags, ...(cfg.bags || {}) };
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
            enabled: rule?.enabled !== false,
            boardHidden: rule?.boardHidden === true,
            label: String(rule?.label || '').slice(0, 60),
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
        // giftRules trước đây đi thẳng qua không chuẩn hoá. Giờ bảng quà đọc nó nên phải có
        // id ổn định (rule cũ tạo trước bản này không có id) và ba field công tắc/nhãn.
        cfg.giftRules = Array.isArray(cfg.giftRules) ? cfg.giftRules.map((rule, index) => ({
            ...rule,
            id: String(rule?.id || `r-${index}-${Date.now()}`),
            giftId: String(rule?.giftId || ''),
            giftName: String(rule?.giftName || ''),
            giftImage: String(rule?.giftImage || ''),
            diamond: clamp(rule?.diamond, 0, 1000000),
            count: clamp(rule?.count, 0, 5000),
            enabled: rule?.enabled !== false,
            boardHidden: rule?.boardHidden === true,
            label: String(rule?.label || '').slice(0, 60)
        })) : [];
        cfg.giftBoard = normalizeGiftBoard(cfg.giftBoard, def.giftBoard);
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
        cfg.display.bagSkin = skinId(cfg.display.bagSkin, def.display.bagSkin);
        cfg.display.leafScale = clamp(cfg.display.leafScale, 30, 400);
        cfg.display.handScale = clamp(cfg.display.handScale, 30, 400);
        cfg.display.binScale = clamp(cfg.display.binScale, 30, 400);
        // Config cũ mang pileLift (% độ chồng chỉnh tay) — bỏ hẳn, không quy đổi: nó là hệ số
        // trên MỖI LÁ, còn khoá mới là đích của CẢ ĐỐNG, quy đổi được chỉ khi biết maxLeaves
        // lúc người dùng kéo thanh, mà con số đó không lưu lại ở đâu.
        delete cfg.display.pileLift;
        cfg.display.pileFillPercent = clamp(cfg.display.pileFillPercent, 30, 100);
        cfg.display.binXPercent = clamp(cfg.display.binXPercent, 5, 95);
        // Trần dọc nới theo cỡ thùng (xem binYMaxPercent): hạ hết cỡ là thùng thò 1/3
        // xuống dưới mép overlay. Thùng to hơn thì trần % thấp hơn — vẫn đúng 1/3.
        cfg.display.binYPercent = clamp(cfg.display.binYPercent, 5, binYMaxPercent(cfg.display.binScale));
        cfg.display.hudXPercent = clamp(cfg.display.hudXPercent, 0, 90);
        cfg.display.hudYPercent = clamp(cfg.display.hudYPercent, 0, 90);
        cfg.display.reviewEditMode = cfg.display.reviewEditMode === true;
        cfg.drop.maxLeaves = clamp(cfg.drop.maxLeaves, 50, 20000);
        cfg.bags.enabled = cfg.bags.enabled !== false;
        cfg.bags.showList = cfg.bags.showList !== false;
        cfg.bags.size = clamp(cfg.bags.size, 100, 20000);
        // Ngưỡng mở túi phải NHỎ HƠN trần màn hình, nếu không điều kiện bung luôn đúng ngay
        // cả lúc màn hình đang đầy — kho sẽ xả thẳng ra không còn tác dụng chống lag nào.
        cfg.bags.openAtLeaves = clamp(cfg.bags.openAtLeaves, 0, Math.max(0, cfg.drop.maxLeaves - 1));
        cfg.bags.pourGapMs = clamp(cfg.bags.pourGapMs, 0, 200);
        cfg.bags.orientation = cfg.bags.orientation === 'vertical' ? 'vertical' : 'horizontal';
        cfg.bags.xPercent = clamp(cfg.bags.xPercent, 0, 95);
        cfg.bags.yPercent = clamp(cfg.bags.yPercent, 0, 95);
        cfg.bags.scale = clamp(cfg.bags.scale, 30, 300);
        cfg.bags.maxIcons = clamp(cfg.bags.maxIcons, 1, 40);
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
        // Nâng mặc định Tự nhặt: 5s × 40 lá/s (200 lá) → 2s × 20 lá/s (40 lá). Người đang dùng
        // cũng được hưởng số mới, nhưng CHỈ khi config còn mang ĐÚNG bộ số cũ — ai đã tự kéo
        // sang số khác thì đó là lựa chọn của họ, không đè lên.
        //
        // Phải đứng TRƯỚC phần chuẩn hoá cfg.rescue bên dưới: thông số mặc định của mỗi hành
        // động Giải cứu lấy từ chính khối này (rescueDefaultParams), migrate sau là hành động
        // mới vẫn kế thừa số cũ.
        if (isLegacyAutoClean(cfg.autoClean)) {
            cfg.autoClean.durationMs = def.autoClean.durationMs;
            cfg.autoClean.leavesPerSec = def.autoClean.leavesPerSec;
        }
        cfg.autoClean.durationMs = clamp(cfg.autoClean.durationMs ?? def.autoClean.durationMs, 500, 60000);
        cfg.autoClean.leavesPerSec = clamp(cfg.autoClean.leavesPerSec ?? def.autoClean.leavesPerSec, 1, 500);
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
        // Rule bị TẮT trả 0 luôn, KHÔNG rơi xuống tỉ lệ coinsPerLeaf bên dưới. Người dùng tắt
        // một quà là muốn quà đó im hẳn; để nó tụt xuống đường coin thì lá vẫn rơi, chỉ khác
        // số lượng — nhìn như công tắc hỏng.
        if (rule) {
            if (rule.enabled === false) return 0;
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
        // Bỏ qua rule đã tắt — giống rescueActionForGift bên dưới. Đây là đường thoát cho
        // hiệu ứng WebM lỗi (file hỏng / thiếu) mà không phải xoá hẳn rule đi.
        return cfg.effects.effectGifts.find(rule => rule && rule.enabled !== false && (
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
        rescueDefaultParams, rescueActionForGift,
        giftBoardEntries, normalizeGiftBoard, giftBoardPaint, GIFT_BOARD_FALLBACK_ICON,
        BOARD_LAYOUTS, BOARD_NAME_POS, BOARD_SCROLL_DIRS
    };
})();
