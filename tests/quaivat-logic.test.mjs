// 🧟 Zombie Phá Nhà — luật thuần (public/games/quaivat/logic.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionByCoins, giftRuns, likesPerStone, mysteryPick, mysteryExpect, comboCredit,
  holdSeconds, hungerAdd, HUNGER_FULL, winMilestone, pageCount, pageOf, NoteQueue, roundSecondsFor,
} from '../public/games/quaivat/logic.js';
import { VILLAINS, HEROES } from '../public/games/quaivat/gift-data.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('giftRuns: Lion 29.999 xu ở món Đá lăn 299 xu → chạy 100 lần (không còn 1)', () => {
  assert.equal(giftRuns('boulder', 299, 29999), 100);
});
test('giftRuns: quà đúng giá hoặc lệch ít → 1 lần', () => {
  assert.equal(giftRuns('boulder', 299, 299), 1);
  assert.equal(giftRuns('rose', 1, 1), 1);
  assert.equal(giftRuns('boulder', 299, 400), 1);              // < 1,5 lần giá
});
test('giftRuns: WIN / THUA ngay luôn đúng 1 lần dù quà đắt', () => {
  assert.equal(giftRuns('win', 0, 34999), 1);
  assert.equal(giftRuns('lose', 0, 34999), 1);
});
test('giftRuns: món không có giá (gán tay) → 1 lần', () => {
  assert.equal(giftRuns('tire', 0, 5000), 1);
});

test('actionByCoins: quy quà lạ theo xu, bóng bay (quà cứu) không bao giờ rơi vào phe chặn', () => {
  assert.equal(actionByCoins(1000), 'quake');
  assert.equal(actionByCoins(500), 'hand');
  assert.equal(actionByCoins(99), 'lightning');
  for (let c = 1; c <= 2000; c += 7) assert.notEqual(actionByCoins(c, seq(0.5)), 'balloon');
});

test('likesPerStone: phòng nhỏ giữ ngưỡng streamer cài', () => {
  assert.equal(likesPerStone(100, 300), 100);
});
test('likesPerStone: phòng đông 6.000 tim/phút → tối đa ~8 đá/phút (750 tim/đá)', () => {
  assert.equal(likesPerStone(100, 6000), 750);
});
test('likesPerStone: giờ vàng giảm nửa ngưỡng', () => {
  assert.equal(likesPerStone(100, 300, true), 50);
});

test('mysteryPick: trọng số 1/giá → kỳ vọng Túi mù gần giá túi (trước ~101 xu)', () => {
  const pool = [...VILLAINS, ...HEROES].filter(g => !['win', 'lose', 'mystery'].includes(g.action));
  assert.ok(mysteryExpect(pool) < 20, `kỳ vọng ${mysteryExpect(pool).toFixed(1)} xu`);
  assert.equal(mysteryPick(pool, () => 0).action, pool[0].action);
});

test('mysteryPick_theoGiaQua_90PhanTramRaTroReHonHoacBang', () => {
  // Arrange: bể có trò 1 / 5 / 10 xu và trò đắt 99 / 299 xu; mốc giá túi 10 xu
  const pool = [{ action: 'a', coins: 1 }, { action: 'b', coins: 5 }, { action: 'c', coins: 10 }, { action: 'd', coins: 99 }, { action: 'e', coins: 299 }];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Act: quay 20.000 lần
  let dear = 0, N = 20000; for (let i = 0; i < N; i++) if (mysteryPick(pool, rnd, 10).coins > 10) dear++;
  // Assert: ~10% ra trò > 10 xu
  assert.ok(Math.abs(dear / N - 0.1) < 0.015, `tỉ lệ trò đắt ${(dear / N * 100).toFixed(1)}%`);
});

test('comboCredit: ghi công người góp nhiều nhất, không phải người tặng cuối', () => {
  const A = { id: 'a', name: 'Lan' }, B = { id: 'b', name: 'Minh' };
  const cr = comboCredit([{ u: A, n: 4 }, { u: B, n: 1 }]);
  assert.equal(cr[0].u.name, 'Lan'); assert.equal(cr[0].n, 4);
});

test('holdSeconds: 75 giây map 1, +10 giây mỗi map', () => {
  assert.equal(holdSeconds(0), 75);
  assert.equal(holdSeconds(6), 135);
});

