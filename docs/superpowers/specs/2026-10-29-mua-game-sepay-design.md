# 🛒 Mua mở game trong app — thanh toán tự động qua SePay

> Trạng thái: **bản nháp chờ duyệt** · 29/10/2026 · Phạm vi 2 repo: **HP KEY** (server PHP + SDK client) và **HP Action LIVE** (app).
> Tham khảo giao diện: cửa sổ "Thanh toán hiệu ứng" (QR VietQR + số tiền + nội dung + "Đang chờ xác nhận thanh toán…").

## 0. Đã chốt (29/10/2026)

| # | Quyết định |
|---|---|
| 1 | **Mỗi game một giá**, như nhau cho mọi KEY. |
| 2 | Mua = **sở hữu trọn đời theo KEY** (tài khoản). Game đã mua lưu riêng ở bảng `key_games`, không phụ thuộc hạn KEY: KEY hết hạn thì app **vẫn chạy với các game đã mua** (§4.9). |
| 3 | Khách tự mua trong app = **bán trực tiếp**, tiền về HP, CTV không có phần. |
| 4 | (Claude chọn) **Thư viện gọn**: game đã có ở trên; game chưa mở gom vào nhóm **🛒 Mở thêm game** thu gọn ở cuối danh sách. Trong **game mẹ** (🎥 Game Camera, 🧍 Bộ Tách Người) game con chưa mở hiện ngay trong lưới với 🔒 + giá. KEY "Tất cả" không thấy cửa hàng. Không thêm tuỳ chọn theo từng KEY — game nào admin ẩn/tạm tắt thì ẩn/tạm tắt cho mọi KEY như hiện nay. |
| 5 | Ngân hàng **ACB**: dùng **tài khoản đứng tên đơn vị đang xuất bán** — công ty thì tài khoản công ty; hộ kinh doanh thì tài khoản đứng tên chủ hộ, mở đúng tên trên giấy đăng ký hộ (bắt buộc từ 01/03/2026) và đã khai báo với cơ quan thuế. Không dùng tài khoản cá nhân chi tiêu hằng ngày. Hoá đơn điện tử cho từng đơn: hỏi kế toán (ngoài phạm vi phần mềm). |
| 6 | Gỡ hẳn **🎬 Hiệu ứng OBS**; phần **Kết nối OBS WebSocket** chuyển sang ⚙ Cài đặt, các game dùng OBS (Game Camera…) không đổi gì (§12). |

## 1. Mục tiêu

- KEY đang bị khoá một game (danh sách tính năng `ft` không có game đó) → bấm **Mua** ngay trong app → hiện QR chuyển khoản.
- Khách chuyển khoản → SePay báo về server HP KEY → server **tự thêm game vào KEY** → app **tự mở khoá trong vài giây**, không cần liên hệ HP Media, không cần mở lại app.
- Nội dung chuyển khoản là **mã đơn do server tự tạo** (vd `HPG7K2M9QXA`).
- Mọi giao dịch ghi vào sổ bán hàng sẵn có (`sales`) → báo cáo doanh thu và Telegram dùng chung.

**Ngoài phạm vi (làm sau nếu cần):** gia hạn KEY trong app, bán hiệu ứng lẻ (chi tiết hơn mức game), mua KEY mới khi chưa có KEY, hoàn tiền tự động, hoá đơn VAT, chia tiền cho CTV.

## 2. Trải nghiệm người mua

1. Thư viện Game / Khởi động nhanh / Game Camera: game đang bán hiện **🔒 + giá** (vd `Mua 50.000đ`).
2. Bấm → cửa sổ thanh toán (bố cục như ảnh tham khảo):
   - Trái: QR trên nền trắng, chú thích "Quét bằng ứng dụng ngân hàng".
   - Phải: Game · Số tiền · Ngân hàng · Chủ tài khoản · Số tài khoản `[Sao chép]` · Nội dung `[Sao chép]`.
   - Nhắc: "Chuyển đúng số tiền và giữ nguyên nội dung. Game tự mở khi nhận được tiền."
   - Dòng trạng thái + nút **Tôi đã chuyển khoản · Kiểm tra**.
3. Trạng thái hiển thị:

| Trạng thái | Hiện gì |
|---|---|
| `pending` | ⏳ Đang chờ thanh toán… |
| `partial` | ⚠ Đã nhận 30.000đ — còn thiếu 20.000đ. Chuyển thêm với **cùng nội dung**. |
| `paid` | ✅ Đã mở khoá **Hũ Thủy Tinh** + nút **Mở game ngay** (bật game + mở trang game) |
| `expired` | Đơn đã hết hạn — tạo đơn mới (nếu tiền vẫn tới sau đó, game vẫn được mở — xem §4.5) |
| lỗi mạng / shop tắt | Thông báo + nút Thử lại |

4. Đóng cửa sổ giữa chừng vẫn được: khi tiền tới, app vẫn tự mở khoá (≤ 60 giây nhờ watcher) và hiện toast "✅ Đã mở khoá …".

## 3. Kiến trúc

```
 App (Electron/Node)                 hpvn.media/hpkey (PHP)                  SePay            Ngân hàng
 ───────────────────                 ──────────────────────                  ─────            ─────────
 [Mua] ── order_create ────────────▶ shop.php: tạo shop_orders (HPGxxxxxxxx)
       ◀── code, số tiền, QR ───────
 hiện QR ─────────────────────────────────────────── khách quét & chuyển khoản ─────────────▶ 💰
                                                                             ◀── biến động số dư
                                     sepay.php ◀── POST webhook (Apikey) ────
                                       ├ lưu bank_tx (chống trùng theo id)
                                       ├ khớp mã đơn + cộng tiền
                                       └ đủ tiền → thêm game vào license_keys.features
                                                 + ghi sales (kind=unlock) + Telegram
 poll order_status (4s) ───────────▶ shop.php ── status=paid
 verify ngay (token mới có ft) ────▶ api.php (sẵn có)
 applyLicenseLocks → socket license:features → giao diện mở khoá
```

