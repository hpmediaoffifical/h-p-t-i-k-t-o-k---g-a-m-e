// 🔐 Tự cập nhật: lấy SHA-256 của file cài từ GitHub (trường `digest: "sha256:<hex>"` của asset bản phát hành).
// Không có mã băm hợp lệ → '' → server KHÔNG chạy file cài (trước đây đường GitHub bỏ qua kiểm tra).
'use strict';
function assetSha256(asset) {
    const d = asset && typeof asset.digest === 'string' ? asset.digest.trim().toLowerCase() : '';
    const m = /^sha256:([0-9a-f]{64})$/.exec(d);
    return m ? m[1] : '';
}
module.exports = { assetSha256 };
