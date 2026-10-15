const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/music-gifts');

const DISC = 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/musicgift/f45b78e9-d367-4949-8d7d-da0c67baffac.png~tplv-obj.png';
const ROSE = 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.webp';

test('isMusicGiftEvent: type 22, musicInfo hoặc ảnh /musicgift/', () => {
    assert.strictEqual(M.isMusicGiftEvent({ gift: { id: '1', type: 22 } }), true);
    assert.strictEqual(M.isMusicGiftEvent({ gift: { id: '1', type: 2, musicInfo: { songId: '0', songName: 'TTU' } } }), true);
    assert.strictEqual(M.isMusicGiftEvent({ gift: { id: '779752', type: 2, image: { url: [DISC] } } }), true);
    assert.strictEqual(M.isMusicGiftEvent({ gift: { id: '779752', image: { url_list: [DISC] } } }), true);
    // musicInfo mặc định proto (rỗng) KHÔNG tính là quà nhạc
    assert.strictEqual(M.isMusicGiftEvent({ gift: { id: '5655', type: 1, image: { url: [ROSE] }, musicInfo: { songId: '0', songName: '' } } }), false);
    assert.strictEqual(M.isMusicGiftEvent(null), false);
});

test('aliasMusicGift: gom về quà ảo, giữ id thật + ảnh đĩa riêng + tên bài thật', () => {
    const catalog = { 779752: { song: 'TTU', artist: 'Pretty When I Cry', lyrics: 'Together togethe', image: DISC } };
    const out = M.aliasMusicGift({ giftId: '779752', giftName: 'Together togethe', giftPicture: DISC, diamondCount: 199, repeatCount: 1 },
        { isMusic: true, hasSheetItem: false, catalog });
    assert.strictEqual(out.giftId, M.MUSIC_GIFT_ID);
    assert.strictEqual(out.songGiftId, '779752');
    assert.strictEqual(out.musicGift, true);
    assert.strictEqual(out.giftPicture, DISC);
    assert.strictEqual(out.giftName, 'TTU – Pretty When I Cry');
    assert.strictEqual(out.diamondCount, 199);
});

test('aliasMusicGift: musicInfo rỗng không đè tên bài đã biết; bài lạ dùng câu hát', () => {
    const catalog = { 1: { song: 'TTU', artist: 'A' } };
    const a = M.aliasMusicGift({ giftId: '1', giftName: 'x' }, { isMusic: true, catalog, info: { songId: '', song: '', artist: '' } });
    assert.strictEqual(a.giftName, 'TTU – A');
    const b = M.aliasMusicGift({ giftId: '2', giftName: 'Together togethe', giftPicture: DISC }, { isMusic: true, catalog });
    assert.strictEqual(b.giftName, 'Together togethe');
    assert.strictEqual(b.giftId, M.MUSIC_GIFT_ID);
});

test('aliasMusicGift: bài đã có trong bảng quà giữ id thật; quà thường không đổi', () => {
    const kept = M.aliasMusicGift({ giftId: '779752', giftName: 'x' }, { isMusic: true, hasSheetItem: true });
    assert.strictEqual(kept.giftId, '779752');
    assert.strictEqual(kept.musicGift, true);
    const rose = { giftId: '5655', giftName: 'Rose' };
    assert.strictEqual(M.aliasMusicGift(rose, { isMusic: false }), rose);
});

test('withMusicGiftItem: chèn đúng chỗ theo Kim Cương, không trùng', () => {
    const list = [{ id: '5655', diamond: 1 }, { id: '6', diamond: 199 }, { id: '7', diamond: 500 }];
    const out = M.withMusicGiftItem(list);
    assert.deepStrictEqual(out.map(g => g.id), ['5655', '6', M.MUSIC_GIFT_ID, '7']);
    assert.strictEqual(M.withMusicGiftItem(out).filter(g => g.id === M.MUSIC_GIFT_ID).length, 1);
    assert.deepStrictEqual(M.withMusicGiftItem([]).map(g => g.id), [M.MUSIC_GIFT_ID]);
    assert.strictEqual(list.length, 3);   // không đụng input
});

test('catalogFromTikTokJson: đọc gift/music/list và file gom nhiều trang', () => {
    const page = { data: { mood_id: 1, tabs: [{ tab_id: 1, gifts: [
        { gift_id: 779752, gift_price: 199, song_name: 'TTU', lyrics_text: 'Together togethe', artist: { name: 'P' }, album_cover: { url_list: [DISC] } }
    ] }, { tab_id: 2, gifts: [] }] }, status_code: 0 };
    const more = { data: { tab: { tab_id: 100, gifts: [{ gift_id: 1, song_name: 'B', album_cover: { url_list: ['u'] } }] } } };
    const c = M.catalogFromTikTokJson([{ ...page.data, mood_id: 3 }, more]);
    assert.deepStrictEqual(Object.keys(c).sort(), ['1', '779752']);
    assert.strictEqual(c[779752].song, 'TTU');
    assert.strictEqual(c[779752].image, DISC);
    assert.strictEqual(c[779752].mood, 3);
    assert.strictEqual(M.catalogFromTikTokJson(page)[779752].mood, 1);
    assert.deepStrictEqual(M.catalogFromTikTokJson({ data: { message: 'User doesn\'t login' } }), {});
});

test('learnSong: chỉ báo thay đổi khi có dữ liệu mới, bỏ id ảo', () => {
    const cat = {};
    assert.strictEqual(M.learnSong(cat, '9', { lyrics: 'abc', price: 0 }), true);
    assert.strictEqual(M.learnSong(cat, '9', { lyrics: 'abc', image: '' }), false);
    assert.strictEqual(M.learnSong(cat, '9', { song: 'S' }), true);
    assert.deepStrictEqual(cat['9'], { lyrics: 'abc', song: 'S' });
    assert.strictEqual(M.learnSong(cat, M.MUSIC_GIFT_ID, { lyrics: 'x' }), false);
});

test('seed đóng gói (dạng gọn) đọc được, đủ 6 tâm trạng, ảnh /musicgift/', () => {
    const seed = M.expandSeed(require('../lib/music-gifts-seed.json'));
    const ids = Object.keys(seed);
    assert.ok(ids.length >= 20000, `chỉ có ${ids.length} bài`);
    for (const id of ids) assert.ok(M.isMusicImageUrl(seed[id].image), id);
    assert.deepStrictEqual([...new Set(ids.map(id => seed[id].mood))].sort(), [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(seed['779752'].song, 'TTU');
});

test('compactSeed ↔ expandSeed giữ nguyên dữ liệu; dạng cũ vẫn đọc được', () => {
    const cat = { 1: { lyrics: 'a', song: 'b', artist: 'c', image: 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/musicgift/x.png~tplv-obj.png', mood: 2, price: 199 },
        2: { lyrics: 'd', song: '', artist: '', image: 'https://khac/musicgift/y.png', mood: 0, price: 199 } };
    assert.deepStrictEqual(M.expandSeed(JSON.parse(JSON.stringify(M.compactSeed(cat)))), cat);
    assert.strictEqual(M.compactSeed(cat).songs[1][3], 'x');
    assert.deepStrictEqual(M.expandSeed({ 5: { song: 'z' } }), { 5: { song: 'z' } });
    // file danh mục gọn cũng nhập được qua catalogFromTikTokJson
    assert.strictEqual(M.catalogFromTikTokJson({ 779752: { song: 'TTU', image: 'u' } })['779752'].song, 'TTU');
});
