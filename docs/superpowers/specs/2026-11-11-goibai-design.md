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

---

## 10. Giai đoạn 2 — ⚡ Đoạn hay nhất + ⚔️ Đấu Bài (12/11/2026)

Chốt với user: quy đổi 3 mốc xu, xu tặng thêm cho bài đang phát nối dài bài; phần còn lại user giao "tự quyết".

### 10.1 ⚡ Chỉ phát đoạn hay nhất (`clipOn`, mặc định bật)
- **Thời lượng theo xu của bài** (`coins` = xu gốc + xu góp + xu đẩy, tính lúc bắt đầu phát):
  `< clipMidCoins (30)` → `clipShortSec` (45 s) · `< clipFullCoins (299)` → `clipLongSec` (90 s) · còn lại → **cả bài**.
  Bài ngắn hơn thời lượng đoạn → cả bài.
- **Chọn đoạn** (`lib/goi-bai/clip.js` `pickSegment`): `yt-dlp -j` lúc lấy link âm thanh đã trả `heatmap`
  (≈100 khúc `{start_time,end_time,value}`) → không tốn thêm lệnh. Trượt cửa sổ dài bằng đoạn (bước 1 s), chọn cửa sổ có
  tổng nhiệt cao nhất; **bỏ 10% đầu video** (nhiều bài có đỉnh giả ở giây 0); cửa sổ không vượt cuối bài. Lùi điểm bắt đầu
  về đầu khúc nhiệt chứa nó (không cắt giữa câu quá nhiều). Không có heatmap → phát từ giây 0, dừng ở thời lượng đoạn.
- Trình phát nhận `startAt` + `endAt` (`null` = hết bài). Tới `endAt − 1,5 s` → fade ra 1,5 s → dừng → báo `ended`.
  Lệnh mới `goibai:cmd {cmd:'clip', id, endAt}` dời điểm dừng khi được nối dài.
- **Nối dài** (§10.3): xu của bài đang phát tăng qua mốc → `growClip` giữ điểm đầu, kéo `end = start + thời lượng mới`
  (cả bài → `null`). Không bao giờ rút ngắn.
- OBS + panel: nhãn `⚡ 45s` / `⚡ 90s` / không nhãn khi cả bài; thanh tiến trình tính trong đoạn.

### 10.2 Thứ tự quà của 1 người (thay §2.1)
1. Đang có lượt → cộng vào lượt.
2. **Đang bầu trong trận Đấu Bài** (§10.4) → xu vào bài của phe đã chọn (mọi quà, không chỉ quà mở lượt).
3. **Là người gọi bài đang phát, đoạn chưa phải cả bài, `clipOn`** → nối dài bài đang phát (`action:'extend'`; chỉ quà
   mở lượt). Đã cả bài → bước 4.
4. Đủ `maxPerViewer` → đẩy bài mới nhất. 5. Lượt mới.
- Người khác gọi **trùng bài đang phát** khi bài còn là đoạn ngắn → góp xu nối dài (`backers`); đã cả bài → trả lượt `playing` như cũ.

### 10.3 Dữ liệu trên hàng đang phát
`clip = { start, end|null, len|null, full, src:'heat'|'head'|'full' }` — lưu trong phiên; khôi phục giữa bài phát tiếp từ
giây đã lưu và giữ `end`.

### 10.4 ⚔️ Đấu Bài (`duel`, mặc định bật)
- **Mở trận** (trong `tick`): có bài đang phát, không tạm dừng, chưa có trận cho bài đang phát này (mỗi bài phát tối đa 1
  trận), hàng có ≥ 2 bài `ready`, còn lại ≥ `duelSec + 5` giây của đoạn đang phát. Hai bài = **2 bài `ready` đầu hàng**
  (A = đang đứng trước). Trận kéo dài `duelSec` (15 s) — diễn ra trong lúc bài đang phát, không chèn im lặng.
- **Bầu**: bình luận đúng `1` hoặc `2` → 1 phiếu/người/trận, không đổi phe. Người đã bầu tặng quà → xu cộng vào bài phe
  đó (bài lên điểm, đoạn phát dài hơn) và vào điểm trận. Người chưa bầu tặng quà → xử lý như thường.
