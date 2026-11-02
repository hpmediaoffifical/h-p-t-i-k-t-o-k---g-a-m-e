'use strict';
// Luật THUẦN nối HP Action LIVE với HP Game Hub (không I/O, không đụng server.js).
// Phần nối thật (SDK, WebSocket, đồng hồ) ở tầng khác; file này chỉ biến đổi dữ liệu để test được.
const crypto = require('crypto');

const HUB_PAGES = Object.freeze(['home', 'camera', 'fxlib', 'obs', 'link', 'setup', 'settings', 'info']);

// Công tắc: chỉ bật khi chạy trong app HP Action LIVE (bản cài đặt id, hoặc ép bật bản dev).
function resolveHubEnv(env) {
    const e = env || {};
    return {
        allowed: e.HP_ACTION_HUB_LINK === '1' || (e.HP_ACTION_HUB_LINK !== '0' && !!e.HP_ACTION_HUB_APP_ID),
        appId: e.HP_ACTION_HUB_APP_ID || 'hp-action-live-dev',
        probe: e.HP_ACTION_HUB_PROBE !== '0'
    };
}

// Gói quà gửi Hub (§4.4). Action không chia quà nên không có tier / pair / kpiOnly.
function hubGiftPayload(g, opts) {
    g = g || {};
    const { id, coins, profileId = 'common', now = Date.now } = opts || {};
    const c = Number(coins ?? g.diamondCount ?? 1);
    const coin = Number.isFinite(c) ? c : 1;
    const quantity = Math.max(1, parseInt(g.repeatCount, 10) || 1);
    const out = {
        id,
        giftId: String(g.giftId),
        giftName: g.giftName,
        giftImage: g.giftPicture || g.image || '',
        coins: coin,
        quantity,
        totalCoins: coin * quantity,
        user: {
            uniqueId: g.uniqueId,
            userId: g.userId,
            nickname: g.nickname,
            avatar: g.profilePicture || '',
            level: g.level
        },
        profileId,
        source: g.source === 'test' ? 'test' : 'tiktok',
        streaking: false,
        receivedAt: now()
    };
    if (g.songGiftId) out.songGiftId = g.songGiftId;
    return out;
}

// Quà do 🧪 Thử quà trên Hub phát -> dạng emitGift của Action.
function hubGiftToAction(d) {
    d = d || {};
    const u = d.user || {};
    return {
        uniqueId: u.uniqueId || 'hp-game-hub',
        userId: u.userId,
        nickname: u.nickname,
        profilePicture: u.avatar || '',
        level: u.level,
        giftId: String(d.giftId),
        giftName: d.giftName,
        giftPicture: d.giftImage || '',
        diamondCount: d.coins,
        repeatCount: d.quantity || 1,
        source: 'test',
        hubGiftId: String(d.id)
    };
}

function hubStatusPayload(s) {
    s = s || {};
    return {
        connected: !!s.connected,
        live: !!s.connected,
        uniqueId: s.uniqueId,
        roomId: s.roomId,
        viewers: s.viewers,
        demo: false,
        since: s.since,
        capabilities: { queue: false }
    };
}

// Action không có hồ sơ NPC: một hồ sơ chung.
const HUB_PROFILE = Object.freeze({
    profileId: 'common',
    name: 'MẶC ĐỊNH',
    sceneName: '',
    all: Object.freeze([Object.freeze({ profileId: 'common', name: 'MẶC ĐỊNH' })])
});

function hubCatalogPayload(giftList) {
    const gifts = [];
    for (const it of Array.isArray(giftList) ? giftList : []) {
        if (!it || it.id == null || it.id === '' || !it.name) continue;
        const o = { giftId: String(it.id), name: it.name, image: it.image || '', coins: Number(it.diamond) || 0 };
        if (it.nameVi) o.nameVi = it.nameVi;
        if (it.virtual) o.virtual = true;
        gifts.push(o);
    }
    const sig = crypto.createHash('sha1').update(JSON.stringify(gifts)).digest('hex');
    return { gifts, sig };
}

// Hub "nắm" một trang khi đã nối, đang bật và khai báo provides có trang đó.
function hubOwns(pub, page) {
    return !!(pub && pub.enabled && pub.connected && Array.isArray(pub.provides) && pub.provides.includes(page));
}

function camRouteForGift(owns, localClaims) {
    return { runLocalCam: !owns, camClaims: owns ? ['hub'] : localClaims };
}

// Đếm số lần quá hạn trong cửa sổ trượt; > slowAt => chậm. onLog(n) tối đa 1 lần / windowMs.
function createSlowCounter({ windowMs = 60000, slowAt = 5, now = Date.now, onLog = () => {} } = {}) {
    let hits = [];
    let lastLog = -Infinity;
    function prune() {
        const t = now();
        hits = hits.filter(x => t - x <= windowMs);
        return t;
    }
    function count() { prune(); return hits.length; }
    function slow() { return count() > slowAt; }
    function hit() {
        const t = prune();
        hits.push(t);
        if (hits.length > slowAt && t - lastLog >= windowMs) {
            lastLog = t;
            onLog(hits.length);
        }
    }
    return { hit, slow, count };
}

