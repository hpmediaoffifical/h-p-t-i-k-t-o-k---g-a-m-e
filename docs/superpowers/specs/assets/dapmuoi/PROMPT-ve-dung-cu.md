# Prompt vẽ dụng cụ cho game Đập Muỗi (đưa ChatGPT / Midjourney / designer)

Game chạy trên overlay OBS **1080×1920 (dọc)**, nền **trong suốt**, đè lên hình camera của streamer.
Phong cách chung: **vector hoạt hình, nét viền đậm tối, màu tươi, bóng đổ nhẹ**, giống con muỗi
hiện có (`muoi.svg`: thân nâu đen sọc trắng, mắt đỏ, cánh xanh nhạt trong suốt). Mọi ảnh xuất
**PNG nền trong suốt** (hoặc SVG), không chữ ký, không nền.

Ảnh mẫu con muỗi để khớp phong cách: `muoi.svg` (bay) và `muoi-lat-ngua.svg` (bị đập).

---

## 1. Bình xịt muỗi — `binh-xit.png`

- **Kích thước:** 200 × 320 px (rộng × cao), tỉ lệ 5:8.
- **Hướng:** nhìn nghiêng, **vòi xịt chĩa sang PHẢI**, bình đứng thẳng.
- **Chi tiết:** bình kim loại trụ tròn màu xanh lá (gradient sáng bên trái, tối bên phải), nhãn
  trắng ở giữa có hình con muỗi gạch chéo đỏ và chữ "XỊT MUỖI"; nắp bấm màu đỏ phía trên; vòi
  ngắn bên phải đang phun ra **3–4 tia hơi xanh nhạt + vài giọt li ti** về bên phải.
- **Điểm neo:** tâm bình (100, 160). Game đặt bình ở mép trái đám mây xịt và phóng mây về phía
  phải, nên tia xịt phải ở bên phải.
- Xuất thêm bản **không có tia xịt** nếu tiện (`binh-xit-than.png`) để game tự vẽ mây.

## 2. Vợt muỗi điện — `vot-muoi.png`

- **Kích thước:** 260 × 520 px, tỉ lệ 1:2.
- **Hướng:** dựng **thẳng đứng, mặt vợt ở TRÊN, cán ở DƯỚI**. Không nghiêng (game tự xoay theo tay).
- **Chi tiết:** khung mặt vợt hình bầu dục màu vàng (như vợt điện thật), lưới kim loại xám bạc ô
  vuông nhỏ thấy xuyên qua được (nền trong suốt sau lưới); cán vàng có nút bấm đỏ và đèn báo
  xanh dương; **vài tia điện xanh lam nhỏ lóe trên mặt lưới**.
- **Điểm cầm:** (130, 470) trên ảnh, tức gần cuối cán — game đặt điểm này vào lòng bàn tay
  streamer, mặt vợt hướng lên trên.
- Xuất thêm bản **không tia điện** (`vot-muoi-tat.png`) nếu tiện.

## 3. Màn (mùng) chống muỗi — `man-muoi.png`

- **Kích thước:** 1080 × 700 px (rộng đúng bề ngang overlay, cao khoảng 1/3 màn hình).
- **Hướng:** **treo từ mép trên** màn hình, rủ xuống, **mép dưới lượn sóng** để lộ phần dưới
  khung hình; **không** phủ kín (người xem vẫn thấy mặt streamer qua lưới).
- **Chi tiết:** lưới trắng/xanh rất nhạt, **độ trong suốt 30–45%** (nhìn xuyên qua được), có nếp
  gấp dọc mềm, viền trên là thanh treo trắng với 5 vòng móc; mờ dần về phía dưới.
- **Điểm neo:** mép trên trái (0, 0). Game vẽ đè ảnh này lên toàn bộ overlay khi "Mắc màn" bật,
  trượt từ trên xuống trong 0,5 giây và kéo lên khi hết giờ.

## 4. (Tuỳ chọn) Kem chống muỗi — `kem-chong-muoi.png`

- **Kích thước:** 200 × 320 px.
- **Hướng:** tuýp kem đứng thẳng, nắp ở trên, nhìn chính diện hơi nghiêng.
- **Chi tiết:** tuýp trắng kem, nắp xanh ngọc, nhãn có lá cây và chữ "CHỐNG MUỖI"; một vệt kem
  trắng mềm trào ra ở miệng tuýp.
- **Điểm neo:** tâm tuýp (100, 160). Game đặt tuýp cạnh bàn tay rồi xoa vệt kem lên chỗ bị cắn.

## 5. (Tuỳ chọn) Nốt muỗi cắn — `not-muoi-can.png`

- **Kích thước:** 120 × 120 px, hình tròn.
- **Chi tiết:** nốt sưng đỏ hồng, tâm đậm hơn, viền mờ dần ra ngoài (không viền cứng), hơi bóng.
  Độ trong suốt rìa 100% để dán lên da.
- Game dán lên mặt/cổ/vai streamer đúng chỗ muỗi chích, bám theo cử động, mờ dần sau 30 giây.

---

Prompt gộp (dán nguyên cho AI vẽ):

> Vector cartoon game asset, bold dark outlines, vivid colors, soft shadow, transparent background,
> no text except label, style matching a cartoon mosquito (dark brown striped body, red eyes,
> translucent light-blue wings). Draw: (1) a green aerosol mosquito-spray can, side view, red cap,
> nozzle pointing RIGHT with 3 light-blue spray streaks, 200x320 px; (2) an electric mosquito-swatter
> racket standing UPRIGHT, oval yellow frame on TOP, silver metal mesh you can see through, yellow
> handle at the BOTTOM with red button and blue LED, small blue electric sparks on the mesh, 260x520 px;
> (3) a white translucent mosquito net canopy hanging from the TOP edge, 1080x700 px, wavy bottom hem,
> soft vertical folds, five hanging rings on a white top rail, 35% opacity so the person behind is visible.
