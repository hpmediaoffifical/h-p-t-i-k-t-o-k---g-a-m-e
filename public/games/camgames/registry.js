/* 🎥 Game Camera — danh sách game con (dùng chung cho overlay mẹ và panel trong app).
 * Thêm game camera mới: thêm 1 dòng ở đây + id vào CAM_GAME_IDS trong server.js (cùng thứ tự).
 *   overlay: trang overlay của game con — overlay mẹ nạp trong iframe phủ kín, nền trong suốt.
 *   track:   game cần nhận diện gì (chỉ để hiện cho streamer biết).
 */
(function () {
    'use strict';
    window.HpCamGames = [
        {
            id: 'touchplay', name: 'Touch & Play', icon: '🖐',
            desc: 'Chạm bóng, gắp đồ ăn đưa lên miệng, làm theo tư thế. Đừng để đống vật chạm vạch.',
            track: 'Tay · miệng · cơ thể',
            overlay: '/_prototype/touchplay.html?mode=overlay'
        },
        {
            id: 'chemtraicay', name: 'Chém Trái Cây', icon: '🍉',
            desc: 'Vung ngón trỏ chém quả bay lên, né bom. Quà sinh quả, bom, Thần Chém, Tăng/Giảm tốc.',
            track: 'Ngón trỏ hai tay',
            overlay: '/overlay/chemtraicay'
        }
    ];
})();
