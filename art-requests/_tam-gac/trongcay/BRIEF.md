# 🌱 Trồng Cây — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Overlay khu vườn có hệ toạ độ **980 × 1200**, neo **tâm đáy** ở giữa màn hình, 82% chiều cao. Mặt đất ở y = 1120.
> Hiện **gần như toàn bộ** khu vườn là SVG vẽ tay (lá hình hạt, quả tròn, thú cưng khối tròn) và emoji (🐝 ✂️ 🧴 🍄 🌷 👑), nên nhìn không đồng bộ.
> **Phong cách chung cho game này:** 3D cartoon tươi sáng, đất nâu ấm, cỏ xanh mượt, thú cưng chibi mắt to, mọi con cùng tỉ lệ.

---

## TC-G · Khối đất và cảnh nền

| Mã | Tên file | Canvas | Hiển thị | Mô tả | Neo |
|---|---|---|---|---|---|
| G01 | `TC-G01_khoi-dat.png` | **1536 × 1024** | rộng 1040 × cao 184 px (giãn ngang) | Khối đất nhìn hơi từ trên: **mặt cỏ elip** phía trên (rộng 92% canvas), thân đất nâu `#7E5637 → #321F0E` có sỏi, vết nứt, rễ nhỏ, cạnh bên tối. Khối đất chiếm dải **y 300→730** (tỉ lệ ≈ 5.6 : 1). Có **tấm bảng "hp" khắc** màu hồng đào nhỏ ở phía phải mặt trước | Tâm mép trên mặt cỏ ở (50%, 33%) = đường mặt đất nơi cây mọc |
| G02 | `TC-G02_bui-co_01…03.png` | 1024 × 1024 | 40 px | 3 kiểu bụi cỏ 3–5 lá, gốc chung ở đáy | Tâm đáy (50%, 92%). Code đung đưa ±3.5° / 3.8 s quanh gốc |
| G03 | `TC-G03_hang-rao.png` | 1536 × 1024 | 300 × 120 px | Hàng rào gỗ trắng kem 7 cọc nhọn + 2 thanh ngang, sơn hơi cũ | Tâm đáy (50%, 90%) |
| G04 | `TC-G04_gian-hoa.png` | 1024 × 1024 | 98 × 120 px | Giàn mắt cáo gỗ nâu có hoa hồng leo đỏ và hoa hồng phấn | Tâm đáy (50%, 92%) |
| G05 | `TC-G05_bang-top3.png` | 1024 × 1024 | 312 × 260 px | **Bảng gỗ TOP 3**: 2 cột gỗ, mái tam giác, mặt bảng xanh rêu tối `#2C5E36` (để TRỐNG, code viết chữ + avatar lên), ruy băng đỏ phía trên **trống chữ** | Tâm đáy chân cột (50%, 95%). Ghi toạ độ 4 góc mặt bảng vào TRA-VE |
| G06 | `TC-G06_dao-cu_*.png` | 1024 × 1024 mỗi món | 24–34 px | 6 món thay emoji: `nam-do`, `nam-nau`, `hoa-tulip`, `hoa-huong-duong`, `hoa-tulip-hong`, `chau-cay` | Tâm đáy (50%, 92%). Code nhún ±3° / 3.2 s |

---

## TC-T · Cây (lá, quả, thân)
Thân cây vẫn do code vẽ (đường cong cao dần theo % tăng trưởng). Chỉ cần **ảnh lá và quả** để gắn dọc thân.

| Mã | Tên file | Canvas | Hiển thị | Mô tả | Neo |
|---|---|---|---|---|---|
| T01 | `TC-T01_la_khoe.png` | 1024 × 1024 | dài 72 × rộng 36 px | Lá xanh `#41C463` bóng, gân giữa + 4 gân phụ, **chóp lá chỉ sang PHẢI**, cuống ở trái | **Cuống lá** tại (8%, 50%). Code xoay quanh cuống |
| T02 | `TC-T02_la_chin.png` | như trên | | Lá vàng-xanh `#8FD96B` có ánh vàng (cây đã chín) | như T01 |
| T03 | `TC-T03_la_heo.png` | như trên | | Lá héo nâu-ô liu `#9A8D46`, mép quăn, rủ | như T01 |
| T04 | `TC-T04_qua.png` | 1024 × 1024 | 26 px | Quả mọng đỏ cam (gradient `#FF9A6B → #C62828`), cuống nâu + 1 lá nhỏ, bóng sáng | Tâm quả (50%, 55%). **Cuống** ở (50%, 15%) |
| T05 | `TC-T05_qua-roi.png` | như trên | 16–44 px | 4 loại quả rơi thay emoji 🍎🍏🍊🍐: `tao-do`, `tao-xanh`, `cam`, `le` | Tâm quả |

---

## TC-L · Sâu, nhộng, bướm, ong (sinh vật trong vườn)

