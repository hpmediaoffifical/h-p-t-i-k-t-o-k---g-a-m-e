# 🏢 Creator Online — đề xuất hoàn thiện (03/11/2026)

Xem lại bản trên nhánh `tuongtac/creator-online` (eb11558 + e13db8f): xuất ra thư mục tạm, chạy `server/server.mjs`, chơi thử ở 1280×800 và 1080×1920. Năm agent của bộ Claude Code Game Studios đọc code song song: `game-designer` (lối chơi LIVE), `economy-designer` (quà ↔ hành động), `performance-analyst` (độ mượt OBS), `lead-programmer` (lỗi + kế hoạch chuyển vào app), `ux-designer` (khung dọc 9:16). Không file nào của game bị sửa.

Bổ sung cho khảo sát chung `2026-11-03-game-tuong-tac-khao-sat.md` (mục Creator Online), không lặp lại phần đã có ở đó.

## Tóm tắt

Game đã đủ nội dung và có không khí: 25 phòng, sân khấu có đèn quét và màn LED, phòng hát, phòng game, hàng chờ vé, PK. Nhưng nó vẫn là **game PC cho một người tự đi bằng WASD**. Mọi hiệu ứng, âm thanh và thông báo đều xoay quanh biến `player`. Để thành game LIVE cần 3 việc lớn:

1. **Đạo diễn camera thay người chơi.** Không có `player` thì quà không bay, không có pháo giấy, không có tiếng, không có banner.
2. **Bảng quà TikTok → hành động thay ví xu.** Bỏ ví 500 xu, bỏ giá, bỏ thưởng xu. Tắt quà giả của NPC vì nó đang được tính vào điểm PK và top fan.
3. **Giảm tải nhân vật và nhãn tên** bằng cách chép lời giải của Nhà Tù (SkinnedMesh gộp, LabelLayer, `disposeCharacter`, `?q=low`). Nhân vật chiếm khoảng 80% lệnh vẽ.

---

## 1. Quan sát khi chơi thử (đo trong Browser pane, software render, chỉ so tương đối)

| Góc nhìn | Lệnh vẽ | Tam giác |
|---|---|---|
| Sảnh, góc mặc định (1280×800) | 502 | 108k |
| Trong sân khấu G2, cận cảnh | 180–380 | — |
| Toàn tòa nhà nhìn từ trên | **2.287** | **433k** |
| Toàn cảnh khung dọc 1080×1920 (cam 60 m) | 871 | 179k |

91 NPC, 89 texture, 213 geometry lúc mới vào.

- **Khung dọc 1080×1920:**
  - Đứng ở hành lang, biển neon trên cửa phòng chiếm gần nửa khung và che bên trong phòng.
  - Toàn cảnh dọc chỉ thấy một lát giữa tòa nhà, ngang khoảng 3 phòng. Chibi cao khoảng 20 px.
  - Chữ HUD và nhãn tên khoảng 12–14 px ở bề ngang 1080, không đọc được trên điện thoại.
- **Dưới 768 px game tự chuyển sang giao diện cảm ứng** (joystick, nút E/F/Nhảy). Overlay phải tắt việc này.
- **Có nhiều phòng "PHÒNG TRỐNG"** hiện ngay giữa khung, trông như game chưa xong.
- **Lỗi camera văng:** `frame()` không chặn `dt` âm (main.js:2163). Khi gọi `__creator.frame()` xen giữa vòng rAF, `lerp` ngoại suy và camera bay tới tọa độ khoảng 10²¹, màn hình đen. Chơi thường không gặp, nhưng đạo diễn camera hoặc bước tay khi test sẽ gặp. Sửa: chặn `dt` trong khoảng `[0, 0.05]`.
- **Hoạt động giả:**
  - NPC tặng quà dưới tên `user1234`.
  - 85% phòng đơn được lấp sẵn bằng tên NPC (`seatSim.seed(Date.now(), 0.85)`, main.js:108).
  - Số người xem tự trôi.
  - Trên LIVE thật, người xem sẽ tưởng đó là người thật.

## 2. Lỗi và rủi ro cần xử lý (đã kiểm trong code)

