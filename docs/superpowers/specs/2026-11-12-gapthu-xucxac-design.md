# 🕹️ Gắp Thú + 🎲 Xúc Xắc 3D — thiết kế

Ngày 12/11/2026. Hai game quà **riêng** (user chọn), mỗi game 1 link OBS, 1 panel, 1 cấu hình. User giao "tự quyết đến khi xong" → các chi tiết dưới đây do Claude chốt.

## 1. Mục tiêu

- Người xem tặng quà → overlay chạy 1 **lượt** vui ngắn (2–5 giây), hiện tên + ảnh người tặng và kết quả.
- Streamer đặt luật thưởng (Gắp Thú: danh sách giải + tỉ lệ; Xúc Xắc: bảng kết quả theo tổng điểm) rồi làm theo kết quả trên màn.
- Kết quả **do server quyết** → OBS, khung xem thử, panel cùng thấy một kết quả (không mỗi màn tự quay một số).

Ngoài phạm vi: điểm/xếp hạng người chơi, âm nhạc nền, gắp nhiều người cùng lúc, nhập vào 🎥 Game Camera / 🎮 Game Tương Tác.

## 2. Luồng chung

```
TikTok gift → emitGift() → handleGapThuGift / handleXucXacGift
   → GiftTurns.turnsForGift(cfg, gift)            (bao nhiêu lượt)
   → queue.push(lượt…)                            (hàng chờ, có trần)
runner (setTimeout trên server) mỗi lượt:
   → tính kết quả (lib/gapthu.js | lib/xucxac.js, rng = Math.random)
   → io.to('overlay').to('preview').emit('<id>:turn', {...kết quả, ms})
   → io.to('preview').emit('<id>:state', {queue, history})
overlay chỉ diễn hoạt cảnh theo kết quả nhận được, trong đúng `ms`.
```

### 2.1 Lượt theo quà (`lib/gift-turns.js`, dùng chung, có test)

- `cfg.gifts = [{ giftId, giftName, giftImage, turns, sure? }]` — quà gán đích danh (so **id**, như các game mới).
- `cfg.anyGift` (mặc định **bật**): quà không có trong danh sách vẫn = 1 lượt. Tắt → chỉ quà đã gán mới chơi.
- Combo ×N: lượt = `turns × N`, chặn trần `maxPerGift` = 10 lượt / lần tặng.
- Hàng chờ tối đa `queueMax` = 30 lượt; tràn thì bỏ phần dư (log), không chặn quà game khác.
- **Nhịp nhanh** (`speedFactor(queueLen)`, `turnMs(baseSec, queueLen)`): lượt chuẩn `turnSec` (mặc định 4 s, cho chọn 3–5). Hàng chờ > 3 thì nhanh thêm 12 % mỗi lượt vượt, trần **×2,5**; không bao giờ dưới 1,5 s. Không bỏ lượt ai, chỉ rút ngắn hoạt cảnh (cả lượt tự lái, xem §3.3).
- Runner nghỉ 250 ms giữa hai lượt để hoạt cảnh kịp về chỗ.
- Lượt có độ dài không biết trước (tự lái §3.3): `onTurn` trả `{ hold: true }` → runner đứng chờ tới khi server gọi `runner.release(ms)` (đã diễn xong phần thả càng).

### 2.2 Bật/tắt, thử, điều khiển

- `cfg.enabled === false` → bỏ qua quà thật (vẫn cho ▶ Thử).
- `POST /api/<id>/test {giftId?}` — thêm 1 lượt "Thử nghiệm" (đi đúng runner).
- `POST /api/<id>/control {cmd: 'clear'}` — xoá hàng chờ; Gắp Thú thêm `'resetPity'`.
- `GET /api/<id>/state` — `{ queue, history, current }` cho panel.
- Route tránh `/api/games/:id/*` (đã giữ chỗ). Config qua `/api/games/<id>/config` chung.

## 3. 🕹️ Gắp Thú (`gapthu`)

### 3.1 Luật (`lib/gapthu.js`)

