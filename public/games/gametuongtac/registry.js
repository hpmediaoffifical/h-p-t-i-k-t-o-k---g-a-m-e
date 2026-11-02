/* 🎮 Game Tương Tác — nhóm game 3D/thế giới ảo cho người xem "nhập vai" vào LIVE (bình luận = vào game,
 * quà = hành động / lượt lên sóng). Thư viện Game chỉ hiện 1 mục "🎮 Game Tương Tác"; game con mở từ menu nhóm.
 *
 * Nhóm CHỈ là vỏ menu: không có overlay mẹ, không gộp config, không đụng engine. Mỗi game con giữ nguyên
 * id, route /overlay/<id>, view-<id>, panel, khoá config riêng (qv* / nt* …) và link OBS cũ của khách.
 *
 * Thêm game tương tác mới: 1 dòng ở đây (thứ tự = thứ tự thẻ). Game đã vào app (có trong GAMES của server.js)
 * thì tự ẩn khỏi Thư viện Game, thẻ có ⏻ + ⚙ Cài đặt; game chưa vào app thì để `soon: true` (thẻ "Sắp ra mắt").
 *   id:    id game trong GAMES (server.js) — trùng id thì thẻ đọc enabled/khoá KEY của game đó.
 *   desc:  mô tả ngắn trên thẻ.
 *   play:  người xem tham gia thế nào (hiện dưới thẻ).
 *   note:  dòng nhắc thêm (tuỳ chọn).
 *   soon:  true = đang phát triển ngoài app, chưa mở được (thẻ mờ, không có nút).
 */
(function () {
    'use strict';
    window.HpTuongTacGames = [
        {
            id: 'quaivat', name: 'Zombie Phá Nhà', icon: '🧟',
            desc: 'Streamer làm zombie đi phá cửa nhà; người xem tặng quà gài bẫy, ném đồ, gọi đồng minh để chặn.',
            play: 'Quà · thả tim · bình luận từ khoá',
            note: 'OBS bắt cửa sổ game (🎮 Mở cửa sổ game trong ⚙ Cài đặt).'
        },
        {
            id: 'nhatu', name: 'Nhà Tù Online', icon: '⛓️',
            desc: 'Trại giam 3D chibi: bình luận là vào trại, quà được lên sóng và ra lệnh. Có chế độ Tự chơi treo máy.',
            play: 'Bình luận · thả tim · quà = lượt lên sóng'
        },
        {
            id: 'pokemon', name: 'Săn Pokemon', icon: '🔴',
            desc: 'Người xem vào ghế, tặng quà nhận bóng, gõ 1-9 chọn Pokemon để ném. Bảng xếp hạng tuần, nhiệm vụ ngày, MC AI.',
            play: 'Thả tim / gõ 111 vào ghế · quà = bóng · gõ 1-9 ném',
            note: 'Bảng quà có link OBS riêng (trong ⚙ Cài đặt).'
        },
        {
            id: 'creatoronline', name: 'Creator Online', icon: '🏢',
            desc: 'Tòa nhà LIVE chibi 3D 25 phòng: người xem là fan của 5 nhóm nhảy, quà bất kỳ được lên sân khấu, vé có phòng mang tên, vai MC/Kỹ thuật/Quản lý, PK giữa các nhóm.',
            play: 'Gõ 1–5 chọn nhóm · quà = lên sân khấu / phòng / vai · PK',
            note: 'Camera tự đạo diễn; chỉ dùng Browser Source HOẶC cửa sổ game, không dùng cả hai.'
        }
    ];
})();
