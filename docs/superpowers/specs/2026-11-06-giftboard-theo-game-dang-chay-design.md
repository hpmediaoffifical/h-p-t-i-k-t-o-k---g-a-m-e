# 📋 Bảng Quà Tổng — chỉ hiện quà game đang chạy + game đang mở link

Ngày: 06/11/2026 · Trạng thái: đã duyệt, đã làm (nhánh `feature/giftboard-theo-game`); chưa thử OBS thật · Liên quan: `public/_prototype/giftboard.html`, `lib/camgames.js`, `server.js`

## 1. Mục tiêu

Bảng Quà Tổng hiện gom quà của mọi game được tích nguồn. Người xem thấy cả quà của game không chơi → rối, sai.

Yêu cầu (user, 06/11/2026):

1. Bảng **chỉ hiện quà của game đang chạy**.
2. Game **không bật nhưng overlay đang mở** (link có trong OBS / TikTok LIVE Studio) → hiện ở mục **"Đang mở kèm"**, hoặc **gộp vào danh sách chính** nếu quà của nó không trùng.
3. Quà trùng giữa các game: **chỉ cảnh báo** trên bảng — KHÔNG đổi luật xử lý quà (hôm nay `emitGift()` phát cho mọi game, trùng thì cả hai cùng chạy; bảng phải nói đúng sự thật đó).
4. Đưa **🎥 Game Camera** vào bảng (Touch & Play, Chém Trái Cây, Đập Muỗi, Bắn Cung, Đá Cầu, Bộ Tách Người).

Ngoài phạm vi đợt này: 🎮 Game Tương Tác (Zombie, Nhà Tù, Pokemon, Creator Online), PK, Thứ Hạng LIVE, Chào VIP; phân xử quà trùng phía server.

## 2. Nghiên cứu (tóm tắt)

- **Crowd Control**: quà gán theo từng game; overlay chỉ hiện quà game đang kết nối + nhóm "Disrupts" luôn chạy; có xoay trang. → mô hình gần nhất.
- **TikFinity**: lọc theo Profile (đổi trước khi LIVE), ≤8 màn overlay. **IndoFinity**: 1 quà nhiều hành động → chạy hết + **cảnh báo** trong UI, công tắc Active. **Twitch Rewards**: người xem chỉ thấy mục đang bật.
- Không tool nào lọc theo "overlay có đang mở" — đây là điểm khác biệt, cần chống nhấp nháy.
- **OBS nạp mọi browser source ở mọi scene khi khởi động** (trừ nguồn bật *Shutdown when not visible*) → "socket đang nối" = *link có trong OBS*, chưa chắc đang lên sóng.
- OBS browser source JS API (obs-browser README + `obs-browser-source.cpp`): `window.addEventListener('obsSourceActiveChanged', e => e.detail.active)` (đang ở Program), `obsSourceVisibleChanged` (`detail.visible`). `obsstudio.onActiveChange` đã deprecated. TikTok LIVE Studio không có `window.obsstudio`.
- obs-websocket v5: `GetInputList{inputKind:'browser_source'}` + `GetInputSettings` → url; `InputActiveStateChanged` là sự kiện high-volume phải đăng ký bit riêng.
- socket.io mặc định `pingInterval 25s + pingTimeout 20s` → rớt ngầm ~45 s mới biết.

Hiện trạng code:

- `giftboard.html` `collectRaw()` đọc 8 game (thuytinh, caro, votecomment, nhietdo, bancung, trongcay, nhatla, timer) + obsEffects; `gameEnabled()` đã lọc `enabled === false` + khoá bản quyền; `mergeSameGift` gộp thẻ.
- Server **không biết overlay game nào đang mở**: gần như mọi overlay `subscribe('overlay')` chung. Chỉ hub Game Camera có `camHubOverlayOnline()` (handshake `hub=camgames`).
- `lib/camgames.js` có sẵn `explicitGifts(id, cfg)`, `actsOnGifts`, `overlapGifts` → tái dùng cho Game Camera.

