/* Đập Muỗi — nốt muỗi cắn (bump), thuần (không DOM). Nốt lưu theo toạ độ CỤC BỘ trên khung đầu/thân
 * (public/lib/body-frames.mjs) nên bám theo người; overlay gọi list(frames, now) mỗi khung để vẽ.
 *
 *   createBumps(cfg) → { add(mark, now), tick(now), list(frames, now), count(), startHeal(now), stopHeal(), heal(now), setConfig(cfg) }
 *   mark: { frame:'head'|'torso', a, b, zone }
 *   Sống cfg.bumpSec giây, 30% cuối mờ dần, trần cfg.maxBumps (xoá cũ nhất).
 *   Xoa kem: startHeal → mỗi HEAL_GAP ms bắt đầu một nốt (cũ nhất), xoa HEAL_RUB ms rồi xoá. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.dapmuoiBumps = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const HEAL_GAP = 500;      // ms nghỉ giữa hai nốt
    const HEAL_RUB = 800;      // ms xoa một nốt
    const PULSE_MS = 2000;     // phập phồng lúc mới nổi
    function num(v, f) { const n = Number(v); return Number.isFinite(n) ? n : f; }

    function stage(mark, F) {
        if (!F || !mark) return null;
        const f = mark.frame === 'head' ? F.head : F.torso;
        if (!f) return null;
        return { x: f.O.x + f.u.x * mark.a + f.v.x * mark.b, y: f.O.y + f.u.y * mark.a + f.v.y * mark.b };
    }

    function createBumps(config) {
        let cfg = { bumpSec: 30, maxBumps: 12 };
        setConfig(config);
        let bumps = [];            // { frame, a, b, zone, t0 }
        let heal = null;           // { cur: bump|null, at: ms bắt đầu xoa, nextAt }

        function setConfig(c) { c = c || {}; cfg = { bumpSec: Math.max(1, num(c.bumpSec, 30)), maxBumps: Math.max(1, Math.floor(num(c.maxBumps, 12))) }; }
        function ttl() { return cfg.bumpSec * 1000; }

        function add(mark, now) {
            if (!mark || !mark.frame) return null;
            const b = { frame: mark.frame, a: num(mark.a, 0), b: num(mark.b, 0), zone: mark.zone || '', t0: num(now, 0) };
            bumps.push(b);
            while (bumps.length > cfg.maxBumps) remove(bumps[0]);
            return b;
        }
        function remove(b) { bumps = bumps.filter(x => x !== b); if (heal && heal.cur === b) { heal.cur = null; heal.nextAt = -Infinity; } }
        function tick(now) { for (const b of bumps.slice()) if (now - b.t0 >= ttl()) remove(b); }
        function count() { return bumps.length; }

        function startHeal(now) { heal = { cur: null, at: 0, nextAt: num(now, 0) }; }
        function stopHeal() { heal = null; }
        // Trả nốt đang xoa + tiến độ 0..1, hoặc null. Hết thời gian xoa thì xoá nốt, nghỉ HEAL_GAP rồi lấy nốt kế (cũ nhất).
        function healStep(now) {
            if (!heal) return null;
            if (heal.cur) {
                const p = (now - heal.at) / HEAL_RUB;
                if (p >= 1) { remove(heal.cur); heal.cur = null; heal.nextAt = now + HEAL_GAP; return null; }
                return { bump: heal.cur, progress: Math.max(0, p) };
            }
            if (now >= heal.nextAt && bumps.length) {
                heal.cur = bumps.reduce((a, b) => a.t0 <= b.t0 ? a : b); heal.at = now;
                return { bump: heal.cur, progress: 0 };
            }
            return null;
        }

        function list(F, now) {
            if (!F || !F.seen) return [];
            const t = num(now, 0);
            const out = [];
            for (const b of bumps) {
                const p = stage(b, F); if (!p) continue;
                const age = t - b.t0, life = ttl();
                const fadeFrom = life * 0.7;
                const alpha = age <= fadeFrom ? 1 : Math.max(0, 1 - (age - fadeFrom) / (life - fadeFrom));
                const scale = age < PULSE_MS ? 1 + 0.18 * Math.abs(Math.sin(age / PULSE_MS * Math.PI * 3)) * (1 - age / PULSE_MS) : 1;
                const healing = !!(heal && heal.cur === b);
                const progress = healing ? Math.min(1, Math.max(0, (t - heal.at) / HEAL_RUB)) : 0;
                out.push({ x: p.x, y: p.y, alpha, scale, zone: b.zone, frame: b.frame, t0: b.t0, healing, progress });
            }
            return out;
        }

        return { add, tick, list, count, startHeal, stopHeal, heal: healStep, setConfig };
    }

    return { createBumps, HEAL_GAP, HEAL_RUB };
});
