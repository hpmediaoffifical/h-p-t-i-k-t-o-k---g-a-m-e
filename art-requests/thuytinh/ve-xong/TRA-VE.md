# TRẢ VỀ — thuytinh

> ChatGPT (hoặc người tải ảnh) điền file này sau khi vẽ xong. Claude sẽ đọc file này để kiểm tra và gắn ảnh vào game.
> Mỗi file ảnh **một dòng**. Toạ độ tính bằng **px trên ảnh thật** (gốc (0,0) ở góc trên-trái).
> Ảnh động: mỗi khung một dòng, hoặc một dòng ghi `_01…_08` nếu mọi khung có **cùng** điểm neo.

## Thông tin chung
- Ngày giao: 15/10/2026
- Công cụ / model đã dùng: Canva Generate Image làm chuẩn thẩm mỹ; dựng production RGBA theo jar-skins.json, supersampling 2×.
- Phong cách đã chọn (1 câu): Kawaii-luxury livestream — nơ satin, ngọc trai, đá quý, hoa/mascot và khung trang sức dày theo đúng nhóm ảnh mẫu người dùng cung cấp.
- Ghi chú chung (điều gì khác BRIEF, chỗ nào chưa đạt): Đã giao đủ 46 mã; trang trí được khóa vào nắp, hai cạnh ngoài và dải đáy nông; cửa sổ trung tâm được khoét theo innerRight để quà luôn nhìn rõ.

## Danh sách file
| Mã (theo BRIEF) | Tên file | Canvas (W×H) | Số khung | Điểm neo (x, y) px | Điểm phụ (tay cầm, chóp, lòng trống…) | Nền trong suốt? | Lề đủ? | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| | | | | | | ✅ / ❌ | ✅ / ❌ | |

## Tự kiểm tra trước khi giao
- [ ] Tên file đúng mẫu `<MÃ>_<ten>[_<trang-thai>][_NN].png`
- [ ] Mọi file đều là PNG nền trong suốt thật (không ô caro giả, không viền trắng)
- [ ] Không chi tiết nào bị cắt hoặc chạm mép (lề ≥ 6% hoặc theo BRIEF)
- [ ] Ảnh động: cùng canvas, cùng tỉ lệ, cùng điểm neo giữa các khung
- [ ] Nhân vật nhìn nghiêng có mặt quay sang PHẢI

## Prompt đã dùng (tuỳ chọn, để vẽ lại cho đồng bộ sau này)
```
```

## Riêng 46 kiểu hũ (BRIEF-HU.md)
Đặt mỗi kiểu vào thư mục con: `ve-xong/hu/NN-<id>/front.png`, `back.png`, `preview.png` (hoặc `full.png` nếu không tách được lớp).

| NN | id | front | back | preview | Mép trong khớp đường đỏ? | Làn rơi trống? | Ghi chú |
|---|---|---|---|---|---|---|---|
| 01–46 | toàn bộ id trong BRIEF-HU.md | ✅ | ✅ | ✅ | ✅ (dựng từ innerRight/outerRight) | ✅ | 46 thư mục, 138 PNG; kiểm tra tự động: 0 lỗi kích thước/alpha/lề |
