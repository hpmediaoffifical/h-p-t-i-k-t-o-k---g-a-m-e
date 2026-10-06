# Chém Trái Cây — game chém hoa quả điều khiển bằng tay qua webcam

Ngày: 2026-10-06. Trạng thái: đã duyệt ý tưởng, chờ duyệt spec.

## 1. Mục tiêu

Thêm game `chemtraicay` vào HP Action LIVE: streamer dùng ngón trỏ (nhận diện qua webcam) để chém trái cây bay trên overlay OBS trong suốt 1080×1920. Quà TikTok sinh ra trái cây, bom và các buff. Toàn bộ chạy trong app, không cần phần mềm camera-tracking ngoài, không cần OBS Interact.

Đối chiếu game gốc (jqsvn.com/tiktok-fruit-slash + GGTT): GGTT chỉ là vỏ WebView2; tracking chạy trong trình duyệt bằng `getUserMedia` + nhận diện tay, đẩy 21 điểm bàn tay qua WebSocket nội bộ về trang game trong OBS. Ta tái hiện cùng kiến trúc trên nền socket.io sẵn có của app.

Pha 1 chỉ nhận diện **tay** (2 tay). Mặt và body để pha sau, dùng cùng pipeline, chỉ đổi model.

## 2. Thành phần

| Thành phần | File | Vai trò |
|---|---|---|
| Overlay OBS | `public/games/chemtraicay/overlay.html` | Vẽ game trên canvas 1080×1920, nhận tay + quà qua socket |
| Engine | `public/games/chemtraicay/game.js` | Logic thuần (sinh quả, vật lý, chém, bom, buff, vườn tích tụ). Không đụng DOM, test được bằng `node --test` |
| Tracker | `public/games/chemtraicay/tracker.html` + `tracker.js` | Mở webcam, chạy MediaPipe HandLandmarker, gửi tọa độ tay |
| Panel | `public/games/chemtraicay/chemtraicay-panel.js` | Giao diện cài đặt trong app: 4 tab Cài đặt / Quà / Camera / Hiển thị |
| Server | `server.js` | Đăng ký game, route, relay tay, map quà, đổi Scene OBS |
| MediaPipe | `public/lib/mediapipe/` | `vision_bundle.mjs`, `wasm/vision_wasm_internal.{js,wasm}`, `hand_landmarker.task` (≈20 MB, offline) |

Đi theo đúng checklist "Convention khi thêm game mới" trong CLAUDE.md: entry trong `GAMES`, route `/overlay/chemtraicay`, section `#view-chemtraicay` trong `index.html`, `openChemTraiCay()` trong `app.js`, CSS prefix `.ctc-*`, route riêng dưới `/api/chemtraicay/*`.

## 3. Luồng dữ liệu

```
Webcam ─► tracker (MediaPipe, 30fps) ─socket 'chemtraicay:hand'─► server relay ─► overlay (OBS) + preview (panel)
TikTok gift ─► emitGift() ─► handleChemTraiCayGift() ─'chemtraicay:gift'─► overlay + preview
Overlay ─'chemtraicay:state' (2 Hz)─► server cache ─► preview (panel hiện điểm, vườn, buff)
Overlay ─'chemtraicay:event' {start|end}─► server ─► obsBridge.setCurrentScene (nếu bật)
```

### 3.1 Tracker → overlay (`chemtraicay:hand`)

Gửi tối đa 1 gói / 16 ms (≈60/s), chỉ khi có tay. Khi mất tay gửi 1 gói `hands: []` rồi im.

```js
{ id: 'trk_ab12', t: 1234567, fps: 28, aspect: 1.777,
  hands: [ { side: 'L'|'R', pts: [x0,y0, x1,y1, …, x20,y20] } ] }  // 42 số, 0..1, đã gương nếu bật
```

Server: `onTrusted('chemtraicay:hand')` (tracker ở loopback hoặc có token → trusted), kiểm tra kiểu và clamp 0..1, rồi `io.to('overlay').to('preview').emit(...)`. Không lưu đĩa, không throttle thêm ở server (giống `nhatla:transient`).

**Một tracker tại một thời điểm.** Tracker gửi `chemtraicay:tracker {id, active:true}` khi bật camera; server ghi `activeTrackerId` và phát `chemtraicay:trackerStatus {activeId}`. Gói `hand` từ id khác id đang active bị bỏ. Tracker không active tự tạm dừng camera và hiện "Đang dùng tracker khác". Tracker ngắt socket hoặc im quá 3 s → server xóa activeId, phát trạng thái, tracker còn lại tự tiếp quản.

