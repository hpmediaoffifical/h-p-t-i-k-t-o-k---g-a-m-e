# 🫙 Hũ Thủy Tinh — Đơn đặt vẽ: nhân vật, phụ kiện, biểu tượng

> Đọc **Quy tắc chung** ở `../README.md` trước khi vẽ.
> **46 kiểu hũ thủy tinh** (30 thường + 16 theo mùa) nằm ở file riêng: `BRIEF-HU.md` (kèm ảnh khung mẫu `khung-mau/`).
> Overlay OBS có kích thước 1080 × 1920 (dọc). Hũ mặc định cao 400 px, rộng 267 px, đặt góc dưới-phải. Mọi kích thước "hiển thị" dưới đây tính trên màn 1080 × 1920.

## Bối cảnh game
Người xem tặng quà TikTok → quà rơi vào hũ thủy tinh (vật lý thật). Một số quà kích hoạt sự kiện vui:
- **Ninja trộm** đu dây xuống lấy quà trong hũ, hoặc chạy bộ tới leo hũ.
- **Cảnh sát** xuất hiện bắt trộm.
- **OSIN** (cô giúp việc HP) nhặt quà rơi ngoài hũ bỏ lại vào hũ, hoặc đá / ném / quay hũ.
- **UFO** hút quà rơi vãi rồi thả lại vào miệng hũ.

Hiện các nhân vật đều là SVG vẽ tay đơn giản (que, khối phẳng), nhìn rất "nháp".

---

## TT-A01 · Ninja trộm 🥷
**Hiện tại:** SVG 64×64: hình bóng đen trùm đầu, dải mắt, 2 mắt trắng, đai lưng đỏ nâu. Không có tay chân rõ, không có khung động.
**Mong muốn:** ninja chibi dễ thương nhưng "gian", đồ đen tím than `#151826`, khăn bịt mặt, dải buộc đầu đỏ `#C0392B` bay phía sau, mắt to tinh nghịch, túi vải buộc hông. Tỉ lệ đầu : thân ≈ 1 : 1.2.

| Thuộc tính | Giá trị |
|---|---|
| Hiển thị trên overlay | thân **56 px** (đu dây); bản "Trộm cả hũ" phóng to **200 px** |
| Canvas mỗi khung | **1024 × 1024**, nhân vật chiếm ~70% chiều cao, lề ≥ 62 px |
| Hướng | nhìn nghiêng thì mặt quay **PHẢI** |

### Các trạng thái và khung (tổng 14 khung)
| Mã khung | Tên file | Số khung | Mô tả tư thế | Điểm neo (theo % canvas) | Chuyển động do code |
|---|---|---|---|---|---|
| A01-a | `TT-A01_ninja_du-day_01.png` | 1 | Treo người trên dây, **2 tay nắm dây phía trên đầu**, 2 chân co nhẹ, nhìn xuống | **Điểm nắm dây** tại (50%, 10%). Dây do code vẽ, là đường thẳng đi lên từ điểm này | Code kéo từ trên xuống miệng hũ trong 0.9 s, trượt ngang 0.7 s, thả xuống quà 0.5 s, kéo lên 0.9 s |
| A01-b | `TT-A01_ninja_chop-qua_01.png` | 1 | Vẫn treo 1 tay trên dây, **tay kia thò xuống** xoè ra như đang chộp | Nắm dây (50%, 10%). **Lòng bàn tay chộp** ≈ (58%, 88%) | Code phóng 1.1× và nghiêng −10° trong 250 ms |
| A01-c | `TT-A01_ninja_om-qua_01.png` | 1 | Treo 1 tay, tay kia **ôm vật trước ngực** (để trống chỗ ôm, code chèn ảnh quà vào) | Nắm dây (50%, 10%). **Tâm vật ôm** ≈ (55%, 62%), vùng trống ~30% canvas | Kéo lên 0.9 s rồi biến mất (mờ dần 0.5 s) |
| A01-d | `TT-A01_ninja_chay_01…06.png` | **6** | **Chu kỳ chạy** nghiêng, mặt quay phải, kiểu rón rén lén lút (người khom). Khung 1→6: tiếp đất trái → đẩy → bay → tiếp đất phải → đẩy → bay | **Tâm đáy (gót chân)** tại (50%, 94%), đường chân **cố định** ở y = 94% mọi khung | Code lặp 6 khung ở **12 fps** (0.5 s/chu kỳ). Chạy 1.0 s từ ngoài màn hình tới chân hũ; lúc quay lại thì code lật ngang |
| A01-e | `TT-A01_ninja_leo_01…04.png` | **4** | **Leo vách** (nhìn nghiêng, mặt quay phải áp vào thành hũ): tay trái vươn → kéo → tay phải vươn → kéo | Tâm đáy (50%, 94%) | 12 fps; code nâng nhân vật dọc thành hũ trong 0.9 s |
| A01-f | `TT-A01_ninja_bi-bat_01.png` | 1 | Mặt trước, 2 tay giơ cao đầu hàng, mắt xoắn ốc, giọt mồ hôi | Tâm khung (50%, 50%) | Cảnh sát áp giải, trượt ngang ra khỏi màn 0.8 s |