- `prizes = [{ id, name, icon, weight }]` (icon = emoji hoặc ký tự ngắn; weight ≥ 0). Mặc định 6 giải vui: 🧸 Gấu bông, 🎤 Hát 1 câu, 💪 Hít đất 10 cái, 💃 Nhảy 15 giây, 📢 Gọi tên cảm ơn, 🍀 Chúc may mắn.
- `winRate` (%) = xác suất gắp trúng mỗi lượt, mặc định **35 %**.
- **Bảo hiểm** `pity` (mặc định 5): trượt liên tiếp đủ số này thì lượt sau chắc trúng (0 = tắt). Đếm chung cả phòng, `resetPity` đặt lại.
- Quà gán `sure: true` → lượt của quà đó **chắc trúng** (quà to).
- `rollGrab(cfg, { sure, misses }, rng)` → `{ win, prize, clawX, slipAt, pityHit }`
  - `clawX` 0.12–0.88: vị trí ngang máy gắp hạ xuống (cùng giá trị cho mọi màn).
  - trượt: `slipAt` 0.25–0.75 = phần đường kéo lên thì thú tuột.
  - trúng: chọn giải theo trọng số `pickPrize(prizes, rng)`; tất cả weight = 0 → coi như trượt (không có giải để phát).

### 3.3 🎮 Tự lái (quà lớn) — thêm 18/11/2026

Quà có giá **≥ `steerMinCoins`** (mặc định **99 xu** / 1 món, 0 = tắt) → lượt **TỰ LÁI** cho đúng người tặng; quà nhỏ hơn vẫn là lượt tự gắp. Combo ×N quà lớn = N lượt tự lái nối nhau (vẫn trần 10).

**Lưới giải 7 cột × 3 hàng** (`GRID`, hàng 0 = sát kính, 2 = trong cùng) do **server** giữ: mỗi ô 1 giải (chọn theo tỉ trọng, `fixLayout`), gửi kèm mọi `gapthu:turn` / `gapthu:state` để overlay vẽ đống giải đúng chỗ. Giải hiếm (tỉ trọng thấp) chiếm ít ô → người lái phải nhắm. Trúng thì ô đó được bù giải mới (`refillCell`). Lượt tự gắp cũng dùng lưới: trúng → càng hạ xuống 1 ô đang có đúng giải đó (`autoCell`, không có thì đặt giải vào 1 ô).

**Lệnh bình luận** (`parseSteer(text)`, chỉ người đang lái; người khác bình luận không ảnh hưởng):
- bỏ dấu, chữ thường; từ khoá: `trái/trai/a/left/<` · `phải/phai/d/right/>` · `vào/vao/lên/len/w/up/^` · `ra/xuống/xuong/s/down/v` · `gắp/gap/thả/tha/chốt/chot/g/ok`.
- chuỗi chỉ gồm chữ `a d w s` (vd `aaw`) = mỗi chữ 1 bước; số sau hướng = số bước (`trái 3`); lặp từ cũng được (`trái trái`). Từ đệm bỏ qua: `qua sang di nua them buoc nhe nha chut xiu`.
- **có 1 từ lạ → cả câu là trò chuyện**, không điều khiển (tránh "ra đây chị ơi" kéo càng). Tối đa 5 bước / bình luận.
- Mỗi lượt có ngân sách **`steerSteps` bước** (mặc định 8, 3–20) và đồng hồ **`steerSec`** (mặc định 15 s, 8–30). Hết bước: chỉ còn chờ "gắp"; hết giờ: tự gắp tại chỗ. Càng bắt đầu ở giữa (cột 3, hàng 1).
- Hàng chờ dài: đồng hồ tự lái chia cho `speedFactor` nhưng không dưới 8 s.

**Kết quả** (`resolveSteer(cfg, layout, pos, { sure, misses }, rng)` → `{ win, prize, cell, kind, slipAt, pityHit }`) — server quyết, phụ thuộc vị trí:
1. **Chọn vật bị kẹp**: ô ngay dưới càng nặng 1, ô kề cạnh 0,12, ô chéo 0,04 (chỉ ô có giải); ô dưới càng trống thì thêm "kẹp hụt" nặng 0,6. Bốc theo trọng số.
2. **Lực kẹp**: trúng nếu `rng < (winRate + steerBonus)%` (kẹp đúng ô dưới càng; `steerBonus` mặc định 15, trần 95 %), kẹp lệch sang ô kề thì lực còn **một nửa**. Mặc định: kẹp đúng ô 50 %, lệch 25 %; tính cả xác suất kẹp lệch, nhắm giữa đống ≈ **40 %** mỗi lượt (đo bằng test 4 000 lượt), so với tự gắp 35 % → có kỹ năng nhưng không chắc thắng.
3. Quà gán `sure` và **bảo hiểm** (`misses ≥ pity`) vẫn áp: chắc trúng vật đã bốc (bốc phải "kẹp hụt" thì lấy ô có giải gần nhất).
4. Trượt: `kind = slip` (kẹp được rồi tuột, `slipAt`) hoặc `empty` (khép vào khoảng không).

