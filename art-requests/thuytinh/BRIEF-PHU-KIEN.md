# 🎀 Hũ Thủy Tinh — 41 phụ kiện trang trí hũ (85 file PNG)

> File đặt vẽ cho ChatGPT. Đọc **Quy tắc chung** ở `../README.md` trước.
> Mỗi phụ kiện thuộc 1 trong **5 kiểu neo**. Mỗi kiểu có **1 khung mẫu** trong `khung-mau-phu-kien/<kiểu>.png`.
> **Luôn đính kèm khung mẫu đúng kiểu khi yêu cầu vẽ.**
> Bản này **thay thế mục TT-B01…B09 trong `BRIEF.md`**. 9 phụ kiện cũ được vẽ lại với cùng mã.

## 1. Vì sao phải theo khung mẫu

- Game có **46 kiểu hũ**. Miệng hũ rộng từ 57% đến 82% bề ngang hũ, có hũ miệng cao, có hũ miệng thấp.
- Code **không** dán phụ kiện theo bề ngang hũ, mà **căn đúng mép miệng** của từng kiểu hũ:
  - Phụ kiện có `scale = bề rộng miệng thật ÷ 640`.
  - Điểm neo xanh lá trên khung mẫu trùng tâm (hoặc góc) miệng hũ thật.
- Vì vậy chỉ cần vẽ **1 lần**, phụ kiện sẽ vừa khít cả 46 kiểu hũ.
- Nếu vẽ lệch khỏi đường miệng xanh, phụ kiện sẽ lơ lửng hoặc lún vào hũ.

## 2. Thông số chung

| Mục | Giá trị |
|---|---|
| Canvas | **1536 × 1024 px** (ngang), **PNG RGBA nền trong suốt thật** |
| Lề an toàn | Mọi pixel có màu (glow, lấp lánh, tua rua) nằm trong **x 64→1472, y 48→976** |
| Đường miệng chuẩn | Elip miệng hũ: mép ngoài **x 448→1088**, tâm **y = 384**, nửa cao 34 px (đường xanh dương trên khung mẫu) |
| Thân chuẩn (kiểu `than`) | Hình chữ nhật bo góc **x 368→1168, y 180→900** |
| Phong cách | **2.5D bóng bẩy kiểu sticker game mobile cao cấp**: khối tròn, viền sáng mép trên-trái, bóng mềm phía dưới-phải, highlight trắng nhỏ. Không viền đen dày, không phẳng kiểu clipart |
| Ánh sáng | Từ **trên-trái**, giống hũ |
| Bóng đổ | **Không** vẽ bóng đổ lên nền. Được vẽ bóng tiếp xúc rất nhẹ (alpha ≤ 25%) ngay dưới dây/nơ nơi chạm kính |
| Màu | Bão hoà vừa phải. Phải nổi trên cả hũ trong suốt lẫn nền LIVE tối |

### 2 lớp ảnh
```
z5  _truoc.png  ← LỚP TRƯỚC: đè lên kính và lên quà (nơ, đai trước, thú ngồi, vật treo)
z4  hũ front.png
z3  quà rơi
z2  hũ back.png
z1  _sau.png    ← LỚP SAU: nằm sau quà (nửa vòng sau cổ, chóp vương miện phía sau, tai, cánh, hào quang)
```
- Lớp trước và lớp sau **cùng canvas, chồng khít nhau**.
- Vùng **đỏ "CẤM"** trên khung mẫu là làn quà rơi. **Lớp trước không được có pixel nào trong đó.**
- Lớp sau được phép nằm trong vùng đỏ, vì quà rơi đè lên trên lớp sau.

