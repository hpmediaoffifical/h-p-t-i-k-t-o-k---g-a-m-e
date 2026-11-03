// 🏢 Creator Online — quà → bậc xu, hành động đã gán, kế hoạch phản hồi, bảng chú giải (spec mục 4.1–4.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_PRIORITY, SOCIAL_ACTIONS, VIP_ACTIONS, SOLO_ACTIONS, tierOf, resolveGift, planGift, fallbackPlan, legendRows,
} from '../public/games/creatoronline/js/logic/events.js';

/** Bộ quà gợi ý theo spec 4.3 (tạo mới mỗi lần, không dùng chung trạng thái). */
const suggested = () => ({
  genre: [{ giftId: 51281, giftName: 'DJ Vinyl', giftImage: 'img/dj.png', coins: 10 }],
  ticket: [{ giftId: 15063, giftName: 'Vé hành trình', giftImage: 'img/ve.png', coins: 10 }],
  mc: [{ giftId: 170507, giftName: 'Giai điệu nở hoa', giftImage: 'img/mc.png', coins: 99 }],
  tech: [{ giftId: 985644, giftName: 'Bom kẹo', giftImage: 'img/tech.png', coins: 99 }],
  manager: [{ giftId: 14046, giftName: 'Đũa thần PK', giftImage: 'img/pk.png', coins: 100 }],
  confetti: [{ giftId: 7121, giftName: 'Pháo giấy tuyệt đẹp', giftImage: 'img/confetti.png', coins: 100 }],
  pkStart: [{ giftId: 130787, giftName: 'Tiến lên!', giftImage: 'img/tienlen.png', coins: 299 }],
  spotlight: [{ giftId: 11046, giftName: 'Thiên hà', giftImage: 'img/thienha.png', coins: 1000 }],
  gala: [{ giftId: 6369, giftName: 'Sư tử', giftImage: 'img/sutu.png', coins: 29999 }],
});

/** Kế hoạch đầy đủ (mặc định = lên sân khấu trơn) để so sánh deepEqual. */
const plan = (over = {}) => ({
  place: 'stage', role: null, roomFx: null, shoutout: false, genre: false, building: null, openPk: false, social: null, ...over,
});

const T2 = plan({ roomFx: 'random', shoutout: true });

// ------------------------------------------------------------------ bậc xu

test('ACTION_PRIORITY đúng thứ tự spec 4.2; hành động GĐ2 đứng sau hành động cũ', () => {
  assert.deepEqual(ACTION_PRIORITY.slice(0, 9), ['gala', 'spotlight', 'pkStart', 'manager', 'tech', 'mc', 'ticket', 'confetti', 'genre']);
  assert.deepEqual(ACTION_PRIORITY.slice(9), [...SOCIAL_ACTIONS, ...VIP_ACTIONS, ...SOLO_ACTIONS]);
  assert.equal(new Set(ACTION_PRIORITY).size, ACTION_PRIORITY.length);
});

test('planGift: hành động GĐ2 không lên sân, không sự kiện tòa nhà, không mở PK ở mọi bậc', () => {
  for (const action of [...SOCIAL_ACTIONS, ...VIP_ACTIONS, ...SOLO_ACTIONS]) {
    for (const tier of [1, 4, 5, 6, 7]) {
      assert.deepEqual(planGift({ action, tier, mapped: true }), plan({ place: null, social: action }), `${action} bậc ${tier}`);
    }
  }
});

test('resolveGift: quà gán vừa vé vừa ném bánh → vé thắng (hành động cũ đứng trước)', () => {
  const map = { ticket: [{ giftId: 9340, giftName: 'Bánh sinh nhật' }], throwCake: [{ giftId: 9340, giftName: 'Bánh sinh nhật' }] };
  assert.equal(resolveGift({ giftId: 9340, coins: 1 }, map).action, 'ticket');
  assert.equal(resolveGift({ giftId: 9340, coins: 1 }, { throwCake: map.throwCake }).action, 'throwCake');
});

test('tierOf: các mốc biên của 7 bậc', () => {
  const cases = [
    [1, 1], [4, 1], [5, 2], [29, 2], [30, 3], [98, 3], [99, 4], [298, 4],
    [299, 5], [999, 5], [1000, 6], [9999, 6], [10000, 7], [29999, 7], [1e7, 7],
  ];
  for (const [xu, tier] of cases) assert.equal(tierOf(xu), tier, `${xu} xu → bậc ${tier}`);
});

