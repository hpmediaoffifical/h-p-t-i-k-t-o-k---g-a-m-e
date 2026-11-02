'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore, weekKey, cleanSession } = require('../lib/quaivat-store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qv-store-'));

test('weekKey: tuần ISO, thứ Hai mở tuần mới', () => {
    assert.strictEqual(weekKey(new Date(2026, 10, 1)), '2026-W44');    // CN 01/11/2026
    assert.strictEqual(weekKey(new Date(2026, 10, 2)), '2026-W45');    // T2 02/11/2026
    assert.strictEqual(weekKey(new Date(2027, 0, 1)), '2026-W53');     // 01/01/2027 vẫn thuộc tuần cuối 2026
});

test('cleanSession: chặn số rác', () => {
    assert.deepStrictEqual(cleanSession({ win: -3, stage: 0, map: 99, cleared: 'x', round: 2.6 }), { win: 0, stage: 1, map: 63, cleared: 0, round: 3 });
    assert.strictEqual(cleanSession(null), null);
});

test('phiên chơi: lưu rồi đọc lại; quá 6 giờ thì bỏ', () => {
    let t = 1_000_000;
    const st = createStore(tmp(), { now: () => t });
    st.saveSession({ win: 7, stage: 2, map: 3, cleared: 19, round: 22 });
    assert.deepStrictEqual(st.loadSession(), { win: 7, stage: 2, map: 3, cleared: 19, round: 22, at: 1_000_000 });
    assert.ok(st.alive());
    t += 31_000; assert.ok(!st.alive(), 'mất nhịp tim 30 giây = game không chạy');
    t += 6 * 3600 * 1000; assert.strictEqual(st.loadSession(), null);
});

test('sổ TOP tuần: cộng xu theo người, xếp giảm dần, sang tuần thì làm mới', () => {
    let d = new Date(2026, 10, 3);
    const dir = tmp();
    const st = createStore(dir, { clock: () => d });
    st.addGift({ uid: 'a', name: 'Lan', coins: 299 });
    st.addGift({ uid: 'b', name: 'Minh', coins: 30 });
    st.addGift({ uid: 'a', name: 'Lan', coins: 1 });
    assert.strictEqual(st.addGift({ uid: 'c', name: 'Không xu', coins: 0 }), false);
    assert.deepStrictEqual(st.top(5).map(u => [u.name, u.coins]), [['Lan', 300], ['Minh', 30]]);
    st.flush();
    const again = createStore(dir, { clock: () => d });                 // đọc lại từ file
    assert.strictEqual(again.top(1)[0].coins, 300);
    d = new Date(2026, 10, 10);                                          // tuần sau
    assert.deepStrictEqual(again.top(5), []);
});
