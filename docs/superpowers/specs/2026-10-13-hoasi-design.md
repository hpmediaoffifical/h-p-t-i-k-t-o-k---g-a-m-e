# Họa Sĩ — thiết kế (13/10/2026)

Game camera mới cho 🎥 Game Camera, chuyển ý tưởng từ game "Họa Sĩ" của HP LIVE Studio (C++ native,
`F:\PHAT TRIEN GAME\HP LIVE Studio\src\painter_game.h` + `main_ui.cpp` `applyPainterStamps/erasePainterWithHands`)
sang khung web của HP Action LIVE: **người xem tặng quà ném cục sơn vào mặt streamer**, sơn bám trên màn như
bám trên kính; **streamer lấy tay thật lau sạch**. Phủ kín ≥ 95% giữ 1.5 s là sự kiện **PHỦ KÍN** rồi tự rửa.

Không chép code C++ (khác nền tảng) — viết lại bằng JS, giữ thuật toán + thông số đã được kiểm chứng bên Studio.

Đây là game 1/3 của đợt "bộ tracking OBS" (thứ tự user chốt 13/10/2026): **Họa Sĩ → Xích Sét → Xúc Cát**.
Hai game sau có spec riêng.

## 1. Phạm vi bản đầu (v1)

Có:
- Cục sơn bay từ đáy màn theo đường cong vào ô đích (~0.46 s), chạm thì văng vết sơn nhiều màu.
- Sơn **bám trên màn** (toạ độ sân khấu cố định), không đi theo người. Streamer nghiêng người là né được.
- Nhắm **mặt trước**: ô quanh mặt chưa phủ ≥ 55% thì chỉ bắn vào đó; phủ rồi mới lan ra cả màn.
- Lau bằng **bàn tay thật** (21 điểm): tay mở ≥ 2 ngón duỗi thì lau, nắm tay thì không. Quẹt nhanh không đứt
  nét (vệt quét giữa 2 khung nhận diện). Dự phòng bằng cổ tay từ model body khi mất bàn tay.
- % phủ đo **theo pixel thật** (không phải lưới thô như Studio).
- Mốc **PHỦ KÍN**: ≥ 95% giữ 1.5 s → hiệu ứng sơn chảy + tên người ném cú cuối → tự rửa sau 4 s.
- Quà → sơn: hành động gắn quà, hoặc luật quà N cục, hoặc theo xu (giống Đập Muỗi).
- 5 hành động gắn quà + phím tắt: **🎨 Ném sơn**, **🌧 Mưa sơn**, **💧 Xô nước**, **🛡 Khiên che mặt**, **🧽 Rửa sạch**.
- HUD % sơn phủ + người ném gần nhất, kéo được trong app.
- Âm thanh tổng hợp WebAudio (không file): vút bay, bẹp sơn, nước, khiên chặn, phủ kín.
- Game con của Game Camera.

Để sau (không làm v1): sơn dính lên người đi theo mặt (GĐ2), màu sơn theo quà, combo PaintCombo, bảng xếp
hạng người ném, sự kiện miễn phí (like/bình luận), có ván đếm ngược.

## 2. Kiến trúc & file

```
public/games/hoasi/
  game.js          engine thuần (UMD như dapmuoi/game.js): hàng đợi, cục bay, chọn ô đích, khiên,
                   nước, mưa sơn, mốc PHỦ KÍN, normalizeConfig, luật quà
  wipe-shapes.js   hình học thuần (UMD): 21 điểm tay → hình xoá (tròn, viên nang, lòng bàn tay, vệt quét),
                   đếm ngón duỗi, dự phòng cổ tay
  overlay.html     OBS view: feed OBS + HpTracker, lớp sơn canvas, lau, cục bay, khiên, HUD, âm thanh
  hoasi-panel.js   panel trong app (window.HpHoaSiPanel)
tests/hoasi-engine.test.js, tests/hoasi-wipe.test.js
```

