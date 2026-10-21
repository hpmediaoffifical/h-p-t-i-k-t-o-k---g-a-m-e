# 🫙 Hũ Thủy Tinh — bố cục mới + 🪄 Sticker AI

Ngày: 21/10/2026.

**User yêu cầu:**
1. Tách phần giao diện hũ và chữ trang trí ra một mục lớn riêng, để sau này mở rộng kiểu hũ, font và kiểu chữ.
2. Làm lại cả trang Hũ cho "khoa học, sang hơn", có chỗ nhập prompt.
3. Dùng kéo thả thay cho nút di chuyển.
4. Sticker AI: người dùng **tự tạo tài khoản OpenAI và tự dán khoá** (không có proxy HP Media).

**Mockup đã duyệt:** `public/_prototype/thuytinh-redesign.html`. Lưu ý: khối "Nguồn AI HP Media / khoá riêng" trong mockup đã bỏ — bản thật chỉ dùng khoá riêng.

## 1. Bố cục

```
[ Mục lớn ] [ Bảng của mục ] [ Xem trước 9:16 + ô prompt AI ] [ Bảng chỉnh lớp | Quà LIVE ]
```

- **Thanh mục lớn** `#tt-nav` gồm: 🎨 Giao diện · ⚙️ Vật lý · ✨ Hiển thị · 🎯 Quà kích hoạt · 🥷 Trộm & CS · 🏷 Badge · 🎬 Thử.
  - Mỗi mục là một `section.tt-sec[data-sec]`.
  - `.tt-body[data-sec]` quyết định cột phải hiện gì.
  - Mục đang mở được nhớ ở `localStorage hp.thuytinh.sec`.
- **Mục 🎨 Giao diện** có 3 mục con (`#tt-look-seg`, nhớ ở `hp.thuytinh.lookSub`):
  - **🫙 Kiểu hũ:** tìm kiểu hũ (gõ không dấu được), lọc, lưới ảnh, chấm màu hũ, chip phụ kiện.
  - **✍️ Chữ & sticker:** bộ mẫu theo dịp, danh sách lớp, nút ＋ Chữ / ＋ Sticker AI.
  - **🪄 AI:** khoá OpenAI, model, chất lượng, thư viện sticker.
- **Cột phải ở mục Giao diện** là bảng chỉnh lớp đang chọn (`#jt-insp`), gồm:
  - nội dung và biến tự điền;
  - 14 ô kiểu chữ, vẽ bằng chính `HpJarText.paint`;
  - sticker quanh chữ;
  - màu và chuyển động;
  - cỡ và xoay;
  - hiện khi / nảy khi có quà.
- **Cột phải ở các mục khác** là Quà nhận từ LIVE và Danh sách quà như cũ.
- **Giữ nguyên mọi id cũ.** Các `<select>` kiểu hũ / màu / phụ kiện vẫn là nơi giữ giá trị thật, chỉ ẩn đi. Lưới ảnh và chip chỉ là lối chọn nhanh, nên phần lưu và nạp cấu hình không đổi.
- **Nút ẩn preview và thanh trong suốt** chuyển xuống thanh trên khung xem trước. Khi preview đang ẩn, khung hiện nút "👁 Hiện để chỉnh giao diện".
- **🔍 Phóng to hũ** (`ttApplyZoom`):
  - Chỉ có tác dụng ở mục Giao diện, chỉ trong app; OBS không đổi.
  - Dùng CSS transform trên `#stage-frame`, canh theo `offset*` của `.jar-glass`. Kéo chữ vẫn đúng chỗ vì engine tính bằng `getBoundingClientRect`.

## 2. Kéo thả

- **Trên hũ:** kéo để đặt chỗ, lăn chuột để đổi cỡ, Shift + lăn để xoay (engine `wireJarTextDrag`). Phím mũi tên để nhích.
- **Danh sách lớp:** kéo hàng ⋮⋮ để đổi lớp trên/dưới.
  - Mảng `jarTexts` xếp từ lớp dưới lên lớp trên; danh sách hiện theo thứ tự ngược lại.
  - `applyJarTexts` sắp lại phần tử DOM khi thứ tự đổi, nên OBS cũng đổi theo.
- **Thư viện / dải ảnh vừa tạo:** kéo thả lên khung xem trước thì gắn ảnh vào đúng chỗ thả (`text/x-hp-ai`).
- **Nút trên mỗi lớp:**
  - 👁 ẩn lớp (`hide`; `paint` đặt `display:none`);
  - ⧉ nhân bản;
  - 🗑 xoá.

