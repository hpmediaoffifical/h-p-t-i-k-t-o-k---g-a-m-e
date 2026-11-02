'use strict';
/* 🏢 Creator Online — bộ đếm fan trọn đời (server). Spec docs/superpowers/specs/2026-11-03-creatoronline-design.md §11.
 *
 * - Lưu { [fanKey]: { name, xu, club, clubAt, lastSeen } } vào <DATA_DIR>/creatoronline-fans.json.
 * - Server là nơi quyết định club + thời gian chờ đổi club; overlay chỉ hiện theo sự kiện 'creatoronline:fan'.
 * - Ghi kiểu nguyên tử (file tạm → rename), debounce; flushSync() gọi ở mọi đường thoát app.
 * - Chỉ bỏ mục DƯỚI keepMinXu không gặp quá keepDays ngày: fan đã có cấp giữ vĩnh viễn (quyết định 3).
 * - parseClubCode phải khớp public/games/creatoronline/js/logic/codes.js (test so 2 bộ trên cùng mẫu):
 *   cả câu bình luận sau stripVN phải đúng /^(?:g ?)?([1-5])$/.
 */
const fs = require('fs');

const DEFAULT_RANKS = [{ min: 0, label: 'Fan mới' }, { min: 100, label: 'Fan cứng' }, { min: 500, label: 'Fan VIP' }, { min: 2000, label: 'Đại gia' }, { min: 10000, label: 'Thần tài' }];

