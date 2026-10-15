# 🫙 Hũ Thủy Tinh — 46 kiểu hũ (30 kiểu thường + 16 kiểu theo mùa, 2 lớp ảnh)

> Đây là file đặt hàng vẽ cho ChatGPT. Đọc kỹ **Quy tắc chung** ở `../README.md` trước.
> Mỗi kiểu hũ có 1 **ảnh khung mẫu** trong `khung-mau/NN-<id>.png`. Hãy **đính kèm ảnh khung mẫu khi yêu cầu vẽ**, vì hình dáng hũ đã được tính sẵn để quà rơi lọt và nằm gọn trong hũ.

## 1. Vì sao phải 2 lớp ảnh

Trong game, quà (ảnh tròn, vật lý Matter.js) được vẽ **kẹp giữa** 2 lớp ảnh hũ:

```
z4  front.png  ← LỚP TRƯỚC: kính mặt trước, viền ngoài, phản quang, nửa trước miệng, trang trí đè lên quà
z3  (quà rơi, vẽ bằng code)
z2  back.png   ← LỚP SAU: mặt trong thành sau, nửa sau miệng, mặt đáy bên trong, trang trí phía sau
```

Nhờ vậy quà trông như **nằm trong** hũ: thành kính phía trước phủ lên quà, còn mặt đáy và thành sau nằm phía sau quà.

## 2. Thông số kỹ thuật (bắt buộc cho MỌI kiểu)

| Mục | Giá trị |
|---|---|
| Kích thước canvas | **1024 × 1536 px** (dọc), cả 2 lớp **cùng kích thước, cùng vị trí, chồng khít nhau** |
| Nền | **Trong suốt thật (PNG RGBA)**. KHÔNG vẽ nền ô caro giả, nền trắng hay nền màu |
| Lề an toàn | Mọi pixel có màu (kể cả glow, lấp lánh, bóng) phải nằm trong khung **x 41→983 px, y 46→1490 px**. Không phần nào bị cắt ở mép ảnh |
| Góc nhìn | Chính diện, nhìn hơi từ trên xuống ~10°, nên miệng và đáy hiện thành **elip dẹt** |
| Ánh sáng | Nguồn sáng từ **trên-trái**. Phản quang mạnh ở thành trái, phản quang mảnh ở thành phải |
| Độ dày kính | Khoảng **25 px** (vùng xám trong khung mẫu = bề dày kính nhìn từ trước) |
| Đường đỏ trong khung mẫu | **Mặt trong của thành kính**. Quà va chạm đúng đường này, nên mép trong của kính PHẢI trùng đường đỏ (sai số ≤ 6 px) |
| Đường xanh nét đứt | **Miệng hũ** (mép trong). Phía trên miệng là **LÀN RƠI QUÀ** (khung xanh): lớp trước KHÔNG được có gì trong làn này |
| Vạch xanh lục ở đáy | Mặt đáy bên trong (quà nằm trên đường này) |
| Hộp cam | Vùng cho trang trí **lớp TRƯỚC** |
| Hộp tím | Vùng cho trang trí **lớp SAU** |

### Độ trong suốt (alpha) — để quà luôn nhìn rõ
- **front.png**
  - Bên trong lòng hũ (vùng xanh nhạt của khung mẫu): kính phủ alpha **≤ 12%**.
  - Vệt phản quang alpha tối đa **55%**, dạng vệt dài mảnh, tổng diện tích **≤ 15%** lòng hũ.
  - Viền kính, mép miệng, đáy: alpha **70–95%**.
  - Trang trí trên thân (nhãn, mặt thú, chữ): alpha **≤ 85%**, nằm đúng hộp cam.
- **back.png**
  - Thành trong phía sau: alpha **15–30%** (tô màu ám nhẹ theo bảng màu).
  - Nửa sau vành miệng: elip **mép trên**.
  - Mặt đáy bên trong: elip đặc hơn, alpha **60–90%**.
  - **Không có gì nằm ngoài silhouette hũ**, trừ trang trí lớp sau trong hộp tím.

### Elip miệng và đáy (góc nhìn hơi từ trên)
- **Miệng**: elip tâm nằm trên đường xanh, bề rộng = bề rộng miệng + 2× bề dày kính, chiều cao ≈ **0.022 × 1536 ≈ 34 px** mỗi nửa. **Nửa trên (phía sau) vẽ ở back.png, nửa dưới (phía trước) vẽ ở front.png.**
- **Đáy**: elip mặt đáy trong có tâm ở vạch xanh lục, nửa chiều cao ≈ **40 px**, vẽ ở back.png. Viền đáy ngoài (dày, sáng) vẽ ở front.png, ngay dưới vạch xanh lục.
- Riêng đáy nhọn (trái tim, kim cương), đáy tròn (quả châu, bình thuốc, ống nghiệm) và đáy cầu: không cần elip đáy, chỉ cần bóng tối dần về điểm thấp nhất.

## 3. Cách giao file (ChatGPT trả về)

Mỗi kiểu giao 3 file vào `ve-xong/hu/`:

```
ve-xong/hu/NN-<id>/front.png      1024×1536, lớp trước
ve-xong/hu/NN-<id>/back.png       1024×1536, lớp sau
ve-xong/hu/NN-<id>/preview.png    1024×1536, ghép back + front trên nền xám đậm #2A2A2A (chỉ để duyệt)
```

Rồi ghi 1 dòng cho kiểu đó vào `ve-xong/TRA-VE.md`.

**Cách vẽ cho khớp:**
1. Đính kèm `khung-mau/NN-<id>.png` → vẽ **front.png** bám sát silhouette xám và đường đỏ.
2. Đính kèm **chính front.png vừa vẽ + khung mẫu** → vẽ **back.png** trùng khít vị trí.
3. Nếu ChatGPT không xuất được 2 lớp tách rời: giao **1 ảnh hũ hoàn chỉnh** (`full.png`) + **1 ảnh chỉ phần kính phía trước** (`front.png`). Claude sẽ tự tách `back = full − front`.

> ✅ Hình học cả 46 kiểu đã được **mô phỏng vật lý Matter.js**: hũ cao 400 px và 700 px, 60 fps và 30 fps, nhiều lượt thả. Kết quả **0 quà xuyên thành kính** (`sim-ket-qua*.json`). Vì vậy giữ đúng hình dáng khung mẫu là quà sẽ rơi lọt và nằm gọn.
>
> Claude sẽ **đo lại thành trong từ ảnh thật** (kênh alpha) và cập nhật va chạm, nên lệch vài px vẫn xử lý được. Nhưng **không được đổi hình dáng hũ** so với khung mẫu.

---

## 4. Danh sách kiểu hũ

### 4.1 — 30 kiểu thường (01–30)

### 01. Hũ Mason cổ điển — `mason-co-dien`
_Bản chuẩn, nâng cấp từ hũ hiện tại (giữ đúng hình học cũ)_  ·  khung mẫu: `khung-mau/01-mason-co-dien.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **300 px**, từ x 154 → 870 px (rộng 717 px). Lối vào hẹp nhất rộng **709 px**.
- **Thân rộng nhất (mép trong):** x 80 → 944 px, tại y ≈ 884 px.
- **Đáy trong (điểm thấp nhất):** y = **1384 px**.
- **Bảng màu:** kính trong #E8F4FF, viền sáng #FFFFFF, bóng #9FB7C9
- **front.png:** ren xoáy 2 vòng ở cổ, 2 vệt phản quang dọc thân trái/phải, viền đáy dày 2 lớp.
- **back.png:** nửa sau miệng (elip), mặt trong thành sau rất mờ, mặt đáy trong (elip) có vân kính.
- **Toạ độ mép trong bên phải (px, trích):** (870,300), (866,336), (886,372), (927,402), (940,396), (944,720), (942,1290), (935,1367), (926,1371), (881,1382), (620,1383) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bản chuẩn, nâng cấp từ hũ hiện tại (giữ đúng hình học cũ), glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 02. Hũ mật ong lục giác — `mat-ong-luc-giac`
_Hũ lục giác cạnh vát, ánh hổ phách_  ·  khung mẫu: `khung-mau/02-mat-ong-luc-giac.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **614 px**.
- **Thân rộng nhất (mép trong):** x 102 → 922 px, tại y ≈ 438 px.
- **Đáy trong (điểm thấp nhất):** y = **1382 px**.
- **Bảng màu:** hổ phách #F7B733 → #E08E0B, kính #FFF6D6
- **front.png:** 3 mặt lục giác thấy được (giữa sáng, 2 bên tối hơn), cạnh vát sáng, giọt mật ở vai, ong nhỏ.
- **back.png:** mặt trong tô vàng mật 12% alpha, đáy trong lục giác.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] giọt mật chảy từ vai trái — hộp x 61→225, y 584→799 px
  - [TRƯỚC] con ong nhỏ đậu vai phải — hộp x 860→973, y 261→384 px
