# 🏹 Bắn Cung — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Cung đứng góc dưới-phải màn hình, **xoay quanh tay cầm** để ngắm vào người trên camera rồi bắn tên. Hiển thị ≈ 400 × 370 px.
> Hiện cung, tên và tim máu đều là SVG nét đơn giản (một đường cong + một dây).
> **Dây cung vẫn do code vẽ** (để kéo căng mượt). Art chỉ cần **thân cung** (2 cánh + tay cầm).

## BC-W · Thân cung — 8 skin × 3 độ căng
| Mục | Giá trị |
|---|---|
| Canvas | **1024 × 1024** |
| Hướng | Cung **dựng đứng**, lưng cung (bụng cong) quay sang **PHẢI** (hướng bắn), dây cung bên trái |
| Neo | **Tâm tay cầm** tại (60%, 50%). Code xoay quanh điểm này |
| Chóp cánh | 2 chóp (nơi buộc dây) ở **≈ (42%, 8%)** và **(42%, 92%)** lúc căng 0%. Hãy đo lại và ghi toạ độ 2 chóp **từng file** vào TRA-VE, vì code nối dây vào đó |
| Lề | Chóp cánh và trang trí không chạm mép (≥ 62 px) |

**3 độ căng:**
- `_cang-0`: nghỉ.
- `_cang-50`: kéo nửa, 2 cánh cong thêm, chóp cánh lùi trái ~4% canvas.
- `_cang-100`: kéo hết, chóp lùi trái ~8% canvas.

Code nội suy giữa 3 ảnh trong ~80 ms.

| Skin | Tên file gốc | Màu cung / ánh |
|---|---|---|
| classic | `BC-W01_classic` | gỗ nâu `#8B5A2B`, quấn da |
| glow | `BC-W02_glow` | xanh neon `#25F4EE` phát sáng |
| fire | `BC-W03_fire` | đỏ cam `#FF5B2E`, vân lửa |
| ice | `BC-W04_ice` | băng `#7CC6FF`, tinh thể |
| cupid | `BC-W05_cupid` | hồng `#FF5FA3`, trái tim, cánh thiên thần nhỏ ở 2 chóp |
| shadow | `BC-W06_shadow` | đen tím `#1A1A2E`, khói tím `#9B30FF` |
| golden | `BC-W07_golden` | vàng kim `#C97F25`, hoa văn |
| plasma | `BC-W08_plasma` | xanh ngọc `#A0FFE0`, năng lượng |

→ 8 × 3 = **24 file**, ví dụ `BC-W05_cupid_cang-100.png`.

## BC-A · Mũi tên — 8 skin
- **Canvas** **1536 × 1024**. Mũi tên **nằm ngang, mũi nhọn bên PHẢI**, đuôi lông vũ bên trái. Dài 80% bề ngang, nằm trên đường giữa y = 50%.
- **Neo:** khấc đuôi (nock) tại (10%, 50%). Mũi nhọn ≈ (90%, 50%), hãy ghi lại vị trí thật.
- **Hiển thị:** dài 122–130 px.
- **Files:** `BC-A01_classic.png` … `BC-A08_plasma.png`, màu theo skin ở bảng trên.
- **Code:** tên bay thẳng, xoay theo hướng bay, có vệt sáng đuôi; cắm vào người 1.6 s.

## BC-H · Tim máu (hàng tim trên đầu người chơi)
- **Canvas** 1024 × 1024, trái tim ở giữa, rộng 76%, **không chạm mép**.
- **Hiển thị:** 38–64 px.
- **4 kiểu:**
  - `BC-H01_pixel.png`: tim pixel art 8-bit, nét vuông sắc.
  - `BC-H02_bong.png`: tim đỏ bóng 3D, mặc định.
  - `BC-H03_lua.png`: tim lửa vàng → cam → đỏ.
  - `BC-H04_pha-le.png`: tim pha lê xanh ngọc có giác cắt.
- Nửa tim và tim rỗng do code tạo (mặt nạ và làm xám), **không cần vẽ thêm**.

## BC-M · Vết máu khi trúng tên
- **Canvas** 1024 × 1024, vệt máu hoạt hình đỏ `#E53935` (bớt ghê, kiểu game), ở giữa, rộng ~60%, có 2–3 giọt văng **trong lề**.
- **3 mẫu khác nhau:** `BC-M01_vet-mau_01…03.png`. Code xoay ngẫu nhiên, mờ dần trong 4 s.

## BC-S · Khiên bất tử
- `BC-S01_khien.png`: canvas 1024 × 1024, khiên tròn xanh ngọc `#25F4EE` có viền bạc, phát sáng. Hiển thị 26–120 px.
- `BC-S02_song-chan_01…04.png`: 4 khung vòng năng lượng **đỡ tên** lan ra từ tâm (nhỏ → to → mờ), **12 fps**.

---
**Tổng:** 24 + 8 + 4 + 3 + 5 = **44 file**.
