# 🕹️ Gắp Thú + 🎲 Xúc Xắc 3D — thiết kế

Ngày 12/11/2026. Hai game quà **riêng** (user chọn), mỗi game 1 link OBS, 1 panel, 1 cấu hình. User giao "tự quyết đến khi xong" → các chi tiết dưới đây do Claude chốt.

## 1. Mục tiêu

- Người xem tặng quà → overlay chạy 1 **lượt** vui ngắn (2–5 giây), hiện tên + ảnh người tặng và kết quả.
- Streamer đặt luật thưởng (Gắp Thú: danh sách giải + tỉ lệ; Xúc Xắc: bảng kết quả theo tổng điểm) rồi làm theo kết quả trên màn.
- Kết quả **do server quyết** → OBS, khung xem thử, panel cùng thấy một kết quả (không mỗi màn tự quay một số).

Ngoài phạm vi: điểm/xếp hạng người chơi, âm nhạc nền, gắp nhiều người cùng lúc, nhập vào 🎥 Game Camera / 🎮 Game Tương Tác.

## 2. Luồng chung

```
TikTok gift → emitGift() → handleGapThuGift / handleXucXacGift
   → GiftTurns.turnsForGift(cfg, gift)            (bao nhiêu lượt)
   → queue.push(lượt…)                            (hàng chờ, có trần)
runner (setTimeout trên server) mỗi lượt:
   → tính kết quả (lib/gapthu.js | lib/xucxac.js, rng = Math.random)
   → io.to('overlay').to('preview').emit('<id>:turn', {...kết quả, ms})
   → io.to('preview').emit('<id>:state', {queue, history})
overlay chỉ diễn hoạt cảnh theo kết quả nhận được, trong đúng `ms`.
```

### 2.1 Lượt theo quà (`lib/gift-turns.js`, dùng chung, có test)

- `cfg.gifts = [{ giftId, giftName, giftImage, turns, sure? }]` — quà gán đích danh (so **id**, như các game mới).
- `cfg.anyGift` (mặc định **bật**): quà không có trong danh sách vẫn = 1 lượt. Tắt → chỉ quà đã gán mới chơi.
- Combo ×N: lượt = `turns × N`, chặn trần `maxPerGift` = 10 lượt / lần tặng.
- Hàng chờ tối đa `queueMax` = 30 lượt; tràn thì bỏ phần dư (log), không chặn quà game khác.
- **Nhịp nhanh** (`turnMs(baseSec, queueLen)`): lượt chuẩn `turnSec` (mặc định 4 s, cho chọn 3–5). Hàng chờ ≥ 5 → ×0.75, ≥ 12 → ×0.55; không bao giờ dưới 2 s.
- Runner nghỉ 250 ms giữa hai lượt để hoạt cảnh kịp về chỗ.

### 2.2 Bật/tắt, thử, điều khiển

- `cfg.enabled === false` → bỏ qua quà thật (vẫn cho ▶ Thử).
- `POST /api/<id>/test {giftId?}` — thêm 1 lượt "Thử nghiệm" (đi đúng runner).
- `POST /api/<id>/control {cmd: 'clear'}` — xoá hàng chờ; Gắp Thú thêm `'resetPity'`.
- `GET /api/<id>/state` — `{ queue, history, current }` cho panel.
- Route tránh `/api/games/:id/*` (đã giữ chỗ). Config qua `/api/games/<id>/config` chung.

## 3. 🕹️ Gắp Thú (`gapthu`)

### 3.1 Luật (`lib/gapthu.js`)

- `prizes = [{ id, name, icon, weight }]` (icon = emoji hoặc ký tự ngắn; weight ≥ 0). Mặc định 6 giải vui: 🧸 Gấu bông, 🎤 Hát 1 câu, 💪 Hít đất 10 cái, 💃 Nhảy 15 giây, 📢 Gọi tên cảm ơn, 🍀 Chúc may mắn.
- `winRate` (%) = xác suất gắp trúng mỗi lượt, mặc định **35 %**.
- **Bảo hiểm** `pity` (mặc định 5): trượt liên tiếp đủ số này thì lượt sau chắc trúng (0 = tắt). Đếm chung cả phòng, `resetPity` đặt lại.
- Quà gán `sure: true` → lượt của quà đó **chắc trúng** (quà to).
- `rollGrab(cfg, { sure, misses }, rng)` → `{ win, prize, clawX, slipAt, pityHit }`
  - `clawX` 0.12–0.88: vị trí ngang máy gắp hạ xuống (cùng giá trị cho mọi màn).
  - trượt: `slipAt` 0.25–0.75 = phần đường kéo lên thì thú tuột.
  - trúng: chọn giải theo trọng số `pickPrize(prizes, rng)`; tất cả weight = 0 → coi như trượt (không có giải để phát).

### 3.2 Overlay `/overlay/gapthu` (Canvas 2D, 1080×1920 trong suốt)

- Một tủ gắp (khung bo tròn, kính, đèn viền nhấp nháy, cửa nhả quà góc trái dưới) vẽ bằng canvas, đống thú/giải ở đáy = icon các giải.
- Hoạt cảnh 1 lượt chia theo `ms`: chạy ngang tới `clawX` 22 % → hạ 20 % → khép càng 8 % → kéo lên 20 % → (trúng) chở về cửa nhả 15 % / (trượt) tuột tại `slipAt` rơi lại → thẻ kết quả phần còn lại.
- Thẻ kết quả trên tủ: ảnh + tên người tặng, "gắp được 🧸 Gấu bông" hoặc "trượt rồi 😝 (còn N lượt nữa là chắc trúng)".
- Dải hàng chờ nhỏ dưới tủ: "⏳ còn N lượt".
- `display`: `x`, `y` (% tâm tủ), `scale` (%), `theme` `pink|mint|night`, `showQueue`.
- `?review=1` (khung xem thử, phòng preview), `?demo=1` (tự sinh lượt giả mỗi 4 s để xem không cần server/quà), `?mute=1`.