| # | Vấn đề | Chỗ | Hậu quả |
|---|---|---|---|
| 1 | Hiệu ứng quà, âm thanh, banner và chat phụ thuộc `player`/`focusRoom` | main.js:168, 188, 219, 233, 259, 1956 | Overlay không có người chơi nên **quà không có hiệu ứng, game không có tiếng** |
| 2 | Quà giả của NPC đi qua `receiveGift` → cộng điểm PK, `room.fans`, tim | main.js:1873–1879, 250–256 | PK bị "dàn xếp", top fan toàn tên giả |
| 3 | `dt` âm | main.js:2163 → 2127/2132/2145 | Camera văng (đã thấy khi test) |
| 4 | `room.fans` đặt khoá theo tên hiển thị và không bao giờ bị cắt; `topFans` sắp xếp cả map mỗi lần vẽ bảng | logic/rooms.js:54, 59–63 | Trùng tên thì gộp nhầm người; phình dần suốt buổi LIVE |
| 5 | Nhân vật rời đi không giải phóng material (vòng bóng, lightstick) | character.js:104, 176; npc.js:202–206; main.js:1080 | Khoảng 1.000 vòng tạo/xoá trong 4 giờ, GPU rò dần |
| 6 | `AudioContext` chỉ tạo sau cú click | main.js:821, 1256 | Trong OBS không có tiếng |
| 7 | Quà lớn tạo 8 `setTimeout` cộng pháo giấy, không có trần (`confetti`, `audio._bus`) | main.js:216–239, effects.js | Mưa quà x99 làm khựng hình |
| 8 | PK tự động chạy riêng trên từng máy | main.js:1935–1943, 750 | Không ảnh hưởng khi vào app (bỏ LAN) |
| 9 | `server.mjs`: `new URL()` không có try/catch, mở 0.0.0.0, không có keepalive *(suy luận)* | server.mjs:74, 345, 349 | Không ảnh hưởng khi vào app: xoá server này |

Unit test: 25/25 pass, nhưng chỉ phủ `logic/`. Chưa có test nào cho `main.js`.

## 3. Lối chơi LIVE đề xuất (game-designer + economy-designer)

**Ai là người chơi:** mỗi người xem là một **fan chibi** mang tên và avatar TikTok, thuộc một trong 5 **fan club** G1–G5. Streamer là **đạo diễn tòa nhà** và không có nhân vật. Điểm khác Nhà Tù: Nhà Tù chỉ có 1 người lên sóng mỗi lúc, còn ở đây fan thi đấu theo đội và **nhiều người cùng lên sân khấu một lúc** (5 sân × 6 chỗ idol, cộng 15 phòng đơn).

### P0: cần có cho bản đầu tiên

1. **Vào game:** bình luận, thả tim hoặc follow → fan vào tòa nhà, mặc đồ theo hash tên (`lookFromName`, npc.js:155). Vào phòng (join) chỉ tăng bộ đếm. Trần số fan dùng lại `population.js` của Nhà Tù.
2. **Bình luận `1`–`5` để chọn nhóm**, đổi nhóm tối đa 1 lần mỗi 60 giây. Màn LED mỗi sân hiện số ①–⑤ thật to. Bình luận khác thành bong bóng trên đầu fan và một dòng trên bảng bình luận của sân. MC NPC đọc tên một bình luận thật khoảng mỗi 20 giây (dùng lại `mcAnswer`, main.js:918).
3. **Thang quà.** Streamer gán quà trong panel giống `ntGiftMap`; quà chưa gán thì rơi vào hành động theo bậc xu. Bảng chú giải tối đa 6 dòng.

   | Bậc | Tổng xu | Hành động | Luật chống kẹt |
   |---|---|---|---|
   | 1 | 1–4 (Hoa hồng) | **Fan nhảy lên sân khấu nhóm mình 12 giây**, LED hiện tên, quà bay lên | Chỗ idol chạy song song, không xếp hàng; mỗi người 1 lần mỗi 1,5 giây, quà dồn thì gộp |
   | 2 | 5–29 | Pháo giấy / khói / chớp đèn, streamer NPC gọi tên cảm ơn, yêu cầu bài hát / chủ đề | Mỗi phòng 1 hiệu ứng mỗi 1,5 giây, hàng chờ tối đa 6 |
   | 3 | 30–98 (🎟️ vé) | **Phòng đơn đổi tên thành "Phòng <tên bạn>"** (`SeatHouse.claim`, seats.js:78), bình luận của chủ phòng hiện trên màn phòng | 60 giây rồi chuyển người kế tiếp (đã có sẵn) |
   | 4 | 99–298 | Vai **MC** (bình luận được MC nói), **Kỹ thuật** (bình luận `phao`/`khoi`/`laser`/`den` để bắn hiệu ứng), **Quản lý** (bình luận `pk 3` để gọi PK) | 120–180 giây, giữ chắc 45 giây đầu; người sau xếp hàng chứ không cướp vai |
   | 5 | 299–999 | Banner toàn tòa nhà + pháo hoa, camera đến 10 giây, mở PK nếu đang không có | Hàng chờ chung toàn tòa nhà |
   | 6 | 1.000–9.999 | Cả tòa nhà đổi sang màu đèn của nhóm, fan NPC kéo về sân đó, camera 20 giây | Hàng chờ chung |
   | 7 | ≥10.000 | Biển tòa nhà hiện tên người tặng, **Gala cả 5 nhóm nhảy chung** | Tối đa 60 giây |

   Trần chung:
   - Mỗi người tặng có tối đa 90 giây camera trong mỗi 5 phút. Phần vượt chỉ hiện ở cấp phòng.
   - Không vai, phòng hay màn chiếm sóng nào kéo dài quá 300 giây.
   - Đừng lặp lỗi "đại ca gia hạn không trần" của Nhà Tù (events.js:61–62).