function stripVN(text) {
    if (typeof text !== 'string') return '';
    return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 1..5 khi CẢ câu là mã club ('1', ' 3 ', 'G2', 'g 4'); '5 sao', '12' → null. */
function parseClubCode(text) {
    const m = /^(?:g ?)?([1-5])$/.exec(stripVN(text));
    return m ? Number(m[1]) : null;
}

/** Khoá người xem dùng chung server + overlay: userId (ổn định) hoặc uniqueId viết thường. */
function fanKey(d) {
    if (!d) return '';
    if (d.userId != null && String(d.userId) !== '' && String(d.userId) !== '0') return String(d.userId);
    return d.uniqueId ? String(d.uniqueId).toLowerCase() : '';
}

/** Chỉ số cấp trong `ranks` (0 = Fan mới). */
function rankIndex(xu, ranks = DEFAULT_RANKS) {
    let idx = 0;
    ranks.forEach((r, i) => { if (xu >= (Number(r.min) || 0)) idx = i; });
    return idx;
}

/** Quà thử của panel / người xem giả (__creator.sim, test_…) không vào bộ đếm. */
function isFakeEvent(d) {
    if (!d) return true;
    if (d.source === 'test') return true;
    const k = fanKey(d);
    return !k || /^(sim|test_)/.test(k) || k === 'tester';
}

function createFanLedger({ file, now = () => Date.now(), ranks = DEFAULT_RANKS, keepDays = 180, keepMinXu = 100, saveDelayMs = 30000 } = {}) {
    let fans = Object.create(null);
    let timer = null;
    let dirty = false;

    function load() {
        if (!file) return;
        try {
            if (!fs.existsSync(file)) return;
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            const src = raw && raw.fans && typeof raw.fans === 'object' ? raw.fans : {};
            for (const [k, v] of Object.entries(src)) {
                if (!k || !v || typeof v !== 'object') continue;
                fans[k] = {
                    name: String(v.name || '').slice(0, 40),
                    xu: Math.max(0, Math.floor(Number(v.xu) || 0)),
                    club: Number.isInteger(v.club) && v.club >= 1 && v.club <= 5 ? v.club : null,
                    clubAt: Number(v.clubAt) || 0,
                    lastSeen: Number(v.lastSeen) || 0,
                };
            }
            prune();
        } catch (e) {
            try { fs.renameSync(file, file + '.bad-' + Date.now()); } catch (e2) {}
            fans = Object.create(null);
        }
    }

    /** Bỏ người dưới keepMinXu xu không gặp quá keepDays ngày. */
    function prune() {
        const cutoff = now() - keepDays * 86400000;
        let n = 0;
        for (const [k, f] of Object.entries(fans)) {
            if (f.xu < keepMinXu && f.lastSeen < cutoff) { delete fans[k]; n++; }
        }
        if (n) dirty = true;
        return n;
    }

    function flushSync() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!file || !dirty) return;
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ v: 1, fans }));
        fs.renameSync(tmp, file);
        dirty = false;
    }
    function scheduleSave() {
        dirty = true;
        if (timer || !file) return;
        timer = setTimeout(() => { timer = null; try { flushSync(); } catch (e) {} }, saveDelayMs);
        if (timer.unref) timer.unref();
    }

    function ensure(key, name) {
        let f = fans[key];
        if (!f) f = fans[key] = { name: '', xu: 0, club: null, clubAt: 0, lastSeen: 0 };
        if (name) f.name = String(name).slice(0, 40);
        f.lastSeen = now();
        return f;
    }
    const view = (key, f) => ({ id: key, name: f.name, xu: f.xu, rank: rankIndex(f.xu, ranks), club: f.club });

    /** Giá trị hiện tại (để gắn coFan vào sự kiện trước khi cộng). null = chưa có. */
    function get(key) {
        const f = key ? fans[key] : null;
        return f ? view(key, f) : null;
    }

    /**
     * Quà: cộng xu = coinValue × repeatCount. Trả về view sau khi cộng (để phát 'creatoronline:fan'), null nếu bỏ qua.
     * @param {{userId?, uniqueId?, nickname?, coinValue?, diamondCount?, repeatCount?, source?}} g
     */
    function onGift(g) {
        if (isFakeEvent(g)) return null;
        const key = fanKey(g);
        const coins = Math.max(1, Math.round(Number(g.coinValue ?? g.diamondCount) || 1));
        const count = Math.max(1, Math.round(Number(g.repeatCount) || 1));
        const f = ensure(key, g.nickname || g.uniqueId);
        f.xu += coins * count;
        scheduleSave();
        return view(key, f);
    }

    /**
     * Bình luận: mã club 1–5 → đổi club nếu đã qua switchSec kể từ lần chọn trước.
     * Trả về view khi club đổi (để phát 'creatoronline:fan'), null nếu không đổi.
     */
    function onChat(c, { switchSec = 60 } = {}) {
        if (isFakeEvent(c)) return null;
        const club = parseClubCode(c.comment);
        const key = fanKey(c);
        const f = fans[key];
        if (club == null) {
            if (f) { f.lastSeen = now(); if (c.nickname) f.name = String(c.nickname).slice(0, 40); }
            return null;
        }
        const g = ensure(key, c.nickname || c.uniqueId);
        if (g.club === club) return null;
        if (g.club != null && now() - g.clubAt < switchSec * 1000) return null;
        g.club = club;
        g.clubAt = now();
        scheduleSave();
        return view(key, g);
    }

    function getMany(keys) {
        const out = {};
        for (const k of keys || []) { const v = get(String(k)); if (v) out[k] = v; }
        return out;
    }
    function top(n = 20) {
        return Object.entries(fans).filter(([, f]) => f.xu > 0).sort((a, b) => b[1].xu - a[1].xu || a[1].lastSeen - b[1].lastSeen)
            .slice(0, Math.max(1, Math.min(200, n))).map(([k, f]) => view(k, f));
    }
    function reset() {
        fans = Object.create(null);
        dirty = true;
        flushSync();
    }
    function size() { return Object.keys(fans).length; }

    load();
    return { get, getMany, onGift, onChat, top, reset, prune, flushSync, size };
}

module.exports = { createFanLedger, fanKey, parseClubCode, stripVN, rankIndex, isFakeEvent, DEFAULT_RANKS };