### 3.2 Ánh xạ tọa độ camera → overlay

Camera thường 16:9 ngang, overlay 9:16 dọc. Config `camRect {xPercent, yPercent, widthPercent, heightPercent}` mô tả khung hình camera **đầy đủ, chưa crop** nằm ở đâu trên overlay 1080×1920. `camRect = null` nghĩa là tự tính kiểu "cover" từ `aspect` tracker gửi: cao 100 %, rộng = 1920 × aspect / 1080 (16:9 → 316 %), căn giữa (x = −108 %). Khi streamer kéo khung ở chế độ edit thì lưu giá trị cụ thể. Ở overlay `?edit=1` hiện khung mờ "Vùng camera" kéo/thả, resize được, POST `/api/games/chemtraicay/config` khi thả (mẫu bancung). Điểm tay `(x,y)` → overlay: `X = camRect.x + x·camRect.w`, `Y = camRect.y + y·camRect.h`.

### 3.3 Quà → hành động

Config `giftRules: [{ giftId, giftName, giftImage, action, count, enabled }]`. `action` là 1 trong 15:

| Nhóm | action |
|---|---|
| Quả (10) | `apple, orange, lemon, pear, peach, strawberry, plum, watermelon, pineapple, kiwi` |
| Nguy hiểm | `bomb` |
| Buff | `god` (Thần Chém), `fast` (Tăng Tốc), `slow` (Giảm Tốc), `rescue` (Giải Cứu) |

`handleChemTraiCayGift(g)` được gọi từ `emitGift` (cùng try/catch như các game khác): tìm rule theo `String(giftId)`, tính `qty = rule.count × max(1, repeatCount)`, cắt trần `maxPerGift` (mặc định 30), phát `chemtraicay:gift {action, qty, nickname, profilePicture, giftName, image, source}` cho `overlay` + `preview`. Quà không có rule thì bỏ qua. Nút "Gửi thử" trong panel gọi `POST /api/chemtraicay/test {action, qty}` → cùng event với `source:'test'`.

## 4. Luật chơi (engine `game.js`)

Mọi số đều lấy từ config, mặc định bằng game gốc.

- **Sinh quả:** hàng đợi spawn, xả `spawnPerSecond` (mặc định 3) để quà 30 cái không dội một lúc. Quả bay lên từ mép dưới theo parabol, đỉnh ở `peak` % chiều cao (72), tốc độ nền `baseSpeed` (0.65), kích thước `objectScale` (1.5). Tùy chọn `idleSpawnSeconds` (0 = tắt) tự sinh quả ngẫu nhiên khi không có quà, để chơi thử.
- **Chém:** mỗi tay có lưỡi dao tại điểm 8 (đầu ngón trỏ). Mỗi khung, đoạn thẳng từ vị trí dao cũ → mới, nới `cutRadius` px (15), cắt quả nào giao hitbox. Quả bị cắt tách 2 mảnh văng ra, mảnh còn cắt tiếp được tới độ sâu `cuts` (2). Mỗi nhát +`points` (10). Combo: nhát liên tiếp trong 1 s tăng số hiện "COMBO ×n".
- **Vườn tích tụ:** quả hoặc mảnh rơi hết khỏi mép dưới mà chưa cắt đủ → cộng `pileStep` % (5) vào vườn. Vườn ≥ `danger` % (50) → thua: hiện bảng điểm, âm `end`, dừng 4 s rồi về màn chờ.
- **Bom:** chém bom → nổ bán kính `blast` % (24) đẩy quả lân cận rơi vào vườn, −`bombPenalty` (50). Trong lúc Thần Chém, bom là quả vàng chém được +điểm.
- **Buff:** `god` cộng `godSeconds` (10); `fast` nhân tốc độ `fastFactor` (1.7) trong `fastSeconds` (10); `slow` nhân `slowFactor` (0.55) trong `slowSeconds` (10). Fast và slow triệt tiêu thời gian còn lại của nhau. `rescue` trừ `rescuePercent` % (100) khỏi vườn.
- **Bắt đầu / dừng:** màn chờ có nút "Giữ để bắt đầu": giữ đầu ngón trỏ trên nút `holdSeconds` (0.85) hoặc giữ chuột. Panel cũng có nút Bắt đầu / Dừng / Đặt lại qua `POST /api/chemtraicay/control {cmd}` → `gameCmd`.
- **Điểm:** `score` trong phiên, giữ qua các ván tới khi "Đặt lại". Overlay phát `chemtraicay:state {score, pile, buffs, playing, fps}` 2 Hz; server cache bản mới nhất và gửi cho `preview` để panel hiện.