- **Toạ độ mép trong bên phải (px, trích):** (819,307), (819,361), (922,438), (922,1313), (819,1382), (512,1382) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ lục giác cạnh vát, ánh hổ phách, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 03. Bể cá tròn — `be-ca-tron`
_Bể cá cầu miệng loe, đặt trên đế_  ·  khung mẫu: `khung-mau/03-be-ca-tron.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **435 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **610 px**.
- **Thân rộng nhất (mép trong):** x 92 → 932 px, tại y ≈ 771 px.
- **Đáy trong (điểm thấp nhất):** y = **1167 px**.
- **Bảng màu:** nước biển #7FD6FF 10%, viền #DFF6FF, rong #3BB273
- **front.png:** mép loe dày ở miệng, phản quang cong theo cầu, đế gỗ.
- **back.png:** mặt sau cầu xanh nước nhạt, 3 bọt khí, sỏi + rong phía sau.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] sỏi màu + rong biển thấp phía sau đáy — hộp x 307→717, y 1075→1167 px
  - [TRƯỚC] đế tròn gỗ sáng dưới bể — hộp x 287→737, y 1175→1290 px
- **Toạ độ mép trong bên phải (px, trích):** (819,435), (852,521), (896,598), (923,682), (932,771), (922,859), (894,943), (848,1020), (788,1085), (715,1136), (603,1167) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bể cá cầu miệng loe, đặt trên đế, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 04. Hũ dược phẩm cổ — `duoc-pham`
_Apothecary vai tròn, nhãn cổ điển_  ·  khung mẫu: `khung-mau/04-duoc-pham.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **261 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 99 → 925 px, tại y ≈ 1396 px.
- **Đáy trong (điểm thấp nhất):** y = **1406 px**.
- **Bảng màu:** kính hơi xanh lục #D9F2E6, nhãn #F3E5C0 viền #7A4E2D
- **front.png:** nhãn giấy giữa thân, viền vai bo, gờ cổ dày.
- **back.png:** đáy trong dày, mặt sau xanh lục 8%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] nhãn giấy cổ "HP GIFTS", alpha 85% — hộp x 307→717, y 845→1014 px
- **Toạ độ mép trong bên phải (px, trích):** (803,261), (803,293), (803,330), (827,349), (860,369), (887,355), (906,445), (913,884), (911,1321), (925,1406), (891,1382), (700,1390), (512,1390) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Apothecary vai tròn, nhãn cổ điển, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 05. Hũ bánh quy bầu — `banh-quy-bau`
_Thùng bầu tròn kiểu cookie jar_  ·  khung mẫu: `khung-mau/05-banh-quy-bau.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **604 px**.
- **Thân rộng nhất (mép trong):** x 82 → 942 px, tại y ≈ 845 px.
- **Đáy trong (điểm thấp nhất):** y = **1375 px**.
- **Bảng màu:** kính ấm #FFF1E0, nâu bánh #C68642, socola #5B3A29
- **front.png:** 2 vòng gờ ngang mảnh ở 1/3 và 2/3 thân, bánh quy dán 2 bên mép.
- **back.png:** mặt sau ánh kem nhạt.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] bánh quy socola dán vai trái — hộp x 61→205, y 461→645 px
  - [TRƯỚC] bánh quy cắn dở dán thân phải — hộp x 819→963, y 1075→1260 px
- **Toạ độ mép trong bên phải (px, trích):** (819,307), (814,336), (839,375), (891,430), (922,545), (938,688), (942,845), (938,1001), (921,1148), (891,1275), (878,1341), (739,1370), (512,1375) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Thùng bầu tròn kiểu cookie jar, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 06. Hũ trái tim — `trai-tim`
_Thân trái tim, cổ ngắn giữa 2 thuỳ, đáy nhọn_  ·  khung mẫu: `khung-mau/06-trai-tim.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **276 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 70 → 954 px, tại y ≈ 483 px.
- **Đáy trong (điểm thấp nhất):** y = **1390 px**.
- **Bảng màu:** hồng #FF5D8F → #FFB3C9, kính #FFE3EC
- **front.png:** 2 thuỳ tim bóng, viền hồng đậm, 3 tim nhỏ lấp lánh ở thuỳ phải.
- **back.png:** mặt sau hồng 10%, đáy chữ V hội tụ giữa.
- **Toạ độ mép trong bên phải (px, trích):** (803,276), (803,361), (850,330), (911,346), (947,415), (952,522), (932,660), (881,829), (799,998), (696,1167), (594,1306), (512,1390) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Thân trái tim, cổ ngắn giữa 2 thuỳ, đáy nhọn, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 07. Hũ đèn lồng — `den-long`
_Đèn lồng Hội An bằng kính, vành + đáy gỗ đỏ_  ·  khung mẫu: `khung-mau/07-den-long.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **261 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 74 → 950 px, tại y ≈ 806 px.
- **Đáy trong (điểm thấp nhất):** y = **1283 px**.
- **Bảng màu:** đỏ son #C0392B, vàng kim #F4C542, kính ấm #FFE8D0
- **front.png:** nan dọc mảnh vàng kim chia 6 múi, vành gỗ miệng + đáy, tua rua.
- **back.png:** múi kính sau ánh cam nhạt như đèn đang sáng.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] vành đáy gỗ đỏ son — hộp x 225→799, y 1260→1329 px
  - [TRƯỚC] tua rua đỏ treo dưới đáy — hộp x 471→553, y 1329→1482 px
  - [SAU] vành miệng gỗ đỏ (nửa sau) — hộp x 205→819, y 238→276 px
- **Toạ độ mép trong bên phải (px, trích):** (803,261), (803,326), (831,364), (894,437), (934,562), (949,727), (947,922), (928,1079), (884,1196), (832,1259), (693,1281) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Đèn lồng Hội An bằng kính, vành + đáy gỗ đỏ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 08. Hũ bí ngô — `bi-ngo`
_Bí ngô Halloween thấp, rộng_  ·  khung mẫu: `khung-mau/08-bi-ngo.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **461 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 68 → 956 px, tại y ≈ 891 px.
- **Đáy trong (điểm thấp nhất):** y = **1313 px**.
- **Bảng màu:** cam #FF8C1A → #E05A00, cuống #6B8E23
- **front.png:** 5 múi bí (gân dọc cong), mặt cười khắc mờ 15% ở nửa trên, cuống bên phải miệng.
- **back.png:** mặt sau cam 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] cuống bí cong + 1 lá, bên phải miệng — hộp x 799→952, y 307→461 px
- **Toạ độ mép trong bên phải (px, trích):** (803,461), (803,513), (831,539), (894,591), (935,691), (954,828), (952,983), (929,1114), (885,1214), (820,1277), (677,1307) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bí ngô Halloween thấp, rộng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 09. Quả cầu tuyết — `qua-cau-tuyet`
_Snow globe mở miệng trên, đế gỗ_  ·  khung mẫu: `khung-mau/09-qua-cau-tuyet.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **374 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 112 → 912 px, tại y ≈ 692 px.
- **Đáy trong (điểm thấp nhất):** y = **1000 px**.
- **Bảng màu:** kính #EAF6FF, tuyết #FFFFFF, gỗ #8B5A2B, ruy băng #D7263D
- **front.png:** phản quang tròn lớn trên trái, 5-8 hạt tuyết tĩnh, đế gỗ.
- **back.png:** nền tuyết + cây thông mờ phía sau đáy.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] đế gỗ nâu bo tròn + ruy băng đỏ — hộp x 184→840, y 1014→1428 px
  - [SAU] nền tuyết + 2 cây thông nhỏ phía sau — hộp x 307→717, y 922→1006 px
- **Toạ độ mép trong bên phải (px, trích):** (803,374), (825,442), (864,500), (891,564), (908,633), (912,702), (904,772), (884,839), (853,901), (811,957), (690,1000) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Snow globe mở miệng trên, đế gỗ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 10. Hồ lô — `ho-lo`
_Bầu hồ lô 2 bầu, eo rộng_  ·  khung mẫu: `khung-mau/10-ho-lo.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **184 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 75 → 949 px, tại y ≈ 998 px.
- **Đáy trong (điểm thấp nhất):** y = **1398 px**.
- **Bảng màu:** kính vàng ngọc #FFF4C2, dây đỏ #C0392B
- **front.png:** dây đỏ quấn eo, phản quang 2 bầu.
- **back.png:** ánh vàng nhạt.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] dây buộc đỏ ở eo + tua rua ngắn bên phải — hộp x 717→881, y 584→722 px
- **Toạ độ mép trong bên phải (px, trích):** (803,184), (803,246), (840,307), (870,415), (860,522), (804,614), (881,722), (942,891), (942,1106), (891,1275), (799,1367), (512,1398) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bầu hồ lô 2 bầu, eo rộng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 11. Bình Hy Lạp hai quai — `binh-amphora`
_Amphora kính 2 quai, chân đế_  ·  khung mẫu: `khung-mau/11-binh-amphora.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **246 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 93 → 931 px, tại y ≈ 713 px.
- **Đáy trong (điểm thấp nhất):** y = **1330 px**.
- **Bảng màu:** kính ngọc lam #CFF5EE, hoa văn vàng #D4AF37
- **front.png:** dải hoa văn chữ Hy Lạp vàng mảnh ở vai, 2 quai, chân đế.
- **back.png:** mặt sau lam nhạt.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] quai phải (vòng kính cổ → vai) — hộp x 881→978, y 307→553 px
  - [TRƯỚC] quai trái — hộp x 46→143, y 307→553 px
  - [TRƯỚC] chân đế kính — hộp x 338→686, y 1344→1467 px
- **Toạ độ mép trong bên phải (px, trích):** (809,246), (803,310), (803,362), (837,423), (901,525), (929,678), (922,860), (882,1042), (810,1196), (743,1293), (636,1329) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Amphora kính 2 quai, chân đế, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 12. Chai sữa cổ điển — `chai-sua`
_Bình sữa thủy tinh miệng rộng_  ·  khung mẫu: `khung-mau/12-chai-sua.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **215 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 99 → 925 px, tại y ≈ 1394 px.
- **Đáy trong (điểm thấp nhất):** y = **1403 px**.
- **Bảng màu:** trắng sữa kính #F7FBFF, chữ #2D6CDF
- **front.png:** gờ miệng dày, logo in xanh giữa thân, vạch đo bên trái.
- **back.png:** mặt sau trắng sữa 6%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] logo in xanh "HP MILK" + bò sữa nhỏ — hộp x 307→717, y 860→1044 px
- **Toạ độ mép trong bên phải (px, trích):** (803,215), (803,254), (803,296), (804,338), (833,386), (866,448), (896,522), (908,562), (913,857), (911,1336), (925,1394), (777,1386), (512,1382) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bình sữa thủy tinh miệng rộng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 13. Heo đất thủy tinh — `heo-dat`
_Thân heo tròn, miệng khe rộng trên lưng_  ·  khung mẫu: `khung-mau/13-heo-dat.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **384 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 74 → 950 px, tại y ≈ 830 px.
- **Đáy trong (điểm thấp nhất):** y = **1244 px**.
- **Bảng màu:** hồng phấn #FFB6C8, đậm #F06292
- **front.png:** tai, mũi, 2 chân trước rõ, mắt nhắm cười trên mũi, đuôi xoắn.
- **back.png:** mặt sau hồng 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] tai trái — hộp x 72→236, y 261→476 px
  - [TRƯỚC] tai phải — hộp x 788→952, y 261→476 px
  - [TRƯỚC] mũi heo 2 lỗ, alpha 60% — hộp x 410→614, y 845→1014 px
  - [TRƯỚC] chân trước trái — hộp x 164→328, y 1213→1413 px
  - [TRƯỚC] chân trước phải — hộp x 696→860, y 1213→1413 px
  - [TRƯỚC] đuôi xoắn — hộp x 942→978, y 768→922 px
- **Toạ độ mép trong bên phải (px, trích):** (803,384), (803,437), (839,451), (906,505), (941,619), (948,768), (947,922), (929,1053), (879,1153), (803,1212), (662,1237) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Thân heo tròn, miệng khe rộng trên lưng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 14. Hộp kính vuông — `hop-kinh`
_Hộp kính mở nắp, khung kim loại_  ·  khung mẫu: `khung-mau/14-hop-kinh.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **369 px**, từ x 133 → 891 px (rộng 758 px). Lối vào hẹp nhất rộng **758 px**.
- **Thân rộng nhất (mép trong):** x 133 → 891 px, tại y ≈ 369 px.
- **Đáy trong (điểm thấp nhất):** y = **1352 px**.
- **Bảng màu:** kính #F0F8FF, khung bạc #B8C2CC hoặc vàng #D4AF37
- **front.png:** khung 4 cạnh trước + nẹp góc, mặt trên mở thấy hình bình hành.
- **back.png:** 2 cạnh khung sau mảnh hơn, mặt đáy trong.
- **Toạ độ mép trong bên phải (px, trích):** (891,369), (891,1352), (512,1352) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hộp kính mở nắp, khung kim loại, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 15. Cốc bia có quai — `coc-bia`
_Vại bia kính dày, quai phải, bọt tràn mép trái_  ·  khung mẫu: `khung-mau/15-coc-bia.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 461 px. (Thân lệch trái để chừa chỗ cho quai bên phải.)
- **Miệng (mép trong):** y = **246 px**, từ x 133 → 788 px (rộng 655 px). Lối vào hẹp nhất rộng **655 px**.
- **Thân rộng nhất (mép trong):** x 133 → 788 px, tại y ≈ 246 px.
- **Đáy trong (điểm thấp nhất):** y = **1367 px**.
- **Bảng màu:** hổ phách #F2A900 alpha 10%, bọt #FFFFFF
- **front.png:** 6 rãnh dọc mặt cốc, quai dày, bọt tràn mép.
- **back.png:** ánh bia vàng nhạt nửa dưới.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] quai cốc bên phải — hộp x 819→978, y 430→1137 px
  - [TRƯỚC] bọt bia tràn mép TRÁI — hộp x 51→154, y 200→369 px
- **Toạ độ mép trong bên phải (px, trích):** (788,246), (778,1321), (758,1367), (461,1367) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Vại bia kính dày, quai phải, bọt tràn mép trái, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 16. Cúp vô địch — `cup-vang`
_Cúp kính viền vàng, chân + đế_  ·  khung mẫu: `khung-mau/16-cup-vang.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **184 px**, từ x 154 → 870 px (rộng 717 px). Lối vào hẹp nhất rộng **717 px**.
- **Thân rộng nhất (mép trong):** x 154 → 870 px, tại y ≈ 184 px.
- **Đáy trong (điểm thấp nhất):** y = **814 px**.
- **Bảng màu:** vàng #F4C542 → #B8860B, kính #FFF9E0
- **front.png:** viền miệng vàng, 2 quai, chân + đế vàng, ngôi sao khắc.
- **back.png:** lòng cúp vàng nhạt 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] quai phải vàng — hộp x 896→983, y 246→584 px
  - [TRƯỚC] quai trái vàng — hộp x 41→128, y 246→584 px
  - [TRƯỚC] thân cúp vàng — hộp x 410→614, y 845→1229 px
  - [TRƯỚC] đế 2 tầng + bảng tên — hộp x 225→799, y 1229→1459 px
