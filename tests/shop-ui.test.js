'use strict';
// 🛒 public/lib/shop-ui.js (logic thuần cửa sổ mua game) + chỗ nối giao diện (kiểm tĩnh mã nguồn) — spec 2026-10-29-mua-game-sepay §6.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const UI = require('../public/lib/shop-ui.js');
const LF = require('../lib/license-features');

test('vnd: định dạng tiền Việt không phụ thuộc Intl', () => {
    assert.equal(UI.vnd(50000), '50.000đ');
    assert.equal(UI.vnd(1250000), '1.250.000đ');
    assert.equal(UI.vnd(900), '900đ');
    assert.equal(UI.vnd('abc'), '0đ');
});

test('due: còn phải chuyển = phần thiếu (ưu tiên số server gửi trong pay)', () => {
    assert.equal(UI.due({ amount: 50000, received: 20000 }), 30000);
    assert.equal(UI.due({ amount: 50000, received: 20000 }, { amount: 30000 }), 30000);
    assert.equal(UI.due({ amount: 50000, received: 0, due: 50000 }), 50000);
    assert.equal(UI.due({ amount: 50000, received: 70000 }), 0);
});

test('statusView: chờ → thiếu → đã nhận (đang mở) → đã mở khoá; hết hạn / huỷ là kết thúc', () => {
    assert.deepEqual([UI.statusView({ status: 'pending' }).tone, UI.statusView({ status: 'pending' }).final], ['wait', false]);
    const p = UI.statusView({ status: 'partial', amount: 50000, received: 20000 });
    assert.equal(p.tone, 'warn');
    assert.match(p.text, /20\.000đ.*30\.000đ.*CÙNG nội dung/);
    const paid = UI.statusView({ status: 'paid' });
    assert.deepEqual([paid.done, paid.final], [false, false], 'đã nhận tiền nhưng chưa xác thực lại KEY → chưa xong');
    const done = UI.statusView({ status: 'paid', unlocked: true }, { name: 'Hũ Thủy Tinh' });
    assert.deepEqual([done.done, done.final], [true, true]);
    assert.match(done.text, /Hũ Thủy Tinh.*trọn đời/);
    assert.equal(UI.statusView({ status: 'expired' }).final, true);
    assert.match(UI.statusView({ status: 'expired' }).text, /vẫn được mở/);
    assert.equal(UI.statusView({ status: 'cancelled' }).tone, 'bad');
});

test('errorText: ưu tiên câu server, có câu riêng cho mã thường gặp', () => {
    assert.equal(UI.errorText({ ok: false, error: 'x', message: 'Câu server' }), 'Câu server');
    assert.match(UI.errorText({ ok: false, error: 'too_many_orders' }), /nhiều đơn/);
    assert.match(UI.errorText({ ok: false, error: 'lạ' }), /thử lại/);
    assert.match(UI.errorText(null), /thử lại/);
});

test('qrLayout: ô nguyên, viền trắng 4 ô, ≤ khung; hàng hỏng → null', () => {
    const rows = Array.from({ length: 29 }, () => '01'.repeat(14) + '1');
    const L = UI.qrLayout(rows, 264);
    assert.deepEqual([L.n, L.cell, L.size], [29, 7, 259]);
    assert.ok(L.size <= 264);
    assert.equal(UI.qrLayout([], 264), null);
    assert.equal(UI.qrLayout(['0101', '01'], 264), null, 'không vuông');
    assert.equal(UI.qrLayout(['0a', '00'], 264), null, 'ký tự lạ');
});

test('openTarget: hiệu ứng tách người → trang Game Camera; game con camera / game đơn → chính nó', () => {
    assert.equal(UI.openTarget({ id: 'body-vf-abduct', parent: 'body' }), 'camgames');
    assert.equal(UI.openTarget({ id: 'dacau', parent: 'camgames' }), 'dacau');
    assert.equal(UI.openTarget({ id: 'thuytinh', parent: null }), 'thuytinh');
    assert.equal(UI.openTarget(null), null);
});

test('license-features: mục ĐANG BÁN mà server ký hidden (Ẩn hẳn) vẫn hiện locked; mục admin Ẩn không bán → vẫn ẩn', () => {
    const gs = { thuytinh: 'hidden', caro: 'hidden', dacau: 'hidden' };
    assert.equal(LF.stateOf(['nhatla'], gs, 'thuytinh'), 'hidden');
    assert.equal(LF.stateOf(['nhatla'], gs, 'thuytinh', ['thuytinh']), 'locked');
    assert.equal(LF.stateOf(['nhatla'], gs, 'caro', ['thuytinh']), 'hidden');
    assert.equal(LF.stateOf(['thuytinh'], gs, 'thuytinh', ['thuytinh']), 'hidden', 'đã có (không khoá) → giữ trạng thái server');
    const allHidden = Object.fromEntries(LF.leavesOf('camgames').map((k) => [k, 'hidden']));
    assert.equal(LF.stateOf(['caro'], allHidden, 'camgames'), 'hidden');
    assert.equal(LF.stateOf(['caro'], allHidden, 'camgames', ['body-mo-ice']), 'locked', 'có hiệu ứng đang bán → Game Camera hiện để mua');
    assert.equal(LF.stateOf(['caro'], allHidden, 'body', ['dacau']), 'hidden');
    assert.equal(LF.states(['caro'], allHidden, new Set(['dacau'])).dacau, 'locked');
});

test('nối giao diện: cửa sổ mua nạp sau app.js; Thư viện / Game Camera / Bộ Tách Người / Khởi động nhanh gọi hpBuyGame', () => {
    const root = path.join(__dirname, '..');
    const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
    const html = read('public/index.html');
    const iApp = html.indexOf('<script src="/app.js">'), iUi = html.indexOf('<script src="/lib/shop-ui.js">'), iModal = html.indexOf('<script src="/shop-modal.js">');
    assert.ok(iApp > 0 && iUi > iApp && iModal > iUi, 'thứ tự: app.js → shop-ui.js → shop-modal.js');
    assert.match(read('public/shop-modal.js'), /window\.hpBuyGame = /);
    const app = read('public/app.js');
    assert.match(app, /window\.hpSocket = socket/);
    assert.match(app, /function renderShopGroup\(list\)/);
    assert.match(app, /setShopInfo\(lf\.shop\)/);
    assert.match(app, /'hp-ql:buy'/);
    assert.match(read('public/games/camgames/camgames-panel.js'), /window\.hpBuyGame\?\.\(b\.dataset\.buy\)/);
    assert.match(read('public/games/body/body-panel.js'), /window\.hpBuyGame\(t\.dataset\.buy\)/);
    assert.match(read('public/quick-launch.html'), /type: 'hp-ql:buy'/);
    for (const f of ['public/app.js', 'public/games/camgames/camgames-panel.js', 'public/games/body/body-panel.js', 'public/quick-launch.html', 'public/lib/shop-ui.js']) {
        assert.doesNotMatch(read(f), /replace\(\/B\(\?=\(d\{3\}\)/, f + ': regex định dạng tiền mất dấu \\');
    }
});
