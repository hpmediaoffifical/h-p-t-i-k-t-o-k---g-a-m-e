# 🍂 Nhặt Lá — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Overlay 1080 × 1920. Người chơi dùng **bàn tay** (theo chuột/camera) nhặt lá rơi bỏ vào thùng rác.

## Đã rà soát — KHÔNG vẽ lại (đã đẹp 2.5D/3D)
- **21 skin thùng rác:** `skins/thung/*/01.png`
- **6 skin túi rác:** `skins/tui/*/01.png`
- **28 bông tuyết Noel:** `skins/hat/noel-tuyet/*`

**Mẫu phong cách cần bám theo:** `skins/thung/mac-dinh/01.png` (thùng trắng bóng, túi đen nhăn) — 2.5D bóng, viền tối mảnh, ánh sáng trên-trái.

## Cần vẽ lại

### NL-H · Bàn tay (4 trạng thái)
**Hiện tại:** 4 PNG chỉ **50 × 55 px**, kiểu **emoji vàng phẳng** (`assets/hp-bantay*.png`, `hp-taynamla*.png`). Hiển thị 48 px, phóng to sẽ vỡ hình, và lệch hẳn phong cách với thùng/túi 3D.

**Mong muốn:** bàn tay đeo **găng tay làm vườn** 2.5D, màu hồng thương hiệu HP `#F472B6`, cổ tay viền trắng, có logo "hp" nhỏ trên mu bàn tay.
- **Canvas:** **1024 × 1024** mỗi file. Bàn tay chiếm ~80% canvas, lề ≥ 62 px.
- **Hướng:** lòng bàn tay hướng về người xem, ngón tay hướng **lên trên**, hơi nghiêng phải ~10°.
- **Điểm neo (rất quan trọng):** **đầu ngón trỏ** là điểm con trỏ chạm. Đặt đầu ngón trỏ tại **≈ (17%, 13%)** canvas, giống tay hiện tại. Ghi toạ độ thật vào TRA-VE. Code xoay và nảy quanh điểm này.

| Mã | File | Trạng thái |
|---|---|---|
| H1 | `NL-H1_tay-mo.png` | Tay **xoè**, đang di chuyển tìm lá |
| H2 | `NL-H2_tay-nam.png` | Tay **nắm lại** (đang cầm lá). Các ngón khép thành nắm, **không vẽ lá** (code vẽ lá đi theo) |
| H3 | `NL-H3_tay-mo_bi-danh.png` | Như H1 nhưng **bị đánh**: lòng bàn tay sưng đỏ bóng, 2–3 vạch đau nhỏ quanh tay (vẫn trong lề) |
| H4 | `NL-H4_tay-nam_bi-danh.png` | Như H2 nhưng bị đánh (mu bàn tay sưng đỏ) |

**Chuyển động do code:**
- Khi bị đánh: rung lắc phóng 1.44× ±14° trong 0.44 s, sau đó phập phồng 0.78 s.
- Thả lá: nảy lên 1.34×.

### NL-L · Lá mùa thu (12 lá)
**Hiện tại:** `skins/hat/la-mua-thu/01…12.png` chỉ **80 × 80 px** (file `skin.json` đã tự ghi `"lowRes": true`). Lá hiển thị **95–156 px**, tức bị **phóng to gấp 2 lần nên mờ**. Nét viền đen kiểu truyện tranh cũng không hợp với thùng 3D.
- **Canvas:** **1024 × 1024** mỗi lá. Lá nằm giữa, dài ~75% canvas, lề ≥ 62 px. Tâm lá ở chính giữa (code xoay quanh tâm).
- **Phong cách:** lá 2.5D bóng nhẹ, gân rõ, mép hơi cong vênh (có khối), **không viền đen dày**.
- **12 lá khác nhau**, giữ đúng tinh thần bộ cũ. File `NL-L_la-mua-thu_01…12.png`:

| # | Mô tả |
|---|---|
| 01–02 | Lá bạch dương vàng cam nguyên vẹn |
| 03–04 | Lá cong vênh, đầu cuộn |
| 05–06 | Lá cam có lỗ thủng nhỏ |
| 07 | Lá nâu đốm |
| 08 | Lá xơ rách mép |
| 09 | Lá nhìn nghiêng (rất mỏng, để tạo cảm giác xoay) |
| 10 | Lá nhỏ có cuống dài |
| 11 | Lá nhỏ tròn |
| 12 | Lá to gãy gập |

- **Màu:** vàng `#F9A825` → cam `#EF6C00` → nâu `#8D5524`.

### NL-F · Hiệu ứng "đánh tay" (thay `assets/fx/tom.webm`)
**Hiện tại:** video **64 × 64 px** hình **mèo Tom (phim Tom & Jerry)** cầm vỉ đập ruồi. Video vừa vỡ hình, vừa có nền trắng, và **dùng nhân vật có bản quyền của Warner Bros**. Không được dùng trên livestream thương mại, phải thay.

**Mong muốn:** nhân vật **riêng của HP**: **mèo hồng HP** (mèo chibi lông hồng phấn, đeo khăn cổ có chữ "hp") cầm **vỉ đập ruồi** đập xuống.
- **Canvas:** **1024 × 1024** mỗi khung, nền trong suốt.
- **Neo:** điểm **mặt vỉ đập chạm** tại **(28%, 78%)** canvas, vì code đặt điểm này trùng bàn tay người chơi.
- **12 khung** `NL-F_meo-dap_01…12.png` (code ghép lại thành webm trong suốt, 30 fps = 0.4 s):

| Khung | Hành động |
|---|---|
| 01–03 | Mèo giơ vỉ lên cao sau đầu (lấy đà) |
| 04–05 | Vụt xuống nhanh, có vệt chuyển động (motion blur) |
| 06 | Vỉ chạm tay, có **vòng sao "bốp"** nhỏ |
| 07–09 | Vỉ nảy lên, mèo cười khoái chí |
| 10–12 | Mèo thu vỉ về tư thế nghỉ |

- **Hiển thị:** rộng ~150 px. Có thể lặp tối đa 20 lần liền nhau.

---

## File thừa (Claude dọn sau, không cần vẽ)
Các file sau **không còn được dùng** ở đâu cả:
- `assets/tui-rac.png` (1.7 MB)
- `assets/hp-thungrac01.png`, `hp-thungrac02.png`
- `assets/la/hp-la-*.png`

**Tổng cần vẽ:** 4 tay + 12 lá + 12 khung mèo = **28 file**.
