'use strict';
// 🏆 Thẻ Giải Đấu — đọc gói rankUpdate của TikTok (proto v3) + theo dõi trạng thái sinh sự kiện cho overlay.
// Hàm THUẦN (không đụng socket/appConfig), test ở tests/league-card.test.js. Spec: docs/superpowers/specs/2026-10-30-leaguecard-design.md
// Đọc phòng thủ: enum có thể là số hoặc chuỗi, int64 là chuỗi, thiếu trường thì để null (overlay ẩn phần đó).
// Các chỗ còn GIẢ ĐỊNH (chờ log LIVE thật ở /api/rank-log): "thiếu X" là điểm ≈ xu, đơn vị countdown.

const LETTERS = ['D', 'C', 'B', 'A'];
const RANK_TYPE_LEAGUE = 13;

/** classType (100…2000, 2100 hoặc chuỗi 'B_2'/'S') → 'B2' / 'S' / null. */
function divisionFromClassType(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string' && !/^\d+$/.test(v)) {
        const s = v.replace(/^CLASS_TYPE_/, '').toUpperCase();
        if (s === 'S') return 'S';
        const m = /^([ABCD])_?([1-5])$/.exec(s);
        return m ? m[1] + m[2] : null;
    }
    const n = Number(v);
    if (n === 2100) return 'S';
    if (!(n >= 100 && n <= 2000) || n % 100) return null;
    const idx = n / 100 - 1;                       // 0 = D5 … 19 = A1
    return LETTERS[Math.floor(idx / 5)] + (5 - (idx % 5));
}

/** Thứ tự bậc để so lên/xuống: D5 = 0 … A1 = 19, S = 20; không rõ → -1. */
function divisionIndex(div) {
    if (div === 'S') return 20;
    const m = /^([ABCD])([1-5])$/.exec(div || '');
    if (!m) return -1;
    return LETTERS.indexOf(m[1]) * 5 + (5 - Number(m[2]));
}

function pieceToString(p) {
    if (!p) return '';
    if (p.stringValue) return String(p.stringValue);
    const u = p.userValue && p.userValue.user;
    if (u) return String(u.nickname || u.displayId || u.uniqueId || '');
    if (p.giftValue && p.giftValue.giftId) return String(p.giftValue.giftId);
    return '';
}

/** TikTok Text {defaultPattern:'… {0:string} …', pieces[]} → chuỗi thường. */
function textToString(t) {
    if (t == null) return '';
    if (typeof t === 'string') return t;
    const pieces = Array.isArray(t.pieces) ? t.pieces : [];
    const pattern = t.defaultPattern || '';
    if (pattern) return pattern.replace(/\{(\d+)(?::[^}]*)?\}/g, (_, i) => pieceToString(pieces[Number(i)])).replace(/\s+/g, ' ').trim();
    return pieces.map(pieceToString).filter(Boolean).join(' ');
}

const SUFFIX = { k: 1e3, n: 1e3, m: 1e6, tr: 1e6 };
/** Lấy số đầu tiên trong câu: "1,250" "1.250" → 1250; "1.2K" "3,5N" → 1200 / 3500; không có → null. */
function parseNumberLoose(str) {
    const m = /(\d+(?:[.,]\d+)*)\s*(tr|k|n|m)?(?![a-zà-ỹ])/i.exec(String(str || ''));
    if (!m) return null;
    let raw = m[1];
    const mul = m[2] ? SUFFIX[m[2].toLowerCase()] : 1;
    const parts = raw.split(/[.,]/);
    let n;
    if (parts.length === 1) n = Number(raw);
    else if (m[2]) n = Number(parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);   // có hậu tố → dấu cuối là thập phân
    else if (parts.slice(1).every((p) => p.length === 3)) n = Number(parts.join(''));          // nhóm 3 số → phân cách nghìn
    else n = Number(parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);
    return Number.isFinite(n) ? Math.round(n * mul) : null;
}

