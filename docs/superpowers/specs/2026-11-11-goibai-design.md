# 🎧 Gọi Bài (`goibai`) — thiết kế

Ngày: 11/11/2026 · Nhánh: `feature/goibai` (tách từ `release-v1.26.0-clean`)

## 1. Mục tiêu

Người xem **tặng quà để giành quyền chọn bài**, gõ tên bài vào bình luận → app tìm trên YouTube → xếp hàng chờ
theo xu → **phát ra loa máy** (OBS bắt Desktop Audio) → bảng hàng chờ + bài đang phát hiện trên OBS.

Chốt với user (11/11/2026):
- Phát ra loa máy (cửa sổ ẩn của app), KHÔNG phát trong OBS, KHÔNG chế độ chỉ-hàng-chờ.
- Xếp theo xu, khoá 3 bài đầu, bài chờ lâu được cộng điểm.
- Quà mở lượt = quà streamer chọn sẵn; 🎵 quà Ca khúc TikTok tự vào hàng (không cần bình luận).
- Hàng chờ trống → im lặng (không playlist dự phòng).
- Tìm + phát bằng **yt-dlp** (không quảng cáo YouTube lên sóng); yt-dlp **tải lần đầu từ GitHub, kiểm SHA-256**.

Ngoài phạm vi bản này: playlist dự phòng, chọn thiết bị loa riêng, nhiều kiểu overlay, phát trong OBS, lời bài hát.

## 2. Luật chơi

### 2.1 Lượt (pass)
- Quà nằm trong `cfg.gifts` (theo `giftId`) → **1 lượt**, điểm = `coinValue × repeatCount`. `emitGift` đã gộp combo tới
  `repeatEnd` nên combo ×50 = 1 lượt 50 lần xu (gộp combo đã có ở tầng trên).
- Hai mốc: `cdUntil = now + countdownSec` (đếm ngược trên OBS, mặc định 15 s) và `validUntil = now + keepMin`
  (hạn thật, mặc định 10 phút — TikTok trễ 3–8 s tới màn hình người xem). `keepMin = 0` → hạn thật = `cdUntil`.
- Quà của người dùng U (khoá người = `uniqueId || userId`):
  1. U đang có lượt → cộng xu vào lượt, gia hạn hai mốc.
  2. U đã giữ đủ `maxPerViewer` bài trong hàng chờ → **cộng xu vào bài mới nhất của U** (đẩy bài lên).
  3. Còn lại → lượt mới.
- Bài đang phát không nhận cộng xu (không ảnh hưởng gì).

### 2.2 Bình luận tên bài
- U có lượt còn hạn + bình luận → câu đó là tên bài (giữ nguyên hoa/thường). Bỏ qua câu < 2 ký tự và câu chỉ gồm
  ≤ 3 chữ số (cú pháp game khác: `1`, `111`). Bình luận dính từ cấm chung không bao giờ tới (đã chặn ở
  `handleTikTokChat`).
- Tạo hàng `status: 'searching'` ngay (OBS hiện "đang tìm…"), lượt được tiêu.
- Tìm xong chọn kết quả đầu tiên: không phải livestream, có độ dài > 0 và ≤ `maxSongSec` (420 s).
- **Bị loại → trả lượt** (cùng số xu, hạn mới) + ghi chú lý do lên OBS: `notfound` · `toolong` · `blocked` (tên YouTube
  dính từ cấm chung) · `playing` (trùng bài đang phát) · `error` (yt-dlp lỗi/hết giờ) · `noengine` (chưa có yt-dlp).
- **Trùng bài đang chờ** (cùng `videoId`) → xu được góp vào bài có sẵn (`backers`), hàng mới bị gỡ.

### 2.3 🎵 Quà Ca khúc
- `g.musicGift && g.song` (đã có sẵn từ `aliasMusicGift`) và `cfg.songGifts !== false` → tạo hàng thẳng với
  `query = "<song> <artist>"`, điểm = xu của quà × combo. **Không tính giới hạn `maxPerViewer`** (họ trả tiền cho đúng bài đó).
- Áp dụng cả khi quà `music` không nằm trong `cfg.gifts`.

### 2.4 Xếp hàng
- Điểm hiệu dụng = `coins + waitBonus × phút chờ` (mặc định 30/phút — chống bỏ đói).
- **Khoá `lockFirst` (3) bài đầu**: bài đứng trong top N liên tục ≥ `lockAfterSec` (8 s) thì khoá (`lockedAt`). Bài
  khoá giữ nguyên thứ tự theo lúc khoá, luôn đứng trước bài chưa khoá; không gì chen lên trước.
