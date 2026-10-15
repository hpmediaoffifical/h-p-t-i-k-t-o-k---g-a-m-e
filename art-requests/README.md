# 🎨 Đặt vẽ lại hình ảnh — HP Action LIVE

Thư mục này gom các hình **cần vẽ lại cho đẹp** để nhờ ChatGPT vẽ. **Kế hoạch hiện tại (15/10/2026) chỉ làm 2 phần: 🫙 Hũ Thủy Tinh và 👑 Chào người xem vào phòng.** Các game khác đã ổn, đơn đặt cũ của chúng cất trong `_tam-gac/`. Mỗi phần có **thư mục riêng** gồm:

```
art-requests/<game>/BRIEF.md          ← đơn đặt vẽ (gửi cho ChatGPT)
art-requests/<game>/ve-xong/          ← ChatGPT đặt ảnh vẽ xong vào đây
art-requests/<game>/ve-xong/TRA-VE.md ← ChatGPT ghi lại đã vẽ gì, kích thước, điểm neo, số khung
```

Khi `ve-xong/` có ảnh và `TRA-VE.md` đã điền, Claude sẽ đọc ngược `TRA-VE.md`, kiểm tra ảnh (kích thước, nền trong, lề, số khung) rồi gắn vào game.

---

## 1. Quy trình làm việc với ChatGPT

1. Mở `art-requests/<phần>/BRIEF.md` và dán **cả file** cho ChatGPT, kèm **mục 3 "Quy tắc chung"** dưới đây (hoặc dán luôn file README này).
2. Mỗi lần chỉ yêu cầu **1 mã hình** (ví dụ `TT-A01`). Đính kèm ảnh tham chiếu nếu BRIEF có ghi (khung mẫu hũ, ảnh hiện tại…).
3. Tải ảnh về, đặt tên **đúng như BRIEF ghi**, rồi bỏ vào `ve-xong/`.
4. Điền 1 dòng vào `ve-xong/TRA-VE.md` (mẫu có sẵn). Ghi đúng toạ độ **điểm neo** đo được trên ảnh thật.
5. Báo Claude: "đã có ảnh game X". Claude sẽ đọc `TRA-VE.md` và tự tích hợp.

> **Mẹo với ChatGPT:**
> - Luôn ghi rõ "PNG nền trong suốt (transparent background)".
> - Nếu ảnh trả về có ô caro xám-trắng **vẽ giả**, bắt nó vẽ lại.
> - Khung hình động nên xin **từng khung một** trong cùng cuộc trò chuyện ("giữ y nguyên nhân vật, chỉ đổi tư thế sang khung 3/8"). Cách này đồng đều hơn xin cả tấm sprite.

---
## 2. Kế hoạch hiện tại — chỉ 2 phần

| Thứ tự | Phần | Thư mục | Vẽ gì |
|---|---|---|---|
| 1 | 🫙 **Hũ Thủy Tinh** | `thuytinh/` | **46 kiểu hũ 2 lớp** (30 thường + 16 theo mùa): `BRIEF-HU.md` + `khung-mau/`, tổng hợp nhanh ở `TONG-HOP-HU.md` + `tong-hop-hu.png`. **41 phụ kiện** (5 kiểu neo, vừa mọi hũ): `BRIEF-PHU-KIEN.md` + `khung-mau-phu-kien/`. Nhân vật ninja trộm, cảnh sát, OSIN, UFO, vương miện TOP: `BRIEF.md` |
| 2 | 👑 **Chào người xem vào phòng** (VIP Welcome) | `vipwelcome/` | **Làm lại thẻ chào 5 bậc**: thân thẻ, khung avatar, huy hiệu bậc, hiệu ứng vào phòng, hiệu ứng lặp. Thêm thẻ gộp, avatar mặc định, 6 icon vai trò: `BRIEF.md` + `khung-mau/` |