### L01 · Sâu xanh 🐛 — bò
**Hiện tại:** 5 hình tròn xanh nối nhau, 2 râu.
- **Canvas:** 1536 × 1024 mỗi khung. Sâu nằm ngang, **đầu bên PHẢI**, dài ~70% canvas. Hiển thị 70 × 30 px.
- **Neo:** tâm đáy bụng (50%, 75%).
- **4 khung** `TC-L01_sau_bo_01…04.png`, chu kỳ bò kiểu **sâu đo**:
  1. Thân duỗi thẳng.
  2. Gù giữa thân lên.
  3. Gù cao nhất, đuôi kéo sát đầu.
  4. Duỗi ra lại.

  Code lặp ở **8 fps**.
- Sâu xanh chanh `#B6F24F` bóng, sọc vàng, mắt to dễ thương, 2 râu đầu vàng `#FFE14D`.
- **Biến thể có avatar:** để **1 ô tròn trống** trên lưng (đường kính 24% chiều cao sâu) tại đốt thứ 3. Code chèn avatar người xem.
  Giao thêm `TC-L01_sau_avatar_01…04.png` và ghi toạ độ tâm ô tròn từng khung.

### L02 · Xác sâu
- **File:** `TC-L02_xac-sau.png`, cùng canvas với L01.
- **Vẽ:** sâu nằm ngửa cong, màu xám xanh `#8A9A6E`, mắt ✕.

### L03 · Nhộng (kén) — 3 giai đoạn
- **Canvas:** 1024 × 1536 (dọc). Kén treo bằng **sợi tơ từ đỉnh**. Điểm treo ở (50%, 6%).
- **Hiển thị:** 40 × 70 px.
- **Files:**
  - `TC-L03_nhong_1.png`: kén mới, xanh lá nhạt.
  - `TC-L03_nhong_2.png`: xanh ngọc, có vân vàng.
  - `TC-L03_nhong_3.png`: gần nở, trong mờ, thấy cánh bướm bên trong.
- Code thêm glow tăng dần.

### L04 · Bướm 🦋 — vỗ cánh
**Hiện tại:** 4 cánh Bézier gradient, vỗ bằng cách bóp ngang.
- **Canvas:** 1024 × 1024 mỗi khung, bướm nhìn **từ trên xuống, đầu hướng LÊN**. Thân dọc ở giữa.
- **Neo:** tâm thân (50%, 52%).
- **Hiển thị:** 104–200 px.
- **4 khung vỗ cánh** `..._01…04.png`:
  1. Cánh mở hết.
  2. Mở 60%.
  3. Khép gần dọc (rộng 20%).
  4. Mở 60%.

  Code lặp ở **10 fps**.
- **5 bộ màu**, mỗi bộ 4 khung:

| Bộ | Tên file | Màu |
|---|---|---|
| a | `TC-L04_buom-hong_01…04.png` | hồng phấn → tím `#FF7AB8 / #9B5BFF` |
| b | `TC-L04_buom-cam_01…04.png` | cam → vàng (monarch) |
| c | `TC-L04_buom-xanh_01…04.png` | xanh dương → xanh ngọc |
| d | `TC-L04_buom-ngoc-luc-bao_01…04.png` | **tiến hoá**: xanh lục bảo phát sáng `#43E6A0` có vân vàng |
| e | `TC-L04_buom-cau-vong_01…04.png` | **đội nhóm**: 5 sắc cầu vồng |

- **Không vẽ** avatar hay tên, code tự thêm.
- **Khi bay:** code dời theo đường cong 3.2 s, phóng 0.68 → 1.04 → 0.78 và nhấp nhô 7 px / 0.72 s.

### L05 · Ong 🐝 (thay emoji)
- **Canvas:** 1024 × 1024, ong nhìn **nghiêng, mặt quay PHẢI**. Hiển thị 38 px.
- **Neo:** tâm thân (50%, 50%).
- **2 khung vỗ cánh** `TC-L05_ong_01…02.png` (cánh lên / cánh xuống). Code lặp **20 fps**.
- 6 chân, **2 chân sau ôm 1 chỗ trống** (code chèn quả mang theo, tâm ≈ (45%, 78%)).

---

## TC-P · 9 Thú cưng (đi lang thang trên mặt đất)
**Hiện tại:** SVG khối tròn 120×100 nhìn thẳng, chân lắc bằng CSS. Trông như sticker phẳng.
**Mong muốn:** thú cưng chibi 3D, **nhìn NGHIÊNG ¾, mặt quay PHẢI** (code lật khi đi sang trái), mắt to long lanh, cùng phong cách và cùng tỉ lệ đầu to.

| Thuộc tính chung | Giá trị |
|---|---|
| Canvas mỗi khung | **1024 × 1024** |
| Lề | ≥ 62 px; tai, đuôi, cánh không được chạm mép |
| Neo | **Tâm đáy (chân chạm đất) tại (50%, 92%)**, cố định mọi khung |
| Kích thước nhân vật trong canvas | **bằng nhau giữa các khung**. Chiều cao nhân vật ≈ 60–75% canvas |
| Bóng | KHÔNG vẽ (code có bóng elip) |

