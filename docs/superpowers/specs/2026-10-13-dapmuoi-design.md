# Đập Muỗi — thiết kế (13/10/2026)

Game camera mới cho 🎥 Game Camera: muỗi bay ngang vo ve khắp overlay, streamer **vỗ 2 tay** trúng muỗi thì
muỗi lật úp (lưng xuống dưới, chân chổng lên) rơi xuống rồi biến mất. Người xem tặng quà để **thả muỗi**
(hành) hoặc **xịt / vợt / mắc màn** (cứu).

Tham chiếu kỹ thuật: Bắn Cung bám người và Touch & Play (feed camera OBS dùng chung + `HpTracker` chạy
trong overlay), Chém Trái Cây (engine thuần test được bằng node, route `/api/<id>/*`, quà qua socket).
**Không** dùng mô hình trang tracker riêng của Chém Trái Cây.

Bản vẽ đã duyệt: `docs/superpowers/specs/assets/dapmuoi/muoi.svg` (bay, đầu quay trái) và
`muoi-lat-ngua.svg` (bị đập). Khi triển khai chép sang `public/games/dapmuoi/assets/`.

## 1. Phạm vi bản đầu (v1)

Có:
- Muỗi bay ngang, đổi hướng ngẫu nhiên, run lắc vo ve, hút nhẹ về mặt streamer. Dùng **toàn bộ** sân khấu
  1080×1920: nhiều muỗi thì phủ kín màn hình, không dồn vào một dải.
- Mỗi con có tốc độ riêng: một phần bay **nhẹ** (lững lờ), phần còn lại bay nhanh; đông quá thì cả đàn
  chậm lại cho nhìn rõ.
- **Muỗi thông minh** (một tỉ lệ nhỏ): bị đập thì né vụt đi, phải đập vài lần mới chết.
- Vỗ 2 tay giết muỗi trong bán kính đập; tuỳ chọn "tát 1 tay"; dự phòng bằng cổ tay từ model body.
- Sinh nền tự động (thưa → dày), trần số muỗi, hàng đợi.
- Quà → muỗi: quà chỉ định N con, hoặc N xu = 1 con.
- 4 hành động gắn quà + phím tắt: **Thả muỗi**, **Bình xịt**, **Vợt điện**, **Mắc màn**.
- HUD Đã đập / Còn lại / combo, kéo được trong app.
- Âm thanh vo ve tổng hợp + tiếng đập.
- Đăng ký làm game con của Game Camera.

Để sau (không làm ở v1): Muỗi vằn boss, Bầy bám mặt, Nhang muỗi, cơ chế "bị đốt"/thua, top người tặng,
bảng quà riêng (Bảng Quà Tổng đã gom sẵn).

## 2. Kiến trúc & file

```
public/games/dapmuoi/
  game.js            engine thuần (UMD như chemtraicay/game.js): muỗi, sinh, hàng đợi, đập, hành động
  clap.js            nhận diện vỗ tay thuần (UMD): vào = tay/cổ tay, ra = sự kiện đập {x,y,r}
  overlay.html       OBS view: feed OBS + HpTracker, vẽ canvas, âm thanh, HUD, chế độ chuột
  dapmuoi-panel.js   panel trong app (window.HpDapMuoiPanel)
  assets/muoi.svg, muoi-lat-ngua.svg
tests/dapmuoi-engine.test.js, tests/dapmuoi-clap.test.js
```

Server (`server.js`): `GAMES.dapmuoi` (icon 🦟, `overlayPath: '/overlay/dapmuoi'`, `defaultConfig:
makeDefaultDapMuoiConfig()`), thêm `'dapmuoi'` vào `CAM_GAME_IDS`, `overlayMatchers.dapmuoi`, nguồn
camera trong `getOptions` (`per.dapmuoi`), backfill config lúc khởi động, route `/overlay/dapmuoi`,
`/api/dapmuoi/test`, `/api/dapmuoi/control`, hàm `handleDapMuoiGift()` gọi trong chuỗi phát quà cạnh
`handleChemTraiCayGift`, emit `dapmuoi:gift` tới room `overlay` + `preview`.

Client app: `public/games/camgames/registry.js` thêm thẻ Đập Muỗi; `public/app.js` thêm
`'dapmuoi'` vào `CAM_CHILD_GAMES`, nhánh `openDapMuoi(game)`, class `game-dapmuoi`; `public/index.html`
thêm `<section id="view-dapmuoi">` + 2 script; `public/style.css` namespace `.dm-*`.

