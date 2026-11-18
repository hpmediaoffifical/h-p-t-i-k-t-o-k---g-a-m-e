# ⚽ Sút Bóng — đơn đặt vẽ ảnh bìa

Chỉ cần **1 ảnh**: ảnh bìa thẻ game trong 🎥 Game Camera. Phần chơi trên OBS (khung gôn, lưới, bóng, găng, chữ hiệu ứng)
vẽ bằng code (`public/games/sutbong/render.js`), KHÔNG cần ảnh.

Hiện đang dùng ảnh tạm dựng từ chính bộ vẽ của game: `public/games/camgames/thumb/sutbong.webp`.

## SB-1 · Ảnh bìa thẻ game

- **Cỡ giao:** 1080×1920 (dọc 9:16), PNG hoặc WebP. Code tự thu về 270×480 → chi tiết chính phải to, rõ ở cỡ nhỏ.
- **Phong cách:** giống bộ ảnh bìa đang có (`public/games/camgames/thumb/dacau.webp`, `dapmuoi.webp`, `bancung.webp`):
  hoạt hình 3D chibi, ánh sáng sân vận động, hậu cảnh mờ đèn tròn (bokeh), màu tươi, có chiều sâu.
- **Nội dung:** một thủ môn chibi (áo thủ môn cam hoặc xanh ngọc, găng xanh chuối to) đang **bay người đẩy quả bóng** ở góc trên;
  quả bóng đá trắng đen lao tới có vệt sáng phía sau; khung gôn trắng + lưới phía sau lưng nhân vật; cỏ sân có sọc cắt.
  Góc nhìn từ chấm phạt đền (người xem là người sút).
- **Bố cục:** nhân vật chiếm khoảng 60 % chiều cao, đặt giữa; chừa ~12 % phía trên và phía dưới thoáng (thẻ có nhãn chồng lên).
- **Không có:** chữ, logo, số áo, thương hiệu thật, khuôn mặt người thật, đội bóng thật.

## Khi có ảnh

1. Đặt file vào `art-requests/sutbong/ve-xong/sb-1-bia.png`.
2. Đổi sang `public/games/camgames/thumb/sutbong.webp` cỡ 270×480 (giữ tên file — thẻ tự dùng, không sửa code).