Sự kiện: `gapthu:turn` (`mode: steer`, `steer: { pos, stepsLeft, secLeft }`) → `gapthu:steer` sau mỗi lệnh hợp lệ (`pos, stepsLeft, secLeft, dir`) → `gapthu:drop` (`result`, `ms` diễn thả càng) → runner `release`. Overlay: chip người lái + đồng hồ + "còn N bước" + bảng mũi tên gợi ý lệnh ở bệ máy, vòng đích trên ô dưới càng, càng trượt mượt tới ô mới, cần gạt nghiêng theo lệnh.

### 3.4 💃 Giải "Streamer nhảy" — thêm 18/11/2026

Trong máy có 1 giải đặc biệt là hình streamer. Ai gắp trúng → overlay hiện khung lớn "<tên> gắp trúng! Streamer nhảy ngay!" + đồng hồ đếm ngược; streamer nhảy thật tới hết giờ.

- Cấu hình `dance = { enabled (mặc định bật), pct (6 %, 0–30), sec (30, 5–120), cooldownSec (120, 0–3600), text ("{name} gắp trúng! Streamer nhảy ngay!", ≤ 80 ký tự, `{name}` = người gắp), sound (bật), image }`.
- **Sẵn sàng** (`danceReady(cfg, { now, lastEndAt, active })`): bật, không đang nhảy, đã qua `cooldownSec` kể từ lần nhảy trước **kết thúc**. Không sẵn sàng thì giải này không ra (cả tự gắp lẫn tự lái).
- **Tự gắp**: `rollGrab(cfg, { …, dance: true }, rng)` tung thêm 1 số ngay sau vị trí càng: `< pct %` → trúng giải Streamer (bỏ qua winRate). Không truyền `dance` thì thứ tự rng như cũ.
- **Tự lái**: lưới có đúng **1 ô** giải Streamer (`DANCE_ID`) khi sẵn sàng (`syncDance(layout, prizes, on, rng)` đặt / gỡ); trúng hay không theo `resolveSteer` như mọi ô (nhắm + lực kẹp). Trúng xong ô đó bù giải thường.
- **Khi trúng**: diễn xong lượt gắp → `gapthu:dance {phase: start, nickname, avatar, text, sec, endsAt, image}`; **hàng chờ đứng** (runner giữ lượt) tới hết giờ hoặc panel bấm **Xong** / **Bỏ qua** (`POST /api/gapthu/control {cmd: danceDone|danceSkip}`) → `gapthu:dance {phase: end, reason}` → hồi bắt đầu tính, runner chạy tiếp. Âm báo bắt đầu / kết thúc theo `dance.sound`.
- **🧪 Ép trúng** (`cmd: forceDance`): thêm 1 lượt thử chắc trúng Streamer, bỏ qua hồi — để streamer tập trước.
- **Ảnh**: `POST /api/gapthu/dance-image` (thân = file PNG, ≤ 2 MB, ≤ 2048×2048, kiểm chữ ký PNG + khung IHDR bằng hàm thuần `checkPng`) → lưu `<DATA_DIR>/gapthu/dance.png`, `cfg.dance.image = /api/gapthu/dance-image?v=…`; `DELETE` gỡ. Không có ảnh → hình mặc định vẽ bằng canvas (huy hiệu sao vàng + 💃 + chữ LIVE).
- Panel: thẻ 💃 cài đặt + tải ảnh + 🧪 Ép trúng; dòng trạng thái "💃 Đang nhảy… còn Ns" với nút Xong / Bỏ qua, "⏳ hồi còn Ns"; danh sách ai đã gắp trúng trong buổi (`danceLog`, giữ trong RAM server).
- Chưa làm: phím tắt toàn cục cho nút Xong.

### 3.2 Overlay `/overlay/gapthu` (Canvas 2D, 1080×1920 trong suốt)