4. **PK là động lực tặng quà chính.**
   - Điểm mỗi bên = `10·xu + k·√tim`, với k = 10, và k = 20 cho bên đang thua trong 30 giây nước rút. Như vậy tim có thể lật một trận sát nút nhưng 50.000 tim (≈ 224 xu) vẫn không thắng nổi một quà 299 xu.
   - Hiện dòng "cần X xu để lật kèo".
   - Mỗi trận 90 giây. Chọn 2 nhóm có nhiều fan hoạt động nhất thay vì chọn ngẫu nhiên (main.js:1940). Hoà thì nhóm nhiều người tặng hơn thắng.
   - Người tặng nhiều nhất của nhóm thắng được vương miện và tên trên LED 10 phút; idol nhóm thua nhảy phạt 10 giây.
   - Bỏ toàn bộ thưởng xu (`earn()` trong `endPk`, main.js:796–799).
5. **Đạo diễn camera** dùng lại `SpotlightQueue` của Nhà Tù, nhưng dành cho *cảnh quay* chứ không phải *quyền điều khiển*.
   - Độ dài cảnh: vé 30 giây, vai 40 giây, quà 199+ 60 giây, trần 90 giây; tối thiểu 8 giây trước khi chuyển sang người khác.
   - Hoa hồng không cắt cảnh đang quay quà; chỉ bay qua khung và chạy trên dòng chữ.
   - **Khi rảnh**, quay vòng: sân khấu tầm trung 8 giây → cận idol 5 giây → phòng đơn của người xem gần đây 6 giây → bảng xếp hạng 4 giây. Toàn cảnh chỉ làm cảnh chuyển 2 giây.
6. **Tắt hoạt động giả khi đã nối LIVE:** quà NPC, bình luận NPC, số người xem tự trôi, `seatSim.seed 0.85`. NPC chỉ còn là đám đông vô danh. Phòng trống ghi "PHÒNG TRỐNG — tặng 🎟️ để có phòng mang tên bạn".
7. **Gỡ khỏi overlay:**
   - WASD, màn hình bắt đầu, ví xu, hồ sơ, cửa hàng, tủ đồ, thưởng xem live
   - LAN (`net.js`, `server.mjs`), mini game bắt nhịp F
   - Âm thanh theo vị trí người chơi: nhạc phải trộn theo **phòng camera đang quay** và để nhỏ dưới giọng streamer
8. **Dải hướng dẫn 3 giây** cố định trên cùng, tối đa 3 dòng, chữ từ 42 px:
   `💬 Gõ 1–5 chọn nhóm` · `🌹 Quà bất kỳ → lên sân khấu` · `🎟️ <quà vé> → phòng mang tên bạn`

**Khoảnh khắc móc quà đầu tiên:** "Tặng 1 bông hồng → chibi mang tên và avatar của bạn nhảy lên sân khấu, LED hiện tên, MC gọi tên." Quà rẻ nhất mà được trọn giấc mơ idol, và nhờ chỗ chạy song song nên không ai phải chờ.

