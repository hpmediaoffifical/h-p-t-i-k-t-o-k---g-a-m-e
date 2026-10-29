const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/league-card');

// Gói rankUpdate giả theo proto v3 (WebcastRankUpdateMessage). int64 → chuỗi, enum → số.
function pkt({ classType = 1400, stars = '3', rank = '12', score = '8000', gap = 'Còn thiếu {0:string} điểm để giữ hạng', gapVal = '1,250', countdown = '7200', settle } = {}) {
    return {
        updates: [
            { rankType: 0, ownRank: '40', currentScore: '99' },   // BXH giờ — phải bỏ qua
            {
                rankType: 13, ownRank: rank, currentScore: score, countdown,
                classInfo: { classType, starCount: stars },
                affiliatedInfo: { realTimeRank: rank, gapDesc: { key: 'k', defaultPattern: gap, pieces: [{ type: 1, stringValue: gapVal }] }, settleInfo: settle },
            },
        ],
    };
}

test('divisionFromClassType: số và chuỗi enum', () => {
    assert.strictEqual(L.divisionFromClassType(100), 'D5');
    assert.strictEqual(L.divisionFromClassType(500), 'D1');
    assert.strictEqual(L.divisionFromClassType(600), 'C5');
    assert.strictEqual(L.divisionFromClassType(1400), 'B2');
    assert.strictEqual(L.divisionFromClassType(2000), 'A1');
    assert.strictEqual(L.divisionFromClassType(2100), 'S');
    assert.strictEqual(L.divisionFromClassType('B_2'), 'B2');
    assert.strictEqual(L.divisionFromClassType('S'), 'S');
    assert.strictEqual(L.divisionFromClassType(0), null);
    assert.strictEqual(L.divisionFromClassType('NONE'), null);
    assert.strictEqual(L.divisionFromClassType(undefined), null);
});

test('divisionIndex: so sánh lên/xuống bậc', () => {
    assert.ok(L.divisionIndex('B1') > L.divisionIndex('B2'));
    assert.ok(L.divisionIndex('S') > L.divisionIndex('A1'));
    assert.ok(L.divisionIndex('C5') > L.divisionIndex('D1'));
});

test('textToString: thay {0:string} bằng piece, nhiều kiểu piece', () => {
    assert.strictEqual(L.textToString({ defaultPattern: 'Thiếu {0:string} điểm', pieces: [{ stringValue: '1.250' }] }), 'Thiếu 1.250 điểm');
    assert.strictEqual(L.textToString({ defaultPattern: '{0:user} vượt {1:string}', pieces: [{ userValue: { user: { nickname: 'An' } } }, { stringValue: '3' }] }), 'An vượt 3');
    assert.strictEqual(L.textToString({ pieces: [{ stringValue: 'a' }, { stringValue: 'b' }] }), 'a b');
    assert.strictEqual(L.textToString('chuỗi sẵn'), 'chuỗi sẵn');
    assert.strictEqual(L.textToString(null), '');
});

test('parseNumberLoose: dấu phân cách và hậu tố K/M/N', () => {
    assert.strictEqual(L.parseNumberLoose('Thiếu 1,250 điểm'), 1250);
    assert.strictEqual(L.parseNumberLoose('Thiếu 1.250 điểm'), 1250);
    assert.strictEqual(L.parseNumberLoose('need 1.2K pts'), 1200);
    assert.strictEqual(L.parseNumberLoose('cần 3,5N điểm'), 3500);
    assert.strictEqual(L.parseNumberLoose('2M'), 2000000);
    assert.strictEqual(L.parseNumberLoose('850'), 850);
    assert.strictEqual(L.parseNumberLoose('không có số'), null);
});

test('parseRankUpdate: chọn mục giải đấu, đọc bậc/mảnh/hạng/thiếu/giờ chốt', () => {
    const now = 1_000_000;
    const r = L.parseRankUpdate(pkt(), now);
    assert.strictEqual(r.division, 'B2');
    assert.strictEqual(r.stars, 3);
    assert.strictEqual(r.rank, 12);
    assert.strictEqual(r.score, 8000);
    assert.strictEqual(r.need, 1250);
    assert.strictEqual(r.gapText, 'Còn thiếu 1,250 điểm để giữ hạng');
    assert.strictEqual(r.deadlineTs, now + 7200 * 1000);
});

test('parseRankUpdate: countdown là mốc thời gian (giây/ms) và settleInfo', () => {
    const now = 1_760_000_000_000;
    assert.strictEqual(L.parseRankUpdate(pkt({ countdown: String(1_760_000_600) }), now).deadlineTs, 1_760_000_600_000);
    assert.strictEqual(L.parseRankUpdate(pkt({ countdown: String(1_760_000_600_000) }), now).deadlineTs, 1_760_000_600_000);
    const s = L.parseRankUpdate(pkt({ settle: { ownerSettleRank: '4', oldClassInfo: { classType: 1400, starCount: '3' }, newClassInfo: { classType: 1500, starCount: '0' }, rankSettleTimestamp: '1760000000' } }), now);
    assert.deepStrictEqual(s.settle, { from: 'B2', to: 'B1', fromStars: 3, toStars: 0, rank: 4 });
});

