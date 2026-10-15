# 👑 Chào người xem vào phòng (VIP Welcome) — Đơn đặt vẽ LÀM LẠI

> Đọc **Quy tắc chung** ở `../README.md` trước.
> **Ảnh tham chiếu thẻ hiện tại:** `khung-mau/the-hien-tai_3-bac-thap.jpg`, `khung-mau/the-hien-tai_3-bac-cao.png`.
> **Khung mẫu để vẽ bám theo:** `khung-mau/the-chao_plate.png` (thẻ) và `khung-mau/khung-avatar_frame.png` (khung avatar).
> Hãy đính kèm các ảnh này cho ChatGPT.

## 1. Bối cảnh

Khi người xem có cấp TikTok cao vào phòng LIVE, góc trái màn hình trượt ra một **thẻ chào**. Thẻ gồm:
- Avatar trong khung tròn.
- Dải chip trên: tên bậc · LV · FAN LV · "VÀO PHÒNG".
- Tên người xem cỡ lớn, kèm ô tổng xu đã tặng.
- Dòng phụ nhỏ: @id · TOP / MOD / SUB / BẠN BÈ · "Ghé lần thứ N" · "🔥 5 buổi liền".

Thẻ hiển thị **640 × 150 px** trên màn 1080 × 1920. Tối đa 3 thẻ chồng nhau, mỗi thẻ ở lại 5 giây. Thẻ trượt vào từ trái trong 0.52 s và trượt ra 0.42 s.

**Có 5 bậc** (theo cấp TikTok):

| Bậc | Cấp | Tên |
|---|---|---|
| T1 | ≥ 1 | Tân binh |
| T2 | ≥ 15 | Hào kiệt |
| T3 | ≥ 25 | Đại gia |
| T4 | ≥ 35 | Huyền thoại |
| T5 | ≥ 45 | Chí tôn |

Ngoài ra có **thẻ gộp** ("A, B và 12 người khác") khi nhiều người cấp thấp vào cùng lúc.

## 2. Vì sao phải làm lại (kết quả rà soát)
- Toàn bộ thẻ dựng bằng **CSS gradient**. 5 bậc chỉ khác nhau **màu**, nên Đại gia (cam) và Huyền thoại (đỏ) gần như giống hệt nhau. Người xem không cảm nhận được "lên bậc".
- Khung avatar là **ngôi sao gai CSS** xoay tròn, trông rẻ.
- **Không có huy hiệu bậc**, không có biểu tượng riêng cho từng bậc.
- **Không có hiệu ứng vào phòng**: bậc Chí tôn cũng chỉ trượt vào y như Tân binh.
- Lỗi bố cục (Claude sửa trong code):
  - Tên bị cắt "Khách VIP…" khi số xu dài (2.500.000).
  - Chip "TOP 1" và "BẠN BÈ" bị xuống 2 dòng.
  - Chữ dòng phụ quá nhỏ.

## 3. Hệ toạ độ chung (RẤT QUAN TRỌNG)

Mọi file thẻ (`plate`, `fx-vao`, `fx-lap`) dùng **cùng canvas 1536 × 1024**. Thẻ thật được **phóng ×2.1** và đặt ở **x 110 → 1454, y 354 → 669**. Nhờ vậy code chồng các lớp lên nhau khít từng pixel.

| Vùng | Toạ độ trên canvas 1536×1024 | Art vẽ gì |
|---|---|---|
| Khung avatar (tâm) | (259, 512), Ø khung 390, Ø lỗ avatar 298 | **KHÔNG vẽ ở plate**, vẽ ở `frame.png` |
| Dải chip trên | x 425→1433, y 362→434 | Nền ruy băng/dải kim loại **phẳng, đủ tối** để chữ trắng đọc rõ |
| Thanh tên (thân thẻ) | x 303→1454, y 465→629 | Thân thẻ chính, mang họa tiết bậc |
| ↳ Ô tên người xem | x 454→1076, y 480→614 | **Nền phẳng, tối vừa, KHÔNG họa tiết, KHÔNG lấp lánh**. Chữ trắng 40px in nghiêng đè lên |
| ↳ Ô số xu | x 1097→1402, y 493→602 | Nền tối hơn chút (code vẽ viên kim cương + số) |
| Dòng phụ | x 463→1433, y 629→667 | Dải mảnh tối mờ (alpha ~55%) để chữ nhỏ đọc rõ |
| Trang trí tràn ngoài thẻ (cánh, lửa, rồng, tia sáng) | trong **x 62→1474, y 200→830** | Được phép, nhưng không đè lên ô tên / ô xu |
| Ngoài lề | x < 62, x > 1474, y < 62, y > 962 | **Trống hoàn toàn** |

