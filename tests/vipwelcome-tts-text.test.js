'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTts } = require('../lib/vipwelcome/tts-text.js');

const ctx = { nickname: 'Davina', title: 'Hào kiệt', level: 23, fansLevel: 3, visitNo: 12 };

test('điền biến tiếng Việt và tên cũ', () => {
    assert.equal(renderTts('{bậc} {tên} đã tới phòng!', ctx), 'Hào kiệt Davina đã tới phòng!');
    assert.equal(renderTts('Chào {nickname}, cấp {lv}, fan {fan}, lần {lần}', ctx), 'Chào Davina, cấp 23, fan 3, lần 12');
});

test('bỏ emoji / ký tự lạ, gộp khoảng trắng', () => {
    assert.equal(renderTts('Chào {tên} 🎉🔥  nhé', { ...ctx, nickname: '✨Snow 💖 Love✨' }), 'Chào Snow Love nhé');
});

test('cắt tối đa 80 ký tự', () => {
    const out = renderTts('{tên}', { ...ctx, nickname: 'a'.repeat(200) });
    assert.equal(out.length, 80);
});

test('ẩn danh hoặc mẫu rỗng → không đọc', () => {
    assert.equal(renderTts('{tên} vào phòng', { ...ctx, isEnigma: true }), '');
    assert.equal(renderTts('', ctx), '');
    assert.equal(renderTts('{tên}', { ...ctx, nickname: '🎉🎉' }), '');
});