| Mã | Con | Màu chính | Hiển thị | Kiểu di chuyển | Khung cần giao |
|---|---|---|---|---|---|
| P01 | 🐱 Mèo | cam `#F2913C`, bụng kem | 96 px | đi bộ, đuôi vẫy | `TC-P01_meo_di_01…06` (6) + `_dung_01` (1, ngồi liếm tay) |
| P02 | 🐶 Chó | vàng bơ `#DCA256` | 106 px | đi bộ, đuôi ngoáy | `TC-P02_cho_di_01…06` (6) + `_dung_01` (ngồi lè lưỡi) |
| P03 | 🐰 Thỏ | trắng, tai trong tím nhạt | 82 px | **nhảy cóc** | `TC-P03_tho_nhay_01…04`: thu người → bật → bay → đáp, nén 6% |
| P04 | 🦆 Vịt | vàng `#FFC62E`, mỏ cam | 80 px | lạch bạch (nghiêng trái/phải) | `TC-P04_vit_di_01…04` |
| P05 | 🐢 Rùa | mai xanh lá `#5FAE3C` | 94 px | bò rất chậm | `TC-P05_rua_bo_01…04` |
| P06 | 🐹 Hamster | nâu kem `#D6AD77` | 68 px | chạy lon ton | `TC-P06_hamster_chay_01…04` |
| P07 | 🐧 Chim cánh cụt | đen xám `#374751`, bụng trắng | 86 px | lạch bạch, 2 cánh dang | `TC-P07_canh-cut_di_01…04` |
| P08 | 🐍 Rắn | tím `#A655D8`, bụng hồng | 104 px | **trườn uốn sóng** | `TC-P08_ran_truon_01…04`: sóng thân lan từ đầu tới đuôi |
| P09 | 🐦 Chim | xanh dương `#46A6DA`, bụng vàng | 78 px | **bay** (ở 60% chiều cao màn) | `TC-P09_chim_bay_01…04` (cánh lên → ngang → xuống → ngang). **Neo: tâm thân (50%, 50%)** |

**Tốc độ code lặp khung:**
- Đi/chạy: 12 fps.
- Rùa: 6 fps.
- Thỏ: 8 fps.
- Chim bay: 16 fps.

**Tổng thú cưng: 40 khung.**

---

## TC-X · Đồ dùng và hiệu ứng (thay emoji)

| Mã | Tên file | Canvas | Hiển thị | Mô tả | Khung |
|---|---|---|---|---|---|
| X01 | `TC-X01_keo_01…02.png` | 1024 × 1024 | 52–76 px | Kéo làm vườn cán xanh lá. **Khung 1** mở, **khung 2** khép. Mũi kéo hướng **PHẢI-xuống** | 2. Code đưa qua lại 4 lần / 2.4 s, cắt ở 1.84 s |
| X02 | `TC-X02_binh-xit.png` | 1024 × 1024 | 54 px | Bình xịt cây nhựa xanh ngọc có cò bóp, vòi hướng **PHẢI** | 1. Code nghiêng ±34° |
| X03 | `TC-X03_giot-mua.png` | 1024 × 1536 | 3–5 × 48–76 px | Giọt mưa dài trong suốt xanh nhạt, đầu tròn phía dưới | 1 (code kéo giãn, rơi chéo) |
| X04 | `TC-X04_bot-nuoc_01…04.png` | 1024 × 1024 | 12–24 px | Vệt nước bắn hình vòng cung khi giọt mưa chạm đất, từ nhỏ đến loang | 4, 8 fps |
| X05 | `TC-X05_la-roi_*.png` | 1024 × 1024 | 24–40 px | 3 lá rơi khi cắt: `xanh`, `vang`, `nau` (thay 🍃🍂🌿) | 1 mỗi màu |
| X06 | `TC-X06_hoa-no_*.png` | 1024 × 1024 | 34–64 px | 6 bông hoa nở (thay 🌸🌺🌼🌷💮🏵️): `anh-dao`, `dam-but`, `cuc`, `tulip`, `mai-trang`, `hong` | 1 mỗi loại |
| X07 | `TC-X07_ngon-lua_01…04.png` | 1024 × 1536 | 70 × 150 px | Ngọn lửa hoạt hình (lõi trắng-vàng → cam → đỏ) cháy trên cây khi rồng phun. Đáy ngọn lửa tại (50%, 95%) | 4, 12 fps |
| X08 | `TC-X08_khoi_01…03.png` | 1024 × 1024 | 70–140 px | Cuộn khói xám tròn mềm, 3 kiểu | 1 mỗi kiểu (code phóng + mờ) |
| X09 | `TC-X09_vuong-mien-chu-cay.png` | 1024 × 1024 | 30 px | Vương miện nhỏ cho chủ cây (thay 👑), đáy cong tại (50%, 80%) | 1 |
| X10 | `TC-X10_o-khoa.png` | 1024 × 1024 | 22 px | Ổ khoá vàng nhỏ (thay 🔒) | 1 |

---

## Tổng file
| Nhóm | File |
|---|---|
| Đất + cảnh | ~14 |
| Lá + quả | 8 |
| Sâu + nhộng | 4 + 4 + 1 + 3 |
| Bướm | 20 |
| Ong | 2 |
| Thú cưng | 40 |
| Đồ dùng + hiệu ứng | ~25 |

Giao vào `ve-xong/` và điền `ve-xong/TRA-VE.md`.
