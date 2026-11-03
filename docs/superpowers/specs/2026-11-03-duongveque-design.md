# 🛵 Đường Về Quê — xe 2D chở cả đoàn về quê, 2 phe Cứu / Phá

Ngày: 03/11/2026 · Nhánh `tuongtac/duongveque` (worktree `.claude/worktrees/duongveque`) · chưa release.
Thuộc nhóm 🎮 Game Tương Tác (1 dòng trong `public/games/gametuongtac/registry.js`).

## Ý tưởng (user chốt trong phiên)

- Game kiểu "Tumble Truck" nhưng 2D cuộn ngang, chất Việt: xe chạy **100 km/h** về quê ăn Tết, quãng đường **6 km**.
- Bản đồ nhỏ, người nhỏ (VS 0,5 · 26 px/m), xe đứng lệch trái để vật cản / xe container / lốc xoáy **lao tới từ bên phải** thấy rõ.
- Xe chở **cả đoàn người xem**: 🚌 xe buýt (6 cửa sổ + ngồi trên nóc) hoặc 🐂 xe bò có máng gỗ (2 hàng). 🛵 xe máy vẫn chọn được.
- Bình luận **1** = phe Cứu + lên xe (ảnh đại diện ngồi trên xe) · **2** = phe Phá (xuống xe).
- **Quà tài xế** (mặc định Mũ lưỡi trai 99 xu): lên lái `dvqDriverSec` = 180 giây, người sau xếp hàng, hết giờ đổi người; **không ai chờ → người đang lái giữ nguyên**. Tự tặng thêm = cộng giờ, ×N = N lượt. Tặng lúc chờ ván vẫn nhận lái ngay.

## Tuyến Cà Mau → Hà Giang · đoàn xe · dọc đường (đợt 2, 03/11)

- **Tuyến 34 tỉnh, thành sau sắp xếp 2025** (NQ 202/2025/QH15) — `public/games/duongveque/route.js`: Mũi Cà Mau → Cột cờ Lũng Cú.
  Mỗi tỉnh 1/34 quãng đường, có `old` (tỉnh cũ đã gộp, hiện trên biển chào), `landmark`, `biome` (delta · fields · city · highland ·
  coast · heritage · karst · mountain → cảnh xa / giữa / ven đường / nền trước), `lm` (công trình mốc vẽ riêng: Landmark 81, Cầu Rồng,
  Đại Nội, Vịnh Hạ Long, Hồ Gươm, Thác Bản Giốc…). Test kiểm 34 + các tỉnh cũ = đúng 63.
- **Đoàn xe**: mỗi xe `dvqSeats` 14 ghế; đầy thì nối xe sau (tối đa `dvqMaxCars` 5), đoàn càng dài cả cảnh càng thu nhỏ (zoom = 1 / (1 + 0,27 × (số xe − 1)): 1 → 0,48). Người ngồi
  thấy **đầu + vai** (ảnh đại diện làm mặt, áo màu theo người).
- **Lộ trình mỗi ván** (`game.plan`): 🍜 trạm dừng chân (40%, 30 giây, cả đoàn xuống ăn) · ⛽ trạm xăng (70%, 15 giây, đầy bình, đi vệ sinh) ·
  🚓 CSGT (70% ván có, vị trí ngẫu nhiên: thả `dvqPoliceLikes` 2.000 tim mới được đi, quà Cứu 1 xu = 10 tim, quá 45 giây nộp phạt lùi 150 m) ·
  3 tình huống đúng nơi: 🚗 kẹt xe (TP.HCM, Hà Nội) · 🚂 chắn tàu (Bắc Trung Bộ, đồng bằng Bắc Bộ) · 🐄 đàn bò (cao nguyên) · 🛞 thủng lốp
  (thả 600 tim bơm) · 🤢 say xe (đèo núi) · 📸 check-in (Hải Vân, Hạ Long, Sa Pa) · 🧧 lì xì (Cao Bằng, Hà Giang). 📞 Mẹ gọi điện dọc đường (chỉ hình).
- **Mọi điểm dừng đều dừng đồng hồ ván** và quà tặng lúc dừng **gộp thành 1 cú đẩy ròng** khi xe đi tiếp — cả hai đều do mô phỏng bắt được
  (đồng hồ chạy lúc dừng → Phá 25/40; quà dồn chạy lần lượt container/lốc xoáy → giữ xe đứng lâu). Bị đẩy vọt qua điểm dừng > 300 m → bỏ qua.
- Bảng cân bằng sau đợt 2 (lộ trình bật): ngang xu 20–20 · Cứu 55% 26–14 · Phá 65% 6–34 · Cứu 75% 38–2 · phòng ít quà 9–31 (→ đường 3 km).
- Thử: `?event=rest|gas|police|flat|train|cows|jam|carsick|photo|lixi`, panel có hàng nút "🗺️ Dọc đường".

