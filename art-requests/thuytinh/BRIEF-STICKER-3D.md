# ✨ Hũ Thủy Tinh — 26 sticker 3D trang trí chữ (ChatGPT vẽ)

> Đây là file đặt vẽ cho ChatGPT. Đọc **Quy tắc chung** ở `../README.md` trước.
> Sticker dùng quanh **chữ trang trí trên hũ**: thỏ ngồi trên chữ, sao mặt cười, tim, nơ, đèn lồng… Xem chữ đang chạy ở `http://localhost:3000/_prototype/jar-text-styles.html?presets=1`.
> Hiện app đã có bản **vẽ bằng code** cho cả 26 sticker. Ảnh ChatGPT vẽ sẽ **thay thế tự động**, sticker nào chưa có ảnh thì vẫn dùng bản code.

## 1. Phong cách (giống nhau cho cả bộ)

| Mục | Yêu cầu |
|---|---|
| Chất liệu | **3D render dễ thương**, kiểu đồ chơi vinyl / đất sét bóng (Pop Mart, Sanrio 3D, Pixar). Khối tròn mập, bề mặt mịn hơi bóng, **không** phẳng kiểu clipart |
| Ánh sáng | Từ **trên-trái**. Có điểm bóng trắng (specular) rõ, rim light mềm ở mép phải, bóng tối nhẹ ở đáy khối |
| Viền | **Viền trắng cắt bế (die-cut) dày ~4% cạnh ảnh** bao quanh cả vật, viền có bề dày: mép dưới hơi xám tím `#CDC3DC` |
| Bóng đổ | Bóng đổ mềm ngay dưới sticker, màu tím than `#2A0F2A` alpha ~35%, lệch xuống ~2% |
| Mặt nhân vật | Mắt to đen bóng, 2 chấm sáng trắng, má hồng mờ, miệng "ω" nhỏ. Dễ thương, **không** đáng sợ (kể cả ma, dơi, bí ngô) |
| Màu | Pastel tươi, bão hoà vừa. Phải nổi trên cả nền LIVE tối lẫn hũ thủy tinh trong |
| Chữ | **Không** có chữ/logo trong ảnh |

## 2. Thông số file

- **PNG RGBA nền trong suốt thật**, canvas **1024 × 1024**.
- Vật (kể cả viền trắng + bóng đổ) nằm gọn trong vùng **x 64→960, y 64→960**, căn giữa. Không chi tiết nào chạm mép.
- Cỡ vật **lấp đầy** vùng trên theo cạnh dài, giữ đúng **tỉ lệ khung** ghi ở bảng (ví dụ thỏ 120 : 130 = cao hơn rộng một chút).
- Mỗi sticker **1 ảnh tĩnh**. Code tự làm chuyển động (nhún, đung đưa, lấp lánh), **không** cần vẽ khung động.
- Tên file **đúng như cột "Tên file"**, giao vào `ve-xong/sticker/`.

## 3. Danh sách (26)