### Ảnh động
- **Mọi khung giữ nguyên canvas, nguyên điểm neo, nguyên kích thước.** Chỉ phần chuyển động được đổi (mắt, đuôi, cánh, ánh đèn).
- Nên xin ChatGPT **từng khung một** trong cùng cuộc trò chuyện: "giữ y nguyên, chỉ đổi sang khung 2/3".
- Code tự lo nhịp (chớp mắt 3–5 giây/lần, cánh 6 khung/giây, đèn 2 khung/giây). Code cũng tự lắc lư nhẹ cho vật treo và nơ, nên **không cần vẽ khung lắc**.

## 3. 5 kiểu neo

### `co` — Ôm cổ hũ (nơ, dây chuyền, vòng hoa, khăn)
Khung mẫu: `khung-mau-phu-kien/co.png` · điểm neo **(768, 384)** = tâm miệng hũ
- Vùng lớp TRƯỚC (khung cam): x 300→1236, y 344→760
- Vùng lớp SAU (khung tím): x 300→1236, y 324→470
- Lớp TRƯỚC nằm từ mép miệng trở xuống: dải ôm cổ y 384→470, nút/mặt dây/đuôi nơ rủ tối đa tới y 760.
- Chỉ được nhô lên trên mép miệng 40 px (vành ruy băng). Vùng đỏ phía trên miệng phải TRỐNG — đó là làn quà rơi.
- Lớp SAU (nếu có): nửa vòng dây phía sau cổ, cong lên theo elip miệng, y 324→470.

### `vanh` — Đội trên vành miệng (vương miện, tai, sừng, vòng lá)
Khung mẫu: `khung-mau-phu-kien/vanh.png` · điểm neo **(768, 384)** = tâm miệng hũ
- Vùng lớp TRƯỚC (khung cam): x 200→1336, y 120→520
- Vùng lớp SAU (khung tím): x 300→1236, y 120→384
- Lớp TRƯỚC: đai trước ôm nửa dưới elip miệng (y 360→470) + phần nhô lên CHỈ ở 2 bên: x < 488 hoặc x > 1048.
- Lớp SAU: các chóp/tai/sừng phía sau vành, được nhô lên giữa (quà rơi ĐÈ LÊN lớp sau nên không che quà), cao tối đa tới y 120.
- Vùng đỏ = làn quà rơi: lớp TRƯỚC không được vẽ gì trong đó.

### `ngoi` — Thú/nhân vật ngồi trên vai miệng hũ (bên PHẢI; code tự lật khi muốn bên trái)
Khung mẫu: `khung-mau-phu-kien/ngoi.png` · điểm neo **(1088, 384)** = góc phải vành miệng
- Vùng lớp TRƯỚC (khung cam): x 1010→1472, y 60→600
- Mông/chân thú đặt đúng điểm neo (1088, 384) = góc phải vành miệng; thân ngồi lệch ra NGOÀI hũ.
- Không phần nào vượt qua x < 1018 phía trên miệng (tay vắt vào miệng tối đa 70 px).
- Đuôi/chân thả xuống mặt ngoài thân hũ tối đa tới y 600.
- Mặt nhìn hơi về phía TRÁI (vào hũ), ánh sáng từ trên-trái.

### `treo` — Treo trước thân hũ (đèn lồng, lì xì, huy chương, chuông)
Khung mẫu: `khung-mau-phu-kien/treo.png` · điểm neo **(768, 384)** = tâm miệng hũ
- Vùng lớp TRƯỚC (khung cam): x 520→1016, y 354→960
- Dây treo bắt đầu ở vành cổ (y 384→420), vật treo nằm giữa thân, đáy vật treo ≤ y 960.
- Vật treo rộng tối đa 496 px (x 520→1016) để không che quá nhiều quà trong hũ.
- Code cho lắc lư nhẹ quanh điểm buộc dây — điểm buộc ở (768, 400).

