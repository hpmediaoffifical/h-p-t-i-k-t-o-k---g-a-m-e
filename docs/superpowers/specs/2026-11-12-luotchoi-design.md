# 🎲 Đấu Trường Mini (`luotchoi`, tên cũ Bộ Trò Chơi Theo Lượt) — thiết kế

Ngày: 12/11/2026 · Nhánh `feature/luotchoi` (từ v1.26.0) · Trạng thái: đã làm (chưa release)

## 1. Mục tiêu

Người xem LIVE **tặng quà để vào ghế** (2–4 người, chủ LIVE ngồi cùng được), rồi lần lượt **bình luận một con số**
để chọn răng / lỗ / thanh / ô. Có PvP (người này loại người kia) và may rủi (bẫy ngẫu nhiên): người tặng nhiều vẫn
có thể thua → tặng tiếp ván sau. Người xem chỉ dùng bình luận / tim / chia sẻ / quà. Mỗi lúc chỉ chạy **một** trò.

Chỉ lấy CƠ CHẾ của các trò "đoán bẫy" quen thuộc; tên, hình, chữ đều tự đặt:

| id | Tên | Cơ chế | Kiểu |
|---|---|---|---|
| `hama` | 🦛 Hà Mã Đau Răng | ấn răng; trúng răng đau → hà mã ngoạm | bẫy |
| `chumcoc` | 🐸 Cóc Trốn Chum | cắm que tre vào lỗ chum (8–30 lỗ); trúng lỗ → cóc nhảy vọt ra | bẫy |
| `thaptre` | 🎋 Tháp Tre Chao Đảo | rút thanh tre; tháp đổ → thua | bẫy (xác suất) |
| `latcap` | 🍉 Săn Cặp Trái Cây | lật 2 ô tìm cặp hình trái cây giống nhau | điểm |
| `oanquan` | 🪨 Ô Ăn Quan | trò dân gian 2 người: rải quân, ăn dân, ăn quan (§2.2) | điểm |

## 2. Luật chung (khung ghế + lượt)

User giao "tự quyết đến khi xong" sau 2 câu đã chốt (①, ②); các điểm còn lại do phiên này chọn.

- **Vào ghế:** tặng 1 quà trong `seatGifts` → ngồi ghế trống. Đã có ghế thì quà không cho thêm ghế. Bàn đầy hoặc ván đang
  chạy → vào **hàng chờ ván sau** (tối đa `maxQueue`, mặc định 10). Mỗi ván người chơi phải tặng lại để ngồi (quà luôn có
  giá trị, người chờ được ưu tiên theo thứ tự tặng).
- **Chủ LIVE** vào ghế bằng nút trong panel (`hostName`, mặc định "Chủ LIVE"), chơi bằng cách bấm số trên panel.
- **① Bắt đầu:** đủ `minPlayers` (2) người → đếm ngược `lobbySec` (20 s) cho người khác vào; đủ `seats` ghế → chạy sau 3 s.
  Streamer có nút "Bắt đầu ngay" / "Huỷ ván" / mời khỏi ghế.
- **Lượt:** theo thứ tự ghế. Chỉ người tới lượt được chọn; bình luận **chỉ gồm số** (đúng khoảng, chưa dùng) mới tính,
  vd `7`, `#7`, ` 7 `. Lật Cặp nhận 1 hoặc 2 số trong một bình luận (`3 9`). Bình luận chỉ gồm số đã được bộ từ cấm
  chung cho qua → không cần lọc thêm.
- **② Hết giờ lượt** (`turnSec`, 20 s — TikTok trễ 3–8 s): máy chọn **ngẫu nhiên** giúp, vẫn có thể trúng bẫy.
- **③ Trò bẫy (Hà Mã, Chum Cóc, Tháp Tre) — loại dần:** trúng bẫy → người đó **bị loại** (người vừa đi trước vác ném vào
  🗑️ thùng rác — luật chung game thi đấu), bàn được dựng lại mới (bẫy mới), người còn lại chơi tiếp. Còn 1 người → **vô địch**.
- **Lật Cặp — tính điểm:** lật trúng cặp +1 điểm và được đi tiếp; trật → 2 ô úp lại sau `revealMs`, sang người kế.
  Hết ô → điểm cao nhất thắng; người điểm thấp nhất (nếu khác người thắng) vào thùng rác. Bằng điểm hết → hoà.
