'use strict';
/* VIP Welcome — sổ ghé phòng: mỗi người đã ghé BAO NHIÊU BUỔI LIVE của từng kênh (ra vào nhiều lần trong
 * 1 buổi vẫn tính 1), chuỗi buổi liền nhau, số buổi trong tháng. Buổi = roomId TikTok cấp mỗi lần phát
 * (kết nối lại giữa buổi giữ nguyên roomId). Lưu đĩa: ghi trễ, ghi file tạm rồi rename; file hỏng → .bad-<ts>. */

const fs = require('fs');
const path = require('path');

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const safe = k => (FORBIDDEN.has(k) ? '_' + k : k);
const MAX_ROOMS = 400;

function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function monthOf(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function bare() { return Object.create(null); }

function createVisits({ file, saveDelayMs = 5000 } = {}) {
    let hosts = bare();
    let timer = null;

    try {
        if (file && fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const h of Object.keys(raw?.hosts || {})) {
                if (FORBIDDEN.has(h)) continue;
                const src = raw.hosts[h] || {};
                const users = bare();
                for (const k of Object.keys(src.users || {})) {
                    if (FORBIDDEN.has(k)) continue;
                    users[k] = { ...src.users[k] };
                }
                hosts[h] = { rooms: Array.isArray(src.rooms) ? src.rooms.map(String).slice(-MAX_ROOMS) : [], users };
            }
        }
    } catch (e) {
        try { fs.renameSync(file, file + '.bad-' + Date.now()); } catch (e2) {}
        hosts = bare();
        console.warn('[vipwelcome] Sổ ghé phòng hỏng, bắt đầu sổ mới:', e.message);
    }

    const hk = h => safe(String(h || '_').toLowerCase());
    function host(h) {
        const k = hk(h);
        if (!hosts[k]) hosts[k] = { rooms: [], users: bare() };
        return hosts[k];
    }

    function flushSync() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!file) return;
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            const out = { version: 1, hosts: {} };
            for (const h of Object.keys(hosts)) out.hosts[h] = { rooms: hosts[h].rooms, users: { ...hosts[h].users } };
            fs.writeFileSync(file + '.tmp', JSON.stringify(out));
            fs.renameSync(file + '.tmp', file);
        } catch (e) { console.warn('[vipwelcome] Ghi sổ ghé phòng lỗi:', e.message); }
    }
    function scheduleSave() {
        if (timer) return;
        timer = setTimeout(() => { timer = null; flushSync(); }, saveDelayMs);
        if (timer.unref) timer.unref();
    }

    // Buổi liền trước roomId này của kênh (để tính chuỗi).
    function prevRoom(H, roomId) {
        const i = H.rooms.lastIndexOf(String(roomId));
        return i > 0 ? H.rooms[i - 1] : null;
    }

    function preview(H, u, roomId) {
        if (u && u.lastRoom === String(roomId)) return { visitNo: u.sessions, isFirst: u.sessions === 1, streak: u.streak };
        const sessions = (u?.sessions || 0) + 1;
        const prev = prevRoom(H, roomId);
        const streak = u && prev && u.lastRoom === prev ? (u.streak || 1) + 1 : 1;
        return { visitNo: sessions, isFirst: sessions === 1, streak };
    }

    return {
        startRoom(h, roomId) {
            if (!roomId) return;
            const H = host(h);
            const r = String(roomId);
            if (H.rooms.includes(r)) return;
            H.rooms.push(r);
            if (H.rooms.length > MAX_ROOMS) H.rooms.splice(0, H.rooms.length - MAX_ROOMS);
            scheduleSave();
        },
        peek(h, key, roomId) {
            const H = hosts[hk(h)] || { rooms: [], users: bare() };
            return preview(H, H.users[safe(String(key))], roomId);
        },
        record(h, key, roomId, meta, now) {
            const H = host(h);
            const k = safe(String(key));
            const u = H.users[k];
            const p = preview(H, u, roomId);
            if (u && u.lastRoom === String(roomId)) return { ...p, counted: false };
            const mk = monthOf(now);
            const next = u || { sessions: 0, firstAt: now, streak: 0, bestStreak: 0, monthKey: mk, monthCount: 0 };
            next.sessions = p.visitNo;
            next.streak = p.streak;
            next.bestStreak = Math.max(next.bestStreak || 0, p.streak);
            next.monthCount = next.monthKey === mk ? (next.monthCount || 0) + 1 : 1;
            next.monthKey = mk;
            next.lastRoom = String(roomId);
            next.lastAt = now;
            if (meta?.uniqueId) next.uniqueId = String(meta.uniqueId);
            if (meta?.nickname) next.nickname = String(meta.nickname);
            if (meta?.avatar) next.avatar = String(meta.avatar);
            H.users[k] = next;
            scheduleSave();
            return { ...p, counted: true };
        },
        top(h, { scope = 'all', limit = 10, q = '' } = {}, now = Date.now()) {
            const H = hosts[hk(h)];
            if (!H) return [];
            const mk = monthOf(now);
            const needle = fold(q).trim();
            return Object.keys(H.users)
                .map(key => ({ key, ...H.users[key] }))
                .filter(u => scope !== 'month' || u.monthKey === mk)
                .filter(u => !needle || fold(u.uniqueId).includes(needle) || fold(u.nickname).includes(needle))
                .sort((a, b) => scope === 'month'
                    ? (b.monthCount - a.monthCount) || (b.sessions - a.sessions)
                    : (b.sessions - a.sessions) || (b.bestStreak - a.bestStreak))
                .slice(0, Math.max(1, limit))
                .map(u => ({
                    key: u.key, uniqueId: u.uniqueId || '', nickname: u.nickname || '', avatar: u.avatar || '',
                    sessions: u.sessions || 0, monthCount: u.monthKey === mk ? (u.monthCount || 0) : 0,
                    streak: u.streak || 0, bestStreak: u.bestStreak || 0, lastAt: u.lastAt || 0
                }));
        },
        rekey(h, from, to) {
            const H = hosts[hk(h)];
            from = safe(String(from)); to = safe(String(to));
            if (!H || !H.users[from] || from === to) return;
            if (!H.users[to]) H.users[to] = H.users[from];
            delete H.users[from];
            scheduleSave();
        },
        reset(h) {
            hosts[hk(h)] = { rooms: [], users: bare() };
            scheduleSave();
        },
        flushSync
    };
}

module.exports = { createVisits };