## 3. Thiết kế

### 3.1 Ba trạng thái mỗi game (server tính)

| Trạng thái | Điều kiện | Trên bảng |
|---|---|---|
| 🟢 `running` | Game thường: `games[id].enabled !== false` (+ `sessionActive` nếu bật `rules.onlyRunning` với game có phiên). Game Camera: id nằm trong `camActives()` và `actsOnGifts(id,cfg)` (Bắn Cung phải ▶ BẮT ĐẦU). | Danh sách chính |
| 🔗 `linked` | Không `running`, nhưng có ≥1 overlay của game đang nối (presence, §3.2) | Gộp vào chính nếu không trùng; trùng → mục "Đang mở kèm" |
| ⚪ `off` | Còn lại | Ẩn |

Ghi đè tay trong app, theo game: **Tự động** (mặc định) / **Luôn hiện** (coi như `running`) / **Không hiện** (coi như `off`). Lưu `giftboard.config.visibility[gameId] = 'auto'|'always'|'never'`. Lý do: nhiều game mặc định `enabled: true`, người dùng TikTok LIVE Studio hoặc bật Shutdown source thì presence không đáng tin.

> Quyết định mặc định (user chưa chốt): "đang chạy" = cờ `enabled` như hôm nay. Nếu thực tế bảng vẫn quá dài, đợt sau đổi mặc định sang "enabled VÀ overlay đang mở".

### 3.2 Overlay presence — `lib/overlay-presence.js` (thuần, có test)

- Overlay gửi `overlay:hello {gameId, obs: !!window.obsstudio, onAir}` khi kết nối và mỗi **8 s** (heartbeat). Helper chung `public/lib/overlay-hello.js` (script thường, 1 dòng gọi `HpOverlayHello('<gameId>')`), tự:
  - bỏ qua khi URL có `preview=1`, `review`, `demo=1`, hoặc trang nằm trong iframe của panel app;
  - nghe `obsSourceActiveChanged` → gửi ngay `onAir` mới.
- Server: `Map<gameId, Map<socketId, {lastSeen, onAir, obs}>>`. Xoá khi `disconnect` hoặc quá **20 s** không heartbeat. Hàm thuần: `touch(state, gameId, socketId, info, now)`, `drop(state, socketId)`, `snapshot(state, now)` → `{gameId: {open: n, onAir: bool}}`.
- Server phát `overlay:presence` khi snapshot đổi (so sánh nông), kèm `GET /api/overlay-presence`.
- **Game Camera**: hub `/overlay/camgames` đang mở ⇒ mọi game trong `camActives()` coi là mở (hub dùng `camHubOverlayOnline()` sẵn có). Link riêng cũ (vd `/overlay/bancung`) tự gửi hello như game thường. Overlay con trong iframe của hub KHÔNG gửi hello (tránh đếm đôi).
- *(Đã làm 07/11)* Đối chiếu obs-websocket (chỉ khi OBS Bridge đang nối, 15s/lần + ngay khi nối; `listBrowserSourceUrls` + `gameIdFromOverlayUrl` đúng cổng app): tái dùng `refreshBrowserSources` (`lib/obs-bridge.js`) để biết link `/overlay/<id>` có trong OBS dù trang đang bị Shutdown → đánh dấu `inObs: true` (chỉ hiện chú thích trong app, không đổi trạng thái).
- Bản thân bảng quà (`/overlay/giftboard`) không tính.

### 3.3 Chống nhấp nháy

- `linked → off` chỉ sau **30 s** không còn presence (OBS hay tải lại trang khi đổi scene).
- `off → linked` ngay lập tức.
- Bảng chuyển cảnh mục ra/vào bằng fade 300 ms, không nhảy bố cục giữa chừng thẻ đang cuộn.

### 3.4 Gộp & cảnh báo trùng — `public/lib/giftboard-merge.js` (thuần, UMD: `window.HpGiftboardMerge` + `module.exports`)