Nguyên tắc: **app không bao giờ tự báo "đã trả"**. Chỉ 3 đường được đổi đơn sang `paid`: webhook SePay có khoá, đối soát qua API SePay (server tự gọi), admin bấm tay.

## 4. Server HP KEY

### 4.1 File mới — tách khỏi `api.php`

| File | Vai trò |
|---|---|
| `server/lib/shop.php` | Hàm thuần + truy vấn: tạo mã, khớp nội dung, cộng tiền, mở khoá, đối soát SePay. |
| `server/shop.php` | Endpoint cho app (ký HMAC như `songs.php`): `shop_items`, `order_create`, `order_status`. |
| `server/sepay.php` | Endpoint webhook công khai cho SePay (khoá `Apikey`, không HMAC). |

- `config.php` **không** require `lib/shop.php` → lỗi trong phần bán hàng không thể làm hỏng `api.php` (kích hoạt/verify KEY). `shop.php`, `sepay.php`, `admin-core/boot.php` tự require `lib/shop.php` + `lib/vietqr.php`.
- Theo khuôn `songs.php`: chỉ POST, giới hạn `CONTENT_LENGTH`, whitelist action, `try/catch` → bảng chưa có thì 503 `shop_not_ready`, lỗi khác `error_log` + 500 `server_error`. PHP 7.2: không `fn()`, `match`, `??=`.
- `.htaccess`: cPanel/CGI hay nuốt header `Authorization` → thêm `SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1`; `sepay.php` đọc lần lượt `HTTP_AUTHORIZATION`, `REDIRECT_HTTP_AUTHORIZATION`, `getallheaders()`.

### 4.2 Dữ liệu — migration v11 (`lib/schema.php`, `HPKEY_SCHEMA_VERSION` 10 → 11)

```sql
CREATE TABLE IF NOT EXISTS shop_items (          -- giá bán từng game
  product_id INT UNSIGNED NOT NULL,
  feature    VARCHAR(40)  NOT NULL,              -- id trong products.features (vd thuytinh)
  price      BIGINT UNSIGNED NOT NULL DEFAULT 0, -- VND; 0 = không bán
  updated_at DATETIME NULL,
  PRIMARY KEY (product_id, feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shop_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(16) NOT NULL UNIQUE,        -- HPG + 8 ký tự
  product_id INT UNSIGNED NOT NULL,
  key_id     INT UNSIGNED NOT NULL,
  key_code   VARCHAR(64) NOT NULL,
  hwid       CHAR(64) NOT NULL,
  feature    VARCHAR(40) NOT NULL,
  amount     BIGINT UNSIGNED NOT NULL,           -- giá chốt lúc tạo đơn
  received   BIGINT UNSIGNED NOT NULL DEFAULT 0, -- tổng tiền đã khớp
  status     VARCHAR(10) NOT NULL DEFAULT 'pending', -- pending|partial|paid|expired|cancelled
  flags      VARCHAR(32) NOT NULL DEFAULT '',    -- over,dup,manual,late
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,                  -- created + 7 ngày
  paid_at    DATETIME NULL,
  sale_id    INT UNSIGNED NULL,
  note       VARCHAR(255) NULL,
  KEY k_key (key_id, status), KEY k_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS key_games (           -- game KEY SỞ HỮU TRỌN ĐỜI (mua trong app / admin tặng)
  key_id     INT UNSIGNED NOT NULL,
  feature    VARCHAR(40)  NOT NULL,
  src        VARCHAR(8)   NOT NULL,              -- shop|admin
  order_id   INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (key_id, feature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bank_tx (             -- mọi giao dịch tiền vào SePay gửi tới
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sepay_id    BIGINT UNSIGNED NOT NULL UNIQUE,   -- chống trùng (webhook gửi lại / đối soát)
  src         VARCHAR(8)  NOT NULL,              -- webhook|api|manual
  tx_time     DATETIME NULL,
  gateway     VARCHAR(32) NULL,
  account     VARCHAR(32) NULL,
  amount      BIGINT UNSIGNED NOT NULL,
  content     VARCHAR(255) NULL,
  code        VARCHAR(32) NULL,
  reference   VARCHAR(64) NULL,
  order_id    INT UNSIGNED NULL,
  state       VARCHAR(10) NOT NULL,              -- matched|unmatched|ignored
  received_at DATETIME NOT NULL,
  raw         TEXT NULL,
  KEY k_order (order_id), KEY k_state (state, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Giờ lấy theo PHP (Asia/Ho_Chi_Minh) như phần còn lại của server — MySQL có thể chạy UTC.
- `sales.kind` thêm `unlock` (6 ký tự, vừa `VARCHAR(8)`); `HPKEY_SALE_KINDS` thêm `unlock`; báo cáo đếm thêm `n_unlock`.
- Cài đặt trong `biz_settings` (không dùng `hpkey_meta` vì `v` chỉ 190 ký tự):

| Khoá | Ý nghĩa |
|---|---|
| `shop_on` | `1` = bật bán trong app (mặc định `0`) |
| `shop_prefix` | Tiền tố mã đơn, mặc định `HPG` — **phải trùng mẫu mã thanh toán trên SePay** |
| `sepay_key` | API Key webhook (admin bấm tạo ngẫu nhiên rồi dán sang SePay) |
| `sepay_token` | API Token SePay (tuỳ chọn) — dùng để đối soát khi webhook lỡ |
| `sepay_last_id`, `sepay_last_sync` | Mốc đối soát |
| `bank_bin`, `bank_acct`, `bank_holder` | **Dùng lại** tài khoản nhận tiền đã có ở Cài đặt › Bán hàng |

### 4.3 Mã đơn

- Dạng `HPG` + **8 ký tự** từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (bỏ `0 O 1 I L` cho khỏi gõ nhầm) → 31⁸ ≈ 850 tỷ mã; sinh bằng `random_int`; trùng `UNIQUE` thì sinh lại.
- Nội dung chuyển khoản = **đúng mã đơn**, 11 ký tự, không dấu (VietQR cho tối đa 25).
- Khác hẳn tiền tố gia hạn `GH <key>` đang dùng → không lẫn.

### 4.4 `shop.php` — 3 action cho app

Xác thực: `hpkey_auth_request` (HMAC theo game, ±120 s) **rồi** kiểm KEY + HWID như `hpkey_song_machine`: KEY thuộc game, không `blocked`, chưa hết hạn, có `activations (key_id, hwid)` đang `active`. Sai → 403 `not_activated` / `key_expired` / `key_blocked` (mã sẵn có).

Mọi request: `{action, p, ts, sig, key, hwid, …}` (trường thêm ở cấp trên cùng tự được ký).

**`shop_items`** → danh sách game KEY này mua được.
```json
{ "ok": true, "on": true,
  "items": [ { "id": "thuytinh", "name": "Hũ Thủy Tinh", "price": 50000 } ],
  "open":  [ { "code": "HPG7K2M9QXA", "feature": "thuytinh", "status": "pending" } ] }
