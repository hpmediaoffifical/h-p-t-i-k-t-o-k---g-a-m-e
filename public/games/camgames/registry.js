/* 🎥 Game Camera — danh sách game con (dùng chung cho overlay mẹ và panel trong app).
 * Thêm game camera mới: thêm 1 dòng ở đây + id vào CAM_GAME_IDS trong server.js (cùng thứ tự).
 *   overlay: trang overlay của game con — overlay mẹ nạp trong iframe phủ kín, nền trong suốt.
 *   track:   game cần nhận diện gì (chỉ để hiện cho streamer biết).
 *   note:    dòng nhắc thêm dưới thẻ (tuỳ chọn).
 *   slot:    'hands' (chơi bằng tay) | 'head' (đồ bám trên đầu/người). Chơi cùng lúc tối đa 1 game mỗi khe —
 *            cùng giá trị SLOTS trong lib/camgames.js.
 *   hotkeys: game có phím tắt toàn cục (HOTKEY_GAMES trong lib/camgames.js). Chơi 2 game cùng có phím thì chỉ game
 *            streamer bấm vào gần nhất giữ phím (camgames.hotkeyGame), game kia tạm nhả.
 *   standalone: game còn link OBS riêng từ trước (khách cũ dán sẵn trong scene). Game Camera chỉ bật/tắt nó
 *               khi chọn vào / chọn sang game khác (CAM_STANDALONE_IDS trong server.js); đang bật mà không
 *               được chọn thì thẻ báo "đang bật ở link riêng" kèm nút tắt — thanh bên không còn nút nguồn của nó.
 */
(function () {
    'use strict';
    window.HpCamGames = [
        {
            id: 'touchplay', name: 'Touch & Play', icon: '🖐',
            slot: 'hands',
            desc: 'Chạm bóng, gắp đồ ăn đưa lên miệng, làm theo tư thế. Đừng để đống vật chạm vạch.',
            track: 'Tay · miệng · cơ thể',
            overlay: '/_prototype/touchplay.html?mode=overlay'
        },
        {
            id: 'chemtraicay', name: 'Chém Trái Cây', icon: '🍉',
            slot: 'hands',
            desc: 'Vung ngón trỏ chém quả bay lên, né bom. Quà sinh quả, bom, Thần Chém, Tăng/Giảm tốc.',
            track: 'Ngón trỏ hai tay',
            overlay: '/overlay/chemtraicay'
        },
        {
            id: 'dapmuoi', name: 'Đập Muỗi', icon: '🦟',
            slot: 'hands', hotkeys: true,
            desc: 'Vỗ hai tay đập muỗi bay ngang khắp màn. Quà thả muỗi, bình xịt, vợt điện, mắc màn.',
            track: 'Hai bàn tay · cổ tay',
            overlay: '/overlay/dapmuoi'
        },
        {
            id: 'bancung', name: 'Bắn Cung', icon: '🏹',
            slot: 'head', hotkeys: true,
            desc: 'Quà bắn tên vào người thật trên camera: trúng thì người phủ đỏ, hết máu cháy đen rồi tự hồi.',
            track: 'Cơ thể · hình người',
            note: 'Vào ⚙ Cài đặt bấm ▶ BẮT ĐẦU thì mới nhận quà.',
            // cam=1: overlay luôn bám người (không cần bật ô "Bám theo NGƯỜI THẬT").
            overlay: '/overlay/bancung?cam=1',
            standalone: true
        },
        {
            id: 'level-quest', name: 'Level Quest', icon: '🎯',
            slot: 'head',
            desc: 'Thanh level kiểu Liên Quân bay trên đầu: 💎 / ❤ / 🔄 lấp đầy để lên cấp.',
            track: 'Đầu · vai',
            note: 'KPI vẫn đếm khi đang chơi game khác.',
            // cam=1: thanh bám đỉnh đầu. Không `standalone`: Level Quest không đọc enabled, link riêng luôn hiện.
            overlay: '/_prototype/level-quest.html?mode=overlay&cam=1'
        }
    ];
})();