| # | Tên file | Tỉ lệ (rộng : cao) | Mô tả |
|---|---|---|---|
| 1 | `bunny.png` | 120 : 130 | Thỏ trắng tròn mũm mĩm, 2 tai dài dựng (tai trái hơi nghiêng), lòng tai hồng, 2 bàn chân trước bám xuống dưới như đang **ngồi vắt lên mép chữ** |
| 2 | `duck.png` | 120 : 120 | Vịt con đầu tròn màu kem, **đội vòng cánh hoa hướng dương cam** quanh đầu, đeo **kính tròn gọng nâu**, mỏ cam, 2 cánh nhỏ bám xuống dưới |
| 3 | `cat.png` | 120 : 110 | Mèo con màu kem, tai nhọn lòng hồng, mặt tròn, 2 chân trước bám xuống dưới |
| 4 | `bear.png` | 120 : 110 | Gấu bông nâu caramel, tai tròn, mõm kem, mũi đen bóng, 2 chân trước bám xuống |
| 5 | `heart.png` | 100 : 100 | Trái tim hồng `#FF5F9E` bóng như kẹo thạch |
| 6 | `heartBlue.png` | 100 : 100 | Như #5, xanh `#4FB8FF` |
| 7 | `starFace.png` | 100 : 100 | Ngôi sao vàng 5 cánh **tròn mập**, có mặt cười |
| 8 | `sparkle.png` | 100 : 100 | Lấp lánh 4 cánh nhọn vàng nhạt, lõi trắng phát sáng (**không** viền trắng cắt bế, chỉ glow) |
| 9 | `sparkleBlue.png` | 100 : 100 | Như #8, xanh băng |
| 10 | `bow.png` | 100 : 100 | Nơ satin hồng 2 cánh phồng có nếp gấp, 2 đuôi rủ cắt chữ V, nút giữa bóng |
| 11 | `flower.png` | 100 : 100 | Hoa 5 cánh hồng phấn, nhuỵ vàng |
| 12 | `crown.png` | 100 : 100 | Vương miện vàng kim 5 chóp, đính hồng ngọc + lam ngọc + ngọc lục bảo |
| 13 | `cloud.png` | 120 : 90 | Đám mây trắng phồng như kẹo bông, mặt cười, má hồng |
| 14 | `mai.png` | 100 : 100 | Hoa mai vàng 5 cánh Tết, nhuỵ cam có chấm |
| 15 | `lixi.png` | 100 : 100 | Bao lì xì đỏ dập vàng, nắp hình vòm viền vàng, **đồng xu vàng** giữa (không chữ) |
| 16 | `lantern.png` | 100 : 120 | Đèn lồng tròn đỏ truyền thống, chóp + đáy vàng, tua rua đỏ, ánh nến vàng bên trong |
| 17 | `moon.png` | 100 : 100 | Trăng rằm vàng tròn có mặt cười, vài vết lõm mờ, quầng sáng nhẹ |
| 18 | `snowflake.png` | 100 : 100 | Bông tuyết 6 nhánh trắng xanh như pha lê |
| 19 | `santaHat.png` | 120 : 100 | Mũ Noel đỏ nhung, viền lông trắng, quả bông trắng ở chóp (chóp gập sang phải) |
| 20 | `tree.png` | 100 : 120 | Cây thông 3 tầng, ngôi sao vàng trên đỉnh, quả châu đỏ/xanh/vàng, gốc nâu |
| 21 | `pumpkin.png` | 120 : 100 | Bí ngô Halloween cam, cuống xanh, mặt cười dễ thương (mắt tam giác, miệng răng cưa) |
| 22 | `bat.png` | 120 : 80 | Dơi tím con dang cánh, mặt tròn dễ thương, tai nhọn |
| 23 | `ghost.png` | 100 : 110 | Ma trắng tròn đuôi lượn sóng, má hồng, miệng chữ O |
| 24 | `sun.png` | 100 : 100 | Mặt trời vàng cam có mặt cười, 12 tia tròn đầu |
| 25 | `watermelon.png` | 100 : 80 | Miếng dưa hấu hình bán nguyệt, vỏ xanh, ruột đỏ, hạt đen |
| 26 | `flagVN.png` | 120 : 90 | Cờ đỏ sao vàng bay phấp phới, cán gỗ bên trái |

**Đợt 1 nên vẽ trước 10 cái:** bunny, duck, cat, bear, heart, starFace, bow, cloud, lixi, lantern.

## 4. Prompt mẫu (đổi phần mô tả theo từng dòng)
```
Cute 3D render sticker, glossy vinyl toy / clay style (Pop Mart, Sanrio 3D), [MÔ TẢ],
big shiny black eyes with two white highlights, soft pink blush, light from top-left,
soft rim light, thick white die-cut sticker border with slight thickness, soft drop shadow
below, pastel vivid colors, transparent background PNG 1024x1024, object centered and
fully inside a 64px empty margin, no text, no background.
```

## 5. Sau khi vẽ xong
1. Bỏ ảnh vào `ve-xong/sticker/` đúng tên file.
2. Báo Claude. Claude sẽ kiểm tra (RGBA, lề, tỉ lệ), chép sang `public/assets/thuytinh/jar-text/` và ghi tên vào `manifest.json`. App tự dùng ảnh mới, không cần sửa gì thêm.