```
Một game **bán được** khi: `shop_on=1` · có trong catalog `products.features` · `price > 0` · trạng thái game không `off`/`hidden` (`admin` chỉ KEY thử nghiệm) · KEY **chưa dùng được** game đó (không có trong `key_games`, và — khi KEY còn hạn — không có trong `features` của KEY). KEY "Tất cả" còn hạn → `items: []`. KEY hết hạn → bán mọi game chưa sở hữu. Trả thêm `owned: [id…]` (game sở hữu trọn đời) để app hiện nhãn ♾.

**`order_create {feature}`**
- Kiểm game bán được → nếu không: `not_for_sale` / `already_owned` / `shop_off`.
- Chống spam: ≤ 6 đơn mới / 10 phút / KEY, ≤ 5 đơn đang mở / KEY → `too_many_orders` (đếm thẳng trong `shop_orders`, không cần bảng mới).
- **Dùng lại** đơn `pending`/`partial` cùng KEY + game nếu `amount` = giá hiện tại; giá đã đổi thì tạo đơn mới (đơn cũ vẫn khớp được tới hạn).
```json
{ "ok": true,
  "order": { "code": "HPG7K2M9QXA", "feature": "thuytinh", "name": "Hũ Thủy Tinh",
             "amount": 50000, "received": 0, "status": "pending",
             "created": 1761700000, "expires": 1762304800 },
  "pay":   { "bank": "Sacombank", "bin": "970403", "acct": "0123456789", "holder": "NGUYEN VAN A",
             "content": "HPG7K2M9QXA",
             "qr": ["111111101…", "…"] } }
```
`pay.qr` = các hàng `"0101…"` từ `hpkey_qr_matrix(hpkey_vietqr_payload(bin, acct, amount, code))` — app tự vẽ lên canvas (không nhận SVG/HTML từ server, khỏi chèn HTML). Chưa nhập tài khoản ngân hàng → `shop_off`.

**`order_status {code, check?}`**
- KEY phải là chủ đơn, không thì `order_not_found`.
- `check: 1` (nút "Kiểm tra") và đơn chưa `paid` và có `sepay_token` → **đối soát ngay** (§4.6), tối thiểu 20 s/lần trên toàn server.
- Trả `{ ok, order: {…như trên} }`.

Mã lỗi mới (thêm vào `ERR_VI` của SDK + `docs/api-contract.md`): `shop_off`, `shop_not_ready`, `not_for_sale`, `already_owned`, `too_many_orders`, `order_not_found`, `server_error`. Đều là lỗi **mềm** — không bao giờ đóng app.

### 4.5 `sepay.php` — webhook

Payload SePay (POST JSON): `id, gateway, transactionDate, accountNumber, subAccount, code, content, transferType, transferAmount, accumulated, referenceCode, description`.

```
1. Header Authorization ≠ "Apikey <sepay_key>" (hash_equals)  → 401 (SePay tự gửi lại)
2. transferType ≠ "in"  hoặc  accountNumber ≠ bank_acct        → lưu state=ignored, 200 {"success":true}
3. INSERT IGNORE bank_tx (sepay_id = id)
   → 0 dòng (đã xử lý rồi)                                     → 200 {"success":true}, KHÔNG làm lại
4. Tìm mã:  code (khác null) || tìm trong content rồi description:
     upper → /HPG[A-Z0-9]{8}/ ; không thấy → bỏ ký tự ngoài A-Z0-9 rồi tìm lại
5. BEGIN
   SELECT shop_orders WHERE code=? FOR UPDATE
   - không có / đơn cancelled                → tx.state=unmatched (đơn cancelled: flag cần hoàn tiền)
   - có: received += amount; tx.order_id, tx.state=matched
       · đơn đã paid                         → flags+=dup (trả 2 lần → báo Telegram để hoàn)
       · received ≥ amount                   → MỞ KHOÁ (dưới đây); dư → flags+=over; hết hạn rồi mới tới → flags+=late
       · received < amount                   → status=partial
   COMMIT
