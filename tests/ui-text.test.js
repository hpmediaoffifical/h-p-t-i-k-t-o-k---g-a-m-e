// 🎨 Giao diện mới — chuẩn hoá chữ giao diện (public/ui/ui-text.js):
// gạch dài "—"/"–" → "-", chính tả mặc định TikTok / LIVE / Creator; không đụng URL, id, tên file.
const test = require('node:test');
const assert = require('node:assert');
const { normalizeText, sanitizeTiktokId } = require('../public/ui/ui-text.js');

test('gạch ngang dài → "-"', () => {
    assert.strictEqual(normalizeText('Hũ Thủy Tinh — quà rơi'), 'Hũ Thủy Tinh - quà rơi');
    assert.strictEqual(normalizeText('10–20 xu'), '10-20 xu');
    assert.strictEqual(normalizeText('a—b'), 'a-b');
});

test('chính tả mặc định TikTok / LIVE / Creator', () => {
    assert.strictEqual(normalizeText('Kết nối tiktok live'), 'Kết nối TikTok LIVE');
    assert.strictEqual(normalizeText('TIKTOK Live Studio'), 'TikTok LIVE Studio');
    assert.strictEqual(normalizeText('Phụ đề giọng creator'), 'Phụ đề giọng Creator');
    assert.strictEqual(normalizeText('🎥 CREATOR'), '🎥 Creator');
    assert.strictEqual(normalizeText('Tik Tok'), 'TikTok');
});

test('không đụng URL, đường dẫn, tên có gạch nối hay gạch dưới', () => {
    const keep = ['http://hpaction.obs:3000/overlay/live-translate', 'hp-live-kit', 'tiktok_fan', '/listen/caption.live', 'livestream', 'liveTranslate'];
    for (const s of keep) assert.strictEqual(normalizeText(s), s);
});

test('ô ID TikTok: chữ hoa → thường, bỏ @ và ký tự đặc biệt (chỉ a-z 0-9 . _)', () => {
    assert.strictEqual(sanitizeTiktokId('@HP.Media_Official'), 'hp.media_official');
    assert.strictEqual(sanitizeTiktokId(' anh hang! #1 '), 'anhhang1');
    assert.strictEqual(sanitizeTiktokId('Tiến'), 'tin');
    assert.strictEqual(sanitizeTiktokId(''), '');
});

test('chuỗi rỗng / không phải chuỗi trả nguyên', () => {
    assert.strictEqual(normalizeText(''), '');
    assert.strictEqual(normalizeText(null), null);
});