Đơn vị engine: sân khấu 1080×1920 px, thời gian ms, y tăng xuống dưới. Engine không đụng DOM.

## 3. Nhận diện vỗ tay (`clap.js`)

Vào mỗi khung: `hands` từ `HpTracker` (`palm`, `size` của tối đa 2 tay) và `pose` (33 khớp, dùng 11/12 vai,
15/16 cổ tay). Toạ độ đã ở hệ sân khấu nhờ `cameraToStage(layout, bw, bh, W, H, 'dapmuoi')`.

Trạng thái: khoảng cách 2 lòng bàn tay `d`, `d` khung trước, thời điểm đập gần nhất.

Luật **vỗ 2 tay** (mặc định):
1. Có đủ 2 tay: `d < clapDistance × cỡ tay trung bình` (mặc định 1.2) **và** `d` đang giảm với tốc độ
   `≥ clapSpeed` (mặc định 900 px/s) → đập tại trung điểm 2 lòng bàn tay.
2. Chỉ thấy 1 tay nhưng khung trước thấy 2 tay đang khép lại nhanh và `d` trước < 2.5 × cỡ tay → vẫn
   tính đập tại vị trí cuối cùng (model tay hay rớt 1 tay đúng lúc chập).
3. Dự phòng cổ tay: nếu `pose` có 2 cổ tay và 2 vai, `dWrist < 0.45 × bề rộng vai` và đang khép nhanh →
   đập tại trung điểm cổ tay. Luật 3 chỉ chạy khi luật 1/2 không bắn trong khung này.
4. Nghỉ `clapCooldownMs` (250) sau mỗi cú.

Luật **tát 1 tay** (`hitMode: 'slap'`): lòng bàn tay di chuyển `≥ slapSpeed` (1200 px/s) → đập tại vị trí
tay hiện tại, nghỉ 250 ms mỗi tay. Panel chọn `hitMode: 'clap' | 'slap' | 'both'`, mặc định `clap`.

Bán kính đập `hitRadius`: % bề rộng sân khấu (mặc định 14 → ~150 px), cộng thêm cỡ tay. Sự kiện đập:
`{ x, y, r, mode }`. Overlay vẽ vòng sóng tại điểm đập dù trúng hay hụt để streamer tự canh.

Hàm thuần `createClapDetector(cfg)` với `update({ hands, pose, now })` → mảng sự kiện; test bằng chuỗi
khung giả (2 tay khép lại, rớt 1 tay lúc chập, cổ tay, tay đứng yên không bắn, cooldown).

## 4. Engine (`game.js`)

### Muỗi
`{ id, x, y, vx, vy, dir (−1 trái/+1 phải), scale, speedMul, smart, livesLeft, phase (nhịp cánh),
state: 'fly'|'dead'|'dodge', wander, deadAt, dodgeUntil }`.

Bay: mỗi con có điểm đích ngẫu nhiên trên **toàn** sân khấu (x 0–100%, y 0–100%, không chừa dải nào);
bay về đích với tốc độ `speed × speedMul`, tới gần thì chọn đích mới; rẽ gấp ngẫu nhiên mỗi 0.6–1.8 s.
`speedMul` rút lúc sinh: `gentlePercent` (mặc định 35%) số con là **bay nhẹ** `speedMul` 0.25–0.5 (lững lờ,
ít rẽ gấp: 2–5 s một lần), còn lại 0.8–1.3. Khi số muỗi đang bay > `crowdFrom` (mặc định 120) thì nhân
thêm hệ số đàn `max(0.4, crowdFrom / n)` để màn đầy muỗi vẫn nhìn rõ và nhẹ máy. Cộng run lắc: `x += sin(t×37)·3`,
`y += sin(t×29)·4` chỉ lúc vẽ, không vào vật lý. Hút về mặt: nếu engine được báo `setFace(x, y)` trong
500 ms gần nhất, 40% số lần chọn đích sẽ chọn điểm quanh mặt bán kính `faceRadius` (mặc định 260 px).
Mặt lấy từ `pose[0]` (mũi); không có thì bỏ qua. `dir` theo dấu `vx` (sprite lật gương).

Ra khỏi mép quá 120 px thì bị kéo lại (đích mới trong sân). Không bao giờ tự chết.