### P1
- **PK chia đôi màn hình:** 2 khung 9:8 xếp chồng, giống hệt PK TikTok. Tốn thêm một lần vẽ nên phải gắn với tuỳ chọn chất lượng.
- Chung kết cuối giờ (phút :55) giữa 2 nhóm mạnh nhất giờ đó; giờ vàng 3 phút điểm ×2.
- Mini show trong phòng của chủ phòng, trả lời bằng bình luận A/B/C: đố vui ở phòng đứng, dự đoán TOP 1 ở phòng game. Trả lời đúng được điểm bảng xếp hạng, nên người không tặng quà cũng có thứ để giành.
- Cấp fan theo xu đã tặng, tính theo TikTok ID và giữ qua các buổi LIVE (`fanRanks`).
- Chế độ streamer = phím tắt đạo diễn (cắt cảnh sân 1–5, mở PK, bỏ lượt) qua relay giống `nhatu:key`.
- Sự kiện "tick" cho từng nhịp combo quà (chỉ để hiện hình) để không phải chờ hết combo mới có phản hồi (`server.js:3799–3802`).
- Cơ chế giành quà giữa các game trong nhóm Game Tương Tác, giống `camClaims`: hai game cùng chạy thì không cùng xử lý một quà.

### P2
- Đổi thể loại phòng bằng quà; vòng quay chỉ là phần thưởng trang trí cho top PK, **không bao giờ để quà → giải ngẫu nhiên** (dễ bị coi là cờ bạc).
- Gala 5 nhóm khi cả tòa nhà đạt mốc tim.
- Ô hình-trong-hình quay fan của người tặng (dùng lại render target của TV trực tiếp).

### Rủi ro thiết kế
- **Quá nhiều cơ chế:** 25 phòng, 4 vai, vé, thể loại, PK, 5 mini game không thể nhét vào một bảng chú giải đọc được trên điện thoại. Bản đầu chỉ nên có tối đa 6 dòng quà.
- **Giống Nhà Tù quá:** không chép biệt giam, cướp ngôi, hay mã hành động `1/B` theo từng người. Ở đây số là chọn nhóm, chữ là trả lời đố.
- **Chưa lọc từ xấu:** chữ người xem lên màn LED và vào miệng MC, mà `cleanText` chỉ cắt khoảng trắng.
- **Đồng phục nhóm nữ:** fan nam lên sân G2–G5 mặc đồng phục nữ có thể trông kỳ. Nên giữ đồ theo hash tên và chỉ đổi màu theo nhóm.

## 4. Độ mượt cho OBS (performance-analyst)

**Lệnh vẽ đến từ đâu:**
- Mỗi chibi có khoảng 18–23 mesh (thân, chân, tay, mắt, má, tai, tóc…), mỗi phần một MeshStandardMaterial và đều đổ bóng.
- Toàn cảnh: khoảng 85 NPC × 22 ≈ 1.870 lệnh vẽ, cộng khoảng 465 mesh thế giới ≈ 2.300. Con số này khớp với mức đo được.

**8 chỗ tốn thời gian mỗi khung, theo thứ tự:**
1. Lệnh vẽ nhân vật cộng bóng PCFSoft 2048 cho từng bộ phận. Khoảng cách cắt `max(46, cam.dist+34)` vẫn phủ gần hết tòa nhà (main.js:2191).
2. `updateMatrixWorld` chạy 2–3 lần mỗi khung (render chính, CSS2DRenderer, TV trực tiếp) qua 4–10 nghìn node.
3. CSS2DRenderer ghi `display`, `transform` và `zIndex` cho mọi nhãn mỗi khung.
4. TV trực tiếp vẽ lại cả cảnh mỗi 3 khung (main.js:2012–2022).
5. Pass bóng: khoảng 200 lệnh vẽ, vì cả tường và sàn gộp cũng đổ bóng (world.js:201).
6. Khoảng 85 CanvasTexture, phòng gần vẽ lại 10 lần mỗi giây và tạo lại mipmap; `shadowBlur = 18` trên chữ LED (screens.js:103).
7. Khoảng 95 nón đèn cộng sáng hai mặt cần sắp xếp mỗi khung và vẽ chồng nhiều lớp ở 1080×1920; antialias bật, pixelRatio tới 1,75.
8. Tách va chạm O(n²): 211² / 2 ≈ 22 nghìn cặp mỗi khung (npc.js:63–98).