- Một tủ gắp (khung bo tròn, kính, đèn viền nhấp nháy, cửa nhả quà góc trái dưới) vẽ bằng canvas, đống thú/giải ở đáy = icon các giải.
- Hoạt cảnh 1 lượt chia theo `ms`: chạy ngang tới `clawX` 22 % → hạ 20 % → khép càng 8 % → kéo lên 20 % → (trúng) chở về cửa nhả 15 % / (trượt) tuột tại `slipAt` rơi lại → thẻ kết quả phần còn lại.
- Thẻ kết quả trên tủ: ảnh + tên người tặng, "gắp được 🧸 Gấu bông" hoặc "trượt rồi 😝 (còn N lượt nữa là chắc trúng)".
- Dải hàng chờ nhỏ dưới tủ: "⏳ còn N lượt".
- `display`: `x`, `y` (% tâm tủ), `scale` (%), `theme` `pink|mint|night`, `showQueue`.
- `?review=1` (khung xem thử, phòng preview), `?demo=1` (tự sinh lượt giả mỗi 4 s để xem không cần server/quà), `?mute=1`.

### 3.5 Đồ họa 2.5D (18/11/2026)

- Tủ gắp vẽ canvas 2.5D: thân sơn bóng có mặt bên, lòng tủ phối cảnh (vách sau, vách bên, sàn nỉ kẻ ô, dải LED, đèn trần), 2 thanh ray kim loại, kính có vệt phản chiếu + nẹp chrome, cửa nhả quà bằng mica, bệ máy nổi khối (mặt trên + mặt trước, cần gạt bóng, nút GẮP vòm). Lớp tĩnh vẽ sẵn vào canvas đệm theo màu tủ; mỗi khung chỉ vẽ phần động (~1 ms/khung).
- Giải = **viên nang gacha** trong suốt (nửa dưới màu theo biểu tượng, vòm kính, điểm sáng, bóng tiếp xúc) chứa emoji streamer chọn, cache theo biểu tượng + cỡ. Càng 3 chấu mạ chrome, bóng đổ trên đống giải đậm dần khi hạ.
- Ảnh vẽ tay (thú bông 3D, hình streamer mặc định) là tuỳ chọn: brief ở `art-requests/gapthu/BRIEF.md`.
- Xúc Xắc: tone mapping ACES + môi trường phản chiếu `RoomEnvironment` (vendor), nhựa phủ bóng (`MeshPhysicalMaterial` clearcoat) có chấm khắc lõm (map + bumpMap canvas), khay nỉ viền gỗ thay vòng phẳng, viền sáng phía sau; thẻ kết quả bóng kính, chữ dài tối đa 2 dòng.

## 4. 🎲 Xúc Xắc 3D (`xucxac`)

### 4.1 Luật (`lib/xucxac.js`)

- `dice` = 1–3 viên (mặc định 1).
- `outcomes = [{ from, to, text }]` theo **tổng điểm**; mặc định cho 1 viên: 1 "Hít đất 10 cái", 2 "Hát 1 câu", 3 "Uống 1 ngụm nước", 4 "Nhảy 10 giây", 5 "Cảm ơn tên người tặng", 6 "🎉 Streamer làm theo yêu cầu". Panel có nút "Bảng mặc định" sinh bảng theo số viên (2 viên: 2–4 / 5–6 / 7 / 8–9 / 10–12; 3 viên: 3–7 / 8–10 / 11 / 12–14 / 15–18).
- `rollDice(n, rng)` → mảng 1–6. `outcomeFor(cfg, total)` → dòng đầu tiên chứa tổng, không có → `''` (chỉ hiện số).
- `normalizeConfig`: kẹp `dice`, cắt chữ ≤ 60 ký tự, bỏ dòng `from > to`, tối đa 12 dòng.

### 4.2 Overlay `/overlay/xucxac` (Three.js r160 từ `/games/quaivat/vendor/`, import map)

