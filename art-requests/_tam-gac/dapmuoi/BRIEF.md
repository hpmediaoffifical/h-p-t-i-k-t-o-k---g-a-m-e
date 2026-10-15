# 🦟 Đập Muỗi — Đơn đặt vẽ

> Đọc **Quy tắc chung** ở `../README.md` trước.
> Overlay 1080 × 1920. Thân muỗi, muỗi chết, bình xịt, vợt điện và kem chống muỗi **đã có bản 3D PNG đẹp** trong `public/games/dapmuoi/assets/*-3d.png`, không vẽ lại.
> **Phong cách:** khớp với `muoi-than-3d.png` (3D bóng, viền tối, ánh sáng trên-trái). Hãy đính kèm ảnh này cho ChatGPT làm tham chiếu.

---

## DM-W01 · Cánh muỗi (đang là 2 hình elip xanh)
Code vẽ thân muỗi PNG 320×200 rồi gắn 2 cánh, xoay quanh **gốc cánh** để vỗ (khoảng 14–19 lần/giây).

- **Canvas:** **1024 × 1024** cho 1 cánh.
- **Hình:** cánh **nằm ngang**, **gốc cánh ở TRÁI**, chóp cánh ở PHẢI. Cánh dài 80% canvas, rộng ~25%.
- **Neo:** gốc cánh tại (8%, 50%).
- **Chất liệu:** cánh côn trùng trong suốt, gân nâu mảnh, ánh cầu vồng nhẹ, viền trắng xanh. Thân cánh alpha ~45%, gân và viền ~90%.
- **Files:**
  - `DM-W01_canh-truoc.png`: cánh trước, to hơn, rõ hơn.
  - `DM-W01_canh-sau.png`: cánh sau, nhỏ hơn 15%, mờ hơn.
- **Cách code dùng:**
  - Cánh trước xoay −50°…+14°, cánh sau −18°…+38°.
  - Khi muỗi đậu, cánh xếp 8° / 14°.
  - Cánh có thể bị **làm mờ chuyển động** (motion blur) bằng code, nên không cần vẽ nhiều khung.

---

## DM-N01 · Màn chống muỗi (SVG nét lưới đơn giản)
Màn **trượt từ trên xuống** phủ gần hết màn hình khi có quà "Mắc màn".
- **Hiển thị:** cao 1728 px (90% màn), rộng ~2666 px (rộng hơn màn, 2 bên bị cắt).
- **Canvas:** **1536 × 1024** (ngang). Màn chiếm hết bề ngang, cao 100%.
  ⚠️ Đây là ngoại lệ "chạm mép": **mép trái, mép phải và mép trên được phép chạm mép ảnh**, vì code kéo giãn và cắt 2 bên. Riêng **mép dưới (gấu màn gợn sóng) phải cách đáy ảnh ≥ 62 px**.
- **Vẽ:**
  - Vải màn trắng xanh nhạt trong suốt (alpha 20–45%), lưới mắt cáo rõ, 6 nếp gấp dọc mềm.
  - **Thanh treo trên** cao ~4% ảnh, có 5 khoen tròn.
  - Gấu dưới lượn sóng, sáng hơn.
- **File:** `DM-N01_man.png`.

---

## DM-B01 · Nốt muỗi đốt (SVG chấm đỏ tròn)
Nốt sưng **bám trên mặt/cổ/vai** người chơi (theo camera), phồng lên rồi xẹp dần.
- **Canvas:** **1024 × 1024**. Nốt tròn hơi méo ở tâm, đường kính ~55% canvas. Viền đỏ nhạt toả ra trong suốt dần tới 85% canvas.
- **Neo:** tâm (50%, 50%). **Hiển thị:** 28–100 px.
- **3 mức:**
  - `DM-B01_not_1.png`: vừa bị chích, đỏ hồng nhỏ, có chấm chích giữa.
  - `DM-B01_not_2.png`: sưng to, đỏ đậm, bóng.
  - `DM-B01_not_3.png`: đang lành, hồng nhạt, có vệt kem trắng.
- **Chuyển động do code:**
  - 2 giây đầu nốt nhịp phồng tối đa ×1.18.
  - Sống 30 s, mờ dần ở 30% cuối.
  - Khi bôi kem: nốt teo 50% và mờ 90%.

---

## DM-S01 · Mây thuốc xịt (đang là gradient xanh)
- **Canvas:** **1024 × 1024**. Đám sương thuốc tròn mềm, xanh lá nhạt `#78E678`, có vài hạt li ti, alpha cao nhất 40% ở giữa, mờ hết ra mép (≥ 62 px trống).
- **Neo:** tâm. **Hiển thị:** bán kính 0 → 600 px, phóng to dần trong 2.5 s.
- **4 khung cuộn khói** `DM-S01_may-xit_01…04.png`: hình dạng đám mây biến đổi nhẹ. Code lặp **6 fps**, đồng thời phóng to.

## DM-Z01 · Tia điện vợt muỗi (đang là đường gấp khúc ngẫu nhiên)
- **Canvas:** **1024 × 1024**. Tia sét xanh trắng `#8FE8FF` toả ra từ tâm (mặt vợt) theo 4–6 nhánh, glow xanh. Nhánh dài tới 85% canvas, **không chạm mép**.
- **Neo:** tâm. **Hiển thị:** ~170 px. Hiệu ứng tồn tại 180 ms.
- **4 khung khác nhau** `DM-Z01_tia-dien_01…04.png`. Code chọn ngẫu nhiên mỗi frame để nháy giật.

## DM-K01 · Vệt xoa kem (đang là cung tròn trắng)
- **Canvas:** **1024 × 1024**. Vệt kem trắng sệt hình xoáy tròn, vài bọt nhỏ.
- **Neo:** tâm. **Hiển thị:** ~40 px.
- **3 khung** `DM-K01_xoa-kem_01…03.png`: vệt xoáy dài dần (1/3 → 2/3 → đủ vòng). Code lặp trong 0.8 s.

## DM-H01 · Vòng đập trúng / trượt (tuỳ chọn)
- **Canvas:** 1024 × 1024. Vòng sóng va chạm (shockwave) có tia văng.
- **Files:**
  - `DM-H01_trung.png`: vàng `#FFD54A`.
  - `DM-H01_truot.png`: trắng mờ.
- Code phóng 0.4 → 1 và mờ dần trong 0.3 s.

---

**Tổng:** 2 cánh + 1 màn + 3 nốt + 4 mây + 4 tia điện + 3 vệt kem + 2 vòng (tuỳ chọn) = **19 file**.