- **Toạ độ mép trong bên phải (px, trích):** (870,184), (867,219), (860,276), (853,363), (840,461), (814,557), (778,645), (733,715), (676,768), (587,799), (512,814) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Cúp kính viền vàng, chân + đế, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 17. Ly pha lê — `ly-pha-le`
_Ly vang khổng lồ, chân cao_  ·  khung mẫu: `khung-mau/17-ly-pha-le.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **215 px**, từ x 174 → 850 px (rộng 676 px). Lối vào hẹp nhất rộng **676 px**.
- **Thân rộng nhất (mép trong):** x 153 → 871 px, tại y ≈ 440 px.
- **Đáy trong (điểm thấp nhất):** y = **860 px**.
- **Bảng màu:** pha lê #F5FBFF, cạnh cắt ánh cầu vồng nhẹ
- **front.png:** vân cắt pha lê dải dưới bầu, chân + đế.
- **back.png:** lòng ly rất trong.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] chân ly mảnh — hộp x 471→553, y 891→1306 px
  - [TRƯỚC] đế ly elip — hộp x 256→768, y 1306→1428 px
- **Toạ độ mép trong bên phải (px, trích):** (850,215), (861,289), (870,384), (870,468), (860,553), (837,641), (799,722), (744,784), (676,829), (586,852), (512,860) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Ly vang khổng lồ, chân cao, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 18. Hũ mèo — `hu-meo`
_Hũ tròn tai mèo, mặt mèo nhỏ trên vai_  ·  khung mẫu: `khung-mau/18-hu-meo.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **323 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 79 → 945 px, tại y ≈ 1009 px.
- **Đáy trong (điểm thấp nhất):** y = **1385 px**.
- **Bảng màu:** kem #FFF3E0, cam mèo #F5A25D, hồng tai #FF9EB5
- **front.png:** tai, mặt mèo cười ở vai, đuôi, 2 chân trước ở đáy.
- **back.png:** mặt sau kem nhạt.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] tai mèo trái — hộp x 61→215, y 154→384 px
  - [TRƯỚC] tai mèo phải — hộp x 809→963, y 154→384 px
  - [TRƯỚC] mắt + mũi + ria, alpha 70% — hộp x 369→655, y 430→553 px
  - [TRƯỚC] đuôi cong ôm thân phải — hộp x 922→983, y 845→1306 px
