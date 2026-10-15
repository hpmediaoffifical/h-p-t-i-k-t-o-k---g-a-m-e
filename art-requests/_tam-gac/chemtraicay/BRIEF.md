# 🍉 Chém Trái Cây — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Hiện 10 loại quả, bom và nửa quả đều **vẽ bằng canvas** (hình tròn gradient, sọc, chấm), nên nhìn như clip-art.
> Quả bay vút từ đáy màn lên ~72% chiều cao rồi rơi, **tự xoay** (±1.5 vòng/giây). Bị chém thì tách 2 nửa văng ra 2 bên, có tia nước ép.
> **Phong cách:** quả 3D bóng mọng nước, kiểu Fruit Ninja, viền tối nhẹ, nhìn **chính diện**.

## Quy cách chung cho quả
| Mục | Giá trị |
|---|---|
| Canvas | **1024 × 1024** mỗi file |
| Kích thước quả | Thân quả (không tính cuống/lá) có đường kính **≈ 60% canvas**, tâm quả ở **chính giữa (50%, 50%)** |
| Cuống, lá, vương miện dứa | Được nhô lên nhưng **vẫn trong lề ≥ 62 px** |
| Hiển thị | đường kính ~120 px (bán kính 60) |
| Neo | **tâm quả (50%, 50%)**, code xoay quanh điểm này |
| Bóng đổ | không vẽ (code thêm) |

## CTC-F01…F10 · 10 loại quả × 3 file
Mỗi quả giao **3 file**:
1. `..._nguyen.png`: quả nguyên.
2. `..._nua-trai.png`: nửa trái sau khi bị **chém dọc chính giữa**. Thấy **mặt cắt** (thịt quả, hạt) hướng về phải-trước, phần vỏ ở trái. Giữ nguyên vị trí như quả nguyên, chỉ xoá phần bên phải đường cắt x = 50%.
3. `..._nua-phai.png`: nửa phải, đối xứng với nửa trái.

> Code xoay 2 nửa theo góc nhát chém thật. Vì vậy **đường cắt luôn thẳng đứng tại x = 50%**, và mặt cắt phải vừa khít đường đó.

| Mã | Quả | Tên file gốc | Vỏ | Ruột (mặt cắt) | Chi tiết |
|---|---|---|---|---|---|
| F01 | Táo đỏ | `CTC-F01_tao` | đỏ `#E5323A` | kem `#FFF3C4`, hạt nâu hình sao | cuống + 1 lá |
| F02 | Cam | `CTC-F02_cam` | cam `#FF9A1F`, lỗ chân lông | múi cam `#FFD27A` toả tia, vỏ trắng | cuống + lá |
| F03 | Chanh vàng | `CTC-F03_chanh` | vàng `#F7D92E`, hình bầu dục ngang | múi vàng nhạt | 2 đầu nhọn nhẹ |
| F04 | Lê | `CTC-F04_le` | xanh vàng `#B9D14A`, dáng bầu (trên nhỏ dưới to) | kem, lõi hạt nâu | cuống + lá |
| F05 | Đào | `CTC-F05_dao` | hồng cam `#FFB08A`, lông tơ, rãnh dọc | vàng `#FFE0B0`, hột nâu to giữa | lá |
| F06 | Dâu tây | `CTC-F06_dau` | đỏ `#E8304A`, hạt vàng, dáng tim | hồng `#FFD5DC` lõi trắng | đài lá xanh 5 cánh |
| F07 | Mận | `CTC-F07_man` | tím `#6A3FA0`, phấn trắng mờ | tím nhạt `#E8C9FF`, hột | cuống |
| F08 | Dưa hấu | `CTC-F08_dua-hau` | xanh sọc đậm `#2F9E44` | đỏ `#FF4D6D`, hạt đen, viền trắng-xanh | — |
| F09 | Dứa | `CTC-F09_dua` | vàng mắt dứa `#E9B42B` | vàng nhạt `#FFF1A8`, lõi xơ | vương miện lá xanh cao (vẫn trong lề) |
| F10 | Kiwi | `CTC-F10_kiwi` | nâu lông `#8A6A3A`, bầu dục | xanh `#9BD45E`, vòng hạt đen, lõi trắng | — |

**Tổng: 30 file.** Thêm `CTC-F00_vien-vang.png`: vòng sáng vàng `#FFD23F` bao quanh quả "vàng" (quả thưởng). Vòng tròn đường kính 66% canvas, rỗng giữa.

## CTC-B01 · Bom
- **Canvas** 1024 × 1024, thân bom tròn đen bóng, đường kính 60%, tâm ở chính giữa. Ngòi dây xám cong lên **trên-phải** (đầu ngòi tại ≈ (78%, 18%)).
- **Files:**
  - `CTC-B01_bom.png`: bom đen bóng, chữ đỏ **"BOM"** trên thân.
  - `CTC-B01_bom-vang.png`: bom **vàng kim** phát sáng (dùng khi có buff "thần", bị chém thì tách đôi như quả). Giao thêm `_bom-vang_nua-trai.png` / `_nua-phai.png`.
  - `CTC-B01_tia-ngoi_01…03.png`: **3 khung** tia lửa ở đầu ngòi (canvas 1024 × 1024, tia lửa ở tâm, đường kính 40%). Code đặt tại đầu ngòi, nháy **15 fps**.

## CTC-J01 · Tia nước ép (đang là chấm tròn)
- **Canvas** 1024 × 1024, vệt bắn toé từ tâm ra 6–8 giọt, màu **trắng xám trung tính** (code nhuộm theo màu ruột quả).
- **Neo:** tâm.
- **5 khung** `CTC-J01_nuoc-ep_01…05.png`: toé ra → lan rộng → giọt rơi → mờ. Code chạy 0.6 s.

## CTC-X01 · Vụ nổ bom
- **Canvas** 1024 × 1024, quả cầu lửa cam-đỏ có khói đen, tâm ở giữa, **không chạm mép**.
- **6 khung** `CTC-X01_no_01…06.png`: chớp trắng → cầu lửa to dần → khói tan. **12 fps**.

---
**Tổng:** 31 (quả) + 2 + 2 + 3 (bom) + 5 (nước ép) + 6 (nổ) = **49 file**.
