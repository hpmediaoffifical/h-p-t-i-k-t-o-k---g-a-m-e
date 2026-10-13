# Tracking người thật từ Camera trong OBS qua WebSocket — Cách hoạt động

> Tài liệu nội bộ HP Media (06/10/2026). Mô tả **cơ chế tracking dùng chung** trong HP Action LIVE
> (đang chạy cho Touch & Play, Bắn Cung bám người, Chém Trái Cây). Đọc xong là đủ để tự gắn tracking
> vào game/hiệu ứng mới (vd đóng băng / lửa / nước cho PK).

---

## 1. Ý tưởng chính

```
 Camera thật ──► OBS (nguồn camera nằm trong scene, streamer để như mọi ngày)
                  │
                  │  obs-websocket v5  (ws://127.0.0.1:4455)
                  │   • GetSourceScreenshot   ~20 lần/giây  → 1 khung JPEG của nguồn camera
                  │   • GetSceneItemList…     ~1 lần/giây   → vị trí/cỡ/crop/lật/xoay của camera & overlay
                  ▼
           Server Node của app
                  │
                  │  socket.io (room 'touchplay:feed')
                  │   • 'touchplay:frame'   JPEG nhị phân
                  │   • 'touchplay:layout'  bố cục scene
                  ▼
   Overlay = Browser Source trong OBS, nền TRONG SUỐT, đặt đè lên camera
     1. giải mã JPEG → ImageBitmap
     2. tính ma trận M: pixel ảnh camera → toạ độ sân khấu (1080×1920) theo bố cục OBS
     3. chạy MediaPipe ngay trong Browser Source (model tự host, không cần mạng)
     4. ra: khớp cơ thể / tay / mặt + mặt nạ người — tất cả đã ở toạ độ sân khấu
     5. game chỉ việc đọc và vẽ hiệu ứng lên đúng chỗ người
```

**3 nguyên tắc:**

1. **Không tự mở webcam** (`getUserMedia`). Camera đã có trong OBS → lấy hình từ chính nguồn đó qua obs-websocket. Mở webcam riêng là giành thiết bị với OBS / TikTok LIVE Studio.
2. **Overlay trong suốt.** Không vẽ lại camera; OBS tự hiện camera ở lớp dưới, overlay chỉ vẽ hiệu ứng.
3. **Toạ độ theo bố cục OBS.** Streamer kéo / thu nhỏ / crop / lật / xoay camera trong OBS thì hiệu ứng vẫn dính đúng người (≤ 1 giây là cập nhật).

---

## 2. File trong repo HP Action LIVE

| Tầng | File |
|---|---|
| Server chụp camera + gửi bố cục | `lib/touchplay-obs-feed.js` (class `ObsCameraFeed`), khởi tạo trong `server.js` (`new ObsCameraFeed`) |
| Toán quy đổi toạ độ OBS | `public/lib/obs-scene-map.mjs` |
| Nhận diện (MediaPipe) | `public/lib/hp-tracking.mjs` (class `HpTracker`) |
| Model + WASM tự host | `public/lib/mediapipe/` |
| Ví dụ client hoàn chỉnh (lọc mượt, mặt nạ, khung bám người) | `public/games/bancung/body-track.mjs`, `mask-smooth.mjs` |
| Test | `tests/obs-scene-map.test.mjs`, `tests/mask-smooth.test.mjs` |

---

## 3. Tầng 1 — Server lấy hình từ OBS

### 3.1 Lệnh obs-websocket dùng tới

| Lệnh | Tần suất | Mục đích |
|---|---|---|
| `GetSourceScreenshot` `{sourceName, imageFormat:'jpg', imageWidth:960, imageCompressionQuality:75}` | 15–30/giây | Chụp 1 khung của nguồn camera |
| `GetVideoSettings` | 10 giây/lần | Cỡ canvas OBS (dọc 1080×1920 hay ngang) |
| `GetCurrentProgramScene` | 1 giây/lần | Scene đang phát |
| `GetSceneItemList` / `GetGroupSceneItemList` | 1 giây/lần | Transform của camera và của Browser Source (đệ quy vào group / scene lồng ≤ 3 tầng) |
| `GetInputSettings` | cache 3 giây | Đọc `url` Browser Source để biết cái nào là overlay của game nào |
| `GetInputList` | khi mở panel | Cho streamer chọn nguồn camera |

### 3.2 Vòng chụp