Engine API (thuần, không DOM):

```js
const eng = HpGame.chemtraicay.createEngine(config, { width:1080, height:1920, now });
eng.enqueue(action, qty);   eng.setBlade(side, x, y, present);
eng.step(dtMs);             eng.start(); eng.stop(); eng.reset();
eng.snapshot()  // { score, pile, buffs, playing, objects:[{id,kind,x,y,r,rot,depth}], events:[{type:'cut'|'bomb'|'land'|'end'|…}] }
```

Overlay chỉ vẽ `snapshot()` và phát âm theo `events`.

## 5. Hình và âm thanh

- Quả vẽ bằng canvas (hình tròn/elip, màu, họa tiết đơn giản, mảnh cắt là nửa hình) để không dùng atlas của jqsvn. Pha sau: upload PNG riêng từng loại (mẫu `/api/games/nhatla/upload`).
- Âm thanh: `public/games/chemtraicay/assets/*.mp3` do ta tự tạo (tổng hợp ngắn bằng WebAudio nếu chưa có file): `slice, swish, explode, land, buff, rescue, start, end, combo`. Có `volume` (0.5) và nút "Thử âm thanh".
- HUD: Tổng điểm, Vườn tích tụ (thanh + %), buff đang chạy (đếm ngược), combo, thông báo quà "{nick} tặng {quà} → {qty} {tên}" (`showNotices`). Tắt bật từng mục: `showScore, showDanger, showNotices`.
- `quality`: `auto | low | high` (số hạt, bóng, nét cắt).

## 6. Tracker (`tracker.html`)

- Một trang dùng cho 2 ngữ cảnh: nhúng iframe trong tab Camera của panel (`?embed=1`, iframe có `allow="camera"`), hoặc mở trong Chrome (`/tracker/chemtraicay`, panel gọi `window.open` → Electron chuyển qua `shell.openExternal`).
- Lý do có nút Chrome: Electron của app đang tắt GPU, tracking chạy WASM CPU. Chrome có GPU nên nhẹ máy hơn. Tracker ở Chrome vẫn là loopback nên vẫn trusted.
- Giao diện: chọn camera (`enumerateDevices` videoinput, nhớ `deviceId` trong `localStorage`), độ phân giải 640×360 / 1280×720, gương (mặc định bật), preview có vẽ khung xương 21 điểm, FPS, trạng thái socket, nút Bật/Tắt camera.
- MediaPipe: `HandLandmarker.createFromOptions(vision, { baseOptions:{ modelAssetPath:'/lib/mediapipe/hand_landmarker.task', delegate:'GPU' }, runningMode:'VIDEO', numHands:2 })`; nếu tạo GPU lỗi thì thử lại `delegate:'CPU'`. Vòng `requestAnimationFrame` + `detectForVideo`. Trang có `visibilitychange` không dừng (app đã tắt throttling nền).
- Làm mượt: EMA hệ số 0.5 trên 21 điểm trước khi gửi.
- Khi tab Camera trong panel bị đóng, iframe vẫn giữ camera (tracking phải chạy khi streamer xem tab khác). Chỉ tắt khi bấm "Tắt camera" hoặc tracker khác lên active.

## 7. Server

- `GAMES.chemtraicay = { id, name:'Chém Trái Cây', description, icon:'🍉', overlayPath:'/overlay/chemtraicay', defaultConfig: makeDefaultChemTraiCayConfig() }`. Backfill key mới khi nâng cấp (mẫu bancung :1595).
- Route: `GET /overlay/chemtraicay`, `GET /tracker/chemtraicay`, `POST /api/chemtraicay/control`, `POST /api/chemtraicay/test`, `GET /api/chemtraicay/state`.
- Socket: `onTrusted('chemtraicay:hand')`, `onTrusted('chemtraicay:tracker')`, `onTrusted('chemtraicay:state')`, `onTrusted('chemtraicay:event')`. Khi `subscribe` vào `overlay`/`preview`: gửi `gameConfig`, `chemtraicay:trackerStatus`, state cache.
- Scene OBS: config `obsScene { enabled, playScene, backScene }`. Sự kiện `start` → `obsBridge.setCurrentScene(playScene)`; `end` → `backScene` (rỗng = không đổi). Lỗi OBS chỉ log, không chặn game.
- `handleChemTraiCayGift` cắm vào `emitGift` cạnh `handleBanCungGift`.