Server (`server.js`): `const HoaSi = require('./public/games/hoasi/game.js')`; `GAMES.hoasi` (icon 🎨,
`overlayPath: '/overlay/hoasi'`, `defaultConfig: HoaSi.defaultConfig()`); `'hoasi'` vào `CAM_GAME_IDS`
(sau `dapmuoi`, cùng thứ tự registry); `overlayMatchers.hoasi`; `getOptions` `per.hoasi` (dùng nguồn chung);
chuẩn hoá config lúc khởi động; route `/overlay/hoasi`, `/api/hoasi/test`, `/api/hoasi/control`;
`handleHoaSiGift()` trong chuỗi phát quà cạnh `handleDapMuoiGift`; emit `hoasi:gift` tới room `overlay` +
`preview`; giữ `display` khi config POST thiếu (danh sách id cạnh `dapmuoi`); `global.__hoasiApplyHotkeys`;
`onTrusted('hoasi:state')` chuyển tiếp cho `preview`.

`electron-main.js`: `applyHoaSiHotkeys` + `global.__hoasiApplyHotkeys` (sao mẫu `applyDapMuoiHotkeys`).

Client app: `public/games/camgames/registry.js` thêm thẻ Họa Sĩ; `public/app.js` thêm `'hoasi'` vào
`CAM_CHILD_GAMES`, nhánh `openHoaSi(game)`; `public/index.html` thêm `<section id="view-hoasi">` + script;
`public/style.css` namespace `.hoasi-*`.

Đơn vị engine: sân khấu 1080×1920 px, thời gian ms, y tăng xuống dưới. Engine không đụng DOM/canvas.

Nhận diện: `tracker.want({ hands: true, pose: true, face: false })`. Tay để lau; pose → `bodyFrames()`
(`public/lib/body-frames.mjs`) lấy khung đầu `head = { O, u, v, width }` để nhắm mặt và đặt khiên.
Lớp sơn nằm trong overlay, còn ảnh nhận diện là ảnh chụp **nguồn camera** (`GetSourceScreenshot`) — sơn không
bao giờ lọt vào ảnh AI (Studio phải tự lo chuyện này, ở đây tự nhiên tách).

## 3. Lưới & đo phủ

- Lưới đích **12 cột × 18 hàng = 216 ô** (mỗi ô 90 × 106.7 px), như Studio.
- Overlay mỗi **250 ms** vẽ thu nhỏ lớp sơn xuống canvas 120×216 (`willReadFrequently`), `getImageData`, pixel
  có alpha ≥ 26 (10%) là "có sơn". Mỗi ô = 10×12 pixel mẫu → `cells[i]` ∈ [0,1]; `total` = trung bình.
  Gọi `engine.setCoverage(cells, total)`.
- Engine tự đặt `cells[ô] = 1` ngay khi sơn chạm (để các phát kế tiếp trước lần đo sau không dồn vào một ô),
  và `cells[ô] *= 0.1` khi nước chạm. Lần đo kế tiếp ghi đè bằng số thật.

## 4. Engine (`game.js`)

### Cục bay
`{ id, kind: 'paint'|'water', cell, x0, y0, cx, cy, x1, y1, t0, ms, color, by }`.
- Xuất phát: đáy màn, `x0` ngẫu nhiên 30–70% W, `y0 = 0.98 H`.
- Đích: tâm ô ± 25% bề ô (như Studio `(cx+.25+rnd*.5)/cols`), kẹp 3–97% sân khấu.
- Đường cong bậc 2, điểm điều khiển `cx = (x0+x1)/2 ± 10% W`, `cy = min(y0,y1) − 18% H` (vồng lên).
- Thời gian bay `flightMs` (mặc định 460). Overlay vẽ cục tròn + giọt kéo đuôi, cỡ to dần 0.6 → 1.0.
- Ô đang có cục bay tới bị cộng phạt +0.5 khi chọn đích (không dồn nhiều phát vào một ô).
- Màu sơn: ngẫu nhiên từ bảng 12 màu tươi (đỏ, cam, vàng, xanh lá, ngọc, xanh dương, tím, hồng…).

