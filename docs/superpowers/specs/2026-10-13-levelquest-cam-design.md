# 🎯 Level Quest bám đầu người — game con của 🎥 Game Camera

- Ngày: 13/10/2026 · Trạng thái: thiết kế đã duyệt từng phần trong chat, chờ duyệt spec
- Liên quan: Bắn Cung bám người (`public/games/bancung/body-track.mjs`, `overlay.html` → `followBody()`),
  Game Camera (`public/games/camgames/`), feed camera OBS chung (`lib/touchplay-obs-feed.js`),
  `public/lib/body-frames.mjs` (Đập Muỗi dùng)

## Mục tiêu

Thanh 🎯 LEVEL QUEST (tên nhân vật + huy hiệu cấp + thanh 💎 / ❤ / 🔄) **bay trên đỉnh đầu người thật**
trong camera như thanh máu tướng Liên Quân, bám theo người qua feed camera OBS (giống hàng tim Bắn Cung).
Sau đó Level Quest là **game con của 🎥 Game Camera** và **không còn trong menu chính** (Thư viện Game / lưới trang chủ).

Thành công khi: chọn Level Quest trong Game Camera → link `/overlay/camgames` trong OBS hiện thanh quest ngay
trên đầu streamer, đi theo khi họ di chuyển, KPI vẫn lên cấp như cũ; khách đang dùng link Level Quest cũ không bị ảnh hưởng.

## Quyết định đã chốt (chat 13/10/2026)

1. **Game con như các game khác** — Game Camera hiện MỘT game một lúc. Chọn game camera khác thì thanh quest ẩn
   khỏi link Game Camera, nhưng **KPI vẫn đếm ngầm** (trang điều khiển trong app vẫn chạy), quay lại vẫn còn tiến trình.
2. **Hướng 1**: thêm chế độ `?cam=1` vào chính `public/_prototype/level-quest.html` + module dùng chung nhỏ
   `public/lib/head-anchor.mjs`. Không tách Level Quest thành game chuẩn, không import code Bắn Cung.
3. Hiển thị (Phần 1) như mục dưới — đồng hồ đếm lùi giữ cố định ở góc; mất người thì về chỗ mặc định chứ không ẩn.
4. Khởi động nhanh **giữ** Level Quest (nút ▶/■/⟲ đồng hồ quest dùng giữa LIVE).
5. Phần "Bắn Cung → Game Camera" đang chưa commit được commit riêng TRƯỚC khi làm việc này (xem mục Thứ tự).

## Hành vi trên OBS (chế độ `?mode=overlay&cam=1`)

**Vị trí**
- Cả cụm thanh quest căn giữa theo **đỉnh đầu** (trục ngang); **mép dưới** cụm cách đỉnh đầu `camGap` px
  (mặc định 20) + 8% bề rộng đầu.
- Kẹp trong khung: cụm hẹp hơn khung thì tâm bị chặn trong `[bw/2+6, W−bw/2−6]`; rộng hơn khung thì căn giữa khung.
  Mép trên không nhỏ hơn 6px (người sát mép trên thì thanh đè lên đầu chứ không ra ngoài khung).
- **Không xoay** theo nghiêng đầu — chữ luôn đọc được.

**Cỡ**
- `s = camScale/100 × k`, `k = clamp(headW / 180, 0.65, 1.4)` (cùng công thức Bắn Cung). `camScale` mặc định 55.
- Ước tính: cụm rộng ~1010px ở 100% → ~560px ở 55% → dao động ~360–780px theo khoảng cách camera.

**Chuyển động**
- Vị trí và cỡ trượt mượt theo thời gian thật: `α = 1 − exp(−dt/90ms)`; thay đổi < 2px (và < 0.01 cỡ) bỏ qua để không rung.
- Hiệu ứng nhấp nhô (`floatingEnabled`) **tự tắt khi đang bám đầu**, bật lại theo cài đặt khi về chỗ mặc định.

**Mất người** (`HeadAnchor.get()` trả `null` — pose cũ hơn 700ms)
- Giữ nguyên chỗ cũ **1.5 giây** (cúi đầu / che mặt chốc lát).
- Sau đó trượt về **chỗ mặc định**: giữa ngang, mép trên cụm cách mép trên khung 30px, cỡ `camScale/100` (không nhân `k`).
- Thấy người lại → trượt về trên đầu.
- Chưa nối OBS / chưa chọn nguồn / chưa có hình / model chưa nạp: thanh nằm ở chỗ mặc định, game vẫn chạy.
  **Không** hiện chữ cảnh báo trên OBS — lý do hiện ở ô trạng thái Game Camera trong app.

**Không đổi**
- Đồng hồ đếm lùi (`.quest-timer`, cố định góc trên phải), hiệu ứng lên cấp, toàn bộ logic KPI.
- Link cũ `/_prototype/level-quest.html?mode=overlay` (không `cam=1`): không nạp module mới, hiển thị y như hiện tại.