function num(v) { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function posNum(v) { const n = num(v); return n != null && n > 0 ? n : null; }
/** Mốc thời gian giây hoặc ms → ms. */
function toMs(v) { const n = posNum(v); if (n == null) return null; return n > 1e12 ? n : n * 1000; }

function isLeagueUpdate(u) {
    if (!u) return false;
    if (divisionFromClassType(u.classInfo && u.classInfo.classType)) return true;
    return Number(u.rankType) === RANK_TYPE_LEAGUE || u.rankType === 'TYPE_RANK_LEAGUE';
}

/** Gói rankUpdate → thông tin giải đấu đã chuẩn hoá, hoặc null nếu gói không có mục giải đấu. */
function parseRankUpdate(msg, now = Date.now()) {
    if (!msg) return null;
    const updates = msg.updates || msg.updatesList || [];
    if (!Array.isArray(updates)) return null;
    const u = updates.find((x) => x && divisionFromClassType(x.classInfo && x.classInfo.classType)) || updates.find(isLeagueUpdate);
    if (!u) return null;
    const aff = u.affiliatedInfo || {};
    const gapText = textToString(aff.gapDesc) || textToString(aff.stickerGapDesc);
    const need = gapText ? (parseNumberLoose(gapText) ?? 0) : null;
    const cd = posNum(u.countdown);
    const deadlineTs = cd == null ? null : cd > 1e12 ? cd : cd > 1e9 ? cd * 1000 : now + cd * 1000;
    let settle = null;
    const si = aff.settleInfo;
    if (si && si.oldClassInfo && si.newClassInfo) {
        const from = divisionFromClassType(si.oldClassInfo.classType), to = divisionFromClassType(si.newClassInfo.classType);
        if (from && to) settle = { from, to, fromStars: num(si.oldClassInfo.starCount) ?? 0, toStars: num(si.newClassInfo.starCount) ?? 0, rank: posNum(si.ownerSettleRank) };
    }
    let bonus = null;
    const b = aff.teamRankBonusTime;
    if (b && (b.switch === true || b.switch === 'true')) {
        bonus = { on: true, startTs: toMs(b.startTimestamp), endTs: toMs(b.endTimestamp), rate: num(b.bonusRate), giftId: b.bonusTimeGiftId ? String(b.bonusTimeGiftId) : null };
    }
    return {
        division: divisionFromClassType(u.classInfo && u.classInfo.classType),
        stars: num(u.classInfo && u.classInfo.starCount) ?? 0,
        rank: posNum(aff.realTimeRank) ?? posNum(u.ownRank),
        score: num(u.currentScore),
        gapText,
        need,
        deadlineTs,
        settle,
        bonus,
        source: 'tiktok',
    };
}

/** 'HH:MM' → mốc ms gần nhất sắp tới (đã qua hôm nay thì sang ngày mai); sai định dạng → null. */
function nextDeadlineTs(hhmm, now = Date.now()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    const d = new Date(now);
    d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
}

/**
 * Số streamer NHẬP TAY (đọc từ app TikTok) → cùng dạng với parseRankUpdate. Lý do: thử 9 phòng LIVE thật (30/10/2026)
 * qua kết nối ẩn danh không nhận được gói rankUpdate nào — TikTok không gửi số giải đấu cho người xem chưa đăng nhập.
 */
function manualToParsed(m, now = Date.now()) {
    if (!m) return null;
    const division = divisionFromClassType(String(m.division || '').toUpperCase().replace(/^([ABCD])([1-5])$/, '$1_$2'));
    if (!division) return null;
    const need = num(m.need);
    return {
        division,
        stars: Math.max(0, Math.round(num(m.stars) ?? 0)),
        rank: posNum(m.rank),
        score: null,
        gapText: '',
        need: need == null ? null : Math.max(0, Math.round(need)),
        deadlineTs: nextDeadlineTs(m.deadline, now),
        settle: null,
        bonus: null,
        source: 'manual',
    };
}

function keepPctOf(l) {
    if (!l || l.need == null) return null;
    if (l.need <= 0) return 100;
    if (l.score == null) return null;
    return Math.round((l.score / (l.score + l.need)) * 100);
}

/**
 * Theo dõi trạng thái thẻ qua các lần cập nhật. Sự kiện trả về:
 * rank {from,to} · star {delta,from,to} · promo/demote {from,to} · danger · safe · kept {rescuer} · rescuer {top}.
 * "Sắp rớt" = còn thiếu điểm và (≤ dangerMinutes tới giờ chốt; không biết giờ chốt thì giữ được < 35%).
 */
function createLeagueTracker({ now = Date.now, dangerMinutes = 30 } = {}) {
    let league = null, danger = false, updatedAt = 0, lastRescue = null;
    let rescue = { active: false, startedAt: 0, donors: new Map() };
    let dangerMs = dangerMinutes * 60000;

    function isDanger(l) {
        if (!l || !(l.need > 0)) return false;
        if (l.deadlineTs != null) return l.deadlineTs - now() <= dangerMs;
        const k = keepPctOf(l);
        return k != null && k < 35;
    }
    function topDonors(n = 3) {
        return [...rescue.donors.values()].sort((a, b) => b.coins - a.coins || a.firstAt - b.firstAt).slice(0, n)
            .map(({ uniqueId, nickname, profilePicture, coins }) => ({ uniqueId, nickname, profilePicture, coins }));
    }

    function applyRankUpdate(p) {
        if (!p) return [];
        const ev = [];
        const prev = league;
        if (prev) {
            if (prev.rank != null && p.rank != null && prev.rank !== p.rank) ev.push({ type: 'rank', from: prev.rank, to: p.rank });
            const a = divisionIndex(prev.division), b = divisionIndex(p.division);
            if (a >= 0 && b >= 0 && a !== b) ev.push({ type: b > a ? 'promo' : 'demote', from: prev.division, to: p.division, settle: p.settle || null });
            else if (prev.stars !== p.stars) ev.push({ type: 'star', delta: p.stars - prev.stars, from: prev.stars, to: p.stars });
        }
        league = p;
        updatedAt = now();
        const d = isDanger(p);
        if (d && !danger) {
            rescue = { active: true, startedAt: now(), donors: new Map() };
            ev.push({ type: 'danger' });
        } else if (!d && danger) {
            ev.push({ type: 'safe' });
            if (p.need === 0) {
                const top = topDonors(1)[0] || null;
                if (top) lastRescue = { ...top, at: now() };
                ev.push({ type: 'kept', rescuer: top });
            }
            rescue = { active: false, startedAt: 0, donors: new Map() };
        }
        danger = d;
        return ev;
    }

    /** Quà trong lúc sắp rớt → cộng cho người giữ hạng. Trả sự kiện khi người dẫn đầu đổi hoặc chính họ tặng thêm. */
    function applyGift({ uniqueId, nickname, profilePicture, coins } = {}) {
        const c = Number(coins) || 0;
        if (!rescue.active || !uniqueId || c <= 0) return null;
        const before = topDonors(1)[0];
        const cur = rescue.donors.get(uniqueId) || { uniqueId, nickname, profilePicture, coins: 0, firstAt: now() };
        cur.coins += c;
        if (nickname) cur.nickname = nickname;
        if (profilePicture) cur.profilePicture = profilePicture;
        rescue.donors.set(uniqueId, cur);
        const top = topDonors(1)[0];
        if (!before || before.uniqueId !== top.uniqueId || top.uniqueId === uniqueId) return { type: 'rescuer', top, giver: uniqueId, coins: c };
        return null;
    }

    /** Số nhập tay: quà trừ dần "thiếu X" (1 xu ≈ 1 điểm). Số từ TikTok thì không đụng (TikTok tự cập nhật) → null. */
    function consumeGiftForManual(coins) {
        const c = Number(coins) || 0;
        if (!league || league.source !== 'manual' || !(league.need > 0) || c <= 0) return null;
        return applyRankUpdate({ ...league, need: Math.max(0, league.need - c) });
    }

    function snapshot() {
        return { league, danger, keepPct: keepPctOf(league), rescue: { active: rescue.active, top: topDonors(3) }, lastRescue, updatedAt };
    }
    function reset() {
        league = null; danger = false; updatedAt = 0; lastRescue = null;
        rescue = { active: false, startedAt: 0, donors: new Map() };
    }
    function setDangerMinutes(m) { const n = Number(m); if (n > 0) dangerMs = n * 60000; }

    return { applyRankUpdate, applyGift, consumeGiftForManual, snapshot, reset, setDangerMinutes };
}

module.exports = { parseRankUpdate, manualToParsed, nextDeadlineTs, textToString, parseNumberLoose, divisionFromClassType, divisionIndex, createLeagueTracker, keepPctOf };