**Không vẽ chữ nào** lên thẻ. Tên bậc, LV, tên người, số xu đều do code viết, vì phải đổi theo từng người.

## 4. Danh sách file cho MỖI bậc

Mã bậc dùng trong tên file: `T1-tan-binh`, `T2-hao-kiet`, `T3-dai-gia`, `T4-huyen-thoai`, `T5-chi-ton`.

| File | Canvas | Mô tả | Code làm gì |
|---|---|---|---|
| `VW-<bậc>_plate.png` | 1536×1024 | **Thân thẻ** đầy đủ: dải chip trên + thanh tên + dải phụ + trang trí bậc | Hiện ngay khi thẻ trượt vào |
| `VW-<bậc>_frame.png` | 1024×1024 | **Khung avatar**: trang trí trong Ø900 tâm (512,512), **lỗ tròn trong suốt Ø552** ở giữa | Avatar đặt dưới lỗ |
| `VW-<bậc>_frame-vong.png` | 1024×1024 | *(chỉ T3–T5)* **Vòng hào quang** ngoài cùng (tia sáng, tinh thể, lửa) để xoay chậm. Họa tiết đối xứng tròn, lỗ giữa Ø700 trong suốt | Code xoay 360° mỗi 9–12 s, phía sau `frame.png` |
| `VW-<bậc>_huy-hieu.png` | 1024×1024 | **Huy hiệu bậc** (rank badge), chiếm 76% canvas | Gắn ở **đáy khung avatar**, tâm tại (259, 690) của plate, hiển thị ~60 px. Lên bậc cao thì huy hiệu to và rực hơn |
| `VW-<bậc>_fx-vao_01…NN.png` | 1536×1024 | **Hiệu ứng vào phòng**, chạy 1 lần khi thẻ xuất hiện. Cùng hệ toạ độ với plate | Phát **24 fps**, chồng lên thẻ, xong thì biến mất |
| `VW-<bậc>_fx-lap_01…08.png` | 1536×1024 | *(chỉ T4, T5)* **Hiệu ứng lặp** suốt 5 s thẻ hiện. **Ô tên và ô xu giữ alpha ≤ 25%** | Lặp **12 fps** |

## 4b. ✅ Vòng viền avatar ĐANG XOAY — Claude đã làm bằng code (15/10/2026)
Phần **chuyển động quanh avatar không cần ChatGPT vẽ**. Code CSS đã thay ngôi sao gai cũ bằng khung nhiều lớp:
- Viền kim loại bóng tĩnh, có vân sáng-tối và bóng kính.
- **Luồng sáng sao chổi** chạy quanh viền: đuôi mờ dần, đầu sáng trắng.
- **Vòng vạch mảnh** quay ngược chiều, rất chậm.
- **Hào quang thở** (phập phồng 2.8 s).
- Từ bậc Đại gia có thêm **2 hạt sáng bay quanh**.

Bậc càng cao càng rực:
- Huyền thoại: 2 sao chổi lửa đối xứng.
- Chí tôn: sao chổi cầu vồng, viền đổi sắc.

Xem: `khung-mau/vong-avatar-moi_5-bac.gif`, `khung-mau/the-chao-moi_5-bac.gif`, hoặc mở `/_prototype/vip-ring-preview.html` trên app.

**Vì vậy, với ChatGPT:**
- `frame.png` (khung tĩnh trang trí: rồng, phượng, cánh, vương miện) **vẫn nên vẽ**. Khung này đặt **chồng lên** viền code, nên **phần sát lỗ avatar** (vòng Ø552 → Ø640) phải để **trong suốt**, để vẫn thấy sao chổi chạy.
- `frame-vong.png` giờ là **tuỳ chọn**. Nếu vẽ thì **bắt buộc** theo luật vẽ vật để xoay:
  1. **KHÔNG vẽ ánh sáng cố định** (không highlight trên-trái, không bóng đổ một phía). Ảnh xoay sẽ kéo vệt sáng chạy vòng theo, nhìn rất giả. Hãy vẽ **sáng đều mọi hướng** (tự phát sáng, glow đều).
  2. Họa tiết **lặp đều quanh tâm**: 6, 8, 12 hoặc 24 phần giống hệt nhau. Không có chi tiết "đầu/đáy".
  3. **Tâm ảnh = tâm xoay** đúng (512, 512). Lệch 1–2 px là khi xoay sẽ lắc lư.
  4. Lỗ giữa tròn tuyệt đối, Ø700, trong suốt.
  5. Không chữ, không logo (xoay sẽ bị lộn ngược).