## Thành phần

### 1. `public/lib/body-frames.mjs` (thuần, test bằng node)
- Khung đầu thêm `crown` — công thức chép từ `BcBodyTrack.body()`: đỉnh đầu = tâm đầu lùi ngược hướng `v`
  một đoạn `0.72 × width` (tóc tính vào). Không đổi `O/u/v/width` hiện có → Đập Muỗi không đổi hành vi.
- `headAnchor(frames)` → `{ crown:{x,y}, headW }` | `null`. Có khung đầu → dùng `head.crown/head.width`;
  không có đầu nhưng có thân → `crown` = giữa vai lùi lên `0.95 × shoulderW`, `headW = 0.55 × shoulderW`.
- `placeAbove(anchor, box, W, H, opts)` → `{ x, yBottom, s }`: tâm ngang, mép dưới, tỉ lệ của cụm.
  `box = {w,h}` là cỡ GỐC của cụm (chưa scale), `opts = { scale, gap }`. Áp mọi luật Vị trí/Cỡ ở trên.
- `homePlace(box, W, H, opts)` → `{ x, yBottom, s }` chỗ mặc định khi mất người.
- `followStep(prev, target, dt, tau = 90)` → placement mới (lọc mũ + vùng chết 2px / 0.01). `prev == null` → `target`.

### 2. `public/lib/head-anchor.mjs` (mới, ~100 dòng)
`new HeadAnchor({ socket, gameId: 'level-quest', width, height, onStatus })` — chép khuôn nối feed của Bắn Cung/Đập Muỗi:
- `setEnabled(true)`: `HpTracker.startExternal()` + `want({ hands:false, pose:true, segment:false })`,
  `socket.emit('touchplay:feed', gameId)`; nối lại khi socket `connect`. `setEnabled(false)`: `emit(..., false)` + `tracker.stop()`.
- `touchplay:frame` → giải mã JPEG (bỏ khung khi đang bận) → `cameraToStage(layout, bw, bh, W, H, gameId)` → `tracker.pushFrame`.
- `touchplay:layout` / `touchplay:feedStatus` lưu lại.
- `get(now)` → `headAnchor(bodyFrames(tracker.pose, prev))` nếu pose mới hơn 700ms, ngược lại `null`.
- `problem()` → chuỗi lý do (giống `BcBodyTrack.problem()`), `''` = ổn.
- Mỗi 2s `touchplay:overlayStat { fps, aiMs, hands:0, pose:0|1, delegate, phase:'level-quest' }`.
- `width/height` = `window.innerWidth/innerHeight` của overlay (như Bắn Cung) → toạ độ là px CSS của trang.

### 3. `public/_prototype/level-quest.html`
- `const IS_CAM = IS_OVERLAY && new URLSearchParams(location.search).get('cam') === '1'`.
- Bọc `#questGroup` trong `<div id="lqAnchor">`. Transform bám đầu đặt trên `#lqAnchor`
  (`position:fixed; left:0; top:0; transform-origin:50% 100%; transform: translate(x−w/2, yBottom−h) scale(s)`),
  hiệu ứng nhấp nhô vẫn ở `.quest-group` → hai transform không đè nhau.
- Chỉ khi `IS_CAM`: `import('/lib/head-anchor.mjs')` động, `window.__lqHead` để thử trong DevTools; vòng `requestAnimationFrame`
  đo `box` một lần (và khi cfg font/KPI đổi), gọi `get()` → `placeAbove`/`homePlace` → `followStep` → ghi transform;
  bật/tắt class `lq-tracking` (tắt nhấp nhô).
- cfg thêm `camScale` (55, 20–150) và `camGap` (20, −40–200): vào `cfg` mặc định, `saveCfg/loadCfg`,
  `serializeCfgForSync`, `applyConfig` (kẹp giá trị). Panel thêm mục **"🎥 Trên đầu (Game Camera)"** với 2 ô này.
- **Sửa lỗi relay** (memory `relay-cfg-panel-chi-gui-khong-nhan`): `applyRemoteCfg` và handler `overlay:reload`
  thêm `if (!IS_OVERLAY) return;` — trang điều khiển là nguồn duy nhất, không tự đè cfg bằng bản cache cũ và không
  tự tải lại mỗi lần app mở màn Level Quest. Overlay giữ nguyên hành vi nghe hai sự kiện này.

### 4. `server.js`
- `CAM_GAME_IDS` thêm `'level-quest'` (cuối danh sách, cùng thứ tự `registry.js`). **Không** vào `CAM_STANDALONE_IDS`:
  Level Quest không đọc `enabled` nên `camGamesApplyActive()` bật/tắt cờ đó vô hại, link cũ vẫn hiện, KPI vẫn đếm.
- `touchplayFeed.overlayMatchers['level-quest'] = url => camGameInHub('level-quest') && feedUrlIs(url, 'camgames', /\/overlay\/camgames/i)`.
- `getOptions`: `per['level-quest'] = camGameInHub('level-quest') ? '' : null` — dùng nguồn camera chung `camgames.source`.
- `GAMES.camgames.description` thêm "Level Quest".