## 8. Config mặc định

```js
{ enabled:true,
  showNotices:true, showScore:true, showDanger:true, volume:0.5, quality:'auto',
  cutRadius:15, baseSpeed:0.65, objectScale:1.5, peak:72, points:10, bombPenalty:50, blast:24,
  danger:50, cuts:2, pileStep:5, godSeconds:10, fastFactor:1.7, fastSeconds:10,
  slowFactor:0.55, slowSeconds:10, rescuePercent:100, holdSeconds:0.85,
  spawnPerSecond:3, maxPerGift:30, idleSpawnSeconds:0,
  camRect:null, // null = tự tính "cover" từ aspect tracker gửi (16:9 → rộng 316 %, x −108 %, cao 100 %)
  mirror:true,
  giftRules:[],
  obsScene:{ enabled:false, playScene:'', backScene:'' },
  display:{ scale:100, xPercent:50, yPercent:50 } }
```

## 9. Panel (`#view-chemtraicay`)

Header chuẩn `.game-header` + `.overlay-bar`: 📋 Link OBS (`buildOverlayURL('/overlay/chemtraicay')`), Chỉnh vị trí (popout `?edit=1`), Tải lại overlay, Lưu. Thẻ trạng thái: tracker (đang chạy ở app / Chrome / không có), điểm, vườn, buff.

Tabs:
1. **Cài đặt**: slider/number cho mọi tham số mục 4, theo 3 nhóm giống game gốc (Hiển thị & âm thanh, Vùng chém, Vật lý & tính điểm, Sức mạnh cộng dồn). Nút Khôi phục mặc định (xác nhận).
2. **Quà**: danh sách rule, bộ chọn quà sao chép mẫu `.nd-gp-*` của bancung, dropdown 15 hành động, số lượng, bật/tắt. Khối "Gửi thử": chọn hành động + số lượng.
3. **Camera**: iframe tracker `?embed=1` + nút "Mở tracker trong Chrome" + ghi chú khi nào nên dùng.
4. **Hiển thị**: Scene OBS (dropdown từ `/api/obs-bridge/scenes`, cần OBS đã kết nối), bật/tắt HUD, hướng dẫn chỉnh "Vùng camera" ở overlay edit.

Lưu: debounce 350 ms, `POST /api/games/chemtraicay/config` toàn bộ config (mẫu bancung). Nghe `gameConfig` echo để đồng bộ.

## 10. Lỗi và biên

- Không có camera / bị từ chối: tracker hiện lỗi rõ ("Không tìm thấy camera" / "Bị từ chối quyền"), overlay vẫn chạy bằng chuột (debug) và nhận quà.
- Camera bận do OBS giữ độc quyền: hiện gợi ý "Tắt nguồn camera trong OBS hoặc dùng camera khác". Không thử lại vòng lặp.
- Model không tải được: báo lỗi, nút Thử lại; không treo trang.
- Overlay mất socket: hiện chấm đỏ góc nhỏ, dao đứng yên, quả vẫn rơi bình thường.
- Gói `hand` sai kiểu: server bỏ, không ném.
- 2 PC: overlay ở PC2 dùng `?token=` như nhatla; tracker vẫn chạy ở PC1 (nơi có app).

## 11. Kiểm thử

- `tests/chemtraicay-engine.test.js` (`node --test`, thêm script `npm test`): sinh quả theo hàng đợi, parabol đạt đỉnh đúng, cắt bằng đoạn thẳng + bán kính, độ sâu cắt, vườn tích tụ và thua, bom nổ + trừ điểm, Thần Chém đổi bom, fast/slow triệt tiêu, rescue, hold-to-start, cắt trần `maxPerGift`.
- Server: test relay `chemtraicay:hand` bỏ gói sai và gói từ tracker không active (test nhẹ bằng cách tách hàm validate ra `lib/chemtraicay-relay.js`).
- Thủ công: mở tracker trong app và Chrome, kiểm tra chuyển active; overlay trong OBS với camera thật; test quà qua `POST /api/games/chemtraicay/test-gift`.

## 12. Ngoài phạm vi pha 1

Nhận diện mặt/body, upload ảnh quả, bảng xếp hạng người tặng, Bảng Quà Tổng adapter, chế độ free theo xu.