test('tierOf: dưới 1 xu hoặc không phải số → bậc 1', () => {
  for (const xu of [0, -5, 0.5, NaN, undefined, null, 'abc']) assert.equal(tierOf(xu), 1, `${xu} → bậc 1`);
});

// ------------------------------------------------------------------ resolveGift

test('resolveGift: tổng xu = xu mỗi quà × số lần combo', () => {
  assert.equal(resolveGift({ coins: 10, count: 3 }, {}).xu, 30);
  assert.equal(resolveGift({ coins: 10, count: 3 }, {}).tier, 3);
  assert.equal(resolveGift({ coins: 1, count: 1 }, {}).xu, 1);
  assert.equal(resolveGift({ coins: '100', count: '10' }, {}).xu, 1000, 'số dạng chuỗi');
  assert.equal(resolveGift({ coins: 2.6, count: 1.4 }, {}).xu, 3, 'làm tròn');
});

test('resolveGift: quà lạ không giá / combo 0 tính 1', () => {
  assert.equal(resolveGift({ count: 5 }, {}).xu, 5);
  assert.equal(resolveGift({ coins: 0, count: 0 }, {}).xu, 1);
  assert.equal(resolveGift({ coins: -50, count: -2 }, {}).xu, 1);
  assert.equal(resolveGift({ coins: NaN }, {}).xu, 1);
  assert.deepEqual(resolveGift({}, {}), { xu: 1, tier: 1, action: null, mapped: false });
  assert.deepEqual(resolveGift(undefined, undefined), { xu: 1, tier: 1, action: null, mapped: false });
});

test('resolveGift: khớp theo mã quà, số và chuỗi như nhau', () => {
  const map = suggested();
  assert.deepEqual(resolveGift({ giftId: '15063', coins: 10, count: 1 }, map), { xu: 10, tier: 2, action: 'ticket', mapped: true });
  assert.equal(resolveGift({ giftId: 51281, coins: 10 }, map).action, 'genre');
  assert.equal(resolveGift({ giftId: ' 7121 ', coins: 100 }, map).action, 'confetti');
});

test('resolveGift: Hoa hồng không gán → không có hành động', () => {
  const r = resolveGift({ giftId: 5655, giftName: 'Hoa hồng', coins: 1, count: 1 }, suggested());
  assert.deepEqual(r, { xu: 1, tier: 1, action: null, mapped: false });
});

test('resolveGift: không khớp mã thì khớp tên (không dấu, không hoa thường, gộp khoảng trắng)', () => {
  const map = suggested();
  assert.equal(resolveGift({ giftId: 99999, giftName: 'THIÊN HÀ', coins: 1000 }, map).action, 'spotlight');
  assert.equal(resolveGift({ giftName: 'dua than  pk', coins: 100 }, map).action, 'manager');
  assert.equal(resolveGift({ giftName: 'Su tu', coins: 29999 }, map).action, 'gala');
});

test('resolveGift: khớp mã thắng khớp tên dù tên trỏ tới hành động ưu tiên cao hơn', () => {
  const map = {
    genre: [{ giftId: '111', giftName: 'Quà A' }],
    gala: [{ giftId: '222', giftName: 'Quà B' }],
  };
  assert.equal(resolveGift({ giftId: '111', giftName: 'Quà B' }, map).action, 'genre');
});

test('resolveGift: mã rỗng không khớp mục có mã rỗng; tên rỗng không khớp mục tên rỗng', () => {
  const map = { gala: [{ giftId: '', giftName: '' }], mc: [{ giftId: null, giftName: 'Bom' }] };
  assert.equal(resolveGift({ giftId: '', giftName: '' }, map).mapped, false);
  assert.equal(resolveGift({ giftId: undefined, giftName: '   ' }, map).mapped, false);
  assert.equal(resolveGift({ giftId: 'undefined' }, { gala: [{ giftName: 'x' }] }).mapped, false);
});