```js
// Chỉ chụp khi CÓ overlay đang nghe — không ai xem thì OBS không tốn gì.
if (!enabled || !source || !obs.connected || subscribers() === 0) return 1000;

if (now - layoutAt > 1000) refreshLayout();      // bố cục 1 lần/giây
if (inflight < 2) shot();                        // tối đa 2 yêu cầu song song (OBS chụp ở luồng đồ hoạ)
return 1000 / fps;                               // 15 / 20 / 30 tuỳ chất lượng

async function shot() {
  const r = await obs.call('GetSourceScreenshot', {
    sourceName: source, imageFormat: 'jpg', imageWidth: 960, imageCompressionQuality: 75
  });
  const buf = Buffer.from(r.imageData.split(',')[1], 'base64');
  // volatile: client đang bận thì BỎ khung, không dồn hàng → không trễ tích luỹ
  io.to('touchplay:feed').volatile.emit('touchplay:frame', { seq: ++seq, ts: Date.now(), img: buf });
}
```

- Gửi **JPEG nhị phân**, không gửi chuỗi base64 (nhẹ hơn ~33%).
- `volatile.emit`: tracking cần **hình mới nhất**, không cần đủ từng khung.
- **Một feed dùng chung** cho mọi game: client đăng ký kèm `gameId`, server biết game nào đang chạy để chọn nguồn camera phù hợp.
- Không thấy camera trong scene đang phát (vd đang ở scene hiệu ứng) → **giữ bố cục cũ**, không reset.

### 3.3 Giao thức socket.io

| Chiều | Sự kiện | Dữ liệu |
|---|---|---|
| client → server | `touchplay:feed` | `'<gameId>'` để đăng ký · `false` để huỷ |
| server → client | `touchplay:frame` | `{ seq, ts, ms, img: <JPEG bytes> }` |
| server → client | `touchplay:layout` | `{ canvas:{w,h}, scene, cam:{found, chain[]}, overlays:{<gameId>:{found, chain[]}} }` |
| server → client | `touchplay:feedStatus` | `{ obsConnected, source, fps, live, camFound, overlayFound, error }` |
| client → server | `touchplay:overlayStat` | `{ fps, aiMs, pose, delegate }` — OBS chạy trình duyệt riêng, app không nhìn vào được nên overlay tự báo sức khoẻ |

`chain[]` = các transform **từ ngoài vào trong** (scene → group → item), mỗi phần tử gồm
`positionX/Y, rotation, scaleX/Y, alignment, sourceWidth/Height, cropLeft/Right/Top/Bottom, boundsType, boundsAlignment, boundsWidth/Height`.

> Nhận diện overlay theo `url` của Browser Source — nhớ match cả **link chia sẻ** `/overlay/shared/<token>` (không chứa tên game).

---

## 4. Tầng 2 — Quy đổi toạ độ ảnh camera → sân khấu

Ảnh chụp là **nguồn camera gốc** (chưa crop/scale). Trên màn hình, OBS đã crop / scale / bounds / lật / xoay nó; overlay cũng là một item khác có transform riêng. Chuỗi ma trận:

```
pixel ảnh chụp (bw×bh)
  → pixel nguồn gốc                    scale(sourceWidth/bw, sourceHeight/bh)
  → pixel canvas OBS                   chainMatrix(cam.chain)
  → pixel cục bộ Browser Source        inverse(chainMatrix(overlay.chain))
  → sân khấu 1080×1920                 "contain", căn giữa
```

```js
import { cameraToStage, apply } from '/lib/obs-scene-map.mjs';
const M = cameraToStage(layout, bmp.width, bmp.height, 1080, 1920, gameId);
const p = apply(M, xAnh, yAnh);     // {x, y} trên sân khấu
```

`itemMatrix()` tái hiện đúng thứ tự `update_item_transform()` của libobs: **crop → scale (hoặc bounds) → trừ gốc theo alignment → xoay → cộng position**; xử lý đủ các kiểu bounds (`SCALE_INNER/OUTER/TO_WIDTH/TO_HEIGHT/STRETCH/MAX_ONLY`) và scale âm (lật gương). Ma trận affine `[a,b,c,d,e,f]`: `X = a·x + c·y + e`, `Y = b·x + d·y + f`.

---

## 5. Tầng 3 — Nhận diện trong overlay

### 5.1 Nhận khung → đẩy vào tracker