**Sửa theo thứ tự hiệu quả ÷ công sức:**
1. Giới hạn pixelRatio theo khung 1080×1920, giới hạn FPS ở 30 hoặc 60, thêm `?q=low`. Chép từ Nhà Tù (game.js:30, 71–83, 994–1000).
2. **Chép cách làm nhân vật của Nhà Tù:** 1 SkinnedMesh, bóng thay thế, `disposeCharacter()`. Mỗi nhân vật từ khoảng 22 xuống khoảng 3 lệnh vẽ, toàn cảnh từ 2.300 xuống khoảng 700, đồng thời sửa luôn lỗi rò material.
3. Thay CSS2DRenderer bằng `LabelLayer` của Nhà Tù, có trần số nhãn. Việc này cũng giải quyết luôn chuyện vendor r160 không có file CSS2DRenderer.
4. Thêm công tắc TV trực tiếp và hạ xuống mỗi 6 khung; tắt đổ bóng cho tường và sàn tĩnh.
5. Màn hình canvas: tắt mipmap, làm mới tối đa mỗi 0,25 giây, bỏ `shadowBlur`.
6. Cắt `fans` còn top 20, cache mảng nhân vật, lưới không gian cho tách va chạm, chỉ gọi `audio.mix` khi giá trị đổi.

**Hai mức chất lượng đề xuất:**

| | Thường | Thấp (`?q=low`) |
|---|---|---|
| Số điểm ảnh tối đa | 2,2 MP | 1,0 MP |
| Antialias | bật | tắt |
| Bóng | 2048 PCFSoft | 1024 PCF hoặc chỉ bóng tròn |
| Trần NPC | 211 | 120 (fan 16, hàng chờ 3) |
| TV trực tiếp | 10 fps | tắt |
| Trần nhãn tên | 40 | 15 |
| FPS | 60 | 30 |
| Đèn quét | bật | đứng yên |

**`?debug=1`** hiện:
- `renderer.info` (calls, triangles, geometries, textures, programs)
- thời gian khung (trung bình và p95)
- số NPC đang hiện, số nhãn
- số lần tải canvas mỗi giây
- tổng `fans`
- heap JS lấy mẫu mỗi phút, để soak test 4 giờ thấy được bộ nhớ có tăng không

## 5. Giao diện khung dọc 9:16 (ux-designer)

TikTok không công bố vùng an toàn cho LIVE, nên các ô dưới đây là ước lượng. Phải đối chiếu bằng ảnh chụp điện thoại từ một buổi LIVE thử; ảnh thật thắng các con số này.

### P0

1. **Ẩn giao diện người chơi PC khi `?mode=overlay`:**
   - màn hình bắt đầu (index.html:112–130, main.js:2247–2279)
   - avatar, thông tin, ví xu (index.html:27, 32–38, 44)
   - thanh công cụ (43–59), nút trong thanh phòng (79–86), nhắc phím E (89), ô chat (93)
   - nút cảm ứng (96–102), thanh bắt nhịp (70–75), `#panel` (105–110)
   - phím và chuột (main.js:2027, 2055–2073)
   - ô "BẠN" trên bảng xếp hạng (screens.js:589–601)
2. **Phòng đang được quay là `focusRoom`.** Hiện tại `updateHud` thoát khi không có người chơi (main.js:1776), và thanh PK chỉ hiện khi người chơi ở gần (1803).
3. **Cỡ chữ cố định theo pixel PC.** Điện thoại hiện bề ngang 1080 ở khoảng 0,36×, nên chữ còn 5–14 pt. Dùng đơn vị gốc của Nhà Tù `calc(min(100vw,56.25vh)/24)` (nhatu/overlay.html:20).

   | Loại chữ | Cỡ tối thiểu ở bề ngang 1080 |
   |---|---|
   | Chip, số đếm | 30 px |
   | Thân chữ | 38–44 px |
   | Tên | 46–52 px |
   | Tiêu đề | 72–110 px |

   Chữ trắng hoặc vàng, đậm 800–900, viền tối 4–6 px. Nén video TikTok làm nhoè chữ màu mảnh.
4. **Camera dọc:** `fov 50` chỉ cho khoảng 29° chiều ngang. Nhà Tù đổi sang 62 khi khung dọc (nhatu/js/game.js:86); ở đây nên dùng 58–62. Đạo diễn cắt cảnh mỗi 10–15 giây; quà lớn thì cắt tới phòng đó trong 0,5 giây.

