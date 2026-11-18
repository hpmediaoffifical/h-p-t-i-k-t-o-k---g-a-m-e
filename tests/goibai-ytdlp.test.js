'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { assetName, parseSums, parseSearchOutput, parseAudioJson, verifyBinary, isStale, shouldCheckUpdate } = require('../lib/goi-bai/ytdlp');

test('isStale: bản yt-dlp quá N ngày → cần cập nhật; phiên bản lạ → không đoán', () => {
    const now = Date.UTC(2026, 10, 12);
    assert.equal(isStale('2026.10.26', now, 14), true);
    assert.equal(isStale('2026.11.05', now, 14), false);
    assert.equal(isStale('2026.10.26.232901', now, 30), false, 'bản nightly có hậu tố');
    assert.equal(isStale('', now, 14), false);
    assert.equal(isStale('abc', now, 14), false);
});

test('assetName theo nền tảng', () => {
    assert.equal(assetName('win32'), 'yt-dlp.exe');
    assert.equal(assetName('darwin'), 'yt-dlp_macos');
    assert.equal(assetName('linux'), 'yt-dlp');
});

test('parseSums: đọc SHA2-256SUMS (có dấu * và dòng rác)', () => {
    const txt = 'aaa111  yt-dlp\nBBB222 *yt-dlp.exe\r\n\n# rác\nccc333  yt-dlp_macos\n';
    const m = parseSums(txt);
    assert.equal(m.get('yt-dlp.exe'), 'bbb222');
    assert.equal(m.get('yt-dlp'), 'aaa111');
    assert.equal(m.size, 3);
});

test('verifyBinary: so SHA-256 với SUMS và digest GitHub', () => {
    const buf = Buffer.from('hello');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    assert.equal(verifyBinary(buf, sha, ''), true);
    assert.equal(verifyBinary(buf, sha.toUpperCase(), 'sha256:' + sha), true);
    assert.equal(verifyBinary(buf, sha, 'sha256:' + '0'.repeat(64)), false, 'digest lệch → hỏng');
    assert.equal(verifyBinary(buf, '0'.repeat(64), ''), false);
    assert.equal(verifyBinary(buf, '', ''), false, 'không có mã băm → không tin');
});

test('parseSearchOutput: mỗi dòng 1 JSON, bỏ dòng hỏng, đánh dấu livestream', () => {
    const out = [
        JSON.stringify({ id: 'abc', title: 'Lạc Trôi', channel: 'Sơn Tùng M-TP', duration: 233, live_status: 'not_live' }),
        'WARNING: rác',
        JSON.stringify({ id: 'live', title: 'Nhạc 24/7', uploader: 'Radio', duration: null, live_status: 'is_live' }),
        JSON.stringify({ id: 'up', title: 'Sắp công chiếu', duration: 200, live_status: 'is_upcoming' }),
        JSON.stringify({ title: 'thiếu id' })
    ].join('\n');
    const items = parseSearchOutput(out);
    assert.equal(items.length, 3);
    assert.deepEqual(items[0], { id: 'abc', title: 'Lạc Trôi', channel: 'Sơn Tùng M-TP', duration: 233, isLive: false, thumb: 'https://i.ytimg.com/vi/abc/mqdefault.jpg' });
    assert.equal(items[1].isLive, true);
    assert.equal(items[1].channel, 'Radio');
    assert.equal(items[1].duration, 0);
    assert.equal(items[2].isLive, true);
});

test('parseAudioJson: link + header + hạn theo tham số expire', () => {
    const j = { url: 'https://rr1.googlevideo.com/videoplayback?expire=1800000000&itag=140', http_headers: { 'User-Agent': 'UA', Accept: '*/*' }, duration: 233, ext: 'm4a' };
    const a = parseAudioJson(JSON.stringify(j), 1_000);
    assert.equal(a.url, j.url);
    assert.equal(a.headers['User-Agent'], 'UA');
    assert.equal(a.validUntil, 1800000000 * 1000 - 5 * 60000);
    assert.equal(a.ext, 'm4a');
    assert.equal(a.contentType, 'audio/mp4');
});

test('parseAudioJson: không có expire → hạn 2 giờ; webm → audio/webm; lấy từ requested_formats', () => {
    const j = { requested_formats: [{ url: 'https://x/y', http_headers: {}, ext: 'webm' }] };
    const a = parseAudioJson(JSON.stringify(j), 1_000);
    assert.equal(a.url, 'https://x/y');
    assert.equal(a.validUntil, 1_000 + 2 * 3600000);
    assert.equal(a.contentType, 'audio/webm');
});

test('parseAudioJson: JSON hỏng / thiếu url → null', () => {
    assert.equal(parseAudioJson('không phải json', 0), null);
    assert.equal(parseAudioJson('{}', 0), null);
});

test('parseAudioJson: heatmap (đoạn hay nhất) — có thì gọn lại, không có thì mảng rỗng', () => {
    const j = { url: 'https://x/y', duration: 200, heatmap: [{ start_time: 2, end_time: 4, value: 0.5 }, { start_time: 0, end_time: 2, value: 1 }, null] };
    assert.deepEqual(parseAudioJson(JSON.stringify(j), 1_000).heatmap, [{ s: 0, e: 2, v: 1 }, { s: 2, e: 4, v: 0.5 }]);
    assert.deepEqual(parseAudioJson(JSON.stringify({ url: 'https://x/y' }), 1_000).heatmap, []);
});

test('shouldCheckUpdate: bản cũ nhưng mới hỏi GitHub trong ngày → không tải lại (GitHub chưa ra bản mới)', () => {
    const now = Date.UTC(2026, 10, 18, 12);
    const day = 86400000;
    assert.equal(shouldCheckUpdate('2026.10.26', now, 21, now - 2 * day), true, 'cũ + lâu chưa hỏi');
    assert.equal(shouldCheckUpdate('2026.10.26', now, 21, now - 3600000), false, 'cũ nhưng vừa hỏi 1 giờ trước');
    assert.equal(shouldCheckUpdate('2026.11.10', now, 21, 0), false, 'còn mới');
    assert.equal(shouldCheckUpdate('', now, 21, 0), false);
});