```js
socket.emit('touchplay:feed', gameId);
socket.on('touchplay:layout', l => layout = l);
socket.on('touchplay:frame', async f => {
  if (busy) return;                     // đang giải mã → bỏ khung, luôn dùng hình mới nhất
  busy = true;
  try {
    const bmp = await createImageBitmap(new Blob([f.img], { type: 'image/jpeg' }));
    tracker.pushFrame(bmp, cameraToStage(layout, bmp.width, bmp.height, W, H, gameId));
  } finally { busy = false; }
});
```

### 5.2 `HpTracker`

```js
import { HpTracker } from '/lib/hp-tracking.mjs';
const tracker = new HpTracker({ width: 1080, height: 1920, mirror: false });
tracker.want({ hands: false, pose: true, segment: true });   // chỉ bật model cần dùng; GỌI TRƯỚC khi model nạp
await tracker.startExternal();                               // nguồn = khung từ OBS
```

Đầu ra (toạ độ sân khấu, đọc mỗi khung vẽ):

```js
tracker.pose   // [{x, y, v}×33]  v = visibility (0 mũi, 7/8 tai, 11/12 vai, 15/16 cổ tay, 23/24 hông, 27/28 cổ chân)
tracker.seg    // { w, h, data: Float32Array(w*h) 0..1, M }   mặt nạ người; M: pixel mặt nạ → sân khấu
tracker.hands  // [{ id, pts[21], tip, palm, pinch, pinching, size }]
tracker.face   // { mouth:{x,y}, open:0..1, width } | null
tracker.poseAt / segAt / handsAt   // thời điểm có kết quả — cũ quá ~450–700 ms coi như mất người
```

Chi tiết đáng biết:
- **Chỉ bật model cần dùng.** Bỏ model tay khi chỉ cần body: AI 98 ms → 24 ms mỗi lượt (đo trong preview).
- **Mặt nạ người** (`segment:true`) cho phép phủ màu đúng hình người (tóc, áo, đồ cầm tay), không chỉ khung xương. Cờ này chỉ đọc lúc tạo model → phải `want()` trước khi start.
- **Tay / mặt** chạy trên phần ảnh **đang hiện trên sân khấu** (cắt sát → tay to → bắt tốt). **Body** chạy trên ảnh nguyên khung (dang tay ra ngoài khung dọc vẫn bắt).
- Mặt và body chạy **xen kẽ** khung khi bật cả hai, để không nhân đôi tải.
- GPU delegate trước; WebGL chạy phần mềm (SwiftShader / llvmpipe / OBS tắt tăng tốc phần cứng) → tự chuyển CPU.
- Kết quả MediaPipe phải `r.close()` — mặt nạ nằm trong bộ nhớ WASM/GPU, không đóng là rò.
- Model pose nạp mất **~5 giây** sau khi reload overlay.
- Muốn nhận **2 người** (PK chung 1 camera): tạo PoseLandmarker với `numPoses: 2` → mỗi người một bộ khớp + một mặt nạ (`r.landmarks[i]`, `r.segmentationMasks[i]`). Model không giữ thứ tự giữa các khung → tự ghép người theo khoảng cách gần nhất với khung trước; mỗi người một bộ lọc riêng.

---

## 6. Làm mượt — bắt buộc

Model chạy 12–24 lần/giây, màn hình vẽ 60 lần/giây → không lọc là rung và giật.

**Khớp xương** — lọc mũ theo **thời gian thật** (không theo số khung, để OBS 30 hay 60 fps đều mượt như nhau):
```js
const k = 1 - Math.exp(-dt / 55);   // hằng số ~55 ms: bám sát mà không rung
s.x += (raw.x - s.x) * k;  s.y += (raw.y - s.y) * k;
```

**Mặt nạ người** (`mask-smooth.mjs`): nửa độ phân giải → box blur 2 lượt (≈ Gauss) → lọc thời gian **thích nghi** (đổi ít = nhiễu → nén mạnh; đổi nhiều = cử động → theo ngay) → cắt lại quanh 0.4–0.6 cho viền trơn mà sắc.
Trước khi trộn khung cũ/mới, **dời bộ đệm theo tâm của chính mặt nạ** (không dùng tâm khung xương — nó rung, gây nhảy cóc). Đo: lệch 4.5 → 1.6 px, chi phí 4.2 → 6.3 ms/mặt nạ.

