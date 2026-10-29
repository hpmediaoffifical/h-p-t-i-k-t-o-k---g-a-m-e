# CLAUDE.md — Project instructions for Claude Code

> File này Claude **luôn đọc** khi mở session trong repo này. Đặt mọi context project-level cần thiết để Claude không hỏi lại / không vòng vo.

## 🚨 Trước khi chạy `node server.js` từ worktree — BẮT BUỘC

**Triệu chứng cần nhận diện ngay:** Activate key trên UI báo `"Hệ thống bản quyền chưa cấu hình — liên hệ HP Media"`, hoặc log server ra warning `[hpkey] WARNING: HMAC_SECRET trống`.

**Nguyên nhân:** Worktree thiếu file `hpkey/secret.local.js` (file gitignored, không nằm trong git history). Git worktree không share working-tree files giữa các checkout — file này chỉ có ở project gốc và Electron build, không tự copy sang worktree.

**Fix ngay, 1 lệnh, không cần debug code:**

```powershell
# PowerShell (Windows)
Copy-Item "C:\Users\NCPC\Desktop\HP Action LIVE\hpkey\secret.local.js" `
          ".\hpkey\secret.local.js"
```

```bash
# Bash
cp "/c/Users/NCPC/Desktop/HP Action LIVE/hpkey/secret.local.js" hpkey/secret.local.js
```

Rồi **restart Node server** (`require()` cache file lúc startup).

**Đừng nghi ngờ code mới làm hỏng license** — license code không thay đổi từ v1.0.64 trở đi. Nếu key fail trong worktree, nó là vấn đề secret file, không phải code regression.

## Kiến trúc nhanh

- **Electron app** (`electron-main.js`) bọc Express server (`server.js`) chạy localhost:3000.
- **TikTok Live Connector** (`tiktok-live-connector` **2.4.4**, ESM-only) — kết nối realtime phòng LIVE qua `@username`. Nạp qua `loadTikTokConnector()` ở đầu `server.js` (require(esm) đồng bộ trên Node 24/Electron 42, fallback `import()`), KHÔNG `require` thẳng/destructure toàn cục. Hàm này vá `RouteConfig.fetchRoomGifts` thành bản gọi `gift/list` KHÔNG ký (bản ký cần gói trả phí Euler). Payload dùng tên thật của TikTok (proto v3: `user.id/displayId/avatarThumb/payGrade`, `chat.content`, `like.count`, `roomUser.total/ranks`, `gift.gift.*`, PK `battleSettings/anchorsInfo/hostscore/teamUser/taskMessageType`) → đọc payload qua `normalizeTikTokUser()/extractTikTokUser()/getTikTokGiftId()` (đọc cả tên cũ lẫn mới). Lỗi connect phân loại bằng `classifyTikTokConnectError()` (constructor.name + message); retry tối đa 3 lần (backoff 2s/5s) vì sign-server ẩn danh chỉ 5 lượt/phút.
- **OBS overlays** transparent 1080×1920 — mỗi game 1 URL riêng (`/overlay/<gameId>`).
- **Games hiện có:** `thuytinh` (hũ thủy tinh + vật lý Matter.js), `caro` (cờ caro tương tác), `pktiktok` (hiệu ứng PK), `vipwelcome` (chào VIP). Thêm `chemtraicay` (chém trái cây bằng ngón trỏ: tracker lấy hình từ Scene/Source OBS qua obs-websocket `GetSourceScreenshot` hoặc webcam, MediaPipe HandLandmarker offline tại `public/lib/mediapipe/`, engine thuần `public/games/chemtraicay/game.js` test bằng `npm test`; route riêng `/api/chemtraicay/*`, `/tracker/chemtraicay`). Thêm `dapmuoi` (Đập Muỗi: vỗ 2 tay qua feed camera OBS chung + `HpTracker` trong overlay giết muỗi bay ngang; engine `public/games/dapmuoi/game.js` + bộ nhận diện vỗ tay `clap.js` test bằng `npm test`; game con của 🎥 Game Camera; route `/api/dapmuoi/*`; quà → thả muỗi / bình xịt / vợt điện / mắc màn / kem chống muỗi; GĐ2: muỗi bay lâu đậu mặt/cổ/vai rồi chích, nốt sưng bám người qua `public/lib/body-frames.mjs` (khung đầu/thân từ pose, chép từ Bắn Cung) + `bumps.js`; spec `docs/superpowers/specs/2026-10-13-dapmuoi-design.md` và `...-dapmuoi-chich-design.md`). `level-quest` (🎯 thanh KPI 💎/❤/🔄 kiểu Liên Quân, prototype `public/_prototype/level-quest.html`: trang không `mode` là bảng điều khiển + bộ đếm KPI, nạp sẵn trong iframe `#lq-frame` của app; overlay nhận cfg/state qua relay `levelquest:cfg/state`) là game con 🎥 Game Camera: link `?mode=overlay&cam=1` cho thanh bay trên đỉnh đầu qua `public/lib/head-anchor.mjs` (feed OBS chung, chỉ pose) + hàm thuần `headAnchor/placeAbove/homePlace/followStep` trong `body-frames.mjs`; link riêng `?mode=overlay` vẫn đứng yên; không đọc `enabled` nên không `standalone`; spec `docs/superpowers/specs/2026-10-13-levelquest-cam-design.md`.
- **🏆 Thứ Hạng LIVE (`leaguecard`):** overlay góc màn `/overlay/leaguecard` hiện bậc giải đấu TikTok D5→A1→S (`classInfo.classType`), **mảnh** = `classInfo.starCount`, hạng BXH, "thiếu X điểm" (`affiliatedInfo.gapDesc`, Text → số) + giờ chốt — từ gói `rankUpdate` (`WebcastEvent.RANK_UPDATE`). Bộ đọc + tracker thuần `lib/league-card.js` (test `tests/league-card.test.js`) sinh sự kiện rank/star/promo/demote/danger/kept/rescuer → `io.emit('league:state'|'league:event')`; người giữ hạng = quà trong lúc *sắp rớt* (móc trong `emitGift`). Client: `public/games/leaguecard/` (`league-card.js` vẽ dùng chung overlay + xem trước `?demo=1`, `league-card.css` 3 kiểu × 20 skin, `leaguecard-panel.js`). Thử không cần LIVE: `POST /api/leaguecard/simulate {kind}`. Log thô gói xếp hạng: `lib/rank-log.js` → `<DATA_DIR>/tiktok-rank-log/*.jsonl`, `GET /api/rank-log`. **Kết nối ẩn danh KHÔNG nhận `rankUpdate`** (thử 9 phòng thật 30/10/2026, cả roomInfo cũng không có bậc) → đường chính là **nhập tay** (`manualOn`/`manual`, `POST /api/leaguecard/manual`, `manualToParsed` + `tracker.consumeGiftForManual`: quà trừ dần "còn thiếu", 1 xu ≈ 1 điểm); panel không gửi `manual` qua `/config`. Bộ đọc gói vẫn giữ phòng khi có kết nối đăng nhập. Spec `docs/superpowers/specs/2026-10-30-leaguecard-design.md`.
- **🎥 Game Camera (`camgames`)** — 1 link OBS `/overlay/camgames` cho mọi game camera, cài đặt chỉ trong app, nguồn camera CHUNG `camgames.source`. Chơi **2 game cùng lúc**: `camgames.actives` (`active` = actives[0] cho bản cũ), mỗi khe tối đa 1 game — `hands` (touchplay/chemtraicay/dapmuoi) + `head` (bancung/level-quest); luật thuần `lib/camgames.js` (test `tests/camgames.test.js`, kiểm cả `slot` trong `registry.js` khớp `SLOTS`). Overlay mẹ chạy **MỘT** `HpTracker` (`public/lib/hp-cam-shared.mjs`); game con lấy `sharedTracker(gameId, {width,height}) || new HpTracker(…)` và bỏ giải mã khung khi `tracker.shared` — ngoài hub tự chạy tracker riêng như cũ. Quà: gán đích danh thắng nhánh bắt-mọi-quà (`camGiftYields`, `camClaims` trong sự kiện `gift`; chỉ tính game sẽ xử lý quà — Bắn Cung phải ▶ BẮT ĐẦU — và so khớp như handler: Bắn Cung/Chém Trái Cây theo id). Phím tắt toàn cục: chơi 2 game cùng có phím (`HOTKEY_GAMES`, registry `hotkeys`) thì chỉ game streamer bấm vào gần nhất (`camgames.hotkeyGame`) giữ phím — mọi chỗ áp phím Bắn Cung/Đập Muỗi đi qua `camApplyHotkeys()`. `GAMES.camgames.defaultConfig` KHÔNG được có `actives` (đè config cũ chỉ có `active`). Game con dùng chung đăng ký feed `{id, frames:false}` (chỉ trạng thái/bố cục; khung JPEG chỉ gửi phòng `touchplay:feed:frames`). **Game camera mới:** dòng `registry.js` (có `slot`) + id `CAM_GAME_IDS` + `SLOTS` trong lib + matcher `overlayMatchers` + dùng `sharedTracker`. Spec `docs/superpowers/specs/2026-10-13-camgames-multi-design.md`.
- **🎙️ Phụ đề giọng Creator (Dịch Thuật LIVE):** Electron KHÔNG nghe được Web Speech API (không có khoá dịch vụ Google) → server mở trang `/listen/caption` (`public/listen/caption.html|js`) trong **Edge/Chrome thật** bằng `--app` + profile riêng `<data>/caption-listener/<browser>` (quyền micro xin 1 lần). Trang nghe gửi `creatorCaption:partial` (chữ tạm) / `creatorCaption:speech` (câu final → `processCreatorCaptionSpeech` dịch ≤5 ngôn ngữ bằng `translateTextToTarget`) / `creatorCaption:listener` (trạng thái + `detail` chẩn đoán); máy trạng thái + tìm exe ở `lib/caption-listener.js`, logic nhận diện thuần ở `public/lib/caption-speech.mjs` (test `tests/caption-*.test.*`). Route `/api/creator-caption/listener/open|stop|toggle|reset|state`; overlay `/overlay/creator-caption` giữ link cũ, kiểu `card|subtitle`, giữ nhịp đọc `public/lib/caption-pace.mjs`. Hai chế độ `mode: auto|manual` (Bấm/Dừng bằng phím tắt toàn cục `hotkey`, Electron `global.__captionApplyHotkey`), tự ngắt câu `segmentSeconds`, tự mở khi LIVE `autoStart` (tôn trọng cờ `captionUserStopped`), chạy ngầm `background` (`lib/win-minimize.js`). MỌI đường thoát app phải gọi `captionListenerStop()` (`app.exit` không bắn before-quit). **Lọc nhạc desktop lọt vào micro:** trang nghe tự mở micro (`micDevice` = tên thiết bị, '' = mặc định Windows) qua `public/listen/mic-pipeline.js` → AudioContext **16 kHz** (Edge chỉ ra chữ với track 16k; 48k trả câu rỗng) → lọc dải giọng + cổng chặn nền AudioWorklet `public/listen/voice-gate-worklet.js` (logic thuần `public/lib/voice-gate.mjs`, test `tests/voice-gate.test.mjs`: nền + mức giọng streamer đã học, nhớ theo micro trong localStorage) → `rec.start(track)`; `voiceFilter: off|normal|strong`; dựng không được thì `rec.start()` trơn (`filter: 'fallback'`). Test e2e không cần nói: Chrome `--remote-debugging-port` + `Page.addScriptToEvaluateOnNewDocument` giả `SpeechRecognition` hoặc `window.__hpCaptionFeed(rows)` với chỉ số tăng dần; micro giả `--use-file-for-fake-audio-capture` KHÔNG vào `rec.start()` trơn nhưng CÓ vào đường track → thử thật được bằng WAV (TTS giọng + "bài hát") và `window.__hpCaptionGate`. `tests/app-smoke.test.js` nạp app.js trong vm — bắt lỗi gọi hàm đã xoá. Đường Whisper cũ đã gỡ (v1.15).
- **🎵 Quà Ca khúc (TikTok "Songs of LIVE"):** mỗi bài 1 gift id riêng (199 xu, `type 22`, ảnh dưới `/musicgift/`), do người dùng TikTok tạo → không nằm trong `gift/list`, kho không giới hạn. Sự kiện GIFT nhận diện bằng `lib/music-gifts.js` (`isMusicGiftEvent`) rồi `aliasMusicGift` đổi `giftId` → quà ảo `music` ("🎵 Ca khúc (mọi bài)", luôn có trong `giftList`, không lưu vào cache sheet) — mọi game/OBS Bridge gán 1 lần cho mọi bài; id thật ở `songGiftId`, ảnh đĩa riêng giữ trong `sheetItem.image` (client ưu tiên `g.sheetItem`; Hũ khoá cache ảnh theo `songGiftId`). Bài đã có id thật trong bảng quà thì giữ id thật. Tên quà TikTok gửi = 16 ký tự đầu câu hát → tên bài thật lấy từ danh mục `lib/music-gifts-seed.json` + `data/music-gifts.json` (học khi có người tặng; nhập file qua nút 🎵 Ca khúc ở Danh sách quà → `POST /api/music-gifts/import`; `GET /api/music-gifts`). API TikTok cần đăng nhập: `/webcast/gift/music/moods/`, `/list/?mood_id&room_id&gift_id=0`, `/list_pagination/?mood_id&tab_id&pagination_token` — script tải trọn `tools/ca-khuc-tiktok-collector.js` (chạy trong Console trình duyệt đã đăng nhập). Test `tests/music-gifts.test.js`.
- **License system:** v1.0.64+ dùng `hpvn.media/hpkey/api.php` (HMAC + RSA). Trước đó dùng `hp-license.nguyenvu.dev/activate`. Endpoint cũ vẫn còn cho gift-sheet + auto-update.
- **License storage:** `%APPDATA%/hp-action-live/data/app-config.json` field `license`. Recheck mỗi 60s (`hpkey/config.js:RECHECK_SECONDS`).

## Convention khi thêm game mới

Mỗi game mới cần:
1. Folder `public/games/<id>/` chứa `game.js` (engine), `overlay.html` (OBS view), `<id>-panel.js` (panel controller).
2. Đăng ký trong `server.js` block `const GAMES = {...}` với `defaultConfig`, `overlayPath`.
3. Route `/overlay/<id>` trỏ tới `overlay.html`.
4. Section `<section id="view-<id>">` trong `public/index.html`.
5. Script tags + `openXxx()` handler trong `public/app.js`.
6. CSS namespace prefix `.<id>-*` trong `public/style.css`.
7. **Tránh route collision với `/api/games/:id/*`** — generic GET/POST `/state` và `/config` đã giữ chỗ. Đặt route riêng dưới namespace khác (vd `/api/<id>/*`).

## Versioning & Release

- Production releases lên branch riêng (`release-v1.0.XX-clean`), không trên main.
- Tags `vX.Y.Z` đánh trên branch release.
- Main branch ở phiên bản cũ hơn — đừng nhầm với tag mới nhất.
- File `package.json:version` phải khớp tag.
- Installer build qua `npm run build:win` → `dist/HP-Action-LIVE-Setup-X.Y.Z.exe`.

## Một số lệnh tiện

```powershell
# Verify license endpoint working trong dev:
$body = '{"key":"adminphung"}'
curl.exe -X POST http://localhost:3000/api/license/activate `
         -H "Content-Type: application/json" -d $body

# So sánh worktree branch với tag known-good:
git log --oneline v1.0.66..HEAD

# Tạo worktree mới + auto-copy secret (tránh lặp lỗi):
git worktree add ../new-feature -b feature-name
cp hpkey/secret.local.js ../new-feature/hpkey/
```
