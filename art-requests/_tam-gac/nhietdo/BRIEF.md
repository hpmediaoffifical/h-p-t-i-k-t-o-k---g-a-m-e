# 🌡️ Nhiệt Độ — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Nhiệt kế hiện dựng bằng CSS: khung bo tròn, ống thủy ngân, bầu tròn có mặt cười 2 chấm. Có 12 bảng màu, mặc định "pinkfire" hồng-lửa. Cạnh nhiệt kế là **emoji cảm xúc** đổi theo nhiệt độ.
> **Cột thủy ngân vẫn do code vẽ** (dâng lên theo %). Art chỉ cần **vỏ nhiệt kế** và **mặt bầu**.

## ND-T01 · Vỏ nhiệt kế (bản mặc định "pinkfire")
- **Canvas** **1024 × 1536** (dọc). Nhiệt kế dựng đứng ở giữa, cao 88% canvas.
- **Hiển thị:** 220 × 760 px × tỉ lệ người dùng chọn (mặc định 40%).
- **Gồm:**
  - Khung ngoài bo tròn hồng `#FF5FA3` viền dày.
  - **Ống thủy tinh rỗng** ở giữa: để **TRONG SUỐT bên trong ống**, code đổ cột màu vào.
  - **Bầu tròn** ở đáy: phần trong bầu cũng trong suốt.
  - Vạch chia 0°…100° in mảnh trên khung, **không ghi số** (code ghi).
- **Hãy ghi vào TRA-VE:** toạ độ hình chữ nhật lòng ống (x trái, x phải, y đỉnh, y đáy) và tâm + bán kính lòng bầu.
- **File:** `ND-T01_vo-nhiet-ke.png`.

## ND-F01…F06 · 6 mặt cảm xúc (thay emoji 😐🙂😅🥵🔥💥)
Đặt trong lòng bầu (hoặc cạnh nhiệt kế), đổi theo mốc 0 / 20 / 40 / 60 / 80 / 98%.
- **Canvas** 1024 × 1024, mặt tròn ở giữa, đường kính 70%, **không chạm mép** (kể cả mồ hôi, lửa).
- **Hiển thị:** 84 px. Code nhún ±3° / 2.4 s.

| Mã | File | Biểu cảm |
|---|---|---|
| F01 | `ND-F01_binh-thuong.png` | mặt hồng nhạt, mắt chấm, miệng thẳng (0%) |
| F02 | `ND-F02_vui.png` | cười híp mắt (20%) |
| F03 | `ND-F03_hoi-nong.png` | cười gượng, 1 giọt mồ hôi (40%) |
| F04 | `ND-F04_nong.png` | mặt đỏ, lưỡi thè, mồ hôi nhiều (60%) |
| F05 | `ND-F05_rat-nong.png` | mặt đỏ cam, mắt lửa, hơi nóng bốc lên (80%) |
| F06 | `ND-F06_bung-no.png` | mặt đỏ rực nổ tung, tóc dựng lửa (≥98%) |

## ND-X01 · Đốm lửa bay (tuỳ chọn)
- `ND-X01_dom-lua_01…03.png`: canvas 1024 × 1024, đốm than hồng cam phát sáng, 3 hình khác nhau.
- Code cho bay lên và mờ dần.

**Tổng:** 1 + 6 (+3 tuỳ chọn).
