# 🔫 Sinh Tồn — tải riêng từ HP Action LIVE

Game Sinh Tồn **không** nằm trong bộ cài / bản cập nhật HP Action LIVE. Trong app, thẻ **Sinh Tồn** ở menu
🎮 Game Tương Tác có nút **Tải về → Cài đặt game → Mở game**, và **Cập nhật** khi có bản mới.

- App đọc `https://hpvn.media/sinhton/manifest.json` (đổi được bằng `appConfig.sinhton.manifestUrl`).
- Chỉ đọc manifest và tải khi máy có **KEY đã kích hoạt** (token ký RSA, hoặc ân hạn 24 giờ khi mất mạng).
- Link tải chỉ nằm trong manifest trên hpvn.media. Giao diện chỉ thấy phiên bản, dung lượng và tiến độ, không thấy link.
- Tải xong, app kiểm **SHA-256** và dung lượng. Sai một byte là xoá file, báo lỗi.
- Trước khi chạy bộ cài, app kiểm SHA-256 lại một lần nữa.
- Bộ cài lưu ở `%APPDATA%\hp-action-live\sinhton\`, chỉ giữ bản mới nhất.
- App tìm game đã cài trong mục Gỡ cài đặt của Windows (`DisplayName` bắt đầu bằng "HP Sinh T").
- Game cài xong tự nối HP Action LIVE ở `127.0.0.1:3000` để nhận quà kèm tên và avatar người tặng.
- Bảng quà OBS là `http://localhost:8765/overlay-qua.html` (1080 × 600). Đây là máy chủ riêng của game, chỉ chạy khi game đang mở.

## Mỗi lần phát hành bản game mới

1. Build bộ cài trong kho game: `dist\HP-Sinh-Ton-Setup-X.Y.Z.exe`.
   Tên file phải giữ đúng dạng này, và `version` trong `package.json` của game phải tăng.
2. Sinh manifest, chạy trong thư mục HP Action LIVE:

   ```bash
   node tools/sinhton-manifest.js "F:\PHAT TRIEN GAME\Game HP CS 3D\dist\HP-Sinh-Ton-Setup-X.Y.Z.exe" https://hpvn.media/sinhton "Ghi chú ngắn về bản mới"
   ```

   Lệnh này ghi `manifest.json` cạnh bộ cài, có `version`, `url`, `sha256`, `size`, `notes`.
3. Tải lên **cùng một thư mục** trên hpvn.media (vd `public_html/sinhton/`):
   - Tải `HP-Sinh-Ton-Setup-X.Y.Z.exe` lên **trước**.
   - Tải `manifest.json` lên **sau cùng**. Nếu đưa manifest lên trước, máy nào tải đúng lúc đó sẽ gặp file thiếu, kiểm SHA-256 không khớp.
4. Kiểm tra: mở `https://hpvn.media/sinhton/manifest.json` trên trình duyệt, xem đúng phiên bản mới.
   - App đang mở tự kiểm lại mỗi 30 phút, sau khởi động 8 giây.
   - Trên thẻ có nút ↻ khi chưa đọc được manifest.

Bộ cài cũ trên web có thể xoá sau khi đã đưa manifest mới lên.

### Manifest mẫu (bộ cài 1.1.0 hiện có, build 15/11/2026 18:32)

```json
{
  "version": "1.1.0",
  "url": "https://hpvn.media/sinhton/HP-Sinh-Ton-Setup-1.1.0.exe",
  "sha256": "5b517a2d64ef6fc0d2b7d00cf12830f4f7503ecdcc44f1e836b42db4ef716033",
  "size": 114566783,
  "notes": "Bản đầu trong HP Action LIVE"
}
```

Build lại bộ cài thì **phải chạy lại bước 2**, vì SHA-256 đổi theo từng lần build.

## Muốn giấu link kỹ hơn (tuỳ chọn)

`manifest.json` là file tĩnh: ai đoán đúng địa chỉ thì vẫn mở được.

- Muốn chặn hẳn: thay bằng một trang PHP trên hpvn.media chỉ trả manifest khi kèm KEY hợp lệ, hoặc trả link tải có hạn dùng.
- Muốn chặn liệt kê thư mục: đặt tên thư mục khó đoán.

Cả hai cách đều cần sửa phía máy chủ HP KEY và chưa làm ở đây. Phía app chỉ cần đổi `manifestUrl`.

## Thử không cần hpvn.media

1. Dựng máy chủ HTTPS tạm có chứng chỉ tự ký, phục vụ bộ cài + `manifest.json`.
2. Ghi `"sinhton": { "manifestUrl": "https://127.0.0.1:8443/manifest.json" }` vào `app-config.json` của thư mục dữ liệu thử.
3. Chạy `node server.js` với `NODE_TLS_REJECT_UNAUTHORIZED=0`. **Chỉ dùng cho bản thử.**

Test tự động: `node --test tests/sinhton-download.test.js`.
