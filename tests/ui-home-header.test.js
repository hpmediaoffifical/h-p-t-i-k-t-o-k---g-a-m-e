// 🎨 Giao diện mới — gợi ý 1/2/3/8: phân loại nút phần đầu game (header-bar.js) + dòng Hoạt động LIVE (home-live.js)
const test = require('node:test');
const assert = require('node:assert');
const { classify, ORDER } = require('../public/ui/header-bar.js');
const { feedLine, obsAlert } = require('../public/ui/home-live.js');

const btn = (text, cls = '') => ({ text, cls, tag: 'BUTTON' });

test('classify: nút phần đầu game theo thứ tự Quay lại · Bật/Bắt đầu · Link OBS · Chạy thử · Làm mới · Lưu', () => {
    assert.strictEqual(classify(btn('← Game Tương Tác', 'ghost small')), 'back');
    assert.strictEqual(classify({ text: '⏻ ĐÃ TẮT', cls: 'hp-power off', tag: 'BUTTON' }), 'power');
    assert.strictEqual(classify(btn('▶ BẮT ĐẦU', 'primary small')), 'power');
    assert.strictEqual(classify(btn('📋 Link OBS', 'obs-link small')), 'obs');
    assert.strictEqual(classify(btn('📋 Link riêng (đứng yên)', 'obs-link small')), 'obs');
    assert.strictEqual(classify(btn('▶ TEST', 'btn-outline')), 'test');
    assert.strictEqual(classify(btn('🔄 Reload', 'ghost small')), 'reload');
    assert.strictEqual(classify(btn('💾 Lưu tất cả', 'ghost')), 'save');
    assert.strictEqual(classify(btn('↺ HŨ MỚI', 'ghost small')), 'extra');
    // nút xoá/đặt lại dữ liệu không phải "Làm mới" giao diện → vào menu Thêm
    assert.strictEqual(classify(btn('🧹 Làm mới trại', 'danger small')), 'extra');
    assert.strictEqual(classify(btn('↺ Reset vườn', 'danger small')), 'extra');
    assert.strictEqual(classify({ text: 'HD 1080', cls: 'overlay-res-select', tag: 'SELECT' }), 'extra');
    assert.ok(ORDER.back < ORDER.power && ORDER.power < ORDER.obs && ORDER.obs < ORDER.test && ORDER.test < ORDER.reload && ORDER.reload < ORDER.save);
});

test('feedLine: quà / bình luận / vào phòng / chia sẻ ra 1 dòng gọn; bỏ quà đang combo dở', () => {
    assert.deepStrictEqual(feedLine('gift', { nickname: 'Minh Thư', giftName: 'Rose', repeatCount: 10 }), { kind: 'gift', who: 'Minh Thư', what: 'tặng Rose × 10' });
    assert.strictEqual(feedLine('gift', { nickname: 'A', giftName: 'Rose', repeatEnd: false }), null);
    assert.deepStrictEqual(feedLine('chat', { uniqueId: 'kh', comment: '111' }), { kind: 'chat', who: 'kh', what: 'bình luận "111"' });
    assert.deepStrictEqual(feedLine('member', { nickname: 'Tú Linh' }), { kind: 'member', who: 'Tú Linh', what: 'vào phòng' });
    assert.deepStrictEqual(feedLine('social', { nickname: 'NV', label: 'đã chia sẻ LIVE' }), { kind: 'social', who: 'NV', what: 'đã chia sẻ LIVE' });
    assert.deepStrictEqual(feedLine('blocked', {}), { kind: 'blocked', who: '', what: '1 bình luận bị chặn (từ cấm)' });
    const long = feedLine('chat', { nickname: 'x', comment: 'a'.repeat(200) });
    assert.ok(long.what.length <= 80);
});

test('obsAlert: chỉ báo đỏ khi OBS ĐÃ từng nối trong phiên rồi mất', () => {
    assert.strictEqual(obsAlert(false, { connected: false }), false);
    assert.strictEqual(obsAlert(true, { connected: false, connecting: false }), true);
    assert.strictEqual(obsAlert(true, { connected: false, connecting: true }), false);
    assert.strictEqual(obsAlert(true, { connected: true }), false);
});
