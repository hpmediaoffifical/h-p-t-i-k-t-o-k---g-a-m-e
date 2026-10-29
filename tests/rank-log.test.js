const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRankLog, isRankMethod } = require('../lib/rank-log');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rank-log-')); }
function readLines(file) { return fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); }
const DAY = new Date(2026, 9, 29, 21, 5, 0).getTime();

test('isRankMethod: bắt gói xếp hạng/giải đấu, bỏ chat/quà', () => {
    assert.strictEqual(isRankMethod('WebcastRankUpdateMessage'), true);
    assert.strictEqual(isRankMethod('WebcastRankTextMessage'), true);
    assert.strictEqual(isRankMethod('WebcastHourlyRankRewardMessage'), true);
    assert.strictEqual(isRankMethod('WebcastGameRankNotifyMessage'), true);
    assert.strictEqual(isRankMethod('WebcastLeagueSomethingMessage'), true);
    assert.strictEqual(isRankMethod('WebcastChatMessage'), false);
    assert.strictEqual(isRankMethod('WebcastGiftMessage'), false);
    assert.strictEqual(isRankMethod(''), false);
});

test('ghi gói xếp hạng ra <dir>/<ngày>.jsonl, Buffer → base64', () => {
    const dir = tmpDir();
    const log = createRankLog({ dir, now: () => DAY });
    log.record('WebcastRankUpdateMessage', { updates: [{ rankType: 13, classInfo: { classType: 1400, starCount: '3' }, prompt: Buffer.from('hi') }] }, { roomId: '7' });
    log.record('WebcastChatMessage', { content: 'xin chào' });
    const rows = readLines(path.join(dir, '2026-10-29.jsonl'));
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].method, 'WebcastRankUpdateMessage');
    assert.strictEqual(rows[0].roomId, '7');
    assert.strictEqual(rows[0].data.updates[0].classInfo.starCount, '3');
    assert.strictEqual(rows[0].data.updates[0].prompt, 'base64:aGk=');
    assert.ok(rows[0].ts);
});

test('gói trùng y hệt liên tiếp chỉ ghi 1 lần, đếm số lần lặp', () => {
    const dir = tmpDir();
    const log = createRankLog({ dir, now: () => DAY });
    const pkt = { updates: [{ ownRank: '12' }] };
    log.record('WebcastRankUpdateMessage', pkt);
    log.record('WebcastRankUpdateMessage', pkt);
    log.record('WebcastRankUpdateMessage', pkt);
    log.record('WebcastRankUpdateMessage', { updates: [{ ownRank: '11' }] });
    const rows = readLines(path.join(dir, '2026-10-29.jsonl'));
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[1].repeatsBefore, 2);
    assert.strictEqual(log.stats().methods.WebcastRankUpdateMessage, 4);
});

test('PK: chỉ ghi leagueScoreInfoMap khi có, không ghi cả gói battle', () => {
    const dir = tmpDir();
    const log = createRankLog({ dir, now: () => DAY });
    log.record('WebcastLinkMicBattle', { battleId: '9', leagueScoreInfoMap: {} });
    log.record('WebcastLinkMicBattle', { battleId: '9', battleSettings: { duration: 300 }, leagueScoreInfoMap: { 123: { estimatedScore: '4500' } } });
    const rows = readLines(path.join(dir, '2026-10-29.jsonl'));
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(rows[0].data, { battleId: '9', leagueScoreInfoMap: { 123: { estimatedScore: '4500' } } });
});

test('stats đếm mọi method (kể cả không ghi) + recent trả các dòng mới nhất', () => {
    const dir = tmpDir();
    const log = createRankLog({ dir, now: () => DAY });
    log.record('WebcastChatMessage', {});
    log.record('WebcastChatMessage', {});
    log.record('WebcastHourlyRankRewardMessage', { winners: [] });
    const s = log.stats();
    assert.strictEqual(s.methods.WebcastChatMessage, 2);
    assert.strictEqual(s.written, 1);
    assert.strictEqual(log.recent(10).length, 1);
    assert.strictEqual(log.recent(10)[0].method, 'WebcastHourlyRankRewardMessage');
});

test('vượt trần dung lượng/ngày thì ngừng ghi, không ném lỗi', () => {
    const dir = tmpDir();
    const log = createRankLog({ dir, now: () => DAY, maxBytesPerDay: 200 });
    for (let i = 0; i < 20; i++) log.record('WebcastRankUpdateMessage', { updates: [{ ownRank: String(i), pad: 'x'.repeat(50) }] });
    const size = fs.statSync(path.join(dir, '2026-10-29.jsonl')).size;
    assert.ok(size <= 400, `size ${size}`);
    assert.ok(log.stats().dropped > 0);
});