### `than` — Gắn theo THÂN hũ, nằm SAU hũ (cánh, hào quang)
Khung mẫu: `khung-mau-phu-kien/than.png` · điểm neo **(768, 540)** = tâm thân hũ
- Vùng lớp SAU (khung tím): x 64→1472, y 48→976
- Chỉ có lớp SAU (nằm sau hũ và sau quà). Hình chữ nhật xám = thân hũ chuẩn rộng 800 px.
- Cánh: gốc cánh dính sát mép thân (x 368 / 1168) ở khoảng y 300→520, sải ra 2 bên.
- Hào quang: tâm vòng sáng ở tâm thân (768, 540).

## 4. Danh sách phụ kiện

Ký hiệu lớp: **T** = chỉ lớp trước · **T+S** = trước + sau · **S** = chỉ lớp sau. **Khung** = số ảnh động (1 = ảnh tĩnh).

### 🎀 Ôm cổ hũ (14)

#### B01 · Nơ lụa hồng — `bow-pink`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Nơ lụa satin bóng buộc quanh cổ: dải ruy băng ôm cổ, nút nơ to giữa phía trước dưới mép miệng, 2 cánh nơ phồng, 2 đuôi rủ chéo cắt chữ V.
- **Bảng màu:** hồng #FF5D8F, sáng #FFB3CC, tối #B8326A
- **File giao:** `B01_bow-pink_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ lụa hồng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B02 · Nơ lụa xanh — `bow-blue`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Như B01, xanh dương.
- **Bảng màu:** xanh #3B82F6, sáng #9CC8FF, tối #1E3A8A
- **File giao:** `B02_bow-blue_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ lụa xanh accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B03 · Nơ trắng viền bạc — `bow-white`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Như B01, lụa trắng ngà có viền chỉ bạc.
- **Bảng màu:** trắng ngà #FFF8EE, bạc #C9D1DC
- **File giao:** `B03_bow-white_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ trắng viền bạc accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B04 · Nơ nhung đen — `bow-black`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Như B01, nhung đen mịn, viền chỉ bạc, nút nơ đính 1 viên pha lê.
- **Bảng màu:** đen nhung #1A1A22, bạc #D8DEE6
- **File giao:** `B04_bow-black_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ nhung đen accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B10 · Nơ caro đỏ — `bow-tartan`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Giáng sinh
- **Mô tả:** Nơ vải dạ caro Scotland đỏ-xanh lá, viền vàng, đuôi tua rua.
- **Bảng màu:** đỏ #C62828, xanh #1B5E20, vàng #F4C542
- **File giao:** `B10_bow-tartan_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ caro đỏ accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B11 · Nơ cầu vồng pastel — `bow-pastel`
- **Kiểu neo:** `co` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Nơ voan 2 lớp, lớp ngoài trong mờ, ruy băng chuyển màu pastel hồng→tím→xanh, đính hạt ngọc nhỏ.
- **Bảng màu:** pastel #FFC4DD → #D8B4FE → #A5D8FF
- **File giao:** `B11_bow-pastel_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Nơ cầu vồng pastel accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B06 · Vòng hoa anh đào — `flower-cherry`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Mùa xuân
- **Mô tả:** Vòng hoa anh đào quanh cổ, cụm hoa to ở 2 bên vai, giữa phía trước thưa và thấp, vài cánh rơi.
- **Bảng màu:** hồng #FDA4AF, nhuỵ #F472B6, lá #65A30D
- **File giao:** `B06_flower-cherry_truoc.png`, `B06_flower-cherry_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vòng hoa anh đào accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B07 · Chuỗi sao vàng — `star-gold`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Chuỗi sao vàng vắt quanh cổ, 1 ngôi sao to giữa phía trước DƯỚI mép miệng, đủ 5 cánh nguyên vẹn.
- **Bảng màu:** vàng #FDE047 → #F59E0B, viền #78350F
- **File giao:** `B07_star-gold_truoc.png`, `B07_star-gold_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Chuỗi sao vàng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B09 · Dây chuyền kim cương — `gem-diamond`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Dây chuyền bạch kim vắt quanh cổ, mặt dây là viên kim cương xanh giác cắt brilliant ở giữa, lấp lánh 4 cánh.
- **Bảng màu:** kim cương #7DD3FC/#06B6D4, bạch kim #E5E7EB
- **File giao:** `B09_gem-diamond_truoc.png`, `B09_gem-diamond_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Dây chuyền kim cương accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B14 · Chuỗi ngọc trai — `pearl`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** 2 vòng ngọc trai trắng ánh hồng vắt quanh cổ, vòng ngoài võng thấp hơn, khoá vàng nhỏ.
- **Bảng màu:** ngọc #FFF7F0 ánh #F9D5E5, khoá #F4C542
- **File giao:** `B14_pearl_truoc.png`, `B14_pearl_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Chuỗi ngọc trai accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B15 · Dây đèn LED — `fairy-lights`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 2 · **Dịp:** Giáng sinh
- **Mô tả:** Dây đồng mảnh quấn 2 vòng quanh cổ, 10–12 bóng LED nhỏ. Khung 1: bóng sáng vàng ấm có quầng; khung 2: nửa số bóng (xen kẽ) tắt.
- **Bảng màu:** đèn #FFE08A quầng #FFB84D, dây #8B6B3D
- **File giao:** `B15_fairy-lights_truoc_1.png`, `B15_fairy-lights_truoc_2.png`, `B15_fairy-lights_sau_1.png`, `B15_fairy-lights_sau_2.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Dây đèn LED accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B16 · Dây cờ sinh nhật — `bunting`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Dây cờ tam giác nhiều màu võng quanh cổ (7 lá phía trước), chấm bi và kẻ sọc.
- **Bảng màu:** đỏ #FF6B6B, vàng #FFD93D, xanh #4D96FF, lục #6BCB77
- **File giao:** `B16_bunting_truoc.png`, `B16_bunting_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Dây cờ sinh nhật accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B17 · Vòng hoa Hawaii — `lei-hawaii`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Mùa hè
- **Mô tả:** Vòng hoa dâm bụt + sứ trắng dày dặn quanh cổ, hoa to nhất ở giữa phía trước.
- **Bảng màu:** dâm bụt #FF4F79, sứ #FFF4D6 nhuỵ #FFC94D
- **File giao:** `B17_lei-hawaii_truoc.png`, `B17_lei-hawaii_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vòng hoa Hawaii accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B12 · Khăn len mùa đông — `scarf-knit`
- **Kiểu neo:** `co` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Mùa đông
- **Mô tả:** Khăn len đan quấn cổ hũ, 1 đầu khăn có tua rua rủ xuống bên phải, hoa văn bông tuyết.
- **Bảng màu:** đỏ #D7263D, trắng #FFFFFF, vân #B81D31
- **File giao:** `B12_scarf-knit_truoc.png`, `B12_scarf-knit_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Khăn len mùa đông accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