- **Toạ độ mép trong bên phải (px, trích):** (803,323), (803,358), (828,388), (901,415), (930,427), (943,723), (942,1229), (920,1340), (885,1370), (819,1382), (600,1383) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ tròn tai mèo, mặt mèo nhỏ trên vai, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 19. Hũ gấu — `hu-gau`
_Gấu bông tròn_  ·  khung mẫu: `khung-mau/19-hu-gau.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 69 → 955 px, tại y ≈ 885 px.
- **Đáy trong (điểm thấp nhất):** y = **1375 px**.
- **Bảng màu:** nâu mật #C68B59, kem #F5DEB3
- **front.png:** tai, mặt, 2 bàn chân có đệm thịt, nơ cổ đỏ.
- **back.png:** nâu nhạt 8%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] tai gấu trái — hộp x 61→225, y 184→399 px
  - [TRƯỚC] tai gấu phải — hộp x 799→963, y 184→399 px
  - [TRƯỚC] mặt gấu (mắt, mõm) — hộp x 389→635, y 415→538 px
  - [TRƯỚC] bàn chân trái — hộp x 82→246, y 1229→1413 px
  - [TRƯỚC] bàn chân phải — hộp x 778→942, y 1229→1413 px
- **Toạ độ mép trong bên phải (px, trích):** (803,307), (803,348), (821,379), (881,399), (918,451), (942,543), (952,691), (955,956), (946,1150), (922,1244), (887,1324), (737,1366), (512,1375) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Gấu bông tròn, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 20. Bình Tết men lam — `binh-men-lam`
_Ginger jar bằng kính, hoa văn lam + nơ đỏ_  ·  khung mẫu: `khung-mau/20-binh-men-lam.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **276 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 70 → 954 px, tại y ≈ 622 px.
- **Đáy trong (điểm thấp nhất):** y = **1336 px**.
- **Bảng màu:** lam #1F4E9C, trắng #FFFFFF, đỏ #D7263D, vàng #F4C542
- **front.png:** hoa văn mây + sen men lam mảnh (alpha 55%) ở vai và chân, nơ đỏ.
- **back.png:** men trắng xanh 6%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] nơ đỏ Tết ở vai phải — hộp x 788→973, y 230→461 px
  - [TRƯỚC] chân đế lam — hộp x 246→778, y 1336→1428 px
- **Toạ độ mép trong bên phải (px, trích):** (803,276), (803,316), (806,352), (881,384), (927,458), (951,561), (952,691), (936,864), (903,1040), (860,1198), (836,1293), (709,1335), (512,1336) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Ginger jar bằng kính, hoa văn lam + nơ đỏ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 21. Quả châu Noel — `qua-chau-noel`
_Quả châu cầu, chóp kim loại + móc treo_  ·  khung mẫu: `khung-mau/21-qua-chau-noel.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **438 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 92 → 932 px, tại y ≈ 797 px.
- **Đáy trong (điểm thấp nhất):** y = **1219 px**.
- **Bảng màu:** đỏ #D7263D hoặc xanh #1B998B, bạc #C0C0C0, tuyết #FFFFFF
- **front.png:** chóp bạc khía, dải băng ngang có bông tuyết, phản quang tròn.
- **back.png:** mặt sau đỏ 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] móc treo bạc (phía sau) — hộp x 471→553, y 307→415 px
  - [SAU] vành chóp bạc (nửa sau) — hộp x 205→819, y 415→461 px
  - [TRƯỚC] vành chóp bạc (nửa trước) — hộp x 205→819, y 445→499 px
- **Toạ độ mép trong bên phải (px, trích):** (803,438), (835,531), (889,613), (922,706), (932,804), (919,902), (884,994), (828,1076), (755,1142), (668,1189), (573,1214) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Quả châu cầu, chóp kim loại + móc treo, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 22. Bình thuốc phép — `binh-thuoc`
_Bình cầu cổ rộng, ánh tím phép thuật_  ·  khung mẫu: `khung-mau/22-binh-thuoc.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **154 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 102 → 922 px, tại y ≈ 972 px.
- **Đáy trong (điểm thấp nhất):** y = **1385 px**.
- **Bảng màu:** tím #8E44AD → #D980FA, phát sáng #F5D0FF
- **front.png:** gờ miệng dày, vạch chia, ký tự phù chú mảnh.
- **back.png:** ánh tím dưới đáy 18% + bong bóng.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] nút bần nằm nghiêng ngoài miệng trái — hộp x 61→205, y 123→338 px
  - [SAU] chất lỏng tím phát sáng mờ dưới đáy — hộp x 256→768, y 1229→1352 px
- **Toạ độ mép trong bên phải (px, trích):** (803,154), (833,721), (883,802), (913,892), (922,987), (908,1081), (873,1170), (818,1248), (747,1311), (663,1357), (571,1381) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bình cầu cổ rộng, ánh tím phép thuật, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 23. Hũ kim cương — `kim-cuong`
_Viên kim cương giác cắt: mặt bàn rộng, đáy nhọn_  ·  khung mẫu: `khung-mau/23-kim-cuong.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 184 → 840 px (rộng 655 px). Lối vào hẹp nhất rộng **655 px**.
- **Thân rộng nhất (mép trong):** x 72 → 952 px, tại y ≈ 492 px.
- **Đáy trong (điểm thấp nhất):** y = **1413 px**.
- **Bảng màu:** pha lê #E6F7FF, ánh cầu vồng #B388FF / #80DEEA
- **front.png:** vạch giác cắt tam giác toả từ đáy nhọn, ánh khúc xạ cầu vồng ở cạnh.
- **back.png:** giác cắt mặt sau mờ.
- **Toạ độ mép trong bên phải (px, trích):** (840,307), (840,369), (952,492), (512,1413) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Viên kim cương giác cắt: mặt bàn rộng, đáy nhọn, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 24. Xô đá — `xo-da`
_Xô đá kính miệng loe, đai bạc_  ·  khung mẫu: `khung-mau/24-xo-da.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **369 px**, từ x 102 → 922 px (rộng 819 px). Lối vào hẹp nhất rộng **819 px**.
- **Thân rộng nhất (mép trong):** x 102 → 922 px, tại y ≈ 369 px.
- **Đáy trong (điểm thấp nhất):** y = **1352 px**.
- **Bảng màu:** kính băng #DDF3FF, bạc #B8C2CC, giọt nước #FFFFFF
- **front.png:** giọt nước đọng, đai bạc miệng + đáy, 2 tay cầm.
- **back.png:** ánh băng xanh.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] tay cầm vòng phải — hộp x 901→983, y 614→768 px
  - [TRƯỚC] tay cầm vòng trái — hộp x 41→123, y 614→768 px
