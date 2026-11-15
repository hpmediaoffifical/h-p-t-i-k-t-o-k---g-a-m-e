# 🎮 Game tải riêng từ HP Action LIVE (Sinh Tồn, HP Đại Chiến…)

Các game này **không** nằm trong bộ cài / bản cập nhật HP Action LIVE. Trong menu 🎮 Game Tương Tác mỗi game có một thẻ:
**Tải về → (Cài đặt game) → Mở game**, và **Cập nhật** khi có bản mới, kèm "Mở bản đang có" để không phải cập nhật giữa buổi LIVE.

| Game | id | Kiểu gói | Manifest | File trên web |
|---|---|---|---|---|
| 🔫 Sinh Tồn | `sinhton` | `exe`: bộ cài Windows | `https://hpvn.media/sinhton/manifest.json` | `HP-Sinh-Ton-Setup-X.Y.Z.exe` |
| ⚔️ HP Đại Chiến | `daichien` | `web`: zip game web | `https://hpvn.media/daichien/manifest.json` | `hp-dai-chien-web-X.Y.Z.zip` |

## App làm gì

- **Chỉ khi có KEY:** app chỉ đọc manifest và tải khi máy có **KEY đã kích hoạt** (token ký RSA, hoặc ân hạn 24 giờ khi mất mạng).
- **Giấu link:** link tải chỉ nằm trong manifest trên hpvn.media. Giao diện chỉ thấy phiên bản, dung lượng và tiến độ.
- **Kiểm file:** tải xong app kiểm **dung lượng + SHA-256**. Sai là xoá file và báo lỗi.
- **Nơi lưu:** file lưu ở `%APPDATA%\hp-action-live\games\<id>\`, chỉ giữ bản mới nhất.
- **Kiểu `exe`:**
  - Bấm "Cài đặt game" thì app kiểm SHA-256 lại một lần rồi chạy bộ cài.
  - App tìm game đã cài trong mục Gỡ cài đặt của Windows, theo `DisplayName`.
  - "Mở game" chạy file exe đã cài.
- **Kiểu `web`:**
  - App tự giải nén bằng `tar.exe` có sẵn của Windows. Gói phải có `index.html` ở gốc và không có liên kết tắt (symlink).
  - App phục vụ game tại `http://127.0.0.1:3000/dl/<id>/index.html`.
  - "Mở game" mở cửa sổ Edge/Chrome dùng GPU, giống Zombie Phá Nhà.
  - Thẻ có nút "Link OBS" (dạng `hpaction.obs`) để dán vào Browser Source. Dùng link **hoặc** cửa sổ game, không dùng cả hai.
- **Kiểm bản mới:** app kiểm sau khi khởi động 8 giây, rồi cứ mỗi 30 phút.

Game tự nối socket.io của app (cổng 3000) để nhận quà kèm tên và avatar người tặng.

- Gói `web` chạy ngay trong app nên có thể gọi thẳng `/api/comment-filter/check` để che tên có từ cấm.
- Cổng khác 3000: tuỳ game, vd HP Đại Chiến nhận `?hp=CỔNG`.

## Mỗi lần phát hành bản game mới

1. **Build gói trong kho game.**
   - Sinh Tồn: build bộ cài `dist\HP-Sinh-Ton-Setup-X.Y.Z.exe`.
   - HP Đại Chiến: chạy `npm run dong-goi-web` → `dist\hp-dai-chien-web-X.Y.Z.zip`.

   Phiên bản lấy từ tên file, nên `version` trong `package.json` của game phải tăng.
2. **Sinh manifest**, chạy trong thư mục HP Action LIVE:

   ```bash
   node tools/game-manifest.js "F:\PHAT TRIEN GAME\Game HP CS 3D\dist\HP-Sinh-Ton-Setup-X.Y.Z.exe" https://hpvn.media/sinhton "Ghi chú bản mới"
   ```

   ```bash
   node tools/game-manifest.js "F:\PHAT TRIEN GAME\HP Dai Chien\dist\hp-dai-chien-web-X.Y.Z.zip" https://hpvn.media/daichien "Ghi chú bản mới"
   ```

   Lệnh ghi `manifest.json` cạnh file game, gồm `version`, `url`, `sha256`, `size`, `notes`.
