// 🎵 Tải trọn danh mục quà Ca khúc TikTok (6 tâm trạng × mọi tab × mọi trang) → file ca-khuc-tiktok.json
// để nhập vào app bằng nút "🎵 Nhập Ca khúc" (Danh sách quà).
//
// Cách chạy (Chrome / Cốc Cốc / Edge, đã ĐĂNG NHẬP tiktok.com):
//   1. Mở https://webcast.tiktok.com/webcast/gift/music/moods/?aid=1988 (trang chữ JSON là được).
//   2. F12 → tab Console → dán toàn bộ file này → Enter (lần đầu Chrome bắt gõ "allow pasting").
//   3. Chờ dòng "XONG" — trình duyệt tự tải file ca-khuc-tiktok.json.
// ROOM_ID: phòng LIVE bất kỳ (TikTok bắt có tham số, không cần đang LIVE với danh mục); đổi nếu báo lỗi.
(async () => {
    const ROOM_ID = '7696806637222251316';
    const MAX_PAGES_PER_TAB = 60;
    const base = 'https://webcast.tiktok.com/webcast/gift/music/';
    const q = 'aid=1988&app_name=tiktok_web&device_platform=web_pc&room_id=' + ROOM_ID;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const get = async (url) => (await fetch(url, { credentials: 'include' })).json();
    const pick = (g) => ({
        gift_id: g.gift_id, gift_price: g.gift_price, song_name: g.song_name, lyrics_text: g.lyrics_text,
        artist: { name: g.artist && g.artist.name },
        album_cover: { url_list: ((g.album_cover && g.album_cover.url_list) || []).slice(0, 1) }
    });
    const moodsRes = await get(base + 'moods/?' + q);
    const moods = (moodsRes.data && moodsRes.data.moods) || [];
    if (!moods.length) { console.error('Không lấy được tâm trạng — đã đăng nhập TikTok chưa?', moodsRes); return; }
    const out = [];
    const seen = new Set();
    for (const m of moods) {
        const first = await get(base + 'list/?' + q + '&mood_id=' + m.mood_id + '&gift_id=0');
        const tabs = (first.data && first.data.tabs) || [];
        if (!tabs.length) console.warn('Tâm trạng', m.name, 'không có tab:', first);
        for (const t of tabs) {
            let tab = t;
            for (let page = 0; tab && page < MAX_PAGES_PER_TAB; page++) {
                const gifts = (tab.gifts || []).map(pick);
                gifts.forEach(g => seen.add(String(g.gift_id)));
                out.push({ mood_id: m.mood_id, tabs: [{ tab_id: t.tab_id, tab_name: t.tab_name, gifts }] });
                if (!tab.has_more || !tab.pagination_token) break;
                await sleep(350);
                const next = await get(base + 'list_pagination/?' + q + '&mood_id=' + m.mood_id + '&tab_id=' + t.tab_id
                    + '&pagination_token=' + encodeURIComponent(tab.pagination_token));
                tab = next.data && next.data.tab;
                if (!tab) console.warn('Dừng trang', t.tab_name, next);
            }
        }
        console.log('🎵', m.name, '→ tổng', seen.size, 'bài');
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = 'ca-khuc-tiktok.json';
    document.body.appendChild(a);
    a.click();
    console.log('XONG —', seen.size, 'bài, file ca-khuc-tiktok.json');
})();