## 3. 🪄 Sticker AI — dùng khoá OpenAI của người dùng

**Luồng chạy:**
1. App gọi thẳng OpenAI (`lib/ai-openai.js`).
2. Ảnh trả về lưu ở `<DATA_DIR>/ai-art/<id>.png` cùng `index.json`; tối đa 200 ảnh, thừa thì xoá ảnh cũ.
3. Overlay đọc ảnh qua `/ai-art/` nên vẫn chạy khi mất mạng.
4. Lớp ảnh trên hũ có dạng `{kind:'img', src}`. Chỉ nhận đường dẫn `/ai-art/ai*.png` hoặc `/assets/*.png|webp`.

**Khoá OpenAI:**
- Lưu mã hoá AES-256-GCM, khoá giải mã sinh từ HWID máy, ở `<DATA_DIR>/ai-sticker.json`. File này bị loại khỏi bộ cài.
- Giao diện chỉ thấy 4 ký tự cuối.
- Nút "Lưu & kiểm tra" chạy theo thứ tự:
  1. Kiểm dạng `sk-…`.
  2. Gọi `GET /v1/models/{model}` (không tốn tiền).
  3. Lưu khoá. Nếu khoá đúng nhưng chưa dùng được model hoặc chưa xác minh tổ chức, vẫn lưu và cảnh báo rõ việc cần làm.

**Model** (theo developers.openai.com › Image generation, xem ngày 21/10/2026): cả hai model đều hỗ trợ `background:"transparent"` với `png`.
- `auto` (mặc định): có ảnh thật thì dùng `gpt-image-2.5-sunburst` qua `/images/edits` (multipart `image[]`); chỉ có mô tả thì dùng `gpt-image-2.5-flare` qua `/images/generations`.
- Tên model đổi được trong cài đặt.

**Mẫu câu lệnh:**
- Phong cách nằm trong `STYLE`: chibi, sticker, 3d, anime, pixel. Thêm `RULES`: một chủ thể, viền trắng cắt bế, nền trong suốt, không chữ.
- Kiểu `none` dùng nguyên câu người dùng gõ.

**Ảnh thật:**
- Thu về cạnh dài tối đa 1024px ngay trong trình duyệt trước khi gửi.
- Server chặn ảnh lớn hơn 4 MB.

**Lỗi OpenAI → thông báo tiếng Việt chỉ đúng chỗ cần sửa:**
- Khoá sai: `key_invalid`.
- Hết tiền: `no_credit`.
- Chưa xác minh tổ chức: `org_unverified`.
- Không dùng được model: `model_unavailable`.
- Nội dung bị kiểm duyệt chặn: `moderation_blocked`.

**Route:**
- `GET|POST /api/thuytinh/ai/settings`
- `POST /api/thuytinh/ai/settings/check`
- `POST /api/thuytinh/ai/sticker`
- `GET /api/thuytinh/ai/library`
- `DELETE /api/thuytinh/ai/library/:id`

**Test:** `tests/ai-sticker.test.js`, `tests/ai-openai.test.js`, `tests/thuytinh-jar-text.test.js`.

**Đã bỏ:** proxy `hpvn.media/hpkey/ai.php`. Code viết dở được cất trong repo HP KEY bằng `git stash` với tên "ai-sticker proxy (bỏ 21/10/2026…)", lấy lại được nếu sau này cần.

## 4. Còn để sau

- **🧪 Hũ tự tạo:** AI chỉ "sơn lại" trên 46 dáng hũ có sẵn (gửi `front.webp` kèm mask cho `/images/edits`), giữ nguyên `innerRight` dùng cho vật lý. AI hầu như luôn vẽ kính đục, nên chương trình sẽ hạ alpha phần thân hũ cho trong lại.
- **🔤 Font chữ riêng:** thêm mục con trong Giao diện.
- **Chưa thử:**
  - tạo ảnh bằng khoá OpenAI thật (cần khoá của user);
  - kéo thả file trong Electron thật;
  - đo chi phí thật qua trường `usage`.

## Nguồn

developers.openai.com/api/docs/guides/image-generation · developers.openai.com/api/docs/deprecations · github.com/danielgatis/rembg (giấy phép RMBG) · github.com/imgly/background-removal-js (AGPL)