## Quãng đường theo thời gian ván (03/11)

- `dvqGoal` 0 (mặc định) = tự theo thời gian ván: `goalFor(roundSec)` = 25 m/giây (4 phút → 6 km, 10 phút → 15 km), nên mỗi tỉnh luôn
  ~1/34 thời gian ván (10 phút ≈ 16 giây/tỉnh). Số tình huống dọc đường `roadEventsFor` 3 → 7, cờ mốc `flagEveryFor` = 12 mốc đều.
- Bị đẩy về bến xe: ván giữ thêm `depotFireSec` 9,5 giây cho bến cháy xong (lan → dữ dội → cháy đen) rồi mới hiện thẻ kết quả.
- Mô phỏng 200 ván / kịch bản, ván 10 phút tự 15 km, 7 tình huống: ngang xu 52–48 · Cứu 55% 66–34 · Phá 65% 7–93.
  Thử thật trong trình duyệt (demo 10 phút): đủ trạm dừng chân / trạm xăng / CSGT / thủng lốp, người xem ảo tự thả tim cho qua.

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

## Thử 3D (vertical slice, 03/11 — nhánh `tuongtac/duongveque-3d`)

Bật bằng `?r=3d` (bản canvas 2D vẫn mặc định). Chỉ đổi phần VẼ: `render3d.js` (Three.js r160 dùng chung `/games/quaivat/vendor/`
qua import map trong `overlay.html`); luật `logic.js` + `route.js` không đổi (40/40 test qua); HUD DOM giữ nguyên. Canvas 2D
nằm trên canvas WebGL, chỉ còn vẽ nhãn tên / bong bóng thoại / chữ nổi theo toạ độ màn hình renderer trả về (lớp xếp nhãn LBL dùng lại).

- **Camera:** phối cảnh FOV 24° đặt xa, chân trời ở y≈640, mặt đường dưới đầu xe ở (sx, 1184). Bề ngang nhìn thấy ở mặt đường
  = 41,5 m × (1 + 0,27 × (số xe − 1)) — cùng công thức thu nhỏ bản 2D, đầu xe lùi sang phải đủ chỗ cho cả đoàn. `?fov=`, `?hz=` để chỉnh thử.
- **Cảnh miệt vườn Cà Mau:** đường + vạch, sông phù sa, ao sen tiền cảnh, dừa (2 kiểu), dừa nước, chuối, bụi, nhà sàn mái lá chân cắm sông,
  xuồng ba lá người đội nón lá (trôi), cột điện, hàng cây xa trong sương, mây. Mỗi loại đồ vật = 1 InstancedMesh màu đỉnh, sinh theo ô 40 m
  bằng hash (đi lùi lại thấy đúng cảnh cũ), chỉ dựng lại khi đổi ô.
- **Xe buýt chibi** "VỀ QUÊ ĂN TẾT" (cao ×1,3, bánh to), cửa sổ là hốc sâu nên vai khách bị mép dưới che tự nhiên; xe sau có biển
  "ĐOÀN VỀ QUÊ · XE n" (1 atlas, 1 lệnh vẽ cho mọi biển); cành mai trên nóc xe đầu.
- **Hành khách:** đầu cầu, ảnh đại diện chiếu phẳng từ phía trước (rìa ô trắng thành viền như bản 2D), không chịu ánh sáng; vai màu áo theo người.
  Mọi khách + tài xế + kẻ phá = **2 lệnh vẽ** (atlas 1024×512, 128 ô 64 px, chọn ô qua thuộc tính instance `aCell`, tải lại atlas ≤ 4 lần/giây).
  Không dùng nhân vật SkinnedMesh của Nhà Tù (`nhatu/js/character.js`): ~5 nghìn tam giác + 1 lệnh vẽ + texture xương mỗi người, trong khi
  ngồi trong xe chỉ thấy đầu + vai — để dành cho người đi bộ ở trạm dừng nếu làm tiếp (nhớ `disposeCharacter`).
- **Xe ủi phe Phá:** cùng điều kiện bản 2D (đang chạy, không dừng, không container/lốc, vận tốc trên màn < −6 m/s) → trượt vào từ phải,
  lưỡi ủi tì đầu đoàn, mặt kẻ phá trong cabin, bụi + khói.
- **Chưa có ở 3D:** chó, vịt, mưa, container, lốc xoáy, trực thăng, đoàn phượt, xe cứu hộ, vật cản, cảnh trạm dừng/CSGT, 7 vùng cảnh còn lại,
  34 công trình mốc, xe bò / xe máy. An toàn: mất WebGL (`webglcontextlost`) → tự quay về 2D; bản 3D khoá ~60 khung/giây (`?cap=0` để đo).

### Số đo (03/11, Edge headless 1080×1920, `?mute=1&warp=9&riders=N`, rAF không khoá; script CDP trong scratchpad)