- **Toạ độ mép trong bên phải (px, trích):** (922,369), (922,415), (860,1352), (512,1352) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Xô đá kính miệng loe, đai bạc, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 25. Bóng đèn ý tưởng — `bong-den`
_Bóng đèn đứng, đui xoáy ở dưới_  ·  khung mẫu: `khung-mau/25-bong-den.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **253 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 82 → 942 px, tại y ≈ 553 px.
- **Đáy trong (điểm thấp nhất):** y = **1167 px**.
- **Bảng màu:** kính ấm #FFFBE6, phát sáng #FFE066, đui #A0A0A0
- **front.png:** đui xoáy 4 ren, phản quang cong, tia sáng nhỏ ngoài viền.
- **back.png:** quầng vàng ấm 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] đui đèn xoáy bạc + chân đồng — hộp x 297→727, y 1175→1382 px
  - [SAU] dây tóc vàng mờ (phía sau) — hộp x 410→614, y 983→1137 px
- **Toạ độ mép trong bên phải (px, trích):** (803,253), (860,337), (914,413), (939,517), (938,627), (911,737), (858,833), (801,917), (750,988), (724,1080), (717,1167) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bóng đèn đứng, đui xoáy ở dưới, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 26. Máy gacha — `may-gacha`
_Cầu kính trên thân máy gacha đỏ_  ·  khung mẫu: `khung-mau/26-may-gacha.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **236 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 112 → 912 px, tại y ≈ 551 px.
- **Đáy trong (điểm thấp nhất):** y = **885 px**.
- **Bảng màu:** đỏ #E53935, bạc #CFD8DC, kính #F2FBFF
- **front.png:** thân máy dưới cầu, đai kim loại nối cầu-thân, phản quang.
- **back.png:** mặt sau cầu trong.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] thân máy đỏ: núm vặn, khe nhả, chữ GACHA — hộp x 123→901, y 899→1459 px
- **Toạ độ mép trong bên phải (px, trích):** (803,236), (827,306), (867,368), (895,436), (910,509), (911,583), (899,655), (873,725), (835,788), (787,844), (669,885) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Cầu kính trên thân máy gacha đỏ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 27. Hũ đám mây — `hu-may`
_Hũ pastel viền mây gợn_  ·  khung mẫu: `khung-mau/27-hu-may.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 72 → 952 px, tại y ≈ 876 px.
- **Đáy trong (điểm thấp nhất):** y = **1352 px**.
- **Bảng màu:** xanh trời #A0D8FF, hồng #FFC7E1, trắng #FFFFFF
- **front.png:** viền gợn mây, cầu vồng nhỏ ở vai trái, 3 ngôi sao nhỏ.
- **back.png:** gradient xanh → hồng 10%.
- **Toạ độ mép trong bên phải (px, trích):** (803,307), (808,375), (899,421), (914,521), (932,629), (923,750), (952,876), (934,1001), (944,1132), (889,1265), (812,1335), (542,1351) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ pastel viền mây gợn, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 28. Túi lộc Tết — `tui-loc`
_Túi gấm thắt dây, thân phình đáy_  ·  khung mẫu: `khung-mau/28-tui-loc.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **276 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 67 → 957 px, tại y ≈ 956 px.
- **Đáy trong (điểm thấp nhất):** y = **1398 px**.
- **Bảng màu:** đỏ gấm #C62828, vàng #FFD54F
- **front.png:** vân gấm mờ, dây rút, chữ Phúc.
- **back.png:** đỏ 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] dây rút vàng quanh cổ — hộp x 184→840, y 346→399 px
  - [TRƯỚC] nút thắt + 2 đầu dây tua — hộp x 819→963, y 338→553 px
  - [TRƯỚC] chữ 福 vàng, alpha 70% — hộp x 369→655, y 799→1014 px
- **Toạ độ mép trong bên phải (px, trích):** (803,276), (803,337), (808,388), (840,430), (889,522), (929,659), (952,829), (956,998), (946,1144), (922,1260), (895,1340), (744,1384), (512,1398) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Túi gấm thắt dây, thân phình đáy, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 29. Ống nghiệm khổng lồ — `ong-nghiem`
_Ống dài đáy tròn — "cột quà" cao_  ·  khung mẫu: `khung-mau/29-ong-nghiem.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **108 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **614 px**.
- **Thân rộng nhất (mép trong):** x 205 → 819 px, tại y ≈ 108 px.
- **Đáy trong (điểm thấp nhất):** y = **1413 px**.
- **Bảng màu:** kính #F2FAFF, vạch #2D6CDF
- **front.png:** miệng loe nhẹ, vạch chia, phản quang dọc dài.
- **back.png:** rất trong.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] vạch chia in trên kính, sát thành trái — hộp x 225→307, y 461→1229 px
- **Toạ độ mép trong bên phải (px, trích):** (819,108), (819,154), (819,1106), (815,1154), (804,1201), (786,1245), (760,1286), (729,1323), (692,1354), (651,1379), (607,1398), (560,1409), (512,1413) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Ống dài đáy tròn — "cột quà" cao, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 30. Hũ vương miện — `vuong-mien`
_Thân mason, vành miệng là vương miện_  ·  khung mẫu: `khung-mau/30-vuong-mien.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **323 px**, từ x 184 → 840 px (rộng 655 px). Lối vào hẹp nhất rộng **643 px**.
- **Thân rộng nhất (mép trong):** x 79 → 945 px, tại y ≈ 891 px.
- **Đáy trong (điểm thấp nhất):** y = **1384 px**.
- **Bảng màu:** vàng #F4C542, ngọc đỏ #E53935, ngọc xanh #1E88E5
- **front.png:** đai vàng có ngọc quanh cổ; chóp trước chỉ ở 2 bên, KHÔNG che giữa miệng.
- **back.png:** chóp sau giữa.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] chóp vương miện phía sau — hộp x 307→717, y 154→323 px
  - [TRƯỚC] chóp trước trái — hộp x 102→200, y 154→323 px
  - [TRƯỚC] chóp trước phải — hộp x 824→922, y 154→323 px
  - [TRƯỚC] đai vương miện có ngọc — hộp x 133→891, y 315→384 px
- **Toạ độ mép trong bên phải (px, trích):** (840,323), (834,358), (863,389), (922,415), (939,411), (944,731), (942,1290), (931,1367), (922,1371), (881,1382), (620,1383) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Thân mason, vành miệng là vương miện, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 4.2 — 16 kiểu THEO MÙA / DỊP LỄ (31–46)

App có thể **tự đổi hũ theo ngày** (gợi ý). Lịch dùng từng dịp:

