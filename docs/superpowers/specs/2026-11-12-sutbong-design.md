# ⚽ Sút Bóng Vào Gôn (`sutbong`) — thiết kế

Ngày 12/11/2026. Game con của 🎥 Game Camera (`camgames`).

## 1. Mục tiêu

Người xem tặng quà → một cú sút về khung thành. Streamer đứng làm **thủ môn** trước camera, chặn bóng bằng **2 bàn tay**
(bám tay bằng bộ nhận diện chung `HpTracker` của overlay mẹ). Bảng tỷ số chạy suốt buổi LIVE.

Xong khi: engine thuần có test (`npm test` xanh), nối đủ các điểm "Game camera mới" trong CLAUDE.md, chạy thử trên server
riêng bằng người giả (`?demo=1`) + chuột (`?mouse=1`), commit trên nhánh riêng.

## 2. Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Góc nhìn | **Góc người sút**: camera = mắt người sút. Bóng hiện to ở mép dưới, bay xa nhỏ dần về khung thành vẽ quanh streamer. |
| Bảng điểm | **Tỷ số liên tục**: 🧤 CẢN x – y ⚽ VÀO (theo điểm), chuỗi cản liên tiếp, kỷ lục chuỗi, top 3 người ghi bàn. Nút Đặt lại ở panel. |
| Kiểu sút | ⚽ Thường · 🌀 Cong (lượn ra rồi bẻ vào góc) · ⚡ Sấm sét (nhanh, ×2 điểm) · 🟡 Bóng vàng (×3 điểm). |
| Khe Game Camera | `hands` — chơi bằng tay nên không chạy cùng Chém Trái Cây / Đập Muỗi / Touch & Play; chạy chung được Bắn Cung, Level Quest, Đá Cầu, Bộ Tách Người. |
| Nhận diện | Chỉ model **pose** (cổ tay 15/16, ngón trỏ 19/20, ngón út 17/18) — nhẹ, đứng xa 2–3 m vẫn bắt; không bật model tay. |
| Quà | Gán đích danh theo **id** (`cfg.gifts[{giftId, shot}]`), combo ×N = N cú sút (trần 999), giống Đá Cầu. Không có nhánh "mọi quà". |
| Phạt khi thủng lưới | Không làm (Đá Cầu bản này cũng chưa có Rổ PHẠT). |

## 3. Quỹ đạo (engine thuần `public/games/sutbong/game.js`, UMD)

Đơn vị px sân khấu 1080×1920, ms. Vùng chơi `A` = phần sân khấu thấy trên OBS (`setArea`, giống Đá Cầu).

- **Khung thành** `goalRect()` = % của vùng chơi: rộng `goal.width`% (giữa), mép trên `goal.top`%, vạch vôi `goal.bottom`%.
- **Cú sút** có 2 pha: `spot` (bóng nằm ở chấm phạt đền mép dưới, hiện tên người tặng, 650 ms — báo trước cho thủ môn)
  → `fly` (bay tới đích trong `T` ms) → `saved` / `goal` (hoạt cảnh 900 ms rồi xoá).
- **Chiếu phối cảnh thật**: điểm đầu `S` (dưới mép, bán kính `R0 = 150`) và đích `E` trong khung (bán kính `R1 = 46·size`) là
  hình chiếu của 2 điểm 3D ở độ sâu `z0 = 1`, `z1 = R0/R1`. Với `u = t/T ∈ [0,1]`:
  `P(u) = (S−C)·z0·(1−u) + (E−C)·z1·u + lệch(u)`, `z(u) = z0(1−u) + z1·u`, màn hình = `C + P(u)/z(u)`, bán kính `R0/z(u)`.
  `C` = tâm phối cảnh (giữa vùng, 40 % cao). Bóng đi nhanh lúc đầu, chậm dần khi xa — đúng mắt người.
- **Lệch** (thế giới, trước khi chia `z`): mọi cú có vồng nhẹ `−arc·4u(1−u)` theo y; 🌀 cong thêm `±curve·4u(1−u)` theo x
  (đích ở nửa nào thì lượn ra phía ngược rồi bẻ vào).
- **Thời gian bay** `T`: Dễ 1500 · Vừa 1200 · Khó 950 ms; nhân 🌀 1,1 · ⚡ 0,6 · 🟡 1. Đích chọn ngẫu nhiên trong 6 ô (3 cột × 2 hàng)
  của khung, trừ lề bán kính bóng.

## 4. Cản phá (`engine.contact(hands, atClock)`)

