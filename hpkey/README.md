# HP KEY — License client

Module client cho hệ thống bản quyền HP Media (đặt tại `hpvn.media/hpkey/api.php`).
Áp dụng từ **v1.0.64** trở đi (thay thế license-server cũ `hp-license.nguyenvu.dev/activate`,
endpoint cũ vẫn được giữ cho gift-sheet + auto-update).

## Cấu trúc

Từ 10/2026 dùng **SDK client v2** (lõi chung mọi app HP Media, nguồn ở repo HP KEY `client/hpkey/`).
File lõi **không sửa trong app** — sửa ở repo HP KEY rồi chạy `tools/sync-client.ps1 -Adapter action-live`.

```
hpkey/
├── config.js          — ← app sửa: endpoint, PRODUCT=tiktok-game, HMAC loader, RECHECK_SECONDS, HWID_ALGO='legacy'
├── secret.local.js    — ← app sửa: ⚠ HMAC_SECRET — GITIGNORED, KHÔNG push lên repo
├── public-key.js      — ← app sửa: public key RSA (PEM base64) để verify chữ ký token server
├── validate.js        — adapter: validateLicenseKey() / verifyKey() / startWatch() / getHWID() — interface server.js gọi
├── version.js         — số phiên bản SDK (server.js ghi "[hpkey] sdk x.y.z" ra log)
├── hwid.js            — HWID thuật toán 'legacy' (y hệt bản cũ), ĐÓNG BĂNG sau lần tính đầu
├── store.js           — lưu key + HWID + token (AES theo HWID) ở %ProgramData% / %AppData%\HP Media\tiktok-game + registry HKCU
├── core.js            — ký HMAC, gọi API, verify token RSA, bảng mã lỗi tiếng Việt, license.features
├── guard.js           — watcher: lỗi mơ hồ (mất mạng, server 5xx/HTML) chỉ cảnh báo; mã cứng lặp 3 lần mới thu hồi
└── index.js           — API chung của SDK (adapter gọi vào)
```

Khác bản cũ: mở app có token hợp lệ thì gọi `verify` thay vì `activate`; server lỗi tạm mà token còn hạn
offline thì vẫn cho chạy; `license.features` (null = toàn bộ tính năng) được lưu vào `appConfig.license.features`.

## Tính năng theo KEY (khoá/mở từng game)

Admin chọn tính năng cho từng key ở trang quản trị HP KEY; server ký danh sách vào token (trường `ft`).
Danh mục + hàm thuần ở `lib/license-features.js` (test: `tests/license-features.test.js`), áp vào app ở
`server.js` (`applyLicenseLocks()`), giao diện ở `public/app.js`, `public/quick-launch.html`, bảng Game Camera.

- Key "Tất cả" (mọi key cũ, token không có `ft`) → mở hết như trước.
- Khoá được: 9 game (kể cả THỜI GIAN) + 5 game camera + Dịch Thuật LIVE + Hiệu ứng OBS. Luôn mở: Bảng Quà Tổng.
  Khung Game Camera mở khi key có ít nhất 1 game camera.
- Bị khoá: game tắt (KHÔNG xoá dữ liệu — vườn Trồng Cây còn nguyên), không bật lại được qua API / ⏻ / Khởi động
  nhanh, bị bỏ khỏi lựa chọn Game Camera, overlay OBS hiện 🔒 thay cho game; Thư viện Game hiện mờ + 🔒.
- Mở khoá: bật lại đúng những gì đã tắt vì key (ghi nhớ ở `appConfig.licenseLocks`); mục người dùng tự tắt thì để nguyên.
- Admin đổi tính năng → app áp trong ≤ 60 giây (watcher) mà không cần mở lại.

**Danh mục dán vào HP KEY › Cài đặt › Game › `tiktok-game` › Tính năng** (id phải trùng từng ký tự):

```
thuytinh|Hũ Thủy Tinh
caro|Caro Đối Đầu
pktiktok|Hiệu ứng PK
vipwelcome|Chào Mừng VIP
votecomment|Vote Bình Luận
nhietdo|Biểu Cảm Nhiệt
trongcay|Trồng Cây
nhatla|Nhặt Lá
timer|Thời Gian
touchplay|Touch & Play (Game Camera)
chemtraicay|Chém Trái Cây (Game Camera)
dapmuoi|Đập Muỗi (Game Camera)
bancung|Bắn Cung (Game Camera)
level-quest|Level Quest (Game Camera)
liveTranslate|Dịch Thuật LIVE
obs-effects|Hiệu ứng OBS
```

Thêm game mới vào danh mục bán: thêm vào `CATALOG` trong `lib/license-features.js` (+ test), rồi thêm đúng dòng
`id|Tên` ở trang quản trị. Game chưa có trong `CATALOG` luôn mở cho mọi key.

## ⚠ Vấn đề `secret.local.js` mất trong git worktree

**Đây là pitfall thường gặp khi dùng Claude Code hoặc bất kỳ git worktree nào.**

`hpkey/secret.local.js` chứa HMAC_SECRET để ký request lên server hpkey. File này nằm trong
`.gitignore` (để không leak secret khi push public repo) → **không có trong git history** →
git worktree mới tạo (`git worktree add` hoặc Claude Code sandbox) sẽ **không có file này**.

**Triệu chứng:** Chạy `node server.js` từ worktree, nhập key bản quyền → app báo
`"App chưa cấu hình HP KEY (thiếu HMAC secret / public key)"` (mã `not_configured` trong `hpkey/core.js`,
khi `cfg.HMAC_SECRET` rỗng hoặc bắt đầu bằng `DAN_`).

**Cách fix:** Copy file từ project gốc vào worktree đang chạy:

```powershell
# PowerShell
Copy-Item "C:\Users\NCPC\Desktop\HP Action LIVE\hpkey\secret.local.js" `
          "<worktree-path>\hpkey\secret.local.js"
```

```bash
# Bash
cp "C:/Users/NCPC/Desktop/HP Action LIVE/hpkey/secret.local.js" \
   "<worktree-path>/hpkey/secret.local.js"
```

Rồi **restart Node server** (vì `require()` cache file lúc startup).

> Lỗi này KHÔNG liên quan tới tính năng nào trong app code — nó là git-worktree gotcha. Trước khi đổ tại
> code mới, nhớ check `ls hpkey/secret.local.js` xem có file không. Bản Electron app đóng gói qua
> `electron-builder` luôn có file này bake-in (đọc từ project gốc lúc build), nên user cuối không
> bao giờ gặp lỗi này.

## Tạo `secret.local.js` lần đầu (cho máy build mới)

```js
'use strict';
// Lấy giá trị HMAC_SECRET từ admin hpvn.media/hpkey/admin (chỉ HP Media biết)
module.exports = {
    HMAC_SECRET: 'xxxx-xxxx-xxxx-xxxx-xxxx'
};
```

Hoặc set qua env var khi chạy: `HPKEY_HMAC=xxxx node server.js`.

## Endpoint flow

```
App (server.js → validateLicenseKey)
    ↓ POST /api/v1/activate  + body { key, hwid, product, ts, sig: HMAC(secret, body) }
hpvn.media/hpkey/api.php
    ↓ verify HMAC, check key trong DB
    ↓ ký token { key, role, expiry, vip } bằng RSA private key
    ← response { ok, key, role, vip, expiry, token, sig: RSA_sign(...) }
App
    ↓ verify sig bằng PUBLIC_KEY (hpkey/public-key.js)
    ↓ cache vào app-config.json — license.activated = true
    ↓ recheck mỗi 60s (RECHECK_SECONDS) — nếu admin revoke → re-prompt
```