**Bố cục vùng an toàn 1080×1920** (x, y, rộng, cao):

- **Tránh:**
  - y < 230: thanh trên của TikTok
  - x > 930: cột nút bên phải
  - vùng x 0–780, y 1040–1740: dải quà và bình luận của TikTok
  - y > 1740: thanh dưới
  - giữ chữ trong khoảng x 120–920, vì máy dài hơn 19,5:9 cắt khoảng 100 px mỗi bên
- **Ô cần đặt:**

  | Ô | Vị trí | Nội dung |
  |---|---|---|
  | Tên phòng / thể loại | (120, 240, 800, 96) | Tên 56 px, chip thể loại 34 px |
  | Thanh PK | (120, 240, 800, 124) | Thay chỗ tên phòng khi đang PK. Phân biệt hai bên bằng tên và vị trí, không chỉ bằng màu đỏ/xanh |
  | Người đang lên sóng | (120, 376, 520, 132) | Avatar 112 px viền vàng, tên 50 px, thanh thời gian |
  | Dòng quà / top fan | (660, 376, 260, 300) | 3 dòng; cùng người tặng tiếp thì cập nhật dòng cũ (x5 → x10) |
  | Hướng dẫn | (120, 940, 800, 84) | 1 dòng 38 px, xoay 3 câu mỗi 6 giây. Lặp lại trên dòng tiêu đề màn LED; panel sinh sẵn câu để streamer ghim bình luận |
  | Vùng cảnh 3D chính | y 500–1040 | — |
  | Banner quà lớn | (120, 520, 800, 260) | Phải xuống dòng; style.css:116–121 đang `nowrap` |

### P1

- **Chữ trong cảnh quá nhỏ ở khoảng cách quay dọc:**
  - bảng bình luận khoảng 19 px, màn máy tính 5–7 px, tên bài karaoke khoảng 23 px, dòng chữ chạy trên LED khoảng 35 px
  - đưa các nội dung này lên HUD
  - canvas LED 512×220 cho 13 m bị kéo giãn khoảng 2×; khi overlay dùng 1024×440
- **Nhãn tên:**
  - hiện chỉ khoảng 10–12 px (labels.js:52)
  - tối thiểu 34 px cho người xem, 50 px cho người đang lên sóng
  - tối đa 8 nhãn mỗi khung (5 nhãn ở cảnh rộng)
  - thứ tự ưu tiên: người đang lên sóng → người tặng quà trong 60 giây qua → người vừa bình luận (giữ 10 giây) → NPC (chỉ ở cảnh gần)
  - tên dài cắt ở 12 ký tự
- **Bố cục cảnh:**
  - sân khấu nhóm quay từ phía khán giả, góc 20–25°, cách khoảng 19 m; LED ở trên, idol và fan ở dưới vừa khung dọc
  - phòng hát và phòng đứng lên hình tốt
  - phòng game yếu nhất vì streamer quay lưng ra
  - toàn cảnh chỉ dùng làm cảnh mở 2–3 giây; phương án hợp khung dọc là **"lát sàn" 17×30 m** nhìn nghiêng 60–70°
- **Phản hồi trong 1–2 giây, luôn kèm tên:**

  | Sự kiện | Người xem phải thấy |
  |---|---|
  | Bình luận | Chibi bật bong bóng; bình luận lệnh hiện chip "✓ Tên → G1" |
  | Thả tim | Cộng dồn theo người mỗi 2 giây, hiện "+15 ❤ Tên" |
  | Quà nhỏ | Một dòng trong dòng quà kèm ảnh quà thật, quà bay lên sân |
  | Quà lớn | Cắt cảnh, banner avatar 160 px, idol quay về phía người tặng, nhãn vàng 30 giây |

### P2

- Bản HUD gọn khi streamer vào PK hoặc multi-guest thật của TikTok (màn hình bị thu nửa).
- Giới hạn nháy dưới 3 lần mỗi giây (TV kinh dị, laser), thêm công tắc trong panel.

## 6. Kế hoạch đưa vào app (lead-programmer): commit nhỏ, theo thứ tự

