// 🎬 Kiểu buổi LIVE — bấm 1 chip = bật đúng bộ game đã lưu, tắt các game còn lại.
// Phần thuần (chạy cả node test: tests/live-presets.test.js). Lưu ở server: GET/PUT /api/live-presets.
(function (root) {
    const DEFAULTS = [
        { id: 'pk', name: '⚔️ Buổi PK', games: ['pktiktok', 'vipwelcome', 'thuytinh'] },
        { id: 'chat', name: '💬 Trò chuyện', games: ['vipwelcome', 'votecomment', 'thuytinh'] },
        { id: 'game', name: '🎮 Chơi game', games: ['vipwelcome', 'caro', 'trongcay', 'nhatla'] },
        { id: 'cam', name: '🎥 Game camera', games: ['vipwelcome', 'camgames'] }
    ];
    const MAX = 12;

    function slug(name) {
        const base = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
        return base || 'buoi';
    }

    function normalize(list) {
        const src = Array.isArray(list) ? list : DEFAULTS;
        const out = [];
        const ids = new Set();
        for (const p of src) {
            if (!p || typeof p !== 'object') continue;
            const name = String(p.name || '').trim().slice(0, 32);
            if (!name) continue;
            let id = String(p.id || slug(name)).replace(/[^a-z0-9-]/gi, '').slice(0, 32) || slug(name);
            while (ids.has(id)) id += '-2';
            ids.add(id);
            const games = [...new Set((Array.isArray(p.games) ? p.games : []).map(String).filter(g => /^[a-zA-Z0-9_-]{1,40}$/.test(g)))];
            out.push({ id, name, games });
            if (out.length >= MAX) break;
        }
        return out;
    }

    // games: [{ id, on, togglable }] → game cần bật / cần tắt. Game không bật/tắt được (khoá, mục ảo) bỏ qua.
    function plan(preset, games) {
        const want = new Set((preset && preset.games) || []);
        const on = [], off = [];
        for (const g of games || []) {
            if (!g || g.togglable === false) continue;
            const should = want.has(g.id);
            if (should && !g.on) on.push(g.id);
            else if (!should && g.on) off.push(g.id);
        }
        return { on, off };
    }

    // Chip nào khớp đúng bộ game đang bật (để tô nổi)?
    function activeId(presets, games) {
        const cur = (games || []).filter(g => g && g.togglable !== false && g.on).map(g => g.id).sort().join(',');
        const usable = new Set((games || []).filter(g => g && g.togglable !== false).map(g => g.id));
        for (const p of presets || []) {
            const set = (p.games || []).filter(id => usable.has(id)).sort().join(',');
            if (set && set === cur) return p.id;
        }
        return '';
    }

    const api = { DEFAULTS, normalize, plan, activeId, slug };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.HpLivePresets = api;
})(typeof window !== 'undefined' ? window : globalThis);