| Mã dịp | Dịp | Thời gian dùng | Kiểu hũ |
|---|---|---|---|
| `tet` | Tết Nguyên Đán | khoảng 3 tuần quanh Tết âm lịch | 31 Hũ bánh chưng, 32 Bình mai vàng, 33 Hũ lì xì |
| `valentine` | Valentine | 07/02 → 15/02 | 34 Hũ kẹo Valentine |
| `phu-nu` | Quốc tế Phụ nữ 8/3 · Phụ nữ Việt Nam 20/10 | 01/03 → 09/03 và 13/10 → 21/10 | 35 Bình hoa 8/3 · 20/10 |
| `xuan` | Mùa xuân | tháng 2 → 4 (ngoài Tết) | 36 Hũ hoa anh đào |
| `he` | Mùa hè | tháng 5 → 8 | 37 Bát dưa hấu, 38 Trái dừa, 39 Hũ biển xanh |
| `quoc-khanh` | Quốc khánh 2/9 | 28/08 → 03/09 | 46 Hũ Quốc khánh 2/9 |
| `trung-thu` | Trung Thu | khoảng 2 tuần quanh rằm tháng 8 âm lịch | 40 Hũ mặt trăng, 41 Hộp bánh Trung Thu |
| `thu` | Mùa thu | tháng 9 → 11 | 42 Hũ lá phong |
| `halloween` | Halloween | 20/10 → 01/11 | 43 Vạc phù thủy |
| `noel` | Giáng sinh | 01/12 → 26/12 | 44 Người tuyết |
| `dong` | Mùa đông | tháng 12 → 1 | 45 Cốc ca cao nóng |

> Hũ theo mùa nên **cùng chất lượng kính** với hũ thường. Trang trí mùa (hoa mai, bí, tuyết…) đặt ở **2 bên / phía sau**, KHÔNG che làn rơi quà và không che lòng hũ quá 15%.

### 31. Hũ bánh chưng — `tet-banh-chung`
**Dịp:** `tet`  ·  _Hộp kính vuông gói lá dong, buộc lạt tre_  ·  khung mẫu: `khung-mau/31-tet-banh-chung.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **338 px**, từ x 154 → 870 px (rộng 717 px). Lối vào hẹp nhất rộng **717 px**.
- **Thân rộng nhất (mép trong):** x 154 → 870 px, tại y ≈ 338 px.
- **Đáy trong (điểm thấp nhất):** y = **1352 px**.
- **Bảng màu:** lá dong #2E7D32 → #66BB6A, lạt tre #C8A165, kính ám xanh lá
- **front.png:** mép kính viền lá dong xanh 4 cạnh, 2 dải lạt tre dọc mảnh (alpha 85%), nút lạt ở góc phải trên.
- **back.png:** mặt trong ám xanh lá 12%, đáy vuông.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] lạt tre dọc trái (dải mảnh) — hộp x 307→369, y 346→1382 px
  - [TRƯỚC] lạt tre dọc phải (dải mảnh) — hộp x 655→717, y 346→1382 px
  - [TRƯỚC] nút lạt buộc + lá dong vểnh bên phải — hộp x 891→983, y 154→369 px
- **Toạ độ mép trong bên phải (px, trích):** (870,338), (870,1352), (512,1352) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hộp kính vuông gói lá dong, buộc lạt tre, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 32. Bình mai vàng — `tet-mai-vang`
**Dịp:** `tet`  ·  _Bình kính dáng ginger jar, cành mai vàng nở rộ_  ·  khung mẫu: `khung-mau/32-tet-mai-vang.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **276 px**, từ x 221 → 803 px (rộng 582 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 70 → 954 px, tại y ≈ 622 px.
- **Đáy trong (điểm thấp nhất):** y = **1336 px**.
- **Bảng màu:** vàng mai #FFD600, đỏ Tết #D32F2F, kính ấm #FFF8E1
- **front.png:** cành mai nâu sẫm có 8-12 bông vàng 5 cánh, chân đế gỗ son.
- **back.png:** ánh vàng ấm 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] cành mai vàng vươn lên bên phải miệng — hộp x 819→983, y 92→492 px
  - [TRƯỚC] vài bông mai rơi bám thân trái — hộp x 41→164, y 614→922 px
  - [TRƯỚC] chân đế gỗ đỏ — hộp x 246→778, y 1336→1428 px
- **Toạ độ mép trong bên phải (px, trích):** (803,276), (803,316), (821,352), (881,384), (926,458), (951,561), (952,691), (936,864), (903,1040), (860,1198), (836,1293), (709,1335), (512,1336) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bình kính dáng ginger jar, cành mai vàng nở rộ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 33. Hũ lì xì — `tet-li-xi`
**Dịp:** `tet`  ·  _Hũ kính đỏ bo vai, cắm phong bao lì xì_  ·  khung mẫu: `khung-mau/33-tet-li-xi.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **582 px**.
- **Thân rộng nhất (mép trong):** x 94 → 930 px, tại y ≈ 1403 px.
- **Đáy trong (điểm thấp nhất):** y = **1403 px**.
- **Bảng màu:** đỏ #C62828, vàng kim #FFC107
- **front.png:** hoa văn mây vàng mảnh ở vai, chữ LỘC, phong bao 2 bên.
- **back.png:** đỏ 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] 2 phong bao lì xì cắm nghiêng bên trái — hộp x 41→205, y 123→461 px
  - [TRƯỚC] 1 phong bao + dây pháo nhỏ bên phải — hộp x 819→983, y 123→461 px
  - [TRƯỚC] chữ "LỘC" vàng kim, alpha 70% — hộp x 369→655, y 799→983 px
- **Toạ độ mép trong bên phải (px, trích):** (809,307), (804,335), (809,369), (848,391), (891,415), (911,404), (922,492), (925,907), (922,1321), (930,1403), (891,1382), (699,1386), (512,1382) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ kính đỏ bo vai, cắm phong bao lì xì, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 34. Hũ kẹo Valentine — `valentine-keo-tim`
**Dịp:** `valentine`  ·  _Hũ bầu hồng, ruy băng, bóng bay tim_  ·  khung mẫu: `khung-mau/34-valentine-keo-tim.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **604 px**.
- **Thân rộng nhất (mép trong):** x 82 → 942 px, tại y ≈ 845 px.
- **Đáy trong (điểm thấp nhất):** y = **1375 px**.
- **Bảng màu:** hồng #FF4F8B, đỏ #E53935, trắng
- **front.png:** ruy băng đỏ quấn ngang thân, tim nhỏ lấp lánh.
- **back.png:** hồng 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] 2 bóng bay trái tim buộc dây vào vai trái (sau quà) — hộp x 41→205, y 61→399 px
  - [TRƯỚC] nơ ruy băng đỏ ở vai phải — hộp x 819→983, y 369→614 px
  - [TRƯỚC] nhãn tim "LOVE", alpha 75% — hộp x 307→717, y 891→1075 px
- **Toạ độ mép trong bên phải (px, trích):** (819,307), (814,336), (839,375), (891,430), (922,545), (938,688), (942,845), (938,1001), (921,1148), (891,1275), (878,1341), (739,1370), (512,1375) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ bầu hồng, ruy băng, bóng bay tim, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 35. Bình hoa 8/3 · 20/10 — `8-3-binh-hoa`
**Dịp:** `phu-nu`  ·  _Bình kính eo thon, bó hoa hồng + tulip 2 bên miệng_  ·  khung mẫu: `khung-mau/35-8-3-binh-hoa.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **307 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **587 px**.
- **Thân rộng nhất (mép trong):** x 79 → 945 px, tại y ≈ 820 px.
- **Đáy trong (điểm thấp nhất):** y = **1359 px**.
- **Bảng màu:** hồng #F06292, đỏ hồng #E91E63, xanh lá #43A047
- **front.png:** nơ lụa ở eo, hoa chỉ ở 2 bên (giữa miệng trống).
- **back.png:** hồng phấn 8%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] cụm hoa hồng đỏ + lá vươn ra bên trái — hộp x 41→205, y 61→553 px
  - [TRƯỚC] cụm tulip hồng + baby trắng bên phải — hộp x 819→983, y 61→553 px
  - [TRƯỚC] nơ lụa hồng quanh eo — hộp x 205→819, y 522→614 px
- **Toạ độ mép trong bên phải (px, trích):** (809,307), (805,364), (821,431), (860,507), (912,626), (942,755), (942,891), (920,1060), (878,1198), (819,1290), (743,1339), (633,1358), (512,1359) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Bình kính eo thon, bó hoa hồng + tulip 2 bên miệng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 36. Hũ hoa anh đào — `xuan-anh-dao`
**Dịp:** `xuan`  ·  _Mason pastel, cành anh đào quấn quanh_  ·  khung mẫu: `khung-mau/36-xuan-anh-dao.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **300 px**, từ x 164 → 860 px (rộng 696 px). Lối vào hẹp nhất rộng **687 px**.
- **Thân rộng nhất (mép trong):** x 85 → 939 px, tại y ≈ 884 px.
- **Đáy trong (điểm thấp nhất):** y = **1384 px**.
- **Bảng màu:** hồng anh đào #F8BBD0, nâu cành #6D4C41, kính #FFF5F8
- **front.png:** cành + hoa 5 cánh hồng nhạt, alpha 85%.
- **back.png:** hồng nhạt 6%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] cành anh đào uốn từ vai trái xuống thân — hộp x 41→307, y 338→1075 px
  - [TRƯỚC] cánh hoa rơi bám thân phải — hộp x 717→983, y 922→1306 px