**Đợt 1 nên vẽ trước:**
- **Hũ:** 5–10 kiểu hũ đẹp nhất. Mỗi kiểu gồm `front.png` + `back.png`.
- **Thẻ chào:** 5 bậc × (`plate` + `frame` + `huy-hieu`), thẻ gộp, avatar mặc định, 6 icon. Tổng **23 file**.

---

## 3. Quy tắc chung (áp dụng MỌI ảnh)

### 3.1 Định dạng
- **PNG 32-bit RGBA, nền trong suốt thật.** Không nền trắng, không ô caro vẽ giả, không viền trắng bao quanh (halo).
- **Kích thước canvas đúng như BRIEF ghi.** ChatGPT chỉ xuất được 1024×1024, 1024×1536 (dọc) và 1536×1024 (ngang), nên mọi canvas trong BRIEF đều theo 3 cỡ này hoặc chia lưới từ chúng.
- Không chữ ký, watermark, logo lạ. Chỉ có chữ khi BRIEF yêu cầu, và phải **đúng chính tả tiếng Việt có dấu**.

### 3.2 Luôn nằm gọn trong khung — KHÔNG mất chi tiết
- Mỗi ảnh có **vùng an toàn**: mọi pixel có màu (kể cả glow, lấp lánh, bóng đổ, tua rua, đuôi, râu) phải cách mép ảnh **≥ 6% cạnh** (≥ 62 px với ảnh 1024), trừ khi BRIEF ghi số khác.
- **Không được cắt** tai, đuôi, chân, vũ khí, ngọn lửa ở mép. Nếu tư thế dang rộng thì **thu nhỏ nhân vật lại**, không cắt.
- **Ảnh động:** mọi khung phải **cùng canvas, cùng tỉ lệ nhân vật, cùng điểm neo**. Nhân vật **không được nhảy vị trí** giữa các khung, trừ phần chuyển động thật (chân, tay, cánh).
- **Sprite sheet** (nếu có): ô lưới chia đều tuyệt đối, **không chi tiết nào vượt qua đường chia ô**, mỗi ô vẫn giữ lề an toàn ≥ 6%.

### 3.3 Hướng và điểm neo
- Nhân vật nhìn nghiêng thì **mặt hướng sang PHẢI**. Code tự lật khi đi sang trái.
- **Điểm neo** là điểm code gắn ảnh vào màn hình (ví dụ "tâm đáy = gót chân"). BRIEF ghi điểm neo theo **% của canvas**. Hãy đặt nhân vật để điểm đó đúng vị trí ghi, rồi **đo lại và ghi vào TRA-VE.md**.
- Ánh sáng thống nhất từ **trên-trái**.
- **Không vẽ bóng đổ dưới đất**, vì code tự thêm bóng. Có ngoại lệ thì BRIEF ghi.

### 3.4 Phong cách
- **3D cartoon bóng bẩy** (kiểu game mobile cao cấp), nét viền sạch, màu tươi, đọc rõ khi thu nhỏ còn 40–80 px trên livestream điện thoại.
- Cùng 1 game phải **cùng phong cách và cùng tỉ lệ**.
- Tham chiếu chất lượng có sẵn trong dự án: `public/games/dapmuoi/assets/muoi-than-3d.png` (muỗi 3D), `public/assets/thuytinh/ben-ngoai/jar-glass.png` (hũ thủy tinh).

### 3.5 Đặt tên file
`<MÃ>_<ten-ngan>[_<trang-thai>][_<khung 2 chữ số>].png`, viết thường, không dấu, nối bằng gạch ngang.
Ví dụ: `TT-A03_osin_di-bo_01.png`, `TC-P01_meo_di-bo_06.png`, `CTC-F01_tao_nua-trai.png`.

---


## 4. Tạm gác — `_tam-gac/`
Đơn đặt của các game dưới đây đã viết đầy đủ nhưng **chưa cần làm** (user xác nhận các game này ổn). Khi cần thì chuyển thư mục ra ngoài là dùng lại được ngay:
- Trồng Cây, Đập Muỗi, Chém Trái Cây, Bắn Cung, Nhiệt Độ, Touch & Play, Caro, Level Quest, Nhặt Lá.
- Bộ icon chung (`chung/`).

