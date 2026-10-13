'use strict';
/* VIP Welcome — sổ xu: tổng xu mỗi người đã tặng TỪNG KÊNH, cộng dồn qua mọi buổi LIVE.
 * TikTok không cho biết lịch sử tặng → app tự đếm và lưu đĩa. Ghi trễ (gộp nhiều quà), ghi file tạm rồi
 * rename để không hỏng file khi tắt máy giữa chừng. File hỏng → giữ bản .bad-<ts>, bắt đầu rỗng. */

const fs = require('fs');
const path = require('path');

function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function createGiftLedger({ file, saveDelayMs = 5000 } = {}) {
    let data = { version: 1, hosts: {} };
    let timer = null;

    try {
        if (file && fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (raw && typeof raw.hosts === 'object' && raw.hosts) data = { version: 1, hosts: raw.hosts };
        }
    } catch (e) {
        try { fs.renameSync(file, file + '.bad-' + Date.now()); } catch (e2) {}
        console.warn('[vipwelcome] Sổ xu hỏng, bắt đầu sổ mới:', e.message);
    }

    const hostKey = h => String(h || '_').toLowerCase();
    function hostMap(h) {
        const k = hostKey(h);
        if (!data.hosts[k]) data.hosts[k] = {};
        return data.hosts[k];
    }

    function flushSync() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!file) return;
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const tmp = file + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(data));
            fs.renameSync(tmp, file);
        } catch (e) {
            console.warn('[vipwelcome] Ghi sổ xu lỗi:', e.message);
        }
    }
    function scheduleSave() {
        if (timer) return;
        timer = setTimeout(() => { timer = null; flushSync(); }, saveDelayMs);
        if (timer.unref) timer.unref();
    }

    return {
        add(host, key, xu, meta) {
            const n = Number(xu);
            if (!key || !Number.isFinite(n) || n <= 0) return;
            const m = hostMap(host);
            const e = m[key] || (m[key] = { xu: 0, uniqueId: '', nickname: '', lastAt: 0 });
            e.xu += Math.floor(n);
            if (meta?.uniqueId) e.uniqueId = String(meta.uniqueId);
            if (meta?.nickname) e.nickname = String(meta.nickname);
            e.lastAt = Date.now();
            scheduleSave();
        },
        get(host, key) {
            return data.hosts[hostKey(host)]?.[key]?.xu || 0;
        },
        list(host, { q = '', limit = 200 } = {}) {
            const m = data.hosts[hostKey(host)] || {};
            const needle = fold(q).trim();
            return Object.entries(m)
                .map(([key, e]) => ({ key, xu: e.xu || 0, uniqueId: e.uniqueId || '', nickname: e.nickname || '', lastAt: e.lastAt || 0 }))
                .filter(e => !needle || fold(e.uniqueId).includes(needle) || fold(e.nickname).includes(needle))
                .sort((a, b) => b.xu - a.xu)
                .slice(0, Math.max(1, limit));
        },
        set(host, key, xu) {
            if (!key) return;
            const m = hostMap(host);
            const n = Math.max(0, Math.floor(Number(xu) || 0));
            m[key] = { ...(m[key] || { uniqueId: '', nickname: '' }), xu: n, lastAt: Date.now() };
            scheduleSave();
        },
        reset(host) {
            data.hosts[hostKey(host)] = {};
            scheduleSave();
        },
        // Người dùng lúc đầu chỉ biết @id (key 'u:abc'), sau mới biết userId → gộp về key userId.
        rekey(host, fromKey, toKey) {
            const m = data.hosts[hostKey(host)];
            if (!m || !m[fromKey] || fromKey === toKey) return;
            const from = m[fromKey];
            const to = m[toKey] || { xu: 0, uniqueId: '', nickname: '', lastAt: 0 };
            m[toKey] = { xu: (to.xu || 0) + (from.xu || 0), uniqueId: to.uniqueId || from.uniqueId, nickname: to.nickname || from.nickname, lastAt: Math.max(to.lastAt || 0, from.lastAt || 0) };
            delete m[fromKey];
            scheduleSave();
        },
        flushSync
    };
}

module.exports = { createGiftLedger };
