'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hotkeyApplyOrder } = require('../lib/camgames-hotkeys.js');

test('đổi game trong hub: game TẮT nhả phím trước, game BẬT đăng ký sau', () => {
    const order = hotkeyApplyOrder([{ id: 'dapmuoi', on: true }, { id: 'hoasi', on: false }]).map(c => c.id);
    assert.deepEqual(order, ['hoasi', 'dapmuoi']);
});

test('hai game dùng chung tổ hợp phím: game mới bật vẫn giữ được phím', () => {
    // globalShortcut giả: đăng ký phím đang bị giữ → false (như Electron trong cùng process).
    const held = new Map();
    const appliers = {
        dapmuoi: (on) => { for (const [k, v] of held) if (v === 'dapmuoi') held.delete(k); if (on && !held.has('Control+Shift+1')) held.set('Control+Shift+1', 'dapmuoi'); },
        hoasi: (on) => { for (const [k, v] of held) if (v === 'hoasi') held.delete(k); if (on && !held.has('Control+Shift+1')) held.set('Control+Shift+1', 'hoasi'); }
    };
    appliers.hoasi(true);                                   // đang chơi Họa Sĩ
    for (const c of hotkeyApplyOrder([{ id: 'dapmuoi', on: true }, { id: 'hoasi', on: false }])) appliers[c.id](c.on);
    assert.equal(held.get('Control+Shift+1'), 'dapmuoi');
});