## 5. Thiết kế từng bậc

> Mỗi bậc lên phải **rực rỡ hơn rõ rệt**: thêm vật liệu quý, thêm chi tiết tràn ra ngoài, hiệu ứng dài hơn. Nhưng **ô tên luôn sạch để đọc**.
> **Phong cách chung:** 2.5D game mobile cao cấp (kiểu thẻ rank Liên Quân / Free Fire), kim loại bóng, đá quý, ánh sáng trên-trái.

### T1 · Tân binh (cấp ≥ 1) — băng bạc
- **Màu:** xanh băng `#1FB3E6` → `#0B3F78`, bạc `#C8F6FF`.
- **plate:** thanh kim loại bạc-xanh đơn giản, mép vát. 2–3 tinh thể băng nhỏ ở đầu phải thẻ.
- **frame:** vòng bạc trơn, 4 tinh thể băng nhỏ ở 4 hướng.
- **huy-hieu:** khiên bạc nhỏ 1 ngôi sao.
- **fx-vao (6 khung):** 1 vệt sáng trắng-xanh quét từ trái sang phải qua thẻ (khung 1→6), mờ dần.

### T2 · Hào kiệt (cấp ≥ 15) — tím thép
- **Màu:** tím `#7B3FE4` → `#3B1D8F`, viền thép sáng `#C9B5FF`.
- **plate:** thanh tím có viền kim loại khắc rãnh. **2 thanh kiếm bắt chéo** mờ ở đầu phải thẻ (sau ô xu, không đè số).
- **frame:** vòng tím thép, **2 cánh kiếm nhỏ** chĩa ra 2 bên.
- **huy-hieu:** khiên tím có 2 kiếm bắt chéo, 2 sao.
- **fx-vao (8 khung):**
  1. Khung 1–3: tia chớp tím loé quanh khung avatar.
  2. Khung 4–8: vệt sáng quét qua thẻ, lấp lánh rơi.

### T3 · Đại gia (cấp ≥ 25) — vàng kim, tiền tài
- **Màu:** vàng kim `#FFD36B` → `#E98A12` → nâu đồng `#6E2600`.
- **plate:** thân **vàng kim bóng** có hoa văn mây lành chìm. Đầu phải thẻ có **3 thỏi vàng + vài đồng xu** chất lên (tràn nhẹ ra ngoài mép phải và mép dưới, trong vùng cho phép). Dải chip là ruy băng đỏ son viền vàng.
- **frame:** vòng vàng dày đính **4 viên hồng ngọc**, có mây lành vàng 2 bên.
- **frame-vong:** vòng tia sáng vàng hình nan quạt (12 tia).
- **huy-hieu:** túi tiền vàng / thỏi vàng có **vương miện nhỏ**, 3 sao.
- **fx-vao (12 khung):**
  1. Khung 1–4: **mưa đồng xu vàng** rơi từ trên xuống quanh thẻ.
  2. Khung 5–8: xu chạm thẻ bật lấp lánh.
  3. Khung 9–12: ánh vàng quét ngang rồi tắt.

### T4 · Huyền thoại (cấp ≥ 35) — phượng hoàng lửa
- **Màu:** đỏ thẫm `#5C0707` → đỏ lửa `#FF3B1F` → cam vàng `#FFB800`.
- **plate:** thân **đỏ thẫm ánh kim** có vân lửa chìm. **Đôi cánh phượng hoàng lửa** dang ra từ sau khung avatar, sải lên trên và xuống dưới thẻ (tràn ngoài, trong vùng cho phép). Đầu phải thẻ có đuôi lông phượng vàng-đỏ.
- **frame:** vòng vàng đỏ có **đầu phượng hoàng** ở đỉnh khung, lông vũ lửa quanh viền.
- **frame-vong:** vòng lửa xoáy.
- **huy-hieu:** phượng hoàng dang cánh trên khiên đỏ, 4 sao.
- **fx-vao (16 khung):**
  1. Khung 1–5: **phượng hoàng lửa bay** từ trái vụt qua toàn thẻ.
  2. Khung 6–10: để lại vệt lửa cháy dọc mép thẻ.
  3. Khung 11–16: tàn lửa bay lên rồi tắt.
