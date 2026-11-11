'use strict';
/**
 * Lượt chơi theo quà — dùng chung cho 🕹️ Gắp Thú + 🎲 Xúc Xắc (spec 2026-11-12-gapthu-xucxac-design.md §2.1).
 * Hàm THUẦN + hàng chờ + runner (đồng hồ tiêm vào được để test). Server quyết kết quả từng lượt rồi phát cho mọi màn.
 */

const MAX_PER_GIFT = 10;   // trần lượt cho 1 lần tặng (combo ×999 không khoá máy hàng chục phút)
const MIN_TURN_MS = 2000;

const int = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Quà → { turns, sure }. cfg.gifts = [{giftId, turns, sure}] (so id), cfg.anyGift (mặc định bật) = quà lạ 1 lượt/lần. */
function turnsForGift(cfg, gift) {
    const id = String(gift?.giftId ?? '').trim();
    if (!id) return { turns: 0, sure: false };
    const repeat = Math.max(1, int(gift?.repeatCount, 1));
    const rule = (Array.isArray(cfg?.gifts) ? cfg.gifts : []).find(g => String(g?.giftId ?? '') === id);
    if (rule) return { turns: clamp(Math.max(1, int(rule.turns, 1)) * repeat, 1, MAX_PER_GIFT), sure: !!rule.sure };
    if (cfg && cfg.anyGift === false) return { turns: 0, sure: false };
    return { turns: clamp(repeat, 1, MAX_PER_GIFT), sure: false };
}

/** Thời lượng 1 lượt (ms): chuẩn 3–5 giây, hàng chờ dài thì nhanh dần, không dưới 2 giây. */
function turnMs(turnSec, queueLen) {
    const base = clamp(Number(turnSec) || 4, 3, 5) * 1000;
    const q = Math.max(0, int(queueLen, 0));
    const k = q >= 12 ? 0.55 : q >= 5 ? 0.75 : 1;
    return Math.max(MIN_TURN_MS, Math.round(base * k));
}

function createQueue({ max = 30 } = {}) {
    let items = [];
    return {
        push(list) {
            const room = Math.max(0, max - items.length);
            const take = (list || []).slice(0, room);
            items.push(...take);
            return take.length;
        },
        shift: () => items.shift(),
        size: () => items.length,
        list: () => items.slice(),
        clear() { items = []; }
    };
}

/**
 * Runner: chạy lần lượt từng lượt. onTurn(item, ms, left) phát kết quả; sau ms + gapMs chạy lượt kế.
 * clock = { setTimeout, clearTimeout } (mặc định global). turnSec() đọc cấu hình mới nhất mỗi lượt.
 */
function createRunner({ onTurn, turnSec = () => 4, max = 30, gapMs = 250, clock } = {}) {
    const ck = clock || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: t => clearTimeout(t) };
    const q = createQueue({ max });
    let timer = null, running = false;
    function play(item) {
        running = true;
        const ms = turnMs(turnSec(), q.size());
        try { onTurn(item, ms, q.size()); } catch (e) { /* lượt lỗi không được làm kẹt hàng chờ */ }
        timer = ck.setTimeout(next, ms + gapMs);
    }
    function next() {
        timer = null;
        const item = q.shift();
        if (item === undefined) { running = false; return; }
        play(item);
    }
    return {
        /** Thêm lượt; máy rảnh thì lượt đầu chạy NGAY (không chiếm chỗ hàng chờ). Trả số lượt nhận. */
        add(list) {
            const items = (list || []).slice();
            if (!items.length) return 0;
            if (running) return q.push(items);
            const first = items.shift();
            const n = 1 + q.push(items);
            play(first);
            return n;
        },
        clear() { q.clear(); },
        size: () => q.size(),
        list: () => q.list(),
        busy: () => running,
        stop() { q.clear(); if (timer) ck.clearTimeout(timer); timer = null; running = false; }
    };
}

module.exports = { MAX_PER_GIFT, turnsForGift, turnMs, createQueue, createRunner };
