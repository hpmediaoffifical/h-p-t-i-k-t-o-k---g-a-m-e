# 🎥 Game Camera — chơi nhiều game cùng lúc

Ngày: 13/10/2026 · Yêu cầu user: "nghiên cứu chế độ chơi nhiều game cùng 1 lúc" → "xong Level Quest thì tự động làm nốt đến khi xong".

## 1. Mục tiêu

Streamer bật **2 game camera cùng lúc** trên **một** link OBS `/overlay/camgames`, vd. Đập Muỗi + Level Quest, hoặc Chém Trái Cây + Bắn Cung. Máy không nặng gấp đôi, 1 quà không kích 2 game ngoài ý muốn, cử chỉ không đá nhau.

Ngoài phạm vi: 3+ game cùng lúc, kéo thả vị trí từng game, phím tắt toàn cục chung (mỗi game giữ phím riêng như cũ).

## 2. Nghiên cứu (tóm tắt)

| Rào cản | Hiện trạng |
|---|---|
| CPU | Mỗi overlay con tự `new HpTracker` → N iframe = N lần giải mã JPEG + N lần MediaPipe trên cùng một luồng renderer (iframe cùng origin). Tay ~ đắt nhất (98→24ms khi bỏ tay, preview). |
| Quà | Touch & Play bắt mọi quà theo mức xu (client); Đập Muỗi mặc định `coinsPerMosquito` = mọi quà thả muỗi; Bắn Cung `freeFireEnabled` (mặc định tắt). Chỉ `camGamesApplyActive` ngăn 2 game cùng nhận. |
| Cử chỉ | Chém Trái Cây: đầu ngón trỏ là lưỡi dao, không ngưỡng tốc độ. Đập Muỗi: vỗ 2 tay. Touch & Play: chạm/chụm. → vỗ tay cũng chém quả, chạm đồ. |
| Vị trí | Bắn Cung: hàng tim bám ĐỈNH ĐẦU. Level Quest: thanh level bay TRÊN ĐẦU → chồng nhau. |
| Hub | Một `<iframe>`; `overlayStat` một ô (ai báo sau thắng). |

## 3. Thiết kế

### 3.1 Khe (slot) — luật ghép

Mỗi game con chiếm một khe: `hands` (Touch & Play, Chém Trái Cây, Đập Muỗi) · `head` (Bắn Cung, Level Quest). **Mỗi khe tối đa 1 game** → tối đa 2 game: 1 game tay + 1 game đầu/người. Không cần ma trận tương thích; thêm game mới chỉ cần khai khe.

- Registry `slot` + server `CAM_SLOTS` (cùng giá trị).
- Config `camgames`: thêm `actives: string[]` (các game đang chơi, thứ tự = thứ tự bấm). `active` giữ = `actives[0]` cho code/bản cũ đọc. Config cũ không có `actives` → `[active]`.
- POST `{active: X}` (nút "▶ Chơi riêng", panel cũ) → `actives=[X]`. POST `{actives:[…]}` → chuẩn hoá: bỏ id lạ/trùng, mỗi khe giữ game **bấm sau cùng**, rỗng → `[CAM_GAME_IDS[0]]`.
- `camGameInHub(id)` = hub bật && `actives` có id. `camGamesApplyActive(prevCam)` bật đúng các game trong `actives` (game `standalone` vẫn chỉ đổi khi chọn vào/ra).
- Logic thuần ở `lib/camgames.js` (test `tests/camgames.test.js`).

### 3.2 Một bộ nhận diện chung trong overlay mẹ

`/overlay/camgames` tạo `window.__hpCamShared` (module `public/lib/hp-cam-shared.mjs`): **một** `HpTracker`, đăng ký feed `touchplay:feed 'camgames'`, giải mã khung, `pushFrame(bmp, cameraToStage(layout,…,'camgames'))`. Server thêm matcher `camgames`.

Game con lấy tracker bằng `sharedTracker(gameId) || new HpTracker(…)` (`hp-tracking.mjs`). `HpSharedTracker` (lớp trong realm của iframe con):
- `want()` → host gộp (OR) nhu cầu của mọi game con → `tracker.want(union)`; game rời (`stop()`) thì gỡ phần của nó.
- Getter `hands/face/pose/seg` (chỉ trả phần game đó xin), `handsAt/faceAt/poseAt/segAt` **đổi sang đồng hồ của iframe** (`performance.timeOrigin` khác nhau — không đổi thì so "còn tươi" luôn đúng), `fps/aiMs/delegate/statusText`.
- `pushFrame()` đóng bitmap, không làm gì; `shared = true` → game con bỏ qua giải mã khung (`if (tracker.shared) return;` đầu hàm nhận khung). Game con vẫn vào room feed để nhận `layout/feedStatus` cho cảnh báo của nó.
- Ngoài hub (link riêng, lab trong app) không có host → `new HpTracker` như cũ.

