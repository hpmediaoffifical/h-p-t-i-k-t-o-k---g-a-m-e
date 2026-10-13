// node --test tests/caption-speech.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultTracker, restartDelay, isFatalError, createPartialThrottle } from '../public/lib/caption-speech.mjs';

// Giả lập SpeechRecognitionEvent: results[i] = { isFinal, 0: { transcript } }
function ev(resultIndex, rows) {
    return { resultIndex, results: rows.map(([isFinal, transcript]) => ({ isFinal, 0: { transcript }, length: 1 })) };
}

test('tracker: interim → partial, final gửi đúng 1 lần, bỏ rỗng', () => {
    const t = createResultTracker();
    assert.deepEqual(t.onResult(ev(0, [[false, ' xin ']])), { partial: 'xin', finals: [] });
    assert.deepEqual(t.onResult(ev(0, [[false, 'xin chào']])), { partial: 'xin chào', finals: [] });
    assert.deepEqual(t.onResult(ev(0, [[true, 'xin chào  cả nhà ']])), { partial: '', finals: ['xin chào cả nhà'] });
    // Chromium phát lại result cũ cùng result mới: final cũ KHÔNG gửi lại
    assert.deepEqual(t.onResult(ev(0, [[true, 'xin chào cả nhà'], [false, 'hôm']])), { partial: 'hôm', finals: [] });
    assert.deepEqual(t.onResult(ev(1, [[true, 'xin chào cả nhà'], [true, '   ']])), { partial: '', finals: [] });
});

test('tracker: partial nối mọi result chưa final; final sót trước resultIndex vẫn gửi', () => {
    const t = createResultTracker();
    assert.deepEqual(t.onResult(ev(1, [[true, 'câu một'], [false, 'hôm nay'], [false, ' trời đẹp']])), { partial: 'hôm nay trời đẹp', finals: ['câu một'] });
});

test('tracker: newSession đánh số lại → final index 0 mới được gửi', () => {
    const t = createResultTracker();
    assert.deepEqual(t.onResult(ev(0, [[true, 'câu một']])), { partial: '', finals: ['câu một'] });
    assert.deepEqual(t.onResult(ev(0, [[true, 'câu một']])), { partial: '', finals: [] });
    t.newSession();
    assert.deepEqual(t.onResult(ev(0, [[true, 'câu hai']])), { partial: '', finals: ['câu hai'] });
});

test('restartDelay: bảng spec', () => {
    assert.equal(restartDelay({ reason: 'not-allowed' }), -1);
    assert.equal(restartDelay({ reason: 'service-not-allowed' }), -1);
    assert.equal(restartDelay({ reason: 'audio-capture' }), -1);
    assert.equal(restartDelay({ reason: 'language-not-supported' }), -1);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 1 }), 1000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 3 }), 4000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 5 }), 16000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 6 }), -1);
    assert.equal(restartDelay({ reason: 'no-speech' }), 0);
    assert.equal(restartDelay({ reason: '', hadResults: true }), 300);
    assert.equal(restartDelay({ reason: 'aborted', hadResults: false, emptySessions: 0 }), 500);
    assert.equal(restartDelay({ reason: '', hadResults: false, emptySessions: 3 }), 1500);
    assert.equal(restartDelay({ reason: '', hadResults: false, emptySessions: 40 }), 5000);
});

test('isFatalError: đúng với các mã không bật lại được', () => {
    assert.equal(isFatalError('not-allowed'), true);
    assert.equal(isFatalError('audio-capture'), true);
    assert.equal(isFatalError('network'), false);
    assert.equal(isFatalError('no-speech'), false);
    assert.equal(isFatalError(''), false);
});

test('throttle: 100ms, trùng → null, flush', () => {
    let now = 0;
    const th = createPartialThrottle(100, () => now);
    assert.equal(th.push('a'), 'a');
    now = 50; assert.equal(th.push('ab'), null);
    now = 120; assert.equal(th.push('ab'), 'ab');
    assert.equal(th.push('ab'), null);
    now = 300; assert.equal(th.push('ab'), null);   // trùng text đã gửi
    now = 310; assert.equal(th.push('abc'), 'abc');
    now = 320; th.push('abcd');
    assert.equal(th.flush(), 'abcd');
    assert.equal(th.flush(), null);
});

test('throttle: chuỗi rỗng (xoá dòng tạm) luôn đi ngay', () => {
    let now = 0;
    const th = createPartialThrottle(100, () => now);
    assert.equal(th.push('abc'), 'abc');
    now = 10; assert.equal(th.push(''), '');
    now = 20; assert.equal(th.push(''), null);
});