- **Toạ độ mép trong bên phải (px, trích):** (860,300), (856,336), (878,372), (922,402), (935,396), (939,720), (937,1290), (929,1367), (922,1371), (881,1382), (620,1383) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Mason pastel, cành anh đào quấn quanh, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 37. Bát dưa hấu — `he-dua-hau`
**Dịp:** `he`  ·  _Nửa quả dưa hấu khoét làm bát, nhìn chính diện_  ·  khung mẫu: `khung-mau/37-he-dua-hau.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **584 px**, từ x 92 → 932 px (rộng 840 px). Lối vào hẹp nhất rộng **840 px**.
- **Thân rộng nhất (mép trong):** x 92 → 932 px, tại y ≈ 614 px.
- **Đáy trong (điểm thấp nhất):** y = **1034 px**.
- **Bảng màu:** vỏ xanh sọc #2E7D32/#81C784, ruột đỏ #FF5252 (chỉ ở mép), hạt đen
- **front.png:** vỏ dưa sọc là thành kính (alpha thấp ở giữa), viền ruột đỏ ở miệng.
- **back.png:** lòng bát đỏ hồng 15%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] miếng dưa hấu nhỏ dựng sau mép trái — hộp x 51→205, y 338→568 px
  - [TRƯỚC] đế tròn kính — hộp x 369→655, y 1075→1229 px
- **Toạ độ mép trong bên phải (px, trích):** (932,584), (932,614), (929,661), (921,708), (908,753), (890,797), (868,838), (840,876), (809,911), (774,943), (735,970), (694,993), (651,1011), (605,1024), (559,1032), (512,1034) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Nửa quả dưa hấu khoét làm bát, nhìn chính diện, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 38. Trái dừa — `he-trai-dua`
**Dịp:** `he`  ·  _Quả dừa xanh cầu, ống hút + ô giấy_  ·  khung mẫu: `khung-mau/38-he-trai-dua.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **456 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **590 px**.
- **Thân rộng nhất (mép trong):** x 92 → 932 px, tại y ≈ 799 px.
- **Đáy trong (điểm thấp nhất):** y = **1219 px**.
- **Bảng màu:** vỏ dừa xanh #7CB342, cơm dừa trắng ở mép, ô giấy hồng-vàng
- **front.png:** vỏ dừa xanh bóng làm kính, mép miệng trắng cơm dừa.
- **back.png:** nước dừa trong 8%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] ô giấy nhiệt đới + ống hút sọc cắm bên phải — hộp x 819→983, y 61→461 px
  - [TRƯỚC] lát chanh vàng gắn mép trái — hộp x 41→205, y 307→522 px
- **Toạ độ mép trong bên phải (px, trích):** (809,456), (844,541), (894,624), (924,717), (932,814), (917,910), (881,1000), (824,1079), (752,1144), (666,1189), (572,1215) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Quả dừa xanh cầu, ống hút + ô giấy, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 39. Hũ biển xanh — `he-bien`
**Dịp:** `he`  ·  _Hũ loe đáy, cát + vỏ sò, sao biển_  ·  khung mẫu: `khung-mau/39-he-bien.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **338 px**, từ x 205 → 819 px (rộng 614 px). Lối vào hẹp nhất rộng **614 px**.
- **Thân rộng nhất (mép trong):** x 102 → 922 px, tại y ≈ 1321 px.
- **Đáy trong (điểm thấp nhất):** y = **1321 px**.
- **Bảng màu:** xanh biển #4FC3F7, cát #FFE0B2, sao biển #FF8A65
- **front.png:** sóng nước xanh mảnh ở vai, sao biển, phao.
- **back.png:** gradient xanh biển 12% + cát.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [SAU] lớp cát + vỏ sò dưới đáy (sau quà) — hộp x 225→799, y 1229→1321 px
  - [TRƯỚC] sao biển cam bám góc phải — hộp x 799→983, y 1014→1260 px
  - [TRƯỚC] phao bơi nhỏ treo mép trái — hộp x 41→174, y 184→399 px
- **Toạ độ mép trong bên phải (px, trích):** (819,338), (819,384), (922,1321), (512,1321) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ loe đáy, cát + vỏ sò, sao biển, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 40. Hũ mặt trăng — `trung-thu-mat-trang`
**Dịp:** `trung-thu`  ·  _Cầu trăng vàng phát sáng, thỏ ngọc + đèn lồng_  ·  khung mẫu: `khung-mau/40-trung-thu-mat-trang.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **411 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **589 px**.
- **Thân rộng nhất (mép trong):** x 82 → 942 px, tại y ≈ 769 px.
- **Đáy trong (điểm thấp nhất):** y = **1198 px**.
- **Bảng màu:** vàng trăng #FFE082 → #FFB300, đỏ #E53935, trắng thỏ
- **front.png:** vân miệng núi lửa mờ 10%, viền sáng vàng.
- **back.png:** quầng vàng 15%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] thỏ ngọc ngồi cạnh đáy trái — hộp x 41→246, y 1075→1413 px
  - [TRƯỚC] đèn lồng đỏ nhỏ treo cành bên phải — hộp x 819→983, y 92→461 px
  - [TRƯỚC] mây vàng đỡ đáy — hộp x 307→717, y 1198→1290 px
- **Toạ độ mép trong bên phải (px, trích):** (809,411), (846,497), (900,582), (932,677), (942,777), (928,876), (891,970), (834,1053), (759,1120), (671,1168), (574,1193) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Cầu trăng vàng phát sáng, thỏ ngọc + đèn lồng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 41. Hộp bánh Trung Thu — `trung-thu-hop-banh`
**Dịp:** `trung-thu`  ·  _Hộp tròn thấp, hoa văn bánh nướng_  ·  khung mẫu: `khung-mau/41-trung-thu-hop-banh.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **553 px**, từ x 102 → 922 px (rộng 819 px). Lối vào hẹp nhất rộng **816 px**.
- **Thân rộng nhất (mép trong):** x 67 → 957 px, tại y ≈ 1294 px.
- **Đáy trong (điểm thấp nhất):** y = **1295 px**.
- **Bảng màu:** nâu bánh #A1662F, vàng #F9A825, đỏ hộp #B71C1C
- **front.png:** viền hộp đỏ hoa văn vàng, mặt kính trong.
- **back.png:** ánh vàng nâu 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] hoa văn bánh nướng in nổi vàng nâu, alpha 70% — hộp x 307→717, y 845→1106 px
  - [SAU] chiếc bánh nướng dựng sau mép trái — hộp x 51→246, y 338→553 px
  - [SAU] ấm trà gốm nhỏ phía sau bên phải — hộp x 778→973, y 307→553 px
- **Toạ độ mép trong bên phải (px, trích):** (922,553), (920,580), (922,614), (932,614), (942,676), (945,952), (942,1229), (957,1294), (871,1294), (633,1293) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hộp tròn thấp, hoa văn bánh nướng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 42. Hũ lá phong — `thu-la-phong`
**Dịp:** `thu`  ·  _Hũ hổ phách, lá phong đỏ cam bám thân_  ·  khung mẫu: `khung-mau/42-thu-la-phong.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **246 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **584 px**.
- **Thân rộng nhất (mép trong):** x 93 → 931 px, tại y ≈ 713 px.
- **Đáy trong (điểm thấp nhất):** y = **1330 px**.
- **Bảng màu:** hổ phách #FFB74D, đỏ #D84315, cam #FB8C00
- **front.png:** lá phong 2 bên, gân lá rõ.
- **back.png:** hổ phách 12%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] lá phong đỏ bám thân trái — hộp x 41→184, y 461→707 px
  - [TRƯỚC] lá phong cam bám thân phải — hộp x 840→983, y 768→1014 px
  - [TRƯỚC] đế gỗ — hộp x 338→686, y 1336→1467 px
