/* Đập Muỗi — nhận diện VỖ TAY thuần (không DOM). Vào: tay từ HpTracker ({ id, palm:{x,y}, size }) và
 * pose 33 khớp (11/12 vai, 15/16 cổ tay) đã ở hệ sân khấu 1080×1920. Ra: sự kiện đập { x, y, r, mode }.
 *
 * Luật (spec mục 3):
 *  1. 2 tay: khoảng cách lòng bàn tay d < clapDistance × cỡ tay TB và đang khép ≥ clapSpeed → clap tại trung điểm.
 *  2. Chỉ còn 1 tay nhưng khung trước thấy 2 tay đang khép nhanh và d trước < 2.5 × cỡ tay → vẫn clap
 *     (model tay hay rớt 1 tay đúng lúc chập).
 *  3. Dự phòng cổ tay (pose): dWrist < 0.45 × bề rộng vai và đang khép ≥ clapSpeed → clap tại trung điểm cổ tay.
 *     Chỉ chạy khi 1/2 không bắn trong khung này.
 *  4. Nghỉ clapCooldownMs sau mỗi cú. hitMode 'slap': 1 tay vụt ≥ slapSpeed → đập tại tay; 'both' = cả hai, tối đa 1 sự kiện/khung. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else { root.HpGame = root.HpGame || {}; root.HpGame.dapmuoiClap = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const STAGE_W = 1080;
    function num(v, fallback) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

    function createClapDetector(config) {
        let cfg = {};
        setConfig(config);
        // Khung trước của cặp tay: d, thời điểm, trung điểm, cỡ tay TB, tốc độ khép; giữ thêm 1 khung khi rớt tay (luật 2).
        let pair = null;          // { d, t, mid:{x,y}, size, closing }
        let pairStale = false;    // pair là của khung trước nữa (đã mất 1 tay 1 khung)
        let wrist = null;         // { d, t }
        let lastClapAt = -Infinity;
        const perHand = new Map();   // id → { x, y, t, lastSlapAt }

        function setConfig(c) {
            c = c || {};
            cfg = {
                hitMode: ['clap', 'slap', 'both'].includes(c.hitMode) ? c.hitMode : 'clap',
                clapDistance: num(c.clapDistance, 1.2), clapSpeed: num(c.clapSpeed, 900), slapSpeed: num(c.slapSpeed, 1200),
                clapCooldownMs: num(c.clapCooldownMs, 250), hitRadius: num(c.hitRadius, 14)
            };
        }
        function baseR() { return cfg.hitRadius / 100 * STAGE_W; }
        function wantClap() { return cfg.hitMode !== 'slap'; }
        function wantSlap() { return cfg.hitMode !== 'clap'; }

        function update(input) {
            const hands = Array.isArray(input && input.hands) ? input.hands.filter(h => h && h.palm) : [];
            const pose = input && Array.isArray(input.pose) && input.pose.length >= 17 ? input.pose : null;
            const now = num(input && input.now, 0);
            const out = [];
            const canFire = now - lastClapAt >= cfg.clapCooldownMs;
            let fired = false;

            // ---- luật 1 & 2: cặp tay ----
            if (hands.length >= 2) {
                const a = hands[0], b = hands[1];
                const d = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
                const size = (num(a.size, 100) + num(b.size, 100)) / 2;
                const mid = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };
                let closing = 0;
                if (pair && !pairStale && now > pair.t) closing = (pair.d - d) / (now - pair.t) * 1000;
                if (wantClap() && canFire && d < cfg.clapDistance * size && closing >= cfg.clapSpeed) {
                    out.push({ x: mid.x, y: mid.y, r: baseR() + size, mode: 'clap' }); fired = true;
                }
                pair = { d, t: now, mid, size, closing }; pairStale = false;
            } else if (pair && !pairStale) {
                // vừa mất 1 tay: nếu khung trước đang khép nhanh và đã gần → tính là chập tay
                if (wantClap() && canFire && pair.closing >= cfg.clapSpeed && pair.d < 2.5 * pair.size) {
                    const h = hands[0];
                    const p = h ? h.palm : pair.mid;
                    out.push({ x: p.x, y: p.y, r: baseR() + pair.size, mode: 'clap' }); fired = true;
                }
                pairStale = true;      // giữ 1 khung rồi bỏ
            } else {
                pair = null; pairStale = false;
            }

            // ---- luật 3: cổ tay từ pose ----
            if (pose) {
                const ls = pose[11], rs = pose[12], lw = pose[15], rw = pose[16];
                const ok = [ls, rs, lw, rw].every(p => p && num(p.v, 1) >= 0.35);
                if (ok) {
                    const shoulder = Math.hypot(ls.x - rs.x, ls.y - rs.y);
                    const d = Math.hypot(lw.x - rw.x, lw.y - rw.y);
                    let closing = 0;
                    if (wrist && now > wrist.t) closing = (wrist.d - d) / (now - wrist.t) * 1000;
                    if (!fired && wantClap() && canFire && shoulder > 1 && d < 0.45 * shoulder && closing >= cfg.clapSpeed) {
                        out.push({ x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2, r: baseR() + shoulder * 0.25, mode: 'wrist' }); fired = true;
                    }
                    wrist = { d, t: now };
                } else wrist = null;
            } else wrist = null;

            // ---- tát 1 tay ----
            const seen = new Set();
            for (const h of hands) {
                const id = String(h.id || 'h');
                seen.add(id);
                const prev = perHand.get(id);
                if (prev && now > prev.t && !fired && wantSlap()) {
                    const v = Math.hypot(h.palm.x - prev.x, h.palm.y - prev.y) / (now - prev.t) * 1000;
                    if (v >= cfg.slapSpeed && now - prev.lastSlapAt >= cfg.clapCooldownMs && canFire) {
                        out.push({ x: h.palm.x, y: h.palm.y, r: baseR() + num(h.size, 100), mode: 'slap' }); fired = true;
                        prev.lastSlapAt = now;
                    }
                }
                perHand.set(id, { x: h.palm.x, y: h.palm.y, t: now, lastSlapAt: prev ? prev.lastSlapAt : -Infinity });
            }
            for (const id of [...perHand.keys()]) if (!seen.has(id)) perHand.delete(id);

            if (fired) lastClapAt = now;
            return out;
        }

        return { update, setConfig };
    }

    return { createClapDetector };
});