- **🛡️ Khiên (quà `shieldGifts`, tuỳ chọn):** người **đang ngồi** tặng → +1 khiên (tối đa 3). Trúng bẫy mà có khiên →
  mất 1 khiên, không bị loại; bẫy được giấu lại chỗ khác (Hà Mã / Chum) hoặc thanh vừa rút được nhét lại (Tháp Tre).
  Khiên không dùng ở Lật Cặp. Người chưa ngồi tặng quà khiên → bỏ qua (trừ khi quà đó cũng là quà vào ghế).
- **Kết quả:** hiện `resultSec` (8 s) → về sảnh, người trong hàng chờ tự vào ghế. Bảng vô địch của buổi (top 3 số ván
  thắng) hiện góc overlay; đổi phòng LIVE → xoá.
- Đổi trò trong panel khi đang chạy ván → ván hiện tại bị huỷ (người đang ngồi giữ ghế, quay lại sảnh).

### Tháp Tre — mô hình đổ

Tháp `levels` tầng (6–12, mặc định 9) × 3 thanh, đánh số từ dưới lên `1…3·levels`. Thanh rút ra an toàn được **chồng lên
đỉnh** với số mới tiếp theo (tháp cao dần → không bao giờ hết thanh, ván không kẹt — bản đầu không chồng đã kẹt khi mọi
tầng chỉ còn 1 thanh). Không rút ở tầng trên cùng; tầng trên cùng chưa đủ 3 thanh thì tầng ngay dưới cũng giữ; không
rút thanh cuối cùng của một tầng (hiếm khi hết lựa chọn thì nới luật tầng giữ). Rút thanh `b` ở tầng `L`:

- Rút xong tầng chỉ còn **1 thanh bên** → đổ chắc chắn.
- Ngược lại `p = base(0.04) + 0.02·số thanh đã rút + 0.05·(1 − L/levels)` (tầng thấp đỡ nhiều hơn → rủi ro hơn), nhân
  `0.6` nếu rút thanh giữa khi 2 bên còn đủ, nhân `1.6` nếu rút xong tầng chỉ còn thanh giữa; chặn trên 0.9.
- Đổ → loại; có khiên → thanh được nhét lại, tháp lung lay nhưng đứng.

### 2.2 🪨 Ô Ăn Quan (`oanquan`) — thêm 18/11/2026

Trò dân gian Việt Nam, luật **thống nhất từ nhiều nguồn**: avakids.com (hướng dẫn chi tiết), Wikipedia "Ô ăn quan",
Sforum (cellphones.com.vn). Chỗ các nguồn khác nhau → chọn cách phổ biến nhất, ghi rõ bên dưới.

- **Bàn:** 10 ô dân (2 hàng × 5), mỗi ô 5 dân; 2 ô quan bán nguyệt ở 2 đầu, mỗi ô 1 quan. **2 người** (`maxSeats: 2`):
  ghế 1 giữ hàng dưới, ghế 2 giữ hàng trên. Thường Chủ LIVE đấu 1 người xem.
- **Một nước:** chọn 1 ô dân bên mình còn quân + hướng → bốc hết, rải mỗi ô 1 viên (ô quan cũng được rải vào,
  nhưng **không bao giờ bốc ô quan**). Hết quân trong tay → xét ô kế tiếp N:
  - N là ô dân còn quân → bốc lên rải tiếp.
  - N là ô quan (còn quân) → **mất lượt**.
  - N trống → ô liền sau M có quân thì **ăn M**; sau đó nếu lại "trống rồi có quân" → **ăn liên tiếp**; N và M đều trống → mất lượt.
- **Quan non** (bật mặc định, `quanNon`): ô quan còn quan mà **dưới 5 dân** thì không được ăn (mất lượt) — tránh hết ván quá sớm.
- **Hết dân bên mình** (đầu lượt): lấy 5 dân đã ăn rải lại mỗi ô 1; thiếu thì **vay** đối thủ, cuối ván người vay bị trừ, người
  cho vay được cộng. Không đủ 5 để rải (cả 2 bên cạn) → hết ván.
- **Kết thúc:** cả 2 ô quan trống → dân còn trên mỗi hàng về chủ hàng đó. **Điểm = dân + quan × `quanValue`** (10, tuỳ chọn 5).
  Hơn điểm thắng, kém điểm vào thùng rác; bằng điểm = hoà.
