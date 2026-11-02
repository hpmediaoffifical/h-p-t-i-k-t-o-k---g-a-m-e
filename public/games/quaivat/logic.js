/* 🧟 Zombie Phá Nhà — luật thuần, KHÔNG dính Three.js / DOM → test bằng `node --test` (tests/quaivat-logic.test.mjs).
   game.js import các hàm ở đây; đổi luật thì sửa + chạy test ở đây trước. */

const pickR = (a, rnd) => a[Math.floor(rnd() * a.length)];

// Quà lạ (chưa gán, không khớp tên) → quy hành động theo số xu
export function actionByCoins(c, rnd = Math.random) {
  if (c >= 1000) return 'quake';
  if (c >= 500) return 'hand';
  if (c >= 200) return pickR(['boulder', 'meteor'], rnd);
  if (c >= 99) return 'lightning';                       // bóng bay là quà CỨU zombie → không tự quy vào phe chặn
  if (c >= 25) return pickR(['bomb', 'crows'], rnd);
  if (c >= 15) return pickR(['fox', 'crows'], rnd);
  if (c >= 10) return pickR(['flower', 'bees'], rnd);
  if (c >= 5) return pickR(['repair', 'net'], rnd);
  return pickR(['rose', 'barrel', 'xbarrel', 'trap', 'tire', 'slime', 'banana'], rnd);
}

// Quà đắt hơn giá món trong bảng → chạy ĐỦ theo xu thật (Lion 29.999 xu ở món Đá lăn 299 xu = 100 lần).
// base = giá (xu) của món; coins = xu thật của 1 quà. WIN/THUA ngay luôn 1 lần/quà.
export function giftRuns(action, base, coins) {
  if (action === 'win' || action === 'lose') return 1;
  if (!(base > 0) || !(coins >= base * 1.5)) return 1;
  return Math.max(1, Math.round(coins / base));
}

// Tim cả phòng: phòng càng đông thì cần nhiều tim hơn cho 1 cục đá (tối đa ~8 đá/phút từ tim), giờ vàng giảm nửa.
// base = ngưỡng streamer cài (qvLikePer), recent = số tim 60 giây gần nhất.
export const STONES_PER_MIN = 8;
export function likesPerStone(base, recent, golden = false) {
  const per = Math.max(1, Math.round(base) || 1, Math.ceil((recent || 0) / STONES_PER_MIN));
  return golden ? Math.max(1, Math.round(per / 2)) : per;
}

// Túi mù: món rẻ ra nhiều, món đắt ra hiếm (trọng số ~ 1/giá) → kỳ vọng gần giá túi chứ không ~100 xu như trước
export function mysteryWeights(pool) { return pool.map(g => 1 / Math.max(1, g.coins || 1)); }
export function mysteryPick(pool, rnd = Math.random) {
  const w = mysteryWeights(pool), tot = w.reduce((a, b) => a + b, 0);
  let r = rnd() * tot;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
export function mysteryExpect(pool) {
  const w = mysteryWeights(pool), tot = w.reduce((a, b) => a + b, 0);
  return pool.reduce((a, g, i) => a + (g.coins || 0) * w[i] / tot, 0);
}

// Combo: ghi công người góp nhiều nhất trong cửa sổ 10 giây (trước đây chỉ người tặng cuối)
export function comboCredit(log) {
  const by = new Map();
  for (const e of log) { if (!e.u) continue; const k = e.u.id; const o = by.get(k) || { u: e.u, n: 0 }; o.n += e.n; by.set(k, o); }
  return [...by.values()].sort((a, b) => b.n - a.n);
}

// ⏳ GIỮ NHÀ: zombie qua cột mốc (hoặc tới gần cửa khi tắt cột mốc) → đếm ngược; hết giờ cửa còn = KHÁN GIẢ THẮNG
export function holdSeconds(mapIndex, base = 75, perMap = 10) { return Math.round(base + perMap * Math.max(0, mapIndex || 0)); }

// 🧠 CƠN ĐÓI: mỗi mét bị đẩy lùi nạp thanh; đầy (full mét) → LÊN CƠN `rageSec` giây (đi nhanh, đấm mạnh), không bỏ quà nào
export const HUNGER_FULL = 30, RAGE_SEC = 6;
export function hungerAdd(h, meters, full = HUNGER_FULL) {
  const v = (h || 0) + Math.max(0, meters || 0) / full;
  return v >= 1 ? { h: 0, rage: true } : { h: v, rage: false };
}

// Mốc WIN: 5/10/15 → ăn mừng nhỏ, đủ mục tiêu → VÔ ĐỊCH chặng (rồi sang chặng mới 0/target)
export function winMilestone(prev, next, target) {
  if (next <= prev) return null;
  if (next >= target) return 'goal';
  if (Math.floor(next / 5) > Math.floor(prev / 5)) return 'mid';
  return null;
}

// Chia trang danh sách chip (cột quà dài) — trang chứa phần tử i
export function pageCount(n, per) { return Math.max(1, Math.ceil(n / Math.max(1, per))); }
export function pageOf(i, per) { return Math.floor(i / Math.max(1, per)); }

// Hàng đợi thông báo giữa màn: MỖI LÚC 1 cái, ưu tiên cao chen ngang, cùng `key` thì gộp, dài quá thì bỏ cái ưu tiên thấp nhất
export class NoteQueue {
  constructor(max = 5) { this.q = []; this.cur = null; this.max = max; this.seq = 0; }
  push(note, now) {
    const n = { prio: 1, dur: 2, ...note, seq: ++this.seq };
    if (n.key && this.cur && this.cur.key === n.key) { Object.assign(this.cur, n, { at: this.cur.at, seq: this.cur.seq }); this.cur.dirty = true; return this.cur; }
    if (!this.cur || n.prio > this.cur.prio) { this.cur = { ...n, at: now }; return this.cur; }
    const same = n.key ? this.q.findIndex(x => x.key === n.key) : -1;
    if (same >= 0) this.q[same] = { ...this.q[same], ...n, seq: this.q[same].seq };
    else this.q.push(n);
    this.q.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    while (this.q.length > this.max) this.q.pop();
    return null;
  }
  // gọi mỗi khung: trả note MỚI cần hiện (hoặc null); `this.cur` = note đang hiện (null = khe trống)
  tick(now) {
    if (this.cur && now - this.cur.at >= this.cur.dur) this.cur = null;
    if (!this.cur && this.q.length) { this.cur = { ...this.q.shift(), at: now }; return this.cur; }
    return null;
  }
  clear() { this.q.length = 0; this.cur = null; }
}

// Thời gian 1 ván theo độ dài map (dùng khi bật đồng hồ): map dài thì thêm giờ tương xứng
export function roundSecondsFor(base, length, ref = 94) { return Math.round(base * (length + 4) / ref); }