### Chọn ô sơn (`cleanCell`, theo Studio)
- Có mặt (`setFace` trong 1 s gần nhất) và `aimFace` bật: ô mặt `(fx, fy)` = ô chứa `head.O`.
  `faceOpen` = trung bình phủ của 3×3 ô quanh mặt < 0.55.
- `faceOpen` → chỉ xét ô cách mặt Manhattan ≤ 1. Ngược lại xét mọi ô.
- Điểm ô = `cells[i] + rnd×0.10 + (mặt có, không faceOpen ? dManhattan×0.006 : 0) + phạt đang bay`; chọn nhỏ nhất.
- Khiên đang bật: bỏ qua ô có tâm nằm trong vòm (không thì mọi phát nhắm vào ô sạch sau khiên → game đứng).
- Không có mặt → điểm = `cells[i] + rnd×0.10`.

### Chọn ô nước (`dirtyCell`)
Xét cả 216 ô, điểm `cells[i] + rnd×0.16 − phạt đang bay`, chọn lớn nhất (Studio chỉ rút 18 ô ngẫu nhiên → hay
bỏ sót đúng ô bẩn khi màn gần sạch); nếu `cells` lớn nhất < 0.08 (màn sạch) → ô mặt (hoặc giữa màn nếu không có mặt).

### Chạm
- Sơn: nếu khiên bật và điểm chạm nằm trong vòm → **bị chặn**: không vết sơn, sự kiện
  `{ type:'block', x, y, color }` (overlay vẽ giọt tan trượt theo mặt vòm + gợn sáng). Ngược lại sự kiện
  `{ type:'splat', x, y, r, color, by, seed }`, `cells[ô] = 1`, `lastBy = by`.
- Nước: luôn xuyên khiên. Sự kiện `{ type:'wash', x, y, r }` + vệt phụ `{ x ± 8% W, y ± 6% H, r×0.62 }`,
  `cells[ô] *= 0.1`.
- Bán kính: `r = paintSize% × W` (mặc định 10.5 → 113 px), nước `waterSize% × W` (14.5 → 157 px).

### Hàng đợi & nhịp
- `enqueuePaint(n, by)` → hàng đợi (trần 500). Xả tối đa `shotsPerSecond` (mặc định 6) phát/giây.
- `storm(seconds, percent, by)`: xáo 216 ô, lấy `round(216 × percent/100)` ô, hẹn đều trong `seconds`
  (mặc định 10 s ≈ 46 ms/ô như Studio). Không qua trần nhịp `shotsPerSecond`. Ô đã hẹn cố định; khiên chặn lúc chạm.
- `water(n, by)`: n tia nước, cách nhau 240 ms (như Studio giữ V).
- Đang ở pha PHỦ KÍN / đang rửa: dừng phóng (hàng đợi + lịch mưa giữ nguyên, chạy tiếp sau khi rửa xong).

### Khiên
- `shield(seconds)`: `shieldUntil = max(now, shieldUntil) + seconds×1000`, trần 60 s còn lại.
- Vòm: tâm `head.O + (0, 0.18 × ry)`, `rx = clamp(head.width × 0.8 × shieldScale/100, 0.12 W, 0.40 W)`,
  `ry = 1.15 rx`. Mất đầu quá 1 s → vòm ẩn và không chặn (thà không chặn còn hơn chặn nhầm chỗ).
- Overlay vẽ vòm kính trong (viền sáng + vệt phản chiếu), lóe chỗ bị chặn.

### PHỦ KÍN
- `full.enabled` (true): `total ≥ full.percent/100` (95) liên tục `full.holdSec` (1.5) → sự kiện
  `{ type:'full', by: lastBy }`, pha `full`. Chốt một lần — chỉ bắn lại sau khi đã rửa hoặc `total` xuống dưới
  `percent − 10`.