```
mergeBoard(entries, status, opts) → { main: Entry[], linked: Entry[], overlaps: Overlap[] }
  entries : Entry[] từ collectRaw (đã có gameId, giftId, generic, label…)
  status  : { gameId: 'running'|'linked'|'off' }
  opts    : { mergeSameGift, perGame }
```

Luật (đã làm, 06/11/2026):

1. Bỏ entry của game `off`.
2. Khoá trùng = `giftId` (entry `generic` — "mọi quà/mỗi xu" — không bao giờ tính trùng).
3. **Theo cả game** (không tách lẻ từng quà — một game nằm hai nơi khó đọc): game `linked` không có quà nào trùng game `running` → toàn bộ vào `main` (🔗 trên tiêu đề khối / trước dòng); có ≥1 quà trùng → cả game sang `linked` (khối "🔗 Đang mở kèm").
4. `overlaps` / `overlapOf`: quà gán ở **≥2 game đang chạy** → thẻ của game đang chạy có huy hiệu **"⚠ N game"** (đúng thực tế: nhận quà là cả hai cùng chạy).
5. `clashOf`: quà của game `linked` trùng game đang chạy → thẻ trong khối "Đang mở kèm" có **"⚠ trùng quà"** (game mở kèm đang tắt nên chưa chạy — chỉ báo "bật lên là chạy cùng"). Không tính vào "N game".
6. Chỉ cảnh báo, không đổi thứ tự xử lý quà. Giữ thứ tự `SOURCE_ORDER`.

### 3.5 Game Camera vào bảng

- Server thêm `GET /api/giftboard/cam-gifts` → `{ actives, running: {id: bool}, games: {id: [{giftId, name, image, diamonds, emoji, label}]} }`. Danh sách quà dùng lại `gameGiftList()` (`lib/camgames-session.js`, đã có nhãn — chính là danh sách hiện trên overlay khi chạy phiên game theo quà); Bộ Tách Người dùng `giftBoardList()` mới trong `lib/body-server.js` (tên kịch bản, thiếu thì tên loại). Mục không có `giftId` (mốc xu Touch & Play, "x xu = 1 muỗi") lên bảng như dòng "mọi quà".
- `running[id]` = `actsOnGifts` (Bắn Cung phải `sessionActive === true`) và (đang chọn trong hub hoặc là link riêng cũ `CAM_STANDALONE_IDS`). Bảng tải lại khi có `gameConfig` của game camera / `camgames` hoặc Bắn Cung đổi phiên.
- Bắn Cung hiện đã có extractor riêng trong `collectRaw` → giữ extractor cũ, chỉ đổi cách tính trạng thái theo §3.1 (Game Camera).
- Bắt-mọi-quà của Bắn Cung/Đập Muỗi/Đá Cầu: entry `generic`, và nếu `claimedElsewhere` thì ghi chú "nhường quà gán đích danh".
- Thêm vào `SOURCE_ORDER` và danh sách nguồn tích chọn của bảng; giữ cơ chế ẩn theo bản quyền.

### 3.6 Bố cục overlay 1080×1920

- Mục chính như hiện nay (single / split / perGame).
- Mục **"🔗 Đang mở kèm"**: panel riêng id `linked` trong `panels` (kéo thả, scale, ẩn như các panel khác), mọi chế độ bố trí, luôn có tiêu đề; vị trí mặc định trái-dưới (2%, 80%).
- Thẻ ở `main` đến từ game `linked` có tag nhỏ 🔗 + tên game.
- Không game nào `running`/`linked` → bảng trống (không hiện khung rỗng).

### 3.7 Trong app (view-giftboard)

- Danh sách nguồn: mỗi game có chấm trạng thái 🟢/🔗/⚪ + lý do ("đang bật", "mở trong OBS", "có trong OBS nhưng chưa tải", "luôn hiện") + chọn Tự động/Luôn hiện/Không hiện.
- Khối "⚠ Quà trùng": liệt kê `overlaps` (quà, các game) — giống chip "Quà trùng" của Game Camera.

## 4. Dữ liệu & sự kiện