### Muỗi thông minh
Lúc sinh, `smartPercent` (mặc định 10%) số con là `smart: true`, `livesLeft = smartLives` (mặc định 3).
Khi một cú đập chạm con thông minh còn `livesLeft > 1`: nó **không chết** mà `livesLeft -= 1`, vào trạng
thái `dodge` trong 350 ms: vụt theo hướng ngược điểm đập với tốc độ 1400 px/s rồi về `fly` với đích mới
xa điểm đập ≥ 400 px; trong lúc `dodge` không bị đập tiếp (bất tử ngắn, tránh một cú tính 2 lần). Cú đập
cuối (`livesLeft == 1`) mới chết như thường. Sự kiện `{ type:'dodge', id, x, y, livesLeft }` để overlay
hiện chữ "né!" và số mạng còn lại. Bình xịt và vợt điện **không** bị né (đó là lý do người xem tặng cứu).
Vẽ: con thông minh to hơn 15%, mắt vàng (sprite thứ hai đổi màu mắt, cache riêng), lúc né để lại vệt mờ.

### Chết
Đập trúng (`hit(x, y, r)`): mọi muỗi `fly` có khoảng cách tới điểm đập `≤ r + 0.5 × cỡ muỗi` → `dead`,
`vy = −250`, `vx` giữ ×0.3, sau đó rơi `g = 1600 px/s²`, lắc góc `±12°` tần số 6 Hz, mờ dần từ 0.6 s,
xoá khi `y > H + 100` hoặc sau 2.5 s. Điểm: +1 mỗi con; combo +1 nếu 2 lần trúng cách nhau < 1.5 s.
Sự kiện: `{ type:'kill', n, x, y, combo }`, `{ type:'miss', x, y }`.

### Sinh & hàng đợi
`enqueue(n)` đẩy vào hàng đợi (trần `MAX_QUEUE` 2000). Mỗi khung xả `spawnPerSecond` (mặc định 6) con
nếu số muỗi đang bay < `maxOnScreen` (mặc định 300). Muỗi mới vào từ mép trái/phải ngẫu nhiên, y ngẫu
nhiên trên toàn chiều cao (0–100%). Sinh nền: `idleSpawnSeconds` (mặc định 8, 0 = tắt) → mỗi N giây thêm 1 con nếu
hàng đợi rỗng và không trong trạng thái Mắc màn.

### Hành động
- `release(n)`: `enqueue(n)`.
- `spray(cfg)`: tạo đám mây tại điểm ngẫu nhiên gần tâm đám muỗi (trung bình vị trí muỗi, nếu không có
  thì giữa màn); bán kính nở từ 0 → `sprayRadius` (600 px) trong `sprayMs` (2500); giết tối đa
  `sprayCount` con (mặc định 50) hoặc `sprayPercent` (0 = dùng count) — con nào vào vùng mây thì chết với
  cùng hoạt ảnh lật úp; chết do xịt không tính combo nhưng có tính Đã đập. Sự kiện `spray`.
- `racket(sec)`: `racketUntil = clock + sec×1000` (mặc định 10 s, cộng dồn, trần 60 s). Khi đang bật,
  overlay gọi `sweep(x, y, r)` mỗi khung theo lòng bàn tay (bán kính = cỡ tay) → muỗi chạm là chết, có
  tia điện. Sự kiện `racket` với ms còn lại.
- `net(sec)`: `netUntil` (mặc định 15 s, cộng dồn, trần 120 s): dừng xả hàng đợi và sinh nền; muỗi đang
  bay vẫn bay. Sự kiện `net`.

API: `createEngine(cfg, {width, height, random})` → `{ step(dtMs), hit, sweep, setFace, enqueue, release,
spray, racket, net, reset, setConfig, snapshot }`. `snapshot()` trả `{ mosquitoes, queue, score, killed,
combo, racketMs, netMs, spray, events }`.

Test engine: sinh đúng số, trần on-screen, đập trúng/hụt theo bán kính, rơi và xoá, combo, spray giết
đúng số, net chặn sinh, racket sweep, hàng đợi không vượt trần, muỗi thông minh né đúng `smartLives − 1`
lần rồi chết, xịt/vợt giết được con thông minh, đích bay phủ cả 0–100% hai trục, hệ số đàn khi đông.

## 5. Quà