- **Bình luận:** mỗi hàng đánh số **1–5 trái → phải màn hình**; hướng **1 = sang trái, 2 = sang phải** màn hình.
  `3 2` = ô 3 rải sang phải (1 bình luận); gõ `3` rồi `2` cũng được. Hết giờ → máy đi hộ trọn 1 nước.
- **Luật thuần:** `lib/luot-choi/games/oanquan.js` — vòng ô 0–11 (0–4 hàng dưới trái→phải, 5 quan phải, 6–10 hàng trên phải→trái,
  11 quan trái); `pick()` 2 bước (`pending` → `move`), `startTurn()` (rải lại / vay), `scores()`, `lastMove.trace`
  (`take`/`drop`/`cap`/`end`) để overlay diễn lại từng viên; `holdMs` = 600 + 170 ms × số bước (tối đa 14 s).
  Test `tests/luotchoi-oanquan.test.js` + 4 test tích hợp trong `luotchoi-table.test.js`.
- **Khung bàn mở rộng cho trò này:** `maxSeats` (số ghế thật = min(cấu hình, giới hạn trò)), `ctx {side}` truyền vào
  `pick/options`, kết quả `move` (giữ lượt theo `holdMs`), `startTurn` đầu lượt (sự kiện `refill`), điểm lấy từ `scores()`.
- **Hình:** bàn gỗ vân 3D, ô lõm, sỏi dân bóng nhiều màu, quan = ngọc vàng; bong bóng "số ô · số quân" trên mỗi ô, tên chủ hàng
  2 bên; rải quân = cụm sỏi bay hình cung từ ô sang ô + bàn tay úp xuống đi theo; ăn = cả ô bay về phía người ăn.


### 2.3 Bàn tay + con cóc vẽ lại (18/11/2026)

Bàn tay mới `public/games/luotchoi/hand-art.js` (SVG tự vẽ: tay người da đổ bóng, móng, nếp đốt, tay áo hồng) thay găng tay
hoạt hình; cóc 3D dựng lại theo dáng cóc thật (thân dẹt có đốm, mắt lồi tròng vàng con ngươi ngang, miệng cười rộng, chân gập).
Ảnh/model vẽ tay thay thế được qua `public/games/luotchoi/assets/manifest.json` (`hand`, `stick`, `frog`); brief gửi
ChatGPT / AI 3D: `art-requests/dau-truong-mini/BRIEF-DAU-TRUONG-MINI.md`.

## 3. Kiến trúc

