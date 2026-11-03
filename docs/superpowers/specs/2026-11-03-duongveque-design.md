# 🛵 Đường Về Quê — xe 2D chở cả đoàn về quê, 2 phe Cứu / Phá

Ngày: 03/11/2026 · Nhánh `tuongtac/duongveque` (worktree `.claude/worktrees/duongveque`) · chưa release.
Thuộc nhóm 🎮 Game Tương Tác (1 dòng trong `public/games/gametuongtac/registry.js`).

## Ý tưởng (user chốt trong phiên)

- Game kiểu "Tumble Truck" nhưng 2D cuộn ngang, chất Việt: xe chạy **100 km/h** về quê ăn Tết, quãng đường **6 km**.
- Bản đồ nhỏ, người nhỏ (VS 0,5 · 26 px/m), xe đứng lệch trái để vật cản / xe container / lốc xoáy **lao tới từ bên phải** thấy rõ.
- Xe chở **cả đoàn người xem**: 🚌 xe buýt (6 cửa sổ + ngồi trên nóc) hoặc 🐂 xe bò có máng gỗ (2 hàng). 🛵 xe máy vẫn chọn được.
- Bình luận **1** = phe Cứu + lên xe (ảnh đại diện ngồi trên xe) · **2** = phe Phá (xuống xe).
- **Quà tài xế** (mặc định Mũ lưỡi trai 99 xu): lên lái `dvqDriverSec` = 180 giây, người sau xếp hàng, hết giờ đổi người; **không ai chờ → người đang lái giữ nguyên**. Tự tặng thêm = cộng giờ, ×N = N lượt. Tặng lúc chờ ván vẫn nhận lái ngay.

## Luật (thuần, `public/games/duongveque/logic.js`, test `tests/duongveque-logic.test.mjs`)

- Mọi quà quy ra **mét theo xu** (`meterPerCoin` 5, tối thiểu 15 m) → quà Cứu và quà Phá cùng giá triệt tiêu nhau. Tặng ×N chạy đủ (gộp xu).
- 🛡️ Cứu: gió xuôi · đổ xăng · nitro · mũ bảo hiểm (lá chắn = số mét) · đoàn phượt · xe cứu hộ · trực thăng · lên làm tài xế.
- ⚔️ Phá: vỏ chuối · ổ gà (≤ `dodgeMax` xu thì NHẢY né được) · chó rượt · đàn vịt (HÚC dẹp được) · mưa ngập · xe container (HÚC đúng lúc giảm ½) · lốc xoáy (10 giây phe Cứu gom 30% giá lốc thì thoát).
- Quà chưa gán → phe người tặng đã chọn (bình luận 1/2, mặc định `dvqDefaultSide`) + bậc giá (`min`). Tài xế chỉ chạy khi đã gán (min = ∞).
- Xăng tụt `fuelBurn` 3 %/giây; hết xăng 10 giây không ai đổ → dắt bộ 3 m/giây. Tim cả phòng (`likePer` 300) / chia sẻ / follow cho chút xăng.
- Thắng: về tới cổng làng → Cứu. Hết giờ **hoặc bị đẩy lùi về bến xe** (quá vạch xuất phát `backFloor` 0,25 × quãng đường) → Phá. 30 giây cuối mọi quà ×2.
- Cú đẩy dài chạy theo thời gian (≤ 300 m/giây, tối đa 5 giây) để người xem kịp thấy bị đẩy tuột.
- Thua là vào thùng rác: HÚC trúng → người tặng bay vào thùng rác; Cứu thắng → top Phá vào thùng; Phá thắng → streamer vào thùng + top Phá chọn hình phạt vui (`dvqPenalties`).
- Phản bội: đang Cứu mà tặng Phá → băng rôn 🐍.
- LIVE dài: nhớ tối đa 300 người lên xe, quá 2.000 người xem thì đầu ván dọn người không còn trên xe / không lái.

## Cân bằng (đo, không đoán)

`scratchpad/dvq-soak.mjs` của phiên: 40 ván / kịch bản, 1 quà/giây, Tự lái bật.

| Kịch bản | Cứu | Phá |
|---|---|---|
| 2 phe ngang xu | 21 | 19 |
| Cứu 55% xu | 20 | 20 |
| Cứu 75% xu | 37 | 3 |
| Phá 65% xu | 4 | 36 |
| Phòng ít quà (0,25 quà/giây) | 11 | 29 → nên chọn đường **3 km** |

Hai lỗi cân bằng đã sửa nhờ đo: (1) quà Phá to bị chặn ở vạch 0 còn quà Cứu to về đích ngay → cho lùi quá vạch + bến xe = Phá thắng; (2) Tự lái né/húc quá giỏi (55%/45%) làm quà rẻ của Phá vô dụng → 30%/25%.

## Nối app

- `server.js`: `GAMES.duongveque` (khoá `dvq*`, quà gợi ý từ `data.json`), `/overlay/duongveque`, `/api/duongveque/window/open` (Edge/Chrome --app), `/api/duongveque/key` + socket `duongveque:key` (jump | ram | start), `global.__dvqApplyHotkeys`.
- `electron-main.js`: phím tắt toàn cục `dvqKeyJump/Ram/Start` (mặc định F7/F8/F9) → chơi được khi đang mở TikTok Studio.
- Panel `duongveque-panel.js` (`window.HpDuongVeQuePanel`), view `#view-duongveque`, CSS `.dvq-*`, `app.js` 1 dòng.
- Lệnh overlay qua `POST /api/games/duongveque/cmd`: `demo {on}` · `start` · `reset` · `end {winner}` · `key {action}` · `test {kind:'gift'|'like'|'share'|'follow'|'comment', action, coins, count, name, text}`.

## Thử không cần LIVE

- `/overlay/duongveque?demo=1` (người xem ảo 2 phe), bàn phím Space = nhảy, Enter = húc, S = bắt đầu.
- Chụp cảnh: `?lobby=0.3&mute=1&riders=18&warp=1&at=2600&act=driver,tornado:1000&after=2&veh=oxcart&end=pha`
  (`at` = đặt mét, `act` = quà ảo `hành_động:xu`, `end` = ép kết thúc). `?mute=1` bắt buộc khi chụp bằng Edge headless
  `--virtual-time-budget` (AudioContext giữ đồng hồ ảo → treo). Đừng `warp` lớn trong headless (mỗi tick vẽ 1 khung).
- Gỡ lỗi: `window.__dvq` (`game`, `step(giây)`, `sim(kind, opts)`, `freeze = true`).

## Còn lại

- Thử OBS Browser Source 1080×1920 + cửa sổ game thật, phím tắt Electron F7/F8 thật, một buổi LIVE thật.
- Quà gợi ý Mũ lưỡi trai (6104) trùng quà 👮 Cán Bộ của Nhà Tù — bật cả 2 game thì đổi một bên.
- Chưa thêm `duongveque` vào danh mục khoá KEY (`lib/license-features.js`) → hiện mở cho mọi KEY.
