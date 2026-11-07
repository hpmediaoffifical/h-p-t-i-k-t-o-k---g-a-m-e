# Giao diện mới HP Action LIVE (tông sáng, đồng bộ HP NPC LIVE / HP GROUP LIVE)

Ngày: 06/11/2026 · Nhánh: `feature/giao-dien-moi` (cắt từ `tuongtac/nhatu` eba47a9)
Mẫu: `docs/thiet-ke-lai-giao-dien/mau-giao-dien.html` (+ `mau-home.png`, `mau-game.png`, `mau-kit.png`).
Figma: file `NDJu8JJezhOlUiaNEtJrG5` đã tạo nhưng gói Starter hết lượt gọi MCP → mẫu dựng bằng HTML.

## Mục tiêu

Đổi toàn bộ vỏ app (bố cục + màu + chữ + icon) cho chuyên nghiệp, cùng họ với HP NPC LIVE và
HP GROUP LIVE, **không ảnh hưởng game và liên kết game**.

Người dùng đã chốt: tông **sáng** giống HP NPC; Thư viện Game là **sidebar chia nhóm**;
trang chủ = bảng điều khiển LIVE, Khởi động nhanh vẫn giữ (mặc định khuyến nghị).

## Bất biến (không được phá)

1. Mọi đường dẫn `/overlay/*`, `/_prototype/*`, `buildOverlayURL()` giữ nguyên.
2. Overlay OBS nạp `/style.css` (thuytinh, nhatla, body, gift-list, timer) phải **vẽ y hệt cũ**.
3. Mọi `id` mà `app.js` / `games/*/*-panel.js` dùng giữ nguyên (connect, stats, fab, game-list,
   `#view-*`, tiền tố panel `bc-`, `caro-`, `nt-`…). Hàm toàn cục (`hpOpenGame`, `*CopyOverlay`) giữ.
4. Không đổi logic game, config, socket.

## Kiến trúc

### 1. Biến màu "có đường lui" trong `style.css` (chìa khoá an toàn)

Script `tools/ui-tokenize-css.js` thay mỗi màu cứng trong `style.css` bằng
`var(--<loại>-<hex>, <màu cũ>)`, loại theo thuộc tính: `bg` (background*), `fg` (color),
`bd` (border*/outline), `sh` (box-shadow — chỉ màu trong shadow giữ nguyên, không đổi).
Biến **chỉ được khai báo** trong `public/ui/ui-v2.css` dưới `body.ui-v2` — file này chỉ
`index.html` nạp. Overlay không khai báo biến → `var()` rơi về màu cũ → kết quả giống hệt.

Kiểm chứng: lúc tokenize, script tự kiểm `untokenize(kết quả) === bản gốc` (từng byte) rồi mới
ghi file. Test lâu dài `tests/ui-tokenize.test.js`: mọi `var(--bg|fg|bd-<khoá>, V)` trong
`style.css` có `V` đúng là màu mà tên biến mã hoá (fallback = màu cũ) → overlay luôn y cũ dù
`style.css` sửa về sau; script chạy lại trên file đã tokenize thì không đổi gì (idempotent).

Bảng ánh xạ (trong `ui-v2.css`) sinh tự động theo độ sáng + độ bão hoà:
- `bg` tối (L < 0.35, ít bão hoà) → bề mặt sáng (`#FFFFFF`, `#FBF5F4`, `#F8F1EF`, `#F2E8E5` theo bậc).
- `fg` sáng ít bão hoà (chữ xám/trắng trên nền tối) → mực (`#241B1F`, `#54474B`, `#6B5E62`).
  Ngoại lệ: quy tắc có nền màu đậm bão hoà (nút gradient) → giữ chữ trắng (script không thay `fg`
  của rule đó).
- `bd` tối → `#EEE3E0` / `#DFD0CC`.
- Màu nhấn bão hoà (hồng, xanh, vàng…) giữ nguyên, riêng xanh/hồng neon chỉnh đậm hơn để đọc trên nền sáng.

Khung xem trước overlay trong app (sân khấu Hũ `#stage-frame`, ô preview…) reset biến về
`initial` → giữ đúng màu overlay.

### 2. `public/ui/ui-v2.css` — token + vỏ app

- Token như HP NPC (`ui-kit.css`): `--ui-bg #FBF5F4`, `--ui-surface`, `--ui-line`, `--ui-ink`,
  `--ui-brand #FF2D6F→#FF7A45`, trạng thái ok/warn/bad/info, radius 8/12/16, font Be Vietnam Pro
  (font nhúng cục bộ `public/fonts/` nếu có, không thì Segoe UI Variable — app chạy offline).