test('parseRankUpdate: không có mục giải đấu → null; "đã giữ hạng" → need 0', () => {
    assert.strictEqual(L.parseRankUpdate({ updates: [{ rankType: 0, ownRank: '3' }] }), null);
    assert.strictEqual(L.parseRankUpdate(null), null);
    const r = L.parseRankUpdate(pkt({ gap: 'Bạn đã giữ hạng', gapVal: '' }));
    assert.strictEqual(r.need, 0);
});

test('parseRankUpdate: giờ vàng teamRankBonusTime', () => {
    const p = pkt();
    p.updates[1].affiliatedInfo.teamRankBonusTime = { switch: true, startTimestamp: '1000', endTimestamp: '2000', bonusRate: '2', bonusTimeGiftId: '5655' };
    const r = L.parseRankUpdate(p, 1_500_000);
    assert.deepStrictEqual(r.bonus, { on: true, startTs: 1_000_000, endTs: 2_000_000, rate: 2, giftId: '5655' });
});

function tracker(nowRef) { return L.createLeagueTracker({ now: () => nowRef.t, dangerMinutes: 30 }); }

test('tracker: lần đầu không sinh sự kiện đổi; đổi hạng / mảnh / bậc sinh đúng sự kiện', () => {
    const t0 = { t: 0 }; const tr = tracker(t0);
    assert.deepStrictEqual(tr.applyRankUpdate(L.parseRankUpdate(pkt(), 0)).map((e) => e.type), []);
    const ev1 = tr.applyRankUpdate(L.parseRankUpdate(pkt({ rank: '9', stars: '4' }), 0));
    assert.deepStrictEqual(ev1.map((e) => e.type).sort(), ['rank', 'star']);
    assert.strictEqual(ev1.find((e) => e.type === 'rank').from, 12);
    assert.strictEqual(ev1.find((e) => e.type === 'star').delta, 1);
    const ev2 = tr.applyRankUpdate(L.parseRankUpdate(pkt({ rank: '9', classType: 1500, stars: '0' }), 0));
    assert.deepStrictEqual(ev2.map((e) => e.type), ['promo']);
    const ev3 = tr.applyRankUpdate(L.parseRankUpdate(pkt({ rank: '9', classType: 1300, stars: '4' }), 0));
    assert.deepStrictEqual(ev3.map((e) => e.type), ['demote']);
});

test('tracker: sắp rớt theo giờ chốt; người giữ hạng chỉ tính quà trong lúc nguy hiểm', () => {
    const t = { t: 0 }; const tr = tracker(t);
    tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '7200' }), 0));       // còn 2 giờ → chưa nguy
    assert.strictEqual(tr.snapshot().danger, false);
    assert.strictEqual(tr.applyGift({ uniqueId: 'x', nickname: 'X', coins: 500 }), null);   // không tính
    const ev = tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '600' }), 0)); // còn 10 phút
    assert.deepStrictEqual(ev.map((e) => e.type), ['danger']);
    const r1 = tr.applyGift({ uniqueId: 'a', nickname: 'An', profilePicture: 'p', coins: 100 });
    assert.strictEqual(r1.type, 'rescuer');
    assert.strictEqual(r1.top.nickname, 'An');
    tr.applyGift({ uniqueId: 'b', nickname: 'Bình', coins: 300 });
    tr.applyGift({ uniqueId: 'a', nickname: 'An', coins: 150 });
    const snap = tr.snapshot();
    assert.deepStrictEqual(snap.rescue.top.map((d) => [d.uniqueId, d.coins]), [['b', 300], ['a', 250]]);
    const kept = tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '500', gap: 'Bạn đã giữ hạng', gapVal: '' }), 0));
    assert.deepStrictEqual(kept.map((e) => e.type), ['safe', 'kept']);
    assert.strictEqual(kept[1].rescuer.uniqueId, 'b');
    assert.strictEqual(tr.snapshot().lastRescue.uniqueId, 'b');
    assert.strictEqual(tr.snapshot().rescue.active, false);
});

test('tracker: không biết giờ chốt thì nguy hiểm khi tỉ lệ giữ hạng < 35%', () => {
    const t = { t: 0 }; const tr = tracker(t);
    tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '0', score: '8000', gapVal: '1000' }), 0));
    assert.strictEqual(tr.snapshot().danger, false);
    tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '0', score: '1000', gapVal: '5000' }), 0));
    assert.strictEqual(tr.snapshot().danger, true);
});

test('tracker: sự kiện rescuer chỉ khi người dẫn đầu đổi hoặc chính họ tăng xu', () => {
    const t = { t: 0 }; const tr = tracker(t);
    tr.applyRankUpdate(L.parseRankUpdate(pkt({ countdown: '60' }), 0));
    assert.ok(tr.applyGift({ uniqueId: 'a', nickname: 'A', coins: 500 }));
    assert.strictEqual(tr.applyGift({ uniqueId: 'b', nickname: 'B', coins: 10 }), null);   // không vượt top
    assert.ok(tr.applyGift({ uniqueId: 'a', nickname: 'A', coins: 1 }));
    assert.ok(tr.applyGift({ uniqueId: 'b', nickname: 'B', coins: 999 }));
});

test('tracker: snapshot keepPct + reset', () => {
    const t = { t: 0 }; const tr = tracker(t);
    tr.applyRankUpdate(L.parseRankUpdate(pkt({ score: '3000', gapVal: '1000' }), 0));
    assert.strictEqual(tr.snapshot().keepPct, 75);
    tr.reset();
    assert.strictEqual(tr.snapshot().league, null);
});
