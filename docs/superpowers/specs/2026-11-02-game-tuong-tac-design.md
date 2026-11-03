# 🎮 Game Tương Tác — nhóm game 3D người xem nhập vai

Ngày: 02/11/2026 · Trạng thái: GĐ1 (vỏ menu) đã làm, chưa commit/release.

## Mục tiêu

Gom các game "thế giới ảo" — người xem bình luận là vào game, tặng quà là hành động/lượt lên sóng — thành **một mục**
trong Thư viện Game, để sau này thêm nhiều game cùng kiểu mà thanh bên không dài ra. Ba game đầu:

| id | Game | Trạng thái |
|---|---|---|
| `quaivat` | 🧟 Zombie Phá Nhà | đã phát hành v1.20.0, vẫn đang làm đẹp |
| `nhatu` | ⛓️ Nhà Tù Online | đang làm (feature/creator-online) |
| `pokemon` | 🔴 Săn Pokemon (tên cũ "Săn Pokemon LIVE") | thêm 03/11; bản build từ dự án `Pokemon-main` chép vào `public/games/pokemon/` |
| `creatoronline` | 🏢 Creator Online | dự án riêng trong `CREATOR ONLINE/` (server 8090), **chưa vào app** → thẻ "🛠 Sắp ra mắt" |

## GĐ1 — chỉ là menu (đã làm)

Nguyên tắc: **không đụng file của game con.** Nhóm là vỏ ngoài giống 🎥 Game Camera nhưng nhẹ hơn: không có overlay mẹ,
không gộp config, không chen vào đường quà.

- `public/games/gametuongtac/registry.js` — `window.HpTuongTacGames` (id, tên, icon, desc, play, note, `soon`).
- `public/games/gametuongtac/gametuongtac-panel.js` — vẽ thẻ vào `#gtt-root` (dùng lại CSS `.cg-*` của Game Camera),
  ⏻ Bật/Tắt + ⚙ Cài đặt; tự chèn nút **← Game Tương Tác** vào header `#view-<id>` lúc nạp trang (không sửa HTML của game).
- `public/app.js` — `TT_CHILD_GAMES` ẩn game con khỏi Thư viện; mục ảo `gametuongtac` (virtual, `hub: true`, không có ⏻,
  dòng phụ "x/y đang bật · n sắp ra mắt") đứng ở chỗ game con đầu tiên; mở game con thì mục nhóm được tô sáng;
  lộ `window.hpGameList()` / `window.hpSetGameEnabled(id, on)` cho panel.
- `public/index.html` — `<section id="view-gametuongtac">` + 2 script (nạp TRƯỚC `app.js`).
- `public/style.css` — vài dòng `.gtt-*` ngay sau khối `.cg-*`.

Giữ nguyên: id game, route `/overlay/<id>`, `/api/<id>/*`, khoá config `qv*`/`nt*`, link OBS khách đã dán, cửa sổ game
Edge/Chrome, Khởi động nhanh (`quaivat` vẫn trong STABLE_IDS), khoá KEY theo id game con (thẻ tự hiện 🔒/⏸, KEY ẩn
hết game con thì ẩn luôn mục nhóm).

## Hướng cho người đang làm từng game

- **Zombie / Nhà Tù / Săn Pokemon:** cứ làm tiếp như cũ trong `public/games/<id>/`. Chỉ cần nhớ: header `#view-<id> .game-header .overlay-bar`
  phải còn (nút "← Game Tương Tác" chèn vào đầu thanh đó). Đổi tên/mô tả hiện trên thẻ nhóm → sửa dòng trong `registry.js`.
- **Creator Online — khi đưa vào app:** theo "Convention khi thêm game mới" trong CLAUDE.md (id đề nghị `creatoronline`,
  khoá config tiền tố `co*`, route riêng `/api/creatoronline/*`, Three.js dùng chung `public/games/quaivat/vendor/` như
  Nhà Tù thay vì CDN, server WebSocket riêng 8090 phải chuyển sang socket.io của app). Thêm vào `GAMES` trong server.js rồi
  bỏ `soon: true` ở `registry.js` → thẻ tự có ⏻ + ⚙, game tự ẩn khỏi Thư viện. Không cần sửa `app.js` phần nhóm.
- **Game tương tác mới:** 1 dòng trong `registry.js` (thứ tự = thứ tự thẻ) + các bước convention thường.

## GĐ2 — để sau (chưa làm, cần user duyệt)

- Dùng chung giữa các game nhóm: bảng quà gợi ý / cảnh báo quà trùng giữa các game đang bật (như `camgames` overlap),
  "chỉ 1 game tương tác chạy một lúc" nếu cần, cửa sổ game Edge/Chrome chung (`/api/quaivat/window/open` và
  `/api/nhatu/window/open` đang chép nhau → gom 1 hàm).
- Ảnh thẻ (art) giống Game Camera (`cg-art`).