### 5. Game Camera + app
- `public/games/camgames/registry.js`: thêm
  `{ id:'level-quest', name:'Level Quest', icon:'🎯', desc:'Thanh level kiểu Liên Quân bay trên đầu: 💎 / ❤ / 🔄 lấp đầy để lên cấp.', track:'Đầu · vai', note:'KPI vẫn đếm khi đang chơi game khác.', overlay:'/_prototype/level-quest.html?mode=overlay&cam=1' }`
  (không `standalone`).
- `camgames-panel.js`: ô "Overlay OBS" coi `phase` thuộc `{'bancung','level-quest'}` là game pose → "thấy người / chưa thấy người".
- Menu chính: thêm vào registry là đủ — `CAM_CHILD_GAMES` (`public/app.js`) lọc khỏi Thư viện Game và lưới trang chủ.
- `public/index.html` `#view-level-quest`: thêm nút `← Game Camera` (`hpOpenGame('camgames')`) như Bắn Cung;
  nút "📋 Link OBS" đổi chữ thành "📋 Link riêng (đứng yên)" + tooltip "Trong Game Camera dùng link Game Camera".
- `public/quick-launch.html`: không đổi.

## Luồng dữ liệu

```
TikTok gift/like/share ─► trang điều khiển Level Quest (iframe #lq-frame trong app, luôn nạp)
                           └─ levelquest:cfg / levelquest:state ─► server relayCache ─► overlay (link cũ | iframe Game Camera)
OBS camera ─► server GetSourceScreenshot ─► touchplay:frame/layout ─► HeadAnchor (pose) ─► crown/headW
                                                                         └─► placeAbove → followStep → transform #lqAnchor
```

## Lỗi & trường hợp biên
- Nạp `head-anchor.mjs` / model lỗi → bắt lỗi, `onStatus` log console, thanh ở chỗ mặc định (không vỡ overlay).
- Nhiều người trong khung: theo người duy nhất MediaPipe Pose trả về (như Bắn Cung) — không chọn người.
- Mở màn cài đặt Level Quest từ Game Camera vẫn phát `overlay:reload {gameId:'level-quest'}` → overlay trong OBS tải lại,
  ~5s nạp model thì thanh ở chỗ mặc định rồi về trên đầu (giống Bắn Cung). Chấp nhận.
- Overlay 4K (`res=4k`): Level Quest không dùng `overlay-resolution.js` (giữ như cũ); toạ độ bám đầu theo `innerWidth/innerHeight` nên vẫn khớp.

## Ngoài phạm vi
- Lưu cfg Level Quest lên server (`/api/games/level-quest/config`) — bước 3 của memory relay-cfg, làm riêng nếu cần.
- Refactor Bắn Cung sang dùng `body-frames.mjs` / `head-anchor.mjs`.
- Chạy Level Quest song song với game camera khác.

## Test
1. `node --test tests/body-frames.test.mjs` (lưu ý `npm test` chỉ quét `*.test.js`): test cũ vẫn qua +
   `crown` (đứng thẳng: đỉnh đầu ở trên tâm tai 0.72×width), `headAnchor` (fallback từ vai), `placeAbove`
   (căn giữa, chặn mép trái/phải, cụm rộng hơn khung, chặn mép trên, `k` kẹp 0.65/1.4), `homePlace`, `followStep`
   (hội tụ, vùng chết, `prev=null`).
2. Preview (server thử riêng, cổng 3010 — Electron giữ 3000):
   - Game Camera chọn Level Quest → `/overlay/camgames` nạp iframe `…level-quest.html?mode=overlay&cam=1`.
   - `__lqHead.socket.emit('touchplay:feed', false)` rồi `tracker.pushFrame` ảnh `pose.jpg` mẫu → mép dưới `#lqAnchor`
     nằm trên đỉnh đầu, trọn trong khung (đo `getBoundingClientRect`).
   - Ngừng nạp ảnh → sau ~1.5s về chỗ mặc định.
   - Link cũ: ảnh chụp trước/sau giống nhau.
   - Cộng KPI khi Game Camera đang chọn Đập Muỗi → quay lại Level Quest thấy đúng tiến trình.
   - Thư viện Game / trang chủ không còn Level Quest; thẻ Game Camera có Level Quest, ⚙ mở màn cài đặt có `← Game Camera`.
   - Mở màn Level Quest: log trang điều khiển không bị xoá (không tự tải lại).
3. Camera thật: scene OBS `HP Đập Muỗi TEST` + webcam thật, khi user ngồi trước camera.

## Thứ tự
1. Commit riêng phần "Bắn Cung → Game Camera" đang nằm trong working tree (sau khi chắc phiên khác không còn sửa).
2. Làm Level Quest theo plan (viết bằng writing-plans) trên nền commit đó.