### 👑 Đội trên vành miệng (9)

#### B05 · Vương miện vàng — `crown`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Vương miện vàng kim đeo như vòng quanh vành miệng, đính hồng ngọc + lam ngọc. Trước: đai + chóp 2 bên. Sau: các chóp phía sau (cao hơn, sau quà).
- **Bảng màu:** vàng #F4C542 → #B7791F, ngọc #E11D48 / #2563EB
- **File giao:** `B05_crown_truoc.png`, `B05_crown_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vương miện vàng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B18 · Tiara bạc pha lê — `tiara`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Vương miện công chúa bạc, chóp giữa cao (ở lớp SAU), pha lê giọt nước lấp lánh.
- **Bảng màu:** bạc #E5E7EB, pha lê #BAE6FD, hồng #F9A8D4
- **File giao:** `B18_tiara_truoc.png`, `B18_tiara_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Tiara bạc pha lê accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B19 · Vòng hoa đội đầu — `flower-crown`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Mùa xuân
- **Mô tả:** Vòng hoa cúc, hồng nhỏ và baby trắng đặt trên vành miệng, 2 dải ruy băng rủ xuống bên trái.
- **Bảng màu:** hồng #F9A8D4, cúc #FDE68A, lá #84CC16
- **File giao:** `B19_flower-crown_truoc.png`, `B19_flower-crown_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vòng hoa đội đầu accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B20 · Tai mèo — `cat-ears`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** 2 tai mèo lông xù ở 2 góc vành (trái + phải), lòng tai hồng; nửa đai lông mảnh ôm vành phía sau.
- **Bảng màu:** lông #F5E6D3, lòng tai #FFB3C7
- **File giao:** `B20_cat-ears_truoc.png`, `B20_cat-ears_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Tai mèo accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B21 · Tai thỏ — `bunny-ears`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** 2 tai thỏ dài dựng ở lớp SAU (tai trái hơi gập), đai cài tóc ôm vành; có nơ nhỏ ở lớp TRƯỚC góc phải.
- **Bảng màu:** trắng #FFFFFF, lòng #FFC2D1
- **File giao:** `B21_bunny-ears_truoc.png`, `B21_bunny-ears_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Tai thỏ accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B22 · Sừng tuần lộc — `reindeer`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Giáng sinh
- **Mô tả:** 2 sừng tuần lộc nâu ở 2 góc vành + nhánh lá ô rô và quả đỏ ở chân sừng.
- **Bảng màu:** sừng #8B5A2B, lá #15803D, quả #DC2626
- **File giao:** `B22_reindeer_truoc.png`, `B22_reindeer_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Sừng tuần lộc accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B08 · Vòng lá Noel — `leaves-christmas`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Giáng sinh
- **Mô tả:** Vòng lá thông quấn quanh vành có quả châu đỏ, chuông vàng, nơ đỏ ở góc phải.
- **Bảng màu:** thông #166534, châu #DC2626, chuông #F4C542
- **File giao:** `B08_leaves-christmas_truoc.png`, `B08_leaves-christmas_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vòng lá Noel accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B23 · Vòng nguyệt quế vàng — `laurel`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Vòng lá nguyệt quế mạ vàng của nhà vô địch, 2 nhánh gặp nhau ở chính giữa phía trước dưới vành.
- **Bảng màu:** vàng #F4C542 → #A16207
- **File giao:** `B23_laurel_truoc.png`, `B23_laurel_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vòng nguyệt quế vàng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