6. Sau COMMIT: hpkey_log('shop.unlock' | 'shop.partial' | 'shop.unmatched'), Telegram
7. 200 {"success":true}          (lỗi DB → 500 để SePay gửi lại: tối đa 7 lần trong ~5 giờ)
```

**Mở khoá** (trong cùng transaction, theo khuôn `hpkey_key_renew`):
- `SELECT … FROM license_keys WHERE id=? FOR UPDATE`.
- `INSERT IGNORE key_games (key_id, feature, src='shop', order_id, created_at)` — 0 dòng (đã sở hữu) → `flags+=dup`.
- **Không** sửa `license_keys.features` (danh sách admin cấp theo gói, có thể hết hạn) — sở hữu trọn đời nằm riêng ở `key_games`; không đụng `hide_locked`, hạn KEY, thiết bị.
- `hpkey_sale_insert`: `kind=unlock`, `key_id/key_code/product_id/customer_id`, `list_price=amount`, `amount=received`, `revenue=received`, `paid=1`, `paid_at`, `actor='sepay'`, `note='Mở <tên game> · <mã đơn>'`, `agency=NULL` (bán trực tiếp).
- `shop_orders`: `status=paid`, `paid_at`, `sale_id`.
- Game mua được **sở hữu trọn đời theo KEY** (§4.9). Admin tạm tắt / ẩn game đó thì KEY cũng bị ảnh hưởng như mọi KEY (cơ chế `feature_state` sẵn có), bật lại là dùng tiếp.

Chạy đồng bộ (vài truy vấn, ≪ 30 s giới hạn của SePay).

### 4.6 Đối soát khi webhook lỡ

- `hpkey_shop_sync()`: `GET https://my.sepay.vn/userapi/transactions/list?account_number=<acct>&since_id=<sepay_last_id+1>&limit=200`, header `Authorization: Bearer <sepay_token>`. Mỗi giao dịch có `amount_in > 0` đi qua **đúng bước 3–6 ở trên** (`src=api`) → chống trùng bằng `sepay_id`.
- Gọi từ: nút "Kiểm tra" (`order_status check:1`), nút "Đồng bộ SePay" trong admin, `cron.php` hằng ngày.
- Giãn cách ≥ 20 s/lần (`sepay_last_sync`); SePay giới hạn 3 lần/giây, gặp 429 thì đọc header `x-sepay-userapi-retry-after` rồi bỏ lượt.
- `cron.php` hằng ngày thêm: đối soát 1 lượt · đơn `pending`/`partial` quá 7 ngày → `expired` · gửi Telegram tóm tắt tiền vào chưa khớp trong ngày.
- Không có `sepay_token` thì mọi thứ vẫn chạy bằng webhook — đối soát chỉ là lưới an toàn.

### 4.7 Trang quản trị

- **Cài đặt › Bán hàng › "Bán trong app (SePay)"**:
  - Bật/tắt bán.
  - Tiền tố mã (`HPG`).
  - URL webhook để sao chép: `https://hpvn.media/hpkey/sepay.php`.
  - API Key webhook (nút **Tạo khoá**).
  - API Token SePay (ô mật, tuỳ chọn).
  - Mốc đối soát gần nhất + nút **Đồng bộ SePay**.
  - Hướng dẫn cấu hình ngắn (§7).
- **Cài đặt › Game › tiktok-game**: thêm cột **Giá bán** cạnh từng tính năng trong catalog (trống/0 = không bán), lưu vào `shop_items`.
- **Tab mới "Đơn hàng"**:
  - Danh sách đơn: mã, giờ, KEY, khách, game, số tiền, đã nhận, trạng thái, cờ; lọc theo trạng thái.
  - Thao tác: **Mở tay** (`flags+=manual`, chạy đúng hàm mở khoá, ghi `actor` = admin), **Huỷ**.
  - Khung **Tiền vào chưa khớp**: các dòng `bank_tx` có `state=unmatched`, kèm nút **Gán vào đơn…** (nhập mã) và **Bỏ qua**.
  - Mọi thao tác ghi `audit()`.
- Quyền: chỉ Admin; CTV không thấy tab này.

### 4.8 Telegram

Thêm loại cảnh báo `shop` (bật/tắt `alert_shop` trong Cài đặt › Cảnh báo Telegram), gửi qua `hpkey_alert`:
- 💰 `HPG7K2M9QXA` · KEY `…AB12` (Tên khách) mua **Hũ Thủy Tinh** 50.000đ
- ⚠ Trả thiếu / trả dư / trả 2 lần / trả vào đơn đã huỷ → cần xử lý
- ❓ Tiền vào không khớp đơn: 50.000đ · "nội dung…"

Tin tóm tắt hằng ngày có sẵn: cộng thêm số đơn mở game.

### 4.9 Sở hữu trọn đời trong `api.php` (activate / verify / heartbeat)

Hàm mới `hpkey_owned_games(PDO, key_id): array` (bảng chưa có → `[]`, không bao giờ ném lỗi — `api.php` không migrate).

| KEY | `ft` ký vào token | `exp` |
|---|---|---|
| Còn hạn, `features = NULL` (Tất cả) | không có `ft` (y như cũ) | hạn KEY |
| Còn hạn, có danh sách | `features ∪ owned` → rồi trừ mục bị khoá theo `feature_state` như cũ | hạn KEY |
| **Hết hạn, có game đã mua** | chỉ `owned` (trừ mục bị khoá) | `0` + trường mới `bx` = hạn gói cũ (unix) |
| Hết hạn, không mua gì | `key_expired` như cũ | — |

