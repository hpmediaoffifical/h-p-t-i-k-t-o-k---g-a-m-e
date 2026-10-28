// Kiểu hũ (skin) cho Hũ Thủy Tinh — HIỆN CHỈ CÓ HŨ MẶC ĐỊNH.
// 46 kiểu hũ dựng tự động (đổi cả dáng + va chạm) đã gỡ 29/10/2026 vì xấu. Hướng mới: giữ nguyên
// hũ thủy tinh mặc định, chỉ thêm khung trang trí 2.5D–3D BÊN NGOÀI vùng kính
// — xem art-requests/thuytinh/trang-tri/BRIEF-TRANG-TRI.md. Danh sách rỗng = engine/panel dùng hũ mặc định.
(function (root) {
    const SKINS = [];
    const byId = {};
    SKINS.forEach(s => { byId[s.id] = s; });
    root.HpJarSkins = { SKINS, byId };
    if (typeof module === 'object' && module.exports) module.exports = root.HpJarSkins;
})(typeof self !== 'undefined' ? self : this);