#### B24 · Sừng quỷ Halloween — `devil-horns`
- **Kiểu neo:** `vanh` · **Lớp:** T+S · **Khung:** 1 · **Dịp:** Halloween
- **Mô tả:** 2 sừng quỷ đỏ bóng ở 2 góc vành, mạng nhện mảnh vắt nửa vành phía sau.
- **Bảng màu:** đỏ #DC2626 → #7F1D1D, nhện #E5E7EB
- **File giao:** `B24_devil-horns_truoc.png`, `B24_devil-horns_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Sừng quỷ Halloween accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front (then back layer separately)."

### 🐱 Ngồi trên vai hũ (8)

#### B25 · Mèo con vắt vai — `pet-cat`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Quanh năm
- **Mô tả:** Mèo cam mũm mĩm ngồi trên vai phải, 1 chân trước vắt vào trong miệng, đuôi thả xuống thân hũ. Khung 1 mở mắt, 2 nhắm nửa, 3 nhắm (chớp mắt).
- **Bảng màu:** cam #F6A04D, trắng #FFF4E6, má #FFB3B3
- **File giao:** `B25_pet-cat_truoc_1.png`, `B25_pet-cat_truoc_2.png`, `B25_pet-cat_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Mèo con vắt vai accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B26 · Gấu bông — `pet-bear`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Quanh năm
- **Mô tả:** Gấu bông nâu đeo nơ cổ đỏ ngồi vai phải, ôm vành bằng 2 tay. 3 khung chớp mắt.
- **Bảng màu:** nâu #A47148, mõm #E9C9A3, nơ #E11D48
- **File giao:** `B26_pet-bear_truoc_1.png`, `B26_pet-bear_truoc_2.png`, `B26_pet-bear_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Gấu bông accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B27 · Chim cánh cụt — `pet-penguin`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Mùa đông
- **Mô tả:** Cánh cụt con quàng khăn xanh ngồi vai phải, 1 cánh vẫy. Khung 1–3: cánh vẫy lên/giữa/xuống.
- **Bảng màu:** đen #1F2937, bụng #F8FAFC, mỏ #F59E0B, khăn #38BDF8
- **File giao:** `B27_pet-penguin_truoc_1.png`, `B27_pet-penguin_truoc_2.png`, `B27_pet-penguin_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Chim cánh cụt accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B28 · Thỏ trắng — `pet-bunny`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Trung Thu
- **Mô tả:** Thỏ trắng ôm củ cà rốt ngồi vai phải, tai cụp 1 bên. 3 khung chớp mắt.
- **Bảng màu:** trắng #FFFFFF, lòng tai #FFC2D1, cà rốt #FB923C
- **File giao:** `B28_pet-bunny_truoc_1.png`, `B28_pet-bunny_truoc_2.png`, `B28_pet-bunny_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Thỏ trắng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B29 · Cún Shiba — `pet-shiba`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Quanh năm
- **Mô tả:** Cún Shiba cười híp mắt ngồi vai phải, lưỡi thè. Khung 1–3: đuôi vẫy trái/giữa/phải.
- **Bảng màu:** cam #E8A23B, trắng #FFF6E9
- **File giao:** `B29_pet-shiba_truoc_1.png`, `B29_pet-shiba_truoc_2.png`, `B29_pet-shiba_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Cún Shiba accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B30 · Vịt vàng — `pet-duck`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Mùa hè
- **Mô tả:** Vịt cao su vàng đeo kính bơi ngồi vai phải. Khung 1–3: lắc lư nghiêng -6° / 0° / +6° quanh điểm neo.
- **Bảng màu:** vàng #FFD93D, mỏ #FF8C42
- **File giao:** `B30_pet-duck_truoc_1.png`, `B30_pet-duck_truoc_2.png`, `B30_pet-duck_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Vịt vàng accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B31 · Heo con Tết — `pet-pig`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 3 · **Dịp:** Tết
- **Mô tả:** Heo hồng mặc áo yếm đỏ thêu chữ Phúc, ôm thỏi vàng, ngồi vai phải. 3 khung chớp mắt.
- **Bảng màu:** hồng #FFB6C1, yếm #D7263D, vàng #F4C542
- **File giao:** `B31_pet-pig_truoc_1.png`, `B31_pet-pig_truoc_2.png`, `B31_pet-pig_truoc_3.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Heo con Tết accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B32 · Người tuyết mini — `pet-snowman`
- **Kiểu neo:** `ngoi` · **Lớp:** T · **Khung:** 1 · **Dịp:** Giáng sinh
- **Mô tả:** Người tuyết 2 tầng đội mũ len đỏ, quàng khăn, mũi cà rốt, ngồi vai phải.
- **Bảng màu:** tuyết #F8FAFC bóng #CBD5E1, mũ #DC2626
- **File giao:** `B32_pet-snowman_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Người tuyết mini accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

### 🏮 Treo trước thân (6)

#### B33 · Đèn lồng Trung Thu — `hang-lantern`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 2 · **Dịp:** Trung Thu
- **Mô tả:** Đèn lồng ông sao đỏ-vàng treo bằng dây đỏ có tua rua. Khung 1/2: ánh nến sáng/tối nhẹ (lung linh).
- **Bảng màu:** đỏ #DC2626, vàng #FACC15, nến #FFE08A
- **File giao:** `B33_hang-lantern_truoc_1.png`, `B33_hang-lantern_truoc_2.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Đèn lồng Trung Thu accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B34 · Bao lì xì — `hang-lixi`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 1 · **Dịp:** Tết
- **Mô tả:** 2 bao lì xì đỏ chữ "Lộc" vàng + 1 dây pháo nhỏ treo chéo, nút thắt may mắn đỏ.
- **Bảng màu:** đỏ #C8102E, vàng kim #F4C542
- **File giao:** `B34_hang-lixi_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Bao lì xì accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B35 · Huy chương TOP — `hang-medal`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Huy chương vàng dây xanh-đỏ, mặt huy chương in số "1" nổi và ngôi sao, viền răng cưa.
- **Bảng màu:** vàng #F4C542 → #B7791F, dây #2563EB / #DC2626
- **File giao:** `B35_hang-medal_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Huy chương TOP accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B36 · Chuông Noel — `hang-bells`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 1 · **Dịp:** Giáng sinh
- **Mô tả:** 2 chuông vàng buộc nơ đỏ và nhánh ô rô.
- **Bảng màu:** chuông #F4C542, nơ #DC2626, lá #15803D
- **File giao:** `B36_hang-bells_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Chuông Noel accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B37 · Dây trái tim — `hang-hearts`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 1 · **Dịp:** Valentine
- **Mô tả:** 3 trái tim bóng (đỏ, hồng, trắng) treo so le bằng ruy băng mảnh.
- **Bảng màu:** đỏ #E11D48, hồng #F472B6, trắng #FFF1F2
- **File giao:** `B37_hang-hearts_truoc.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Dây trái tim accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