- `hide_locked` tính trên danh sách đã gộp → game đã mua không bao giờ bị ẩn.
- Trường token mới (chỉ **thêm**, không đổi `v`): `own` = danh sách game sở hữu trọn đời (app hiện ♾), `bx` = gói đã hết hạn (app hiện "Gói hết hạn — vẫn dùng N game đã mua"). App cũ bỏ qua 2 trường này, vẫn chạy đúng với `ft`.
- KEY `blocked` / thiết bị bị thu hồi: chặn như cũ, kể cả khi có game đã mua.
- Admin: ngăn kéo KEY thêm khung **♾ Game đã mua** (danh sách `key_games` + đơn gốc), có **Tặng game** (`src=admin`) và **Gỡ** (ghi `audit`).
- Test API (`tools/dev/test-api-features.php` + `fake-api-db.php`) thêm 4 ca ở bảng trên.

## 5. SDK client 2.2.0 (repo HP KEY `client/hpkey/`)

File lõi **chỉ sửa trong repo HP KEY** rồi `tools/sync-client.ps1 -App "<HP Action LIVE>" -Adapter action-live`.

- `core.apiCall(action, extra, opts)`: thêm `opts.url`; mặc định vẫn `cfg.API_URL`. Thêm `cfg.SHOP_URL` suy ra từ `API_URL` (`api.php` → `shop.php`), app có thể đè trong `config.js`.
- `index.js`: `shopItems()`, `orderCreate(feature)`, `orderStatus(code, {check})` — tự lấy `key` + `hwid` từ `getStatus()`, trả `{ok, …}` hoặc `{ok:false, error, message: errVi(code)}`.
- `index.verify()` dùng cho "kiểm lại ngay" sau khi đơn `paid`.
- `ERR_VI` thêm các mã ở §4.4; `HARD_CODES` **không** đổi.
- Adapter `action-live.validate.js` export thêm `shopItems`, `orderCreate`, `orderStatus`.
- Test: `client/test/*.test.js` (transport giả) cho 3 hàm mới; `tools/dev/test-contract.php` quét thêm `shop.php`.

## 6. App HP Action LIVE

### 6.0 Danh mục bán theo game mẹ / game con

Mỗi dòng dưới đây là **một món bán một giá**. Game mẹ không bán — mở khi KEY có ít nhất 1 game con.

```
Menu chính (game đơn)          thuytinh caro pktiktok vipwelcome votecomment nhietdo trongcay nhatla timer
Công cụ                        liveTranslate (gồm Phụ đề giọng Creator)
🎥 Game Camera  (game mẹ)
 ├ touchplay chemtraicay dapmuoi bancung level-quest
 ├ dacau                                    ← MỚI vào danh mục (trước đây luôn mở)
 └ 🧍 Bộ Tách Người  (game mẹ cấp 2, id body — không bán)
    ├ body-roiho body-biduoi body-cry body-heart body-catch
    ├ body-vf-<kiểu>  ×9  portal blast abduct knock crush mario pickle ninja batu
    └ body-mo-<kiểu>  ×14 ice pixel zap vacuum bees slap fly ghost clone melt balloon lipo phone anime
Luôn mở (không bán)            giftboard (Bảng Quà Tổng), 🎵 Âm thanh
GỠ                             obs-effects (§12)
```

- Tổng **44 món** = 9 game đơn + Dịch Thuật LIVE + 6 game camera + 28 hiệu ứng tách người. Danh mục dán vào HP KEY › Cài đặt › Game giữ đúng id ở trên; `hpkey/README.md` cập nhật lại khối danh mục.
- `lib/license-features.js`: `CATALOG` có thêm trường `parent` (`camgames` / `body`); hàm `parentOf`, `childrenOf`; `can(hub)` = có ít nhất 1 con dùng được (đệ quy: `body` mở khi có 1 `body-*`, `camgames` mở khi có 1 con kể cả qua `body`). Thay `CAM_CHILDREN` cứng 5 id bằng suy từ `parent`.
- **Khoá từng hiệu ứng tách người theo LOẠI + KIỂU**, không theo id kịch bản (người dùng nhân bản/sửa kịch bản được): `bodySaleId(kind, script)` → `body-<kind>` hoặc `body-vf-<motion>` / `body-mo-<style>`. Chặn ở `lib/body-server.js` (`handleGift` bỏ hành động có `bodySaleId` bị khoá, `/api/body/test` trả 403 `feature_locked`); panel hiện ô 🔒 + giá, menu "＋ Thêm" và ô chọn kiểu đánh dấu 🔒 kiểu chưa mở.
- KEY cũ đang có danh sách tính năng: từ bản app mới, Đá Cầu và các hiệu ứng tách người thành 🔒 (mua được) — trước đây chúng nằm ngoài danh mục nên luôn mở. KEY "Tất cả" không đổi. Muốn tặng cho khách cũ thì admin dùng **Tặng game** (§4.9).
- Phiên game theo quà (`camgames-session`) và gán quà: bỏ qua game/hiệu ứng bị khoá như hiện nay (`featureOn`) — mở rộng cho `dacau` và `body-*`.

### 6.1 Cho game đang bán hiện ra

Từ v8, KEY có danh sách tính năng bị server ký `gs: hidden` cho **mọi** game ngoài danh sách (`hide_locked`) → hiện nay khách không thấy game mình chưa có. Cách xử lý, **không đổi token, không ảnh hưởng app bản cũ**:

- `appConfig.license.shop = { on, items: [{id, name, price}], at }`: lấy bằng `shopItems()` lúc khởi động, sau `activate`/`status`, khi watcher thấy `ft`/`gs` đổi, và 10 phút/lần.
- `lib/license-features.js`: `stateOf(features, gs, id, sellable)` — đang `hidden` hoặc `locked` mà id nằm trong `sellable` → trả `locked`. Game bị admin ẩn/tạm tắt không bao giờ có trong `items` (server đã lọc) nên vẫn ẩn/⏸ như cũ.
- `/api/license/features` và `/api/games` trả thêm `price` cho từng game bán được.

### 6.2 Route Node + bộ hỏi trạng thái