- Bài chưa khoá: điểm hiệu dụng giảm dần, hoà thì ai vào trước đứng trước.
- Bài `searching` vẫn có chỗ trong hàng nhưng tới lượt phát thì bỏ qua sang bài `ready` kế tiếp.

### 2.5 Điều khiển streamer
Bỏ bài (`skip`) · tạm dừng/tiếp tục · âm lượng · phát ngay 1 bài (`pinTop` = lên đầu, khoá) · xoá 1 bài · xoá hết ·
phím tắt toàn cục Bỏ bài + Tạm dừng (Electron).

### 2.6 Lưu phiên
- `<DATA_DIR>/goibai-session.json` = `{ savedAt, roomId, queue, passes, playing }`, ghi debounce 1 s.
- Mở app: nạp nếu `savedAt` < 30 phút; bài đang phát dở quay lại đầu hàng (khoá). Nối LIVE vào **phòng khác**
  `roomId` → xoá phiên cũ. Tắt game → xoá sạch.

## 3. Kiến trúc

```
TikTok → server.js emitGift / handleTikTokChat
            → lib/goi-bai/logic.js  (luật thuần, đồng hồ truyền vào)
            → lib/goi-bai/ytdlp.js  (tải/kiểm SHA, search, lấy link âm thanh)
            → server.js bộ điều phối goibai* (phát, lưu phiên, socket)
                 ├─ /player/goibai  (cửa sổ ẩn Electron, <audio>)  ⇄ socket 'goibai:cmd' / 'goibai:player'
                 ├─ /overlay/goibai (OBS)                           ← 'goibai:state'
                 └─ panel (#view-goibai tự chèn)                    ← 'goibai:state'
```

| File | Việc |
|---|---|
| `lib/goi-bai/logic.js` | `createGoiBai(cfg)` → `addGift`, `addComment`, `addSongGift`, `applySearch`, `rejectRow`, `tick(now)`, `peekNext`, `beginPlay`, `endPlay`, `skip`, `pinTop`, `remove`, `clear`, `snapshot`, `serialize/restore`. Không đụng file/mạng/socket. |
| `lib/goi-bai/title.js` | `cleanSongTitle(title, channel)` bỏ "Official MV / Lyrics / 4K / Audio…", "- Topic". |
| `lib/goi-bai/ytdlp.js` | `findExe`, `ensure()` (GitHub latest release → `yt-dlp.exe` + `SHA2-256SUMS`, kiểm SHA-256, ghi `.tmp` rồi đổi tên), `version()`, `search(q, n)`, `resolveAudio(videoId)` → `{ url, headers, validUntil }`. Phần đọc JSON/SUMS là hàm thuần có test. Tối đa 2 tiến trình cùng lúc, hết giờ 20 s. |
| `server.js` | `GAMES.goibai`, móc quà/bình luận, route `/api/goibai/*`, proxy âm thanh `/api/goibai/stream`, socket, lưu phiên, gọi `global.__goiBaiPlayer`. |
| `electron-main.js` | `global.__goiBaiPlayer.ensure(on)`: cửa sổ ẩn `show:false`, sandbox, `autoplayPolicy: 'no-user-gesture-required'`, `backgroundThrottling:false`, nạp `APP_URL/player/goibai` (trang nội bộ — đúng luật điều hướng v1.25). `global.__goiBaiApplyHotkeys(cfg)`. |
| `public/games/goibai/` | `player.html`, `overlay.html`, `goibai-panel.js` (tự chèn view + CSS `.so-*`). |

### 3.1 Phát
- Tới lượt (không đang phát, không tạm dừng, có bài `ready`, trình phát đang nối) → `beginPlay` → lấy link âm
  thanh (bộ nhớ đệm theo `videoId`, còn hạn) → `goibai:cmd {cmd:'play', id, src:'/api/goibai/stream?v=…'}`.
- **Proxy âm thanh**: trình phát luôn nạp link nội bộ; server gọi googlevideo kèm `http_headers` yt-dlp trả về và chuyển
  tiếp `Range` → tránh 403 vì thiếu header, không lộ link, không vướng CORS.
- Bài bắt đầu phát → lấy sẵn link bài `ready` kế tiếp. Fade vào/ra 1 s (trình phát tự làm bằng `audio.volume`).
- Trình phát báo `started | progress (≤1/s) | ended | error`. `error` lần 1 → lấy link mới phát lại từ chỗ dở;
  lần 2 → bỏ bài, báo lỗi.