Sửa `HpTracker.want()`: nạp model tay nếu tay được xin sau khi đã chạy; `segment` bật sau khi model body đã tạo không có mặt nạ → đóng và tạo lại model body.

### 3.3 Quà: "quà riêng trước, quà chung sau"

Chỉ áp khi hub đang chạy ≥2 game. **Quà được gán đích danh** (Bắn Cung: shield/revive/heal/shot; Chém Trái Cây: giftRules; Đập Muỗi: actions/giftRules có số > 0) → chỉ game gán nó nhận. Các nhánh **bắt mọi quà** (Đập Muỗi xu/con, Bắn Cung bắn tự do + nạp cung, Touch & Play theo mức xu) **bỏ qua** quà đã có game khác gán đích danh. Hai game cùng gán đích danh một quà → cả hai chạy (đúng ý streamer), panel cảnh báo "quà trùng".

- Server `camGiftClaims(gift)` → danh sách game đang chơi gán đích danh quà đó; gắn `camClaims` vào sự kiện `gift` phát cho overlay (Touch & Play lọc ở client).
- Level Quest đếm KPI mọi quà — không phải "hành động", không bị lọc.

### 3.4 Overlay mẹ

Mỗi game một `<iframe>` chồng nhau (khe `hands` dưới, `head` trên), nền trong suốt. Thêm/bớt game chỉ thêm/bớt iframe (mờ dần), game còn lại **không nạp lại** (giữ muỗi/điểm đang chơi).

### 3.5 Panel Game Camera

- Thẻ chưa chơi: `▶ Chơi riêng` + `＋ Chơi kèm` (title nói rõ sẽ thay game nào cùng khe). Thẻ đang chơi: `✓ Đang chơi` + `✕ Bỏ` (khi đang chơi ≥2).
- Dòng trạng thái: một chip/ game đang chơi (lần/giây, AI ms, thấy tay/người) — server giữ `overlayStat` theo từng game (`status.overlays`), `status.overlay` giữ như cũ.
- Cảnh báo quà trùng (API `GET /api/camgames/overlap`).

### 3.6 Phím tắt (user chốt 14/10/2026)

Thực tế quà chạy tự động theo quà chỉ định / xu, phím tắt chỉ phụ. Chơi 2 game cùng có phím tắt toàn cục (Bắn Cung + Đập Muỗi) thì **game streamer bấm vào gần nhất giữ phím** (`camgames.hotkeyGame`: "＋ Chơi kèm", "⚙ Cài đặt", "⌨ Nhận phím tắt"), game kia tạm nhả (server đưa cấu hình `enabled:false` cho `electron-main` → gỡ phím). Chưa bấm thì game đầu danh sách. Thẻ hiện "⌨ GIỮ PHÍM TẮT".

### 3.7 Sửa sau review độc lập (14/10/2026)

- `defaultConfig` không có `actives` (có thì config cũ `{active}` bị đè thành Touch & Play lúc khởi động) — `CamRules.DEFAULT_CONFIG`.
- Chỉ game SẼ xử lý quà mới giành quà (Bắn Cung phải bật + ▶ BẮT ĐẦU), so khớp đúng như handler (Bắn Cung / Chém Trái Cây chỉ theo id).
- Proxy đổi toạ độ bằng "contain" (một tỉ lệ + dời) — Browser Source ngang không còn lệch.
- Chất lượng tính lại khi game rời; bỏ chép mặt nạ khi không game nào cần; khoá theo từng bản tracker + gỡ khi `pagehide`; lớp trên cho chuột xuyên qua khi có game tay bên dưới; game con dùng chung không nhận khung JPEG.

## 4. Kiểm thử

- `tests/camgames.test.js`: chuẩn hoá actives (khe, trùng, rỗng, config cũ), quà gán/quà chung.
- Preview: hub 2 game → 2 iframe, `tracker.shared` ở cả hai, host chỉ 1 `HpTracker`, union want đúng; đẩy ảnh `pose.jpg` qua host → cả hai game đọc được pose; thêm/bớt game không nạp lại game kia.
- OBS thật (scene `HP Đập Muỗi TEST`, cổng 3010): AI ms 1 game vs 2 game.
- `npm test` toàn bộ.