- **Toạ độ mép trong bên phải (px, trích):** (809,246), (809,310), (804,362), (842,423), (900,525), (929,678), (922,860), (882,1042), (810,1196), (743,1293), (636,1329) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hũ hổ phách, lá phong đỏ cam bám thân, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 43. Vạc phù thủy — `halloween-vac`
**Dịp:** `halloween`  ·  _Vạc gang 3 chân, khói xanh, dơi bay_  ·  khung mẫu: `khung-mau/43-halloween-vac.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **522 px**, từ x 143 → 881 px (rộng 737 px). Lối vào hẹp nhất rộng **694 px**.
- **Thân rộng nhất (mép trong):** x 71 → 953 px, tại y ≈ 826 px.
- **Đáy trong (điểm thấp nhất):** y = **1214 px**.
- **Bảng màu:** gang đen tím #37474F, xanh độc #76FF03, cam #FF6D00
- **front.png:** vạc gang (lòng alpha ≤ 35%), viền miệng dày.
- **back.png:** ánh xanh độc 15% + bọt.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] 3 chân vạc (trái, giữa, phải) — hộp x 184→840, y 1213→1382 px
  - [TRƯỚC] 2 con dơi bay bên trái — hộp x 41→133, y 184→461 px
  - [TRƯỚC] mũ phù thủy tựa mép phải — hộp x 891→983, y 215→492 px
  - [SAU] khói xanh lá cuộn sau miệng (mờ, sau quà) — hộp x 225→799, y 307→507 px
- **Toạ độ mép trong bên phải (px, trích):** (881,522), (862,547), (876,599), (922,676), (947,753), (952,857), (932,983), (878,1093), (790,1168), (676,1206), (554,1214) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Vạc gang 3 chân, khói xanh, dơi bay, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 44. Người tuyết — `noel-nguoi-tuyet`
**Dịp:** `noel`  ·  _Hai bầu tuyết chồng nhau, khăn đỏ, mũi cà rốt_  ·  khung mẫu: `khung-mau/44-noel-nguoi-tuyet.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **215 px**, từ x 215 → 809 px (rộng 594 px). Lối vào hẹp nhất rộng **588 px**.
- **Thân rộng nhất (mép trong):** x 69 → 955 px, tại y ≈ 973 px.
- **Đáy trong (điểm thấp nhất):** y = **1367 px**.
- **Bảng màu:** tuyết trắng #FFFFFF / bóng #CFD8DC, đỏ #D32F2F, cam #FF7043
- **front.png:** kính trắng sữa mờ (lòng ≤ 15%), khăn, mắt, cúc.
- **back.png:** tuyết xanh nhạt 8%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] mũ chóp đen + nhánh nhựa ruồi đặt cạnh trái — hộp x 41→205, y 46→246 px
  - [TRƯỚC] mắt than + mũi cà rốt ở bầu trên — hộp x 369→655, y 307→445 px
  - [TRƯỚC] khăn len đỏ quấn eo, đuôi khăn rủ phải — hộp x 184→860, y 507→614 px
  - [TRƯỚC] 3 cúc than dọc thân — hộp x 471→553, y 737→1106 px
- **Toạ độ mép trong bên phải (px, trích):** (809,215), (807,251), (837,309), (861,390), (842,481), (817,572), (901,676), (948,852), (952,1059), (934,1233), (767,1336) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Hai bầu tuyết chồng nhau, khăn đỏ, mũi cà rốt, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 45. Cốc ca cao nóng — `dong-ca-cao`
**Dịp:** `dong`  ·  _Cốc có quai, kem + marshmallow, hơi nóng_  ·  khung mẫu: `khung-mau/45-dong-ca-cao.png`

- **Hình dáng:** góc cạnh, nét thẳng; đối xứng qua x = 461 px. (Thân lệch trái để chừa chỗ cho quai bên phải.)
- **Miệng (mép trong):** y = **399 px**, từ x 123 → 799 px (rộng 676 px). Lối vào hẹp nhất rộng **676 px**.
- **Thân rộng nhất (mép trong):** x 123 → 799 px, tại y ≈ 399 px.
- **Đáy trong (điểm thấp nhất):** y = **1367 px**.
- **Bảng màu:** nâu ca cao #6D4C41, kem #FFF8E1, đỏ cốc #C62828 sọc trắng
- **front.png:** cốc sọc đỏ trắng (alpha thấp ở lòng), quai dày.
- **back.png:** nâu ca cao 15% nửa dưới.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] quai cốc bên phải — hộp x 829→978, y 553→1137 px
  - [TRƯỚC] kem tươi + marshmallow tràn mép trái — hộp x 51→102, y 307→522 px
  - [SAU] 3 sợi hơi nóng uốn lượn (sau quà) — hộp x 205→717, y 61→338 px
- **Toạ độ mép trong bên phải (px, trích):** (799,399), (799,1306), (768,1359), (461,1367) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Cốc có quai, kem + marshmallow, hơi nóng, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

### 46. Hũ Quốc khánh 2/9 — `quoc-khanh`
**Dịp:** `quoc-khanh`  ·  _Mason ám đỏ, ngôi sao vàng, cờ nhỏ_  ·  khung mẫu: `khung-mau/46-quoc-khanh.png`

- **Hình dáng:** đường cong mềm; đối xứng qua x = 512 px.
- **Miệng (mép trong):** y = **300 px**, từ x 154 → 870 px (rộng 717 px). Lối vào hẹp nhất rộng **709 px**.
- **Thân rộng nhất (mép trong):** x 80 → 944 px, tại y ≈ 884 px.
- **Đáy trong (điểm thấp nhất):** y = **1384 px**.
- **Bảng màu:** đỏ #DA251D, vàng #FFCD00
- **front.png:** kính ám đỏ nhẹ, sao vàng giữa thân, viền vàng.
- **back.png:** đỏ 10%.
- **Trang trí (đúng hộp trong khung mẫu):**
  - [TRƯỚC] ngôi sao vàng 5 cánh, alpha 70% — hộp x 369→655, y 737→1014 px
  - [TRƯỚC] lá cờ nhỏ cắm bên phải — hộp x 911→983, y 92→461 px
- **Toạ độ mép trong bên phải (px, trích):** (870,300), (866,336), (886,372), (927,402), (940,396), (944,720), (942,1290), (935,1367), (926,1371), (881,1382), (620,1383) … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)
- **Prompt gợi ý:** "Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, Mason ám đỏ, ngôi sao vàng, cờ nhỏ, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, no background, nothing cropped, keep 40px empty margin."

---

## 5. Kiểm tra trước khi giao (ChatGPT tự soát)
- [ ] Nền trong suốt thật (mở trên nền tối không thấy ô caro / viền trắng).
- [ ] 2 lớp cùng 1024×1536 và chồng khít nhau (kiểm bằng preview.png).
- [ ] Mép trong của kính trùng đường đỏ của khung mẫu.
- [ ] Làn rơi quà (phía trên miệng) trống hoàn toàn ở front.png.
- [ ] Lòng hũ ở front.png đủ trong suốt (alpha ≤ 12% ngoài các vệt phản quang).
- [ ] Không chi tiết nào chạm mép ảnh (lề ≥ 41 px ngang, ≥ 46 px dọc).
- [ ] Không chữ ký, watermark, chữ thừa (chỉ có chữ ở những kiểu yêu cầu: dược phẩm, chai sữa, gacha, túi lộc).
