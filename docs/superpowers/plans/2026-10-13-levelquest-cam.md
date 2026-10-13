# Level Quest bám đầu người — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thanh 🎯 LEVEL QUEST bay trên đỉnh đầu người thật (feed camera OBS chung) và là game con của 🎥 Game Camera, không còn trong menu chính.

**Architecture:** Hàm thuần (đỉnh đầu, đặt chỗ, lọc mượt) thêm vào `public/lib/body-frames.mjs`; lớp `HeadAnchor` mới (`public/lib/head-anchor.mjs`) nối feed + HpTracker pose-only; `level-quest.html` có chế độ `?mode=overlay&cam=1` dùng chúng để transform một wrapper `#lqAnchor`. Server/Game Camera chỉ thêm id + matcher + thẻ registry.

**Tech Stack:** HTML/JS thuần (ES modules), MediaPipe qua `public/lib/hp-tracking.mjs`, Express + socket.io, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-13-levelquest-cam-design.md`

## Global Constraints
- Id game: `'level-quest'` (có gạch). `phase` báo stat: `'level-quest'` (≤ 12 ký tự — feed cắt ở 12).
- Link Game Camera của game con: `/_prototype/level-quest.html?mode=overlay&cam=1`. Link cũ `?mode=overlay` (không `cam=1`) KHÔNG nạp module mới, hiển thị y cũ.
- Cỡ: `s = camScale/100 × clamp(headW/180, 0.65, 1.4)`; `camScale` mặc định 55 (20–150); `camGap` mặc định 20 (−40–200); khoảng cách mép dưới = `camGap + 0.08 × headW`; lề khung 6px.
- Lọc: `α = 1 − exp(−dt/90)`, vùng chết 2px / 0.01 cỡ. Pose cũ hơn 700ms = mất người; giữ chỗ 1500ms rồi về chỗ mặc định (giữa ngang, mép trên cụm cách mép trên khung 30px, cỡ `camScale/100`).
- Không `standalone` cho Level Quest (không đọc `enabled`), không vào `CAM_STANDALONE_IDS`.
- Không ô chọn nguồn camera riêng — dùng `camgames.source` chung.
- File sửa đều LF. Không đổi logic KPI. Không động code Bắn Cung.
- Server thử: KHÔNG restart cổng 3010 (của phiên Bắn Cung, OBS user đang trỏ). Dùng server riêng cổng 3020 với kho data sao chép.

## Review Focus
1. Link cũ (OBS khách đang dán) phải trông y hệt trước — wrapper `#lqAnchor` không được đổi bố cục flex của `.stage`. → Task 2 bước so ảnh chụp trước/sau.
2. Đổi font/KPI trên panel khi đang bám đầu → cỡ gốc cụm đổi; phải đo lại `box`, không thì thanh lệch tâm/đè đầu. → Task 2 kiểm tra đổi `titleFs` khi đang bám.
3. Người đứng sát mép / sát đỉnh khung → thanh không tràn ra ngoài. → Task 1 test `placeAbove` chặn mép trái/phải/trên.
4. Mở màn Level Quest trong app không được làm trang điều khiển tự tải lại (mất log, chạy lại boot). → Task 2 kiểm tra log còn sau `openGame('level-quest')`.
5. Đổi hub sang game khác rồi quay lại: tiến trình KPI còn nguyên. → Task 3 kiểm tra.

---

### Task 1: Hàm thuần đỉnh đầu + đặt chỗ + lọc mượt (`body-frames.mjs`)

**Files:**
- Modify: `public/lib/body-frames.mjs` (khung đầu ~dòng 77–79; thêm export cuối file; cập nhật chú thích đầu file)
- Test: `tests/body-frames.test.mjs`

**Interfaces:**
- Produces:
  - `bodyFrames(...).head.crown: {x,y}` — `crown = O − 0.72·v` (|v| = width).
  - `headAnchor(F) → { crown:{x,y}, headW:number } | null` — `F.head` → `{crown: head.crown, headW: head.width}`; chỉ có thân → `crown = torso.O − (0, 0.95·shoulderW)` theo hướng `−v` chuẩn hoá, `headW = 0.55·shoulderW`; `!F || !F.seen` → `null`.
  - `placeAbove(anchor, box:{w,h}, W, H, {scale=0.55, gap=20}={}) → { x, yBottom, s }`.
  - `homePlace(box, W, H, {scale=0.55}={}) → { x: W/2, yBottom: 30 + box.h·scale, s: scale }`.
  - `followStep(prev, target, dt, tau=90) → { x, yBottom, s }` (trả lại đúng object `prev` khi trong vùng chết).