Đường quà (server, `handleDapMuoiGift`), thứ tự ưu tiên như Nhặt Lá:
1. Quà khớp một **hành động** đang bật (`actions[].giftId`, so `String(giftId)`, dự phòng tên quà không
   phân biệt hoa thường) → chạy hành động, **không** ra muỗi.
2. Quà khớp `giftRules` (`{ id, giftId, giftName, giftImage, diamond, count, enabled }`) → `count × repeatCount` con.
   Rule tắt → 0, không rơi xuống bước 3.
3. Không khớp gì → `floor(coinValue × repeatCount / coinsPerMosquito)` con (`coinsPerMosquito` mặc định 1,
   0 = tắt).
Trần một lượt `maxPerGift` (mặc định 100). Payload `dapmuoi:gift`: `{ action:'release'|'spray'|'racket'|
'net', qty, params, nickname, profilePicture, giftName, image, source, ts }`.

Hành động `actions[]`: `{ id, type, icon, name, enabled, giftId, giftName, giftImage, diamond, hotkey,
params }`; `type ∈ release|spray|racket|net`; mặc định mỗi loại một hành động chưa gắn quà. `params`
theo loại: release `{count}`, spray `{radius, ms, count, percent}`, racket `{seconds}`, net `{seconds}`,
giới hạn số như bảng `ACTION_LIMITS` trong game.js (panel và server dùng chung bản chuẩn hoá: server có
bản sao `dapMuoiNormalizeAction` vì không nạp file client — ghi chú rõ trong code như Nhặt Lá).

Hotkey: mỗi hành động có ô phím tắt như Nhặt Lá; Electron đăng ký `globalShortcut` qua
`global.__dapmuoiApplyHotkeys(cfg)` (sao mẫu `__nhatlaApplyHotkeys` trong `electron-main.js`), gọi API
`/api/dapmuoi/test` với `action` + `params` của hành động.

## 6. Config mặc định (`makeDefaultDapMuoiConfig` = `HpGame.dapmuoi.defaultConfig()`)

```js
{
  enabled: true,
  hitMode: 'clap', clapDistance: 1.2, clapSpeed: 900, slapSpeed: 1200, clapCooldownMs: 250,
  hitRadius: 14,                 // % bề rộng sân khấu
  speed: 180, mosquitoScale: 100, faceAttract: true, faceRadius: 260,
  gentlePercent: 35, crowdFrom: 120, smartPercent: 10, smartLives: 3,
  spawnPerSecond: 6, maxOnScreen: 300, idleSpawnSeconds: 8, maxPerGift: 100,
  coinsPerMosquito: 1, giftRules: [],
  actions: [ /* 4 hành động mặc định: release 20, spray r600/2500ms/50, racket 10s, net 15s */ ],
  sound: { enabled: true, volume: 0.5 },
  display: { showHud: true, hudXPercent: 50, hudYPercent: 8, hudScale: 100, showHitRing: true, showSkeleton: false },
  quality: 'auto'
}
```

Nguồn camera: **không** có trường riêng — dùng nguồn chung của Game Camera (`camgames.source`); nếu trống,
`getOptions` lấy nguồn game camera khác đang bật như hiện nay. Overlay báo lỗi "chưa có hình" sau 4 s như
Touch & Play.

## 7. Overlay (`overlay.html`)

- Nền trong suốt 1080×1920, `fitOverlay` 9:16 như Touch & Play. Socket `subscribe` room `overlay`/`preview`;
  trong app (`?mode=review`) **không** chạy AI (như Chém Trái Cây `isReview`).
- Feed: `socket.emit('touchplay:feed', 'dapmuoi')`; `touchplay:frame` → `createImageBitmap` →
  `tracker.pushFrame(bmp, cameraToStage(layout, …, 'dapmuoi'))`; bận thì bỏ khung.
- `tracker.want({ hands: true, pose: true, face: false })`.
- Mỗi rAF: `clap.update(...)` → `engine.hit(...)`; nếu racket đang bật `engine.sweep()` theo mỗi lòng bàn
  tay; `engine.setFace(pose[0])`; `engine.step(dt)`; vẽ.