- `hands = [{ x, y, r }]` toạ độ sân khấu. `handsFromPose(P)` (thuần, có test): mỗi tay = cổ tay đẩy về phía các ngón
  (trung bình ngón trỏ + út) — tâm lòng bàn tay/găng; `r = max(40, 0,3 × bề vai)`. Bỏ tay có `v < 0.5`.
- Bóng **chặn được** khi `u ≥ 0.8` (đã tới gần mặt phẳng thủ môn) và khoảng cách tay–bóng ≤ `r·hitScale% + bán kính bóng`.
- **Bù trễ camera**: tới `u = 1` chưa phán ngay — chờ thêm `latencyMs + 60` ms. Trong lúc chờ, khung camera chụp lúc `atClock`
  (đồng hồ engine) được so với **vị trí bóng lúc đó** (lịch sử 600 ms). Hết chờ mà chưa chạm → `goal`.
- Cản: bóng bật ra (vận tốc theo hướng tay → bóng, to dần như bay lại gần camera, mờ dần). Vào: bóng lọt lưới (u tới 1,1), lưới rung.

## 5. Điểm

- `mult`: ⚽ 1 · 🌀 1 · ⚡ 2 · 🟡 3. Cản → `keeper += mult`, `streak++`, `best = max`. Vào → `viewers += mult`, `streak = 0`,
  người tặng cộng `mult` vào bảng ghi bàn. `topScorers(3)` theo điểm rồi theo lần ghi gần nhất.
- Mốc chuỗi cản 5/10/20/50/100 → sự kiện `milestone`.
- `stats()` / `loadStats()` để overlay lưu localStorage (tải lại OBS không mất tỷ số). `reset()` về 0.

## 6. Hàng chờ

`maxBalls` (1–3, mặc định 1) cú sút cùng lúc, cú sau cách ≥ 900 ms; dư xếp hàng (`queueMax` 999, đầy → `queueFull`).
Chưa thấy người (`setReady(false)`) thì giữ hàng, quá 8 s vẫn sút để quà không mất.

## 7. Nối vào app (theo "Game camera mới")

- `public/games/camgames/registry.js`: dòng `sutbong` (`slot: 'hands'`, overlay `/overlay/sutbong`).
- `lib/camgames.js`: `SLOTS.sutbong = 'hands'`, `BY_ID_ONLY`, `explicitGifts('sutbong') = cfg.gifts`.
- `server.js`: `GAMES.sutbong`, `CAM_GAME_IDS` (cùng thứ tự registry), `overlayMatchers.sutbong`, nguồn feed `per.sutbong`,
  chuẩn hoá config lúc khởi động, route `/overlay/sutbong`, quà `handleSutBongGift` (có `camGiftYields`) → `io.emit('sutbong:gift')`,
  `/api/sutbong/test` + `/api/sutbong/control` (`clear|reset`), nguồn Bảng Quà Tổng.
- `lib/camgames-session.js` (phiên game theo quà) + `camgames-trigger.js` + `public/lib/giftboard-collect.js`: thêm game.
- Panel `public/games/sutbong/sutbong-panel.js` (mẫu Đá Cầu: quà + kiểu sút, độ khó, khung thành, hiển thị, xem thử demo),
  script tag trong `index.html`, nhánh mở trong `app.js`.
- Overlay `public/games/sutbong/overlay.html`: `sharedTracker('sutbong') || new HpTracker`, `want({pose:true})`,
  `touchplay:feed` `{id:'sutbong', frames:false}` khi dùng chung, `overlay-hello.js data-game="sutbong"`, `cam-frame-guard.js`.

## 8. Thử không cần người thật

- `?demo=1`: thủ môn giả (người que) — đọc đích cú sút, đưa tay tới với độ trễ phản xạ, thỉnh thoảng bay người hụt (≈30 %).
- `?mouse=1`: con trỏ là một bàn tay; phím B sút thử, D bật/tắt người giả, Z vẽ vùng chạm.
- `window.__sb.step(ms)` bước tay khi pane bị ẩn (rAF đứng).
- Test `tests/sutbong-engine.test.js`: chuẩn hoá config, quà → cú sút, phối cảnh (đầu/cuối/đơn điệu, bán kính nhỏ dần),
  cong lệch giữa đường, cản trong cửa sổ / không cản sớm, bù trễ bằng lịch sử, vào lưới khi không chạm, điểm/chuỗi/top,
  hàng chờ, `handsFromPose`.