- [ ] **Step 1: Viết test (fail)** — thêm vào `tests/body-frames.test.mjs`, dùng `fakePose()` sẵn có (tai (440,690)/(640,690) → width 200, vai 340/740 y900):
  - `crown`: `bodyFrames(fakePose()).head.crown ≈ {x:540, y:546}` (±1e-6).
  - `headAnchor` có đầu → `{crown≈(540,546), headW:200}`; bỏ đầu (`0,2,5,7,8` v=0) → `crown≈(540,520)`, `headW≈220`; `headAnchor(bodyFrames(null))` → `null`.
  - `placeAbove({crown:{x:540,y:546},headW:200}, {w:1012,h:260}, 1080, 1920, {scale:0.55,gap:20})` → `x=540`, `yBottom=510`, `s≈0.61111`.
  - chặn mép: `crown.x=50` → `x≈315.2`; `crown.x=1060` → `x≈764.8`.
  - kẹp `k`: `headW=50` → `s≈0.3575`; `headW=400` → `s≈0.77`.
  - cụm rộng hơn khung: `scale:1.5, headW:252` → `x=540`.
  - chặn mép trên: `crown.y=100` → `yBottom ≈ 6 + 260·0.61111` (≈164.89).
  - `homePlace({w:1012,h:260},1080,1920,{scale:0.55})` → `{x:540, yBottom:173, s:0.55}`.
  - `followStep(null, t, 16)` deep-equals `t`; `followStep({x:0,yBottom:0,s:1},{x:100,yBottom:0,s:1},90)` → `x≈63.212`; vùng chết `prev={x:100,yBottom:100,s:.5}`, `target={x:101,yBottom:100.5,s:.505}` → `=== prev`; 60 bước dt=16 từ 0→100 → `|x−100| ≤ 2`.

- [ ] **Step 2: Chạy, xác nhận fail**
  Run: `node --test tests/body-frames.test.mjs` — Expected: các test mới FAIL (`headAnchor is not a function` / `crown` undefined), test cũ PASS.

- [ ] **Step 3: Cài đặt** trong `public/lib/body-frames.mjs` theo Interfaces + Global Constraints. `placeAbove`: `bw=box.w·s`, `x = bw+12 < W ? clamp(crown.x, bw/2+6, W−bw/2−6) : W/2`, `yBottom = crown.y − (gap + 0.08·headW)`, nếu `yBottom − box.h·s < 6` thì `yBottom = 6 + box.h·s`, rồi `yBottom = min(yBottom, H − 6)`. Thêm 5 dòng mô tả export mới vào chú thích đầu file.

- [ ] **Step 4: Chạy, xác nhận pass**
  Run: `node --test tests/body-frames.test.mjs` — Expected: tất cả PASS (gồm test Đập Muỗi cũ).

- [ ] **Step 5: Commit**
  `git add public/lib/body-frames.mjs tests/body-frames.test.mjs` → `feat(lib): body-frames — đỉnh đầu, headAnchor, placeAbove/homePlace/followStep`

### Task 2: `HeadAnchor` + chế độ `cam=1` trong Level Quest + sửa relay

**Files:**
- Create: `public/lib/head-anchor.mjs`
- Modify: `public/_prototype/level-quest.html` (CSS; markup `.stage`; panel; `cfg`; `saveCfg/loadCfg/serializeCfgForSync`; `applyRemoteCfg`; handler `overlay:reload`; BOOT)
- Create: `.claude/launch.json` entry `hp-levelquest-test` (cổng 3020, `HP_DATA_DIR` = bản sao `./data` trong scratchpad)

**Interfaces:**
- Consumes: Task 1 `bodyFrames`, `headAnchor`, `placeAbove`, `homePlace`, `followStep`; `HpTracker` (`startExternal()`, `want()`, `pushFrame(bmp,M)`, `stop()`, `pose`, `poseAt`, `fps`, `aiMs`, `delegate`); `cameraToStage(layout,bw,bh,W,H,gameId)`.
- Produces: `class HeadAnchor { constructor({socket, gameId='level-quest', width, height, onStatus}); setEnabled(on):Promise; get(now=performance.now()) → {crown,headW}|null; problem() → string; tracker; socket }`. Trong overlay: `window.__lqHead` = instance.

- [ ] **Step 1: Chụp ảnh link cũ TRƯỚC khi sửa** — chạy server 3020 (preview_start `hp-levelquest-test`), mở `/_prototype/level-quest.html?mode=overlay` cỡ 1080×1920, chụp màn hình lưu làm mốc.

