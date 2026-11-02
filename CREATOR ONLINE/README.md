# Creator Online

Tòa nhà LIVE chibi 3D chạy trên trình duyệt, phát triển từ **Nhà Tù Online**: 25 phòng phát trực tiếp — **5 sân khấu nhóm** VITAMIN B, VENUS STAR, LOLLIPOP, BONITA GIRL, BLACKSWAN (5–9 thành viên: Idol, MC, Kỹ thuật, Quản lý), **10 phòng LIVE đứng**, **5 phòng ngồi hát**, **5 phòng game**. Đi tới phòng nào nghe nhạc phòng đó; thả tim, tặng quà để chọn thể loại, nhận vai, mở PK và chơi mini game.

Bản ý tưởng đầy đủ: [docs/Y-TUONG-CREATOR-ONLINE.md](docs/Y-TUONG-CREATOR-ONLINE.md). Logo: [docs/logo/logo-concepts.html](docs/logo/logo-concepts.html). Danh sách nhạc nền cần thêm: [assets/audio/DANH-SACH-NHAC.md](assets/audio/DANH-SACH-NHAC.md).

## Cách chạy

Cần Node.js 18 trở lên và Internet (tải Three.js và font từ CDN).

- **Windows:** nhấp đúp `Choi-game.bat`.
- **Dòng lệnh:** `npm start` rồi mở `http://localhost:8090`. Server in ra địa chỉ LAN để bạn bè cùng mạng vào chơi chung.
- Unit test: `npm test`.

## Điều khiển

| Phím | Tác dụng |
|---|---|
| WASD / mũi tên, Shift, Space | Đi, chạy, nhảy |
| E | Tương tác: xem phòng, vai trò (MC trả lời bình luận, mở bàn kỹ thuật, bảng quản lý, idol bật nhảy), quay thưởng, tủ đồ, ngồi, bắt chuyện |
| H | Thả tim cho phòng đang xem |
| G / T / R / M | Quà / Thể loại / Vai trò (phòng nhóm) / Mini game |
| F | Bắt nhịp khi làm Idol |
| L | Danh sách 25 phòng |
| Enter | Chat — đứng ở phòng nào thì thành bình luận trên màn hình phòng đó |
| Kéo / lăn chuột | Xoay, thu phóng camera; kéo xa để nhìn toàn tòa nhà từ trên cao |

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `assets/data/game-config.json` | Phòng nhóm, thể loại + mô tả nhạc, quà, vai trò, giá, màu đèn, vòng quay, cửa hàng, tên NPC, câu thoại, câu đố, giai điệu đoán bài |
| `assets/audio/` | Thả file nhạc nền vào đây |
| `src/web/js/world.js` | Dựng tòa nhà: sân khấu, truss, đèn moving-head, màn LED, TV, phòng đứng/hát/game, sảnh |
| `src/web/js/screens.js` | Vẽ mọi màn hình: biển neon, LED, bảng bình luận, máy tính, karaoke, game, vòng quay, bảng xếp hạng |
| `src/web/js/audio.js` | Kênh nhạc theo phòng (âm lượng, nghẹt sau kính, trái/phải), nhạc tổng hợp 20 phong cách, hiệu ứng âm thanh |
| `src/web/js/npc.js` | Streamer, thành viên nhóm theo vai, fan NPC đi xem các phòng |
| `src/web/js/character.js` | Nhân vật chibi, trang phục, đạo cụ (mic, lightstick, tai nghe, bảng kẹp), vũ đạo |
| `src/web/js/effects.js` | Tim/quà bay, pháo giấy, khói, laser |
| `src/web/js/main.js` | Điều khiển, camera, tương tác, quà, vai trò, PK, mini game, HUD, mạng |
| `src/web/js/logic/` | Logic thuần có unit test: phòng, PK, nhịp, hồ sơ, va chạm |
| `server/server.mjs` | Server tĩnh + WebSocket tự viết, giữ trạng thái phòng dùng chung |