> **Quà trên tay ninja do code chèn.** Hãy để chỗ tay ôm/chộp **trống**, đừng vẽ quà.

---

## TT-A02 · Cảnh sát 👮
**Hiện tại:** SVG 64×64 mặt trước, áo xanh lá, mũ kê-pi, sao vàng.
**Mong muốn:** cảnh sát chibi Việt Nam, quân phục **xanh lá ô-liu** `#4B6B1F`, mũ kê-pi có quân hiệu vàng, cầu vai, còi trên miệng (chỉ ở khung chạy). Dáng nghiêm nhưng hài hước.

| Thuộc tính | Giá trị |
|---|---|
| Hiển thị | **64 px** (có glow xanh do code) |
| Canvas mỗi khung | **1024 × 1024**, lề ≥ 62 px |

| Mã khung | Tên file | Số khung | Mô tả | Điểm neo | Code làm |
|---|---|---|---|---|---|
| A02-a | `TT-A02_canh-sat_dung_01.png` | 1 | Mặt trước, tay chỉ thẳng ra trước "Đứng lại!" | Tâm (50%, 50%) | Xuất hiện cạnh trộm |
| A02-b | `TT-A02_canh-sat_chay_01…06.png` | **6** | Chu kỳ chạy nghiêng, mặt quay **PHẢI**, thổi còi, 1 tay vung dùi cui | Tâm đáy (50%, 94%), đường chân cố định | 12 fps, chạy 0.65 s vào màn rồi 0.8 s ra; code lật khi chạy sang trái |
| A02-c | `TT-A02_canh-sat_tom_01…02.png` | **2** | Nghiêng mặt phải, **túm cổ áo** (tay đưa ra trước ở độ cao ngực): khung 1 vươn tay, khung 2 túm chặt, người ngả sau | Tâm đáy (50%, 94%). Điểm tay túm ≈ (85%, 45%) | Code lắc ±8° ×3 lần trong 0.6 s |

---

## TT-A03 · OSIN — cô giúp việc HP 🧹
**Hiện tại:** người que SVG 80×140, mũ hồng, áo hồng 3 nút, chổi vàng. Chân và tay xoay bằng CSS nên nhìn cứng như rối gỗ.
**Mong muốn:** cô giúp việc chibi **tông hồng thương hiệu HP** (`#EC4899`, `#F472B6`), tạp dề trắng viền ren, khăn trùm tóc hồng, **tay trái cầm chổi rơm**, mặt vui vẻ nhanh nhẹn. Có thể thêm chữ "HP" nhỏ trên tạp dề.

| Thuộc tính | Giá trị |
|---|---|
| Hiển thị | khoảng **130 × 230 px** (cao ~12% chiều cao màn) |
| Canvas mỗi khung | **1024 × 1536** (dọc), nhân vật cao ~80% canvas, lề ≥ 62 px |
| Điểm neo chung | **Tâm đáy (gót chân) tại (50%, 95%)**, cố định mọi khung |
| Hướng | mặt quay **PHẢI** |