- `full.autoWash` (true): sau `full.washAfterSec` (4) → pha `washing`, sự kiện `{ type:'washStart' }`; overlay
  chạy màn nước quét từ trên xuống 1.2 s (xoá dần lớp sơn theo dải) rồi gọi `engine.washDone()` → `cells = 0`,
  pha `play`, sự kiện `washDone`. Không tự rửa → ở pha `full` tới khi streamer lau dưới ngưỡng hoặc có Rửa sạch.
- Overlay pha `full`: các vệt sơn chảy dọc toàn màn + banner "🎨 PHỦ KÍN!" + "Cú cuối: <tên>".

### Rửa sạch
`wash(by)`: như auto-wash nhưng màn nước 0.8 s, không banner. `clear()`: xoá ngay không hiệu ứng (lệnh
`clear` của panel). `reset()`: xoá sơn, hàng đợi, lịch mưa, khiên, cục bay.

### API
`createEngine(cfg, { width, height, random, now })` →
`{ step(dtMs), setFace(head|null), setCoverage(cells, total), enqueuePaint, storm, water, shield, wash,
washDone, clear, reset, setConfig, snapshot }`.
`step` trả mảng sự kiện (`launch`, `splat`, `block`, `wash`, `full`, `washStart`, `washDone`).
`snapshot()` → `{ flights, queue, coverage, cells, phase: 'play'|'full'|'washing', shieldMs, dome, lastBy }`.
`random` tiêm được để test tất định.

## 5. Lau (`wipe-shapes.js` + overlay)

### Tay nào được lau
- Ngón duỗi (2D, đủ dùng cho camera trước mặt): trỏ/giữa/áp út/út duỗi nếu
  `|cổ tay→đầu ngón| > |cổ tay→khớp PIP| × 1.15`; cái duỗi nếu `|đầu cái→MCP út(17)| > |IP cái(3)→17| × 1.05`.
- Lau khi số ngón duỗi ≥ `minFingers` (mặc định 2). Nắm tay (0–1) không lau — để streamer đưa tay qua mặt mà
  không xoá.

### Hình xoá (cỡ theo `span` = `hand.size`, cổ tay → MCP giữa, như Studio)
- Tròn ở 21 điểm bán kính 0.30 span (5 đầu ngón 0.36 span).
- Viên nang theo 20 đốt, bán kính 0.26 span.
- Đa giác lòng bàn tay (0, 1, 5, 9, 13, 17) tô kín.
- **Vệt quét**: mỗi điểm trong 21 điểm vẽ viên nang từ vị trí khung nhận diện trước → khung này (cùng bán kính
  điểm), chỉ khi khung trước cùng id tay, cách < 200 ms và dời < 4 span (đổi id/nhảy cóc thì bỏ). Liên tục, không
  rời rạc như 6 bước của Studio.
- Dự phòng cổ tay (`wristFallback`, bật): bên nào không có bàn tay mà pose có khuỷu + cổ tay (v ≥ 0.5) → 4 hình
  tròn nối dài qua cổ tay theo hướng khuỷu→cổ tay, tại 0.15/0.35/0.55/0.75 × dài cẳng tay, bán kính 0.22 × dài
  cẳng tay.
- Hàm thuần: `fingersExtended(pts)`, `canWipe(hand, minFingers)`, `handShapes(hand, prev)`,
  `wristShapes(pose, side)` → `[{ t:'circle', x, y, r } | { t:'capsule', x0, y0, x1, y1, r } | { t:'poly', pts }]`.

### Áp vào lớp sơn
- Lớp sơn là canvas **540×960** (nửa độ phân giải, CSS phóng lên 1080×1920). Mặt nạ lau cùng cỡ.
- Mỗi khung vẽ: xoá mặt nạ, vẽ mọi hình xoá màu đặc (toạ độ /2), rồi một lần
  `paint.globalCompositeOperation = 'destination-out'`, `globalAlpha = 1 − exp(−dt / τ)`,
  `τ = 0.05 s × 100 / wipeSpeed` (wipeSpeed 25–400%, mặc định 100), `dt` kẹp ≤ 100 ms.
  → Quẹt một lượt (mỗi pixel nằm dưới tay ~2 khung) bớt ~75–90%, còn vệt mờ phải lau lại — giống cảm giác
  "lau 2 lượt" của Studio mà không cần trạng thái từng pixel.