const HUB_ACTION_LABELS = Object.freeze({
    open: 'Mở HP Game Hub',
    launch: 'Mở HP Game Hub',
    pair: 'Cho phép lại',
    download: 'Tải HP Game Hub'
});

// Thẻ trạng thái trong app; dòng đầu khớp thắng. Không nói token / WebSocket / Hub Link.
function hubCardModel(pub) {
    const p = pub || {};
    if (!p.allowed) return { tone: 'off', text: 'Liên kết HP Game Hub chỉ chạy trong app HP Action LIVE', action: null };
    if (!p.enabled) return { tone: 'off', text: 'Đã tắt liên kết HP Game Hub', action: null };
    if (p.connected) {
        let text = p.version ? 'Đã nối · ' + p.version : 'Đã nối';
        const game = Array.isArray(p.games) && p.games[0];
        if (game && game.name) text += ' · ' + game.name + ' đang chạy';
        if (p.slow) text += ' · phản hồi chậm';
        return { tone: p.slow ? 'warn' : 'ok', text, action: 'open' };
    }
    if (p.pairing) {
        return { tone: 'warn', text: 'Chờ cho phép trên HP Game Hub (mã ' + p.pairing.code + ')', action: 'open' };
    }
    if (p.lastError === 'token_revoked') return { tone: 'warn', text: 'Cần cho phép lại trên HP Game Hub', action: 'pair' };
    if (p.lastError === 'pair_denied') return { tone: 'warn', text: 'Đã bị từ chối trên HP Game Hub', action: 'pair' };
    if (p.running) return { tone: 'warn', text: 'HP Game Hub đang mở, chưa liên kết', action: 'pair' };
    if (p.installed) return { tone: 'idle', text: 'Đã cài, chưa mở', action: 'launch' };
    return { tone: 'idle', text: 'Chưa cài', action: 'download' };
}

function hubCardHints(pub) {
    const p = pub || {};
    const out = [];
    for (const n of Array.isArray(p.needs) ? p.needs : []) {
        out.push({ tone: 'warn', text: n.message, page: n.action && n.action.page });
    }
    if (p.ownsCamera && p.localCamOverlayOnline) {
        out.push({ tone: 'warn', text: 'OBS vẫn đang mở link Game Camera của HP Action LIVE - gỡ link đó khỏi Scene để camera không chạy đôi' });
    }
    return out;
}

const LIVE_KINDS = new Set(['like', 'comment', 'share', 'follow', 'member']);