Namespace riêng `/api/shop/*` (tránh `/api/games/:id/*`). Chỉ nhận request từ máy chạy app — áp cùng kiểm tra LAN tin cậy như `/api/license/status`.

| Route | Việc |
|---|---|
| `GET /api/shop/items` | Danh sách bán (cache `appConfig.license.shop`) |
| `POST /api/shop/orders {feature}` | `orderCreate` → trả order + pay; thêm vào `appConfig.shopPending` |
| `GET /api/shop/orders/:code` | Trạng thái đang giữ trong Node |
| `POST /api/shop/orders/:code/check` | `orderStatus(code, {check:1})` — tối đa 1 lần / 10 s |

**Bộ hỏi trạng thái** (một vòng duy nhất trong Node, không để trình duyệt gọi server ngoài):
- Đơn vừa tạo/đang mở cửa sổ: 4 s/lần trong 10 phút đầu → 15 s/lần tới phút 30 → dừng. Từ đó watcher 60 s vẫn bắt được game mở.
- Mỗi lần có thay đổi → `io.emit('shop:order', {code, feature, status, amount, received})`.
- Gặp `paid`:
  1. Gọi `licenseRecheckNow('shop')` — tách ra từ thân `GET /api/license/status`: `validateLicenseKey` → ghi `appConfig.license` → `applyLicenseLocks` → phát `license:features`. Giao diện tự tải lại như hiện nay.
  2. `io.emit('shop:order', {…, status:'paid', unlocked:true})`.
  3. Xoá đơn khỏi `shopPending`.
- Khởi động app: đơn còn trong `shopPending` (< 7 ngày) được hỏi 1 lần, sau đó đi theo nhịp watcher.

### 6.3 Cửa sổ thanh toán

- `#shop-modal` trong `public/index.html`, CSS prefix `.shop-*` trong `public/style.css`, logic `public/shop-modal.js` (nạp sau `app.js`), mở bằng `window.hpBuyGame(id)`.
- QR: vẽ `pay.qr` lên `<canvas>` (mỗi ô vuông đen/trắng, viền trắng 4 ô) — không cần thêm thư viện QR.
- Sao chép: `window.hpCopyText` có sẵn. Số tiền dạng `50.000đ`.
- Nghe socket `shop:order` cho đơn đang hiện. Nút "Kiểm tra" gọi `/check`, khoá nút 10 s.
- `paid` → ✅ + **Mở game ngay**: gọi `POST /api/games/:id/config {enabled:true}` rồi `openGame(id)`.
- Đóng cửa sổ khi đơn chưa xong: vẫn theo dõi ngầm; tới `paid` thì toast "✅ Đã mở khoá …".
- Logic thuần (định dạng tiền, trạng thái → chữ, lịch hỏi) để trong `public/lib/shop-ui.mjs` để test bằng `node --test`.

### 6.4 Điểm vào

| Chỗ | Hiện tại | Sau |
|---|---|---|
| Thư viện Game (`renderGameList`, `openGame` → `showLicenseLocked`) | Game chưa có bị ẩn (hide_locked) hoặc mờ + hộp "liên hệ HP Media" | Game đã có ở trên như cũ. Game bán được gom vào nhóm **🛒 Mở thêm game (N)** thu gọn ở cuối (nhớ trạng thái mở/thu trong localStorage); mỗi dòng: icon + tên + giá, bấm → `hpBuyGame`. 🎥 Game Camera chưa có con nào → nằm trong nhóm này với nhãn "từ 30.000đ" (giá thấp nhất của con), bấm mở trang Game Camera để chọn game con. Game không bán: giữ như cũ |
| Khởi động nhanh (`fireAction`) | Toast 🔒 | Game bán được: gửi `hp-ql:buy` lên cửa sổ cha → `hpBuyGame` |
| Game Camera (`camgames-panel.js` `renderGrid`) | Nhãn "🔒 KEY CHƯA MỞ" + ⚙ | Thêm nút **Mua** cạnh nhãn |

Mua 1 game camera bất kỳ là khung 🎥 Game Camera tự mở (luật `camgames` sẵn có).

## 7. Cấu hình SePay (làm 1 lần)

1. Liên kết **tài khoản nhận tiền** (đúng `bank_acct` ở Cài đặt › Bán hàng). Nên dùng **tài khoản riêng cho bán hàng** — server lưu mọi giao dịch tiền vào của tài khoản này. Kiểm ngân hàng đó SePay đọc qua API trực tiếp (gần như tức thì) hay qua SMS/email (chậm hơn).
2. Công ty › Cấu hình chung › **Cấu trúc mã thanh toán**: bật nhận diện, thêm mẫu tiền tố `HPG`, độ dài hậu tố **8–8**, kiểu **Số và chữ**.
3. Tạo **webhook**:
   - Sự kiện: tiền vào.
   - Tài khoản: tài khoản ở bước 1.
   - URL: `https://hpvn.media/hpkey/sepay.php`.
   - Xác thực: **API Key** (dán khoá tạo ở admin).
   - "Chỉ gửi khi có mã thanh toán": **Không**, để admin thấy cả khoản khách gõ sai nội dung.
4. (Tuỳ chọn) Tạo **API Token** → dán vào admin để bật đối soát.
5. Thử ở **Test mode** của SePay (giả lập giao dịch) trước khi bật Live.

## 8. An toàn & các ca lệch