- Lưới app: `sidebar 248px | main`, hàng `topbar 60px | nội dung | statusbar 30px`.
- Kiểu chung cho mọi game (không sửa HTML từng game): `.game-header` thành thẻ trắng
  (tiêu đề 20/700, `.game-sub` xám, `.overlay-bar` nút secondary 34px, nút copy link nổi bật),
  `.card`, `.card-title`, `.card-tabs`, input/select/textarea, `button.primary|ghost|secondary`,
  bảng, `.hint`, popup/modal, thanh cuộn mảnh.

### 3. Vỏ app trong `index.html`

- **Sidebar**: logo + tên + phiên bản (`#brand-home`), nút tìm kiếm "Tìm game… Ctrl K",
  `#game-list` (render theo nhóm), cuối: `#btn-open-giftboard`, Cài đặt, thẻ bản quyền + footer.
- **Topbar** (mới, `header.topbar`): ô kết nối (`#conn-row`, `#username`, `#username-sugg`,
  `#btn-connect` — chuyển nguyên khối lên đây), `#status-row`, `#live-stats-grid`, khoảng trống,
  hàng nút icon: `#comments-fab`, `#unknown-fab`, `#btn-open-soundfx`, `#quick-launch-fab`,
  `#btn-open-settings` (giữ id + badge, đổi emoji → SVG).
- **Statusbar** (mới, `footer.statusbar`): chấm + chữ trạng thái TikTok (cập nhật trong
  `setStatus`/`setConnectedUI`), máy chủ overlay (`hpaction.obs:<port>`), phiên bản.
- `#sidebar-toggle` giữ (đang ẩn cứng), cho phép thu gọn 72px về sau — ngoài phạm vi.

### 4. Nhóm Thư viện — `public/ui/nav-groups.js` (thuần, có test)

`groupOf(id)` → nhóm; thứ tự nhóm: **Game quà** (thuytinh, caro, trongcay, nhatla, nhietdo,
votecomment, level-quest, timer, pokemon…) · **🎥 Game Camera** (camgames) · **🎮 Game Tương Tác**
(gametuongtac) · **Hiệu ứng & PK** (pktiktok, vipwelcome, leaguecard, obs-effects) ·
**Công cụ** (liveTranslate). Id lạ → "Game quà". `renderGameList()` chèn tiêu đề nhóm + số lượng,
giữ nguyên `.game-item[data-id]`, `[data-game-toggle]`, logic khoá/tạm tắt. Test
`tests/nav-groups.test.js`.

### 5. Bảng lệnh Ctrl K — `public/ui/cmdk.js`

Hộp tìm theo tên game (bỏ dấu), Enter → `hpOpenGame(id)`; mục phụ "Copy link OBS" dùng
`buildOverlayURL(overlayPath)`. Nguồn danh sách: `window.hpGameIndex()` (app.js xuất). Esc đóng.

### 6. Trang chủ

Giữ `#view-home` + iframe `#home-ql-frame` (Khởi động nhanh nguyên chức năng). Thêm phía trên:
lời chào + dải sẵn sàng 3 ô (TikTok / Bản quyền / Game đang bật N) cập nhật từ
`setConnectedUI`, `updateLicenseBadge`, `syncSideToggle`. Trang Khởi động nhanh (`quick-launch.html`)
là trang riêng, đổi màu ở pha sau nếu cần — ngoài phạm vi pha này.

## Xử lý lỗi / rủi ro

- Panel tự chèn CSS/inline màu tối (body, dacau, pokemon, nhiều `style=` trong JS) → kiểm từng
  màn, vá bằng quy tắc trong `ui-v2.css` (phạm vi `body.ui-v2 #view-<id>`), không sửa JS game.
- Muốn quay lại giao diện cũ: bỏ class `ui-v2` trên `<body>` → mọi biến không khai báo → về màu cũ
  (vỏ mới vẫn dùng bố cục mới).

## Kiểm thử

- `npm test` (gồm test tokenize, nav-groups, `overlay-links`, `app-smoke`).
- Chụp headless từng màn `#view-*` trong app trước/sau; chụp overlay `/overlay/thuytinh` trước/sau
  phải giống.
- Kiểm tay: kết nối TikTok, bật/tắt game ở sidebar, copy link OBS, mở game con Camera/Tương Tác.