// Vòng nối thật: khám phá + ghép đôi + đồng bộ + gửi quà không chờ. Mọi hàm an toàn: lỗi SDK / callback không bao giờ ném ra ngoài,
// mất Hub = trả về đường cũ (onGift() = false).
function createActionHub(opts = {}) {
    const {
        env = process.env, dataDir, version, getEnabled = () => true, getStatus = () => ({}), getCatalog = () => [],
        getLocalCamOverlayOnline = () => false, onOwnsChange = () => {}, onTestGift = () => {}, onPublic = () => {},
        sdk = {}, syncMs = 2000, planTimeoutMs = 300, logger = console, now = Date.now
    } = opts;
    const { allowed, appId, probe } = resolveHubEnv(env);
    const safe = (fn, ...a) => {
        try { return fn(...a); } catch (e) {
            try { logger.warn('[hub-link] ' + (e && e.message)); } catch { /* nuốt */ }
            return undefined;
        }
    };

    let enabled = true;
    try { enabled = getEnabled() !== false; } catch { enabled = true; }
    let hubState = null;       // bản hub.state cuối (null khi chưa nối)
    let overlays = [];
    let syncTimer = null;
    let lastOwns = false;
    let lastPubSig = '';
    let sigStatus = null;
    let sigCatalog = null;
    let profileSent = false;
    let catRef = null;
    let catPayload = null;

    const slowCounter = createSlowCounter({
        now,
        onLog: (n) => safe(() => logger.warn(`[hub-link] HP Game Hub phản hồi chậm: ${n} lần quá hạn trong 60 giây`))
    });

    let link = null;
    if (allowed) {
        const make = opts.createHubLink || require('./hub-link-client/index.cjs').createHubLink;
        link = make({
            appId, appName: 'HP Action LIVE', version,
            scopes: ['live.send', 'gift.plan', 'state.read'],
            capabilities: { queue: false },
            dataDir, logger,
            ...(probe ? {} : { probePorts: [] }),
            ...sdk
        });
    }

    const linkState = () => (link ? (safe(() => link.state()) || {}) : {});

    function publicState() {
        const st = linkState();
        const hs = hubState || {};
        const links = (link && safe(() => link.links)) || {};
        const core = {
            allowed, enabled: allowed && enabled, appId,
            installed: !!st.installed, running: !!st.running, paired: !!st.paired, connected: !!st.connected,
            pairing: st.pairing || null,
            version: (st.hub && st.hub.version) || hs.version || '',
            lastError: st.lastError || null,
            slow: slowCounter.slow(),
            provides: Array.isArray(hs.provides) ? hs.provides : [],
            games: Array.isArray(hs.running) ? hs.running : [],
            needs: Array.isArray(hs.needs) ? hs.needs : [],
            overlays,
            download: links.download || ''
        };
        core.ownsCamera = hubOwns(core, 'camera');
        core.localCamOverlayOnline = !!safe(getLocalCamOverlayOnline);
        core.card = hubCardModel(core);
        core.hints = hubCardHints(core);
        return core;
    }

    const ownsCamera = () => hubOwns(publicState(), 'camera');

    // Gọi sau mọi thay đổi có thể đổi giao diện / quyền nắm camera.
    function check() {
        const pub = publicState();
        if (pub.ownsCamera !== lastOwns) {
            lastOwns = pub.ownsCamera;
            safe(onOwnsChange, lastOwns);
        }
        const sig = JSON.stringify(pub);
        if (sig !== lastPubSig) {
            lastPubSig = sig;
            safe(onPublic, pub);
        }
    }

    function catalogPayload() {
        const list = safe(getCatalog);
        if (list !== catRef || !catPayload) { catRef = list; catPayload = hubCatalogPayload(list); }
        return catPayload;
    }

    function sync() {
        if (!link || !linkState().connected) return;
        const status = hubStatusPayload(safe(getStatus));
        const sStatus = JSON.stringify(status);
        if (sStatus !== sigStatus && link.send('live.status', status)) sigStatus = sStatus;
        if (!profileSent && link.send('profile.changed', HUB_PROFILE)) profileSent = true;
        const cat = catalogPayload();
        if (cat.sig !== sigCatalog && link.send('catalog.gifts', cat)) sigCatalog = cat.sig;
    }

    function tick() { safe(sync); safe(check); }

    function startTimer() {
        if (syncTimer || !syncMs) return;
        syncTimer = setInterval(tick, syncMs);
        if (syncTimer.unref) syncTimer.unref();
    }
    function stopTimer() { clearInterval(syncTimer); syncTimer = null; }

    if (link) {
        link.on('state', () => safe(check));
        link.on('connected', () => {
            sigStatus = null; sigCatalog = null; profileSent = false;
            safe(sync);
            Promise.resolve().then(() => link.overlays()).then((o) => { overlays = Array.isArray(o) ? o : []; safe(check); }, () => {});
            safe(check);
        });
        link.on('disconnected', () => { hubState = null; safe(check); });
        link.on('hub.state', (d) => { hubState = d && typeof d === 'object' ? d : null; safe(check); });
        link.on('catalog.request', () => {
            const cat = catalogPayload();
            if (link.send('catalog.gifts', cat)) sigCatalog = cat.sig;
        });
        link.on('gift.test', (d) => safe(() => onTestGift(hubGiftToAction(d))));
    }

    function start() {
        if (!link || !enabled) return;
        safe(() => link.start());
        startTimer();
        safe(check);
    }
    function stop() {
        stopTimer();
        if (link) safe(() => link.stop());
        safe(check);
    }
    function setEnabled(on) {
        enabled = !!on;
        if (!link) return;
        if (enabled) start();
        else {
            stopTimer();
            safe(() => link.stop());
            hubState = null;
            safe(check);
        }
    }

    // Không bao giờ ném, không bao giờ chờ: false = chạy đường cũ (không có Hub / chưa nhận camera).
    function onGift(g, extra) {
        try {
            if (!link || !g || g.giftId == null || g.giftId === '' || !ownsCamera()) return false;
            const id = g.hubGiftId || 'a_' + crypto.randomUUID();
            const p = hubGiftPayload(g, { id, coins: extra && extra.coins, now });
            if (!link.send('live.gift', p)) return false;
            link.request('gift.plan', p, planTimeoutMs).catch((err) => {
                if (err && err.code === 'timeout') { slowCounter.hit(); safe(check); }
            });
            return true;
        } catch (e) {
            safe(() => logger.warn('[hub-link] onGift lỗi: ' + (e && e.message)));
            return false;
        }
    }

    function sendLive(kind, data) {
        if (!link || !LIVE_KINDS.has(kind)) return false;
        return !!safe(() => link.send('live.' + kind, { ...data, profileId: 'common' }));
    }

    async function pair() {
        if (!link) return 'error';
        try { return await link.pair(); } catch { return 'error'; }
    }
    async function open(page) {
        if (!link || !HUB_PAGES.includes(page)) return 'failed';
        try { return await link.open(page); } catch { return 'failed'; }
    }
    function launch() {
        if (!link) return false;
        return !!safe(() => link.launch());
    }

    return {
        allowed, appId, start, stop, setEnabled, syncNow: tick,
        ownsCamera, onGift, sendLive, publicState, pair, open, launch
    };
}

module.exports = {
    createActionHub,
    HUB_PAGES,
    HUB_PROFILE,
    HUB_ACTION_LABELS,
    resolveHubEnv,
    hubGiftPayload,
    hubGiftToAction,
    hubStatusPayload,
    hubCatalogPayload,
    hubOwns,
    camRouteForGift,
    createSlowCounter,
    hubCardModel,
    hubCardHints
};