- [ ] **Step 2: Viết `public/lib/head-anchor.mjs`** theo khuôn `BcBodyTrack` (constructor/setEnabled/_onFrame/problem/_reportStat) nhưng: `want({hands:false, pose:true, segment:false})`; `get()` gọi `bodyFrames(tracker.pose, this._F)` chỉ khi `tracker.poseAt` đổi, trả `null` nếu `now − tracker.poseAt > 700`; `_reportStat` mỗi 2s `{fps, aiMs, hands:0, pose:0|1, delegate, phase:'level-quest'}`; `problem()` câu chữ như Bắn Cung nhưng "cho Game Camera".

- [ ] **Step 3: Sửa `level-quest.html`**
  - Bọc `#questGroup` trong `<div id="lqAnchor">`. CSS: `body.lq-cam #lqAnchor{position:fixed;left:0;top:0;transform-origin:50% 100%;will-change:transform}`; `body.lq-tracking .quest-group{animation:none !important}`.
  - `const IS_CAM = IS_OVERLAY && new URLSearchParams(location.search).get('cam') === '1';` → thêm class `lq-cam` cho body.
  - cfg mới `camScale:55, camGap:20` vào `cfg`, `saveCfg` dump, `loadCfg` (số hợp lệ mới nhận), `serializeCfgForSync`. Panel: khối `enable-row` "🎥 Trên đầu (Game Camera)" với `#cfgCamScale` (%) và `#cfgCamGap` (px) + câu giải thích; `change` → kẹp theo Global Constraints, `saveCfg()`, log.
  - `applyRemoteCfg`: đầu hàm `if (!data || !IS_OVERLAY) return;`; cuối hàm đặt cờ đo lại `box`. Handler `overlay:reload`: thêm `if (!IS_OVERLAY) return;`.
  - Khi `IS_CAM`: `import('/lib/head-anchor.mjs')` + `import('/lib/body-frames.mjs')` (try/catch → giữ chỗ mặc định), tạo `HeadAnchor({socket:_sock, width:innerWidth, height:innerHeight})`, `setEnabled(true)`, `window.__lqHead`. Vòng rAF: đo `box = {w: questGroup.offsetWidth, h: questGroup.offsetHeight}` khi cờ đo lại bật (boot, sau `applyRemoteCfg`, `resize`); `a = head.get(now)` → `target = placeAbove(a, box, innerWidth, innerHeight, {scale:cfg.camScale/100, gap:cfg.camGap})`, toggle `lq-tracking`; mất người: giữ `place` 1500ms rồi `target = homePlace(...)`, bỏ `lq-tracking`; `place = followStep(place, target, dt)`; ghi `#lqAnchor.style.transform = translate(x−w/2, yBottom−h) scale(s)` (px). Lúc boot `place = homePlace(...)`.
  - `_sock` phải có trước khi tạo `HeadAnchor` → tạo trong `initSocket()` sau `io()`.

- [ ] **Step 4: Kiểm tra trong preview (server 3020)**
  - Link cũ: ảnh chụp giống Step 1 (Review Focus 1).
  - `?mode=overlay&cam=1` cỡ 1080×1920: không lỗi console; chưa có người → `#lqAnchor` ở giữa, đỉnh cụm ≈ 30px.
  - Nạp người: `__lqHead.socket.emit('touchplay:feed', false)`; `createImageBitmap` ảnh `https://storage.googleapis.com/mediapipe-assets/pose.jpg`, `__lqHead.tracker.pushFrame(bmp, [sx,0,0,sy,ox,oy])` lặp mỗi 100ms (đợi model ~5s) → mép dưới `#lqAnchor.getBoundingClientRect()` nằm trên đỉnh đầu (so với `headAnchor` của pose), trong khung. Pane ẩn thì kiểm bằng số đo, không tin ảnh (memory preview-page-goes-hidden).
  - Ngừng nạp → sau ~1.5s về chỗ mặc định.
  - Đang bám, đổi `cfg.titleFs` qua lab → `box` đo lại, cụm vẫn căn giữa đỉnh đầu (Review Focus 2).
  - Lab: mở `/_prototype/level-quest.html`, emit `overlay:reload {gameId:'level-quest'}` từ socket khác → lab KHÔNG tải lại (log còn) (Review Focus 4).

- [ ] **Step 5: Commit**
  `git add public/lib/head-anchor.mjs public/_prototype/level-quest.html .claude/launch.json` → `feat(level-quest): chế độ cam=1 — thanh quest bay trên đỉnh đầu người (feed OBS chung) + panel không tự đè cfg/tải lại`