| | GPU RTX 4060 (ANGLE D3D11) | | | Không GPU (SwiftShader) | |
|---|---|---|---|---|---|
| Cảnh | khung/giây | lệnh vẽ · tam giác | CPU ms/khung¹ | khung/giây | CPU ms/khung¹ |
| 2D · 14 khách (1 xe) | 71 | — | 4,3 | 22 | 26,6 |
| 2D · 70 khách (5 xe) | 37 | — | 20,5 | 15 | 58,2 |
| 3D · 14 khách | **153** | 27 · 42k | 2,1 | **3,9** | 1,1 |
| 3D · 70 khách | **136** | 31 · 73k | 2,7 | ~0,1 (treo) | — |
| 3D · 70 khách, `aa=0` | 145 | 31 · 73k | 2,4 | ~0,1 | — |
| 3D · xe ủi đang đẩy | 138 | 27 · 41k | — | 2 | — |

¹ chạy 120 khung đồng bộ (luật + vẽ) chia đều — với 3D là phần CPU gửi lệnh, KHÔNG gồm thời gian GPU. Số GPU là thông lượng headless
(trình duyệt không khoá vsync), chỉ để so tương đối. Bản đầu (trước khi chỉnh theo review) là 28/33 lệnh vẽ, 64k/115k tam giác.

**Kết luận:**
- Có GPU: 3D nhẹ hơn hẳn 2D (2D tốn CPU theo số khách vì mỗi mặt là clip + drawImage; 3D gần như phẳng theo số khách nhờ instancing).
  Bản 2D với 70 khách đã chỉ còn ~37 khung/giây ngay cả trên RTX 4060 → đằng nào cũng nên tối ưu bản 2D nếu giữ.
- **Không GPU thì 3D không dùng được** (4 khung/giây). Electron của app tắt GPU → bản 3D phải chạy trong OBS Browser Source (có GPU)
  hoặc cửa sổ Edge/Chrome như Zombie Phá Nhà; cần giữ bản 2D làm dự phòng (đã có: mất WebGL → 2D).
- Chưa đo trên GPU tích hợp và trong OBS thật (render lag khi đang mã hoá) — việc phải làm trước khi quyết.
- Đọc trên điện thoại: xe, biển, xe ủi rõ hơn 2D; mặt khách 1 xe ≈ ngang 2D, **đoàn 5 xe mặt chỉ ~10–14 px** (2D cũng vậy — do thu nhỏ đã chốt).

**Khuyến nghị: làm tiếp có điều kiện.** Bước kế: (1) đo trên máy GPU tích hợp + OBS thật 1 giờ (`renderer.info.memory` phải đứng yên);
(2) nếu đạt, làm bộ đồ cảnh dùng chung đổi màu theo vùng (7 vùng còn lại) + công trình mốc bằng ảnh vẽ dán lên tấm phẳng (34 mốc dựng
low-poly ước 0,5–1 ngày/mốc — quá đắt); (3) chuyển lần lượt các hiệu ứng quà sang 3D, trong lúc đó hiệu ứng chưa chuyển vẫn vẽ 2D chồng lên.
Góp ý chưa làm: góc nhìn 3/4 (xoay xe ~0,15 rad) cho sinh động; rút xe còn 5 cửa sổ; tối ưu nữa (Basic material cho mặt phẳng lớn +
`alpha:false` vẽ trời trong WebGL, tự tắt MSAA khi gặp GPU tích hợp, `addUpdateRange`). Review đề xuất chặn thu nhỏ ở 0,65 cho mặt khách
to hơn — trái ý đã chốt "đoàn dài càng thu nhỏ", để user quyết.
Ngân sách đề xuất (GPU tích hợp, 60 khung/giây): GPU ≤ 8 ms, CPU ≤ 3 ms, ≤ 60 lệnh vẽ, ≤ 150k tam giác, texture ≤ 48 MB.

## Còn lại

- Thử OBS Browser Source 1080×1920 + cửa sổ game thật, phím tắt Electron F7/F8 thật, một buổi LIVE thật.
- Nhiều quà gợi ý trùng Nhà Tù (6104 Mũ lưỡi trai = 👮 Cán Bộ, 5269, 5509, 5585, 6267…) — mọi overlay đang mở đều nhận quà, nên LIVE chỉ mở 1 game tương tác hoặc đổi bảng gán.
- Chưa thêm `duongveque` vào danh mục khoá KEY (`lib/license-features.js`) → hiện mở cho mọi KEY (giống mọi game 🎮 Game Tương Tác khác; danh mục phải khớp trang quản trị HP KEY nên thêm cùng lúc cả nhóm).
- Bản chibi 3D góc nhìn 2.5D: thử ở nhánh riêng (`?r=3d`), chưa thay bản 2D.