- **fx-lap (8 khung):** lưỡi lửa nhỏ liếm dọc **mép trên và mép dưới** thẻ, tàn lửa li ti bay lên (không đè ô tên).

### T5 · Chí tôn (cấp ≥ 45) — rồng vàng kim cương
- **Màu:** xanh đêm `#10264A`, ánh cầu vồng kim cương (`#3FA9FF` → `#8F5CFF` → `#FF7AD9`), vàng ròng `#FFD700`.
- **plate:**
  - Thân **pha lê / kim cương giác cắt**, ánh cầu vồng.
  - Viền **vàng ròng chạm rồng**.
  - **Một con rồng vàng** uốn từ sau khung avatar dọc mép trên thẻ: đầu rồng ở đầu phải, nhô lên trên dải chip, không đè chữ.
  - **Đôi cánh pha lê** sau khung avatar.
- **frame:** vòng vàng ròng đính **kim cương lớn ở đỉnh**, vương miện nhỏ trên đỉnh khung, rồng quấn quanh nửa dưới vòng.
- **frame-vong:** vòng tinh thể kim cương xoay, lấp lánh.
- **huy-hieu:** **vương miện kim cương** trên khiên vàng có rồng, 5 sao, toả sáng.
- **fx-vao (20 khung):**
  1. Khung 1–4: màn hình loé sáng trắng-tím quanh thẻ.
  2. Khung 5–12: **rồng vàng bay vòng** quanh thẻ từ trái sang phải, thân rồng lướt **phía sau** ô tên.
  3. Khung 13–16: nổ hạt kim cương lấp lánh.
  4. Khung 17–20: hào quang tắt dần.
- **fx-lap (8 khung):** hạt kim cương lấp lánh nhấp nháy quanh mép thẻ và quanh khung avatar, kèm ánh cầu vồng chạy dọc viền vàng.

## 6. File dùng chung (mọi bậc)

| File | Canvas | Mô tả |
|---|---|---|
| `VW-nhom_plate.png` | 1536×1024 | **Thẻ gộp nhiều người** (dùng cho bậc dưới 25). Tông tím-xanh nhẹ. Phía trái thẻ (x 110→420) là **chỗ trống cho 3 avatar chồng nhau** (code vẽ), còn lại như plate thường |
| `VW-avatar-mac-dinh.png` | 1024×1024 | Avatar mặc định khi người xem không có ảnh: bóng người chibi trung tính trên nền tròn gradient tím `#6D5DFC → #2B1F6B`, kín hình tròn 92% canvas |
| `VW-icon_top.png` | 1024×1024 | Vương miện vàng nhỏ (chip TOP) |
| `VW-icon_mod.png` | 1024×1024 | Khiên xanh lá có cờ lê (chip MOD) |
| `VW-icon_sub.png` | 1024×1024 | Ngôi sao tím (chip SUB) |
| `VW-icon_ban-be.png` | 1024×1024 | 2 trái tim lồng nhau xanh dương (chip BẠN BÈ) |
| `VW-icon_lan-dau.png` | 1024×1024 | Pháo giấy confetti (chip "Lần đầu ghé phòng") |
| `VW-icon_chuoi.png` | 1024×1024 | Ngọn lửa cam (chip "N buổi liền") |

> Icon hiển thị rất nhỏ (~18 px) nên phải **khối đơn giản, viền tối mảnh, chiếm 80% canvas**.

## 7. Tổng số file
| Bậc | plate | frame | frame-vong | huy-hieu | fx-vao | fx-lap | Cộng |
|---|---|---|---|---|---|---|---|
| T1 Tân binh | 1 | 1 | — | 1 | 6 | — | 9 |
| T2 Hào kiệt | 1 | 1 | — | 1 | 8 | — | 11 |
| T3 Đại gia | 1 | 1 | 1 | 1 | 12 | — | 16 |
| T4 Huyền thoại | 1 | 1 | 1 | 1 | 16 | 8 | 28 |
| T5 Chí tôn | 1 | 1 | 1 | 1 | 20 | 8 | 32 |
| Dùng chung | | | | | | | 8 |
| **Tổng** | | | | | | | **104** |

**Thứ tự nên vẽ:**
1. **Đợt 1** (đủ để thay thẻ CSS): 5 × (`plate` + `frame` + `huy-hieu`) + thẻ nhóm + avatar mặc định + 6 icon = **23 file**.
2. **Đợt 2:** `frame-vong` + `fx-vao` + `fx-lap`.

