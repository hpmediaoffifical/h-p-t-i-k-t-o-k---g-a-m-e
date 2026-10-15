'use strict';
/* VIP Welcome — đổi payload TikTok (tiktok-live-connector 2.4.4, proto v3; đọc cả tên cũ 2.1.0) thành
 * tín hiệu "vào phòng" chuẩn. TikTok KHÔNG gửi member cho mọi lần vào: người xem cấp cao / fan club thường
 * đến qua WebcastBarrageMessage (banner vào phòng) msgType 9/11/15 — nên phải gộp cả hai nguồn. */

const BARRAGE_GRADE_ENTRANCE = 9;
const BARRAGE_FANS_ENTRANCE = 11;
const BARRAGE_ENIGMA_ENTRANCE = 15;
const BADGE_SCENE_ADMIN = 1;
const BADGE_SCENE_SUBSCRIBER = 4;
const BADGE_SCENE_NEW_SUBSCRIBER = 7;
const BADGE_SCENE_USER_GRADE = 8;
const BADGE_SCENE_FANS = 10;
const MEMBER_ACTION_SUBSCRIBED = 3;
const SUPERFAN_JOINED_KEY = 'ttlive_superfan_commentnotif_superfanjoined';

// ID TikTok có thể là string/number/bigint; '0' là mặc định proto = không có.
function idStr(v) {
    if (v == null || typeof v === 'object') return '';
    const s = String(v).trim();
    return (s === '' || s === '0' || s === 'NaN' || s === 'undefined') ? '' : s;
}

