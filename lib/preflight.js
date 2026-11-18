'use strict';
/**
 * ✅ Kiểm tra trước khi LIVE — luật thuần (test: tests/preflight.test.js).
 * Server gom trạng thái (GET /api/preflight) → danh sách dòng xanh/vàng/đỏ, mỗi dòng có cách sửa + nút sửa nhanh.
 *
 * input = {
 *   tiktok:   { username, connected },
 *   obs:      { connected },
 *   license:  { ok, daysLeft? },
 *   games:    [{ id, name, on, locked, overlay }],      // overlay = có link OBS riêng (không phải game con Camera)
 *   presence: { <id>: { open, inObs, onAir } },          // lib/overlay-presence.js
 *   cam:      { on, source, live, error }                // 🎥 Game Camera đang bật?
 * }
 * level: 'ok' | 'warn' | 'bad'. fix.action: 'focusTiktok' | 'connectTiktok' | 'openObsSettings' | 'addToObs' | 'openGame' | 'openLicense'
 */

function check(input) {
    const i = input || {};
    const out = [];
    const push = (id, level, title, detail, fix) => out.push({ id, level, title, detail: detail || '', fix: fix || null });

    // 1) TikTok
    const tk = i.tiktok || {};
    if (tk.connected) push('tiktok', 'ok', 'Đã kết nối TikTok LIVE @' + (tk.username || ''));
    else if (tk.username) push('tiktok', 'warn', 'Chưa kết nối TikTok LIVE', 'Đã có ID @' + tk.username + ' — bấm Kết nối khi đã lên sóng.', { action: 'connectTiktok', label: 'Kết nối' });
    else push('tiktok', 'bad', 'Chưa nhập TikTok ID', 'Nhập @ID phòng LIVE ở thanh trên cùng.', { action: 'focusTiktok', label: 'Nhập ID' });

    // 2) Bản quyền
    const lic = i.license || {};
    if (!lic.ok) push('license', 'bad', 'Bản quyền chưa hợp lệ', 'Game sẽ không chạy khi chưa kích hoạt key.', { action: 'openLicense', label: 'Mở bản quyền' });
    else if (Number.isFinite(lic.daysLeft) && lic.daysLeft <= 3) push('license', 'warn', 'Bản quyền sắp hết hạn', 'Còn ' + Math.max(0, Math.floor(lic.daysLeft)) + ' ngày — gia hạn để không bị gián đoạn.', { action: 'openLicense', label: 'Xem' });
    else push('license', 'ok', 'Bản quyền hợp lệ');

    // 3) OBS
    const obsOn = !!(i.obs && i.obs.connected);
    if (obsOn) push('obs', 'ok', 'Đã kết nối OBS');
    else push('obs', 'warn', 'Chưa kết nối OBS WebSocket', 'Không kết nối vẫn chạy được, nhưng app không kiểm tra được overlay trong OBS và không tự thêm nguồn được.', { action: 'openObsSettings', label: 'Kết nối OBS' });

    // 4) Game đang bật: có trong OBS chưa?
    const on = (i.games || []).filter(g => g && g.on && !g.locked);
    if (!on.length) push('games', 'warn', 'Chưa bật game nào', 'Bật game ở Thư viện bên trái hoặc chọn 1 Kiểu buổi.', null);
    const pres = i.presence || {};
    for (const g of on) {
        if (!g.overlay) continue;
        const p = pres[g.id] || {};
        if (p.open > 0 || p.onAir) push('game:' + g.id, 'ok', g.name + ' — overlay đang chạy');
        else if (p.inObs) push('game:' + g.id, 'warn', g.name + ' — có trong OBS nhưng chưa chạy', 'Nguồn đang ẩn hoặc bật "Shutdown when not visible" — bấm 👁 hiện nguồn trong Scene đang phát.', obsOn ? { action: 'addToObs', gameId: g.id, label: 'Hiện trong Scene' } : null);
        else push('game:' + g.id, 'bad', g.name + ' — chưa có trong OBS', 'Người xem sẽ không thấy game này.', obsOn ? { action: 'addToObs', gameId: g.id, label: '➕ Thêm vào OBS' } : { action: 'openGame', gameId: g.id, label: 'Lấy link OBS' });
    }

    // 5) Camera (chỉ khi Game Camera đang bật)
    const cam = i.cam || {};
    if (cam.on) {
        if (!cam.source) push('cam', 'bad', 'Game Camera chưa chọn nguồn camera', 'Chọn Scene/Source camera trong 🎥 Game Camera.', { action: 'openGame', gameId: 'camgames', label: 'Chọn camera' });
        else if (!cam.live) push('cam', 'warn', 'Game Camera chưa nhận được hình', cam.error ? String(cam.error) : 'Kiểm tra camera trong OBS đang bật và OBS đã kết nối.', { action: 'openGame', gameId: 'camgames', label: 'Mở Game Camera' });
        else push('cam', 'ok', 'Game Camera đang nhận hình');
    }

    const rank = { bad: 0, warn: 1, ok: 2 };
    out.sort((a, b) => rank[a.level] - rank[b.level]);
    const summary = out.some(r => r.level === 'bad') ? 'bad' : out.some(r => r.level === 'warn') ? 'warn' : 'ok';
    return { summary, items: out };
}

module.exports = { check };