```
lib/luot-choi/
  games/hama.js, chumcoc.js, thaptre.js, latcap.js   luật thuần từng trò (rng truyền vào)
  table.js        khung ghế + lượt + hàng chờ + khiên + kết quả (đồng hồ, rng truyền vào), không I/O
  controller.js   nối table ↔ socket (`luotchoi:state`) ↔ route `/api/luotchoi/*`, nhịp tick 250 ms
public/games/luotchoi/overlay.html (+ overlay.js)    OBS 1080×1920 nền trong, chỉ hiển thị
public/games/luotchoi/luotchoi-panel.js               panel tự chèn `#view-luotchoi`
tests/luotchoi-*.test.js                              node:test
```

**Hợp đồng module trò** (`games/*.js`):

```js
{ id, kind: 'trap'|'score', perTurn: 1|2,
  normalize(cfg) -> gcfg,               // số răng/lỗ/tầng/cặp trong khoảng an toàn
  setup(gcfg, rng) -> board,            // bàn mới (bẫy đã giấu)
  options(board) -> number[],           // số còn chọn được
  pick(board, n, rng) -> { ok:false, reason } | { ok:true, outcome: 'safe'|'trap'|'pending'|'match'|'miss' },
  save(board, n, rng),                  // (trò bẫy) khiên cứu: giấu lại bẫy / nhét lại thanh
  settle(board),                        // (latcap) úp 2 ô trật sau revealMs
  done(board) -> bool,                  // (latcap) hết ô
  view(board, {reveal}) -> object }     // dữ liệu cho overlay — KHÔNG lộ bẫy khi đang chơi
```

`board` là object thường, đột biến tại chỗ. `view` chỉ lộ vị trí bẫy sau khi bẫy nổ (`reveal`).

**table.js** — `createTable({ config, now, rng })`:
`setConfig`, `addGift({user, giftId})`, `hostJoin()`, `kick(key)`, `startNow()`, `cancel()`, `comment({user, text})`,
`hostPick(n)`, `tick()`, `snapshot()`, `clear()`. Pha: `lobby → playing → result → lobby`.
Trả về sự kiện (`events` trong snapshot, có `seq`) để overlay chạy hiệu ứng: `seat`, `queue`, `start`, `pick`, `trap`,
`shield`, `out`, `match`, `miss`, `win`, `draw`.

**server.js** chỉ nối (như Gọi Bài): `GAMES.luotchoi`, `luotChoi.addGift(enriched)` trong `emitGift`,
`luotChoi.addComment(chatPayload)` trong `handleTikTokChat` (sau lọc từ cấm), `onRoom`, `onConfig`, `attachSocket`.
Lệnh panel `POST /api/luotchoi/cmd {cmd, ...}`: `host|start|cancel|kick|pick|test|clear`.

## 4. Cấu hình (`appConfig.games.luotchoi`)

`enabled`, `game` (`hama|chumcoc|thaptre|latcap`), `seats` (2–4, mặc định 4), `minPlayers` 2, `lobbySec` 20,
`turnSec` 20, `resultSec` 8, `revealMs` 1800, `maxQueue` 10, `seatGifts` [], `shieldGifts` [], `hostName`,
`teeth` (6–16, mặc định 10), `holes` (8–30, mặc định 16), `levels` (6–12, mặc định 9), `pairs` (4–12, mặc định 8).

## 5. Overlay

Một thẻ dọc giữa-dưới khung 1080×1920: tiêu đề trò + pha; hàng ghế (ảnh, tên, khiên, viền sáng + vòng đếm giờ khi tới
lượt, ✕ khi bị loại); bàn chơi vẽ bằng SVG/CSS (hà mã há miệng với hàng răng đánh số; chum đất có lỗ đánh số; tháp
thanh tre xếp tầng; lưới thẻ úp). Dòng nhắc to: "Tới lượt **@tên** — bình luận số 1–16". Sảnh: "Tặng 🎁 để vào ghế"
kèm ảnh quà, đếm ngược. Kết quả: băng rôn vô địch + người thua rơi vào thùng rác. Góc trên: top 3 vô địch buổi.
`?demo=<trò>[&step=n][&freeze=1]` → overlay hỏi `GET /api/luotchoi/demo?game&step`: server dựng bàn TẠM với 4 người
giả, chạy `step` bước bằng đúng luật thật trên đồng hồ giả (tất định, không đụng bàn thật); `freeze=1` đứng yên 1 cảnh
để chụp. Nút "Xem mẫu" trong panel mở link này.

### 5.0 Bàn 3D (18/11/2026)

Theo yêu cầu "đẹp, chuyên nghiệp, 2.5–3D, đúng logic trò chơi", 4 bàn vẽ lại bằng Three.js r160 dùng chung
(`public/games/quaivat/vendor/`, import map trong overlay) — file `public/games/luotchoi/board3d.js`:
- 1 canvas trong suốt, ánh sáng môi trường `RoomEnvironment` + đèn chính đổ bóng mềm xuống "mặt bàn vô hình"
  (`ShadowMaterial`) → vật đứng trên nền OBS. Chất liệu PBR: nhựa bóng (hà mã, cóc), đất nung có men + hoa văn sóng
  (chum), tre có đốt (tháp), giấy thẻ + thảm nỉ viền vàng (lật cặp). Mọi hình dựng bằng khối cơ bản + texture canvas tự vẽ.
- Hình kể đúng câu chuyện tên trò: hà mã dán băng cá nhân trên má (đau răng), răng ngà có số trên mặt răng; cóc
  trốn trong chum nhảy lên ngồi miệng chum; tháp xếp chéo trên đế gỗ, số in ở đầu thanh, đổ = vật lý rơi/nảy đơn
  giản; thẻ nhấc lên lật 180°, cặp đúng viền xanh + ✓.
- **Vẽ theo nhu cầu**: chỉ vẽ khi có hoạt cảnh (tháp lung lay thì vẽ liên tục). Đo trong khung xem thử ~0,4 ms CPU/khung.
- Bàn mới ↔ cùng bàn: `boardId` trong snapshot (tăng mỗi lần `setup`) → khác thì dựng lại, giống thì so khác biệt và
  chạy hoạt cảnh. Điểm neo HTML `[data-n]` chiếu từ 3D ra màn hình → tay bay vào + nhãn tên dùng lại nguyên cơ chế 5.1.
- Không có WebGL → giữ bản 2D `boards.js`. Chụp ảnh trong khung xem thử không có rAF: `window.__lc3d.step(ms)`.

### 5.1 Phần diễn (18/11/2026)

Cho ván hấp dẫn hơn trên sóng mà không chậm đi:

- **Nhịp hồi hộp:** trạng thái có lượt chọn mới không vẽ ngay. Overlay cho tay (Hà Mã: ngón trỏ ấn răng; Lật Cặp: chạm
  thẻ; Tháp Tre: kẹp đầu phải thanh rồi kéo ra; Chum Cóc: que tre cắm chéo vào lỗ) bay tới đúng ô (`data-n`) trên bàn
  đang hiện, đợi `SUSPENSE_MS` = 800 ms rồi mới vẽ bàn mới → kết quả lộ sau nhịp hồi hộp. Server cộng đúng khoảng này
  vào mọi khoảng giữ sau một lượt chọn (`table.js`), nên lượt kế không bắt đầu khi tay còn đang bấm. Trạng thái đến
  trong lúc diễn chỉ giữ cái mới nhất. Trang bị ẩn (không vẽ khung) thì bỏ qua phần diễn.
- **Nhãn tên:** snapshot có `marks` = `[{n, key, nickname, avatar}]` của bàn hiện tại (bàn dựng lại thì xoá). Lật Cặp
  chỉ giữ nhãn trên ô đang ngửa / đã ghép (`latcap.marked`). Nhãn = avatar tròn (hoặc chữ cái đầu trên màu riêng) + tên
  rút gọn; răng / lỗ hẹp dùng nhãn dựng đứng dán lên ô.
- **Giọng đọc:** overlay phát `/api/live-translate/tts?lang=vi` (cùng đường Chào Mừng VIP, OBS bắt tiếng Browser Source):
  "{tên} chọn số 7" (Lật Cặp "số 3 và 9"), "Tới lượt {tên}", dính bẫy theo trò, "được khiên cứu", "lật trúng cặp",
  "{tên} vô địch!". Tên bỏ emoji/ký hiệu, tối đa 24 ký tự. Hàng đọc tối đa 4 câu; câu phụ ("Tới lượt…", "+1 khiên")
  chỉ đọc khi loa rảnh. Cấu hình `voice` (mặc định bật), `voiceVolume` 0–100 (mặc định 80) trong panel. `?mute=1` tắt;
  bàn mẫu chỉ đọc khi `&voice=1`.
- **Tháp Tre "Lung lay %":** hàm thuần `thaptre.wobblePct(b)` = `(0,02·số thanh đã rút + 0,04·số tầng dưới bị khoét) / 1,2`,
  chặn 99, đổ = 100 (~20 thanh ≈ 60%). Chỉ để xem; xác suất đổ thật vẫn là `risk()`. Overlay vẽ thanh màu xanh → đỏ.
- Chụp ảnh: `?slow=n` diễn chậm n lần.

## 6. Kiểm thử

- `tests/luotchoi-games.test.js`: từng trò — số trong khoảng, không lộ bẫy, trúng bẫy, khiên cứu, Tháp đổ chắc khi
  còn 1 thanh bên, Lật Cặp cặp/trật/úp lại/hết ô.
- `tests/luotchoi-table.test.js`: vào ghế bằng quà đúng/sai, không ngồi 2 ghế, hàng chờ, đếm ngược sảnh, đủ ghế chạy
  sớm, chỉ người tới lượt, bình luận không phải số bị bỏ, hết giờ chọn hộ, loại dần → vô địch, khiên, Lật Cặp đi tiếp,
  kết quả → sảnh kéo hàng chờ, chủ LIVE.
- Chạy thật: server riêng (cổng + `HP_DATA_DIR` riêng), `POST /api/test-chat` + `/api/luotchoi/cmd test` đi đúng đường thật,
  xem overlay trong Browser pane.