#### B38 · Bí ngô mini — `hang-pumpkin`
- **Kiểu neo:** `treo` · **Lớp:** T · **Khung:** 2 · **Dịp:** Halloween
- **Mô tả:** Bí ngô Jack-o-lantern nhỏ treo dây; khung 1/2: ánh lửa trong mắt sáng/tối.
- **Bảng màu:** cam #F97316, lửa #FDE047, cuống #4D7C0F
- **File giao:** `B38_hang-pumpkin_truoc_1.png`, `B38_hang-pumpkin_truoc_2.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Bí ngô mini accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: front."

### 🪽 Sau thân hũ (4)

#### B39 · Cánh thiên thần — `wings-angel`
- **Kiểu neo:** `than` · **Lớp:** S · **Khung:** 4 · **Dịp:** Quanh năm
- **Mô tả:** Đôi cánh lông vũ trắng ánh vàng mọc 2 bên thân hũ. 4 khung vỗ cánh: khép → mở 1/3 → mở hết → mở 2/3 (gốc cánh KHÔNG đổi chỗ).
- **Bảng màu:** trắng #FFFFFF, bóng #E0E7FF, viền vàng #FDE68A
- **File giao:** `B39_wings-angel_sau_1.png`, `B39_wings-angel_sau_2.png`, `B39_wings-angel_sau_3.png`, `B39_wings-angel_sau_4.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Cánh thiên thần accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: back."