test('hungerAdd: bị đẩy lùi đủ HUNGER_FULL mét → lên cơn và thanh về 0', () => {
  let h = 0, r;
  r = hungerAdd(h, HUNGER_FULL / 2); assert.equal(r.rage, false); h = r.h;
  r = hungerAdd(h, HUNGER_FULL / 2); assert.equal(r.rage, true); assert.equal(r.h, 0);
});

test('winMilestone: mốc 5/10/15 là "mid", đủ mục tiêu là "goal", không lên thì null', () => {
  assert.equal(winMilestone(4, 5, 20), 'mid');
  assert.equal(winMilestone(7, 10, 20), 'mid');         // lâu đài +3 vẫn bắt được mốc 10
  assert.equal(winMilestone(19, 20, 20), 'goal');
  assert.equal(winMilestone(5, 6, 20), null);
  assert.equal(winMilestone(6, 5, 20), null);
});

test('pageCount / pageOf: 20 chip, 6 chip/trang → 4 trang, chip 13 ở trang 3', () => {
  assert.equal(pageCount(20, 6), 4); assert.equal(pageOf(13, 6), 2);
});

test('NoteQueue: mỗi lúc 1 thông báo; ưu tiên cao chen ngang; ưu tiên thấp chờ', () => {
  const q = new NoteQueue(5);
  q.push({ t: 'quạ', prio: 1, dur: 2 }, 0);
  q.push({ t: 'COMBO', prio: 3, dur: 2 }, 0.5);
  assert.equal(q.cur.t, 'COMBO');
  q.push({ t: 'quà to', prio: 2, dur: 2 }, 0.6);
  assert.equal(q.cur.t, 'COMBO');
  q.tick(2.6); assert.equal(q.cur.t, 'quà to');
  q.tick(4.7); assert.equal(q.cur, null);
});
test('NoteQueue: cùng key thì gộp, không xếp hàng dài', () => {
  const q = new NoteQueue(5);
  q.push({ t: 'x', prio: 3, dur: 2 }, 0);
  for (let i = 0; i < 4; i++) q.push({ t: 'Lan tặng', key: 'g:lan', prio: 2, dur: 2 }, 0.1);
  assert.equal(q.q.length, 1);
});
test('NoteQueue: hàng dài quá giới hạn thì bỏ cái ưu tiên thấp nhất', () => {
  const q = new NoteQueue(2);
  q.push({ t: 'đang', prio: 9, dur: 5 }, 0);
  q.push({ t: 'a', prio: 1 }, 0); q.push({ t: 'b', prio: 3 }, 0); q.push({ t: 'c', prio: 2 }, 0);
  assert.deepEqual(q.q.map(n => n.t), ['b', 'c']);
});

test('roundSecondsFor: map dài thì thêm giờ tương xứng', () => {
  assert.equal(roundSecondsFor(180, 90), 180);
  assert.equal(roundSecondsFor(180, 180), 352);
});

test('gift-data: mỗi giftId TikTok chỉ gắn 1 hành động, mọi món không-tùy-chọn đều có quà thật', () => {
  const all = [...VILLAINS, ...HEROES], seen = new Map();
  for (const g of all) {
    if (!g.opt) assert.ok((g.ids || []).length, `${g.action} thiếu giftId`);
    for (const id of g.ids || []) { assert.ok(!seen.has(id), `giftId ${id} trùng ${seen.get(id)} / ${g.action}`); seen.set(id, g.action); }
  }
  const names = all.flatMap(g => g.names);
  assert.equal(new Set(names).size, names.length, 'tên quà trùng giữa 2 hành động');
});

test('trang phục: danh sách trong panel khớp SKINS của game (id không trùng)', async () => {
  const fs = await import('node:fs');
  const { SKINS } = await import('../public/games/quaivat/skins.js');
  const ids = SKINS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const panel = fs.readFileSync(new URL('../public/games/quaivat/quaivat-panel.js', import.meta.url), 'utf8');
  const m = panel.match(/const SKINS = (\[.*\]);/);
  assert.ok(m, 'panel thiếu SKINS');
  const pids = JSON.parse(m[1].replace(/'/g, '"')).map(x => x[0]);
  assert.deepEqual(pids, ids);
});