test('resolveGift: quà gán cho 2 hành động → chạy hành động đứng trước theo ACTION_PRIORITY', () => {
  const g = { giftId: 7, giftName: 'Quà trùng' };
  assert.equal(resolveGift(g, { mc: [g], manager: [g] }).action, 'manager');
  assert.equal(resolveGift(g, { genre: [g], gala: [g] }).action, 'gala');
  assert.equal(resolveGift(g, { confetti: [g], ticket: [g] }).action, 'ticket');
  assert.equal(resolveGift(g, { tech: [g], pkStart: [g], spotlight: [g] }).action, 'spotlight');
  assert.equal(resolveGift({ giftName: 'quà trùng' }, { mc: [g], tech: [g] }).action, 'tech', 'khớp tên cũng theo thứ tự');
});

test('resolveGift: bảng gán hỏng (không phải mảng, mục null, hành động lạ) được bỏ qua', () => {
  const map = { mc: 'abc', tech: [null, 5, { giftId: 9 }], foo: [{ giftId: 1 }] };
  assert.equal(resolveGift({ giftId: 9 }, map).action, 'tech');
  assert.equal(resolveGift({ giftId: 1 }, map).mapped, false, 'hành động ngoài danh sách không được chạy');
  assert.equal(resolveGift({ giftId: 9 }, null).mapped, false);
});

// ------------------------------------------------------------------ planGift — quà chưa gán

test('planGift: quà chưa gán chạy theo bậc (coTierFallback bật)', () => {
  const p = (tier) => planGift({ action: null, tier, mapped: false });
  assert.deepEqual(p(1), plan());
  assert.deepEqual(p(2), T2);
  assert.deepEqual(p(3), plan({ place: 'room' }));
  assert.deepEqual(p(4), plan({ place: 'role', role: 'auto' }));
  assert.deepEqual(p(5), plan({ building: 'big', openPk: true }));
  assert.deepEqual(p(6), plan({ building: 'spotlight', openPk: true }));
  assert.deepEqual(p(7), plan({ building: 'gala', openPk: true }));
});

test('planGift: tierFallback mặc định là bật', () => {
  assert.deepEqual(planGift({ tier: 3, mapped: false }, {}), plan({ place: 'room' }));
  assert.deepEqual(planGift({ tier: 3, mapped: false }), plan({ place: 'room' }));
  assert.deepEqual(planGift({ tier: 3, mapped: false }, { tierFallback: true }), plan({ place: 'room' }));
});

test('planGift: tắt tierFallback → quà chưa gán bậc nào cũng chỉ lên sân khấu', () => {
  for (let tier = 1; tier <= 7; tier++) {
    assert.deepEqual(planGift({ action: null, tier, mapped: false }, { tierFallback: false }), plan(), `bậc ${tier}`);
  }
});

test('planGift: bậc ngoài 1–7 bị kẹp', () => {
  assert.deepEqual(planGift({ tier: 0, mapped: false }), plan());
  assert.deepEqual(planGift({ tier: 12, mapped: false }), plan({ building: 'gala', openPk: true }));
  assert.deepEqual(planGift(undefined), plan());
});

// ------------------------------------------------------------------ planGift — quà đã gán

test('planGift: mỗi hành động đã gán (bậc thấp) ra đúng kế hoạch', () => {
  const p = (action, tier = 2) => planGift({ action, tier, mapped: true });
  assert.deepEqual(p('genre'), plan({ genre: true }));
  assert.deepEqual(p('ticket'), plan({ place: 'room' }));
  assert.deepEqual(p('mc', 4), plan({ place: 'role', role: 'mc' }));
  assert.deepEqual(p('tech', 4), plan({ place: 'role', role: 'tech' }));
  assert.deepEqual(p('manager', 4), plan({ place: 'role', role: 'manager' }));
  assert.deepEqual(p('confetti', 4), plan({ roomFx: 'confetti' }));
  assert.deepEqual(p('pkStart', 1), plan({ building: 'big', openPk: true }));
  assert.deepEqual(p('spotlight', 1), plan({ building: 'spotlight', openPk: true }));
  assert.deepEqual(p('gala', 1), plan({ building: 'gala', openPk: true }));
});

test('planGift: quà đã gán bỏ qua tierFallback (gán là gán)', () => {
  assert.deepEqual(planGift({ action: 'ticket', tier: 2, mapped: true }, { tierFallback: false }), plan({ place: 'room' }));
});