- Tay đứng yên trên một chỗ vẫn lau dần theo thời gian (đúng với cảm giác chà).
- `display.showWipe` (tắt): vẽ viền mờ vùng lau trên lớp hiệu ứng để streamer canh.

## 6. Vẽ vết sơn (overlay)

- `splat`: 6 đốm mềm bán kính `r × (0.28–0.66)` rải ±r/2 quanh điểm chạm, alpha `paintOpacity` (92%) × falloff
  `(1 − d²/r²)^1.6` (gradient tròn 5 nấc); thêm 5–9 giọt văng nhỏ `r × (0.05–0.12)` ở khoảng `r × (0.8–1.6)`; 0–2 vệt
  chảy xuống dài `r × (0.3–0.8)`. Hạt ngẫu nhiên lấy từ `seed` của sự kiện → vẽ lại giống nhau.
- `wash`: `destination-out` tròn mềm alpha 0.9 (vệt phụ 0.76) + bọt nước bắn + vệt ướt bóng mờ 0.6 s trên lớp hiệu ứng.
- Lớp hiệu ứng `#fx` 1080×1920 vẽ mỗi khung: cục bay, khiên, hạt, giọt chặn, banner, HUD, viền lau.
  Lớp sơn chỉ vẽ khi có splat/wash/lau.

## 7. Quà

Đường quà (server, `handleHoaSiGift`), thứ tự như Đập Muỗi:
1. Quà khớp một **hành động** đang bật (`actions[].giftId`, dự phòng tên quà không phân biệt hoa thường) →
   chạy hành động theo `repeatCount`: ném sơn / nước `count × repeat` (trần `maxPerGift`); mưa `seconds × repeat`
   (trần 30 s, `percent` giữ nguyên); khiên `seconds × repeat` (cộng dồn, trần 60 s còn lại); rửa một lần.
2. Khớp `giftRules` (`{ id, giftId, giftName, giftImage, diamond, count, enabled }`) → `count × repeatCount` cục sơn.
   Rule tắt → 0, không rơi xuống bước 3.
3. Không khớp → `floor(coinValue × repeatCount / coinsPerShot)` cục (`coinsPerShot` mặc định 1, 0 = tắt).
Trần một lượt `maxPerGift` (mặc định 50). Payload `hoasi:gift`: `{ action: 'paint'|'storm'|'water'|'shield'|'wash',
qty, params, nickname, profilePicture, giftName, image, source, ts }`.

Hành động `actions[]`: `{ id, type, icon, name, enabled, giftId, giftName, giftImage, diamond, hotkey, params }`.

| type | icon | tên | params (giới hạn) | mặc định |
|---|---|---|---|---|
| `paint` | 🎨 | Ném sơn | `count` [1, 100] | 5 |
| `storm` | 🌧 | Mưa sơn | `seconds` [2, 30], `percent` [10, 100] | 10 s, 100% |
| `water` | 💧 | Xô nước | `count` [1, 30] | 3 |
| `shield` | 🛡 | Khiên che mặt | `seconds` [1, 60] | 10 s |
| `wash` | 🧽 | Rửa sạch | — | — |

Mặc định mỗi loại một hành động chưa gắn quà. Server dùng chung `normalizeConfig`/`actionForGift`/
`shotsForGift` của `game.js` (UMD require được, như Đập Muỗi). Phím tắt mỗi hành động: Electron
`globalShortcut` → `POST /api/hoasi/test { action, params }`.

## 8. Config mặc định (`HpGame.hoasi.defaultConfig()`)