| Mới | Mô tả |
|---|---|
| socket `overlay:hello` (client→server) | `{gameId, obs, onAir}` |
| socket `overlay:presence` (server→all) | `{gameId: {open, onAir, inObs?}}` |
| `GET /api/overlay-presence` | snapshot |
| `GET /api/giftboard/cam-gifts` | quà Game Camera |
| `giftboard.config.visibility` | `{gameId: 'auto'\|'always'\|'never'}` — thêm vào `makeDefaultGiftBoardConfig` (server) **và** `defaultConfig` client cùng lúc |

Không đổi: luật `emitGift`, `camClaims`, config các game.

## 5. Kiểm thử

- `tests/overlay-presence.test.js`: touch/drop/TTL 20 s, nhiều socket cùng game, onAir, snapshot.
- `tests/giftboard-merge.test.js`: linked không trùng → main; linked trùng → linked + overlap; running–running trùng → overlap; generic không tính trùng; visibility always/never; trễ 30 s linked→off.
- `tests/camgames.test.js` mở rộng: `cam-gifts` cho 6 game, nhãn hành động đủ.
- E2E (Browser pane): bật Hũ + mở `/overlay/caro` trong tab khác → Caro vào "Đang mở kèm"/gộp; đóng tab → biến mất sau ~30 s; chọn Chém Trái Cây trong Game Camera + mở hub → quà Chém Trái Cây hiện; gán cùng 1 quà cho Hũ và Chém Trái Cây → "⚠ 2 game".
- Thử OBS thật: browser source ở scene không active vẫn tính `linked`; `obsSourceActiveChanged` đổi `onAir`.

## 6. Thứ tự làm

1. `lib/overlay-presence.js` + test → nối socket trong `server.js` + `/api/overlay-presence`.
2. `public/lib/overlay-hello.js` → gắn vào overlay của 8 game + Game Camera (hub + link riêng).
3. `public/lib/giftboard-merge.js` + test → thay đoạn lọc/gộp trong `buildCards()`.
4. `/api/giftboard/cam-gifts` + nhãn hành động + extractor Game Camera trong `collectRaw`.
5. Panel `linked` + tag 🔗 + huy hiệu ⚠ trên overlay; chấm trạng thái + Tự động/Luôn/Không + khối Quà trùng trong app.
6. E2E + `npm test`.

## 7. Rủi ro

- Overlay bị Shutdown khi ẩn → không có presence → game không vào `linked`. Giảm bằng ghi đè "Luôn hiện" + chú thích `inObs` từ obs-websocket.
- Overlay cũ khách dán sẵn chưa có helper hello → chỉ hết khi cập nhật app (overlay phục vụ từ server nên cập nhật app là đủ).
- Đếm nhầm preview trong app: helper tự bỏ qua `preview/review/demo` và iframe panel; kiểm thêm khi E2E.

## 8. Thẻ chỉ hiện tên hành động (07/11/2026)

User: bỏ tên quà gốc và số 💎 dưới thẻ — chỉ hiện tên trong cài đặt game hoặc tên tuỳ chỉnh. Dòng `.gb-gift` không vẽ nữa, bỏ ô "Tên quà + giá 💎", mặc định `showDiamond: false`. Tên quà gốc vẫn có trong bảng "Thẻ đang lên bảng" của app (để biết quà nào).

## 9. Đợt 2 (07/11/2026) — user duyệt 6 đề xuất