test('planGift: quà đã gán bậc 3–4 KHÔNG thêm hiệu ứng bậc', () => {
  assert.deepEqual(planGift({ action: 'genre', tier: 4, mapped: true }), plan({ genre: true }));
  assert.deepEqual(planGift({ action: 'ticket', tier: 3, mapped: true }), plan({ place: 'room' }));
});

test('planGift: quà đã gán bậc ≥ 5 chạy thêm sự kiện bậc + mở PK', () => {
  const p = (action, tier) => planGift({ action, tier, mapped: true });
  assert.deepEqual(p('genre', 5), plan({ genre: true, building: 'big', openPk: true }));
  assert.deepEqual(p('ticket', 6), plan({ place: 'room', building: 'spotlight', openPk: true }));
  assert.deepEqual(p('mc', 7), plan({ place: 'role', role: 'mc', building: 'gala', openPk: true }));
  assert.deepEqual(p('confetti', 5), plan({ roomFx: 'confetti', building: 'big', openPk: true }));
  assert.deepEqual(p('pkStart', 6), plan({ building: 'spotlight', openPk: true }), 'big → spotlight');
  assert.deepEqual(p('pkStart', 7), plan({ building: 'gala', openPk: true }));
});

test('planGift: quà đã gán bậc ≥ 5 giữ sự kiện mạnh hơn (gala > spotlight > big)', () => {
  const p = (action, tier) => planGift({ action, tier, mapped: true });
  assert.deepEqual(p('spotlight', 5), plan({ building: 'spotlight', openPk: true }), 'không hạ xuống big');
  assert.deepEqual(p('gala', 5), plan({ building: 'gala', openPk: true }));
  assert.deepEqual(p('gala', 6), plan({ building: 'gala', openPk: true }));
  assert.deepEqual(p('spotlight', 7), plan({ building: 'gala', openPk: true }));
});

test('Đũa thần PK x10 = 1.000 xu → vai Quản lý + Tâm điểm + mở PK (ví dụ spec 4.2)', () => {
  const r = resolveGift({ giftId: 14046, giftName: 'Đũa thần PK', coins: 100, count: 10 }, suggested());
  assert.deepEqual(r, { xu: 1000, tier: 6, action: 'manager', mapped: true });
  assert.deepEqual(planGift(r), plan({ place: 'role', role: 'manager', building: 'spotlight', openPk: true }));
});

test('Sư tử 29.999 xu (gán gala) và quà lạ 30.000 xu (chưa gán) đều ra Gala', () => {
  const map = suggested();
  assert.deepEqual(planGift(resolveGift({ giftId: 6369, coins: 29999 }, map)), plan({ building: 'gala', openPk: true }));
  assert.deepEqual(planGift(resolveGift({ giftId: 1, coins: 30000 }, map)), plan({ building: 'gala', openPk: true }));
});

test('mưa Hoa hồng x99 = 99 xu (chưa gán) → bậc 4: vai tự chọn', () => {
  const r = resolveGift({ giftId: 5655, giftName: 'Hoa hồng', coins: 1, count: 99 }, suggested());
  assert.equal(r.tier, 4);
  assert.deepEqual(planGift(r), plan({ place: 'role', role: 'auto' }));
});

test('planGift: mapped nhưng hành động lạ → coi như chưa gán', () => {
  assert.deepEqual(planGift({ action: 'boss', tier: 3, mapped: true }), plan({ place: 'room' }));
  assert.deepEqual(planGift({ action: 'boss', tier: 3, mapped: true }, { tierFallback: false }), plan());
});

test('planGift và fallbackPlan trả đối tượng mới mỗi lần', () => {
  const a = planGift({ tier: 2, mapped: false });
  a.roomFx = 'hỏng';
  assert.deepEqual(planGift({ tier: 2, mapped: false }), T2);
  const f = fallbackPlan();
  f.place = 'room';
  assert.deepEqual(fallbackPlan(), T2);
});

test('fallbackPlan = kế hoạch bậc 2', () => {
  assert.deepEqual(fallbackPlan(), T2);
  assert.deepEqual(fallbackPlan(), planGift({ tier: 2, mapped: false }));
});

// ------------------------------------------------------------------ bảng chú giải