| Ca | Xử lý |
|---|---|
| Webhook giả | Phải có `Apikey` đúng; có thể bật thêm danh sách IP của SePay (mặc định tắt — hosting có thể đứng sau proxy) |
| Webhook gửi lại / đối soát trùng | `bank_tx.sepay_id UNIQUE` + `INSERT IGNORE` → chỉ xử lý 1 lần |
| 2 webhook cùng lúc cho 1 đơn | `SELECT … FOR UPDATE` trên đơn và KEY |
| Khách gõ sai / thiếu nội dung | `unmatched` → Telegram + admin **Gán vào đơn** |
| Ngân hàng chèn chữ vào nội dung (`MBVCB.123.HPG….CT tu…`) | Tìm mã trong chuỗi, không so cả chuỗi |
| Trả thiếu | `partial`, chuyển thêm cùng nội dung sẽ cộng dồn |
| Trả dư / trả 2 lần / trả vào đơn đã huỷ | Vẫn mở (nếu chưa có), gắn cờ, Telegram để hoàn tiền tay |
| Tiền tới sau khi đơn hết hạn | Vẫn mở khoá (`late`) — khách đã trả theo QR họ thấy |
| App bị crack giả request | HMAC theo game dùng chung mọi máy → kẻ giả chỉ tạo được đơn `pending`, không thể đổi sang `paid` |
| KEY bị khoá/hết hạn giữa chừng | Tiền vẫn ghi nhận + mở vào KEY; KEY vẫn bị chặn theo luật cũ → admin xử lý |
| Hosting lỗi lúc tiền về | Trả 500 → SePay gửi lại 7 lần / ~5 giờ; vẫn sót thì đối soát API |

## 9. Kiểm thử

**Server (HP KEY):**
- `php tools/dev/test-shop.php` (hàm thuần):
  - sinh mã (bảng chữ, độ dài, không trùng);
  - tìm mã trong ~15 mẫu nội dung thật của các ngân hàng (hoa/thường, có chấm, dính chữ);
  - cộng tiền pending → partial → paid / over / dup;
  - thêm id vào `features` (NULL giữ NULL, `''` → `thuytinh`, đã có thì không thêm);
  - lọc game bán được theo `feature_state` + KEY thử nghiệm.
- E2E trên MariaDB thật (khuôn `tools/dev/e2e-biz.php`, cổng 3307) — fake PDO quá cứng cho nhiều SQL mới:
  - `order_create` → webhook giả bằng `curl` → `order_status` = paid → `verify` trả `ft` có game mới;
  - sai khoá → 401;
  - gửi lại cùng `id` → xử lý 1 lần;
  - sai tài khoản / `out` → `ignored`;
  - trả 2 lần thiếu → paid.
- `test-contract.php` xanh (mã lỗi mới có trong `ERR_VI` + docs); `smoke.sh` với `HPKEY_FAKE_SCHEMA=10` và `11` (trang admin không vỡ khi chưa migrate).

**SDK:** `npm test` trong HP KEY (transport giả cho `shopItems/orderCreate/orderStatus`).

**App:**
- `tests/license-features.test.js` thêm ca `sellable` (hidden → locked; admin-hidden vẫn hidden).
- `tests/shop-ui.test.mjs` cho logic thuần.
- `tests/app-smoke.test.js` vẫn xanh.
- Chạy app với server thật + webhook giả: mở cửa sổ → `curl` webhook → game tự mở, không bấm gì.

**Thật:** 1 lần chuyển khoản thật với game để trạng thái `admin` (chỉ KEY thử nghiệm thấy) giá 2.000đ → kiểm toàn bộ đường đi + Telegram + sổ `sales`, rồi trả giá về như cũ.

## 10. Thứ tự làm & phát hành

1. **HP KEY server**:
   - Làm: migration v11, `lib/shop.php`, `shop.php`, `sepay.php`, `.htaccess`, admin, cron, Telegram, test, `docs/api-contract.md`.
   - Phát hành: `pack-update.py` (thứ tự lib → config → root → admin), mở admin 1 lần để migrate. Để **`shop_on=0`**.
2. **Cấu hình SePay** (§7) + thử Test mode bằng webhook thật.
3. **SDK 2.2.0** → sync vào app.
4. **App**: §6, phát hành bản mới (v1.20.0). App cũ không đổi gì.
5. Thử 1 giao dịch thật (§9) → bật `shop_on=1` → nhập giá từng game.

## 11. Đã chốt hết — xem §0.

## 12. Gỡ 🎬 Hiệu ứng OBS, giữ kết nối OBS WebSocket

App chỉ có **một** kết nối OBS: `obsBridge` (`lib/obs-bridge.js`, khoá cấu hình `appConfig.obsBridge`). Nó đang phục vụ: feed camera chung của 🎥 Game Camera (`lib/touchplay-obs-feed.js` — mọi game camera), kiểm Scene / thêm overlay nhanh (`lib/camgames-obs.js`), ẩn/hiện camera của Bộ Tách Người, các route OBS của Chém Trái Cây, tự bấm Refresh overlay lúc mở app. Ô nhập URL/mật khẩu lại **chỉ** nằm trong trang Hiệu ứng OBS → phải chuyển trước khi xoá.

**Giữ + chuyển:**
- Instance `obsBridge`, tự kết nối lúc mở app, tự Refresh overlay, tự nối lại 5 s; `obs-websocket-js` trong `package.json`.
- Route `GET/PUT /api/obs-bridge/config` (chỉ còn `url`, `password`, `autoConnect`, `status`), `POST /api/obs-bridge/connect|disconnect`. Giữ tên khoá `appConfig.obsBridge` (không cần migrate).
- Giao diện: khối **🔌 Kết nối OBS WebSocket** trong ⚙ Cài đặt › 🖥 OBS & Overlay (URL, mật khẩu, tự kết nối, Kết nối/Ngắt, chấm trạng thái hỏi 1,5 s/lần khi popup mở) — dùng lại CSS `.settings-popup .obs-*` đang bỏ không.
- `window.toast` đang định nghĩa **bên trong** code Hiệu ứng OBS mà ~50 chỗ khác gọi (Bộ Tách Người, Đá Cầu, Game Camera, Trồng Cây, Cài đặt…) → đưa ra hàm chung trong `app.js`, CSS đổi tên `.obse-toast` → `.hp-toast`.