1. **"Chỉ game đang mở trên OBS"** (`rules.requireOverlay`, mặc định BẬT): game bật nhưng không có overlay đang mở (hoặc vừa đóng <30s) → không lên bảng; `gameStatus({needOverlay})`. Hiệu ứng OBS (chạy bằng Scene, không có overlay) miễn. Lý do hiện trong app: "⚪ bật, chưa mở overlay".
2. **Không hiện 2 bảng quà** (`rules.hideGameBoards`, mặc định BẬT): overlay Bảng Quà Tổng cũng gửi `overlay:hello` → server phát `giftboard:active {on}` (bảng mở + đang bật + ô bật) — gửi cả lúc socket mới nối. `public/lib/overlay-hello.js` nghe → `html.gb-active` + `window.__hpGiftboardActive` + sự kiện `hp:giftboard-active`. Ẩn bằng CSS: Hũ `.tt-badges`, Bắn Cung `#bc-giftlist`, Nhiệt độ `#nd-giftlist`, hub Game Camera `#cgsGifts`, Zombie `.colL/.colR`, `/overlay/nhatla-gifts`, `/overlay/quaivat-gifts`, `/overlay/pokemon-gifts` (trang bảng quà riêng gắn `data-presence="0"` = chỉ nghe, không tính game đang mở). Ẩn bằng JS: Nhà Tù `buildLegend`, Creator Online `hud.setLegend`, Đường Về Quê `#lgl/#lgr`. Không đổi config game. Chưa ẩn: dòng gợi ý quà chạy chữ trong overlay chính Pokemon (bundle Vite không có mã nguồn).
3. **Cảnh báo trùng lúc gán quà**: `collectRaw` tách ra `public/lib/giftboard-collect.js` (dùng chung, có test). `public/lib/gift-usage.js` (nạp trong index.html) dựng chỉ mục quà → game đang bật, MutationObserver gắn nhãn `⚠ <game>` / `⚠ N game` (tooltip: hành động từng game) sau tên quà ở mọi dòng có `data-gid|data-picker-gift|data-pick-gift` — bỏ game đang mở panel. Thêm `data-gid` cho Caro, Bình chọn, hiệu ứng Hũ, Hiệu ứng OBS. Chưa có: Touch & Play (`.gp-item` trong touchplay.html), cửa sổ quà kèm thuytinh `renderEbmPicker`. Quà Thời Gian không có trong chỉ mục (config chỉ có qua relay).
4. **Game Tương Tác**: `lib/giftboard-tt.js` + `GET /api/giftboard/tt-gifts` (Zombie `qvGiftMap` + quà mặc định gift-data.js, Nhà Tù `ntGiftMap`, Pokemon `specials` + mốc xu, Creator Online `coGiftMap` + "Quà khác: Lên sân khấu", Đường Về Quê `dvqGiftMap`); nhãn nạp bằng `import()` ES module / data.json. Nhà Tù `ntMode: off` = không chạy. Overlay 5 game gửi hello (Pokemon nạp thêm /socket.io/socket.io.js vì bundle không có `io` toàn cục).
5. **Lật trang**: `display.paging {enabled, perPage, seconds, holdSeconds}` (mặc định tắt; bật thì thắng cuộn). `pagerTick/pagerHold` thuần trong giftboard-merge.js. Có quà → nhảy tới trang chứa thẻ, giữ `holdSeconds`. Ô "1/3" trên đầu khối.
6. **➕ Thêm vào OBS**: `lib/obs-add-overlay.js` `addOverlayToScene` (OBS giả trong test) + `POST /api/giftboard/obs/add {scene?}`: Scene đang phát; đã có → bật 👁; có ở Scene khác → đưa chính nguồn đó vào; chưa có → tạo "HP Bảng Quà Tổng" 1080×1920, phủ khung, lớp trên cùng. Link của mình = đúng cổng + `?mode=overlay` (hoặc link chia sẻ).

Kiểm chứng (server thử cổng 3517): bảng trống khi chưa mở overlay → mở Hũ + Nhà Tù thì đúng 2 game; mở bảng → bảng riêng Hũ/Nhà Tù/Pokemon/Zombie/Nhặt Lá/Bắn Cung/Nhiệt độ/hub/Đường Về Quê/Creator Online ẩn, đóng bảng → hiện lại; bộ chọn quà Nhiệt độ thật 75/200 dòng có nhãn; lật trang 11 trang, quà test nhảy 8/11 → 11/11 giữ ~8s; thêm vào OBS khi chưa nối → 409 rõ lý do. Chưa thử OBS thật.