Rủi ro chuyển từ three 0.170 về r160 thấp. Game chỉ dùng Mesh, Standard/Basic material, các geometry cơ bản, Sprite, CanvasTexture, WebGLRenderTarget và đèn thường. Không dùng MeshPhysical, BatchedMesh hay ShaderMaterial. Vendor đã có `BufferGeometryUtils`. Chỉ thiếu `CSS2DRenderer`; không chép file này mà chuyển sang `LabelLayer`. Nên so ảnh chụp `CapsuleGeometry` và bóng giữa hai bản.

1. **Chuyển code:**
   - `js/` và `logic/` sang `public/games/creatoronline/`, `game-config.json` thành `data.json`
   - import map chuyển sang `/games/quaivat/vendor/`; bỏ CDN và Google Fonts, tự host font
   - test sang `tests/creatoronline-*.test.mjs`
   - chặn `dt`
2. **Gắn vào app:**
   - `GAMES.creatoronline` với các khoá `coMode: auto|demo|off`, `coQuality`, `coMaxViewers`, `coGiftMap`, `coPkEverySec`…
   - route `/overlay/creatoronline` và `/api/creatoronline/*`
   - `view-creatoronline`, `creatoronline-panel.js`, CSS `.creatoronline-*`
   - `TT_CHILD_GAMES`; bỏ `soon: true` trong registry
3. **Tách logic thuần, có test:**
   - `logic/room-sim.js`: dạng reducer; quà, thể loại, đèn, idol, vai, vòng đời PK và ghế trả về mô tả hiệu ứng; đồng hồ và rng truyền vào
   - `logic/events.js`: gift/chat/like/join của TikTok → ý định; đặt khoá theo userId; `coGiftMap`
   - `logic/director.js`: chọn phòng và cảnh quay
   - Test: mưa quà, PK theo quà, vé → `seats.claim`, khoá theo userId
4. **Overlay `game.js` gọn:**
   - camera đạo diễn, không có người chơi
   - socket.io chép từ `nhatu/game.js:1095–1134`: `gameConfig`, `overlay:reload`, `gameDisabled/Enabled`, `gift`/`chat`/`like`/`social`
   - trần số người xem theo `population.js`
5. **Gắn quà và bình luận:** `coGiftMap`, mã bình luận (dùng lại `parseActionCode`), fan đặt khoá theo userId.
6. **Gia cố:**
   - đặt trần và gộp `giftFx`, pháo giấy, số tiếng đồng thời
   - `disposeCharacter`
   - tạo AudioContext ngay khi tải trang (OBS cho tự phát)
   - `?win=1` và `?q=low` giống Nhà Tù
7. **Chế độ demo** (`?demo=1` / `coMode: demo`): giữ WASD, HUD, vòng quay, cửa hàng (ví chỉ nằm trong bộ nhớ) và NPC giả, để streamer xem thử và để chạy test.
8. **Spec `docs/superpowers/specs/<ngày>-creatoronline-design.md`** và đoạn mô tả trong CLAUDE.md.

**Xoá:** `server/server.mjs`, `Choi-game.bat`, `net.js` và code người chơi từ xa, ví localStorage (chỉ giữ `sanitizeLook`), `/api/audio` (thay bằng danh sách tĩnh trong `data.json`), `package.json`.

## 7. Quyết định cần chốt trước khi viết spec

1. **Phe trong PK:** theo nhóm fan đã chọn bằng bình luận `1`–`5` *(đề xuất)*, hay để người xem bình luận chọn phe cho từng trận?
2. **Hoa hồng:** cho fan lên sân khấu 12 giây *(game-designer đề xuất, là móc quà đầu tiên)*, hay chỉ cổ vũ tại chỗ *(economy-designer, giữ giá trị cho quà to)*?
3. **Cấp fan:** giữ trọn đời theo TikTok ID *(đề xuất)*, hay đặt lại mỗi buổi LIVE?
4. **Lật kèo PK:** chỉ bằng tim miễn phí *(đề xuất)*, hay thêm quà Boost +20% trong 15 giây?
5. **Quà giả của NPC khi đang LIVE:** tắt hẳn *(đề xuất)*, hay chỉ để làm cảnh và gắn nhãn NPC?
6. **Nhịp PK:** mặc định mỗi 5 phút (streamer chỉnh 2–15 phút)? game-designer đề xuất 8 phút, economy-designer đề xuất nghỉ 75 giây giữa các trận.