#### B40 · Cánh ác quỷ — `wings-devil`
- **Kiểu neo:** `than` · **Lớp:** S · **Khung:** 4 · **Dịp:** Halloween
- **Mô tả:** Cánh dơi đỏ thẫm có gân, 4 khung vỗ như B39.
- **Bảng màu:** đỏ #7F1D1D → #DC2626, gân #450A0A
- **File giao:** `B40_wings-devil_sau_1.png`, `B40_wings-devil_sau_2.png`, `B40_wings-devil_sau_3.png`, `B40_wings-devil_sau_4.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Cánh ác quỷ accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: back."

#### B41 · Cánh bướm — `wings-butterfly`
- **Kiểu neo:** `than` · **Lớp:** S · **Khung:** 4 · **Dịp:** Mùa xuân
- **Mô tả:** Cánh bướm trong suốt ánh cầu vồng, 4 khung vỗ như B39.
- **Bảng màu:** ánh #A5F3FC → #F0ABFC, viền #7C3AED
- **File giao:** `B41_wings-butterfly_sau_1.png`, `B41_wings-butterfly_sau_2.png`, `B41_wings-butterfly_sau_3.png`, `B41_wings-butterfly_sau_4.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Cánh bướm accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: back."

#### B42 · Hào quang — `halo`
- **Kiểu neo:** `than` · **Lớp:** S · **Khung:** 1 · **Dịp:** Quanh năm
- **Mô tả:** Vòng hào quang tia sáng vàng sau hũ (code tự xoay chậm), tâm sáng trong suốt để không làm loá quà.
- **Bảng màu:** vàng #FDE68A alpha 70% → 0%
- **File giao:** `B42_halo_sau.png`
- **Prompt gợi ý:** "Transparent PNG 1536x1024, Hào quang accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: back."