- Xúc xắc `RoundedBoxGeometry`, mặt chấm vẽ bằng canvas (6 texture), mặt 1 chấm đỏ như xúc xắc VN. Bàn tròn mờ đổ bóng, nền trong suốt.
- Tung: từ trên rơi xuống theo vòng cung, nảy 2 lần, xoay nhiều vòng rồi **dừng đúng mặt** kết quả hướng lên (quaternion đích = mặt v hướng +Y, cộng góc xoay quanh Y ngẫu nhiên; xoay thêm giảm dần về 0). Hoạt cảnh ~55 % `ms`, rồi thẻ kết quả: tên người tặng, các số + tổng, dòng kết quả.
- `display`: `x`, `y`, `scale`, `color` `white|red|black|gold`, `showQueue`. `?q=low` thì tắt bóng, `pixelRatio` 1.
- Khung trong suốt khi rảnh: chỉ vẽ lại khi có hoạt cảnh (rảnh thì dừng render, nhẹ OBS).

## 5. Panel trong app

Mỗi game 1 file `public/games/<id>/<id>-panel.js` tự chèn `<section id="view-<id>">` (mẫu Đá Cầu): thanh trên có ▶ Thử, Xoá hàng chờ, Thêm vào OBS (`window.buildOverlayURL`/`hpObsQuick`), Xem thử, Tải lại overlay. Bên trái các thẻ cài đặt, bên phải khung xem thử `?review=1`. CSS chèn bằng JS, tiền tố `.gapthu-*` / `.xucxac-*` (không chạm `style.css` → không cần chạy lại tokenize).

- Gắp Thú: thẻ **Giải thưởng** (icon, tên, tỉ trọng, % thực tính sẵn), thẻ **Tỉ lệ** (winRate, bảo hiểm), thẻ **Quà** (anyGift, danh sách quà gán: số lượt + ☑ chắc trúng), thẻ **Hiển thị**, thẻ **Lượt gần đây** (10 dòng).
- Xúc Xắc: thẻ **Xúc xắc** (số viên, màu), **Bảng kết quả** (từ–đến–chữ, ＋ dòng, Bảng mặc định), **Quà**, **Hiển thị**, **Lượt gần đây**.
- Chữ giao diện tự đặt, gọn.

## 6. Nối vào app (convention)

- `server.js`: `GAMES.gapthu`, `GAMES.xucxac` (`defaultConfig` từ lib), route overlay, normalize lúc nạp config, gọi handler trong `emitGift`, normalize sau POST config.
- `public/index.html`: script tags; `public/app.js`: `openGame` gọi `HpGapThuPanel.open(socket)` / `HpXucXacPanel.open(socket)`.
- Overlay gắn `/lib/overlay-hello.js data-game="<id>"`; quà gán vào `public/lib/giftboard-collect.js` (+ dòng "Mọi quà" khi `anyGift`).
- Không thêm vào danh mục khoá theo KEY (`lib/license-features.js`) — id mới luôn mở; thêm vào danh mục là việc lúc phát hành.

## 7. Kiểm thử

- `tests/gift-turns.test.js`: số lượt theo quà/combo/trần, anyGift tắt, hàng chờ tràn, `turnMs`, runner với đồng hồ giả.
- `tests/gapthu.test.js`: normalize, `pickPrize` theo trọng số (rng cố định), winRate 0/100, bảo hiểm, `sure`, weight toàn 0, `clawX/slipAt` trong khoảng.
- `tests/gapthu-steer.test.js`: ngưỡng quà, lưới 7×3 (`fixLayout/refillCell/autoCell`), `parseSteer` (có/không dấu, số bước, wasd, trò chuyện = null, trần 5), `applyMoves` (ngân sách, vách), `resolveSteer` (đúng ô / lệch / hụt / chắc trúng / bảo hiểm, tỉ lệ trung bình 4 000 lượt).
- `tests/gapthu-server.test.js`: io/app/đồng hồ giả — quà lớn giữ hàng chờ, chỉ người tặng điều khiển, gắp / hết giờ → drop rồi sang lượt kế, đồng hồ rút theo hàng chờ, ngưỡng 0 = tắt.
- `tests/gapthu-dance.test.js`: `danceReady` (tắt / đang nhảy / hồi), `rollGrab` có giải Streamer, `syncDance` đúng 1 ô, `resolveSteer` trúng ô Streamer, `checkPng` (chữ ký, kích thước file, khung).
- `tests/xucxac.test.js`: `rollDice` 1–6 & số viên, `outcomeFor` biên, bảng mặc định phủ kín [n, 6n], normalize.
- Chạy thử: server cổng riêng + `HP_DATA_DIR` riêng, `POST /api/test-gift` → chụp overlay ở giữa lượt và lúc hiện kết quả.