**Đừng tin nhãn trái/phải** của model (ảnh có thể đã lật trong OBS) — xếp theo điểm nào nằm bên trái MÀN HÌNH.

---

## 7. Dùng kết quả để vẽ hiệu ứng (kỹ thuật chung)

**Vẽ mặt nạ lên canvas theo ma trận** (canvas hiệu ứng nửa độ phân giải là đủ, rẻ gấp 4):
```js
ctx.setTransform(M[0]*k, M[1]*k, M[2]*k, M[3]*k, M[4]*k, M[5]*k);   // k = 0.5
ctx.drawImage(maskCanvas, 0, 0);
```

**Nhuộm mặt nạ thành 1 màu, giữ alpha:**
```js
c.drawImage(bodyMask, 0, 0);
c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, w, h);
```

**Lấy viền người:** vẽ mặt nạ đã nhuộm với `filter: blur(Npx)` rồi `destination-out` bằng mặt nạ gốc → còn mỗi quầng quanh người.

**Điểm sinh hạt:** lấy mẫu pixel của `seg.data` — `0.3 < v < 0.7` là **viền**, `v > 0.8` là **trong người**; đổi ra sân khấu bằng `apply(seg.M, x, y)`.

**Bám điểm vào người khi người di chuyển:** dựng khung cục bộ từ khớp — thân: gốc = giữa 2 vai, trục u = vai→vai, trục v = vai→hông. Lưu điểm dạng `(a, b)`, mỗi khung tính lại `P = O + a·u + b·v` → điểm đi theo người khi họ xoay/di chuyển.

Chưa có mặt nạ → vẽ "bóng người" từ 33 khớp làm dự phòng.

---

## 8. Hai cách đặt tracker

| | **Tracker trong overlay** (Touch & Play, Bắn Cung) | **Tracker trang riêng** (Chém Trái Cây; giống phần mềm GGTT) |
|---|---|---|
| Ai chạy AI | Chính Browser Source trong OBS | Trang tracker riêng, gửi điểm khớp qua socket cho overlay |
| Ưu | Không phải mở thêm gì; có **mặt nạ người**; trễ thấp | Overlay nhẹ; nhiều overlay dùng chung 1 tracker |
| Nhược | AI dùng CPU/GPU của OBS | Phải giữ trang tracker mở; cần trọng tài "chỉ 1 tracker active"; gửi mặt nạ qua socket rất nặng |

👉 Hiệu ứng phủ lên hình người cần mặt nạ → dùng **tracker trong overlay + feed dùng chung**.

---

## 9. Test không cần camera / OBS thật

- **Ảnh mẫu thay camera** (DevTools của overlay): ngắt feed `socket.emit('touchplay:feed', false)`, rồi
  ```js
  const bmp = await createImageBitmap(await (await fetch('https://storage.googleapis.com/mediapipe-assets/pose.jpg')).blob());
  tracker.pushFrame(bmp, [1080 / bmp.width, 0, 0, 1080 / bmp.width, 0, 300]);   // M tự đặt
  ```
- **Toán toạ độ:** `node --test tests/obs-scene-map.test.mjs` (thêm ca lật, xoay, group, bounds).
- **OBS giả:** `obs-websocket-js` mặc định nói **msgpack** (`obswebsocket.msgpack`) — server giả nói JSON sẽ kẹt "connecting".
- Trình duyệt nhúng / preview render bằng phần mềm → số ms bi quan gấp nhiều lần OBS thật, chỉ so tương đối. Tab ẩn thì rAF đứng.

---

## 10. Bẫy đã gặp

1. Dùng `emit` thường thay vì `volatile` → client chậm dần, trễ vài giây.
2. Quên crop / bounds / lật khi quy đổi → hiệu ứng lệch khỏi người hàng trăm pixel.
3. Bật `segment` sau khi model đã nạp → không có mặt nạ.
4. Không `close()` kết quả MediaPipe → rò bộ nhớ.
5. Lọc theo số khung thay vì thời gian thật → mượt khác nhau giữa máy.
6. Match overlay chỉ theo tên game trong URL → hỏng với link chia sẻ có token.
7. Reset bố cục khi chuyển sang scene không có camera → hiệu ứng nhảy lung tung.
8. Đổi port server tự động → URL Browser Source đã dán trong OBS chết; dùng port cố định.
9. Hiệu ứng che mặt streamer → luôn có thanh chỉnh độ đậm / tắt từng lớp.
