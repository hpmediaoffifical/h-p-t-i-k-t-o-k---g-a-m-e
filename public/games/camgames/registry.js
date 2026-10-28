/* 🎥 Game Camera — danh sách game con (dùng chung cho overlay mẹ và panel trong app).
 * Thêm game camera mới: thêm 1 dòng ở đây + id vào CAM_GAME_IDS trong server.js (cùng thứ tự).
 *   overlay: trang overlay của game con — overlay mẹ nạp trong iframe phủ kín, nền trong suốt.
 *   track:   game cần nhận diện gì (chỉ để hiện cho streamer biết).
 *   note:    dòng nhắc thêm dưới thẻ (tuỳ chọn).
 *   slot:    'hands' (chơi bằng tay) | 'head' (đồ bám trên đầu/người) | 'kick' (Đá Cầu) | 'body' (Bộ Tách Người). Chơi cùng lúc tối đa 1 game mỗi khe —
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
        },
        {
            id: 'dacau', name: 'Đá Cầu', icon: '🏸',
            // iconSvg: hình quả cầu ĐÁ trên thẻ (emoji 🏸 là cầu lông) — vẽ theo drawCau trong dacau/overlay.html.
            iconSvg: '<svg class="cg-ico-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="translate(37.8 49.7) rotate(72) scale(1.55)"><g transform="translate(-4.62 0)"><g transform="rotate(9.74)"><path d="M0 -0.71Q-7.04 -4.44 -19.25 -4.44Q-24.41 -3.38 -23.47 0Q-24.41 3.38 -19.25 4.44Q-7.04 4.44 0 0.71Z" fill="#3bceac" stroke="rgba(0,0,0,.22)" stroke-width=".5"/><path d="M0 0H-22.77" stroke="rgba(255,255,255,.9)" stroke-width=".8"/><path d="M-9.15 0L-7.28 -3.73M-9.15 0L-7.28 3.73M-12.44 0L-10.56 -3.73M-12.44 0L-10.56 3.73M-15.73 0L-13.85 -3.73M-15.73 0L-13.85 3.73M-19.01 0L-17.14 -3.73M-19.01 0L-17.14 3.73" stroke="rgba(0,0,0,.16)" stroke-width=".4"/></g><g transform="rotate(-9.74)"><path d="M0 -0.71Q-7.04 -4.44 -19.25 -4.44Q-24.41 -3.38 -23.47 0Q-24.41 3.38 -19.25 4.44Q-7.04 4.44 0 0.71Z" fill="#4d96ff" stroke="rgba(0,0,0,.22)" stroke-width=".5"/><path d="M0 0H-22.77" stroke="rgba(255,255,255,.9)" stroke-width=".8"/><path d="M-9.15 0L-7.28 -3.73M-9.15 0L-7.28 3.73M-12.44 0L-10.56 -3.73M-12.44 0L-10.56 3.73M-15.73 0L-13.85 -3.73M-15.73 0L-13.85 3.73M-19.01 0L-17.14 -3.73M-19.01 0L-17.14 3.73" stroke="rgba(0,0,0,.16)" stroke-width=".4"/></g><g transform="rotate(28.65)"><path d="M0 -0.84Q-7.26 -5.22 -19.84 -5.22Q-25.17 -3.97 -24.2 0Q-25.17 3.97 -19.84 5.22Q-7.26 5.22 0 0.84Z" fill="#ff5a5f" stroke="rgba(0,0,0,.22)" stroke-width=".5"/><path d="M0 0H-23.47" stroke="rgba(255,255,255,.9)" stroke-width=".8"/><path d="M-9.44 0L-7.5 -4.39M-9.44 0L-7.5 4.39M-12.83 0L-10.89 -4.39M-12.83 0L-10.89 4.39M-16.21 0L-14.28 -4.39M-16.21 0L-14.28 4.39M-19.6 0L-17.67 -4.39M-19.6 0L-17.67 4.39" stroke="rgba(0,0,0,.16)" stroke-width=".4"/></g><g transform="rotate(-28.65)"><path d="M0 -0.84Q-7.26 -5.22 -19.84 -5.22Q-25.17 -3.97 -24.2 0Q-25.17 3.97 -19.84 5.22Q-7.26 5.22 0 0.84Z" fill="#ffd23f" stroke="rgba(0,0,0,.22)" stroke-width=".5"/><path d="M0 0H-23.47" stroke="rgba(255,255,255,.9)" stroke-width=".8"/><path d="M-9.44 0L-7.5 -4.39M-9.44 0L-7.5 4.39M-12.83 0L-10.89 -4.39M-12.83 0L-10.89 4.39M-16.21 0L-14.28 -4.39M-16.21 0L-14.28 4.39M-19.6 0L-17.67 -4.39M-19.6 0L-17.67 4.39" stroke="rgba(0,0,0,.16)" stroke-width=".4"/></g></g><rect x="-5.5" y="-1.54" width="4.62" height="3.08" rx=".6" fill="#f0f4ff" stroke="rgba(0,0,0,.28)" stroke-width=".5"/><rect x="-1.76" y="-7.15" width="2.07" height="14.3" rx=".4" fill="#2d2f3a"/><rect x="0.11" y="-7.15" width="2.07" height="14.3" rx=".4" fill="#f2f2f5"/><rect x="1.98" y="-7.15" width="2.07" height="14.3" rx=".4" fill="#2d2f3a"/><rect x="3.85" y="-7.15" width="2.07" height="14.3" rx=".4" fill="#e53950"/><path d="M5.72 -7.15A1.1 7.15 0 0 1 5.72 7.15Z" fill="#e53950"/><rect x="-1.76" y="-7.15" width="7.48" height="14.3" rx=".4" fill="none" stroke="rgba(0,0,0,.4)" stroke-width=".6"/></g></svg>',
            slot: 'kick',
            desc: 'Quà tung cầu lên, đỡ bằng đầu hoặc đùi; rơi qua vạch sàn là mất chuỗi.',
            track: 'Đầu · hông · đầu gối',
            note: 'Camera cần thấy tới đầu gối, thiếu thì chỉ đỡ bằng đầu.',
            overlay: '/overlay/dacau'
        },
        {
            id: 'body', name: 'Bộ Tách Người', icon: '🧍',
            slot: 'body',
            desc: 'Tách nền người rồi vẽ lại theo quà: hậu cảnh, rơi hố, bị đuổi, video hành động, khóc lóc, bắn tim, bắt NPC, biến hình.',
            track: 'Hình người (tách nền) · mặt · tay',
            note: 'Đặt link Game Camera ngay trên nguồn camera trong OBS.',
            overlay: '/overlay/body'
        }
    ];
})();