## 5. Gợi ý ghép bộ theo mùa (code tự gợi ý khi đổi kiểu hũ)

| Dịp | Hũ | Phụ kiện hợp |
|---|---|---|
| Tết | 31 bánh chưng · 32 mai vàng · 33 lì xì · 28 túi lộc | B34 Bao lì xì · B31 Heo con · B05 Vương miện |
| Valentine | 34 kẹo tim · 06 trái tim | B37 Dây trái tim · B01 Nơ hồng · B21 Tai thỏ |
| Xuân | 36 anh đào · 35 bình hoa | B06 Vòng anh đào · B19 Vòng hoa đội đầu · B41 Cánh bướm |
| Hè | 37 dưa hấu · 38 trái dừa · 39 biển | B17 Vòng Hawaii · B30 Vịt vàng |
| Trung Thu | 40 mặt trăng · 41 hộp bánh · 07 đèn lồng | B33 Đèn lồng · B28 Thỏ trắng |
| Halloween | 43 vạc · 08 bí ngô | B38 Bí ngô mini · B24 Sừng quỷ · B40 Cánh ác quỷ |
| Noel / Đông | 21 châu Noel · 44 người tuyết · 45 ca cao · 09 cầu tuyết | B08 Vòng lá · B22 Sừng tuần lộc · B15 Dây đèn · B36 Chuông · B12 Khăn len · B27 Cánh cụt · B32 Người tuyết |
| Sang chảnh | 16 cúp · 23 kim cương · 30 vương miện · 17 ly pha lê | B05 · B18 Tiara · B09 Kim cương · B23 Nguyệt quế · B35 Huy chương · B39 Cánh thiên thần · B42 Hào quang |

## 6. Giao file

- Bỏ tất cả vào `ve-xong/phu-kien/`, **đúng tên file** ở mục 4.
- Ghi vào `ve-xong/TRA-VE.md` 1 dòng mỗi phụ kiện: mã, số file, điểm neo đo lại (px), ghi chú.
- **Đợt 1 nên vẽ trước 12 phụ kiện:** B01, B05, B06, B07, B09, B15, B20, B25, B26, B33, B34, B39.

## 7. ChatGPT tự soát trước khi giao
- [ ] Canvas đúng **1536×1024**, nền trong suốt thật (không ô caro giả).
- [ ] Lớp trước **không có pixel nào** trong vùng đỏ "CẤM".
- [ ] Phụ kiện bám đúng elip miệng xanh, không lơ lửng phía trên, không lún xuống.
- [ ] Không chi tiết nào chạm lề an toàn (cánh, tua rua, lấp lánh).
- [ ] Ảnh động: các khung chồng lên nhau khớp tuyệt đối, chỉ phần động thay đổi.
- [ ] Lớp trước và lớp sau ghép lại thành 1 vật liền mạch (vòng dây phía sau nối đúng 2 đầu với vòng phía trước).