### Task 3: Đưa vào 🎥 Game Camera, bỏ khỏi menu

**Files:**
- Modify: `server.js` (`CAM_GAME_IDS`; `GAMES.camgames.description`; `touchplayFeed.overlayMatchers`; `getOptions` `per`)
- Modify: `public/games/camgames/registry.js` (thêm thẻ cuối danh sách)
- Modify: `public/games/camgames/camgames-panel.js` (dòng `seen` ~84)
- Modify: `public/index.html` (`#view-level-quest` header ~dòng 117–157)

**Interfaces:**
- Consumes: `camGameInHub(id)`, `feedUrlIs(url, id, re)` (server.js); overlay `?cam=1` của Task 2.
- Produces: `CAM_GAME_IDS = ['touchplay','chemtraicay','dapmuoi','bancung','level-quest']`; registry entry id `'level-quest'` (các trường đúng spec mục 5, không `standalone`).

- [ ] **Step 1: Sửa server.js**: `CAM_GAME_IDS` thêm `'level-quest'`; description thêm "Level Quest"; `overlayMatchers['level-quest'] = (url) => camGameInHub('level-quest') && feedUrlIs(url, 'camgames', /\/overlay\/camgames/i)`; `per['level-quest'] = camGameInHub('level-quest') ? '' : null` (comment: không có nguồn riêng, dùng nguồn chung). `node --check server.js`.
- [ ] **Step 2: registry.js** thêm entry theo spec; **camgames-panel.js**: `const POSE_GAMES = new Set(['bancung','level-quest'])` và dùng `POSE_GAMES.has(ov.phase)` thay `ov.phase === 'bancung'`.
- [ ] **Step 3: index.html**: header `#view-level-quest` thêm `<button class="ghost small" onclick="hpOpenGame('camgames')" title="Về menu Game Camera">← Game Camera</button>` đầu `.overlay-bar`; nút copy đổi chữ "📋 Link riêng (đứng yên)" (cả 2 chỗ khôi phục chữ trong `lqCopyOverlay`), `title` = "Link Level Quest riêng, không bám người — trong Game Camera dùng 📋 Link OBS của Game Camera"; sửa comment `<!-- GAME VIEW: LEVEL QUEST -->` cho đúng (đã có trong GAMES, là game con Game Camera).
- [ ] **Step 4: Kiểm tra (restart server 3020 vì server.js đổi — memory preview-start-reuses-stale-server)**
  - Trang app: Thư viện Game + lưới trang chủ không còn 🎯 LEVEL QUEST; Game Camera có thẻ 🎯 Level Quest; "⚙ Cài đặt" mở `#view-level-quest` có nút "← Game Camera".
  - `POST /api/games/camgames/config {active:'level-quest'}` → `/overlay/camgames` nạp iframe `…level-quest.html?mode=overlay&cam=1` (đọc `src`).
  - Review Focus 5: lab Auto Demo vài giây → đổi hub sang `dapmuoi` → cộng thêm KPI → đổi lại `level-quest` → overlay con hiện đúng level/💎 hiện tại của lab.
  - `GET /api/touchplay/obs-sources` hoặc `touchplay:feedStatus` không lỗi khi active = level-quest.
- [ ] **Step 5: Commit**
  `git add server.js public/games/camgames/registry.js public/games/camgames/camgames-panel.js public/index.html` → `feat(camgames): Level Quest là game con 🎥 Game Camera, ẩn khỏi menu chính`

### Task 4: Hoàn tất — test toàn bộ, ghi chú dự án

**Files:**
- Modify: `CLAUDE.md` (mục "Games hiện có": thêm 1 câu Level Quest bám đầu trong Game Camera)
- Memory: cập nhật `camgames-hub.md` (thêm Level Quest), thêm memory ngắn về Level Quest cam nếu có điều không suy ra từ code.

- [ ] **Step 1:** `node --test tests/body-frames.test.mjs tests/obs-scene-map.test.mjs` và `npm test` — Expected: PASS hết.
- [ ] **Step 2:** `git diff` toàn bộ thay đổi so với `d5613b9` đọc lại một lượt (không debug log thừa, chú thích tiếng Việt đúng giọng file).
- [ ] **Step 3:** CLAUDE.md + memory; commit `docs: CLAUDE.md — Level Quest trong Game Camera`.
- [ ] **Step 4:** Dừng server 3020. Báo user: cách thử camera thật (restart 3010 của phiên Bắn Cung + chọn Level Quest trong Game Camera, scene `HP Đập Muỗi TEST`) — không tự restart 3010.
