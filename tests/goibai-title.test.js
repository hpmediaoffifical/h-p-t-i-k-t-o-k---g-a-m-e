'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanSongTitle } = require('../lib/goi-bai/title');

test('bỏ nhãn video thường gặp', () => {
    assert.equal(cleanSongTitle('Lạc Trôi | Official Music Video | Sơn Tùng M-TP'), 'Lạc Trôi');
    assert.equal(cleanSongTitle('SƠN TÙNG M-TP | NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO', 'Sơn Tùng M-TP Official'), 'NƠI NÀY CÓ ANH');
    assert.equal(cleanSongTitle('Shape of You (Official Audio) [4K]'), 'Shape of You');
    assert.equal(cleanSongTitle('Em Của Ngày Hôm Qua (Lyrics Video) - HD'), 'Em Của Ngày Hôm Qua');
    assert.equal(cleanSongTitle('Ed Sheeran - Perfect (Official Music Video)'), 'Ed Sheeran - Perfect');
    assert.equal(cleanSongTitle('Hoa Nở Không Màu | MV 4K'), 'Hoa Nở Không Màu');
    // cụm ngoặc ở GIỮA tên: không để lại khoảng trắng kép (gặp khi thử thật 12/11/2026)
    assert.equal(cleanSongTitle('Wiz Khalifa - See You Again ft. Charlie Puth [Official Video] Furious 7 Soundtrack'), 'Wiz Khalifa - See You Again ft. Charlie Puth Furious 7 Soundtrack');
    // kết quả thật từ yt-dlp (11/11/2026)
    assert.equal(cleanSongTitle('LẠC TRÔI | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP', 'Sơn Tùng M-TP Official'), 'LẠC TRÔI');
    assert.equal(cleanSongTitle('Lạc Trôi | Sơn Tùng MTP ‹ Lyric Video ›', 'Sunshine Gr'), 'Lạc Trôi');
    assert.equal(cleanSongTitle('LẠC TRÔI (TRIPLE D REMIX) | 360 DEGREE MV |  SƠN TÙNG M-TP', 'Sơn Tùng M-TP Official'), 'LẠC TRÔI (TRIPLE D REMIX)');
});

test('giữ nguyên tên không có nhãn; không trả rỗng', () => {
    assert.equal(cleanSongTitle('Bông Hoa Đẹp Nhất'), 'Bông Hoa Đẹp Nhất');
    assert.equal(cleanSongTitle('(Official Music Video)'), '(Official Music Video)');
    assert.equal(cleanSongTitle(''), '');
    assert.equal(cleanSongTitle(null), '');
});

test('bỏ phần trùng tên kênh ở cuối/đầu và "- Topic"', () => {
    assert.equal(cleanSongTitle('Chúng Ta Của Hiện Tại | Sơn Tùng M-TP', 'Sơn Tùng M-TP'), 'Chúng Ta Của Hiện Tại');
    assert.equal(cleanSongTitle('Waiting For You', 'MONO - Topic'), 'Waiting For You');
});

test('cắt tên quá dài', () => {
    const t = cleanSongTitle('A'.repeat(200));
    assert.ok(t.length <= 80);
});