test('legendRows: bộ quà gợi ý ra đủ 6 dòng như spec 4.3', () => {
  const rows = legendRows(suggested());
  assert.deepEqual(rows, [
    { icon: '🌹', text: 'Quà bất kỳ → lên sân khấu', giftImage: null },
    { icon: '🎟️', text: 'Vé hành trình → phòng LIVE mang tên bạn', giftImage: 'img/ve.png' },
    { icon: '🎙️🎛️📋', text: 'Giai điệu nở hoa / Bom kẹo / Đũa thần PK → MC / Kỹ thuật / Quản lý', giftImage: 'img/mc.png' },
    { icon: '🎵', text: 'DJ Vinyl → đổi nhạc · 🎉 Pháo giấy tuyệt đẹp → mưa pháo giấy', giftImage: 'img/dj.png' },
    { icon: '⚔️', text: 'Tiến lên! → PK ngay', giftImage: 'img/tienlen.png' },
    { icon: '🌌', text: 'Thiên hà → cả tòa nhà về nhóm bạn', giftImage: 'img/thienha.png' },
  ]);
});

test('legendRows: bảng trống chỉ còn dòng "Quà bất kỳ"', () => {
  const only = [{ icon: '🌹', text: 'Quà bất kỳ → lên sân khấu', giftImage: null }];
  assert.deepEqual(legendRows({}), only);
  assert.deepEqual(legendRows(null), only);
  assert.deepEqual(legendRows({ ticket: [], mc: 'x', gala: [{ giftId: 6369, giftName: 'Sư tử' }] }), only, 'gala không có dòng riêng');
});

test('legendRows: bỏ dòng thiếu quà, ghép vai và nhạc/pháo giấy theo phần có', () => {
  const map = suggested();
  delete map.ticket;
  delete map.mc;
  delete map.genre;
  delete map.spotlight;
  const rows = legendRows(map);
  assert.deepEqual(rows.map((r) => r.icon), ['🌹', '🎛️📋', '🎉', '⚔️']);
  assert.equal(rows[1].text, 'Bom kẹo / Đũa thần PK → Kỹ thuật / Quản lý');
  assert.equal(rows[1].giftImage, 'img/tech.png');
  assert.equal(rows[2].text, 'Pháo giấy tuyệt đẹp → mưa pháo giấy');
  assert.equal(rows[2].giftImage, 'img/confetti.png');
});

test('legendRows: chỉ có đổi nhạc thì dòng 4 không có phần pháo giấy', () => {
  const rows = legendRows({ genre: [{ giftId: 51281, giftName: 'DJ Vinyl' }] });
  assert.deepEqual(rows[1], { icon: '🎵', text: 'DJ Vinyl → đổi nhạc', giftImage: null });
});

test('legendRows: ticketName thay tên quà vé; tên trống thì dùng mã quà', () => {
  const map = { ticket: [{ giftId: 15063, giftName: 'Vé hành trình' }], pkStart: [{ giftId: 130787, giftName: '  ' }] };
  const rows = legendRows(map, { ticketName: 'Vé VIP' });
  assert.equal(rows[1].text, 'Vé VIP → phòng LIVE mang tên bạn');
  assert.equal(rows[2].text, 'Quà #130787 → PK ngay');
  assert.equal(legendRows(map, { ticketName: '' })[1].text, 'Vé hành trình → phòng LIVE mang tên bạn');
  assert.equal(legendRows(map, null)[1].text, 'Vé hành trình → phòng LIVE mang tên bạn');
});

test('legendRows: nhiều quà cùng hành động → dùng quà đầu tiên', () => {
  const rows = legendRows({ ticket: [{ giftId: 1, giftName: 'Vé A', giftImage: 'a.png' }, { giftId: 2, giftName: 'Vé B' }] });
  assert.equal(rows[1].text, 'Vé A → phòng LIVE mang tên bạn');
  assert.equal(rows[1].giftImage, 'a.png');
});

test('legendRows: quà gán trùng chỉ hiện ở hành động thực sự chạy', () => {
  const g = { giftId: 7, giftName: 'Quà trùng' };
  const rows = legendRows({ mc: [g], spotlight: [g] });
  assert.deepEqual(rows.map((r) => r.icon), ['🌹', '🌌'], 'quà trùng chạy spotlight, không hiện ở dòng MC');
});

test('legendRows: không bao giờ quá 6 dòng', () => {
  const map = suggested();
  map.mc.push({ giftId: 1, giftName: 'X' });
  assert.ok(legendRows(map).length <= 6);
});