**Xoá:** trang `#view-obs-effects` + 6 hộp thoại (chọn quà, nhóm, đồng bộ LUA, sao lưu, mật khẩu, Background Removal); `setupOBSEffectsView` trong `app.js`; CSS `.obse-*`; hàng đợi hiệu ứng + hook quà trong `server.js`; LUA Sync, OBS Settings, cài Background Removal (`lib/lua-sync.js`, `lib/obs-settings.js` cùng các route `/api/lua-sync/*`, `/api/obs-settings/*`, `/api/obs-bridge/{hotkeys,scenes,test-mapping,trigger,queue/*,install-bg-removal,check-bg-removal,lua-duration}`); các hàm chỉ hiệu ứng dùng trong `obs-bridge.js`; nguồn `obsEffects` của Bảng Quà Tổng; `obs-effects` khỏi danh mục bản quyền; `tools/test-obs-bridge.js`, `tools/test-simulate-gift.ps1`.

**Sửa chữ:** mọi câu "kết nối OBS ở mục Hiệu ứng OBS" (≈18 chỗ trong camgames, bancung, chemtraicay, touchplay, body, dacau, dapmuoi, head-anchor) → "⚙ Cài đặt › Kết nối OBS WebSocket".

Dữ liệu cũ (`obsBridge.mapping`, `luaSync`…) để nguyên trong config — vô hại, không cần dọn.

## 13. Đã làm (29/10/2026) — chưa commit, chưa phát hành

**Khác so với bản nháp ở trên:** giá từng game đặt ở **Cài đặt › Bán hàng** (cạnh tài khoản nhận tiền), không ở Cài đặt › Game. Tặng / gỡ game trọn đời ở trang **Đơn hàng app**; ngăn kéo KEY chỉ hiện danh sách ♾. Schema dùng khoá meta riêng `shop_schema` (như kho bài hát), không tăng `HPKEY_SCHEMA_VERSION`.

**HP KEY (nhánh `feature/shop-sepay`):**
- Server: `server/lib/shop.php` (lõi), `server/shop.php` (app), `server/sepay.php` (webhook), `lib/schema.php` `hpkey_migrate_shop_v1`, `api.php` (`hpkey_owned_games`, `own` / `bx`, gói hết hạn còn game đã mua), `lib/telegram.php` (cảnh báo `shop`), `lib/biz.php` (kind `unlock`), `cron.php`, `.htaccess` (chuyển header Authorization).
- Quản trị: `admin-core/actions-shop.php`, `data-shop.php`, `views/shop.php` (Đơn hàng app), khối 🛒 trong `views/settings.php` (Bán hàng + Cảnh báo), ♾ trong `partial.php`.
- SDK 2.2.0: `client/hpkey/core.js` (`shopUrl`, `apiCall(…, {url})`, `ERR_VI`, `owned` / `baseExpiredAt`), `index.js` (`shopItems` / `orderCreate` / `orderStatus`), adapter Action LIVE.
- Test: `tools/dev/test-shop.php` (50 ca, PDO giả), `test-api-features.php` (+8 ca ♾), `test-contract.php` (quét cả shop.php), `smoke.sh` (+3), `client/test/shop.test.js` (6 ca). Tài liệu: `docs/api-contract.md` §5d, §7.

**HP Action LIVE:**
- Gỡ 🎬 Hiệu ứng OBS (§12): `lib/lua-sync.js`, `lib/obs-settings.js`, `tools/test-obs-bridge.js`, `tools/test-simulate-gift.ps1` đã xoá; ~1.700 dòng `app.js`, ~1.000 dòng `server.js`, ~1.350 dòng CSS, ~370 dòng `index.html`. Kết nối OBS ở ⚙ Cài đặt (`#st-obs-block`), `window.toast` chung (`.hp-toast`).
- Danh mục 44 món, game mẹ `HUBS` (`lib/license-features.js`), `Body.saleIdOf` (`public/games/body/core.js`), chặn ở `lib/body-server.js`. `hpkey/README.md` có khối danh mục mới để dán vào HP KEY.
- Mua hàng: `lib/shop-orders.js` (bộ theo dõi đơn), route `/api/shop/*` + `licenseRecheckNow` + `shopPublic` trong `server.js`, `public/shop-modal.js` + `public/lib/shop-ui.js`, nhóm 🛒 trong Thư viện (`app.js renderShopGroup`), nút Mua ở Game Camera / ô 🔒 Bộ Tách Người / Khởi động nhanh. SDK 2.2.0 đã sync vào `hpkey/`.
- Test: `tests/shop-orders.test.js`, `tests/shop-ui.test.js`, `tests/license-features.test.js` (+3), `tests/body-server.test.js` (+1).

**Còn phải làm (theo thứ tự):**
1. Upload server HP KEY (gói cập nhật theo thứ tự lib → config → root → admin) → mở trang quản trị 1 lần để tạo bảng `shop_schema`.
2. HP KEY › Cài đặt › Game › `tiktok-game` › Tính năng: dán khối danh mục mới trong `hpkey/README.md` (xoá dòng `obs-effects`).
3. Cài đặt › Bán hàng: tài khoản ACB → khối 🛒: Tạo khoá webhook, nhập giá từng game (để `shop_on` TẮT).
4. SePay (§7): liên kết ACB, mẫu mã thanh toán `HPG` 8–8 Số và chữ, webhook `…/hpkey/sepay.php` API Key; thử Test mode.
5. Phát hành app (v1.20.0) có SDK 2.2.0.
6. Thử 1 giao dịch thật 2.000đ với game để "Chỉ key thử nghiệm" → bật bán.