| Mã khung | Tên file | Số khung | Mô tả | Code làm |
|---|---|---|---|---|
| A03-a | `TT-A03_osin_di-bo_01…08.png` | **8** | Chu kỳ đi nhanh, chổi kẹp tay trái đung đưa theo bước, tay phải đánh tay | Lặp **16 fps** (0.5 s/chu kỳ), đi ngang 0.9–1.4 s |
| A03-b | `TT-A03_osin_mang-qua_01…08.png` | **8** | Như đi bộ nhưng **tay phải đưa ra trước, lòng bàn tay ngửa** (đang bưng quà, để TRỐNG) | Code đặt ảnh quà (~43 px) tại **lòng bàn tay**. Hãy đo và ghi toạ độ lòng bàn tay **từng khung** vào TRA-VE |
| A03-c | `TT-A03_osin_nhay_01…02.png` | **2** | Khung 1 khom gối lấy đà; khung 2 bật cao, 2 tay giơ lên, chân co | Code nhảy lên miệng hũ trong 0.45 s (đường cong nảy), thả quà vào |
| A03-d | `TT-A03_osin_da_01…03.png` | **3** | Đá hũ: khung 1 lùi chân phải lấy đà; khung 2 **đá thẳng chân phải về phía phải**; khung 3 thu chân, mặt khoái chí | Lấy đà 280 ms → đá 200 ms → đi ra 1.3 s |
| A03-e | `TT-A03_osin_quay_01.png` | 1 | Hai tay giơ cao xoay hũ (tay trái cao, tay phải ngang vai), chổi kẹp nách | Code xoay cả hũ, OSIN đứng yên 1.8 s |
| A03-f | `TT-A03_osin_nem_01…02.png` | **2** | Ném hũ: khung 1 ngả người sau, 2 tay ôm vật phía trên vai phải; khung 2 vung ném mạnh về phía phải | Lấy đà 250 ms → ném |

> **Tổng OSIN: 24 khung.** Giữ y nguyên mặt, quần áo và kích thước người giữa mọi khung.

---

## TT-A04 · UFO 🛸
**Hiện tại:** SVG 120×60: đĩa xám gradient, vòm xanh, 3 chấm đèn.
**Mong muốn:** đĩa bay hoạt hình kim loại bạc bóng, vòm kính xanh có **phi hành gia mèo/ người ngoài hành tinh nhỏ** ngồi trong, viền đĩa có dải đèn tròn.

| Thuộc tính | Giá trị |
|---|---|
| Hiển thị | **238 × 119 px** (tỉ lệ 2 : 1) |
| Canvas | **1536 × 1024**. Đĩa nằm gọn trong vùng x 128→1408, y 192→832 (2 : 1), tâm đĩa tại (50%, 50%) |

| Mã | Tên file | Số khung | Mô tả | Code làm |
|---|---|---|---|---|
| A04-a | `TT-A04_ufo_01…03.png` | **3** | Giống hệt nhau, chỉ khác **dải đèn**: khung 1 đèn vàng sáng, khung 2 đèn đỏ sáng, khung 3 đèn xanh lá sáng (đèn còn lại tối) | Lặp **5 fps**. Code cho bay lơ lửng lên xuống 6 px / 3 s |
| A04-b | `TT-A04_tia-hut.png` | 1 | **Chùm tia hút** hình nón: đỉnh hẹp phía trên (rộng 30% canvas), đáy rộng 100%, màu xanh ngọc `#7DD3FC` mờ dần xuống dưới (alpha 65% → 0%), có vệt sáng dọc | Canvas **1024 × 1536**. Code kéo dãn chiều cao theo khoảng cách tới mặt đất và nháy sáng |

---

## TT-B01…B09 · Phụ kiện gắn miệng hũ 🎀👑

> ⚠️ **ĐÃ THAY THẾ** bởi `BRIEF-PHU-KIEN.md` (41 phụ kiện, khung mẫu theo miệng hũ). Phần dưới chỉ để tham khảo, đừng vẽ theo phần này.
**Hiện tại:** 9 SVG 200×100 phẳng, nét đơn giản. Riêng **ngôi sao vàng bị cắt mất 2 cánh dưới**.
**Cách dùng:** phụ kiện rộng **80% bề rộng hũ** và nằm **ôm quanh cổ/miệng hũ**.

⚠️ **Yêu cầu mới quan trọng:**
- Trước đây phụ kiện nằm **phía trên** miệng và che quà đang rơi vào. Bản mới phải **ôm quanh cổ hũ, từ mép miệng trở xuống**.
- Phần nhô **lên trên mép miệng tối đa 20%** chiều cao phụ kiện, và chỉ ở **2 bên**. Phần giữa phía trên miệng phải để trống cho quà rơi.
- Claude sẽ đổi điểm neo trong code cho khớp.

| Thuộc tính | Giá trị |
|---|---|
| Canvas | **1536 × 1024**. Phụ kiện nằm trong dải **x 64→1472, y 160→864** (tỉ lệ 2 : 1). Ngoài dải để trong suốt |
| Đường miệng hũ | **y = 300** trên canvas (20% của dải) — chỗ phụ kiện "ngồi" lên vành miệng |
| Lỗ miệng | Vùng **x 368→1168, y < 300** phải **trống** (đó là miệng hũ nhìn từ trước) |
| Lớp | Nơ, hoa, sao, kim cương: **1 lớp** (đè trước). Vương miện và vòng lá: **2 lớp** `_truoc.png` + `_sau.png` (phần vòng phía sau cổ hũ nằm sau quà) |