## 8. Quy tắc riêng cho hiệu ứng động (fx-vao, fx-lap)
- **Mọi khung cùng canvas 1536×1024, cùng hệ toạ độ thẻ.** Không dịch, không phóng cả cảnh giữa các khung.
- Vật thể bay (phượng, rồng, đồng xu) phải **ở trong lề an toàn ở MỌI khung**. Lúc bay vào/ra thì **mờ dần trong lề**, không bay ra khỏi mép ảnh (nếu ra khỏi mép sẽ bị cắt cụt).
- **Ô tên** (x 454→1076, y 480→614): ở fx-vao được che **tối đa 3 khung liền nhau**; ở fx-lap luôn **alpha ≤ 25%**.
- Giữ nhân vật (rồng, phượng) **cùng hình dạng, cùng tỉ lệ** giữa các khung. Chỉ đổi tư thế cánh / thân theo chuyển động.
- Giao đúng số khung. Nếu ChatGPT không vẽ đủ, ghi rõ trong TRA-VE số khung thật để Claude chỉnh fps cho khớp.

## 9. Ghi chú cho Claude khi tích hợp
- Thay nền CSS `.jc-body`, `.jc-top` bằng `plate.png` theo bậc. Map skin cũ sang bậc mới:
  - `ice` → T1
  - `violet` → T2
  - `amber` → T3
  - `flame` → T4
  - `diamond` → T5
- Khung PNG người dùng tự tải lên (`frameUrl`) vẫn **ưu tiên** hơn `frame.png` mặc định.
- Sửa lỗi bố cục:
  - Tên tự thu cỡ chữ (40 → 28 px) trước khi cắt "…".
  - Xu ≥ 1 triệu viết gọn "2,5Tr".
  - Chip `white-space: nowrap`.
  - Chữ dòng phụ 15 → 17 px.
- fx: ghép khung PNG thành WebM VP9 có alpha (ffmpeg) hoặc chạy bằng canvas sprite. Đặt `transform` giống plate. Phát khi thẻ bắt đầu `jcIn`.

---

## 10. ✨ THANH CHÀO GỌN (đang chạy thật từ 15/10/2026) — đặt vẽ LINH VẬT thay sao băng
Overlay thật giờ mặc định là **thanh chào gọn**:
- Cao 46 px, nằm sát mép trên khu bình luận.
- Code: `public/games/vipwelcome/joinbar.css` + `bar-slots.js`. Mẫu xem: `/_prototype/vip-compact.html`.

Hiện tại một **sao băng** (code CSS) lượn sóng tới đỉnh avatar rồi ôm vòng quanh avatar. Đợt này đặt ChatGPT vẽ **5 linh vật** bay theo đúng đường đó, giống hoa hồng / thiên thần / rồng trong video Douyin mẫu.

| Bậc | Linh vật | Màu chủ đạo |
|---|---|---|
| Hào kiệt | Đại bàng tím nhỏ | tím `#C3A2FF` |
| Đại gia | Cá chép vàng (cá chép hoá rồng) | vàng `#FFD36B` |
| Huyền thoại | Phượng hoàng lửa | cam đỏ `#FF9A5C` |
| Chí tôn | Rồng kim cương cầu vồng | tím-hồng `#E2B8FF` |
| *(tuỳ chọn)* Tân binh | Chim én băng | xanh `#6FD9FF` |

**Quy cách mỗi linh vật:**
- `VW-LV-<bậc>_bay_01…12.png`: **12 khung** chu kỳ vỗ cánh / uốn thân khi bay. Canvas **1024×1024**, con vật nhìn nghiêng, **đầu hướng TRÁI** (vì bay từ phải sang trái), chiếm ~70% canvas, lề ≥ 62 px. **Tâm thân** đặt tại (50%, 50%) ở mọi khung — code cho đi theo đường cong và xoay theo hướng bay.
- `VW-LV-<bậc>_tan_01…06.png`: **6 khung** linh vật **tan thành hạt sáng** quanh một vòng tròn (lúc nhập vào avatar). Canvas 1024×1024, tâm vòng tròn tại (50%, 50%), vòng Ø ~60% canvas.
- Hiển thị khoảng **70–90 px**, nên hình phải khối rõ, viền sáng, **không chi tiết li ti**.
- **Đuôi hạt sáng do code vẽ**, đừng vẽ vệt dài phía sau con vật.
- Code chạy 24 fps. Đoạn bay ~1 giây (lặp chu kỳ 12 khung); đoạn tan 0,25 giây.
