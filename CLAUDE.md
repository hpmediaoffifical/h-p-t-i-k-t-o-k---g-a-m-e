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
