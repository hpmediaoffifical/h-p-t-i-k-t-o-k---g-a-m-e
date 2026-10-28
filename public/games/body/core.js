/* 🧍 BỘ TÁCH NGƯỜI - lõi dùng chung: server (require) + overlay + panel (<script src="/games/body/core.js"> → window.HpBody).
 *
 * Gộp 3 hiệu ứng vẽ lại người tách nền vào MỘT game camera (một overlay chạy tách nền một lần cho cả ba):
 *   🦊 Hậu Cảnh   - lớp nền THƯỜNG TRỰC (nền theo hồ sơ NPC) + video SAU LƯNG theo quà, hàng chờ riêng (chạy song song).
 *   🕳️ Rơi Hố      - kịch bản rơi xuống cổng dưới chân rồi rơi lại từ trên đầu.
 *   🏃 Bị Đuổi     - kịch bản chân hoá vòng tròn, chạy trốn khỏi màn rồi chạy về.
 *   🎬 Video Hành Động - một video hiệu ứng (webm trong suốt / mp4 phủ kín) + người diễn theo mốc của video: bị văng / bị hút /
 *                    bị đè bẹp / tụt cổng → vắng → quay về (5 kiểu đo từ video mẫu NGHIEN CUU/NPC ACTION).
 *   Rơi Hố / Bị Đuổi / Video Hành Động cùng vẽ lại (di chuyển) người → chung MỘT hàng chờ "hành động", lượt một; combo ×N trần comboMax.
 *
 * HỒ SƠ NPC (dùng chung cả 3): groupId (NPC ở 🎁 Hồ sơ NPC, rỗng = Mọi NPC) + cỡ NPC % + lệch x/y % + nền thường trực.
 * Hồ sơ đang dùng = hồ sơ của NPC theo Scene OBS đang phát (server: profileNpcIds - NPC bật sau cùng nếu chưa biết Scene), rồi
 * hồ sơ "Mọi NPC".
 * Mỗi kịch bản / hiệu ứng có profileId: rỗng = mọi hồ sơ; có = chỉ chạy khi hồ sơ đó đang dùng (NPC đó đang bật).
 *
 * Luật kịch bản Bị Đuổi + mốc thời gian dùng lại lõi window.HpBiDuoi (overlays/camgames/biduoi/core.cjs); hiệu ứng Hậu Cảnh
 * dùng lại window.HpHauCanh (normalizeItem, runMs, enabledNpcIds).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('../biduoi/core.js'), require('../haucanh/core.js'));
    else root.HpBody = factory(root.HpBiDuoi, root.HpHauCanh);
})(typeof self !== 'undefined' ? self : this, function (BD, HC) {
    'use strict';

    const MATTE = { model: 'selfie', tiles: 2, radius: 6, eps: 0.003, lo: 0.28, hi: 0.72, still: 0.3, decon: 0.7 };
    // Mặc định = bản user chỉnh 2026-10-23 (chờ 2,3 s · rơi 460 ms · dưới hố 2,8 s).
    const ROIHO_TIMING = { waitSec: 2.3, openMs: 400, fallMs: 460, underSec: 2.8, ceilMs: 350, dropMs: 520, settleMs: 450 };
    // Nền lúc chạy Rơi Hố / Bị Đuổi:
    //   'room'   - (mặc định, user chốt 2026-10-17) ẩn cam gốc, vẽ lại PHÒNG SẠCH (không người) tự học; video kịch bản
    //              (nên webm trong suốt) chồng lên
    //   'effect' - video kịch bản phủ kín (chưa có video: nền Hậu Cảnh / phủ tối), ngoài lượt overlay trong suốt
    //   'none'   - overlay chỉ vẽ người, streamer tự che camera gốc trong OBS
    // bgModeV 2: cấu hình lưu trước đó còn mặc định cũ 'effect' → 'room' một lần.
    const BG_MODES = ['room', 'effect', 'none'];
    function bgModeOf(b) {
        const m = b.bgModeV === 2 ? b.bgMode : (!b.bgMode || b.bgMode === 'effect' ? 'room' : b.bgMode);
        return BG_MODES.includes(m) ? m : m === 'always' ? 'effect' : 'room';
    }
    // Hàng chờ HÀNH ĐỘNG (vẽ lại / dời người, lượt một) · 😭 Khóc Lóc là LỚP MẶT: không dời cam, không vẽ lại người → hàng chờ
    // riêng, chạy song song (như Hậu Cảnh), vẽ trên cùng. 💗 Bắn Tim cũng là LỚP PHỦ (bám tay, hàng chờ riêng theo người tặng).
    // KINDS = mọi loại kịch bản có scripts (server / pickForGift / listOf).
    const ACTION_KINDS = ['roiho', 'biduoi', 'vidfx', 'catch', 'morph'];
    const FACE_KINDS = ['cry'];
    const LAYER_KINDS = [...FACE_KINDS, 'heart'];
    const KINDS = [...ACTION_KINDS, ...LAYER_KINDS];
    // 📋 VÀO DANH SÁCH HIỆU ỨNG (từng kịch bản / hiệu ứng): quà về thì
    //   'next'   ⏭ Kế tiếp (#1) - thành MỘT hàng trong DANH SÁCH HIỆU ỨNG ở vị trí #1: phát ngay sau hiệu ứng đang chạy, NPC thấy trước
    //   'queue'  📋 Xếp hàng    - hàng ở cuối danh sách như quà thường
    //   'attach' 🔗 Kèm Bảng Quà - chạy CÙNG LÚC hiệu ứng 🎁 Bảng Quà của chính quà đó (lúc hàng đó phát); quà không có hiệu ứng
    //                            Bảng Quà thì như 'next'
    //   'now'    ⚡ Phát ngay    - ngoài danh sách, chạy song song ngay khi nhận quà (kiểu cũ)
    // Mặc định: Rơi Hố / Bị Đuổi 'next' (dời camera, vẽ lại người → không đè hiệu ứng khác); Hậu Cảnh 'attach' (sau lưng NPC, 3D).
    const QUEUE_MODES = ['next', 'queue', 'attach', 'now'];
    const queueModeOf = (v, def) => (QUEUE_MODES.includes(v) ? v : def);
    const MAX_PROFILES = 40, MAX_SCRIPTS = 30, MAX_ITEMS = 60;

    const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const str = (v, max) => String(v == null ? '' : v).slice(0, max);
    const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const arr = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
    const rid = p => p + Math.random().toString(36).slice(2, 8);
    const VIDEO_EXT = /\.(mp4|webm|mov|mkv|m4v)(\?|$)/i;
    const isVideo = f => VIDEO_EXT.test(String(f || ''));
    // 🎞 Video MẪU giao kèm (list/camgames/body → /games/body/samples/) đều là .webm (user 2026-10-24: "chuyển tất cả file mp4 kể cả
    // background của game sang webm" - .pack.mp4 / .mp4 đã xoá khỏi bản cài). Cấu hình cũ trỏ <tên>.pack.mp4 / <tên>.mp4 → tự đổi sang
    // <tên>.webm (sampleWebm, normalizeConfig). Trong suốt / phủ kín theo TÊN mẫu (overlay không đoán theo đuôi .mp4 được nữa).
    const SAMPLE_ALPHA = ['thien-thach-roi', 'ufo', 'dam-boc', 'dam-bep-di', 'ninja-chan', 'batu', 'meo-dance', 'meo-wtf', 'ngoai-hanh-tinh', 'pikachu-dance', 'rong-con', 'sieu-nhan'];
    const SAMPLE_OPAQUE = ['cua-scifi', 'mario-30fps', 'ninja', 'san-pickleball', 'batu-nen', 'pikachu-full'];
    const sampleName = f => {
        const m = /^\/games\/body\/samples\/([a-z0-9-]+?)(?:[._-]pack(?:ed)?)?\.(mp4|webm)$/i.exec(String(f || '').trim());
        const n = m ? m[1].toLowerCase() : '';
        return SAMPLE_ALPHA.includes(n) || SAMPLE_OPAQUE.includes(n) ? n : '';
    };
    const sampleWebm = f => { const n = sampleName(f); return n ? '/games/body/samples/' + n + '.webm' : String(f == null ? '' : f).trim(); };
    const isAlphaSample = f => SAMPLE_ALPHA.includes(sampleName(f));
    const isOpaqueSample = f => SAMPLE_OPAQUE.includes(sampleName(f));
    function uniqIds(list) {
        const seen = new Set();
        for (const x of list) { while (seen.has(x.id)) x.id += '_'; seen.add(x.id); }
        return list;
    }
    const gifts = list => (Array.isArray(list) ? list : []).filter(g => g && g.giftId)
        .map(g => ({ giftId: str(g.giftId, 40), giftName: str(g.giftName, 80), giftImage: str(g.giftImage, 600) })).slice(0, 40);

    // ---------- hồ sơ NPC ----------
    function makeProfile(over = {}) {
        return { id: rid('hs'), groupId: '', scale: 100, x: 0, y: 0, idleFile: '', idleAlpha: false, fadeMs: 350, ...over };
    }
    function normalizeProfile(p, i) {
        const s = obj(p);
        return {
            id: str(s.id || ('hs' + (i + 1)), 24), groupId: str(s.groupId, 80),
            scale: num(s.scale, 100, 30, 200), x: num(s.x, 0, -60, 60), y: num(s.y, 0, -60, 60),
            idleFile: str(s.idleFile, 1000).trim(), idleAlpha: s.idleAlpha === true, fadeMs: num(s.fadeMs, 350, 0, 3000)
        };
    }

    // ---------- 🔊 âm thanh riêng mỗi game (user 2026-10-19: "thêm mp3, có mp3 thì ưu tiên mp3") ----------
    // sfxFile: mp3 / wav / m4a do streamer dựng theo video mẫu → phát từ đầu lượt, TẮT tiếng video + tiếng giả lập của game đó.
    // sfxVol 0–100 %. Không có file: tiếng video (nếu bật) + tiếng giả lập (sfx-real.mjs; Rơi Hố, nhịp người 🎬, Bị Đuổi).
    // 🎵 Nhạc nền lúc game chạy (như nút 🎵/🔔/🔇 của 🎁 Bảng Quà; áp cho hàng ⏭ Kế tiếp / 📋 Xếp hàng - 🔗 Kèm theo hàng Bảng Quà,
    // ⚡ Phát ngay ngoài danh sách): 'normal' chạy chung nhạc nền · 'background' 🔔 chạy nền (🌙 hàng chạy nền, không giữ danh sách
    // chính) · 'mute' 🔇 tắt nhạc nền lúc game chạy.
    const RUN_MODES = ['normal', 'background', 'mute'];
    // vidVol 0–100 %: âm lượng TIẾNG VIDEO của game (công tắc 🔈 Tiếng video vẫn bật / tắt) - kéo là nghe đổi ngay (overlay sndLiveVol).
    // 🎧 sfxMix (user 2026-10-28 "nút bật/tắt chạy cả âm thanh giả lập cho gọn và đồng bộ"): có mp3 / video có tiếng thì tiếng giả lập vẫn chạy
    // CÙNG. Mặc định tắt (mp3 = tiếng thay thế); 🥷 Ninja + Son Goku mặc định bật (mp3 là nhạc nền, giả lập là tiếng hiệu ứng) - game cũ
    // chưa có trường thì suy theo loại để giữ nguyên tiếng như trước.
    const mixDefault = s => s.motion === 'ninja' || s.style === 'fly';
    const snd = s => ({ sfxFile: str(s.sfxFile, 1000).trim(), sfxVol: num(s.sfxVol, 100, 0, 100), vidVol: num(s.vidVol, 100, 0, 100), runMode: RUN_MODES.includes(s.runMode) ? s.runMode : 'normal',
        sfxMix: s.sfxMix == null ? mixDefault(s) : s.sfxMix === true });
    const SND_DEFAULT = { sfxFile: '', sfxVol: 100, vidVol: 100, runMode: 'normal', sfxMix: false };
    // 🎵 Nhạc nền MẶC ĐỊNH từng game (user chốt 2026-10-23): 🔔 chạy nền cho mọi game, trừ 🍄 Mario 🔇 tắt nhạc nền và
    // 🏓 Pickleball 🎵 chạy chung. Hậu Cảnh giữ 'normal' (theo hàng Bảng Quà).
    // 💗 Bắn Tim mặc định ⚡ Phát ngay (ngoài danh sách) → 🎵 chạy chung như panel tự đặt khi chọn ⚡.
    const runModeFor = (kind, motion) => (kind === 'heart' ? 'normal' : kind === 'vidfx' && motion === 'mario' ? 'mute' : kind === 'vidfx' && motion === 'pickle' ? 'normal' : 'background');
    const sndFor = (kind, motion) => ({ ...SND_DEFAULT, runMode: runModeFor(kind, motion), sfxMix: motion === 'ninja' });

    // ---------- 🕳️ Rơi Hố ----------
    function makeRoiHo(over = {}) {
        return { id: rid('ks'), name: 'Rơi hố', profileId: '', gifts: [], bgFile: '', bgSound: true, props: true, shake: 18, sfx: true, ...sndFor('roiho'),
            ...over, timing: { ...ROIHO_TIMING, ...(over.timing || {}) } };
    }
    function normalizeRoiHo(x, i) {
        const s = obj(x), T = obj(s.timing), t = {};
        for (const k of Object.keys(ROIHO_TIMING)) t[k] = num(T[k], ROIHO_TIMING[k], 0, k.endsWith('Sec') ? 60 : 10000);
        return { id: str(s.id || ('ks' + (i + 1)), 24), name: str(s.name || 'Rơi hố', 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'next'),
            bgFile: str(s.bgFile, 1000).trim(), bgSound: s.bgSound !== false, props: s.props !== false,
            shake: num(s.shake, 18, 0, 80), sfx: s.sfx !== false, ...snd(s), timing: t };
    }
    // ---------- 🏃 Bị Đuổi (luật kịch bản = lõi HpBiDuoi) ----------
    function makeBiDuoi(over = {}) { return { ...sndFor('biduoi'), ...BD.makeScript({ returnDir: 'left', ...over }), profileId: str(over.profileId, 24) }; }
    function normalizeBiDuoi(x, i) { const s = obj(x); return { ...BD.normalizeScript(s, i), profileId: str(s.profileId, 24), gifts: gifts(s.gifts), queueMode: queueModeOf(s.queueMode, 'next'), ...snd(s) }; }
    // ---------- 🎬 Video Hành Động ----------
    // Kiểu chuyển động của người (mốc đo từ ref của 5 video mẫu, giây tính từ đầu video):
    //   portal 🌀 Tụt cổng   - Cửa Scifi: người dời về cổng, tụt xuống sàn → vắng → rơi từ trần xuống, ngồi thụp rồi đứng dậy
    //   blast  ☄️ Bị nổ văng - Thiên Thạch: văng chéo lên khỏi màn, xoay → vắng (nổ) → rơi từ trên xuống, ngồi thụp
    //   abduct 🛸 Bị hút lên - UFO: thu nhỏ đứng dưới đĩa → bị hút, đầu thon cuốn vào đáy đĩa → vắng → nhả ra bé, đầu thon,
    //                         to dần rồi nở về cỡ thường (video sau người: người phát sáng TRONG luồng sáng, không bị che)
    //   knock  🥊 Đấm văng  - Đấm Box: văng ngang khỏi màn → vắng → trượt ngang về từ mép, khuỵu rồi đứng dậy
    //   crush  👊 Đè bẹp    - Đấm Bẹp Dí: bẹp dí xuống sàn (vẫn thấy) → bật dậy nảy
    // Kiểu "game" theo video nền phủ kín (mốc lấy từ hiệu ứng OBS Lua cũ mario_1080x1920.lua / pickleball.lua + đo video nền):
    //   mario  🍄 Mario     - thu nhỏ về điểm 1 → chạy tới điểm 2 (dưới ô ?) → nhảy đội ô ? (nấm trồi) → chạy theo nấm tới
    //                         điểm 3 → ăn nấm: to / nhỏ liên tục rồi phóng to → trở lại cỡ thật
    //   pickle 🏓 Pickleball - người là QUẢ BÓNG bay qua lại giữa camera (A: zoom KHUÔN MẶT tràn màn, user chốt 2026-10-19) và
    //                         vợt cô bé (B: nhỏ, thấy đủ người) theo mốc tiếng đánh trong nền, vồng lên cao, quay tròn đầu–chân
    //                         đủ hướng (số vòng nguyên → tới nơi thẳng người) + lộn nhào → về cỡ thật
    //   ninja  🥷 Ninja      - rừng cuộn ngang (user 2026-10-23): đứng trên NGỌN CÂY trái, mây (vẽ tay) che chân → cưỡi mây tụt
    //                         xuống GIỮA cam → đĩa "chân chạy" (ninja-chan.webm) thay chân bị khuất, chạy tại chỗ; né chướng
    //                         ngại theo nMoves (nhảy / lộn / nhảy ngắn / cúi) → hết video về cỡ thật
    //   batu   🪢 Ba Tư      - 3 lớp (user 2026-10-27): batu.webm TRÊN CÙNG (Ba Tư cầm roi, vòng dây + bao tải) · NPC giữa ·
    //                         bgFile batu-nen.webm DƯỚI CÙNG (hầm ngục, cột trói; 1 chu kỳ 2,033 s, lặp theo giờ video trên).
    //                         Mỗi chu kỳ: cảnh TOÀN (bị trói ở cột, xa) → bCut cắt sang cảnh CẬN (dây + bao to) → roi quất bHits.
    //                         Bao tải che chỗ camera cắt chân: MÉP DƯỚI khung cam đặt ngay dưới miệng bao (bAbot / bBbot).
    // Lớp video: 'front' luôn TRƯỚC người · 'back' luôn SAU người (nền) · 'auto' trước người tới lúc người quay về, sau đó là nền.
    // bgFile (mọi kiểu, tuỳ chọn): video NỀN dưới cùng chạy lặp, khớp giờ video chính - người nằm giữa 2 lớp.
    const VIDFX_MOTIONS = ['portal', 'blast', 'abduct', 'knock', 'crush', 'mario', 'pickle', 'ninja', 'batu'];
    const VIDFX_GAMES = ['mario', 'pickle', 'ninja', 'batu'];        // kiểu "game": video nền phủ kín, tư thế tuyệt đối trên sân khấu
    const VIDFX_LAYERS = ['auto', 'front', 'back'];
    const VIDFX_PRESETS = {
        portal: { layer: 'back', hitSec: 1.9, outMs: 450, backSec: 2.85, waitSec: 2, loopFrom: 1, loopTo: 1.8, inMs: 420, settleMs: 1400, shake: 14, dir: 'right', anchorX: 50, anchorY: 88 },
        blast: { layer: 'auto', hitSec: 1.05, outMs: 500, backSec: 4.9, inMs: 480, settleMs: 1600, shake: 30, dir: 'left', anchorX: 50, anchorY: 88 },
        abduct: { layer: 'back', hitSec: 1.45, outMs: 1300, backSec: 5.45, inMs: 1400, settleMs: 600, shake: 0, dir: 'right', anchorX: 50, anchorY: 24 },
        knock: { layer: 'auto', hitSec: 0.3, outMs: 220, backSec: 1.7, inMs: 720, settleMs: 1300, shake: 26, dir: 'right', anchorX: 50, anchorY: 88 },
        crush: { layer: 'auto', hitSec: 1.6, outMs: 160, backSec: 4.5, inMs: 550, settleMs: 700, shake: 34, dir: 'right', anchorX: 50, anchorY: 88 },
        mario: { layer: 'back', hitSec: 0, outMs: 450, backSec: 7.6, inMs: 900, settleMs: 0, shake: 0, dir: 'right', anchorX: 50, anchorY: 88 },
        pickle: { layer: 'back', hitSec: 0, outMs: 50, backSec: 7.87, inMs: 500, settleMs: 0, shake: 0, dir: 'right', anchorX: 50, anchorY: 88 },
        ninja: { layer: 'back', hitSec: 0, outMs: 350, backSec: 9.72, inMs: 600, settleMs: 0, shake: 0, dir: 'right', anchorX: 50, anchorY: 88 },
        batu: { layer: 'front', hitSec: 0, outMs: 50, backSec: 4.04, inMs: 50, settleMs: 0, shake: 12, dir: 'right', anchorX: 50, anchorY: 88 }
    };
    // Thông số riêng của kiểu "game" (% khung 1080×1920 · giây tính từ đầu video nền). Đo trên mario-video-fn.mp4: mặt đất 64,6 %,
    // ô ? giữa 45,5 % đáy 52,8 % (trình duyệt: bật cao nhất ~1,95 s), nấm tới 62 % ngang ~4,7 s rồi mất 4,8 s; tiếng ăn nấm 5,0–5,87 s, rồi tiếng NHẤP NHÁY nhịp ~0,27 s
    // (5,96 · 6,23 · 6,52 · 6,79 · 7,03 · 7,29 · 7,57) → chớp phóng to theo bậc mGrow…, nốt kết 7,79 s → về cỡ thật. Đo trên san-pickleball_background.mp4: tiếng đánh
    // 0 · 1,02 · 2,02 · 2,98 · 3,98 · 4,94 · 5,94 · 6,90 s, hết video 7,87 s; vợt cô bé ~ (46 %, 74 %).
    const VIDFX_EXTRA = {
        mario: { m1x: 18, m2x: 45.5, m3x: 63, mGround: 64.6, mBlock: 52.8, mSize: 8, mArrive: 1.75, mJumpMs: 400, mLeave: 2.2, mReach: 4.7,
            mMush: 5.0, mMushMs: 1500, mGrow: 5.95, mGrowX: 3, mGrowAdd: 0.8, mGrowMs: 270 },
        pickle: { pAx: 50, pAy: 45, pAsz: 55, pFace: 9, pBx: 46, pBy: 74, pBsz: 9, pHits: '0 1.02 2.02 2.98 3.98 4.94 5.94 6.9 7.87', pLob: 60,
            pFlips: 1, pSpin: 150 },
        // Đo trên ninja.mp4 (Background.webm 25 khung/s, 9,72 s; vật cản chạy phải → trái, mặt đất 89 %): 🔥 lửa cao 12 % qua ngọn cây
        // trái ~0,75 s · 🌪 lốc (cao tới 62 %) qua giữa 1,93 s · 🔥 lửa ngang ngực 69–75 % 3,42 s · 🐢 Bowser 4,97 s · ⭐ 3 phi tiêu
        // (64–76 %) 6,32 · 6,75 · 7,28 s · 🪨 đá lăn 8,95 s. nMoves: <loại><từ>-<đến> giây - j nhảy · f nhảy lộn · h nhảy ngắn · d cúi.
        ninja: { nX: 50, nGround: 89, nSize: 20, nTreeX: 12, nTreeY: 19, nTreeSz: 13, nDrop: 1.0, nLand: 1.5,
            nMoves: 'd0.55-0.9 j1.55-2.3 d3.1-3.75 s4.65-5.45 h6.12-6.5 h6.56-6.93 h7.08-7.48 j8.65-9.28', nJump: 34, nHop: 26, nDuck: 45,
            nFeetSz: 62, nFeetMode: 'cut', nFeetUp: 35, nFeetLeg: 30,
            // 💀 Kết thúc (user 2026-10-23): đo phi tiêu thứ nhất chạm NPC 6,30 s; đá lăn tâm qua giữa cam 9,0 s, chạm NPC ~8,85 s
            nEnd: 'random', nStarHit: 6.3, nRockHit: 8.85, nOverSec: 3,
            // 🌪 bị lốc cuốn (vẫn WIN): lốc chạm NPC ~1,75 s (đang đi qua giữa cam 1,93 s), rơi "bịch" xuống đất 2,95 s - kịp cúi né lửa 3,1 s
            nTwistHit: 1.75, nTwistLand: 2.95,
            // 🔥 cháy đen: cầu lửa ngang ngực tới NPC 3,35 s · 😵 Bowser húc: mép Bowser chạm NPC ~4,93 s · 🐢 cưỡi Bowser: nhảy lên lưng 4,82 s ·
            // 🪧 đu biển hp: biển qua giữa cam 7,2 s (với lấy từ 6,95 s) · 🕶 Matrix: phi tiêu 6,05–7,55 s chạy chậm còn nSlow %
            nBurnHit: 3.35, nBonkHit: 4.93, nRideAt: 4.82, nPoleAt: 6.95, nSlow: 35 },
        // 🪢 Đo trên batu_option3.webm (30 khung/s, 4,05 s = 2 chu kỳ) + canh nen op2.mp4 (2,033 s = 1 chu kỳ): cắt TOÀN → CẬN 1,033 s
        // (và 3,067 s), về TOÀN 2,033 s; roi vung (vút) 0,48 · 2,57 s; roi QUẤT trúng (tiếng "chát" + roi qua vòng dây) 1,40 · 3,40 s.
        // Cảnh TOÀN: vòng dây x 895–1037 y 760–870 px, bao tải phủ kín bề ngang từ y ≈ 1120 → NPC giữa 89,4 %, mép cam 60,5 %.
        // Cảnh CẬN: vòng dây x 550–958 y 480–730, bao phủ kín từ y ≈ 1360 → giữa 69,8 %, mép cam 72 %. Cỡ = chiều cao người
        // (đỉnh đầu → mép cam dưới) % khung; mặc định vòng dây ngang ngực camera nửa người (đầu → giữa đùi).
        batu: { bCut: 1.033, bPeriod: 2.033, bHits: '1.4 3.4', bAx: 89.4, bAbot: 60.5, bAsz: 26, bBx: 69.8, bBbot: 72, bBsz: 66, bSway: 100 }
    };
    const EXTRA_RANGE = { m1x: [0, 100], m2x: [0, 100], m3x: [0, 100], mGround: [20, 100], mBlock: [0, 100], mSize: [3, 60], mArrive: [0, 60],
        mJumpMs: [100, 2000], mLeave: [0, 60], mReach: [0, 60], mMush: [0, 60], mMushMs: [300, 5000],
        mGrow: [0, 60], mGrowX: [0, 20], mGrowAdd: [0, 10], mGrowMs: [80, 3000],
        pAx: [0, 100], pAy: [-50, 150], pAsz: [10, 200], pFace: [0, 50], pBx: [0, 100], pBy: [0, 100], pBsz: [2, 80], pLob: [0, 150], pFlips: [0, 5], pSpin: [0, 500],
        nX: [0, 100], nGround: [20, 100], nSize: [3, 80], nTreeX: [0, 100], nTreeY: [0, 100], nTreeSz: [3, 80], nDrop: [0, 60], nLand: [0, 60],
        nJump: [0, 100], nHop: [0, 100], nDuck: [20, 100], nFeetSz: [0, 200], nFeetUp: [0, 100], nFeetLeg: [0, 100],
        nStarHit: [0, 60], nRockHit: [0, 60], nOverSec: [0.5, 15], nTwistHit: [0, 60], nTwistLand: [0, 60],
        nBurnHit: [0, 60], nBonkHit: [0, 60], nRideAt: [0, 60], nPoleAt: [0, 60], nSlow: [10, 100],
        bCut: [0, 60], bPeriod: [0.2, 60], bAx: [0, 100], bAbot: [0, 150], bAsz: [3, 200], bBx: [0, 100], bBbot: [0, 150], bBsz: [3, 200], bSway: [0, 300] };
    // Mốc cú đánh Pickleball: chuỗi giây cách nhau bởi dấu cách / phẩy, tăng dần, ≥ min mốc (Pickleball 2, Ba Tư 1).
    function parseHits(v, min = 2) {
        const out = [];
        for (const t of String(v == null ? '' : v).split(/[\s,;]+/)) { const n = Number(t); if (t && Number.isFinite(n) && n >= 0 && n <= 120 && (!out.length || n > out[out.length - 1])) out.push(+n.toFixed(3)); }
        return out.length >= min ? out : null;
    }
    // 🥷 Mốc né Ninja: "j1.6-2.3 d3.1-3.75 …" → [{ t, a, b }] (giây, a < b), xếp theo a, bỏ mục sai / chồng lên mục trước.
    // s = trượt dưới háng Bowser → bật lên ĐẠP vào lưng nó → bật ra lộn ngược về giữa cam (user 2026-10-23, thay cú lộn qua Bowser).
    const NINJA_MOVES = ['j', 'f', 'h', 'd', 's'];
    const NINJA_MOVES_V1 = 'd0.55-0.9 j1.55-2.3 d3.1-3.75 f4.6-5.35 h6.12-6.5 h6.56-6.93 h7.08-7.48 j8.65-9.28';     // mốc mẫu bản 1.3.2 - máy còn đúng chuỗi này thì nhận mốc mẫu mới
    // 🦶 Chế độ đĩa chân chạy (user 2026-10-23): 'cut' NPC bị cắt chân (camera nửa người) - đĩa nằm DƯỚI thân, đáy thân lút vào
    // đĩa nFeetUp % · 'full' camera thấy cả người - đĩa đưa LÊN che phần chân, tâm đĩa cao nFeetLeg % chiều cao người tính từ bàn chân.
    const NINJA_FEET_MODES = ['cut', 'full'];
    // 💀 Kết thúc lượt Ninja (user 2026-10-23, 3 kiểu chơi, kiểu nào cũng có bảng): 'win' vượt qua mọi chướng ngại → bảng WIN · 'star' nhảy lên nhưng dính phi tiêu → chết, rơi nằm ngang → GAME OVER ·
    // 'rock' qua phi tiêu, tới cục đá tròn thì bị đè bẹp → GAME OVER · 'random' mỗi lượt bốc ngẫu nhiên 1 trong 3.
    // 'twister' 🌪 (user 2026-10-23): tới lốc xoáy bị cuốn vào, xoay tít bay lên cao, rơi "bịch" xuống đất rồi chạy tiếp → vẫn WIN.
    // Thêm 2026-10-23 (user "làm thử hết"): 🔥 'burnt' cháy đen thui vẫn chạy (WIN) · 🕶 'matrix' phi tiêu: video chạy chậm, ngả người né
    // (WIN) · 😵 'bonk' Bowser húc lăn lông lốc, sao xoay đầu, tỉnh lại chạy tiếp (WIN) · 🐢 'ride' cưỡi Bowser ra khỏi màn rồi chạy vào lại
    // (WIN) · 🪧 'pole' đu biển hp xoay vòng xà đơn rồi bay tiếp (WIN) · 🌠 'gone' bị lốc cuốn bay mất thành chấm sao (GAME OVER).
    const NINJA_ENDS = ['random', 'win', 'twister', 'burnt', 'matrix', 'bonk', 'ride', 'pole', 'star', 'rock', 'gone'];
    const NINJA_OUTCOMES = NINJA_ENDS.slice(1);
    const NINJA_LOSE = ['star', 'rock', 'gone'];
    const ninjaWin = end => !NINJA_LOSE.includes(end);
    const NINJA_DIE_SEC = { star: 1.0, rock: 0.6, gone: 1.7 };       // trúng đòn → bảng GAME OVER hiện
    // 🕶 Matrix: đoạn video chạy chậm (giây video) - lượt thật dài thêm slowMs.
    const NINJA_SLOW = { from: 6.05, to: 7.55 };
    const ninjaSlowMs = sc => (NINJA_SLOW.to - NINJA_SLOW.from) * 1000 * (100 / Math.max(10, sc.nSlow || 100) - 1);
    // Mốc một lượt Ninja theo kết thúc đã bốc (ms): ko = lúc trúng đòn (WIN: null), over = bảng WIN / GAME OVER hiện (WIN: hết video
    // nền backSec), back = bắt đầu về cỡ thật (bảng giữ nOverSec giây).
    function ninjaPlan(sc, end, vEnd) {
        if (ninjaWin(end)) {
            const over = sc.backSec * 1000, back = over + sc.nOverSec * 1000, land = back + sc.inMs;
            const slowMs = end === 'matrix' ? ninjaSlowMs(sc) : 0;
            return { hit: 0, gone: 0, back, land, still: land, end: Math.max(land + 200, vEnd), real: Math.max(land + 200, vEnd) + slowMs, slowMs, hits: null,
                ending: NINJA_OUTCOMES.includes(end) ? end : 'win', ko: null, over };
        }
        const ko = (end === 'star' ? sc.nStarHit : end === 'gone' ? sc.nTwistHit : sc.nRockHit) * 1000, over = ko + NINJA_DIE_SEC[end] * 1000;
        const back = over + sc.nOverSec * 1000, land = back + sc.inMs;
        return { hit: 0, gone: 0, back, land, still: land, end: land + 200, real: land + 200, slowMs: 0, hits: null, ending: end, ko, over };
    }
    function parseMoves(v) {
        const out = [];
        for (const tok of String(v == null ? '' : v).toLowerCase().split(/[\s,;]+/)) {
            const m = /^([jfhds])(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(tok);
            if (!m) continue;
            const a = +Number(m[2]).toFixed(3), b = +Number(m[3]).toFixed(3);
            if (b > a && b <= 120) out.push({ t: m[1], a, b });
        }
        out.sort((x, y) => x.a - y.a);
        const kept = [];
        for (const x of out) if (!kept.length || x.a >= kept[kept.length - 1].b) kept.push(x);
        return kept;
    }
    const movesText = l => l.map(x => x.t + x.a + '-' + x.b).join(' ');
    const VIDFX_NAMES = { portal: 'Tụt cổng', blast: 'Bị nổ văng', abduct: 'Bị hút lên', knock: 'Đấm văng', crush: 'Đè bẹp', mario: 'Mario ăn nấm', pickle: 'Pickleball', ninja: 'Ninja', batu: 'Ba Tư' };
    function makeVidFx(over = {}) {
        const motion = VIDFX_MOTIONS.includes(over.motion) ? over.motion : 'blast';
        return { id: rid('vf'), name: VIDFX_NAMES[motion], profileId: '', gifts: [], file: '', bgFile: '', sound: true, sfx: true, ...sndFor('vidfx', motion), motion,
            ...VIDFX_PRESETS[motion], ...(VIDFX_EXTRA[motion] || {}), ...over, motion };
    }
    // 📦 Video mẫu GIAO KÈM APP (list/camgames/body → /games/body/samples/, extraResources; bản cài chép sang userData/list):
    // 8 video trong suốt + 4 nền phủ kín, tất cả .webm (2026-10-24 - xem sampleWebm). durSec đo trên đúng file giao (ffprobe) - DANH SÁCH giữ hàng đúng
    // lâu cả khi panel chưa mở. Đường dẫn gốc-tương-đối: backup không nhúng file (máy nhận dùng bản giao kèm của nó).
    const VIDFX_SAMPLE_DIR = '/games/body/samples/';
    const VIDFX_SAMPLES = {
        portal: { name: '🌀 Cửa Scifi', file: 'cua-scifi.webm', durSec: 5.01 },
        blast: { name: '☄️ Thiên Thạch Rơi', file: 'thien-thach-roi.webm', durSec: 4.73 },
        abduct: { name: '🛸 UFO', file: 'ufo.webm', durSec: 10.1 },
        knock: { name: '🥊 Đấm Box', file: 'dam-boc.webm', durSec: 3.28 },
        crush: { name: '👊 Đấm Bẹp Dí', file: 'dam-bep-di.webm', durSec: 5.23 },
        mario: { name: '🍄 Mario ăn nấm', file: 'mario-30fps.webm', durSec: 8.8 },
        pickle: { name: '🏓 Pickleball', file: 'san-pickleball.webm', durSec: 7.87 },
        // mp3: nhạc mẫu giao kèm (user gắn trên máy mình rồi yêu cầu giao kèm, 2026-10-23) - Legend of Kage (Rock), âm lượng user chỉnh 52 %
        ninja: { name: '🥷 Ninja', file: 'ninja.webm', durSec: 9.72, mp3: 'ninja-nhac.mp3', mp3Vol: 52 },
        // bg: video NỀN dưới cùng (batu_option3.webm → batu.webm, canh nen op2.mp4 → batu-nen.webm; user 2026-10-27)
        batu: { name: '🪢 Ba Tư', file: 'batu.webm', bg: 'batu-nen.webm', durSec: 4.05 }
    };
    // 🥷 Đĩa "chân chạy" giao kèm (chan-gia.webm, webm trong suốt): thay phần chân bị khuất của NPC lúc chạy.
    const NINJA_FEET_FILE = VIDFX_SAMPLE_DIR + 'ninja-chan.webm';
    // Mẫu của một kiểu (tên, file, durSec) - panel dùng khi ＋ Thêm / đổi kiểu. null = kiểu không có video mẫu.
    const vidFxSample = m => {
        const S = VIDFX_SAMPLES[m];
        if (!S) return null;
        const { mp3, mp3Vol, bg, ...rest } = S;
        return { ...rest, file: VIDFX_SAMPLE_DIR + S.file, ...(bg ? { bgFile: VIDFX_SAMPLE_DIR + bg } : {}),
            ...(mp3 ? { sfxFile: VIDFX_SAMPLE_DIR + mp3, sfxVol: mp3Vol || 100 } : {}) };
    };
    // 🎵 Nhạc mẫu giao kèm đợt 1 (cờ vidfx.sndV): game mẫu đã gieo TRƯỚC khi có nhạc (Ninja v1.3.2–1.3.5) mà ô mp3 còn trống → gắn nhạc
    // mẫu một lần; streamer xoá nhạc sau đó thì thôi. KHÔNG đặt cờ trong defaultConfig (máy mới đã có nhạc trong mẫu).
    const VIDFX_SND_V = 1;
    function seedVidFxSnd(list) {
        return list.map(s => {
            const S = s.id === 'vft_' + s.motion ? vidFxSample(s.motion) : null;
            return S && S.sfxFile && !s.sfxFile ? { ...s, sfxFile: S.sfxFile, sfxVol: S.sfxVol } : s;
        });
    }
    const isVidFxSampleFile = f => String(f || '').startsWith(VIDFX_SAMPLE_DIR);
    // 7 game mẫu: id CỐ ĐỊNH (vft_<kiểu>) để chuẩn hoá nhiều lần không sinh bản mới; không quà, mọi hồ sơ, ⏭ Kế tiếp.
    function vidFxTemplates() { return VIDFX_MOTIONS.map((m, i) => normalizeVidFx(makeVidFx({ ...vidFxSample(m), id: 'vft_' + m, motion: m }), i)); }
    // Gieo mẫu MỘT lần mỗi đợt (cờ vidfx.tplV): chỉ thêm kiểu CHƯA có game nào và ra đời SAU đợt máy đã gieo (VIDFX_TPL_ADDED,
    // mặc định đợt 1), xếp sau game của streamer; xoá mẫu rồi thì không hiện lại. Đợt 2 (2026-10-23) = 🥷 Ninja · đợt 3 (2026-10-27) = 🪢 Ba Tư.
    const VIDFX_TPL_V = 3;
    const VIDFX_TPL_ADDED = { ninja: 2, batu: 3 };
    function seedVidFx(list, fromV) {
        const out = list.slice(), from = Number(fromV) || 0;
        for (const t of vidFxTemplates()) {
            if (out.length >= MAX_SCRIPTS) break;
            if ((VIDFX_TPL_ADDED[t.motion] || 1) <= from) continue;
            if (!out.some(s => s.id === t.id || s.motion === t.motion)) out.push(t);
        }
        return out;
    }
    function normalizeVidFx(x, i) {
        const s = obj(x), motion = VIDFX_MOTIONS.includes(s.motion) ? s.motion : 'blast', P = VIDFX_PRESETS[motion];
        return { id: str(s.id || ('vf' + (i + 1)), 24), name: str(s.name || VIDFX_NAMES[motion], 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'next'), file: str(s.file, 1000).trim(), sound: s.sound !== false, motion,
            bgFile: str(s.bgFile, 1000).trim(),           // video NỀN dưới cùng (tuỳ chọn) - lặp, khớp giờ video chính, người nằm giữa
            sfx: s.sfx !== false, ...snd(s),              // sfx = tiếng giả lập nhịp NGƯỜI (văng / rơi / đáp) chồng lên tiếng video
            durSec: num(s.durSec, 0, 0, 600),            // độ dài video (panel đọc lúc thêm file) - để DANH SÁCH giữ hàng đúng lâu
            // ⏳ Chờ trước khi rơi (user 2026-10-19, Cửa Scifi): video LẶP đoạn [loopFrom, loopTo] (cổng đang mở) thêm ~waitSec giây
            // trước mốc rời đi - người đứng trên cổng; 0 = không chờ. Đoạn lặp phải nằm TRƯỚC hitSec.
            waitSec: num(s.waitSec, P.waitSec || 0, 0, 60), loopFrom: num(s.loopFrom, P.loopFrom || 0, 0, 60), loopTo: num(s.loopTo, P.loopTo || 0, 0, 60),
            layer: VIDFX_LAYERS.includes(s.layer) ? s.layer : P.layer,
            hitSec: num(s.hitSec, P.hitSec, 0, 60), outMs: num(s.outMs, P.outMs, 50, 5000), backSec: num(s.backSec, P.backSec, 0, 60),
            inMs: num(s.inMs, P.inMs, 50, 5000), settleMs: num(s.settleMs, P.settleMs, 0, 5000), shake: num(s.shake, P.shake, 0, 80),
            dir: s.dir === 'left' || s.dir === 'right' ? s.dir : P.dir, anchorX: num(s.anchorX, P.anchorX, 0, 100), anchorY: num(s.anchorY, P.anchorY, 0, 100),
            ...extraOf(motion, s) };
    }
    function extraOf(motion, s) {
        const E = VIDFX_EXTRA[motion];
        if (!E) return {};
        const out = {};
        for (const [k, d] of Object.entries(E)) {
            if (k === 'pHits') { const h = parseHits(s.pHits); out.pHits = h ? h.join(' ') : d; continue; }
            if (k === 'bHits') { const h = s.bHits == null ? null : parseHits(s.bHits, 0); out.bHits = h ? h.join(' ') : d; continue; }    // xoá hết = không quất
            if (k === 'nEnd') { out.nEnd = NINJA_ENDS.includes(s.nEnd) ? s.nEnd : d; continue; }
            if (k === 'nFeetMode') { out.nFeetMode = NINJA_FEET_MODES.includes(s.nFeetMode) ? s.nFeetMode : d; continue; }
            if (k === 'nMoves') { out.nMoves = s.nMoves == null || s.nMoves === NINJA_MOVES_V1 ? d : movesText(parseMoves(s.nMoves)); continue; }      // xoá hết = không né
            out[k] = num(s[k], d, EXTRA_RANGE[k][0], EXTRA_RANGE[k][1]);
        }
        return out;
    }
    // ⏳ Số lần lặp đoạn chờ (0 = không lặp) + độ dài một lần (ms).
    function vidFxLoop(sc) {
        const len = ((sc.loopTo || 0) - (sc.loopFrom || 0)) * 1000;
        if (!(sc.waitSec > 0) || len < 200 || (sc.loopTo || 0) * 1000 > vidFxPlan(sc, NaN).hit + 1) return { n: 0, len: 0 };
        return { n: Math.max(1, Math.round(sc.waitSec * 1000 / len)), len };
    }
    // Mốc một lượt (ms, theo GIỜ VIDEO - lúc lặp đoạn chờ thì giờ video lùi lại, mốc người diễn không đổi).
    // ending (chỉ Ninja): kết thúc đã bốc của lượt; không có → kết thúc đặt sẵn, 'random' = lượt DÀI nhất (DANH SÁCH giữ hàng đủ lâu).
    function vidFxPlan(sc, videoMs, ending) {
        const vEnd = Number.isFinite(videoMs) && videoMs > 0 ? videoMs : 0;
        if (sc.motion === 'ninja') {
            const ends = ending ? [ending] : sc.nEnd === 'random' || !sc.nEnd ? NINJA_OUTCOMES : [sc.nEnd];
            return ends.map(x => ninjaPlan(sc, x, vEnd)).reduce((a, b) => (b.real > a.real ? b : a));
        }
        // 🪢 Ba Tư: diễn tới backSec (hết video) rồi CẮT về cỡ thật như cắt cảnh - không đoạn chuyển
        if (sc.motion === 'batu') {
            const back = sc.backSec * 1000, hits = (parseHits(sc.bHits, 1) || []).filter(t => t * 1000 < back);
            return { hit: 0, gone: 0, back, land: back, still: back, end: Math.max(back, vEnd), hits };
        }
        // kiểu game: hit = lúc bắt đầu diễn, back = lúc bắt đầu về cỡ thật (backSec), land = về xong
        if (VIDFX_GAMES.includes(sc.motion)) {
            const hits = sc.motion === 'pickle' ? (parseHits(sc.pHits) || parseHits(VIDFX_EXTRA.pickle.pHits)) : null;
            const back = (hits ? hits[hits.length - 1] : sc.backSec) * 1000, land = back + sc.inMs;
            return { hit: 0, gone: 0, back, land, still: land, end: Math.max(land + 200, vEnd), hits };
        }
        const hit = sc.hitSec * 1000, gone = hit + sc.outMs, back = Math.max(gone, sc.backSec * 1000), land = back + sc.inMs, still = land + sc.settleMs;
        const end = Math.max(still + 200, vEnd);
        return { hit, gone, back, land, still, end };
    }

    // ---------- 😭 Khóc Lóc (lớp mặt: bám 2 mắt bằng MediaPipe FaceLandmarker, vẽ nước mắt hoạt hình) ----------
    // mood   'cry' 😭 khóc (mắt long lanh → dòng chảy mí dưới → phun vòi 2 bên) · 'laugh' 😂 cười ra nước mắt (giọt bắn ngang + chữ HA HA)
    // style  'both' cả dòng chảy + giọt văng · 'stream' chỉ dòng chảy · 'spray' chỉ giọt văng
    // ramp   tăng dần theo giây (rơm rớm → chảy → phun) · face: mũi đỏ + má hồng · mouth: miệng mếu (vẽ đè lên miệng thật - mặc định tắt)
    // intensity 1–3 · color: màu nước mắt (hex) · durSec: thời lượng một lượt; combo ×N kéo dài thêm (trần comboMax).
    // puddle: 💧 vũng nước dâng từ ĐÁY overlay theo mức khóc (sóng gợn, giọt chạm nước nổ vòng, bong bóng, bóng NPC phản chiếu),
    // puddleMax: mực nước tối đa (% chiều cao sân khấu); hết lượt nước rút.
    // cloud: ☁️ mây mưa bám trên đỉnh đầu (xám dần theo mức khóc, mưa rơi xuống vũng, chớp loé lúc phun vòi) - mặc định bật cho 😭, tắt cho 😂.
    const CRY_MOODS = ['cry', 'laugh'];
    const CRY_STYLES = ['both', 'stream', 'spray'];
    const CRY_COLOR = '#8fd8ff';
    const hexColor = (v, d) => { const s = String(v == null ? '' : v).trim().toLowerCase(); return /^#[0-9a-f]{6}$/.test(s) ? s : d; };
    function makeCry(over = {}) {
        return { id: rid('cr'), name: 'Khóc lóc', profileId: '', gifts: [], queueMode: 'next', durSec: 7, mood: 'cry', style: 'both', intensity: 2,
            color: CRY_COLOR, ramp: true, face: false, mouth: false, puddle: true, puddleMax: 18, ...sndFor('cry'), ...over, cloud: over.cloud != null ? over.cloud !== false : false };
    }
    function normalizeCry(x, i) {
        const s = obj(x);
        return { id: str(s.id || ('cr' + (i + 1)), 24), name: str(s.name || 'Khóc lóc', 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'next'), durSec: num(s.durSec, 7, 1, 60),
            mood: CRY_MOODS.includes(s.mood) ? s.mood : 'cry', style: CRY_STYLES.includes(s.style) ? s.style : 'both',
            intensity: Math.round(num(s.intensity, 2, 1, 3)), color: hexColor(s.color, CRY_COLOR),
            ramp: s.ramp !== false, face: s.face === true, mouth: s.mouth === true,
            puddle: s.puddle !== false, puddleMax: num(s.puddleMax, 18, 5, 45),
            cloud: s.cloud === true, ...snd(s) };
    }
    const CRY_FADE_MS = 600;       // mờ dần cuối lượt (giọt đang bay vẫn rơi hết)

    // ---------- 🔴 Bắt NPC (fx-catch.mjs) ----------
    // Ném cầu trúng NPC → cầu bật lên góc trên, mở nắp, tia sáng hút NPC (đầu vào trước) → rơi xuống lắc `shakes` lần →
    //   outcome 'random' (winPct % bắt được) | 'win' | 'fail'
    //   ✅ bắt được: cạch + TING + sao → giữ holdSec giây rồi trả NPC
    //   ❌ xổng: failMode 'self' nhả đúng NPC · 'video' nhả ra video hài failFile (webm trong suốt / .pack.mp4, cao failScale % người,
    //      failDurSec 0 = hết video) · 'random' chọn ngẫu nhiên giữa hai kiểu (chưa có failFile thì luôn 'self').
    // Cầu vẽ bằng mã: ballColor (nắp) / ballColor2 (đáy) / bandColor (đai, nút) / glowColor (viền, nút sáng, sao) / energyColor
    // (tia sáng, người hoá năng lượng). Mặc định đỏ - trắng - đai đen (user chốt 2026-10-27 "cho thuần giống hơn", đã báo rủi ro thương hiệu). ballFile: ảnh cầu riêng
    // (tròn, nhìn thẳng, nửa trên = nắp) thay phần vẽ.
    const CATCH_OUTCOMES = ['random', 'win', 'fail'];
    const CATCH_FAIL_MODES = ['self', 'video', 'random'];
    const CATCH_TIMING = { throwMs: 700, bounceMs: 450, openMs: 350, suckMs: 1000, closeMs: 260, fallMs: 800, shakeMs: 600, shakeGapMs: 900, releaseMs: 600 };   // lắc lâu hơn cho hồi hộp (user 2026-10-28)
    const CATCH_COLORS = { ballColor: '#e3262f', ballColor2: '#f5f5f5', bandColor: '#161616', glowColor: '#ffd84a', energyColor: '#ff4d6d' };
    // 💬 Hộp chữ kiểu game lúc lắc (showText): textWait + "." theo từng lần lắc → textWin / textFail. {user} = người tặng,
    // {npc} = npcName (rỗng = "NPC"). textColor2 = màu viền trong của hộp.
    // Nhiều câu = mỗi dòng một câu, mỗi lượt bốc ngẫu nhiên một câu (user gợi ý 2026-10-27, 3 câu đầu của mỗi loại là câu user).
    const CATCH_TEXT = { showText: true, npcName: '', textWait: 'Đang thu phục {npc}',
        textWin: '{user} đã thu phục thành công {npc}!\nĐã bắt được {npc}, chúc mừng {user}!\nThu phục thành công! {user} đã bắt được {npc}!',
        textFail: 'Bạn đã trượt rồi {user}, thật đáng tiếc!\nÔi không! {npc} đã thoát ra!\n{npc} thoát mất rồi, {user} thử lại nhé!', textColor2: '#4f7cff' };
    const CATCH_TEXT_MAX = 800;
    // 🎬 Bắt được: winFile (video phủ khung, webm trong suốt / mp4) + winAudio (mp3) phát sau tiếng TING, NPC nằm trong cầu (cam gốc
    // vẫn đang dời ra ngoài) tới khi cả hai chạy hết rồi mới thả ra. ❌ Xổng: failAudio (mp3) lúc cầu bung.
    // winFiles: NHIỀU video, mỗi lượt bốc ngẫu nhiên (không lặp liền) - user sẽ thêm dần; 📦 mẫu giao kèm list/camgames/body (CATCH_WIN_SAMPLES).
    const CATCH_WIN_SAMPLES = ['meo-dance', 'meo-wtf', 'ngoai-hanh-tinh', 'pikachu-dance', 'pikachu-full', 'rong-con', 'sieu-nhan']
        .map(n => '/games/body/samples/' + n + '.webm');      // pikachu-full: mp4-kiểu phủ kín (có nền phòng)
    // Gieo video mẫu MỚI vào kịch bản đã lưu: tăng CATCH_WIN_SEED_V khi thêm mẫu → kịch bản có winSeedV cũ được BỔ SUNG mẫu còn thiếu
    // (video tự thêm giữ nguyên). v1 = 7 video (2026-10-28).
    const CATCH_WIN_SEED_V = 1;
    // bản thử 2026-10-28 trỏ meo-dance1.webm (→ meo-dance.webm user cắt lại) / meo-mtf.webm (→ meo-wtf.webm đã dán sticker che ngón tay)
    const catchWinFile = f => String(f).replace(/\/meo-dance1\.webm$/i, '/meo-dance.webm').replace(/\/meo-mtf\.webm$/i, '/meo-wtf.webm');
    const CATCH_MEDIA = { winFiles: CATCH_WIN_SAMPLES.slice(), winSeedV: CATCH_WIN_SEED_V, winSound: true, winAudio: '', winAudioVol: 100, failAudio: '', failAudioVol: 100 };
    const CATCH_MAX_WIN = 20;
    function makeCatch(over = {}) {
        return { id: rid('bc'), name: 'Bắt NPC', profileId: '', gifts: [], queueMode: 'next', waitSec: 0.6, outcome: 'random', winPct: 50, shakes: 3, holdSec: 2,
            failMode: 'self', failFile: '', failScale: 100, failDurSec: 0, failSound: true, ...CATCH_MEDIA, ballFile: '', ballSize: 100, sfx: true, ...CATCH_COLORS, ...CATCH_TEXT,
            ...sndFor('catch'), ...over, timing: { ...CATCH_TIMING, ...(over.timing || {}) } };
    }
    function normalizeCatch(x, i) {
        const s = obj(x), T = obj(s.timing), t = {};
        for (const k of Object.keys(CATCH_TIMING)) t[k] = num(T[k], CATCH_TIMING[k], 50, 5000);
        // còn đúng nhịp lắc mặc định cũ (420 / 520 ms, bản thử 2026-10-27) → nhịp lắc lâu mới (user 2026-10-28)
        if (t.shakeMs === 420 && t.shakeGapMs === 520) { t.shakeMs = CATCH_TIMING.shakeMs; t.shakeGapMs = CATCH_TIMING.shakeGapMs; }
        const col = {};
        for (const k of Object.keys(CATCH_COLORS)) col[k] = hexColor(s[k], CATCH_COLORS[k]);
        return { id: str(s.id || ('bc' + (i + 1)), 24), name: str(s.name || 'Bắt NPC', 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'next'), waitSec: num(s.waitSec, 0.6, 0, 10),
            outcome: CATCH_OUTCOMES.includes(s.outcome) ? s.outcome : 'random', winPct: num(s.winPct, 50, 0, 100),
            shakes: Math.round(num(s.shakes, 3, 1, 5)), holdSec: num(s.holdSec, 2, 0, 20),
            failMode: CATCH_FAIL_MODES.includes(s.failMode) ? s.failMode : 'self', failFile: str(s.failFile, 1000).trim(),
            failScale: num(s.failScale, 100, 30, 250), failDurSec: num(s.failDurSec, 0, 0, 60), failSound: s.failSound !== false,
            // bản thử trước có 1 ô winFile → danh sách
            winFiles: (Array.isArray(s.winFiles) ? s.winFiles : s.winFile ? [s.winFile] : s.winFiles === undefined ? CATCH_WIN_SAMPLES : [])
                .map(f => catchWinFile(str(f, 1000).trim())).concat(Number(s.winSeedV) >= CATCH_WIN_SEED_V ? [] : CATCH_WIN_SAMPLES)
                .filter(Boolean).filter((f, k, a) => a.indexOf(f) === k).slice(0, CATCH_MAX_WIN),
            winSeedV: CATCH_WIN_SEED_V,
            winSound: s.winSound !== false, winAudio: str(s.winAudio, 1000).trim(), winAudioVol: num(s.winAudioVol, 100, 0, 100),
            failAudio: str(s.failAudio, 1000).trim(), failAudioVol: num(s.failAudioVol, 100, 0, 100),
            ballFile: str(s.ballFile, 1000).trim(), ballSize: num(s.ballSize, 100, 40, 250), sfx: s.sfx !== false, ...col,
            showText: s.showText !== false, npcName: str(s.npcName, 40).trim(),
            textWait: s.textWait == null ? CATCH_TEXT.textWait : str(s.textWait, CATCH_TEXT_MAX), textWin: s.textWin == null ? CATCH_TEXT.textWin : str(s.textWin, CATCH_TEXT_MAX),
            textFail: s.textFail == null ? CATCH_TEXT.textFail : str(s.textFail, CATCH_TEXT_MAX), textColor2: hexColor(s.textColor2, CATCH_TEXT.textColor2),
            ...snd(s), timing: t };
    }
    function catchMs(entry) {
        const sc = normalizeCatch(entry, 0), T = sc.timing;
        const base = sc.waitSec * 1000 + T.throwMs + T.bounceMs + 120 + T.openMs + T.suckMs + T.closeMs + T.fallMs + 350 + sc.shakes * (T.shakeMs + T.shakeGapMs);
        return Math.round(base + 1200 + sc.holdSec * 1000 + T.releaseMs + 350);
    }

    // ---------- ✨ Biến Hình (fx-morph.mjs) - vẽ bằng mã, không cần video (ý tưởng từ 6 clip user gửi 2026-10-28) ----------
    // style  'ice'   🧊 Đóng băng - băng bò từ chân lên, người hoá tượng băng xanh, nứt rồi VỠ VỤN thành mảnh kính rơi đầy sàn → mọc lại
    //        'pixel' 👾 Vỡ điểm ảnh - người thô dần thành khối vuông, đổ sụp xuống sàn như gạch → khối bay ngược lên ghép lại
    //        'zap'   ⚡ Sét đánh - mây dông phủ đỉnh khung, sét giáng 1 + power lần (nhịp đo từ clip): chớp trắng + lộ XƯƠNG kiểu X-quang (theo dáng thật -
    //                MediaPipe Pose) + 2 mắt đỏ lồi ra → sấm xong 2 con mắt RỚT xuống sàn lăn lóc → cháy đen, bốc khói
    //        'vacuum' 🌀 Ống hút người - ống gân nhỏ (ống hút khói) thả xuống trên đầu → hút: người THU NHỎ dần, bay lên tuột vào ống →
    //                ống RÚT LÊN mang người đi → chờ waitSec giây → ống hạ xuống một chút → thả người rơi ra, lớn lại cỡ thật → ống rút
    //                (user 2026-10-28: clip 1 là ống hút, KHÔNG phải lốp xe; thứ tự + "ống bé lại, người bé lại" theo user)
    //        'slap'  🖐 Tát bay - handFile: ảnh bàn tay riêng của streamer (user 2026-10-28 muốn tự vẽ) - khung dọc ~3:4 (vd 960×1320), nền trong
    //                suốt, lòng bàn tay hướng camera, ngón chỉ LÊN, ngón cái chìa sang TRÁI (app lật gương khi tát sang trái, xoay ~10°, cao ≈ 26 % khung)
    //        'bees'  🐝 Ong vỡ tổ - tổ ong rơi trúng đầu bật xuống sàn → đàn ong bu lên người (đậu theo dáng), NPC vung tay / lắc đầu
    //                xua thì ong gần đó tản ra rồi bu lại → hết lượt bay đi
    //        'fly'   🐉 Bay chưởng (user 2026-10-28, fx-morph-fly.mjs) - cảnh 3 lớp: trời / mây / núi / cây SAU · NPC GIỮA · dãy toà nhà TRƯỚC
    //                che 1/3 dưới khung. NPC thu nhỏ nấp sau toà nhà → hào quang loé → bay vụt lên kiểu Songoku → ra đòn act:
    //                'beam' chưởng thẳng vào màn hình · 'dive' lao vào màn, dính bẹp lên kính nứt · 'fight' đánh nhau với bản sao bóng tối,
    //                đá văng nó vào núi · 'random' (mặc định) mỗi lượt bốc một kiểu → hạ xuống, lớn lại chỗ cũ. color = màu hào quang.
    // durSec = độ dài CẢ lượt (⚡ / 🐝), mỗi kiểu có tối thiểu riêng · waitSec (🧊 giữ tượng băng / 👾 nằm vụn / 🌀 nằm trong ống) quyết định độ dài 3 kiểu kia. power 1–3 = nhiều mảnh / khối / ong / tia sét hơn.
    // color = màu băng (🧊) / màu tia sét (⚡).
    const SLAP_HAND_FILE = VIDFX_SAMPLE_DIR + 'ban-tay.png';     // 🖐 bàn tay giao kèm (ảnh user gửi 2026-10-28, PNG trong suốt 852×1100, list/camgames/body)     // anh ban tay giao kem (user ve 2026-10-28, list/camgames/body); cau hinh chua co truong handFile -> nhan mac dinh
    // 🖐 bộ ảnh bàn tay NHIỀU GÓC (user gửi 2026-10-28, WebP trong suốt cao 720, ngón chỉ LÊN, tay đi theo +x của ảnh) - dùng khi
    // handFile = bàn tay giao kèm; ảnh riêng của streamer thì vẫn MỘT ảnh. Mỗi cú tát đổi ảnh theo pha: lao tới → nhanh nhất → chạm.
    // a = tâm lòng bàn tay (tỷ lệ khung ảnh), k = hệ số cỡ cho bằng ban-tay.png, blur = ảnh đã nhoè sẵn (không vẽ thêm bóng mờ)
    const SLAP_HAND_SET = {
        nghieng: { file: VIDFX_SAMPLE_DIR + 'tay-nghieng.webp', k: 1.1, a: [0.81, 0.47] },             // cạnh bàn tay, cẳng tay từ dưới trái - lúc lao tới (ngang)
        luot: { file: VIDFX_SAMPLE_DIR + 'tay-luot.webp', k: 1.15, a: [0.51, 0.55], blur: true },      // lướt ngang nhoè - nhanh nhất (ngang)
        nhoe: { file: VIDFX_SAMPLE_DIR + 'tay-nhoe.webp', k: 1.05, a: [0.54, 0.58], blur: true },      // lòng bàn tay nhoè - nhanh nhất (dọc / chéo)
        camera: { file: VIDFX_SAMPLE_DIR + 'tay-camera.webp', k: 1, a: [0.5, 0.64] },                  // lòng bàn tay - lúc chạm + đi tiếp
        mu: { file: VIDFX_SAMPLE_DIR + 'tay-mu.webp', k: 1, a: [0.45, 0.58] },                         // mu bàn tay - cú tát ngược lại
    };
    // ảnh cần nạp sẵn cho một game ✨ (overlay.html syncMedia)
    function morphMediaFiles(sc) {
        if (!sc || sc.style !== 'slap' || !sc.handFile) return [];
        return sc.handFile === SLAP_HAND_FILE ? [SLAP_HAND_FILE, ...Object.values(SLAP_HAND_SET).map(h => h.file)] : [sc.handFile];
    }
    // đợt 4 (user 2026-10-28 chọn từ gợi ý): 👻 ghost · 🪞 clone · 🫠 melt · 🎈 balloon · 📱 phone · 🎨 anime - vẽ ở fx-morph-more.mjs
    const MORPH_STYLES = ['ice', 'pixel', 'zap', 'vacuum', 'bees', 'slap', 'fly', 'ghost', 'clone', 'melt', 'balloon', 'lipo', 'phone', 'anime'];
    const MORPH_NAMES = { ice: 'Đóng băng', pixel: 'Vỡ điểm ảnh', zap: 'Sét đánh', vacuum: 'Ống hút người', bees: 'Ong vỡ tổ', slap: 'Tát bay', fly: 'Son Goku',
        ghost: 'Hồn lìa khỏi xác', clone: 'Phân thân', melt: 'Tan chảy', balloon: 'Thổi phồng', lipo: 'Hút mỡ', phone: 'Hút vào điện thoại', anime: 'Biến hoạt hình' };
    const MORPH_DUR = { ice: 6.5, pixel: 6.5, zap: 6, vacuum: 6.5, bees: 8, slap: 4.5, fly: 10, ghost: 7, clone: 8, melt: 7, balloon: 7.5, lipo: 8, phone: 8, anime: 7 };
    const MORPH_MIN = { ice: 5.2, pixel: 5.1, zap: 3.5, vacuum: 5.2, bees: 4, slap: 3, fly: 8, ghost: 5, clone: 4, melt: 5, balloon: 6.5, lipo: 6, phone: 6, anime: 4 };
    const MORPH_COLOR = { ice: '#6cc0ff', zap: '#b8dcff', pixel: '#ffffff', vacuum: '#ffffff', bees: '#ffc21a', slap: '#ffffff', fly: '#ffd23a',
        ghost: '#7fe8ff', clone: '#ff5ad1', melt: '#ffffff', balloon: '#ff3d6e', lipo: '#ffc93c', phone: '#fe2c55', anime: '#ffffff' };
    // bản thử đầu tiên (chưa phát hành) gọi Ống hút là 'tires'
    const morphStyle = v => (v === 'tires' ? 'vacuum' : MORPH_STYLES.includes(v) ? v : 'ice');
    // 🐉 kiểu ra đòn: random = mỗi lượt bốc một (không lặp lượt trước)
    const FLY_ACTS = ['random', 'beam', 'dive', 'fight'];
    const flyAct = v => (FLY_ACTS.includes(v) ? v : 'random');
    // 🎵 nhạc Son Goku giao kèm (user 2026-10-28, list/camgames/body): mặc định của game mới; game đã có trên máy nhận MỘT lần (cờ musV),
    // user bỏ mp3 sau đó thì không gắn lại
    const FLY_MUSIC = '/games/body/samples/son-goku.mp3', FLY_MUSIC_V = 1;
    function makeMorph(over = {}) {
        const style = morphStyle(over.style);
        return { id: rid('mo'), name: MORPH_NAMES[style], profileId: '', gifts: [], queueMode: 'next', durSec: MORPH_DUR[style], power: 2, waitSec: 2, handFile: style === 'slap' && SLAP_HAND_FILE ? SLAP_HAND_FILE : '',
            color: MORPH_COLOR[style], shake: true, sfx: true, ...sndFor('morph'), ...(style === 'fly' ? { act: 'random', sfxFile: FLY_MUSIC, musV: FLY_MUSIC_V, sfxMix: true } : {}), ...over, style };
    }
    function normalizeMorph(x, i) {
        const s = obj(x), style = morphStyle(s.style), old = s.style === 'tires' && /lốp xe/i.test(String(s.name || ''));
        // tên mẫu cũ của kiểu fly ("🐉 Bay chưởng", bản thử trong ngày) → "Son Goku"; tên user tự đặt giữ nguyên
        const oldFly = style === 'fly' && /^🐉?\s*Bay chưởng$/.test(String(s.name || '').trim());
        return { id: str(s.id || ('mo' + (i + 1)), 24), name: old ? '🌀 ' + MORPH_NAMES.vacuum : oldFly ? MORPH_NAMES.fly : str(s.name || MORPH_NAMES[style], 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'next'), style, durSec: num(s.durSec, MORPH_DUR[style], MORPH_MIN[style], 30),
            power: Math.round(num(s.power, 2, 1, 3)), color: hexColor(s.color, MORPH_COLOR[style]), shake: s.shake !== false, sfx: s.sfx !== false,
            waitSec: num(s.waitSec, 2, 0, 20),
            handFile: s.handFile == null ? (style === 'slap' && SLAP_HAND_FILE ? SLAP_HAND_FILE : '') : str(s.handFile, 1000).trim(),       // 🖐 ảnh bàn tay riêng (PNG trong suốt, lòng bàn tay hướng cam, ngón chỉ lên, ngón cái bên trái) - trống = tay vẽ mã
            ...snd(s), ...(style === 'fly' ? flyMusic(s) : {}) };
    }
    function flyMusic(s) {
        const had = Number(s.musV) >= FLY_MUSIC_V, file = str(s.sfxFile, 1000).trim();
        return { act: flyAct(s.act), sfxFile: had ? file : file || FLY_MUSIC, musV: FLY_MUSIC_V };
    }
    // 5 game mẫu (một mỗi kiểu): id CỐ ĐỊNH mot_<kiểu>, Mọi NPC, chưa gắn quà.
    const MORPH_ICON = { ice: '🧊', pixel: '👾', zap: '⚡', vacuum: '🌀', bees: '🐝', slap: '🖐', fly: '', ghost: '👻', clone: '🪞', melt: '🫠', balloon: '🎈', lipo: '💉', phone: '📱', anime: '🎨' };      // Son Goku: user chốt 2026-10-28 KHÔNG biểu tượng
    const morphLabel = st => (MORPH_ICON[st] ? MORPH_ICON[st] + ' ' : '') + MORPH_NAMES[st];
    function morphTemplates() { return MORPH_STYLES.map((st, i) => normalizeMorph(makeMorph({ id: 'mot_' + st, style: st, name: morphLabel(st) }), i)); }
    // Gieo game mẫu kiểu MỚI một lần mỗi đợt (cờ morph.tplV) cho máy đã có nhánh morph: đợt 1 = 5 kiểu đầu, đợt 2 = 🖐 Tát bay, đợt 3 = 🐉 Bay chưởng (2026-10-28).
    // Máy đã có game cùng kiểu thì bỏ; xoá mẫu rồi không hiện lại.
    const MORPH_TPL_V = 5;
    const MORPH_TPL_ADDED = { slap: 2, fly: 3, ghost: 4, clone: 4, melt: 4, balloon: 4, lipo: 5, phone: 4, anime: 4 };     // 💉 thêm sau đợt 4 → đợt 5 (máy đã nhận đợt 4 vẫn có)
    function seedMorph(list, fromV) {
        const out = list.slice(), from = Number(fromV) || 1;
        for (const t of morphTemplates()) {
            if (out.length >= MAX_SCRIPTS || (MORPH_TPL_ADDED[t.style] || 1) <= from) continue;
            if (!out.some(s => s.id === t.id || s.style === t.style)) out.push(t);
        }
        return out;
    }
    // Mốc một lượt (ms từ đầu lượt) - mô-đun vẽ + estimateMs dùng chung. end = durSec.
    function morphPlan(sc) {
        const st = MORPH_STYLES.includes(sc.style) ? sc.style : 'ice';
        const D = Math.max(MORPH_MIN[st], Number(sc.durSec) || MORPH_DUR[st]) * 1000;
        // 🧊 / 👾 / 🌀: lượt dài theo waitSec (giữ tượng băng / nằm vụn / nằm trong ống), không theo durSec
        const w = Math.max(0, Math.min(20, Number(sc.waitSec) >= 0 ? Number(sc.waitSec) : 2)) * 1000;
        if (st === 'ice') {
            // gió 0 → · băng lan freezeA → freezeB · tượng đứng w (≥ 0,6 s; 0,5 s cuối nứt rạn) · tan rã shatter · người hiện lại reform → end
            const shatter = 2300 + Math.max(600, w), reform = shatter + 1900;
            return { style: st, freezeA: 500, freezeB: 2300, crack: shatter - 500, shatter, reform, end: reform + 800 };
        }
        if (st === 'pixel') {
            // chớp glitch pixA → pixB · lưới khối → fall đổ sụp · nằm vụn w · rebuild xoáy bay về → rebuildB · mịn dần → end
            const rebuild = 2700 + Math.max(300, w);
            return { style: st, pixA: 300, pixB: 1500, fall: 1800, rebuild, rebuildB: rebuild + 1300, end: rebuild + 2600 };
        }
        if (st === 'zap') {
            // theo clip 6 (12 khung/giây): 1 + power tia, cách nhau 1,1 s · sau tia cuối 0,9 s 2 mắt tuột xuống (drop) · đen sì tới leave
            // rồi sáng lại + mây tan tới end. durSec không dùng.
            const n = 1 + Math.round(Math.max(1, Math.min(3, Number(sc.power) || 2))), strikes = Array.from({ length: n }, (_, i) => 900 + i * 1100);
            const drop = strikes[n - 1] + 900, leave = drop + 800;
            return { style: st, cloudB: 700, strikes, drop, leave, end: leave + 900 };
        }
        if (st === 'slap') {
            // 2 + power cú tát, mỗi cú 0,76 s (vung 0,22 · văng ra 0,38 · bay về 0,38); hết thì bay về (backA) đáp đất (land)
            const n = 2 + Math.round(Math.max(1, Math.min(3, Number(sc.power) || 2))), hits = Array.from({ length: n }, (_, i) => 760 + i * 760);
            const backA = hits[n - 1] + 380, land = backA + 450;
            return { style: st, hits, backA, land, end: land + 500 };
        }
        if (st === 'fly') {
            // 0→sceneB cảnh hiện (toà nhà trồi lên), NPC mờ dần ẨN HẲN (user 2026-10-28: không thu nhỏ chìm qua toà nhà) · hide→riseA hào quang
            // loé sau mái, đá vụn bay lên · riseA→riseB NPC cưỡi mây bay lên TỪ TỪ từ sau dãy nhà · actA→actB ra đòn (dài theo durSec) ·
            // backA→land hạ xuống khuất sau dãy nhà, dãy nhà hạ · land − 100 cắt về cam (chớp trắng) · →end giữ cam 0,3 s (ngắn: lúc này phải vẽ
            // lại phòng sạch, HpRoom._refill nặng ~35 ms mỗi 0,5 s → chỉ một lần, nằm dưới chớp)
            const actB = D - 1500;
            return { style: st, act: flyAct(sc.act), sceneB: 700, hide: 900, riseA: 1500, riseB: 3300, actA: 3300, actB, backA: actB, land: D - 200, end: D };
        }
        if (st === 'vacuum') {
            // drop→down ống thả xuống · down→suckB thu nhỏ + bay lên miệng ống · suckB→gone tuột vào ống · upA→upB ống rút lên ·
            // chờ waitSec · lowA→lowB ống hạ xuống một chút · spit→land người rơi ra, lớn lại · back→backB ống rút đi
            const upB = 3500, lowA = upB + w, spit = lowA + 750;
            return { style: st, drop: 300, down: 1000, suckB: 2200, gone: 2700, upA: 2800, upB, lowA, lowB: lowA + 600, spit, land: spit + 650, back: spit + 1150, backB: spit + 1750, end: spit + 1900 };
        }
        if (st === 'ghost') {
            // out→outB hồn kéo ra khỏi thân (thân gục dần) · lơ lửng lượn vòng tới back · back→snap bị hút ngược về, nhập lại loé sáng · →end thân đứng dậy
            return { style: st, out: 500, outB: 1900, back: D - 1900, snap: D - 700, end: D };
        }
        if (st === 'clone') {
            // n = 2 + 2 × power bản sao hiện lần lượt (mỗi bản 0,18 s) → nhảy theo trễ thời gian → merge→mergeB bay vào giữa nhập một
            const n = 2 + 2 * Math.round(Math.max(1, Math.min(3, Number(sc.power) || 2)));
            return { style: st, n, inA: 200, inB: 200 + n * 180 + 400, merge: D - 1300, mergeB: D - 300, end: D };
        }
        if (st === 'melt') {
            // LÝ DO tan chảy (user 2026-10-28): 0→meltA mặt trời chói hạ xuống, nhiệt kế vọt đỏ, mồ hôi · meltA→meltB chảy từ đầu xuống thành
            // vũng · nằm vũng waitSec · cool (rise − 700) mặt trời đi, trời dịu · rise→riseB mọc lên lại từ vũng · →end rung nhẹ
            const rise = 4100 + Math.max(500, w);
            return { style: st, heatB: 1200, meltA: 1500, meltB: 4100, cool: rise - 700, rise, riseB: rise + 1500, end: rise + 2000 };
        }
        if (st === 'balloon') {
            // inflA→inflB bơm phồng 4 nhịp · bay lên lơ lửng tới pop · NỔ · pop→deflB xì hơi bay vòng vèo · →flatB nằm bẹp · →reinB phồng về như cũ
            const pop = D - 3000;
            return { style: st, inflA: 300, inflB: 2300, pop, deflB: pop + 1300, flatB: pop + 1800, reinB: pop + 2700, end: D };
        }
        if (st === 'lipo') {
            // →machB máy hút mỡ lăn vào, ống cắm bụng · suckA→suckB hút: người tóp dần, má hóp (KHÔNG vẽ vạch xương - user chốt), mỡ vàng chảy qua ống
            // vào bình · giữ dáng gầy tới back · back→backB bật phồng lại (lò xo) · →end máy lăn đi
            return { style: st, machB: 800, suckA: 1000, suckB: 3800, back: D - 1300, backB: D - 450, end: D };
        }
        if (st === 'phone') {
            // →phoneB điện thoại 3D bay vào xoay · suckA→suckB NPC bị hút thu nhỏ vào màn hình · ở trong màn (LIVE mini + avatar người tặng)
            // · swipe vuốt văng ra → land đáp lại chỗ cũ · land→end điện thoại bay đi
            return { style: st, phoneB: 800, suckA: 900, suckB: 2100, swipe: D - 1900, land: D - 1000, end: D };
        }
        if (st === 'anime') {
            // →inB chớp trắng + vệt tốc độ, NPC thành nhân vật manga (viền mực, tô phẳng, chấm lưới) · trang truyện · tear→end trang xé đôi bay đi
            return { style: st, inB: 600, tear: D - 1100, end: D };
        }
        return { style: st, drop: 300, land: 750, leave: D - 1300, end: D };
    }

    // ---------- 💗 Bắn Tim (lớp phủ bám TAY: MediaPipe HandLandmarker) ----------
    // Mỗi người tặng = MỘT lượt (hàng chờ riêng, chạy song song). Tới lượt → NPC có waitSec giây để đưa tay hình trái tim; hết giờ
    // không thấy → lượt mất hiệu lực, chuyển người kế. Thấy tay (giữ ≥ HEART_HOLD_MS) → avatar tròn người tặng hiện TRÊN bàn tay
    // (tim 2 tay: trong lòng tim) + trái tim bay lên, durSec giây.
    // poses  'finger' 🫰 bắn tim 1 tay (cái chéo trỏ, 3 ngón còn lại gập) · 'hands' 🫶 tim 2 tay (2 cái chạm + 2 trỏ chạm, có lỗ giữa)
    // avatarSize % cỡ avatar so với cỡ tay · showName: tên người tặng trên avatar · hint: ô "Bắn tim cho @tên" + đếm ngược lúc chờ
    // fling 🤾 vung tay ném: avatar dính tay, tay vung đủ nhanh → avatar văng theo hướng vung, mạnh nhẹ theo tốc độ tay (fx-heart.mjs)
    // Mặc định gắn quà Heart Me (trái tim đội, 7934) · ⚡ Phát ngay - hàng chờ riêng tự xếp lượt, không giữ DANH SÁCH HIỆU ỨNG.
    const HEART_POSES = ['finger', 'hands'];
    const HEART_COLOR = '#ff4d8d';
    const HEART_GIFT = { giftId: '7934', giftName: 'Heart Me', giftImage: 'https://hpvn.media/quatiktok/7934.png' };
    const HEART_FADE_MS = 600;
    // Giữ tay ≥ ngần này mới tính (lướt tay qua không bắt nhầm). 🫰 lâu hơn: tay buông ngang hông, ngón cong tự nhiên đôi lúc giống
    // hệt 🫰 trong 1-4 khung (video mẫu 39,1 s · 46,5 s: dài nhất 0,17 s); 🫶 trong video mẫu chỉ giữ 0,4-0,7 s.
    const HEART_HOLD_MS = { finger: 600, hands: 300 };
    function makeHeart(over = {}) {
        return { id: rid('ht'), name: 'Bắn tim', profileId: '', gifts: [], queueMode: 'now', poses: HEART_POSES.slice(), waitSec: 15, durSec: 5,
            avatarSize: 100, showName: true, hint: true, fling: true, color: HEART_COLOR, ...sndFor('heart'), ...over };
    }
    function normalizeHeart(x, i) {
        const s = obj(x);
        const poses = HEART_POSES.filter(p => Array.isArray(s.poses) ? s.poses.includes(p) : true);
        return { id: str(s.id || ('ht' + (i + 1)), 24), name: str(s.name || 'Bắn tim', 60), profileId: str(s.profileId, 24), gifts: gifts(s.gifts),
            queueMode: queueModeOf(s.queueMode, 'now'), poses: poses.length ? poses : ['finger'],
            waitSec: num(s.waitSec, 15, 3, 120), durSec: num(s.durSec, 5, 1, 30), avatarSize: num(s.avatarSize, 100, 40, 250),
            showName: s.showName !== false, hint: s.hint !== false, fling: s.fling !== false, color: hexColor(s.color, HEART_COLOR), ...snd(s) };
    }
    // Nhận cử chỉ trái tim từ tay (21 điểm MediaPipe, toạ độ px: 0 cổ tay · cái 1-4 · trỏ 5-8 · giữa 9-12 · áp út 13-16 · út 17-20,
    // 4/8/12/16/20 = đầu ngón). Mọi ngưỡng tính theo cỡ tay = cổ tay → gốc ngón giữa (xa gần cam đều đúng).
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const ptsOf = h => (h && Array.isArray(h.pts) ? h.pts : Array.isArray(h) ? h : null);
    // 🫰 1 tay (finger heart kiểu Hàn: ngón cái chéo lên đầu ngón trỏ, 3 ngón còn lại nắm lại). Viết lại 2026-10-26 theo ảnh thật user
    // gửi (luật cũ trượt 40/40: tay chĩa về cam làm cổ tay → gốc ngón giữa co còn ~13 px nên mọi tỉ lệ vọt lên; luật cũ đòi ngón trỏ
    // GẬP, 🫰 thật thì trỏ gần thẳng). Cỡ tay S = max(cổ tay → gốc ngón giữa, bề ngang lòng bàn tay / 0,8) - tay chĩa về cam vẫn đúng.
    //   · đầu ngón cái chạm đốt giữa / đốt cuối / đầu ngón trỏ ≤ 0,45 S
    //   · ngón giữa NẮM (đầu ngón gần cổ tay hơn đốt giữa của nó) + áp út hoặc út nắm - tay buông lỏng ngón cong ít, đầu vẫn xa hơn
    //   · đầu ngón trỏ nhô hơn đầu ngón giữa / áp út ≥ 0,12 S (không phải nắm đấm) · đầu ngón cái vươn xa ≥ 0,9 × đầu ngón trỏ
    //   · chỗ chéo ngón cao hơn cổ tay ≥ 0,25 S (tay buông thõng / ngang hông: 0,31..1,71 - ngưỡng nằm giữa, 🫰 thật ≤ -0,58)
    // Đo: ảnh mẫu × lật gương × xoay ±20 / ±40° × 2 cỡ = 40/40 bắt; tay trong G:/test-di-bo.mp4 (mỗi 0,1 s) + khung tay buông của
    // scripts/fixtures/heart-hands-video.json = 0/86 bắt nhầm. Điểm tay thật: scripts/fixtures/heart-finger-photos.json.
    function fingerHeart(h) {
        const P = ptsOf(h);
        if (!P || P.length < 21) return null;
        const S = Math.max(dist(P[0], P[9]), dist(P[5], P[17]) / 0.8);
        if (!(S > 4)) return null;
        const w = P[0], dw = i => dist(P[i], w);
        if (Math.min(dist(P[4], P[6]), dist(P[4], P[7]), dist(P[4], P[8])) > 0.45 * S) return null;
        if (!(dw(12) < dw(10)) || !(dw(16) < dw(14) || dw(20) < dw(18))) return null;
        if (dw(8) - Math.max(dw(12), dw(16)) < 0.12 * S) return null;
        if (dw(4) < 0.9 * dw(8)) return null;
        const c = { x: (P[4].x + P[7].x + P[8].x) / 3, y: (P[4].y + P[7].y + P[8].y) / 3 };
        if ((P[4].y + P[8].y) / 2 - w.y > -0.25 * S) return null;
        // hướng "lên" của avatar: trục cổ tay → chỗ chéo ngón, nghiêng về phía trên màn hình
        const dx = c.x - w.x, dy = c.y - w.y, n = Math.hypot(dx, dy) || 1;
        const ux = dx / n * 0.4, uy = dy / n * 0.4 - 0.6, un = Math.hypot(ux, uy) || 1;
        return { pose: 'finger', x: c.x, y: c.y, size: S, up: { x: ux / un, y: uy / un } };
    }
    // 🫶 2 tay: 2 đầu ngón cái chạm nhau + 2 đầu ngón trỏ chạm nhau, trục tim (trỏ ↔ cái) đủ dài, 2 gốc ngón trỏ cách xa (có lỗ giữa -
    // không phải chắp tay; tim nhỏ ở ngực trong video mẫu chỉ ~0,93 cỡ tay), 2 bàn tay cỡ gần bằng nhau. (x, y) = tâm tim, r = bán
    // kính avatar TRONG lòng tim (như khung ảnh; mô-đun vẽ kẹp tối thiểu 44 px cho người đứng xa) - tim 2 tay hay làm ở ngực, đặt avatar trên đỉnh tim là che mặt NPC (thử 2026-10-23).
    function handsHeart(a, b) {
        const A = ptsOf(a), B = ptsOf(b);
        if (!A || !B || A.length < 21 || B.length < 21) return null;
        const sa = dist(A[0], A[9]), sb = dist(B[0], B[9]), s = (sa + sb) / 2;
        if (!(s > 4) || Math.max(sa, sb) > 1.8 * Math.min(sa, sb)) return null;
        if (dist(A[4], B[4]) > 0.55 * s || dist(A[8], B[8]) > 0.55 * s) return null;
        const T = mid(A[4], B[4]), I = mid(A[8], B[8]), axis = dist(T, I), width = dist(A[5], B[5]);
        if (axis < 0.5 * s || width < 0.6 * s) return null;
        const c = mid(T, I);
        return { pose: 'hands', x: c.x, y: c.y, size: s, r: Math.max(0.42 * Math.min(axis, width), 0.6 * s) };
    }
    // Tay đang thấy → cử chỉ tim to nhất trong các kiểu được bật (poses), hoặc null.
    function detectHeart(hands, poses) {
        const list = (Array.isArray(hands) ? hands : []).filter(h => ptsOf(h));
        const on = Array.isArray(poses) && poses.length ? poses : HEART_POSES;
        let best = null;
        const take = g => { if (g && (!best || g.size > best.size)) best = g; };
        if (on.includes('hands')) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) take(handsHeart(list[i], list[j]));
        if (best) return best;           // tim 2 tay thắng (mỗi tay lẻ có thể giống 🫰)
        if (on.includes('finger')) for (const h of list) take(fingerHeart(h));
        return best;
    }

    // ---------- 🦊 Hậu Cảnh (luật hiệu ứng = lõi HpHauCanh) ----------
    function makeItem(over = {}) { return { ...SND_DEFAULT, ...HC.makeItem(over), profileId: str(over.profileId, 24) }; }
    function normalizeItem(x, i) { const s = obj(x); return { ...HC.normalizeItem(s, i), profileId: str(s.profileId, 24), queueMode: queueModeOf(s.queueMode, 'attach'), ...snd(s) }; }
    // 📦 Hậu Cảnh mẫu GIAO KÈM: HP LIVE NPC có 🦊 Hồ ly trắng / Hồ ly đen — app này KHÔNG giao kèm (user 29/10/2026: xoá 2 game hồ ly).
    // Hậu Cảnh vẫn dùng được với video streamer tự tải lên. HC_TPL_V 3: máy đã lỡ được gieo 2 mẫu đó (nhánh thử) → gỡ MỘT lần.
    const HC_TPL_V = 3;
    const HC_TEMPLATES = [];
    const HC_REMOVED_IDS = new Set(['hct_holy', 'hct_holyden']);
    const hcTemplates = () => HC_TEMPLATES.map((t, i) => normalizeItem(makeItem(t.item), i));
    // Hậu Cảnh x (game riêng của máy) đã có mẫu giao kèm tương đương chưa (cùng tên / cùng nguồn file) - scripts/check-release-media.cjs.
    const hcSampleOf = x => HC_TEMPLATES.find(t => String(x.name || '').trim().toLowerCase() === t.item.name.toLowerCase() || (t.same && t.same.test(String(x.file || '')))) || null;
    function seedHauCanh(list, fromV) {
        const out = list.slice(), from = Number(fromV) || 0, low = s => String(s || '').trim().toLowerCase();
        HC_TEMPLATES.forEach((t, i) => {
            if (out.length >= MAX_ITEMS || t.v <= from) return;
            if (!out.some(x => x.id === t.item.id || low(x.name) === low(t.item.name) || (t.same && t.same.test(String(x.file || ''))))) out.push(normalizeItem(makeItem(t.item), i));
        });
        return out;
    }

    // 📦 BẢN MẶC ĐỊNH theo máy user (2026-10-23) đẩy sang máy đã cài - chạy MỘT lần (cờ body.defaultsV):
    //   🎵 Nhạc nền lúc game chạy: ÉP theo runModeFor cho MỌI kịch bản (kể cả đã gắn quà).
    //   Phần còn lại (thời gian Rơi Hố, hướng về Bị Đuổi, hoà màu, Khóc Lóc ⏭ / mặt / mây): CHỈ kịch bản CHƯA gắn quà -
    //   kịch bản đã gắn quà giữ nguyên như máy đó đang chỉnh. Hậu Cảnh, hồ sơ NPC, file video không đụng.
    const BODY_DEFAULTS_V = 1;
    const BODY_LOOK = { tintAmt: 0.95 };
    function applyBodyDefaults(out) {
        const free = sc => !(sc.gifts && sc.gifts.length);
        for (const sc of out.roiho.scripts) { sc.runMode = runModeFor('roiho'); if (free(sc)) sc.timing = { ...sc.timing, waitSec: ROIHO_TIMING.waitSec, fallMs: ROIHO_TIMING.fallMs, underSec: ROIHO_TIMING.underSec }; }
        for (const sc of out.biduoi.scripts) { sc.runMode = runModeFor('biduoi'); if (free(sc)) sc.returnDir = 'left'; }
        if (out.biduoi.scripts.every(free)) out.biduoi.look = { ...out.biduoi.look, ...BODY_LOOK };
        for (const sc of out.vidfx.scripts) sc.runMode = runModeFor('vidfx', sc.motion);
        for (const sc of out.cry.scripts) { sc.runMode = runModeFor('cry'); if (free(sc)) Object.assign(sc, { queueMode: 'next', face: false, cloud: false }); }
        out.defaultsV = BODY_DEFAULTS_V;
        return out;
    }
    function defaultConfig() {
        return {
            enabled: true, queueMax: 10, comboMax: 5, matte: { ...MATTE }, profiles: [],
            roiho: { bgMode: 'room', bgModeV: 2, sfxVolume: 0.7, scripts: [makeRoiHo({ id: 'ks1' })] },
            biduoi: { bgMode: 'room', bgModeV: 2, sfxVolume: 0.6, look: { ...BD.LOOK, ...BODY_LOOK }, scripts: [makeBiDuoi({ id: 'bd1' })] },
            vidfx: { bgMode: 'room', bgModeV: 2, tplV: VIDFX_TPL_V, sfxVolume: 0.7, scripts: vidFxTemplates() },
            cry: { scripts: [makeCry({ id: 'cr1' })] },
            heart: { scripts: [makeHeart({ id: 'ht1', gifts: [{ ...HEART_GIFT }] })] },
            catch: { bgMode: 'room', bgModeV: 2, sfxVolume: 0.7, scripts: [makeCatch({ id: 'bc1' })] },
            morph: { bgMode: 'room', bgModeV: 2, sfxVolume: 0.7, scripts: morphTemplates() },
            haucanh: { queueMax: 6, comboMax: 3, items: [] }
        };
    }
    function normalizeConfig(c) {
        const src = obj(c), d = defaultConfig();
        const rh = obj(src.roiho), bd = obj(src.biduoi), hc = obj(src.haucanh), vf = obj(src.vidfx), cr = obj(src.cry), ht = obj(src.heart), ca = obj(src.catch), mo = obj(src.morph);
        const profiles = uniqIds(arr(src.profiles).slice(0, MAX_PROFILES).map(normalizeProfile));
        // profileId trỏ tới hồ sơ đã xoá: giữ nguyên (panel báo ⚠, không chạy) - không tự biến thành "mọi NPC".
        const rhScripts = Array.isArray(rh.scripts) ? uniqIds(arr(rh.scripts).slice(0, MAX_SCRIPTS).map(normalizeRoiHo)) : d.roiho.scripts;
        const bdScripts = Array.isArray(bd.scripts) ? uniqIds(arr(bd.scripts).slice(0, MAX_SCRIPTS).map(normalizeBiDuoi)) : d.biduoi.scripts;
        let vfScripts = uniqIds(arr(vf.scripts).slice(0, MAX_SCRIPTS).map(normalizeVidFx));
        if (!(Number(vf.tplV) >= VIDFX_TPL_V)) vfScripts = seedVidFx(vfScripts, vf.tplV);     // bản ≤ 1.0.195 / máy chưa gieo đợt mới: thêm game mẫu một lần
        if (!(Number(vf.sndV) >= VIDFX_SND_V)) vfScripts = seedVidFxSnd(vfScripts);
        // 🦊 Hậu Cảnh mẫu giao kèm: gieo một lần (cờ tplV). KHÔNG đặt cờ trong defaultConfig (normalizeGamesConfig trộn mặc định vào
        // cấu hình cũ → máy cũ nhận cờ mà chưa được gieo) - máy mới cũng đi qua đây.
        let items = uniqIds(arr(hc.items).slice(0, MAX_ITEMS).map(normalizeItem));
        if (!(Number(hc.tplV) >= HC_TPL_V)) items = uniqIds(seedHauCanh(items.filter(x => !HC_REMOVED_IDS.has(x.id)), hc.tplV));
        const crScripts = Array.isArray(cr.scripts) ? uniqIds(arr(cr.scripts).slice(0, MAX_SCRIPTS).map(normalizeCry)) : d.cry.scripts;
        // 💗 máy cũ chưa có nhánh heart → nhận kịch bản mặc định (gắn sẵn Heart Me); xoá hết = giữ rỗng.
        const htScripts = Array.isArray(ht.scripts) ? uniqIds(arr(ht.scripts).slice(0, MAX_SCRIPTS).map(normalizeHeart)) : d.heart.scripts;
        const caScripts = Array.isArray(ca.scripts) ? uniqIds(arr(ca.scripts).slice(0, MAX_SCRIPTS).map(normalizeCatch)) : d.catch.scripts;
        // ✨ máy cũ chưa có nhánh morph → nhận 5 game mẫu (chưa gắn quà); xoá hết = giữ rỗng.
        let moScripts = Array.isArray(mo.scripts) ? uniqIds(arr(mo.scripts).slice(0, MAX_SCRIPTS).map(normalizeMorph)) : d.morph.scripts;
        if (Array.isArray(mo.scripts) && !(Number(mo.tplV) >= MORPH_TPL_V)) moScripts = uniqIds(seedMorph(moScripts, mo.tplV));
        const out = {
            ...d, ...src, enabled: src.enabled !== false,
            queueMax: num(src.queueMax, d.queueMax, 1, 30), comboMax: num(src.comboMax, d.comboMax, 1, 10),
            matte: { ...d.matte, ...obj(src.matte) }, profiles,
            roiho: { ...rh, bgMode: bgModeOf(rh), bgModeV: 2, sfxVolume: num(rh.sfxVolume, 0.7, 0, 1), scripts: rhScripts },
            biduoi: { ...bd, bgMode: bgModeOf(bd), bgModeV: 2, sfxVolume: num(bd.sfxVolume, 0.6, 0, 1),
                look: BD.normalizeLook(bd.look), scripts: bdScripts },
            vidfx: { ...vf, bgMode: bgModeOf({ bgModeV: 2, ...vf }), bgModeV: 2, tplV: VIDFX_TPL_V, sndV: VIDFX_SND_V, sfxVolume: num(vf.sfxVolume, 0.7, 0, 1), scripts: vfScripts },
            cry: { ...cr, scripts: crScripts },
            heart: { ...ht, scripts: htScripts },
            catch: { ...ca, bgMode: bgModeOf({ bgModeV: 2, ...ca }), bgModeV: 2, sfxVolume: num(ca.sfxVolume, 0.7, 0, 1), scripts: caScripts },
            morph: { ...mo, bgMode: bgModeOf({ bgModeV: 2, ...mo }), bgModeV: 2, tplV: MORPH_TPL_V, sfxVolume: num(mo.sfxVolume, 0.7, 0, 1), scripts: moScripts },
            haucanh: { ...hc, tplV: HC_TPL_V, queueMax: num(hc.queueMax, 6, 1, 30), comboMax: num(hc.comboMax, 3, 1, 10), items }
        };
        // 🎞 video mẫu giao kèm .pack.mp4 / .mp4 (bản ≤ 1.5.0) → .webm cùng tên (file mp4 đã xoá khỏi bản cài - sampleWebm).
        for (const p of out.profiles) p.idleFile = sampleWebm(p.idleFile);
        for (const sc of out.roiho.scripts) sc.bgFile = sampleWebm(sc.bgFile);
        for (const sc of out.vidfx.scripts) { sc.file = sampleWebm(sc.file); sc.bgFile = sampleWebm(sc.bgFile); }
        for (const sc of out.biduoi.scripts) for (const v of sc.videos || []) { v.file = sampleWebm(v.file); if (v.fg) v.fg = sampleWebm(v.fg); }
        out.haucanh.items = out.haucanh.items.map(it => ({ ...it, file: sampleWebm(it.file), layers: (it.layers || []).map(L => ({ ...L, file: sampleWebm(L.file) })) }));
        // chưa có cờ (cấu hình từ bản trước, hoặc máy mới) → áp bản mặc định một lần. KHÔNG đặt cờ trong defaultConfig:
        // normalizeGamesConfig trộn {...defaultConfig, ...cấu hình cũ} → máy cũ sẽ nhận cờ từ mặc định và bỏ qua bước áp.
        return Number(src.defaultsV) >= BODY_DEFAULTS_V ? out : applyBodyDefaults(out);
    }

    // ---------- hồ sơ đang dùng + chọn quà ----------
    const enabledNpcIds = groups => HC.enabledNpcIds(groups);
    function candidates(cfg, npcIds) {
        const profiles = (cfg && cfg.profiles) || [];
        const out = [];
        for (const id of npcIds || []) for (const p of profiles) if (p.groupId === id && !out.includes(p)) out.push(p);
        for (const p of profiles) if (!p.groupId && !out.includes(p)) out.push(p);
        return out;
    }
    function activeProfile(cfg, npcIds) { return candidates(cfg, npcIds)[0] || null; }
    // Thứ hạng của một kịch bản / hiệu ứng với hồ sơ đang dùng: gắn hồ sơ đầu danh sách = 0 …; mọi hồ sơ = sau cùng;
    // gắn hồ sơ KHÔNG đang dùng (NPC đó tắt / hồ sơ đã xoá) = -1 (không chạy).
    function rankOf(entry, cand) {
        if (!entry.profileId) return cand.length;
        const i = cand.findIndex(p => p.id === entry.profileId);
        return i;
    }
    function pickIn(list, cand, giftId) {
        let best = null, bestRank = Infinity;
        for (const x of list || []) {
            const r = rankOf(x, cand);
            if (r < 0 || r >= bestRank) continue;
            const gift = (x.gifts || []).find(g => String(g.giftId) === giftId);
            if (gift) { best = { entry: x, gift }; bestRank = r; }
        }
        return best;
    }
    // Quà → { haucanh: {item, gift, profile} | null, actions: [{kind, script, gift}] } - mỗi loại một kịch bản (hồ sơ cụ thể
    // thắng "mọi hồ sơ"; cùng hạng thì kịch bản trên cùng). Quà nằm ở cả Rơi Hố lẫn Bị Đuổi = 2 lượt nối nhau.
    function pickForGift(cfg, npcIds, giftId) {
        const gid = String(giftId || '');
        const out = { haucanh: null, actions: [] };
        if (!gid || !cfg) return out;
        const cand = candidates(cfg, npcIds);
        const h = pickIn(cfg.haucanh && cfg.haucanh.items, cand, gid);
        if (h) out.haucanh = { item: h.entry, gift: h.gift, profile: (h.entry.profileId && cand.find(p => p.id === h.entry.profileId)) || cand[0] || null };
        for (const kind of KINDS) {
            const a = pickIn(cfg[kind] && cfg[kind].scripts, cand, gid);
            if (a) out.actions.push({ kind, script: a.entry, gift: a.gift });
        }
        return out;
    }
    // Danh sách để thử / panel: kịch bản / hiệu ứng theo loại.
    function listOf(cfg, kind) { return kind === 'haucanh' ? (cfg.haucanh.items || []) : ((cfg[kind] && cfg[kind].scripts) || []); }

    // Thời lượng một lượt Hậu Cảnh (ms) - luật Hậu Cảnh.
    const runMs = (item, dur) => HC.runMs(item, dur);
    // Ước lượng một lượt (ms) để hàng trong DANH SÁCH giữ chỗ - trang game báo bắt đầu / xong thật, đây chỉ là phao.
    // Hậu Cảnh video chưa biết độ dài (server không đọc được file) → 15 giây.
    function estimateMs(kind, entry) {
        if (!entry) return 0;
        if (kind === 'roiho') { const T = { ...ROIHO_TIMING, ...(entry.timing || {}) }; return Math.round(T.waitSec * 1000 + T.openMs + T.fallMs + T.underSec * 1000 + T.ceilMs + T.dropMs + T.settleMs + 250); }
        if (kind === 'vidfx') { const sc = normalizeVidFx(entry, 0), L = vidFxLoop(sc), P = vidFxPlan(sc, sc.durSec > 0 ? sc.durSec * 1000 : NaN); return Math.round((P.real || P.end) + L.n * L.len); }
        if (kind === 'biduoi') { try { return Math.round(BD.plan(BD.normalizeScript(entry, 0)).endAt); } catch (_) { return 10000; } }
        if (kind === 'cry') return Math.round(normalizeCry(entry, 0).durSec * 1000 + CRY_FADE_MS);
        if (kind === 'heart') return Math.round(normalizeHeart(entry, 0).durSec * 1000 + HEART_FADE_MS);
        if (kind === 'catch') return catchMs(entry);     // lúc đã thấy tay (chờ tay: trang game báo riêng)
        if (kind === 'morph') return Math.round(morphPlan(normalizeMorph(entry, 0)).end + 200);
        const run = runMs(entry, NaN);
        return Number.isFinite(run) ? run : 15000;
    }

    return { MATTE, ROIHO_TIMING, BG_MODES, KINDS, ACTION_KINDS, FACE_KINDS, LAYER_KINDS, MAX_PROFILES, MAX_SCRIPTS, MAX_ITEMS, isVideo, defaultConfig, normalizeConfig, normalizeProfile, makeProfile,
        makeRoiHo, normalizeRoiHo, makeBiDuoi, normalizeBiDuoi, makeItem, normalizeItem,
        CRY_MOODS, CRY_STYLES, CRY_COLOR, CRY_FADE_MS, makeCry, normalizeCry,
        HEART_POSES, HEART_COLOR, HEART_GIFT, HEART_FADE_MS, HEART_HOLD_MS, makeHeart, normalizeHeart, fingerHeart,
        SLAP_HAND_FILE, SLAP_HAND_SET, morphMediaFiles, MORPH_STYLES, MORPH_TPL_V, MORPH_NAMES, MORPH_ICON, morphLabel, FLY_ACTS, FLY_MUSIC, MORPH_DUR, MORPH_MIN, MORPH_COLOR, makeMorph, normalizeMorph, morphPlan, morphTemplates,
        CATCH_OUTCOMES, CATCH_FAIL_MODES, CATCH_TIMING, CATCH_COLORS, CATCH_TEXT, CATCH_MEDIA, CATCH_WIN_SAMPLES, CATCH_WIN_SEED_V, makeCatch, normalizeCatch, handsHeart, detectHeart,
        VIDFX_MOTIONS, VIDFX_GAMES, VIDFX_LAYERS, VIDFX_PRESETS, VIDFX_EXTRA, makeVidFx, normalizeVidFx, vidFxPlan, vidFxLoop, parseHits,
        NINJA_MOVES, NINJA_FEET_MODES, NINJA_ENDS, NINJA_OUTCOMES, NINJA_SLOW, ninjaWin, parseMoves, NINJA_FEET_FILE, sampleWebm, isAlphaSample, isOpaqueSample,
        VIDFX_SAMPLE_DIR, VIDFX_SAMPLES, VIDFX_TPL_V, VIDFX_SND_V, VIDFX_TPL_ADDED, vidFxSample, isVidFxSampleFile, vidFxTemplates, HC_TPL_V, hcTemplates, hcSampleOf,
        enabledNpcIds, candidates, activeProfile, pickForGift, listOf, runMs, QUEUE_MODES, RUN_MODES, estimateMs };
});