// Ảnh là MẢNG link (nhiều CDN mirror): 2.4.4/proto v3 = ImageModel.urlList, 2.1.0 = Image.url → lấy link đầu hợp lệ.
function pickUrl(v, depth = 0) {
    if (!v || depth > 3) return '';
    if (typeof v === 'string') return /^https?:\/\//i.test(v) ? v : '';
    if (Array.isArray(v)) { for (const x of v) { const s = pickUrl(x, depth + 1); if (s) return s; } return ''; }
    if (typeof v === 'object') return pickUrl(v.url ?? v.urlList ?? v.url_list ?? '', depth + 1);
    return '';
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function badgeLevel(badges, scene) {
    if (!Array.isArray(badges)) return 0;
    let best = 0;
    for (const b of badges) {
        if (!b || Number(b.sceneType ?? b.badgeSceneType) !== scene) continue;
        best = Math.max(best, num(b.privilegeLogExtra?.level ?? b.level));
    }
    return best;
}

function hasBadge(badges, scene) {
    return Array.isArray(badges) && badges.some(b => b && Number(b.sceneType ?? b.badgeSceneType) === scene);
}

// opts: { topUserNo, level, fansLevel, isEnigma } — dữ liệu nằm ở message chứ không ở User.
function readUser(u, ctx, opts) {
    u = u || {};
    opts = opts || {};
    const host = idStr(ctx?.hostUserId);
    const badges = u.badgeList || u.badges;

    const level = Math.max(
        badgeLevel(badges, BADGE_SCENE_USER_GRADE),
        num(u.payGrade?.level), num(u.userHonor?.level), num(u.pay_grade?.level),
        num(opts.level)
    );

    // Fan club CỦA CHỦ PHÒNG: badge sceneType 10 + fansClub.data (FansClubData có anchorId → kiểm đúng chủ phòng;
    // status 0 = chưa tham gia). fansClubInfo (FansClubInfo) KHÔNG có anchorId và có fansCount → thường là club RIÊNG
    // của người đó khi họ là creator → chỉ dùng làm dự phòng khi không có fansClub.data và không có fansCount.
    const club = u.fansClub?.data;
    const clubIsHost = club && (!idStr(club.anchorId) || !host || idStr(club.anchorId) === host);
    const clubActive = club && Number(club.userFansClubStatus ?? 1) !== 0;
    const info = u.fansClubInfo;
    const infoUsable = info && !club && !num(info.fansCount);
    const fansLevel = Math.max(
        badgeLevel(badges, BADGE_SCENE_FANS),
        infoUsable ? num(info.fansLevel) : 0,
        clubIsHost && clubActive ? num(club.level) : 0,
        num(opts.fansLevel)
    );
    const fansClubName = (clubIsHost ? club?.clubName : '') || (infoUsable ? info.fansClubName : '') || '';

    const followStatus = num(u.followInfo?.followStatus ?? u.followStatus);
    return {
        userId: idStr(u.userId) || idStr(u.idStr) || idStr(u.id_str) || idStr(u.id),
        uniqueId: String(u.uniqueId || u.displayId || u.display_id || '').replace(/^@/, ''),
        nickname: String(u.nickname || u.nickName || ''),
        avatar: pickUrl(u.profilePicture || u.profilePictureUrl || u.avatarThumb || u.avatar_thumb || u.avatarMedium || u.avatarLarge),
        level,
        fansLevel,
        fansClubName,
        isModerator: !!(u.userAttr?.isAdmin || u.userAttr?.isSuperAdmin || hasBadge(badges, BADGE_SCENE_ADMIN)),
        // Đăng ký kênh CHỦ PHÒNG: isSubscribedToAnchor + badge 4/7. subscribeInfo.isSubscribe / User.isSubscribe có thể là
        // kênh riêng của người đó (SubscribeInfo còn chứa subscriberCount/qualification phía creator) → không dùng.
        isSubscriber: !!(u.subscribeInfo?.isSubscribedToAnchor
            || hasBadge(badges, BADGE_SCENE_SUBSCRIBER) || hasBadge(badges, BADGE_SCENE_NEW_SUBSCRIBER)),
        isFollowing: followStatus >= 1,
        isFriend: followStatus >= 2,
        topUserNo: num(opts.topUserNo),
        isEnigma: !!(u.enigmaInfo?.isEnigmaMaskOn || opts.isEnigma),
        verified: !!u.verified
    };
}

function hasIdentity(user) {
    return !!(user && (user.userId || user.uniqueId));
}

function isSubscribeMember(data) {
    return Number(data?.action) === MEMBER_ACTION_SUBSCRIBED;
}

function fromMember(data, ctx) {
    if (!data || isSubscribeMember(data)) return null;
    // MemberMessage cũng dùng cho thông báo "X được đặt làm quản trị viên" (có operator / isSetToAdmin) — không phải vào phòng.
    if (data.isSetToAdmin || idStr(data.operator?.userId ?? data.operator?.id)) return null;
    const user = readUser(data.user, ctx, { topUserNo: data.topUserNo });
    if (!user.userId) user.userId = idStr(data.userId);
    return hasIdentity(user) ? { source: 'member', user } : null;
}

function barrageUser(data) {
    if (data.userGradeParam?.user) return data.userGradeParam.user;
    if (data.fansLevelParam?.user) return data.fansLevelParam.user;
    if (data.user) return data.user;
    for (const text of [data.content, data.commonBarrageContent]) {
        for (const p of (text?.pieces || [])) if (p?.userValue?.user) return p.userValue.user;
    }
    return null;
}

function fromBarrage(data, ctx) {
    if (!data) return null;
    const type = Number(data.msgType);
    const keys = [data.content?.key, data.commonBarrageContent?.key].map(k => String(k || '').toLowerCase());
    let source = null;
    if (keys.some(k => k.includes(SUPERFAN_JOINED_KEY))) source = 'superfan';
    else if (type === BARRAGE_GRADE_ENTRANCE) source = 'barrage-grade';
    else if (type === BARRAGE_FANS_ENTRANCE) source = 'barrage-fans';
    else if (type === BARRAGE_ENIGMA_ENTRANCE) source = 'barrage-enigma';
    if (!source) return null;
    const raw = barrageUser(data);
    if (!raw) return null;
    const user = readUser(raw, ctx, {
        level: source === 'barrage-grade' ? data.userGradeParam?.currentGrade : 0,
        fansLevel: source === 'barrage-fans' ? data.fansLevelParam?.currentGrade : 0,
        isEnigma: source === 'barrage-enigma'
    });
    if (!user.userId) user.userId = idStr(data.userGradeParam?.userId);
    return hasIdentity(user) ? { source, user } : null;
}

module.exports = { readUser, fromMember, fromBarrage, isSubscribeMember, pickUrl, idStr };