- **Điểm trận** = `phiếu × duelVotePts (1) + xu`. Hoà → A thắng (giữ thứ tự cũ).
- **Kết thúc**: hết giờ, hoặc bài đang phát kết thúc/bị bỏ trước (chốt luôn với số đang có). Bài thắng `pinTop` (khoá lên
  đầu, phát kế tiếp), `duelLosses = 0`. Bài thua giữ chỗ, `duelLosses + 1`; **thua `duelSinkAfter` (2) trận liên tiếp
  → về cuối hàng**: bỏ khoá, `sunk = true` (đứng sau mọi bài chưa chìm, điểm chờ tính lại từ lúc chìm). Hết chìm khi được phát.
- **Huỷ trận** (không ai thắng): 1 trong 2 bài bị xoá / được phát / hết `ready`, xoá hết hàng, tắt `duel`.
- Kết quả hiện `duelShowSec` (5 s) trên OBS (`lastDuel`).
- Thứ tự `sorted()`: bài khoá → bài chưa chìm (điểm) → bài chìm (điểm).

### 10.5 Overlay & panel
- `/overlay/goibai`: thẻ trận giữa thẻ Đang phát và hàng chờ: 2 bài (ảnh bìa, tên, người gọi), thanh so điểm, phiếu/xu
  mỗi phe, đếm ngược, dòng "Bình luận 1 hoặc 2 · tặng quà cho phe đã chọn"; hết trận → "🏆 Bài X thắng — phát tiếp theo".
  `?view=duel` = chỉ thẻ trận (đặt riêng trong OBS). `?demo=1` có trận giả.
- Panel: công tắc ⚡ Đoạn hay + 4 ô (2 mốc xu, 2 thời lượng); công tắc ⚔️ Đấu Bài + giây trận + điểm/phiếu; khung trận đang
  diễn ra; nút 🧪 "Bầu 1 / Bầu 2" (`POST /api/goibai/test {vote:'1'|'2', nickname}` đi đúng đường bình luận).

### 10.6 Cấu hình thêm
`clipOn:true, clipShortSec:45, clipLongSec:90, clipMidCoins:30, clipFullCoins:299, duel:true, duelSec:15, duelVotePts:1,
duelSinkAfter:2, duelShowSec:5`.

### 10.7 Kiểm thử
- `tests/goibai-clip.test.js`: mốc xu, chọn cửa sổ theo heatmap, bỏ 10% đầu, không vượt cuối, không heatmap, bài ngắn, `growClip`.
- `tests/goibai-logic.test.js`: nối dài (người gọi / trùng bài), mở trận đúng điều kiện, 1 phiếu/người, quà người bầu, thắng
  lên đầu, hoà, thua 2 trận chìm, huỷ trận, chốt sớm khi bài kết thúc.
- `tests/goibai-ytdlp.test.js`: `parseAudioJson` trả `heatmap`.
- Thử thật 12/11/2026 (server cổng riêng + tab trình phát): "Lạc Trôi" 98,3→143,3 s (đỉnh giây 134), "Nơi Này Có Anh"
  114,4→159,4 s, bài không heatmap phát 0→45 s; đoạn 45 s dừng ở 45,7 s; nối dài 45→90 s; 3 trận tự mở/chốt, bài thua 2 trận chìm.
  Hai lỗi tìm ra khi thử: fade đếm bước bị tab nền hãm (dừng lố 29 s) → tính theo đồng hồ thật + chốt cứng `endAt + 0,5 s`;
  chống kẹt GĐ1 báo nhầm lúc yt-dlp còn lấy link bài đầu → phát lại từ 0 s → chỉ tính sau khi lệnh `play` đã gửi.

### 10.8 Giao diện overlay 2.5D (18/11/2026)
Thay kiểu thẻ phẳng: đầu đĩa (bìa nghiêng 3D + đĩa than có rãnh xoay, ánh phản chiếu đứng yên, cần đọc đĩa nhấc lên khi tạm
dừng, sóng nhạc), thẻ "phiến" có viền sáng mặt trên + cạnh dày + bóng, cả bảng nghiêng nhẹ `rotateY(7deg)`; vé hoà nhạc có
cuống xé + vòng đếm ngược; hàng chờ có huy hiệu vàng/bạc/đồng + ảnh bìa + avatar nhỏ; Đấu Bài 2 đĩa nghiêng đối mặt, VS ánh kim,
thanh kéo co có tia sáng; thẻ cúp kết quả. Chỉ CSS + SVG nội tuyến; chuyển động chỉ transform/opacity. Không có avatar → chữ cái
đầu trên nền màu theo tên. Xem thử: `?demo=1&bg=1` (+`&paused=1`, `&win=1`).