3. **Tải lên thư mục của game** trên hpvn.media (`sinhton/`, `daichien/`):
   - Tải file game lên **trước**.
   - Tải `manifest.json` lên **sau cùng**. Đưa manifest lên trước thì máy nào tải đúng lúc đó sẽ gặp file thiếu.
4. **Kiểm tra:** mở link manifest trên trình duyệt, xem đúng phiên bản mới. Thẻ có nút ↻ khi chưa đọc được manifest.

Build lại thì **phải sinh lại manifest**, vì SHA-256 đổi theo từng lần build.

### Manifest cho các file hiện có (15/11/2026)

**Sinh Tồn**, bộ cài 1.1.0 build lúc 18:32:

```json
{ "version": "1.1.0", "url": "https://hpvn.media/sinhton/HP-Sinh-Ton-Setup-1.1.0.exe",
  "sha256": "5b517a2d64ef6fc0d2b7d00cf12830f4f7503ecdcc44f1e836b42db4ef716033", "size": 114566783, "notes": "" }
```

**HP Đại Chiến**, gói web 0.1.0 build lúc 18:45:

```json
{ "version": "0.1.0", "url": "https://hpvn.media/daichien/hp-dai-chien-web-0.1.0.zip",
  "sha256": "3d4fc0246bd1cabeee7a181a19c1416b8501c58df5e69ec6a111398b47ddd00a", "size": 13196371, "notes": "" }
```

## Thêm game tải riêng mới

1. **`server.js` → `DL_GAMES_DEF`**, thêm 1 dòng:
   - Kiểu `exe`: `{ id, kind: 'exe', manifestUrl, prefix: 'Tên-Setup-', installName: '<chữ ASCII đầu DisplayName>', exeName: '<Tên>.exe' }`
   - Kiểu `web`: `{ id, kind: 'web', manifestUrl, prefix: 'ten-web-', entry: 'index.html', window?: [rộng, cao] }`
2. **`public/games/gametuongtac/registry.js`**, thêm 1 dòng cùng `id`:
   - Bắt buộc: `download: true`, `name`, `icon`, `desc`, `play`, `note`.
   - Tuỳ chọn: `obs` (link bảng quà riêng của game), `obsSize`.
3. **Kiểm khoá KEY:** muốn khoá theo KEY thì thêm `id` vào CATALOG ở `lib/license-features.js`, đồng thời thêm ở trang quản trị HP KEY.

Đổi nguồn tải mà không sửa mã: ghi `"dlGames": { "<id>": { "manifestUrl": "https://…" } }` vào `app-config.json`.

## Muốn giấu link kỹ hơn (tuỳ chọn)

`manifest.json` là file tĩnh: ai đoán đúng địa chỉ thì vẫn mở được.

- Muốn chặn hẳn: thay bằng trang PHP trên hpvn.media chỉ trả manifest khi kèm KEY hợp lệ, hoặc trả link tải có hạn dùng.
- Muốn chặn liệt kê thư mục: đặt tên thư mục khó đoán.

Phía app chỉ cần đổi `manifestUrl`.

## Thử không cần hpvn.media

1. Dựng máy chủ HTTPS tạm có chứng chỉ tự ký, phục vụ file + `manifest.json`.
2. Ghi `dlGames.<id>.manifestUrl` vào `app-config.json` của thư mục dữ liệu thử.
3. Chạy `node server.js` với `NODE_TLS_REJECT_UNAUTHORIZED=0`. **Chỉ dùng cho bản thử.**

Test tự động: `node --test tests/game-download.test.js`.