```js
{
  enabled: true,
  aimFace: true, paintSize: 10.5, waterSize: 14.5, paintOpacity: 92,   // % W, % W, %
  flightMs: 460, shotsPerSecond: 6, shieldScale: 100,
  wipeSpeed: 100, minFingers: 2, wristFallback: true,
  full: { enabled: true, percent: 95, holdSec: 1.5, autoWash: true, washAfterSec: 4 },
  maxPerGift: 50, coinsPerShot: 1, giftRules: [],
  actions: [ /* paint 5, storm 10s/100%, water 3, shield 10s, wash */ ],
  sound: { enabled: true, volume: 0.5 },
  display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showLastThrower: true, showWipe: false },
  quality: 'auto'
}
```

Giới hạn số (`NUM_LIMITS`): paintSize [5, 20], waterSize [5, 25], paintOpacity [40, 100], flightMs [200, 1500],
shotsPerSecond [1, 30], shieldScale [50, 200], wipeSpeed [25, 400], minFingers [1, 5], maxPerGift [1, 500],
coinsPerShot [0, 5000]; full.percent [50, 100], full.holdSec [0.5, 10], full.washAfterSec [1, 30]. Giá trị không
phải số → giữ mặc định (không kẹp về min — bài học Đập Muỗi).

Nguồn camera: không có trường riêng — dùng nguồn chung Game Camera (`camgames.source`).

## 9. Overlay (`overlay.html`)

- Nền trong suốt 1080×1920, `fitOverlay` 9:16. Socket `subscribe` room `overlay`/`preview`; trong app
  (`?review=1`) **không** chạy AI.
- Feed: `socket.emit('touchplay:feed', 'hoasi')`; `touchplay:frame` → `createImageBitmap` →
  `tracker.pushFrame(bmp, cameraToStage(layout, …, 'hoasi'))`; bận thì bỏ khung.
- Mỗi rAF: `bodyFrames(pose)` → `engine.setFace(head)`; tay hợp lệ → hình xoá → áp lớp sơn;
  `engine.step(dt)` → vẽ sự kiện; 250 ms đo phủ một lần; vẽ `#fx`.
- HUD: thanh "🎨 Sơn phủ 63%" (đổi màu theo %), dòng "Vừa ném: <tên>" (`showLastThrower`), đồng hồ khiên khi bật.
  Vị trí/cỡ chỉnh bằng thanh trượt trong panel (`display.hudX/YPercent`, `hudScale`) như Đập Muỗi.
- Âm thanh WebAudio: vút (noise băng thông quét 300 ms), bẹp (noise thông thấp 90 ms + sine 120 Hz), nước (noise
  rít 400 ms), khiên chặn (sine 880 Hz 150 ms), phủ kín (3 nốt), rửa (noise dâng). Chống dồn tiếng: mỗi loại
  cách ≥ 75 ms.
- Chế độ chuột (`?mouse=1`, test): click = ném 1 cục (đích do engine chọn); giữ + kéo = lau bằng "bàn tay" tròn
  span 140 px; phím C xoá, S mưa, W nước, H khiên, F người giả (thử nhắm mặt + khiên).
- Nhận `hoasi:gift`, `gameCmd` (`start|stop|reset|clear`), `gameConfig`, `gameDisabled/Enabled` (tắt → dừng feed,
  ẩn canvas), `overlay:reload`.
- Báo: `touchplay:overlayStat` mỗi 2 s `{ fps, aiMs, hands, phase }`; `hoasi:state` mỗi 1 s
  `{ coverage, queue, phase, shieldMs }` (panel hiện % phủ sống).
- Test hook `window.__hs = { engine, tracker, step(ms), paintCtx }`.

## 10. Panel (`hoasi-panel.js`, section `view-hoasi`)

