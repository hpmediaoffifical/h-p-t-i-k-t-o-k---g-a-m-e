'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { createFanLedger, fanKey, parseClubCode, rankIndex, isFakeEvent } = require('../lib/creatoronline-fans');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'co-fans-')), 'creatoronline-fans.json');
const DAY = 86400000;

test('fanKey: ưu tiên userId, không có thì uniqueId viết thường', () => {
    assert.equal(fanKey({ userId: '7123', uniqueId: 'AnNa' }), '7123');
    assert.equal(fanKey({ uniqueId: 'AnNa' }), 'anna');
    assert.equal(fanKey({ userId: 0, uniqueId: 'Bo' }), 'bo');
    assert.equal(fanKey(null), '');
});

test('parseClubCode: cả câu phải là mã club', () => {
    for (const [t, want] of [['1', 1], [' 3 ', 3], ['G2', 2], ['g 4', 4], ['5 sao', null], ['12', null], ['6', null], ['g6', null], ['1 tim nè', null]]) {
        assert.equal(parseClubCode(t), want, t);
    }
});

test('parseClubCode của server khớp logic/codes.js của overlay trên cùng bộ mẫu', async () => {
    const codes = await import(pathToFileURL(path.join(__dirname, '../public/games/creatoronline/js/logic/codes.js')).href);
    const samples = ['1', '2', '3', '4', '5', '0', '6', ' 3 ', 'G2', 'g 4', 'g  5', 'G5!', '5 sao', '12', 'g6', 'gg1', 'pk 3', 'đèn', '１', 'G 3', '\t4\n', 'ｇ1', '', null, 'g', 'g 1 2'];
    for (const s of samples) assert.equal(parseClubCode(s), codes.parseClubCode(s), JSON.stringify(s));
});

test('rankIndex theo mốc xu Fan mới/cứng/VIP/Đại gia/Thần tài', () => {
    assert.equal(rankIndex(0), 0);
    assert.equal(rankIndex(99), 0);
    assert.equal(rankIndex(100), 1);
    assert.equal(rankIndex(500), 2);
    assert.equal(rankIndex(1999), 2);
    assert.equal(rankIndex(2000), 3);
    assert.equal(rankIndex(10000), 4);
});

test('isFakeEvent: quà thử của panel, người xem giả sim/test_ bị bỏ qua', () => {
    assert.equal(isFakeEvent({ source: 'test', userId: '1' }), true);
    assert.equal(isFakeEvent({ uniqueId: 'sim42' }), true);
    assert.equal(isFakeEvent({ uniqueId: 'test_Anna' }), true);
    assert.equal(isFakeEvent({ uniqueId: 'tester' }), true);
    assert.equal(isFakeEvent({}), true);
    assert.equal(isFakeEvent({ userId: '99', uniqueId: 'that' }), false);
});

test('onGift cộng coinValue × repeatCount, trả về cấp mới', () => {
    let t = 1000;
    const L = createFanLedger({ file: null, now: () => t });
    assert.equal(L.get('1'), null);
    const a = L.onGift({ userId: '1', nickname: 'Anna', coinValue: 1, repeatCount: 99 });
    assert.deepEqual(a, { id: '1', name: 'Anna', xu: 99, rank: 0, club: null, vip: [] });
    const b = L.onGift({ userId: '1', nickname: 'Anna', coinValue: 1 });
    assert.equal(b.xu, 100);
    assert.equal(b.rank, 1);
    assert.equal(L.onGift({ userId: '2', coinValue: 299, source: 'test' }), null);
    assert.equal(L.get('2'), null);
    // thiếu giá → tính 1 xu
    assert.equal(L.onGift({ uniqueId: 'Bo' }).xu, 1);
});

test('onChat: mã club đổi club, chờ switchSec trước lần đổi kế', () => {
    let t = 0;
    const L = createFanLedger({ file: null, now: () => t });
    assert.equal(L.onChat({ userId: '1', nickname: 'An', comment: 'chào cả nhà' }), null);
    assert.equal(L.get('1'), null, 'bình luận thường không tạo mục mới');
    assert.equal(L.onChat({ userId: '1', nickname: 'An', comment: '3' }).club, 3);
    t = 30000;
    assert.equal(L.onChat({ userId: '1', comment: '2' }), null, 'chưa đủ 60 giây');
    assert.equal(L.get('1').club, 3);
    t = 61000;
    assert.equal(L.onChat({ userId: '1', comment: 'G2' }).club, 2);
    assert.equal(L.onChat({ userId: '1', comment: '2' }), null, 'cùng club thì không phát lại');
    assert.equal(L.onChat({ userId: '1', comment: '5 sao nha' }), null);
});

test('top(n) xếp theo xu, bỏ người 0 xu', () => {
    const L = createFanLedger({ file: null, now: () => 0 });
    L.onGift({ userId: 'a', coinValue: 5 });
    L.onGift({ userId: 'b', coinValue: 500 });
    L.onGift({ userId: 'c', coinValue: 50 });
    L.onChat({ userId: 'd', comment: '1' });
    assert.deepEqual(L.top(2).map((f) => f.id), ['b', 'c']);
    assert.equal(L.top(20).length, 3);
});

test('lưu file nguyên tử + nạp lại; reset xoá hết', () => {
    const file = tmpFile();
    const L = createFanLedger({ file, now: () => 5 });
    L.onGift({ userId: '1', nickname: 'An', coinValue: 120 });
    L.onChat({ userId: '1', comment: '4' });
    L.flushSync();
    assert.equal(fs.existsSync(file + '.tmp'), false);
    const L2 = createFanLedger({ file, now: () => 5 });
    assert.deepEqual(L2.get('1'), { id: '1', name: 'An', xu: 120, rank: 1, club: 4, vip: [] });
    L2.reset();
    assert.equal(createFanLedger({ file, now: () => 5 }).size(), 0);
});

