# Chém Trái Cây (hand tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm game `chemtraicay` vào HP Action LIVE: ngón trỏ nhận diện qua webcam chém trái cây trên overlay OBS, quà TikTok sinh quả/bom/buff.

**Architecture:** Engine thuần JS (không DOM) chạy trong overlay; tracker (trang riêng, nhúng iframe trong panel hoặc mở Chrome) chạy MediaPipe HandLandmarker và đẩy 21 điểm mỗi tay qua socket.io; server chỉ relay, map quà và đổi Scene OBS. Theo đúng "Convention khi thêm game mới" của CLAUDE.md và mẫu bancung/nhatla.

**Tech Stack:** Node 24 + Express + socket.io 4 (có sẵn), `@mediapipe/tasks-vision` 1.0.1 vendored tại `public/lib/mediapipe/`, canvas 2D, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-chemtraicay-hand-tracking-design.md`

## Global Constraints

- Làm trong git worktree riêng, nhánh `feature/chemtraicay`, tách từ `release-v1.7.0-clean` (một phiên Claude khác đang sửa working tree chính). Sau khi tạo worktree: copy `hpkey/secret.local.js` (CLAUDE.md) và copy `public/lib/mediapipe/` (hand_landmarker.task, vision_bundle.mjs, wasm/vision_wasm_internal.{js,wasm}) từ tree chính; nếu thiếu thì lấy từ tarball `@mediapipe/tasks-vision@1.0.1` + `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task`.
- Game id `chemtraicay`, tên "Chém Trái Cây", icon 🍉, CSS prefix `.ctc-`, route riêng `/api/chemtraicay/*`. Không dùng `/api/games/chemtraicay/*` ngoài `/config`, `/state`, `/cmd`, `/test-gift` có sẵn.
- 15 action: `apple orange lemon pear peach strawberry plum watermelon pineapple kiwi bomb god fast slow rescue`.
- Config mặc định và tên key đúng spec mục 8. Mọi gói socket phía server đều validate kiểu + clamp, không ném.
- Không sao chép ảnh/âm thanh của jqsvn. Hình quả vẽ canvas, âm thanh tổng hợp WebAudio.
- File mới: LF. Khi patch `public/index.html`, `public/app.js`, `public/style.css` giữ CRLF của file.
- Overlay 1080×1920, `<script src="/lib/overlay-resolution.js">` là tag đầu trong `<head>`.
- Commit sau mỗi task, message tiếng Việt, kết thúc bằng `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Gói `chemtraicay:hand` có `pts` không phải 42 số hoặc giá trị ngoài 0..1 (NaN, chuỗi) → server bỏ gói, không ném, overlay không nhận. (Task 4)
2. Quà `repeatCount` 999 với rule `count` 10 → tổng cắt trần `maxPerGift` 30, hàng đợi xả 3/giây, không đóng băng overlay. (Task 1, 5)
3. Tay biến mất giữa nhát chém (gói `hands: []`) → dao được đánh dấu vắng, nhát tiếp theo không vẽ đoạn thẳng từ vị trí cũ xa → không "chém ma". (Task 2)
4. Fast rồi Slow liên tiếp → thời gian còn lại của Fast bị trừ bằng thời gian Slow (triệt tiêu), hệ số tốc độ trở về 1 khi cả hai hết. (Task 3)
5. Hai tracker cùng bật (app + Chrome) → chỉ tracker active mới được relay; tracker active ngắt → tracker còn lại được nhận sau khi server xóa activeId. (Task 4)

---

### Task 1: Engine — hàng đợi sinh quả và quỹ đạo bay

**Files:**
- Create: `public/games/chemtraicay/game.js`
- Create: `tests/chemtraicay-engine.test.js`
- Modify: `package.json` (thêm `"test": "node --test tests/"`)

**Interfaces:**
- Produces: `game.js` xuất `HpGame.chemtraicay` (browser) và `module.exports` (node) gồm:
  - `ACTIONS` = mảng 15 string theo thứ tự spec; `FRUITS` = 10 string đầu.
  - `defaultConfig()` → object mục 8 spec (deep copy).
  - `createEngine(config, { width=1080, height=1920 })` → `{ enqueue(action, qty), setBlade(side, x, y, present), step(dtMs), start(), stop(), reset(), snapshot(), setConfig(cfg) }`.
  - `snapshot()` → `{ playing, score, pile, combo, buffs:{god,fast,slow} (ms còn lại), queue, objects:[{id, kind, x, y, r, vx, vy, rot, depth, golden}], events:[...] }`. `events` được xóa sau mỗi `snapshot()`.
  - Đơn vị: px overlay, thời gian ms, `y` tăng xuống dưới, `r` = bán kính hitbox = `40 * objectScale`.

- [ ] **Step 1: Viết test thất bại** trong `tests/chemtraicay-engine.test.js`

```js
const { createEngine, defaultConfig, ACTIONS } = require('../public/games/chemtraicay/game.js');
test('ACTIONS có đúng 15 hành động theo thứ tự spec', () => assert.deepEqual(ACTIONS, ['apple','orange','lemon','pear','peach','strawberry','plum','watermelon','pineapple','kiwi','bomb','god','fast','slow','rescue']));
test('enqueue cắt trần maxPerGift và xả theo spawnPerSecond', () => {
  const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 3, maxPerGift: 30 }); eng.start();
  eng.enqueue('apple', 999);
  assert.equal(eng.snapshot().queue, 30);
  eng.step(1000);                     // 1 s → tối đa 3 quả xuất hiện
  assert.equal(eng.snapshot().objects.length, 3);
});
test('quả bay lên tới đỉnh peak% rồi rơi xuống', () => {
  const eng = createEngine({ ...defaultConfig(), peak: 72, spawnPerSecond: 100 }); eng.start();
  eng.enqueue('apple', 1); eng.step(16);
  let minY = 1920; for (let i = 0; i < 400; i++) { eng.step(16); const o = eng.snapshot().objects[0]; if (!o) break; minY = Math.min(minY, o.y); }
  assert.ok(Math.abs(minY - 1920 * (1 - 0.72)) < 60);
});
test('không start thì không sinh quả', () => { const eng = createEngine(defaultConfig()); eng.enqueue('apple', 2); eng.step(2000); assert.equal(eng.snapshot().objects.length, 0); });
```

- [ ] **Step 2: Chạy test, phải FAIL** — `npm test` → "Cannot find module '../public/games/chemtraicay/game.js'".
- [ ] **Step 3: Viết `game.js`** với UMD guard (`typeof module !== 'undefined' ? module.exports = api : (window.HpGame = window.HpGame || {}, window.HpGame.chemtraicay = api)`). Quỹ đạo: vị trí xuất phát `x` ngẫu nhiên trong 15–85 % rộng, `y = height + r`; vận tốc đầu `vy = -sqrt(2·g·h)` với `h = height·peak/100 + r`, `g = 1800 px/s²`, nhân `baseSpeed` × hệ số buff (Task 3); `vx` ngẫu nhiên ±120 px/s hướng về giữa. Xả hàng đợi bằng bộ tích lũy `spawnPerSecond·dt`. Xóa object khi `y > height + 2r` và đang rơi (tạm thời chỉ xóa; Task 3 thêm vườn).
- [ ] **Step 4: Chạy test, phải PASS** — `npm test`.
- [ ] **Step 5: Commit** — `git add package.json public/games/chemtraicay/game.js tests/chemtraicay-engine.test.js && git commit -m "chemtraicay: engine sinh quả + quỹ đạo bay"`.

### Task 2: Engine — dao chém, mảnh, điểm, combo

**Files:**
- Modify: `public/games/chemtraicay/game.js`
- Test: `tests/chemtraicay-engine.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: `setBlade(side:'L'|'R', x, y, present:boolean)`; event `{type:'cut', kind, x, y, points, combo}`; object field `depth` (0 = quả gốc, tăng mỗi lần cắt); `snapshot().blades = { L:{x,y,present}, R:{...} }`.

- [ ] **Step 1: Test thất bại**

```js
function oneFruitAt(eng, x, y) { eng.enqueue('apple', 1); eng.step(16); const o = eng.snapshot().objects[0]; o.x = x; o.y = y; o.vx = 0; o.vy = 0; return o; }
test('đoạn thẳng của dao cắt quả trong cutRadius → +points, tách 2 mảnh', () => {
  const eng = createEngine({ ...defaultConfig(), cutRadius: 15, points: 10, cuts: 2, spawnPerSecond: 100 }); eng.start();
  oneFruitAt(eng, 540, 900);
  eng.setBlade('R', 400, 900, true); eng.step(16);
  eng.setBlade('R', 700, 900, true); eng.step(16);
  const s = eng.snapshot();
  assert.equal(s.score, 10);
  assert.equal(s.objects.length, 2); assert.ok(s.objects.every(o => o.depth === 1));
  assert.ok(s.events.some(e => e.type === 'cut'));
});
test('mảnh đạt depth = cuts thì không cắt thêm', () => {
  const eng = createEngine({ ...defaultConfig(), cuts: 1, spawnPerSecond: 100 }); eng.start();
  oneFruitAt(eng, 540, 900);
  eng.setBlade('R', 400, 900, true); eng.step(16); eng.setBlade('R', 700, 900, true); eng.step(16);
  eng.setBlade('R', 400, 900, true); eng.step(16); eng.setBlade('R', 700, 900, true); eng.step(16);
  assert.equal(eng.snapshot().score, 10);
});
test('tay vắng rồi hiện lại không tạo đoạn thẳng ma', () => {
  const eng = createEngine({ ...defaultConfig(), spawnPerSecond: 100 }); eng.start();
  oneFruitAt(eng, 540, 900);
  eng.setBlade('R', 100, 900, true); eng.step(16);
  eng.setBlade('R', 100, 900, false); eng.step(16);
  eng.setBlade('R', 900, 900, true); eng.step(16);
  assert.equal(eng.snapshot().score, 0);
});
test('combo tăng khi nhát liên tiếp trong 1 s và về 0 sau 1 s', () => { /* 2 quả, 2 nhát cách 500 ms → combo 2; step 1100 ms → combo 0 */ });
```

- [ ] **Step 2: Chạy test, FAIL** — `npm test`.
- [ ] **Step 3: Cài đặt**: lưu `prev` mỗi dao; trong `step`, nếu `present && prev.present` thì tính khoảng cách đoạn thẳng–điểm cho từng object có `depth < cuts` (hoặc bomb); cắt nếu `dist ≤ r + cutRadius`. Cắt: xóa object, tạo 2 mảnh `depth+1`, `r·0.7`, `vx = ±180` theo pháp tuyến đoạn cắt, `vy = vy - 150`; `score += points`; combo cửa sổ 1000 ms.
- [ ] **Step 4: Test PASS.**
- [ ] **Step 5: Commit** — `chemtraicay: dao chém, mảnh và combo`.

### Task 3: Engine — vườn tích tụ, thua, bom, buff, giải cứu, hold-to-start

**Files:**
- Modify: `public/games/chemtraicay/game.js`
- Test: `tests/chemtraicay-engine.test.js`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: events `land {kind}`, `end {score}`, `bomb {x,y}`, `buff {kind}`, `rescue`, `start`; `snapshot().hold = { side, progress 0..1 }`; `holdTarget(x, y, r)` đặt vùng nút bắt đầu (overlay gọi khi ở màn chờ); `playing` false sau `end`, `score` giữ, `pile` về 0 khi `start()`.

- [ ] **Step 1: Test thất bại**

```js
test('quả rơi hết khỏi đáy → pile += pileStep; pile ≥ danger → end, playing=false, score giữ', () => {
  const eng = createEngine({ ...defaultConfig(), pileStep: 25, danger: 50, spawnPerSecond: 100 }); eng.start();
  for (let i = 0; i < 2; i++) { oneFruitAt(eng, 540, 1900); eng.snapshot().objects.forEach(o => { o.vy = 500; }); eng.step(500); }
  const s = eng.snapshot(); assert.equal(s.pile, 50); assert.equal(s.playing, false); assert.ok(s.events.some(e => e.type === 'end'));
});
test('chém bom → -bombPenalty và quả trong bán kính blast rơi vào vườn', () => { /* bomb tại (540,900), apple tại (600,900) với blast 24 % (=259 px) → score -50, pile += pileStep, apple biến mất */ });
test('god: bom thành vàng, chém được +points, không nổ', () => { /* enqueue('god') → buffs.god ≈ godSeconds*1000; chém bomb → score +10 */ });
test('fast và slow triệt tiêu thời gian của nhau', () => {
  const eng = createEngine({ ...defaultConfig(), fastSeconds: 10, slowSeconds: 4 }); eng.start();
  eng.enqueue('fast', 1); eng.step(16); eng.enqueue('slow', 1); eng.step(16);
  const b = eng.snapshot().buffs; assert.ok(Math.abs(b.fast - 6000) < 50); assert.equal(b.slow, 0);
});
test('rescue trừ rescuePercent khỏi pile, không âm', () => { /* pile 30, rescue 100 → 0 */ });
test('hold-to-start: giữ ngón trên nút holdSeconds thì start, thả sớm thì reset progress', () => {
  const eng = createEngine({ ...defaultConfig(), holdSeconds: 0.85 }); eng.holdTarget(540, 1000, 120);
  eng.setBlade('R', 540, 1000, true); eng.step(400); assert.ok(eng.snapshot().hold.progress > 0.4 && !eng.snapshot().playing);
  eng.setBlade('R', 900, 1000, true); eng.step(16); assert.equal(eng.snapshot().hold.progress, 0);
  eng.setBlade('R', 540, 1000, true); eng.step(900); assert.equal(eng.snapshot().playing, true);
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Cài đặt** theo spec mục 4. Hệ số tốc độ áp vào `vy` lúc sinh và vào `dt` của object đang bay (`dtEff = dt·speedMul`), `speedMul = fast>0 ? fastFactor : slow>0 ? slowFactor : 1`. `enqueue('god'|'fast'|'slow'|'rescue', qty)` áp `qty` lần (thời gian cộng dồn). Sau `end`: object xóa hết, `playing=false`; `start()` đặt `pile=0`, giữ `score`; `reset()` xóa cả `score`.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `chemtraicay: vườn tích tụ, bom, buff, giải cứu, giữ để bắt đầu`.

### Task 4: Relay module — validate gói tay và trọng tài tracker

**Files:**
- Create: `lib/chemtraicay-relay.js`
- Create: `tests/chemtraicay-relay.test.js`

**Interfaces:**
- Produces: `createRelay({ now = Date.now, staleMs = 3000 })` → `{ validateHand(data) → object|null, setActive(trackerId, socketId), activeId(), touch(trackerId), dropSocket(socketId) → boolean(đã xóa active), sweep() → boolean(đã xóa vì im), acceptHand(data, socketId) → object|null }`.
- `validateHand` trả về `{ id, t, fps, aspect, hands:[{side, pts:Float}] }` với `pts` 42 số đã clamp 0..1 làm tròn 3 chữ số; `null` nếu `hands` không phải mảng, > 2 tay, `pts` không đúng 42 số hữu hạn, `side` không phải `L|R`, `id` không phải string ≤ 32.
- `acceptHand` = validate + `data.id === activeId()` (+ `touch`), ngược lại `null`.

- [ ] **Step 1: Test thất bại** — 6 test: pts 41 số → null; pts có NaN → null; pts 1.7 → clamp 1; 3 tay → null; `acceptHand` của id không active → null, của id active → object; `dropSocket` của socket active → `activeId()` null; `sweep` sau 3001 ms không `touch` → null.
- [ ] **Step 2: FAIL** — `node --test tests/chemtraicay-relay.test.js`.
- [ ] **Step 3: Cài đặt** không phụ thuộc socket.io.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `chemtraicay: module relay tay + trọng tài tracker`.

### Task 5: Server — đăng ký game, route, socket, quà, Scene OBS

**Files:**
- Modify: `server.js` — các điểm neo (tìm bằng chuỗi, không tin số dòng): `const GAMES = {` (thêm entry cuối), `function makeDefaultBanCungConfig()` (thêm `makeDefaultChemTraiCayConfig()` ngay trên), `handleBanCungGift({` trong `emitGift` (thêm khối `handleChemTraiCayGift` ngay sau khối đó), `app.get('/overlay/bancung'` (thêm route cạnh), `onTrusted('nhatla:transient'` (thêm 4 handler cạnh), `socket.emit('nhatla:top'` trong `subscribe` (thêm snapshot), `socket.on('disconnect'` trong cùng connection (thêm `dropSocket`).
- Test: thủ công bằng curl (không có harness test server).

**Interfaces:**
- Consumes: Task 4 `createRelay`; `obsBridge.setCurrentScene(name)`; `onTrusted`, `io`, `appConfig.games.chemtraicay`.
- Produces (socket, server → client): `chemtraicay:hand` (gói đã validate, tới room `overlay` + `preview`), `chemtraicay:trackerStatus {activeId}` (tới tất cả), `chemtraicay:gift {action, qty, nickname, profilePicture, giftName, image, source}` (overlay + preview), `chemtraicay:state` echo cache (preview). Client → server (trusted): `chemtraicay:hand`, `chemtraicay:tracker {id, active}`, `chemtraicay:state {score,pile,buffs,playing,fps}`, `chemtraicay:event {type:'start'|'end'}`.
- REST: `GET /overlay/chemtraicay`, `GET /tracker/chemtraicay` (sendFile `tracker.html`), `POST /api/chemtraicay/control {cmd:'start'|'stop'|'reset'}` → `io.emit('gameCmd',{gameId:'chemtraicay',cmd})`, `POST /api/chemtraicay/test {action, qty}` → cùng `chemtraicay:gift` với `source:'test'`, `nickname:'Thử nghiệm'`, `GET /api/chemtraicay/state` → `{ state, activeTrackerId }`.
- `handleChemTraiCayGift({giftId, giftName, giftImage, nickname, profilePicture, repeatCount, source})`: rule theo `String(giftId)`, `enabled !== false`, `qty = min(maxPerGift, count × max(1, repeatCount))`.

- [ ] **Step 1: Thêm `makeDefaultChemTraiCayConfig()`** trả về object mục 8 spec, và entry `GAMES.chemtraicay` (`name:'Chém Trái Cây'`, `icon:'🍉'`, `description:'Ngón trỏ qua webcam chém trái cây bay trên overlay. Quà tặng sinh quả, bom, Thần Chém, Tăng/Giảm Tốc, Giải Cứu.'`). Backfill: sau khối seeding bancung (`appConfig.games.bancung` backfill), thêm vòng gán key thiếu cho `appConfig.games.chemtraicay` từ default.
- [ ] **Step 2: Thêm route + handler quà + socket** như Interfaces. Relay: `const chemRelay = createRelay()` cấp module; `setInterval(() => { if (chemRelay.sweep()) io.emit('chemtraicay:trackerStatus', { activeId: null }); }, 1000)`. Sự kiện `start`/`end` với `obsScene.enabled` → `obsBridge.setCurrentScene(playScene|backScene)` trong try/catch, scene rỗng bỏ qua.
- [ ] **Step 3: Kiểm tra** — chạy `node server.js` trong worktree (nhớ secret), rồi:

```bash
curl -s http://localhost:3000/api/games | grep -o '"id":"chemtraicay"'
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/overlay/chemtraicay   # 200 sau Task 6, 404 giờ là bình thường
curl -s -X POST http://localhost:3000/api/chemtraicay/test -H "Content-Type: application/json" -d '{"action":"watermelon","qty":3}'   # {"ok":true}
curl -s -X POST http://localhost:3000/api/chemtraicay/control -H "Content-Type: application/json" -d '{"cmd":"start"}'            # {"ok":true}
```

- [ ] **Step 4: Commit** — `chemtraicay: đăng ký game, route, relay tay, map quà, Scene OBS`.

### Task 6: Overlay OBS

**Files:**
- Create: `public/games/chemtraicay/overlay.html` (CSS + JS inline, giống bancung)

**Interfaces:**
- Consumes: `HpGame.chemtraicay.createEngine`, socket events Task 5, `gameConfig`, `gameCmd`, `gameDisabled/gameEnabled`, `overlay:reload`.
- Produces: `chemtraicay:state` mỗi 500 ms, `chemtraicay:event {type}` khi engine phát `start`/`end`. Query: `?edit=1` (kéo khung Vùng camera, POST `/api/games/chemtraicay/config` với `camRect`), `?token=` (auth LAN như nhatla), `?review=1` (subscribe `preview`).

- [ ] **Step 1: Khung trang**: `<head>` tag đầu `/lib/overlay-resolution.js`; body trong suốt 1080×1920; `<canvas id="ctc-canvas" width=1080 height=1920>`; HUD DOM: `.ctc-score`, `.ctc-pile` (thanh + %), `.ctc-buffs`, `.ctc-combo`, `.ctc-notices`, `.ctc-start` (nút "Giữ để bắt đầu" + vòng tiến độ), `.ctc-status-dot`, `.ctc-end` (bảng điểm 4 s).
- [ ] **Step 2: Socket**: `io({ transports:['websocket','polling'], auth:{token} })`; on connect `subscribe('overlay'|'preview')`, fetch `/api/games/chemtraicay/config`; áp `gameConfig` (engine `setConfig`), `gameCmd` (`start|stop|reset`), `chemtraicay:gift` → `engine.enqueue(action, qty)` + notice nếu `showNotices`, `chemtraicay:hand` → map `camRect` → `setBlade` cho từng tay (thiếu tay nào thì `present=false`), `gameDisabled` ẩn body.
- [ ] **Step 3: Ánh xạ camRect**: hàm `resolveCamRect(cfg, aspect)` trả px: nếu `cfg.camRect` null → cover (`h=1920`, `w=1920·aspect`, `x=(1080-w)/2`, `y=0`); ngược lại từ %. Điểm tay index 8 (`pts[16], pts[17]`).
- [ ] **Step 4: Vòng vẽ** `requestAnimationFrame`: `engine.step(dt)` (dt chặn ≤ 50 ms), vẽ object theo `kind` (quả: elip 2 màu + lá, mảnh: nửa elip theo `depth`, bomb: tròn đen + ngòi, golden khi `god`), vệt dao (10 điểm gần nhất mỗi tay, mờ dần), `quality` điều chỉnh số hạt + bóng. Sự kiện → âm thanh WebAudio tổng hợp (`slice` tiếng cắt ngắn, `explode` noise burst, `end` 3 nốt xuống, `buff` 2 nốt lên, `land` thump) với `volume`.
- [ ] **Step 5: Hold-to-start**: màn chờ gọi `engine.holdTarget(x, y, r)` theo vị trí nút; vòng tiến độ từ `snapshot().hold.progress`; chuột nhấn giữ cũng gọi `setBlade('M', …)` (dao thứ 3 chỉ dùng cho nút, không chém).
- [ ] **Step 6: Edit mode**: `?edit=1` hiện khung mờ "📷 Vùng camera" có 4 tay nắm góc, kéo/resize → cập nhật `camRect` % và POST config khi thả (mẫu bancung `?edit=1`).
- [ ] **Step 7: Kiểm tra** bằng preview (`preview_start` server của worktree, mở `/overlay/chemtraicay?review=1`): `POST /api/chemtraicay/test` thấy quả bay; dùng chuột kéo qua quả thấy điểm tăng; `read_console_messages` không lỗi.
- [ ] **Step 8: Commit** — `chemtraicay: overlay OBS vẽ game, HUD, âm thanh, chế độ chỉnh vùng camera`.

### Task 7: Tracker (webcam + MediaPipe)

**Files:**
- Create: `public/games/chemtraicay/tracker.html`
- Create: `public/games/chemtraicay/tracker.js` (ES module, `import { FilesetResolver, HandLandmarker } from '/lib/mediapipe/vision_bundle.mjs'`)

**Interfaces:**
- Consumes: `/lib/mediapipe/wasm`, `/lib/mediapipe/hand_landmarker.task`, socket events `chemtraicay:trackerStatus`.
- Produces: `chemtraicay:tracker {id, active:true|false}`, `chemtraicay:hand` đúng dạng Task 4 (`pts` 42 số, đã gương nếu `mirror`, EMA 0.5), tối đa 1 gói / 16 ms. `id` = `'trk_' + 4 ký tự ngẫu nhiên`, giữ trong `sessionStorage`. Query `?embed=1` ẩn tiêu đề, nền tối, vừa khung iframe.

- [ ] **Step 1: UI**: select camera (`enumerateDevices` → `videoinput`, nhớ `localStorage['ctc-cam']`), select độ phân giải (`640×360` mặc định, `1280×720`), checkbox gương (mặc định bật, lưu localStorage), nút "Bật camera"/"Tắt camera", `<video muted playsinline>` + canvas vẽ 21 điểm và đường nối, dòng trạng thái: FPS, socket, "Đang dùng tracker khác (id)".
- [ ] **Step 2: Nhận diện**: `HandLandmarker.createFromOptions(vision, { baseOptions:{ modelAssetPath:'/lib/mediapipe/hand_landmarker.task', delegate:'GPU' }, runningMode:'VIDEO', numHands:2, minHandDetectionConfidence:0.5 })`, lỗi → thử `delegate:'CPU'`; lỗi tiếp → hiện "Không nạp được model" + nút Thử lại. Vòng rAF: `detectForVideo(video, performance.now())`; `side` từ `handedness[i][0].categoryName` (`Left`→`L`), khi gương đảo lại. Gương: `x = 1 - x`.
- [ ] **Step 3: Gửi**: socket loopback (`io()`), khi bật camera emit `chemtraicay:tracker {id, active:true}`; nghe `trackerStatus`: `activeId !== id` → tạm dừng gửi + hiện thông báo; `activeId === null` và camera đang bật → emit lại `active:true` (tiếp quản). Khi mất tay: gửi 1 gói `hands: []`.
- [ ] **Step 4: Lỗi**: `NotFoundError` → "Không tìm thấy camera"; `NotAllowedError` → "Bị từ chối quyền camera"; `NotReadableError` → "Camera đang bị ứng dụng khác giữ (OBS?). Tắt nguồn camera trong OBS hoặc chọn camera khác." Không tự thử lại.
- [ ] **Step 5: Kiểm tra** trong preview: mở `/tracker/chemtraicay`, chọn camera, `read_console_messages` không lỗi; song song mở overlay `?review=1` thấy vệt dao di chuyển theo tay (nếu không có camera trong môi trường test: kiểm tra bằng gói giả qua socket từ `node -e` với socket.io-client... không có; thay bằng kiểm tra UI và trạng thái lỗi "Không tìm thấy camera").
- [ ] **Step 6: Commit** — `chemtraicay: tracker webcam MediaPipe, gương, trọng tài tracker`.

### Task 8: Panel trong app + sidebar + CSS

**Files:**
- Create: `public/games/chemtraicay/chemtraicay-panel.js` (IIFE → `window.HpChemTraiCayPanel = { open }`)
- Modify: `public/index.html` — thêm `<section id="view-chemtraicay" class="view game-view chemtraicay-view">` sau section `view-bancung`; thêm `<script src="/games/chemtraicay/game.js">` + `<script src="/games/chemtraicay/chemtraicay-panel.js">` sau `bancung-panel.js`.
- Modify: `public/app.js` — `STABLE_GAMES` thêm `'chemtraicay'`; `body.classList.remove(...)` thêm `'game-chemtraicay'`; chuỗi `openGame` thêm `else if (gameId === 'chemtraicay') openChemTraiCay(game);`; hàm `openChemTraiCay` theo mẫu `openBanCung`.
- Modify: `public/quick-launch.html` — `STABLE_IDS` thêm `'chemtraicay'`.
- Modify: `public/style.css` — khối `/* ============ CHÉM TRÁI CÂY ============ */` prefix `.ctc-` ở cuối file.

**Interfaces:**
- Consumes: `HpGame.chemtraicay.defaultConfig()`, `window.buildOverlayURL`, `window.hpCopyText`, `window.__giftSheet`, REST Task 5, socket `chemtraicay:state`, `chemtraicay:trackerStatus`, `gameConfig`.
- Produces: `open(socket)`.

- [ ] **Step 1: Section HTML**: header `.game-header` với `<h2>🍉 Chém Trái Cây</h2>`, `.overlay-bar` nút `#ctc-btn-copy` "📋 Link OBS", `#ctc-btn-edit` "🎯 Chỉnh vùng camera" (popout `/overlay/chemtraicay?edit=1`), `#ctc-btn-reload`, `#ctc-btn-save`; thẻ trạng thái `#ctc-status` (tracker / điểm / vườn / buff); 4 tab `.ctc-tabs` (Cài đặt, Quà, Camera, Hiển thị) với pane rỗng panel JS điền.
- [ ] **Step 2: Panel JS**: `open(socket)` subscribe `preview`, load config (`GET /api/games/chemtraicay/config` merge over default), `schedulePersist` 350 ms → `POST /api/games/chemtraicay/config` toàn bộ. Tab Cài đặt: render từ bảng mô tả `[{key, label, min, max, step, unit}]` đúng 19 tham số + `spawnPerSecond, maxPerGift, idleSpawnSeconds, holdSeconds, pileStep, rescuePercent`; nút "Khôi phục mặc định" có xác nhận; nút Bắt đầu/Dừng/Đặt lại → `POST /api/chemtraicay/control`. Tab Quà: danh sách `giftRules`, nút "+ Thêm quà" mở picker sao chép từ `bancung-panel.js` (`openGiftPicker/ensurePicker/renderPickerList`, class `.nd-gp-*`), mỗi dòng: ảnh + tên quà, `<select>` 15 action (nhãn tiếng Việt: Táo đỏ, Cam, Chanh vàng, Lê, Đào, Dâu tây, Mận tím, Dưa hấu, Dứa, Kiwi, Bom, Thần Chém, Tăng Tốc, Giảm Tốc, Giải Cứu), số lượng, bật/tắt, xóa; khối "Gửi thử" (select action + số lượng → `POST /api/chemtraicay/test`). Tab Camera: `<iframe src="/tracker/chemtraicay?embed=1" allow="camera; autoplay">` + nút "🌐 Mở tracker trong Chrome" (`window.open(location.origin + '/tracker/chemtraicay')`) + ghi chú "Dùng khi máy yếu: Chrome có GPU nên nhận diện nhẹ hơn. Chỉ một tracker chạy tại một thời điểm." Tab Hiển thị: toggle `showScore/showDanger/showNotices`, `quality`, `volume`, `mirror`; Scene OBS: checkbox bật + 2 `<select>` nạp từ `GET /api/obs-bridge/scenes` (lỗi → "Chưa kết nối OBS").
- [ ] **Step 3: Trạng thái sống**: nghe `chemtraicay:state` → cập nhật điểm/vườn/buff; `chemtraicay:trackerStatus` → "Tracker: đang chạy (id)" / "chưa có".
- [ ] **Step 4: CSS** `.ctc-tabs`, `.ctc-pane`, `.ctc-row` (label + input range + giá trị), `.ctc-gift-row`, `.ctc-cam-frame` (iframe cao 420 px), `.ctc-status` chips. Theo tông màu nền tối sẵn có của app (`#0e1118`, viền `#2c3243`).
- [ ] **Step 5: Kiểm tra** preview: mở app `http://localhost:3000`, sidebar có "Chém Trái Cây", mở view → 4 tab hoạt động, kéo slider → `GET /api/games/chemtraicay/config` phản ánh giá trị, thêm quà qua picker → lưu, "Gửi thử" → overlay `?review=1` thấy quả; `read_console_messages` không lỗi.
- [ ] **Step 6: Commit** — `chemtraicay: panel cài đặt, quà, camera, hiển thị + đăng ký sidebar`.

### Task 9: Tài liệu và rà soát cuối

**Files:**
- Modify: `CLAUDE.md` — dòng "Games hiện có" thêm `chemtraicay` (chém trái cây, tay qua webcam, MediaPipe tại `public/lib/mediapipe`).
- Modify: `docs/superpowers/specs/2026-10-06-chemtraicay-hand-tracking-design.md` — trạng thái "đã triển khai, nhánh feature/chemtraicay".

- [ ] **Step 1: `npm test` toàn bộ PASS.**
- [ ] **Step 2: Chạy app worktree, đi hết luồng**: Link OBS copy → mở overlay trong tab preview → Gửi thử → chuột kéo chém → điểm tăng; mở tracker app và Chrome (mô phỏng bằng 2 tab tracker) → chỉ 1 active, đóng tab active → tab kia tiếp quản.
- [ ] **Step 3: Commit** — `chemtraicay: cập nhật CLAUDE.md và spec`.
- [ ] **Step 4: Báo cáo** cho người dùng: nhánh, cách gộp vào `release-v1.7.0-clean` (phiên khác đang sửa working tree chính), các điểm chưa kiểm được bằng camera thật.