- Vẽ bằng canvas 2D: 2 ảnh SVG nạp thành `Image`, cache theo cỡ; muỗi bay vẽ `muoi.svg` lật gương theo
  `dir`, nhịp cánh = 2 khung cánh vẽ xen kẽ theo `phase` (không dùng animation CSS trong SVG khi vẽ
  canvas — vẽ 2 lớp cánh với góc xoay tự tính). Muỗi chết vẽ `muoi-lat-ngua.svg` xoay theo lắc, alpha
  giảm. Vòng sóng điểm đập, đám mây xịt (gradient xanh lá mờ), tia điện vợt (đường gấp khúc quanh tay).
- HUD: "🦟 Còn lại N · ✋ Đã đập N · combo xN", kéo được trong app (`reviewEditMode` như Nhặt Lá, lưu
  `display.hudX/YPercent`).
- Âm thanh WebAudio: 1 oscillator sawtooth ~520 Hz + vibrato 6 Hz, gain = `volume × min(1, sqrt(n/40))`,
  tắt hẳn khi n = 0; đập trúng: noise burst 60 ms; xịt: noise dài 1 s; vợt: tiếng rè ngắn.
- Chế độ chuột (test, cả review và overlay): click = đập tại con trỏ với `hitRadius`; giữ chuột = tay
  cho vợt.
- Nhận `dapmuoi:gift`, `gameCmd` (`start|stop|reset|clear`), `gameConfig`, `gameDisabled/Enabled`
  (tắt → dừng feed, ẩn canvas), `overlay:reload`.
- Báo sức khoẻ: `touchplay:overlayStat` mỗi 2 s với `{ fps, aiMs, hands, phase }` (panel hiện).

## 8. Panel (`dapmuoi-panel.js`, section `view-dapmuoi`)

Thẻ theo thứ tự: 📺 Trạng thái (OBS/feed/tay nhận được, nút Xoá hết muỗi, Thử: thả 20 / xịt / vợt / màn),
✋ Cách đập (hitMode, độ nhạy khoảng cách/tốc độ, bán kính, hiện vòng đập), 🦟 Muỗi (tốc độ, cỡ, % bay nhẹ, ngưỡng đàn, % thông minh + số mạng, sinh nền,
trần, bám mặt), 🎁 Quà ra muỗi (bảng giftRules + xu/con + trần một lượt, chọn quà từ gift sheet như các
panel khác), 🛟 Hành động (danh sách 4 loại, mỗi dòng: icon, tên, quà, tham số, hotkey, bật/tắt; nút thêm
theo loại), 🔊 Âm thanh, 🖥 Hiển thị (HUD vị trí/cỡ), Link OBS (nhắc dùng link Game Camera).
Lưu qua `POST /api/games/dapmuoi/config`; panel chỉ GỬI, không áp lại echo (memory relay-cfg).

## 9. Server

- `/api/dapmuoi/test` POST `{ action, qty?, params? }` → emit `dapmuoi:gift` nguồn `test`.
- `/api/dapmuoi/control` POST `{ cmd }` ∈ `start|stop|reset|clear` → `gameCmd`.
- `handleDapMuoiGift({ giftId, giftName, giftImage, coinValue, repeatCount, nickname, profilePicture, source })`.
- `camGamesApplyActive` tự bao `dapmuoi` nhờ `CAM_GAME_IDS`.
- Config POST: giữ `display` khi thiếu (thêm `'dapmuoi'` vào danh sách tại `server.js` gần dòng 4729),
  gọi `global.__dapmuoiApplyHotkeys`.

## 10. Kiểm thử

- `npm test`: engine + clap (node --test, không DOM).
- Overlay không cần người: chế độ chuột; hoặc DevTools `window.__dm.tracker.pushFrame(bitmap, M)` ảnh
  `pose.jpg` để kiểm tra mặt/hút muỗi. Preview pane ẩn thì rAF đứng — bước tay `window.__dm.step(ms)`.
- Camera thật trong OBS: bật Game Camera → chọn Đập Muỗi → vỗ tay; chỉnh độ nhạy trong panel.

## 11. Ngoài phạm vi / rủi ro

- 2 tay chập nhau làm model tay rớt: đã có luật 2 và dự phòng cổ tay; nếu thực tế vẫn hụt nhiều, hạ
  `clapSpeed` hoặc chuyển `hitMode: 'both'`.
- Nhiều muỗi (300) vẽ canvas với ảnh cache: dự kiến < 4 ms/khung; nếu nặng, giảm `maxOnScreen`.
- Không chép code đối thủ (jqsvn).
