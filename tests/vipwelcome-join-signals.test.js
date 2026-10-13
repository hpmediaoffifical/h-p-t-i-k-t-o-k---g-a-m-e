'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readUser, fromMember, fromBarrage, isSubscribeMember } = require('../lib/vipwelcome/join-signals.js');

const HOST = '7000000000000000001';
const ctx = { hostUserId: HOST };
const baseUser = (over) => ({
    id: '6800000000000000077', displayId: 'davina', nickname: 'Davina',
    avatarThumb: { url: ['https://p16-sign-sg.tiktokcdn.com/a.webp', 'https://p77.tiktokcdn.com/a.webp'] },
    ...over
});

test('fromMember: action 1 và 26 là vào phòng, action 3 (subscribe) thì không', () => {
    const s1 = fromMember({ action: 1, user: baseUser() }, ctx);
    assert.equal(s1.source, 'member');
    assert.equal(s1.user.userId, '6800000000000000077');
    assert.equal(s1.user.uniqueId, 'davina');
    assert.equal(s1.user.nickname, 'Davina');
    assert.equal(s1.user.avatar, 'https://p16-sign-sg.tiktokcdn.com/a.webp');
    assert.ok(fromMember({ action: 26, user: baseUser() }, ctx));
    assert.equal(fromMember({ action: 3, user: baseUser() }, ctx), null);
    assert.equal(isSubscribeMember({ action: 3 }), true);
    assert.equal(isSubscribeMember({ action: '1' }), false);
});

test('readUser: LV từ badge sceneType 8 khi payGrade = 0', () => {
    const u = readUser(baseUser({
        payGrade: { level: 0 },
        badgeList: [{ sceneType: 8, privilegeLogExtra: { level: '23' } }]
    }), ctx);
    assert.equal(u.level, 23);
});

test('readUser: FAN LV chỉ nhận club của chủ phòng', () => {
    const own = readUser(baseUser({ fansClub: { data: { level: 3, anchorId: HOST, userFansClubStatus: 1, clubName: 'Nhà Vi' } } }), ctx);
    assert.equal(own.fansLevel, 3);
    assert.equal(own.fansClubName, 'Nhà Vi');
    const other = readUser(baseUser({ fansClub: { data: { level: 9, anchorId: '123', userFansClubStatus: 1 } } }), ctx);
    assert.equal(other.fansLevel, 0);
    const notJoined = readUser(baseUser({ fansClub: { data: { level: 4, anchorId: HOST, userFansClubStatus: 0 } } }), ctx);
    assert.equal(notJoined.fansLevel, 0);
    const badge = readUser(baseUser({ badgeList: [{ sceneType: 10, privilegeLogExtra: { level: '7' } }] }), ctx);
    assert.equal(badge.fansLevel, 7);
});

test('fromBarrage: msgType 9 = vào phòng theo cấp', () => {
    const s = fromBarrage({ msgType: 9, userGradeParam: { currentGrade: 35, user: baseUser() } }, ctx);
    assert.equal(s.source, 'barrage-grade');
    assert.equal(s.user.level, 35);
    assert.equal(s.user.uniqueId, 'davina');
});

test('fromBarrage: msgType 11 = vào phòng theo fan, 15 = ẩn danh', () => {
    const f = fromBarrage({ msgType: 11, fansLevelParam: { currentGrade: 12, user: baseUser() } }, ctx);
    assert.equal(f.source, 'barrage-fans');
    assert.equal(f.user.fansLevel, 12);
    const e = fromBarrage({ msgType: 15, user: baseUser() }, ctx);
    assert.equal(e.source, 'barrage-enigma');
    assert.equal(e.user.isEnigma, true);
});

test('fromBarrage: superfan joined, user nằm trong content.pieces', () => {
    const s = fromBarrage({
        msgType: 0,
        content: { key: 'ttlive_superfan_commentnotif_superfanjoined', pieces: [{ userValue: { user: baseUser() } }] }
    }, ctx);
    assert.equal(s.source, 'superfan');
    assert.equal(s.user.userId, '6800000000000000077');
});

test('fromBarrage: loại khác (8 = lên cấp) không phải vào phòng', () => {
    assert.equal(fromBarrage({ msgType: 8, userGradeParam: { currentGrade: 20, user: baseUser() } }, ctx), null);
});

test('empty payloads: không throw, không trả signal rỗng', () => {
    assert.equal(fromMember({}, ctx), null);
    assert.equal(fromMember(null, ctx), null);
    assert.equal(fromBarrage({ msgType: 9 }, ctx), null);
    assert.equal(fromMember({ action: 1, user: { id: '0', displayId: '' } }, ctx), null);
    assert.equal(fromBarrage(undefined, ctx), null);
});

test('readUser: vai trò MOD / bạn bè / TOP / sub / verified', () => {
    const u = readUser(baseUser({
        userAttr: { isAdmin: true },
        followInfo: { followStatus: '2' },
        subscribeInfo: { isSubscribe: true },
        verified: true
    }), ctx, { topUserNo: 2 });
    assert.equal(u.isModerator, true);
    assert.equal(u.isFriend, true);
    assert.equal(u.isFollowing, true);
    assert.equal(u.isSubscriber, true);
    assert.equal(u.topUserNo, 2);
    assert.equal(u.verified, true);
    const m = fromMember({ action: 1, isSetToAdmin: true, topUserNo: 1, user: baseUser() }, ctx);
    assert.equal(m.user.isModerator, true);
    assert.equal(m.user.topUserNo, 1);
});

test('readUser: dạng cũ 2.1.0 (uniqueId/userId/profilePicture/userHonor)', () => {
    const u = readUser({ uniqueId: 'old', userId: 55, nickname: 'Old', profilePicture: { url: ['https://x.tiktokcdn.com/p.jpg'] }, userHonor: { level: 12 } }, ctx);
    assert.equal(u.uniqueId, 'old');
    assert.equal(u.userId, '55');
    assert.equal(u.level, 12);
    assert.equal(u.avatar, 'https://x.tiktokcdn.com/p.jpg');
});