- Không có trình phát nối (`node server.js` không Electron, chưa mở tab) → `playerOnline:false`, hàng đứng chờ;
  panel có nút "Mở trình phát" (mở `/player/goibai` ở cửa sổ/tab riêng).

### 3.2 yt-dlp
- Vị trí: `<DATA_DIR>/tools/yt-dlp.exe` (Windows; nền khác: `yt-dlp_macos` / `yt-dlp` cho dev).
- Bật game lần đầu mà chưa có → tự tải (trạng thái `downloading` có %). Nút Cập nhật = tải lại bản mới nhất qua cùng đường
  kiểm SHA (KHÔNG dùng `yt-dlp -U` vì bỏ qua kiểm tra của mình).
- Tìm: `yt-dlp --dump-json --flat-playlist --no-warnings "ytsearch5:<q>"` → mỗi dòng 1 JSON (`id,title,channel,duration,live_status`).
- Link: `yt-dlp -j -f "bestaudio[ext=m4a]/bestaudio" --no-playlist <url>` → `url`, `http_headers`; hạn lấy từ tham số
  `expire` của link (mặc định 2 giờ).

## 4. Lỗi & giới hạn
- Chưa có yt-dlp / tải hỏng / SHA lệch → trạng thái báo trên panel; lượt được trả lại (`noengine`), không mất xu.
- yt-dlp treo → giết tiến trình sau 20 s → `error`, trả lượt.
- Bộ đếm lượt hết hạn mà không gõ → lượt mất (tick mỗi 1 s), OBS ẩn thẻ.
- Từ cấm: kiểm cả tên bài YouTube (khi bộ lọc bình luận bật).
- `goibai:state` gửi tối đa 4 lần/giây; hàng chờ gửi tối đa 30 dòng.

## 5. Overlay `/overlay/goibai`
Nền trong suốt 1080×1920, một kiểu gọn ôm nội dung, đặt bằng transform OBS:
- Thẻ Đang phát: ảnh bìa, tên bài rút gọn, avatar + tên người gọi bài, xu, thanh tiến trình.
- Hàng chờ `rows` dòng (mặc định 5): số, avatar, tên bài, xu, 🔒 bài khoá, "đang tìm…"; "+N bài nữa".
- Thẻ lượt: "🎧 @tên được chọn bài — bình luận tên bài" + đếm ngược; lý do bị loại.
- Hàng trống: dòng "Tặng [quà] để chọn bài" (`idleHint`, tắt được → ẩn hẳn).
- `?demo=1` dữ liệu giả để chỉnh giao diện.

## 6. Panel
Điều khiển (⏯ ⏭ âm lượng, danh sách chờ có ▶ Phát ngay / ✕), ♻ Xoá hết, ô Giả lập (tên + xu + bài → `POST /api/goibai/test`),
trạng thái yt-dlp (Tải/Cập nhật), trạng thái trình phát, cài đặt (§7), Link OBS qua `buildOverlayURL`.
Game lên Bảng Quà Tổng (`giftboard-collect.js`: "Mở lượt chọn bài").

## 7. Cấu hình `appConfig.games.goibai`
`enabled:false, gifts:[{giftId,giftName,giftImage}], songGifts:true, countdownSec:15, keepMin:10, maxPerViewer:1,
maxSongSec:420, lockFirst:3, lockAfterSec:8, waitBonus:30, rows:5, volume:70, idleHint:true,
hotkeySkip:'', hotkeyPause:''`.

## 8. Route
`GET /api/goibai/state` · `POST /api/goibai/control {cmd: skip|pause|resume|clear|remove|pinTop|volume, id?, value?}` ·
`POST /api/goibai/test {nickname, coins, song}` · `POST /api/goibai/ytdlp {action: install|update}` ·
`GET /api/goibai/stream?v=<videoId>` · `GET /overlay/goibai` · `GET /player/goibai`.

## 9. Kiểm thử
- `tests/goibai-logic.test.js`: lượt/gia hạn/cộng xu, giới hạn mỗi người, trả lượt khi loại, gộp bài trùng, quà Ca khúc
  vượt giới hạn, điểm theo thời gian chờ, khoá top N sau grace, bỏ qua bài searching, pinTop, serialize/restore.
- `tests/goibai-title.test.js`, `tests/goibai-ytdlp.test.js` (đọc JSON search/format, SHA2-256SUMS, hạn link).
- Thử tay: `POST /api/goibai/test` + Browser pane mở `/player/goibai` và `/overlay/goibai`.
