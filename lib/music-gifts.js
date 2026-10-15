'use strict';
// 🎵 Quà Ca khúc (TikTok "Songs of LIVE") — mỗi bài là 1 gift id riêng (199 xu, type 22, ảnh nằm dưới /musicgift/),
// do người dùng TikTok tự tạo nên kho bài không có giới hạn và không nằm trong gift/list. App gom MỌI bài về 1 quà ảo
// MUSIC_GIFT_ID để streamer gán cấu hình 1 lần cho mọi game; ảnh đĩa riêng của từng bài vẫn giữ nguyên.
// Bài nào streamer đã tự thêm vào bảng quà (id thật) thì giữ id thật — cấu hình riêng cho bài đó thắng nhóm.
// Danh mục bài (lib/music-gifts-seed.json + data/music-gifts.json học dần khi có người tặng) chỉ để hiện tên bài thật:
// tên quà TikTok gửi trong sự kiện là 16 ký tự đầu của câu hát, không phải tên bài.

const MUSIC_GIFT_ID = 'music';
const MUSIC_GIFT_TYPE = 22;
const MUSIC_GIFT_ICON = '/assets/music-gift/disc.png';
const MUSIC_GIFT_ITEM = Object.freeze({
    id: MUSIC_GIFT_ID,
    name: '🎵 Ca khúc (mọi bài)',
    image: MUSIC_GIFT_ICON,
    diamond: 199,
    virtual: true
});

function imageUrlsOf(img) {
    if (!img) return [];
    if (typeof img === 'string') return [img];
    const list = img.url_list || img.urlList || img.url || img.urls;
    if (Array.isArray(list)) return list.filter(u => typeof u === 'string');
    if (typeof list === 'string') return [list];
    return [];
}

function isMusicImageUrl(url) {
    return /\/musicgift\//i.test(String(url || ''));
}

// Bản 2.4.4 (proto v3): data.gift = Gift {type, image, musicInfo}; bản cũ: data.giftDetails. Chỉ cần 1 dấu hiệu.
function isMusicGiftEvent(data) {
    if (!data || typeof data !== 'object') return false;
    const g = data.gift || data.giftDetails || {};
    const type = Number(g.type ?? g.giftType ?? g.gift_type ?? data.giftType);
    if (type === MUSIC_GIFT_TYPE) return true;
    const mi = g.musicInfo || g.music_info;
    if (mi && (String(mi.songId || mi.song_id || '0') !== '0' || mi.songName || mi.song_name)) return true;
    const imgs = [...imageUrlsOf(g.image), ...imageUrlsOf(g.icon), ...imageUrlsOf(g.giftImage), ...imageUrlsOf(data.giftPicture)];
    return imgs.some(isMusicImageUrl);
}

// Thông tin bài TikTok gửi kèm sự kiện (nếu có) — songId/moodId có thể là bigint/string tuỳ bản lib.
function musicInfoFromEvent(data) {
    const g = data?.gift || data?.giftDetails || {};
    const mi = g.musicInfo || g.music_info;
    if (!mi || typeof mi !== 'object') return null;
    const str = (v) => (v == null ? '' : String(v));
    const out = {
        songId: str(mi.songId ?? mi.song_id).replace(/^0$/, ''),
        song: str(mi.songName ?? mi.song_name),
        artist: str(mi.artistName ?? mi.artist_name),
        mood: Number(mi.moodId ?? mi.mood_id) || 0
    };
    return (out.songId || out.song || out.artist) ? out : null;
}

// Seed đóng gói dạng gọn: {v:1, imagePrefix, imageSuffix, moods, songs: {id: [lyrics, song, artist, imageKey, mood]}}
// (imageKey = phần giữa prefix/suffix của ảnh album_cover). Dạng cũ {id: {...}} vẫn đọc được.
const SEED_IMAGE_PREFIX = 'https://p16-webcast.tiktokcdn.com/img/alisg/webcast-sg/musicgift/';
const SEED_IMAGE_SUFFIX = '.png~tplv-obj.png';
function expandSeed(seed) {
    if (!seed || typeof seed !== 'object') return {};
    if (!seed.songs) return seed;
    const pre = seed.imagePrefix ?? SEED_IMAGE_PREFIX;
    const suf = seed.imageSuffix ?? SEED_IMAGE_SUFFIX;
    const out = {};
    for (const [id, row] of Object.entries(seed.songs)) {
        if (!Array.isArray(row)) continue;
        const [lyrics, song, artist, key, mood] = row;
        out[id] = { lyrics: lyrics || '', song: song || '', artist: artist || '', image: key ? (/^https?:/.test(key) ? key : pre + key + suf) : '', mood: Number(mood) || 0, price: 199 };
    }
    return out;
}
function compactSeed(catalog, extra = {}) {
    const songs = {};
    for (const [id, s] of Object.entries(catalog || {})) {
        let img = String(s.image || '');
        if (img.startsWith(SEED_IMAGE_PREFIX) && img.endsWith(SEED_IMAGE_SUFFIX)) img = img.slice(SEED_IMAGE_PREFIX.length, -SEED_IMAGE_SUFFIX.length);
        songs[id] = [s.lyrics || '', s.song || '', s.artist || '', img, Number(s.mood) || 0];
    }
    return { v: 1, ...extra, imagePrefix: SEED_IMAGE_PREFIX, imageSuffix: SEED_IMAGE_SUFFIX, songs };
}

// Gộp danh mục: seed đóng gói < dữ liệu đã học (mới hơn) — chỉ giữ field có giá trị.
function mergeCatalog(...sources) {
    const out = {};
    for (const src of sources) {
        if (!src || typeof src !== 'object') continue;
        for (const [id, s] of Object.entries(src)) {
            if (!id || !s || typeof s !== 'object') continue;
            const prev = out[id] || {};
            const next = { ...prev };
            for (const [k, v] of Object.entries(s)) if (v !== '' && v != null) next[k] = v;
            out[id] = next;
        }
    }
    return out;
}