> ⚠️ Riêng **Nhặt Lá**: hiệu ứng `tom.webm` là **mèo Tom (phim Tom & Jerry, bản quyền Warner Bros)**. Dù tạm gác vẽ, vẫn nên thay sớm nếu phát LIVE thương mại. Xem `_tam-gac/nhatla/BRIEF.md` mục NL-F.

### Kết quả rà soát ảnh raster (PNG/WebM) — 15/10/2026
| Ảnh | Kết luận |
|---|---|
| `nhatla/skins/thung/*` (21), `skins/tui/*` (6), `skins/hat/noel-tuyet/*` (28) | ✅ 2.5D/3D đẹp — bỏ qua |
| `dapmuoi/assets/*-3d.png` | ✅ 3D — bỏ qua |
| `assets/jar-fx-webm/dragon-*.png`, `fire-streak-*.png`, `dragon.webm` | ✅ 2.5D — bỏ qua |
| `assets/thuytinh/*` (hũ hiện tại) | ✅ kính thật — giữ làm kiểu 01, bổ sung 45 kiểu mới |
| `assets/music-gift/disc.png` | ✅ tạm ổn — bỏ qua |
| `nhatla/assets/hp-bantay*.png`, `hp-taynamla*.png` | ❌ emoji vàng phẳng 50 px → `nhatla/` NL-H |
| `nhatla/skins/hat/la-mua-thu/*` | ❌ 80 px, viền đen kiểu cũ, hiển thị tới 156 px nên mờ → `nhatla/` NL-L |
| `nhatla/assets/fx/tom.webm` | ❌ 64 px, nền trắng, **nhân vật Tom & Jerry có bản quyền** → `nhatla/` NL-F |
| `dapmuoi/assets/man-muoi.svg`, `not-muoi-can.svg` | ❌ SVG phẳng → `dapmuoi/` |
| Emoji hệ điều hành dùng làm hình trên overlay (198 loại) | ❌ không đồng bộ, mỗi máy 1 kiểu → `chung/` (24 icon dùng nhiều nhất) |
| `hp-logo.png`, `hp-logo-pink.svg`, `favicon.ico` | Logo thương hiệu — không đụng |

---

## 5. Lỗi code phát hiện khi rà soát — ✅ Claude ĐÃ SỬA (15/10/2026, chưa commit)
- **Đập Muỗi:** ảnh muỗi 3D đầu quay **trái** mà code lật như đầu quay phải → muỗi bay giật lùi. Đã lật theo `-dir`.
- **Hũ Thủy Tinh:**
  - Phụ kiện `star-gold` bị cắt 2 cánh dưới → thu ngôi sao vào khung.
  - Phụ kiện giờ xoay theo hũ khi nghiêng (fxTilt) và bay + xoay theo hũ khi dốc ngược (pourOut).
  - Dây ninja dài đúng từ đỉnh tới người (tính theo `cqw`); ninja không còn lệch lên 20 px ở các pha di chuyển.
  - Cảnh sát hết dịch tâm 2 lần.
  - Thành hũ va chạm dày 40 px về phía ngoài, mặt trong giữ nguyên chỗ cũ (thành 14 px cũ để quà nhỏ bị ép xuyên qua).
  - **Cỡ quà:** xu ít thì quà bé (đường cong mũ 1.6), và cỡ quà bị chặn theo hũ: tối đa 50%, tối thiểu 20% lòng cổ hũ. Mặc định mới 24–120 px.
  - Điểm thả quà giữ cả mép quà trong lòng cổ hũ.
- **Chém Trái Cây:** nửa quả sau khi chém giờ xoay theo.
- **Caro:** đường thắng vẽ dần trong 0.6 s.