## 4. 🎲 Xúc Xắc 3D (`xucxac`)

### 4.1 Luật (`lib/xucxac.js`)

- `dice` = 1–3 viên (mặc định 1).
- `outcomes = [{ from, to, text }]` theo **tổng điểm**; mặc định cho 1 viên: 1 "Hít đất 10 cái", 2 "Hát 1 câu", 3 "Uống 1 ngụm nước", 4 "Nhảy 10 giây", 5 "Cảm ơn tên người tặng", 6 "🎉 Streamer làm theo yêu cầu". Panel có nút "Bảng mặc định" sinh bảng theo số viên (2 viên: 2–4 / 5–6 / 7 / 8–9 / 10–12; 3 viên: 3–7 / 8–10 / 11 / 12–14 / 15–18).
- `rollDice(n, rng)` → mảng 1–6. `outcomeFor(cfg, total)` → dòng đầu tiên chứa tổng, không có → `''` (chỉ hiện số).
- `normalizeConfig`: kẹp `dice`, cắt chữ ≤ 60 ký tự, bỏ dòng `from > to`, tối đa 12 dòng.

### 4.2 Overlay `/overlay/xucxac` (Three.js r160 từ `/games/quaivat/vendor/`, import map)

- Xúc xắc `RoundedBoxGeometry`, mặt chấm vẽ bằng canvas (6 texture), mặt 1 chấm đỏ như xúc xắc VN. Bàn tròn mờ đổ bóng, nền trong suốt.
- Tung: từ trên rơi xuống theo vòng cung, nảy 2 lần, xoay nhiều vòng rồi **dừng đúng mặt** kết quả hướng lên (quaternion đích = mặt v hướng +Y, cộng góc xoay quanh Y ngẫu nhiên; xoay thêm giảm dần về 0). Hoạt cảnh ~55 % `ms`, rồi thẻ kết quả: tên người tặng, các số + tổng, dòng kết quả.
- `display`: `x`, `y`, `scale`, `color` `white|red|black|gold`, `showQueue`. `?q=low` thì tắt bóng, `pixelRatio` 1.
- Khung trong suốt khi rảnh: chỉ vẽ lại khi có hoạt cảnh (rảnh thì dừng render, nhẹ OBS).

## 5. Panel trong app

Mỗi game 1 file `public/games/<id>/<id>-panel.js` tự chèn `<section id="view-<id>">` (mẫu Đá Cầu): thanh trên có ▶ Thử, Xoá hàng chờ, Thêm vào OBS (`window.buildOverlayURL`/`hpObsQuick`), Xem thử, Tải lại overlay. Bên trái các thẻ cài đặt, bên phải khung xem thử `?review=1`. CSS chèn bằng JS, tiền tố `.gapthu-*` / `.xucxac-*` (không chạm `style.css` → không cần chạy lại tokenize).

- Gắp Thú: thẻ **Giải thưởng** (icon, tên, tỉ trọng, % thực tính sẵn), thẻ **Tỉ lệ** (winRate, bảo hiểm), thẻ **Quà** (anyGift, danh sách quà gán: số lượt + ☑ chắc trúng), thẻ **Hiển thị**, thẻ **Lượt gần đây** (10 dòng).
- Xúc Xắc: thẻ **Xúc xắc** (số viên, màu), **Bảng kết quả** (từ–đến–chữ, ＋ dòng, Bảng mặc định), **Quà**, **Hiển thị**, **Lượt gần đây**.
- Chữ giao diện tự đặt, gọn.

## 6. Nối vào app (convention)

- `server.js`: `GAMES.gapthu`, `GAMES.xucxac` (`defaultConfig` từ lib), route overlay, normalize lúc nạp config, gọi handler trong `emitGift`, normalize sau POST config.
- `public/index.html`: script tags; `public/app.js`: `openGame` gọi `HpGapThuPanel.open(socket)` / `HpXucXacPanel.open(socket)`.
- Overlay gắn `/lib/overlay-hello.js data-game="<id>"`; quà gán vào `public/lib/giftboard-collect.js` (+ dòng "Mọi quà" khi `anyGift`).
- Không thêm vào danh mục khoá theo KEY (`lib/license-features.js`) — id mới luôn mở; thêm vào danh mục là việc lúc phát hành.

## 7. Kiểm thử

- `tests/gift-turns.test.js`: số lượt theo quà/combo/trần, anyGift tắt, hàng chờ tràn, `turnMs`, runner với đồng hồ giả.
- `tests/gapthu.test.js`: normalize, `pickPrize` theo trọng số (rng cố định), winRate 0/100, bảo hiểm, `sure`, weight toàn 0, `clawX/slipAt` trong khoảng.
- `tests/xucxac.test.js`: `rollDice` 1–6 & số viên, `outcomeFor` biên, bảng mặc định phủ kín [n, 6n], normalize.
- Chạy thử: server cổng riêng + `HP_DATA_DIR` riêng, `POST /api/test-gift` → chụp overlay ở giữa lượt và lúc hiện kết quả.
