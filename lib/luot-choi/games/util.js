'use strict';
// Tiện ích chung cho luật thuần các trò (không I/O).
const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    if (v == null || v === '' || !Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
};
const randInt = (rng, n) => Math.min(n - 1, Math.floor((rng || Math.random)() * n));   // 0…n-1
const shuffle = (arr, rng) => {
    for (let i = arr.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
};
module.exports = { clampInt, randInt, shuffle };