| Mã | Tên file | Mô tả mong muốn |
|---|---|---|
| B01 | `TT-B01_no-hong.png` | Nơ lụa hồng `#FF5D8F` bóng mượt **buộc quanh cổ hũ**: dải ruy băng vòng trước cổ (y 300→420), nút nơ to ở **chính giữa phía trước cổ** (dưới đường miệng), 2 đuôi nơ rủ xuống |
| B02 | `TT-B02_no-xanh.png` | Như B01, xanh dương `#3B82F6` |
| B03 | `TT-B03_no-trang.png` | Như B01, trắng ngà, viền bạc |
| B04 | `TT-B04_no-den.png` | Như B01, nhung đen, viền bạc |
| B05 | `TT-B05_vuong-mien_truoc.png` + `_sau.png` | Vương miện vàng `#F4C542` đính ngọc đỏ / xanh, **đeo như vòng quanh miệng hũ**. Lớp trước: đai trước + chóp 2 bên (trái x<368, phải x>1168). Lớp sau: các chóp phía sau (thấp hơn, nằm sau quà) |
| B06 | `TT-B06_hoa-anh-dao.png` | Vòng hoa anh đào hồng quanh cổ, cụm hoa to ở 2 bên vai, giữa thưa và thấp |
| B07 | `TT-B07_sao-vang.png` | Chuỗi sao vàng lấp lánh vắt quanh cổ hũ, 1 ngôi sao to ở chính giữa phía trước **dưới đường miệng**. Cả 5 cánh sao phải **nguyên vẹn** |
| B08 | `TT-B08_vong-la-noel_truoc.png` + `_sau.png` | Vòng lá thông Noel có quả châu đỏ và chuông vàng quấn quanh miệng hũ (2 lớp như B05) |
| B09 | `TT-B09_kim-cuong.png` | Dây chuyền kim cương vắt quanh cổ, mặt dây là viên kim cương xanh to ở giữa phía trước, dưới đường miệng |

---

## TT-U01 · Vương miện "TOP tặng" (đội trên avatar người tặng nhiều nhất)
**Hiện tại:** SVG 64×48 vương miện 3 chóp, cam vàng phẳng.
- **Hiển thị:** 56 × 42 px, nằm trên avatar tròn 36 px. Code cho lắc ±3° và nháy glow.
- **Canvas:** **1024 × 1024**. Vương miện chiếm vùng x 128→896, y 224→800 (4 : 3). **Đáy vương miện cong lõm** ôm đầu, tâm đáy tại (50%, 78%).
- **File:** `TT-U01_vuong-mien-top.png`. Vàng kim bóng, 5 chóp, đính hồng ngọc ở giữa và 2 kim cương xanh 2 bên, lấp lánh nhẹ (lấp lánh vẫn trong lề).

## TT-U02 · Khung avatar treo "Avatar Gió" (tuỳ chọn)
- Hiện tại là avatar tròn 54 px viền vàng và dây nét đứt.
- Nếu vẽ: **khung tròn kiểu diều** có nơ ở đáy, canvas **1024 × 1024**. Lỗ tròn trong suốt ở tâm, đường kính 60% canvas (code chèn avatar vào). Điểm buộc dây ở đỉnh (50%, 8%).
- **File:** `TT-U02_khung-dieu.png`.

## TT-F01 · Vết nứt kính (tuỳ chọn, ưu tiên thấp)
- **3 mức nứt:** `TT-F01_nut_1.png` (vài vết nhỏ), `_2.png` (lan rộng), `_3.png` (sắp vỡ).
- **Canvas:** 1024 × 1536, chồng khít lên hũ.
- **Vẽ:** vết nứt trắng-xanh trong suốt, có khúc xạ. Code sẽ cắt theo silhouette từng kiểu hũ.

---

## Tổng số file cần giao (ngoài 46 kiểu hũ)
| Nhóm | File |
|---|---|
| Ninja | 14 |
| Cảnh sát | 9 |
| OSIN | 24 |
| UFO | 4 |
| Phụ kiện | 11 (9 mục, 2 mục có 2 lớp) |
| Vương miện TOP | 1 |
| Tuỳ chọn | 1 + 3 |

Giao vào `ve-xong/` theo đúng tên file, rồi điền `ve-xong/TRA-VE.md`.