test('file hỏng → giữ bản .bad, bắt đầu rỗng', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{không phải json');
    const L = createFanLedger({ file, now: () => 0 });
    assert.equal(L.size(), 0);
    assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.includes('.bad-')));
});

test('chỉ bỏ người dưới 100 xu không gặp quá 180 ngày — fan có cấp giữ vĩnh viễn', () => {
    let t = 0;
    const file = tmpFile();
    const L = createFanLedger({ file, now: () => t });
    L.onGift({ userId: 'nho', coinValue: 99 });
    L.onGift({ userId: 'lon', coinValue: 100 });
    L.flushSync();
    t = 181 * DAY;
    const L2 = createFanLedger({ file, now: () => t });
    assert.equal(L2.get('nho'), null);
    assert.equal(L2.get('lon').xu, 100);
    t = 3650 * DAY;
    assert.equal(createFanLedger({ file, now: () => t }).get('lon').rank, 1);
});

test('đồ VIP trọn đời: onGift(g, { vip }) thêm vào bộ đồ, không trùng, sắp xếp', () => {
    const L = createFanLedger({ file: null, now: () => 0 });
    assert.deepEqual(L.onGift({ userId: '1', nickname: 'Hùng', coinValue: 99 }, { vip: 'wings' }).vip, ['wings']);
    assert.deepEqual(L.onGift({ userId: '1', coinValue: 1 }, { vip: 'hat' }).vip, ['hat', 'wings']);
    assert.deepEqual(L.onGift({ userId: '1', coinValue: 1 }, { vip: 'hat' }).vip, ['hat', 'wings'], 'tặng lại mũ không nhân đôi');
    assert.deepEqual(L.onGift({ userId: '1', coinValue: 1 }, { vip: ['glasses', 'glasses', 'hat'] }).vip, ['glasses', 'hat', 'wings']);
    assert.equal(L.get('1').xu, 102);
});

test('đồ VIP: giá trị lạ bị bỏ, quà thường không đổi bộ đồ', () => {
    const L = createFanLedger({ file: null, now: () => 0 });
    assert.deepEqual(L.onGift({ userId: '2', nickname: 'Lan' }, { vip: 'vuongmien' }).vip, []);
    assert.deepEqual(L.onGift({ userId: '2' }, { vip: ['hat', 42, null, 'Hat'] }).vip, ['hat']);
    assert.deepEqual(L.onGift({ userId: '2' }).vip, ['hat']);
});

test('đồ VIP: quà thử / người xem giả không được đồ', () => {
    const L = createFanLedger({ file: null, now: () => 0 });
    assert.equal(L.onGift({ userId: '3', source: 'test' }, { vip: 'hat' }), null);
    assert.equal(L.onGift({ uniqueId: 'sim7' }, { vip: 'wings' }), null);
    assert.equal(L.get('3'), null);
    assert.equal(L.size(), 0);
});

test('đồ VIP: lưu qua flushSync + nạp lại; file có giá trị lạ thì lọc khi nạp', () => {
    const file = tmpFile();
    const L = createFanLedger({ file, now: () => 5 });
    L.onGift({ userId: '1', nickname: 'Mai', coinValue: 5 }, { vip: 'glasses' });
    L.onGift({ userId: '1', coinValue: 5 }, { vip: 'wings' });
    L.flushSync();
    assert.deepEqual(createFanLedger({ file, now: () => 5 }).get('1').vip, ['glasses', 'wings']);

    fs.writeFileSync(file, JSON.stringify({ v: 1, fans: {
        a: { name: 'Tú', xu: 3, lastSeen: 5, vip: ['wings', 'crown', 'hat', 'wings', 7] },
        b: { name: 'Bé', xu: 3, lastSeen: 5, vip: 'hat' },
        c: { name: 'Cò', xu: 3, lastSeen: 5 },
    } }));
    const L2 = createFanLedger({ file, now: () => 5 });
    assert.deepEqual(L2.get('a').vip, ['hat', 'wings']);
    assert.deepEqual(L2.get('b').vip, ['hat']);
    assert.deepEqual(L2.get('c').vip, []);
});

test('đồ VIP: người có đồ VIP không bị dọn dù dưới 100 xu và vắng quá 180 ngày', () => {
    let t = 0;
    const file = tmpFile();
    const L = createFanLedger({ file, now: () => t });
    L.onGift({ userId: 'thuong', coinValue: 10 });
    L.onGift({ userId: 'vip', coinValue: 10 }, { vip: 'hat' });
    L.flushSync();
    t = 400 * DAY;
    const L2 = createFanLedger({ file, now: () => t });
    assert.equal(L2.get('thuong'), null);
    assert.deepEqual(L2.get('vip').vip, ['hat']);
});

test('view luôn có mảng vip (get, getMany, top, onChat) và là bản sao', () => {
    const L = createFanLedger({ file: null, now: () => 0 });
    L.onGift({ userId: '1', coinValue: 5 });
    const v = L.onChat({ userId: '2', nickname: 'Nam', comment: '3' });
    assert.deepEqual(v.vip, []);
    assert.ok(Array.isArray(L.get('1').vip));
    assert.ok(Array.isArray(L.getMany(['1', '2'])['2'].vip));
    assert.ok(L.top(5).every((f) => Array.isArray(f.vip)));
    L.onGift({ userId: '1' }, { vip: 'hat' });
    L.get('1').vip.push('wings');
    assert.deepEqual(L.get('1').vip, ['hat'], 'sửa view không đổi dữ liệu gốc');
});