Thẻ: 📺 Trạng thái (OBS/feed/số tay, % phủ sống, nút Thử: ném 5 / mưa / nước / khiên / rửa, Xoá ngay) ·
🖐 Lau sơn (tốc độ lau, số ngón tối thiểu, dự phòng cổ tay, hiện vùng lau) · 🎨 Sơn (cỡ cục, cỡ nước, độ đậm,
thời gian bay, nhắm mặt trước, số phát/giây, cỡ khiên) · 🏁 Phủ kín (bật, %, giữ giây, tự rửa, rửa sau) ·
🎁 Quà ra sơn (bảng giftRules + xu/cục + trần một lượt, chọn quà từ gift sheet) · 🛟 Hành động (5 loại, mỗi dòng
icon/tên/quà/tham số/hotkey/bật-tắt, nút thêm theo loại) · 🔊 Âm thanh · 🖥 Hiển thị (HUD vị trí/cỡ, người ném).
Link OBS: nhắc dùng link Game Camera. Lưu `POST /api/games/hoasi/config`; panel chỉ GỬI, không áp echo
(bài học relay-cfg). Mở panel KHÔNG reload overlay; poll `/api/touchplay/obs-sources` 2 s/lần để hiện feed + số tay
(như Đập Muỗi).

## 11. Server

- `/api/hoasi/test` POST `{ action, qty?, params? }` → emit `hoasi:gift` nguồn `test`.
- `/api/hoasi/control` POST `{ cmd }` ∈ `start|stop|reset|clear` → `gameCmd`.
- `handleHoaSiGift({ giftId, giftName, giftImage, coinValue, repeatCount, nickname, profilePicture, source })`.
- `camGamesApplyActive` tự bao `hoasi` nhờ `CAM_GAME_IDS` → chỉ nhận quà khi đang được chọn trong hub.

## 12. Kiểm thử

- `npm test` (node --test, không DOM):
  - `hoasi-engine`: normalizeConfig (mặc định, kẹp, giá trị rác giữ mặc định, hành động); quà (hành động > rule >
    xu, rule tắt = 0, trần); hàng đợi + nhịp `shotsPerSecond` + trần 500; nhắm mặt trước tới 55% rồi lan; phạt ô
    đang bay; khiên loại ô + chặn sơn + nước xuyên + mất đầu thì không chặn; mưa hẹn đúng số ô trong `seconds`;
    nước nhắm ô bẩn nhất; PHỦ KÍN bắn sau `holdSec`, chỉ một lần, dừng phóng, auto-wash → `washDone` về 0 và chạy
    tiếp hàng đợi; wash/clear/reset.
  - `hoasi-wipe`: đếm ngón (xoè 5, nắm 0, chữ V 2), `canWipe` theo `minFingers`; cỡ hình theo span; vệt quét chỉ khi
    khung trước tươi + không nhảy cóc; dự phòng cổ tay đúng hướng.
- Overlay không cần người: `/overlay/hoasi?review=1&mouse=1` + `POST /api/hoasi/test`; pane ẩn thì
  `window.__hs.step(ms)`. Đo thời gian khung lau + đo phủ (mục tiêu < 4 ms/khung không tính AI, số preview chỉ so
  tương đối).
- Camera thật: OBS scene thử `HP Đập Muỗi TEST` → Game Camera chọn Họa Sĩ → ném sơn bằng nút Thử, lau bằng tay.

## 13. Rủi ro / ghi chú

- Tay che mặt lúc lau: model tay vẫn bắt tốt; pose có thể mất tai/mắt → `bodyFrames` lùi về mũi/vai, khiên/nhắm
  mặt vẫn chạy.
- Lau quá dễ/khó: chỉnh `wipeSpeed`, `minFingers` trong panel sau khi thử thật.
- Working tree chính đang có thay đổi chưa commit (đưa Bắn Cung vào Game Camera: `registry.js`,
  `camgames-panel.js`, `server.js`, `app.js`). Nhánh `feature/hoasi` tách từ 0852e1f → khi gộp có xung đột nhỏ
  ở `registry.js`/`CAM_GAME_IDS`/`CAM_CHILD_GAMES`; giữ cả hai, thứ tự: touchplay, chemtraicay, dapmuoi, hoasi, bancung.
- Hiệu năng OBS: lớp sơn nửa độ phân giải + một lần `destination-out` mỗi khung + đọc 120×216 bốn lần/giây — nhẹ.
