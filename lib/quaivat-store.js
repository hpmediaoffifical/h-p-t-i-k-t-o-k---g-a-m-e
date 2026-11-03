'use strict';
/* 🧟 Zombie Phá Nhà — dữ liệu lưu trên máy streamer (<DATA_DIR>):
   - quaivat-session.json: WIN / chặng / map / số map đã qua → OBS hay cửa sổ game tải lại không mất tiến độ (giữ 6 giờ)
   - quaivat-fame.json: sổ TOP TUẦN theo xu quà (tuần ISO, đổi tuần tự làm mới) — server ghi từ sự kiện quà,
     chỉ khi game đang chạy (game gửi nhịp tim qua POST /api/quaivat/session) → không đếm đôi khi mở 2 bản game.
   Test: tests/quaivat-store.test.js */
const fs = require('fs');
const path = require('path');

const SESSION_MAX_AGE = 6 * 3600 * 1000;
const ALIVE_MS = 30 * 1000;

// Tuần ISO (thứ Hai đầu tuần) theo giờ máy streamer: "2026-W45"
function weekKey(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = t.getUTCFullYear();
    const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeJson(file, obj) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj)); return true; } catch (e) { return false; }
}
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

function cleanSession(b) {
    if (!b || typeof b !== 'object') return null;
    return { win: int(b.win, 0, 9999), stage: int(b.stage, 1, 9999), map: int(b.map, 0, 63), cleared: int(b.cleared, 0, 1e6), round: int(b.round, 1, 1e6) };
}

function createStore(dir, { now = () => Date.now(), clock = () => new Date() } = {}) {
    const sessFile = path.join(dir, 'quaivat-session.json');
    const fameFile = path.join(dir, 'quaivat-fame.json');
    let fame = readJson(fameFile);
    if (!fame || typeof fame !== 'object' || !fame.users) fame = { week: weekKey(clock()), users: {} };
    let aliveAt = 0, saveTimer = null;

    function rollWeek() { const k = weekKey(clock()); if (fame.week !== k) { fame = { week: k, users: {} }; save(); } }
    function save() { clearTimeout(saveTimer); saveTimer = null; writeJson(fameFile, fame); }
    function saveSoon() { if (!saveTimer) saveTimer = setTimeout(save, 3000); if (saveTimer.unref) saveTimer.unref(); }

    return {
        weekKey,
        // game đang chạy? (nhịp tim từ game ≤ 30 giây trước)
        alive() { return now() - aliveAt < ALIVE_MS; },
        saveSession(body) {
            const s = cleanSession(body); if (!s) return null;
            aliveAt = now(); s.at = now();
            writeJson(sessFile, s);
            return s;
        },
        loadSession(maxAge = SESSION_MAX_AGE) {
            const s = readJson(sessFile); if (!s || !(now() - (Number(s.at) || 0) < maxAge)) return null;
            return { ...cleanSession(s), at: Number(s.at) };
        },
        // quà trong lúc game chạy → cộng xu vào sổ tuần
        addGift({ uid, name, avatar, coins }) {
            const c = Math.max(0, Math.round(Number(coins) || 0));
            if (!uid || !c) return false;
            rollWeek();
            const u = fame.users[uid] || (fame.users[uid] = { name: '', avatar: '', coins: 0, gifts: 0 });
            u.name = String(name || u.name || uid).slice(0, 40); if (avatar) u.avatar = String(avatar).slice(0, 500);
            u.coins += c; u.gifts++;
            saveSoon();
            return true;
        },
        top(n = 5) {
            rollWeek();
            return Object.entries(fame.users).map(([id, u]) => ({ id, name: u.name, avatar: u.avatar, coins: u.coins }))
                .sort((a, b) => b.coins - a.coins).slice(0, Math.max(1, Math.min(20, n)));
        },
        week() { rollWeek(); return fame.week; },
        flush: save,
        _markAlive() { aliveAt = now(); },
    };
}

module.exports = { createStore, weekKey, cleanSession, SESSION_MAX_AGE };