// Tên hiển thị: "TTU – Pretty When I Cry" nếu biết tên bài, không thì câu hát TikTok gửi.
function songLabel(song, fallbackName) {
    const title = String(song?.song || '').trim();
    const artist = String(song?.artist || '').trim();
    if (title && artist) return `${title} – ${artist}`;
    return title || String(fallbackName || song?.lyrics || '').trim() || 'Ca khúc';
}

// Chuẩn hoá payload quà TRƯỚC khi emitGift: quà Ca khúc chưa có trong bảng quà → giftId = MUSIC_GIFT_ID,
// giữ id thật ở songGiftId và ảnh đĩa riêng ở giftPicture. Trả về object mới (không đụng input) hoặc chính input.
function aliasMusicGift(payload, { isMusic, hasSheetItem, catalog, info } = {}) {
    if (!payload || !isMusic) return payload;
    const realId = String(payload.giftId || '');
    if (!realId || realId === MUSIC_GIFT_ID || hasSheetItem) {
        return { ...payload, musicGift: true, songGiftId: payload.songGiftId || realId };
    }
    const song = mergeCatalog({ s: (catalog && catalog[realId]) || {} }, { s: info || {} }).s || {};
    if (!song.lyrics && payload.giftName) song.lyrics = payload.giftName;
    return {
        ...payload,
        giftId: MUSIC_GIFT_ID,
        songGiftId: realId,
        musicGift: true,
        song: { id: realId, song: song.song || '', artist: song.artist || '', lyrics: song.lyrics || '', mood: song.mood || 0 },
        giftName: songLabel(song, payload.giftName),
        giftPicture: payload.giftPicture || song.image || MUSIC_GIFT_ICON,
        diamondCount: payload.diamondCount ?? (Number(song.price) || MUSIC_GIFT_ITEM.diamond)
    };
}

// Thêm quà ảo vào danh sách quà (giữ thứ tự theo Kim Cương tăng dần). Không thêm trùng.
function withMusicGiftItem(list) {
    const arr = Array.isArray(list) ? list.filter(g => !(g && String(g.id) === MUSIC_GIFT_ID)) : [];
    const at = arr.findIndex(g => (Number(g?.diamond) || 0) > MUSIC_GIFT_ITEM.diamond);
    const item = { ...MUSIC_GIFT_ITEM };
    if (at < 0) arr.push(item); else arr.splice(at, 0, item);
    return arr;
}

// Ghi nhận 1 bài vừa thấy vào danh mục học dần. Trả về true nếu có gì mới.
function learnSong(catalog, id, fields) {
    id = String(id || '');
    if (!id || id === MUSIC_GIFT_ID || !catalog) return false;
    const prev = catalog[id] || {};
    let changed = !catalog[id];
    const next = { ...prev };
    for (const [k, v] of Object.entries(fields || {})) {
        if (v === '' || v == null || v === 0) continue;
        if (next[k] !== v) { next[k] = v; changed = true; }
    }
    if (changed) catalog[id] = next;
    return changed;
}

// Đọc file JSON do TikTok trả (gift/music/list, list_pagination) hoặc file gom nhiều trang → {id: song}.
function catalogFromTikTokJson(json) {
    const out = {};
    const firstUrl = (img) => imageUrlsOf(img)[0] || '';
    const addTab = (tab, mood) => {
        for (const g of (tab && Array.isArray(tab.gifts) ? tab.gifts : [])) {
            const id = String(g?.gift_id ?? g?.giftId ?? '');
            if (!id || out[id]) continue;
            out[id] = {
                lyrics: g.lyrics_text || '',
                song: g.song_name || '',
                artist: g.artist?.name || '',
                image: firstUrl(g.album_cover) || firstUrl(g.cover_image),
                mood: Number(mood) || 0,
                price: Number(g.gift_price) || 199
            };
        }
    };
    const walk = (node, mood) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(n => walk(n, mood)); return; }
        const m = node.mood_id ?? node.moodId ?? mood;
        if (node.data) walk(node.data, m);
        if (Array.isArray(node.tabs)) node.tabs.forEach(t => addTab(t, m));
        if (node.tab) addTab(node.tab, m);
        if (Array.isArray(node.gifts) && !node.tabs) addTab(node, m);
        if (Array.isArray(node.pages)) walk(node.pages, m);
    };
    walk(json, 0);
    if (Object.keys(out).length) return out;
    // Dạng danh mục gọn {id: {lyrics, song, artist, image, mood, price}} (file app/script xuất ra)
    if (json && typeof json === 'object' && !Array.isArray(json)) {
        for (const [id, s] of Object.entries(json)) {
            if (!/^\d+$/.test(id) || !s || typeof s !== 'object') continue;
            if (!(s.song || s.lyrics || s.image)) continue;
            out[id] = {
                lyrics: String(s.lyrics || ''), song: String(s.song || ''), artist: String(s.artist || ''),
                image: String(s.image || ''), mood: Number(s.mood) || 0, price: Number(s.price) || 199
            };
        }
    }
    return out;
}

module.exports = {
    MUSIC_GIFT_ID, MUSIC_GIFT_TYPE, MUSIC_GIFT_ICON, MUSIC_GIFT_ITEM,
    isMusicGiftEvent, isMusicImageUrl, musicInfoFromEvent, mergeCatalog, songLabel, expandSeed, compactSeed,
    aliasMusicGift, withMusicGiftItem, learnSong, catalogFromTikTokJson
};
