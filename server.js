// ★ Wrap console methods để chống EPIPE crash (Electron stdout có thể bị closed bất ngờ)
// Khi pipe closed mà code log → throw EPIPE → main process crash. Silent fallback là an toàn.
['log', 'warn', 'error', 'info'].forEach(method => {
    const original = console[method];
    console[method] = function(...args) {
        try { original.apply(console, args); } catch (_) { /* ignore EPIPE/closed pipe */ }
    };
});
// Cũng catch ở process level (defense in depth)
process.stdout.on?.('error', (err) => { if (err.code === 'EPIPE') {} });
process.stderr.on?.('error', (err) => { if (err.code === 'EPIPE') {} });

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const fetch = require('node-fetch');
// tiktok-live-connector 2.4.4 là gói ESM-only: Node ≥22.12/24 (và Electron 42, kể cả trong app.asar) require() được
// đồng bộ; Node cũ ném ERR_REQUIRE_ESM → rơi về import() động. Mọi chỗ dùng đều đi qua loadTikTokConnector()
// (memo hoá) — KHÔNG destructure toàn cục để không dùng trước khi nạp.
// Lib 2.4.4 đọc timeout HTTP/WS từ env (webClientOptions.timeout bị bỏ qua) → đặt trước khi tạo connection.
process.env.TIKTOK_CLIENT_TIMEOUT ||= '20000';
process.env.WS_CONNECT_TIMEOUT_MS ||= '20000';
let tlc = null;          // { TikTokLiveConnection, WebcastEvent, ControlEvent, errors, SignConfig, ... } sau khi nạp + vá route
let tlcPromise = null;
function requireTikTokConnectorSync() {
    try { return require('tiktok-live-connector'); }
    catch (e) {
        const code = String((e && e.code) || '');
        const msg = String((e && e.message) || '');
        if (/ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE|ERR_PACKAGE_PATH_NOT_EXPORTED/.test(code) || /require\(\) of ES Module/i.test(msg)) return null;
        throw e;
    }
}
// Vá 1 lần sau khi nạp: fetchAvailableGifts() của 2.4.4 KÝ request gift/list qua Euler (signTikTokUrl) — tier ẩn danh bị
// từ chối ("requires a Business plan") → connect() với enableExtendedGiftInfo:true sẽ thất bại. TikTok vẫn trả gift/list
// KHÔNG ký (≈700 quà, id là number, cùng shape lookupGiftFromTikTok đang đọc) → thay handler bằng bản không ký;
// lỗi gift-list không được làm rớt kết nối (trả [] rồi đi tiếp).
function finishTikTokConnector(m) {
    const RouteConfig = m.RouteConfig;
    const originalFetchRoomGifts = m.fetchRoomGiftsRoute || (RouteConfig && RouteConfig.fetchRoomGifts);
    if (RouteConfig && !RouteConfig.__hpUnsignedGifts) {
        RouteConfig.fetchRoomGifts = async ({ webClient, roomId = webClient?.roomId }) => {
            if (!roomId) throw new Error('Missing roomId');
            try {
                const res = await webClient.getJsonObjectFromWebcastApi('gift/list/', { ...webClient.clientParams, room_id: roomId }, false);
                const gifts = res?.data?.gifts;
                if (Array.isArray(gifts) && gifts.length) return gifts;
                console.warn(`[tiktok] gift/list không ký trả status_code=${res?.status_code ?? '?'} không có quà — thử bản ký`);
            } catch (e) {
                console.warn('[tiktok] gift/list không ký lỗi:', String(e?.message || e).split('\n')[0]);
            }
            try {
                if (typeof originalFetchRoomGifts === 'function') {
                    const gifts = await originalFetchRoomGifts({ webClient, roomId });
                    if (Array.isArray(gifts)) return gifts;
                }
            } catch (e) {
                console.warn('[tiktok] gift/list bản ký cũng lỗi (thường cần gói trả phí Euler) — bỏ qua, kết nối vẫn tiếp tục:', String(e?.message || e).split('\n')[0]);
            }
            return [];
        };
        RouteConfig.__hpUnsignedGifts = true;
    }
    return {
        TikTokLiveConnection: m.TikTokLiveConnection,
        WebcastEvent: m.WebcastEvent,
        ControlEvent: m.ControlEvent,
        RouteConfig,
        SignConfig: m.SignConfig,
        VERSION: m.VERSION || '',
        errors: {
            UserOfflineError: m.UserOfflineError,
            ConnectTimeoutError: m.ConnectTimeoutError,
            AlreadyConnectedError: m.AlreadyConnectedError,
            AlreadyConnectingError: m.AlreadyConnectingError,
            SignatureRateLimitError: m.SignatureRateLimitError,
            SignAPIError: m.SignAPIError,
            PremiumFeatureError: m.PremiumFeatureError,
            InvalidUniqueIdError: m.InvalidUniqueIdError
        },
        raw: m
    };
}
async function loadTikTokConnector() {
    if (tlc) return tlc;
    if (!tlcPromise) {
        tlcPromise = (async () => {
            let m = requireTikTokConnectorSync();
            const how = m ? 'require' : 'import()';
            if (!m) m = await import('tiktok-live-connector');
            if (!m || typeof m.TikTokLiveConnection !== 'function') throw new Error('tiktok-live-connector nạp được nhưng thiếu TikTokLiveConnection');
            tlc = finishTikTokConnector(m);
            console.log(`[tiktok] tiktok-live-connector v${tlc.VERSION || '?'} đã nạp qua ${how} (node ${process.versions.node})`);
            return tlc;
        })().catch((e) => { tlcPromise = null; throw e; });
    }
    return tlcPromise;
}
// Nạp sớm lúc khởi động (không chặn listen) để log phiên bản + báo sớm nếu gói hỏng.
loadTikTokConnector().catch((e) => console.error('[tiktok] KHÔNG nạp được tiktok-live-connector:', e?.message || e));
const { OBSBridge } = require('./lib/obs-bridge');
const { ObsCameraFeed } = require('./lib/touchplay-obs-feed');
const CamRules = require('./lib/camgames');
const OverlayPresence = require('./lib/overlay-presence');
const GiftboardTT = require('./lib/giftboard-tt');
const { addOverlayToScene } = require('./lib/obs-add-overlay');
const CamSession = require('./lib/camgames-session');
const { createCamObs } = require('./lib/camgames-obs');
const LicFeat = require('./lib/license-features');   // tính năng theo KEY (HP KEY ft) — xem applyLicenseLocks()
const MusicGifts = require('./lib/music-gifts');
const CommentFilter = require('./lib/comment-filter');   // 🚫 từ cấm chung cho mọi game
const { LuaSync } = require('./lib/lua-sync');
const { OBSSettings } = require('./lib/obs-settings');

const PORT = process.env.PORT || 3000;
const CaptionListener = require('./lib/caption-listener');
const { createRankLog } = require('./lib/rank-log');
const LeagueCard = require('./lib/league-card');

// Domain giả trỏ về loopback (127.0.0.1) qua hosts file — cố định "hpaction.obs" cho mọi máy
// (không suy từ tên máy, để URL giống nhau trên mọi cài đặt HP Action LIVE). Lý do đầy đủ +
// phần tự thêm vào hosts file nằm ở lib/obs-host.js.
const { OBS_HOST: OBS_LOCAL_HOST, isHostMapped } = require('./lib/obs-host');
// VIP Welcome — thẻ vào phòng: tín hiệu vào phòng (member + barrage), vào/ra/vào lại, bậc, sổ xu, hàng media.
const vwSignals = require('./lib/vipwelcome/join-signals');
const vwTiers = require('./lib/vipwelcome/tier-match');
const { createPresence: createVipPresence, createPendingCards: createVipPendingCards } = require('./lib/vipwelcome/presence');
const { createGiftLedger: createVipGiftLedger } = require('./lib/vipwelcome/gift-ledger');
const { createFanLedger: createCoFanLedger, fanKey: coFanKey, stripVN: coStripVN } = require('./lib/creatoronline-fans');
const { createMediaQueue: createVipMediaQueue } = require('./lib/vipwelcome/media-queue');
// Giai đoạn 3: sổ ghé phòng theo buổi, gộp thẻ khi đông, câu đọc tên
const { createVisits: createVipVisits } = require('./lib/vipwelcome/visits');
const { createBatcher: createVipBatcher } = require('./lib/vipwelcome/batcher');
const { renderTts: vipRenderTts } = require('./lib/vipwelcome/tts-text');

// === Mọi data source đi qua license-server (HP Media kiểm soát) ===
// App không biết thông tin backend → installer .exe extract ra cũng không lộ gì.
// PRODUCTION URL hardcoded — luôn dùng (không có fallback đọc trực tiếp data nguồn).
const LICENSE_WORKER_URL = process.env.HP_LICENSE_WORKER_URL
    || 'https://hp-license.nguyenvu.dev';   // license-server production
function isWorkerConfigured() {
    return !LICENSE_WORKER_URL.includes('YOUR-DOMAIN') && !LICENSE_WORKER_URL.includes('YOUR-CF-USERNAME');
}
// HP_DATA_DIR được set bởi electron-main.js trong môi trường đóng gói (vì __dirname nằm trong asar read-only).
// Khi chạy dev / node trực tiếp: fallback về data/ cạnh server.js
const DATA_DIR = process.env.HP_DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'app-config.json');
const CONFIG_BACKUP_DIR = path.join(DATA_DIR, 'config-backups');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ====== Làm cứng mạng ======
// Mặc định server chỉ lắng nghe 127.0.0.1 (appConfig.network.lanAccess=false). Khi bật "Cho máy khác
// trong LAN" (⚙ Cài đặt) → bind 0.0.0.0; máy khác chỉ được ĐỌC (GET overlay + socket), muốn GHI
// (POST/PUT/PATCH/DELETE) phải gửi header X-HP-Token = appConfig.network.token.
// Mọi request GHI từ trình duyệt bị kiểm Origin (chống CSRF / DNS rebinding từ trang lạ).
// Ghi đè host bind bằng biến môi trường HP_BIND_HOST (vd 0.0.0.0 hoặc ::) — luôn thắng config.
const HP_BIND_HOST_ENV = String(process.env.HP_BIND_HOST || '').trim();
const LOCAL_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'hpaction.obs', String(OBS_LOCAL_HOST).toLowerCase()]);
function networkConfig() {
    if (!appConfig.network || typeof appConfig.network !== 'object') appConfig.network = { lanAccess: false, token: '' };
    return appConfig.network;
}
// IPv4 của máy này trong LAN (bỏ loopback/internal) — hiện ở ⚙ Cài đặt + allowlist Origin khi bật LAN.
function lanAddresses() {
    const out = [];
    try {
        for (const list of Object.values(os.networkInterfaces())) {
            for (const a of (list || [])) {
                if (!a.internal && (a.family === 'IPv4' || a.family === 4)) out.push(a.address);
            }
        }
    } catch (_) {}
    return out;
}
function isLoopbackIp(ip) {
    const s = String(ip || '').replace(/^::ffff:/i, '');   // bind '::' → client IPv4 hiện dạng ::ffff:127.0.0.1
    return s === '::1' || s.startsWith('127.');
}
function isAllowedOriginHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (!h) return false;
    if (LOCAL_ORIGIN_HOSTS.has(h) || /^127\.\d+\.\d+\.\d+$/.test(h)) return true;
    return networkConfig().lanAccess === true && lanAddresses().includes(h);
}
// origin = header Origin (hoặc Referer khi thiếu Origin). Không có = client không phải trình duyệt
// (curl, node-fetch từ electron-main, PowerShell) → cho qua; 'null' (sandbox / file://) → chặn.
function originAllowed(origin) {
    if (origin === undefined || origin === null) return true;
    const s = String(origin);
    if (s === '' || s === 'null') return false;   // Origin rỗng: trình duyệt thật không bao giờ gửi → không nới
    try { return isAllowedOriginHost(new URL(s).hostname); } catch (_) { return false; }
}
function tokenMatches(given, expected) {
    const a = Buffer.from(String(given || '')), b = Buffer.from(String(expected || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
// "Tin cậy" = từ chính máy này, hoặc máy LAN khi đã bật công tắc VÀ gửi đúng token. Dùng để che dữ liệu
// nhạy cảm khi ĐỌC (token, mật khẩu OBS, key bản quyền) và gác các event socket GHI/điều khiển —
// nếu không, máy LAN đọc token qua GET /api/settings rồi ghi thoải mái thì đòi token là vô nghĩa.
function isTrustedRemote(remoteAddress, givenToken) {
    if (isLoopbackIp(remoteAddress)) return true;
    const n = networkConfig();
    return n.lanAccess === true && tokenMatches(givenToken, n.token);
}
function requestIsTrusted(req) {
    return isTrustedRemote(req && req.socket && req.socket.remoteAddress, req && req.headers && req.headers['x-hp-token']);
}
// Token qua io({ auth: { token } }) (overlay đọc ?token= trên URL), hoặc ?token= / header X-HP-Token của handshake.
function socketIsTrusted(socket) {
    const hs = (socket && socket.handshake) || {};
    const given = (hs.auth && hs.auth.token) || (hs.query && hs.query.token) || (hs.headers && hs.headers['x-hp-token']);
    return isTrustedRemote(hs.address, given);
}

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) },
    // Gói cors chỉ set header (không bao giờ trả 403) và CORS không áp dụng cho WebSocket →
    // allowRequest mới thật sự chặn handshake (polling lẫn websocket) từ trang lạ theo Origin.
    allowRequest: (req, cb) => (originAllowed(req.headers.origin) ? cb(null, true) : cb('origin_not_allowed', false))
});

// Chống CSRF / DNS rebinding cho mọi request GHI — đặt TRƯỚC express.static/express.json và mọi
// express.raw inline ở route upload. GET và /socket.io không bị chặn ở đây.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req, res, next) => {
    if (!WRITE_METHODS.has(req.method) || req.path.startsWith('/socket.io')) return next();
    const src = req.headers.origin !== undefined ? req.headers.origin : req.headers.referer;
    if (!originAllowed(src)) return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
    // Máy khác trong LAN muốn GHI: phải bật "Cho máy khác trong LAN" + gửi header X-HP-Token (⚙ Cài đặt).
    const remote = req.socket && req.socket.remoteAddress;
    if (remote && !isLoopbackIp(remote)) {
        const n = networkConfig();
        if (n.lanAccess !== true) return res.status(403).json({ ok: false, error: 'lan_access_disabled' });
        if (!tokenMatches(req.headers['x-hp-token'], n.token)) return res.status(403).json({ ok: false, error: 'token_required' });
    }
    next();
});

// Static files: tắt cache cho JS/CSS/HTML để Electron renderer luôn nhận file mới
// sau khi app update (tránh tình trạng renderer cache code cũ → tính năng mới không hiện).
// Ảnh/assets vẫn được cache bình thường (max-age 1h) cho hiệu năng.
app.use((req, res, next) => {
    const p = req.path;
    if (/\.(js|css|html)$/i.test(p)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});
// Tính năng theo KEY: overlay OBS / trang game của mục bị khoá hiện 🔒 thay cho game (xem applyLicenseLocks).
// Đặt TRƯỚC express.static vì trang game cũng tới thẳng được qua /games/<id>/*.html.
const LICENSE_PAGE_ALIAS = {
    'vipwelcome-board': 'vipwelcome', 'nhatla-gifts': 'nhatla',
    translate: 'liveTranslate', 'creator-caption': 'liveTranslate'
};
app.use((req, res, next) => {
    // Lệnh điều khiển game (bắt đầu/dừng phiên, lệnh tay, quà thử) của mục bị khoá → từ chối.
    const ctl = req.method === 'POST' && req.path.match(/^\/api\/games\/([A-Za-z-]+)\/(control|cmd|test-gift)$/);
    if (ctl) return featureOn(ctl[1]) ? next() : res.status(403).json({ ok: false, error: 'feature_locked', message: licenseDeniedMessage(ctl[1]) });
    if (req.method !== 'GET') return next();
    const m = req.path.match(/^\/overlay\/([A-Za-z-]+)\/?$/)
        || req.path.match(/^\/games\/([A-Za-z-]+)\/[^/]+\.html$/i)
        || req.path.match(/^\/_prototype\/(touchplay|level-quest|timer)\.html$/i);
    if (!m) return next();
    const id = LICENSE_PAGE_ALIAS[m[1]] || m[1];
    if (featureOn(id)) return next();
    res.type('html').send(licenseLockedHtml(id));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));

// 13 events PK TikTok — metadata tĩnh, dùng chung cho default + normalize.
// `auto`: sự kiện này CÓ tín hiệu thật từ TikTok Live để tự fire hay không.
//   - true  → server auto-detect được (theo schema tiktok-live-connector v2).
//   - false → TikTok KHÔNG gửi dữ liệu phân biệt được → chỉ chạy tay / phím tắt.
// `hotkey`: tổ hợp phím bấm nhanh (chuẩn hoá, vd 'alt+1'); app.js bắt global.
// Khai báo TRƯỚC GAMES vì makeDefaultPkTiktokConfig() được gọi ngay khi dựng GAMES.
const PKTIKTOK_EVENT_DEFS = [
    { key: 'start',    label: 'BẮT ĐẦU PK',           emoji: '🚀', desc: 'Đếm ngược khi bắt đầu trận',            auto: true,  hotkey: 'alt+1' },
    { key: 'mission',  label: 'NHIỆM VỤ XUẤT HIỆN',   emoji: '📋', desc: 'Popup nhiệm vụ bonus',                  auto: true,  hotkey: 'alt+2' },
    { key: 'x2',       label: 'X2 ĐIỂM (Speed)',      emoji: '⚡', desc: 'Bonus mission unlock nhân 2',            auto: true,  hotkey: 'alt+3' },
    { key: 'x3',       label: 'X3 ĐIỂM (Speed mạnh)', emoji: '🔥', desc: 'Bonus mission unlock nhân 3',            auto: true,  hotkey: 'alt+4' },
    { key: 'glove',    label: 'ITEM Găng Tay',        emoji: '🥊', desc: 'Boosting Glove — critical strike x5',   auto: true,  hotkey: 'alt+5' },
    { key: 'mist',     label: 'ITEM Sương Mù',        emoji: '🌫️', desc: 'Magic Mist — TikTok không báo, chạy tay / phím tắt', auto: false, hotkey: 'alt+6' },
    { key: 'hammer',   label: 'ITEM Búa Choáng',      emoji: '🔨', desc: 'Stun Hammer — TikTok không báo, chạy tay / phím tắt', auto: false, hotkey: 'alt+7' },
    { key: 'time',     label: 'ITEM Thêm Giờ',        emoji: '⏱️', desc: 'Time-Maker — TikTok không báo, chạy tay / phím tắt',  auto: false, hotkey: 'alt+8' },
    { key: 'warn10s',  label: '10 GIÂY CUỐI',         emoji: '⚠️', desc: 'Đồng hồ chuyển đỏ',                      auto: true,  hotkey: 'alt+9' },
    { key: 'lead',     label: 'ĐANG DẪN ĐIỂM',        emoji: '📈', desc: 'Đội nhà > đội đối thủ',                 auto: true,  hotkey: 'alt+0' },
    { key: 'behind',   label: 'ĐANG THUA ĐIỂM',       emoji: '📉', desc: 'Đội nhà < đội đối thủ',                 auto: true,  hotkey: 'alt+q' },
    { key: 'win',      label: 'KẾT QUẢ: THẮNG',       emoji: '🏆', desc: 'Vinh quang chiến thắng',                auto: true,  hotkey: 'alt+w' },
    { key: 'lose',     label: 'KẾT QUẢ: THUA',        emoji: '💔', desc: 'Thất bại',                             auto: true,  hotkey: 'alt+e' },
];

// ====== Game registry ======
// Đập Muỗi — engine thuần dùng chung server/overlay (UMD): server dùng defaultConfig + normalizeConfig + luật quà,
// không chép lại như Nhặt Lá nên panel/overlay/server không lệch nhau. Nạp TRƯỚC GAMES vì defaultConfig gọi ngay.
const DapMuoi = require('./public/games/dapmuoi/game.js');
function makeDefaultDapMuoiConfig() { return DapMuoi.defaultConfig(); }
// 🏸 Đá Cầu — engine thuần UMD (port từ HP LIVE NPC): quà tung cầu, đỡ bằng đầu / đùi qua pose camera.
const DaCau = require('./public/games/dacau/game.js');
// 🧍 Bộ Tách Người — module server riêng (port HP LIVE NPC): route /overlay/body, /api/body/*, ẩn cam OBS, quà → body:run.
const BodyServer = require('./lib/body-server');

// ⛓️ Nhà Tù Online: bộ quà gợi ý (nhiệm vụ / chức vụ / sự kiện) nằm chung data.json với overlay + panel.
function duongVeQueSuggestedGiftMap() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'games', 'duongveque', 'data.json'), 'utf8')).suggestedGiftMap || {}; } catch (e) { return {}; }
}
function nhatuSuggestedGiftMap() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'games', 'nhatu', 'data.json'), 'utf8')).suggestedGiftMap || {}; } catch (e) { return {}; }
}
// 🏢 Creator Online — bộ quà gợi ý (vé, vai MC/Kỹ thuật/Quản lý, đổi nhạc, pháo giấy, PK, tâm điểm, Gala) trong data.json
function creatorOnlineSuggestedGiftMap() {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'games', 'creatoronline', 'data.json'), 'utf8')).suggestedGiftMap || {}; } catch (e) { return {}; }
}
// 🏢 Creator Online — cấp fan trọn đời + club đã chọn (spec §11). Chỉ ghi khi game bật VÀ có overlay đang kết nối
// (phòng socket 'co-overlay', overlay tự subscribe) → không lưu dữ liệu người xem của streamer chưa từng dùng game.
const coFans = createCoFanLedger({
    file: path.join(DATA_DIR, 'creatoronline-fans.json'),
    ranks: (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'games', 'creatoronline', 'data.json'), 'utf8')).fanRanks; } catch (e) { return undefined; } })()
});
process.on('exit', () => { try { coFans.flushSync(); } catch (e) {} });
function coFansActive() {
    try { return appConfig.games.creatoronline?.enabled !== false && (io.sockets.adapter.rooms.get('co-overlay')?.size || 0) > 0; } catch (e) { return false; }
}
// 🏢 Creator Online GĐ2 — quà gán vipHat/vipGlasses/vipWings trong coGiftMap → đồ VIP giữ trọn đời trong bộ đếm fan.
const CO_VIP_ACTIONS = [['vipHat', 'hat'], ['vipGlasses', 'glasses'], ['vipWings', 'wings']];
/** 'hat' | 'glasses' | 'wings' nếu quà khớp 1 mục VIP (so giftId trước, rồi tên quà bỏ dấu/hoa thường); null nếu không. */
function coVipItemForGift(payload) {
    const map = appConfig.games.creatoronline?.coGiftMap;
    if (!map || typeof map !== 'object' || !payload) return null;
    const entriesOf = (action) => (Array.isArray(map[action]) ? map[action] : []).filter(e => e && typeof e === 'object');
    const id = payload.giftId != null && String(payload.giftId) !== '' ? String(payload.giftId) : '';
    if (id) {
        for (const [action, item] of CO_VIP_ACTIONS) {
            if (entriesOf(action).some(e => e.giftId != null && String(e.giftId) === id)) return item;
        }
    }
    const name = coStripVN(String(payload.giftName || ''));
    if (name) {
        for (const [action, item] of CO_VIP_ACTIONS) {
            if (entriesOf(action).some(e => e.giftName && coStripVN(String(e.giftName)) === name)) return item;
        }
    }
    return null;
}
/** Gắn coFan (cấp + club đã lưu, giá trị TRƯỚC sự kiện này) vào payload; trả về bản cập nhật cần phát 'creatoronline:fan' hoặc null. */
function coFansTouch(payload, kind) {
    if (!coFansActive()) return null;
    try {
        payload.coFan = coFans.get(coFanKey(payload));
        if (kind === 'gift') return coFans.onGift(payload, { vip: coVipItemForGift(payload) });
        if (kind === 'chat') return coFans.onChat(payload, { switchSec: Number(appConfig.games.creatoronline?.coClubSwitchSec ?? 60) });
    } catch (e) { console.warn('[creatoronline] bộ đếm fan lỗi:', e?.message || e); }
    return null;
}

const GAMES = {
    thuytinh: {
        id: 'thuytinh',
        name: 'Hũ Thủy Tinh',
        description: '',
        icon: '🫙',
        overlayPath: '/overlay/thuytinh',
        defaultConfig: {
            enabled: true,
            jar: { xPercent: 50, yPercent: 56, height: 1200 },
            gift: { minSize: 24, maxSize: 120, showName: false, showCount: true },
            physics: { gravity: 1.4, bounce: 0.42, friction: 0.05 },
            jarVisible: true,
            maxCapacity: 0,
            webmFxVolume: 80
        }
    },
    caro: {
        id: 'caro',
        name: 'Caro Đối Đầu',
        description: 'Idol đấu Caro với khán giả — user bình luận tọa độ (vd "9F") để đánh.',
        icon: '🎯',
        overlayPath: '/overlay/caro',
        defaultConfig: {
            enabled: true,
            board: { cols: 12, rows: 12, winLength: 5 },
            match: { bestOf: 3, idolFirst: true, alternateFirst: true },
            registration: { giftId: '', minCount: 1, autoCloseSeconds: 0 },
            undo: { window: 30, maxPerRound: 3, mode: 'idol', giftId: '', cooldown: 60 },
            turnTimer: 0,
            practiceMode: false,
            rolling: { enabled: false, tokensPerSide: 3 },
            audio: { enabled: true, volume: 50 },
            colors: { idol: '#25F4EE', user: '#FE2C55' },
            display: {
                showHistory: true, showInfo: true,
                scale: 100, xPercent: 50, yPercent: 50,
                cellHints: false, cellHintOpacity: 35
            }
        }
    },
    pktiktok: {
        id: 'pktiktok',
        name: 'Hiệu ứng PK',
        description: 'Gán video/âm thanh cho từng phase trận PK TikTok (start, x2/x3, items, 10s cuối, thắng/thua).',
        icon: '🥊',
        overlayPath: '/overlay/pktiktok',
        defaultConfig: makeDefaultPkTiktokConfig()
    },
    vipwelcome: {
        id: 'vipwelcome',
        name: 'Chào Mừng VIP',
        description: 'Phát video/âm thanh khi user vào phòng LIVE hoặc khi user tặng quà — theo TikTok ID hoặc theo cấp độ.',
        icon: '🎊',
        overlayPath: '/overlay/vipwelcome',
        defaultConfig: makeDefaultVipWelcomeConfig()
    },
    votecomment: {
        id: 'votecomment',
        name: 'Vote Bình Luận',
        description: 'Khán giả bình luận từ khoá / tặng quà để bình chọn — thanh máu + % cập nhật realtime.',
        icon: '🗳',
        overlayPath: '/overlay/votecomment',
        defaultConfig: makeDefaultVoteCommentConfig()
    },
    quaivat: {
        id: 'quaivat',
        name: 'Zombie Phá Nhà',
        description: 'Zombie (streamer) đi dọc đường tới phá cửa nhà; người xem tặng quà gài bẫy, ném đồ, gọi đồng minh để chặn. Phá được cửa → vào nhà ăn não, +1 WIN.',
        icon: '🧟',
        overlayPath: '/overlay/quaivat',
        // Khoá riêng tiền tố qv* (tránh đụng cleanThuyTinhConfig xoá khoá trùng tên game khác).
        defaultConfig: {
            enabled: true,
            qvStreamerName: '', qvStreamerAvatar: '',
            qvDoorHp: 600, qvRoundSeconds: 180, qvStartMap: 1,
            qvLockJump: false, qvLockForward: false, qvSound: true,
            qvHold: true, qvHunger: true, qvTips: true, qvGolden: true, qvMods: true, qvCues: true,   // giữ nhà · cơn đói · hướng dẫn · giờ vàng · biến thể ván · nhắc lời dẫn
            qvWinTarget: 20, qvLikeGoal: 20, qvQuality: 'high',   // chất lượng hình cửa sổ game: high | low (máy yếu)   // mục tiêu WIN mỗi chặng · thanh tim cả phòng (× ngưỡng tim) → mưa đá
            qvZombieModel: 'basic',   // basic | chubby | arm | ribcage | classic — mô hình Quaternius CC0 trong public/games/quaivat/models/zombie
            qvSkin: '', qvSkinRandom: false,   // trang phục zombie (public/games/quaivat/skins.js) · đổi ngẫu nhiên mỗi ván
            qvTimerOn: false,         // đồng hồ mỗi ván: mặc định tắt (chơi tới khi phá được cửa)
            qvCheckpoint: true,       // cột mốc giữa đường
            qvShowLegend: true,
            qvLikePer: 100,           // thả tim: đủ bấy nhiêu tim cả phòng → 1 hiệu ứng
            qvLikeAct: 'pebble',      // hiệu ứng mỗi mốc tim: id hành động | 'random'
            qvShareAct: 'bomb',       // hiệu ứng khi chia sẻ: id hành động | 'random'
            qvCommentKey: '111',      // bình luận có từ khóa này mới ném dép ('' = mọi bình luận)
            qvWinShape: '9:16',       // khung cửa sổ game (OBS bắt cửa sổ): 9:16 | 1:1 | 16:9       // hiện bảng quà ngay trong game (tắt nếu dùng bảng quà OBS riêng)
            qvGiftMap: {}   // { [action]: [{ giftId, giftName, giftImage }] } — trống = khớp theo tên quà mặc định
        }
    },
    nhatu: {
        id: 'nhatu',
        name: 'Nhà Tù Online',
        description: 'Trại giam 3D chibi: người xem bình luận là vào trại, tặng quà được camera bám theo và bình luận số/chữ để ném bóng, lau sàn, ăn cơm… Chế độ Tự chơi treo máy cả buổi.',
        icon: '⛓️',
        overlayPath: '/overlay/nhatu',
        // Khoá riêng tiền tố nt* (giống qv* của Zombie Phá Nhà). Đọc trong public/games/nhatu/js/game.js → applyServerConfig.
        defaultConfig: {
            enabled: true,
            ntMode: 'auto',           // auto (tự chơi: quà → lượt lên sóng) | streamer (streamer tự đi lại bằng phím) | off (chỉ xem trại, không lượt)
            ntQuality: 'high',        // high | low (máy yếu: overlay tự tải lại với ?q=low — bớt khử răng cưa, bóng, điểm ảnh)
            ntStreamerName: '',
            ntTurnBase: 6,            // giây một lượt cho quà 1 xu (lượt ngắn: camera bám vài giây rồi chuyển người kế)
            ntTurnPerCoin: 0.5,       // + giây cho mỗi xu thêm
            ntTurnMax: 30,            // trần giây một lượt
            ntMinTurn: 4,             // có người chờ thì người đang chơi giữ tối thiểu bấy nhiêu giây rồi nhường
            ntPreempt: true,          // quà mới của người khác → nhường lượt sau ntMinTurn (tắt = chơi hết giờ mới tới người kế)
            ntQueueMax: 20,
            ntIdleAuto: 6,            // người đang có lượt im lặng bấy nhiêu giây → nhân vật tự làm nhiệm vụ (0 = tắt)
            ntAnyoneAct: false,       // mọi người xem đều ra lệnh được (mỗi người 8 giây/lần), không chỉ người đang có lượt
            ntJoinOnComment: true,    // bình luận / thả tim là vào trại
            ntMaxViewers: 40,
            ntNpcCount: 28,           // dân số NPC lúc trại vắng (người xem vào thì NPC bớt dần)
            ntMinuteMs: 1000,         // 1 phút trong trại = bấy nhiêu ms ngoài đời
            ntLikePerDay: 300,        // đủ bấy nhiêu tim cả phòng → cả trại gạch thêm 1 ngày
            ntShowMenu: true,
            ntSound: true, ntMusic: false,
            ntBossSec: 180,           // 👑 Đại Ca giữ ghế bấy nhiêu giây (tặng thêm = cộng giờ, người khác tặng = cướp ngôi)
            ntGuardSec: 180,          // 👮 Cán Bộ trực bấy nhiêu giây
            ntJobSec: 180,            // 🧑‍🍳 Đầu Bếp / 🧹 Tổ Trưởng / 🩺 Y Tá làm bấy nhiêu giây
            ntBossFollowers: 6,       // số đàn em bu quanh đại ca (massa vai, lau chân, quạt, che ô…)
            ntJailIdleSec: 180,       // luật ngầm: người xem im lặng bấy nhiêu giây → nhốt biệt giam trên lầu (0 = tắt)
            ntJoinOnLike: true,       // thả tim là vào trại (và được thả khỏi biệt giam)
            ntBossCoins: 0,           // quà chưa gán ≥ bấy nhiêu xu → lên Đại Ca (0 = chỉ quà đã gán)
            ntGuardCoins: 0,          // quà chưa gán ≥ bấy nhiêu xu → làm Cán Bộ (0 = chỉ quà đã gán)
            ntShowGiftLegend: true,   // hiện bảng "🎁 Tặng quà để…" trên overlay
            ntCommentPlay: false,     // bình luận 1/B… ra lệnh cho người đang lên sóng (tắt = chỉ chơi bằng quà, bảng dưới gọn)
            ntOffenseJailSec: 180,    // 💩 💦 đi bậy bị cán bộ bắt / bị tố cáo → giam bấy nhiêu giây (ra tù phải tự dọn)
            ntTrashSec: 60,           // 🗑️ bị ném vào thùng rác → kẹt bấy nhiêu giây
            ntPrankSec: 120,          // 💇 👗 trò đùa cạo đầu / váy hồng giữ bấy nhiêu giây
            ntLikeEvent: 1000,        // ❤️ cả phòng đủ bấy nhiêu tim → 1 sự kiện vui (0 = tắt)
            ntAutoEvents: true,       // trại vắng quà > 3 phút → thỉnh thoảng tự mưa / chuột chạy qua
            ntPkTug: true,            // 🪢 PK (tín hiệu thật pk:state) → kéo co giữa sân, đội thua bị ném vào thùng rác
            ntTargetSec: 15,          // 🎯 quà chơi khăm (thùng rác, trò đùa, vật tay…): bấy nhiêu giây để bình luận MÃ SỐ tù nhân người muốn nhắm; hết giờ → bốc ngẫu nhiên (0 = ngẫu nhiên ngay)
            ntRevengeSec: 60,         // ⚔️ bị chơi khăm → trong bấy nhiêu giây tặng quà chơi khăm + gõ mã số kẻ đó = trả thù, +5 điểm (0 = tắt)
            ntRooms: 6,               // 🏠 phòng = đội: bình luận P1…P6 chọn phòng, cả phòng thi đua theo vòng (0 = tắt)
            ntRoomRoundMin: 5,        // mỗi vòng thi đua phòng bấy nhiêu phút — phòng nhất được ăn tiệc + mỗi người +10 điểm
            ntGiftMap: nhatuSuggestedGiftMap()   // { [action]: [{ giftId, giftName, giftImage, coins }] } — mặc định = bộ quà gợi ý trong data.json
        }
    },
    creatoronline: {
        id: 'creatoronline',
        name: 'Creator Online',
        description: 'Tòa nhà LIVE chibi 3D 25 phòng: người xem là fan của 5 nhóm nhảy, quà bất kỳ được lên sân khấu, vé có phòng mang tên, vai MC/Kỹ thuật/Quản lý, PK giữa các nhóm.',
        icon: '🏢',
        overlayPath: '/overlay/creatoronline',
        // Khoá riêng tiền tố co*. Spec docs/superpowers/specs/2026-11-03-creatoronline-design.md §17.3;
        // thông số phụ (không hiện trong panel) ở public/games/creatoronline/data.json → live.
        defaultConfig: {
            enabled: true,
            coQuality: 'high',        // high | low (overlay tự tải lại ?q=low)
            coMaxViewers: 40,         // 5–120 (chất lượng thấp tối đa 80); người tặng quà được vượt tạm +20
            coNpcCount: 20,           // đám đông NPC vô danh khi tòa nhà vắng
            coViewerIdleMin: 30,      // im lặng bấy nhiêu phút thì rời tòa nhà
            coClubSwitchSec: 60,      // đổi club (bình luận 1–5) tối đa 1 lần mỗi bấy nhiêu giây
            coStageBaseSec: 12, coStagePerCoinSec: 3, coStageMaxSec: 120,   // giây trên sân khấu = 12 + 3·(xu−1), trần 120
            coStageSlots: 12,         // chỗ khách mỗi sân (6 idol + 6 hàng trước)
            coRoomHoldSec: 60, coRoomQueueMax: 6,                         // 🎟️ phòng mang tên
            coRoleSec: 180, coRoleLockSec: 45, coRoleMaxSec: 300,          // 🎙️🎛️📋 vai trong nhóm
            coPkEveryMin: 5,          // PK tự động mỗi bấy nhiêu phút (2–15, 0 = tắt)
            coPkSec: 90, coPkFinalSec: 30,                                 // trận PK / nước rút (tim bên thua ×2)
            coMvpMin: 10,             // MVP PK: tên trên LED bấy nhiêu phút
            coCamMaxPer5Min: 90,      // giây cảnh quay tối đa mỗi người tặng trong 5 phút
            coTierFallback: true,     // quà chưa gán chạy hành động theo bậc xu
            coLikeMilestone: 300,     // mỗi bấy nhiêu tim cả tòa nhà → sóng tim
            coSound: true, coMusic: true, coMusicVol: 0.35,
            coLiveTv: true,           // TV trực tiếp trong sân khấu nhóm (vẽ cảnh lần 2)
            coShowGiftLegend: true, coShowJoinHint: true,
            coBadWords: '',           // từ cấm thêm, cách nhau bằng dấu phẩy
            coWinSize: '608x1080',    // cửa sổ game cho TikTok Studio bắt: '540x960' | '608x1080' | '720x1280' | '1080x1920'
            coSocial: true,           // 🤝 bật người xem chơi với nhau (ném / ghép đôi / ôm / thách đấu / cổ vũ)
            coFanSpotSec: 25,         // mỗi bấy nhiêu giây quay cận 5 giây "fan nổi bật" theo điểm tương tác miễn phí; 0 = tắt
            coPairSec: 60,            // 💞 ghép đôi kéo dài bấy nhiêu giây
            coDuelSec: 60,            // 🥊 trận thách đấu kéo dài bấy nhiêu giây
            coEmoteSec: 10,           // chờ giữa 2 lần biểu cảm miễn phí (bình luận)
            coLookSec: 60,            // chờ giữa 2 lần đổi áo/tóc (bình luận)
            coChorusMin: 3,           // 📣 số người tối thiểu cổ vũ đồng thanh
            coGiftMap: creatorOnlineSuggestedGiftMap()   // { [action]: [{ giftId, giftName, giftImage, coins }] }
        }
    },
    duongveque: {
        id: 'duongveque',
        name: 'Đường Về Quê',
        description: 'Xe buýt / xe bò chở cả đoàn người xem từ Mũi Cà Mau về Hà Giang qua 34 tỉnh (2D cuộn ngang, 100 km/h, trạm dừng chân, trạm xăng, CSGT): phe Cứu lên xe, đẩy xe tới, đổ xăng, che chắn; phe Phá thả vỏ chuối, chó rượt, xe container đẩy lùi, lốc xoáy. Quà tài xế = lên lái 3 phút. Streamer nhảy né và húc phản đòn.',
        icon: '🛵',
        overlayPath: '/overlay/duongveque',
        // Khoá riêng tiền tố dvq*. Luật ở public/games/duongveque/logic.js, overlay đọc trong game.js → applyServerConfig.
        defaultConfig: {
            enabled: true,
            dvqControl: 'auto',       // auto (Tự lái: AI nhảy/húc thay, treo máy được) | streamer (streamer tự bấm phím)
            dvqStreamerName: '',
            dvqGoal: 0,               // mét tới cổng làng; 0 = tự theo thời gian ván (25 m/giây: 4 phút = 6 km, 10 phút = 15 km)
            dvqRoundSec: 240,         // giây một ván
            dvqFinalSec: 30,          // nước rút: bấy nhiêu giây cuối mọi quà ×2
            dvqSpeed: 100,            // km/h khi còn xăng
            dvqFuelBurn: 3,           // % xăng/giây (đầy bình ≈ 33 giây chạy)
            dvqMeterPerCoin: 5,       // 1 xu = bấy nhiêu mét đẩy tới (Cứu) hoặc lùi (Phá) — đo mô phỏng: 2 phe ngang xu ≈ 50/50
            dvqLikePer: 300,          // đủ bấy nhiêu tim cả phòng → 1 cơn gió + chút xăng
            dvqRamCd: 12,             // giây hồi chiêu HÚC
            dvqDodgeMax: 10,          // vật cản giá ≤ bấy nhiêu xu thì nhảy né được
            dvqDefaultSide: 'cuu',    // quà chưa gán của người chưa chọn phe (bình luận 1/2) tính cho phe này
            dvqAutoNext: true,        // hết ván tự sang ván mới
            dvqVehicle: 'bus',        // 🚌 bus (xe buýt chở cả đoàn) | oxcart (🐂 xe bò có máng) | scooter (🛵 xe máy 1 người)
            dvqDriverSec: 180,        // 🧑‍✈️ quà tài xế: lái bấy nhiêu giây, hết giờ đổi người chờ; không ai chờ → giữ nguyên người đang lái
            dvqSeats: 14,             // số ghế mỗi xe (người phe Cứu); đầy thì nối thêm xe
            dvqMaxCars: 5,            // đoàn xe tối đa bấy nhiêu chiếc (càng dài cả cảnh càng thu nhỏ; dư nữa hiện +N)
            dvqRestStop: true,        // 🍜 trạm dừng chân 30 giây (đồng hồ ván dừng)
            dvqGasStop: true,         // ⛽ trạm xăng 15 giây: đổ đầy bình + đi vệ sinh
            dvqPolice: true,          // 🚓 thỉnh thoảng CSGT kiểm tra: thả đủ tim mới được đi (đồng hồ vẫn chạy)
            dvqPoliceLikes: 2000,     // số tim cần thả khi bị CSGT giữ (quà Cứu: 1 xu = 10 tim)
            dvqRoadEvents: true,      // tình huống đường xá: kẹt xe, chắn tàu, đàn bò, thủng lốp, say xe, check-in, lì xì
            dvqBike: 'green',         // màu xe: red | blue | pink | yellow | green | black
            dvqSound: true,
            dvqShowLegend: true,      // hiện 2 cột "🛡️ CỨU / ⚔️ PHÁ" quà trên overlay
            dvqPenalties: '',         // hình phạt vui khi phe Phá thắng, mỗi dòng 1 cái ('' = bộ mặc định)
            dvqKeyJump: 'F7',         // phím tắt toàn cục (Electron) — chơi được khi đang mở TikTok Studio
            dvqKeyRam: 'F8',
            dvqKeyStart: 'F9',
            dvqGiftMap: duongVeQueSuggestedGiftMap()   // { [action]: [{ giftId, giftName, giftImage, coins }] }
        }
    },
    nhietdo: {
        id: 'nhietdo',
        name: 'Biểu Cảm Nhiệt',
        description: 'Thanh nhiệt 0-100°C tăng theo quà, tự giảm khi không có quà — càng nóng càng nhiều lửa trên overlay.',
        icon: '🌡',
        overlayPath: '/overlay/nhietdo',
        defaultConfig: makeDefaultNhietDoConfig()
    },
    bancung: {
        id: 'bancung',
        name: 'Bắn Cung',
        description: 'Khán giả tặng quà = bắn cung vào idol. Trừ máu hình trái tim, có giáp / hồi máu / hồi sinh — 8 skin cung tên.',
        icon: '🏹',
        overlayPath: '/overlay/bancung',
        defaultConfig: makeDefaultBanCungConfig()
    },
    trongcay: {
        id: 'trongcay',
        name: 'Trồng Cây',
        description: 'Quà làm cây cao lên, tưới nước hồi cây, nắng quá làm héo, quà cắt cây. Hoa là icon quà, bướm là avatar người tặng.',
        icon: '🌱',
        overlayPath: '/overlay/trongcay',
        defaultConfig: makeDefaultTrongCayConfig()
    },
    nhatla: {
        id: 'nhatla',
        name: 'Nhặt Lá',
        description: 'Quà tặng → lá khô rơi ngẫu nhiên chồng chất đầy màn hình. NPC kéo lá bỏ thùng rác để dọn.',
        icon: '🍂',
        overlayPath: '/overlay/nhatla',
        defaultConfig: makeDefaultNhatLaConfig()
    },
    'level-quest': {
        id: 'level-quest',
        name: 'LEVEL QUEST',
        description: 'Quest bar Liên Quân-style — KPI 💎/❤/🔄 chia 18 level cho từng NPC creator.',
        icon: '🎯',
        overlayPath: '/_prototype/level-quest.html?mode=overlay',
        defaultConfig: { enabled: true }
    },
    'timer': {
        id: 'timer',
        name: 'THỜI GIAN',
        description: 'Đếm lùi / đếm tới với 9 giao diện (LED, vòng tròn, thanh, đa giác, neon, flip). Quà tặng ± thời gian theo 3 chế độ: cố định / theo xu / chọn phe.',
        icon: '⏱',
        overlayPath: '/_prototype/timer.html?mode=overlay',
        defaultConfig: { enabled: true }
    },
    // BẢNG QUÀ TỔNG (prototype): một overlay gom quà chỉ định + tên hiệu ứng của MỌI game đang
    // BẬT. Không có logic quà riêng — chỉ ĐỌC appConfig.games qua /api/games ở phía client.
    // Đăng ký ở đây để hưởng sẵn: toggle ⏻ Thư viện, /api/games/giftboard/config (lưu vị trí/cỡ),
    // gameConfig broadcast, link chia sẻ /overlay/shared/<token>.
    'giftboard': {
        id: 'giftboard',
        name: 'Bảng Quà Tổng',
        description: 'Một bảng cho OBS gom toàn bộ quà chỉ định + tên hành động/hiệu ứng của mọi game đang BẬT. Game tắt tự biến mất. Kéo/thu phóng trong app, OBS đổi theo ngay.',
        icon: '📋',
        overlayPath: '/_prototype/giftboard.html?mode=overlay',
        defaultConfig: makeDefaultGiftBoardConfig()
    },
    // 🏆 THẺ GIẢI ĐẤU: bậc D5→S + mảnh + hạng BXH + thiếu bao nhiêu điểm để giữ hạng (gói rankUpdate của TikTok).
    // Logic thuần lib/league-card.js; overlay public/games/leaguecard/. Config phẳng (route /config merge nông).
    // Spec: docs/superpowers/specs/2026-10-30-leaguecard-design.md
    'leaguecard': {
        id: 'leaguecard',
        name: 'Thứ Hạng LIVE',
        description: 'Góc màn OBS: bậc giải đấu, mảnh, hạng BXH, thiếu bao nhiêu điểm để giữ hạng (quy ra quà), vinh danh người giữ hạng. 3 kiểu × 20 skin.',
        icon: '🏆',
        overlayPath: '/overlay/leaguecard',
        defaultConfig: makeDefaultLeagueCardConfig()
    },
    // TOUCH & PLAY (prototype): game webcam — overlay nhận hình nguồn camera trong scene OBS
    // (lib/touchplay-obs-feed.js) + MediaPipe (public/lib/mediapipe), chạm bóng / gắp đồ ăn đưa lên
    // miệng / làm theo tư thế. Logic ở client; server cho mượn route chung /config, /cmd, /test-gift.
    'touchplay': {
        id: 'touchplay',
        name: 'Touch & Play',
        description: 'Game webcam: chạm bóng, gắp đồ ăn đưa lên miệng, làm theo tư thế. Quà tặng thả bóng / đồ ăn / tư thế / sức mạnh.',
        icon: '🖐',
        overlayPath: '/_prototype/touchplay.html?mode=overlay',
        defaultConfig: { enabled: true }
    },
    // CHÉM TRÁI CÂY — ngón trỏ nhận diện qua hình lấy từ Scene/Source OBS (hoặc webcam) chém quả bay
    // trên overlay trong suốt. Engine ở public/games/chemtraicay/game.js, tracker ở tracker.html.
    chemtraicay: {
        id: 'chemtraicay',
        name: 'Chém Trái Cây',
        description: 'Ngón trỏ qua webcam chém trái cây bay trên overlay. Quà tặng sinh quả, bom, Thần Chém, Tăng/Giảm Tốc, Giải Cứu.',
        icon: '🍉',
        overlayPath: '/overlay/chemtraicay',
        defaultConfig: makeDefaultChemTraiCayConfig()
    },
    // ĐẬP MUỖI — game camera: vỗ 2 tay (HpTracker trong overlay, feed OBS chung) đập muỗi bay ngang.
    // Engine + luật quà ở public/games/dapmuoi/game.js (UMD, server require được). Game con của Game Camera.
    dapmuoi: {
        id: 'dapmuoi',
        name: 'Đập Muỗi',
        description: 'Vỗ 2 tay trước camera đập muỗi bay ngang khắp màn. Quà thả muỗi, bình xịt, vợt điện, mắc màn.',
        icon: '🦟',
        overlayPath: '/overlay/dapmuoi',
        defaultConfig: makeDefaultDapMuoiConfig()
    },
    // 🏸 ĐÁ CẦU — game camera khe 'kick': quà tung cầu, đỡ bằng đầu/đùi (pose). Game con của Game Camera.
    dacau: {
        id: 'dacau',
        name: 'Đá Cầu',
        description: 'Quà tung cầu lên, streamer đỡ bằng đầu hoặc đùi trước camera; rơi sàn là mất chuỗi.',
        icon: '🏸',
        overlayPath: '/overlay/dacau',
        defaultConfig: DaCau.defaultConfig()
    },
    // 🧍 BỘ TÁCH NGƯỜI — khe 'body' (lớp dưới cùng overlay mẹ): tách nền người rồi vẽ lại cho Hậu Cảnh, Rơi Hố, Bị Đuổi,
    // Video Hành Động, Khóc Lóc, Bắn Tim, Bắt NPC, Biến Hình. Logic ở lib/body-server.js + public/games/body/.
    body: {
        id: 'body',
        name: 'Bộ Tách Người',
        description: 'Tách nền người trên camera rồi vẽ lại theo quà: hậu cảnh sau lưng, rơi hố, bị đuổi, video hành động, khóc lóc, bắn tim, bắt NPC, biến hình.',
        icon: '🧍',
        overlayPath: '/overlay/body',
        defaultConfig: BodyServer.defaultConfig()
    },
    // 🎥 GAME CAMERA — menu mẹ của các game camera (CAM_GAME_IDS). Một link OBS /overlay/camgames nạp
    // các game đang chọn (`actives`: tối đa 1 game tay + 1 game trên đầu, lib/camgames.js); chỉ các game
    // đó bật (camGamesApplyActive) để quà không kích hoạt game đang ẩn. `active` = actives[0] cho bản cũ.
    // Mọi cài đặt ở app; overlay chỉ hiển thị + chơi.
    camgames: {
        id: 'camgames',
        name: 'Game Camera',
        description: 'Gom các game chơi bằng camera (Touch & Play, Chém Trái Cây, Đập Muỗi, Bắn Cung, Level Quest) vào một link OBS. Chọn game trong app, OBS đổi theo.',
        icon: '🎥',
        overlayPath: '/overlay/camgames',
        defaultConfig: { ...CamRules.DEFAULT_CONFIG }   // KHÔNG có actives — config cũ chỉ có `active` phải giữ nguyên game
    }
,
    pokemon: {
        id: 'pokemon',
        name: 'Săn Pokemon',
        description: 'Người xem táp tim / gõ 111 vào ghế, tặng quà nhận bóng, gõ 1-9 chọn Pokemon để ném. Bảng xếp hạng tuần, nhiệm vụ ngày, MC AI. Bảng quà có link OBS riêng.',
        icon: '🔴',
        overlayPath: '/overlay/pokemon',
        // Cấu hình quà & thưởng mặc định (public/games/pokemon/default-config.json, do bản build của game sinh ra)
        defaultConfig: { enabled: true, ...(() => { try { return require('./public/games/pokemon/default-config.json'); } catch (_) { return {}; } })() }
    }
};

// Game con của Game Camera — thứ tự = thứ tự thẻ trong menu (public/games/camgames/registry.js).
// Level Quest không vào CAM_STANDALONE_IDS dù còn link riêng: nó không đọc `enabled` (KPI đếm cả khi đang
// chọn game khác, link riêng luôn hiện) → bật/tắt cờ đó vô hại, thẻ không cần nút ⏻ Tắt.
const CAM_GAME_IDS = ['touchplay', 'chemtraicay', 'dapmuoi', 'bancung', 'level-quest', 'dacau', 'body'];
// Game con có link OBS riêng từ trước khi vào Game Camera (khách cũ dán /overlay/bancung trong scene).
// Game Camera chỉ bật nó khi streamer CHỌN VÀO và tắt khi chọn sang game khác / tắt Game Camera — không
// ép tắt lúc khởi động, kẻo khách đang chơi Bắn Cung cập nhật app xong thấy game tự tắt. Thẻ trong Game
// Camera báo "đang bật ở link riêng" + nút tắt (thanh bên không còn nút nguồn của nó).
const CAM_STANDALONE_IDS = new Set(['bancung']);
// Game con KHÔNG đọc `enabled` (Level Quest: KPI đếm cả khi không được chọn, link riêng luôn hiện): hub không ghi
// cờ đó — ghi thì Khởi động nhanh hiện "Đang TẮT" mà Thư viện lại không còn game để bật.
const CAM_IGNORES_ENABLED = new Set(['level-quest']);
// Các game đang chơi trong Game Camera ([] khi tắt hub).
function camActives() {
    const cam = appConfig.games?.camgames || {};
    return cam.enabled === false ? [] : CamRules.activesOf(cam, CAM_GAME_IDS);
}
function camGameInHub(id) { return camActives().includes(id); }
// Game THẬT SỰ đang nhận quà: đang có 🎮 phiên game theo quà thì chỉ game của phiên (độc quyền).
let camSession = null;
function camPlayActives() { return camSession ? [camSession.gameId] : camActives(); }
// Phím tắt toàn cục của game camera: chơi 2 game cùng có phím thì chỉ game streamer bấm vào gần nhất trong
// Game Camera (`hotkeyGame`) giữ phím, game kia tạm nhả (đưa cấu hình enabled:false cho electron-main → gỡ phím).
// Mọi chỗ áp phím tắt Bắn Cung / Đập Muỗi đi qua đây để luật không bị chỗ khác đăng ký đè.
function camApplyHotkeys(id) {
    const fn = id === 'bancung' ? global.__bancungApplyHotkeys : id === 'dapmuoi' ? global.__dapmuoiApplyHotkeys : null;
    const c = appConfig.games?.[id];
    if (!fn || !c) return;
    try { fn(CamRules.hotkeysAllowed(id, appConfig.games.camgames, CAM_GAME_IDS) ? c : { ...c, enabled: false }); } catch (e) {}
}
// Áp lại phím cả hai game theo đúng thứ tự: game phải NHẢ phím trước, game giữ phím đăng ký sau — ngược lại thì
// globalShortcut.register của game giữ phím hỏng ở tổ hợp trùng (game kia chưa nhả) và phím đó không thuộc ai.
function camApplyAllHotkeys() {
    const ids = ['bancung', 'dapmuoi'];
    const allowed = id => CamRules.hotkeysAllowed(id, appConfig.games.camgames, CAM_GAME_IDS);
    for (const id of [...ids.filter(id => !allowed(id)), ...ids.filter(allowed)]) camApplyHotkeys(id);
}
// Chơi ≥2 game cùng lúc: "quà riêng trước, quà chung sau" — game nào gán ĐÍCH DANH quà này (lib/camgames.js).
// [] khi chỉ chơi 1 game (không lọc gì, như trước).
function camGiftClaims(g) {
    const act = camPlayActives();
    return act.length >= 2 ? CamRules.giftClaims(g, appConfig.games, act) : [];
}
// Nhánh bắt-mọi-quà của `id` (Đập Muỗi xu/con, Bắn Cung bắn tự do + nạp cung) nhường quà mà game đang
// chơi cùng đã gán đích danh. Touch & Play lọc ở client theo `camClaims` trong sự kiện 'gift'.
function camGiftYields(id, g) {
    const act = camPlayActives();
    if (act.length < 2 || !act.includes(id)) return false;
    return CamRules.claimedElsewhere(id, CamRules.giftClaims(g, appConfig.games, act), act.length);
}
// Chỉ các game đang chọn được bật; tắt Game Camera là tắt hết. Gọi sau mỗi lần lưu config camgames
// (prevCam = config trước khi lưu) và lúc khởi động để giữ đúng luật dù config cũ bật cả hai.
function camGamesApplyActive(prevCam) {
    const cam = appConfig.games.camgames = { ...GAMES.camgames.defaultConfig, ...(appConfig.games.camgames || {}) };
    const sel = CamRules.applyPatch(cam, {}, CAM_GAME_IDS);
    cam.actives = sel.actives; cam.active = sel.active;
    cam.trigger = CamSession.normalizeTrigger(cam.trigger);
    if (camSession) return false;        // đang phiên game: cờ bật do phiên giữ, hết phiên mới áp lại
    const hubOn = cam.enabled !== false;
    const prevSel = prevCam && prevCam.enabled !== false ? CamRules.activesOf(prevCam, CAM_GAME_IDS) : [];
    let changed = false;
    for (const id of CAM_GAME_IDS) {
        if (!GAMES[id] || CAM_IGNORES_ENABLED.has(id)) continue;
        const want = hubOn && cam.actives.includes(id);
        if (CAM_STANDALONE_IDS.has(id)) {
            const had = prevSel.includes(id);
            if (!prevCam || had === want) continue;
        }
        const c = appConfig.games[id] = appConfig.games[id] || { ...GAMES[id].defaultConfig };
        const was = c.enabled !== false;
        if (was === want) continue;
        c.enabled = want; changed = true;
        io.emit('gameConfig', { gameId: id, config: c });
        io.emit(want ? 'gameEnabled' : 'gameDisabled', { gameId: id, ts: Date.now() });
        // Đập Muỗi: phím tắt toàn cục đi theo enabled — tắt game thì gỡ phím, bật lại thì đăng ký lại.
        if (id === 'dapmuoi') camApplyHotkeys('dapmuoi');
        // Bắn Cung: như khi tắt ở thanh bên — đầy máu lại (khỏi "chết treo" lúc bật lại) + phím tắt theo enabled.
        if (id === 'bancung') {
            if (!want) { try { banCungReset(); } catch (e) {} }
            camApplyHotkeys('bancung');
        }
    }
    return changed;
}

// ================= 🎮 PHIÊN GAME THEO QUÀ (port từ HP LIVE NPC) =================
// Người xem tặng QUÀ KÍCH HOẠT (camgames.trigger.rules) → game gắn với quà chơi ĐỘC QUYỀN N giây trong overlay mẹ:
// chỉ game đó bật + nhận quà (camPlayActives), game camera khác tạm tắt; hết giờ trả lại cờ bật như trước.
// Luật thuần ở lib/camgames-session.js. Phiên chỉ ở RAM: app khởi động lại = như thường.
// Overlay mẹ PHẢI đang mở trên OBS (socket query hub=camgames) — không thì quà kích hoạt chạy như quà thường.
let camSessionTimer = null, camSessionSeq = 0, camSessionSnap = null, camExtendSeq = 0;
let camSessionQueue = [];            // phiên chờ: [{ gameId, seconds, gift }] — quà kích hoạt game khác lúc đang có phiên
const camTriggerCfg = () => CamSession.normalizeTrigger(appConfig.games?.camgames?.trigger);
function camHubOverlayOnline() {
    for (const s of io.sockets.sockets.values()) if (s.data?.camHub) return true;
    return false;
}
// 🎯 LEVEL QUEST đang chọn trong Game Camera VÀ overlay mẹ đang mở trên OBS → link riêng
// /_prototype/level-quest.html?mode=overlay (không cam=1) tự ẩn, OBS khỏi hiện 2 thanh (port HP LIVE NPC).
function levelQuestHubOwned() { return camGameInHub('level-quest') && camHubOverlayOnline(); }
// 📋 Bảng Quà Tổng: overlay game nào đang MỞ (overlay gửi `overlay:hello`, xem lib/overlay-presence.js).
// Hub 🎥 Game Camera đang mở → game camera đang chọn tính là mở. Phát `overlay:presence` khi đổi.
const overlayPresence = OverlayPresence.createPresence();
let overlayPresenceLast = {};
let overlayObsIds = [];              // game có Browser Source trong OBS (đọc qua OBS WebSocket, 15s/lần) — chỉ chú thích
function overlayPresenceSnapshot() {
    const snap = OverlayPresence.withHub(OverlayPresence.snapshot(overlayPresence, Date.now()), camHubOverlayOnline(), camActives());
    const ids = overlayObsIds.includes('camgames') ? [...new Set([...overlayObsIds, ...camActives()])] : overlayObsIds;
    return OverlayPresence.withObsSources(snap, ids);
}
function overlayPresenceBroadcast(force) {
    const snap = overlayPresenceSnapshot();
    giftboardActiveSync(snap);
    if (!force && OverlayPresence.sameSnapshot(snap, overlayPresenceLast)) return;
    overlayPresenceLast = snap;
    io.emit('overlay:presence', snap);
}
// Bảng Quà Tổng đang mở trên OBS (+ đang bật, + "Ẩn bảng quà riêng của game" bật) → mọi overlay game ẩn bảng quà
// riêng (overlay-hello.js thêm html.gb-active). Không đổi config đã lưu của game.
let giftboardActiveLast = false;
function giftboardActiveNow(snap) {
    const cfg = appConfig.games?.giftboard || {};
    return !!(snap.giftboard && snap.giftboard.open > 0) && cfg.enabled !== false && cfg.rules?.hideGameBoards !== false;
}
function giftboardActiveSync(snap) {
    const on = giftboardActiveNow(snap || overlayPresenceSnapshot());
    if (on === giftboardActiveLast) return;
    giftboardActiveLast = on;
    io.emit('giftboard:active', { on });
}
let lqHubOwnedLast = null;
setInterval(() => {
    try {
        const owned = levelQuestHubOwned();
        if (owned !== lqHubOwnedLast) { lqHubOwnedLast = owned; io.emit('levelquest:hub', { hubOwned: owned }); }
    } catch (e) {}
}, 1500);
function camGiftCatalog() {
    return Object.values(giftMap || {}).filter(g => g && g.id != null).map(g => ({ id: String(g.id), name: g.name, image: g.image, diamonds: g.diamond }));
}
const camQueuePublic = () => camSessionQueue.map(q => ({ gameId: q.gameId, seconds: q.seconds }));
function camSessionPublic() {
    const s = camSession;
    if (!s) return null;
    const g = GAMES[s.gameId] || {};
    return { active: true, seq: s.seq, gameId: s.gameId, gameName: g.name || s.gameId, icon: g.icon || '🎮',
        startedAt: s.startedAt, introUntil: s.introUntil, until: s.until, seconds: s.seconds,
        by: s.by, giftName: s.giftName, giftImage: s.giftImage, extend: s.extend || null, gifts: s.gifts || [],
        queue: camQueuePublic() };
}
function camEmitSession() {
    if (camSession) camSession.gifts = CamSession.gameGiftList(camSession.gameId, appConfig.games[camSession.gameId], camGiftCatalog());
    io.emit('camgames:session', { ...(camSessionPublic() || { active: false, queue: camQueuePublic() }), serverNow: Date.now() });
}
function camArmSessionTimer() {
    clearTimeout(camSessionTimer);
    if (!camSession) return;
    camSessionTimer = setTimeout(() => {
        if (camSession && Date.now() >= camSession.until - 20) camEndSession('timeout');
        else camArmSessionTimer();
    }, Math.max(50, camSession.until - Date.now()));
}
// Bật đúng game của phiên, tạm tắt mọi game camera khác (kể cả Bắn Cung đang bật ở link riêng).
function camApplySessionEnable() {
    for (const id of CAM_GAME_IDS) {
        if (!GAMES[id] || CAM_IGNORES_ENABLED.has(id)) continue;
        const c = appConfig.games[id] = appConfig.games[id] || { ...GAMES[id].defaultConfig };
        const want = !!camSession && id === camSession.gameId;
        if ((c.enabled !== false) === want) continue;
        c.enabled = want;
        io.emit('gameConfig', { gameId: id, config: c });
        io.emit(want ? 'gameEnabled' : 'gameDisabled', { gameId: id, ts: Date.now() });
        if (id === 'dapmuoi' || id === 'bancung') camApplyHotkeys(id);
    }
}
function camStartSession(gameId, seconds, gift, now = Date.now()) {
    const t = camTriggerCfg();
    const games = appConfig.games;
    camSessionSnap = {
        cam: JSON.parse(JSON.stringify(games.camgames || {})),
        enabled: Object.fromEntries(CAM_GAME_IDS.filter(id => GAMES[id]).map(id => [id, (games[id] || {}).enabled !== false])),
        bancungActive: (games.bancung || {}).sessionActive === true
    };
    const introMs = t.introSec * 1000;
    camSession = {
        seq: ++camSessionSeq, gameId, startedAt: now, introUntil: now + introMs,
        until: now + introMs + seconds * 1000, seconds,
        by: { nickname: String(gift?.nickname || gift?.uniqueId || ''), uniqueId: String(gift?.uniqueId || ''), avatar: String(gift?.profilePicture || '') },
        giftName: String(gift?.giftName || ''), giftImage: String(gift?.giftPicture || gift?.giftImage || ''), extend: null
    };
    camApplySessionEnable();
    // Bắn Cung chỉ nhận quà khi phiên ▶ BẮT ĐẦU — phiên game tự bắt đầu, hết phiên trả lại như trước.
    if (gameId === 'bancung' && !camSessionSnap.bancungActive) {
        const bc = games.bancung = games.bancung || makeDefaultBanCungConfig();
        bc.sessionActive = true;
        banCungState.sessionStartedAt = now;
        io.emit('gameConfig', { gameId: 'bancung', config: bc });
        broadcastBanCungState({ immediate: true });
    }
    camArmSessionTimer();
    console.log(`[camgames] 🎮 phiên ${gameId} ${seconds}s — ${camSession.by.nickname} tặng ${camSession.giftName}`);
    camEmitSession();
}
function camEndSession(reason = 'timeout', { next = true } = {}) {
    if (!camSession) return false;
    const ended = camSessionPublic();
    const snap = camSessionSnap;
    camSession = null; camSessionSnap = null;
    clearTimeout(camSessionTimer); camSessionTimer = null;
    const games = appConfig.games;
    if (snap) {
        if (ended.gameId === 'bancung' && !snap.bancungActive && games.bancung) {
            games.bancung.sessionActive = false;
            io.emit('gameConfig', { gameId: 'bancung', config: games.bancung });
            broadcastBanCungState({ immediate: true });
        }
        // Trả cờ bật như trước phiên, rồi áp lại luật thường (streamer có thể đã đổi game đang chơi trong lúc phiên chạy).
        for (const [id, was] of Object.entries(snap.enabled)) {
            const c = games[id];
            const on = was && featureOn(id);          // KEY khoá game giữa phiên → không bật lại
            if (!c || (c.enabled !== false) === on) continue;
            c.enabled = on;
            io.emit('gameConfig', { gameId: id, config: c });
            io.emit(on ? 'gameEnabled' : 'gameDisabled', { gameId: id, ts: Date.now() });
            if (id === 'dapmuoi' || id === 'bancung') camApplyHotkeys(id);
        }
        camGamesApplyActive(snap.cam);
    }
    console.log(`[camgames] 🎮 hết phiên ${ended.gameId} (${reason})`);
    // Hàng chờ: mở phiên kế tiếp ngay (overlay mẹ còn mở) — dừng tay thì không nối tiếp.
    if (next && camSessionQueue.length && camHubOverlayOnline()) {
        const q = camSessionQueue.shift();
        camStartSession(q.gameId, q.seconds, q.gift);
        return true;
    }
    if (!next || camSessionQueue.length) camSessionQueue = [];   // dừng tay / overlay mẹ không còn mở → bỏ hàng chờ
    camEmitSession();
    return true;
}
// Gọi từ emitGift cho MỌI quà (combo đã gộp: repeatCount = tổng). Trả null (không dính phiên) hoặc
// { action: 'start' | 'extend' | 'queue' | 'cut' | 'skip', gameId }. Quà vẫn đi tiếp tới các game như thường —
// game không thuộc phiên đã bị tắt nên tự bỏ qua.
function camSessionGift(gift, { force = false } = {}) {
    const now = Date.now();
    const rule = CamSession.matchTrigger(camTriggerCfg(), gift);
    if (!rule || !GAMES[rule.gameId] || !featureOn(rule.gameId)) return null;   // 🔑 game KEY chưa mở → quà chạy như thường
    const sec = CamSession.comboSeconds(rule, gift);
    if (camSession) {
        if (rule.gameId === camSession.gameId) {
            const before = camSession.until;
            camSession.until = CamSession.extendUntil(camSession.until, sec * 1000, now);
            const added = Math.round((camSession.until - before) / 1000);
            camSession.extend = { seq: ++camExtendSeq, sec: added, nickname: String(gift.nickname || gift.uniqueId || ''), at: now };
            camArmSessionTimer();
            camEmitSession();
            return { action: 'extend', gameId: rule.gameId, added };
        }
        if (rule.queueMode === 'cut') {
            const queue = camSessionQueue;
            camEndSession('cut', { next: false });
            camSessionQueue = queue;           // cắt ngang chỉ thay phiên đang chạy, hàng chờ giữ nguyên
            camStartSession(rule.gameId, sec, gift, now);
            return { action: 'cut', gameId: rule.gameId };
        }
        camSessionQueue = CamSession.enqueue(camSessionQueue, { gameId: rule.gameId, seconds: sec, gift: { nickname: gift.nickname, uniqueId: gift.uniqueId,
            profilePicture: gift.profilePicture, giftName: gift.giftName, giftPicture: gift.giftPicture || gift.image } }, rule.queueMode);
        camEmitSession();
        return { action: 'queue', gameId: rule.gameId };
    }
    if (!force && !camHubOverlayOnline()) {
        console.log(`[camgames] 🎮 quà kích hoạt ${rule.gameId} nhưng overlay Game Camera chưa mở trên OBS — chạy như quà thường`);
        return { action: 'skip', gameId: rule.gameId };
    }
    camStartSession(rule.gameId, sec, gift, now);
    return { action: 'start', gameId: rule.gameId };
}

// Đồng bộ với HpGame.chemtraicay.defaultConfig() (public/games/chemtraicay/game.js)
function makeDefaultChemTraiCayConfig() {
    return {
        enabled: true,
        showNotices: true, showScore: true, showDanger: true, volume: 0.5, quality: 'auto',
        cutRadius: 15, baseSpeed: 0.65, objectScale: 1.5, peak: 72, points: 10, bombPenalty: 50, blast: 24,
        danger: 50, cuts: 2, pileStep: 5, godSeconds: 10, fastFactor: 1.7, fastSeconds: 10,
        slowFactor: 0.55, slowSeconds: 10, rescuePercent: 100, holdSeconds: 0.85,
        spawnPerSecond: 3, maxPerGift: 999, idleSpawnSeconds: 0,
        camRect: null,
        videoSource: { mode: 'obs-source', scene: '', source: '', fps: 15, width: 640 },
        mirror: true,
        giftRules: [],
        obsScene: { enabled: false, playScene: '', backScene: '' },
        display: { scale: 100, xPercent: 50, yPercent: 50, listXPercent: 50, listYPercent: 13, listScale: 70 }
    };
}
const CHEMTRAICAY_ACTIONS = ['apple', 'orange', 'lemon', 'pear', 'peach', 'strawberry', 'plum', 'watermelon',
    'pineapple', 'kiwi', 'bomb', 'god', 'fast', 'slow', 'rescue'];


// 13 events default — đồng bộ với HpGame.pktiktok.defaultConfig() trong client engine.
function makeDefaultPkTiktokConfig() {
    return {
        enabled: true,
        autoBindPkDuo: true,
        events: PKTIKTOK_EVENT_DEFS.map(d => ({
            ...d, mediaUrl: '', mediaName: '', mediaType: '',
            volume: 100, playbackRate: 1.0, interruptCurrent: true, enabled: true,
        })),
        display: { scale: 100, xPercent: 50, yPercent: 50, showLabel: false },
    };
}
// Rebuild events từ PKTIKTOK_EVENT_DEFS: metadata tĩnh (label/emoji/desc/auto/hotkey) LUÔN
// lấy từ code, dữ liệu người dùng (media/volume/enabled/rules) giữ nguyên. Đảm bảo config cũ
// đã lưu trên đĩa (thiếu auto/hotkey, hoặc còn key đã bỏ) được chuẩn hoá về đúng schema.
function normalizePkTiktokConfig(cfg) {
    cfg = cfg || {};
    const prevEvents = Array.isArray(cfg.events) ? cfg.events : [];
    cfg.events = PKTIKTOK_EVENT_DEFS.map(def => {
        const u = prevEvents.find(e => e && e.key === def.key) || {};
        return {
            key: def.key,
            label: def.label,
            emoji: def.emoji,
            desc: def.desc,
            auto: def.auto,
            hotkey: def.hotkey,
            mediaUrl: u.mediaUrl || '',
            mediaName: u.mediaName || '',
            mediaType: u.mediaType || '',
            volume: u.volume != null ? u.volume : 100,
            playbackRate: u.playbackRate || 1.0,
            interruptCurrent: u.interruptCurrent !== false,
            enabled: u.enabled !== false,
            topContributorRules: Array.isArray(u.topContributorRules) ? u.topContributorRules : [],
        };
    });
    if (cfg.enabled === undefined) cfg.enabled = true;
    if (cfg.autoBindPkDuo === undefined) cfg.autoBindPkDuo = true;
    cfg.display = { scale: 100, xPercent: 50, yPercent: 50, showLabel: false, ...(cfg.display || {}) };
    return cfg;
}

// VIP Welcome — default config: nhiều "Nhóm hồ sơ" (profiles) — mỗi nhóm có tên + bật/tắt riêng.
// Nhiều người chia chung máy có thể tạo nhóm riêng. Khi nhiều nhóm cùng "Bật" — server gộp rule từ
// tất cả nhóm enabled (mỗi nhóm độc lập cooldown qua ruleId namespacing 'p:<profileId>:...').
function makeDefaultVipWelcomeProfile(name) {
    return {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name || 'Nhóm mặc định',
        enabled: true,
        userRules: [],          // [{ id, uniqueId, userId?, trigger, mediaUrl, mediaName, mediaType, volume, message, title?, skin?, rejoinCooldownSec?, enabled }]
        // Thẻ vào phòng theo bậc "LV ≥ x HOẶC FAN ≥ y" (lib/vipwelcome/tier-match.js)
        joinTiers: vwTiers.makeDefaultTiers(),
        // Rule "Tất cả user" — 4 điều kiện lọc phụ (requireTopUser / minFansLevel / requireSubscriber /
        // requireFollowing) theo dữ liệu TikTok gửi kèm event; kiểm ở vipGlobalRulePasses. labelStyle '' = theo nhóm.
        globalJoin: {
            enabled: false,
            mediaUrl: '', mediaName: '', mediaType: '',
            volume: 100,
            message: 'Chào mừng {nickname} (cấp {level}) đã ghé phòng!',
            labelStyle: '',
            minLevel: 30,
            requireVerified: false,   // Chỉ phát cho TikTok có tích xanh
            requireTopUser: false, minFansLevel: 0, requireSubscriber: false, requireFollowing: false
        },
        globalGift: {
            enabled: false,
            mediaUrl: '', mediaName: '', mediaType: '',
            volume: 100,
            message: 'Chúc mừng {nickname} vừa lên cấp {level}!',
            labelStyle: '',
            minLevel: 30,
            requireVerified: false,
            requireTopUser: false, minFansLevel: 0, requireSubscriber: false, requireFollowing: false
        },
        // Đăng ký kênh (MEMBER action=3) — minLevel 0 để không im lặng với người cấp thấp vừa sub.
        globalSubscribe: {
            enabled: false,
            mediaUrl: '', mediaName: '', mediaType: '',
            volume: 100,
            message: 'Cảm ơn {nickname} đã đăng ký kênh! {sub}',
            labelStyle: '',
            minLevel: 0,
            requireVerified: false,
            requireTopUser: false, minFansLevel: 0, requireSubscriber: false, requireFollowing: false
        }
    };
}

function makeDefaultVipWelcomeConfig() {
    const def = makeDefaultVipWelcomeProfile('Nhóm mặc định');
    return {
        enabled: true,
        activeProfileId: def.id,           // panel đang edit profile nào
        profiles: [def],
        queue: {
            maxLen: 20,
            perUserCooldownSec: 60,
            perItemMinMs: 200,           // 200ms — overlay tự queue + play serial nên không cần pace cao
            rejoinThresholdSec: 60        // 60s — vắng mặt N giây = coi như rời phòng → re-fire khi vào lại
        },
        display: {
            scale: 100, xPercent: 50, yPercent: 50,
            showText: true,
            textPosition: 'bottom',
            labelStyle: 'goldpink',
            showAvatar: true             // hiện avatar tròn của user (lấy từ profilePicture TikTok)
        },
        joinCard: vwTiers.makeDefaultJoinCard()
    };
}

// ====== Vote Bình Luận — defaults ======
// Khán giả bình luận đúng từ khoá (vd "1", "A", "đỏ") để bình chọn; quà tặng (XU) cộng dồn theo
// dòng mà user đã vote gần nhất. Server giữ live state in-memory + broadcast realtime.
function makeDefaultVoteCommentConfig() {
    return {
        enabled: true,
        title: 'BIỂU QUYẾT',
        durationSec: 300,
        countingMode: 'both',          // 'comments' | 'gifts' | 'both'
        pointsLabel: 'ĐIỂM',           // nhãn tự đặt: ĐIỂM, TICKER, BÌNH, v.v.
        commentWeight: 1,              // trọng số: 1 comment = N điểm
        giftWeight: 1,                 // trọng số: 1 xu quà = N điểm (vd 2 để ưu tiên người tặng quà)
        joinByGift: false,             // CHỌN PHE: tặng quà chỉ định = gia nhập → mọi quà sau cộng vào phe đó
        // Mỗi row giữ thêm:
        //   giftId / giftName / giftImage : quà cụ thể được gán (optional). Khi có → quà đó chỉ
        //   cộng XU vào row này. Khi rỗng → fallback last-vote-attribution (user comment vote
        //   keyword nào → quà của họ vào row đó).
        rows: [
            { id: 'r1', keyword: '1', label: 'Lựa chọn 1', color: '', giftId: '', giftName: '', giftImage: '' },
            { id: 'r2', keyword: '2', label: 'Lựa chọn 2', color: '', giftId: '', giftName: '', giftImage: '' }
        ],
        display: {
            titleSize: 56,
            itemSize: 36,
            itemHeight: 84,
            showBar: true,
            overlayBg: 'rgba(28,28,28,0.55)',
            itemBg: 'rgba(139,0,0,0.45)',
            barColor: '#ffce4d',
            textColor: '#ffffff',
            scale: 100,
            xPercent: 50,
            yPercent: 50
        }
    };
}

// ====== Nhặt Lá — defaults ======
// Overlay tương tác trực tiếp: quà → lá rơi ngẫu nhiên chồng chất; NPC kéo lá bỏ thùng rác.
// display.* là % để sau này chốt size chỉ cần khóa giá trị mặc định (leafScale/handScale/binScale).
function makeDefaultNhatLaConfig() {
    return {
        enabled: true,
        display: {
            hatSkin: 'la-mua-thu', // bộ ảnh hạt rơi (skins/hat/<id>/) — lá, tuyết, …
            binSkin: 'mac-dinh',   // bộ ảnh thùng rác (skins/thung/<id>/)
            leafScale: 120,       // % kích thước hạt (base lấy theo skin.json:baseSize)
            handScale: 50,        // % kích thước bàn tay chuột
            binScale: 100,        // % kích thước thùng rác (base lấy theo skin.json:baseWidth)
            pileFillPercent: 90,  // % màn hình đống lá dâng tới khi đủ drop.maxLeaves (overlay tự suy ra độ chồng)
            // Bốn toạ độ dưới đây chốt theo bố cục đã chạy live thật ở v1.7.0: thùng lệch phải
            // và hơi cao hơn đáy, bảng đếm nằm nửa trên bên phải — chừa trọn góc trái cho
            // khung camera. Số lẻ là vị trí kéo tay trên overlay, không phải số bịa.
            binXPercent: 67,      // vị trí thùng rác ngang (%)
            binYPercent: 72.6,    // vị trí thùng rác dọc (%) — tính theo tâm ảnh
            hudXPercent: 66.3,    // vị trí bảng Tổng số lá/Tổng số dọn
            hudYPercent: 14.1,
            showHud: true,        // hiện bộ đếm "Đã dọn / Còn lại"
            reviewEditMode: true  // review nhúng cho kéo thùng/HUD ngay, khỏi bật thêm nút
        },
        drop: {
            minFallSec: 3.2,      // thời gian rơi tối thiểu của 1 lá
            maxFallSec: 6.5,
            spawnGapMs: 300,      // khoảng cách giữa các lá khi 1 quà rơi nhiều lá
            maxLeaves: 600        // trần số lá render (chống lag)
        },
        // TÚI NỢ: lá vượt drop.maxLeaves dồn vào kho thay vì vẽ thêm. Khối này vẽ kho đó ra
        // thành mấy bọc rác đen và quyết định lúc nào xả. Xem chú thích đầy đủ ở
        // public/games/nhatla/game.js — đây chỉ là bản sao mặc định cho config lần đầu.
        bags: {
            enabled: true,
            size: 600,            // số lá mỗi túi — khớp maxLeaves: đầy màn hình = đầy một túi
            openAtLeaves: 0,      // màn hình còn ≤ ngần này lá thì bung túi kế tiếp
            pourGapMs: 6,         // giãn cách khi xả túi (khác drop.spawnGapMs)
            showList: true,
            orientation: 'horizontal', // 'horizontal' | 'vertical'
            xPercent: 4,
            yPercent: 6,
            scale: 100,           // % cỡ ảnh túi
            maxIcons: 10          // trần SỐ ẢNH vẽ ra, dư thì gộp thành "+N"
        },
        effects: {
            // Mỗi quà có thể kích hoạt một WEBM với thời gian buông lá riêng.
            effectGifts: []
        },
        // Gió cục bộ: thổi tung một vùng lá quanh một điểm (curl-noise).
        // maxLeaves là cần gạt THẨM MỸ chứ không phải hiệu năng — đo được giảm 600 xuống 300
        // gần như không đổi frame time. Muốn nhẹ máy thì giảm drop.maxLeaves.
        wind: {
            enabled: true,
            radius: 420,          // px bán kính vùng gió
            strength: 640,        // px/s vận tốc gió tại tâm
            turbulence: 55,       // % nhiễu xoáy trộn vào luồng thẳng
            durationMs: 1500,     // thời gian một cơn
            maxLeaves: 600,       // số lá cuốn lên mỗi cơn
            drag: 32,             // /10 = độ bám gió của lá
            lift: 35,             // % lực nâng theo vận tốc góc
            direction: 'random',  // 'left' | 'right' | 'random'
            windGifts: []         // [{ id, giftId, giftName }] — quà kích hoạt gió
        },
        // LỐC XOÁY: gom lá quay tròn quanh trục rồi bốc lên.
        // inward phải đủ lớn so với spin, nếu không lá loe ra thay vì gom vào — lý do số học
        // và số đo cụ thể nằm trong public/games/nhatla/game.js.
        tornado: {
            enabled: true,
            radius: 380,          // px bán kính vùng xoáy
            spin: 800,            // px/s vận tốc quay tại rìa
            inward: 1000,         // px/s lực hút vào tâm
            lift: 380,            // px/s lực bốc lên
            durationMs: 3200,
            maxLeaves: 700,
            drift: 90,            // px/s lốc trườn ngang qua sân
            gifts: []             // [{ id, giftId, giftName }] — quà kích hoạt lốc
        },
        // HÀNH ĐỘNG CỨU: quà chỉ định bật chế độ tự nhặt lá trong N giây. Lá gần thùng nhất
        // bay vào trước nên nhìn như thùng đang hút lá. Dành cho lúc đống lá ngập quá tay
        // người vận hành — combo dồn dập thì chỉ gia hạn thêm giờ, không chồng nhiều lượt.
        autoClean: {
            enabled: true,
            durationMs: 2000,     // thời gian một lượt cứu
            leavesPerSec: 20,     // tốc độ nhặt → 2s × 20 = 40 lá một lượt
            gifts: []             // [{ id, giftId, giftName }] — quà kích hoạt
        },
        // GIẢI CỨU: danh sách phẳng, MỖI hành động = 1 quà + 1 bộ thông số RIÊNG.
        // Ba khối wind/tornado/autoClean ở trên vẫn giữ: làm MẪU thông số cho hành động mới,
        // làm công tắc tắt cả loại, và giữ wind.drag/wind.lift (vật lý chung của lá).
        rescue: {
            actions: []       // [{ id, type, icon, name, enabled, giftId, giftName, hotkey, params }]
        },
        // TOP NGƯỜI TẶNG LÁ: server cộng dồn số lá theo BUỔI LIVE (in-memory, không ghi disk),
        // reset khi bấm Xoá hết lá hoặc nút Reset TOP. Overlay có 2 kiểu hiện độc lập:
        // chữ bay ngang màn hình lâu lâu một lượt, và bảng đứng thường trực.
        topDonors: {
            enabled: true,
            count: 5,             // TOP mấy người
            minLeaves: 1,         // dưới ngưỡng này không vào bảng
            flyEnabled: true,
            // Chốt theo bố cục đã chạy live thật: 'solo' xoay vòng từng người, chữ nhỏ (48%)
            // bay ngang giữa màn hình trong 4s rồi nghỉ 31s. Cả tràng 'train' chữ to choán
            // hết overlay nên chỉ hợp lúc demo, không hợp buổi live dài.
            flyMode: 'solo',      // 'train' = cả TOP nối đuôi 1 lượt | 'solo' = xoay vòng từng người
            flyIntervalSec: 31,   // giãn cách giữa 2 lượt bay
            flyDurationSec: 4,    // thời gian bay hết chiều ngang
            flyYPercent: 48,
            flyScale: 48,
            boardEnabled: false,
            boardXPercent: 62,
            boardYPercent: 6,
            boardScale: 100
        },
        // BẢNG QUÀ cho người xem — phải khớp TỪNG SỐ với defaultConfig() trong
        // public/games/nhatla/game.js, lệch là panel và overlay vẽ hai kiểu khác nhau lúc
        // chưa có config lưu. Bảng vẽ ở overlay riêng /overlay/nhatla-gifts; xem ghi chú
        // dài trong game.js về lý do tách khỏi overlay chính.
        giftBoard: {
            enabled: true,
            layout: 'vertical',
            namePos: 'right',
            scale: 100,
            iconScale: 100,
            gap: 80,
            nameScale: 100,
            showDiamond: false,
            xPercent: 2,
            yPercent: 2,
            autoScroll: { enabled: false, visibleCount: 6, direction: 'up', speed: 2 }
        },
        giftRules: [],            // [{ id, giftId, giftName, count }] — quà chỉ định rơi N lá
        coinsPerLeaf: 1,          // quà không có rule: N coin = 1 lá (0 = bỏ qua)
        defaultLeavesPerGift: 0   // legacy fallback, giữ để config cũ không lỗi
    };
}

// ====== 🏆 Thứ Hạng LIVE — defaults (phải khớp DEFAULTS trong public/games/leaguecard/league-card.js) ======
function makeDefaultLeagueCardConfig() {
    return {
        enabled: true,
        style: 'A',               // A Khiên + bảng | B Thanh gọn | C Vòng tiến độ
        skin: 'royal',            // 20 skin — danh sách SKINS trong league-card.js
        xPercent: 97,             // mép PHẢI của thẻ (thẻ mọc sang trái từ khiên), % chiều ngang 1080
        yPercent: 4,              // mép trên, % chiều dọc 1920
        scale: 100,
        maxStars: 5,              // số mảnh tối đa mỗi bậc — chưa biết chắc, chờ log thật
        golden: false,            // "Giờ vàng" (teamRankBonusTime) — suy đoán, mặc định tắt
        autoCollapse: true,
        collapseAfterSec: 20,
        convertMode: 'auto',      // auto | manual | off — quy "thiếu X điểm" ra số quà
        convertGifts: [],         // manual: tối đa 2 id quà
        rescuer: true,            // vinh danh người giữ hạng
        dangerMinutes: 30,        // còn ≤ N phút tới giờ chốt mà vẫn thiếu điểm → sắp rớt
        // NHẬP TAY: kết nối ẩn danh không nhận rankUpdate (thử 9 phòng thật 30/10) → streamer nhập số từ app TikTok,
        // quà trừ dần "thiếu X". Ghi qua POST /api/leaguecard/manual (KHÔNG qua /config để panel khỏi đè số đã trừ).
        manualOn: false,
        manual: { division: 'B2', stars: 0, rank: '', need: '', deadline: '' }
    };
}

// ====== Bảng Quà Tổng — defaults ======
// Phải khớp defaultConfig() trong public/_prototype/giftboard.html (client tự chuẩn hoá lại,
// server chỉ giữ để config lần đầu không rỗng). Toạ độ % trên sân khấu 1080×1920, neo góc trên-trái.
function makeDefaultGiftBoardConfig() {
    return {
        enabled: true,
        mode: 'perGame',             // perGame = mỗi game 1 khối (mặc định) | single = 1 bảng | split = chia N cột
        split: { by: 'count', count: 2, rows: 8 },
        display: {
            scale: 100,              // cỡ MẶC ĐỊNH cho khối mới — mỗi khối có scale riêng trong panels
            iconScale: 100, nameScale: 100, gap: 80,
            layout: 'vertical',      // vertical | horizontal | grid
            columns: 2,              // chỉ dùng cho grid
            namePos: 'right',        // right | bottom
            theme: 'dark',           // dark | glass | neon | light
            accent: '#ffb054',
            title: '',               // '' = không hiện tiêu đề
            showDiamond: false, showGameIcon: true, showCounter: true, showTag: true, pulseOnGift: true, showPanelTitle: true,
            autoScroll: { enabled: false, visibleCount: 8, direction: 'up', speed: 2 },
            paging: { enabled: false, perPage: 6, seconds: 6, holdSeconds: 12 }   // 📄 lật trang (thắng cuộn khi bật)
        },
        // Mỗi khối nhớ vị trí/cỡ/ẩn-hiện RIÊNG: 'main' | 'col1'.. | 'g:<gameId>'. Client tự điền khi khối xuất hiện.
        panels: {},
        // Game nào được lên bảng (game TẮT ở Thư viện luôn bị loại bất kể cờ này)
        sources: { thuytinh: true, caro: true, votecomment: true, nhietdo: true, bancung: true, trongcay: true, nhatla: true, timer: true,
            touchplay: true, chemtraicay: true, dapmuoi: true, dacau: true, body: true,
            quaivat: true, nhatu: true, pokemon: true, creatoronline: true, duongveque: true, obsEffects: true },
        rules: { mergeSameGift: true, groupByGame: false, sort: 'game', showGeneric: true, onlyRunning: false, hideBirdGifts: true,
            requireOverlay: true,    // chỉ game có overlay đang mở (OBS / LIVE Studio) mới lên bảng
            hideGameBoards: true },  // bảng đang mở trên OBS → ẩn bảng quà riêng của từng game (khỏi 2 bảng)
        visibility: {},              // gameId → 'always' | 'never' (thiếu = tự động: game bật / overlay đang mở)
        overrides: {}                // key "<game>|<nguồn>|<giftId>" → { hidden, label } — chỉ tác động lên bảng này
    };
}

// ====== Trồng Cây — defaults ======
function makeDefaultTrongCayConfig() {
    return {
        enabled: true,
        sessionActive: false,
        schemaVersion: 2,
        growthMode: 'perCoin',      // perCoin | perGift | specificGifts
        perCoinGrowth: 2,            // độ nhạy theo xu — cao để cây vọt nhanh (user đỡ chán)
        perGiftGrowth: 5,
        specificGifts: [],           // [{ giftId, giftName, giftImage, growth }]
        chooseTreeEnabled: false,    // 🌱 Chọn cây: viewer tặng quà kích hoạt → tặng quà muốn làm cây → mọi quà sau lớn CÂY CỦA HỌ
        activateGifts: [],           // [{ giftId, giftName, giftImage, windowSeconds }] — quà bật chế độ chọn cây / KÍCH HOẠT LẠI cây đã khóa
        deactivateGifts: [],         // [{ giftId, giftName, giftImage }] — quà TẠM KHÓA tăng trưởng cây của người tặng (chăm lại bằng quà kích hoạt)
        chooseWindowSeconds: 90,     // fallback: sau khi kích hoạt, viewer có bao nhiêu giây để tặng quà chọn loại cây
        waterGifts: [],              // [{ giftId, giftName, giftImage, water, growth }]
        waterCommentAutoWater: true,    // comment đúng từ khóa → TỰ TƯỚI (không cần quà). Chỉ chạy khi phiên đang bật.
        waterCommentKeyword: 'tuoicay',
        waterCommentAmount: 6,          // mỗi comment hợp lệ cộng bao nhiêu nước cho vườn
        waterCommentCooldownSeconds: 8, // trần thời gian / mỗi người — chống 1 user spam comment gây lag
        sunGifts: [],                // [{ giftId, giftName, giftImage, sun, wilt }]
        cutGifts: [],                // [{ giftId, giftName, giftImage, cut }]
        butterflyGifts: [],          // [{ giftId, giftName, giftImage, lifeSeconds }]
        beeGifts: [],                // [{ giftId, giftName, giftImage, bees, harvestPerBee }] — ong thợ tới hái trái cây chín
        beesPerGift: 1,              // số ong mỗi lần tặng quà ong (nếu gift không ghi rõ "bees") — 1 quà = 1 ong (combo xN = N ong)
        beeHarvestPerTrip: 1,        // mỗi con ong hái mấy trái 1 chuyến
        beePointsPerFruit: 50,       // hái 1 trái → +điểm cho NGƯỜI ĐÃ TẶNG NUÔI cây đó (đẩy Top chăm cây)
        maxBees: 30,
        teamMinContributors: 3,      // 1 cây có >= bao nhiêu người cùng góp thì lên màu "TEAM" (cầu vồng)
        // 🐛 Sâu xanh ăn lá (phá hoại): tới theo quà → ăn lá/trái trên cây hoặc trái rụng dưới đất.
        caterpillarGifts: [],        // [{ giftId, giftName, giftImage, count }]
        caterpillarsPerGift: 1,      // số sâu mỗi lần tặng quà sâu (nếu gift không ghi rõ "count") — 1 quà = 1 sâu (combo xN = N sâu)
        caterpillarBite: 1,          // mỗi lần cắn ăn bao nhiêu % chiều cao cây (chỉnh ở panel "Tỉ lệ sâu phá cây")
        caterpillarBiteEverySec: 5,  // nhịp ăn — chậm để sâu phá ít, cây lớn nhanh hơn
        caterpillarStartDelaySec: 5, // sâu xuất hiện xong CHỜ bao lâu mới bắt đầu phá (để có thời gian xịt thuốc)
        caterpillarLifeSeconds: 75,  // sâu sống bao lâu rồi tự bò đi (nếu không bị xịt)
        maxCaterpillars: 20,
        // 🐛→🦋 Sâu KHÔNG bị xịt, ăn hết cây / hết đời → rơi xuống đất hóa NHỘNG, sau N giây TIẾN HÓA
        //    thành bướm (màu ngọc lục dễ nhận biết) rồi tiếp tục vòng đời đi cứu cây héo.
        caterpillarEvolves: true,
        caterpillarPupaSeconds: 8,   // sâu nằm kén dưới đất bao lâu rồi nở thành bướm
        maxPupae: 16,
        // 🧴 Thuốc trừ sâu: tới theo quà → xịt khu có sâu, bảo vệ vùng đó, sâu rụng thành xác.
        sprayGifts: [],              // [{ giftId, giftName, giftImage, protectSeconds }]
        sprayProtectSeconds: 30,     // vùng được bảo vệ bao lâu (sâu không vào/không ăn được)
        sprayRadiusPercent: 28,      // bán kính vùng bảo vệ quanh điểm xịt (theo % bề ngang)
        maxCaterpillarCorpses: 36,   // trần số xác sâu dồn dưới đất
        // ⏱️ Hiệu ứng thời tiết tới TRƯỚC, tác dụng lên cây áp sau (đúng nhân quả: mưa rơi → cây mới tươi).
        weatherEffectDelaySec: 1.0,  // tưới/nắng: chờ mưa/nắng "rơi xuống" bao lâu rồi mới đổi trạng thái cây
        cutSnipDelaySec: 1.8,        // kéo lia qua lại bao lâu rồi mới thực sự cắt (khớp animation overlay)
        carnivorousGifts: [],        // [{ giftId, giftName, giftImage, damage }]
        // 🐉 Rồng lửa phá hoại: bay vào → lượn → phun lửa thiêu rụi cả vườn → cây cháy đen N giây rồi rồng bay đi.
        //    Đốt xong XÓA hết cây nhưng GIỮ Top người chăm cây & điểm tích lũy (không reset bảng xếp hạng).
        dragonGifts: [],             // [{ giftId, giftName, giftImage, burnSeconds }]
        dragonBurnSeconds: 10,       // mặc định cây cháy thành tro đen bao lâu rồi tan (nếu gift không ghi rõ)
        // 🦅 Quà CHIM bay: viewer (đã trồng cây) tặng 1 quà-bay → đánh dấu cây đó là "chim" (ảnh chim = icon quà này).
        //    Nuôi cây cao ≥ birdFlyHeightPercent% → con chim/phượng hoàng bay ra kèm tên user (chỉ khi vào TOP 3).
        //    Mặc định = các quà bay phổ biến (ID TikTok); host tự thêm/bớt. (dragonGifts kiểm tra TRƯỚC → nếu trùng ID, rồng-thiêu thắng.)
        birdGifts: [                  // [{ giftId, giftName, giftImage }]
            { giftId: '8651', giftName: 'Thunder Falcon', giftImage: '' },
            { giftId: '9092', giftName: 'Fire Phoenix', giftImage: '' },
            { giftId: '7319', giftName: 'Phoenix', giftImage: '' },
            { giftId: '7610', giftName: 'Dragon Flame', giftImage: '' },
            { giftId: '13604', giftName: 'Fiery Dragon', giftImage: '' },
            { giftId: '9500', giftName: 'Flying Jets', giftImage: '' },
            { giftId: '5767', giftName: 'Private Jet', giftImage: '' },
            { giftId: '16312', giftName: 'Hero Space', giftImage: '' },
            { giftId: '16899', giftName: 'Magic World', giftImage: '' },
            { giftId: '17845', giftName: 'Bat Headwear', giftImage: '' }
        ],
        maxHeight: 100,
        initialHeight: 30,
        initialWater: 55,
        initialSun: 28,
        initialWilt: 0,
        waterLossPerSecond: 0.22,
        sunReturnPerSecond: 0.18,
        wiltGainPerSecond: 0.45,
        wiltRecoverPerSecond: 0.28,
        wiltGrowthBlockAt: 62,
        wiltShrinkPerSecond: 1.4,
        deadPlantBelowHeight: 1.2,
        fruitsPerHarvest: 3,         // số trái mỗi lần cây chạm 100% (hoặc được tặng thêm khi đã chín)
        maxFruitsPerPlant: 24,       // trần trái treo trên 1 cây — rải thành nhiều chùm dọc thân (chỉ để vẽ cho đẹp)
        fruitDropWilt: 55,           // cây héo tới mức này → trái chín bắt đầu rụng xuống đất
        fruitDropChancePerSec: 0.6,  // tốc độ rụng (xác suất rụng 1 trái mỗi giây khi đang héo)
        groundFruitMax: 40,          // trần số trái nằm dưới đất
        butterflyLifeSeconds: 45,
        butterflySunDamagePerSecond: 2.4,
        butterflyHealPerSecond: 1.6,   // 🦋 bướm đậu cây YẾU (héo) hồi bao nhiêu héo mỗi giây (chia nhau chữa cây yếu)
        predatorChancePerSecond: 0.006,
        carnivoreDamage: 55,
        maxFlowers: 30,   // vườn >30 cây làm OBS tụt khung (đo 03/11) — 80 cũ coi như mặc định cũ → 30 (trongCayMaxFlowers)
        maxButterflies: 28,
        display: {
            gardenXPercent: 50,
            gardenYPercent: 82,
            scale: 100,
            treeHeightScale: 100,   // 🌱 % chiều cao cây (100 = gốc); cao hơn → cây vươn cao, icon quà tự dừng ở đỉnh overlay
            stemCount: 7,
            showStatus: true,
            showNames: true,
            showButterflies: true,
            showBees: true,
            showCaterpillars: true,
            showFlowers: true,
            showWeatherFx: true,
            showDragon: true,
            showGroundDecor: true,   // 🪧 lớp trang trí mặt đất (bảng TOP 3 + hàng rào + đồ vật)
            showTopBoard: true,      // bảng ghi danh TOP 3 tặng điểm
            showFence: true,         // hàng rào cọc + giàn hoa leo
            showGardenProps: true,   // nấm, hoa, chậu cây
            topBoardMedia: '',       // URL ảnh/video thay mặt bảng (để trống = vẽ mặc định)
            boardScale: 100, boardX: 0, boardY: 0,   // ⚙ kích thước & vị trí bảng TOP 3
            fenceScale: 100, fenceX: 0, fenceY: 0,   // ⚙ hàng rào + giàn hoa leo
            propsScale: 100, propsX: 0, propsY: 0,   // ⚙ đồ sân vườn
            kpiUnlockEnabled: false,                 // 💎 KPI Kim Cương mở khoá trang trí (TẮT = luôn hiện)
            kpiProps: 2000, kpiFence: 3000, kpiBoard: 5000, kpiLeaderboard: 10000, kpiPet: 20000,
            showPets: true,                          // 🐾 3 con theo TOP 1/2/3 (ghi tên) + 2 con trang trí
            petScale: 100,
            petRequireTree: true,                    // 🌳 chỉ hiện thú TOP khi user ĐÃ TỰ TRỒNG CÂY (Chọn cây) + đang TOP 3; tắt = về hành vi cũ (chỉ cần TOP)
            petKindMode: 'preset',                   // 'preset' = con vật cấu hình (mascot/media) | 'treeIcon' = ảnh thú = icon quà cây user đã trồng
            birdFlyHeightPercent: 55,                // 🦅 cây cao ≥ % maxHeight này → chim (quà bay) mới cất cánh bay ra
            topPets: [
                { kind: 'cat', media: '' },
                { kind: 'rabbit', media: '' },
                { kind: 'turtle', media: '' }
            ],
            decorPets: [
                { kind: 'dog', enabled: true, media: '' },
                { kind: 'duck', enabled: true, media: '' },
                { kind: 'bird', enabled: true, media: '' }
            ],
            theme: 'cute'
        }
    };
}

// ====== Biểu Cảm Nhiệt Độ — defaults ======
// Thanh nhiệt 0..100°C. Mỗi quà tăng nhiệt theo công thức trong config (perCoin / perGift /
// specificGifts). Cooling gifts giảm nhiệt ở mọi mode. Tick loop giảm nhiệt khi idle.
// Mốc thưởng (milestones) phát media + ticker khi vượt qua. Top contributor leaderboard.
function makeDefaultNhietDoMilestones() {
    return [
        { temp: 25,  label: '25°C — Ấm rồi!',     tickerText: '🔥 25°C — ẤM RỒI! 🔥',   mediaUrl: '', mediaName: '', mediaType: '', volume: 80,  enabled: true },
        { temp: 50,  label: '50°C — Nóng!',       tickerText: '🔥 50°C — NÓNG QUÁ! 🔥',  mediaUrl: '', mediaName: '', mediaType: '', volume: 85,  enabled: true },
        { temp: 75,  label: '75°C — Rất nóng!',   tickerText: '🔥🔥 75°C — RẤT NÓNG!',   mediaUrl: '', mediaName: '', mediaType: '', volume: 90,  enabled: true },
        { temp: 100, label: '100°C — CHÁY!',      tickerText: '💥 100°C — BÙM! 💥',       mediaUrl: '', mediaName: '', mediaType: '', volume: 100, enabled: true }
    ];
}
function makeDefaultNhietDoConfig() {
    // Default values curated từ setup thực tế của HP Media (v1.0.99+)
    return {
        enabled: true,
        sessionActive: false,        // mặc định DỪNG — phải bấm ▶ Bắt đầu mới chạy (tránh "tự đang chạy")
        heatMode: 'perCoin',         // perCoin = an toàn cho fresh install (mọi quà đều +°)
        perCoinDegrees: 0.1,         // user-curated: 1 xu = 0.1°
        perGiftDegrees: 5,
        specificGifts: [],           // fresh install — user phải thêm khi đổi mode
        coolingGifts: [],
        decayPerSecond: 1.0,
        idleSeconds: 5,
        decayShape: 'linear',
        tempMin: 0,
        tempMax: 100,
        initialTemp: 0,
        milestones: makeDefaultNhietDoMilestones(),
        ambientAudio: { url: '', name: '', volume: 60, reactToHeat: true },
        display: {
            xPercent: 86,            // user-curated: thanh nhiệt góc phải-trên
            yPercent: 23,
            scale: 40,               // nhỏ gọn, không che mặt streamer
            showThermo: true,
            showLabel: false,        // ẩn chữ "NHIỆT ĐỘ" cho gọn
            showDegrees: true,
            showEmoji: true,
            showFloatGain: true,
            showFireEffect: true,
            showHaze: true,
            shakeAtMax: true,
            showTopContrib: false,
            topContribPos: 'bottom-right',
            colorScheme: 'pinkfire',
            shape: 'tube',
            fxIntensity: 90,
            tickerScale: 65,
            showGiftList: true,
            giftListXPercent: 4,
            giftListYPercent: 30,
            giftListScale: 100,
            giftListLayout: 'vertical'
        }
    };
}

// ====== Bắn Cung — defaults ======
// HP hình trái tim (0..maxHearts). Mỗi gift bắn 1 hoặc 3 mũi tên (theo gán).
// Server giữ HP authoritative, emit shot events cho overlay animate.
//
// PRESET BUNDLES — apply via cmd:preset
// Preset KHÔNG đổi số tim (streamer tự chọn ở tab Máu) — chỉ đặt sát thương mỗi mũi + nhịp hồi máu (theo HP LIVE NPC).
// Số mũi để gục = số tim ÷ damagePerShot (chưa tính chí mạng/combo): ở 10 tim là 20 → 40 → 67 → 118; tim nhiều hơn thì
// số mũi tăng theo. regenPerSecond ghi theo mốc 10 tim, áp vào thì nhân theo số tim (20 tim hồi gấp đôi ♥/giây) để
// tỉ lệ hồi so với thanh máu giữ nguyên. Thử nhanh (sandbox) = thử vòng trúng → gục → hồi → sống lại.
const BANCUNG_PRESETS = {
    easy:     { damagePerShot: 0.5,   regenPerSecond: 0.1,  idleBeforeRegen: 4, regenRampSec: 12, criticalChance: 5,  headshotChance: 0 },   // ≈ 20 mũi
    normal:   { damagePerShot: 0.25,  regenPerSecond: 0.2,  idleBeforeRegen: 3, regenRampSec: 10, criticalChance: 5,  headshotChance: 0 },   // ≈ 40 mũi
    hardcore: { damagePerShot: 0.15,  regenPerSecond: 0.3,  idleBeforeRegen: 3, regenRampSec: 8,  criticalChance: 8,  headshotChance: 0 },   // ≈ 67 mũi
    boss:     { damagePerShot: 0.085, regenPerSecond: 0.35, idleBeforeRegen: 3, regenRampSec: 8,  criticalChance: 10, headshotChance: 15 },  // ≈ 118 mũi
    sandbox:  { damagePerShot: 1,     regenPerSecond: 1,    idleBeforeRegen: 2, regenRampSec: 3,  criticalChance: 0,  headshotChance: 0 }    // 10 mũi — thử nhanh
};

function makeDefaultBanCungConfig() {
    // Default values curated từ setup thực tế của HP Media (v1.0.99+)
    return {
        enabled: true,
        sessionActive: false,        // mặc định DỪNG — phải bấm ▶ Bắt đầu mới chạy (tránh "tự đang chạy")
        // ===== HP =====
        maxHearts: 10,
        initialHearts: 10,
        damagePerShot: 0.1,           // user-curated: 0.1 ♥/mũi (tank hơn = ít chết oan)
        // ===== Regen =====
        regenPerSecond: 0.2,          // tốc độ hồi TỐI ĐA (♥/giây) — đạt sau regenRampSec giây hồi liên tục
        idleBeforeRegen: 3,
        regenRampSec: 10,             // hồi CHẬM lúc đầu (15% tốc độ) rồi nhanh dần tới tối đa sau ngần này giây
        // ===== Chết / hồi sinh =====
        reviveWindowSec: 30,          // 30s chờ khán giả tặng quà hồi sinh, hết giờ thì tự hồi
        autoReviveAfterWindow: true,
        autoReviveHearts: 10,         // tự hồi = đầy máu (bằng maxHearts mặc định)
        reviveProtectionSec: 3,       // user-curated: 3s giáp sau revive
        // ===== BẮN TỰ DO — quà bất kỳ (không gán) cũng kích hoạt =====
        // Damage = totalKC / freeFireKcPerHeart hearts. Số mũi = ceil(totalKC / freeFireKcPerShot).
        // Quà NẰM TRONG shot/heal/revive/shield gifts hoặc có giftsPerHeart riêng → KHÔNG kích
        // hoạt free-fire (giữ hành vi gán cụ thể).
        freeFireEnabled: false,
        freeFireKcPerHeart: 100,      // 100 KC = 1 ♥ máu
        freeFireKcPerShot: 10,        // 10 KC = 1 mũi tên (visual)
        freeFireMaxShots: 20,         // tránh combo siêu lớn spam 1000 mũi
        // ===== Quà gán — fresh install để trống, user thêm theo nhu cầu =====
        shotGifts: [],
        healGifts: [],
        reviveGifts: [],
        shieldGifts: [],
        // ===== Hiển thị — curated by user =====
        display: {
            heartsXPercent: 50,
            heartsYPercent: 16,        // 16% — vừa khít dưới badge LIVE
            heartsScale: 60,           // 60% — gọn, không che mặt
            bowXPercent: 81,
            bowYPercent: 87,
            bowScale: 185,             // 185% — bow widget to rõ
            bowSkin: 'cupid',          // 💘 skin cupid hồng
            heartStyle: 'glossy',      // tim bóng láng (mát mắt)
            showShooterName: true,
            showDamageText: true,
            redFlashIntensity: 100,    // 100% — chớp đỏ mạnh dramatic
            deathTintOpacity: 75,
            showBowWidget: true,
            showHearts: true,
            showTopContrib: false,
            topContribPos: 'bottom-left',
            arrowDurationMs: 200,      // 200ms — mũi tên bay nhanh, snappy
            burstDelayMs: 120,         // 120ms — burst 3 phát rất gần nhau
            autoAimBow: true,
            // ===== BÁM THEO NGƯỜI — camera trong OBS + MediaPipe Pose (dùng chung feed với Touch & Play) =====
            bodyTrack: false,          // bật: mũi tên bắn vào thân/đầu thật, hàng tim bám đỉnh đầu
            trackSource: '',           // tên nguồn camera trong OBS; trống = dùng nguồn Touch & Play đã chọn
            bloodMarks: true,          // vết đỏ nhạt dính trên người chỗ trúng, mờ dần sau ~4 giây
            bodyFlash: true,           // trúng → chớp đỏ theo hình cơ thể (thay chớp toàn màn) khi đang thấy người
            bodyChar: true,            // hết máu → cả cơ thể cháy đen (thay màn tối toàn khung) khi đang thấy người
            bodyCharOpacity: 70,       // % độ đậm lớp đen khi chết — 70 vẫn thấy người bên dưới
            bodyFlashOpacity: 50,      // % độ đậm lớp đỏ nhạt khi trúng
            maskSmooth: true,          // làm mượt viền người (lọc nhiễu + bù chuyển động) — tắt = mặt nạ thô
            // Điểm trúng (target zone) — user-curated: trúng vào MẶT/THÂN streamer
            impactXPercent: 55,
            impactYPercent: 40,
            impactSpread: 20,          // 20% spread cho randomness
            // Phím tắt cho streamer
            hotkeyFire: 'X',
            hotkeyHeal: 'H',
            hotkeyShield: 'B',
            hotkeyKill: '',
            hotkeyRevive: 'R',
            globalHotkeys: true,       // user-curated: bật Ctrl+Shift+X/H/B/R hoạt động mọi nơi
            // ===== VISUAL POLISH =====
            showArrowTrail: true,      // streak dài sau mũi tên
            showArrowUsername: true,   // tên user bay theo mũi tên
            showHitParticles: true,    // lông + bụi văng khi trúng
            heartShakeLowHp: true,     // hàng tim rung khi HP < 30%
            slowMotionOnKill: true,    // slo-mo 400ms khi phát kết liễu
            viewportShakeOnHit: true,  // viewport rung 80ms khi trúng
            deathCamZoom: true,        // dim + zoom out khi chết
            showKillingBlow: false,    // thẻ tên người gây phát kết liễu — user thấy thừa, mặc định tắt
            showDeathPanel: false,     // bảng "ĐÃ GỤC" + đếm ngược + lời nhắc hồi sinh — mặc định tắt
            // Khung chữ lớn giữa màn (user thấy to quá "phá game") — bật/tắt từng loại + cỡ chữ
            bannerScale: 50,           // % cỡ khung so với bản gốc
            bannerAutoburst: true,     // "⚡ AUTO BURST"
            bannerRevive: false,       // "✨ HỒI SINH!" — mặc định tắt
            bannerHeal: true,          // "+1 ❤ Hồi máu"
            bannerShield: true,        // "🛡 BẤT TỬ
            showPodium: false,         // top-3 podium khi kết thúc phiên — user không cần bảng xếp hạng
            showSurvivalTimer: false,  // đồng hồ "sống sót" — mặc định tắt
            // ===== GAMEPLAY DEPTH =====
            criticalChance: 5,         // % per shot — critical 2-3x damage
            criticalMultiplier: 3,
            comboEnabled: true,
            comboWindowSec: 4,         // shot trong N giây tiếp = combo
            comboMaxMultiplier: 3,     // 1x → 3x max
            headshotEnabled: true,     // user-curated: bật (chance vẫn 0 — user tự set)
            headshotChance: 0,
            headshotMultiplier: 2,
            bowChargeEnabled: false,   // user-curated: tắt
            bowChargePerGift: 100,
            bowChargeFullShots: 100,
            // ===== GIFT LIST OVERLAY (danh sách quà chỉ định, draggable) =====
            showGiftList: true,
            giftListXPercent: 4,
            giftListYPercent: 30,
            giftListScale: 100,
            giftListLayout: 'vertical',   // 'vertical' | 'horizontal'
            showHpNumber: true            // số máu "5.6 / 10 ❤" dưới hàng trái tim
        }
    };
}

// Migrate config cũ (single-profile) sang multi-profile schema.
// Config v1 (cũ): { enabled, userRules, globalJoin, globalGift, queue, display }
// Config v2 (mới): { enabled, activeProfileId, profiles: [...], queue, display }
function migrateVipWelcomeConfig(cfg) {
    // Thẻ vào phòng (joinCard + profile.joinTiers): bù field + chuyển globalJoin cũ thành bậc.
    return vwTiers.migrateJoinConfig(migrateVipWelcomeProfiles(cfg));
}
function migrateVipWelcomeProfiles(cfg) {
    if (!cfg) return makeDefaultVipWelcomeConfig();
    if (Array.isArray(cfg.profiles) && cfg.profiles.length > 0) {
        // Đã ở schema mới — đảm bảo có activeProfileId hợp lệ + dọn field minDiamond cũ
        const ids = cfg.profiles.map(p => p.id);
        if (!cfg.activeProfileId || !ids.includes(cfg.activeProfileId)) {
            cfg.activeProfileId = cfg.profiles[0].id;
        }
        // Strip legacy minDiamond + minLevel khỏi user rules (user yêu cầu chỉ định ID = không cần level filter)
        const defProfile = makeDefaultVipWelcomeProfile('');
        for (const p of cfg.profiles) {
            if (Array.isArray(p.userRules)) {
                p.userRules = p.userRules.map(r => {
                    const { minDiamond, minLevel, ...rest } = r || {};
                    return rest;
                });
            }
            if (p.globalGift && 'minDiamond' in p.globalGift) {
                const { minDiamond, ...rest } = p.globalGift;
                p.globalGift = rest;
            }
            // Profile từ bản cũ thiếu globalSubscribe / các field lọc mới (requireTopUser, minFansLevel, labelStyle...)
            // → merge default vào dưới giá trị đã lưu, để config trên đĩa đủ field ngay cả khi panel chưa lưu lại.
            for (const key of ['globalJoin', 'globalGift', 'globalSubscribe']) {
                p[key] = { ...defProfile[key], ...(p[key] && typeof p[key] === 'object' ? p[key] : {}) };
            }
        }
        // Auto-update perItemMinMs từ default cũ (2500) sang default mới (200) — user không
        // chủ động customize sẽ được nâng cấp tốc độ tự động.
        if (cfg.queue && cfg.queue.perItemMinMs === 2500) {
            cfg.queue.perItemMinMs = 200;
        }
        return cfg;
    }
    // Có rules ở top-level → wrap thành 1 profile "Mặc định"
    const def = makeDefaultVipWelcomeProfile('Nhóm mặc định');
    delete def.joinTiers;   // để migrateJoinConfig dựng bậc + chuyển globalJoin cũ thành bậc
    if (Array.isArray(cfg.userRules)) {
        def.userRules = cfg.userRules.map(r => {
            const { minDiamond, minLevel, ...rest } = r || {};   // strip legacy minDiamond + minLevel
            return rest;
        });
    }
    if (cfg.globalJoin) def.globalJoin = { ...def.globalJoin, ...cfg.globalJoin };
    if (cfg.globalGift) {
        const { minDiamond, ...rest } = cfg.globalGift;
        def.globalGift = { ...def.globalGift, ...rest };
    }
    if (cfg.globalSubscribe) def.globalSubscribe = { ...def.globalSubscribe, ...cfg.globalSubscribe };
    const out = makeDefaultVipWelcomeConfig();
    out.enabled = cfg.enabled !== false;
    out.profiles = [def];
    out.activeProfileId = def.id;
    if (cfg.queue) out.queue = { ...out.queue, ...cfg.queue };
    if (cfg.display) out.display = { ...out.display, ...cfg.display };
    return out;
}

// ====== App config / persistence ======
function loadAppConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {}
    return { games: {}, license: { key: '', email: '' } };
}
// 🎮 Đang phiên game theo quà: cờ enabled / sessionActive của game camera là của PHIÊN (chỉ RAM) → ghi đĩa bản trước phiên,
// app tắt / crash giữa phiên khởi động lại không giữ cờ của phiên.
function appConfigForDisk() {
    if (typeof camSession === 'undefined' || !camSession || !camSessionSnap) return appConfig;
    const games = { ...appConfig.games };
    for (const [id, on] of Object.entries(camSessionSnap.enabled || {})) if (games[id]) games[id] = { ...games[id], enabled: on };
    if (camSession.gameId === 'bancung' && !camSessionSnap.bancungActive && games.bancung) games.bancung = { ...games.bancung, sessionActive: false };
    return { ...appConfig, games };
}
function saveAppConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfigForDisk(), null, 2));
    try {
        if (!fs.existsSync(CONFIG_BACKUP_DIR)) fs.mkdirSync(CONFIG_BACKUP_DIR, { recursive: true });
        fs.writeFileSync(path.join(CONFIG_BACKUP_DIR, 'app-config-autobackup.json'), JSON.stringify({ exportedAt: new Date().toISOString(), config: appConfigForDisk() }, null, 2));
    } catch (e) { /* backup is best-effort */ }
}
// Đã có app-config.json = máy đang nâng cấp từ bản trước (phân biệt với cài mới khi thêm mặc định mới).
const APP_CONFIG_EXISTED_AT_LOAD = fs.existsSync(CONFIG_FILE);
const appConfig = loadAppConfig();
if (!appConfig.games || typeof appConfig.games !== 'object') appConfig.games = {};   // file cấu hình cũ/tay thiếu 'games' → không sập
if (!appConfig.license || typeof appConfig.license !== 'object') appConfig.license = { key: '', email: '' };

// ====== OBS Bridge — kết nối OBS Studio qua WebSocket để chạy Lua effects ======
// Luồng chính (v1.9.8+): quà chỉ định về → nhớ Scene đang phát (nhóm NPC) → chuyển sang Scene hiệu ứng
// → LUA trong scene đó (bật "🎬 Tự chạy khi chuyển sang Scene") tự phát → đủ số giây → tự quay về Scene cũ.
// Hotkey chỉ còn là tùy chọn cho LUA chưa có mục tự chạy theo Scene (app bấm hộ sau khi đổi scene).
// License-gated: chỉ trigger nếu license activated.
if (!appConfig.shareTokens) appConfig.shareTokens = {};   // { gameId: uuid } — link /overlay/shared/<uuid>
if (!appConfig.obsBridge) {
    appConfig.obsBridge = {
        enabled: true,          // master ON/OFF "Hiệu ứng OBS" (đồng bộ với toggle ở 🎮 Thư viện Game)
        url: 'ws://localhost:4455',
        password: '',
        autoConnect: false,
        mapping: [],            // Array<{ giftId, scene, hotkey?, cooldownMs, enabled }> — scene = Scene hiệu ứng trong OBS
        groupsDisabled: []      // Array<string> — group names BẬT CỜ TẮT (skip enqueue)
    };
}
// Backward-compat: thêm groupsDisabled nếu config cũ chưa có
if (!Array.isArray(appConfig.obsBridge.groupsDisabled)) {
    appConfig.obsBridge.groupsDisabled = [];
}
// Backward-compat: config cũ chưa có cờ master → mặc định BẬT
if (typeof appConfig.obsBridge.enabled !== 'boolean') {
    appConfig.obsBridge.enabled = true;
}

// ====== LUA Duration Registry ======
// Map hotkey name → suggested duration ms (auto-fill khi user pick effect).
// Số liệu khớp với compute_total_duration_ms() của từng LUA file.
// User có thể tinh chỉnh sau khi test (xem dòng "TOTAL DURATION: ..." trong OBS Script log).
const OBS_LUA_DURATION_REGISTRY = {
    'effect_chao_dap_trigger': 8000,   // Pan smash (~6-8s tùy config)
    'effect_chao_fall_trigger': 4000,  // Pan fall đơn giản
    'effect_chay_trigger': 6000,       // Chạy bộ (visible time)
    'effect_dap_bua_trigger': 9000,    // Whack-a-mole 4 pops + hit + dizzy
    'effect_ho_den_trigger': 9000,     // Stand+fall+gone+return+stay
    'effect_lo_xo_trigger': 10000,     // Spring 9.4s
    'effect_may_giat_trigger': 7000,   // Washing machine
    'effect_mario_trigger': 15000,     // Mario v5: 4 keyframes (hold+lerp) + mushroom + final_hold
};
// Gợi ý theo TÊN SCENE hiệu ứng (mapping quà → Scene không cần hotkey): so từ khóa sau khi bỏ dấu,
// bỏ khoảng trắng/ký tự lạ. "Chảo Đập" → "chaodap", "Lò xo NPC" → "loxonpc". Thứ tự: khóa dài trước.
const OBS_LUA_DURATION_BY_KEYWORD = [
    ['mario', 15000], ['loxo', 10000], ['dapbua', 9000], ['hoden', 9000],
    ['chaodap', 8000], ['chao', 8000], ['maygiat', 7000], ['chay', 6000]
];
function obsBridgeNormalizeName(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function obsBridgeSuggestDurationMs(hotkey, sceneName) {
    if (hotkey) {
        if (OBS_LUA_DURATION_REGISTRY[hotkey] != null) return OBS_LUA_DURATION_REGISTRY[hotkey];
        // Fallback heuristic: hotkey có chứa "effect_" → trả về 8s (an toàn)
        if (/^effect_/.test(hotkey)) return 8000;
    }
    const key = obsBridgeNormalizeName(sceneName);
    if (key) {
        const hit = OBS_LUA_DURATION_BY_KEYWORD.find(([kw]) => key.includes(kw));
        if (hit) return hit[1];
    }
    return 0;
}
const obsBridge = new OBSBridge({
    isLicensed: () => Boolean(appConfig.license && appConfig.license.activated),
    autoReconnect: true,
    reconnectDelayMs: 5000,
    logger: {
        log: (...args) => console.log('[obs-bridge]', ...args)
    }
});

// ★ Auto-REFRESH overlay browser source khi app khởi động + OBS đã kết nối.
// Giải quyết "lỗi muôn thuở": mở lại app → overlay OBS đứng yên (trang cũ trỏ server đã chết),
// phải vào OBS bấm Refresh thủ công. Giờ app tự bấm Refresh hộ qua OBS WebSocket — chỉ refresh
// các source trỏ overlay của app (lọc theo URL), KHÔNG đụng source khác (BEAUTY, WEBM…).
// Lọc thêm theo CỔNG: HP LIVE NPC (:3001) cùng máy cũng có /overlay/… — không được refresh hộ app kia.
// Chạy MỘT LẦN cho mỗi phiên app (lần OBS connect đầu tiên) để tránh refresh lặp khi reconnect.
let obsBridgeStartupRefreshDone = false;
function obsBridgeAutoRefreshOverlays(reason) {
    if (obsBridgeStartupRefreshDone) return;
    obsBridgeStartupRefreshDone = true;
    // Delay nhỏ để chắc chắn HTTP server đã phục vụ overlay trước khi OBS nạp lại trang.
    setTimeout(() => {
        obsBridge.refreshBrowserSources({
            urlIncludes: ['/overlay/', '/_prototype/', `localhost:${PORT}`, `127.0.0.1:${PORT}`],
            port: PORT
        })
        .then(r => {
            if (r && r.ok) console.log(`[obs-bridge] startup auto-refresh overlay (${reason}) → ${r.refreshed.length} source`);
            else if (r && r.reason && r.reason !== 'disconnected') console.log(`[obs-bridge] startup auto-refresh skip: ${r.reason}`);
        })
        .catch(() => {});
    }, 1500);
}
// obs-websocket-js phát 'Identified' sau khi kết nối + xác thực xong (đủ điều kiện gọi request).
// Bắt ở đây để cover cả 2 case: app mở khi OBS đã chạy, VÀ OBS mở sau app (reconnect thành công).
try { obsBridge.obs.on('Identified', () => obsBridgeAutoRefreshOverlays('OBS connected')); } catch (e) {}
// 📋 Bảng Quà Tổng: vừa nối OBS → đọc ngay link game nào nằm trong OBS (không chờ 15s).
try { obsBridge.obs.on('Identified', () => setTimeout(() => overlayObsScan(), 2000)); } catch (e) {}
// TOUCH & PLAY: chụp nguồn camera TRONG scene OBS (không mở webcam riêng) gửi overlay nhận diện.
// Chỉ chạy khi có overlay đăng ký 'touchplay:feed'. Cấu hình lấy từ tpCfg mà lab lưu.
// 📷 Tự nhận camera: Scene đang phát có "Thiết bị quay video" (dshow…) → dùng khi streamer chưa chọn nguồn camera.
// Chỉ ĐỌC OBS (GetSceneList / GetSceneItemList), 2 s/lần và chỉ khi có overlay đang nhận hình.
let camAuto = { scene: '', source: '', at: 0 }, camAutoBusy = false;
async function camAutoRefresh() {
    if (camAutoBusy || !obsBridge.isConnected()) return camAuto;
    camAutoBusy = true;
    try {
        const sc = await touchplayFeed.listScenes();
        const scene = sc.currentScene || '';
        const r = scene ? await touchplayFeed.listSceneSources(scene) : { sources: [] };
        const cams = (r.sources || []).filter(s => s.camera);
        const cam = cams.find(s => !s.hidden) || cams[0];
        camAuto = { scene, source: cam ? cam.name : '', at: Date.now() };
    } catch (_) {} finally { camAutoBusy = false; }
    return camAuto;
}
setInterval(() => { try { if (obsBridge.isConnected() && touchplayFeed.subscribers() > 0) camAutoRefresh(); } catch (_) {} }, 2000).unref?.();
let bodyApi = null;                      // 🧍 Bộ Tách Người (installBody, sau khi tạo touchplayFeed)
const touchplayFeed = new ObsCameraFeed({
    bridge: obsBridge, io,
    logger: { log: (...a) => console.log(...a), warn: (...a) => console.warn(...a) },
    // Link OBS của app có thể là link chia sẻ /overlay/shared/<token> — không chứa chữ "touchplay"/"bancung".
    // Overlay Game Camera chứa game con trong iframe phủ kín → Browser Source của nó là overlay của mọi game con.
    overlayMatchers: {
        // Bộ nhận diện chung chạy ngay trong overlay mẹ (public/lib/hp-cam-shared.mjs).
        camgames: (url) => feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        touchplay: (url) => feedUrlIs(url, 'touchplay', /touchplay/i) || feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        chemtraicay: (url) => feedUrlIs(url, 'chemtraicay', /\/overlay\/chemtraicay/i) || feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        // Bắn Cung chơi riêng có link riêng; đang chọn trong Game Camera thì nằm trong overlay mẹ.
        bancung: (url) => feedUrlIs(url, 'bancung', /\/overlay\/bancung/i) || (camPlayActives().includes('bancung') && feedUrlIs(url, 'camgames', /\/overlay\/camgames/i)),
        dapmuoi: (url) => feedUrlIs(url, 'dapmuoi', /\/overlay\/dapmuoi/i) || feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        dacau: (url) => feedUrlIs(url, 'dacau', /\/overlay\/dacau/i) || feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        body: (url) => feedUrlIs(url, 'body', /\/overlay\/body/i) || feedUrlIs(url, 'camgames', /\/overlay\/camgames/i),
        // Level Quest chỉ bám đầu khi chơi trong Game Camera (link riêng đứng yên, không cần feed).
        'level-quest': (url) => camGameInHub('level-quest') && feedUrlIs(url, 'camgames', /\/overlay\/camgames/i)
    },
    getOptions: (activeGames = new Set()) => {
        const G = appConfig.games || {};
        const tp = G.touchplay || {}, c = tp.tpCfg || {};
        const bc = G.bancung || {}, bcd = bc.display || {};
        const ct = G.chemtraicay || {}, vs = ct.videoSource || {};
        const dm = G.dapmuoi || {};
        const cam = G.camgames || {};
        // Nguồn camera riêng còn lưu của từng game (null = game tắt / không dùng feed này).
        // Bắn Cung chơi trong Game Camera thì luôn bám người (overlay ?cam=1), không cần ô bodyTrack.
        const per = {
            touchplay: tp.enabled !== false && c.source !== 'webcam' ? (c.obsSource || '') : null,
            chemtraicay: ct.enabled !== false && vs.mode !== 'webcam' ? ((vs.mode === 'obs-scene' ? vs.scene : vs.source) || '') : null,
            // camPlayActives: phiên 🎮 quà kích hoạt Bắn Cung (không nằm trong actives) cũng phải nhận hình để bám người
            bancung: bc.enabled !== false && (bcd.bodyTrack === true || camPlayActives().includes('bancung')) ? (bcd.trackSource || '') : null,
            dapmuoi: dm.enabled !== false ? '' : null,     // không có nguồn riêng: dùng nguồn chung Game Camera
            dacau: G.dacau?.enabled !== false ? '' : null,  // như trên
            body: G.body?.enabled !== false ? '' : null,    // như trên
            'level-quest': camGameInHub('level-quest') ? '' : null   // như trên; chỉ khi đang chọn trong Game Camera
        };
        const on = Object.keys(per).filter(k => per[k] !== null);
        // Nguồn camera CHUNG của Game Camera (màn Touch & Play / Bắn Cung cũng ghi vào đây) dùng cho mọi
        // game. Chưa đặt (config cũ) → game đang có overlay nhận hình trước, rồi nguồn riêng từng game.
        let source = on.length ? (cam.source || '') : '';
        if (!source) for (const id of [...[...activeGames].filter(id => per[id] !== null), ...on]) if (per[id]) { source = per[id]; break; }
        // 📷 Chưa chọn nguồn ở đâu → tự lấy thiết bị quay video trong Scene đang phát (camAutoRefresh, port HP LIVE NPC).
        if (!source && on.length && camAuto.source && Date.now() - camAuto.at < 10000) source = camAuto.source;
        if (!source && on.length) source = c.obsSource || '';   // nguồn Touch & Play từng chọn
        // 🧍 Bộ Tách Người VẼ LẠI người từ ảnh chụp → lúc có hiệu ứng (overlay xin 'touchplay:boost') cần ảnh nét + đủ khung
        // (1080 px / 30 khung). Lúc RẢNH mà không game camera nào khác nhận hình → 960 px / 8 khung cho OBS đỡ việc.
        const body = on.includes('body') && activeGames.has('body');
        const redraw = body && activeGames.has('body:hi');
        const others = [...activeGames].some(id => !id.endsWith(':hi') && id !== 'body' && id !== 'camgames' && per[id] !== undefined && per[id] !== null);
        if (body && !redraw && !others) return { enabled: true, source, width: 960, fps: 8, idle: true };
        return {
            enabled: on.length > 0,
            source,
            width: Math.max({ low: 640, auto: 960, high: 1280 }[c.quality] || 960, redraw ? 1080 : 0),
            fps: Math.max({ low: 15, auto: 20, high: 30 }[c.quality] || 20, redraw ? 30 : 0)
        };
    }
});
// 🧍 Bộ Tách Người: tự đăng ký route + socket (camgames:camhide, camgames:bodyStat, touchplay:boost).
try {
    bodyApi = BodyServer.installBody({ app, io, express, path, dataDir: DATA_DIR,
        getConfig: () => appConfig.games.body, setConfig: c => { appConfig.games.body = c; }, saveConfig: saveAppConfig,
        obsBridge, touchplayFeed, gameEnabled: () => (appConfig.games.body || {}).enabled !== false,
        isTrusted: requestIsTrusted, socketIsTrusted });
} catch (e) { console.warn('[body] cài module lỗi:', e?.message || e); }
// URL Browser Source khớp game: theo đường dẫn, hoặc link chia sẻ /overlay/shared/<token> của game đó.
function feedUrlIs(url, gameId, re) {
    const tok = appConfig.shareTokens?.[gameId];
    return re.test(url) || (!!tok && url.includes('/overlay/shared/' + tok));
}
touchplayFeed.start();
// ===== Effect Queue — PER-GROUP serialization =====
// Logic: mỗi mapping có field `group`. Effect cùng group → chạy tuần tự (queue chung).
//        Effect khác group → chạy parallel (queue riêng).
// → User đặt effects chung source vào cùng group để chống overlap conflict.
//
// "" (group rỗng / "Chưa nhóm") cũng là 1 group hợp lệ, items "" share 1 queue chung.
const obsBridgeQueues       = new Map();    // groupKey → Array of items
const obsBridgeDraining     = new Map();    // groupKey → bool (worker đang chạy)
const obsBridgeLastTriggerAt = new Map();   // groupKey → timestamp last trigger
const obsBridgeLastIntervalMs = new Map();  // groupKey → intervalMs của effect VỪA CHẠY (để wait đúng duration)
const obsBridgeNowFiring     = new Map();   // groupKey → item đang fire (status='running')
let obsBridgeQueueLastResult = null;        // global last result (across all groups)
const OBS_QUEUE_PER_GROUP_CAP = 100;        // cap PER GROUP để tránh RAM bomb

function obsBridgeGetGroupQueue(groupKey) {
    if (!obsBridgeQueues.has(groupKey)) obsBridgeQueues.set(groupKey, []);
    return obsBridgeQueues.get(groupKey);
}

// ⚠ STRICT GLOBAL SERIAL — tất cả effect xếp 1 hàng FIFO duy nhất
// Lý do: nếu nhiều effect chạy song song trên cùng idol source/scene → loạn
// (effect A đang play thì effect B vào, idol bị 2 anim ghi đè nhau)
// Group trong UI chỉ dùng để PHÂN LOẠI hiển thị, không ảnh hưởng queueing.
const OBS_QUEUE_KEY = '__global__';

function obsBridgeEnqueueForGift(giftId, repeatCount, opts = {}) {
    if (!giftId) return { enqueued: 0, reason: 'no-gift-id' };
    // ⛔ Master OFF: "Hiệu ứng OBS" đã TẮT trong 🎮 Thư viện Game → KHÔNG nhận quà, không trigger
    // bất kỳ effect nào (kể cả quà test). Đây là cổng chặn chính ở server.
    if (appConfig.obsBridge && appConfig.obsBridge.enabled === false) {
        return { enqueued: 0, reason: 'obs-effects-disabled' };
    }
    const mapping = (appConfig.obsBridge && appConfig.obsBridge.mapping) || [];
    const match = mapping.find(m => String(m.giftId) === String(giftId));
    // Hàng hợp lệ = có Scene hiệu ứng (đường chính) HOẶC hotkey (đường cũ)
    if (!match || (!match.scene && !match.hotkey)) return { enqueued: 0, reason: 'no-mapping' };

    // ⛔ Skip nếu mapping bị TẮT (enabled === false)
    if (match.enabled === false) {
        console.log(`[obs-bridge] SKIP giftId=${giftId} scene='${match.scene || ''}' hotkey='${match.hotkey || ''}': mapping DISABLED`);
        return { enqueued: 0, reason: 'mapping-disabled' };
    }
    // ⛔ Skip nếu CẢ NHÓM bị TẮT
    const groupName = String(match.group || '');
    const groupsDisabled = (appConfig.obsBridge && appConfig.obsBridge.groupsDisabled) || [];
    if (groupsDisabled.includes(groupName)) {
        console.log(`[obs-bridge] SKIP giftId=${giftId} scene='${match.scene || ''}' hotkey='${match.hotkey || ''}': group '${groupName}' DISABLED`);
        return { enqueued: 0, reason: 'group-disabled' };
    }
    return obsBridgeEnqueueMapping(match, repeatCount, { ...opts, giftId });
}

// Xếp 1 hàng mapping vào hàng đợi — KHÔNG kiểm tra cờ bật/tắt (caller lo). Dùng chung cho quà thật
// (obsBridgeEnqueueForGift) và nút 🔥 chạy thử (/api/obs-bridge/test-mapping) để test đi đúng đường thật.
function obsBridgeEnqueueMapping(match, repeatCount, opts = {}) {
    const groupKey = OBS_QUEUE_KEY;                       // ★ luôn dùng key global
    const groupLabel = String(match.group || '');          // label hiển thị UI
    const queue = obsBridgeGetGroupQueue(groupKey);
    const giftId = String(opts.giftId != null ? opts.giftId : (match.giftId || ''));

    let n = Math.max(1, Math.min(100, Number(repeatCount) || 1));
    // Cap TOTAL (max 100 items đợi cho toàn bộ queue)
    if (queue.length + n > OBS_QUEUE_PER_GROUP_CAP) {
        n = Math.max(0, OBS_QUEUE_PER_GROUP_CAP - queue.length);
    }
    const scene = String(match.scene || '');
    let intervalMs = Math.max(200, Number(match.cooldownMs) || 1000);
    // Đường Scene: intervalMs = thời gian GIỮ scene hiệu ứng trước khi quay về. Chưa đặt giây → lấy gợi ý
    // theo LUA/tên scene, không đoán được thì 8s — để 200ms thì vừa chuyển đã quay về, LUA chưa kịp chạy.
    if (scene && !(Number(match.cooldownMs) > 0)) intervalMs = obsBridgeSuggestDurationMs(match.hotkey, scene) || 8000;
    for (let i = 0; i < n; i++) {
        queue.push({
            hotkey: match.hotkey || '',
            scene,
            intervalMs,
            giftId,
            giftName: match.giftName || '',
            giftImage: match.giftImage || '',
            actionName: match.actionName || '',   // dùng để hiển thị trong UI queue list
            group: groupKey,
            groupLabel,                            // ★ label group cho UI hiển thị (badge)
            source: opts.source || 'gift',
            enqueuedAt: Date.now()
        });
    }
    const what = [scene ? `scene='${scene}'` : '', match.hotkey ? `hotkey='${match.hotkey}'` : ''].filter(Boolean).join(' + ');
    console.log(`[obs-bridge] ENQUEUE ${n}× ${what} giftId=${giftId} groupLabel='${groupLabel}' source='${opts.source || 'gift'}' (queue=${queue.length}, intervalMs=${intervalMs})`);
    obsBridgeDrainGroup(groupKey);
    return { enqueued: n, pending: queue.length, group: groupLabel };
}

// ===== Chạy 1 item — đường Scene (chính) hoặc đường hotkey (cũ) =====
// Scene "nhà" = scene đang phát lúc quà về (nhóm NPC). Nhớ lại để quay về; nếu lúc quà về OBS đang đứng
// ở 1 scene hiệu ứng (streamer vừa test tay / effect trước chưa kịp về) thì dùng scene nhà đã nhớ trước đó.
let obsBridgeHomeScene = '';
let obsBridgeAbortSeq = 0;             // tăng khi "Xóa hàng đợi" → item Scene đang giữ quay về scene nhà NGAY
const OBS_SCENE_SETTLE_MS = 150;       // chờ OBS đổi scene xong trước khi bấm hotkey hộ
const OBS_SCENE_RETURN_GAP_MS = 300;   // nghỉ sau khi về scene nhà → lần chuyển kế vẫn bắn SCENE_CHANGED cho LUA
const obsSleep = (ms) => new Promise(r => setTimeout(r, ms));

function obsBridgeIsEffectScene(name) {
    if (!name) return false;
    const mapping = (appConfig.obsBridge && Array.isArray(appConfig.obsBridge.mapping)) ? appConfig.obsBridge.mapping : [];
    return mapping.some(m => m && m.scene && String(m.scene) === String(name));
}

async function obsBridgeFireItem(item) {
    if (!item.scene) {
        // Đường cũ: chỉ bấm hotkey, LUA tự lo trong scene hiện tại; spacing do vòng drain xử lý.
        return obsBridge.triggerHotkey(item.hotkey);
    }
    // 1. Nhớ scene đang phát (nhóm NPC) để quay về
    let home = await obsBridge.getCurrentScene();
    if (!home || obsBridgeIsEffectScene(home)) home = obsBridgeHomeScene;
    else obsBridgeHomeScene = home;
    // 2. Chuyển sang scene hiệu ứng → LUA (đã bật "Tự chạy khi chuyển sang Scene") tự phát
    const sw = await obsBridge.setCurrentScene(item.scene);
    if (!sw.ok) return { ...sw, step: 'switch-to-scene', scene: item.scene, home };
    // 3. Hotkey tùy chọn — cho LUA chưa bật tự chạy theo Scene
    let hk = { ok: true, skipped: true };
    if (item.hotkey) {
        await obsSleep(OBS_SCENE_SETTLE_MS);
        hk = await obsBridge.triggerHotkey(item.hotkey);
    }
    // 4. Giữ scene hiệu ứng đủ thời gian LUA chạy xong — poll 100ms để "Xóa hàng đợi" cắt ngang được
    const holdMs = Math.max(0, (Number(item.intervalMs) || 0) - (item.hotkey ? OBS_SCENE_SETTLE_MS : 0));
    const seq = obsBridgeAbortSeq;
    const holdEnd = Date.now() + holdMs;
    while (Date.now() < holdEnd && obsBridgeAbortSeq === seq) {
        await obsSleep(Math.max(10, Math.min(100, holdEnd - Date.now())));
    }
    const aborted = obsBridgeAbortSeq !== seq;
    if (aborted) console.log(`[obs-bridge] scene '${item.scene}': bị xóa hàng đợi → quay về scene nhà ngay`);
    // 5. Quay về scene nhà — chỉ khi OBS vẫn đang ở scene hiệu ứng (streamer tự đổi tay giữa chừng thì tôn trọng)
    let back = { ok: true, skipped: true };
    const nowScene = await obsBridge.getCurrentScene();
    if (home && nowScene === item.scene) {
        back = await obsBridge.setCurrentScene(home);
        await obsSleep(OBS_SCENE_RETURN_GAP_MS);
    } else if (!home) {
        console.log(`[obs-bridge] scene '${item.scene}': không biết scene nhà để quay về (lần đầu đã đứng sẵn ở scene hiệu ứng)`);
    } else if (nowScene !== item.scene) {
        console.log(`[obs-bridge] scene '${item.scene}': streamer đã tự đổi sang '${nowScene}' → không tự quay về`);
    }
    return { ok: !!(sw.ok && hk.ok && back.ok), scene: item.scene, home, returned: !back.skipped, aborted, hotkeyResult: hk, backResult: back };
}

async function obsBridgeDrainGroup(groupKey) {
    if (obsBridgeDraining.get(groupKey)) return;
    const queue = obsBridgeGetGroupQueue(groupKey);
    if (queue.length === 0) return;
    obsBridgeDraining.set(groupKey, true);
    try {
        // do-while: sau khi drain hết, chờ effect cuối play xong DURATION rồi mới clear nowFiring.
        // Nếu trong lúc chờ có item mới enqueue → loop quay lại drain tiếp (no stuck).
        do {
            while (queue.length > 0) {
                const item = queue[0];
                // Spacing — chờ đủ DURATION của effect VỪA CHẠY (không phải effect sắp chạy)
                // → đảm bảo effect trước hoàn tất rồi mới fire effect sau (no overlap)
                const lastAt   = obsBridgeLastTriggerAt.get(groupKey)   || 0;
                const lastDur  = obsBridgeLastIntervalMs.get(groupKey) || 0;
                if (lastAt > 0 && lastDur > 0) {
                    const elapsed = Date.now() - lastAt;
                    if (elapsed < lastDur) {
                        await new Promise(r => setTimeout(r, lastDur - elapsed));
                    }
                }
                queue.shift();
                obsBridgeNowFiring.set(groupKey, { ...item, firedAt: Date.now() });
                console.log(`[obs-bridge] queue fire: ${item.scene ? `scene='${item.scene}' ` : ''}hotkey='${item.hotkey || ''}' giftId='${item.giftId}' source='${item.source}' holdMs=${item.intervalMs} (remaining=${queue.length})`);
                try {
                    const result = await obsBridgeFireItem(item);
                    obsBridgeQueueLastResult = {
                        ...result, hotkey: item.hotkey, scene: item.scene || '', giftId: item.giftId,
                        group: item.groupLabel || '', ts: Date.now()
                    };
                } catch (e) {
                    obsBridgeQueueLastResult = {
                        ok: false, reason: 'exception', error: String(e),
                        hotkey: item.hotkey, scene: item.scene || '', group: item.groupLabel || '', ts: Date.now()
                    };
                }
                obsBridgeLastTriggerAt.set(groupKey, Date.now());
                // Đường Scene: obsBridgeFireItem đã giữ đủ intervalMs rồi mới quay về → item kế chạy ngay,
                // không chờ thêm lần nữa. Chỉ đường hotkey cũ mới cần spacing theo duration.
                obsBridgeLastIntervalMs.set(groupKey, item.scene ? 0 : item.intervalMs);
            }
            // POST-DRAIN: chờ effect CUỐI play xong DURATION trước khi clear nowFiring
            // → UI countdown đếm tới 0 tự nhiên thay vì biến mất ngay
            // → nếu trong lúc chờ có item mới enqueue, while-outer sẽ pick lên
            const finalAt  = obsBridgeLastTriggerAt.get(groupKey)  || 0;
            const finalDur = obsBridgeLastIntervalMs.get(groupKey) || 0;
            if (finalAt > 0 && finalDur > 0) {
                const waitEnd = finalAt + finalDur;
                while (Date.now() < waitEnd && queue.length === 0) {
                    const left = waitEnd - Date.now();
                    await new Promise(r => setTimeout(r, Math.min(100, Math.max(20, left))));
                }
            }
        } while (queue.length > 0);
        obsBridgeNowFiring.delete(groupKey);   // queue rỗng + effect cuối đã play xong → clear
    } finally {
        obsBridgeDraining.set(groupKey, false);
    }
}

function obsBridgeQueueClear() {
    obsBridgeAbortSeq++;   // item Scene đang giữ (nếu có) thấy seq đổi → quay về scene nhà ngay, không chờ hết giây
    let removed = 0;
    for (const q of obsBridgeQueues.values()) {
        removed += q.length;
        q.length = 0;
    }
    return removed;
}

function obsBridgeQueueStatus() {
    const groups = {};
    const items = [];     // mảng tất cả items đang chờ + đang chạy (per UI display)
    let totalPending = 0;
    let anyDraining = false;
    // Now firing items first (running row đầu tiên)
    for (const [key, fItem] of obsBridgeNowFiring.entries()) {
        items.push({
            status: 'running',
            group: fItem.groupLabel || '',     // ★ label hiển thị (không phải internal key)
            hotkey: fItem.hotkey,
            scene: fItem.scene || '',
            giftId: fItem.giftId,
            giftName: fItem.giftName || '',
            giftImage: fItem.giftImage || '',
            actionName: fItem.actionName || '',
            intervalMs: fItem.intervalMs,
            firedAt: fItem.firedAt              // ← UI dùng cái này để countdown
        });
    }
    // Then waiting items (FIFO order — oldest first, newest last)
    for (const [key, q] of obsBridgeQueues.entries()) {
        const draining = !!obsBridgeDraining.get(key);
        if (q.length > 0 || draining) {
            groups[key === OBS_QUEUE_KEY ? '(global)' : (key || '(Chưa nhóm)')] = { pending: q.length, draining };
        }
        for (const it of q) {
            items.push({
                status: 'waiting',
                group: it.groupLabel || '',     // ★ label hiển thị
                hotkey: it.hotkey,
                scene: it.scene || '',
                giftId: it.giftId,
                giftName: it.giftName || '',
                giftImage: it.giftImage || '',
                actionName: it.actionName || '',
                intervalMs: it.intervalMs,
                enqueuedAt: it.enqueuedAt
            });
        }
        totalPending += q.length;
        if (draining) anyDraining = true;
    }
    return {
        pending: totalPending,
        draining: anyDraining,
        groups,
        items,                          // ← chi tiết để UI hiện list
        lastResult: obsBridgeQueueLastResult
    };
}

// BACKCOMPAT alias — code cũ gọi tên này
function obsBridgeMaybeTriggerForGift(giftId, repeatCount = 1) {
    return obsBridgeEnqueueForGift(giftId, repeatCount);
}
// Auto-connect ở startup nếu user đã enable
if (appConfig.obsBridge.autoConnect && appConfig.obsBridge.url) {
    setTimeout(() => {
        obsBridge.connect(appConfig.obsBridge.url, appConfig.obsBridge.password || '')
            .catch(e => console.log('[obs-bridge] autoConnect FAIL:', e.message));
    }, 2000); // delay 2s để các hệ thống khác init xong
}

// ====== 📚 LUA Sync — fetch manifest từ hpvn.media/luas/, cache vào %APPDATA% ======
// Strategy C: thay thế Strategy B (manual copy). User chỉ cần add cached file vào OBS Scripts.
if (!appConfig.luaSync) {
    appConfig.luaSync = {
        manifestUrl: 'https://hpvn.media/luas/manifest.json',
        autoCheckEnabled: true,
        autoCheckIntervalSec: 300   // 5 phút
    };
}
const LUA_CACHE_DIR = path.join(
    process.env.APPDATA || require('os').homedir(),
    'hp-action-live', 'luas'
);
const luaSync = new LuaSync({
    cacheDir: LUA_CACHE_DIR,
    defaultManifestUrl: appConfig.luaSync.manifestUrl,
    isLicensed: () => Boolean(appConfig.license && appConfig.license.activated),
    logger: { log: (...args) => console.log('[lua-sync]', ...args) }
});
luaSync.on('updates_available', (updates) => {
    console.log(`[lua-sync] 📢 ${updates.length} update(s) available`);
    io.emit('luaSync:updatesAvailable', updates);
});
luaSync.on('downloaded', (data) => {
    io.emit('luaSync:downloaded', data);
});
// ====== OBS Settings sync (đồng bộ thông số LUA giữa các máy) ======
const obsSettings = new OBSSettings({
    logger: { log: (...args) => console.log('[obs-settings]', ...args) }
});

// Auto-check khi license đã activated + autoCheck enabled
if (appConfig.luaSync.autoCheckEnabled) {
    // Delay 5s sau startup để license validate xong
    setTimeout(() => {
        try { luaSync.startAutoCheck(appConfig.luaSync.autoCheckIntervalSec); }
        catch (e) { console.log('[lua-sync] autoCheck start FAIL:', e.message); }
    }, 5000);
}
const DEFAULT_LIVE_TRANSLATE_CONFIG = {
    enabled: false,
    sourceLang: 'auto',
    excludedSourceLang: '',
    targetLang: 'vi',
    ttsEnabled: true,
    ttsVoice: 'auto',
    ttsReadMode: 'nameAndComment',
    ttsCooldownSeconds: 4,
    ttsPriority: 'all',
    ttsPreset: 'auto',
    ttsVolume: 45,          // thang 0–200 (ttsVolumeVersion 2): 50 = mức to cũ, 100 = khuếch đại x2
    ttsVolumeVersion: 2,
    ttsRate: 1,
    // 'browser' = đọc bằng SpeechSynthesis của trình duyệt (mặc định, giọng đẹp)
    // 'remote'  = đọc bằng Google translate_tts (single voice, fallback)
    // → Chỉ chọn 1 trong 2 để tránh phát 2 tiếng đè nhau khi network race
    ttsSource: 'browser',
    // Đọc ở đâu: 'pc' = cửa sổ app đọc thẳng ra loa máy (khỏi cần overlay OBS), 'obs' = overlay Dịch OBS đọc.
    ttsPlayLocation: 'pc',
    aiFilterEnabled: true,
    blockSpecialChars: false,   // chặn bình luận có ký hiệu lạ / mở đầu bằng ký tự đặc biệt / spam ký hiệu
    ignoreIcons: true,
    cleanUnreadable: true,
    skipNumberOnlyComments: true, // bỏ bình luận chỉ toàn số ("1", "666", "2 2 2")
    stripNumbersForTTS: true,     // không đọc chữ số trong TTS
    readUsername: true,
    maxItems: 8,
    glossary: [],
    forbiddenWords: []
};
// Phụ đề giọng Creator — nghe bằng trang /listen/caption trong Edge/Chrome (xem lib/caption-listener.js).
const DEFAULT_CREATOR_CAPTION_CONFIG = {
    enabled: false,
    sourceLang: 'vi-VN',
    targetLang: 'en',
    targetLangs: ['en'],
    browser: 'edge',          // edge | chrome — trình duyệt mở cửa sổ nghe
    style: 'card',            // card (thẻ kính) | subtitle (phụ đề trắng viền đen)
    showOriginal: true,
    showInterim: true,        // hiện chữ đang nói (chưa dịch) trên OBS
    segmentSeconds: 6,        // nói liên tục quá N giây → trang nghe tự chốt câu để dịch sớm (0 = tắt, 3–15)
    autoStart: true,          // LIVE kết nối (và enabled) → tự mở cửa sổ nghe
    mode: 'auto',             // auto: nghe liên tục + tự ngắt câu | manual: bấm phím tắt nghe, bấm lại dừng rồi dịch
    hotkey: 'Control+Shift+L',// phím tắt toàn cục Nghe/Tạm dừng ('' = không đăng ký)
    paceLines: true,          // overlay giữ mỗi câu đủ lâu để đọc, câu mới xếp hàng
    background: true,         // chạy ngầm: thu nhỏ cửa sổ nghe sau khi đã có quyền micro
    micDevice: '',            // tên micro trang nghe dùng ('' = micro mặc định của Windows)
    voiceFilter: 'normal',    // off | normal | strong — lọc dải giọng + cổng chặn nhạc/âm thanh desktop lọt vào micro
    maxItems: 3,
    holdSeconds: 12,
    autoTargetsEnabled: true,
    autoTargetTimeoutSeconds: 60
};
const CREATOR_CAPTION_MAX_TARGETS = 5;
const LIVE_TRANSLATE_LANG_LABELS = {
    auto: 'Tự nhận diện',
    vi: 'Tiếng Việt',
    en: 'English',
    th: 'Thai',
    id: 'Indonesia',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    ru: 'Russian',
    pt: 'Portuguese',
    hi: 'Hindi',
    ar: 'Arabic',
    tr: 'Turkish',
    ms: 'Malay',
    fil: 'Filipino'
};
for (const gId of Object.keys(GAMES)) {
    if (!appConfig.games[gId]) appConfig.games[gId] = { ...GAMES[gId].defaultConfig };
}
// 🛵 Đường Về Quê — trò mới (kinh dị / trừ tà, Chủ nợ rượt, Xuống xe…) phải có trong danh sách quà của cấu hình ĐÃ LƯU:
// chỉ thêm quà gợi ý cho hành động CHƯA có khoá (streamer đã gán / đã xoá thì giữ nguyên), đổi khoá cũ banhchung → creditor.
(function migrateDuongVeQueGiftMap() {
    const c = appConfig.games.duongveque;
    if (!c) return;
    const map = c.dvqGiftMap && typeof c.dvqGiftMap === 'object' ? c.dvqGiftMap : (c.dvqGiftMap = {});
    if (map.banhchung && !map.creditor) map.creditor = map.banhchung;
    delete map.banhchung;
    for (const [act, list] of Object.entries(duongVeQueSuggestedGiftMap())) if (!(act in map)) map[act] = list;
})();
// Hũ Thủy Tinh — dọn key lạ. App ≤ v1.9.7 có lúc đổ nhầm config của game khác (Vote Bình Luận…)
// vào engine Hũ rồi lưu ngược lên server → app-config.json của Hũ lẫn title/rows/display… của game
// đó. Chỉ bỏ key KHÔNG thuộc Hũ mà lại là key mặc định của một game khác; key Hũ hợp lệ giữ nguyên.
const THUYTINH_CONFIG_KEYS = new Set([
    'enabled', 'jar', 'gift', 'physics', 'jarVisible', 'jarLocked', 'maxCapacity', 'history', 'features',
    'goal', 'goalBarGap', 'autoShakeAt', 'randomEventEverySec', 'thiefEverySec', 'thiefMissRate',
    'policeCatchRate', 'policeBanSec', 'policeName', 'triggers', 'effects', 'panelPositions', 'panelScales',
    'actorScales', 'jarAccessory', 'jarTheme', 'jarSkin', 'jarTexts', 'badges', 'topHangers', 'webmFxVolume'
]);
function cleanThuyTinhConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return [];
    const foreign = new Set();
    for (const [gid, g] of Object.entries(GAMES)) {
        if (gid === 'thuytinh' || !g.defaultConfig || typeof g.defaultConfig !== 'object') continue;
        for (const k of Object.keys(g.defaultConfig)) if (!THUYTINH_CONFIG_KEYS.has(k)) foreign.add(k);
    }
    const removed = Object.keys(cfg).filter(k => foreign.has(k));
    for (const k of removed) delete cfg[k];
    return removed;
}
{
    const removed = cleanThuyTinhConfig(appConfig.games.thuytinh);
    if (removed.length) {
        console.log(`[thuytinh] Dọn ${removed.length} key lạ lẫn vào config Hũ: ${removed.join(', ')}`);
        saveAppConfig();
    }
}
// Migrate vipwelcome config từ schema cũ (single profile) sang multi-profile.
if (appConfig.games.vipwelcome) {
    appConfig.games.vipwelcome = migrateVipWelcomeConfig(appConfig.games.vipwelcome);
}
// Backfill bancung defaults — khi thêm key mới (display + top-level freeFire*) vào defaultConfig,
// config cũ đã save không có → merge default vào cho user. Saved values take priority.
if (appConfig.games.chemtraicay) {
    const def = makeDefaultChemTraiCayConfig();
    for (const k of Object.keys(def)) {
        if (!(k in appConfig.games.chemtraicay)) appConfig.games.chemtraicay[k] = def[k];
    }
    appConfig.games.chemtraicay.videoSource = { ...def.videoSource, ...(appConfig.games.chemtraicay.videoSource || {}) };
    appConfig.games.chemtraicay.obsScene = { ...def.obsScene, ...(appConfig.games.chemtraicay.obsScene || {}) };
    appConfig.games.chemtraicay.display = { ...def.display, ...(appConfig.games.chemtraicay.display || {}) };
}
// Đập Muỗi: chuẩn hoá config cũ (khoá thiếu/rác → mặc định, actions/giftRules đúng dạng).
// TẶNG BAO NHIÊU CHẠY BẤY NHIÊU (user 29/10/2026): máy còn đúng trần mặc định cũ (Chém Trái Cây 30 quả, Đập Muỗi 100 muỗi mỗi
// lần quà, hàng chờ Đá Cầu 10 quả) → nâng lên mặc định mới để combo ×N chạy đủ N lần. Một lần (cờ camgames.comboV — để ở
// Game Camera vì normalizeConfig của từng game bỏ khoá lạ); streamer tự đặt lại sau đó thì giữ.
{
    const cam = appConfig.games.camgames = appConfig.games.camgames || {};
    if (!(Number(cam.comboV) >= 1)) {
        for (const [id, key, oldV, newV] of [['chemtraicay', 'maxPerGift', 30, 999], ['dapmuoi', 'maxPerGift', 100, 1000], ['dacau', 'queueMax', 10, 999]]) {
            const c = appConfig.games[id];
            if (c && Number(c[key]) === oldV) c[key] = newV;
        }
        cam.comboV = 1;
        saveAppConfig();
    }
}
if (appConfig.games.dapmuoi) appConfig.games.dapmuoi = DapMuoi.normalizeConfig(appConfig.games.dapmuoi);
if (appConfig.games.dacau) appConfig.games.dacau = DaCau.normalizeConfig(appConfig.games.dacau);
// 🎥 Bộ quà mẫu Game Camera (lib/camgames-gift-seed.js): một lần, chỉ điền game còn trống quà.
try {
    const seeded = require('./lib/camgames-gift-seed').applyGiftSeed(appConfig.games,
        id => GAMES[id] ? JSON.parse(JSON.stringify(GAMES[id].defaultConfig)) : null);
    if (seeded.length) { console.log('[camgames] gieo quà mẫu:', seeded.join(', ')); saveAppConfig(); }
} catch (e) { console.warn('[camgames] gieo quà mẫu lỗi:', e?.message || e); }
if (camGamesApplyActive()) saveAppConfig();
// Bản 906d73c..4c68a00 lỡ để hub ghi enabled=false cho Level Quest → bật lại lúc khởi động. Level Quest không đọc cờ
// này (chỉ Khởi động nhanh hiển thị) nên luôn để bật là đúng sự thật.
if (appConfig.games['level-quest'] && appConfig.games['level-quest'].enabled === false) { appConfig.games['level-quest'].enabled = true; saveAppConfig(); }
// Nguồn camera chung: config cũ chưa đặt ở Game Camera → lấy nguồn mà game camera từng chọn.
if (!appConfig.games.camgames.source) {
    const G = appConfig.games, vs = G.chemtraicay?.videoSource || {};
    const pick = [
        G.touchplay?.tpCfg?.obsSource,
        (vs.mode || 'obs-source') === 'obs-source' ? vs.source : '',
        G.bancung?.display?.bodyTrack === true ? G.bancung.display.trackSource : ''
    ].find(s => typeof s === 'string' && s.trim());
    if (pick) { appConfig.games.camgames.source = pick.slice(0, 200); saveAppConfig(); }
}
if (appConfig.games.bancung) {
    const def = makeDefaultBanCungConfig();
    appConfig.games.bancung.display = { ...def.display, ...(appConfig.games.bancung.display || {}) };
    // Top-level keys mới (vd freeFire*) — chỉ thêm key thiếu, không overwrite
    for (const k of Object.keys(def)) {
        if (k !== 'display' && !(k in appConfig.games.bancung)) {
            appConfig.games.bancung[k] = def[k];
        }
    }
}
// Backfill nhietdo display defaults (gift list keys mới)
if (appConfig.games.nhietdo) {
    const def = makeDefaultNhietDoConfig();
    appConfig.games.nhietdo.display = { ...def.display, ...(appConfig.games.nhietdo.display || {}) };
}
if (appConfig.games.nhatla) {
    const def = makeDefaultNhatLaConfig();
    appConfig.games.nhatla.display = { ...def.display, ...(appConfig.games.nhatla.display || {}) };
    appConfig.games.nhatla.drop = { ...def.drop, ...(appConfig.games.nhatla.drop || {}) };
    appConfig.games.nhatla.effects = { ...def.effects, ...(appConfig.games.nhatla.effects || {}) };
    // Config lưu từ bản trước v1.7.1 chưa có khối wind — merge để panel không đọc undefined.
    appConfig.games.nhatla.wind = { ...def.wind, ...(appConfig.games.nhatla.wind || {}) };
    // Tương tự cho khối autoClean (hành động CỨU) thêm ở bản sau.
    appConfig.games.nhatla.autoClean = { ...def.autoClean, ...(appConfig.games.nhatla.autoClean || {}) };
    appConfig.games.nhatla.tornado = { ...def.tornado, ...(appConfig.games.nhatla.tornado || {}) };
    // Khối TOP người tặng lá thêm ở bản sau — merge để panel không đọc undefined.
    appConfig.games.nhatla.topDonors = { ...def.topDonors, ...(appConfig.games.nhatla.topDonors || {}) };
    // GIẢI CỨU: phải chuyển NGAY Ở SERVER lúc khởi động, không được chờ panel.
    // normalizeConfig (public/games/nhatla/game.js) cũng biết chuyển, nhưng đó là file CLIENT
    // — server không nạp. Ai không mở tab Nhặt Lá thì config trên đĩa mãi ở dạng cũ, trong khi
    // đường phát quà đã chuyển hẳn sang cfg.rescue.actions, nên TOÀN BỘ quà gió/lốc/cứu đang
    // cài sẽ lặng lẽ ngừng chạy. Chuyển ở đây thì bật app lên là đúng ngay.
    migrateNhatLaRescue(appConfig.games.nhatla);
}
if (appConfig.games.trongcay) {
    const def = makeDefaultTrongCayConfig();
    appConfig.games.trongcay.display = { ...def.display, ...(appConfig.games.trongcay.display || {}) };
    for (const k of Object.keys(def)) {
        if (k !== 'display' && !(k in appConfig.games.trongcay)) appConfig.games.trongcay[k] = def[k];
    }
    if ((Number(appConfig.games.trongcay.schemaVersion) || 1) < 2) {
        appConfig.games.trongcay.schemaVersion = 2;
        appConfig.games.trongcay.initialHeight = 0;
    }
    if ((Number(appConfig.games.trongcay.schemaVersion) || 1) < 3) {
        appConfig.games.trongcay.schemaVersion = 3;
        // Trái rải nhiều chùm → nâng trần trái nếu user vẫn để mặc định cũ (12). Người tự chỉnh thì giữ.
        if ((Number(appConfig.games.trongcay.maxFruitsPerPlant) || 0) <= 12) appConfig.games.trongcay.maxFruitsPerPlant = 24;
    }
}
// Mỗi lần mở app → các game có "phiên" (session) về DỪNG, buộc bấm ▶ Bắt đầu mới chạy.
// Khắc phục triệu chứng popup Khởi động nhanh "tự hiển thị Đang chạy" do config cũ lưu sessionActive:true.
for (const gId of ['nhietdo', 'bancung', 'trongcay']) {
    if (appConfig.games[gId]) appConfig.games[gId].sessionActive = false;
}
// Thang âm lượng TTS mới (theo HP NPC LIVE): 0–200, 50 = mức to nhất cũ, >50 khuếch đại qua WebAudio.
// Config/backup cũ (thang 0–100, chưa có ttsVolumeVersion) → chia đôi để giữ nguyên độ to khách đã chọn.
function migrateLiveTranslateVolume(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    if (Number(src.ttsVolumeVersion) >= 2) return src;
    const oldVolume = Number(src.ttsVolume);
    return { ...src, ttsVolume: Number.isFinite(oldVolume) ? Math.round(oldVolume / 2) : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsVolume, ttsVolumeVersion: 2 };
}
appConfig.liveTranslate = (() => {
    const raw = migrateLiveTranslateVolume(appConfig.liveTranslate);
    return {
        ...DEFAULT_LIVE_TRANSLATE_CONFIG,
        ...raw,
        glossary: Array.isArray(raw.glossary) ? raw.glossary : [],
        forbiddenWords: Array.isArray(raw.forbiddenWords) ? raw.forbiddenWords : []
    };
})();
if (appConfig.liveTranslate.manualStartVersion !== 1) {
    appConfig.liveTranslate.enabled = false;
    appConfig.liveTranslate.manualStartVersion = 1;
}
appConfig.creatorCaption = sanitizeCreatorCaptionConfig(appConfig.creatorCaption || {});

// ====== Mạng (⚙ Cài đặt → OBS & Overlay) ======
// { lanAccess: false → chỉ 127.0.0.1; true → 0.0.0.0, máy khác chỉ ĐỌC, GHI cần header X-HP-Token = token }
// Token 32 hex sinh 1 lần khi trống (lưu ngay để giữ nguyên qua các lần mở app).
if (!appConfig.network || typeof appConfig.network !== 'object') {
    // Nâng cấp từ bản chưa có mục network: giữ hành vi cũ (lắng nghe 0.0.0.0) để OBS trên PC stream
    // khác không đen ngay sau khi cập nhật — GHI từ LAN giờ đã cần token nên vẫn an toàn hơn bản cũ.
    // Cài mới → chỉ 127.0.0.1, bật "Cho máy khác trong LAN" ở ⚙ Cài đặt khi cần.
    appConfig.network = { lanAccess: APP_CONFIG_EXISTED_AT_LOAD, token: '' };
    if (APP_CONFIG_EXISTED_AT_LOAD) console.log('[server] Nâng cấp: giữ "Cho máy khác trong LAN" = BẬT như bản cũ — tắt trong ⚙ Cài đặt nếu OBS chạy cùng máy.');
}
appConfig.network.lanAccess = appConfig.network.lanAccess === true;
if (!/^[0-9a-f]{32}$/i.test(String(appConfig.network.token || ''))) {
    appConfig.network.token = crypto.randomBytes(16).toString('hex');
    try { saveAppConfig(); } catch (e) { console.warn('[server] Không lưu được token mạng:', e.message); }
}
// Chốt host bind lúc khởi động — đổi công tắc LAN trong ⚙ Cài đặt chỉ có hiệu lực sau khi mở lại app.
const NETWORK_LAN_ACCESS_AT_START = appConfig.network.lanAccess;
const BIND_HOST = HP_BIND_HOST_ENV || (NETWORK_LAN_ACCESS_AT_START ? '0.0.0.0' : '127.0.0.1');

// ====== SEED media PK cho bản cài mới ======
// Bản đóng gói: userData/data/pktiktok-assets trống khi cài mới → PK không có âm/video.
// Copy media mẫu từ seed/ (bundle qua extraResources, dò bằng bundledResourcePath) rồi gán
// sẵn 13 sự kiện nếu config PK còn TRẮNG media. Non-destructive: chỉ copy file thiếu, chỉ gán
// khi CHƯA có event nào có media → không đụng máy user đã tự gán.
function seedPktiktokMediaIfNeeded() {
    try {
        const seedDir = bundledResourcePath('seed', 'pktiktok-assets');
        if (!seedDir || !fs.existsSync(seedDir)) return;
        const destDir = path.join(DATA_DIR, 'pktiktok-assets');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        for (const fn of fs.readdirSync(seedDir)) {
            const dest = path.join(destDir, fn);
            if (!fs.existsSync(dest)) {
                try { fs.copyFileSync(path.join(seedDir, fn), dest); } catch (e) {}
            }
        }
        const pk = appConfig.games && appConfig.games.pktiktok;
        if (!pk || !Array.isArray(pk.events)) return;
        if (pk.events.some(e => e && e.mediaUrl)) return; // user đã có media → giữ nguyên
        const manifestPath = bundledResourcePath('seed', 'pktiktok-seed.json');
        if (!manifestPath || !fs.existsSync(manifestPath)) return;
        const seed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const byKey = new Map((Array.isArray(seed) ? seed : []).map(s => [s.key, s]));
        let seeded = 0;
        for (const ev of pk.events) {
            const s = byKey.get(ev.key);
            if (!s || !s.mediaFile) continue;
            if (!fs.existsSync(path.join(destDir, s.mediaFile))) continue; // chỉ gán khi file thật đã có
            ev.mediaUrl = `/api/games/pktiktok/asset/${s.mediaFile}`;
            ev.mediaName = s.mediaName || ev.mediaName || '';
            ev.mediaType = s.mediaType || ev.mediaType || '';
            if (typeof s.volume === 'number') ev.volume = s.volume;
            seeded++;
        }
        if (seeded) console.log(`[pktiktok] Seed media bản cài mới: gán ${seeded} sự kiện.`);
    } catch (e) {
        console.warn('[pktiktok] seed media lỗi (bỏ qua):', e.message);
    }
}
seedPktiktokMediaIfNeeded();

saveAppConfig();

// ====== Live Translate MVP ======
const translationCache = new Map();
const TRANSLATION_CACHE_LIMIT = 500;
const COMMENT_RULES_SHEET_ID = '1Fv9Jdno_pPMTx_-tnwSfRObm1r1wKds_gaMBnfCDm4M';
const COMMENT_RULES_GID = '211090113';
const COMMENT_RULES_REFRESH_MS = 5 * 60 * 1000;
let commentSheetRules = { forbiddenWords: [], glossary: [], loadedAt: 0, error: '' };
// 🚫 Từ cấm CHUNG cho mọi game (cột A sheet trên): bình luận dính từ cấm không phát 'chat' cho overlay nào
// (không game nào đọc / hiển thị) — xem lib/comment-filter.js. Bật/tắt: ⚙ Cài đặt → appConfig.commentFilter.
let commentForbidden = null;
let commentForbiddenKey = '';
const commentFilterStats = { blocked: 0, lastWord: '', lastAt: 0, maskedNames: 0 };
const COMMENT_RULES_CACHE_FILE = () => path.join(DATA_DIR, 'comment-rules-cache.json');
/** Danh sách đổi (tải sheet / dùng bản lưu) → dựng lại bộ so khớp ở lần dùng tới. */
function setCommentForbidden() { commentForbiddenKey = ''; }
/**
 * Bộ so khớp từ cấm DÙNG CHUNG cho mọi game + Dịch Thuật LIVE: cột A sheet + từ người dùng tự thêm ở Dịch Thuật.
 * Dựng lại khi một trong hai đổi (so đúng dấu — lib/comment-filter.js).
 */
function getCommentForbidden() {
    const ownRaw = appConfig.liveTranslate?.forbiddenWords;
    const own = Array.isArray(ownRaw) ? ownRaw : (typeof ownRaw === 'string' ? ownRaw.split(/\r?\n|,/) : []);
    const sheet = commentSheetRules.forbiddenWords || [];
    const key = `${commentSheetRules.loadedAt}|${sheet.length}|${own.join('\n')}`;
    if (key !== commentForbiddenKey) {
        commentForbidden = CommentFilter.compileForbidden([...sheet, ...own]);
        commentForbiddenKey = key;
    }
    return commentForbidden;
}
function commentFilterOn() { return appConfig.commentFilter?.enabled !== false; }
function commentFilterMasksNames() { return commentFilterOn() && appConfig.commentFilter?.maskNames !== false; }
/** Tên người xem dính từ cấm → che bằng *** ngay khi đọc gói TikTok: mọi game / tính năng nhận tên đã che. */
function maskViewerName(name) {
    if (!name || !commentFilterMasksNames()) return name;
    const masked = CommentFilter.maskForbidden(name, getCommentForbidden());
    if (masked.includes('***') && !String(name).includes('***')) commentFilterStats.maskedNames += 1;
    return masked;
}
const liveTranslateRecentGifts = new Map();
const liveTranslateRecentMembers = new Map();
const liveTranslateLastSpoken = new Map();
const LIVE_TRANSLATE_PRIORITY_WINDOW_MS = 10 * 60 * 1000;
const LIVE_TRANSLATE_TEST_PHRASE = 'HP Media xin chào, đây là giọng đọc thử bằng tiếng Việt.';
const LIVE_TRANSLATE_TTS_PRESETS = {
    auto: { lang: '', label: 'Tự chọn' },
    vi: { lang: 'vi', label: 'Giọng Việt' },
    en: { lang: 'en', label: 'English voice' },
    zh: { lang: 'zh', label: 'Chinese voice' },
    ko: { lang: 'ko', label: 'Korean voice' },
    ja: { lang: 'ja', label: 'Japanese voice' }
};
const LIVE_TRANSLATE_TOXIC_PATTERNS = [
    /\b(dm|dmm|dit|djt|clm|vl|vcl|cc|lon|cac|buoi)\b/i,
    /\b(fuck|shit|bitch|asshole|cunt|dick|pussy)\b/i,
    /\b(kill yourself|kys|die|tự tử|tu tu|chết đi|chet di)\b/i,
    /\b(ngu|oc cho|óc chó|súc vật|suc vat|đồ chó|do cho)\b/i
];
const liveTranslateStats = {
    chatSeen: 0,
    skippedDisabled: 0,
    skippedEmpty: 0,
    skippedBlocked: 0,
    skippedToxic: 0,
    skippedSpecialChar: 0,
    skippedNumberSpam: 0,
    skippedExcludedLanguage: 0,
    emitted: 0,
    translateErrors: 0,
    lastChatAt: 0,
    lastEmitAt: 0,
    lastSkipReason: '',
    lastBlockedWord: '',
    lastError: ''
};

let liveDashboardState = {
    connected: false,
    username: '',
    roomId: '',
    stats: {},
    lastGift: null,
    lastTranslatedComment: null,
    updatedAt: Date.now()
};

function emitLiveDashboard() {
    liveDashboardState = { ...liveDashboardState, stats: { ...liveStats }, updatedAt: Date.now() };
    io.emit('liveDashboard', liveDashboardState);
}

function setLiveDashboardStatus(connected, extra = {}) {
    liveDashboardState = {
        ...liveDashboardState,
        connected: !!connected,
        username: extra.username ?? currentUsername ?? '',
        roomId: extra.roomId ?? currentRoomId ?? '',
        updatedAt: Date.now()
    };
    emitLiveDashboard();
}

function setLiveDashboardGift(gift) {
    liveDashboardState.lastGift = gift ? {
        nickname: gift.nickname || gift.uniqueId || '',
        uniqueId: gift.uniqueId || '',
        giftName: gift.giftName || gift.sheetItem?.name || '',
        image: gift.image || gift.giftPicture || '',
        repeatCount: gift.repeatCount || 1,
        diamond: gift.coinValue || gift.diamondCount || 0,
        ts: Date.now()
    } : null;
    emitLiveDashboard();
}

function setLiveDashboardTranslatedComment(item) {
    liveDashboardState.lastTranslatedComment = item ? {
        nickname: item.nickname || item.uniqueId || '',
        uniqueId: item.uniqueId || '',
        originalText: item.originalText || '',
        translatedText: item.translatedText || '',
        targetLangLabel: item.targetLangLabel || '',
        toxic: !!item.toxic,
        ts: Date.now()
    } : null;
    emitLiveDashboard();
}

function normalizeModerationText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

async function loadCommentRulesSheet() {
    const url = `https://docs.google.com/spreadsheets/d/${COMMENT_RULES_SHEET_ID}/export?format=csv&gid=${COMMENT_RULES_GID}`;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`comment_rules_http_${res.status}`);
    const csv = await res.text();
    const rows = parseCsvSimple(csv);
    const forbiddenWords = [];
    const glossary = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const blocked = String(r[0] || '').trim();
        const from = String(r[2] || '').trim();
        const to = String(r[3] || '').trim();
        if (blocked) forbiddenWords.push(blocked);
        if (from && to) glossary.push(`${from}=${to}`);
    }
    commentSheetRules = { forbiddenWords, glossary, loadedAt: Date.now(), error: '' };
    setCommentForbidden(forbiddenWords);
    // nhớ bản tải được gần nhất: mở app lúc mất mạng / Google lỗi vẫn lọc được từ cấm
    try { fs.writeFileSync(COMMENT_RULES_CACHE_FILE(), JSON.stringify({ forbiddenWords, glossary, loadedAt: commentSheetRules.loadedAt })); } catch (e) {}
    io.emit('translate:rules', getCommentRulesMeta());
    console.log(`[comment-rules] Đã tải ${forbiddenWords.length} từ cấm, ${glossary.length} cụm thay thế.`);
    return commentSheetRules;
}

function getCommentRulesMeta() {
    return {
        forbiddenCount: commentSheetRules.forbiddenWords.length,
        glossaryCount: commentSheetRules.glossary.length,
        loadedAt: commentSheetRules.loadedAt,
        error: commentSheetRules.error || ''
    };
}

async function refreshCommentRulesSheet() {
    try { return await loadCommentRulesSheet(); }
    catch (e) {
        if (!commentSheetRules.loadedAt) {
            try {
                const c = JSON.parse(fs.readFileSync(COMMENT_RULES_CACHE_FILE(), 'utf8'));
                commentSheetRules = { forbiddenWords: c.forbiddenWords || [], glossary: c.glossary || [], loadedAt: Number(c.loadedAt) || 0, error: '' };
                setCommentForbidden(commentSheetRules.forbiddenWords);
                console.warn(`[comment-rules] Dùng bản lưu: ${commentSheetRules.forbiddenWords.length} từ cấm.`);
            } catch (e2) {}
        }
        commentSheetRules.error = e.message || 'comment_rules_failed';
        io.emit('translate:rules', getCommentRulesMeta());
        console.warn('[comment-rules] Không tải được quy tắc:', commentSheetRules.error);
        return commentSheetRules;
    }
}

function sanitizeLiveTranslateConfig(input) {
    const cfg = { ...DEFAULT_LIVE_TRANSLATE_CONFIG, ...(input || {}) };
    cfg.enabled = cfg.enabled === true;
    cfg.ttsEnabled = !!cfg.ttsEnabled;
    cfg.ignoreIcons = cfg.ignoreIcons !== false;
    cfg.cleanUnreadable = cfg.cleanUnreadable !== false;
    cfg.aiFilterEnabled = cfg.aiFilterEnabled !== false;
    cfg.blockSpecialChars = cfg.blockSpecialChars === true;
    cfg.skipNumberOnlyComments = cfg.skipNumberOnlyComments !== false;
    cfg.stripNumbersForTTS = cfg.stripNumbersForTTS !== false;
    cfg.ttsPlayLocation = ['obs', 'pc'].includes(cfg.ttsPlayLocation) ? cfg.ttsPlayLocation : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsPlayLocation;
    cfg.readUsername = cfg.readUsername !== false;
    cfg.sourceLang = String(cfg.sourceLang || 'auto').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'auto';
    cfg.excludedSourceLang = String(cfg.excludedSourceLang || '').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12);
    if (cfg.excludedSourceLang === 'auto') cfg.excludedSourceLang = '';
    cfg.targetLang = String(cfg.targetLang || 'vi').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'vi';
    cfg.ttsVoice = ['auto', 'male', 'female', 'random', 'randomGender', 'variant1', 'variant2', 'variant3', 'variant4', 'variant5'].includes(cfg.ttsVoice) ? cfg.ttsVoice : 'auto';
    // ttsSource: 'browser' (mặc định) hoặc 'remote' — chống phát 2 tiếng đè
    cfg.ttsSource = ['browser', 'remote'].includes(cfg.ttsSource) ? cfg.ttsSource : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsSource;
    cfg.ttsPreset = Object.prototype.hasOwnProperty.call(LIVE_TRANSLATE_TTS_PRESETS, cfg.ttsPreset) ? cfg.ttsPreset : 'auto';
    cfg.ttsReadMode = ['nameAndComment', 'commentOnly', 'nameOnly'].includes(cfg.ttsReadMode) ? cfg.ttsReadMode : (cfg.readUsername === false ? 'commentOnly' : 'nameAndComment');
    cfg.ttsPriority = ['all', 'gifters', 'members', 'giftersOrMembers'].includes(cfg.ttsPriority) ? cfg.ttsPriority : 'all';
    const cooldown = parseInt(cfg.ttsCooldownSeconds, 10);
    cfg.ttsCooldownSeconds = Math.max(0, Math.min(60, Number.isFinite(cooldown) ? cooldown : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsCooldownSeconds));
    const volume = parseInt(cfg.ttsVolume, 10);
    cfg.ttsVolume = Math.max(0, Math.min(200, Number.isFinite(volume) ? volume : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsVolume));
    cfg.ttsVolumeVersion = 2; // mọi giá trị đi qua đây đã ở thang mới — đừng để lượt boot sau chia đôi lần nữa
    const rate = parseFloat(cfg.ttsRate);
    cfg.ttsRate = Math.max(0.5, Math.min(2, Number.isFinite(rate) ? rate : DEFAULT_LIVE_TRANSLATE_CONFIG.ttsRate));
    cfg.maxItems = Math.max(3, Math.min(20, parseInt(cfg.maxItems, 10) || DEFAULT_LIVE_TRANSLATE_CONFIG.maxItems));
    if (typeof cfg.glossary === 'string') cfg.glossary = cfg.glossary.split(/\r?\n/);
    cfg.glossary = (Array.isArray(cfg.glossary) ? cfg.glossary : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 300);
    if (typeof cfg.forbiddenWords === 'string') cfg.forbiddenWords = cfg.forbiddenWords.split(/\r?\n|,/);
    cfg.forbiddenWords = (Array.isArray(cfg.forbiddenWords) ? cfg.forbiddenWords : []).map(w => String(w || '').trim()).filter(Boolean).slice(0, 300);
    return cfg;
}

// Trả object CHỈ gồm các khoá của DEFAULT_CREATOR_CAPTION_CONFIG — khoá cũ trong file config của
// khách (whisperLocalExe, silenceSeconds…) bị bỏ, không lan ra overlay/popup.
function sanitizeCreatorCaptionConfig(input) {
    const src = (input && typeof input === 'object') ? input : {};
    const d = DEFAULT_CREATOR_CAPTION_CONFIG;
    const cfg = {};
    cfg.enabled = src.enabled === true;
    cfg.sourceLang = String(src.sourceLang || d.sourceLang).trim().replace(/[^a-zA-Z-]/g, '').slice(0, 12) || d.sourceLang;
    const allowed = Object.keys(LIVE_TRANSLATE_LANG_LABELS).filter(x => x !== 'auto');
    const rawTargets = Array.isArray(src.targetLangs) ? src.targetLangs : [src.targetLang];
    cfg.targetLangs = [...new Set(rawTargets
        .map(x => String(x || '').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12))
        .filter(x => allowed.includes(x)))].slice(0, CREATOR_CAPTION_MAX_TARGETS);
    if (!cfg.targetLangs.length) cfg.targetLangs = [d.targetLang];
    cfg.targetLang = cfg.targetLangs[0];
    cfg.browser = CaptionListener.normalizeBrowser(src.browser != null ? src.browser : d.browser);
    cfg.style = src.style === 'subtitle' ? 'subtitle' : 'card';
    cfg.showOriginal = src.showOriginal !== false;
    cfg.showInterim = src.showInterim !== false;
    const seg = src.segmentSeconds == null ? d.segmentSeconds : parseInt(src.segmentSeconds, 10);
    cfg.segmentSeconds = !Number.isFinite(seg) ? d.segmentSeconds : seg <= 0 ? 0 : Math.max(3, Math.min(15, seg));
    // Config cũ (trước v1.15: chưa có khoá browser) mà enabled=true thường do khách bấm "Test phụ đề" → KHÔNG tự mở
    // cửa sổ Edge mỗi buổi; config mới/khoá có sẵn thì theo giá trị.
    cfg.autoStart = src.autoStart == null ? !(src.browser == null && src.enabled === true) : src.autoStart !== false;
    cfg.mode = src.mode === 'manual' ? 'manual' : 'auto';
    cfg.hotkey = CaptionListener.normalizeHotkey(src.hotkey == null ? d.hotkey : src.hotkey);
    cfg.paceLines = src.paceLines !== false;
    cfg.background = src.background !== false;
    cfg.micDevice = String(src.micDevice == null ? d.micDevice : src.micDevice).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
    cfg.voiceFilter = ['off', 'normal', 'strong'].includes(src.voiceFilter) ? src.voiceFilter : d.voiceFilter;
    cfg.maxItems = Math.max(1, Math.min(6, parseInt(src.maxItems, 10) || d.maxItems));
    cfg.holdSeconds = Math.max(3, Math.min(30, parseInt(src.holdSeconds, 10) || d.holdSeconds));
    cfg.autoTargetsEnabled = src.autoTargetsEnabled !== false;
    cfg.autoTargetTimeoutSeconds = Math.max(5, Math.min(3600, parseInt(src.autoTargetTimeoutSeconds, 10) || d.autoTargetTimeoutSeconds));
    return cfg;
}

function sourceLangForTranslate(lang) {
    const short = String(lang || '').toLowerCase().split('-')[0];
    return short || 'auto';
}

let lastCreatorCaptionNorm = '';
let lastCreatorCaptionAt = 0;
function normalizeCaptionDedupeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[\s\p{P}\p{S}]+/gu, ' ')
        .trim();
}
function bundledResourcePath(...parts) {
    const roots = [__dirname];
    if (process.resourcesPath && process.resourcesPath !== __dirname) roots.push(process.resourcesPath);
    for (const root of roots) {
        const p = path.join(root, ...parts);
        if (fs.existsSync(p)) return p;
    }
    return '';
}

function isLiveTranslateExcludedSource(detectedLang, cfg) {
    const excluded = sourceLangForTranslate(cfg.excludedSourceLang);
    if (!excluded || excluded === 'auto') return false;
    return sourceLangForTranslate(detectedLang) === excluded;
}

async function processCreatorCaptionSpeech(payload) {
    // Ngôn ngữ đích lấy từ cấu hình (popup đã lưu khi "tự bật theo người xem" đổi); trang nghe chỉ
    // gửi câu + ngôn ngữ nó đang nghe.
    const cfg = sanitizeCreatorCaptionConfig(appConfig.creatorCaption);
    if (payload?.sourceLang) {
        cfg.sourceLang = sanitizeCreatorCaptionConfig({ ...cfg, sourceLang: payload.sourceLang }).sourceLang;
    }
    if (!cfg.enabled) return;
    const originalText = String(payload?.text || '').trim().replace(/\s{2,}/g, ' ').slice(0, 450);
    if (!originalText) return;
    // Chromium có thể phát lại cùng câu final sau khi tự start() lại → bỏ câu trùng trong 30s.
    const norm = normalizeCaptionDedupeText(originalText);
    const now = Date.now();
    if (norm && norm === lastCreatorCaptionNorm && (now - lastCreatorCaptionAt) < 30000) return;
    lastCreatorCaptionNorm = norm;
    lastCreatorCaptionAt = now;
    try {
        const srcShort = sourceLangForTranslate(cfg.sourceLang);
        const translations = await Promise.all(cfg.targetLangs.map(async targetLang => {
            // Đích trùng ngôn ngữ đang nói (vd "tự bật theo người xem" thêm vi khi Creator nói tiếng Việt):
            // dùng nguyên câu gốc — dịch vi→vi làm Google trả rỗng rồi MyMemory trả thông báo lỗi.
            if (targetLang === srcShort) {
                return { targetLang, targetLangLabel: liveTranslateLangLabel(targetLang), translatedText: originalText, sourceLang: srcShort, sourceLangLabel: liveTranslateLangLabel(srcShort) };
            }
            // Bộ tự dịch NÉM LỖI khi cả 3 bậc hỏng → chỉ ngôn ngữ đó hiện nguyên văn, các ngôn ngữ khác vẫn có bản dịch.
            let result;
            try { result = await translateTextToTarget(originalText, srcShort, targetLang); }
            catch (e) {
                console.warn('[creator-caption] dịch', targetLang, 'lỗi:', e?.message || e);
                return { targetLang, targetLangLabel: liveTranslateLangLabel(targetLang), translatedText: originalText, sourceLang: srcShort, sourceLangLabel: liveTranslateLangLabel(srcShort), error: e?.message || 'translate_failed' };
            }
            return {
                targetLang,
                targetLangLabel: liveTranslateLangLabel(targetLang),
                translatedText: result.translatedText,
                sourceLang: result.detectedLang || sourceLangForTranslate(cfg.sourceLang),
                sourceLangLabel: liveTranslateLangLabel(result.detectedLang || sourceLangForTranslate(cfg.sourceLang))
            };
        }));
        const first = translations[0] || {};
        io.emit('creatorCaption:line', {
            id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'),
            originalText,
            translatedText: first.translatedText || originalText,
            translations,
            sourceLang: first.sourceLang || sourceLangForTranslate(cfg.sourceLang),
            targetLang: first.targetLang || cfg.targetLang,
            sourceLangLabel: first.sourceLangLabel || liveTranslateLangLabel(sourceLangForTranslate(cfg.sourceLang)),
            targetLangLabel: first.targetLangLabel || liveTranslateLangLabel(cfg.targetLang),
            showOriginal: cfg.showOriginal,
            style: cfg.style,
            maxItems: cfg.maxItems,
            holdSeconds: cfg.holdSeconds,
            createTime: Date.now()
        });
    } catch (e) {
        io.emit('creatorCaption:line', {
            id: crypto.randomBytes(12).toString('hex'),
            originalText,
            translatedText: originalText,
            translations: cfg.targetLangs.map(targetLang => ({ targetLang, targetLangLabel: liveTranslateLangLabel(targetLang), translatedText: originalText })),
            sourceLang: sourceLangForTranslate(cfg.sourceLang),
            targetLang: cfg.targetLang,
            sourceLangLabel: liveTranslateLangLabel(sourceLangForTranslate(cfg.sourceLang)),
            targetLangLabel: liveTranslateLangLabel(cfg.targetLang),
            showOriginal: cfg.showOriginal,
            style: cfg.style,
            maxItems: cfg.maxItems,
            holdSeconds: cfg.holdSeconds,
            error: e?.message || 'caption_translate_failed',
            createTime: Date.now()
        });
    }
}

function applyLiveTranslateGlossary(text, glossary) {
    let out = String(text || '');
    for (const row of glossary || []) {
        const parts = String(row).split(/=>|=/);
        if (parts.length < 2) continue;
        const from = parts.shift().trim();
        const to = parts.join('=').trim();
        if (!from || !to) continue;
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(escaped, 'gi'), to);
    }
    return out;
}

function stripLiveTranslateIcons(text) {
    return String(text || '')
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// Bình luận chỉ toàn số (sau khi bỏ icon + dấu/ký hiệu): "1", "666", "2 2 2", "10/10" → spam, không dịch/đọc.
function isLiveTranslateNumberOnlyComment(text) {
    const compact = stripLiveTranslateIcons(text).replace(/[\s.,:;!?"'`~+\-*/\\_|()[\]{}<>=%$€£¥₫#@&]+/gu, '');
    return !!compact && /^[\p{N}]+$/u.test(compact);
}

// Dấu câu / ký hiệu ASCII thông dụng — không tính là "lạ", nhưng vẫn tính khi xét
// bắt đầu bằng ký tự đặc biệt hoặc quá nhiều ký tự đặc biệt trong một dòng.
// Kèm dấu câu Trung/Nhật/Hàn + toàn khổ (、。！？「」…): thiếu chúng thì MỌI câu tiếng Nhật/Trung có dấu phẩy bị chặn oan.
const LIVE_TRANSLATE_COMMON_SPECIALS = new Set([...'.,!?;:\'"()[]{}<>-–—_/\\|@#$%^&*+=~`…', ...'、。，．！？：；「」『』（）【】〈〉《》〔〕～・ー'].map(String));
// Chặn bình luận có ký tự đặc biệt. Sau khi bỏ emoji, coi là ký tự đặc biệt nếu:
//  1) còn ký hiệu lạ ngoài dấu câu thông dụng (★ ♥ ⚡ box-drawing, chữ trang trí…);
//  2) dòng BẮT ĐẦU bằng ký tự đặc biệt (dấu/ký hiệu đứng đầu như ? . ; @ # [ ( …);
//  3) QUÁ NHIỀU ký tự đặc biệt trong một dòng (spam kiểu "# $ % ^ & * ( ) _ +").
function liveTranslateHasSpecialChars(text) {
    const s = stripLiveTranslateIcons(text).trim();
    if (!s) return false;
    const specials = s.match(/[^\p{L}\p{M}\p{N}\s]/gu) || [];
    if (!specials.length) return false;
    if (specials.some(ch => !LIVE_TRANSLATE_COMMON_SPECIALS.has(ch))) return true;
    if (/[^\p{L}\p{M}\p{N}\s]/u.test(s[0]) && !'「『（【〈《〔'.includes(s[0])) return true; // ngoặc mở Nhật/Trung mở câu là bình thường
    const wordChars = (s.match(/[\p{L}\p{N}]/gu) || []).length;
    if (specials.length >= 4 && specials.length >= wordChars) return true;
    return false;
}

// Câu đưa cho TTS khi bật "Không đọc số": bỏ cụm số (kể cả 1.000 / 10:30 / 2/3) để giọng đọc khỏi đọc dãy số dài.
function stripLiveTranslateNumbersForSpeech(text) {
    return String(text || '')
        .replace(/[\p{N}]+(?:[.,:/-][\p{N}]+)*/gu, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,!?;:])/g, '$1')
        .trim();
}

function cleanLiveTranslateUnreadableText(text) {
    return String(text || '')
        .replace(/[\[［][^\]］]{0,160}[\]］]/g, ' ')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .replace(/[^\p{L}\p{N}\s.,!?;:'"()\-]{3,}/gu, ' ')
        .replace(/([.,!?;:'"()\-])\1{2,}/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function liveTranslateLangLabel(lang) {
    return LIVE_TRANSLATE_LANG_LABELS[String(lang || '').toLowerCase()] || String(lang || '').toUpperCase();
}

function liveTranslateUserKeys(user) {
    return [user?.userId, user?.uniqueId].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
}
function rememberLiveTranslateUser(map, user) {
    const now = Date.now();
    for (const key of liveTranslateUserKeys(user)) map.set(key, now);
    pruneStaleMap(map, now, LIVE_TRANSLATE_PRIORITY_WINDOW_MS);
}
function wasLiveTranslateUserRecent(map, user) {
    const now = Date.now();
    return liveTranslateUserKeys(user).some(key => (now - (map.get(key) || 0)) <= LIVE_TRANSLATE_PRIORITY_WINDOW_MS);
}

/**
 * Dịch Thuật dùng CHUNG bộ so khớp từ cấm với game (so đúng dấu). Bản cũ bỏ dấu trước khi so nên "chó" chặn nhầm
 * mọi câu có "cho", "lồn" chặn "lớn", "câm" chặn "cảm ơn".
 */
function findLiveTranslateBlockedWord(chat) {
    return CommentFilter.findForbidden(String(chat.comment || ''), getCommentForbidden());
}

function detectLiveTranslateToxicText(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const normalized = normalizeModerationText(raw)
        .replace(/[@#$%^&*_+=~`|\\/]+/g, ' ')
        .replace(/\s{2,}/g, ' ');
    for (const re of LIVE_TRANSLATE_TOXIC_PATTERNS) {
        if (re.test(raw) || re.test(normalized)) return re.source;
    }
    return '';
}

function shouldSpeakLiveTranslate(chat, cfg) {
    if (!cfg.ttsEnabled) return false;
    const user = { userId: chat.userId, uniqueId: chat.uniqueId };
    const isGifter = wasLiveTranslateUserRecent(liveTranslateRecentGifts, user);
    const isMember = wasLiveTranslateUserRecent(liveTranslateRecentMembers, user);
    if (cfg.ttsPriority === 'gifters' && !isGifter) return false;
    if (cfg.ttsPriority === 'members' && !isMember) return false;
    if (cfg.ttsPriority === 'giftersOrMembers' && !isGifter && !isMember) return false;
    const cooldownMs = (cfg.ttsCooldownSeconds || 0) * 1000;
    if (cooldownMs > 0) {
        const key = liveTranslateUserKeys(user)[0] || 'guest';
        const now = Date.now();
        if (now - (liveTranslateLastSpoken.get(key) || 0) < cooldownMs) return false;
        liveTranslateLastSpoken.set(key, now);
        pruneStaleMap(liveTranslateLastSpoken, now, Math.max(cooldownMs, 10 * 60 * 1000));
    }
    return true;
}

// ===== Bộ tự dịch (port từ HP NPC LIVE) — 3 bậc dự phòng, có hạn giờ, không tin câu báo lỗi =====
const TRANSLATION_FETCH_TIMEOUT_MS = 8000;
async function fetchTranslate(url, options = {}) {
    // Các endpoint dịch công cộng đôi lúc treo theo DNS/mạng của riêng một máy. Không để
    // một bình luận giữ promise vô hạn rồi làm người dùng tưởng tính năng dịch đã chết.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSLATION_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}
// MyMemory trả HTTP 200 kèm câu BÁO LỖI TIẾNG ANH ngay trong `translatedText` (không phải mã lỗi HTTP).
// Nếu tin, app đem nguyên câu "'AUTO' IS AN INVALID SOURCE LANGUAGE. EXAMPLE: LANGPAIR=EN|IT…" lên
// overlay và ĐỌC TO bằng TTS. Coi mọi chuỗi khớp các mẫu này là DỊCH HỎNG, không phải bản dịch.
const TRANSLATE_ERROR_TEXT_PATTERNS = [
    /IS AN INVALID (?:SOURCE|TARGET) LANGUAGE/i,
    /MYMEMORY WARNING/i,
    /QUERY LENGTH LIMIT/i,
    /PLEASE (?:LOGIN|CONTACT|SIGN)/i,
    /^\s*NO CONTENT\s*$/i
];
function isBadTranslationText(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    return TRANSLATE_ERROR_TEXT_PATTERNS.some(re => re.test(s));
}
// Bậc 1 — clients5/dict-chrome-ex: PHÁT HIỆN ngôn ngữ + dịch trong CÙNG một lượt gọi, và hiện là
// endpoint còn trả lời ổn nhất (bậc gtx bên dưới bị Google chặn 429 trên nhiều máy).
// Dạng trả về: [["<bản dịch>","<mã ngôn ngữ>"]]; câu dài có thể tách thành [[["a","b"],"<mã>"]].
async function translateViaGoogleDict(text, sl, tl) {
    const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' + encodeURIComponent(sl)
        + '&tl=' + encodeURIComponent(tl) + '&q=' + encodeURIComponent(text);
    const res = await fetchTranslate(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`google_dict_http_${res.status}`);
    const body = await res.json();
    const first = Array.isArray(body) ? body[0] : body;
    const raw = Array.isArray(first) ? first[0] : first;
    return {
        translated: Array.isArray(raw) ? raw.join('') : String(raw || ''),
        detected: Array.isArray(first) ? String(first[1] || '') : ''
    };
}
// Bậc 2 — endpoint gtx cũ. Giữ lại vì 429 tuỳ theo IP/máy: nơi nào còn gọi được thì vẫn dùng.
async function translateViaGoogleGtx(text, sl, tl) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' + encodeURIComponent(sl)
        + '&tl=' + encodeURIComponent(tl) + '&q=' + encodeURIComponent(text);
    const res = await fetchTranslate(url, { headers: { 'User-Agent': 'HP-Action-LIVE/translate' } });
    if (!res.ok) throw new Error(`google_http_${res.status}`);
    const body = await res.json();
    return {
        translated: Array.isArray(body?.[0]) ? body[0].map(part => part?.[0] || '').join('') : '',
        detected: body?.[2] ? String(body[2]) : ''
    };
}
// Bậc 3 — MyMemory. CHỈ gọi khi đã biết ngôn ngữ nguồn THẬT: nó không hiểu 'auto'.
async function translateViaMyMemory(text, sl, tl) {
    if (!sl || sl === 'auto') throw new Error('mymemory_needs_source_lang');
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text)
        + '&langpair=' + encodeURIComponent(sl) + '|' + encodeURIComponent(tl);
    const res = await fetchTranslate(url, { headers: { 'User-Agent': 'HP-Action-LIVE/translate' } });
    if (!res.ok) throw new Error(`translate_http_${res.status}`);
    const body = await res.json();
    if (Number(body?.responseStatus) !== 200) throw new Error(`mymemory_status_${body?.responseStatus || 'unknown'}`);
    const translated = String(body?.responseData?.translatedText || '').trim();
    if (isBadTranslationText(translated)) throw new Error('mymemory_error_text');
    return { translated, detected: sl };
}
// PHÁT HIỆN ngôn ngữ → dịch sang ngôn ngữ đích. Không dịch được thì NÉM LỖI (không trả bừa
// chuỗi lạ), để phía gọi hiện nguyên văn bình luận gốc thay vì một câu tiếng Anh vô nghĩa.
async function translateTextToTarget(text, sourceLang, targetLang) {
    const cleanText = String(text || '').trim().slice(0, 450);
    const target = sourceLangForTranslate(targetLang) === 'auto' ? 'vi' : sourceLangForTranslate(targetLang);
    if (!cleanText) return { translatedText: '', detectedLang: sourceLang || 'auto' };
    const sl = sourceLang && sourceLang !== 'auto' ? sourceLangForTranslate(sourceLang) : 'auto';
    const cacheKey = `${sl}:${target}:${cleanText}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
    let translated = '';
    let detectedLang = sl;
    let lastError = null;
    for (const attempt of [translateViaGoogleDict, translateViaGoogleGtx]) {
        try {
            const out = await attempt(cleanText, sl, target);
            if (out.detected) detectedLang = sourceLangForTranslate(out.detected);
            if (!isBadTranslationText(out.translated)) { translated = out.translated.trim(); break; }
        } catch (err) { lastError = err; }
    }
    if (!translated) {
        // Tới đây mới có thể biết ngôn ngữ nguồn (nếu bậc trên kịp phát hiện trước khi hỏng).
        try { translated = (await translateViaMyMemory(cleanText, detectedLang, target)).translated; }
        catch (err) { lastError = err; }
    }
    if (!translated) throw lastError || new Error('translate_unavailable');
    const result = { translatedText: translated, detectedLang: detectedLang || 'auto' };
    translationCache.set(cacheKey, result);
    if (translationCache.size > TRANSLATION_CACHE_LIMIT) {
        const firstKey = translationCache.keys().next().value;
        if (firstKey) translationCache.delete(firstKey);
    }
    return result;
}

function processLiveTranslateChat(chat) {
    liveTranslateStats.chatSeen += 1;
    liveTranslateStats.lastChatAt = Date.now();
    const cfg = sanitizeLiveTranslateConfig(appConfig.liveTranslate);
    // CHAT chỉ fire khi TikTok connection còn sống; không chặn thêm bằng state phụ
    // vì một số phiên tiktok-live-connector không cập nhật isConnected ổn định.
    if (!cfg.enabled) {
        liveTranslateStats.skippedDisabled += 1;
        liveTranslateStats.lastSkipReason = 'disabled';
        return;
    }
    if (!chat?.comment) {
        liveTranslateStats.skippedEmpty += 1;
        liveTranslateStats.lastSkipReason = 'empty_comment';
        return;
    }
    const blockedWord = findLiveTranslateBlockedWord(chat, cfg);
    if (blockedWord) {
        liveTranslateStats.skippedBlocked += 1;
        liveTranslateStats.lastSkipReason = 'blocked_rule';
        liveTranslateStats.lastBlockedWord = blockedWord;
        return;
    }
    if (cfg.blockSpecialChars && liveTranslateHasSpecialChars(chat.comment)) {
        liveTranslateStats.skippedSpecialChar += 1;
        liveTranslateStats.lastSkipReason = 'special_char_comment';
        return;
    }
    let textOnlyComment = cfg.ignoreIcons ? stripLiveTranslateIcons(chat.comment) : String(chat.comment || '').trim();
    if (cfg.cleanUnreadable) textOnlyComment = cleanLiveTranslateUnreadableText(textOnlyComment);
    if (!textOnlyComment) {
        liveTranslateStats.skippedEmpty += 1;
        liveTranslateStats.lastSkipReason = 'empty_after_clean';
        return;
    }
    if (cfg.skipNumberOnlyComments && isLiveTranslateNumberOnlyComment(textOnlyComment)) {
        liveTranslateStats.skippedNumberSpam += 1;
        liveTranslateStats.lastSkipReason = 'number_only_comment';
        return;
    }
    const normalizedComment = applyLiveTranslateGlossary(textOnlyComment, [...(commentSheetRules.glossary || []), ...(cfg.glossary || [])]);
    if (!normalizedComment) {
        liveTranslateStats.skippedEmpty += 1;
        liveTranslateStats.lastSkipReason = 'empty_after_glossary';
        return;
    }
    const toxicReason = cfg.aiFilterEnabled ? detectLiveTranslateToxicText(normalizedComment) : '';
    if (toxicReason) {
        liveTranslateStats.skippedToxic += 1;
        liveTranslateStats.lastSkipReason = 'ai_toxic_read_filter';
    }
    translateTextToTarget(normalizedComment, cfg.sourceLang, cfg.targetLang)
        .then(result => {
            const sourceLang = result.detectedLang || cfg.sourceLang || 'auto';
            if (isLiveTranslateExcludedSource(sourceLang, cfg)) {
                liveTranslateStats.skippedExcludedLanguage += 1;
                liveTranslateStats.lastSkipReason = 'excluded_language';
                return;
            }
            liveTranslateStats.emitted += 1;
            liveTranslateStats.lastEmitAt = Date.now();
            liveTranslateStats.lastSkipReason = '';
            const item = {
                id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'),
                uniqueId: chat.uniqueId,
                nickname: chat.nickname,
                userId: chat.userId,
                profilePicture: chat.profilePicture,
                originalText: chat.comment,
                normalizedText: normalizedComment,
                translatedText: result.translatedText,
                sourceLang,
                targetLang: cfg.targetLang,
                sourceLangLabel: liveTranslateLangLabel(sourceLang),
                targetLangLabel: liveTranslateLangLabel(cfg.targetLang),
                readUsername: cfg.readUsername,
                ttsEnabled: cfg.ttsEnabled,
                ttsVoice: cfg.ttsVoice,
                ttsPreset: cfg.ttsPreset,
                ttsReadMode: cfg.ttsReadMode,
                ttsVolume: cfg.ttsVolume,
                ttsRate: cfg.ttsRate,
                ttsSource: cfg.ttsSource,
                ttsPlayLocation: cfg.ttsPlayLocation,
                stripNumbersForTTS: cfg.stripNumbersForTTS,
                maxItems: cfg.maxItems,
                toxic: !!toxicReason,
                canSpeak: !toxicReason && shouldSpeakLiveTranslate(chat, cfg),
                createTime: chat.createTime || Date.now()
            };
            // Câu sẽ ĐỌC (bộ đọc ở PC lẫn overlay dùng chung): bỏ số nếu bật "Không đọc số".
            item.speechText = cfg.stripNumbersForTTS ? stripLiveTranslateNumbersForSpeech(item.translatedText || normalizedComment) : (item.translatedText || normalizedComment);
            io.emit('translate:comment', item);
            setLiveDashboardTranslatedComment(item);
        })
        .catch(err => {
            liveTranslateStats.translateErrors += 1;
            liveTranslateStats.lastError = err?.message || 'translate_failed';
            liveTranslateStats.emitted += 1;
            liveTranslateStats.lastEmitAt = Date.now();
            const item = {
                id: crypto.randomBytes(12).toString('hex'),
                uniqueId: chat.uniqueId,
                nickname: chat.nickname,
                userId: chat.userId,
                profilePicture: chat.profilePicture,
                originalText: chat.comment,
                normalizedText: normalizedComment,
                translatedText: normalizedComment,
                sourceLang: cfg.sourceLang,
                targetLang: cfg.targetLang,
                sourceLangLabel: liveTranslateLangLabel(cfg.sourceLang),
                targetLangLabel: liveTranslateLangLabel(cfg.targetLang),
                readUsername: cfg.readUsername,
                ttsEnabled: cfg.ttsEnabled,
                ttsVoice: cfg.ttsVoice,
                ttsPreset: cfg.ttsPreset,
                ttsReadMode: cfg.ttsReadMode,
                ttsVolume: cfg.ttsVolume,
                ttsRate: cfg.ttsRate,
                ttsSource: cfg.ttsSource,
                ttsPlayLocation: cfg.ttsPlayLocation,
                stripNumbersForTTS: cfg.stripNumbersForTTS,
                maxItems: cfg.maxItems,
                toxic: !!toxicReason,
                canSpeak: !toxicReason && shouldSpeakLiveTranslate(chat, cfg),
                error: err?.message || 'translate_failed',
                createTime: chat.createTime || Date.now()
            };
            // Câu sẽ ĐỌC (bộ đọc ở PC lẫn overlay dùng chung): bỏ số nếu bật "Không đọc số".
            item.speechText = cfg.stripNumbersForTTS ? stripLiveTranslateNumbersForSpeech(item.translatedText || normalizedComment) : (item.translatedText || normalizedComment);
            io.emit('translate:comment', item);
            setLiveDashboardTranslatedComment(item);
        });
}

// ====== Gift list loader (via license-server proxy) ======
// giftList luôn kèm quà ảo 🎵 Ca khúc (MusicGifts.MUSIC_GIFT_ID) — mọi bài Ca khúc gom về 1 id để gán cấu hình 1 lần.
let giftList = MusicGifts.withMusicGiftItem([]);
let giftMap = { [MusicGifts.MUSIC_GIFT_ID]: giftList[0] };
let giftSheetLoadedAt = 0;  // thời điểm nạp danh sách quà gần nhất (hiện ở ⚙ Cài đặt)

// ====== Gift list disk cache ======
// Vì sao: trên 1 số PC, cả license-server (hp-license.nguyenvu.dev) lẫn fallback
// Google Sheet đều bị firewall/AV chặn → loadGiftSheet() trả [] → panel "📦 Danh
// sách quà" rỗng, badge effects mất ảnh quà gốc. Cache đĩa ở DATA_DIR đảm bảo:
//   - Lần đầu fetch thành công → ghi cache
//   - Lần sau (offline / blocked) → đọc cache → vẫn hiển thị đủ
// File ở DATA_DIR (= userData/data trên Electron build, ../data trên dev) cùng
// app-config.json — persist across upgrades.
const GIFT_CACHE_FILE = path.join(DATA_DIR, 'gift-sheet-cache.json');

function loadGiftCacheFromDisk() {
    try {
        if (!fs.existsSync(GIFT_CACHE_FILE)) return [];
        const data = JSON.parse(fs.readFileSync(GIFT_CACHE_FILE, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('[gift-sheet] Cache đọc fail:', e.message);
        return [];
    }
}
function saveGiftCacheToDisk(list) {
    try {
        if (!Array.isArray(list)) return;
        list = list.filter(g => !(g && g.virtual));   // quà ảo (🎵 Ca khúc) tự thêm lúc nạp, không lưu vào cache
        if (list.length === 0) return;
        fs.writeFileSync(GIFT_CACHE_FILE, JSON.stringify(list), 'utf8');
    } catch (e) {
        console.warn('[gift-sheet] Cache lưu fail:', e.message);
    }
}

// Eager load cache trên startup — socket client đầu tiên connect đã nhận được
// list ngay, không phải đợi 15s timeout của license-server. loadGiftSheet() sau
// đó refresh nếu network OK.
(function eagerLoadGiftCache() {
    const cached = loadGiftCacheFromDisk();
    if (cached.length > 0) {
        giftList = MusicGifts.withMusicGiftItem(cached.slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)));
        for (const g of giftList) {
            if (g && g.id) giftMap[String(g.id)] = g;
        }
        console.log(`[gift-sheet] Eager load cache: ${giftList.length} quà (sẽ refresh từ network)`);
    }
})();

// Fallback fetch trực tiếp Google Sheet khi license-server trả empty
// (workaround cho lúc env SHEET_ID ở VPS chưa update đúng).
// Schema: A=id | B=name | C=link | D=webm (bỏ qua) | E=diamond
const FALLBACK_SHEET_ID = '1Fv9Jdno_pPMTx_-tnwSfRObm1r1wKds_gaMBnfCDm4M';
const FALLBACK_SHEET_NAME = 'DANH SACH QUA';

function parseCsvSimple(text) {
    const rows = [];
    let cur = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else {
            if (c === '"') inQuotes = true;
            else if (c === ',') { cur.push(field); field = ''; }
            else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
            else if (c !== '\r') field += c;
        }
    }
    if (field || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
}

async function fetchGiftSheetDirect() {
    const url = `https://docs.google.com/spreadsheets/d/${FALLBACK_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(FALLBACK_SHEET_NAME)}`;
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`Direct sheet HTTP ${res.status}`);
    const csv = await res.text();
    const rows = parseCsvSimple(csv);
    const list = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 3) continue;
        const id = (r[0] || '').toString().trim();
        const name = (r[1] || '').toString().trim();
        const image = (r[2] || '').toString().trim();
        // Cột D có thể là webm (sheet bản chuẩn) — skip, đọc cột E làm diamond.
        // Nếu D có số → dùng D (sheet cũ có A=id B=name C=link D=diamond).
        const dRaw = (r[3] || '').toString().replace(/[^\d]/g, '');
        let diamond = parseInt(dRaw, 10);
        if (!diamond || isNaN(diamond)) {
            diamond = parseInt((r[4] || '').toString().replace(/[^\d]/g, ''), 10) || 0;
        }
        if (!id) continue;
        list.push({ id, name, image, diamond });
    }
    return list;
}

async function loadGiftSheet() {
    if (!isWorkerConfigured()) {
        console.error('[gift-sheet] LICENSE_WORKER_URL chưa cấu hình — không thể tải gift sheet');
        // Vẫn giữ giftList hiện tại (có thể đã eager-load từ cache đĩa) — không
        // emit empty list, vì empty sẽ ghi đè state tốt của client.
        if (giftList.length === 0) io.emit('giftSheet', giftList);
        return giftList;
    }
    console.log('[gift-sheet] Tải danh sách quà qua license-server...');
    let listFromServer = [];
    let serverFailed = false;
    try {
        const url = LICENSE_WORKER_URL.replace(/\/$/, '') + '/api/gift-sheet';
        const res = await fetch(url, { timeout: 15000 });
        if (!res.ok) throw new Error(`License-server HTTP ${res.status}`);
        const body = await res.json();
        if (!body.ok || !Array.isArray(body.gifts)) throw new Error('License-server response invalid');
        listFromServer = body.gifts;
    } catch (e) {
        console.warn('[gift-sheet] License-server fail:', e.message);
        serverFailed = true;
    }
    // Đánh giá chất lượng data từ license-server. KHÔNG chỉ check length===0:
    // sheet nguồn ở VPS có thể bị hỏng/lệch cột → trả về NHIỀU dòng nhưng (gần
    // như) không dòng nào có icon (vd chỉ còn dòng mẫu 111,222,333,... rỗng
    // name+image). Nếu hiển thị thẳng thì catalog mất sạch icon dù sheet thật
    // vẫn ổn → coi như invalid để fallback Google Sheet trực tiếp.
    const imgCount = (arr) => arr.filter(g => g && g.image && String(g.image).trim()).length;
    const serverImg = imgCount(listFromServer);
    const serverDataBad = listFromServer.length > 0 && serverImg < listFromServer.length * 0.5;
    if (serverDataBad) {
        console.warn(`[gift-sheet] License-server trả ${listFromServer.length} quà nhưng chỉ ${serverImg} có icon → coi như hỏng.`);
    }
    // Fallback: server empty, fail, HOẶC data hỏng (mất icon) → fetch trực tiếp Google Sheet
    if (serverFailed || listFromServer.length === 0 || serverDataBad) {
        console.log('[gift-sheet] Fallback fetch Google Sheet trực tiếp...');
        try {
            const direct = await fetchGiftSheetDirect();
            // Chỉ thay bằng data trực tiếp nếu nó tốt hơn (nhiều icon hơn) — tránh
            // thay data server bằng data trực tiếp cũng rỗng/ít hơn.
            if (direct.length > 0 && imgCount(direct) >= serverImg) {
                console.log(`[gift-sheet] Fallback OK: ${direct.length} quà từ Google Sheet (${imgCount(direct)} có icon)`);
                listFromServer = direct;
            } else {
                console.warn(`[gift-sheet] Google Sheet trực tiếp không tốt hơn (${imgCount(direct)} icon/${direct.length}) — giữ nguồn cũ.`);
            }
        } catch (e) {
            console.error('[gift-sheet] Fallback cũng fail:', e.message);
        }
    }
    // Sau fallback vẫn rỗng HOẶC vẫn mất icon (cả license-server lẫn Google Sheet
    // đều hỏng/không reach) → ưu tiên cache đĩa nếu cache tốt hơn. Không ghi đè
    // giftList tốt bằng data rỗng/rác.
    if (listFromServer.length === 0 || imgCount(listFromServer) < listFromServer.length * 0.5) {
        const cached = loadGiftCacheFromDisk();
        if (cached.length > 0 && imgCount(cached) > imgCount(listFromServer)) {
            console.warn(`[gift-sheet] Data hiện tại thiếu icon → dùng cache đĩa: ${cached.length} quà (${imgCount(cached)} có icon)`);
            listFromServer = cached;
        } else if (listFromServer.length === 0) {
            console.error('[gift-sheet] Network fail VÀ không có cache → giữ giftList hiện tại');
            // Không reset. giftList giữ nguyên (có thể có data eager-load lúc init, hoặc rỗng nếu install mới).
            io.emit('giftSheet', giftList);
            return giftList;
        }
    }
    // Sort theo Kim Cương ASC (thấp → cao). Áp dụng cho cả nguồn license-server
    // lẫn fallback Google Sheet trực tiếp.
    const sheetList = listFromServer.slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0));
    giftList = MusicGifts.withMusicGiftItem(sheetList);
    giftSheetLoadedAt = Date.now();
    giftMap = {};
    for (const g of giftList) {
        if (g && g.id) giftMap[String(g.id)] = g;
    }
    // Ghi cache đĩa MỖI lần load thành công — máy chỉ cần online 1 lần là gift
    // sheet persist mãi mãi cho các lần khởi động sau (kể cả offline).
    // Chỉ ghi khi data tốt (đủ icon) để không phá cache tốt bằng data rác. Cache chỉ chứa quà của sheet (không quà ảo).
    if (sheetList.length > 0 && imgCount(sheetList) >= sheetList.length * 0.5) {
        saveGiftCacheToDisk(sheetList);
    } else {
        console.warn(`[gift-sheet] Bỏ qua ghi cache: data thiếu icon (${imgCount(sheetList)}/${sheetList.length}) — giữ cache cũ.`);
    }
    console.log(`[gift-sheet] Đã tải ${giftList.length} quà (sort theo Kim Cương ASC).`);
    io.emit('giftSheet', giftList);
    return giftList;
}

function pickRandomGiftSheetItem() {
    const usable = giftList.filter(g => g && g.id && (g.image || g.name));
    const list = usable.length ? usable : giftList.filter(g => g && g.id);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

const TEST_GIFT_IMAGE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect x="12" y="32" width="56" height="38" rx="8" fill="%23ff5fa3"/><rect x="36" y="28" width="8" height="42" fill="%23ffe66d"/><rect x="8" y="24" width="64" height="16" rx="6" fill="%23ff7ab8"/><path d="M40 24 C24 12 20 22 28 28 C33 32 38 29 40 24 ZM40 24 C56 12 60 22 52 28 C47 32 42 29 40 24 Z" fill="%23ffe66d"/></svg>';

function makeTestGiftPayload(body = {}) {
    const requestedId = String(body.giftId || '').trim();
    const sheetItem = requestedId ? giftMap[requestedId] : pickRandomGiftSheetItem();
    const giftId = String(requestedId || sheetItem?.id || ('test-gift-' + Math.max(1, Math.ceil(Math.random() * 5))));
    // 🎵 Thả thử quà Ca khúc → bốc 1 bài ngẫu nhiên trong danh mục để đĩa rơi đúng ảnh/màu từng bài như LIVE thật.
    if (giftId === MusicGifts.MUSIC_GIFT_ID) {
        const ids = Object.keys(musicGiftCatalog);
        let s = null;
        for (let i = 0; i < 8 && ids.length && !s; i++) {   // bốc ngẫu nhiên, không duyệt cả ~20.000 bài
            const id = ids[Math.floor(Math.random() * ids.length)];
            const song = musicGiftCatalog[id];
            if (song && song.image) s = { id, ...song, label: MusicGifts.songLabel(song) };
        }
        if (s) {
            return {
                giftId, giftName: s.label, giftImage: s.image, coinValue: Number(s.price) || 199,
                extra: { musicGift: true, songGiftId: s.id, song: { id: s.id, song: s.song || '', artist: s.artist || '', lyrics: s.lyrics || '', mood: s.mood || 0 } }
            };
        }
    }
    return {
        giftId,
        giftName: sheetItem?.name || body.giftName || ('Quà Test ' + String(giftId).replace('test-gift-', '#')),
        giftImage: sheetItem?.image || body.giftImage || body.giftPicture || TEST_GIFT_IMAGE,
        coinValue: Math.max(1, Number(sheetItem?.diamond ?? body.coinValue ?? body.diamondCount ?? 20) || 20)
    };
}

// ============================================================
// LICENSE VALIDATION — HP KEY (hpvn.media)
// ============================================================
// Thay backend cũ (Cloudflare Worker / Google Sheet) bằng HP KEY.
// Cấu hình: hpkey/config.js + hpkey/secret.local.js + hpkey/public-key.js.
// Giữ nguyên interface validateLicenseKey() nên gate + role không phải sửa.
// (gift-sheet & auto-update vẫn dùng LICENSE_WORKER_URL cũ — không đổi)
const { validateLicenseKey } = require('./hpkey/validate');

// ============================================================
// TÍNH NĂNG THEO KEY — HP KEY trường ft (license.features); danh mục ở lib/license-features.js
// ============================================================
// appConfig.license.features: null/thiếu = mở hết (mọi key cũ); mảng id = chỉ mở các mục đó.
// KHOÁ = tắt mục đó (enabled=false, hoặc bỏ khỏi lựa chọn Game Camera) và GHI NHỚ vào appConfig.licenseLocks
// (để riêng vì các hàm chuẩn hoá cấu hình có thể lọc khoá lạ). KHÔNG chạy bước xoá dữ liệu — vườn Trồng Cây
// còn nguyên. MỞ KHOÁ = bật lại đúng những gì đã tắt vì key (mục người dùng tự tắt thì để nguyên).
// Kèm theo: API không cho bật mục bị khoá, /api/games đánh dấu locked, overlay OBS của mục bị khoá hiện 🔒.
function licenseFeatures() {
    const f = appConfig.license && appConfig.license.features;
    return Array.isArray(f) ? f : null;
}
function featureOn(id) { return LicFeat.can(licenseFeatures(), id); }
// Trạng thái mục theo game (HP KEY gs, SDK 2.1 — appConfig.license.gameState): chỉ đổi cách HIỆN (⏸ Tạm bảo trì / ẩn / 🧪);
// khoá vẫn theo features vì server đã trừ mục Tạm tắt / Ẩn khỏi ft.
function licenseGameState() { return LicFeat.normalizeState(appConfig.license && appConfig.license.gameState); }
function licenseStateOf(id) { return LicFeat.stateOf(licenseFeatures(), licenseGameState(), id); }
function licenseDeniedMessage(id) {
    const st = licenseStateOf(id);
    return st === 'off' ? 'Mục này đang tạm bảo trì — HP Media sẽ mở lại sớm'
        : st === 'hidden' ? 'Mục này chưa mở' : 'KEY chưa mở tính năng này';
}
function licenseLocks() {
    const l = appConfig.licenseLocks = (appConfig.licenseLocks && typeof appConfig.licenseLocks === 'object') ? appConfig.licenseLocks : {};
    if (!l.games || typeof l.games !== 'object') l.games = {};
    if (!Array.isArray(l.camActives)) l.camActives = [];
    return l;
}
// Game con Game Camera (trừ Bắn Cung có link riêng) bật/tắt theo lựa chọn của khung → khoá qua lựa chọn.
function lockViaCamSelection(id) { return CAM_GAME_IDS.includes(id) && !CAM_STANDALONE_IDS.has(id); }
// Trang 🔒 / ⏸ nền trong suốt; tự hỏi /api/license/features ~15 s và tải lại khi mục được mở (OBS khỏi bấm refresh).
function licenseLockedHtml(id) {
    return LicFeat.lockedPageHtml(id, licenseStateOf(id));
}
// Áp lại phần chạy của game sau khi đổi enabled (như nhánh lưu cấu hình POST /api/games/:id/config).
function applyGameRuntime(id) {
    const c = appConfig.games[id];
    if (!c) return;
    try {
        if (id === 'vipwelcome') global.__vipwelcomeApplyHotkeys?.(c);
        else if (id === 'votecomment') { voteCommentApplyConfigToState(c); broadcastVoteCommentState({ immediate: true }); }
        else if (id === 'nhietdo') { nhietDoApplyConfigToState(c); broadcastNhietDoState({ immediate: true }); }
        else if (id === 'bancung') { banCungApplyConfigToState(c); camApplyHotkeys('bancung'); broadcastBanCungState({ immediate: true }); }
        else if (id === 'dapmuoi') camApplyHotkeys('dapmuoi');
        else if (id === 'nhatla') global.__nhatlaApplyHotkeys?.(c);
        else if (id === 'duongveque') global.__dvqApplyHotkeys?.(c);
        else if (id === 'trongcay') { trongCayApplyConfigToState(c); broadcastTrongCayState({ immediate: true }); }
    } catch (e) { console.warn('[license] áp lại game ' + id + ' lỗi:', e && e.message); }
}
// Bật/tắt một công cụ (Hiệu ứng OBS, Dịch Thuật LIVE…) theo khoá, nhớ vào licenseLocks[name]. Trả true nếu đổi.
function licenseToolLock(name, obj, lock) {
    const L = licenseLocks();
    if (!obj) return false;
    if (lock) {
        if (obj.enabled === false) return false;
        obj.enabled = false; L[name] = true;
        return true;
    }
    if (!L[name]) return false;
    delete L[name];
    if (obj.enabled !== false) return false;
    obj.enabled = true;
    return true;
}
// Lưu cấu hình công cụ từ giao diện: bị khoá thì giữ tắt (nhớ ý muốn bật); tự tắt tay → bỏ nhớ.
function licenseCoerceTool(name, obj, featureId) {
    if (!obj) return;
    const L = licenseLocks();
    if (obj.enabled === false) { delete L[name]; return; }
    if (!featureOn(featureId)) { obj.enabled = false; L[name] = true; }
}
// Áp khoá/mở khoá theo appConfig.license.features. Gọi lúc khởi động, sau mỗi lần xác thực key và khi watcher
// nhận token có danh sách tính năng khác. Idempotent: gọi lại không đổi gì.
function applyLicenseLocks(reason) {
    const features = licenseFeatures();
    const locked = new Set(LicFeat.lockedIds(features));
    const L = licenseLocks();
    const camBefore = appConfig.games.camgames ? { ...appConfig.games.camgames } : null;
    let changed = false;
    let camChanged = false;
    // 1) Game Camera: bỏ game con bị khoá khỏi lựa chọn; mở khoá thì trả lại đúng game đã bỏ ra.
    const cam = appConfig.games.camgames;
    if (cam) {
        const sel = CamRules.activesOf(cam, CAM_GAME_IDS);
        const hidden = L.camActives.filter(id => CAM_GAME_IDS.includes(id));
        const back = hidden.filter(id => !locked.has(id) && !sel.includes(id));
        const nowLocked = sel.filter(id => locked.has(id));
        if (nowLocked.length || back.length) {
            let keep = [...sel.filter(id => !locked.has(id)), ...back];
            // Danh sách rỗng thì lib/camgames tự chọn game con đầu tiên (Touch & Play) — có thể đang bị khoá →
            // chọn game con đầu tiên ĐƯỢC MỞ. Không còn game con nào mở → khung camgames bị khoá ở bước 2.
            if (!keep.length) keep = CAM_GAME_IDS.filter(id => !locked.has(id)).slice(0, 1);
            const norm = CamRules.applyPatch(cam, { actives: keep }, CAM_GAME_IDS);
            cam.actives = norm.actives;
            cam.active = norm.active || '';
            camChanged = true;
        }
        L.camActives = [...new Set([...hidden.filter(id => locked.has(id)), ...nowLocked])];
    }
    // 2) Cờ enabled: game thường, Bắn Cung (link riêng), khung camgames. Level Quest không đọc enabled → chặn
    //    qua lựa chọn Game Camera (bước 1) + overlay 🔒.
    for (const id of Object.keys(GAMES)) {
        if (lockViaCamSelection(id) || CAM_IGNORES_ENABLED.has(id)) continue;
        const c = appConfig.games[id];
        if (!c) continue;
        if (locked.has(id)) {
            if (c.enabled === false) continue;
            c.enabled = false; L.games[id] = true; changed = true;
            if (id === 'camgames') camChanged = true;
            applyGameRuntime(id);
            io.emit('gameConfig', { gameId: id, config: c });
            emitGameStopped(id, { keepData: true });
        } else if (L.games[id]) {
            delete L.games[id]; changed = true;
            if (c.enabled === false) {
                c.enabled = true;
                if (id === 'camgames') camChanged = true;
                applyGameRuntime(id);
                io.emit('gameConfig', { gameId: id, config: c });
                io.emit('gameEnabled', { gameId: id, ts: Date.now() });
            }
        }
    }
    if (camChanged && camBefore) {
        camGamesApplyActive(camBefore);
        camApplyAllHotkeys();
        io.emit('gameConfig', { gameId: 'camgames', config: appConfig.games.camgames });
        changed = true;
    }
    // 3) Công cụ: Hiệu ứng OBS, Dịch Thuật LIVE (+ phụ đề giọng Creator đi cùng gói).
    if (licenseToolLock('obsBridge', appConfig.obsBridge, locked.has('obs-effects'))) {
        changed = true;
        io.emit('obsBridge:config', {
            enabled: appConfig.obsBridge.enabled !== false,
            mapping: Array.isArray(appConfig.obsBridge.mapping) ? appConfig.obsBridge.mapping : [],
            groupsDisabled: Array.isArray(appConfig.obsBridge.groupsDisabled) ? appConfig.obsBridge.groupsDisabled : []
        });
    }
    if (licenseToolLock('liveTranslate', appConfig.liveTranslate, locked.has('liveTranslate'))) {
        changed = true;
        io.emit('translate:config', appConfig.liveTranslate);
    }
    if (licenseToolLock('creatorCaption', appConfig.creatorCaption, locked.has('liveTranslate'))) {
        changed = true;
        io.emit('creatorCaption:config', appConfig.creatorCaption);
        try { global.__captionApplyHotkey?.(appConfig.creatorCaption); } catch (e) {}
        if (appConfig.creatorCaption.enabled === false) { try { captionListenerStop(); } catch (e) {} }
    }
    if (changed) {
        saveAppConfig();
        console.log(`[license] tính năng theo key (${reason}): khoá ${[...locked].join(', ') || '—'}`);
    }
    io.emit('license:features', { features, locked: [...locked], states: LicFeat.states(features, licenseGameState()) });
    return changed;
}

// ====== TikTok connection ======
let connection = null;
let currentUsername = null;
let connecting = false;
let liveConnected = false;
let currentRoomId = null;
let currentHostUserId = '';   // owner.userId của room đang connect — dùng để identify host team trong PK
let currentHostProfile = null;   // { uniqueId, nickname, profilePic, userId } — broadcast cho Caro avatar mode

// ====== TikTok payload normalizers ======
// Schema tiktok-live-connector v2: Image.url là MẢNG (nhiều CDN mirror). Gán thẳng vào <img src> thì
// trình duyệt nhận chuỗi "url1,url2,url3" → avatar vỡ. Luôn đi qua hàm này để lấy link đầu tiên hợp lệ.
function pickAvatarUrl(v, depth = 0) {
    if (!v || depth > 3) return '';
    if (typeof v === 'string') return /^(https?:)?\/\//i.test(v) || v.startsWith('/') || v.startsWith('data:') ? v : '';
    if (Array.isArray(v)) { for (const x of v) { const s = pickAvatarUrl(x, depth + 1); if (s) return s; } return ''; }
    if (typeof v === 'object') return pickAvatarUrl(v.url ?? v.urlList ?? v.url_list ?? v.uri ?? '', depth + 1);
    return '';
}
// ID TikTok (userId/giftId/...) có thể là string, number hay bigint tuỳ bản lib; '0' là mặc định proto = không có.
function tiktokIdToString(v) {
    if (v == null || typeof v === 'object') return '';
    const s = String(v).trim();
    return (s === '' || s === '0' || s === 'NaN' || s === 'undefined') ? '' : s;
}
// giftId: v3 (2.4.4) là STRING (2.1.0 number) và cũng nằm ở data.gift.id → luôn về chuỗi.
function getTikTokGiftId(data) {
    return tiktokIdToString(data?.giftId) || tiktokIdToString(data?.gift?.id) || tiktokIdToString(data?.gift?.gift_id) || tiktokIdToString(data?.giftDetails?.giftId);
}
// Schema 2.4.4 (tiktok-live-proto v3) dùng TÊN THẬT của TikTok: user.id / displayId / avatarThumb / payGrade thay cho
// userId / uniqueId / profilePicture / userHonor của 2.1.0. Đọc CẢ 2 dạng (cũ ?? mới) để không phụ thuộc bản lib.
function normalizeTikTokUser(u, data) {
    u = u || {};
    return {
        uniqueId: u.uniqueId || u.displayId || u.display_id || data?.uniqueId || '',
        userId: tiktokIdToString(u.userId) || tiktokIdToString(u.idStr) || tiktokIdToString(u.id_str) || tiktokIdToString(u.id) || tiktokIdToString(data?.userId),
        nickname: maskViewerName(u.nickname || u.nickName || ''),   // 🚫 tên có từ cấm → *** (mọi game)
        // Cấp người xem: badge USER_GRADE (sceneType 8) + payGrade/userHonor — cùng bộ đọc với Chào Mừng VIP.
        level: vwSignals.readUser(u, vipSignalCtx()).level || Number(u.pay_grade?.level) || 0,
        profilePicture: pickAvatarUrl(u.profilePicture || u.profilePictureUrl || u.avatarThumb || u.avatar_thumb || u.avatarMedium || u.avatarLarge),
        verified: !!u.verified
    };
}
// Rút các trường TikTok THẬT gửi kèm user (top gifter / fan club / subscriber / moderator / follow).
// Trường nào TikTok không gửi thì về 0/false — không đoán. Dùng cho VIP Welcome + placeholder tin nhắn.
// v3 đổi kiểu số → chuỗi (followStatus, followerCount, fansLevel) → luôn bọc Number().
function extractTikTokUser(data) {
    const u = data?.user || {};
    const base = normalizeTikTokUser(u, data);
    const followStatus = Number(u.followInfo?.followStatus ?? u.followStatus ?? 0) || 0;
    const topUserNo = Number(data?.topUserNo) || 0;
    // Fan club / đăng ký / MOD: đọc qua join-signals (badge + fansClub.data kiểm đúng chủ phòng) — fansClubInfo,
    // subscribeInfo.isSubscribe, isSetToAdmin có thể nói về KÊNH RIÊNG của người xem hoặc là thông báo đặt MOD.
    const sig = vwSignals.readUser(u, vipSignalCtx());
    return {
        ...base,
        isTopUser: !!data?.isTopUser || (topUserNo > 0 && topUserNo <= 3),   // WebcastMemberMessage.isTopUser/topUserNo
        topUserNo,
        fansLevel: sig.fansLevel,
        fansClubName: sig.fansClubName,
        isSubscriber: sig.isSubscriber,
        isModerator: sig.isModerator,
        isFollowing: followStatus === 1 || followStatus === 2,
        followStatus
    };
}
// Dọn map "ai vừa làm gì" (translate/priority) — trước đây lớn mãi theo số viewer cả buổi.
function pruneStaleMap(map, now, maxAgeMs, softCap = 3000) {
    if (map.size < softCap) return;
    for (const [k, ts] of map) if (now - ts > maxAgeMs) map.delete(k);
}

// ====== Tự kết nối lại khi rớt LIVE ======
// Wi-Fi/TikTok rớt giữa buổi → trước đây app nằm im cho tới khi người dùng bấm Kết nối lại.
// Backoff tăng dần để không đốt hạn mức ký WebSocket của Euler Stream (ẩn danh: 5 lượt/phút, 100/ngày).
const RECONNECT_DELAYS_MS = [5000, 15000, 30000, 60000, 120000, 300000];
const RECONNECT_MAX_ATTEMPTS = 12;
let manualDisconnect = false;   // người dùng bấm Ngắt → không tự nối lại
let streamEnded = false;        // TikTok báo LIVE kết thúc → không tự nối lại
let reconnectTimer = null;
let reconnectAttempt = 0;
let reconnectDelayMs = 0;
function cancelAutoReconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}
function scheduleAutoReconnect() {
    if (manualDisconnect || streamEnded || !currentUsername || connecting) return false;
    if (appConfig.autoReconnect === false) return false;   // người dùng tắt trong ⚙ Cài đặt
    if (reconnectTimer) return true;
    if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
        console.warn(`[tiktok] Đã tự thử nối lại ${reconnectAttempt} lần không thành — dừng. Bấm Kết nối để thử lại.`);
        return false;
    }
    reconnectDelayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt++;
    const attemptNo = reconnectAttempt;
    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (manualDisconnect || streamEnded || !currentUsername) return;
        console.log(`[tiktok] Tự kết nối lại lần ${attemptNo}/${RECONNECT_MAX_ATTEMPTS} → @${currentUsername}`);
        broadcast('status', { connected: false, username: currentUsername, reconnecting: true, attempt: attemptNo, phase: 'connecting' });
        try {
            await connectToUser(currentUsername, { preserveSession: true, auto: true });
            reconnectAttempt = 0;
        } catch (e) {
            const msg = String(e?.message || e || '');
            console.warn(`[tiktok] Tự kết nối lại thất bại: ${msg}`);
            // LIVE chưa bật lại → giãn thưa hơn (nhảy tới nấc 60s+), không cần dồn dập.
            if (/isn't online|not online|offline/i.test(msg)) reconnectAttempt = Math.max(reconnectAttempt, 3);
            const again = scheduleAutoReconnect();
            broadcast('status', { connected: false, username: currentUsername, reconnecting: again, attempt: reconnectAttempt, nextInMs: again ? reconnectDelayMs : 0, error: msg });
        }
    }, reconnectDelayMs);
    reconnectTimer.unref?.();
    return true;
}
// Hook để emitGift gọi vào PK gift tracking (set bởi attachConnectionEvents khi PK active)
let pktiktokTrackPkGift = null;
// Lưu thông tin TOP 1 contributor khi PK kết thúc — dùng cho rule override
let pkLastTopContributor = null;
// Session stats — counters for connection card display
let liveStats = {
    viewerCount: 0,
    totalDiamond: 0,
    totalLikes: 0,
    totalShares: 0,
    totalFollows: 0,
    totalSubscribes: 0,
    followerCount: 0
};
function resetLiveStats() {
    liveStats = { viewerCount: 0, totalDiamond: 0, totalLikes: 0, totalShares: 0, totalFollows: 0, totalSubscribes: 0, followerCount: 0 };
    // 💎 LIVE mới → tổng 💎 về 0, nên baseline KPI Trồng Cây cũng phải về 0 (tránh mốc bị "âm" rồi clamp 0 cả buổi sau).
    if (typeof trongCayState !== 'undefined' && trongCayState) trongCayState.kpiBaseline = 0;
}
// Broadcast stats với throttle để không spam socket
let lastStatsEmit = 0;
function emitLiveStatsThrottled() {
    const now = Date.now();
    if (now - lastStatsEmit < 500) return;
    lastStatsEmit = now;
    io.emit('liveStats', liveStats);
    emitLiveDashboard();
}
function emitLiveStatsImmediate() {
    lastStatsEmit = Date.now();
    io.emit('liveStats', liveStats);
    emitLiveDashboard();
}

function broadcast(type, payload) { io.emit(type, payload); }
function isTikTokLiveConnected() { return !!(connection && liveConnected); }

// Bước 0 Thứ Hạng LIVE: ghi thô gói xếp hạng/giải đấu (rankUpdate, rankText, hourlyRank, điểm giải đấu trong PK)
// ra <DATA_DIR>/tiktok-rank-log/<ngày>.jsonl để biết TikTok thật sự gửi gì. Xem: GET /api/rank-log.
const rankLog = createRankLog({ dir: path.join(DATA_DIR, 'tiktok-rank-log') });

// ====== 🏆 Thứ Hạng LIVE: rankUpdate → tracker → 'league:state' + 'league:event' cho overlay ======
const leagueTracker = LeagueCard.createLeagueTracker({ dangerMinutes: 30 });
let leagueRoomId = null;
function leagueCfg() { return { ...makeDefaultLeagueCardConfig(), ...(appConfig.games?.leaguecard || {}) }; }
function leagueEmit(events) {
    io.emit('league:state', leagueTracker.snapshot());
    for (const ev of events || []) io.emit('league:event', ev);
}
// Kết nối phòng MỚI → xoá số cũ; tự nối lại cùng phòng thì giữ nguyên.
function leagueStartRoom() {
    if (currentRoomId && currentRoomId === leagueRoomId) return;
    leagueRoomId = currentRoomId || null;
    leagueTracker.reset();
    if (!leagueApplyManual()) leagueEmit([]);
}
function leagueApplyManual() {
    const c = leagueCfg();
    if (!c.manualOn) return false;
    const parsed = LeagueCard.manualToParsed(c.manual);
    if (!parsed) return false;
    leagueTracker.setDangerMinutes(c.dangerMinutes);
    leagueEmit(leagueTracker.applyRankUpdate(parsed));
    return true;
}
// Quà trừ dần "thiếu X" của số nhập tay → lưu lại để mở lại app không mất (ghi đĩa gom 3s).
let leagueManualSaveT = null;
function leagueRememberManualNeed() {
    const l = leagueTracker.snapshot().league;
    const g = appConfig.games && appConfig.games.leaguecard;
    if (!l || l.source !== 'manual' || !g || !g.manual) return;
    g.manual = { ...g.manual, need: l.need };
    clearTimeout(leagueManualSaveT);
    leagueManualSaveT = setTimeout(() => { try { saveAppConfig(); } catch (e) {} }, 3000);
}
function leagueOnRankUpdate(data) {
    const parsed = LeagueCard.parseRankUpdate(data);
    if (!parsed) return;
    leagueTracker.setDangerMinutes(leagueCfg().dangerMinutes);
    leagueEmit(leagueTracker.applyRankUpdate(parsed));
}
function leagueOnGift(g) {
    const coins = (Number(g.coinValue) || 0) * Math.max(1, parseInt(g.repeatCount, 10) || 1);
    const ev = leagueCfg().rescuer === false ? null : leagueTracker.applyGift({ uniqueId: g.uniqueId || g.userId, nickname: g.nickname, profilePicture: g.profilePicture, coins });
    const manualEv = leagueTracker.consumeGiftForManual(coins);   // chỉ khi số đang là nhập tay
    if (ev || manualEv) leagueEmit([...(ev ? [ev] : []), ...(manualEv || [])]);
    if (manualEv) leagueRememberManualNeed();
}

// Mở app chưa LIVE: hiện ngay số nhập tay (nếu bật) để streamer canh vị trí thẻ trên OBS.
try { leagueApplyManual(); } catch (e) {}

// Chống spam toast: lib bắn ERROR cho cả lỗi decode message WebSocket lặp lại giữa buổi live.
let lastTikTokErrorToast = { message: '', ts: 0 };
// 💬 Một bình luận (TikTok thật hoặc /api/test-chat): lọc từ cấm → phát cho mọi game + Dịch Thuật + Chào VIP / Bình chọn /
// Trồng Cây. Tên người đã được che từ cấm trong normalizeTikTokUser. Trả { blocked, nickname } để route thử báo kết quả.
function handleTikTokChat(data, { test = false } = {}) {
    if (!test) liveConnected = true;
    const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
    const comment = data?.comment ?? data?.content;   // v3 (2.4.4): content
    if (!test) rememberUserMapping(userId, uniqueId);
    // 🚫 từ cấm chung: không phát chữ cho game nào; chỉ báo "người này vừa bình luận" (tính tương tác, không hiện / đọc).
    // Bình luận chỉ gồm chữ số là cú pháp chơi (111, 222, 1-9, mã tù nhân) → không lọc, dù sheet có "111", "1111"…
    const blockedWord = commentFilterOn() && !CommentFilter.isNumberOnly(comment) ? CommentFilter.findForbidden(comment, getCommentForbidden()) : '';
    if (blockedWord) {
        commentFilterStats.blocked += 1;
        commentFilterStats.lastWord = blockedWord;
        commentFilterStats.lastAt = Date.now();
        broadcast('chat:blocked', { uniqueId, nickname, userId, profilePicture, createTime: Date.now() });
        if (!test) vipHandleActivity(data?.user);
        return { blocked: blockedWord, nickname };
    }
    const chatPayload = {
        uniqueId, nickname,
        userId,
        profilePicture,
        comment,
        createTime: Date.now()
    };
    const coFanChange = test ? null : coFansTouch(chatPayload, 'chat');   // 🏢 Creator Online: mã club 1–5
    broadcast('chat', chatPayload);
    if (coFanChange) io.emit('creatoronline:fan', coFanChange);
    processLiveTranslateChat(chatPayload);
    if (!test) {
        // Chào muộn (TikTok không gửi tín hiệu vào phòng cho người này) + trigger 'comment' riêng
        vipHandleActivity(data?.user);
        try { handleVipWelcomeEvent('comment', { extra: extractTikTokUser(data), uniqueId, nickname, level, profilePicture, verified, comment }); } catch (e) {}
    }
    try { handleVoteCommentChat({ uniqueId, comment }); } catch (e) {}
    try { handleTrongCayChat({ uniqueId, nickname, profilePicture, comment }); } catch (e) {}
    return { blocked: '', nickname };
}

function attachConnectionEvents(conn, lib) {
    const { WebcastEvent, ControlEvent } = lib;   // từ loadTikTokConnector() — không có biến toàn cục để tránh dùng trước khi nạp
    conn.on(ControlEvent.DECODED_DATA || 'decodedData', (method, data) => {
        if (conn !== connection) return;
        try { rankLog.record(method, data, { roomId: currentRoomId }); } catch (e) {}
    });
    conn.on(WebcastEvent.RANK_UPDATE || 'rankUpdate', (data) => {
        if (conn !== connection) return;
        try { leagueOnRankUpdate(data); } catch (e) { console.warn('[leaguecard] rankUpdate lỗi:', e?.message || e); }
    });
    conn.on(ControlEvent.CONNECTED, (state) => {
        liveConnected = true;
        currentRoomId = state?.roomId;
        vipStartRoom();
        leagueStartRoom();
        captionAutoStartOnLive();
        broadcast('status', { connected: true, username: currentUsername, roomId: currentRoomId });
        setLiveDashboardStatus(true, { username: currentUsername, roomId: currentRoomId });
        console.log(`[tiktok] Connected to roomId=${currentRoomId}`);
    });
    conn.on(ControlEvent.DISCONNECTED, (info) => {
        // Các connection thử-nghiệm bị loại trong vòng retry cũng bắn DISCONNECTED → chỉ xử lý connection đang dùng.
        if (conn !== connection) return;
        liveConnected = false;
        resetPkState(); clearPkAutoQueue();   // rớt giữa trận PK: dừng timer lead/behind, xả queue auto
        const willRetry = scheduleAutoReconnect();
        broadcast('status', { connected: false, username: currentUsername, reason: 'disconnected', reconnecting: willRetry, attempt: reconnectAttempt, nextInMs: willRetry ? reconnectDelayMs : 0 });
        setLiveDashboardStatus(false, { username: currentUsername });
        console.log(`[tiktok] Disconnected (code=${info?.code ?? '?'})${willRetry ? ` — tự kết nối lại sau ${Math.round(reconnectDelayMs / 1000)}s` : ''}`);
    });
    conn.on(WebcastEvent.STREAM_END, () => {
        if (conn !== connection) return;
        liveConnected = false;
        streamEnded = true;
        cancelAutoReconnect();
        resetPkState(); clearPkAutoQueue();
        broadcast('status', { connected: false, username: currentUsername, reason: 'streamEnd' });
        setLiveDashboardStatus(false, { username: currentUsername });
        console.log('[tiktok] LIVE đã kết thúc (streamEnd)');
    });
    conn.on(ControlEvent.ERROR, (err) => {
        // Lib bắn { info, exception } (không phải Error) → err.message undefined, trước đây in ra '[object Object]'.
        const exc = err?.exception;
        const info = String(err?.info || '');
        const message = String(exc?.message || err?.message || info || err || 'unknown').split('\n')[0];
        console.error(`[tiktok] error${info ? ` (${info})` : ''}:`, message);
        // 2.4.4 bắn ERROR cho cả các bước fallback bình thường lúc connect (HTML → API → Euler) và cho các
        // connection thử-nghiệm trong vòng retry → chỉ đẩy toast lên UI cho connection đang dùng.
        if (conn !== connection) return;
        const now = Date.now();
        if (lastTikTokErrorToast.message === message && now - lastTikTokErrorToast.ts < 30000) return;
        lastTikTokErrorToast = { message, ts: now };
        broadcast('error', { message });
    });

    conn.on(WebcastEvent.CHAT, (data) => handleTikTokChat(data));

    conn.on(WebcastEvent.GIFT, (data) => {
        // giftType 1 = quà có combo: TikTok bắn 1 message MỖI lần bấm + 1 message repeatEnd=1 chốt combo.
        // Chỉ xử lý message chốt → 1 combo đếm 1 lần. Fallback extendedGiftInfo.type khi giftDetails thiếu
        // (trước đây thiếu giftDetails → coi là không-combo → mỗi lần bấm đếm thêm 1 lần).
        // v3 (2.4.4): data.gift = Gift {id, name, type, diamondCount, image}; 2.1.0: data.giftDetails {giftType, giftName, ...}.
        // extendedGiftInfo ở 2.4.4 gần như không bao giờ gắn (so giftId string với id number) → chỉ là fallback cuối.
        const giftType = data?.gift?.type ?? data?.giftDetails?.giftType ?? data?.extendedGiftInfo?.type ?? data?.gift?.gift_type ?? data?.giftType;
        const isStreak = Number(giftType) === 1;
        const repeatEnded = data?.repeatEnd ?? data?.repeat_end ?? data?.isStreakEnd ?? data?.is_streak_end;   // v3: number 0/1, cũ: boolean
        if (isStreak && !repeatEnded) return;
        maybeTriggerPkItemFromGift(data);   // sau cổng streak → 1 combo = 1 lần xét găng tay (không lặp mỗi tick)
        const tkUser = extractTikTokUser(data);
        rememberUserMapping(tkUser.userId, tkUser.uniqueId);
        vipHandleActivity(data?.user);
        const realGiftId = getTikTokGiftId(data);
        const diamondRaw = data?.gift?.diamondCount ?? data?.giftDetails?.diamondCount ?? data?.gift?.diamond_count ?? data?.extendedGiftInfo?.diamond_count;
        const rawGiftName = data?.gift?.name || data?.giftDetails?.giftName || data?.giftName;
        const rawGiftPicture = pickAvatarUrl(data?.gift?.image) || pickAvatarUrl(data?.giftDetails?.giftImage) || data?.giftDetails?.giftImage?.giftPictureUrl || pickAvatarUrl(data?.extendedGiftInfo?.image) || '';
        // 🎵 Quà Ca khúc: mỗi bài 1 id riêng → gom về quà ảo 'music' (trừ khi bài đó đã có trong bảng quà).
        const isMusic = MusicGifts.isMusicGiftEvent(data) || MusicGifts.isMusicImageUrl(rawGiftPicture);
        const musicInfo = isMusic ? MusicGifts.musicInfoFromEvent(data) : null;
        if (isMusic) {
            rememberMusicSong(realGiftId, { lyrics: rawGiftName || '', image: rawGiftPicture, price: Number(diamondRaw) || 0, ...(musicInfo || {}) });
            console.log(`[music-gift] id=${realGiftId} "${rawGiftName || ''}" musicInfo=${musicInfo ? JSON.stringify(musicInfo) : 'không có'}`);
        }
        const giftPayload = MusicGifts.aliasMusicGift({
            tkUser,
            uniqueId: tkUser.uniqueId,
            nickname: tkUser.nickname,
            userId: tkUser.userId,
            level: tkUser.level,
            verified: tkUser.verified,
            profilePicture: tkUser.profilePicture,
            giftId: realGiftId,
            giftName: rawGiftName,
            giftPicture: rawGiftPicture,
            diamondCount: (diamondRaw == null || diamondRaw === '') ? undefined : Number(diamondRaw),
            repeatCount: normalizeGiftRepeatCount(data),
            source: 'tiktok'
        }, { isMusic, hasSheetItem: !!giftMap[String(realGiftId)], catalog: musicGiftCatalog, info: musicInfo });
        const giftId = giftPayload.giftId;
        emitGift(giftPayload);

        // ===== OBS Bridge — enqueue effect cho mỗi gift trong combo =====
        // Tặng 1x → enqueue 1; tặng 5x → enqueue 5; ... drain tuần tự theo cooldownMs.
        try {
            const giftIdStr = giftId;
            const rc = normalizeGiftRepeatCount(data);
            obsBridgeEnqueueForGift(giftIdStr, rc);
        } catch (e) {
            console.error('[obs-bridge] enqueue from gift event error:', e.message);
        }
    });

    conn.on(WebcastEvent.MEMBER, (data) => {
        // TikTok đôi khi strip user.uniqueId → fallback userId (numeric) + actionDescription
        // MemberMessage có userId riêng → normalizeTikTokUser đã fallback data.userId
        const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
        const action = data?.action;     // 1=JOINED, 3=SUBSCRIBED
        const actionDesc = data?.actionDescription || '';
        rememberUserMapping(userId, uniqueId);
        rememberLiveTranslateUser(liveTranslateRecentMembers, { userId, uniqueId });
        const tkUser = extractTikTokUser(data);
        const joinSig = vwSignals.fromMember(data, vipSignalCtx());
        broadcast('member', { uniqueId, nickname, level: joinSig?.user.level || level, verified, action: Number(action) || 0, topUserNo: tkUser.topUserNo, fansLevel: joinSig ? joinSig.user.fansLevel : tkUser.fansLevel, isSubscriber: tkUser.isSubscriber });
        // Verbose log — dump tất cả field hữu ích để user thấy TikTok gửi gì
        console.log(`[vipwelcome] MEMBER event raw: uniqueId="${uniqueId || ''}" userId="${userId || ''}" nickname="${nickname || ''}" level=${joinSig?.user.level ?? level} fans=${joinSig?.user.fansLevel ?? 0} verified=${verified} action=${action} desc="${actionDesc}"`);
        vipDiagLog('member', data);
        // Tín hiệu vào phòng chính (mọi action trừ 3 = đăng ký kênh)
        if (joinSig) vipHandleJoinSignal(joinSig);
        // TikTok gửi MEMBER action=3 khi viewer ĐĂNG KÝ (subscribe) kênh — tín hiệu thật, trước đây chỉ log.
        if (Number(action) === 3) {
            liveStats.totalSubscribes = (liveStats.totalSubscribes || 0) + 1;
            emitLiveStatsThrottled();
            broadcast('subscribe', { uniqueId, nickname, level, verified });
            try { handleVipWelcomeEvent('subscribe', { uniqueId: uniqueId || tkUser.uniqueId, nickname, level, profilePicture, verified, extra: tkUser }); } catch (e) {}
        }
    });
    conn.on(WebcastEvent.LIKE, (data) => {
        const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
        const likeCount = Number(data?.likeCount ?? data?.count) || 1;   // v3 (2.4.4): count
        rememberUserMapping(userId, uniqueId);
        // userId + profilePicture: 🏢 Creator Online khoá fan theo userId và cần avatar khi người xem vào bằng thả tim
        const likePayload = { uniqueId, userId, nickname, profilePicture, likeCount };
        coFansTouch(likePayload, 'like');
        broadcast('like', likePayload);
        liveStats.totalLikes += likeCount; emitLiveStatsThrottled();
        // Chào muộn + trigger 'like' riêng
        vipHandleActivity(data?.user);
        try { handleVipWelcomeEvent('like', { extra: extractTikTokUser(data), uniqueId, nickname, level, profilePicture, verified, likeCount }); } catch (e) {}
    });
    conn.on(WebcastEvent.SOCIAL, (data) => {
        const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
        rememberUserMapping(userId, uniqueId);
        // v3 (2.4.4): WebcastSocialMessage không có data.label — dựng nhãn từ common.displayText
        // (key pm_mt_msg_viewer = chia sẻ, *follow* = theo dõi) để UI không hiện '💗 <nick> ' trống.
        const dtKey = String(data?.common?.displayText?.key || '').toLowerCase();
        const dtPattern = String(data?.common?.displayText?.defaultPattern || '').replace(/{d+:[a-z_]+}/gi, '').trim();
        const label = dtKey.includes('follow') ? 'đã theo dõi' : (dtKey.includes('share') || dtKey.includes('mt_msg')) ? 'đã chia sẻ LIVE' : dtPattern;
        const socialPayload = { uniqueId, userId, nickname, profilePicture, label };
        coFansTouch(socialPayload, 'social');
        broadcast('social', socialPayload);
        vipHandleActivity(data?.user);
    });
    // FOLLOW event
    conn.on(WebcastEvent.FOLLOW, (data) => {
        const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
        rememberUserMapping(userId, uniqueId);
        liveStats.totalFollows += 1; emitLiveStatsThrottled();
        console.log(`[vipwelcome] FOLLOW: @${uniqueId} "${nickname || ''}"`);
        try { handleVipWelcomeEvent('follow', { extra: extractTikTokUser(data), uniqueId, nickname, level, profilePicture, verified }); } catch (e) {}
        vipHandleActivity(data?.user);
    });
    // SHARE event
    conn.on(WebcastEvent.SHARE, (data) => {
        const { uniqueId, userId, nickname, level, profilePicture, verified } = normalizeTikTokUser(data?.user, data);
        rememberUserMapping(userId, uniqueId);
        liveStats.totalShares += 1; emitLiveStatsThrottled();
        console.log(`[vipwelcome] SHARE: @${uniqueId} "${nickname || ''}"`);
        try { handleVipWelcomeEvent('share', { extra: extractTikTokUser(data), uniqueId, nickname, level, profilePicture, verified }); } catch (e) {}
        vipHandleActivity(data?.user);
    });
    // ENVELOPE event — TikTok bao lì xì
    conn.on(WebcastEvent.ENVELOPE, (data) => {
        // WebcastEnvelopeMessage không có data.user — người gửi nằm ở envelopeInfo {sendUserId, sendUserName, sendUserAvatar}.
        const env = data?.envelopeInfo || {};
        const nu = normalizeTikTokUser(data?.user || env.user, data);
        const uniqueId = nu.uniqueId;
        const userId = nu.userId || tiktokIdToString(env.sendUserId);
        const nickname = nu.nickname || env.sendUserName || '';
        const level = nu.level;
        const profilePicture = nu.profilePicture || pickAvatarUrl(env.sendUserAvatar);
        const verified = nu.verified;
        rememberUserMapping(userId, uniqueId);
        console.log(`[vipwelcome] ENVELOPE (bao lì xì): @${uniqueId}`);
        try { handleVipWelcomeEvent('envelope', { extra: extractTikTokUser(data), uniqueId, nickname, level, profilePicture, verified }); } catch (e) {}
        vipHandleActivity(data?.user || (userId ? { id: userId, displayId: uniqueId, nickname } : null));
    });
    conn.on(WebcastEvent.ROOM_USER, (data) => {
        // v3 (2.4.4): total/totalUser là CHUỖI, ranks/seats thay ranksList/seatsList → bọc Number().
        const rawViewer = data?.viewerCount ?? data?.total ?? data?.totalUser;
        const vNum = (rawViewer == null || rawViewer === '') ? NaN : Number(rawViewer);
        const viewerCount = Number.isFinite(vNum) ? vNum : undefined;
        broadcast('roomUser', { viewerCount });
        if (viewerCount != null) { liveStats.viewerCount = viewerCount; emitLiveStatsThrottled(); }
        try {
            const lists = [];
            const ranks = data?.ranksList ?? data?.ranks;
            const seats = data?.seatsList ?? data?.seats;
            if (Array.isArray(ranks)) lists.push(...ranks);
            if (Array.isArray(seats)) lists.push(...seats);
            // Người trong top/ghế đang ở trong phòng → chỉ là "hoạt động" (chào muộn nếu chưa từng chào).
            // Rời top KHÔNG phải rời phòng nên không còn dò drop-out ở đây.
            for (const contributor of lists) {
                const u = contributor?.user;
                if (!u) continue;
                const { uniqueId, userId } = normalizeTikTokUser(u);
                rememberUserMapping(userId, uniqueId);
                vipHandleActivity(u, { topUserNo: Number(contributor?.rank) || 0 });
            }
        } catch (e) { console.error('[vipwelcome] ROOM_USER process error:', e); }
    });
    // Banner vào phòng của TikTok: người xem cấp cao / fan club thường KHÔNG có MEMBER mà đến qua đây
    // (msgType 9 = theo cấp, 11 = theo fan, 15 = ẩn danh; superfan joined theo content.key).
    conn.on(WebcastEvent.BARRAGE || 'barrage', (data) => {
        try {
            const sig = vwSignals.fromBarrage(data, vipSignalCtx());
            if (!sig) return;
            vipDiagLog('barrage', data);
            console.log(`[vipwelcome] BARRAGE vào phòng (${sig.source}): @${sig.user.uniqueId || '?'} "${sig.user.nickname}" LV${sig.user.level} FAN${sig.user.fansLevel}`);
            vipHandleJoinSignal(sig);
        } catch (e) { console.error('[vipwelcome] BARRAGE process error:', e); }
    });

    // ====== PK TikTok auto-bind (BETA — refined) ======
    // BattleAction: 4=OPEN, 5=FINISH, 6=CUT_SHORT
    // BattleTaskMessageType: 0=START, 1=UPDATE, 2=SETTLE, 3=REWARD_SETTLE
    //
    // Phase mapping:
    //   start    ← LINK_MIC_BATTLE action=4
    //   mission  ← LINK_MIC_BATTLE_TASK type=0
    //   x2 / x3  ← LINK_MIC_BATTLE_TASK settle/reward payload có multiplier
    //   warn10s  ← fallback timer hoặc khi server gửi countdown
    //   lead/behind ← periodic check ARMIES (mỗi 30s)
    //   win/lose ← FINISH + so sánh scores với hostTeamIndex
    //   glove/mist/hammer/time ← GIFT item PK theo giftName/describe/label/monitorExtra

    // Server-side QUEUE — drain serial để effect không overlap
    let pkAutoQueue = [];
    let pkAutoDrainTimer = null;
    const PK_AUTO_DRAIN_GAP_MS = 3500;   // ~3.5s giữa các effect (đủ cho video ngắn)
    const pkAutoLastEnqueueAt = new Map();
    const PK_AUTO_SAME_KEY_GAP_MS = 4000;
    function pkAutoEnqueue(key, reason) {
        const cfg = appConfig.games?.pktiktok;
        if (!cfg || cfg.enabled === false || !cfg.autoBindPkDuo) return;
        const now = Date.now();
        // Dedupe: cùng phase vừa vào queue <4s (vd găng tay báo từ cả gift.matchInfo lẫn armies.triggerCriticalStrike)
        if (now - (pkAutoLastEnqueueAt.get(key) || 0) < PK_AUTO_SAME_KEY_GAP_MS) {
            console.log(`[pktiktok] AUTO skip dup "${key}" (<${PK_AUTO_SAME_KEY_GAP_MS}ms)`);
            return;
        }
        // Dedupe: nếu phase này đã ở cuối queue, skip
        if (pkAutoQueue.length > 0 && pkAutoQueue[pkAutoQueue.length - 1].key === key) {
            console.log(`[pktiktok] AUTO skip dup "${key}"`);
            return;
        }
        pkAutoLastEnqueueAt.set(key, now);
        pkAutoQueue.push({ key, reason, ts: now });
        console.log(`[pktiktok] AUTO queued → ${key} (reason: ${reason}), queue=${pkAutoQueue.length}`);
        if (!pkAutoDrainTimer) drainPkAutoNow();
    }
    function drainPkAutoNow() {
        if (pkAutoQueue.length === 0) { pkAutoDrainTimer = null; return; }
        const item = pkAutoQueue.shift();
        // Server emit thẳng 'pktiktok:play' (không đi vòng qua panel client) → auto chạy kể cả
        // khi app đang ở màn hình khác. Vẫn phát 'pktiktok:autoTrigger' để panel ghi Log (chỉ log).
        const r = (global.__pktiktokEmitPlay || (() => ({ ok: false, error: 'emit_fn_missing' })))(item.key, 'auto');
        if (r.ok) {
            console.log(`[pktiktok] AUTO emit → ${item.key} (reason: ${item.reason})`);
        } else {
            console.log(`[pktiktok] AUTO skip → ${item.key} (reason: ${item.reason}) — ${r.error}`);
        }
        io.emit('pktiktok:autoTrigger', { ...item, played: r.ok, error: r.ok ? undefined : r.error });
        pkAutoDrainTimer = setTimeout(drainPkAutoNow, PK_AUTO_DRAIN_GAP_MS);
    }
    function clearPkAutoQueue() {
        pkAutoQueue = [];
        if (pkAutoDrainTimer) { clearTimeout(pkAutoDrainTimer); pkAutoDrainTimer = null; }
    }

    // PK match state
    let pkActive = false;
    let pkStartTs = 0;
    let pkTimers = [];
    let pkHostTeamIndex = -1;
    let pkLastScoreSnap = null;
    let pkLastLeadState = '';
    let pkLastPeriodicScore = 0;
    let pkMissionTriggered = false;
    let pkBonusTriggered = new Set();
    let pkItemGiftSeen = new Map();
    let pkPendingRewardMultiple = 0;
    let pkWarn10sScheduled = false;
    const PK_PERIODIC_LEAD_CHECK_MS = 30_000;
    // Track gifts gửi vào HOST trong khoảng PK active — để detect TOP 1 khi PK end
    let pkGiftDuringMatch = new Map();
    // Expose tracker cho emitGift
    pktiktokTrackPkGift = (g) => {
        if (!pkActive || !g.uniqueId) return;
        const k = String(g.uniqueId).toLowerCase();
        const cur = pkGiftDuringMatch.get(k) || {
            uniqueId: g.uniqueId, nickname: g.nickname, profilePicture: g.profilePicture, level: g.level || 0,
            totalDiamond: 0, totalCount: 0
        };
        cur.totalDiamond += Number(g.diamond) || 0;
        cur.totalCount += 1;
        if (g.nickname) cur.nickname = g.nickname;
        if (g.profilePicture) cur.profilePicture = g.profilePicture;
        if (g.level) cur.level = g.level;
        pkGiftDuringMatch.set(k, cur);
    };
    // Tín hiệu PK chung cho game khác (⛓️ Nhà Tù: kéo co theo PK) — chỉ dữ liệu thật: mở trận, điểm 2 bên, kết thúc.
    function emitPkState(phase, extra = {}) {
        const snap = (pkLastScoreSnap || []).map(Number).map(v => (Number.isFinite(v) ? v : 0));
        const hi = pkHostTeamIndex >= 0 ? pkHostTeamIndex : 0;
        const others = snap.filter((_, i) => i !== hi);
        io.emit('pk:state', { phase, active: pkActive, host: snap[hi] || 0, opp: others.length ? Math.max(...others) : 0, ts: Date.now(), ...extra });
    }
    function resetPkState() {
        pkActive = false;
        pkHostTeamIndex = -1;
        pkLastScoreSnap = null;
        pkLastLeadState = '';
        pkLastPeriodicScore = 0;
        pkMissionTriggered = false;
        pkBonusTriggered = new Set();
        pkItemGiftSeen.clear();
        pkPendingRewardMultiple = 0;
        pkWarn10sScheduled = false;
        pkGiftDuringMatch.clear();
        clearPkTimers();
    }
    function clearPkTimers() {
        for (const t of pkTimers) {
            if (t && t._isInterval) clearInterval(t._handle);
            else clearTimeout(t);
        }
        pkTimers = [];
    }

    function prunePkItemSeen(now = Date.now()) {
        for (const [k, ts] of pkItemGiftSeen) {
            if (now - ts > 60_000) pkItemGiftSeen.delete(k);
        }
    }


    // GĂNG TAY (glove) = Boosting Glove / critical strike x5 — TÍN HIỆU THẬT theo schema
    // tiktok-live-connector v2: WebcastGiftMessage.matchInfo { critical, multiplierValue }.
    // KHÔNG dùng matchInfo.effectCardInUse: cờ đó bật cho MỌI loại effect card (kể cả Sương Mù,
    // Búa Choáng...) nên sẽ báo nhầm là glove. Chỉ nhận diện đúng đòn chí mạng x5.
    // Các item Sương Mù / Búa Choáng / Thêm Giờ: TikTok KHÔNG gửi field phân biệt được trong
    // webcast protocol → không auto-detect (chỉ chạy tay / phím tắt), đã bỏ code dò-chữ vì nó
    // không bao giờ khớp và chỉ tạo cảm giác "có auto" giả.
    function detectPkItemFromGift(data) {
        const matchInfo = data?.matchInfo || {};
        if (String(matchInfo.critical || '') === '1' || Number(matchInfo.multiplierValue || 0) >= 5) {
            return 'glove';
        }
        return '';
    }

    function maybeTriggerPkItemFromGift(data) {
        if (!pkActive) return;   // găng tay chỉ có nghĩa trong trận PK — ngoài trận bỏ qua (trước đây bắn cả ngoài trận)
        const key = detectPkItemFromGift(data);
        if (!key) return;
        const now = Date.now();
        prunePkItemSeen(now);
        const giftId = getTikTokGiftId(data);
        const uniqueId = normalizeTikTokUser(data?.user, data).uniqueId;
        // groupId mặc định là chuỗi "0" (truthy) → trước đây mọi quà không-combo gộp chung 1 key và bị chặn oan;
        // còn khi cả groupId lẫn msgId trống thì key dính Date.now() → không bao giờ dedupe. Sửa: ưu tiên groupId
        // thật, rồi logId/msgId, cuối cùng gom theo cửa sổ 5s.
        const groupId = String(data?.groupId || data?.gift?.group_id || '');
        const logId = String(data?.logId || data?.common?.msgId || data?.msgId || '');
        const uniq = (groupId && groupId !== '0') ? 'g' + groupId : (logId ? 'm' + logId : 't' + Math.floor(now / 5000));
        const dedupeKey = [key, giftId, uniqueId, uniq].join(':');
        if (pkItemGiftSeen.has(dedupeKey)) return;
        pkItemGiftSeen.set(dedupeKey, now);
        pkAutoEnqueue(key, `gift_item (${key}, giftId=${giftId || 'unknown'}, user=@${uniqueId || 'unknown'})`);
    }

    function triggerPkBonus(multiplier, reason) {
        const key = multiplier === 3 ? 'x3' : 'x2';
        if (pkBonusTriggered.has(key)) return;
        pkBonusTriggered.add(key);
        pkAutoEnqueue(key, `${reason}_x${multiplier}`);
    }

    function readRewardMultiple(data) {
        const direct = Number(
            data?.taskStart?.battleBonusConfig?.rewardPeriodConfig?.rewardMultiple ||
            data?.start?.config?.rewardConfig?.rewardMultiple ||          // v3 (2.4.4): start.config.rewardConfig
            data?.battleBonusConfig?.rewardPeriodConfig?.rewardMultiple ||
            data?.config?.rewardConfig?.rewardMultiple ||
            data?.rewardPeriodConfig?.rewardMultiple ||
            data?.rewardConfig?.rewardMultiple ||
            0
        );
        if (direct === 2 || direct === 3) return direct;
        // KHÔNG dò chữ "x2"/"x3" trong toàn payload nữa: battleId/logId/monitorExtra là chuỗi dài rất dễ
        // chứa "x2" giả → bắn nhầm. Chỉ tin field thật rewardPeriodConfig.rewardMultiple.
        return 0;
    }

    function isTaskSettleSucceeded(data) {
        const result = data?.taskSettle?.taskResult ?? data?.taskSettle?.result;      // v3 (2.4.4): taskSettle.result
        const rewardStatus = data?.rewardSettle?.status ?? data?.reward?.status;     // v3 (2.4.4): reward.status
        if (result === 0 || result === 2) return true;
        if (rewardStatus === 0) return true;
        return false;
    }

    function getBattleDurationSec(data) {
        return Number(
            data?.battleSetting?.duration ||
            data?.battleSettings?.duration ||
            data?.battleConfig?.battleSetting?.duration ||
            data?.battleConfig?.duration ||
            data?.duration ||
            0
        );
    }

    function getBattleEndDelayMs(data) {
        const endTime = Number(
            data?.battleSetting?.endTimeMs ||
            data?.battleSettings?.endTimeMs ||
            data?.battleConfig?.battleSetting?.endTimeMs ||
            0
        );
        if (endTime > 0) return endTime - Date.now();
        const startTime = Number(
            data?.battleSetting?.startTimeMs ||
            data?.battleSettings?.startTimeMs ||
            data?.battleConfig?.battleSetting?.startTimeMs ||
            0
        );
        const durationSec = getBattleDurationSec(data);
        if (startTime > 0 && durationSec > 0) return (startTime + durationSec * 1000) - Date.now();
        if (durationSec > 20 && pkStartTs > 0) return (pkStartTs + durationSec * 1000) - Date.now();
        return 0;
    }

    function scheduleWarn10s(data, reason) {
        if (!pkActive || pkWarn10sScheduled) return;
        const endDelayMs = getBattleEndDelayMs(data);
        const durationSec = getBattleDurationSec(data);
        let warnDelay = endDelayMs > 0 ? endDelayMs - 10_000 : 0;
        if (warnDelay <= 0 && durationSec > 20) warnDelay = (durationSec - 10) * 1000;
        if (warnDelay > 0) {
            pkWarn10sScheduled = true;
            console.log(`[pktiktok] PK warn10s scheduled in ${(warnDelay / 1000).toFixed(1)}s (reason=${reason}, duration=${durationSec || 'n/a'})`);
            pkTimers.push(setTimeout(() => {
                if (pkActive) pkAutoEnqueue('warn10s', `warn10s_${reason}`);
            }, warnDelay));
        }
    }

    // Helper: extract teams + scores từ raw armies/battle data — log tất cả để debug
    function parseTeamsArmies(data) {
        const teams = [];
        // ts-proto luôn tạo teamArmies: [] (mảng rỗng = truthy) → chuỗi || cũ dừng ngay ở đó và KHÔNG BAO GIỜ đọc
        // tới map armies/battleItems của trận 1v1 → điểm luôn null → lead/behind không chạy, win/lose mất fallback.
        const nonEmpty = (v) => !!v && (Array.isArray(v) ? v.length > 0 : (typeof v === 'object' && Object.keys(v).length > 0));
        // v3 (2.4.4): LINK_MIC_BATTLE.armies / anchorsInfo là mảng wrapper [{key, value}] (map entry); LINK_MIC_ARMIES.armies là
        // map anchorId → BattleUserArmies {userArmies[], hostscore (chữ s THƯỜNG), anchorIdStr}; teamArmies[].teamUser (cũ teamUsers).
        const raw = [data?.teamArmies, data?.battleArmies, data?.battleItems, data?.teams, data?.armies, data?.anchorsInfo].find(nonEmpty) || [];
        const unwrap = (x) => (x && typeof x === 'object' && x.key != null && x.value && typeof x.value === 'object') ? x.value : x;
        const list = (Array.isArray(raw) ? raw : Object.values(raw || {})).map(unwrap);
        if (Array.isArray(list)) {
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                const score = Number(t?.teamTotalScore ?? t?.userArmies?.hostScore ?? t?.userArmies?.hostscore ?? t?.hostScore ?? t?.hostscore ?? t?.points ?? t?.totalScore ?? t?.score ?? t?.totalDiamondCount ?? t?.totalUserCount ?? 0) || 0;
                const linkedUsers = [t?.hostsList, t?.hosts, t?.userList]
                    .flatMap(v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
                const anchorIds = [
                    t?.hostUserId, t?.anchorIdStr, t?.userArmies?.anchorIdStr, t?.hostUser?.userId, t?.hostUser?.id,
                    t?.user?.userId, t?.user?.idStr, t?.user?.id,
                    ...(t?.teamUsers || []), ...(t?.teamUser || []), ...linkedUsers
                ].map(u => (u && typeof u === 'object')
                    ? (tiktokIdToString(u.userIdStr) || tiktokIdToString(u.userId) || tiktokIdToString(u.id) || String(u.uniqueId || ''))
                    : tiktokIdToString(u)).filter(Boolean);
                teams.push({ index: i, score, anchorIds, raw: t });
            }
        }
        if (teams.length === 0 && Array.isArray(data?.battleUsers)) {
            for (let i = 0; i < data.battleUsers.length; i++) {
                const u = data.battleUsers[i];
                teams.push({ index: i, score: 0, anchorIds: [String(u?.userId || u?.id || u?.uniqueId || '')].filter(Boolean), raw: u });
            }
        }
        return teams;
    }

    conn.on(WebcastEvent.LINK_MIC_BATTLE, (data) => {
        const action = data?.battleConfig?.battleAction ?? data?.action ?? null;
        const battleStatus = data?.battleStatus ?? data?.battleSettings?.status;
        const currentRound = data?.currentRound;
        console.log(`[pktiktok] LINK_MIC_BATTLE action=${action} status=${battleStatus} round=${currentRound} keys=${Object.keys(data || {}).join(',').slice(0,200)}`);
        if (action === 4 /* OPEN */ || (action == null && !pkActive && (Array.isArray(data?.battleUsers) || data?.anchorInfo || data?.anchorsInfo || data?.battleId))) {
            resetPkState();
            pkActive = true;
            pkStartTs = Date.now();
            clearPkAutoQueue();
            pkAutoEnqueue('start', 'battle_open');
            // Identify host team — match userId của owner
            try {
                const teams = parseTeamsArmies(data?.battleConfig || data);
                const ownerId = String(currentHostUserId || '');
                if (ownerId) {
                    for (const t of teams) {
                        if (t.anchorIds.includes(ownerId)) { pkHostTeamIndex = t.index; break; }
                    }
                }
                if (pkHostTeamIndex < 0 && teams.length > 0 && Array.isArray(data?.battleUsers)) {
                    const hostIdx = data.battleUsers.findIndex(u => String(u?.userId || u?.id || '') === ownerId);
                    if (hostIdx >= 0) pkHostTeamIndex = hostIdx;
                }
                if (pkHostTeamIndex < 0 && teams.length > 0) pkHostTeamIndex = 0;
                console.log(`[pktiktok] PK OPEN: hostTeamIndex=${pkHostTeamIndex}, teams=${teams.length}, ownerId=${ownerId}`);
            } catch (e) {}
            emitPkState('start');
            scheduleWarn10s(data, 'battle_open');
            if (!pkWarn10sScheduled) console.log(`[pktiktok] PK duration/endTime chưa có trong LINK_MIC_BATTLE — sẽ thử lại ở ARMIES`);
            // Periodic lead/behind check (mỗi 30s)
            const periodicCheck = setInterval(() => {
                if (!pkActive) { clearInterval(periodicCheck); return; }
                if (!pkLastScoreSnap || pkHostTeamIndex < 0) return;
                const hostScore = pkLastScoreSnap[pkHostTeamIndex] || 0;
                const others = pkLastScoreSnap.filter((_, i) => i !== pkHostTeamIndex);
                const maxOther = Math.max(0, ...others);
                let newState = '';
                if (hostScore > maxOther) newState = 'lead';
                else if (hostScore < maxOther) newState = 'behind';
                else newState = 'tie';
                if (newState !== pkLastLeadState && (newState === 'lead' || newState === 'behind')) {
                    pkLastLeadState = newState;
                    pkAutoEnqueue(newState, `periodic_30s (host=${hostScore} vs max_opp=${maxOther})`);
                }
            }, PK_PERIODIC_LEAD_CHECK_MS);
            // Lưu interval handle để clear khi PK end
            pkTimers.push({ _isInterval: true, _handle: periodicCheck });
        } else if (action === 5 /* FINISH */ || action === 6 /* CUT_SHORT */) {
            // Xác định win/lose — ưu tiên kết quả CHÍNH THỨC do TikTok gửi kèm FINISH:
            //   1) teamBattleResult[].result  (Result enum: 0=WIN, 1=LOSE, 2=DRAW) khớp team của host.
            //   2) battleResult{userId → {result}} khớp userId của host.
            //   3) Fallback: so điểm snapshot gần nhất.
            // (Trước đây chỉ có (3) — kém chính xác khi TikTok có luật hoà/xử riêng.)
            let resultKey = null;
            const ownerId = String(currentHostUserId || '');
            const mapResult = (r) => (Number(r) === 1 ? 'lose' : 'win'); // 0 WIN / 2 DRAW → coi là 'win'
            try {
                const tbr = Array.isArray(data?.teamBattleResult) ? data.teamBattleResult : [];
                if (ownerId && tbr.length) {
                    const hostTeam = tbr.find(t => (Array.isArray(t?.teamUsers) ? t.teamUsers : Array.isArray(t?.teamUser) ? t.teamUser : [])   // v3: teamUser
                        .some(u => (tiktokIdToString(u?.userIdStr) || tiktokIdToString(u?.userId) || tiktokIdToString(u?.id)) === ownerId));
                    if (hostTeam && hostTeam.result != null) {
                        resultKey = mapResult(hostTeam.result);
                        console.log(`[pktiktok] PK FINISH: teamBattleResult host result=${hostTeam.result} → ${resultKey}`);
                    }
                }
                if (!resultKey && ownerId && data?.battleResult && typeof data.battleResult === 'object') {
                    const brMap = data.battleResult;   // map userId → {result}; phòng khi lib trả dạng [{key, value}]
                    const br = Array.isArray(brMap)
                        ? (brMap.find(e => String(e?.key ?? '') === ownerId)?.value || brMap.find(e => String(e?.userId || '') === ownerId))
                        : brMap[ownerId];
                    if (br && br.result != null) {
                        resultKey = mapResult(br.result);
                        console.log(`[pktiktok] PK FINISH: battleResult host result=${br.result} → ${resultKey}`);
                    }
                }
            } catch (e) { console.error('[pktiktok] FINISH result parse error:', e); }
            if (!resultKey && pkLastScoreSnap && pkHostTeamIndex >= 0) {
                const hostScore = pkLastScoreSnap[pkHostTeamIndex] || 0;
                const others = pkLastScoreSnap.filter((_, i) => i !== pkHostTeamIndex);
                const maxOther = Math.max(0, ...others);
                resultKey = hostScore >= maxOther ? 'win' : 'lose';
                console.log(`[pktiktok] PK FINISH: score fallback host=${hostScore} vs max_opp=${maxOther} → ${resultKey}`);
            }
            if (!resultKey) {
                resultKey = 'win';
                console.log(`[pktiktok] PK FINISH: no result/score data → default 'win' (action=${action})`);
            }
            // Detect TOP 1 contributor và lưu thông tin để rule check khi emit
            const sorted = [...pkGiftDuringMatch.values()].sort((a, b) => b.totalDiamond - a.totalDiamond);
            const top1 = sorted[0] || null;
            if (top1) {
                console.log(`[pktiktok] PK TOP 1 contributor: @${top1.uniqueId} "${top1.nickname || ''}" — ${top1.totalDiamond} 💎 (${top1.totalCount} gifts)`);
                // Save vào last context — phase trigger handler sẽ check rule khi emit
                pkLastTopContributor = top1;
            } else {
                pkLastTopContributor = null;
                console.log(`[pktiktok] PK FINISH: không có gift nào trong trận → không TOP 1`);
            }
            pkAutoEnqueue(resultKey, `battle_finish (action=${action})`);
            emitPkState('end', { active: false, result: resultKey });
            // Delay reset state để khi emit còn dùng được pkLastTopContributor. Queue auto drain 3.5s/item,
            // trước đây 10s là hết hạn khi có ≥3 item xếp trước win/lose → rule TOP 1 im lặng rớt về media mặc định.
            setTimeout(() => { pkLastTopContributor = null; }, 90_000);
            // Reset pkActive nhưng giữ data tracking
            pkActive = false;
            clearPkTimers();
        }
    });
    conn.on(WebcastEvent.LINK_MIC_BATTLE_TASK, (data) => {
        const type = data?.battleTaskMessageType ?? data?.taskMessageType;   // v3 (2.4.4): taskMessageType (giá trị giữ nguyên)
        const descText = data?.taskDescription || data?.description || data?.text || '';
        const rewardMultiple = readRewardMultiple(data);
        console.log(`[pktiktok] LINK_MIC_BATTLE_TASK type=${type} rewardMultiple=${rewardMultiple || '-'} pending=${pkPendingRewardMultiple || '-'} success=${isTaskSettleSucceeded(data)} keys=${Object.keys(data || {}).join(',').slice(0,200)}`);
        if (type === 0 /* START */) {
            if (!pkMissionTriggered) {
                pkMissionTriggered = true;
                pkAutoEnqueue('mission', 'task_start');
            }
            if (rewardMultiple === 2 || rewardMultiple === 3) {
                pkPendingRewardMultiple = rewardMultiple;
                console.log(`[pktiktok] PK task rewardMultiple cached: x${pkPendingRewardMultiple}`);
            }
        } else if (type === 2 /* SETTLE */ || type === 3 /* REWARD_SETTLE */) {
            const settledMultiple = rewardMultiple || pkPendingRewardMultiple;
            if ((settledMultiple === 2 || settledMultiple === 3) && isTaskSettleSucceeded(data)) {
                triggerPkBonus(settledMultiple, type === 2 ? 'task_settle_success' : 'task_reward_settle_success');
            } else if (settledMultiple === 2 || settledMultiple === 3) {
                console.log(`[pktiktok] PK task settle không success → không phát x${settledMultiple}`);
            }
        } else {
            if (rewardMultiple === 2 || rewardMultiple === 3) pkPendingRewardMultiple = rewardMultiple;
        }
    });
    conn.on(WebcastEvent.LINK_MIC_BATTLE_PUNISH_FINISH, (data) => {
        console.log(`[pktiktok] LINK_MIC_BATTLE_PUNISH_FINISH`);
        resetPkState();
    });
    conn.on(WebcastEvent.LINK_MIC_ARMIES, (data) => {
        // Cập nhật score snapshot mỗi khi armies thay đổi
        try {
            const teams = parseTeamsArmies(data);
            if (teams.length > 0) {
                pkLastScoreSnap = teams.map(t => t.score);
                console.log(`[pktiktok] LINK_MIC_ARMIES scores=[${pkLastScoreSnap.join(', ')}] hostIdx=${pkHostTeamIndex}`);
                if (pkActive) emitPkState('score');
            }
            scheduleWarn10s(data, 'armies');
            if (data?.triggerCriticalStrike) {
                pkAutoEnqueue('glove', `armies_critical_strike (giftId=${data?.giftId || 'unknown'})`);
            }
        } catch (e) { console.error('[pktiktok] armies parse error:', e); }
    });
    conn.on(WebcastEvent.LINK_MIC_METHOD, (data) => {
        try {
            // Chỉ dùng để canh lịch cảnh báo 10s cuối nếu có duration; KHÔNG dò item (không có
            // field phân biệt item trong sự kiện này).
            if (!pkWarn10sScheduled) scheduleWarn10s(data, 'linkmic_method');
            console.log(`[pktiktok] LINK_MIC_METHOD messageType=${data?.messageType} subType=${data?.subType || ''} duration=${data?.duration || ''}`);
        } catch (e) { console.error('[pktiktok] linkMicMethod parse error:', e); }
    });
}

// Log gói xếp hạng (bước 0 Thứ Hạng LIVE): đếm mọi method TikTok gửi + các dòng rank mới nhất.
app.get('/api/rank-log', (req, res) => {
    const n = Math.min(200, Math.max(0, parseInt(req.query.n, 10) || 50));
    res.json({ ok: true, ...rankLog.stats(), recent: rankLog.recent(n) });
});

// 🏆 Thứ Hạng LIVE — trạng thái hiện tại (overlay/panel lấy lúc mở) + mô phỏng gói rankUpdate để thử OBS
// khi chưa LIVE. Mô phỏng đi QUA ĐÚNG bộ đọc parseRankUpdate như gói thật.
app.get('/api/leaguecard/state', (req, res) => res.json({ ok: true, state: leagueTracker.snapshot() }));
let leagueSim = null;
function leagueSimPacket(s) {
    return { updates: [{ rankType: 13, ownRank: String(s.rank), currentScore: String(s.score), countdown: String(s.countdown),
        classInfo: { classType: s.classType, starCount: String(s.stars) },
        affiliatedInfo: { realTimeRank: String(s.rank),
            gapDesc: s.need > 0 ? { defaultPattern: 'Còn thiếu {0:string} điểm để giữ hạng', pieces: [{ stringValue: s.need.toLocaleString('en-US') }] } : { defaultPattern: 'Đã giữ hạng', pieces: [] },
            teamRankBonusTime: s.bonus ? { switch: true, startTimestamp: String(Math.floor(Date.now() / 1000) - 60), endTimestamp: String(Math.floor(Date.now() / 1000) + 900), bonusRate: '2', bonusTimeGiftId: s.bonusGiftId || '' } : undefined } }] };
}
const LEAGUE_SIM_NAMES = [['lan.anh', 'Lan Anh 🌸'], ['tuan_kiet', 'Tuấn Kiệt'], ['mai.mai', 'Mai Mai'], ['hoang.long99', 'Hoàng Long']];
app.post('/api/leaguecard/simulate', (req, res) => {
    const kind = String(req.body?.kind || '');
    const fresh = () => ({ classType: 1400, stars: 3, rank: 12, score: 8000, need: 1250, countdown: 7200, bonus: false });
    if (!leagueSim || kind === 'reset') { leagueSim = fresh(); if (kind === 'reset') leagueTracker.reset(); }
    const s = leagueSim;
    if (kind === 'clear') { leagueSim = null; leagueTracker.reset(); leagueEmit([]); return res.json({ ok: true }); }
    if (kind === 'gift') {
        const [uniqueId, nickname] = LEAGUE_SIM_NAMES[Math.floor(Math.random() * LEAGUE_SIM_NAMES.length)];
        const ev = leagueTracker.applyGift({ uniqueId, nickname, profilePicture: '', coins: [99, 299, 500, 1000][Math.floor(Math.random() * 4)] });
        leagueEmit(ev ? [ev] : []);
        return res.json({ ok: true, state: leagueTracker.snapshot() });
    }
    if (kind === 'rankUp') { s.rank = Math.max(1, s.rank - 3); s.score += 600; s.need = Math.max(0, s.need - 600); }
    else if (kind === 'rankDown') { s.rank += 4; s.need += 800; }
    else if (kind === 'star') s.stars = Math.min(9, s.stars + 1);
    else if (kind === 'danger') { s.rank = 58; s.need = 4870; s.score = 3000; s.countdown = 520; }
    else if (kind === 'kept') { s.need = 0; s.rank = Math.min(s.rank, 20); }
    else if (kind === 'promo') { s.classType = Math.min(2100, s.classType + 100); s.stars = 0; s.rank = 4; s.need = 0; s.countdown = 25200; }
    else if (kind === 'demote') { s.classType = Math.max(100, s.classType - 100); s.stars = Math.max(0, s.stars - 1); s.rank = 61; s.need = 2300; s.countdown = 25200; }
    else if (kind === 'bonus') s.bonus = !s.bonus;
    leagueTracker.setDangerMinutes(leagueCfg().dangerMinutes);
    leagueEmit(leagueTracker.applyRankUpdate(LeagueCard.parseRankUpdate(leagueSimPacket(s))));
    res.json({ ok: true, state: leagueTracker.snapshot() });
});

// 🏆 Nhập tay số giải đấu (bậc, mảnh, hạng, thiếu, giờ chốt HH:MM). on:false = tắt nhập tay và xoá số đang hiện.
app.post('/api/leaguecard/manual', (req, res) => {
    const b = req.body || {};
    const g = appConfig.games.leaguecard = { ...makeDefaultLeagueCardConfig(), ...(appConfig.games.leaguecard || {}) };
    if (typeof b.on === 'boolean') g.manualOn = b.on;
    const m = { division: b.division, stars: b.stars, rank: b.rank, need: b.need, deadline: b.deadline };
    if (m.division !== undefined && !LeagueCard.manualToParsed({ ...g.manual, ...m })) return res.status(400).json({ ok: false, error: 'Bậc không hợp lệ (D5…A1 hoặc S)' });
    for (const k of Object.keys(m)) if (m[k] !== undefined) g.manual = { ...g.manual, [k]: m[k] };
    saveAppConfig();
    io.emit('gameConfig', { gameId: 'leaguecard', config: g });
    if (g.manualOn) leagueApplyManual();
    else if (leagueTracker.snapshot().league?.source === 'manual') { leagueTracker.reset(); leagueEmit([]); }
    res.json({ ok: true, manualOn: g.manualOn, manual: g.manual, state: leagueTracker.snapshot() });
});

// ====== Unknown gifts detector ======
// Khi TikTok đẩy gift event với giftId KHÔNG có trong Google Sheet → ghi nhận để user
// biết và bổ sung sau. Persist sang đĩa để không mất qua restart.
// Schema mỗi entry: { id, name, image, diamond, count, firstSeen, lastSeen }
const UNKNOWN_GIFTS_FILE = path.join(DATA_DIR, 'unknown-gifts.json');
let unknownGifts = {};   // id (string) → entry
function loadUnknownGifts() {
    try {
        if (fs.existsSync(UNKNOWN_GIFTS_FILE)) {
            unknownGifts = JSON.parse(fs.readFileSync(UNKNOWN_GIFTS_FILE, 'utf8')) || {};
        }
    } catch (e) { unknownGifts = {}; }
}
function saveUnknownGifts() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(UNKNOWN_GIFTS_FILE, JSON.stringify(unknownGifts, null, 2));
    } catch (e) { /* non-fatal */ }
}
loadUnknownGifts();

// ===== 🎵 Danh mục bài Ca khúc — chỉ để hiện tên bài thật (TikTok gửi tên quà = 16 ký tự đầu câu hát) =====
// Nguồn: seed đóng gói (lib/music-gifts-seed.json) + data/music-gifts.json (học khi có người tặng / nhập file
// TikTok gift/music/list). Quà Ca khúc KHÔNG vào danh sách quà lạ — đã gom về quà ảo MusicGifts.MUSIC_GIFT_ID.
const MUSIC_GIFTS_FILE = path.join(DATA_DIR, 'music-gifts.json');
let musicGiftsLearned = {};
try {
    if (fs.existsSync(MUSIC_GIFTS_FILE)) musicGiftsLearned = JSON.parse(fs.readFileSync(MUSIC_GIFTS_FILE, 'utf8')) || {};
} catch (e) { musicGiftsLearned = {}; }
let musicGiftsSeed = {};
try { musicGiftsSeed = MusicGifts.expandSeed(require('./lib/music-gifts-seed.json')); } catch (e) { musicGiftsSeed = {}; }
let musicGiftCatalog = MusicGifts.mergeCatalog(musicGiftsSeed, musicGiftsLearned);
let _musicSaveTimer = null;
function rememberMusicSong(id, fields) {
    const changedLearned = MusicGifts.learnSong(musicGiftsLearned, id, fields);
    MusicGifts.learnSong(musicGiftCatalog, id, fields);
    if (!changedLearned) return;
    clearTimeout(_musicSaveTimer);
    _musicSaveTimer = setTimeout(() => {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(MUSIC_GIFTS_FILE, JSON.stringify(musicGiftsLearned, null, 1));
        } catch (e) { console.warn('[music-gift] lưu danh mục fail:', e.message); }
    }, 1500);
}
// Bản cũ đã ghi quà Ca khúc vào danh sách quà lạ → chuyển sang danh mục bài, bỏ khỏi quà lạ.
(function migrateUnknownMusicGifts() {
    let moved = 0;
    for (const [id, e] of Object.entries(unknownGifts)) {
        if (!e || !MusicGifts.isMusicImageUrl(e.image)) continue;
        rememberMusicSong(id, { lyrics: e.name || '', image: e.image, price: Number(e.diamond) || 0 });
        delete unknownGifts[id];
        moved++;
    }
    if (moved) { saveUnknownGifts(); console.log(`[music-gift] chuyển ${moved} quà Ca khúc từ danh sách quà lạ sang danh mục bài`); }
})();
function musicGiftSongList() {
    return Object.entries(musicGiftCatalog).map(([id, s]) => ({ id, ...s, label: MusicGifts.songLabel(s) }));
}

// Debounce ghi đĩa — gift events có thể đến dồn dập, không cần flush mỗi event
let _unknownSaveTimer = null;
function scheduleSaveUnknown() {
    clearTimeout(_unknownSaveTimer);
    _unknownSaveTimer = setTimeout(saveUnknownGifts, 1500);
}
// Tra cứu metadata gift từ availableGifts (do TikTok API trả về sau connect).
// Trả về { name, image, diamond } nếu tìm thấy giftId, ngược lại null.
function lookupGiftFromTikTok(id) {
    if (!connection || !connection.availableGifts) return null;
    const list = connection.availableGifts;
    // availableGifts có thể là array hoặc object — handle cả 2 case
    const items = Array.isArray(list) ? list : Object.values(list || {});
    const target = items.find(g => String(g.id) === String(id));
    if (!target) return null;
    // TikTok response có nhiều field chứa URL ảnh — thử lần lượt để fix case
    // gift có ID nhưng không có image (vd: streak gift, region gift, gift mới chưa cache)
    const tryUrls = (obj) => {
        if (!obj) return [];
        if (Array.isArray(obj.url_list)) return obj.url_list;
        if (Array.isArray(obj.urlList))  return obj.urlList;
        if (typeof obj.url === 'string') return [obj.url];
        return [];
    };
    const candidates = [
        ...tryUrls(target.image),
        ...tryUrls(target.icon),
        ...tryUrls(target.preview_image),
        ...tryUrls(target.thumbnail),
        target.image_url, target.icon_url, target.url
    ].filter(u => typeof u === 'string' && u.startsWith('http'));
    return {
        name: target.name || target.gift_name || '',
        image: candidates[0] || '',
        diamond: target.diamond_count || target.diamondCount || 0
    };
}

function recordUnknownGift(g) {
    const id = String(g.giftId || '').trim();
    if (!id) return null;
    // Đã có trong sheet → skip
    if (giftMap[id]) return null;
    const tt = lookupGiftFromTikTok(id);
    const resolvedName = g.giftName || g.gift_name || tt?.name || '';
    // Thử nhiều field từ event payload (snake_case, camelCase, alternative names)
    const resolvedImage = g.giftPicture || g.gift_picture || g.giftIcon || g.gift_icon
        || g.image || g.icon || tt?.image || '';
    const resolvedDiamond = parseInt(g.diamondCount, 10) || parseInt(g.diamond_count, 10) || tt?.diamond || 0;
    if (!resolvedName && !resolvedImage) return null;
    const now = Date.now();
    const prev = unknownGifts[id];
    if (prev) {
        prev.count = (prev.count || 0) + (parseInt(g.repeatCount, 10) || 1);
        prev.lastSeen = now;
        if (!prev.name && resolvedName) prev.name = resolvedName;
        if (!prev.image && resolvedImage) prev.image = resolvedImage;
        if ((!prev.diamond || prev.diamond <= 0) && resolvedDiamond > 0) prev.diamond = resolvedDiamond;
    } else {
        unknownGifts[id] = {
            id,
            name: resolvedName,
            image: resolvedImage,
            diamond: resolvedDiamond,
            count: parseInt(g.repeatCount, 10) || 1,
            firstSeen: now,
            lastSeen: now
        };
    }
    scheduleSaveUnknown();
    io.emit('unknownGift', { entry: unknownGifts[id], total: Object.keys(unknownGifts).length });
    // Nếu vẫn thiếu image → schedule retry sau 1-2s (availableGifts có thể chưa load đủ
    // khi event đầu tiên đến). Retry tối đa 3 lần với gap tăng dần.
    if (!unknownGifts[id].image) {
        scheduleGiftIconRetry(id);
    }
    return unknownGifts[id];
}

// Retry lookup icon cho gift chưa có image — quét lại availableGifts sau khi connect ổn định
const giftIconRetryAttempts = new Map();   // id → number of attempts
function normalizeGiftRepeatCount(data) {
    const raw = data?.repeatCount
        ?? data?.repeat_count
        ?? data?.comboCount
        ?? data?.combo_count
        ?? data?.gift?.repeat_count
        ?? data?.gift?.repeatCount
        ?? data?.giftDetails?.repeatCount
        ?? 1;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 1;
}
function scheduleGiftIconRetry(id) {
    const attempts = giftIconRetryAttempts.get(id) || 0;
    if (attempts >= 5) return;   // bỏ cuộc sau 5 lần
    giftIconRetryAttempts.set(id, attempts + 1);
    const delay = 1500 + attempts * 1500;   // 1.5s, 3s, 4.5s, 6s, 7.5s
    setTimeout(() => {
        const entry = unknownGifts[id];
        if (!entry || entry.image) return;   // đã có image hoặc bị xoá
        const tt = lookupGiftFromTikTok(id);
        if (tt?.image) {
            entry.image = tt.image;
            if (!entry.name && tt.name) entry.name = tt.name;
            if ((!entry.diamond || entry.diamond <= 0) && tt.diamond > 0) entry.diamond = tt.diamond;
            scheduleSaveUnknown();
            io.emit('unknownGift', { entry, total: Object.keys(unknownGifts).length });
            console.log(`[unknown-gifts] Retry ${attempts + 1}/5 thành công cho gift ${id}: ${tt.image}`);
            giftIconRetryAttempts.delete(id);
        } else {
            scheduleGiftIconRetry(id);   // try again
        }
    }, delay);
}

// Quét toàn bộ unknownGifts hiện có, điền lại name/image/diamond từ availableGifts
// (gọi khi user bấm "🔄 Dò icon" hoặc sau khi reconnect).
function refreshUnknownGiftsFromTikTok() {
    if (!connection || !connection.availableGifts) {
        return { ok: false, error: 'Chưa kết nối LIVE — không có availableGifts để tra' };
    }
    let updated = 0;
    for (const id of Object.keys(unknownGifts)) {
        const tt = lookupGiftFromTikTok(id);
        if (!tt) continue;
        const e = unknownGifts[id];
        let touched = false;
        if (!e.name && tt.name) { e.name = tt.name; touched = true; }
        if (!e.image && tt.image) { e.image = tt.image; touched = true; }
        if ((!e.diamond || e.diamond <= 0) && tt.diamond > 0) { e.diamond = tt.diamond; touched = true; }
        if (touched) {
            updated++;
            io.emit('unknownGift', { entry: e, total: Object.keys(unknownGifts).length });
        }
    }
    if (updated > 0) scheduleSaveUnknown();
    return { ok: true, updated, total: Object.keys(unknownGifts).length };
}

// Trần số lượt WEBM cho một combo. Overlay cũng tự clamp lại cùng con số này.
const NHATLA_EFFECT_MAX_REPEAT = 20;
// Trần số lượt cho gió / lốc / cứu. Khớp với ACTION_MAX_REPEAT trong overlay.html.
const NHATLA_ACTION_MAX_REPEAT = 20;

function findNhatLaEffectGift(giftId, giftName) {
    // Công tắc game TẮT thì không quà nào được bắn hiệu ứng — trước đây chỉ kiểm tra
    // rule.enabled (công tắc từng quà) nên tắt cả game vẫn thấy WEBM chạy trên OBS.
    if (appConfig.games?.nhatla?.enabled === false) return null;
    const effects = appConfig.games?.nhatla?.effects || {};
    const rules = Array.isArray(effects.effectGifts) ? effects.effectGifts : effects.tomGifts;
    if (!Array.isArray(rules)) return null;
    const id = String(giftId == null ? '' : giftId);
    const name = String(giftName || '').trim().toLowerCase();
    // enabled === false = người dùng tắt hẳn rule (thường vì file WEBM lỗi). Điều kiện này
    // phải giống hệt effectGiftForGift() trong public/games/nhatla/game.js — server không
    // nạp file đó nên hai bản song song, quên một bên là công tắc chỉ ăn nửa đường.
    return rules.find(rule => rule && rule.enabled !== false && (
        (id && String(rule.giftId || '') === id) ||
        (name && String(rule.giftName || '').trim().toLowerCase() === name)
    )) || null;
}

// ===== GIẢI CỨU =====
// Chuyển config cũ sang danh sách phẳng: mỗi quà trong wind.windGifts / tornado.gifts /
// autoClean.gifts thành MỘT hành động, kế thừa đúng thông số của khối nó thuộc về nên người
// dùng không thấy khác gì. Xong thì dọn rỗng danh sách cũ — để lại là quà bắn hai lần.
// Chỉ chạy khi cfg.rescue chưa có, nên gọi lại bao nhiêu lần cũng không nhân bản.
// Song song với migrateRescue() bên game.js; sửa một bên nhớ sửa bên kia.
function migrateNhatLaRescue(cfg) {
    if (!cfg || (cfg.rescue && typeof cfg.rescue === 'object')) return;
    // Khoá thông số hợp lệ theo từng loại — phải khớp RESCUE_LIMITS bên game.js.
    // Để BÊN TRONG hàm chứ không phải const ở module scope: hàm này được gọi từ khối backfill
    // gần đầu file (~dòng 1224), mà function declaration thì được hoisted còn `const` thì
    // không — const khai báo phía dưới sẽ còn trong vùng chết và app chết ngay lúc khởi động.
    const PARAM_KEYS = {
        wind: ['radius', 'strength', 'turbulence', 'durationMs', 'maxLeaves'],
        tornado: ['radius', 'spin', 'inward', 'lift', 'durationMs', 'maxLeaves', 'drift'],
        autoClean: ['durationMs', 'leavesPerSec']
    };
    const preset = { wind: '🌬', tornado: '🌪', autoClean: '🧹' };
    const presetName = { wind: 'Gió thổi bay lá', tornado: 'Lốc xoáy gom lá', autoClean: 'Tự nhặt lá' };
    const actions = [];
    const take = (list, type, block) => {
        if (!Array.isArray(list)) return;
        const params = {};
        for (const key of PARAM_KEYS[type]) params[key] = block?.[key];
        if (type === 'wind') params.direction = block?.direction || 'random';
        for (const rule of list) {
            if (!rule) continue;
            actions.push({
                id: String(rule.id || `rescue-${actions.length}-${Date.now()}`),
                type, icon: preset[type], name: presetName[type], enabled: true,
                giftId: String(rule.giftId || ''), giftName: String(rule.giftName || ''),
                giftImage: String(rule.giftImage || ''), diamond: Number(rule.diamond) || 0,
                hotkey: String(rule.hotkey || ''), params: { ...params }
            });
        }
    };
    take(cfg.wind?.windGifts, 'wind', cfg.wind);
    take(cfg.tornado?.gifts, 'tornado', cfg.tornado);
    take(cfg.autoClean?.gifts, 'autoClean', cfg.autoClean);
    if (cfg.wind) cfg.wind.windGifts = [];
    if (cfg.tornado) cfg.tornado.gifts = [];
    if (cfg.autoClean) cfg.autoClean.gifts = [];
    cfg.rescue = { actions };
    if (actions.length) console.log(`[nhatla] Đã chuyển ${actions.length} quà gió/lốc/cứu sang GIẢI CỨU`);
}

// Bản song song của rescueActionForGift() trong public/games/nhatla/game.js — server không nạp
// file client nên phải có bản riêng; sửa một bên nhớ sửa bên kia.
// Công tắc tắt CẢ LOẠI vẫn nằm ở ba khối cũ (wind/tornado/autoClean .enabled).
function rescueActionForGift(giftId, giftName) {
    const cfg = appConfig.games?.nhatla;
    // Cùng lý do với findNhatLaEffectGift: tắt game phải chặn trước cả công tắc từng hành động,
    // nếu không quà thật vẫn thổi gió / lốc / tự nhặt trên overlay khi Nhặt Lá đang tắt.
    if (cfg?.enabled === false) return null;
    const actions = cfg?.rescue?.actions;
    if (!Array.isArray(actions)) return null;
    const id = String(giftId == null ? '' : giftId);
    const name = String(giftName || '').trim().toLowerCase();
    const hit = actions.find(action => action && action.enabled !== false && (
        (id && String(action.giftId || '') === id) ||
        (name && String(action.giftName || '').trim().toLowerCase() === name)
    ));
    if (!hit) return null;
    const block = hit.type === 'autoClean' ? cfg.autoClean : hit.type === 'tornado' ? cfg.tornado : cfg.wind;
    return block?.enabled === false ? null : hit;
}

// Thông số đi KÈM payload chứ không để overlay tự đọc khối config chung — đó chính là thứ
// cho phép hai quà cùng loại chạy hai bộ thông số khác nhau. Overlay vốn đã ưu tiên options
// rồi mới fallback về cfg (xem startGust/startTornado/startAutoClean) nên không phải đụng
// vào vật lý. Vị trí + seed vẫn do server chốt một lần, cùng lý do makeNhatLaGustPayload.
function nhatLaRescueCmd(action, repeat = 1) {
    const p = action.params || {};
    const times = Math.max(1, parseInt(repeat, 10) || 1);
    if (action.type === 'wind') {
        const dir = p.direction || 'random';
        return ['wind', {
            x: Math.round(120 + Math.random() * 840),
            dir: dir === 'random' ? (Math.random() < .5 ? 'left' : 'right') : dir,
            seed: Math.floor(Math.random() * 1e9),
            radius: p.radius, strength: p.strength, turbulence: p.turbulence,
            durationMs: p.durationMs, maxLeaves: p.maxLeaves,
            repeat: times
        }];
    }
    if (action.type === 'tornado') {
        return ['tornado', {
            x: Math.round(200 + Math.random() * 680),
            dir: Math.random() < .5 ? 'left' : 'right',
            seed: Math.floor(Math.random() * 1e9),
            radius: p.radius, spin: p.spin, inward: p.inward, lift: p.lift,
            durationMs: p.durationMs, maxLeaves: p.maxLeaves, drift: p.drift,
            repeat: times
        }];
    }
    // Cứu là hiệu ứng THEO THỜI LƯỢNG chứ không phải theo lượt phát: chạy 10 lượt nối nhau
    // đúng bằng một lượt dài gấp 10. Nhân sẵn ở đây thay vì bắt overlay xếp hàng.
    return ['autoClean', {
        durationMs: Math.max(500, Math.min(60000, (Number(p.durationMs) || 5000) * times)),
        leavesPerSec: Math.max(1, Math.min(500, Number(p.leavesPerSec) || 40)),
        seed: Math.floor(Math.random() * 1e9)
    }];
}

// ===== 🏆 TOP người tặng lá =====
// Cộng dồn theo BUỔI LIVE và chỉ giữ trong RAM: reset khi bấm Xoá hết lá hoặc nút Reset TOP,
// và tự mất khi tắt app — đúng ý "bảng xếp hạng của buổi live này", không phải bảng vàng vĩnh viễn.
// Đếm ở server chứ không ở overlay vì overlay OBS reload là mất sạch, mà lại có tới 2-3 view
// (OBS + review + preview) cùng nghe gameGift nên mỗi view sẽ tự đếm ra một con số khác nhau.
let nhatLaDonors = new Map();
let nhatLaTopTimer = null;

// Bản sao của leavesForGift() trong public/games/nhatla/game.js — phải khớp từng nhánh,
// nếu lệch thì số lá trên bảng TOP không bằng số lá thật sự rơi xuống.
function nhatLaLeavesForGift(cfg, giftId, giftName, coinValue, repeatCount) {
    if (!cfg || !Array.isArray(cfg.giftRules)) return 0;
    // Song song với leavesForGift() bên game.js: quà đã gán cho HIỆU ỨNG hoặc GIẢI CỨU không
    // rơi lá, và phải chặn ở ĐẦU hàm để dòng lá cũ còn sót trong giftRules không thắng.
    // Bảng TOP đếm theo hàm này, đặt sai chỗ là TOP cộng lá cho quà chưa hề rơi lá.
    if (findNhatLaEffectGift(giftId, giftName) || rescueActionForGift(giftId, giftName)) return 0;
    const id = String(giftId == null ? '' : giftId);
    const name = String(giftName || '');
    const repeat = Math.max(1, parseInt(repeatCount, 10) || 1);
    const rule = cfg.giftRules.find(r => r && (
        (id && String(r.giftId || '') === id) ||
        (name && String(r.giftName || '').toLowerCase() === name.toLowerCase())
    ));
    // Rule bị TẮT trả 0 luôn, KHÔNG rơi xuống tỉ lệ coinsPerLeaf bên dưới — nếu để rơi
    // xuống thì lá vẫn xuống, chỉ khác số lượng, nhìn như công tắc hỏng.
    if (rule) {
        if (rule.enabled === false) return 0;
        const c = parseInt(rule.count, 10);
        return isFinite(c) && c > 0 ? c * repeat : 0;
    }
    const coins = Math.max(0, Math.round(Number(coinValue) || 0)) * repeat;
    const perLeaf = Number(cfg.coinsPerLeaf);
    return perLeaf > 0 ? Math.floor(coins / perLeaf) : 0;
}

function nhatLaTopList(count) {
    const cfg = appConfig.games?.nhatla?.topDonors || {};
    const n = Math.max(1, Math.min(10, parseInt(count ?? cfg.count, 10) || 5));
    const min = Math.max(0, Number(cfg.minLeaves) || 0);
    return [...nhatLaDonors.values()]
        .filter(d => d.leaves >= min)
        .sort((a, b) => (b.leaves - a.leaves) || (a.firstAt - b.firstAt))
        .slice(0, n)
        .map((d, index) => ({
            rank: index + 1,
            uniqueId: d.uniqueId,
            nickname: d.nickname || d.uniqueId || 'Ẩn danh',
            avatar: d.avatar || '',
            leaves: d.leaves,
            gifts: d.gifts
        }));
}

function emitNhatLaTop(immediate) {
    if (nhatLaTopTimer) {
        if (!immediate) return;
        clearTimeout(nhatLaTopTimer);
        nhatLaTopTimer = null;
    }
    const send = () => {
        nhatLaTopTimer = null;
        io.emit('nhatla:top', { list: nhatLaTopList(), total: nhatLaDonors.size, ts: Date.now() });
    };
    // Combo quà dồn dập có thể bắn hàng chục event/giây; bảng TOP không cần nhanh hơn 1Hz.
    if (immediate) return send();
    nhatLaTopTimer = setTimeout(send, 1000);
}

function nhatLaTrackDonor(gift) {
    const cfg = appConfig.games?.nhatla;
    if (!cfg || cfg.enabled === false) return;
    const leaves = nhatLaLeavesForGift(cfg, gift.giftId, gift.giftName, gift.coinValue ?? gift.diamondCount, gift.repeatCount);
    if (leaves <= 0) return;
    const uid = String(gift.uniqueId || gift.userId || gift.nickname || '').toLowerCase();
    if (!uid) return;
    const now = Date.now();
    const d = nhatLaDonors.get(uid) || {
        uniqueId: gift.uniqueId || '', nickname: '', avatar: '', leaves: 0, gifts: 0, firstAt: now
    };
    if (gift.nickname) d.nickname = gift.nickname;
    if (gift.profilePicture) d.avatar = gift.profilePicture;
    d.leaves += leaves;
    d.gifts += Math.max(1, parseInt(gift.repeatCount, 10) || 1);
    nhatLaDonors.set(uid, d);
    emitNhatLaTop();
}

function nhatLaResetDonors() {
    nhatLaDonors = new Map();
    emitNhatLaTop(true);
}

function emitGift(g) {
    rememberLiveTranslateUser(liveTranslateRecentGifts, g);
    // 🎮 Phiên game theo quà: quà kích hoạt mở / gia hạn / xếp hàng phiên TRƯỚC khi đưa quà cho các game
    // (để game của phiên nhận luôn quà này nếu nó cũng là quà chơi game).
    try { camSessionGift(g); } catch (e) { console.warn('[camgames] phiên game lỗi:', e?.message || e); }
    let sheetItem = giftMap[String(g.giftId)] || null;
    // 🎵 Quà Ca khúc gom về quà ảo: giữ ẢNH ĐĨA + tên bài riêng (client ưu tiên sheetItem.image) — mỗi bài 1 màu đĩa.
    if (sheetItem && sheetItem.virtual && g.musicGift && g.giftPicture) {
        sheetItem = { ...sheetItem, image: g.giftPicture, name: g.giftName || sheetItem.name };
    }
    // Quà unknown → ghi vào danh sách phát hiện được
    if (!sheetItem) recordUnknownGift(g);
    const enriched = {
        ...g,
        sheetItem,
        image: sheetItem?.image || g.giftPicture,
        coinValue: sheetItem?.diamond ?? g.diamondCount ?? 1,
        camClaims: camGiftClaims(g),
        ts: Date.now()
    };
    console.log(`[gift] emit → ${enriched.nickname || enriched.uniqueId} sent "${enriched.giftName || '?'}" (id=${enriched.giftId}, x${enriched.repeatCount || 1}, ${enriched.coinValue || 0}💎)`);
    const coFanChange = coFansTouch(enriched, 'gift');   // 🏢 Creator Online: cộng xu trọn đời (bỏ quà thử)
    io.emit('gift', enriched);
    if (coFanChange) io.emit('creatoronline:fan', coFanChange);
    setLiveDashboardGift(enriched);
    try { leagueOnGift(enriched); } catch (e) { console.warn('[leaguecard] gift lỗi:', e?.message || e); }
    try { if (qvStore && qvStore.alive()) qvStore.addGift({ uid: String(enriched.uniqueId || enriched.userId || ''), name: enriched.nickname || enriched.uniqueId, avatar: enriched.profilePictureUrl || enriched.profilePicture || '', coins: (Number(enriched.coinValue) || 0) * Math.max(1, parseInt(enriched.repeatCount, 10) || 1) }); } catch (e) { console.warn('[quaivat] sổ tuần lỗi:', e?.message || e); }
    // Push to all game overlays
    io.to('overlay').emit('gameGift', enriched);
    io.to('preview').emit('gameGift', enriched);
    // Ghi nhận TOP người tặng lá kể cả khi bảng đang tắt — bật lên là có sẵn số liệu buổi live,
    // không bắt người vận hành phải nhớ bật trước khi có quà.
    try { nhatLaTrackDonor(enriched); } catch (e) { console.warn('[nhatla] track donor fail:', e.message); }
    const nhatLaEffect = findNhatLaEffectGift(enriched.giftId, enriched.giftName);
    if (nhatLaEffect?.id) {
        // Quà streak đã gộp chờ repeatEnd ở trên, nên tới đây repeatCount là TỔNG số lượt
        // của combo. Gửi kèm để overlay phát đủ từng lượt nối nhau; chặn trần để combo
        // x500 không khoá hiệu ứng hàng phút.
        const repeat = Math.max(1, Math.min(NHATLA_EFFECT_MAX_REPEAT, parseInt(enriched.repeatCount, 10) || 1));
        // Server chọn rule một lần; target là đúng overlay đang giữ lá (nếu có).
        io.emit('nhatla:effect', { effectId: String(nhatLaEffect.id), targetSocketId: nhatLaActiveDragSocketId || null, repeat });
    }
    // Tặng 1 lần chạy 1 lượt; combo x10 chạy đủ 10 lượt NỐI NHAU (overlay tự giãn nhịp).
    // Quà streak đã gộp chờ repeatEnd ở trên nên repeatCount tới đây là TỔNG số lượt combo.
    // Chặn trần vì combo x500 chạy đủ sẽ khoá sân khấu hàng chục phút, quà của người tặng
    // sau không còn chỗ hiện.
    const nhatLaRepeat = Math.max(1, Math.min(NHATLA_ACTION_MAX_REPEAT, parseInt(enriched.repeatCount, 10) || 1));
    // Một quà = một hành động giải cứu (danh sách phẳng cfg.rescue.actions), thông số lấy
    // từ chính hành động đó nên hai quà cùng loại chạy được hai kiểu khác nhau.
    const rescueAction = rescueActionForGift(enriched.giftId, enriched.giftName);
    if (rescueAction) {
        const [cmd, payload] = nhatLaRescueCmd(rescueAction, nhatLaRepeat);
        io.emit('gameCmd', { gameId: 'nhatla', cmd, payload, seq: ++_cmdSeq });
    }
    // Track total diamond cho stats card
    const diamond = Number(enriched.coinValue) || 0;
    const repeat = Number(g.repeatCount) || 1;
    if (diamond > 0) {
        liveStats.totalDiamond += diamond * repeat;
        emitLiveStatsThrottled();
    }
    // Sổ xu thẻ vào phòng — chỉ quà THẬT từ TikTok (bỏ quà test/giả lập), cộng dồn qua mọi buổi LIVE
    if (g.source === 'tiktok' && diamond > 0) {
        try { vipLedgerAddGift(g, diamond * repeat); } catch (e) { console.warn('[vipwelcome] sổ xu:', e.message); }
    }
    // PK: track gifts gửi cho HOST trong khoảng PK active — để detect TOP 1 contributor khi PK end
    if (pktiktokTrackPkGift && g.uniqueId) {
        pktiktokTrackPkGift({
            uniqueId: g.uniqueId,
            nickname: g.nickname,
            profilePicture: g.profilePicture || enriched.image,
            level: Number(g.level) || 0,
            diamond: diamond * repeat
        });
    }
    // VIP Welcome — kiểm tra rules khi user tặng quà
    try {
        handleVipWelcomeEvent('gift', {
            extra: g.tkUser || null,
            uniqueId: g.uniqueId,
            nickname: g.nickname,
            level: Number(g.level) || 0,
            verified: !!g.verified,
            profilePicture: g.profilePicture || enriched.image,
            giftName: enriched.giftName || g.giftName,
            giftPicture: enriched.image,
            diamondCount: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1
        });
    } catch (e) { /* non-fatal */ }
    // Vote Bình Luận — ưu tiên row có gán giftId; fallback last-vote
    try {
        handleVoteCommentGift({
            uniqueId: g.uniqueId,
            giftId: g.giftId,
            coinValue: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1
        });
    } catch (e) { /* non-fatal */ }
    // Biểu Cảm Nhiệt Độ — quà tăng/giảm nhiệt theo công thức trong config
    try {
        handleNhietDoGift({
            uniqueId: g.uniqueId,
            nickname: g.nickname,
            profilePicture: g.profilePicture || enriched.image,
            giftId: g.giftId,
            coinValue: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1
        });
    } catch (e) { /* non-fatal */ }
    // Bắn Cung — quà bắn cung / hồi máu / hồi sinh / giáp theo gán
    try {
        handleBanCungGift({
            uniqueId: g.uniqueId,
            nickname: g.nickname,
            profilePicture: g.profilePicture || enriched.image,
            giftId: g.giftId,
            giftName: enriched.giftName || g.giftName,
            giftImage: enriched.image,
            coinValue: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1
        });
    } catch (e) { /* non-fatal */ }
    // Chém Trái Cây — quà → quả / bom / buff theo giftRules
    try {
        handleChemTraiCayGift({
            nickname: g.nickname,
            profilePicture: g.profilePicture || '',
            giftId: g.giftId,
            giftName: enriched.giftName || g.giftName,
            giftImage: enriched.image,
            repeatCount: g.repeatCount || 1,
            source: g.source || 'tiktok'
        });
    } catch (e) { /* non-fatal */ }
    // Đập Muỗi — quà → thả muỗi / hành động (xịt / vợt / màn)
    try {
        handleDapMuoiGift({
            nickname: g.nickname,
            profilePicture: g.profilePicture || '',
            giftId: g.giftId,
            giftName: enriched.giftName || g.giftName,
            giftImage: enriched.image,
            coinValue: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1,
            source: g.source || 'tiktok'
        });
    } catch (e) { /* non-fatal */ }
    // 🏸 Đá Cầu — quà gán đích danh (cfg.gifts, so theo id) → tung cầu; combo ×N = N quả (trần 5)
    try {
        handleDaCauGift({
            nickname: g.nickname,
            profilePicture: g.profilePicture || '',
            giftId: g.giftId,
            giftName: enriched.giftName || g.giftName,
            giftImage: enriched.image,
            repeatCount: g.repeatCount || 1,
            source: g.source || 'tiktok'
        });
    } catch (e) { /* non-fatal */ }
    // 🧍 Bộ Tách Người — quà gán đích danh từng game/kịch bản → body:run (overlay tự xếp hàng)
    try {
        if (bodyApi) bodyApi.handleGift({
            uniqueId: g.uniqueId, nickname: g.nickname, profilePicture: g.profilePicture || '',
            giftId: g.giftId, giftName: enriched.giftName || g.giftName, giftImage: enriched.image,
            coinValue: enriched.coinValue || 0, repeatCount: g.repeatCount || 1, source: g.source || 'tiktok'
        });
    } catch (e) { console.warn('[body] quà lỗi:', e?.message || e); }
    // Trồng Cây — quà mọc hoa / bướm avatar / tưới nước / nắng / cắt cây
    try {
        handleTrongCayGift({
            uniqueId: g.uniqueId,
            nickname: g.nickname,
            profilePicture: g.profilePicture || '',
            giftId: g.giftId,
            giftName: enriched.giftName || g.giftName,
            giftImage: enriched.image,
            coinValue: enriched.coinValue || 0,
            repeatCount: g.repeatCount || 1,
            source: g.source || ''
        });
    } catch (e) { /* non-fatal */ }
}

function makeTikTokConnectOptions(extra = {}) {
    // API 2.4.4: wsClientHeaders / webClientHeaders / connectWithUniqueId đã bị bỏ → header đi qua wsClientOptions.headers
    // (ws) và webClientOptions.headers (got); timeout HTTP/WS lấy từ env TIKTOK_CLIENT_TIMEOUT / WS_CONNECT_TIMEOUT_MS
    // (đặt ở đầu file, lib bỏ qua webClientOptions.timeout). Không spread key lạ vào options.
    const tiktokHeaders = { Origin: 'https://www.tiktok.com', Referer: 'https://www.tiktok.com/' };
    const opts = {
        processInitialData: false,
        enableExtendedGiftInfo: true,     // availableGifts — route gift/list đã vá thành bản không ký (finishTikTokConnector)
        fetchRoomInfoOnConnect: true,
        wsClientOptions: { headers: { ...tiktokHeaders, ...(extra.wsClientHeaders || {}) }, handshakeTimeout: 20000, ...(extra.wsClientOptions || {}) },
        webClientOptions: { headers: { ...tiktokHeaders, ...(extra.webClientHeaders || {}) }, ...(extra.webClientOptions || {}) }
    };
    if (extra.signApiKey) opts.signApiKey = extra.signApiKey;
    return opts;
}

// Phân loại lỗi connect của tiktok-live-connector 2.4.4 — nhận diện bằng CẢ tên class (err.name của các ConnectError
// vẫn là 'Error' nên phải dùng constructor.name) lẫn nội dung message. Trả về:
//   offline | ratelimit | busy | premium | invalid | transient (được thử lại) | other
function classifyTikTokConnectError(err) {
    const ctor = String(err?.constructor?.name || '');
    const name = String(err?.name || '');
    const msg = String(err?.message || err || '').toLowerCase();
    const is = (cls) => ctor === cls || name === cls;
    // Class là bằng chứng chắc nhất → xét trước. Đoán theo message chỉ khi class lạ, và lỗi mạng/sign-server
    // xét TRƯỚC chữ 'offline' (message "sign server offline" là lỗi tạm, không phải user chưa LIVE).
    if (is('UserOfflineError')) return 'offline';
    if (is('SignatureRateLimitError')) return 'ratelimit';
    if (is('AlreadyConnectedError') || is('AlreadyConnectingError')) return 'busy';
    if (is('PremiumFeatureError') || is('AuthenticatedWebSocketConnectionError')) return 'premium';
    if (is('InvalidUniqueIdError')) return 'invalid';
    if (is('ConnectTimeoutError') || is('SignAPIError') || is('SignatureMissingTokensError')) return 'transient';
    if (msg.includes('rate limit') || msg.includes('too many connections') || /\b429\b/.test(msg)) return 'ratelimit';
    if (msg.includes('already connect')) return 'busy';
    if (msg.includes('premium feature') || msg.includes('business plan') || msg.includes('cookie bundle') || msg.includes('authenticated ws')) return 'premium';
    if (msg.includes("invalid value for 'uniqueid'")) return 'invalid';
    if (msg.includes('websocket') || msg.includes('unexpected server response') || msg.includes('not responding')
        || msg.includes('timed out') || msg.includes('timeout') || msg.includes('sign server') || msg.includes('sign error')
        || msg.includes('failed to sign') || msg.includes('empty payload') || msg.includes('fetch failed')
        || msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('socket hang up')) return 'transient';
    if (msg.includes("isn't online") || msg.includes('not online') || msg.includes('offline')) return 'offline';
    return 'other';
}

function isRetryableTikTokConnectError(err) {
    return classifyTikTokConnectError(err) === 'transient';
}

function normalizeTikTokConnectError(err, attempts = []) {
    const msg = String(err?.message || err || 'connect_failed').split('\n')[0];
    const tried = attempts.length ? ` (đã tự thử lại ${attempts.length} lần)` : '';
    const kind = classifyTikTokConnectError(err);
    if (kind === 'ratelimit') {
        return 'Hết lượt ký kết nối (giới hạn 5 lượt/phút, 100/ngày khi chưa có API key) — đợi 1 phút hoặc thêm Euler Stream API key trong ⚙ Cài đặt';
    }
    if (kind === 'premium') {
        return `Sign-server Euler Stream từ chối yêu cầu này (tính năng trả phí / thiếu phiên đăng nhập): ${msg}`;
    }
    if (/unexpected server response:\s*200/i.test(msg)) {
        return `TikTok trả HTTP 200 thay vì nâng cấp WebSocket — thường do sign-server (EulerStream) bị giới hạn lượt hoặc route TikTok chập chờn tạm thời${tried}. Hãy đợi ~30–60 giây rồi kết nối lại. Nếu bị thường xuyên, thêm Euler Stream API key trong ⚙ Cài đặt (lấy free tại eulerstream.com) để ký ổn định.`;
    }
    if (/websocket not responding|timed out whilst connecting/i.test(msg)) return `WebSocket TikTok không phản hồi trong thời gian chờ${tried}. Hãy thử kết nối lại sau ít giây.`;
    if (attempts.length > 1) return `${msg} (đã thử ${attempts.length} lần)`;
    return msg;
}

// EulerStream sign-server API key (TÙY CHỌN) — set để ký WebSocket ổn định, tránh lỗi "HTTP 200"
// do tier ẩn danh bị rate-limit. Lấy free key tại https://www.eulerstream.com
function getTikTokSignApiKey() {
    return process.env.TIKTOK_SIGN_API_KEY
        || process.env.EULER_API_KEY
        || appConfig.tiktokSignApiKey
        || null;
}
// Sign-server ký WebSocket. 2.4.4 KHÔNG có option signApiUrl trên connection options — URL nằm ở SignConfig.basePath
// (mặc định của lib: https://api.eulerstream.com). Tier ẩn danh của Euler chỉ trả proxy wss://ws-fallback.eulerstream.com
// → hay dính lỗi "HTTP 200 thay vì nâng cấp WebSocket". sign.nguyenvu.dev là sign-server riêng, không cần key và trả
// thẳng ws_direct → đặt làm mặc định. Muốn quay về Euler: set env TIKTOK_SIGN_API_URL=https://api.eulerstream.com
const TIKTOK_SIGN_BASE_URL_DEFAULT = 'https://sign.nguyenvu.dev';
const TIKTOK_SIGN_BASE_URL_EULER = 'https://api.eulerstream.com';
function normalizeSignBaseUrl(v) {
    let s = String(v || '').trim();
    while (s.endsWith('/')) s = s.slice(0, -1);   // basePath của lib không được có dấu / ở cuối
    return s;
}
// URL do người dùng tự khai báo (env hoặc app-config) — phân biệt với mặc định hard-code để biết có được gửi API key
// sang đó không.
function getExplicitTikTokSignBaseUrl() {
    return normalizeSignBaseUrl(process.env.TIKTOK_SIGN_API_URL || process.env.SIGN_API_URL || appConfig.tiktokSignBaseUrl);
}
function getTikTokSignBaseUrl() {
    return getExplicitTikTokSignBaseUrl() || TIKTOK_SIGN_BASE_URL_DEFAULT;
}
function isEulerSignBase(base) {
    try { return /(^|\.)eulerstream\.com$/i.test(new URL(base).hostname); } catch (e) { return false; }
}
// API key là key của EulerStream → CHỈ gửi cho chính Euler, hoặc cho host do người dùng tự khai báo (họ tự chọn cặp
// URL+key nên coi như cố ý). Mặc định sign.nguyenvu.dev là bên thứ ba: đẩy key sang đó là lộ credential của người dùng.
// Lib nhét SignConfig.apiKey vào header X-Api-Key của MỌI request tới basePath nên phải chặn từ đây.
function signKeyAllowedFor(base) {
    if (isEulerSignBase(base)) return true;
    const explicit = getExplicitTikTokSignBaseUrl();
    return !!explicit && explicit === base;
}
// SignConfig của lib là singleton toàn cục và createEulerClient() cache instance → đổi key/URL trong ⚙ Cài đặt phải ghi
// lại apiKey + basePath rồi xoá cache trước mỗi lần connect, nếu không lib vẫn dùng giá trị cũ (hoặc key đã xoá).
function applyTikTokSignConfig(baseOverride) {
    const sc = tlc?.SignConfig;
    if (!sc) return;
    const base = normalizeSignBaseUrl(baseOverride) || getTikTokSignBaseUrl();
    const key = (signKeyAllowedFor(base) && (getTikTokSignApiKey() || process.env.SIGN_API_KEY)) || undefined;
    if (sc.apiKey !== key) { sc.apiKey = key; sc.cachedInstance = undefined; }
    if (sc.basePath !== base) { sc.basePath = base; sc.cachedInstance = undefined; }
}

// "Kết nối câm": sign.nguyenvu.dev đôi khi bắt tay WebSocket thành công nhưng KHÔNG frame nào chảy về (đo thực tế ~1/3
// lần trên cùng một phòng đang LIVE; Euler 5/5 lần đều có dữ liệu). Câm còn tệ hơn lỗi — UI báo "đã kết nối" mà overlay
// đứng im, và auto-reconnect chỉ chạy khi DISCONNECTED nên không bao giờ tự thoát. → sau connect() phải chờ frame đầu.
const TIKTOK_FIRST_FRAME_TIMEOUT_MS = Math.max(1, Number(process.env.TIKTOK_FIRST_FRAME_TIMEOUT_MS) || 8000);
function waitForFirstTikTokFrame(conn, lib, ms = TIKTOK_FIRST_FRAME_TIMEOUT_MS) {
    // WEBSOCKET_DATA/DECODED_DATA bắn cho MỌI frame (kể cả housekeeping của phòng vắng: ROOM_USER, LIVE_INTRO...) →
    // tín hiệu "còn sống" đáng tin hơn CHAT/GIFT vốn phụ thuộc người xem có tương tác hay không.
    const signals = [lib?.ControlEvent?.WEBSOCKET_DATA, lib?.ControlEvent?.DECODED_DATA].filter(Boolean);
    if (!signals.length) return Promise.resolve(true);
    return new Promise(resolve => {
        let done = false;
        const off = (ev) => { try { (conn.off || conn.removeListener).call(conn, ev, onData); } catch (e) {} };
        const finish = (ok) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            signals.forEach(off);
            resolve(ok);
        };
        const onData = () => finish(true);
        const timer = setTimeout(() => finish(false), ms);
        timer.unref?.();
        for (const ev of signals) { try { conn.on(ev, onData); } catch (e) {} }
    });
}

async function createTikTokConnectionWithFallback(username) {
    const lib = await loadTikTokConnector();
    const signApiKey = getTikTokSignApiKey();
    const mk = (sign, extra = {}) => makeTikTokConnectOptions({
        ...(signApiKey && signKeyAllowedFor(sign) ? { signApiKey } : {}),
        ...extra
    });
    // Lỗi WebSocket / sign-server thường TẠM THỜI → thử lại tối đa 3 lần với backoff 2s/5s. Không thử nhiều hơn vì
    // sign-server ẩn danh chỉ cho 5 lượt ký/phút — thử dồn dập chỉ đốt hạn mức rồi dính rate-limit.
    // (2.4.4 bỏ connectWithUniqueId; useMobile cần session.cookie mà app không có → không còn nhánh mobile.)
    // Nấc cuối đổi sang sign-server dự phòng (Euler): chậm hơn (~6–10s so với ~1.5s) nhưng ổn định, dùng khi host
    // chính lỗi hoặc trả về kết nối câm.
    const primarySign = getTikTokSignBaseUrl();
    const backupSign = isEulerSignBase(primarySign) ? null : TIKTOK_SIGN_BASE_URL_EULER;
    const attempts = [
        { label: 'web',         sign: primarySign },
        { label: 'web-retry-1', sign: primarySign },
        backupSign
            ? { label: 'web-sign-backup', sign: backupSign }
            : { label: 'web-retry-2',     sign: primarySign }
    ].map(a => ({ ...a, options: mk(a.sign) }));
    const backoffs = [2000, 5000];
    const errors = [];
    for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const isLast = i === attempts.length - 1;
        applyTikTokSignConfig(attempt.sign);   // phải set TRƯỚC connect() — createEulerClient() đọc SignConfig lúc đó
        const conn = new lib.TikTokLiveConnection(username, attempt.options);
        attachConnectionEvents(conn, lib);
        try {
            console.log(`[tiktok] Connect attempt ${i + 1}/${attempts.length}: ${attempt.label} qua ${attempt.sign}${attempt.options.signApiKey ? ' (signed)' : ''}`);
            const state = await conn.connect();
            // Bắt tay xong CHƯA chắc có dữ liệu → phải thấy frame đầu tiên mới coi là kết nối thật.
            const alive = await waitForFirstTikTokFrame(conn, lib);
            if (!alive && !isLast) {
                const message = `kết nối câm — không frame nào trong ${TIKTOK_FIRST_FRAME_TIMEOUT_MS}ms (${attempt.sign})`;
                console.warn(`[tiktok] ${message} → bỏ connection này, thử tiếp`);
                errors.push({ attempt: attempt.label, message, kind: 'silent' });
                try { await conn.disconnect(); } catch (e) {}
                if (conn !== connection) liveConnected = false;   // handler CONNECTED của conn vừa bỏ đã bật cờ lên
                continue;   // đã chờ 8s rồi → không cần backoff thêm
            }
            if (!alive) console.warn('[tiktok] Hết sign-server để thử mà vẫn chưa có frame nào — giữ kết nối này (có thể phòng đang rất vắng)');
            if (i > 0) console.log(`[tiktok] ✓ Kết nối THÀNH CÔNG ở lần thử ${i + 1} (${attempt.label})`);
            return { conn, state, attempt: attempt.label, errors };
        } catch (err) {
            const message = String(err?.message || err || 'connect_failed').split('\n')[0];
            const kind = classifyTikTokConnectError(err);
            errors.push({ attempt: attempt.label, message, kind });
            console.warn(`[tiktok] Connect attempt failed (${attempt.label}, ${kind}${err?.constructor?.name ? ' ' + err.constructor.name : ''}): ${message}`);
            try { await conn.disconnect(); } catch (e) {}
            // Lỗi không-thể-retry (user offline, rate-limit, đã kết nối, thiếu quyền) → dừng ngay; hoặc đã hết lần thử.
            if (kind !== 'transient' || i === attempts.length - 1) {
                const out = new Error(normalizeTikTokConnectError(err, errors));
                out.cause = err;
                out.attempts = errors;
                out.kind = kind;
                throw out;
            }
            const wait = backoffs[Math.min(i, backoffs.length - 1)];
            console.log(`[tiktok] Thử lại sau ${wait}ms...`);
            await new Promise(resolve => setTimeout(resolve, wait));
        }
    }
}
async function connectToUser(username, opts = {}) {
    if (connecting) throw new Error('Đang kết nối, vui lòng chờ...');
    cancelAutoReconnect();
    if (!opts.auto) { manualDisconnect = false; streamEnded = false; reconnectAttempt = 0; }
    // Null trước rồi mới disconnect → handler DISCONNECTED của connection cũ thấy "không phải mình" và bỏ qua.
    if (connection) { const old = connection; connection = null; try { await old.disconnect(); } catch (e) {} }
    liveConnected = false;
    connecting = true;
    currentUsername = username.replace(/^@/, '').trim();
    const preserveSession = !!opts.preserveSession;   // tự nối lại giữa buổi → GIỮ stats/VIP session
    if (!preserveSession) {
        // Reset session-scoped state cho VIP Welcome + Live stats
        resetVipSession();
        warmVipSessionFromPersistent();   // pre-warm VIP đã cấu hình từ cache đĩa
        resetLiveStats();
    }
    // Log VIP Welcome config — user xem để verify rules đã load đúng từ disk
    try {
        const vw = appConfig.games.vipwelcome;
        if (vw) {
            const enabledProfiles = (vw.profiles || []).filter(p => p.enabled);
            console.log(`[vipwelcome] === Config snapshot khi connect LIVE ===`);
            console.log(`[vipwelcome]   master enabled: ${vw.enabled !== false}`);
            console.log(`[vipwelcome]   profiles total: ${(vw.profiles || []).length}, enabled: ${enabledProfiles.length}`);
            for (const p of (vw.profiles || [])) {
                const flag = p.enabled ? '✓ ON ' : '✗ off';
                console.log(`[vipwelcome]   ${flag} "${p.name}" — userRules: ${(p.userRules || []).length}, globalJoin: ${p.globalJoin?.enabled ? 'ON' : 'off'}, globalGift: ${p.globalGift?.enabled ? 'ON' : 'off'}`);
                for (const r of (p.userRules || [])) {
                    console.log(`[vipwelcome]     → rule: @${r.uniqueId} (${r.trigger}) ${r.enabled === false ? '[disabled]' : '[active]'} media=${r.mediaUrl ? 'YES' : 'no'}`);
                }
            }
            console.log(`[vipwelcome] === end snapshot ===`);
        }
    } catch (e) {}
    try {
        const connected = await createTikTokConnectionWithFallback(currentUsername);
        connection = connected.conn;
        const state = connected.state;
        console.log(`[tiktok] Connected via ${connected.attempt}${preserveSession ? ' (tự nối lại — giữ nguyên số liệu buổi live)' : ''}`);
        liveConnected = true;
        streamEnded = false;
        currentRoomId = state?.roomId;
        vipStartRoom();   // sổ ghé phòng: 1 roomId = 1 buổi (nối lại giữa buổi giữ roomId → không mở buổi mới)
        leagueStartRoom();   // 🏆 Thứ Hạng LIVE: phòng mới → xoá số cũ
        captionAutoStartOnLive({ newSession: !preserveSession });   // phụ đề giọng: tự mở cửa sổ nghe Edge/Chrome nếu bật
        // Synthetic "host vào phòng" event — TikTok không fire MEMBER cho HOST tự kết nối live của mình.
        // roomInfo là envelope JSON của TikTok {data:{owner:{id_str, display_id, nickname, avatar_thumb, follow_info...}}, extra,
        // status_code} (cả 2.1.0 lẫn 2.4.4) — trước đây đọc roomInfo.owner.* (camelCase) nên host luôn rỗng → PK không nhận
        // ra team host. Đọc data.owner snake_case, giữ fallback camelCase.
        const ri = state?.roomInfo || {};
        const owner = ri?.data?.owner || ri?.owner || {};
        const hostNickname = owner.nickname || owner.display_id || owner.displayId || owner.uniqueId || currentUsername;
        const hostLevel = Number(owner.userHonor?.level ?? owner.payGrade?.level ?? owner.pay_grade?.level) || 0;
        const hostPic = pickAvatarUrl(owner.profilePicture || owner.avatarThumb || owner.avatar_thumb || owner.avatar_medium || owner.avatarMedium) || '';
        const hostVerified = !!owner.verified;
        currentHostUserId = tiktokIdToString(owner.userId) || tiktokIdToString(owner.idStr) || tiktokIdToString(owner.id_str)
            || tiktokIdToString(owner.id) || tiktokIdToString(ri?.data?.owner_user_id_str) || tiktokIdToString(ri?.data?.owner_user_id)
            || tiktokIdToString(ri?.owner_user_id_str) || tiktokIdToString(ri?.owner_user_id) || '';
        // Lấy followerCount của HOST từ roomInfo
        const followerCount = Number(owner.followInfo?.followerCount ?? owner.follow_info?.follower_count) || 0;
        console.log(`[tiktok] Host: @${owner.display_id || owner.displayId || currentUsername} "${hostNickname}" id=${currentHostUserId || '?'} followers=${followerCount}`);
        if (followerCount > 0) {
            liveStats.followerCount = followerCount;
            emitLiveStatsImmediate();
        }
        if (!preserveSession) setTimeout(() => {
            vipHandleJoinSignal({ source: 'host', user: { ...vwSignals.readUser(owner, vipSignalCtx()), userId: currentHostUserId, uniqueId: currentUsername, nickname: hostNickname, avatar: hostPic, level: hostLevel, verified: hostVerified } });
        }, 300);
        // Lưu host profile vào RAM + emit cho client (Caro panel cần để hiển thị avatar CREATOR)
        currentHostProfile = {
            uniqueId: currentUsername || '',
            nickname: hostNickname || '',
            profilePic: hostPic || '',
            userId: currentHostUserId || '',
            level: hostLevel || 0,
            verified: !!hostVerified
        };
        io.emit('hostInfo', currentHostProfile);
        // Sau khi connect → connection.availableGifts có sẵn metadata cho mọi gift trong room.
        // Quét lại các unknown entry cũ thiếu icon/name → điền từ TikTok metadata cache.
        // Chạy sau 500ms để chắc availableGifts đã fully load.
        setTimeout(() => {
            try {
                const r = refreshUnknownGiftsFromTikTok();
                if (r.ok && r.updated > 0) {
                    console.log(`[unknown-gifts] Tự dò TikTok metadata → điền ${r.updated} entry thiếu.`);
                }
            } catch (e) { /* non-fatal */ }
        }, 500);
        return { ok: true, roomId: currentRoomId, username: currentUsername };
    } finally {
        connecting = false;
    }
}

// ====== Routes ======
app.get('/api/gifts', (req, res) => res.json(giftList));

// 🪄 Sticker AI (Hũ Thủy Tinh) — người dùng TỰ tạo tài khoản OpenAI và dán khoá API (platform.openai.com);
// app gọi thẳng OpenAI, HP Media không trung gian. Khoá lưu mã hoá theo HWID ở <DATA_DIR>/ai-sticker.json và
// KHÔNG bao giờ trả về giao diện. Ảnh lưu <DATA_DIR>/ai-art/, overlay OBS đọc /ai-art/<id>.png (chạy offline).
const AiOpenAI = require('./lib/ai-openai');
const AiSticker = require('./lib/ai-sticker');
const aiOpenAI = AiOpenAI.createOpenAI();
const aiSettings = AiOpenAI.createSettings({
    dataDir: DATA_DIR,
    machineSecret: () => { try { return require('./hpkey/validate').getHWID(); } catch (_) { return os.hostname(); } },
});
const aiSticker = AiSticker.createClient({ dataDir: DATA_DIR, settings: aiSettings, openai: aiOpenAI });
app.use('/ai-art', express.static(aiSticker.dir, { maxAge: '7d', fallthrough: false }));
app.get('/api/thuytinh/ai/library', (req, res) => res.json({ ok: true, items: aiSticker.library() }));
app.post('/api/thuytinh/ai/sticker', async (req, res) => {
    const r = await aiSticker.generate(req.body || {});
    if (!r.ok) console.warn('[ai-sticker]', r.error, r.detail || '');
    res.status(r.ok ? 200 : 400).json(r);
});
app.delete('/api/thuytinh/ai/library/:id', (req, res) => res.json({ ok: aiSticker.remove(req.params.id) }));
app.get('/api/thuytinh/ai/settings', (req, res) => res.json({ ok: true, settings: aiSettings.view() }));
app.post('/api/thuytinh/ai/settings', (req, res) => {
    const r = aiSettings.set(req.body || {});
    res.status(r.ok ? 200 : 400).json(r.ok ? r : { ...r, message: AiSticker.errVi(r.error) });
});
// Kiểm tra khoá (gọi /models — không tốn tiền ảnh). Có `apiKey` trong body thì thử khoá đó TRƯỚC khi lưu.
app.post('/api/thuytinh/ai/settings/check', async (req, res) => {
    const st = aiSettings.get();
    const apiKey = String((req.body && req.body.apiKey) || st.apiKey || '').trim();
    if (!apiKey) return res.json({ ok: false, error: 'no_key', message: AiSticker.errVi('no_key') });
    if (!/^sk-[\w-]{20,}$/.test(apiKey)) return res.json({ ok: false, error: 'key_format', message: AiSticker.errVi('key_format') });
    const r = await aiOpenAI.checkKey({ apiKey, model: (req.body && req.body.model) || st.model });
    res.json(r.ok ? r : { ...r, message: AiSticker.errVi(r.error) });
});

// 🎵 Danh mục bài Ca khúc (tên bài thật, ca sĩ, ảnh đĩa). Nhập thêm bằng file JSON tải từ TikTok
// (webcast.tiktok.com/webcast/gift/music/list/ … khi đã đăng nhập) hoặc file gom nhiều trang.
app.get('/api/music-gifts', (req, res) => {
    res.json({ ok: true, giftId: MusicGifts.MUSIC_GIFT_ID, songs: musicGiftSongList() });
});
app.post('/api/music-gifts/import', express.text({ type: 'text/plain', limit: '20mb' }), (req, res) => {
    let body = req.body;
    if (typeof body === 'string') {   // gửi dạng text/plain (vd. từ trang TikTok, không qua preflight CORS)
        try { body = JSON.parse(body.replace(/^﻿/, '')); } catch (e) { return res.status(400).json({ ok: false, error: 'File không phải JSON' }); }
    }
    const found = MusicGifts.catalogFromTikTokJson(body);
    const ids = Object.keys(found);
    if (!ids.length) return res.status(400).json({ ok: false, error: 'Không thấy bài nào trong file — cần JSON TikTok trả từ gift/music/list' });
    let added = 0;
    for (const id of ids) {
        const isNew = !musicGiftCatalog[id];
        rememberMusicSong(id, found[id]);
        if (isNew) added++;
    }
    console.log(`[music-gift] nhập ${ids.length} bài (${added} bài mới)`);
    res.json({ ok: true, imported: ids.length, added, total: Object.keys(musicGiftCatalog).length });
});

app.get('/api/live-translate/config', (req, res) => {
    appConfig.liveTranslate = sanitizeLiveTranslateConfig(appConfig.liveTranslate);
    res.json({ ...appConfig.liveTranslate, sheetRules: getCommentRulesMeta() });
});

app.post('/api/live-translate/config', (req, res) => {
    appConfig.liveTranslate = sanitizeLiveTranslateConfig(req.body || {});
    licenseCoerceTool('liveTranslate', appConfig.liveTranslate, 'liveTranslate');
    saveAppConfig();
    io.emit('translate:config', appConfig.liveTranslate);
    res.json({ ok: true, config: appConfig.liveTranslate });
});

app.get('/api/live-translate/rules', (req, res) => {
    res.json(getCommentRulesMeta());
});

app.post('/api/live-translate/rules/reload', async (req, res) => {
    await refreshCommentRulesSheet();
    res.json({ ok: !commentSheetRules.error, ...getCommentRulesMeta() });
});

// Trả về full danh sách từ cấm (cho client lọc nội dung — vd Caro TTS không đọc tên có từ cấm)
app.get('/api/comment-rules/list', (req, res) => {
    res.json({
        ok: !commentSheetRules.error,
        forbiddenWords: commentSheetRules.forbiddenWords || [],
        ...getCommentRulesMeta()
    });
});

app.post('/api/live-translate/test-tts', (req, res) => {
    const cfg = sanitizeLiveTranslateConfig(appConfig.liveTranslate);
    const text = String(req.body?.text || LIVE_TRANSLATE_TEST_PHRASE).trim().slice(0, 220);
    io.emit('translate:testSpeak', {
        translatedText: text,
        normalizedText: text,
        nickname: 'HP Action LIVE',
        uniqueId: 'hpmedia',
        targetLang: cfg.targetLang,
        targetLangLabel: liveTranslateLangLabel(cfg.targetLang),
        readUsername: cfg.readUsername,
        ttsReadMode: cfg.ttsReadMode,
        ttsPreset: cfg.ttsPreset,
        ttsRate: cfg.ttsRate,
        ttsVolume: cfg.ttsVolume,
        ttsVoice: cfg.ttsVoice,
        ttsSource: cfg.ttsSource,
        ttsPlayLocation: cfg.ttsPlayLocation,
        ttsEnabled: true,
        speechText: text,
        canSpeak: true,
        createTime: Date.now()
    });
    res.json({ ok: true });
});

app.post('/api/live-translate/test-comment', (req, res) => {
    processLiveTranslateChat({
        uniqueId: 'hpmedia',
        nickname: 'HP Action LIVE',
        userId: 'live-translate-test',
        profilePicture: '',
        comment: String(req.body?.text || 'Hello, this is a translated comment test.').trim().slice(0, 220),
        createTime: Date.now()
    });
    res.json({ ok: true });
});

app.get('/api/live-translate/debug', (req, res) => {
    res.json({
        connected: isTikTokLiveConnected(),
        username: currentUsername,
        roomId: currentRoomId,
        config: sanitizeLiveTranslateConfig(appConfig.liveTranslate),
        overlayCount: io.sockets.adapter.rooms.get('translateOverlay')?.size || 0,
        stats: liveTranslateStats,
        rules: getCommentRulesMeta()
    });
});

app.get('/api/dashboard/state', (req, res) => {
    res.json({ ...liveDashboardState, stats: { ...liveStats } });
});

app.get('/api/backup/export', (req, res) => {
    res.json({
        ok: true,
        exportedAt: new Date().toISOString(),
        app: 'HP Action LIVE',
        version: require('./package.json').version,
        config: appConfig
    });
});

app.post('/api/backup/import', (req, res) => {
    const incoming = req.body?.config || req.body;
    if (!incoming || typeof incoming !== 'object') return res.status(400).json({ ok: false, error: 'invalid_backup' });
    const nextGames = incoming.games && typeof incoming.games === 'object' ? incoming.games : {};
    appConfig.games = { ...(appConfig.games || {}), ...nextGames };
    for (const gId of Object.keys(GAMES)) {
        if (!appConfig.games[gId]) appConfig.games[gId] = { ...GAMES[gId].defaultConfig };
    }
    if (appConfig.games.vipwelcome) appConfig.games.vipwelcome = migrateVipWelcomeConfig(appConfig.games.vipwelcome);
    appConfig.liveTranslate = sanitizeLiveTranslateConfig(incoming.liveTranslate ? migrateLiveTranslateVolume(incoming.liveTranslate) : (appConfig.liveTranslate || {}));
    appConfig.creatorCaption = sanitizeCreatorCaptionConfig(incoming.creatorCaption || appConfig.creatorCaption || {});
    if (incoming.license && typeof incoming.license === 'object') appConfig.license = { ...(appConfig.license || {}), ...incoming.license };
    saveAppConfig();
    io.emit('translate:config', appConfig.liveTranslate);
    io.emit('creatorCaption:config', appConfig.creatorCaption);
    res.json({ ok: true, config: appConfig });
});

app.get('/api/creator-caption/config', (req, res) => {
    appConfig.creatorCaption = sanitizeCreatorCaptionConfig(appConfig.creatorCaption);
    res.json(appConfig.creatorCaption);
});

app.post('/api/creator-caption/config', (req, res) => {
    const wasEnabled = sanitizeCreatorCaptionConfig(appConfig.creatorCaption).enabled;
    appConfig.creatorCaption = sanitizeCreatorCaptionConfig(req.body || {});
    licenseCoerceTool('creatorCaption', appConfig.creatorCaption, 'liveTranslate');
    saveAppConfig();
    io.emit('creatorCaption:config', appConfig.creatorCaption);
    try { global.__captionApplyHotkey?.(appConfig.creatorCaption); } catch (e) {}   // phím tắt Nghe/Dừng (Electron)
    // Bỏ tick "Bật nhận giọng Creator" khi đang nghe → đóng cửa sổ nghe (server đã bỏ hết chữ, để nghe tiếp là vô nghĩa).
    if (wasEnabled && !appConfig.creatorCaption.enabled) { try { captionListenerStop(); } catch (e) {} }
    res.json({ ok: true, config: appConfig.creatorCaption });
});

app.post('/api/creator-caption/test', (req, res) => {
    processCreatorCaptionSpeech({ text: req.body?.text || 'Xin chào mọi người, hôm nay chúng ta bắt đầu live.' });
    res.json({ ok: true });
});

// ===== Cửa sổ nghe giọng Creator (Edge/Chrome --app) =====
// Electron không nghe được Web Speech API (không có khoá dịch vụ của Google), nên trang
// /listen/caption chạy trong Edge/Chrome thật với profile riêng của HP (quyền micro xin 1 lần);
// chữ tạm/câu final về đây qua socket (chỉ socket tin cậy — loopback).
const captionListener = CaptionListener.createListenerState({
    onChange: (snap) => io.emit('creatorCaption:listenerState', snap)
});
function captionListenerUrl(browser) {
    return `http://127.0.0.1:${PORT}/listen/caption?browser=${browser}`;
}
function captionListenerSpawn(browser) {
    const found = CaptionListener.resolveBrowserExe(browser, { exists: (p) => { try { return fs.existsSync(p); } catch (e) { return false; } } });
    if (!found) return null;
    const profileDir = path.join(DATA_DIR, 'caption-listener', found.browser);
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    const args = CaptionListener.buildLaunchArgs({ url: captionListenerUrl(found.browser), profileDir });
    const child = spawn(found.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', (e) => console.warn('[creator-caption] mở trình duyệt lỗi:', e.message));
    child.unref();
    captionSpawnedBrowser = found.browser;
    console.log(`[creator-caption] mở ${found.browser}${found.fallback ? ' (thay cho ' + browser + ')' : ''}: ${found.exe}`);
    return found;
}
let captionUserStopped = false;   // streamer đã DỪNG / đóng cửa sổ → LIVE nối lại giữa buổi KHÔNG tự mở (lời riêng không lên sóng)
let captionCancelOpen = false;    // DỪNG khi cửa sổ đang mở dở → trang nối tới thì bảo đóng luôn
let captionSpawnedBrowser = '';   // trình duyệt thực sự đã mở (có thể là dự phòng) — route reset xoá đúng profile
// Dừng nghe + bảo trang nghe tự đóng cửa sổ. Phát rộng (không chỉ socket đang giữ) để cửa sổ mồ côi/thứ hai
// cũng đóng. Gọi cả khi app tắt (electron-main actualFullQuit/before-quit, SIGINT, tự cập nhật).
function captionListenerStop({ byUser = true } = {}) {
    const before = captionListener.snapshot();
    if (before.status === 'opening' && !before.socketId) captionCancelOpen = true;
    captionListener.stop();
    if (byUser) captionUserStopped = true;
    io.emit('creatorCaption:listener:stop', { close: true });
    return captionListener.snapshot();
}
// Mở (hoặc bảo trang đang mở nghe lại) — idempotent nhờ máy trạng thái. → { ok, error? }
function captionListenerOpen({ startWhenReady = false } = {}) {
    captionUserStopped = false;
    captionCancelOpen = false;
    const browser = sanitizeCreatorCaptionConfig(appConfig.creatorCaption).browser;
    const r = captionListener.open({ browser, startWhenReady });
    if (r.action === 'spawn') {
        if (!captionListenerSpawn(browser)) {
            captionListener.fail('browser_not_found');
            return { ok: false, error: 'browser_not_found' };
        }
    } else if (r.action === 'start' && r.socketId) {
        io.to(r.socketId).emit('creatorCaption:listener:start');
    }
    return { ok: true };
}
// Phím tắt Nghe/Tạm dừng: đang nghe → tạm dừng (cửa sổ vẫn mở); đang nghỉ → nghe lại; chưa có cửa sổ → mở và
// nghe ngay khi trang sẵn sàng (chế độ Bấm/Dừng không tự nghe khi mở).
function captionListenerToggle() {
    captionCancelOpen = false;
    const browser = sanitizeCreatorCaptionConfig(appConfig.creatorCaption).browser;
    const r = captionListener.toggle({ browser });
    if (r.action !== 'pause') captionUserStopped = false;
    if (r.action === 'pause' && r.socketId) io.to(r.socketId).emit('creatorCaption:listener:stop', { close: false });
    else if (r.action === 'start' && r.socketId) io.to(r.socketId).emit('creatorCaption:listener:start');
    else if (r.action === 'spawn') {
        if (!captionListenerSpawn(browser)) { captionListener.fail('browser_not_found'); return { ok: false, error: 'browser_not_found' }; }
    }
    return { ok: true, action: r.action };
}
// Chạy ngầm: thu nhỏ cửa sổ nghe khi trang báo ĐANG NGHE (quyền micro đã cấp) — mỗi socket một lần,
// để lời hỏi quyền micro lần đầu vẫn hiện ra cho người dùng bấm Cho phép.
const captionMinimizedSockets = new Set();
function captionMaybeMinimize(socketId, info) {
    if (!info || info.state !== 'listening' || captionMinimizedSockets.has(socketId)) return;
    if (!sanitizeCreatorCaptionConfig(appConfig.creatorCaption).background) return;
    captionMinimizedSockets.add(socketId);
    console.log('[creator-caption] chạy ngầm: thu nhỏ cửa sổ nghe');
    setTimeout(() => { try { require('./lib/win-minimize').minimizeWindowByTitle('HP Phụ đề giọng'); } catch (e) {} }, 600);
}
// LIVE vừa kết nối → tự mở cửa sổ nghe nếu tính năng bật và autoStart (streamer không phải bấm mỗi buổi).
// Buổi LIVE MỚI (không phải nối lại giữa buổi) mới xoá cờ "đã DỪNG"; nối lại thì tôn trọng streamer đã dừng.
function captionAutoStartOnLive({ newSession = false } = {}) {
    try {
        if (newSession) captionUserStopped = false;
        const cfg = sanitizeCreatorCaptionConfig(appConfig.creatorCaption);
        if (!cfg.enabled || !cfg.autoStart || captionUserStopped) return;
        const r = captionListenerOpen();
        if (!r.ok) console.warn('[creator-caption] tự mở cửa sổ nghe thất bại:', r.error);
    } catch (e) { console.warn('[creator-caption] tự mở cửa sổ nghe lỗi:', e.message); }
}
app.get('/api/creator-caption/listener/state', (req, res) => res.json(captionListener.snapshot()));
app.post('/api/creator-caption/listener/open', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const body = req.body || {};
    if (body.browser) {
        appConfig.creatorCaption = sanitizeCreatorCaptionConfig({ ...(appConfig.creatorCaption || {}), browser: body.browser });
        saveAppConfig();
        io.emit('creatorCaption:config', appConfig.creatorCaption);
    }
    const r = captionListenerOpen();
    if (!r.ok) return res.status(404).json({ ok: false, error: r.error, state: captionListener.snapshot() });
    res.json({ ok: true, state: captionListener.snapshot() });
});
app.post('/api/creator-caption/listener/stop', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    res.json({ ok: true, state: captionListenerStop() });
});
app.post('/api/creator-caption/listener/toggle', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const r = captionListenerToggle();
    if (!r.ok) return res.status(404).json({ ok: false, error: r.error, state: captionListener.snapshot() });
    res.json({ ok: true, action: r.action, state: captionListener.snapshot() });
});
setTimeout(() => { try { global.__captionApplyHotkey?.(sanitizeCreatorCaptionConfig(appConfig.creatorCaption)); } catch (e) {} }, 1500);
// Người dùng lỡ bấm "Chặn" micro → trình duyệt nhớ mãi trong profile. Xoá profile riêng của HP
// (chỉ thư mục <data>/caption-listener/<browser đã mở thật>) để lần mở sau hỏi lại quyền.
app.post('/api/creator-caption/listener/reset', async (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    captionListenerStop();
    const browser = CaptionListener.normalizeBrowser(captionSpawnedBrowser || sanitizeCreatorCaptionConfig(appConfig.creatorCaption).browser);
    const profileDir = path.join(DATA_DIR, 'caption-listener', browser);
    await new Promise(r => setTimeout(r, 2000));   // chờ trình duyệt đóng cửa sổ, nhả khoá file profile
    try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
        console.log('[creator-caption] đã xoá profile', profileDir);
        res.json({ ok: true, browser, state: captionListener.snapshot() });
    } catch (e) {
        console.warn('[creator-caption] xoá profile lỗi:', e.message);
        res.status(500).json({ ok: false, error: 'profile_busy', state: captionListener.snapshot() });
    }
});
app.get('/listen/caption', (req, res) => res.sendFile(path.join(__dirname, 'public', 'listen', 'caption.html')));

app.get('/api/live-translate/tts', async (req, res) => {
    const text = String(req.query.text || '').trim().slice(0, 220);
    const lang = String(req.query.lang || 'vi').trim().toLowerCase().replace(/[^a-z-]/g, '').slice(0, 12) || 'vi';
    if (!text) return res.status(400).json({ ok: false, error: 'missing_text' });
    try {
        const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl='
            + encodeURIComponent(lang)
            + '&q=' + encodeURIComponent(text);
        const r = await fetch(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 HP-Action-LIVE' } });
        if (!r.ok) throw new Error('tts_http_' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buf);
    } catch (e) {
        res.status(502).json({ ok: false, error: e.message || 'tts_failed' });
    }
});

// ★ Server boot id — đổi mỗi lần process khởi động. Overlay (OBS Browser Source) poll
//   endpoint này: nếu bootId khác lần trước → tự location.reload(). Nhờ vậy MỖI LẦN MỞ APP
//   overlay tự nạp lại, KHÔNG cần vào OBS bấm "Refresh" thủ công, và TTS phát lại sau restart.
//   Dùng REST poll (KHÔNG dùng socket.io) để TÁCH BIỆT hoàn toàn — không đụng tới socket
//   của bất kỳ game overlay nào.
const SERVER_BOOT_ID = String(Date.now());
app.get('/api/server-bootid', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ bootId: SERVER_BOOT_ID });
});

// ===== Unknown gifts API (quà mới phát hiện ngoài Google Sheet) =====
// Trả về sorted theo lastSeen DESC để quà vừa thấy nằm trên cùng.
app.get('/api/unknown-gifts', (req, res) => {
    const list = Object.values(unknownGifts).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    res.json({ list, total: list.length });
});
// Xoá 1 entry (sau khi user đã add vào Google Sheet)
app.delete('/api/unknown-gifts/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (unknownGifts[id]) {
        delete unknownGifts[id];
        scheduleSaveUnknown();
        io.emit('unknownGiftCleared', { id, total: Object.keys(unknownGifts).length });
    }
    res.json({ ok: true, total: Object.keys(unknownGifts).length });
});
// Xoá toàn bộ — dùng khi user reload Google Sheet và muốn reset.
// Có option ?keepStillUnknown=1 → giữ lại các entry vẫn không có trong sheet sau reload.
app.post('/api/unknown-gifts/clear', (req, res) => {
    const keepStillUnknown = req.query.keepStillUnknown === '1' || req.body?.keepStillUnknown;
    if (keepStillUnknown) {
        // Sau reload sheet, các giftId đã có trong giftMap có thể xoá khỏi unknown.
        let removed = 0;
        for (const id of Object.keys(unknownGifts)) {
            if (giftMap[id]) { delete unknownGifts[id]; removed++; }
        }
        scheduleSaveUnknown();
        io.emit('unknownGiftCleared', { all: false, removed, total: Object.keys(unknownGifts).length });
        return res.json({ ok: true, removed, total: Object.keys(unknownGifts).length });
    }
    unknownGifts = {};
    scheduleSaveUnknown();
    io.emit('unknownGiftCleared', { all: true, total: 0 });
    res.json({ ok: true, removed: 'all', total: 0 });
});
// Tra cứu metadata từ TikTok availableGifts để điền name/image cho các entry bị thiếu
// (vd: streak gift đến mà event không có giftPicture URL).
app.post('/api/unknown-gifts/refresh-from-tiktok', (req, res) => {
    const r = refreshUnknownGiftsFromTikTok();
    res.json(r);
});

// ===== SCAN: rà soát TOÀN BỘ availableGifts của TikTok room hiện tại so với Google Sheet.
// Logic: với mỗi gift trong availableGifts → check giftMap[id]. Nếu KHÔNG có trong Sheet
// và có đủ name/image → thêm vào unknownGifts (source='scan'). Trả về thống kê.
// → User bấm "📋 Copy all" để batch copy → paste 1 lần vào Sheet.
app.post('/api/scan-tiktok-gifts', (req, res) => {
    if (!connection || !connection.availableGifts) {
        return res.status(400).json({ ok: false, error: 'Chưa kết nối LIVE — không có availableGifts để rà soát. Bấm "Kết nối LIVE" trước.' });
    }
    const items = Array.isArray(connection.availableGifts)
        ? connection.availableGifts
        : Object.values(connection.availableGifts || {});
    const stats = { scanned: items.length, existing: 0, added: 0, updated: 0, skipped: 0 };
    const now = Date.now();
    for (const g of items) {
        const id = String(g.id || '').trim();
        if (!id) { stats.skipped++; continue; }
        if (giftMap[id]) { stats.existing++; continue; }
        const imgUrls = g.image?.url_list || g.icon?.url_list || [];
        const name = g.name || '';
        const image = imgUrls[0] || '';
        const diamond = g.diamond_count || 0;
        if (!name && !image) { stats.skipped++; continue; }
        if (unknownGifts[id]) {
            // Đã từng phát hiện (live event) → chỉ refresh thông tin
            const prev = unknownGifts[id];
            let touched = false;
            if (!prev.name && name) { prev.name = name; touched = true; }
            if (!prev.image && image) { prev.image = image; touched = true; }
            if ((!prev.diamond || prev.diamond <= 0) && diamond > 0) { prev.diamond = diamond; touched = true; }
            prev.lastSeen = now;
            if (touched) stats.updated++; else stats.existing++;   // count "existing" cho entries không cần đổi
        } else {
            // Quà mới — chưa có trong Sheet, cũng chưa từng nhận event
            unknownGifts[id] = {
                id, name, image, diamond,
                count: 0,        // chưa có event nào, chỉ rà từ catalog
                firstSeen: now,
                lastSeen: now,
                source: 'scan'   // đánh dấu để UI hiển thị khác (vd: "từ scan")
            };
            stats.added++;
        }
    }
    if (stats.added > 0 || stats.updated > 0) {
        scheduleSaveUnknown();
        // Emit toàn bộ snapshot — App refetch để render đúng
        io.emit('unknownGiftCleared', { all: false, removed: 0, total: Object.keys(unknownGifts).length });
    }
    stats.totalUnknown = Object.keys(unknownGifts).length;
    res.json({ ok: true, ...stats });
});
// Lookup 1 giftId ngay cả khi CHƯA có trong unknownGifts (user nhập ID thủ công từ UI).
app.get('/api/tiktok-gift/:id', (req, res) => {
    const id = String(req.params.id || '');
    const tt = lookupGiftFromTikTok(id);
    if (!tt) return res.status(404).json({ ok: false, error: 'Không tìm thấy gift ID này trong availableGifts (cần đang kết nối LIVE)' });
    res.json({ ok: true, id, ...tt });
});
// Proxy tải icon: server fetch ảnh từ TikTok CDN rồi stream về client (tránh CORS khi
// download trực tiếp từ browser).
app.get('/api/unknown-gifts/:id/image', async (req, res) => {
    const id = String(req.params.id || '');
    const entry = unknownGifts[id];
    if (!entry || !entry.image) return res.status(404).json({ ok: false, error: 'Không có ảnh' });
    try {
        const r = await fetch(entry.image);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = r.headers.get('content-type') || 'image/png';
        // Suffix file theo content-type
        const ext = ct.includes('webp') ? 'webp' : ct.includes('png') ? 'png' : 'jpg';
        const safeName = (entry.name || ('gift-' + id)).replace(/[^\w\-]+/g, '_').slice(0, 40);
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${id}.${ext}"`);
        const buf = Buffer.from(await r.arrayBuffer());
        res.end(buf);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.get('/api/overlay-presence', (req, res) => res.json(overlayPresenceSnapshot()));
// 📋 Bảng Quà Tổng: quà các game 🎥 Game Camera + game nào đang THẬT SỰ nhận quà (đang chọn trong hub, hoặc
// link riêng cũ của Bắn Cung; Bắn Cung còn phải ▶ BẮT ĐẦU). Mục không có giftId = dòng "mọi quà/theo xu".
app.get('/api/giftboard/cam-gifts', (req, res) => {
    const actives = camActives();
    const catalog = camGiftCatalog();
    const games = {}, running = {};
    for (const id of CAM_GAME_IDS) {
        if (id === 'level-quest') continue;              // không có quà chỉ định
        const cfg = appConfig.games?.[id] || {};
        running[id] = CamRules.actsOnGifts(id, cfg) && (id === 'bancung' ? cfg.sessionActive === true : true)
            && (actives.includes(id) || CAM_STANDALONE_IDS.has(id));
        games[id] = id === 'body'
            ? BodyServer.giftBoardList(cfg).map(g => ({ giftId: g.giftId, name: g.giftName, image: g.giftImage, diamonds: 0, emoji: '', label: g.label }))
            : CamSession.gameGiftList(id, cfg, catalog, 200);
    }
    res.json({ actives, running, games });
});
// 📋 Bảng Quà Tổng: quà 🎮 Game Tương Tác (lib/giftboard-tt.js) — nhãn hành động nạp 1 lần từ data.json / ES module game.
let giftboardTtLabels = null;
app.get('/api/giftboard/tt-gifts', async (req, res) => {
    try {
        if (!giftboardTtLabels) giftboardTtLabels = GiftboardTT.loadLabels(path.join(__dirname, 'public', 'games'));
        const labels = await giftboardTtLabels;
        const catalog = new Map(camGiftCatalog().map(g => [g.id, g]));
        res.json(GiftboardTT.buildTtGifts(appConfig.games, labels, catalog));
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/games', (req, res) => {
    const list = Object.values(GAMES).map(g => ({
        id: g.id, name: g.name, description: g.description, icon: g.icon,
        overlayPath: g.overlayPath,
        config: appConfig.games[g.id],
        locked: !featureOn(g.id),     // tính năng theo KEY: giao diện hiện 🔒, không cho bật
        lstate: licenseStateOf(g.id)  // on | locked | off (⏸ Tạm bảo trì) | hidden (không hiện) | admin (🧪)
    }));
    res.json(list);
});

// Tính năng theo KEY: danh sách mở (null = tất cả) + các id đang bị khoá (gồm cả công cụ ảo liveTranslate / obs-effects)
// + states = trạng thái hiển thị của mục khác 'on' (locked / off / hidden / admin — HP KEY gs).
app.get('/api/license/features', (req, res) => {
    const features = licenseFeatures();
    res.json({ features, locked: LicFeat.lockedIds(features), lockable: LicFeat.LOCKABLE, states: LicFeat.states(features, licenseGameState()) });
});

app.get('/api/games/:id/config', (req, res) => {
    const g = GAMES[req.params.id];
    if (!g) return res.status(404).json({ ok: false, error: 'Không tìm thấy game' });
    if (g.id === 'pktiktok') appConfig.games.pktiktok = normalizePkTiktokConfig(appConfig.games.pktiktok);
    res.json(appConfig.games[g.id]);
});

app.post('/api/games/:id/config', (req, res) => {
    const g = GAMES[req.params.id];
    if (!g) return res.status(404).json({ ok: false, error: 'Không tìm thấy game' });
    const prevConfig = appConfig.games[g.id] || {};
    const prevEnabled = prevConfig.enabled !== false;
    // Deep-merge display sub-object cho game server-authoritative — phòng case partial POST
    // (panel chỉ gửi subset of display fields). Whoever posts last wins per-field.
    const incoming = req.body || {};
    if ((g.id === 'nhietdo' || g.id === 'bancung' || g.id === 'trongcay' || g.id === 'nhatla' || g.id === 'giftboard' || g.id === 'dapmuoi') && incoming.display && prevConfig.display) {
        incoming.display = { ...prevConfig.display, ...incoming.display };
    }
    // Nhặt Lá giữ config từng effect khi UI chỉ cập nhật một thuộc tính (vd. số giây TOM).
    if (g.id === 'nhatla' && incoming.effects && prevConfig.effects) {
        incoming.effects = { ...prevConfig.effects, ...incoming.effects };
    }
    // Cùng lý do cho khối gió: panel chỉnh 1 thanh trượt không được xoá mất danh sách quà gió.
    if (g.id === 'nhatla' && incoming.wind && prevConfig.wind) {
        incoming.wind = { ...prevConfig.wind, ...incoming.wind };
    }
    if (g.id === 'nhatla' && incoming.tornado && prevConfig.tornado) {
        incoming.tornado = { ...prevConfig.tornado, ...incoming.tornado };
    }
    // Bảng TOP kéo thả trên overlay chỉ POST 2 field toạ độ — đừng nuốt mất phần còn lại.
    if (g.id === 'nhatla' && incoming.topDonors && prevConfig.topDonors) {
        incoming.topDonors = { ...prevConfig.topDonors, ...incoming.topDonors };
    }
    // Bảng Quà Tổng: vị trí từng khối POST một phần (kéo 1 khối) không được xoá các khối còn lại.
    if (g.id === 'giftboard' && incoming.panels && prevConfig.panels) {
        incoming.panels = { ...prevConfig.panels, ...incoming.panels };
    }
    if (g.id === 'nhatla' && incoming.rescue && prevConfig.rescue) {
        incoming.rescue = { ...prevConfig.rescue, ...incoming.rescue };
    }
    // Danh sách túi nợ kéo thả ngay trên overlay chỉ POST 2-3 field toạ độ/cỡ — merge nông
    // ở dưới sẽ thay nguyên khối bags bằng mảnh đó, mất cả size lẫn ngưỡng mở túi.
    if (g.id === 'nhatla' && incoming.bags && prevConfig.bags) {
        incoming.bags = { ...prevConfig.bags, ...incoming.bags };
    }
    // Tab Bảng quà POST từng phần (kéo 1 thanh trượt là 1 field) — merge nông ở dưới sẽ
    // thay nguyên khối giftBoard bằng mảnh vừa gửi, mất hết phần còn lại.
    if (g.id === 'nhatla' && incoming.giftBoard && prevConfig.giftBoard) {
        incoming.giftBoard = {
            ...prevConfig.giftBoard,
            ...incoming.giftBoard,
            autoScroll: { ...prevConfig.giftBoard.autoScroll, ...(incoming.giftBoard.autoScroll || {}) }
        };
    }
    // Game Camera: {active} = chơi riêng, {actives} = chơi cùng lúc → chuẩn hoá theo khe (lib/camgames.js).
    if (g.id === 'camgames') {
        Object.assign(incoming, CamRules.applyPatch(prevConfig, incoming, CAM_GAME_IDS));
        // Tính năng theo KEY: game con bị khoá không chọn được (rỗng → game con đầu tiên được mở, xem applyLicenseLocks).
        let allowed = incoming.actives.filter(id => featureOn(id));
        if (!allowed.length) allowed = CAM_GAME_IDS.filter(id => featureOn(id)).slice(0, 1);
        if (allowed.length && allowed.join() !== incoming.actives.join()) {
            Object.assign(incoming, CamRules.applyPatch(prevConfig, { actives: allowed }, CAM_GAME_IDS));
        }
    }
    appConfig.games[g.id] = { ...appConfig.games[g.id], ...incoming };
    if (g.id === 'body') appConfig.games.body = BodyServer.normalizeConfig(appConfig.games.body);
    if (g.id === 'thuytinh') cleanThuyTinhConfig(appConfig.games.thuytinh);   // app cũ POST config lẫn key game khác
    if (g.id === 'pktiktok') {
        appConfig.games.pktiktok = normalizePkTiktokConfig(appConfig.games.pktiktok);
    }
    if (g.id === 'vipwelcome') {
        vipKeepLearnedUserIds(prevConfig, appConfig.games.vipwelcome);   // panel có thể giữ bản cũ chưa có userId
        appConfig.games.vipwelcome = migrateVipWelcomeConfig(appConfig.games.vipwelcome);
        try { global.__vipwelcomeApplyHotkeys?.(appConfig.games.vipwelcome); } catch (e) {}
        try { vipBoardChanged(true); } catch (e) {}   // đổi tiêu đề/phạm vi/skin bảng xếp hạng → overlay BXH cập nhật ngay
    }
    if (g.id === 'votecomment') {
        // Khi panel save config (title, rows, duration, display) → đồng bộ state.
        // Không reset counters đang chạy — counts giữ theo row.id.
        try { voteCommentApplyConfigToState(appConfig.games.votecomment); } catch (e) {}
        broadcastVoteCommentState({ immediate: true });
    }
    if (g.id === 'nhietdo') {
        // Sync tempMin/Max/active với state — KHÔNG reset nhiệt độ đang có.
        try { nhietDoApplyConfigToState(appConfig.games.nhietdo); } catch (e) {}
        broadcastNhietDoState({ immediate: true });
    }
    if (g.id === 'bancung') {
        try { banCungApplyConfigToState(appConfig.games.bancung); } catch (e) {}
        camApplyHotkeys('bancung');
        broadcastBanCungState({ immediate: true });
    }
    if (g.id === 'dapmuoi') {
        camApplyHotkeys('dapmuoi');
    }
    if (g.id === 'duongveque') {
        try { global.__dvqApplyHotkeys?.(appConfig.games.duongveque); } catch (e) {}
    }
    if (g.id === 'nhatla') {
        try { global.__nhatlaApplyHotkeys?.(appConfig.games.nhatla); } catch (e) {}
        // Đổi "TOP mấy" hoặc ngưỡng lá tối thiểu → đẩy lại danh sách ngay, đừng đợi quà kế tiếp.
        emitNhatLaTop(true);
    }
    if (g.id === 'trongcay') {
        try { trongCayApplyConfigToState(appConfig.games.trongcay); } catch (e) {}
        broadcastTrongCayState({ immediate: true });
    }
    if (g.id === 'camgames') {
        if (typeof appConfig.games.camgames.source !== 'string') appConfig.games.camgames.source = '';
        appConfig.games.camgames.source = appConfig.games.camgames.source.slice(0, 200);
        const hk = appConfig.games.camgames.hotkeyGame;
        appConfig.games.camgames.hotkeyGame = CAM_GAME_IDS.includes(hk) ? hk : '';
        camGamesApplyActive(prevConfig);
        // Đổi game đang chơi / game giữ phím → phân lại phím tắt (game không đổi enabled cũng có thể đổi chủ phím).
        camApplyAllHotkeys();
    }
    // Tính năng theo KEY: mục bị khoá không bật được (các thiết lập khác vẫn lưu). Muốn bật lúc đang khoá → nhớ
    // để mở khoá thì tự bật; tự tắt tay → bỏ nhớ (mở khoá không bật lại ngược ý người dùng).
    const featLocked = !featureOn(g.id) && !CAM_IGNORES_ENABLED.has(g.id);
    if (incoming.enabled === false) delete licenseLocks().games[g.id];
    if (featLocked && appConfig.games[g.id].enabled !== false) {
        appConfig.games[g.id].enabled = false;
        if (!lockViaCamSelection(g.id)) licenseLocks().games[g.id] = true;
    }
    const newEnabled = appConfig.games[g.id].enabled !== false;
    saveAppConfig();
    io.emit('gameConfig', { gameId: g.id, config: appConfig.games[g.id] });
    // Khi game vừa bị TẮT → gửi stop signal để overlay clear playback ngay lập tức
    if (prevEnabled && !newEnabled) {
        emitGameStopped(g.id);
    } else if (!prevEnabled && newEnabled) {
        io.emit('gameEnabled', { gameId: g.id, ts: Date.now() });
        console.log(`[game-toggle] Game "${g.id}" enabled`);
    }
    res.json({ ok: true, config: appConfig.games[g.id], locked: featLocked });
});

// Tín hiệu khi một game vừa bị TẮT: overlay xoá ngay hiệu ứng đang phát. keepData (tắt do KEY không có tính năng):
// KHÔNG xoá dữ liệu người dùng — vườn Trồng Cây còn nguyên, mở khoá là chơi tiếp.
function emitGameStopped(id, opts) {
    const keepData = !!(opts && opts.keepData);
    if (id === 'pktiktok') {
        io.emit('pktiktok:stop', { ts: Date.now(), reason: 'gameDisabled' });
    } else if (id === 'vipwelcome') {
        resetVipPlaybackState();
        io.emit('vipwelcome:stop', { ts: Date.now(), reason: 'gameDisabled' });
        io.emit('vipwelcome:queue', { size: 0 });
    } else if (id === 'votecomment') {
        voteCommentStop({ reason: 'gameDisabled' });
    } else if (id === 'nhietdo') {
        // Khi tắt game → giảm temp về min ngay để overlay clear hiệu ứng lửa
        nhietDoState.temp = nhietDoState.tempMin;
        broadcastNhietDoState({ immediate: true });
    } else if (id === 'bancung') {
        // Khi tắt → reset HP về full để khi bật lại không bị "chết treo"
        banCungReset();
    } else if (id === 'trongcay' && !keepData) {
        trongCayReset();
    }
    // Generic event cho mọi game — overlay nào lắng nghe sẽ tự clear
    io.emit('gameDisabled', { gameId: id, ts: Date.now() });
    console.log(`[game-toggle] Game "${id}" disabled → emit stop signals${keepData ? ' (khoá theo KEY, giữ dữ liệu)' : ''}`);
}

// Cache trạng thái game từng game — đẩy lên overlay khi (re)connect VÀ push realtime mỗi POST.
// PERSISTENCE: lưu vào disk → restart app không mất quà đã tặng.
// QUAN TRỌNG: app preview là authoritative source. Khi caughtList/policeForce/totalDiamonds đổi,
// app POST state → server cache + broadcast tới room 'overlay' → OBS gọi loadState → render lại.
const GAME_STATE_FILE = path.join(DATA_DIR, 'game-state.json');
let gameStateCache = {};
// Sau lệnh clear Nhặt Lá, chặn snapshot cũ từ tab/OBS gửi trễ ghi đè trạng thái trống.
let nhatLaStateLockedUntil = 0;
// Một drag lá chỉ có một owner tại một thời điểm để effect biết đúng overlay nào cần buông lá.
let nhatLaActiveDragSocketId = null;
function loadGameStateCache() {
    try {
        if (fs.existsSync(GAME_STATE_FILE)) {
            const raw = fs.readFileSync(GAME_STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw || '{}');
            if (parsed && typeof parsed === 'object') gameStateCache = parsed;
            console.log(`[game-state] Loaded ${Object.keys(gameStateCache).length} games từ disk`);
        }
    } catch (e) {
        console.warn('[game-state] Load fail:', e.message);
        gameStateCache = {};
    }
}
let _gameStateSaveTimer = null;
function saveGameStateNow() {
    try {
        fs.writeFileSync(GAME_STATE_FILE, JSON.stringify(gameStateCache), 'utf8');
        return true;
    } catch (e) {
        console.warn('[game-state] Save fail:', e.message);
        return false;
    }
}
function scheduleSaveGameState() {
    clearTimeout(_gameStateSaveTimer);
    _gameStateSaveTimer = setTimeout(() => {
        saveGameStateNow();
    }, 1500);
}
loadGameStateCache();
// Nhặt Lá là game realtime, KHÔNG khôi phục lá qua lần restart. Snapshot cũ có thể nằm
// giữa animation và tạo lá "kẹt" không thể kéo, nên luôn xóa triệt để khi server khởi động.
gameStateCache.nhatla = { totalDropped: 0, cleaned: 0, leaves: [] };
saveGameStateNow();
const NHATLA_STARTUP_CLEAR_UNTIL = Date.now() + 30000;
// Browser Source cũ có thể reconnect vài giây sau server và gửi timer snapshot tồn đọng.
// Trong toàn bộ startup window chỉ server được phép giữ state trống.
nhatLaStateLockedUntil = NHATLA_STARTUP_CLEAR_UNTIL;

app.post('/api/games/:id/state', (req, res) => {
    const g = GAMES[req.params.id];
    if (!g) return res.status(404).json({ ok: false, error: 'Không tìm thấy game' });
    gameStateCache[g.id] = req.body || {};
    // Nhặt Lá chỉ giữ state trong RAM của phiên hiện tại (không save snapshot lá xuống disk).
    if (g.id !== 'nhatla') {
        if (req.query.flush === '1' || req.body?._flush === true) saveGameStateNow();
        else scheduleSaveGameState();
    }
    // Live broadcast tới room 'overlay' (KHÔNG echo về 'preview' để tránh ghi đè edits đang gõ)
    io.to('overlay').emit('gameStateSnapshot', { gameId: g.id, state: gameStateCache[g.id] });
    res.json({ ok: true });
});
app.get('/api/games/:id/state', (req, res) => {
    res.json(gameStateCache[req.params.id] || null);
});

// Trả về version app hiện tại (KHÔNG còn expose GitHub repo)
// ============================================================
// TikTok avatar fetcher — via tikwm.com public API (TikTok chính chủ block scrape)
// ============================================================
// Endpoint: GET /api/tiktok-user-avatar?username=xxx
// Cache 6 giờ trong RAM tránh hit rate limit của tikwm.
const _ttAvatarCache = new Map();   // username → { url, nickname, ts, error }
const TT_AVATAR_TTL = 6 * 60 * 60 * 1000;
const TT_AVATAR_CACHE_MAX = 500;
function ttAvatarCacheSet(k, v) {
    if (_ttAvatarCache.size >= TT_AVATAR_CACHE_MAX) {
        const now = Date.now();
        for (const [ck, e] of _ttAvatarCache) if (now - (e?.ts || 0) > TT_AVATAR_TTL) _ttAvatarCache.delete(ck);
        if (_ttAvatarCache.size >= TT_AVATAR_CACHE_MAX) _ttAvatarCache.delete(_ttAvatarCache.keys().next().value);
    }
    _ttAvatarCache.set(k, v);
}
async function fetchTikTokAvatar(username) {
    const uname = String(username || '').toLowerCase().replace(/^@+/, '').trim();
    if (!uname) return { ok: false, error: 'empty_username' };
    // Cache hit?
    const cached = _ttAvatarCache.get(uname);
    if (cached && (Date.now() - cached.ts) < TT_AVATAR_TTL) {
        if (cached.error) return { ok: false, error: cached.error, cached: true };
        return { ok: true, avatarUrl: cached.url, nickname: cached.nickname, cached: true };
    }
    try {
        // tikwm.com public API — scrape TikTok user info
        const res = await fetch(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(uname)}`, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) {
            ttAvatarCacheSet(uname, { error: `HTTP ${res.status}`, ts: Date.now() });
            return { ok: false, error: `HTTP ${res.status}` };
        }
        const body = await res.json();
        if (body?.code !== 0 || !body?.data?.user) {
            ttAvatarCacheSet(uname, { error: body?.msg || 'no_user', ts: Date.now() });
            return { ok: false, error: body?.msg || 'no_user' };
        }
        const u = body.data.user;
        // Prefer avatarLarger > avatarMedium > avatarThumb
        const avatarUrl = u.avatarLarger || u.avatarMedium || u.avatarThumb || '';
        const nickname = u.nickname || u.uniqueId || uname;
        if (!avatarUrl) {
            ttAvatarCacheSet(uname, { error: 'no_avatar', ts: Date.now() });
            return { ok: false, error: 'no_avatar' };
        }
        ttAvatarCacheSet(uname, { url: avatarUrl, nickname, ts: Date.now() });
        return { ok: true, avatarUrl, nickname };
    } catch (e) {
        ttAvatarCacheSet(uname, { error: e.message, ts: Date.now() });
        return { ok: false, error: e.message };
    }
}
app.get('/api/tiktok-user-avatar', async (req, res) => {
    const username = String(req.query.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, error: 'username required' });
    const r = await fetchTikTokAvatar(username);
    res.json(r);
});

// ====== ⚙ Cài đặt chung ======
function settingsSnapshot(req) {
    const k = String(appConfig.tiktokSignApiKey || '');
    const n = networkConfig();
    // Token là chìa khoá GHI từ LAN → chỉ trả cho máy này (hoặc client đã có token). Máy LAN gọi
    // GET /api/settings không header thì thấy rỗng.
    const showToken = n.lanAccess === true && requestIsTrusted(req);
    return {
        ok: true,
        tiktokSignApiKeySet: !!k,
        tiktokSignApiKeyMasked: k ? (k.slice(0, 4) + '••••' + k.slice(-4)) : '',
        tiktokSignApiKeyFromEnv: !!(process.env.TIKTOK_SIGN_API_KEY || process.env.EULER_API_KEY),
        tiktokSignBaseUrl: getTikTokSignBaseUrl(),
        tiktokSignBaseUrlFromEnv: !!(process.env.TIKTOK_SIGN_API_URL || process.env.SIGN_API_URL),
        autoReconnect: appConfig.autoReconnect !== false,
        commentFilter: {
            enabled: commentFilterOn(),
            maskNames: commentFilterMasksNames(),
            words: getCommentForbidden()?.size || 0,
            loadedAt: commentSheetRules.loadedAt,
            error: commentSheetRules.error || '',
            blocked: commentFilterStats.blocked,
            lastWord: commentFilterStats.lastWord,
            maskedNames: commentFilterStats.maskedNames
        },
        overlay: { host: OBS_LOCAL_HOST, port: PORT, hostMapped: isHostMapped() },
        network: {
            lanAccess: n.lanAccess === true,
            bindHost: BIND_HOST,                       // host ĐANG lắng nghe (chốt lúc khởi động)
            port: Number(PORT) || PORT,
            lanAddresses: lanAddresses(),
            token: showToken ? String(n.token || '') : '',   // chỉ lộ khi đã bật LAN + request tin cậy
            needsRestart: (n.lanAccess === true) !== NETWORK_LAN_ACCESS_AT_START,
            envOverride: HP_BIND_HOST_ENV
        },
        gifts: { count: giftList.length, loadedAt: giftSheetLoadedAt },
        connected: isTikTokLiveConnected(),
        username: currentUsername || appConfig.lastUsername || ''
    };
}
app.get('/api/settings', (req, res) => res.json(settingsSnapshot(req)));
app.post('/api/settings', (req, res) => {
    const b = req.body || {};
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(b, 'tiktokSignApiKey')) {
        const v = String(b.tiktokSignApiKey || '').trim().slice(0, 200);
        if (v && !/^[A-Za-z0-9_\-.:]+$/.test(v)) return res.status(400).json({ ok: false, error: 'API key có ký tự lạ — dán lại từ eulerstream.com' });
        appConfig.tiktokSignApiKey = v;   // '' = xoá key
        changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'autoReconnect')) { appConfig.autoReconnect = b.autoReconnect !== false; changed = true; }
    if (Object.prototype.hasOwnProperty.call(b, 'commentFilter')) { appConfig.commentFilter = { ...(appConfig.commentFilter || {}), enabled: b.commentFilter !== false }; changed = true; }
    if (Object.prototype.hasOwnProperty.call(b, 'commentFilterNames')) { appConfig.commentFilter = { ...(appConfig.commentFilter || {}), maskNames: b.commentFilterNames !== false }; changed = true; }
    if (Object.prototype.hasOwnProperty.call(b, 'lanAccess')) {
        const n = networkConfig();
        const v = b.lanAccess === true;
        if (n.lanAccess !== v) { n.lanAccess = v; changed = true; }
    }
    if (changed) saveAppConfig();
    const snap = settingsSnapshot(req);
    // Đổi công tắc LAN chỉ có hiệu lực sau khi mở lại app (host bind chốt lúc khởi động).
    res.json(snap.network.needsRestart ? { ...snap, needsRestart: true } : snap);
});

app.get('/api/version', (req, res) => {
    try {
        const pkg = require('./package.json');
        res.json({ version: pkg.version, name: pkg.name });
    } catch (e) { res.json({ version: '0.0.0' }); }
});

// ============================================================
// AUTO-UPDATE: check + download + install (đơn giản như v1.0.6-v1.0.9)
// ============================================================
// Flow:
//   1. App load → GET /api/update/check → so version với GitHub Releases
//   2. Có update → modal hỏi user
//   3. User OK → POST /api/update/download → server tải .exe + emit progress
//      qua socket → spawn installer silent (VBS launcher) → app.quit
// Bảo mật ĐƠN GIẢN:
//   - PRIMARY: GitHub Releases API public (https://api.github.com/repos/.../releases/latest)
//   - FALLBACK: license-server (chỉ chạy nếu GitHub fail VÀ license-server có cấu hình)
//   - Không có SHA256 verify cho GitHub (GitHub API không trả hash) → chấp nhận
//     trade-off đơn giản hơn so với license-server (có SHA).

// GitHub repo cho auto-update — PUBLIC để fetch unauth (không cần token).
// Repo phải có Releases với tag vX.Y.Z và asset "HP-Action-LIVE-Setup-X.Y.Z.exe".
// Override qua env HP_GITHUB_REPO=owner/repo nếu user dùng repo khác.
const GITHUB_REPO = process.env.HP_GITHUB_REPO || 'phung-source/hp-action-live';

app.get('/api/update/check', async (req, res) => {
    try {
        const pkg = require('./package.json');
        const localVer = pkg.version || '0.0.0';

        // === Primary: GitHub Releases (public repo, source of truth) ===
        try {
            const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { timeout: 8000 });
            if (ghRes.ok) {
                const remote = await ghRes.json();
                if (remote.tag_name) {
                    const remoteVer = String(remote.tag_name).replace(/^v/i, '');
                    const isNewer = cmpVersion(remoteVer, localVer) > 0;
                    const setupAsset = (remote.assets || []).find(a => /Setup.*\.exe$/i.test(a.name))
                                    || (remote.assets || []).find(a => /\.exe$/i.test(a.name));
                    return res.json({
                        ok: true,
                        localVersion: localVer,
                        hasUpdate: isNewer,
                        latestVersion: remoteVer,
                        notes: remote.body || '',
                        size: setupAsset?.size || 0,
                        sha256: '',   // GitHub không có SHA → skip verify
                        source: 'github'
                    });
                }
            }
        } catch (e) { /* GitHub fail → fallback license-server */ }

        // === Fallback: license-server (nếu cấu hình) ===
        if (isWorkerConfigured()) {
            try {
                const r = await fetch(LICENSE_WORKER_URL.replace(/\/$/, '') + '/api/version', { timeout: 6000 });
                if (r.ok) {
                    const remote = await r.json();
                    if (remote.ok && remote.version) {
                        const isNewer = cmpVersion(remote.version, localVer) > 0;
                        // Nguồn dự phòng đang kẹt ở bản RẤT cũ (1.0.9) trong khi khách đã ở 1.9.x. Nếu GitHub lỗi
                        // (rate-limit 60 lượt/giờ/IP khi nhiều máy chung một IP, proxy công ty, mạng chớp) mà ta tin
                        // nguồn này thì báo "đã là bản mới nhất" — SAI, và che mất bản mới thật. Bản cũ hơn/bằng =
                        // nguồn dự phòng không đáng tin → báo là KHÔNG kiểm tra được, đừng khẳng định đã mới nhất.
                        if (!isNewer) {
                            return res.json({
                                ok: false, localVersion: localVer,
                                error: 'Chưa kiểm tra được bản cập nhật (nguồn chính tạm thời không truy cập được) — thử lại sau ít phút'
                            });
                        }
                        return res.json({
                            ok: true, localVersion: localVer, hasUpdate: isNewer,
                            latestVersion: remote.version, notes: remote.notes || '',
                            size: remote.size || 0, sha256: remote.sha256 || '',
                            source: 'license-server'
                        });
                    }
                }
            } catch (e) { /* both sources failed */ }
        }

        // Cả 2 nguồn fail
        return res.json({ ok: false, localVersion: localVer, error: 'Không kết nối được nguồn cập nhật — thử lại sau' });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

function cmpVersion(a, b) {
    const aP = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const bP = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(aP.length, bP.length); i++) {
        const da = aP[i] || 0, db = bP[i] || 0;
        if (da > db) return 1;
        if (da < db) return -1;
    }
    return 0;
}

// Lazy require electron app (chỉ có khi chạy trong electron, không có khi node thuần)
let _electronApp = null;
try { _electronApp = require('electron').app; } catch {}

let updateInProgress = false;

app.post('/api/update/download', async (req, res) => {
    if (updateInProgress) return res.json({ ok: false, error: 'Đang cập nhật, vui lòng đợi' });
    updateInProgress = true;
    res.json({ ok: true, started: true });   // Trả response ngay, download chạy background

    // Background process — emit progress qua socket
    (async () => {
        const sendProgress = (data) => io.emit('updateProgress', data);
        try {
            sendProgress({ phase: 'connecting', percent: 0, message: 'Đang kết nối tới máy chủ cập nhật...' });

            // === Xác định nguồn tải: GitHub primary, license-server fallback ===
            let downloadUrl, expectedSize = 0, expectedSha = '', version = 'latest';

            // Primary: GitHub Releases
            try {
                const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { timeout: 8000 });
                if (ghRes.ok) {
                    const remote = await ghRes.json();
                    const setupAsset = (remote.assets || []).find(a => /Setup.*\.exe$/i.test(a.name))
                                    || (remote.assets || []).find(a => /\.exe$/i.test(a.name));
                    if (setupAsset) {
                        downloadUrl = setupAsset.browser_download_url;
                        expectedSize = setupAsset.size || 0;
                        expectedSha = '';   // GitHub không có SHA → skip verify
                        version = String(remote.tag_name).replace(/^v/i, '');
                    }
                }
            } catch (e) { /* GitHub fail → fallback license-server */ }

            // Fallback: license-server
            if (!downloadUrl && isWorkerConfigured()) {
                try {
                    const metaRes = await fetch(LICENSE_WORKER_URL.replace(/\/$/, '') + '/api/version', { timeout: 6000 });
                    const meta = await metaRes.json();
                    if (meta.ok && meta.version) {
                        downloadUrl = LICENSE_WORKER_URL.replace(/\/$/, '') + '/api/download/installer';
                        expectedSize = meta.size || 0;
                        expectedSha = (meta.sha256 || '').toLowerCase();
                        version = meta.version;
                    }
                } catch (e) { /* both sources failed */ }
            }

            if (!downloadUrl) {
                throw new Error('Không kết nối được nguồn cập nhật');
            }

            // CHỐT CHẶN HẠ CẤP. Client bấm Đồng ý mà KHÔNG gửi version/URL nào (public/app.js POST body rỗng) →
            // route này tự dò nguồn lại từ đầu. Nếu GitHub OK lúc kiểm tra nhưng lỗi lúc tải, nhánh dự phòng được
            // nhận vô điều kiện — mà nguồn đó đang trả 1.0.9, nghĩa là cài đè bản 1.0.9 lên máy đang chạy 1.9.x.
            // Không bao giờ cài bản không MỚI HƠN bản đang chạy.
            const localVerNow = (() => { try { return require('./package.json').version || '0.0.0'; } catch (e) { return '0.0.0'; } })();
            if (version === 'latest' || cmpVersion(version, localVerNow) <= 0) {
                throw new Error(`Nguồn cập nhật trả về bản ${version} không mới hơn bản đang dùng (${localVerNow}) — đã huỷ để tránh hạ cấp. Thử lại sau ít phút.`);
            }

            // Step 2: download installer to temp folder
            const os = require('os');
            const tempPath = path.join(os.tmpdir(), `hp-action-live-update-${version}.exe`);
            sendProgress({ phase: 'downloading', percent: 0, message: 'Đang tải bản cập nhật...', total: expectedSize });

            const dlRes = await fetch(downloadUrl, { timeout: 0 });
            if (!dlRes.ok) throw new Error('Tải về thất bại: HTTP ' + dlRes.status);

            const writer = fs.createWriteStream(tempPath);
            let received = 0;
            let lastEmit = 0;
            const startedAt = Date.now();
            let lastSampleAt = startedAt;
            let lastSampleBytes = 0;
            let smoothedSpeed = 0;   // EMA cho tốc độ — tránh nhảy số khi network jitter
            await new Promise((resolve, reject) => {
                dlRes.body.on('data', chunk => {
                    received += chunk.length;
                    const now = Date.now();
                    if (now - lastEmit > 200) {   // throttle progress to 5/sec
                        lastEmit = now;
                        const percent = expectedSize ? Math.min(99, Math.floor(received / expectedSize * 100)) : 0;
                        // Tính tốc độ tức thời từ sample 1s gần nhất
                        const sampleDt = (now - lastSampleAt) / 1000;
                        const sampleBytes = received - lastSampleBytes;
                        const instantSpeed = sampleDt > 0 ? sampleBytes / sampleDt : 0;
                        smoothedSpeed = smoothedSpeed > 0 ? smoothedSpeed * 0.7 + instantSpeed * 0.3 : instantSpeed;
                        lastSampleAt = now;
                        lastSampleBytes = received;
                        // ETA
                        const remaining = expectedSize - received;
                        const etaSec = smoothedSpeed > 1024 ? Math.ceil(remaining / smoothedSpeed) : null;
                        sendProgress({
                            phase: 'downloading',
                            percent,
                            received,
                            total: expectedSize,
                            speed: smoothedSpeed,
                            eta: etaSec,
                            message: `${formatBytes(received)} / ${formatBytes(expectedSize)}  •  ${formatBytes(smoothedSpeed)}/s${etaSec != null ? '  •  còn ~' + formatEta(etaSec) : ''}`
                        });
                    }
                });
                dlRes.body.pipe(writer);
                dlRes.body.on('error', reject);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            sendProgress({ phase: 'verifying', percent: 99, message: 'Đang kiểm tra chữ ký số...' });

            // Step 3: verify SHA-256
            if (expectedSha) {
                const hash = crypto.createHash('sha256');
                await new Promise((resolve, reject) => {
                    const s = fs.createReadStream(tempPath);
                    s.on('data', d => hash.update(d));
                    s.on('end', resolve);
                    s.on('error', reject);
                });
                const actualSha = hash.digest('hex').toLowerCase();
                if (actualSha !== expectedSha) {
                    try { fs.unlinkSync(tempPath); } catch {}
                    throw new Error(`Checksum không khớp — file có thể bị lỗi hoặc giả mạo. (${actualSha.slice(0, 16)} ≠ ${expectedSha.slice(0, 16)})`);
                }
            }

            sendProgress({ phase: 'installing', percent: 100, message: 'Tải xong! Sẽ tự cài và khởi động lại...' });

            // === Step 4: Launch installer via VBS helper (hoàn toàn ẩn) ===
            // VBS WScript chạy hidden by design — không có console window flash như cmd.exe.
            // VBS sẽ:
            //   1. Đợi 3s cho electron app exit + giải phóng file lock
            //   2. Chạy installer /S (silent NSIS install) VÀ WAIT cho complete
            //   3. Launch app vừa cài lại (vì NSIS wizard mode không trigger runAfterFinish)
            //   4. Self-cleanup VBS + temp installer
            //   5. Log mọi step vào %TEMP%\hp-update-log.txt để debug nếu fail
            const { spawn } = require('child_process');
            const exePath = _electronApp ? _electronApp.getPath('exe') : '';
            const logPath = path.join(os.tmpdir(), 'hp-update-log.txt');
            const vbsPath = path.join(os.tmpdir(), `hp-update-launch-${version}.vbs`);

            // Escape backslashes + double quotes cho VBS string literal
            const escVbs = s => String(s).replace(/"/g, '""');
            const vbsContent = `' HP Action LIVE — Auto-update launcher
On Error Resume Next

Set fso = CreateObject("Scripting.FileSystemObject")
Set log = fso.OpenTextFile("${escVbs(logPath)}", 2, True)
log.WriteLine "[" & Now & "] Bắt đầu update launcher"

' Đợi app cũ exit + Windows release file lock
log.WriteLine "[" & Now & "] Sleep 3000ms..."
WScript.Sleep 3000

Set objShell = CreateObject("WScript.Shell")

' Chạy installer silent (mode 0 = hidden window, True = wait for completion)
log.WriteLine "[" & Now & "] Chạy installer: ${escVbs(tempPath)} /S"
installerExit = objShell.Run("""${escVbs(tempPath)}"" /S", 0, True)
log.WriteLine "[" & Now & "] Installer kết thúc, exit code: " & installerExit

' Sleep ngắn để Windows finalize file system
WScript.Sleep 1500

' Launch app vừa cài (oneClick: false + /S không tự launch — phải làm manual)
If "${escVbs(exePath)}" <> "" Then
    log.WriteLine "[" & Now & "] Launch app: ${escVbs(exePath)}"
    objShell.Run """${escVbs(exePath)}""", 1, False
End If

' Cleanup temp files (best effort)
WScript.Sleep 500
fso.DeleteFile "${escVbs(tempPath)}", True
fso.DeleteFile WScript.ScriptFullName, True

log.WriteLine "[" & Now & "] Done."
log.Close
`;

            fs.writeFileSync(vbsPath, vbsContent, 'utf8');

            // wscript.exe runs VBS — wscript chạy detached + no console by default
            spawn('wscript.exe', [vbsPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            }).unref();

            // Cho UI 1.5s render message xong rồi mới quit (app.exit không qua before-quit → tự đóng cửa sổ nghe ở đây)
            try { captionListenerStop(); } catch (e) {}
            setTimeout(() => {
                if (_electronApp) {
                    try { _electronApp.exit(0); } catch (e) { process.exit(0); }
                } else process.exit(0);
            }, 1500);
        } catch (e) {
            io.emit('updateProgress', { phase: 'error', percent: 0, message: 'Lỗi: ' + e.message });
            updateInProgress = false;
        }
    })();
});

function formatBytes(b) {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function formatEta(sec) {
    if (!sec || sec < 0) return '—';
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m${s ? ' ' + s + 's' : ''}`;
}

app.get('/api/last-user', (req, res) => {
    res.json({ username: appConfig.lastUsername || '' });
});

// ===== License gate API =====
// Mã máy rút gọn (10 ký tự đầu của HWID) — chỉ để người dùng đọc cho HP Media khi cần hỗ trợ.
function licHwidShort() {
    try { return String(require('./hpkey/validate').getHWID() || '').slice(0, 10).toUpperCase(); } catch (e) { return ''; }
}
// Máy LAN (không token) không được đọc key bản quyền — chỉ app chính trên máy này cần key thật.
app.get('/api/license/status', (req, res, next) => {
    if (requestIsTrusted(req)) return next();
    const mask = (k) => (k ? String(k).slice(0, 2) + '••••' : k);
    const send = res.json.bind(res);
    res.json = (body) => send(body && typeof body === 'object' ? { ...body, key: mask(body.key), savedKey: mask(body.savedKey) } : body);
    next();
});
app.get('/api/license/status', async (req, res) => {
    const stored = appConfig.license || {};
    // Chỉ cần TỪNG có key đã lưu (kể cả khi bị revoke trước đó, activated=false)
    // -> vẫn re-validate để TỰ kích hoạt lại khi admin mở khoá, KHỎI nhập key lại.
    if (!stored.key) {
        return res.json({ activated: false });
    }
    try {
        const result = await validateLicenseKey(stored.key);
        if (result.ok) {
            appConfig.license = {
                ...stored,
                activated: true,
                key: result.key,
                role: result.role || 'ADMIN',
                allowedIds: result.allowedIds || [],
                features: result.features === undefined ? null : result.features,   // null = toàn bộ tính năng (HP KEY ft)
                gameState: LicFeat.normalizeState(result.gameState),                // mục Tạm tắt / Ẩn / Dùng thử 🧪 (HP KEY gs)
                vip: result.vip,
                expiry: result.expiry,
                note: result.note,
                lastValidated: Date.now()
            };
            saveAppConfig();
            applyLicenseLocks('status');   // tính năng theo KEY: khoá/mở theo danh sách mới nhất
            return res.json({
                activated: true,
                key: result.key,
                role: result.role || 'ADMIN',
                allowedIds: result.allowedIds || [],
                features: appConfig.license.features,
                gameState: appConfig.license.gameState,
                vip: result.vip,
                expiry: result.expiry,
                note: result.note,
                lastValidated: appConfig.license.lastValidated,
                activatedAt: stored.activatedAt || null,
                hwidShort: licHwidShort()
            });
        }
        // Mất mạng + trước đó đã kích hoạt -> cho offline tối đa 24h
        if (result._offline && stored.activated) {
            const lastValid = stored.lastValidated || 0;
            if (Date.now() - lastValid < 24 * 3600 * 1000) {
                return res.json({
                    activated: true,
                    key: stored.key,
                    role: stored.role || 'ADMIN',
                    allowedIds: stored.allowedIds || [],
                    features: stored.features === undefined ? null : stored.features,
                    gameState: LicFeat.normalizeState(stored.gameState),
                    vip: stored.vip || 'Thường',
                    expiry: stored.expiry || '',
                    offline: true,
                    note: 'Offline grace period',
                    lastValidated: lastValid,
                    activatedAt: stored.activatedAt || null,
                    hwidShort: licHwidShort()
                });
            }
        }
        // Đang bị khoá/hết hạn -> KHÔNG xoá key (giữ để lần sau tự vào),
        // trả savedKey để gate điền sẵn (user khỏi gõ lại).
        appConfig.license = { ...stored, activated: false, lastError: result.error };
        saveAppConfig();
        return res.json({ activated: false, error: result.error, savedKey: stored.key });
    } catch (e) {
        return res.json({ activated: false, error: e.message, savedKey: stored.key });
    }
});

app.post('/api/license/activate', async (req, res) => {
    const key = (req.body && req.body.key) || '';
    const result = await validateLicenseKey(key);
    if (!result.ok) return res.json(result);
    appConfig.license = {
        activated: true,
        key: result.key,
        role: result.role || 'ADMIN',          // ADMIN | CREATOR | VIP
        allowedIds: result.allowedIds || [],
        features: result.features === undefined ? null : result.features,   // null = toàn bộ tính năng (HP KEY ft)
        gameState: LicFeat.normalizeState(result.gameState),                // mục Tạm tắt / Ẩn / Dùng thử 🧪 (HP KEY gs)
        vip: result.vip,
        expiry: result.expiry,
        note: result.note,
        activatedAt: Date.now(),
        lastValidated: Date.now()
    };
    saveAppConfig();
    applyLicenseLocks('activate');   // tính năng theo KEY
    res.json(result);
});

app.post('/api/license/deactivate', (req, res) => {
    appConfig.license = { activated: false };
    saveAppConfig();
    res.json({ ok: true });
});

// Endpoint refresh-sheet đã bỏ — cache key giờ ở Worker phía Cloudflare (TTL 60s tự refresh).
// Không cần admin endpoint trên app side để force reload.
app.post('/api/license/refresh-sheet', async (req, res) => {
    res.json({ ok: true, note: 'Key cache giờ do Cloudflare Worker quản lý (TTL 60s tự refresh)' });
});

app.post('/api/reload-gifts', async (req, res) => {
    try {
        await loadGiftSheet();
        // Sau khi sheet được cập nhật, dọn các unknown gift hiện đã có trong sheet
        let cleaned = 0;
        for (const id of Object.keys(unknownGifts)) {
            if (giftMap[id]) { delete unknownGifts[id]; cleaned++; }
        }
        if (cleaned > 0) {
            scheduleSaveUnknown();
            io.emit('unknownGiftCleared', { all: false, removed: cleaned, total: Object.keys(unknownGifts).length });
        }
        // Đồng bộ icon từ TikTok availableGifts cho các quà còn thiếu image
        // (Google Sheet có thể thiếu ảnh; availableGifts là nguồn chính xác hơn từ phòng LIVE đang connect)
        let iconsRefreshed = 0;
        if (connection && connection.availableGifts) {
            const refreshResult = refreshUnknownGiftsFromTikTok();
            if (refreshResult?.ok) iconsRefreshed = refreshResult.updated || 0;
            // Đồng thời update image cho giftList chính nếu sheet entry thiếu image
            for (const g of giftList) {
                if (g.image) continue;
                const tt = lookupGiftFromTikTok(String(g.id));
                if (tt?.image) {
                    g.image = tt.image;
                    iconsRefreshed++;
                }
            }
            if (iconsRefreshed > 0) {
                saveGiftCacheToDisk(giftList);
                io.emit('giftSheet', giftList);
            }
        }
        res.json({ ok: true, count: giftList.length, cleanedUnknown: cleaned, iconsRefreshed });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/connect', async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ ok: false, error: 'Thiếu username' });
    const cleanName = String(username).replace(/^@/, '').trim();

    // === CREATOR role enforcement ===
    // Với role=CREATOR: KEY column A chính là TikTok ID. User phải connect với
    // TikTok username TRÙNG khớp key đang active.
    // Nếu khác → reject. User phải liên hệ HP Media (đổi key tương ứng TikTok ID mới).
    const lic = appConfig.license || {};
    if (lic.activated && lic.role === 'CREATOR' && lic.key) {
        const boundId = String(lic.key).replace(/^@/, '').toLowerCase().trim();
        if (cleanName.toLowerCase() !== boundId) {
            return res.status(403).json({
                ok: false,
                error: 'Bạn đã thay đổi TikTok ID hoặc nhập sai\nLIÊN HỆ HP MEDIA ĐỂ ĐƯỢC HỖ TRỢ',
                _creatorLocked: true,
                boundTiktokId: lic.key
            });
        }
    }

    // === VIP allow-list enforcement ===
    // role=VIP có danh sách ID: chỉ cho kết nối các TikTok ID trong danh sách.
    // Danh sách rỗng → không giới hạn (như trước).
    if (lic.activated && lic.role === 'VIP' && Array.isArray(lic.allowedIds) && lic.allowedIds.length) {
        if (lic.allowedIds.indexOf(cleanName.toLowerCase()) < 0) {
            return res.status(403).json({
                ok: false,
                error: 'TikTok ID này không nằm trong danh sách được phép của key VIP\nLIÊN HỆ HP MEDIA ĐỂ ĐƯỢC HỖ TRỢ',
                _vipNotAllowed: true,
                allowedIds: lic.allowedIds
            });
        }
    }

    // Lưu lastUsername (kể cả LIVE chưa bật) — tiện auto-fill lần sau
    if (cleanName) {
        appConfig.lastUsername = cleanName;
        saveAppConfig();
    }
    try {
        const result = await connectToUser(username);
        res.json(result);
    }
    catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

app.post('/api/disconnect', async (req, res) => {
    try {
        manualDisconnect = true;
        cancelAutoReconnect();
        reconnectAttempt = 0;
        const old = connection;
        connection = null; liveConnected = false; currentUsername = null; currentRoomId = null;
        if (old) await old.disconnect();
        broadcast('status', { connected: false });
        setLiveDashboardStatus(false, { username: '', roomId: '' });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Gửi lệnh điều khiển game (thief, fireworks, tornado...) tới mọi overlay
// Monotonic sequence ID cho gameCmd — overlay dedup theo seq để tránh
// duplicate spawn khi OBS cache stale code / reconnect re-attach listener.
let _cmdSeq = 0;
function applyAuthoritativeGameCmdState(gameId, cmd, payload) {
    if (gameId !== 'thuytinh') return null;
    const incomingState = payload && typeof payload === 'object' && payload._state && typeof payload._state === 'object'
        ? payload._state
        : null;
    if (incomingState) {
        gameStateCache[gameId] = incomingState;
        saveGameStateNow();
        return gameStateCache[gameId];
    }
    if (cmd !== 'clear' && cmd !== 'resetSession') return null;
    const prev = gameStateCache[gameId] && typeof gameStateCache[gameId] === 'object' ? gameStateCache[gameId] : {};
    const next = { ...prev, bodies: [], giftHistory: Array.isArray(prev.giftHistory) ? prev.giftHistory : [] };
    if (cmd === 'resetSession') {
        next.totalDiamonds = 0;
        next.totalGifts = 0;
        next.tippers = [];
        next.seenGiftTypes = [];
        next.caughtList = [];
        next.bannedUntilByUid = [];
        next.policeForce = [];
        next.goalReached = false;
    }
    gameStateCache[gameId] = next;
    saveGameStateNow();
    return next;
}
app.post('/api/games/:id/cmd', (req, res) => {
    const g = GAMES[req.params.id];
    if (!g) return res.status(404).json({ ok: false, error: 'Không tìm thấy game' });
    const { cmd } = req.body || {};
    let payload = req.body?.payload;
    if (!cmd) return res.status(400).json({ ok: false, error: 'Thiếu cmd' });
    if (g.id === 'nhatla' && (cmd === 'clear' || cmd === 'reset')) {
        const emptyState = { totalDropped: 0, cleaned: 0, leaves: [] };
        nhatLaStateLockedUntil = Date.now() + 1800;
        gameStateCache.nhatla = emptyState;
        saveGameStateNow();
        // Phát trước gameCmd để mọi review/OBS bỏ ngay snapshot cũ đang hiển thị.
        io.emit('nhatla:state', { sourceId: 'server-clear', state: emptyState });
        // Xoá sạch lá thì bảng TOP cũng phải về 0 — nếu không, "còn lại 0 lá" mà TOP vẫn
        // ghi 5000 lá thì người xem không hiểu con số đang đếm cái gì.
        nhatLaResetDonors();
    }
    // Test effect phải tới đúng overlay đang nắm lá, không để một view khác chỉ phát WEBM.
    if (g.id === 'nhatla' && cmd === 'effect' && nhatLaActiveDragSocketId) {
        payload = { ...(payload || {}), targetSocketId: nhatLaActiveDragSocketId };
    }
    // Tự nhặt lá bốc điểm hút ngẫu nhiên. Server chốt seed MỘT LẦN để OBS và khung review
    // hút đúng cùng những chiếc lá ở cùng những chỗ; nếu để mỗi view tự bốc thì người vận
    // hành thấy một đằng, người xem thấy một nẻo.
    if (g.id === 'nhatla' && cmd === 'autoClean') {
        payload = { ...(payload || {}), seed: Math.floor(Math.random() * 1e9) };
    }
    const authoritativeState = applyAuthoritativeGameCmdState(g.id, cmd, payload);
    const seq = ++_cmdSeq;
    io.emit('gameCmd', { gameId: g.id, cmd, payload: payload || null, seq });
    if (authoritativeState) io.to('overlay').emit('gameStateSnapshot', { gameId: g.id, state: authoritativeState });
    res.json({ ok: true, seq });
});

// Touch & Play: danh sách nguồn hình trong OBS để lab chọn camera + trạng thái cấp hình.
// 📡 Trạng thái nhận hình cho chip các trang game camera (2 s/lần) — KHÔNG hỏi OBS như /api/touchplay/obs-sources
// (GetSceneList + quét Scene mỗi lần chỉ để lấy `status`). Cùng dạng với HP LIVE NPC để panel chép sang chạy nguyên.
// 🎮 Phiên game theo quà: xem trạng thái / ⏹ kết thúc ngay / ▶ thử (mở phiên không cần quà — vẫn đòi overlay mẹ đang
// mở trên OBS, trừ khi gửi force:true từ máy chạy app để thử không cần OBS).
app.get('/api/camgames/session', (req, res) => res.json({ session: camSessionPublic(), queue: camQueuePublic(), hubOnline: camHubOverlayOnline(), trigger: camTriggerCfg() }));
app.post('/api/camgames/session/stop', (req, res) => res.json({ ok: camEndSession('manual', { next: false }), session: camSessionPublic() }));
app.post('/api/camgames/session/test', (req, res) => {
    const b = req.body || {};
    const gameId = CamSession.TRIGGER_GAMES.includes(b.gameId) && GAMES[b.gameId] ? b.gameId : '';
    if (gameId && !featureOn(gameId)) return res.status(403).json({ ok: false, locked: true, error: 'KEY chưa mở game này' });
    if (!gameId) return res.status(400).json({ ok: false, error: 'gameId phải là ' + CamSession.TRIGGER_GAMES.join('|') });
    const force = b.force === true && requestIsTrusted(req);
    if (!force && !camHubOverlayOnline()) return res.status(409).json({ ok: false, error: 'Chưa thấy overlay Game Camera mở trên OBS — dán 📋 Link OBS vào Browser Source trước.' });
    const seconds = Math.max(5, Math.min(600, parseInt(b.seconds, 10) || 30));
    if (camSession) camEndSession('restart', { next: false });
    camStartSession(gameId, seconds, { nickname: 'Thử nghiệm', uniqueId: 'tester', profilePicture: '', giftName: 'Thử phiên game' });
    res.json({ ok: true, session: camSessionPublic() });
});
app.get('/api/camgames/feed-status', (req, res) => {
    let status = {};
    try { status = touchplayFeed.status(); } catch (e) {}
    const cam = appConfig.games?.camgames || {};
    const saved = String(cam.source || '');
    const auto = !saved && !!camAuto.source && Date.now() - camAuto.at < 10000;
    res.json({ ok: true, obsConnected: status.obsConnected !== false, status, actives: camActives(), source: saved || (auto ? camAuto.source : ''),
        auto, scene: camAuto.scene || status.scene || '' });
});
// 🛰 Overlay mẹ có trong Scene OBS chưa + ＋ Thêm nhanh (lib/camgames-obs.js, port HP LIVE NPC — không có Scene theo NPC:
// chỉ Scene cố định camgames.scene hoặc Scene đang phát). Nguồn camera = đã chọn, chưa chọn thì camera tự nhận.
const camObs = createCamObs({
    obs: (type, data) => obsBridge.obs.call(type, data),
    feed: touchplayFeed,
    isHubUrl: url => feedUrlIs(url || '', 'camgames', /\/overlay\/camgames(?:[/?#]|$)/i),
    cameraName: () => String(appConfig.games?.camgames?.source || '') || (Date.now() - camAuto.at < 10000 ? camAuto.source : ''),
    savedScene: () => String(appConfig.games?.camgames?.scene || ''),
    overlayUrl: () => `http://localhost:${PORT}/overlay/camgames`,
    port: PORT
});
let camProgCache = { at: 0, data: null };
// Scene ĐANG PHÁT có overlay mẹ chưa — thanh cảnh báo panel Game Camera (game chỉ chạy trong khung xem thử của app mà
// OBS không có link Game Camera là lỗi dễ mắc nhất). hubOnline: trang overlay mẹ đang nối socket (Browser Source chạy thật).
app.get('/api/camgames/obs/program-check', async (req, res) => {
    if (!obsBridge.isConnected()) return res.json({ ok: false, obsConnected: false });
    if (camProgCache.data && Date.now() - camProgCache.at < 2500) return res.json({ ...camProgCache.data, actives: camActives(), hubOnline: camHubOverlayOnline() });
    try {
        const data = await camObs.programCheck();
        if (data.ok) camProgCache = { at: Date.now(), data };
        res.json({ ...data, actives: camActives(), hubOnline: camHubOverlayOnline() });
    } catch (e) { res.json({ ok: false, obsConnected: true, error: e?.message || String(e) }); }
});
// ＋ Thêm nhanh overlay mẹ vào Scene còn thiếu (body.scenes: chỉ các Scene này). Sửa Scene OBS → chỉ máy chạy app.
app.post('/api/camgames/obs/add-overlay', async (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'Chỉ bấm được trên máy chạy app' });
    if (!obsBridge.isConnected()) return res.status(409).json({ ok: false, error: 'Chưa kết nối OBS WebSocket — mở mục Hiệu ứng OBS → Kết nối' });
    try {
        const only = Array.isArray(req.body?.scenes) ? req.body.scenes.map(String).slice(0, 20) : null;
        const r = await camObs.addHubOverlay(only);
        camProgCache = { at: 0, data: null };
        res.json({ ok: true, ...r, check: await camObs.sceneCheck(await touchplayFeed.listScenes(), true) });
    } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});
// 📋 ➕ Thêm Bảng Quà Tổng vào Scene OBS (Scene chọn, không thì Scene đang phát) — lib/obs-add-overlay.js.
// Link của mình = đúng cổng app + /_prototype/giftboard.html?mode=overlay (hoặc link chia sẻ /overlay/shared/<token>).
function giftboardObsUrlIsMine(url) {
    try {
        const u = new URL(String(url || ''));
        if (String(u.port || (u.protocol === 'https:' ? 443 : 80)) !== String(PORT)) return false;
        if (/^\/_prototype\/giftboard\.html$/i.test(u.pathname)) return u.searchParams.get('mode') === 'overlay';
        const tok = appConfig.shareTokens?.giftboard;
        return !!tok && u.pathname === '/overlay/shared/' + tok;
    } catch (_) { return false; }
}
app.post('/api/giftboard/obs/add', async (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'Chỉ bấm được trên máy chạy app' });
    if (!obsBridge.isConnected()) return res.status(409).json({ ok: false, error: 'Chưa kết nối OBS WebSocket - vào ⚙ Cài đặt / Hiệu ứng OBS → Kết nối' });
    try {
        const r = await addOverlayToScene((type, data) => obsBridge.obs.call(type, data), {
            url: `http://localhost:${PORT}/_prototype/giftboard.html?mode=overlay`,
            isMine: giftboardObsUrlIsMine,
            inputName: 'HP Bảng Quà Tổng',
            scene: typeof req.body?.scene === 'string' ? req.body.scene.slice(0, 200) : ''
        });
        setTimeout(() => overlayObsScan(), 500);
        res.json(r);
    } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});
app.get('/api/touchplay/obs-sources', async (req, res) => {
    try {
        const r = await touchplayFeed.listSources();
        res.json({ ...r, status: touchplayFeed.status(), layout: touchplayFeed.layout });
    } catch (e) {
        res.json({ ok: false, reason: 'error', error: e.message, sources: [], status: touchplayFeed.status() });
    }
});

// Test-spawn a gift (manual drop from UI)
// Quà thử đi đúng đường quà thật (emitGift phát cho mọi game) → mục bị khoá theo KEY tự bỏ qua y như quà TikTok.
function emitTestGift(body) {
    const testGift = makeTestGiftPayload(body);
    const repeatCount = parseInt(body.count, 10) || 1;
    emitGift({
        uniqueId: body.uniqueId || 'tester',
        nickname: body.nickname || 'HP Media',
        // Overlay nào vẽ avatar người tặng (TOP Nhặt Lá, bướm Trồng Cây…) thì quà test
        // cũng phải chở được avatar, nếu không chạy thử chỉ ra thẻ trống.
        profilePicture: body.profilePicture || '',
        giftId: testGift.giftId,
        giftName: testGift.giftName,
        giftPicture: testGift.giftImage,
        diamondCount: testGift.coinValue,
        repeatCount,
        source: 'test',
        ...(testGift.extra || {})
    });
    return testGift;
}
app.post('/api/games/:id/test-gift', (req, res) => {
    const g = GAMES[req.params.id];
    if (!g) return res.status(404).json({ ok: false, error: 'Không tìm thấy game' });
    res.json({ ok: true, gift: emitTestGift(req.body || {}) });
});
// Thả quà thử KHÔNG gắn game (cửa sổ 📦 Danh sách quà): không qua khoá theo game ở middleware vì quà
// phát chung cho mọi game như quà thật — game bị khoá tự bỏ qua; route này không bật/điều khiển game nào.
// 🚫 Kiểm 1 câu / 1 tên với bộ lọc từ cấm (ô "thử" trong ⚙ Cài đặt) — không phát gì cho game.
app.post('/api/comment-filter/check', (req, res) => {
    const text = String(req.body?.text ?? '').slice(0, 300);
    const compiled = getCommentForbidden();
    const command = CommentFilter.isNumberOnly(text);   // giống bình luận thật: chỉ số = cú pháp game, không lọc
    res.json({ ok: true, enabled: commentFilterOn(), command, blocked: command ? '' : CommentFilter.findForbidden(text, compiled), masked: CommentFilter.maskForbidden(text, compiled), words: compiled ? compiled.size : 0 });
});
// 💬 Bình luận thử KHÔNG cần LIVE: đi đúng đường bình luận thật (từ cấm, Dịch Thuật, mọi game) — như /api/test-gift.
app.post('/api/test-chat', (req, res) => {
    const b = req.body || {};
    const comment = String(b.comment ?? b.text ?? '').slice(0, 300);
    if (!comment.trim()) return res.status(400).json({ ok: false, error: 'missing_comment' });
    const user = { uniqueId: String(b.uniqueId || 'tester').slice(0, 64), nickname: String(b.nickname || 'HP Media').slice(0, 64), profilePicture: String(b.profilePicture || '') };
    res.json({ ok: true, ...handleTikTokChat({ user, comment }, { test: true }) });
});

app.post('/api/test-gift', (req, res) => {
    res.json({ ok: true, gift: emitTestGift(req.body || {}) });
});

// OBS overlay (transparent fullpage)
// 🔴 Săn Pokemon — overlay game + bảng quà (nguồn OBS riêng). Game nhận sự kiện qua socket, không có route API riêng.
app.get('/overlay/pokemon', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'pokemon', 'overlay.html'));
});
app.get('/overlay/pokemon-gifts', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'pokemon', 'gifts.html'));
});
app.get('/overlay/thuytinh', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'thuytinh', 'overlay.html'));
});
app.get('/overlay/caro', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'caro', 'overlay.html'));
});
app.get('/overlay/pktiktok', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'pktiktok', 'overlay.html'));
});
app.get('/overlay/leaguecard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'leaguecard', 'overlay.html'));
});
app.get('/overlay/vipwelcome', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'vipwelcome', 'overlay.html'));
});
// Bảng xếp hạng khách quen (chăm ghé phòng) — link OBS riêng
app.get('/overlay/vipwelcome-board', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'vipwelcome', 'board.html'));
});
app.get('/overlay/votecomment', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'votecomment', 'overlay.html'));
});
app.get('/overlay/trongcay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'trongcay', 'overlay.html'));
});
app.get('/overlay/nhatla', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'nhatla', 'overlay.html'));
});
// BẢNG QUÀ đi browser source RIÊNG, không nằm trong overlay trên. Overlay chính có lúc
// giữ tới drop.maxLeaves = 6000 phần tử DOM; nhét thêm một bảng chạy marquee vào cùng
// document là bắt chung luồng compositor với đống lá. Tách ra thì OBS cấp cho bảng một
// tiến trình render riêng, và người dùng đặt bảng ở đâu trên scene cũng được.
app.get('/overlay/nhatla-gifts', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'nhatla', 'board.html'));
});

// ── NHẶT LÁ: BỘ SKIN ───────────────────────────────────────────────────────────
// Ba chiều độc lập nhau: 'hat' là bộ ảnh hạt rơi (lá, tuyết…), 'thung' là bộ ảnh thùng
// rác, 'tui' là bộ ảnh túi nợ. Tách ra để phối tự do — tuyết + thùng Ông già Noel chẳng
// hạn — thay vì nhân bản một gói Noel cho mỗi cái thùng.
//
// Mỗi bộ là một thư mục con chứa skin.json + ảnh đánh số 01.png tăng dần. Ảnh đi
// thẳng qua express.static nên KHÔNG có route serve ảnh riêng ở đây; overlay tự ghép
// '/games/nhatla/skins/<kind>/<id>/01.png'. Thêm bộ mới = thả thư mục, không sửa code.
// Xem tools/build-nhatla-skins.py để biết cách sinh thư mục cho đúng chuẩn.
const NHATLA_SKINS_DIR = path.join(__dirname, 'public', 'games', 'nhatla', 'skins');
const NHATLA_SKIN_KINDS = ['hat', 'thung', 'tui'];

function readNhatLaSkins(kind) {
    const root = path.join(NHATLA_SKINS_DIR, kind);
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());
    } catch (e) {
        return [];
    }
    const skins = [];
    for (const entry of entries) {
        // Bộ nào thiếu/hỏng skin.json thì bỏ qua hẳn: thà không hiện trong danh sách
        // còn hơn cho chọn rồi overlay không biết baseSize mà vẽ.
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'skin.json'), 'utf8'));
            skins.push({ ...manifest, id: entry.name, kind, dir: `/games/nhatla/skins/${kind}/${entry.name}` });
        } catch (e) {
            console.warn(`[nhatla] Bỏ qua skin ${kind}/${entry.name}:`, e.message);
        }
    }
    return skins.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'vi'));
}

app.get('/api/nhatla/skins', (req, res) => {
    const out = { ok: true };
    for (const kind of NHATLA_SKIN_KINDS) out[kind] = readNhatLaSkins(kind);
    res.json(out);
});

// 🏆 TOP người tặng lá — namespace /api/nhatla/* để không đụng route generic /api/games/:id/*.
app.get('/api/nhatla/top', (req, res) => {
    res.json({ ok: true, list: nhatLaTopList(req.query.count), total: nhatLaDonors.size });
});
app.post('/api/nhatla/top/reset', (req, res) => {
    nhatLaResetDonors();
    res.json({ ok: true });
});

const NHATLA_ASSETS_DIR = path.join(DATA_DIR, 'nhatla-assets');
if (!fs.existsSync(NHATLA_ASSETS_DIR)) fs.mkdirSync(NHATLA_ASSETS_DIR, { recursive: true });
app.post('/api/games/nhatla/upload',
    express.raw({ limit: '40mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (ext !== 'webm') return res.status(400).json({ ok: false, error: 'Chỉ nhận file WEBM' });
        if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'empty_body' });
        const filename = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.webm`;
        try {
            fs.writeFileSync(path.join(NHATLA_ASSETS_DIR, filename), req.body);
            res.json({ ok: true, url: `/api/games/nhatla/asset/${filename}`, filename });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    }
);
app.get('/api/games/nhatla/asset/:file', (req, res) => {
    const filename = String(req.params.file || '').replace(/[^a-z0-9._-]/gi, '');
    const filePath = path.join(NHATLA_ASSETS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
});
app.get('/overlay/translate', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay', 'translate.html'));
});
app.get('/overlay/creator-caption', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay', 'creator-caption.html'));
});
app.get('/overlay/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay', 'dashboard.html'));
});

// ── LINK CHIA SẺ CHO TIKTOK LIVE STUDIO ─────────────────────────────────────
// Token cố định (sinh 1 lần, lưu trong app-config.json) cho mỗi game, ẩn gameId thật đằng
// sau /overlay/shared/<uuid> — giữ nguyên URL qua các lần mở app, khỏi phải dán lại Link
// trong TikTok Studio mỗi lần. Không phải hàng rào bảo mật, chỉ để URL không lộ route nội bộ.
function getOrCreateShareToken(gameId) {
    if (!GAMES[gameId]) return null;
    if (!appConfig.shareTokens[gameId]) {
        appConfig.shareTokens[gameId] = crypto.randomUUID();
        saveAppConfig();
    }
    return appConfig.shareTokens[gameId];
}
// Dùng bởi public/app.js — 1 lần lúc load trang, cache client-side để buildOverlayURL()
// tự đổi mọi nút "📋 Link OBS" (mọi game) sang hpaction.obs mà không phải sửa từng panel.
app.get('/api/overlay/share-links', (req, res) => {
    const links = {};
    for (const gameId of Object.keys(GAMES)) {
        const token = getOrCreateShareToken(gameId);
        if (token) links[gameId] = { token, overlayPath: GAMES[gameId].overlayPath };
    }
    res.json({ ok: true, host: OBS_LOCAL_HOST, port: PORT, mapped: isHostMapped(), links });
});
app.get('/api/games/:id/share-link', (req, res) => {
    const gameId = req.params.id;
    const token = getOrCreateShareToken(gameId);
    if (!token) return res.status(404).json({ ok: false, error: 'unknown_game' });
    res.json({
        ok: true,
        token,
        url: `http://${OBS_LOCAL_HOST}:${PORT}/overlay/shared/${token}`,
        localUrl: `http://localhost:${PORT}${GAMES[gameId].overlayPath}`,
        // false = hosts file chưa map, link .obs sẽ không mở được -> UI nên bảo user dùng
        // localUrl hoặc chạy lại bước thêm hosts.
        hostMapped: isHostMapped()
    });
});
app.get('/overlay/shared/:token', (req, res) => {
    const gameId = Object.keys(appConfig.shareTokens).find(id => appConfig.shareTokens[id] === req.params.token);
    if (!gameId || !GAMES[gameId]) return res.status(404).send('Link không hợp lệ hoặc đã đổi.');
    const query = { ...req.query };
    const base = GAMES[gameId].overlayPath;
    const qs = Object.keys(query).length ? (base.includes('?') ? '&' : '?') + new URLSearchParams(query).toString() : '';
    res.redirect(base + qs);
});

// ============================================================
// VOTE BÌNH LUẬN — live state + control + chat/gift hooks
// ============================================================
// In-memory state (không persist) — mỗi lần app restart sẽ reset.
// Mỗi row tính 2 nguồn điểm: comments (số bình luận khớp keyword) + giftXu (XU quà
// của user đã vote dòng đó). Tổng điểm = comments + giftXu (hoặc 1 trong 2 tuỳ countingMode).
let voteCommentState = {
    active: false,
    startedAt: 0,
    endsAt: 0,                        // 0 = chưa start hoặc đã hết
    title: '',
    durationSec: 0,
    countingMode: 'both',
    pointsLabel: 'ĐIỂM',
    commentWeight: 1,
    giftWeight: 1,
    joinByGift: false,
    rows: [],                         // [{ id, keyword, label, color, comments, giftXu }]
    userLastRow: {}                   // { uniqueId(lower) → rowId }
};
let voteCommentAutoStopTimer = null;
let voteCommentLastBroadcast = 0;
let voteCommentPendingBroadcast = null;

function voteCommentSnapshot() {
    return {
        active: voteCommentState.active,
        startedAt: voteCommentState.startedAt,
        endsAt: voteCommentState.endsAt,
        title: voteCommentState.title,
        durationSec: voteCommentState.durationSec,
        countingMode: voteCommentState.countingMode,
        pointsLabel: voteCommentState.pointsLabel || 'ĐIỂM',
        commentWeight: Number(voteCommentState.commentWeight) || 1,
        giftWeight: Number(voteCommentState.giftWeight) || 1,
        joinByGift: !!voteCommentState.joinByGift,
        rows: voteCommentState.rows.map(r => ({
            id: r.id, keyword: r.keyword, label: r.label, color: r.color || '',
            giftId: r.giftId || '', giftName: r.giftName || '', giftImage: r.giftImage || '',
            comments: r.comments | 0, giftXu: r.giftXu | 0, bonus: r.bonus | 0
        }))
    };
}

function broadcastVoteCommentState({ immediate = false } = {}) {
    const send = () => {
        voteCommentLastBroadcast = Date.now();
        voteCommentPendingBroadcast = null;
        io.emit('votecomment:state', voteCommentSnapshot());
    };
    if (immediate) {
        if (voteCommentPendingBroadcast) { clearTimeout(voteCommentPendingBroadcast); voteCommentPendingBroadcast = null; }
        return send();
    }
    // Throttle: tối đa 4 lần/giây để tránh spam socket
    const now = Date.now();
    const wait = Math.max(0, 250 - (now - voteCommentLastBroadcast));
    if (voteCommentPendingBroadcast) return;
    voteCommentPendingBroadcast = setTimeout(send, wait);
}

function clearVoteCommentAutoStop() {
    if (voteCommentAutoStopTimer) { clearTimeout(voteCommentAutoStopTimer); voteCommentAutoStopTimer = null; }
}

function scheduleVoteCommentAutoStop() {
    clearVoteCommentAutoStop();
    if (!voteCommentState.active || !voteCommentState.endsAt) return;
    const ms = voteCommentState.endsAt - Date.now();
    if (ms <= 0) { voteCommentStop({ reason: 'timeout' }); return; }
    voteCommentAutoStopTimer = setTimeout(() => {
        voteCommentStop({ reason: 'timeout' });
    }, ms + 30);
}

function voteCommentResetCounts() {
    for (const r of voteCommentState.rows) { r.comments = 0; r.giftXu = 0; r.bonus = 0; }
    voteCommentState.userLastRow = {};
}

function voteCommentAdjustBonus(rowId, delta) {
    const row = voteCommentState.rows.find(r => r.id === rowId);
    if (!row) return false;
    const d = parseInt(delta, 10) || 0;
    if (d === 0) return false;
    row.bonus = (row.bonus | 0) + d;
    broadcastVoteCommentState({ immediate: true });
    console.log(`[votecomment] ADJUST row=${rowId} delta=${d > 0 ? '+' : ''}${d} → bonus=${row.bonus}`);
    return true;
}

function voteCommentApplyConfigToState(cfg) {
    // Tái sử dụng counts theo row.id nếu chưa start; nếu đang chạy thì giữ counters
    const prev = new Map(voteCommentState.rows.map(r => [r.id, r]));
    voteCommentState.title = String(cfg.title || '').slice(0, 120);
    voteCommentState.durationSec = Math.max(10, Math.min(7200, parseInt(cfg.durationSec, 10) || 300));
    voteCommentState.countingMode = ['comments', 'gifts', 'both'].includes(cfg.countingMode) ? cfg.countingMode : 'both';
    voteCommentState.pointsLabel = String(cfg.pointsLabel || 'ĐIỂM').trim().slice(0, 20) || 'ĐIỂM';
    const cw = parseFloat(cfg.commentWeight); voteCommentState.commentWeight = isFinite(cw) && cw >= 0 ? Math.min(100, cw) : 1;
    const gw = parseFloat(cfg.giftWeight); voteCommentState.giftWeight = isFinite(gw) && gw >= 0 ? Math.min(100, gw) : 1;
    voteCommentState.joinByGift = cfg.joinByGift === true;
    const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
    voteCommentState.rows = rows.slice(0, 24).map(r => {
        const id = String(r?.id || ('r' + Math.random().toString(36).slice(2, 8)));
        const existing = prev.get(id);
        return {
            id,
            keyword: String(r?.keyword || '').trim().slice(0, 40),
            label: String(r?.label || '').slice(0, 120),
            color: String(r?.color || '').slice(0, 32),
            giftId: String(r?.giftId || '').slice(0, 40),
            giftName: String(r?.giftName || '').slice(0, 80),
            giftImage: String(r?.giftImage || '').slice(0, 500),
            comments: existing ? (existing.comments | 0) : 0,
            giftXu: existing ? (existing.giftXu | 0) : 0,
            bonus: existing ? (existing.bonus | 0) : 0
        };
    });
}

function voteCommentStart() {
    const cfg = appConfig.games.votecomment || makeDefaultVoteCommentConfig();
    voteCommentApplyConfigToState(cfg);
    voteCommentResetCounts();
    voteCommentState.active = true;
    voteCommentState.startedAt = Date.now();
    voteCommentState.endsAt = Date.now() + voteCommentState.durationSec * 1000;
    scheduleVoteCommentAutoStop();
    broadcastVoteCommentState({ immediate: true });
    console.log(`[votecomment] START — title="${voteCommentState.title}" rows=${voteCommentState.rows.length} duration=${voteCommentState.durationSec}s mode=${voteCommentState.countingMode}`);
}

function voteCommentStop({ reason } = {}) {
    if (!voteCommentState.active && !voteCommentState.endsAt) return;
    voteCommentState.active = false;
    clearVoteCommentAutoStop();
    broadcastVoteCommentState({ immediate: true });
    console.log(`[votecomment] STOP (${reason || 'manual'})`);
}

function voteCommentReset() {
    clearVoteCommentAutoStop();
    voteCommentState.active = false;
    voteCommentState.startedAt = 0;
    voteCommentState.endsAt = 0;
    const cfg = appConfig.games.votecomment || makeDefaultVoteCommentConfig();
    voteCommentApplyConfigToState(cfg);
    voteCommentResetCounts();
    broadcastVoteCommentState({ immediate: true });
    console.log(`[votecomment] RESET`);
}

// Chuẩn hoá tiếng Việt: NFD bỏ dấu, đ→d, gộp khoảng trắng, lower. "Đỏ", "đỏ", "do", "DO " đều = "do".
// (Trước đây chỉ trim+lower → viewer gõ không dấu hoặc bàn phím gõ Unicode tổ hợp là trượt vote.)
function normalizeVoteText(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'd')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

function handleVoteCommentChat({ uniqueId, comment }) {
    // Game bị TẮT trong Thư viện → bỏ qua mọi comment + gift
    if (appConfig.games?.votecomment?.enabled === false) return;
    if (!voteCommentState.active) return;
    if (!uniqueId || !comment) return;
    const norm = normalizeVoteText(comment);
    if (!norm) return;
    // Match: ưu tiên comment == keyword; nếu không, keyword 1 từ đứng riêng trong comment ("vote 1", "1 nhé").
    const tokens = norm.split(' ');
    const hit = voteCommentState.rows.find(r => r.keyword && normalizeVoteText(r.keyword) === norm)
        || voteCommentState.rows.find(r => { const k = r.keyword && normalizeVoteText(r.keyword); return k && !k.includes(' ') && tokens.includes(k); });
    if (!hit) return;
    hit.comments = (hit.comments | 0) + 1;
    voteCommentState.userLastRow[String(uniqueId).toLowerCase()] = hit.id;
    broadcastVoteCommentState();
}

function handleVoteCommentGift({ uniqueId, giftId, coinValue, repeatCount }) {
    // Game bị TẮT trong Thư viện → bỏ qua quà cộng vào vote
    if (appConfig.games?.votecomment?.enabled === false) return;
    if (!voteCommentState.active) return;
    const xu = (Number(coinValue) || 0) * (Number(repeatCount) || 1);
    if (xu <= 0) return;
    const uidLower = uniqueId ? String(uniqueId).toLowerCase() : '';
    let row = null;
    // (A) Quà chỉ định khớp giftId → cộng trực tiếp + nếu joinByGift thì GHI NHẬN user vào phe đó
    if (giftId) {
        row = voteCommentState.rows.find(r => r.giftId && String(r.giftId) === String(giftId));
        if (row && voteCommentState.joinByGift && uidLower) {
            voteCommentState.userLastRow[uidLower] = row.id;   // gia nhập phe
        }
    }
    // (B) Không khớp → dùng fallback theo userLastRow (gia nhập trước đó qua comment hoặc qualifying-gift)
    if (!row && uidLower) {
        const rowId = voteCommentState.userLastRow[uidLower];
        if (rowId) {
            const cand = voteCommentState.rows.find(r => r.id === rowId);
            // Mode joinByGift: cho phép dồn vào phe đã gia nhập kể cả row có giftId riêng (đó là "phe" của họ)
            // Mode mặc định: chỉ fallback nếu row đó KHÔNG gán quà riêng (tránh "cướp" XU của row khác)
            if (cand && (voteCommentState.joinByGift || !cand.giftId)) row = cand;
        }
    }
    if (!row) return;
    row.giftXu = (row.giftXu | 0) + xu;
    broadcastVoteCommentState();
}

// Khởi tạo state ban đầu từ config (rows + title) để overlay đầu tiên không trống
try { voteCommentApplyConfigToState(appConfig.games.votecomment || makeDefaultVoteCommentConfig()); } catch (e) {}

// Control endpoint — start/stop/reset/adjustBonus
app.post('/api/games/votecomment/control', (req, res) => {
    const cmd = String(req.body?.cmd || '');
    const c = cmd.toLowerCase();
    if (c === 'start') voteCommentStart();
    else if (c === 'stop') voteCommentStop({ reason: 'manual' });
    else if (c === 'reset') voteCommentReset();
    else if (c === 'adjustbonus') {
        const ok = voteCommentAdjustBonus(req.body?.rowId, req.body?.delta);
        if (!ok) return res.status(400).json({ ok: false, error: 'rowId không tồn tại hoặc delta=0' });
    }
    else return res.status(400).json({ ok: false, error: 'cmd phải là start|stop|reset|adjustBonus' });
    res.json({ ok: true, state: voteCommentSnapshot() });
});

// "livestate" để tránh va với generic /api/games/:id/state — generic ưu tiên match trước
// (server.js convention, xem CLAUDE.md).
app.get('/api/games/votecomment/livestate', (req, res) => {
    res.json(voteCommentSnapshot());
});

// ============================================================
// BIỂU CẢM NHIỆT ĐỘ — live state + gift hook + decay tick + milestones + top contrib
// ============================================================
// In-memory state (không persist) — restart app sẽ reset về initialTemp.
// Temperature 0..tempMax. Gift bumps/cools temp, idle decays temp.
// userContrib tracks tổng °C đẩy lên cho mỗi user trong phiên — reset() xoá hết.
let nhietDoState = {
    temp: 0,
    tempMax: 100,
    tempMin: 0,
    lastGiftAt: 0,
    updatedAt: 0,
    active: true,
    userContrib: {},      // uniqueId(lower) → { totalDegrees, nickname, avatar, lastAt }
    crossedMilestones: {} // temp(int) → ts crossed; reset on reset()
};
let nhietDoLastBroadcast = 0;
let nhietDoPendingBroadcast = null;
let nhietDoLastDecayAt = Date.now();

function nhietDoTopList(limit = 5) {
    const arr = Object.values(nhietDoState.userContrib || {})
        .filter(u => u && u.totalDegrees > 0)
        .sort((a, b) => b.totalDegrees - a.totalDegrees)
        .slice(0, limit)
        .map(u => ({
            uniqueId: u.uniqueId,
            nickname: u.nickname || u.uniqueId,
            avatar: u.avatar || '',
            totalDegrees: Math.round(u.totalDegrees * 10) / 10
        }));
    return arr;
}

function nhietDoSnapshot() {
    const cfg = appConfig.games?.nhietdo;
    return {
        temp: Math.round(nhietDoState.temp * 10) / 10,
        tempMax: nhietDoState.tempMax,
        tempMin: nhietDoState.tempMin,
        lastGiftAt: nhietDoState.lastGiftAt,
        updatedAt: nhietDoState.updatedAt,
        active: nhietDoState.active !== false,
        sessionActive: cfg ? (cfg.sessionActive !== false) : true,
        top: nhietDoTopList(5)
    };
}

function broadcastNhietDoState({ immediate = false } = {}) {
    const send = () => {
        nhietDoLastBroadcast = Date.now();
        nhietDoPendingBroadcast = null;
        io.emit('nhietdo:state', nhietDoSnapshot());
    };
    if (immediate) {
        if (nhietDoPendingBroadcast) { clearTimeout(nhietDoPendingBroadcast); nhietDoPendingBroadcast = null; }
        return send();
    }
    const now = Date.now();
    const wait = Math.max(0, 200 - (now - nhietDoLastBroadcast));
    if (nhietDoPendingBroadcast) return;
    nhietDoPendingBroadcast = setTimeout(send, wait);
}

function nhietDoClamp(v) {
    if (!isFinite(v)) v = 0;
    return Math.max(nhietDoState.tempMin, Math.min(nhietDoState.tempMax, v));
}

function nhietDoApplyConfigToState(cfg) {
    if (!cfg) cfg = makeDefaultNhietDoConfig();
    const prevMax = nhietDoState.tempMax;
    nhietDoState.tempMin = Number(cfg.tempMin) || 0;
    nhietDoState.tempMax = Math.max(10, Number(cfg.tempMax) || 100);
    // Nếu max đổi, scale temp hiện tại để không vượt
    if (prevMax > 0 && prevMax !== nhietDoState.tempMax) {
        nhietDoState.temp = nhietDoClamp(nhietDoState.temp);
    }
    nhietDoState.active = cfg.enabled !== false;
}

function nhietDoReset() {
    const cfg = appConfig.games.nhietdo || makeDefaultNhietDoConfig();
    nhietDoApplyConfigToState(cfg);
    nhietDoState.temp = nhietDoClamp(Number(cfg.initialTemp) || 0);
    nhietDoState.lastGiftAt = 0;
    nhietDoState.updatedAt = Date.now();
    nhietDoState.userContrib = {};
    nhietDoState.crossedMilestones = {};
    broadcastNhietDoState({ immediate: true });
}

// Khi user dùng nút TEST / điều khiển thủ công (setTemp/addTemp/testGift) mà phiên đang DỪNG,
// tự BẬT phiên để overlay OBS hiện ngay. Nếu không: App đổi nhiệt nhưng OBS vẫn ẩn (class
// nd-stopped → display:none) → "không hiển thị nhiệt độ ở OBS". Trả về true nếu vừa kích hoạt
// (caller đã emit gameConfig để panel cập nhật nút BẮT ĐẦU → KẾT THÚC).
function nhietDoEnsureSessionActive() {
    if (!appConfig.games.nhietdo) appConfig.games.nhietdo = makeDefaultNhietDoConfig();
    if (appConfig.games.nhietdo.sessionActive !== false) return false;
    appConfig.games.nhietdo.sessionActive = true;
    saveAppConfig();
    io.emit('gameConfig', { gameId: 'nhietdo', config: appConfig.games.nhietdo });
    console.log('[nhietdo] auto-BẬT phiên (điều khiển thủ công lúc đang DỪNG) → overlay hiện trên OBS');
    return true;
}

function nhietDoSetTemp(temp) {
    const before = nhietDoState.temp;
    nhietDoState.temp = nhietDoClamp(Number(temp) || 0);
    nhietDoState.updatedAt = Date.now();
    checkNhietDoMilestones(before, nhietDoState.temp);
    broadcastNhietDoState({ immediate: true });
}

function nhietDoAddTemp(delta, { fromGift = false, contribUser = null } = {}) {
    const d = Number(delta) || 0;
    if (!d) return 0;
    const before = nhietDoState.temp;
    nhietDoState.temp = nhietDoClamp(before + d);
    const actual = nhietDoState.temp - before;
    if (fromGift) nhietDoState.lastGiftAt = Date.now();
    nhietDoState.updatedAt = Date.now();
    // Top contributor tracking — ONLY positive (heating) gifts count toward leaderboard
    if (fromGift && contribUser && contribUser.uniqueId && actual > 0) {
        const uid = String(contribUser.uniqueId).toLowerCase();
        const u = nhietDoState.userContrib[uid] || { uniqueId: contribUser.uniqueId, totalDegrees: 0, nickname: '', avatar: '', lastAt: 0 };
        u.totalDegrees += actual;
        u.nickname = contribUser.nickname || u.nickname || contribUser.uniqueId;
        u.avatar = contribUser.avatar || u.avatar || '';
        u.lastAt = Date.now();
        nhietDoState.userContrib[uid] = u;
    }
    // Gain popup
    if (Math.abs(actual) >= 0.1) {
        io.emit('nhietdo:gain', { delta: actual, fromGift: !!fromGift, ts: Date.now() });
    }
    // Milestone crossing detection — only on UPWARD crossing
    checkNhietDoMilestones(before, nhietDoState.temp);
    broadcastNhietDoState({ immediate: true });
    return actual;
}

// Check if we crossed any milestone going UP
function checkNhietDoMilestones(before, after) {
    if (after <= before) return;
    const cfg = appConfig.games?.nhietdo;
    if (!cfg || !Array.isArray(cfg.milestones)) return;
    for (const m of cfg.milestones) {
        if (m.enabled === false) continue;
        const t = Number(m.temp);
        if (!isFinite(t)) continue;
        if (before < t && after >= t) {
            // Throttle: same milestone không fire lại trong vòng 5s
            const last = nhietDoState.crossedMilestones[t] || 0;
            if (Date.now() - last < 5000) continue;
            nhietDoState.crossedMilestones[t] = Date.now();
            io.emit('nhietdo:milestone', {
                temp: t,
                label: m.label || `${t}°C`,
                tickerText: m.tickerText || '',
                mediaUrl: m.mediaUrl || '',
                mediaType: m.mediaType || '',
                volume: Number(m.volume) || 80,
                ts: Date.now()
            });
            console.log(`[nhietdo] milestone crossed: ${t}°C — "${m.label}"`);
        }
    }
}

// Compute degrees from heating gift (positive). Returns 0 if no match.
function nhietDoComputeGiftHeat(cfg, { giftId, coinValue, repeatCount }) {
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const coins = Math.max(0, Number(coinValue) || 0);
    const mode = cfg.heatMode || 'perCoin';
    if (mode === 'perCoin') {
        return coins * repeat * (Number(cfg.perCoinDegrees) || 0);
    }
    if (mode === 'perGift') {
        return repeat * (Number(cfg.perGiftDegrees) || 0);
    }
    if (mode === 'specificGifts') {
        const list = Array.isArray(cfg.specificGifts) ? cfg.specificGifts : [];
        const hit = list.find(g => String(g.giftId) === String(giftId));
        if (!hit) return 0;
        return repeat * (Number(hit.degrees) || 0);
    }
    return 0;
}

// Compute negative delta from cooling gift. Returns 0 if not in cooling list.
// Cooling gifts hoạt động ở MỌI heatMode (luôn priority hơn heating).
function nhietDoComputeGiftCool(cfg, { giftId, repeatCount }) {
    const list = Array.isArray(cfg.coolingGifts) ? cfg.coolingGifts : [];
    const hit = list.find(g => String(g.giftId) === String(giftId));
    if (!hit) return 0;
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const deg = Math.abs(Number(hit.degrees) || 0);
    return -1 * deg * repeat;
}

function handleNhietDoGift({ uniqueId, nickname, profilePicture, giftId, coinValue, repeatCount }) {
    if (appConfig.games?.nhietdo?.enabled === false) return;
    if (appConfig.games?.nhietdo?.sessionActive === false) return;   // phiên đã KẾT THÚC
    const cfg = appConfig.games.nhietdo || makeDefaultNhietDoConfig();
    // Check cooling first — cooling gifts override heating ở mọi mode
    const coolDelta = nhietDoComputeGiftCool(cfg, { giftId, repeatCount });
    if (coolDelta < 0) {
        nhietDoAddTemp(coolDelta, { fromGift: true });
        return;
    }
    const heatDelta = nhietDoComputeGiftHeat(cfg, { giftId, coinValue, repeatCount });
    if (heatDelta > 0) {
        nhietDoAddTemp(heatDelta, {
            fromGift: true,
            contribUser: uniqueId ? { uniqueId, nickname, avatar: profilePicture } : null
        });
    }
}

// Decay tick — chạy mỗi 500ms, giảm nhiệt khi idle
function nhietDoDecayTick() {
    const now = Date.now();
    const dt = (now - nhietDoLastDecayAt) / 1000;
    nhietDoLastDecayAt = now;
    if (nhietDoState.active === false) return;
    const cfg = appConfig.games?.nhietdo;
    if (!cfg || cfg.enabled === false || cfg.sessionActive === false) return;   // phiên TẮT → giữ nguyên nhiệt
    const idleSec = nhietDoState.lastGiftAt ? (now - nhietDoState.lastGiftAt) / 1000 : Infinity;
    if (idleSec < (Number(cfg.idleSeconds) || 0)) return;
    if (nhietDoState.temp <= nhietDoState.tempMin) return;
    const ratePerSec = Number(cfg.decayPerSecond) || 0;
    if (ratePerSec <= 0) return;
    let dropPerSec = ratePerSec;
    if (cfg.decayShape === 'easeOut') {
        // Càng gần min thì giảm càng chậm: scale theo (temp - min) / (max - min)
        const span = Math.max(1, nhietDoState.tempMax - nhietDoState.tempMin);
        const norm = (nhietDoState.temp - nhietDoState.tempMin) / span;
        dropPerSec = ratePerSec * (0.2 + 0.8 * norm);
    }
    const drop = dropPerSec * dt;
    if (drop <= 0) return;
    const before = nhietDoState.temp;
    nhietDoState.temp = nhietDoClamp(before - drop);
    nhietDoState.updatedAt = now;
    if (Math.abs(before - nhietDoState.temp) > 0.01) {
        broadcastNhietDoState();
    }
}
setInterval(nhietDoDecayTick, 500);

// Initialize state from config on startup
try { nhietDoApplyConfigToState(appConfig.games.nhietdo || makeDefaultNhietDoConfig()); } catch (e) {}
try {
    const cfg0 = appConfig.games.nhietdo || makeDefaultNhietDoConfig();
    nhietDoState.temp = nhietDoClamp(Number(cfg0.initialTemp) || 0);
} catch (e) {}

// Overlay route
app.get('/overlay/nhietdo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'nhietdo', 'overlay.html'));
});
// Zombie Phá Nhà chơi dạng CỬA SỔ (OBS bắt cửa sổ, không cần link overlay): game 3D cần GPU/WebGL mà
// Electron của app đã tắt GPU (xem đầu electron-main.js) → mở trong Edge/Chrome --app, profile riêng của HP.
app.post('/api/quaivat/window/open', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const shape = ['9:16', '1:1', '16:9'].includes(req.body && req.body.shape) ? req.body.shape : '9:16';
    let [w, h] = { '9:16': [540, 960], '1:1': [820, 860], '16:9': [1280, 760] }[shape], pos = null;
    const saved = quaivatWinBounds();                                // cửa sổ nhớ vị trí + kích thước lần trước (cùng khung)
    if (saved && saved.shape === shape) { w = saved.w; h = saved.h; pos = [saved.x, saved.y]; }
    const found = CaptionListener.resolveBrowserExe('edge', { exists: (p) => { try { return fs.existsSync(p); } catch (e) { return false; } } });
    if (!found) return res.json({ ok: false, error: 'Không tìm thấy Microsoft Edge hoặc Google Chrome trên máy' });
    const profileDir = path.join(DATA_DIR, 'quaivat-window', found.browser);
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    const low = req.body && req.body.quality === 'low';            // máy yếu: tắt hậu kỳ, bóng nhẹ, ít hạt bay
    const url = `http://127.0.0.1:${PORT}/overlay/quaivat?ratio=full&win=1&shape=${encodeURIComponent(shape)}${low ? '&q=low' : ''}`;
    // OBS bắt cửa sổ: Chromium mặc định ngừng vẽ / hãm nhịp khi cửa sổ bị che hoặc thu nhỏ → hình trong OBS đứng
    const keepDrawing = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
    const args = CaptionListener.buildLaunchArgs({ url, profileDir }).filter(a => !a.startsWith('--window-size=')).concat(`--window-size=${w},${h}`, ...(pos ? [`--window-position=${pos[0]},${pos[1]}`] : []), ...keepDrawing);
    try {
        const child = spawn(found.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', (e) => console.warn('[quaivat] mở cửa sổ game lỗi:', e.message));
        child.unref();
    } catch (e) { return res.json({ ok: false, error: e.message }); }
    console.log(`[quaivat] mở cửa sổ game bằng ${found.browser}: ${found.exe}`);
    res.json({ ok: true, browser: found.browser });
});
function quaivatWinFile() { return path.join(DATA_DIR, 'quaivat-window', 'bounds.json'); }
function quaivatWinBounds() { try { return JSON.parse(fs.readFileSync(quaivatWinFile(), 'utf8')); } catch (e) { return null; } }
app.post('/api/quaivat/window/bounds', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const b = req.body || {}, n = k => Math.round(Number(b[k]));
    const v = { x: n('x'), y: n('y'), w: n('w'), h: n('h'), shape: ['9:16', '1:1', '16:9'].includes(b.shape) ? b.shape : '' };
    if (![v.x, v.y, v.w, v.h].every(Number.isFinite) || v.w < 200 || v.h < 200 || v.w > 8000 || v.h > 8000 || Math.abs(v.x) > 20000 || Math.abs(v.y) > 20000) return res.status(400).json({ ok: false });
    try { fs.mkdirSync(path.dirname(quaivatWinFile()), { recursive: true }); fs.writeFileSync(quaivatWinFile(), JSON.stringify(v)); } catch (e) { return res.status(500).json({ ok: false }); }
    res.json({ ok: true });
});
// 🧟 phiên chơi (WIN/chặng/map) + sổ TOP tuần — lib/quaivat-store.js (game gửi nhịp tim → server mới ghi quà vào sổ)
let qvStore = null;
const qvStoreGet = () => qvStore || (qvStore = require('./lib/quaivat-store').createStore(DATA_DIR));
app.get('/api/quaivat/session', (req, res) => {
    const st = qvStoreGet();
    res.json({ ok: true, session: st.loadSession(), week: st.week(), top: st.top(5) });
});
app.post('/api/quaivat/session', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const s = qvStoreGet().saveSession(req.body || {});
    res.json({ ok: !!s });
});
app.get('/api/quaivat/fame', (req, res) => { const st = qvStoreGet(); res.json({ ok: true, week: st.week(), top: st.top(Number(req.query.n) || 5) }); });
app.get('/overlay/quaivat-gifts', (req, res) => {   // bảng quà Zombie Phá Nhà: nguồn OBS riêng
    res.sendFile(path.join(__dirname, 'public', 'games', 'quaivat', 'gifts.html'));
});
app.get('/overlay/quaivat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'quaivat', 'overlay.html'));
});
// ⛓️ Nhà Tù Online — overlay OBS (Browser Source 1080×1920) hoặc cửa sổ game Edge/Chrome --app (cần GPU/WebGL như Zombie Phá Nhà).
app.get('/overlay/nhatu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'nhatu', 'overlay.html'));
});
// 🏢 Creator Online — overlay OBS (Browser Source 1080×1920) hoặc cửa sổ game Edge/Chrome --app.
app.get('/overlay/creatoronline', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'creatoronline', 'overlay.html'));
});
// Cấp fan trọn đời: overlay hỏi gộp theo id khi fan mới vào; panel xem top + làm mới.
app.get('/api/creatoronline/fans', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    res.json({ fans: coFans.getMany(ids) });
});
app.get('/api/creatoronline/fans/top', (req, res) => {
    res.json({ top: coFans.top(Math.max(1, Math.min(200, Number(req.query.n) || 20))) });
});
app.post('/api/creatoronline/fans/reset', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    coFans.reset();
    res.json({ ok: true });
});
// body { demo: true } → mở Bản đi dạo (WASD, ví trong bộ nhớ) để streamer xem thử; mặc định mở overlay LIVE ?win=1.
// body { size: '720x1280' } ghi đè coWinSize (cỡ cửa sổ LIVE cho TikTok Studio "Chụp cửa sổ"); sai giá trị → '608x1080'.
const CO_WIN_SIZES = ['540x960', '608x1080', '720x1280', '1080x1920'];
function coWinSizeArg(...candidates) {
    const ok = candidates.map(s => String(s ?? '').trim().toLowerCase()).find(s => CO_WIN_SIZES.includes(s)) || '608x1080';
    return ok.replace('x', ',');
}
app.post('/api/creatoronline/window/open', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const found = CaptionListener.resolveBrowserExe('edge', { exists: (p) => { try { return fs.existsSync(p); } catch (e) { return false; } } });
    if (!found) return res.json({ ok: false, error: 'Không tìm thấy Microsoft Edge hoặc Google Chrome trên máy' });
    const demo = !!(req.body && req.body.demo);
    const profileDir = path.join(DATA_DIR, 'creatoronline-window', found.browser);
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    const url = demo ? `http://127.0.0.1:${PORT}/games/creatoronline/demo.html` : `http://127.0.0.1:${PORT}/overlay/creatoronline?win=1`;
    // OBS bắt cửa sổ: Chromium mặc định ngừng vẽ / hãm nhịp khi cửa sổ bị che hoặc thu nhỏ → hình trong OBS đứng
    const keepDrawing = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
    const args = CaptionListener.buildLaunchArgs({ url, profileDir }).filter(a => !a.startsWith('--window-size=')).concat(demo ? '--window-size=1280,800' : '--window-size=' + coWinSizeArg(req.body && req.body.size, appConfig.games.creatoronline?.coWinSize), ...keepDrawing);
    try {
        const child = spawn(found.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', (e) => console.warn('[creatoronline] mở cửa sổ game lỗi:', e.message));
        child.unref();
    } catch (e) { return res.json({ ok: false, error: e.message }); }
    console.log(`[creatoronline] mở ${demo ? 'bản đi dạo' : 'cửa sổ game'} bằng ${found.browser}: ${found.exe}`);
    res.json({ ok: true, browser: found.browser });
});
// 🛵 Đường Về Quê — overlay OBS (Browser Source 1080×1920) hoặc cửa sổ Edge/Chrome --app (streamer bấm phím trong cửa sổ).
app.get('/overlay/duongveque', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'duongveque', 'overlay.html'));
});
app.post('/api/duongveque/window/open', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const found = CaptionListener.resolveBrowserExe('edge', { exists: (p) => { try { return fs.existsSync(p); } catch (e) { return false; } } });
    if (!found) return res.json({ ok: false, error: 'Không tìm thấy Microsoft Edge hoặc Google Chrome trên máy' });
    const profileDir = path.join(DATA_DIR, 'duongveque-window', found.browser);
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    const url = `http://127.0.0.1:${PORT}/overlay/duongveque?win=1`;
    const keepDrawing = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
    const args = CaptionListener.buildLaunchArgs({ url, profileDir }).filter(a => !a.startsWith('--window-size=')).concat('--window-size=540,960', ...keepDrawing);
    try {
        const child = spawn(found.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', (e) => console.warn('[duongveque] mở cửa sổ game lỗi:', e.message));
        child.unref();
    } catch (e) { return res.json({ ok: false, error: e.message }); }
    res.json({ ok: true, browser: found.browser });
});
// Phím của streamer (nút trong app / phím tắt toàn cục Electron) → overlay: jump | ram | start
app.post('/api/duongveque/key', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const action = String(req.body?.action || '');
    if (!['jump', 'ram', 'start'].includes(action)) return res.status(400).json({ ok: false, error: 'action' });
    io.emit('duongveque:key', { action });
    res.json({ ok: true });
});
app.post('/api/nhatu/window/open', (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ ok: false, error: 'untrusted' });
    const found = CaptionListener.resolveBrowserExe('edge', { exists: (p) => { try { return fs.existsSync(p); } catch (e) { return false; } } });
    if (!found) return res.json({ ok: false, error: 'Không tìm thấy Microsoft Edge hoặc Google Chrome trên máy' });
    const profileDir = path.join(DATA_DIR, 'nhatu-window', found.browser);
    try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
    const url = `http://127.0.0.1:${PORT}/overlay/nhatu?win=1`;
    // OBS bắt cửa sổ: Chromium mặc định ngừng vẽ / hãm nhịp khi cửa sổ bị che hoặc thu nhỏ → hình trong OBS đứng
    const keepDrawing = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
    const args = CaptionListener.buildLaunchArgs({ url, profileDir }).filter(a => !a.startsWith('--window-size=')).concat('--window-size=540,960', ...keepDrawing);
    try {
        const child = spawn(found.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', (e) => console.warn('[nhatu] mở cửa sổ game lỗi:', e.message));
        child.unref();
    } catch (e) { return res.json({ ok: false, error: e.message }); }
    console.log(`[nhatu] mở cửa sổ game bằng ${found.browser}: ${found.exe}`);
    res.json({ ok: true, browser: found.browser });
});

// Live state (custom path to avoid generic /api/games/:id/state route)
app.get('/api/games/nhietdo/livestate', (req, res) => {
    res.json(nhietDoSnapshot());
});

// Control endpoint — reset / setTemp / addTemp / testGift / testMilestone / start / stop
app.post('/api/games/nhietdo/control', (req, res) => {
    const cmd = String(req.body?.cmd || '').toLowerCase();
    if (cmd === 'start') {
        if (!appConfig.games.nhietdo) appConfig.games.nhietdo = makeDefaultNhietDoConfig();
        appConfig.games.nhietdo.sessionActive = true;
        saveAppConfig();
        io.emit('gameConfig', { gameId: 'nhietdo', config: appConfig.games.nhietdo });
        io.emit('overlay:reload', { gameId: 'nhietdo' });
        broadcastNhietDoState({ immediate: true });
        console.log('[nhietdo] SESSION START');
    } else if (cmd === 'stop') {
        if (!appConfig.games.nhietdo) appConfig.games.nhietdo = makeDefaultNhietDoConfig();
        appConfig.games.nhietdo.sessionActive = false;
        saveAppConfig();
        io.emit('gameConfig', { gameId: 'nhietdo', config: appConfig.games.nhietdo });
        broadcastNhietDoState({ immediate: true });
        console.log('[nhietdo] SESSION STOP — overlay ẩn');
    } else if (cmd === 'reset') {
        nhietDoReset();
    } else if (cmd === 'settemp') {
        nhietDoEnsureSessionActive();   // test thủ công lúc DỪNG → tự BẬT để OBS hiện
        nhietDoSetTemp(req.body?.temp);
    } else if (cmd === 'addtemp') {
        nhietDoEnsureSessionActive();
        nhietDoAddTemp(req.body?.delta || 0, { fromGift: false });
    } else if (cmd === 'testgift') {
        nhietDoEnsureSessionActive();
        handleNhietDoGift({
            uniqueId: req.body?.uniqueId || 'tester',
            nickname: req.body?.nickname || 'Người Thử',
            profilePicture: req.body?.profilePicture || '',
            giftId: req.body?.giftId || '',
            coinValue: req.body?.coinValue || 10,
            repeatCount: req.body?.repeatCount || 1
        });
    } else if (cmd === 'testmilestone') {
        // Fire 1 milestone bất kỳ ngay (test media + ticker)
        const cfg = appConfig.games.nhietdo || makeDefaultNhietDoConfig();
        const idx = parseInt(req.body?.index, 10);
        const m = (Array.isArray(cfg.milestones) && cfg.milestones[idx]) ? cfg.milestones[idx] : null;
        if (!m) return res.status(400).json({ ok: false, error: 'index không hợp lệ' });
        io.emit('nhietdo:milestone', {
            temp: m.temp, label: m.label || '', tickerText: m.tickerText || '',
            mediaUrl: m.mediaUrl || '', mediaType: m.mediaType || '',
            volume: Number(m.volume) || 80, ts: Date.now()
        });
    } else {
        return res.status(400).json({ ok: false, error: 'cmd phải là reset|setTemp|addTemp|testGift|testMilestone' });
    }
    res.json({ ok: true, state: nhietDoSnapshot() });
});

// Upload endpoint cho milestone media + ambient audio — raw bytes, pattern giống pktiktok
const NHIETDO_ASSETS_DIR = path.join(DATA_DIR, 'nhietdo-assets');
if (!fs.existsSync(NHIETDO_ASSETS_DIR)) fs.mkdirSync(NHIETDO_ASSETS_DIR, { recursive: true });
const NHIETDO_ALLOWED_EXTS = ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'png', 'jpg', 'jpeg', 'gif'];
app.post('/api/games/nhietdo/upload',
    express.raw({ limit: '30mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!NHIETDO_ALLOWED_EXTS.includes(ext)) return res.status(400).json({ ok: false, error: 'invalid_ext' });
        if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'empty_body' });
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const filename = `${id}.${ext}`;
        const filePath = path.join(NHIETDO_ASSETS_DIR, filename);
        try {
            fs.writeFileSync(filePath, req.body);
            res.json({ ok: true, url: `/api/games/nhietdo/asset/${filename}`, filename });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    }
);
app.get('/api/games/nhietdo/asset/:fn', (req, res) => {
    const fn = String(req.params.fn || '').replace(/[^a-z0-9._-]/gi, '');
    const fp = path.join(NHIETDO_ASSETS_DIR, fn);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
});

// ── 🪧 TRỒNG CÂY — upload media cho mặt bảng TOP 3 (PNG/WEBP/GIF/WEBM/MP4) ──
// Dùng lại pattern raw-body như nhietdo: POST bytes → lưu file → trả URL /asset/<fn>.
const TRONGCAY_ASSETS_DIR = path.join(DATA_DIR, 'trongcay-assets');
if (!fs.existsSync(TRONGCAY_ASSETS_DIR)) fs.mkdirSync(TRONGCAY_ASSETS_DIR, { recursive: true });
const TRONGCAY_ALLOWED_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'webm', 'mp4'];
app.post('/api/games/trongcay/upload',
    express.raw({ limit: '40mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!TRONGCAY_ALLOWED_EXTS.includes(ext)) return res.status(400).json({ ok: false, error: 'invalid_ext' });
        if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'empty_body' });
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const filename = `${id}.${ext}`;
        try {
            fs.writeFileSync(path.join(TRONGCAY_ASSETS_DIR, filename), req.body);
            res.json({ ok: true, url: `/api/games/trongcay/asset/${filename}`, filename });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    }
);
app.get('/api/games/trongcay/asset/:fn', (req, res) => {
    const fn = String(req.params.fn || '').replace(/[^a-z0-9._-]/gi, '');
    const fp = path.join(TRONGCAY_ASSETS_DIR, fn);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
});

// ============================================================
// TRỒNG CÂY — live state + gift hook (grow/water/sun/cut/butterfly)
// ============================================================
let trongCayState = {
    height: 0,
    water: 55,
    sun: 28,
    wilt: 0,
    plants: [],
    flowers: [],
    groundFruits: [],        // trái chín rụng xuống đất khi cây héo → { id, x%, uniqueId, nickname, ts }
    butterflies: [],
    butterflyUsers: {},
    caterpillars: [],        // 🐛 sâu đang ăn → { id, plantId, onGround, x%, bornAt, lastBiteAt, dying }
    corpses: [],             // 🐛 xác sâu dồn dưới đất sau khi bị xịt → { id, x%, ts }
    pupae: [],               // 🐛→🦋 sâu sống sót hóa nhộng dưới đất → { id, x%, evolveAt, avatar, nickname, uniqueId }
    protectedZones: [],      // 🧴 vùng vừa xịt thuốc, sâu không vào/ăn được → { x0%, x1%, until }
    stemCuts: {},
    contributors: {},        // uid → { nickname, avatar, score, drops, lastAt } — Top người chăm cây
    milestoneReached: 0,     // mốc % cao nhất đã đạt (25/50/75/100) để không bắn lại
    harvestCount: 0,         // số cây đã thu hoạch trong buổi LIVE
    blooming: false,         // đang trong pha nở hoa chờ thu hoạch
    lastGiftAt: 0,
    kpiBaseline: 0,          // 💎 mốc gốc của KPI: kpiDiamond = totalDiamond(buổi LIVE) − baseline. Nút "Reset mốc KPI" set baseline = total hiện tại → đếm lại từ 0 mà KHÔNG đụng thẻ 💎 tổng chung.
    updatedAt: Date.now()
};
let trongCayLastTickAt = Date.now();
let trongCayLastBroadcast = 0;
let trongCayPendingBroadcast = null;
// 🐉 Rồng lửa — mốc thời gian "đang thiêu". Trong lúc cháy: tick đóng băng (cây giữ nguyên để
//    overlay vẽ cháy đen), bỏ qua quà tới. Hết tổng thời gian → đốt rụi cây (giữ Top/điểm).
//    Các hằng số NÀY PHẢI KHỚP với overlay.html (preburnMs/charMs/fadeMs cũng gửi kèm event).
const TC_DRAGON = { PREBURN: 5200, CHAR: 2000, FADE: 1600 };
function tcDragonTotalMs(burnSec) {
    return TC_DRAGON.PREBURN + TC_DRAGON.CHAR + trongCayClamp(Number(burnSec) || 10, 2, 60) * 1000 + TC_DRAGON.FADE;
}
let trongCayBurnUntil = 0;
let trongCayBurnTimer = null;
const trongCayCommentWaterAt = new Map(); // uid -> lần cuối comment-tưới (trần thời gian / user)
let trongCayLastCommentRainAt = 0;        // throttle toàn cục cho event mưa (chống flood overlay khi đông người comment)
const trongCayChoosing = new Map();       // 🌱 uid -> expiry ms: viewer đã tặng quà kích hoạt, đang chờ chọn loại cây

function trongCayClamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
}

function trongCayCommentKey(uniqueId) {
    return String(uniqueId || '').trim().toLowerCase();
}

function trongCayNormalizeText(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '');
}

// 💬 Chỉ cần comment ĐÚNG từ khóa là TỰ TƯỚI nước — không cần tặng quà.
//    Chống spam/lag: (1) trần thời gian mỗi người (cooldown), (2) throttle toàn cục cho event mưa.
//    Chỉ chạy khi phiên ĐANG bật (sessionActive !== false) — comment lúc dừng phiên thì bỏ qua.
function handleTrongCayChat({ uniqueId, nickname, profilePicture, comment }) {
    const cfg = appConfig.games?.trongcay;
    if (!cfg || cfg.enabled === false) return;
    if (cfg.waterCommentAutoWater === false) return;
    if (cfg.sessionActive === false) return;          // phiên đang dừng → không tưới
    if (Date.now() < trongCayBurnUntil) return;       // 🐉 vườn đang bị thiêu → bỏ qua
    const key = trongCayCommentKey(uniqueId);
    if (!key) return;
    const keyword = trongCayNormalizeText(cfg.waterCommentKeyword || 'tuoicay');
    if (!keyword) return;
    const normalized = trongCayNormalizeText(comment);
    if (!(normalized === keyword || normalized.includes(keyword))) return;

    const now = Date.now();
    const cooldownMs = Math.max(1, Number(cfg.waterCommentCooldownSeconds) || 8) * 1000;
    const last = trongCayCommentWaterAt.get(key) || 0;
    if (now - last < cooldownMs) return;              // trần thời gian / user
    trongCayCommentWaterAt.set(key, now);
    if (trongCayCommentWaterAt.size > 3000) {         // dọn map khỏi phình to
        for (const [k, t] of trongCayCommentWaterAt) { if (now - t > cooldownMs) trongCayCommentWaterAt.delete(k); }
    }

    const amount = Math.max(1, Number(cfg.waterCommentAmount) || 6);
    trongCayApplyDelta({ water: amount });
    trongCayAddContrib({ uniqueId, nickname, profilePicture, coinValue: 0, repeatCount: 1 });
    trongCayState.lastGiftAt = now;
    // event mưa: gộp theo throttle toàn cục để overlay không bị flood khi nhiều người cùng comment
    if (now - trongCayLastCommentRainAt >= 600) {
        trongCayLastCommentRainAt = now;
        io.emit('trongcay:water', { nickname, uniqueId, ts: now });
        broadcastTrongCayState({ immediate: true });
    } else {
        broadcastTrongCayState();                     // coalesce ~250ms (xem broadcastTrongCayState)
    }
}

function trongCaySnapshot() {
    const cfg = appConfig.games?.trongcay;
    return {
        height: Math.round(trongCayState.height * 10) / 10,
        water: Math.round(trongCayState.water * 10) / 10,
        sun: Math.round(trongCayState.sun * 10) / 10,
        wilt: Math.round(trongCayState.wilt * 10) / 10,
        plants: trongCayState.plants.slice(-120).map(p => { const { contribs, ...rest } = p; return rest; }),
        flowers: trongCayState.flowers.slice(-120),
        groundFruits: (trongCayState.groundFruits || []).slice(-60),
        caterpillars: (trongCayState.caterpillars || []).slice(-30),
        corpses: (trongCayState.corpses || []).slice(-40),
        pupae: (trongCayState.pupae || []).slice(-20),
        protectedZones: (trongCayState.protectedZones || []).filter(z => z.until > Date.now()),
        butterflies: trongCayState.butterflies.slice(-40),
        stemCuts: { ...(trongCayState.stemCuts || {}) },
        top: trongCayTopContributors(3),
        kpiDiamond: Math.max(0, Math.round(Number(liveStats && liveStats.totalDiamond) || 0) - (Number(trongCayState.kpiBaseline) || 0)),   // 💎 KPI = tổng kim cương buổi LIVE − baseline (nút Reset) → mở khoá trang trí theo KPI
        harvestCount: Number(trongCayState.harvestCount) || 0,
        milestone: Number(trongCayState.milestoneReached) || 0,
        blooming: !!trongCayState.blooming,
        burning: Date.now() < trongCayBurnUntil,   // 🐉 overlay tải lại giữa pha cháy thì biết để không vẽ sai
        lastGiftAt: trongCayState.lastGiftAt,
        sessionActive: cfg ? (cfg.sessionActive !== false) : true,
        enabled: cfg ? (cfg.enabled !== false) : true,
        updatedAt: trongCayState.updatedAt
    };
}

function broadcastTrongCayState({ immediate = false } = {}) {
    const send = () => {
        trongCayLastBroadcast = Date.now();
        trongCayPendingBroadcast = null;
        io.emit('trongcay:state', trongCaySnapshot());
    };
    if (immediate) {
        if (trongCayPendingBroadcast) { clearTimeout(trongCayPendingBroadcast); trongCayPendingBroadcast = null; }
        return send();
    }
    const now = Date.now();
    const wait = Math.max(0, 250 - (now - trongCayLastBroadcast));
    if (trongCayPendingBroadcast) return;
    trongCayPendingBroadcast = setTimeout(send, wait);
}

function trongCayApplyConfigToState(cfg) {
    if (!cfg) cfg = makeDefaultTrongCayConfig();
    const maxH = Math.max(20, Number(cfg.maxHeight) || 100);
    trongCayState.height = trongCayClamp(trongCayState.height, 0, maxH);
    trongCayState.water = trongCayClamp(trongCayState.water, 0, 100);
    trongCayState.sun = trongCayClamp(trongCayState.sun, 0, 100);
    trongCayState.wilt = trongCayClamp(trongCayState.wilt, 0, 100);
}

function trongCayReset() {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    // Vườn luôn bắt đầu trống. Cây/hoa chỉ xuất hiện sau gift hoặc nút test gift.
    trongCayState.height = 0;
    trongCayState.water = trongCayClamp(cfg.initialWater == null ? 55 : Number(cfg.initialWater), 0, 100);
    trongCayState.sun = trongCayClamp(cfg.initialSun == null ? 28 : Number(cfg.initialSun), 0, 100);
    trongCayState.wilt = trongCayClamp(cfg.initialWilt == null ? 0 : Number(cfg.initialWilt), 0, 100);
    trongCayState.plants = [];
    trongCayState.flowers = [];
    trongCayState.groundFruits = [];
    trongCayState.caterpillars = [];
    trongCayState.corpses = [];
    trongCayState.pupae = [];
    trongCayState.protectedZones = [];
    trongCayState.butterflies = [];
    trongCayState.butterflyUsers = {};
    trongCayState.stemCuts = {};
    trongCayState.contributors = {};
    trongCayState.milestoneReached = 0;
    trongCayState.harvestCount = 0;
    trongCayState.blooming = false;
    trongCayState.lastGiftAt = 0;
    trongCayChoosing.clear();
    if (trongCayBurnTimer) { clearTimeout(trongCayBurnTimer); trongCayBurnTimer = null; }
    trongCayBurnUntil = 0;
    trongCayState.updatedAt = Date.now();
    broadcastTrongCayState({ immediate: true });
}

// 🐉 Rồng lửa thiêu rụi vườn nhưng GIỮ Top người chăm cây & điểm tích lũy.
//    Khác trongCayReset ở chỗ KHÔNG xóa contributors & harvestCount.
function trongCayDragonClear() {
    trongCayState.height = 0;
    trongCayState.plants = [];
    trongCayState.flowers = [];
    trongCayState.groundFruits = [];
    trongCayState.caterpillars = [];
    trongCayState.corpses = [];
    trongCayState.pupae = [];
    trongCayState.protectedZones = [];
    trongCayState.butterflies = [];
    trongCayState.butterflyUsers = {};
    trongCayState.stemCuts = {};
    trongCayState.blooming = false;
    trongCayState.milestoneReached = 0;   // trồng lại từ đầu → cho ăn mừng mốc lại
    trongCayState.wilt = 0;
    trongCayChoosing.clear();             // 🌱 cây bị thiêu → ai đang chọn cũng phải kích hoạt lại
    // GIỮ NGUYÊN: contributors (Top), harvestCount (điểm/đếm thu hoạch)
    trongCayState.updatedAt = Date.now();
    broadcastTrongCayState({ immediate: true });
}

// 🐉 Khởi động pha rồng tấn công. Overlay tự lo toàn bộ choreography theo các mốc gửi kèm.
//    Server: chụp trạng thái cây hiện tại (broadcast) → emit event → đóng băng → hết giờ đốt rụi.
function trongCayDragonAttack({ nickname, uniqueId, profilePicture, burnSeconds } = {}) {
    if (appConfig.games?.trongcay?.enabled === false) return;
    trongCayEnsureSessionActive();
    const now = Date.now();
    if (now < trongCayBurnUntil) return;   // đang cháy → bỏ qua quà rồng trùng lặp
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const burnSec = trongCayClamp(Number(burnSeconds) || Number(cfg.dragonBurnSeconds) || 10, 2, 60);
    if (cfg.display?.showDragon === false) {
        // Tắt hiển thị rồng → vẫn thực thi hậu quả (đốt rụi) nhưng không có animation.
        trongCayDragonClear();
        return;
    }
    broadcastTrongCayState({ immediate: true });   // overlay "chụp" cây hiện tại trước khi đốt
    io.emit('trongcay:dragon', {
        nickname: nickname || '', uniqueId: uniqueId || '', avatar: profilePicture || '',
        burnSeconds: burnSec,
        preburnMs: TC_DRAGON.PREBURN, charMs: TC_DRAGON.CHAR, fadeMs: TC_DRAGON.FADE,
        ts: now
    });
    const total = tcDragonTotalMs(burnSec);
    trongCayBurnUntil = now + total;
    clearTimeout(trongCayBurnTimer);
    trongCayBurnTimer = setTimeout(() => { trongCayBurnUntil = 0; trongCayDragonClear(); }, total);
}

function trongCayEnsureSessionActive() {
    if (!appConfig.games.trongcay) appConfig.games.trongcay = makeDefaultTrongCayConfig();
    if (appConfig.games.trongcay.sessionActive !== false) return false;
    appConfig.games.trongcay.sessionActive = true;
    saveAppConfig();
    io.emit('gameConfig', { gameId: 'trongcay', config: appConfig.games.trongcay });
    return true;
}

function trongCayPickGift(list, giftId) {
    return Array.isArray(list) ? list.find(g => String(g.giftId) === String(giftId)) : null;
}

function trongCayComputeGrowth(cfg, { giftId, coinValue, repeatCount }) {
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const mode = cfg.growthMode || 'perCoin';
    if (mode === 'perCoin') {
        // Dùng sqrt để quà lớn vẫn khác nhau nhưng không cùng đụng trần 100 quá nhanh.
        // Ví dụ perCoinGrowth=0.25: 15k KC ~= +30.6, 20k KC ~= +35.4.
        const coins = Math.max(0, Number(coinValue) || 0);
        return Math.sqrt(coins) * repeat * (Number(cfg.perCoinGrowth) || 0);
    }
    if (mode === 'perGift') return repeat * (Number(cfg.perGiftGrowth) || 0);
    if (mode === 'specificGifts') {
        const hit = trongCayPickGift(cfg.specificGifts, giftId);
        return hit ? repeat * (Number(hit.growth) || 0) : 0;
    }
    return 0;
}

// 🌱 Chọn cây — tăng trưởng cây CỦA VIEWER theo số Xu của quà, KỂ CẢ khi growthMode='specificGifts'
//    (yêu cầu: "bất kỳ quà nào cũng giúp tăng trưởng cây theo số Xu"). Có sàn để quà nhỏ vẫn nhích.
function trongCayCoinGrowth(cfg, coinValue, repeatCount) {
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const coins = Math.max(0, Number(coinValue) || 0);
    const per = Number(cfg.perCoinGrowth) || 0.25;
    return Math.max(3, Math.sqrt(coins) * repeat * per);
}
// Cây của riêng viewer. Mỗi quà kích hoạt = 1 LOẠI cây → 1 viewer có nhiều cây, mỗi cây key
// theo (ownerUid + giftId). Truyền giftId để lấy đúng cây loại đó; bỏ trống = cây owned bất kỳ.
function trongCayFindOwnedTree(uid, giftId) {
    const u = String(uid || '').toLowerCase();
    if (!u || !Array.isArray(trongCayState.plants)) return null;
    const g = giftId == null ? null : String(giftId);
    return trongCayState.plants.find(p => p.owned && String(p.ownerUid || '') === u && (g == null || String(p.giftId) === g)) || null;
}
function trongCayHasOwnedTree(uid) { return !!trongCayFindOwnedTree(uid); }
// Cây ĐANG hoạt động (chưa khóa) gần nhất của viewer → đích cho "quà thường" làm cao cây.
function trongCayActiveTreeOf(uid) {
    const u = String(uid || '').toLowerCase();
    if (!u || !Array.isArray(trongCayState.plants)) return null;
    let best = null;
    for (const p of trongCayState.plants) {
        if (!p.owned || p.growthLocked || String(p.ownerUid || '') !== u) continue;
        if (!best || (Number(p.activatedAt) || 0) > (Number(best.activatedAt) || 0)) best = p;
    }
    return best;
}
// 🐾 Thông tin thú cưng cho 1 viewer: tìm cây OWNED của họ để overlay vẽ thú cạnh cây.
//    Ưu tiên cây "chim" (đã tặng quà bay) → bird bay theo độ cao; nếu không có thì cây active/cao nhất.
function trongCayPetInfoFor(uid) {
    const u = String(uid || '').toLowerCase();
    if (!u || !Array.isArray(trongCayState.plants)) return null;
    let bird = null, active = null, tallest = null;
    for (const p of trongCayState.plants) {
        if (!p.owned || String(p.ownerUid || '') !== u) continue;
        if (p.birdGiftImage && (!bird || (Number(p.activatedAt) || 0) > (Number(bird.activatedAt) || 0))) bird = p;
        if (!p.growthLocked && (!active || (Number(p.activatedAt) || 0) > (Number(active.activatedAt) || 0))) active = p;
        if (!tallest || (Number(p.height) || 0) > (Number(tallest.height) || 0)) tallest = p;
    }
    const tree = bird || active || tallest;
    if (!tree) return null;
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    return {
        treeIcon: tree.giftImage || '',
        treeName: tree.giftName || '',
        treeX: Math.round((Number(tree.x) || 50) * 10) / 10,
        treeHeight: Math.round((Number(tree.height) || 0) * 10) / 10,
        maxH: Number(cfg.maxHeight) || 100,
        birdIcon: (bird && bird.birdGiftImage) || ''
    };
}
// Avatar đã lưu của người chăm cây (dùng làm dự phòng khi quà tới thiếu profilePicture).
function trongCayContribAvatar(uid) {
    const u = String(uid || '').toLowerCase();
    const c = u && trongCayState.contributors ? trongCayState.contributors[u] : null;
    return (c && c.avatar) || '';
}

function trongCayPickPlantX() {
    // Chừa mép 2 bên: cây không mọc quá sát rìa (overlay vẫn kẹp lại, nhưng spawn trong khoảng
    // an toàn để cây rải đều, không dồn cục ở biên).
    const LO = 14, HI = 86;
    const plants = Array.isArray(trongCayState.plants) ? trongCayState.plants : [];
    if (plants.length && Math.random() < 0.22) {
        const near = plants[Math.floor(Math.random() * plants.length)];
        return Math.round(trongCayClamp((Number(near.x) || 50) + (Math.random() * 24 - 12), LO, HI) * 10) / 10;
    }
    if (plants.length < 8) {
        const slots = [16, 28, 40, 50, 60, 72, 84].filter(x => !plants.some(p => Math.abs((Number(p.x) || 50) - x) < 7));
        if (slots.length) return Math.round((slots[Math.floor(Math.random() * slots.length)] + (Math.random() * 6 - 3)) * 10) / 10;
    }
    return Math.round((LO + Math.random() * (HI - LO)) * 10) / 10;
}

// Số cây/hoa tối đa trong vườn. 80 = mặc định cũ (đã lưu sẵn trong config người dùng) → coi như 30 mới.
function trongCayMaxFlowers(cfg) {
    const n = Number(cfg.maxFlowers);
    return Math.max(10, !n || n === 80 ? 30 : n);
}

function trongCayGrowGiftPlant({ giftId, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount, growth, owned, ownerUid, ownerAvatar, lockImage, targetPlant }) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const grow = Math.max(0, Number(growth) || 0);
    if (grow <= 0) return null;
    // Quà LUÔN làm cây xuất hiện / lớn lên — không chặn dù vườn đang héo. Cây mới phải mọc
    // lên tươi xanh kể cả khi những cây cũ xung quanh đã héo.
    if (!Array.isArray(trongCayState.plants)) trongCayState.plants = [];
    const gid = String(giftId || giftName || Date.now());
    // 🌱 Cây của VIEWER key theo (ownerUid + giftId) — mỗi quà kích hoạt = 1 loại cây riêng.
    //    targetPlant: làm cao ĐÚNG cây đó (quà thường chăm cây active) — bỏ qua tìm/tạo.
    const ouid = String(ownerUid || '').toLowerCase();
    let plant = targetPlant
        || (owned && ouid
            ? trongCayState.plants.find(p => p.owned && String(p.ownerUid || '') === ouid && String(p.giftId) === gid)
            : trongCayState.plants.find(p => !p.owned && String(p.giftId) === gid));
    const now = Date.now();
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const scent = Math.max(1, Math.min(100000, (Number(coinValue) || 1) * repeat));
    if (!plant) {
        const idKey = owned && ouid ? ('owner-' + ouid + '-' + gid) : gid;
        plant = {
            id: 'plant-' + idKey.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) + '-' + now.toString(36),
            giftId: gid,
            giftName: giftName || ('Quà #' + gid),
            giftImage: giftImage || '',
            x: trongCayPickPlantX(),
            height: 0,
            lean: Math.round((Math.random() * 90 - 45) * 10) / 10,
            leafSeed: Math.floor(Math.random() * 9999),
            count: 0,
            scent: 0,
            visits: 0,
            wilt: 0,
            nickname: nickname || uniqueId || '',
            uniqueId: uniqueId || '',
            owned: !!owned,                 // 🌱 cây trồng qua nghi thức chọn cây → có chủ + dây avatar
            ownerUid: owned ? ouid : '',
            ownerAvatar: owned ? (ownerAvatar || '') : '',
            ripe: false,        // đã đạt 100% & kết trái chưa
            fruits: 0,          // số trái đang treo trên cây (để vẽ)
            contribs: {},       // uid → true: những người đã góp nuôi CÂY NÀY (đủ nhiều → TEAM)
            teamCount: 0,
            ts: now,
            lastAt: now
        };
        trongCayState.plants.push(plant);
    }
    plant.height = trongCayClamp((Number(plant.height) || 0) + grow, 2, Number(cfg.maxHeight) || 100);
    plant.count = (Number(plant.count) || 0) + repeat;
    plant.scent = Math.max(Number(plant.scent) || 0, scent);
    // lockImage = cây owned đã trồng → GIỮ loài cây (không đổi ảnh/tên theo quà tăng trưởng sau).
    if (!lockImage) {
        plant.giftName = giftName || plant.giftName;
        plant.giftImage = giftImage || plant.giftImage;
    }
    if (owned) { plant.ownerUid = ouid || plant.ownerUid; if (ownerAvatar) plant.ownerAvatar = ownerAvatar; }
    plant.nickname = nickname || plant.nickname;
    plant.uniqueId = uniqueId || plant.uniqueId;
    plant.lastAt = now;
    // Theo dõi NGƯỜI GÓP cho cây này → đủ nhiều người (teamMinContributors) thì cây lên "TEAM".
    const cuid = String(uniqueId || nickname || '').toLowerCase();
    if (cuid) { if (!plant.contribs) plant.contribs = {}; plant.contribs[cuid] = true; }
    plant.teamCount = plant.contribs ? Object.keys(plant.contribs).length : 0;
    // Tặng quà = chăm cây → cây này xanh tươi trở lại (dù vườn đang héo).
    plant.wilt = 0;
    // ===== THU HOẠCH KIỂU "KẾT TRÁI TẠI CHỖ" =====
    // Cây đạt 100% KHÔNG biến mất. Lần đầu chạm trần → "chín": kết trái + ăn mừng.
    // Mỗi lần được tặng tiếp khi đã chín → rung cây cho ra thêm trái. Cây luôn đứng đó.
    const maxH = Number(cfg.maxHeight) || 100;
    if (plant.height >= maxH - 0.01) {
        const fruitsPer = Math.max(1, Number(cfg.fruitsPerHarvest) || 3) * repeat;
        const maxFruits = Math.max(1, Number(cfg.maxFruitsPerPlant) || 12);
        const wasRipe = !!plant.ripe;
        plant.ripe = true;
        plant.fruits = Math.min(maxFruits, (Number(plant.fruits) || 0) + fruitsPer);
        trongCayState.harvestCount = (Number(trongCayState.harvestCount) || 0) + fruitsPer;
        io.emit('trongcay:fruit', {
            plantId: plant.id, x: plant.x, nickname: plant.nickname,
            gained: fruitsPer, fruits: plant.fruits, total: trongCayState.harvestCount,
            first: !wasRipe, ts: now
        });
    }
    const maxFlowers = trongCayMaxFlowers(cfg);
    while (trongCayState.plants.length > maxFlowers) trongCayState.plants.shift();
    trongCayState.height = trongCayClamp(Math.max(0, ...trongCayState.plants.map(p => Number(p.height) || 0)), 0, Number(cfg.maxHeight) || 100);
    trongCayState.updatedAt = now;
    return plant;
}

function trongCayAddFlower({ giftId, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount }) {
    if (!giftImage) return null;
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const stemCount = Math.max(1, Math.min(12, parseInt(cfg.display?.stemCount, 10) || 7));
    const stemIndex = Math.floor(Math.random() * stemCount);
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const scent = Math.max(1, Math.min(100000, (Number(coinValue) || 1) * repeat));
    const flower = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        giftId: String(giftId || ''),
        giftName: giftName || '',
        giftImage: giftImage || '',
        nickname: nickname || uniqueId || '',
        uniqueId: uniqueId || '',
        stemIndex,
        stemT: Math.round((0.72 + Math.random() * 0.25) * 1000) / 1000,
        x: 50,
        y: 50,
        size: Math.round((44 + Math.random() * 30) * 10) / 10,
        rot: Math.round(-18 + Math.random() * 36),
        scent,
        visits: 0,
        ts: Date.now()
    };
    trongCayState.flowers.push(flower);
    const maxFlowers = trongCayMaxFlowers(cfg);
    while (trongCayState.flowers.length > maxFlowers) trongCayState.flowers.shift();
    return flower;
}

function trongCayPickButterflyFlower(fallbackFlower) {
    const plants = (trongCayState.plants || []).filter(p => p && p.giftImage);
    if (plants.length) {
        let bestPlant = plants[0];
        let bestPlantScore = -Infinity;
        for (const p of plants) {
            const scentScore = Math.sqrt(Math.max(1, Number(p.scent) || 1)) * 4.2;
            const highScore = (Number(p.height) || 0) * 2.5;
            const popularScore = Math.min(8, Number(p.visits) || 0) * 3;
            const score = scentScore + highScore + popularScore + Math.random() * 60;
            if (score > bestPlantScore) { bestPlantScore = score; bestPlant = p; }
        }
        bestPlant.visits = (Number(bestPlant.visits) || 0) + 1;
        return { id: bestPlant.id, plantId: bestPlant.id, x: bestPlant.x, y: 50, scent: bestPlant.scent, visits: bestPlant.visits };
    }
    const flowers = (trongCayState.flowers || []).filter(f => f && f.giftImage);
    if (!flowers.length) return fallbackFlower || null;
    let best = fallbackFlower || flowers[flowers.length - 1];
    let bestScore = -Infinity;
    for (const f of flowers) {
        // Ưu tiên hoa "thơm" (quà giá trị hơn) và hoa cao hơn (y nhỏ hơn), thêm random nhẹ để tự nhiên.
        const scentScore = Math.sqrt(Math.max(1, Number(f.scent) || 1)) * 4.2;
        const highScore = (100 - trongCayClamp(f.y, 0, 100)) * 2.1;
        const popularScore = Math.min(8, Number(f.visits) || 0) * 4;
        const score = scentScore + highScore + popularScore + Math.random() * 55;
        if (score > bestScore) { bestScore = score; best = f; }
    }
    best.visits = (Number(best.visits) || 0) + 1;
    return best;
}

// Chọn cây cho bướm: NGOÀI việc đậu cây đẹp nhất (cao/thơm), nếu vườn có cây YẾU (héo nặng)
// thì ~62% bướm bay tới CHỮA LÀNH cây yếu — chia theo mức héo nên nhiều bướm tự toả ra mỗi
// con một cây yếu khác nhau. Bướm "heal" sẽ hồi héo cho cây đó dần trong lúc đậu (xử lý ở tick).
function trongCayPickButterflyTarget(flower, preferHeal) {
    const WEAK = 38;   // ngưỡng "yếu" (khớp ngưỡng đổi màu héo của overlay)
    // Chỉ chữa cây CÒN ĐỦ CAO (>=10) — cây bị ăn trụi chỉ còn gốc thì bỏ qua, để bướm không sà
    // xuống sát đất đậu lên mẩu cây cụt (trông như "nằm dưới đất").
    const plants = (trongCayState.plants || []).filter(p => p && (Number(p.height) || 0) > 0);
    const weak = plants.filter(p => (Number(p.wilt) || 0) >= WEAK && (Number(p.height) || 0) >= 10);
    // Bướm tiến hóa (preferHeal) gần như LUÔN bay đi cứu cây héo; bướm quà thường ~62%.
    if (weak.length && Math.random() < (preferHeal ? 0.92 : 0.62)) {
        let best = weak[0], bestScore = -Infinity;
        for (const p of weak) {
            const score = (Number(p.wilt) || 0) * 1.5 + Math.random() * 55;   // càng héo càng ưu tiên + random để chia đều
            if (score > bestScore) { bestScore = score; best = p; }
        }
        best.visits = (Number(best.visits) || 0) + 1;
        return { id: best.id, plantId: best.id, x: best.x, y: 50, scent: best.scent, visits: best.visits, heal: true };
    }
    const t = trongCayPickButterflyFlower(null);
    if (t) t.heal = false;
    return t;
}
// Cây CAO NHẤT mà user này đã góp nuôi → dùng để tính độ rực rỡ + cờ TEAM cho con bướm của họ.
function trongCaySenderTree(uid) {
    const u = String(uid || '').toLowerCase();
    if (!u) return { height: 0, teamCount: 0 };
    let best = null;
    for (const p of (trongCayState.plants || [])) {
        const mine = String(p.uniqueId || '').toLowerCase() === u || (p.contribs && p.contribs[u]);
        if (!mine) continue;
        if (!best || (Number(p.height) || 0) > (Number(best.height) || 0)) best = p;
    }
    return best ? { height: Number(best.height) || 0, teamCount: Number(best.teamCount) || 0 } : { height: 0, teamCount: 0 };
}
function trongCayAddButterfly({ profilePicture, nickname, uniqueId }, flower, opts = {}) {
    const evolved = !!opts.evolved;
    const target = trongCayPickButterflyTarget(flower, evolved);   // bướm tiến hóa ưu tiên cứu cây héo
    if (!target) return;
    if (!profilePicture && !evolved) return;   // bướm quà cần avatar; bướm tiến hóa thì không bắt buộc
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    if (Array.isArray(cfg.butterflyGifts) && cfg.butterflyGifts.length) {
        // Reserved for panel-specific butterfly gifts later. Empty list means all accepted gifts.
    }
    // Đẳng cấp: cây của user càng CAO → bướm của user đó càng rực rỡ/phát sáng. Cây nhiều
    // người góp (>= teamMinContributors) → bướm lên màu TEAM (cầu vồng) + sáng hơn.
    const maxH = Number(cfg.maxHeight) || 100;
    const teamMin = Math.max(2, Number(cfg.teamMinContributors) || 3);
    const mine = trongCaySenderTree(uniqueId);
    const level = Math.round(trongCayClamp(mine.height / maxH, 0, 1) * 100) / 100;
    const butterfly = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        avatar: profilePicture || '',
        nickname: nickname || uniqueId || '',
        uniqueId: uniqueId || '',
        level,                                   // 0..1 theo chiều cao cây cao nhất của user
        team: mine.teamCount >= teamMin,         // cây của user là cây TEAM (nhiều người góp)
        teamCount: mine.teamCount,
        evolved,                                 // 🐛→🦋 bướm tiến hóa từ sâu → màu ngọc lục riêng
        // Bướm tiến hóa BAY LÊN TỪ kén dưới đất (opts.fromX/Y); bướm quà bay vào từ mép màn hình.
        fromX: opts.fromX != null ? opts.fromX : (Math.random() < 0.5 ? -10 : 110),
        fromY: opts.fromY != null ? opts.fromY : Math.round((18 + Math.random() * 52) * 10) / 10,
        midX: Math.round((20 + Math.random() * 60) * 10) / 10,
        midY: Math.round((8 + Math.random() * 26) * 10) / 10,
        toX: target.x,
        toY: target.y,
        flowerId: target.id,
        plantId: target.plantId || '',
        heal: evolved ? true : !!target.heal,    // 🦋 bướm chữa lành cây yếu (hồi héo trong lúc đậu)
        durationMs: 3200 + Math.round(Math.random() * 1800),
        wanderMs: 26000 + Math.round(Math.random() * 18000),
        ts: Date.now()
    };
    trongCayState.butterflies.push(butterfly);
    const maxButterflies = Math.max(5, Number(cfg.maxButterflies) || 28);
    while (trongCayState.butterflies.length > maxButterflies) trongCayState.butterflies.shift();
    io.emit('trongcay:butterfly', butterfly);
}

function trongCayApplyDelta({ growth = 0, water = 0, sun = 0, wilt = 0, cut = 0 } = {}) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const maxH = Math.max(20, Number(cfg.maxHeight) || 100);
    if (cut) growth = 0;
    trongCayState.height = trongCayClamp(trongCayState.height + (Number(growth) || 0), 0, maxH);
    trongCayState.water = trongCayClamp(trongCayState.water + (Number(water) || 0), 0, 100);
    trongCayState.sun = trongCayClamp(trongCayState.sun + (Number(sun) || 0), 0, 100);
    trongCayState.wilt = trongCayClamp(trongCayState.wilt + (Number(wilt) || 0), 0, 100);
    if (water > 0) trongCayState.wilt = trongCayClamp(trongCayState.wilt - Math.abs(water) * 0.35, 0, 100);
    if (growth > 0) trongCayState.wilt = trongCayClamp(trongCayState.wilt - growth * 0.08, 0, 100);
    // Tưới nước = chăm cả vườn → mọi cây hồi héo (panel: "Tưới lại sẽ hồi héo").
    if ((Number(water) || 0) > 0 && Array.isArray(trongCayState.plants)) {
        for (const p of trongCayState.plants) p.wilt = trongCayClamp((Number(p.wilt) || 0) - Math.abs(water) * 0.5, 0, 100);
    }
    trongCayState.updatedAt = Date.now();
}

// CHỌN mục tiêu cắt (chưa cắt). Trả { evt } để bắn cho kéo bay tới, và apply(amount) để
// thực sự cắt — gọi SAU khi kéo lia xong (snip), tránh cây tụt chiều cao trước khi kéo cắt.
function trongCayPickCut() {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const maxH = Number(cfg.maxHeight) || 100;
    // Độ cao cắt NGẪU NHIÊN rải rộng (0.30 → 0.94 thân cây) thay vì luôn sát gốc → mỗi lần
    // tặng quà kéo cắt ở một vị trí khác nhau cho sinh động (overlay đặt kéo theo cutT này).
    const cutT = Math.round((0.30 + Math.random() * 0.64) * 100) / 100;
    const plants = Array.isArray(trongCayState.plants) ? trongCayState.plants.filter(p => (Number(p.height) || 0) > 0) : [];
    if (plants.length) {
        const plant = plants[Math.floor(Math.random() * plants.length)];
        return {
            evt: { plantId: plant.id, x: plant.x, cutT },
            apply(amount) {
                plant.height = trongCayClamp((Number(plant.height) || 0) - Math.max(1, Number(amount) || 10), 0, maxH);
                plant.lastAt = Date.now();
                trongCayState.height = trongCayClamp(Math.max(0, ...trongCayState.plants.map(p => Number(p.height) || 0)), 0, maxH);
                trongCayState.wilt = trongCayClamp(trongCayState.wilt + 4, 0, 100);
                trongCayState.updatedAt = Date.now();
            }
        };
    }
    const count = Math.max(1, Math.min(12, parseInt(cfg.display?.stemCount, 10) || 7));
    const idx = Math.floor(Math.random() * count);
    return {
        evt: { stemIndex: idx, cutT },
        apply(amount) {
            const cur = Number(trongCayState.stemCuts?.[idx]) || 0;
            if (!trongCayState.stemCuts) trongCayState.stemCuts = {};
            trongCayState.stemCuts[idx] = trongCayClamp(cur + Math.max(1, Number(amount) || 10), 0, 92);
            trongCayState.wilt = trongCayClamp(trongCayState.wilt + 4, 0, 100);
            trongCayState.updatedAt = Date.now();
        }
    };
}
// Kéo lia vài vòng (overlay) rồi mới cắt → áp tác dụng cắt sau cutSnipDelaySec.
function trongCayCutDelayed(target, amount) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const snipMs = Math.max(0, Number(cfg.cutSnipDelaySec) || 1.8) * 1000;
    const apply = () => { try { target.apply(amount); broadcastTrongCayState({ immediate: true }); } catch (e) {} };
    if (snipMs <= 0) apply(); else setTimeout(apply, snipMs);
}

// ===== Top người chăm cây (leaderboard) =====
function trongCayAddContrib({ uniqueId, nickname, profilePicture, coinValue, repeatCount }) {
    const uid = String(uniqueId || nickname || '').toLowerCase();
    if (!uid) return;
    if (!trongCayState.contributors) trongCayState.contributors = {};
    const c = trongCayState.contributors[uid] || { uniqueId, nickname: nickname || '', avatar: profilePicture || '', score: 0, drops: 0, lastAt: 0 };
    if (nickname) c.nickname = nickname;
    if (profilePicture) c.avatar = profilePicture;
    c.score += Math.max(1, Number(coinValue) || 0) * Math.max(1, Number(repeatCount) || 1);
    c.drops += Math.max(1, Number(repeatCount) || 1);
    c.lastAt = Date.now();
    trongCayState.contributors[uid] = c;
}
function trongCayTopContributors(n = 3) {
    const arr = Object.entries(trongCayState.contributors || {});
    arr.sort((a, b) => (b[1].score - a[1].score) || (b[1].lastAt - a[1].lastAt));
    return arr.slice(0, n).map(([uid, c]) => {
        const row = { uid, nickname: c.nickname || 'Ẩn danh', avatar: c.avatar || '', score: Math.round(c.score), drops: c.drops || 0 };
        // 🐾 Gắn thông tin cây OWNED (nếu có) → overlay vẽ thú cạnh cây / chim bay theo độ cao.
        const pet = trongCayPetInfoFor(uid);
        if (pet) { row.treeIcon = pet.treeIcon; row.treeName = pet.treeName; row.treeX = pet.treeX; row.treeHeight = pet.treeHeight; row.maxH = pet.maxH; row.birdIcon = pet.birdIcon; }
        return row;
    });
}
// Cộng điểm cho NGƯỜI ĐÃ TẶNG NUÔI cây này (chủ cây) khi ong hái được trái của cây đó.
function trongCayAwardTreeOwner(plant, pts) {
    const uid = String(plant?.uniqueId || plant?.nickname || '').toLowerCase();
    if (!uid) return null;
    if (!trongCayState.contributors) trongCayState.contributors = {};
    const c = trongCayState.contributors[uid] || { uniqueId: plant.uniqueId || '', nickname: plant.nickname || '', avatar: '', score: 0, drops: 0, lastAt: 0 };
    if (plant.nickname) c.nickname = plant.nickname;
    c.score += Math.max(0, Number(pts) || 0);
    c.lastAt = Date.now();
    trongCayState.contributors[uid] = c;
    return c;
}

// ===== 🐝 Ong thợ đi hái trái (theo quà tặng ong) =====
// Ong bay tới cây ĐÃ CHÍN còn trái, hái trái về → cộng điểm cho chủ cây (đẩy Top chăm cây).
// Hái xong cây vẫn đứng đó; được tặng tiếp sẽ ra trái lại → vòng lặp liên tục.
function trongCayBeeHarvest(plantId, count, pointsPerFruit) {
    const plant = (trongCayState.plants || []).find(p => p.id === plantId);
    if (!plant) return;
    let picked = 0;
    for (let i = 0; i < Math.max(1, Number(count) || 1); i++) {
        if ((Number(plant.fruits) || 0) <= 0) break;
        plant.fruits = Math.max(0, (Number(plant.fruits) || 0) - 1);
        picked++;
    }
    if (!picked) return;
    const pts = picked * Math.max(1, Number(pointsPerFruit) || 50);
    const owner = trongCayAwardTreeOwner(plant, pts);
    trongCayState.updatedAt = Date.now();
    io.emit('trongcay:beeharvest', {
        plantId: plant.id, x: plant.x, picked, points: pts,
        owner: (owner && owner.nickname) || plant.nickname || '', fruits: plant.fruits, ts: Date.now()
    });
    broadcastTrongCayState({ immediate: true });
}
// Ong nhặt 1 trái DƯỚI ĐẤT (trái đã rụng khi cây héo) → vẫn cộng điểm cho chủ cây ban đầu.
function trongCayBeeHarvestGround(gid, pointsPerFruit) {
    if (!Array.isArray(trongCayState.groundFruits)) return;
    const idx = trongCayState.groundFruits.findIndex(g => g.id === gid);
    if (idx < 0) return;                          // ong khác đã nhặt trước → bỏ qua
    const gf = trongCayState.groundFruits.splice(idx, 1)[0];
    const pts = Math.max(1, Number(pointsPerFruit) || 50);
    const owner = trongCayAwardTreeOwner({ uniqueId: gf.uniqueId, nickname: gf.nickname }, pts);
    trongCayState.updatedAt = Date.now();
    io.emit('trongcay:beeharvest', {
        gid: gf.id, x: gf.x, ground: true, picked: 1, points: pts,
        owner: (owner && owner.nickname) || gf.nickname || '', ts: Date.now()
    });
    broadcastTrongCayState({ immediate: true });
}
// Cây héo nặng → 1 trái chín rụng xuống đất (gắn chủ cây để sau ong nhặt vẫn cộng đúng người).
function trongCayDropFruit(plant) {
    if (!plant || (Number(plant.fruits) || 0) <= 0) return;
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    plant.fruits = Math.max(0, (Number(plant.fruits) || 0) - 1);
    if (!Array.isArray(trongCayState.groundFruits)) trongCayState.groundFruits = [];
    const now = Date.now();
    const gf = {
        id: 'gf-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
        x: trongCayClamp((Number(plant.x) || 50) + (Math.random() * 10 - 5), 2, 98),
        uniqueId: plant.uniqueId || '',
        nickname: plant.nickname || '',
        ts: now
    };
    trongCayState.groundFruits.push(gf);
    const cap = Math.max(4, Number(cfg.groundFruitMax) || 40);
    while (trongCayState.groundFruits.length > cap) trongCayState.groundFruits.shift();
    trongCayState.updatedAt = now;
    io.emit('trongcay:fruitdrop', { plantId: plant.id, x: gf.x, gid: gf.id, ts: now });
    broadcastTrongCayState();
}
// Rải đàn ong ra NHIỀU KHU VỰC có trái (cây chín + trái rụng dưới đất) thay vì chụm 1 nơi.
// Mỗi "khu vực" = 1 cây chín hoặc 1 trái dưới đất; xếp theo x để trải đều bề ngang vườn,
// rồi chia ong vòng tròn qua từng khu (1 ong/khu mỗi vòng) → ong toả khắp vườn.
function trongCayAssignBeeTargets(nBees) {
    const areas = (trongCayState.plants || [])
        .filter(p => p && p.ripe && (Number(p.fruits) || 0) > 0)
        .map(p => ({ kind: 'tree', plantId: p.id, x: Number(p.x) || 50, avail: Number(p.fruits) || 0 }))
        .concat((trongCayState.groundFruits || [])
            .map(g => ({ kind: 'ground', gid: g.id, gx: Number(g.x) || 50, x: Number(g.x) || 50, avail: 1 })));
    areas.sort((a, b) => a.x - b.x);
    const out = [];
    let i = 0, guard = 0;
    while (out.length < nBees && guard++ < nBees * 4) {
        const live = areas.filter(a => a.avail > 0);
        if (!live.length) break;
        const a = live[i % live.length];
        out.push(a.kind === 'tree' ? { kind: 'tree', plantId: a.plantId } : { kind: 'ground', gid: a.gid, gx: a.gx });
        a.avail--; i++;
    }
    while (out.length < nBees) out.push(null);   // dư ong mà hết trái → bay cho vui, không hái
    return out;
}
function trongCaySpawnBee({ profilePicture, nickname, uniqueId, harvestPerBee, delayIdx, target: assigned } = {}) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const ground = Array.isArray(trongCayState.groundFruits) ? trongCayState.groundFruits : [];
    // Mục tiêu được swarm chỉ định (rải khắp khu); nếu gọi lẻ thì tự chọn như cũ.
    let target = (assigned !== undefined) ? assigned : null;
    if (assigned === undefined) {
        const ripe = (trongCayState.plants || []).filter(p => p && p.ripe && (Number(p.fruits) || 0) > 0);
        if (ground.length && (!ripe.length || Math.random() < 0.55)) {
            const gf = ground[Math.floor(Math.random() * ground.length)];
            target = { kind: 'ground', gid: gf.id, gx: gf.x };
        } else if (ripe.length) {
            ripe.sort((a, b) => (Number(b.fruits) || 0) - (Number(a.fruits) || 0));
            const plant = ripe[Math.floor(Math.random() * Math.min(ripe.length, 3))];
            target = { kind: 'tree', plantId: plant.id };
        }
    }
    if (target && target.kind === 'ground' && target.gx == null) {
        const gf = ground.find(g => g.id === target.gid);
        target.gx = gf ? gf.x : 50;
    }
    const now = Date.now();
    const durationMs = 2400 + Math.round(Math.random() * 1000) + (Number(delayIdx) || 0) * 360;
    io.emit('trongcay:bee', {
        id: now.toString(36) + Math.random().toString(36).slice(2, 7),
        avatar: profilePicture || '',
        nickname: nickname || uniqueId || '',
        uniqueId: uniqueId || '',
        targetKind: target ? target.kind : '',
        plantId: target && target.kind === 'tree' ? target.plantId : '',
        gid: target && target.kind === 'ground' ? target.gid : '',
        gx: target && target.kind === 'ground' ? target.gx : null,
        fromX: Math.random() < 0.5 ? -10 : 110,
        fromY: Math.round((14 + Math.random() * 40) * 10) / 10,
        midX: Math.round((20 + Math.random() * 60) * 10) / 10,
        midY: Math.round((6 + Math.random() * 22) * 10) / 10,
        durationMs,
        ts: now
    });
    if (!target) return false;
    const per = Math.max(1, Number(harvestPerBee) || Number(cfg.beeHarvestPerTrip) || 1);
    const points = Math.max(1, Number(cfg.beePointsPerFruit) || 50);
    // Hái khi ong đã bay tới nơi (≈ thời gian bay + 1 nhịp đậu).
    if (target.kind === 'ground') {
        setTimeout(() => { try { trongCayBeeHarvestGround(target.gid, points); } catch (e) {} }, durationMs + 600);
    } else {
        setTimeout(() => { try { trongCayBeeHarvest(target.plantId, per, points); } catch (e) {} }, durationMs + 600);
    }
    return true;
}
function trongCaySpawnBeeSwarm({ profilePicture, nickname, uniqueId, beeGift, repeat }) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const per = Math.max(1, Number(beeGift?.harvestPerBee) || Number(cfg.beeHarvestPerTrip) || 1);
    const nBees = Math.min(
        Math.max(1, Number(cfg.maxBees) || 30),
        Math.max(1, Math.round((Number(beeGift?.bees) || Number(cfg.beesPerGift) || 3) * Math.max(1, Number(repeat) || 1)))
    );
    const targets = trongCayAssignBeeTargets(nBees);   // chia ong ra khắp khu vực có trái
    for (let i = 0; i < nBees; i++) {
        trongCaySpawnBee({ profilePicture, nickname, uniqueId, harvestPerBee: per, delayIdx: i, target: targets[i] });
    }
    return nBees;
}

// ===== 🐛 Sâu xanh ăn lá + 🧴 Thuốc trừ sâu =====
function trongCayPtInZone(x, zones) {
    const now = Date.now();
    return (zones || []).some(z => z.until > now && x >= z.x0 && x <= z.x1);
}
function trongCaySpawnCaterpillar({ profilePicture, nickname, uniqueId, delayIdx } = {}) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    if (!Array.isArray(trongCayState.caterpillars)) trongCayState.caterpillars = [];
    if (trongCayState.caterpillars.length >= (Number(cfg.maxCaterpillars) || 20)) return false;
    const plants = (trongCayState.plants || []).filter(p => (Number(p.height) || 0) > 4);
    const ground = (trongCayState.groundFruits || []);
    // Mục tiêu: ưu tiên cây có lá/trái (ăn lá, ăn icon quà, ăn trái); nếu không thì xuống đất ăn trái rụng.
    let plantId = '', onGround = false, x = 50;
    if (plants.length && (!ground.length || Math.random() < 0.7)) {
        const p = plants[Math.floor(Math.random() * plants.length)];
        plantId = p.id; x = Number(p.x) || 50;
    } else if (ground.length) {
        const gf = ground[Math.floor(Math.random() * ground.length)];
        onGround = true; x = Number(gf.x) || 50;
    } else if (plants.length) {
        const p = plants[Math.floor(Math.random() * plants.length)];
        plantId = p.id; x = Number(p.x) || 50;
    } else {
        return false; // vườn trống → không có gì để ăn
    }
    // Không thả vào vùng đang được bảo vệ (vừa xịt thuốc).
    if (trongCayPtInZone(x, trongCayState.protectedZones)) return false;
    const now = Date.now();
    const born = now + (Number(delayIdx) || 0) * 250;
    const startDelayMs = Math.max(0, Number(cfg.caterpillarStartDelaySec) || 0) * 1000;
    trongCayState.caterpillars.push({
        id: 'cat-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
        plantId, onGround, x: trongCayClamp(x, 2, 98),
        avatar: profilePicture || '',          // đầu sâu = avatar người tặng quà sâu
        nickname: nickname || uniqueId || '',
        uniqueId: uniqueId || '',
        bornAt: born,
        eatFrom: born + startDelayMs,           // CHỜ rồi mới bắt đầu phá (cho thời gian xịt thuốc)
        lastBiteAt: born,
        dying: false
    });
    trongCayState.updatedAt = now;
    return true;
}
function trongCaySpawnCaterpillarSwarm({ profilePicture, nickname, uniqueId, caterpillarGift, repeat }) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const n = Math.min(
        Math.max(1, Number(cfg.maxCaterpillars) || 20),
        Math.max(1, Math.round((Number(caterpillarGift?.count) || Number(cfg.caterpillarsPerGift) || 2) * Math.max(1, Number(repeat) || 1)))
    );
    let spawned = 0;
    for (let i = 0; i < n; i++) if (trongCaySpawnCaterpillar({ profilePicture, nickname, uniqueId, delayIdx: i })) spawned++;
    if (spawned) broadcastTrongCayState({ immediate: true });
    return spawned;
}
// Một con sâu cắn 1 phát: ăn lá/trái trên cây HOẶC ăn 1 trái rụng dưới đất.
function trongCayCaterpillarBite(cat) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const bite = Math.max(1, Number(cfg.caterpillarBite) || 6);
    if (cat.onGround) {
        const gfs = trongCayState.groundFruits || [];
        // ăn trái rụng gần nó nhất
        let idx = -1, best = 999;
        for (let i = 0; i < gfs.length; i++) { const dd = Math.abs((Number(gfs[i].x) || 50) - cat.x); if (dd < best) { best = dd; idx = i; } }
        if (idx >= 0 && best < 18) { trongCayState.groundFruits.splice(idx, 1); io.emit('trongcay:catbite', { x: cat.x, ground: true, ts: Date.now() }); return true; }
        return false;
    }
    const plant = (trongCayState.plants || []).find(p => p.id === cat.plantId);
    if (!plant) return false;
    if ((Number(plant.height) || 0) <= 1 && (Number(plant.fruits) || 0) <= 0) return false; // cây trụi rồi → đổi mục tiêu
    // ăn trái trên cây trước (icon/quả), rồi ăn lá (giảm chiều cao) + làm cây yếu (héo).
    if ((Number(plant.fruits) || 0) > 0 && Math.random() < 0.5) plant.fruits = Math.max(0, plant.fruits - 1);
    plant.height = trongCayClamp((Number(plant.height) || 0) - bite, 0, Number(cfg.maxHeight) || 100);
    plant.wilt = trongCayClamp((Number(plant.wilt) || 0) + 5, 0, 100);
    if (plant.height <= 2) plant.ripe = false; // ăn trụi → không còn chín
    trongCayState.height = trongCayClamp(Math.max(0, ...(trongCayState.plants || []).map(p => Number(p.height) || 0)), 0, Number(cfg.maxHeight) || 100);
    io.emit('trongcay:catbite', { x: cat.x, plantId: plant.id, ts: Date.now() });
    return true;
}
// 🧴 Xịt thuốc: chọn chỗ NHIỀU SÂU nhất (ưu tiên), bảo vệ vùng đó, sâu trong vùng rụng thành xác.
function trongCaySpray({ sprayGift } = {}) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const cats = trongCayState.caterpillars || [];
    const radius = Math.max(8, Number(cfg.sprayRadiusPercent) || 28);
    // tâm xịt = nơi có nhiều sâu nhất trong bán kính; nếu không có sâu thì giữa vườn.
    let centerX = 50;
    if (cats.length) {
        let bestX = cats[0].x, bestCount = -1;
        for (const c of cats) {
            const cnt = cats.filter(o => Math.abs(o.x - c.x) <= radius).length;
            if (cnt > bestCount) { bestCount = cnt; bestX = c.x; }
        }
        centerX = bestX;
    }
    // Con sâu đại diện (gần tâm xịt nhất) → overlay chĩa vòi bình xịt SÁT vào sâu (cây/đất).
    let aim = null;
    if (cats.length) {
        let rep = cats[0], rd = 1e9;
        for (const c of cats) { const dd = Math.abs(c.x - centerX); if (dd < rd) { rd = dd; rep = c; } }
        aim = { x: rep.x, plantId: rep.onGround ? '' : (rep.plantId || ''), ground: !!rep.onGround };
    }
    const now = Date.now();
    const protectMs = Math.max(3, Number(sprayGift?.protectSeconds) || Number(cfg.sprayProtectSeconds) || 30) * 1000;
    if (!Array.isArray(trongCayState.protectedZones)) trongCayState.protectedZones = [];
    trongCayState.protectedZones.push({ x0: trongCayClamp(centerX - radius, 0, 100), x1: trongCayClamp(centerX + radius, 0, 100), until: now + protectMs });
    trongCayState.protectedZones = trongCayState.protectedZones.filter(z => z.until > now).slice(-6);
    // sâu trong vùng → rụng thành XÁC dồn dưới đất (pro: cảm giác thật)
    const killed = [];
    trongCayState.caterpillars = cats.filter(c => {
        if (Math.abs(c.x - centerX) <= radius) { killed.push(c); return false; }
        return true;
    });
    if (!Array.isArray(trongCayState.corpses)) trongCayState.corpses = [];
    for (const c of killed) trongCayState.corpses.push({ id: 'corpse-' + c.id, x: c.x, ts: now });
    const capC = Math.max(6, Number(cfg.maxCaterpillarCorpses) || 36);
    while (trongCayState.corpses.length > capC) trongCayState.corpses.shift();
    trongCayState.updatedAt = now;
    io.emit('trongcay:spray', { x: centerX, radius, killed: killed.length, until: now + protectMs, aim, ts: now });
    broadcastTrongCayState({ immediate: true });
    return { centerX, killed: killed.length };
}

// ===== 🐛→🦋 Sâu sống sót hóa nhộng rồi tiến hóa thành bướm cứu cây =====
// Sâu KHÔNG bị xịt thuốc, ăn hết cây / hết đời → rơi xuống đất nằm KÉN (pupa). Sau
// caterpillarPupaSeconds giây → nở thành BƯỚM TIẾN HÓA (màu ngọc lục dễ nhận biết) bay
// lên tiếp tục vòng đời: đi cứu (hồi héo) cây đang yếu. Mang theo avatar người tặng sâu.
function trongCayPupate(c, now, cfg) {
    cfg = cfg || appConfig.games.trongcay || makeDefaultTrongCayConfig();
    if (cfg.caterpillarEvolves === false) return;   // tắt tiến hóa → sâu chỉ bò đi như cũ
    if (!Array.isArray(trongCayState.pupae)) trongCayState.pupae = [];
    const pupaMs = Math.max(1, Number(cfg.caterpillarPupaSeconds) || 8) * 1000;
    trongCayState.pupae.push({
        id: 'pupa-' + (c.id || now.toString(36)) + Math.random().toString(36).slice(2, 5),
        x: trongCayClamp(Number(c.x) || 50, 2, 98),
        evolveAt: now + pupaMs,
        bornAt: now,
        avatar: c.avatar || '',
        nickname: c.nickname || '',
        uniqueId: c.uniqueId || ''
    });
    const cap = Math.max(4, Number(cfg.maxPupae) || 16);
    while (trongCayState.pupae.length > cap) trongCayState.pupae.shift();
    io.emit('trongcay:pupate', { x: c.x, plantId: c.plantId || '', onGround: !!c.onGround, ts: now });
}
function trongCayEvolvePupa(pu, now) {
    io.emit('trongcay:evolve', { x: pu.x, ts: now });   // nở kén: lóe sáng + 🐛→🦋
    // Bướm tiến hóa BAY LÊN TỪ kén (fromX = vị trí kén, fromY thấp sát đất), ép heal, màu riêng.
    trongCayAddButterfly(
        { profilePicture: pu.avatar || '', nickname: pu.nickname || '', uniqueId: pu.uniqueId || '' },
        null,
        { evolved: true, fromX: trongCayClamp(Number(pu.x) || 50, 2, 98), fromY: 78 }
    );
}

// ===== Mốc chiều cao =====
// Gọi sau mỗi lần cây CAO LÊN. Bắn event mốc 25/50/75/100% (1 lần mỗi mốc).
// "Kết trái" khi cây chạm 100% xử lý per-plant trong trongCayGrowGiftPlant (event
// trongcay:fruit) — vườn KHÔNG bao giờ bị thu hoạch/xoá sạch nữa.
function trongCayPostGrowChecks() {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const d = cfg.display || {};
    const maxH = Math.max(20, Number(cfg.maxHeight) || 100);
    const pct = trongCayClamp(trongCayState.height / maxH * 100, 0, 100);
    [25, 50, 75, 100].forEach(m => {
        if (pct >= m && (Number(trongCayState.milestoneReached) || 0) < m) {
            trongCayState.milestoneReached = m;
            if (d.showMilestones !== false) io.emit('trongcay:milestone', { percent: m, ts: Date.now() });
        }
    });
}

// Áp tác dụng thời tiết (tưới/nắng) SAU khi mưa/nắng "rơi xuống" — đúng nhân quả: hiệu ứng
// hình hiện trước, trạng thái cây đổi sau. `delta` có thể là object hoặc hàm trả object (để
// tính giá trị phụ thuộc trạng thái tại đúng thời điểm áp).
function trongCayApplyWeatherDelayed(delta) {
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const delayMs = Math.max(0, Number(cfg.weatherEffectDelaySec) || 0) * 1000;
    const apply = () => {
        try { trongCayApplyDelta(typeof delta === 'function' ? delta() : delta); broadcastTrongCayState({ immediate: true }); } catch (e) {}
    };
    if (delayMs <= 0) apply(); else setTimeout(apply, delayMs);
}

function handleTrongCayGift({ uniqueId, nickname, profilePicture, giftId, giftName, giftImage, coinValue, repeatCount, source }) {
    if (appConfig.games?.trongcay?.enabled === false) return;
    // 🐉 Vườn đang bị rồng thiêu → bỏ qua mọi quà tới (cây sắp bị xóa, tránh mọc vô hình rồi mất).
    if (Date.now() < trongCayBurnUntil) return;
    // Quà tới là tự bật phiên (giống Hũ Thủy Tinh "bấm quà là tự hiện") thay vì bỏ qua
    // khi chưa bấm BẮT ĐẦU. Muốn tắt hẳn thì bỏ tích "Bật game" (enabled=false).
    trongCayEnsureSessionActive();
    const cfg = appConfig.games.trongcay || makeDefaultTrongCayConfig();
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const isTestGift = source === 'test';
    const gid = String(giftId || '');
    // 🐉 Quà rồng lửa → tấn công thiêu rụi vườn ngay, KHÔNG chạy các hành động khác.
    const dragonHit = trongCayPickGift(cfg.dragonGifts, gid);
    if (dragonHit) {
        trongCayAddContrib({ uniqueId, nickname, profilePicture, coinValue, repeatCount: repeat });
        trongCayState.lastGiftAt = Date.now();
        trongCayDragonAttack({ nickname, uniqueId, profilePicture, burnSeconds: dragonHit.burnSeconds });
        return;
    }
    // 🌱 Quà KÍCH HOẠT = 1 LOẠI CÂY. Toggle theo cây-loại-này của viewer:
    //    • chưa có → TRỒNG cây loại đó (ảnh quà = cây) + chăm.
    //    • đang hoạt động → HỦY kích hoạt (tạm khóa, không cao thêm).
    //    • đang khóa → KÍCH HOẠT LẠI (mở khóa) + chăm tiếp.
    //    1 viewer có nhiều cây (mỗi quà kích hoạt 1 cây). Quà thường làm cao cây active gần nhất.
    const chooseOn = cfg.chooseTreeEnabled === true;
    if (chooseOn) {
        const activateHit = trongCayPickGift(cfg.activateGifts, gid);
        if (activateHit) {
            const tree = trongCayFindOwnedTree(uniqueId, gid);
            const avatar = profilePicture || (tree && tree.ownerAvatar) || trongCayContribAvatar(uniqueId);
            if (tree && !tree.growthLocked) {
                // đang hoạt động → HỦY kích hoạt (tạm khóa). Tặng lại lần nữa sẽ mở khóa.
                tree.growthLocked = true;
                tree.lastAt = Date.now();
                io.emit('trongcay:treelock', { uniqueId, plantId: tree.id, locked: true, nickname, avatar, ts: Date.now() });
            } else {
                // chưa có cây loại này, hoặc đang khóa → KÍCH HOẠT: trồng/mở khóa + chăm (cao theo Xu).
                const grow = trongCayCoinGrowth(cfg, coinValue, repeat);
                const plant = trongCayGrowGiftPlant({
                    giftId: gid, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount: repeat, growth: grow,
                    owned: true, ownerUid: uniqueId, ownerAvatar: avatar, lockImage: !!tree, targetPlant: tree || undefined
                });
                if (plant) {
                    plant.growthLocked = false;
                    plant.activatedAt = Date.now();        // → cây active gần nhất (đích cho quà thường)
                    trongCayApplyDelta({ water: -0.6 * repeat });
                    io.emit('trongcay:treelock', { uniqueId, plantId: plant.id, locked: false, nickname, avatar, ts: Date.now() });
                    io.emit('trongcay:grow', { nickname, uniqueId, plantId: plant.id, giftImage: plant.giftImage, ts: Date.now() });
                }
            }
            trongCayAddContrib({ uniqueId, nickname, profilePicture, coinValue, repeatCount: repeat });
            trongCayPostGrowChecks();
            trongCayState.lastGiftAt = Date.now();
            broadcastTrongCayState({ immediate: true });
            return;
        }
    }
    let accepted = false;
    let flower = null;
    const cutHit = trongCayPickGift(cfg.cutGifts, gid);
    const waterHit = trongCayPickGift(cfg.waterGifts, gid);
    const sunHit = trongCayPickGift(cfg.sunGifts, gid);
    const butterflyHit = trongCayPickGift(cfg.butterflyGifts, gid);
    const beeHit = trongCayPickGift(cfg.beeGifts, gid);
    const caterpillarHit = trongCayPickGift(cfg.caterpillarGifts, gid);
    const sprayHit = trongCayPickGift(cfg.sprayGifts, gid);
    const birdHit = trongCayPickGift(cfg.birdGifts, gid);   // 🦅 quà bay → đánh dấu cây active của viewer là "chim"
    if (cutHit) {
        // Kéo bay tới + lia vài vòng (overlay) → cắt áp sau (trongCayCutDelayed) cho khớp hình.
        const target = trongCayPickCut();
        io.emit('trongcay:cut', { nickname, uniqueId, giftImage, ...target.evt, ts: Date.now() });
        trongCayCutDelayed(target, Math.max(1, Number(cutHit.cut) || 10) * repeat);
        accepted = true;
    } else if (waterHit) {
        // Quà tưới luôn tưới ngay (đã bỏ ràng buộc "phải comment trước" — comment giờ tự tưới riêng).
        // Mưa RƠI trước (event), cây tươi/đỡ héo áp SAU khi mưa rơi xuống (đúng nhân quả).
        io.emit('trongcay:water', { nickname, uniqueId, ts: Date.now() });
        trongCayApplyWeatherDelayed({ water: Math.max(1, Number(waterHit.water) || 18) * repeat, growth: Math.max(0, Number(waterHit.growth) || 2) * repeat });
        accepted = true;
    } else if (sunHit) {
        const sun = Math.max(1, Number(sunHit.sun) || 20) * repeat;
        const sunWilt = Math.max(3, Number(sunHit.wilt) || 10) * repeat;
        io.emit('trongcay:sun', { nickname, uniqueId, ts: Date.now() });
        // wilt do nắng gắt tính tại lúc ÁP (sau khi nắng "rọi xuống") cho đúng trạng thái.
        trongCayApplyWeatherDelayed(() => ({ sun, wilt: (trongCayState.sun + sun > 72 ? sunWilt : 0) }));
        accepted = true;
    } else if (chooseOn) {
        // 🌱 Quà THƯỜNG (không hiệu ứng) → làm cao CÂY ACTIVE gần nhất của viewer (đã kích hoạt, chưa khóa).
        //    Quà có hiệu ứng (bướm/ong/sâu/thuốc) → chỉ chạy hiệu ứng ở block dưới, KHÔNG tăng trưởng.
        const isOtherEffect = !!(butterflyHit || beeHit || caterpillarHit || sprayHit);
        if (!isOtherEffect) {
            const tree = trongCayActiveTreeOf(uniqueId);
            if (tree) {
                // 🦅 Quà bay → cây này thành "chim": ảnh chim = icon quà bay. Nuôi cây cao đủ ngưỡng → chim bay ra.
                if (birdHit) { tree.birdGiftId = gid; tree.birdGiftName = giftName || tree.birdGiftName || ''; if (giftImage) tree.birdGiftImage = giftImage; }
                const grow = trongCayCoinGrowth(cfg, coinValue, repeat);
                const avatar = profilePicture || tree.ownerAvatar || trongCayContribAvatar(uniqueId);
                const plant = trongCayGrowGiftPlant({
                    giftId: tree.giftId, giftName: tree.giftName, giftImage: tree.giftImage, nickname, uniqueId,
                    coinValue, repeatCount: repeat, growth: grow, owned: true, ownerUid: uniqueId, ownerAvatar: avatar,
                    lockImage: true, targetPlant: tree   // giữ loài cây, chỉ làm cao cây active
                });
                if (plant) {
                    trongCayApplyDelta({ water: -0.6 * repeat });
                    io.emit('trongcay:grow', { nickname, uniqueId, plantId: plant.id, giftImage: plant.giftImage, ts: Date.now() });
                    accepted = true;
                }
            } else if (trongCayHasOwnedTree(uniqueId)) {
                // Có cây nhưng TẤT CẢ đang khóa → quà không làm gì (vẫn tính Top), không tạo cây lạ.
                accepted = true;
            }
            // Viewer chưa từng kích hoạt cây nào → vẫn mọc cây như cũ (gift-keyed), giữ hành vi hiện tại.
            if (!accepted) {
                const growth = trongCayComputeGrowth(cfg, { giftId: gid, coinValue, repeatCount: repeat });
                if (growth > 0) {
                    const plant = trongCayGrowGiftPlant({ giftId: gid, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount: repeat, growth });
                    if (plant) {
                        trongCayApplyDelta({ water: -0.6 * repeat });
                        io.emit('trongcay:grow', { nickname, uniqueId, plantId: plant.id, giftImage, ts: Date.now() });
                        accepted = true;
                    }
                }
            }
        }
    } else {
        const growth = trongCayComputeGrowth(cfg, { giftId: gid, coinValue, repeatCount: repeat });
        if (growth > 0) {
            const plant = trongCayGrowGiftPlant({ giftId: gid, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount: repeat, growth });
            if (plant) {
                trongCayApplyDelta({ water: -0.6 * repeat });
                io.emit('trongcay:grow', { nickname, uniqueId, plantId: plant.id, giftImage, ts: Date.now() });
                accepted = true;
            }
        }
    }
    if (butterflyHit) {
        // Mỗi LẦN tặng quà bướm = 1 con bay lên (combo xN = N con). Trước đây chặn theo
        // butterflyUsers (1 con/người đang sống) → "tặng 10 lần chỉ ra 1 con"; bỏ chặn đó.
        // Tổng đàn vẫn được giới hạn bởi maxButterflies trong trongCayAddButterfly.
        const n = Math.max(1, Math.min(Number(repeat) || 1, 12));
        for (let k = 0; k < n; k++) trongCayAddButterfly({ profilePicture, nickname, uniqueId }, null);
        accepted = true;
    }
    if (beeHit) {
        // Quà ong → thả đàn ong thợ đi hái trái cây chín. Hái được trái sẽ cộng điểm cho
        // CHỦ cây đó (xử lý trong trongCayBeeHarvest). Người tặng ong cũng được tính chăm cây.
        trongCaySpawnBeeSwarm({ profilePicture, nickname, uniqueId, beeGift: beeHit, repeat });
        accepted = true;
    }
    if (caterpillarHit) {
        // 🐛 Quà sâu → thả sâu xanh phá vườn (ăn lá/trái trên cây hoặc trái rụng dưới đất).
        //    Đầu mỗi con sâu = avatar người tặng.
        trongCaySpawnCaterpillarSwarm({ profilePicture, nickname, uniqueId, caterpillarGift: caterpillarHit, repeat });
        accepted = true;
    }
    if (sprayHit) {
        // 🧴 Quà thuốc trừ sâu → xịt chỗ nhiều sâu, bảo vệ vùng đó, sâu rụng thành xác.
        trongCaySpray({ sprayGift: sprayHit });
        accepted = true;
    }
    if (!accepted && isTestGift) {
        const forcedGrowth = Math.max(2, Math.sqrt(Math.max(1, Number(coinValue) || 20)) * (Number(cfg.perCoinGrowth) || 0.25));
        const wiltBlockAt = Number(cfg.wiltGrowthBlockAt) || 62;
        if (trongCayState.wilt >= wiltBlockAt) trongCayState.wilt = Math.max(0, wiltBlockAt - 8);
        const plant = trongCayGrowGiftPlant({ giftId: gid, giftName, giftImage, nickname, uniqueId, coinValue, repeatCount: repeat, growth: forcedGrowth });
        if (plant) {
            trongCayApplyDelta({ water: -0.6 * repeat });
            io.emit('trongcay:grow', { nickname, uniqueId, plantId: plant.id, giftImage, ts: Date.now() });
            accepted = true;
        }
    }
    if (!accepted) return;
    trongCayAddContrib({ uniqueId, nickname, profilePicture, coinValue, repeatCount: repeat });
    trongCayPostGrowChecks();
    trongCayState.lastGiftAt = Date.now();
    broadcastTrongCayState({ immediate: true });
}

function trongCayTick() {
    const now = Date.now();
    const dt = (now - trongCayLastTickAt) / 1000;
    trongCayLastTickAt = now;
    const cfg = appConfig.games?.trongcay;
    if (!cfg || cfg.enabled === false || cfg.sessionActive === false) return;
    if (now < trongCayBurnUntil) return;   // 🐉 đóng băng vườn trong lúc rồng thiêu (overlay vẽ cháy đen)
    const before = `${trongCayState.height.toFixed(2)}:${trongCayState.water.toFixed(2)}:${trongCayState.sun.toFixed(2)}:${trongCayState.wilt.toFixed(2)}:${(trongCayState.plants || []).map(p => (Number(p.height)||0).toFixed(2) + '/' + (Number(p.wilt)||0).toFixed(1)).join('|')}`;
    const waterLoss = (Number(cfg.waterLossPerSecond) || 0) * dt;
    const sunTarget = 32;
    const sunReturn = (Number(cfg.sunReturnPerSecond) || 0) * dt;
    trongCayState.water = trongCayClamp(trongCayState.water - waterLoss, 0, 100);
    if (trongCayState.sun > sunTarget) trongCayState.sun = Math.max(sunTarget, trongCayState.sun - sunReturn);
    else if (trongCayState.sun < sunTarget) trongCayState.sun = Math.min(sunTarget, trongCayState.sun + sunReturn * 0.5);
    const bad = trongCayState.water < 18 || trongCayState.sun > 76;
    const recover = trongCayState.water > 35 && trongCayState.sun < 70;
    if (bad) trongCayState.wilt = trongCayClamp(trongCayState.wilt + (Number(cfg.wiltGainPerSecond) || 0) * dt, 0, 100);
    else if (recover) trongCayState.wilt = trongCayClamp(trongCayState.wilt - (Number(cfg.wiltRecoverPerSecond) || 0) * dt, 0, 100);
    if (Array.isArray(trongCayState.plants)) {
        // Vườn tích lũy lâu dài: cây KHÔNG teo nhỏ rồi biến mất theo thời gian nữa.
        // Thiếu nước/nắng gắt chỉ làm cây ĐỔI MÀU HÉO (xanh→nâu), không rụi mất.
        // Cây chỉ rời vườn khi: bị Cắt (cut) hoặc bấm "Reset vườn".
        const dropWilt = Number(cfg.fruitDropWilt) || 55;
        const dropChance = (Number(cfg.fruitDropChancePerSec) || 0.6) * dt;
        for (const p of trongCayState.plants) {
            const curWilt = Number(p.wilt) || 0;
            // Héo dần theo nhịp riêng từng cây (không nhảy thẳng theo vườn) → cây vừa
            // được tặng quà (wilt=0) sẽ xanh tươi thêm một lúc dù vườn đang thiếu nước.
            if (bad) p.wilt = trongCayClamp(curWilt + (Number(cfg.wiltGainPerSecond) || 0.45) * dt, 0, 100);
            else if (recover) p.wilt = trongCayClamp(curWilt - (Number(cfg.wiltRecoverPerSecond) || 0.28) * dt * 1.8, 0, 100);
            // Cây héo nặng → trái chín RỤNG XUỐNG ĐẤT (ong vẫn nhặt được dưới đất).
            if ((Number(p.wilt) || 0) >= dropWilt && (Number(p.fruits) || 0) > 0 && Math.random() < dropChance) {
                trongCayDropFruit(p);
            }
        }
        trongCayState.height = trongCayClamp(Math.max(0, ...trongCayState.plants.map(p => Number(p.height) || 0)), 0, Number(cfg.maxHeight) || 100);
    }
    const cutoff = now - 65000;
    trongCayState.butterflies = trongCayState.butterflies.filter(b => (b.ts || 0) > cutoff);
    // 🐛 Sâu ăn + 🧴 vùng bảo vệ hết hạn
    let catDirty = false;
    if (Array.isArray(trongCayState.protectedZones) && trongCayState.protectedZones.length) {
        const n0 = trongCayState.protectedZones.length;
        trongCayState.protectedZones = trongCayState.protectedZones.filter(z => z.until > now);
        if (trongCayState.protectedZones.length !== n0) catDirty = true;
    }
    if (Array.isArray(trongCayState.caterpillars) && trongCayState.caterpillars.length) {
        const biteEvery = Math.max(0.4, Number(cfg.caterpillarBiteEverySec) || 1.6) * 1000;
        const lifeMs = Math.max(8, Number(cfg.caterpillarLifeSeconds) || 75) * 1000;
        if (!Array.isArray(trongCayState.corpses)) trongCayState.corpses = [];
        const survivors = [];
        for (const c of trongCayState.caterpillars) {
            if (now < c.bornAt) { survivors.push(c); continue; }      // stagger: chưa "vào sân"
            if (trongCayPtInZone(c.x, trongCayState.protectedZones)) { // dính thuốc → rụng thành xác
                trongCayState.corpses.push({ id: 'corpse-' + c.id, x: c.x, ts: now }); catDirty = true; continue;
            }
            if (now - c.bornAt > lifeMs) { trongCayPupate(c, now, cfg); catDirty = true; continue; } // hết đời → hóa nhộng (rồi tiến hóa thành bướm)
            if (now < (c.eatFrom || c.bornAt)) { survivors.push(c); continue; } // còn trong thời gian "khởi động", chưa phá
            if (now - (c.lastBiteAt || 0) >= biteEvery) {
                const ok = trongCayCaterpillarBite(c);
                c.lastBiteAt = now; catDirty = true;
                if (!ok) {
                    // 🐛 Sâu CHUNG THỦY 1 cây: ăn hết cây của mình → rơi xuống đất hóa nhộng NGAY,
                    //    KHÔNG bò sang cây khác (mỗi con gắn đúng 1 cây tới trọn đời → đúng 1 kén).
                    trongCayPupate(c, now, cfg); continue;
                }
                c.x = trongCayClamp(c.x + (Math.random() * 4 - 2), 2, 98); // bò nhẹ cho sinh động
            }
            survivors.push(c);
        }
        trongCayState.caterpillars = survivors;
        const capCorpse = Math.max(6, Number(cfg.maxCaterpillarCorpses) || 36);
        while (trongCayState.corpses.length > capCorpse) trongCayState.corpses.shift();
        trongCayState.height = trongCayClamp(Math.max(0, ...(trongCayState.plants || []).map(p => Number(p.height) || 0)), 0, Number(cfg.maxHeight) || 100);
    }
    // 🐛→🦋 Nhộng dưới đất tới giờ → NỞ thành bướm tiến hóa đi cứu cây héo.
    if (Array.isArray(trongCayState.pupae) && trongCayState.pupae.length) {
        const stay = [];
        for (const pu of trongCayState.pupae) {
            if (now >= (Number(pu.evolveAt) || 0)) { trongCayEvolvePupa(pu, now); catDirty = true; }
            else stay.push(pu);
        }
        trongCayState.pupae = stay;
    }
    // 🦋 Bướm chữa lành: con nào đã bay tới ĐẬU trên cây yếu thì hồi héo cho cây đó dần dần.
    if (Array.isArray(trongCayState.butterflies) && trongCayState.butterflies.length) {
        const healRate = Math.max(0, Number(cfg.butterflyHealPerSecond) || 0) * dt;
        if (healRate > 0) {
            for (const b of trongCayState.butterflies) {
                if (!b.heal || !b.plantId) continue;
                if (now < (Number(b.ts) || 0) + (Number(b.durationMs) || 3200)) continue;  // chưa bay tới đậu
                const p = (trongCayState.plants || []).find(x => x.id === b.plantId);
                if (!p || (Number(p.wilt) || 0) <= 0) continue;
                p.wilt = trongCayClamp((Number(p.wilt) || 0) - healRate, 0, 100);
                catDirty = true;
            }
        }
    }
    const after = `${trongCayState.height.toFixed(2)}:${trongCayState.water.toFixed(2)}:${trongCayState.sun.toFixed(2)}:${trongCayState.wilt.toFixed(2)}:${(trongCayState.plants || []).map(p => (Number(p.height)||0).toFixed(2) + '/' + (Number(p.wilt)||0).toFixed(1)).join('|')}`;
    if (before !== after || catDirty) {
        trongCayState.updatedAt = now;
        broadcastTrongCayState();
    }
}
setInterval(trongCayTick, 500);

try { trongCayApplyConfigToState(appConfig.games.trongcay || makeDefaultTrongCayConfig()); } catch (e) {}
try { trongCayReset(); } catch (e) {}

app.get('/api/games/trongcay/livestate', (req, res) => {
    res.json(trongCaySnapshot());
});

app.post('/api/games/trongcay/control', (req, res) => {
    const cmd = String(req.body?.cmd || '').toLowerCase();
    if (cmd === 'start') {
        if (!appConfig.games.trongcay) appConfig.games.trongcay = makeDefaultTrongCayConfig();
        appConfig.games.trongcay.sessionActive = true;
        saveAppConfig();
        io.emit('gameConfig', { gameId: 'trongcay', config: appConfig.games.trongcay });
        io.emit('overlay:reload', { gameId: 'trongcay' });
        broadcastTrongCayState({ immediate: true });
    } else if (cmd === 'stop') {
        if (!appConfig.games.trongcay) appConfig.games.trongcay = makeDefaultTrongCayConfig();
        appConfig.games.trongcay.sessionActive = false;
        saveAppConfig();
        io.emit('gameConfig', { gameId: 'trongcay', config: appConfig.games.trongcay });
        broadcastTrongCayState({ immediate: true });
    } else if (cmd === 'reset') {
        trongCayReset();
    } else if (cmd === 'resetkpi') {
        // 💎 Đếm lại mốc KPI từ 0: ghim baseline = tổng 💎 hiện tại. KHÔNG xoá cây/điểm, KHÔNG đụng thẻ 💎 tổng chung.
        trongCayState.kpiBaseline = Math.round(Number(liveStats && liveStats.totalDiamond) || 0);
        trongCayState.updatedAt = Date.now();
        broadcastTrongCayState({ immediate: true });
    } else if (cmd === 'grow') {
        trongCayEnsureSessionActive();
        trongCayApplyDelta({ growth: Number(req.body?.growth) || 8 });
        trongCayPostGrowChecks();
        broadcastTrongCayState({ immediate: true });
    } else if (cmd === 'water') {
        trongCayEnsureSessionActive();
        io.emit('trongcay:water', { nickname: 'TEST', ts: Date.now() });
        trongCayApplyWeatherDelayed({ water: Number(req.body?.water) || 20, growth: Number(req.body?.growth) || 2 });
    } else if (cmd === 'sun') {
        trongCayEnsureSessionActive();
        io.emit('trongcay:sun', { nickname: 'TEST', ts: Date.now() });
        trongCayApplyWeatherDelayed({ sun: Number(req.body?.sun) || 28, wilt: Number(req.body?.wilt) || 10 });
    } else if (cmd === 'cut') {
        trongCayEnsureSessionActive();
        const target = trongCayPickCut();
        io.emit('trongcay:cut', { nickname: 'TEST', ...target.evt, ts: Date.now() });
        trongCayCutDelayed(target, Number(req.body?.cut) || 14);
    } else if (cmd === 'testgift') {
        trongCayEnsureSessionActive();
        const action = String(req.body?.action || '').toLowerCase() || 'grow';
        const testGift = makeTestGiftPayload(req.body || {});
        const giftImage = testGift.giftImage || TEST_GIFT_IMAGE;
        const profilePicture = req.body?.profilePicture || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="%23ff6fae"/><text x="40" y="50" text-anchor="middle" font-size="34">HP</text></svg>';
        if (action === 'water') {
            io.emit('trongcay:water', { nickname: 'TEST', ts: Date.now() });
            trongCayApplyWeatherDelayed({ water: 20, growth: 0 });
        } else if (action === 'sun') {
            io.emit('trongcay:sun', { nickname: 'TEST', ts: Date.now() });
            trongCayApplyWeatherDelayed({ sun: 28, wilt: 10 });
        } else if (action === 'cut') {
            const target = trongCayPickCut();
            io.emit('trongcay:cut', { nickname: 'TEST', ...target.evt, ts: Date.now() });
            trongCayCutDelayed(target, 16);
        } else if (action === 'butterfly') {
            trongCayAddButterfly({ profilePicture, nickname: 'Người Thử', uniqueId: 'tester' }, null);
        } else if (action === 'bee') {
            trongCaySpawnBeeSwarm({ profilePicture, nickname: 'Người Thử', uniqueId: 'tester', beeGift: req.body || {}, repeat: 1 });
        } else if (action === 'caterpillar') {
            trongCaySpawnCaterpillarSwarm({ profilePicture, nickname: 'Người Thử', uniqueId: 'tester', caterpillarGift: req.body || {}, repeat: 1 });
        } else if (action === 'spray') {
            trongCaySpray({ sprayGift: req.body || {} });
        } else if (action === 'dragon') {
            trongCayDragonAttack({ profilePicture, nickname: 'Người Thử', uniqueId: 'tester', burnSeconds: Number(req.body?.burnSeconds) || Number(req.body?.value) });
        } else if ((appConfig.games.trongcay || {}).chooseTreeEnabled === true) {
            // Chế độ chọn cây bật → đẩy quà thử qua đúng đường thật: quà kích hoạt toggle trồng/khóa/mở,
            // quà thường làm cao cây active của "tester". (action 'activate' = chính quà kích hoạt.)
            handleTrongCayGift({
                uniqueId: 'tester', nickname: 'Người Thử', profilePicture,
                giftId: testGift.giftId, giftName: testGift.giftName, giftImage,
                coinValue: testGift.coinValue, repeatCount: 1, source: 'test'
            });
        } else {
            const giftId = testGift.giftId;
            const coinValue = testGift.coinValue;
            const growth = Math.max(2, Math.sqrt(coinValue) * (Number((appConfig.games.trongcay || {}).perCoinGrowth) || 0.25));
            const giftName = testGift.giftName;
            const wiltBlockAt = Number((appConfig.games.trongcay || {}).wiltGrowthBlockAt) || 62;
            if (trongCayState.wilt >= wiltBlockAt) trongCayState.wilt = Math.max(0, wiltBlockAt - 8);
            const plant = trongCayGrowGiftPlant({ giftId, giftName, giftImage, nickname: 'Người Thử', uniqueId: 'tester', coinValue, repeatCount: 1, growth });
            if (plant) trongCayApplyDelta({ water: -0.6 });
            if (plant) io.emit('trongcay:grow', { nickname: 'Người Thử', plantId: plant.id, giftImage, ts: Date.now() });
            if (plant && Math.random() < 0.55) trongCayAddButterfly({ profilePicture, nickname: 'Người Thử', uniqueId: 'tester' }, null);
        }
        trongCayPostGrowChecks();
        trongCayState.lastGiftAt = Date.now();
        broadcastTrongCayState({ immediate: true });
    } else {
        return res.status(400).json({ ok: false, error: 'cmd phải là start|stop|reset|resetKpi|grow|water|sun|cut|testGift' });
    }
    res.json({ ok: true, state: trongCaySnapshot() });
});

// ============================================================
// BẮN CUNG — live state + gift hook (shot/heal/revive/shield) + regen tick
// ============================================================
// In-memory state — restart app reset về maxHearts.
// HP authoritative ở server. Mọi shot/heal/revive/shield đi qua handlers dưới đây.
let banCungState = {
    hp: 10,
    maxHp: 10,
    lastDamageAt: 0,
    deadAt: 0,                  // ts khi HP về 0 (0 = đang sống)
    shieldUntil: 0,             // ts hết hiệu lực giáp
    userContrib: {},            // uniqueId(lower) → { totalDamage, totalShots, nickname, avatar, lastAt }
    pendingBurst: 0,            // số mũi đang trong burst chờ bắn (visual sync)
    // ===== Advanced features state =====
    comboCount: 0,              // chuỗi shot liên tiếp
    comboExpiresAt: 0,          // ts khi combo break
    firstBloodUid: '',          // user đầu tiên gây sát thương phiên này
    sessionStartedAt: 0,        // ts khi phiên bắt đầu
    survivalRecordSec: 0,       // kỷ lục thời gian sống sót tốt nhất
    bowCharge: 0                // 0..100% bow charge meter
};
let banCungLastBroadcast = 0;
let banCungPendingBroadcast = null;
let banCungLastRegenAt = Date.now();
let banCungAutoReviveTimer = null;

function banCungTopList(limit = 5) {
    return Object.values(banCungState.userContrib || {})
        .filter(u => u && (u.totalDamage > 0 || u.totalShots > 0))
        .sort((a, b) => b.totalDamage - a.totalDamage)
        .slice(0, limit)
        .map(u => ({
            uniqueId: u.uniqueId,
            nickname: u.nickname || u.uniqueId,
            avatar: u.avatar || '',
            totalDamage: Math.round((u.totalDamage || 0) * 100) / 100,
            totalShots: u.totalShots || 0
        }));
}

function banCungSnapshot() {
    const cfg = appConfig.games?.bancung;
    const now = Date.now();
    const combo = (banCungState.comboExpiresAt > now) ? banCungState.comboCount : 0;
    return {
        hp: Math.round(banCungState.hp * 100) / 100,
        maxHp: banCungState.maxHp,
        deadAt: banCungState.deadAt || 0,
        shieldUntil: banCungState.shieldUntil || 0,
        shielded: (banCungState.shieldUntil || 0) > now,
        lastDamageAt: banCungState.lastDamageAt,
        reviveWindowMsLeft: banCungState.deadAt
            ? Math.max(0, ((cfg?.reviveWindowSec || 5) * 1000) - (now - banCungState.deadAt))
            : 0,
        sessionActive: cfg ? (cfg.sessionActive !== false) : true,
        enabled: cfg ? (cfg.enabled !== false) : true,
        top: banCungTopList(5),
        // Advanced features
        comboCount: combo,
        comboExpiresAt: banCungState.comboExpiresAt,
        bowCharge: Math.round(banCungState.bowCharge),
        sessionStartedAt: banCungState.sessionStartedAt,
        survivalSec: banCungState.sessionStartedAt ? Math.floor((now - banCungState.sessionStartedAt) / 1000) : 0,
        survivalRecordSec: banCungState.survivalRecordSec,
        updatedAt: now
    };
}

function broadcastBanCungState({ immediate = false } = {}) {
    const send = () => {
        banCungLastBroadcast = Date.now();
        banCungPendingBroadcast = null;
        io.emit('bancung:state', banCungSnapshot());
    };
    if (immediate) {
        if (banCungPendingBroadcast) { clearTimeout(banCungPendingBroadcast); banCungPendingBroadcast = null; }
        return send();
    }
    const now = Date.now();
    const wait = Math.max(0, 200 - (now - banCungLastBroadcast));
    if (banCungPendingBroadcast) return;
    banCungPendingBroadcast = setTimeout(send, wait);
}

function banCungClampHp(v, maxOverride) {
    const max = maxOverride != null ? maxOverride : banCungState.maxHp;
    if (!isFinite(v)) v = 0;
    return Math.max(0, Math.min(max, v));
}

function banCungApplyConfigToState(cfg) {
    if (!cfg) cfg = makeDefaultBanCungConfig();
    const prevMax = banCungState.maxHp;
    const newMax = Math.max(1, Number(cfg.maxHearts) || 10);
    banCungState.maxHp = newMax;
    if (prevMax !== newMax) {
        // Scale current HP nếu vượt max mới
        banCungState.hp = banCungClampHp(banCungState.hp, newMax);
    }
}

function banCungReset() {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    banCungApplyConfigToState(cfg);
    const init = cfg.initialHearts != null ? Number(cfg.initialHearts) : banCungState.maxHp;
    banCungState.hp = banCungClampHp(init);
    banCungState.lastDamageAt = 0;
    banCungState.deadAt = 0;
    banCungState.shieldUntil = 0;
    banCungState.userContrib = {};
    banCungState.pendingBurst = 0;
    banCungState.comboCount = 0;
    banCungState.comboExpiresAt = 0;
    banCungState.firstBloodUid = '';
    banCungState.sessionStartedAt = Date.now();
    banCungState.bowCharge = 0;
    if (banCungAutoReviveTimer) { clearTimeout(banCungAutoReviveTimer); banCungAutoReviveTimer = null; }
    banCungClearBurstTimers();
    broadcastBanCungState({ immediate: true });
}

function banCungSetHp(hp) {
    banCungState.hp = banCungClampHp(Number(hp) || 0);
    // Khi setHp trực tiếp > 0 → reset death/revive timer
    if (banCungState.hp > 0 && banCungState.deadAt) {
        banCungState.deadAt = 0;
        if (banCungAutoReviveTimer) { clearTimeout(banCungAutoReviveTimer); banCungAutoReviveTimer = null; }
    } else if (banCungState.hp <= 0 && !banCungState.deadAt) {
        banCungTriggerDeath();
    }
    broadcastBanCungState({ immediate: true });
}

// Apply damage from a single arrow shot. Returns object with damage + flags.
// flags: { critical, headshot, combo, firstBlood, killingBlow, dealt }
// giftMeta: { id, name, image } — optional, dùng để lookup per-gift damage override
function banCungApplyShotDamage(contribUser, giftMeta) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    const dCfg = cfg.display || {};
    const now = Date.now();
    const flags = { dealt: 0, critical: false, headshot: false, combo: 0, firstBlood: false, killingBlow: false };
    if (banCungState.deadAt) return flags;
    if (banCungState.shieldUntil > now) return flags;
    // Auto-start survival timer on first damage of session
    if (!banCungState.sessionStartedAt) banCungState.sessionStartedAt = now;
    // Damage selection priority:
    //   1. giftMeta.forceDamage (free-fire mode đã tính sẵn) — dùng trực tiếp + BYPASS multipliers
    //   2. shotGifts[giftId].giftsPerHeart override — 1/giftsPerHeart hearts
    //   3. cfg.damagePerShot — fallback toàn cục
    let dmg;
    const bypassMultipliers = !!(giftMeta && giftMeta.bypassMultipliers);
    if (giftMeta && Number(giftMeta.forceDamage) > 0) {
        dmg = Number(giftMeta.forceDamage);
    } else {
        dmg = Math.max(0, Number(cfg.damagePerShot) || 0);
        if (giftMeta && giftMeta.id && Array.isArray(cfg.shotGifts)) {
            const found = cfg.shotGifts.find(g => String(g.giftId) === String(giftMeta.id));
            if (found && Number(found.giftsPerHeart) > 0) {
                dmg = 1 / Number(found.giftsPerHeart);
            }
        }
    }
    if (dmg <= 0) return flags;
    // Critical hit roll (skip nếu bypassMultipliers — free-fire mode dùng exact KC calculation)
    const critChance = bypassMultipliers ? 0 : Math.max(0, Math.min(100, Number(dCfg.criticalChance) || 0));
    if (critChance > 0 && Math.random() * 100 < critChance) {
        flags.critical = true;
        dmg *= Math.max(1, Number(dCfg.criticalMultiplier) || 2);
    }
    // Headshot roll (independent of critical) — skip nếu bypassMultipliers
    if (!bypassMultipliers && dCfg.headshotEnabled && (Number(dCfg.headshotChance) || 0) > 0) {
        const hsChance = Math.max(0, Math.min(100, Number(dCfg.headshotChance) || 0));
        if (Math.random() * 100 < hsChance) {
            flags.headshot = true;
            dmg *= Math.max(1, Number(dCfg.headshotMultiplier) || 2);
        }
    }
    // Combo multiplier (chains within comboWindowSec) — skip nếu bypassMultipliers
    if (!bypassMultipliers && dCfg.comboEnabled !== false) {
        const windowMs = Math.max(500, (Number(dCfg.comboWindowSec) || 4) * 1000);
        if (banCungState.comboExpiresAt > now) {
            banCungState.comboCount += 1;
        } else {
            banCungState.comboCount = 1;
        }
        banCungState.comboExpiresAt = now + windowMs;
        flags.combo = banCungState.comboCount;
        const step = 0.25;     // each combo +25%
        const maxMul = Math.max(1, Number(dCfg.comboMaxMultiplier) || 3);
        const comboMul = Math.min(maxMul, 1 + (banCungState.comboCount - 1) * step);
        dmg *= comboMul;
    }
    // Apply damage
    const before = banCungState.hp;
    banCungState.hp = banCungClampHp(before - dmg);
    const actual = before - banCungState.hp;
    flags.dealt = actual;
    banCungState.lastDamageAt = now;
    // First blood tracking — first shot to deal damage in session
    if (!banCungState.firstBloodUid && contribUser?.uniqueId && actual > 0) {
        banCungState.firstBloodUid = String(contribUser.uniqueId).toLowerCase();
        flags.firstBlood = true;
    }
    // Top contributor
    if (contribUser && contribUser.uniqueId && actual > 0) {
        const uid = String(contribUser.uniqueId).toLowerCase();
        const u = banCungState.userContrib[uid] || {
            uniqueId: contribUser.uniqueId, nickname: '', avatar: '',
            totalDamage: 0, totalShots: 0, lastAt: 0
        };
        u.totalDamage += actual;
        u.totalShots += 1;
        u.nickname = contribUser.nickname || u.nickname || contribUser.uniqueId;
        u.avatar = contribUser.avatar || u.avatar || '';
        u.lastAt = now;
        banCungState.userContrib[uid] = u;
    }
    // Killing blow detection (HP went to 0 via this shot)
    if (banCungState.hp <= 0 && !banCungState.deadAt) {
        flags.killingBlow = true;
        banCungTriggerDeath(contribUser);
    }
    return flags;
}

function banCungTriggerDeath(killerUser) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    banCungState.deadAt = Date.now();
    banCungState.shieldUntil = 0;
    // Survival record tracking
    if (banCungState.sessionStartedAt) {
        const survSec = Math.floor((banCungState.deadAt - banCungState.sessionStartedAt) / 1000);
        if (survSec > banCungState.survivalRecordSec) {
            banCungState.survivalRecordSec = survSec;
        }
    }
    io.emit('bancung:death', {
        ts: banCungState.deadAt,
        reviveWindowSec: Number(cfg.reviveWindowSec) || 5,
        killer: killerUser ? { uniqueId: killerUser.uniqueId, nickname: killerUser.nickname, avatar: killerUser.avatar } : null,
        podium: banCungTopList(3),
        survivalSec: banCungState.sessionStartedAt ? Math.floor((banCungState.deadAt - banCungState.sessionStartedAt) / 1000) : 0,
        survivalRecordSec: banCungState.survivalRecordSec
    });
    console.log('[bancung] DEATH' + (killerUser ? ` by ${killerUser.nickname || killerUser.uniqueId}` : '') + ' — chờ revive ' + (cfg.reviveWindowSec || 5) + 's');
    // Auto-revive after window — CHỈ khi tắt tự hồi máu. Có tự hồi thì gục idleBeforeRegen giây rồi máu bắt đầu hồi là
    // sống lại luôn (banCungRegenTick), máu leo tiếp chậm rồi nhanh dần; quà Hồi sinh vẫn cứu ngay.
    if (banCungAutoReviveTimer) { clearTimeout(banCungAutoReviveTimer); banCungAutoReviveTimer = null; }
    if ((Number(cfg.regenPerSecond) || 0) > 0) return;
    const winMs = Math.max(1000, (Number(cfg.reviveWindowSec) || 5) * 1000);
    banCungAutoReviveTimer = setTimeout(() => {
        const c = appConfig.games.bancung || makeDefaultBanCungConfig();
        if (banCungState.deadAt && c.autoReviveAfterWindow !== false) {
            banCungDoRevive(Math.max(0.5, Number(c.autoReviveHearts) || 5), null, true);
        }
    }, winMs);
}

function banCungDoRevive(hearts, contribUser, isAuto) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    if (!banCungState.deadAt) {
        // Đang sống — heal bình thường thay vì revive
        return banCungDoHeal(hearts, contribUser);
    }
    banCungState.deadAt = 0;
    banCungState.hp = banCungClampHp(Number(hearts) || cfg.autoReviveHearts || 5);
    if (banCungAutoReviveTimer) { clearTimeout(banCungAutoReviveTimer); banCungAutoReviveTimer = null; }
    // Tặng giáp ngắn cho người vừa hồi sinh khỏi spam-kill
    const protectSec = Math.max(0, Number(cfg.reviveProtectionSec) || 0);
    if (protectSec > 0) banCungState.shieldUntil = Date.now() + protectSec * 1000;
    io.emit('bancung:revive', {
        ts: Date.now(),
        hearts: banCungState.hp,
        protectSec,
        auto: !!isAuto,
        user: contribUser ? { uniqueId: contribUser.uniqueId, nickname: contribUser.nickname, avatar: contribUser.avatar } : null
    });
    console.log(`[bancung] REVIVE → ${banCungState.hp.toFixed(2)} ♥` + (isAuto ? ' (auto)' : ` by ${contribUser?.nickname || contribUser?.uniqueId}`));
    broadcastBanCungState({ immediate: true });
}

function banCungDoHeal(hearts, contribUser) {
    if (banCungState.deadAt) return; // Heal không kích hoạt khi chết — phải dùng revive
    const before = banCungState.hp;
    banCungState.hp = banCungClampHp(before + (Number(hearts) || 0));
    const actual = banCungState.hp - before;
    if (actual > 0) {
        io.emit('bancung:heal', {
            ts: Date.now(),
            hearts: actual,
            user: contribUser ? { uniqueId: contribUser.uniqueId, nickname: contribUser.nickname, avatar: contribUser.avatar } : null
        });
        broadcastBanCungState({ immediate: true });
    }
}

function banCungDoShield(durationSec, contribUser) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    if (banCungState.deadAt) return;
    const sec = Math.max(1, Number(durationSec) || 5);
    const now = Date.now();
    // Stack: nếu đang có giáp, kéo dài thêm chứ không reset
    const cur = Math.max(banCungState.shieldUntil || 0, now);
    banCungState.shieldUntil = cur + sec * 1000;
    io.emit('bancung:shield', {
        ts: now,
        durationSec: sec,
        until: banCungState.shieldUntil,
        user: contribUser ? { uniqueId: contribUser.uniqueId, nickname: contribUser.nickname, avatar: contribUser.avatar } : null
    });
    broadcastBanCungState({ immediate: true });
}

// Spawn N arrow shots in sequence (1 hoặc 3). Mỗi shot:
//   1. delay theo burstDelayMs (shot 0 = ngay)
//   2. emit 'bancung:shot' event cho overlay animate
//   3. apply damage sau khi arrow hit (server delay = arrowDurationMs)
const banCungBurstTimers = new Set();   // mọi setTimeout của loạt bắn — reset là huỷ sạch, mũi tên đang bay không "trúng" HP mới
function banCungClearBurstTimers() {
    for (const t of banCungBurstTimers) clearTimeout(t);
    banCungBurstTimers.clear();
}
const BANCUNG_MAX_BURST = 999;   // combo ×N = đủ N mũi (user 29/10/2026), trần an toàn
function banCungFireBurst(shotCount, contribUser, giftMeta) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    const arrowDur  = Math.max(100, Number(cfg.display?.arrowDurationMs) || 700);
    // Combo / Bắn tự do: tối đa BANCUNG_MAX_BURST mũi (trước là 60 → 100 hoa hồng chỉ ra 60 mũi); loạt dài ~40 ms / mũi (300 mũi ≈ 12 s).
    const n = Math.max(1, Math.min(BANCUNG_MAX_BURST, parseInt(shotCount, 10) || 1));
    const burstDelay = Math.min(Math.max(0, Number(cfg.display?.burstDelayMs) || 280), n > 20 ? Math.floor(Math.max(6000, n * 40) / n) : Infinity);
    for (let i = 0; i < n; i++) {
        const launchAt = i * burstDelay;
        const tOuter = setTimeout(() => {
            banCungBurstTimers.delete(tOuter);
            // Pre-check shield/dead status AT LAUNCH — overlay needs to know whether
            // to animate "hit and disappear" hoặc "fly through and pass" (shield deflect).
            const now0 = Date.now();
            const willBlock = banCungState.deadAt > 0 || (banCungState.shieldUntil || 0) > now0;
            const shielded = !banCungState.deadAt && (banCungState.shieldUntil || 0) > now0;
            io.emit('bancung:shot', {
                ts: now0,
                seed: Math.random(),
                arrowDurationMs: arrowDur,
                blocked: willBlock,           // true = không trừ máu (giáp / đã gục)
                shielded,                     // true = GIÁP chặn → bay xuyên; đã gục thì mũi tên vẫn găm vào người, chỉ không trừ máu
                user: contribUser ? { uniqueId: contribUser.uniqueId, nickname: contribUser.nickname, avatar: contribUser.avatar } : null,
                gift: giftMeta || null
            });
            // Apply damage when arrow lands (delayed by arrowDur)
            const tInner = setTimeout(() => {
                banCungBurstTimers.delete(tInner);
                const flags = banCungApplyShotDamage(contribUser, giftMeta);
                if (flags.dealt > 0) {
                    io.emit('bancung:hit', {
                        ts: Date.now(),
                        damage: flags.dealt,
                        hp: banCungState.hp,
                        critical: flags.critical,
                        headshot: flags.headshot,
                        combo: flags.combo,
                        firstBlood: flags.firstBlood,
                        killingBlow: flags.killingBlow,
                        user: contribUser ? { uniqueId: contribUser.uniqueId, nickname: contribUser.nickname, avatar: contribUser.avatar } : null
                    });
                } else {
                    // Shielded — emit blocked event for visual ping
                    io.emit('bancung:blocked', { ts: Date.now() });
                }
                broadcastBanCungState({ immediate: true });
            }, arrowDur);
            banCungBurstTimers.add(tInner);
        }, launchAt);
        banCungBurstTimers.add(tOuter);
    }
}

function banCungAddBowCharge(amount, contribUser) {
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    if (cfg.display?.bowChargeEnabled !== true) return;
    const before = banCungState.bowCharge || 0;
    banCungState.bowCharge = Math.min(100, before + (Number(amount) || 0));
    io.emit('bancung:charge', { value: banCungState.bowCharge, delta: banCungState.bowCharge - before });
    if (banCungState.bowCharge >= 100) {
        const n = Math.max(1, Math.min(30, parseInt(cfg.display?.bowChargeFullShots, 10) || 10));
        banCungState.bowCharge = 0;
        io.emit('bancung:autoburst', { count: n, ts: Date.now() });
        // Fire after small delay so charge animation completes
        setTimeout(() => {
            banCungFireBurst(n, contribUser || { uniqueId: 'crowd', nickname: 'KHÁN GIẢ' }, { id: 'charge', name: 'AUTO-BURST', image: '' });
        }, 600);
    }
}

function handleBanCungGift({ uniqueId, nickname, profilePicture, giftId, giftName, giftImage, coinValue, repeatCount }) {
    if (appConfig.games?.bancung?.enabled === false) return;
    if (appConfig.games?.bancung?.sessionActive === false) return;
    if (camGiftYields('bancung', { giftId, giftName })) return;   // quà của game chơi cùng trong Game Camera
    const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
    const contribUser = uniqueId ? { uniqueId, nickname, avatar: profilePicture } : null;
    const repeat = Math.max(1, Number(repeatCount) || 1);
    const gid = String(giftId);
    // Bow charge — every accepted gift charges the meter
    if (cfg.display?.bowChargeEnabled === true) {
        const charge = (Number(cfg.display?.bowChargePerGift) || 12) * repeat;
        banCungAddBowCharge(charge, contribUser);
    }

    // Priority order: shield > revive > heal > shot
    // (shield ưu tiên cao nhất vì có thể bị spam = chết oan; revive trên heal vì có thể đang ở HP=0)
    const findInList = (list) => Array.isArray(list) ? list.find(g => String(g.giftId) === gid) : null;

    const shieldHit = findInList(cfg.shieldGifts);
    if (shieldHit) {
        // Khiên × combo nhưng có trần (mặc định 60s, cfg.maxShieldSec) — combo x100 không còn = 500s bất tử
        const dur = Math.min(Math.max(1, Number(shieldHit.durationSec) || 5) * repeat, Math.max(5, Number(cfg.maxShieldSec) || 60));
        banCungDoShield(dur, contribUser);
        return;
    }
    const reviveHit = findInList(cfg.reviveGifts);
    if (reviveHit) {
        if (banCungState.deadAt) {
            // Hồi sinh với 50% HP × repeat (clamped)
            const reviveHp = Math.min(banCungState.maxHp, Math.max(1, banCungState.maxHp * 0.5 * repeat));
            banCungDoRevive(reviveHp, contribUser, false);
        } else {
            // Còn sống mà tặng quà hồi sinh → coi như hồi máu nhẹ, KHÔNG rơi xuống nhánh bắn tự do thành mũi tên
            banCungDoHeal(Math.max(0.5, banCungState.maxHp * 0.1) * Math.min(repeat, 5), contribUser);
        }
        return;
    }
    const healHit = findInList(cfg.healGifts);
    if (healHit && !banCungState.deadAt) {
        const heal = Math.max(0, Number(healHit.healHearts) || 1) * repeat;
        banCungDoHeal(heal, contribUser);
        return;
    }
    const shotHit = findInList(cfg.shotGifts);
    if (shotHit) {
        const shotsPerGift = Math.max(1, Math.min(20, parseInt(shotHit.shots, 10) || 1));
        const totalShots = shotsPerGift * repeat;
        const giftMeta = { id: shotHit.giftId, name: shotHit.giftName, image: shotHit.giftImage };
        banCungFireBurst(totalShots, contribUser, giftMeta);
        return;
    }
    // BẮN TỰ DO: nếu enabled + quà KHÔNG nằm trong list nào → tính damage theo KC
    if (cfg.freeFireEnabled === true) {
        const totalKc = Math.max(0, Number(coinValue) || 0) * repeat;
        if (totalKc <= 0) return;
        const kcPerHeart = Math.max(1, Number(cfg.freeFireKcPerHeart) || 100);
        const kcPerShot  = Math.max(1, Number(cfg.freeFireKcPerShot)  || 10);
        const maxShots   = Math.max(1, Math.min(BANCUNG_MAX_BURST, Number(cfg.freeFireMaxShots) || 20));
        const totalDamage = totalKc / kcPerHeart;
        const shots = Math.max(1, Math.min(maxShots, Math.round(totalKc / kcPerShot)));
        const damagePerShot = totalDamage / shots;
        const giftMeta = {
            id: giftId,
            name: giftName || ('Quà #' + giftId),
            image: giftImage || '',
            forceDamage: damagePerShot,        // override trong banCungApplyShotDamage
            bypassMultipliers: true             // free-fire dùng exact KC math, không nhân combo/crit
        };
        banCungFireBurst(shots, contribUser, giftMeta);
    }
}

// Regen tick — 500ms. Hồi máu khi idle > idleBeforeRegen.
const BANCUNG_REGEN_MIN = 0.15;        // tốc độ lúc mới hồi = 15% tối đa
let banCungRegenStartAt = 0;           // lúc bắt đầu đợt hồi hiện tại (0 = không hồi) — bị bắn là về 0, hồi lại từ chậm
function banCungRegenTick() {
    const now = Date.now();
    const dt = (now - banCungLastRegenAt) / 1000;
    banCungLastRegenAt = now;
    const cfg = appConfig.games?.bancung;
    if (!cfg || cfg.enabled === false) return;
    // Hồi máu chạy cả khi chưa bấm ▶ Bắt đầu (bắn thử / gục khi đang dừng thì vẫn hồi lại, không kẹt).
    const idleSec = banCungState.lastDamageAt ? (now - banCungState.lastDamageAt) / 1000 : Infinity;
    const rate = Number(cfg.regenPerSecond) || 0;
    // Đang gục vẫn hồi: bắn vào lúc này không trừ máu (banCungApplyShotDamage bỏ qua) nên idle tính từ lúc gục.
    if (banCungState.hp >= banCungState.maxHp || rate <= 0
        || idleSec < (Number(cfg.idleBeforeRegen) || 0)) { banCungRegenStartAt = 0; return; }
    // Tắt "Tự hồi sinh nếu không ai cứu" → đã gục thì nằm chờ quà Hồi sinh (không hồi máu, không tự sống lại).
    if (banCungState.deadAt && cfg.autoReviveAfterWindow === false) { banCungRegenStartAt = 0; return; }
    // Hồi chậm rồi nhanh dần (trần = regenPerSecond) → người tặng thấy máu đang leo lại mà phải bắn tiếp;
    // một phát trúng là đợt hồi về lại tốc độ chậm.
    if (!banCungRegenStartAt) banCungRegenStartAt = now - dt * 1000;
    const ramp = Math.max(0, Number(cfg.regenRampSec ?? 10));
    const e = ramp > 0 ? Math.min(1, (now - banCungRegenStartAt) / 1000 / ramp) : 1;
    const inc = rate * (BANCUNG_REGEN_MIN + (1 - BANCUNG_REGEN_MIN) * e * e) * dt;
    const before = banCungState.hp;
    banCungState.hp = banCungClampHp(before + inc);
    // Đang gục mà máu bắt đầu hồi → sống lại NGAY với lượng máu đang có (hết cháy đen, tim đỏ lại), máu tiếp tục
    // leo theo cùng đợt hồi. Kèm giáp ngắn reviveProtectionSec để khỏi gục lại tức thì.
    if (banCungState.deadAt && banCungState.hp > 0) { banCungDoRevive(banCungState.hp, null, true); return; }
    if (Math.abs(banCungState.hp - before) > 0.005) {
        broadcastBanCungState();
    }
}
setInterval(banCungRegenTick, 500);

// Init state from config + register global hotkeys at startup
try { banCungApplyConfigToState(appConfig.games.bancung || makeDefaultBanCungConfig()); } catch (e) {}
setTimeout(() => camApplyHotkeys('bancung'), 1500);
setTimeout(() => { try { global.__vipwelcomeApplyHotkeys?.(appConfig.games.vipwelcome); } catch (e) {} }, 1500);
setTimeout(() => { try { global.__nhatlaApplyHotkeys?.(appConfig.games.nhatla); } catch (e) {} }, 1500);
setTimeout(() => { try { global.__dvqApplyHotkeys?.(appConfig.games.duongveque); } catch (e) {} }, 1500);
try {
    const cfg0 = appConfig.games.bancung || makeDefaultBanCungConfig();
    const init = cfg0.initialHearts != null ? Number(cfg0.initialHearts) : banCungState.maxHp;
    banCungState.hp = banCungClampHp(init);
} catch (e) {}

// Overlay route
app.get('/overlay/bancung', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'bancung', 'overlay.html'));
});

// ===================== CHÉM TRÁI CÂY =====================
const { createRelay: createChemRelay, sceneItemToCamRect, ensureScanScene } = require('./lib/chemtraicay-relay');
const chemRelay = createChemRelay();
let chemTraiCayStateCache = null;

app.get('/overlay/chemtraicay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'chemtraicay', 'overlay.html'));
});
app.get('/overlay/camgames', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'camgames', 'overlay.html'));
});
// Quà gán đích danh ở ≥2 game đang chơi cùng lúc → 1 quà kích cả hai (panel Game Camera cảnh báo).
app.get('/api/camgames/overlap', (req, res) => {
    const actives = camActives();
    res.json({ actives, overlaps: CamRules.overlapGifts(appConfig.games, actives) });
});
app.get('/tracker/chemtraicay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'chemtraicay', 'tracker.html'));
});

function chemTraiCayCfg() { return appConfig.games.chemtraicay || makeDefaultChemTraiCayConfig(); }

function emitChemTraiCayGift(payload) {
    chemLastGiftAt = Date.now();
    io.to('overlay').to('preview').emit('chemtraicay:gift', payload);
}

function handleChemTraiCayGift({ nickname, profilePicture, giftId, giftName, giftImage, repeatCount, source }) {
    const cfg = chemTraiCayCfg();
    if (cfg.enabled === false) return;
    const rules = Array.isArray(cfg.giftRules) ? cfg.giftRules : [];
    const gid = String(giftId);
    const rule = rules.find(r => r && r.enabled !== false && String(r.giftId) === gid && CHEMTRAICAY_ACTIONS.includes(r.action));
    if (!rule) return;
    const maxPerGift = Math.max(1, Number(cfg.maxPerGift) || 999);
    const count = Math.max(1, Math.floor(Number(rule.count) || 1));
    const qty = Math.min(maxPerGift, count * Math.max(1, Number(repeatCount) || 1));
    emitChemTraiCayGift({
        action: rule.action, qty, nickname: nickname || '', profilePicture: profilePicture || '',
        giftName: giftName || rule.giftName || '', image: giftImage || rule.giftImage || '',
        source: source || 'tiktok', ts: Date.now()
    });
}

app.post('/api/chemtraicay/control', (req, res) => {
    const cmd = String(req.body?.cmd || '');
    if (!['start', 'stop', 'reset'].includes(cmd)) return res.status(400).json({ error: 'cmd không hợp lệ' });
    io.emit('gameCmd', { gameId: 'chemtraicay', cmd, payload: {}, seq: Date.now() });
    res.json({ ok: true });
});

app.post('/api/chemtraicay/test', (req, res) => {
    const action = String(req.body?.action || '');
    if (!CHEMTRAICAY_ACTIONS.includes(action)) return res.status(400).json({ error: 'action không hợp lệ' });
    const maxPerGift = Math.max(1, Number(chemTraiCayCfg().maxPerGift) || 999);
    const qty = Math.min(maxPerGift, Math.max(1, Math.floor(Number(req.body?.qty) || 1)));
    emitChemTraiCayGift({ action, qty, nickname: 'Thử nghiệm', profilePicture: '', giftName: 'Gửi thử', image: '', source: 'test', ts: Date.now() });
    res.json({ ok: true, action, qty });
});

app.get('/api/chemtraicay/state', (req, res) => {
    res.json({ state: chemTraiCayStateCache, activeTrackerId: chemRelay.activeId() });
});

// Khung hình từ OBS (GetSourceScreenshot) — tracker tự điều nhịp bằng cách gọi lặp.
// Chỉ máy chạy app (loopback) hoặc client có token LAN mới được kéo hình/transform từ OBS —
// tránh máy khác trong LAN chụp bất kỳ source nào (vd Display Capture) qua endpoint này.
function chemTraiCayObsGuard(req, res) {
    if (!requestIsTrusted(req)) { res.status(403).json({ error: 'forbidden' }); return false; }
    if (!obsBridge.isConnected()) { res.status(503).json({ error: 'OBS chưa kết nối' }); return false; }
    return true;
}
const chemFrameInFlight = new Map(); // key → Promise: nhiều client cùng lúc chỉ tốn 1 GetSourceScreenshot

app.get('/api/chemtraicay/obs-frame', async (req, res) => {
    const sourceName = String(req.query.source || '').slice(0, 200);
    if (!sourceName) return res.status(400).json({ error: 'thiếu source' });
    if (!chemTraiCayObsGuard(req, res)) return;
    const w = Math.max(160, Math.min(1280, Math.round(Number(req.query.w) || 640)));
    try {
        const key = sourceName + '|' + w;
        let pending = chemFrameInFlight.get(key);
        if (!pending) {
            pending = obsBridge.obs.call('GetSourceScreenshot', { sourceName, imageFormat: 'jpg', imageWidth: w, imageCompressionQuality: 60 })
                .finally(() => chemFrameInFlight.delete(key));
            chemFrameInFlight.set(key, pending);
        }
        const r = await pending;
        const data = String(r?.imageData || '');
        const comma = data.indexOf(',');
        if (comma < 0) return res.status(502).json({ error: 'OBS không trả ảnh' });
        const buf = Buffer.from(data.slice(comma + 1), 'base64');
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-store');
        res.send(buf);
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e) });
    }
});

// Danh sách scene (obs-websocket GetSceneList) — độc lập với các helper khác của obs-bridge
app.get('/api/chemtraicay/obs-scenes', async (req, res) => {
    if (!requestIsTrusted(req)) return res.status(403).json({ error: 'forbidden', scenes: [] });
    if (!obsBridge.isConnected()) return res.status(503).json({ error: 'OBS chưa kết nối', scenes: [] });
    try {
        const r = await obsBridge.obs.call('GetSceneList');
        const scenes = (r?.scenes || []).map(sc => sc.sceneName).filter(Boolean).reverse();
        res.json({ scenes, current: r?.currentProgramSceneName || '' });
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e), scenes: [] });
    }
});

app.get('/api/chemtraicay/obs-sources', async (req, res) => {
    const sceneName = String(req.query.scene || '').slice(0, 200);
    if (!sceneName) return res.status(400).json({ error: 'thiếu scene' });
    if (!chemTraiCayObsGuard(req, res)) return;
    try {
        const r = await obsBridge.obs.call('GetSceneItemList', { sceneName });
        const items = (r?.sceneItems || []).map(it => ({ name: it.sourceName, kind: it.inputKind || it.sourceType || '', sceneItemId: it.sceneItemId }));
        res.json({ items });
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e) });
    }
});

app.get('/api/chemtraicay/obs-transform', async (req, res) => {
    const sceneName = String(req.query.scene || '').slice(0, 200);
    const sourceName = String(req.query.source || '').slice(0, 200);
    if (!sceneName || !sourceName) return res.status(400).json({ error: 'thiếu scene/source' });
    if (!chemTraiCayObsGuard(req, res)) return;
    try {
        const idr = await obsBridge.obs.call('GetSceneItemId', { sceneName, sourceName });
        const tr = await obsBridge.obs.call('GetSceneItemTransform', { sceneName, sceneItemId: idr.sceneItemId });
        const vs = await obsBridge.obs.call('GetVideoSettings');
        const camRect = sceneItemToCamRect(tr.sceneItemTransform || {}, { baseWidth: vs.baseWidth, baseHeight: vs.baseHeight });
        res.json({ camRect, base: { baseWidth: vs.baseWidth, baseHeight: vs.baseHeight }, transform: tr.sceneItemTransform });
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e) });
    }
});

// Scene quét riêng: tạo (hoặc cập nhật) Scene chỉ chứa tham chiếu nguồn camera, sao chép đúng
// transform của camera trong Scene live. Không sửa gì trong Scene live, không chuyển cảnh.
app.post('/api/chemtraicay/obs-scan-scene', async (req, res) => {
    const liveScene = String(req.body?.liveScene || '').slice(0, 200);
    const sourceName = String(req.body?.source || '').slice(0, 200);
    const scanScene = String(req.body?.scanScene || 'CTC Quét').slice(0, 60).trim() || 'CTC Quét';
    if (!liveScene || !sourceName) return res.status(400).json({ error: 'thiếu liveScene/source' });
    if (scanScene === liveScene) return res.status(400).json({ error: 'Scene quét phải khác Scene live' });
    if (!chemTraiCayObsGuard(req, res)) return;
    try {
        const r = await ensureScanScene((req, data) => obsBridge.obs.call(req, data), { liveScene, source: sourceName, scanScene });
        res.json({ ok: true, ...r });
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e) });
    }
});

// Đổi Scene OBS khi ván bắt đầu / kết thúc (config obsScene)
// Ván tự mở lại sau mỗi lần vườn đầy (bản port NPC bỏ màn GIỮ TAY) → chỉ sang Scene chơi khi ván mở do CÓ QUÀ
// (≤ 15 s), kẻo Scene OBS lật qua lại mỗi ván không ai tặng.
let chemLastGiftAt = 0;
async function chemTraiCaySceneFor(type) {
    const sc = chemTraiCayCfg().obsScene || {};
    if (!sc.enabled) return;
    if (type === 'start' && Date.now() - chemLastGiftAt > 15000) return;
    const name = type === 'start' ? sc.playScene : type === 'end' ? sc.backScene : '';
    if (!name) return;
    if (!obsBridge.isConnected()) return;
    try { await obsBridge.obs.call('SetCurrentProgramScene', { sceneName: name }); } catch (e) { console.warn('[chemtraicay] đổi scene lỗi:', e?.message || e); }
}

setInterval(() => {
    try { if (chemRelay.sweep()) io.emit('chemtraicay:trackerStatus', { activeId: null }); } catch (e) {}
}, 1000);

// ====== ĐẬP MUỖI ======
app.get('/overlay/dapmuoi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'games', 'dapmuoi', 'overlay.html'));
});

function dapMuoiCfg() { return DapMuoi.normalizeConfig(appConfig.games.dapmuoi || makeDefaultDapMuoiConfig()); }
// TẶNG BAO NHIÊU CHẠY BẤY NHIÊU (user 29/10/2026): combo ×N quà = N lượt xịt / vợt / màn / kem / Muỗi Chúa, chạy tới hết; trần an toàn 999.
const DAPMUOI_ACTION_MAX_REPEAT = 999;
const DAPMUOI_BOSS_MAX_PER_GIFT = 999;

function emitDapMuoiGift(payload) {
    io.to('overlay').to('preview').emit('dapmuoi:gift', payload);
}
// 👑 Muỗi Chúa (boss có thanh máu, port HP LIVE NPC): combo ×N = N con, tối đa 5 mỗi lượt quà. Bên NPC mỗi con kèm vé
// 💥 Thư viện hiệu ứng khi đập chết — app này chưa có thư viện đó nên fxIds rỗng.
function dapMuoiBossPayload(params, repeat, base) {
    const p = DapMuoi.normalizeAction({ type: 'boss', params }, 0).params;
    const count = Math.min(DAPMUOI_BOSS_MAX_PER_GIFT, Math.max(1, Math.floor(Number(p.count) || 1)) * Math.max(1, Number(repeat) || 1));
    return { ...base, action: 'boss', qty: 1, params: { ...p, count }, fxIds: [] };
}

// Quà → hành động đang bật (ưu tiên) hoặc N muỗi (quà chỉ định / theo xu). Luật ở game.js (mosquitoesForGift).
function handleDapMuoiGift({ nickname, profilePicture, giftId, giftName, giftImage, coinValue, repeatCount, source }) {
    const cfg = dapMuoiCfg();
    if (cfg.enabled === false) return;
    if (camGiftYields('dapmuoi', { giftId, giftName })) return;   // quà của game chơi cùng trong Game Camera
    const base = { nickname: nickname || '', profilePicture: profilePicture || '', giftName: giftName || '', image: giftImage || '', source: source || 'tiktok', ts: Date.now() };
    const action = DapMuoi.actionForGift(cfg, giftId, giftName);
    if (action) {
        const repeat = Math.max(1, Number(repeatCount) || 1);
        if (action.type === 'release') {
            // Thả muỗi theo hành động: combo ×N = N lượt thả (trần maxPerGift, mặc định 1000; muỗi xả dần theo nhịp sinh tới hết).
            const count = Math.min(Math.max(1, Number(cfg.maxPerGift) || 1000), Math.max(1, Math.floor(Number(action.params?.count) || 20)) * repeat);
            emitDapMuoiGift({ action: 'release', qty: 1, params: { count }, name: action.name, icon: action.icon, ...base });
        } else if (action.type === 'boss') {
            emitDapMuoiGift(dapMuoiBossPayload(action.params, repeat, { name: action.name, icon: action.icon, ...base }));
        } else {
            emitDapMuoiGift({ action: action.type, qty: Math.min(DAPMUOI_ACTION_MAX_REPEAT, repeat), params: action.params, name: action.name, icon: action.icon, ...base });
        }
        return;
    }
    const n = DapMuoi.mosquitoesForGift(cfg, giftId, giftName, coinValue, repeatCount);
    if (n <= 0) return;
    console.log(`[dapmuoi] ${base.nickname || '?'} → thả ${n} muỗi (gift ${giftId}, ${coinValue || 0}💎 ×${repeatCount || 1})`);
    emitDapMuoiGift({ action: 'release', qty: 1, params: { count: n }, name: 'Thả muỗi', icon: '🦟', ...base });
}

app.post('/api/dapmuoi/test', (req, res) => {
    const action = String(req.body?.action || '');
    if (!DapMuoi.ACTION_TYPES.includes(action)) return res.status(400).json({ error: 'action không hợp lệ' });
    const qty = Math.min(100, Math.max(1, Math.floor(Number(req.body?.qty) || 1)));
    // params gửi kèm (từ hành động trong panel / hotkey) được chuẩn hoá qua normalizeAction; thiếu → mặc định loại.
    const act = DapMuoi.normalizeAction({ type: action, params: req.body?.params }, 0);
    const base = { name: act.name, icon: act.icon, nickname: 'Thử nghiệm', profilePicture: '', giftName: 'Gửi thử', image: '', source: 'test', ts: Date.now() };
    emitDapMuoiGift(action === 'boss' ? dapMuoiBossPayload(act.params, qty, base) : { ...base, action, qty, params: act.params });
    res.json({ ok: true, action, qty });
});

app.post('/api/dapmuoi/control', (req, res) => {
    const cmd = String(req.body?.cmd || '');
    if (!['start', 'stop', 'reset', 'clear'].includes(cmd)) return res.status(400).json({ error: 'cmd không hợp lệ' });
    io.emit('gameCmd', { gameId: 'dapmuoi', cmd, payload: {}, seq: Date.now() });
    res.json({ ok: true });
});

// ====== 🏸 ĐÁ CẦU (port từ HP LIVE NPC) ======
// Engine public/games/dacau/game.js; quà gán đích danh trong cfg.gifts [{giftId, giftName, ball}] — chỉ so id.
// Bản này chưa có 💥 Rổ PHẠT (vé hiệu ứng khi cầu rơi) của NPC: fxIds luôn rỗng, overlay chỉ báo rơi.
app.get('/overlay/dacau', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'games', 'dacau', 'overlay.html'));
});
function daCauCfg() { return DaCau.normalizeConfig(appConfig.games.dacau || DaCau.defaultConfig()); }
function emitDaCau(type, count, base) {
    io.to('overlay').to('preview').emit('dacau:gift', { type, count, fxIds: [], nickname: base.nickname || '', profilePicture: base.profilePicture || '',
        giftName: base.giftName || '', image: base.giftImage || '', source: base.source || 'tiktok', ts: Date.now() });
}
function handleDaCauGift(base) {
    const cfg = daCauCfg();
    if (cfg.enabled === false || !base.giftId) return;
    if (camGiftYields('dacau', { giftId: base.giftId, giftName: base.giftName })) return;
    const hit = DaCau.ballsForGift(cfg, base.giftId, base.repeatCount);
    if (!hit) return;
    console.log(`[dacau] ${base.nickname || '?'} → tung ${hit.count} cầu ${hit.type} (gift ${base.giftId})`);
    emitDaCau(hit.type, hit.count, base);
}
app.post('/api/dacau/test', (req, res) => {
    const type = DaCau.TYPE_IDS.includes(req.body?.type) ? req.body.type : 'normal';
    const count = Math.min(DaCau.MAX_PER_GIFT, Math.max(1, Math.floor(Number(req.body?.count) || 1)));
    emitDaCau(type, count, { nickname: 'Thử nghiệm', profilePicture: '', giftName: 'Tung thử', giftImage: '', source: 'test' });
    res.json({ ok: true, type, count });
});
app.post('/api/dacau/control', (req, res) => {
    const cmd = String(req.body?.cmd || '');
    if (!['clear', 'reset'].includes(cmd)) return res.status(400).json({ error: 'cmd không hợp lệ' });
    io.emit('gameCmd', { gameId: 'dacau', cmd, payload: {}, seq: Date.now() });
    res.json({ ok: true });
});
setTimeout(() => camApplyHotkeys('dapmuoi'), 1500);

app.get('/api/games/bancung/livestate', (req, res) => {
    res.json(banCungSnapshot());
});

// Control endpoint — reset / setHp / damage / heal / revive / shield / start / stop / testShot
// Bảng preset cho panel tự tính "≈ N mũi là gục" theo số tim đang đặt.
app.get('/api/games/bancung/presets', (req, res) => res.json(BANCUNG_PRESETS));
app.post('/api/games/bancung/control', (req, res) => {
    const cmd = String(req.body?.cmd || '').toLowerCase();
    if (cmd === 'start') {
        if (!appConfig.games.bancung) appConfig.games.bancung = makeDefaultBanCungConfig();
        appConfig.games.bancung.sessionActive = true;
        saveAppConfig();
        // Reset session-scoped state for fresh start
        banCungState.sessionStartedAt = Date.now();
        banCungState.firstBloodUid = '';
        banCungState.userContrib = {};
        banCungState.comboCount = 0;
        banCungState.comboExpiresAt = 0;
        banCungState.bowCharge = 0;
        io.emit('gameConfig', { gameId: 'bancung', config: appConfig.games.bancung });
        io.emit('overlay:reload', { gameId: 'bancung' });
        broadcastBanCungState({ immediate: true });
        camApplyHotkeys('bancung');      // phím tắt Bắn Cung chỉ đăng ký khi phiên đang chạy → áp lại ngay
        console.log('[bancung] SESSION START');
    } else if (cmd === 'stop') {
        if (!appConfig.games.bancung) appConfig.games.bancung = makeDefaultBanCungConfig();
        // Emit podium just before stopping (for end-of-session display)
        if (appConfig.games.bancung.display?.showPodium !== false && banCungState.sessionStartedAt) {
            const survSec = Math.floor((Date.now() - banCungState.sessionStartedAt) / 1000);
            if (survSec > banCungState.survivalRecordSec) banCungState.survivalRecordSec = survSec;
            io.emit('bancung:podium', {
                ts: Date.now(),
                top3: banCungTopList(3),
                survivalSec: survSec,
                survivalRecordSec: banCungState.survivalRecordSec
            });
        }
        appConfig.games.bancung.sessionActive = false;
        saveAppConfig();
        io.emit('gameConfig', { gameId: 'bancung', config: appConfig.games.bancung });
        broadcastBanCungState({ immediate: true });
        camApplyHotkeys('bancung');      // dừng phiên → gỡ phím
        console.log('[bancung] SESSION STOP');
    } else if (cmd === 'preset') {
        const presetId = String(req.body?.preset || '').toLowerCase();
        const preset = BANCUNG_PRESETS[presetId];
        if (!preset) return res.status(400).json({ ok: false, error: 'preset không hợp lệ — easy|normal|hardcore|boss|sandbox' });
        if (!appConfig.games.bancung) appConfig.games.bancung = makeDefaultBanCungConfig();
        const cfg = appConfig.games.bancung;
        const d = cfg.display = cfg.display || {};
        // Apply top-level + display fields from preset (giữ số tim; regenPerSecond theo mốc 10 tim → nhân theo số tim)
        const hearts = Math.max(1, Number(cfg.maxHearts) || 10);
        for (const [k, v] of Object.entries(preset)) {
            const val = k === 'regenPerSecond' ? Math.round(v * hearts / 10 * 1000) / 1000 : v;
            if (k in d) d[k] = val;
            else cfg[k] = val;
        }
        d.headshotEnabled = (Number(preset.headshotChance) || 0) > 0;   // Boss 'Headshot' chỉ ăn khi bật vùng headshot
        cfg.preset = presetId;                                         // panel tô sáng preset đang dùng
        saveAppConfig();
        banCungApplyConfigToState(cfg);
        // Đổi độ khó → nạp đầy máu theo max mới.
        if (banCungAutoReviveTimer) { clearTimeout(banCungAutoReviveTimer); banCungAutoReviveTimer = null; }
        banCungState.deadAt = 0;
        banCungState.hp = banCungState.maxHp;
        banCungState.lastDamageAt = 0;
        io.emit('gameConfig', { gameId: 'bancung', config: cfg });
        broadcastBanCungState({ immediate: true });
        console.log(`[bancung] PRESET applied: ${presetId}`);
    } else if (cmd === 'reset') {
        banCungReset();
    } else if (cmd === 'sethp') {
        banCungSetHp(req.body?.hp);
    } else if (cmd === 'heal') {
        banCungDoHeal(Number(req.body?.hearts) || 1, null);
    } else if (cmd === 'damage') {
        // Simulate 1 shot không qua user
        const n = Math.max(1, parseInt(req.body?.shots, 10) || 1);
        banCungFireBurst(n, req.body?.uniqueId ? { uniqueId: req.body.uniqueId, nickname: req.body.nickname || req.body.uniqueId } : null, null);
    } else if (cmd === 'revive') {
        const cfg = appConfig.games.bancung || makeDefaultBanCungConfig();
        const h = Number(req.body?.hearts) || cfg.autoReviveHearts || 5;
        banCungDoRevive(h, null, false);
    } else if (cmd === 'shield') {
        banCungDoShield(Number(req.body?.durationSec) || 5, null);
    } else if (cmd === 'testgift') {
        handleBanCungGift({
            uniqueId: req.body?.uniqueId || 'tester',
            nickname: req.body?.nickname || 'Người Thử',
            profilePicture: req.body?.profilePicture || '',
            giftId: req.body?.giftId || '',
            giftName: req.body?.giftName || '',
            giftImage: req.body?.giftImage || '',
            coinValue: Number(req.body?.coinValue) || 0,
            repeatCount: req.body?.repeatCount || 1
        });
    } else if (cmd === 'killshot') {
        // Direct kill — for testing death/revive flow
        banCungState.hp = 0;
        banCungTriggerDeath();
        broadcastBanCungState({ immediate: true });
    } else {
        return res.status(400).json({ ok: false, error: 'cmd phải là start|stop|reset|setHp|heal|damage|revive|shield|testGift|killshot' });
    }
    res.json({ ok: true, state: banCungSnapshot() });
});

// ============================================================
// PK TikTok — upload / asset serve / trigger broadcast
// ============================================================
// Đường lưu file media: <DATA_DIR>/pktiktok-assets/<id>.<ext>. Tách khỏi appConfig
// để không phình app-config.json. Path tương đối khi serve qua /api/games/pktiktok/asset/<fn>.
const PKTIKTOK_ASSETS_DIR = path.join(DATA_DIR, 'pktiktok-assets');
if (!fs.existsSync(PKTIKTOK_ASSETS_DIR)) fs.mkdirSync(PKTIKTOK_ASSETS_DIR, { recursive: true });
const PKTIKTOK_ALLOWED_EXTS = ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a'];

// Upload — body là raw bytes (panel gửi qua fetch with Content-Type của file). Express.json sẽ
// bỏ qua vì không phải application/json. express.raw được attach inline cho route này.
app.post('/api/games/pktiktok/upload',
    express.raw({ limit: '30mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!PKTIKTOK_ALLOWED_EXTS.includes(ext)) {
            return res.status(400).json({ ok: false, error: 'invalid_ext' });
        }
        if (!req.body || !req.body.length) {
            return res.status(400).json({ ok: false, error: 'empty_body' });
        }
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const filename = `${id}.${ext}`;
        try {
            fs.writeFileSync(path.join(PKTIKTOK_ASSETS_DIR, filename), req.body);
        } catch (e) {
            return res.status(500).json({ ok: false, error: 'write_failed: ' + e.message });
        }
        res.json({ ok: true, filename, url: `/api/games/pktiktok/asset/${filename}` });
    }
);

app.get('/api/games/pktiktok/asset/:fn', (req, res) => {
    const safe = String(req.params.fn).replace(/[^a-z0-9._-]/gi, '');
    if (!safe || safe.includes('..')) return res.sendStatus(400);
    const p = path.join(PKTIKTOK_ASSETS_DIR, safe);
    if (!fs.existsSync(p)) return res.sendStatus(404);
    res.sendFile(p);
});

// ====== TIMER (THỜI GIAN) — media assets cho tính năng "Quà kích hoạt countdown" ======
const TIMER_ASSETS_DIR = path.join(DATA_DIR, 'timer-assets');
if (!fs.existsSync(TIMER_ASSETS_DIR)) fs.mkdirSync(TIMER_ASSETS_DIR, { recursive: true });
const TIMER_ALLOWED_EXTS = ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a'];

app.post('/api/games/timer/upload',
    express.raw({ limit: '30mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!TIMER_ALLOWED_EXTS.includes(ext)) {
            return res.status(400).json({ ok: false, error: 'invalid_ext' });
        }
        if (!req.body || !req.body.length) {
            return res.status(400).json({ ok: false, error: 'empty_body' });
        }
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const filename = `${id}.${ext}`;
        try {
            fs.writeFileSync(path.join(TIMER_ASSETS_DIR, filename), req.body);
        } catch (e) {
            return res.status(500).json({ ok: false, error: 'write_failed: ' + e.message });
        }
        res.json({ ok: true, filename, url: `/api/games/timer/asset/${filename}` });
    }
);

app.get('/api/games/timer/asset/:fn', (req, res) => {
    const safe = String(req.params.fn).replace(/[^a-z0-9._-]/gi, '');
    if (!safe || safe.includes('..')) return res.sendStatus(400);
    const p = path.join(TIMER_ASSETS_DIR, safe);
    if (!fs.existsSync(p)) return res.sendStatus(404);
    res.sendFile(p);
});

// Build payload + emit 'pktiktok:play' cho mọi overlay client (cả OBS browser source).
// Dùng CHUNG cho 3 nguồn fire: bấm tay (panel), phím tắt (app.js), và AUTO (server tự phát
// hiện event PK). Trước đây auto phải đi vòng qua panel client nên chỉ chạy khi panel đang mở;
// nay server emit thẳng → auto chạy kể cả khi app đang ở màn hình khác / panel chưa mở.
function pktiktokEmitPlay(key, source) {
    const cfg = appConfig.games.pktiktok;
    if (!cfg) return { ok: false, error: 'pktiktok config missing' };
    if (cfg.enabled === false) return { ok: false, error: 'pkfx_disabled' };
    const ev = (cfg.events || []).find(e => e.key === key);
    if (!ev) return { ok: false, error: 'event_not_found' };
    if (ev.enabled === false) return { ok: false, error: 'event_disabled' };
    if (!ev.mediaUrl) return { ok: false, error: 'no_media' };
    // Top-contributor user override (chỉ áp dụng cho phase win/lose khi PK kết thúc)
    let media = { url: ev.mediaUrl, type: ev.mediaType || '', name: '' };
    let topUser = null;
    const isResultPhase = (key === 'win' || key === 'lose');
    if (isResultPhase && pkLastTopContributor && Array.isArray(ev.topContributorRules) && ev.topContributorRules.length > 0) {
        const top = pkLastTopContributor;
        const topUidLower = String(top.uniqueId || '').toLowerCase().replace(/^@/, '');
        const rule = ev.topContributorRules.find(r => {
            const ruleUid = String(r.uniqueId || '').toLowerCase().replace(/^@/, '').trim();
            return ruleUid && ruleUid === topUidLower && r.mediaUrl;
        });
        if (rule) {
            media.url = rule.mediaUrl;
            media.type = rule.mediaType || '';
            media.name = rule.mediaName || '';
            topUser = top;
            console.log(`[pktiktok] TOP 1 rule MATCH for @${top.uniqueId} → override media to ${rule.mediaUrl}`);
        } else {
            console.log(`[pktiktok] TOP 1 @${top.uniqueId} không có rule riêng → dùng default media`);
        }
    }
    const payload = {
        key,
        label: ev.label,
        emoji: ev.emoji,
        mediaUrl: media.url,
        mediaType: media.type || guessMediaType(media.url),
        volume: ev.volume == null ? 100 : ev.volume,
        playbackRate: ev.playbackRate || 1.0,
        interruptCurrent: ev.interruptCurrent !== false,
        showLabel: !!(cfg.display && cfg.display.showLabel),
        source: source || 'manual',
        topUser: topUser ? { uniqueId: topUser.uniqueId, nickname: topUser.nickname, totalDiamond: topUser.totalDiamond } : null,
        ts: Date.now(),
    };
    io.emit('pktiktok:play', payload);
    if (isResultPhase && source === 'auto') pkLastTopContributor = null;   // đã dùng xong cho trận này
    return { ok: true, payload };
}
// Expose cho auto-drain nằm trong attachConnectionEvents (khác scope).
global.__pktiktokEmitPlay = pktiktokEmitPlay;

// Trigger 1 event PK TikTok — bấm tay từ panel hoặc phím tắt từ app.js.
// Path /trigger (KHÔNG /cmd) để tránh đụng generic route /api/games/:id/cmd ở line ~1014.
app.post('/api/games/pktiktok/trigger', (req, res) => {
    const cfg = appConfig.games.pktiktok;
    if (!cfg) return res.status(404).json({ ok: false, error: 'pktiktok config missing' });
    const { type, key, source } = req.body || {};
    if (type === 'trigger') {
        const r = pktiktokEmitPlay(key, source || 'manual');
        return res.json(r.ok ? { ok: true, payload: r.payload } : { ok: false, error: r.error });
    }
    if (type === 'stop') {
        io.emit('pktiktok:stop', { ts: Date.now() });
        return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'unknown_type' });
});

// ============================================================
// VIP WELCOME — upload / asset / trigger broadcast / queue manager
// ============================================================
// Cấu trúc tương tự pktiktok: assets folder riêng + route serve.
const VIPWELCOME_ASSETS_DIR = path.join(DATA_DIR, 'vipwelcome-assets');
if (!fs.existsSync(VIPWELCOME_ASSETS_DIR)) fs.mkdirSync(VIPWELCOME_ASSETS_DIR, { recursive: true });
const VIPWELCOME_ALLOWED_EXTS = ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'png', 'webp'];   // png/webp = khung avatar thẻ

app.post('/api/games/vipwelcome/upload',
    express.raw({ limit: '30mb', type: () => true }),
    (req, res) => {
        const ext = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (!VIPWELCOME_ALLOWED_EXTS.includes(ext)) {
            return res.status(400).json({ ok: false, error: 'invalid_ext' });
        }
        if (!req.body || !req.body.length) {
            return res.status(400).json({ ok: false, error: 'empty_body' });
        }
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const filename = `${id}.${ext}`;
        try {
            fs.writeFileSync(path.join(VIPWELCOME_ASSETS_DIR, filename), req.body);
        } catch (e) {
            return res.status(500).json({ ok: false, error: 'write_failed: ' + e.message });
        }
        res.json({ ok: true, filename, url: `/api/games/vipwelcome/asset/${filename}` });
    }
);

app.get('/api/games/vipwelcome/asset/:fn', (req, res) => {
    const safe = String(req.params.fn).replace(/[^a-z0-9._-]/gi, '');
    if (!safe || safe.includes('..')) return res.sendStatus(400);
    const p = path.join(VIPWELCOME_ASSETS_DIR, safe);
    if (!fs.existsSync(p)) return res.sendStatus(404);
    res.sendFile(p);
});

// ===== VIP Welcome queue + per-user cooldown =====
// Tracking khi nào (uniqueId, ruleId) được phép trigger lại — chống spam cùng 1 user.
const vipWelcomeCooldown = new Map();   // key="uid|ruleId" → tsExpire
// Hàng media: ưu tiên (test 2000 > @id vào phòng 1000 > @id trigger khác 500 > tất cả user 200 > bậc 100+LV),
// 1 mục/người; media VÀO PHÒNG chờ quá joinCard.mediaMaxWaitSec bị bỏ (thẻ đã hiện rồi), trigger khác giữ tới 5 phút.
// Thẻ vào phòng KHÔNG xếp hàng ở đây.
const vipMediaQueue = createVipMediaQueue();
const VIP_PRIORITY_TEST = 2000;
const VIP_PRIORITY_USER_RULE = 500;
const VIP_PRIORITY_GLOBAL = 200;   // quà/lên cấp/sub của mọi người — trên mọi bậc vào phòng (100+LV)
let vipWelcomeLastEmitTs = 0;            // mốc emit gần nhất (rate-limit perItemMinMs)
let vipWelcomeDrainTimer = null;
let vipWelcomeRecentLog = [];            // 50 entry gần nhất cho panel hiển thị
// === Playback-synced drain (serial theo danh sách, không chồng/không sót) ===
// Server gửi 1 item → chờ overlay báo 'vipwelcome:done' → mới gửi item kế. Nhờ vậy
// hàng đợi chạy đúng thứ tự, mỗi lượt chào phát xong mới tới lượt sau, panel "Hàng đợi (N)"
// phản ánh đúng số đang chờ. Có fallback timer phòng overlay đóng/treo giữa chừng.
let vipWelcomePlaying = false;           // đang chờ overlay phát xong 1 item
let vipWelcomePlaySeq = 0;               // seq tăng mỗi lần phát — chống ack cũ (stale)
let vipWelcomePlayFallbackTimer = null;  // overlay không ack (đóng/crash) → tự advance
let vipWelcomePlayTargets = new Set();   // socket.id các overlay đã nhận lượt media đang phát
const VIP_PLAY_FALLBACK_MS = 20000;      // clip chào ngắn (2-6s); 20s là dư an toàn

// === Session-scoped state ===
let vipSessionLastLevel = new Map();    // uniqueId(lower) → last seen level
let vipSessionSeen = new Set();         // uniqueId(lower) — đã từng có event trong session này
// VÀO / RA / VÀO LẠI (lib/vipwelcome/presence.js): mỗi tín hiệu vào phòng (member/barrage) là 1 lần vào
// thật; chỉ chặn trùng joinCard.antiDupSec + cooldown tự đặt. Hoạt động chỉ dùng để chào muộn.
const vipPresence = createVipPresence();
const vipPendingCards = createVipPendingCards({ maxAgeMs: 60000, maxItems: 500 });   // thẻ chờ overlay xác nhận
const vipLedger = createVipGiftLedger({ file: path.join(DATA_DIR, 'vipwelcome-ledger.json') });
// Tắt app ngay sau quà cuối → vẫn ghi sổ (lưu trễ 5s có thể chưa kịp chạy).
process.on('exit', () => { try { vipLedger.flushSync(); } catch (e) {} });
let vipCardSeq = 0;
// Giai đoạn 3 — sổ ghé phòng (khách quen) + gộp thẻ khi phòng đông
const vipVisits = createVipVisits({ file: path.join(DATA_DIR, 'vipwelcome-visits.json') });
process.on('exit', () => { try { vipVisits.flushSync(); } catch (e) {} });
const vipBatcher = createVipBatcher();
let vipBatchTimer = null;
const vipJoinLastMatch = new Map();   // key → { priority, cardId } của lần vào gần nhất (nâng thẻ khi tín hiệu trùng giàu hơn)
// === userId ↔ uniqueId cache ===
let vipSessionUserIdToUid = new Map();  // userId(string) → uniqueId
let vipSessionUidToUserId = new Map();  // uniqueId(lower) → userId
// Fire counter per ruleId — chỉ count session, reset khi resetSession/reconnect
let vipSessionRuleFireCount = new Map();   // ruleId (vd "user:r1abc") → count
// Đã cảnh báo "không rule khớp / profile tắt" cho uid nào — log 1 lần/phiên, chống spam
let vipSessionWarnedNoMatch = new Set();    // uniqueId(lower)

function resetVipSession() {
    vipSessionLastLevel.clear();
    vipSessionSeen.clear();
    vipPresence.reset();
    vipPendingCards.clear();
    vipJoinLastMatch.clear();
    vipBatcher.clear();
    if (vipBatchTimer) { clearTimeout(vipBatchTimer); vipBatchTimer = null; }
    vipSessionUserIdToUid.clear();
    vipSessionUidToUserId.clear();
    vipSessionRuleFireCount.clear();
    vipSessionWarnedNoMatch.clear();
}

// ===== Persistent userId↔uniqueId map (pre-warm VIP đã cấu hình) =====
// TikTok đôi khi gửi MEMBER chỉ có userId (thiếu uniqueId). Lần ĐẦU user vào phòng
// trong phiên, cache session rỗng → JOIN bị skip → "lúc nhận lúc không". Lưu mapping
// ra đĩa để phiên sau nạp lại: khách quen (VIP) resolve được ngay từ userId mà không
// cần chờ họ chat/like trước.
const VIPWELCOME_USERMAP_FILE = path.join(DATA_DIR, 'vipwelcome-usermap.json');
const VIPWELCOME_USERMAP_MAX = 3000;   // cap entry — giữ file nhỏ, chống phình vô hạn
let persistentUserIdToUid = new Map();   // userId(string) → uniqueId
let persistentUidToUserId = new Map();   // uniqueId(lower) → userId (chiều ngược, để key 1 người ổn định)
let vipUsermapSaveTimer = null;
let vipUsermapDirty = false;

function loadPersistentUserMap() {
    try {
        if (!fs.existsSync(VIPWELCOME_USERMAP_FILE)) return;
        const raw = JSON.parse(fs.readFileSync(VIPWELCOME_USERMAP_FILE, 'utf8'));
        const entries = Array.isArray(raw?.entries) ? raw.entries : [];
        for (const e of entries) {
            if (e && e.userId && e.uniqueId) {
                persistentUserIdToUid.set(String(e.userId), String(e.uniqueId));
                persistentUidToUserId.set(String(e.uniqueId).toLowerCase(), String(e.userId));
            }
        }
        console.log(`[vipwelcome] Nạp persistent userId↔uniqueId map: ${persistentUserIdToUid.size} entry`);
    } catch (e) {
        console.warn('[vipwelcome] Load usermap lỗi (bỏ qua):', e.message);
    }
}

function schedulePersistUserMapSave() {
    vipUsermapDirty = true;
    if (vipUsermapSaveTimer) return;
    vipUsermapSaveTimer = setTimeout(() => {
        vipUsermapSaveTimer = null;
        if (!vipUsermapDirty) return;
        vipUsermapDirty = false;
        try {
            // Cap size — xoá entry cũ nhất (Map giữ thứ tự chèn)
            while (persistentUserIdToUid.size > VIPWELCOME_USERMAP_MAX) {
                const oldest = persistentUserIdToUid.keys().next().value;
                persistentUserIdToUid.delete(oldest);
            }
            const entries = [];
            for (const [userId, uniqueId] of persistentUserIdToUid) entries.push({ userId, uniqueId });
            fs.writeFileSync(VIPWELCOME_USERMAP_FILE, JSON.stringify({ savedAt: new Date().toISOString(), entries }));
        } catch (e) {
            console.warn('[vipwelcome] Save usermap lỗi:', e.message);
        }
    }, 8000);
}

loadPersistentUserMap();

// Pre-warm: nạp mapping của các VIP ĐÃ CẤU HÌNH từ persistent map vào session cache
// → MEMBER lần đầu chỉ có userId vẫn resolve ra đúng VIP ngay, không cần chờ họ chat.
function warmVipSessionFromPersistent() {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg) return 0;
    const wanted = new Set();   // uniqueId(lower) của mọi userRule trong mọi profile
    for (const p of (cfg.profiles || [])) {
        for (const r of (p.userRules || [])) {
            const u = String(r.uniqueId || '').replace(/^@/, '').toLowerCase().trim();
            if (u) wanted.add(u);
        }
    }
    if (wanted.size === 0) return 0;
    let warmed = 0;
    for (const [userId, uniqueId] of persistentUserIdToUid) {
        const uidLower = String(uniqueId).toLowerCase();
        if (wanted.has(uidLower) && !vipSessionUserIdToUid.has(userId)) {
            vipSessionUserIdToUid.set(userId, uniqueId);
            vipSessionUidToUserId.set(uidLower, userId);
            warmed++;
        }
    }
    if (warmed > 0) console.log(`[vipwelcome] 🔥 Pre-warm ${warmed}/${wanted.size} VIP đã cấu hình từ cache đĩa (resolve userId→uniqueId ngay khi vào phòng).`);
    else console.log(`[vipwelcome] Pre-warm: ${wanted.size} VIP cấu hình, chưa có mapping đĩa (sẽ tự học sau lần đầu họ xuất hiện).`);
    return warmed;
}

// Uniqueid này có phải VIP đã cấu hình (tồn tại trong userRule của profile nào đó)?
function isConfiguredVipUid(uidLower) {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg || !uidLower) return false;
    for (const p of (cfg.profiles || [])) {
        for (const r of (p.userRules || [])) {
            if (String(r.uniqueId || '').replace(/^@/, '').toLowerCase().trim() === uidLower) return true;
        }
    }
    return false;
}

// Ghi nhớ mapping userId ↔ uniqueId từ bất kỳ event nào có cả 2 field
function rememberUserMapping(userId, uniqueId) {
    if (!userId || !uniqueId) return;
    const uid = String(uniqueId);
    const id = String(userId);
    if (!vipSessionUserIdToUid.has(id)) {
        vipSessionUserIdToUid.set(id, uid);
        vipSessionUidToUserId.set(uid.toLowerCase(), id);
        console.log(`[vipwelcome] Cache userId↔uniqueId: ${id} ↔ @${uid}`);
    }
    // Persist ra đĩa (pre-warm phiên sau). Ghi khi mới hoặc uniqueId đổi.
    if (persistentUserIdToUid.get(id) !== uid) {
        persistentUserIdToUid.set(id, uid);
        persistentUidToUserId.set(uid.toLowerCase(), id);
        schedulePersistUserMapSave();
    }
}

// Thử resolve uniqueId khi event chỉ có userId (vd: MEMBER event đôi khi thiếu uniqueId).
// Fallback sang persistent map → khách quen resolve được ngay cả ở phiên mới.
function resolveUniqueIdFromUserId(userId) {
    if (!userId) return null;
    return vipSessionUserIdToUid.get(String(userId)) || persistentUserIdToUid.get(String(userId)) || null;
}

// ===== THẺ VÀO PHÒNG — nối dây (logic thuần ở lib/vipwelcome/*) =====
function vipSignalCtx() {
    return { hostUserId: currentHostUserId };
}
function vipJoinCfg() {
    return appConfig.games.vipwelcome?.joinCard || vwTiers.makeDefaultJoinCard();
}
function vipHostKey() {
    return String(currentUsername || currentHostProfile?.uniqueId || appConfig.lastUsername || '_').replace(/^@/, '').toLowerCase();
}
// Key 1 người: userId (ổn định kể cả khi đổi @id); chỉ có @id thì quy đổi qua cache, không được thì 'u:<id>'.
function vipUserKey(user) {
    if (user?.userId) return String(user.userId);
    const uid = String(user?.uniqueId || '').replace(/^@/, '').toLowerCase().trim();
    if (!uid) return '';
    return vipSessionUidToUserId.get(uid) || persistentUidToUserId.get(uid) || 'u:' + uid;
}
// Người giả lập / thử (panel) — không được ghi vào map userId↔@id thật.
function vipIsFakeUserId(id) {
    return /^(sim|test:)/.test(String(id || ''));
}
// Bù @id từ cache userId↔uniqueId + ghi nhớ mapping. Trả key.
function vipPrepareUser(user) {
    if (!user) return '';
    if (vipIsFakeUserId(user.userId)) return String(user.userId);
    if (!user.uniqueId && user.userId) user.uniqueId = resolveUniqueIdFromUserId(user.userId) || '';
    rememberUserMapping(user.userId, user.uniqueId);
    // Từng ghi sổ ghé phòng theo @id (lúc chưa biết userId) → gộp về key userId, tránh 1 người 2 dòng trên BXH
    if (user.userId && user.uniqueId) {
        try { vipVisits.rekey(vipHostKey(), 'u:' + String(user.uniqueId).replace(/^@/, '').toLowerCase(), String(user.userId)); } catch (e) {}
    }
    return vipUserKey(user);
}
// Luật @id khớp lần đầu theo @id → nhớ userId để vẫn khớp khi người đó đổi @id.
function vipLearnRuleUserId(match, user) {
    if (match?.kind !== 'user' || !match.userRuleId || !user.userId || vipIsFakeUserId(user.userId)) return;
    const profile = (appConfig.games.vipwelcome?.profiles || []).find(p => p.id === match.profileId);
    const rule = (profile?.userRules || []).find(r => r.id === match.userRuleId);
    if (!rule || rule.userId) return;
    rule.userId = String(user.userId);
    console.log(`[vipwelcome] Nhớ userId ${rule.userId} cho luật @${rule.uniqueId} (đổi @id vẫn nhận ra)`);
    saveAppConfig();
}
// Panel gửi cả config từ bản đã tải trước đó (chưa có userId vừa học) → giữ lại userId nếu luật vẫn cùng @id.
function vipKeepLearnedUserIds(prevCfg, nextCfg) {
    const learned = new Map();
    for (const p of (prevCfg?.profiles || [])) {
        for (const r of (p.userRules || [])) {
            if (r?.id && r.userId) learned.set(r.id, { userId: r.userId, uid: String(r.uniqueId || '').replace(/^@/, '').toLowerCase() });
        }
    }
    for (const p of (nextCfg?.profiles || [])) {
        for (const r of (p.userRules || [])) {
            const l = r && !r.userId && learned.get(r.id);
            if (l && l.uid === String(r.uniqueId || '').replace(/^@/, '').toLowerCase()) r.userId = l.userId;
        }
    }
}
function vipAvatarUrl(url) {
    return url ? '/api/games/vipwelcome/avatar?u=' + encodeURIComponent(url) : '';
}
// Ai KHÔNG được ghi vào sổ ghé phòng: người xem ẩn danh (giữ ẩn danh), chính chủ phòng (không phải khách).
function vipNoVisit(user, key) {
    return !!user?.isEnigma || (!!currentHostUserId && String(key) === String(currentHostUserId));
}
function vipTtsVolume(jc) {
    const v = Number(jc?.tts?.volume);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 90;   // 0 = tắt tiếng thật, không về 90
}
function vipBuildCard(user, key, match, { late = false } = {}) {
    const jc = vipJoinCfg();
    const enigma = !!user.isEnigma;
    // Chốt kênh + buổi LÚC TẠO thẻ: overlay xác nhận muộn (sau khi ngắt LIVE) vẫn ghi đúng buổi, không tạo buổi "theo ngày" giả
    const host = vipHostKey(), room = vipRoomKey();
    const noVisit = vipNoVisit(user, key);
    const peek = noVisit ? null : vipVisits.peek(host, key, room);
    return {
        host, room, noVisit,
        visitNo: peek?.visitNo || 0,   // cho câu đọc {lần} kể cả khi tắt chip "lần ghé"
        id: 'c' + Date.now().toString(36) + (++vipCardSeq),
        key,
        user: {
            uniqueId: enigma ? '' : (user.uniqueId || ''),
            nickname: enigma ? 'Người xem ẩn danh' : (user.nickname || user.uniqueId || 'Người xem'),
            avatar: enigma ? '' : vipAvatarUrl(user.avatar),
            level: user.level || 0,
            fansLevel: user.fansLevel || 0,
            fansClubName: user.fansClubName || ''
        },
        roles: { mod: !!user.isModerator, sub: !!user.isSubscriber, friend: !!user.isFriend, top: user.topUserNo || 0 },
        title: match.title || '',
        skin: match.skin || 'violet',
        frameUrl: match.frameUrl || '',
        xu: vipLedger.get(vipHostKey(), key),
        // Khách quen: số SẼ ghi khi overlay xác nhận thẻ đã hiện (1 buổi LIVE chỉ đếm 1)
        visit: jc.showVisits === false ? null : peek,
        late,
        enterText: jc.enterText || 'VÀO PHÒNG',
        ruleLabel: match.label || '',
        priority: match.priority || 0   // thanh chào gọn: đủ tầng thì bỏ thanh ưu tiên thấp nhất trước
    };
}
function vipSendCard(card) {
    const now = Date.now();
    vipPendingCards.put(card, now);
    vipBatcher.noteSent(now);   // nhịp thẻ gần đây → quyết định gộp khi phòng đông
    if (vipOverlayCount() > 0) {
        io.to('overlay:vipwelcome').emit('vipwelcome:card', card);
        vipPendingCards.markSent(card.id, now);
    }
    const group = card.kind === 'group';
    pushVipWelcomeLog({
        ts: now, kind: card.late ? 'late' : (group ? 'group' : 'card'), ruleLabel: card.ruleLabel, eventType: 'join',
        uniqueId: group ? '' : card.user.uniqueId, nickname: group ? `${card.total} người` : card.user.nickname, level: group ? 0 : card.user.level
    });
}

// ===== Giai đoạn 3: buổi LIVE, sổ ghé phòng, BXH, gộp thẻ =====
// Buổi = roomId TikTok cấp mỗi lần phát; chưa có roomId (giả lập / chưa kết nối) → theo ngày.
function vipRoomKey() {
    return currentRoomId ? String(currentRoomId) : 'd' + new Date().toLocaleDateString('sv-SE');
}
function vipStartRoom() {
    try { vipVisits.startRoom(vipHostKey(), vipRoomKey()); } catch (e) { console.warn('[vipwelcome] sổ ghé phòng:', e.message); }
}
// host/room lấy từ thẻ (chốt lúc tạo) — KHÔNG đọc lại biến toàn cục lúc overlay xác nhận.
function vipRecordVisit(key, meta, host, room) {
    if (!key || vipIsFakeUserId(key) || meta?.noVisit || !host || !room) return;   // giả lập / ẩn danh / chủ phòng không vào sổ
    vipVisits.startRoom(host, room);
    vipVisits.record(host, key, room, { uniqueId: meta.uniqueId, nickname: meta.nickname, avatar: meta.avatar }, Date.now());
}
function vipBoardPayload() {
    const b = vipJoinCfg().board || {};
    const scope = b.scope === 'all' ? 'all' : 'month';
    return {
        title: b.title || 'KHÁCH QUEN CỦA PHÒNG', scope, skin: b.skin === 'amber' ? 'amber' : 'violet',
        items: vipVisits.top(vipHostKey(), { scope, limit: Math.max(3, Math.min(20, Number(b.limit) || 10)) }, Date.now())
    };
}
let vipBoardTimer = null;
function vipBoardChanged(immediate) {
    const send = () => { vipBoardTimer = null; io.to('overlay:vipwelcome-board').emit('vipwelcome:board', vipBoardPayload()); };
    if (immediate) { if (vipBoardTimer) clearTimeout(vipBoardTimer); return send(); }
    if (!vipBoardTimer) vipBoardTimer = setTimeout(send, 2000);
}
// Nhóm gộp đến hạn → 1 thẻ "A, B và N người khác vào phòng" (skin của người bậc cao nhất trong nhóm).
function vipFlushBatch() {
    vipBatchTimer = null;
    const g = vipBatcher.due(Date.now());
    if (g) {
        const top = g.items.reduce((a, b) => ((b.priority || 0) > (a.priority || 0) ? b : a), g.items[0]);
        const id = 'g' + Date.now().toString(36) + (++vipCardSeq);
        console.log(`[vipwelcome] Thẻ gộp: ${g.total} người (${g.items.slice(0, 3).map(m => m.nickname).join(', ')}…)`);
        vipSendCard({
            id, kind: 'group', key: 'group:' + id, keys: g.keys, total: g.total,
            members: g.members.map(m => ({ nickname: m.nickname, avatar: m.avatar })),
            metas: g.items.map(m => ({ key: m.key, uniqueId: m.uniqueId, nickname: m.nickname, avatar: m.avatar, host: m.host, room: m.room, noVisit: m.noVisit })),
            skin: top.skin || 'violet', enterText: vipJoinCfg().enterText || 'VÀO PHÒNG', ruleLabel: `Gộp ${g.total} người`,
            priority: 0   // thẻ gộp luôn nhường thanh người cụ thể
        });
    }
    vipScheduleBatchFlush();
}
function vipScheduleBatchFlush() {
    if (vipBatchTimer) return;
    const at = vipBatcher.pendingFlushAt();
    if (at) vipBatchTimer = setTimeout(vipFlushBatch, Math.max(0, at - Date.now()));
}
// Overlay vừa mở / nối lại → gửi thẻ còn chờ (overlay tự bỏ id đã hiện) + chạy tiếp hàng media.
function vipFlushPendingTo(socket) {
    const now = Date.now();
    for (const card of vipPendingCards.take(now)) {
        socket.emit('vipwelcome:card', card);
        vipPendingCards.markSent(card.id, now);
    }
    scheduleVipDrain();
}
function vipOnCardShown(id) {
    const card = vipPendingCards.ack(id);
    if (!card) return;
    const now = Date.now();
    try {
        if (card.kind === 'group') {
            for (const m of (card.metas || [])) { vipPresence.markWelcomed(m.key, now); vipRecordVisit(m.key, m, m.host, m.room); }
        } else {
            vipPresence.markWelcomed(card.key, now);
            vipRecordVisit(card.key, { ...card.user, noVisit: card.noVisit }, card.host, card.room);
        }
        vipBoardChanged();
    } catch (e) { console.warn('[vipwelcome] ghi lần ghé:', e.message); }
}

// Tín hiệu vào phòng THẬT (member / barrage / host) → thẻ + media.
function vipHandleJoinSignal(signal) {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg || cfg.enabled === false || !signal?.user) return;
    const jc = vipJoinCfg();
    if (jc.enabled === false) return;
    const user = signal.user;
    const key = vipPrepareUser(user);
    if (!key) { console.log(`[vipwelcome] ⚠ JOIN bỏ qua: thiếu cả userId lẫn @id (source=${signal.source})`); return; }
    const now = Date.now();
    const antiDupMs = Math.max(1, Number(jc.antiDupSec) || 10) * 1000;
    const match = vwTiers.matchJoin(cfg, user);
    const decision = vipPresence.onJoinSignal(key, now, { antiDupMs, cooldownMs: (match?.cooldownSec || 0) * 1000, source: signal.source });
    const who = `@${user.uniqueId || '?'} "${user.nickname || ''}" LV${user.level} FAN${user.fansLevel}`;
    const prev = vipJoinLastMatch.get(key);
    if (decision === 'welcome') vipJoinLastMatch.delete(key);
    if (!match) return;   // không bậc/luật nào khớp — vẫn ghi nhận đã vào để không "chào muộn" sai
    if (decision === 'cooldown') {
        vipJoinLastMatch.set(key, { priority: Infinity, cardId: '' });   // tín hiệu trùng sau đó không được "nâng" qua cooldown
        console.log(`[vipwelcome] JOIN đang cooldown (${signal.source}): ${who}`);
        pushVipWelcomeLog({ ts: now, kind: 'cooldown', ruleLabel: match.label, eventType: 'join', uniqueId: user.uniqueId, nickname: user.nickname, level: user.level });
        return;
    }
    if (decision === 'dup') {
        // Cùng 1 lần vào, tín hiệu thứ 2 (thường là banner barrage) mang LV/FAN đầy đủ hơn member:
        // tín hiệu đầu không khớp gì, hoặc khớp bậc thấp hơn mà thẻ chưa kịp hiện / còn nằm trong nhóm gộp
        // chưa phát → nâng thành thẻ riêng đúng bậc (rút khỏi nhóm gộp).
        const inBatch = !!prev && prev.cardId === '' && vipBatcher.has(key);
        const upgrade = !prev || (match.priority > prev.priority && (vipPendingCards.has(prev.cardId) || inBatch));
        if (!upgrade) { console.log(`[vipwelcome] JOIN trùng tín hiệu (${signal.source}): ${who}`); return; }
        console.log(`[vipwelcome] JOIN nâng thẻ theo ${signal.source}: ${who} → ${match.label}`);
    } else {
        console.log(`[vipwelcome] JOIN (${signal.source}) ${who} → ${match.label}${match.media ? ' + media' : ''} (lần vào thứ ${vipPresence.get(key)?.joinCount || 1})`);
    }
    vipLearnRuleUserId(match, user);
    // Phòng đông + bậc thấp → vào thẻ gộp "A, B và N người khác" (không media/đọc tên). Người chỉ định không bao giờ gộp.
    if (decision === 'welcome' && match.kind !== 'user') {
        const b = jc.batch || {};
        const mode = vipBatcher.decide(now, {
            priority: match.priority, enabled: b.enabled !== false, maxStack: Number(jc.card?.maxStack) || 3,
            threshold: vwTiers.TIER_PRIORITY_BASE + Math.max(0, Number(b.belowTierLevel) || 0)
        });
        if (mode === 'batch') {
            const enigma = !!user.isEnigma;
            vipBatcher.add({
                key, priority: match.priority, skin: match.skin, uniqueId: enigma ? '' : user.uniqueId,
                nickname: enigma ? 'Người xem ẩn danh' : (user.nickname || user.uniqueId || 'Người xem'),
                avatar: enigma ? '' : vipAvatarUrl(user.avatar),
                host: vipHostKey(), room: vipRoomKey(), noVisit: vipNoVisit(user, key)
            }, now);
            vipJoinLastMatch.set(key, { priority: match.priority, cardId: '' });
            vipScheduleBatchFlush();
            return;
        }
    }
    if (vipBatcher.has(key)) vipBatcher.remove(key);   // đang nằm trong nhóm gộp chưa phát → chỉ hiện thẻ riêng
    const card = vipBuildCard(user, key, match);
    vipJoinLastMatch.set(key, { priority: match.priority, cardId: card.id });
    vipSendCard(card);
    const userInfo = {
        uniqueId: user.uniqueId, nickname: user.nickname, level: user.level, profilePicture: vipAvatarUrl(user.avatar),
        verified: !!user.verified, fansLevel: user.fansLevel, topUserNo: user.topUserNo, isSubscriber: user.isSubscriber, isModerator: user.isModerator
    };
    // Đọc tên: gắn LUÔN vào lượt media của người đó (overlay đọc ngay khi clip kết thúc, cùng 1 lượt) → không ai chen
    // vào giữa, không hết hạn riêng. Không có media thì đọc tên là 1 lượt riêng cùng mức ưu tiên.
    let ttsText = '';
    if (jc.tts?.enabled !== false && match.tts?.enabled) {
        ttsText = vipRenderTts(match.tts.template, {
            nickname: user.nickname, uniqueId: user.uniqueId, title: match.title, level: user.level,
            fansLevel: user.fansLevel, visitNo: card.visitNo, isEnigma: user.isEnigma
        });
    }
    if (match.media) {
        const payload = buildVipPayload({
            source: match.kind === 'user' ? 'userRule' : 'joinTier', ruleId: match.ruleId, ruleLabel: match.label,
            eventType: 'join', media: match.media, message: '', user: userInfo
        });
        if (ttsText) { payload.ttsUrl = vipTtsUrl(ttsText); payload.ttsVolume = vipTtsVolume(jc); payload.ttsText = ttsText; }
        enqueueVipWelcomePayload(payload, match.priority, key);
    } else if (ttsText) {
        enqueueVipWelcomePayload(buildVipPayload({
            source: 'tts', ruleId: match.ruleId + ':tts', ruleLabel: match.label + ' (đọc tên)', eventType: 'join',
            media: { mediaUrl: vipTtsUrl(ttsText), mediaType: 'tts', volume: vipTtsVolume(jc) }, message: ttsText, user: userInfo
        }), match.priority, key + '|tts');
    }
}
function vipTtsUrl(text) {
    return '/api/live-translate/tts?lang=vi&text=' + encodeURIComponent(text);
}

// Hoạt động (chat/tim/quà/follow/share/top) — KHÔNG phải vào lại; chỉ chào muộn người TikTok không báo vào.
function vipHandleActivity(rawUser, opts) {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg || cfg.enabled === false || !rawUser) return;
    const jc = vipJoinCfg();
    if (jc.enabled === false) return;
    const user = vwSignals.readUser(rawUser, vipSignalCtx(), opts);
    const key = vipPrepareUser(user);
    if (!key) return;
    if (vipPresence.onActivity(key, Date.now(), { lateEnabled: jc.lateWelcome !== false }) !== 'late') return;
    const match = vwTiers.matchJoin(cfg, user);
    if (!match) return;
    console.log(`[vipwelcome] Chào muộn @${user.uniqueId || '?'} "${user.nickname || ''}" → ${match.label}`);
    vipSendCard(vipBuildCard(user, key, match, { late: true }));
}

function vipLedgerAddGift(g, xu) {
    const key = vipUserKey({ userId: g.userId, uniqueId: g.uniqueId });
    if (!key) return;
    const host = vipHostKey();
    // Từng cộng theo @id (chưa biết userId) → gộp về key userId
    if (g.userId && g.uniqueId) vipLedger.rekey(host, 'u:' + String(g.uniqueId).toLowerCase(), key);
    vipLedger.add(host, key, xu, { uniqueId: g.uniqueId, nickname: g.nickname });
}

// Chẩn đoán: ghi payload thô member/barrage để kiểm chứng trường TikTok gửi trong buổi LIVE thật.
const VIPWELCOME_RAW_LOG = path.join(DATA_DIR, 'logs', 'vipwelcome-raw.jsonl');
const VIPWELCOME_RAW_LOG_MAX = 5 * 1024 * 1024;
function vipDiagLog(kind, data) {
    if (!vipJoinCfg().diagnostics) return;
    try {
        fs.mkdirSync(path.dirname(VIPWELCOME_RAW_LOG), { recursive: true });
        try { if (fs.statSync(VIPWELCOME_RAW_LOG).size > VIPWELCOME_RAW_LOG_MAX) fs.renameSync(VIPWELCOME_RAW_LOG, VIPWELCOME_RAW_LOG + '.1'); } catch (e) {}
        const line = JSON.stringify({ ts: new Date().toISOString(), kind, data }, (k, v) => {
            if (v && (v instanceof Uint8Array || v?.type === 'Buffer')) return `[bytes ${v.length ?? v.data?.length ?? 0}]`;
            if (typeof v === 'bigint') return v.toString();
            return v;
        });
        fs.appendFileSync(VIPWELCOME_RAW_LOG, line.slice(0, 50000) + '\n');
    } catch (e) { /* chẩn đoán không được làm hỏng luồng chính */ }
}


function pruneVipCooldown() {
    const now = Date.now();
    for (const [k, ts] of vipWelcomeCooldown) {
        if (ts <= now) vipWelcomeCooldown.delete(k);
    }
}

function vipWelcomeMatchesUserRule(rule, ctx) {
    // Trả về { matched, reason } để caller có thể log lý do không match (debug)
    if (!rule || rule.enabled === false) return { matched: false, reason: 'rule_disabled' };
    if (!rule.mediaUrl) return { matched: false, reason: 'no_media' };
    if (rule.trigger !== ctx.eventType) return { matched: false, reason: `trigger_mismatch (rule=${rule.trigger}, event=${ctx.eventType})` };
    const targetId = String(rule.uniqueId || '').replace(/^@/, '').toLowerCase().trim();
    if (!targetId) return { matched: false, reason: 'rule_uniqueId_empty' };
    const userId = String(ctx.uniqueId || '').replace(/^@/, '').toLowerCase().trim();
    if (userId !== targetId) return { matched: false, reason: `uniqueId_mismatch (rule="${targetId}" vs event="${userId}")` };
    // User chỉ định: BỎ filter cấp độ + kim cương — đã chỉ định ID rồi nên không cần lọc thêm.
    return { matched: true, reason: 'ok' };
}

// Điều kiện phụ cho rule "Tất cả user" — dựa trên dữ liệu THẬT TikTok gửi kèm user.
// Key mới (tuỳ chọn, panel có thể bật): requireTopUser, minFansLevel, requireSubscriber, requireFollowing.
function vipGlobalRulePasses(g, userInfo) {
    if (!g || !g.enabled || !g.mediaUrl) return false;
    if ((userInfo.level || 0) < (g.minLevel || 0)) return false;
    if (g.requireVerified && !userInfo.verified) return false;
    if (g.requireTopUser && !userInfo.isTopUser) return false;
    if ((Number(g.minFansLevel) || 0) > 0 && (userInfo.fansLevel || 0) < Number(g.minFansLevel)) return false;
    if (g.requireSubscriber && !userInfo.isSubscriber) return false;
    if (g.requireFollowing && !userInfo.isFollowing) return false;
    return true;
}

function renderVipMessage(template, ctx) {
    if (!template) return '';
    return String(template)
        .replace(/\{rank\}/g, ctx.topUserNo ? `TOP ${ctx.topUserNo}` : (ctx.isTopUser ? 'TOP' : ''))
        .replace(/\{fans\}/g, ctx.fansLevel ? `Fan Lv${ctx.fansLevel}` : '')
        .replace(/\{sub\}/g, ctx.isSubscriber ? '⭐ Sub' : '')
        .replace(/\{mod\}/g, ctx.isModerator ? '🛡 Mod' : '')
        .replace(/\{diamond\}/g, String(ctx.diamondCount || 0))
        .replace(/\{nickname\}/g, ctx.nickname || ctx.uniqueId || 'User')
        .replace(/\{uniqueId\}/g, ctx.uniqueId || '')
        .replace(/\{level\}/g, String(ctx.level || 0))
        .replace(/\{gift\}/g, ctx.giftName || '')
        .replace(/\{count\}/g, String(ctx.repeatCount || 1))
        .replace(/\{verified\}/g, ctx.verified ? '✓' : '');
}

function pushVipWelcomeLog(entry) {
    vipWelcomeRecentLog.unshift(entry);
    if (vipWelcomeRecentLog.length > 50) vipWelcomeRecentLog.length = 50;
    io.emit('vipwelcome:log', entry);
}

// Số overlay OBS/preview đang kết nối (join room 'overlay' khi subscribe).
// Đếm ĐÚNG overlay Chào Mừng VIP (room riêng). Trước đây đếm room 'overlay' chung → mở overlay game khác
// mà không mở VIP là server chờ ack 20s/lượt cho người không bao giờ trả lời.
function vipOverlayCount() {
    try { return io.sockets.adapter.rooms.get('overlay:vipwelcome')?.size || 0; } catch (e) { return 0; }
}

// Reset toàn bộ state phát (dùng khi stop / clearQueue / tắt game): xoá hàng media + thẻ chờ + huỷ chờ ack.
function resetVipPlaybackState() {
    vipMediaQueue.clear();
    vipPendingCards.clear();
    vipWelcomePlaying = false;
    vipWelcomePlaySeq++;   // vô hiệu hoá mọi ack đang treo
    if (vipWelcomeDrainTimer) { clearTimeout(vipWelcomeDrainTimer); vipWelcomeDrainTimer = null; }
    if (vipWelcomePlayFallbackTimer) { clearTimeout(vipWelcomePlayFallbackTimer); vipWelcomePlayFallbackTimer = null; }
}

// Overlay báo đã phát xong (hoặc lỗi) 1 item → tới lượt item kế. Chống ack cũ bằng seq.
function vipWelcomeOnItemDone(seq) {
    if (!vipWelcomePlaying) return;
    if (seq != null && Number(seq) !== vipWelcomePlaySeq) return;   // ack của item cũ — bỏ qua
    if (vipWelcomePlayFallbackTimer) { clearTimeout(vipWelcomePlayFallbackTimer); vipWelcomePlayFallbackTimer = null; }
    vipWelcomePlaying = false;
    if (vipMediaQueue.size() > 0) scheduleVipDrain();
}

// Overlay đọc được thời lượng clip → giãn hạn chờ ack cho clip dài (mặc định chỉ 20s).
const VIP_PLAY_MAX_MS = 10 * 60 * 1000;
function vipWelcomeOnItemPlaying(seq, durationMs) {
    if (!vipWelcomePlaying || Number(seq) !== vipWelcomePlaySeq) return;
    const d = Number(durationMs);
    if (!Number.isFinite(d) || d <= 0) return;
    const waitMs = Math.min(VIP_PLAY_MAX_MS, d + 5000);
    if (waitMs <= VIP_PLAY_FALLBACK_MS) return;
    if (vipWelcomePlayFallbackTimer) clearTimeout(vipWelcomePlayFallbackTimer);
    vipWelcomePlayFallbackTimer = setTimeout(() => {
        vipWelcomePlayFallbackTimer = null;
        console.log(`[vipwelcome] ⚠ Overlay không báo phát xong sau ${Math.round(waitMs / 1000)}s — tự chuyển lượt kế.`);
        vipWelcomePlaying = false;
        if (vipMediaQueue.size() > 0) scheduleVipDrain();
    }, waitMs);
}

function scheduleVipDrain() {
    if (vipWelcomeDrainTimer) return;
    if (vipWelcomePlaying) return;             // đang phát → chờ overlay ack, không drain chồng
    if (vipMediaQueue.size() === 0) return;
    // Chưa có overlay → GIỮ hàng (mục quá mediaMaxWaitSec tự bỏ); overlay mở lên thì vipFlushPendingTo drain tiếp.
    if (vipOverlayCount() === 0) return;
    const cfg = appConfig.games.vipwelcome || {};
    // Khoảng nghỉ nhỏ giữa 2 lượt chào (cho overlay reset khung hình). User chỉnh được.
    const gap = Math.max(0, (cfg.queue?.perItemMinMs) ?? 200);
    vipWelcomeDrainTimer = setTimeout(() => {
        vipWelcomeDrainTimer = null;
        drainVipQueueOne();
    }, gap);
}

function vipMediaMaxWaitMs() {
    return Math.max(5, Number(vipJoinCfg().mediaMaxWaitSec) || 30) * 1000;
}
const VIP_NON_JOIN_MAX_WAIT_MS = 5 * 60 * 1000;
function vipItemMaxWaitMs(item) {
    return item?.payload?.eventType === 'join' ? vipMediaMaxWaitMs() : VIP_NON_JOIN_MAX_WAIT_MS;
}

function drainVipQueueOne() {
    if (vipWelcomePlaying) return;             // an toàn kép — chưa phát xong item trước
    if (vipOverlayCount() === 0) return;
    const { item, expired } = vipMediaQueue.next(Date.now(), vipItemMaxWaitMs);
    for (const x of expired) {
        console.log(`[vipwelcome] ⏱ Bỏ media chờ quá ${vipItemMaxWaitMs(x) / 1000}s: ${x.payload.ruleLabel} @${x.payload.user?.uniqueId || '?'}`);
        pushVipWelcomeLog({ ts: Date.now(), kind: 'expire', ruleLabel: x.payload.ruleLabel, eventType: x.payload.eventType, uniqueId: x.payload.user?.uniqueId, nickname: x.payload.user?.nickname, level: x.payload.user?.level || 0 });
    }
    if (!item) { io.emit('vipwelcome:queue', { size: 0 }); return; }
    vipWelcomeLastEmitTs = Date.now();
    // Verify asset file exists nếu URL là local asset — log warning nếu thiếu
    let mediaExists = true;
    const u = String(item.payload.mediaUrl || '');
    const assetMatch = u.match(/^\/api\/games\/vipwelcome\/asset\/(.+)$/);
    if (assetMatch) {
        const filePath = path.join(VIPWELCOME_ASSETS_DIR, assetMatch[1]);
        mediaExists = fs.existsSync(filePath);
        if (!mediaExists) {
            console.log(`[vipwelcome] ⚠ MEDIA FILE MISSING khi drain: ${filePath} — overlay sẽ không phát được. Tải lại file vào rule "${item.payload.ruleLabel}".`);
        }
    }
    const seq = ++vipWelcomePlaySeq;
    item.payload.seq = seq;                    // overlay echo lại seq này khi phát xong
    item.payload.preloadNext = vipMediaQueue.list()[0]?.payload?.mediaUrl || '';   // overlay tải trước clip kế
    console.log(`[vipwelcome] 🎬 DRAIN → overlay: rule="${item.payload.ruleLabel}" user=@${item.payload.user?.uniqueId || '?'} mediaUrl=${item.payload.mediaUrl} type=${item.payload.mediaType} (file ok: ${mediaExists}, overlays: ${vipOverlayCount()}, còn chờ: ${vipMediaQueue.size()})`);
    // Count fire per rule (chỉ khi media tồn tại — coi như đã thật sự phát)
    if (mediaExists && item.payload.ruleId) {
        vipSessionRuleFireCount.set(item.payload.ruleId, (vipSessionRuleFireCount.get(item.payload.ruleId) || 0) + 1);
    }
    // Nhớ overlay nào ĐANG giữ lượt này: OBS refresh → overlay mới vào trước khi overlay cũ rời,
    // nên đếm số overlay không đủ — cần biết mọi overlay nhận lượt đã rời hết hay chưa.
    try { vipWelcomePlayTargets = new Set(io.sockets.adapter.rooms.get('overlay:vipwelcome') || []); } catch (e) { vipWelcomePlayTargets = new Set(); }
    io.to('overlay:vipwelcome').emit('vipwelcome:play', item.payload);
    io.emit('vipwelcome:queue', { size: vipMediaQueue.size() });
    pushVipWelcomeLog({
        ts: Date.now(),
        kind: mediaExists ? 'play' : 'mediaMissing',
        ruleLabel: item.payload.ruleLabel || item.payload.source || '',
        eventType: item.payload.eventType,
        uniqueId: item.payload.user?.uniqueId,
        nickname: item.payload.user?.nickname,
        level: item.payload.user?.level || 0,
        mediaUrl: item.payload.mediaUrl
    });
    // CHỜ overlay báo phát xong (serial thật). Fallback nếu overlay chết giữa chừng.
    vipWelcomePlaying = true;
    vipWelcomePlayFallbackTimer = setTimeout(() => {
        vipWelcomePlayFallbackTimer = null;
        console.log(`[vipwelcome] ⚠ Overlay không báo phát xong sau ${VIP_PLAY_FALLBACK_MS / 1000}s (đóng/treo?) — tự chuyển lượt kế.`);
        vipWelcomePlaying = false;
        if (vipMediaQueue.size() > 0) scheduleVipDrain();
    }, VIP_PLAY_FALLBACK_MS);
}

// priority: số (cao ra trước) — xem VIP_PRIORITY_*; key: 1 mục/người (vào lại thì thay mục cũ).
function enqueueVipWelcomePayload(payload, priority, key) {
    const cfg = appConfig.games.vipwelcome || {};
    const maxLen = Math.max(1, cfg.queue?.maxLen || 50);
    vipMediaQueue.push({ key: key || '', priority: Number(priority) || 0, ts: Date.now(), payload });
    for (const dropped of vipMediaQueue.trim(maxLen)) {
        pushVipWelcomeLog({ ts: Date.now(), kind: 'drop', ruleLabel: `Hàng đầy (${maxLen}) → bỏ ${dropped.payload.ruleLabel}`, dropped: 1 });
    }
    io.emit('vipwelcome:queue', { size: vipMediaQueue.size() });
    scheduleVipDrain();
}

function buildVipPayload({ source, ruleId, ruleLabel, eventType, media, message, user, gift }) {
    return {
        source,
        ruleId: ruleId || '',
        ruleLabel: ruleLabel || '',
        eventType,
        mediaUrl: media.mediaUrl,
        mediaType: media.mediaType || guessMediaType(media.mediaUrl),
        volume: media.volume == null ? 100 : media.volume,
        labelStyle: media.labelStyle || '',   // rule-level override → overlay applyLabelStyle ưu tiên
        message: message || '',
        user: user || null,
        gift: gift || null,
        ts: Date.now()
    };
}

function guessMediaType(url) {
    const u = String(url || '').toLowerCase();
    if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|flac)(\?|$)/.test(u)) return 'audio';
    return '';
}

// Trả về true nếu ĐÃ đẩy 1 payload vào queue; false nếu bỏ qua (no media / cooldown).
function checkAndEnqueueVip(opts) {
    const { ruleId, source, ruleLabel, eventType, media, messageTemplate, user, gift } = opts;
    if (!media || !media.mediaUrl) return false;
    // Cooldown CHỈ áp dụng cho gift/Lên cấp (chống spam tặng quà liên tục).
    // 'join' không đi qua đây nữa (thẻ vào phòng: vipHandleJoinSignal + presence).
    const cfg = appConfig.games.vipwelcome || {};
    if (eventType !== 'join') {
        const cooldownMs = Math.max(0, (cfg.queue?.perUserCooldownSec || 60) * 1000);
        if (cooldownMs > 0 && user?.uniqueId) {
            const k = (user.uniqueId || '').toLowerCase() + '|' + ruleId;
            const exp = vipWelcomeCooldown.get(k);
            if (exp && exp > Date.now()) {
                pushVipWelcomeLog({
                    ts: Date.now(), kind: 'cooldown',
                    ruleLabel, eventType,
                    uniqueId: user.uniqueId, nickname: user.nickname,
                    level: user.level || 0
                });
                return false;
            }
            vipWelcomeCooldown.set(k, Date.now() + cooldownMs);
        }
    }
    const ctx = { ...user, giftName: gift?.giftName, diamondCount: gift?.diamondCount, repeatCount: gift?.repeatCount };
    const message = renderVipMessage(messageTemplate, ctx);
    // User-specific rule (chỉ định TikTok ID) = PRIORITY → drain trước global
    const priority = source === 'userRule' ? VIP_PRIORITY_USER_RULE : VIP_PRIORITY_GLOBAL;
    // Forward rule's labelStyle override (nếu có) qua media object → buildVipPayload
    const mediaWithStyle = { ...media, labelStyle: media.labelStyle || '' };
    enqueueVipWelcomePayload(buildVipPayload({ source, ruleId, ruleLabel, eventType, media: mediaWithStyle, message, user, gift }), priority, user?.uniqueId ? 'r:' + String(user.uniqueId).toLowerCase() + '|' + ruleId : '');
    return true;
}

function handleVipWelcomeEvent(eventType, evt) {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg || cfg.enabled === false) return 0;
    if (eventType === 'join') return 0;   // vào phòng đi đường riêng: vipHandleJoinSignal (thẻ + bậc + presence)
    pruneVipCooldown();
    let enqueuedCount = 0;              // số effect thật sự đẩy vào queue
    const x = evt.extra || {};
    const userInfo = {
        uniqueId: evt.uniqueId, nickname: evt.nickname,
        level: evt.level || 0, profilePicture: pickAvatarUrl(evt.profilePicture),
        verified: !!evt.verified,
        // Dữ liệu THẬT TikTok gửi kèm (xem extractTikTokUser) — dùng cho điều kiện rule + placeholder tin nhắn
        isTopUser: !!x.isTopUser, topUserNo: Number(x.topUserNo) || 0,
        fansLevel: Number(x.fansLevel) || 0, fansClubName: x.fansClubName || '',
        isSubscriber: !!x.isSubscriber, isModerator: !!x.isModerator, isFollowing: !!x.isFollowing
    };
    const giftInfo = eventType === 'gift' ? {
        giftName: evt.giftName, giftPicture: evt.giftPicture,
        diamondCount: evt.diamondCount || 0, repeatCount: evt.repeatCount || 1
    } : null;

    // === LEVEL-UP DETECTION cho gift event ===
    // Chỉ fire "Lên cấp" khi level user thật sự TĂNG so với lần thấy trước trong session này.
    // Lần đầu thấy user trong session = treat as level-up tới level hiện tại.
    let leveledUp = false;
    if (eventType === 'gift' && evt.uniqueId) {
        const k = String(evt.uniqueId).toLowerCase();
        const prev = vipSessionLastLevel.has(k) ? vipSessionLastLevel.get(k) : -1;
        const curr = userInfo.level || 0;
        if (prev < 0 || curr > prev) {
            leveledUp = true;
            console.log(`[vipwelcome] LEVEL-UP detected: @${evt.uniqueId} ${prev < 0 ? '(lần đầu thấy)' : prev} → ${curr}`);
        }
        if (curr > prev) vipSessionLastLevel.set(k, curr);
    }
    if (evt.uniqueId) vipSessionSeen.add(String(evt.uniqueId).toLowerCase());

    // Iterate qua TẤT CẢ profiles có enabled=true — nhiều người dùng chung máy có thể bật nhóm
    // của mình song song. Mỗi profile namespace ruleId riêng để cooldown không đè chéo.
    for (const profile of (cfg.profiles || [])) {
        if (profile.enabled === false) continue;
        const pfx = 'p:' + profile.id + ':';
        const profileLabel = profile.name || 'Nhóm';
        // 1. User-specific rules trong profile này
        //    - Nếu trigger='join': fire khi user chỉ định vào phòng
        //    - Nếu trigger='gift' (Lên cấp): fire khi user chỉ định lên cấp
        for (const rule of (profile.userRules || [])) {
            const m = vipWelcomeMatchesUserRule(rule, { eventType, ...evt });
            if (!m.matched) {
                // Debug log — chỉ log khi rule có uniqueId khớp một phần (cùng người target) để
                // tránh spam log với mọi rule khác. Cụ thể: chỉ log nếu eventType khớp + rule có
                // ID + ID rule và event đều có chữ trùng (cùng tên cơ sở).
                const ruleUid = String(rule.uniqueId || '').toLowerCase().replace(/^@/, '');
                const evtUid = String(evt.uniqueId || '').toLowerCase().replace(/^@/, '');
                if (rule.trigger === eventType && ruleUid && evtUid && (ruleUid === evtUid || ruleUid.includes(evtUid) || evtUid.includes(ruleUid))) {
                    console.log(`[vipwelcome] User rule SKIP for @${evt.uniqueId}: ${m.reason}  (rule="${profileLabel}/@${rule.uniqueId}" trigger=${rule.trigger})`);
                }
                continue;
            }
            // Với trigger 'gift', user-specific chỉ fire khi thật sự lên cấp
            if (rule.trigger === 'gift' && !leveledUp) {
                console.log(`[vipwelcome] User rule SKIP (gift no level-up) for @${evt.uniqueId}`);
                continue;
            }
            console.log(`[vipwelcome] User rule MATCH for @${evt.uniqueId}: rule="${profileLabel}/@${rule.uniqueId}" trigger=${rule.trigger}`);
            if (checkAndEnqueueVip({
                ruleId: pfx + 'user:' + rule.id,
                source: 'userRule',
                ruleLabel: `[${profileLabel}] @${rule.uniqueId}`,
                eventType,
                media: rule,
                messageTemplate: rule.message,
                user: userInfo,
                gift: giftInfo
            })) enqueuedCount++;
        }
        // 2. Global rule (toàn bộ user) — có thể filter theo verified (tích xanh)
        if (eventType === 'gift') {
            const g = profile.globalGift;
            // Global "Lên cấp": chỉ fire khi user thật sự lên cấp + level >= minLevel + (optional verified)
            if (leveledUp && vipGlobalRulePasses(g, userInfo)) {
                if (checkAndEnqueueVip({
                    ruleId: pfx + 'global:gift',
                    source: 'globalGift',
                    ruleLabel: `[${profileLabel}] Tất cả user${g.requireVerified ? ' ✓' : ''} (Lên cấp)`,
                    eventType: 'gift',
                    media: g,
                    messageTemplate: g.message,
                    user: userInfo,
                    gift: giftInfo
                })) enqueuedCount++;
            }
        } else if (eventType === 'subscribe') {
            // Đăng ký kênh (MEMBER action=3) — rule global tuỳ chọn profile.globalSubscribe
            const g = profile.globalSubscribe;
            if (vipGlobalRulePasses(g, userInfo)) {
                if (checkAndEnqueueVip({
                    ruleId: pfx + 'global:subscribe',
                    source: 'globalSubscribe',
                    ruleLabel: `[${profileLabel}] Tất cả user (Đăng ký kênh)`,
                    eventType: 'subscribe',
                    media: g,
                    messageTemplate: g.message,
                    user: userInfo
                })) enqueuedCount++;
            }
        }
    }
    return enqueuedCount;
}

// Trigger API — panel gọi để test 1 rule (manual / test-all / stop / clear queue).
app.post('/api/games/vipwelcome/trigger', (req, res) => {
    const cfg = appConfig.games.vipwelcome;
    if (!cfg) return res.status(404).json({ ok: false, error: 'vipwelcome config missing' });
    const { type, payload } = req.body || {};
    if (type === 'test') {
        // payload: { profileId, ruleType:'user'|'globalJoin'|'globalGift'|'globalSubscribe', ruleId?,
        //            uniqueId?, nickname?, level?, verified?, isTopUser?, topUserNo?, fansLevel?, isSubscriber?, isModerator?, isFollowing?, diamondCount? }
        // profileId default = activeProfileId nếu không truyền
        const profileId = payload?.profileId || cfg.activeProfileId;
        const profile = (cfg.profiles || []).find(p => p.id === profileId);
        if (!profile) return res.json({ ok: false, error: 'profile_not_found' });
        const profileLabel = profile.name || 'Nhóm';
        let media = null, ruleLabel = '', eventType = 'join', messageTemplate = '';
        if (payload?.ruleType === 'user') {
            const rule = (profile.userRules || []).find(r => r.id === payload.ruleId);
            if (!rule) return res.json({ ok: false, error: 'rule_not_found' });
            if ((rule.trigger || 'join') === 'join') {
                // Thử luật @id vào phòng = thẻ + media như thật (bỏ qua chống trùng để bấm thử liên tục được)
                vipShowTestJoin({ uniqueId: String(rule.uniqueId || 'tester').replace(/^@/, ''), nickname: payload?.nickname || rule.uniqueId || 'Người Thử', level: Number(payload?.level) || 30, fansLevel: Number(payload?.fansLevel) || 5 }, {
                    kind: 'user', ruleId: 'p:' + profile.id + ':user:' + rule.id, title: rule.title || 'VIP', skin: rule.skin || 'violet',
                    frameUrl: rule.frameUrl || '', media: rule.mediaUrl ? { mediaUrl: rule.mediaUrl, mediaType: rule.mediaType, volume: rule.volume } : null,
                    priority: VIP_PRIORITY_TEST, label: `[${profileLabel}] Thử @${String(rule.uniqueId || "").replace(/^@/, "")}`
                });
                return res.json({ ok: true });
            }
            if (!rule.mediaUrl) return res.json({ ok: false, error: 'no_media' });
            media = rule; ruleLabel = `[${profileLabel}] @${rule.uniqueId}`;
            eventType = rule.trigger || 'join';
            messageTemplate = rule.message;
        } else if (payload?.ruleType === 'globalJoin') {
            if (!profile.globalJoin?.mediaUrl) return res.json({ ok: false, error: 'no_media' });
            media = profile.globalJoin; ruleLabel = `[${profileLabel}] Test: Global Join`;
            eventType = 'join';
            messageTemplate = profile.globalJoin.message;
        } else if (payload?.ruleType === 'globalGift') {
            if (!profile.globalGift?.mediaUrl) return res.json({ ok: false, error: 'no_media' });
            media = profile.globalGift; ruleLabel = `[${profileLabel}] Test: Global Gift`;
            eventType = 'gift';
            messageTemplate = profile.globalGift.message;
        } else if (payload?.ruleType === 'globalSubscribe') {
            if (!profile.globalSubscribe?.mediaUrl) return res.json({ ok: false, error: 'no_media' });
            media = profile.globalSubscribe; ruleLabel = `[${profileLabel}] Test: Global Subscribe`;
            eventType = 'subscribe';
            messageTemplate = profile.globalSubscribe.message;
        } else {
            return res.json({ ok: false, error: 'unknown_ruleType' });
        }
        const fakeUser = {
            uniqueId: payload?.uniqueId || 'tester',
            nickname: payload?.nickname || 'Người Thử',
            level: payload?.level || 99,
            verified: !!payload?.verified,
            profilePicture: '',
            // Panel gửi kèm (fakeTestUserFields) → TEST hiện đúng {rank}{fans}{sub}{mod} như event thật
            isTopUser: !!payload?.isTopUser, topUserNo: Number(payload?.topUserNo) || 0,
            fansLevel: Number(payload?.fansLevel) || 0,
            isSubscriber: !!payload?.isSubscriber || eventType === 'subscribe',
            isModerator: !!payload?.isModerator, isFollowing: !!payload?.isFollowing
        };
        const fakeDiamond = Number(payload?.diamondCount) || 0;
        const fakeGift = eventType === 'gift' ? {
            giftName: payload?.giftName || 'Quà thử', giftPicture: '',
            diamondCount: fakeDiamond,
            repeatCount: 1
        } : null;
        const message = renderVipMessage(messageTemplate, { ...fakeUser, giftName: fakeGift?.giftName, diamondCount: fakeDiamond, repeatCount: fakeGift?.repeatCount });
        enqueueVipWelcomePayload(buildVipPayload({
            source: 'manual', ruleId: payload?.ruleId || '', ruleLabel,
            eventType, media, message, user: fakeUser, gift: fakeGift
        }), VIP_PRIORITY_TEST);
        return res.json({ ok: true });
    }
    if (type === 'testTier') {
        // ▶ Thử của 1 bậc: hiện ĐÚNG bậc đó (giả lập theo LV/FAN có thể rơi vào bậc khác cùng ngưỡng)
        const profile = (cfg.profiles || []).find(p => p.id === (payload?.profileId || cfg.activeProfileId));
        const t = (profile?.joinTiers || []).find(x => x.id === payload?.tierId);
        if (!t) return res.json({ ok: false, error: 'tier_not_found' });
        vipShowTestJoin({ uniqueId: 'nguoi_thu', nickname: 'Thử ' + t.name, level: t.minLevel || 0, fansLevel: t.minFans || 0 }, {
            kind: 'tier', ruleId: 'p:' + profile.id + ':tier:' + t.id, title: t.name, skin: t.skin, frameUrl: t.frameUrl || '',
            media: t.mediaUrl ? { mediaUrl: t.mediaUrl, mediaType: t.mediaType, volume: t.volume } : null,
            priority: VIP_PRIORITY_TEST, label: `[${profile.name || 'Nhóm'}] Thử bậc ${t.name}`
        });
        return res.json({ ok: true });
    }
    if (type === 'stop' || type === 'clearAll') {
        // clearAll = phím tắt "xoá hết": dừng mục đang phát, xoá thẻ trên màn hình, hàng chờ, nhóm gộp đang mở
        resetVipPlaybackState();
        vipBatcher.clear();
        if (vipBatchTimer) { clearTimeout(vipBatchTimer); vipBatchTimer = null; }
        io.emit('vipwelcome:stop', { ts: Date.now() });
        io.emit('vipwelcome:queue', { size: 0 });
        return res.json({ ok: true });
    }
    if (type === 'skip') {
        // Bỏ qua video / âm thanh / giọng đọc đang phát → overlay dừng mục đó và báo xong, hàng chạy tiếp
        io.to('overlay:vipwelcome').emit('vipwelcome:skip', { seq: vipWelcomePlaySeq });
        return res.json({ ok: true, playing: vipWelcomePlaying });
    }
    if (type === 'clearQueue') {
        resetVipPlaybackState();
        io.emit('vipwelcome:queue', { size: 0 });
        return res.json({ ok: true });
    }
    if (type === 'resetCooldown') {
        vipWelcomeCooldown.clear();
        return res.json({ ok: true });
    }
    if (type === 'clearLog') {
        vipWelcomeRecentLog = [];
        io.emit('vipwelcome:logCleared', { ts: Date.now() });
        return res.json({ ok: true });
    }
    if (type === 'resetSession') {
        resetVipSession();
        vipWelcomeCooldown.clear();
        return res.json({ ok: true });
    }
    if (type === 'reloadOverlay') {
        // Force overlay reload (giải quyết cache OBS browser source khi update)
        io.emit('vipwelcome:reload', { ts: Date.now() });
        return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'unknown_type' });
});

// Status per user-rule (trigger Vào phòng): panel hiện "đã vào N lần / đã chào / chưa thấy".
app.get('/api/games/vipwelcome/user-status', (req, res) => {
    const cfg = appConfig.games.vipwelcome || {};
    const now = Date.now();
    const out = {};
    for (const profile of (cfg.profiles || [])) {
        for (const rule of (profile.userRules || [])) {
            const uid = String(rule.uniqueId || '').replace(/^@/, '').toLowerCase().trim();
            if (!uid) continue;
            const key = rule.userId ? String(rule.userId) : vipUserKey({ uniqueId: uid });
            const st = vipPresence.get(key);
            let status = 'idle';
            if (st?.lastWelcomedAt) status = 'welcomed';
            else if (st?.lastSignalAt) status = 'detected';
            out[rule.id] = {
                uniqueId: rule.uniqueId,
                profileId: profile.id,
                profileName: profile.name,
                status,
                joinCount: st?.joinCount || 0,
                // Đã có tín hiệu vào phòng > 15s mà overlay chưa xác nhận hiện thẻ → cảnh báo
                detectedButNotPlayed: !!(st?.lastDecision === 'welcome' && st.lastSignalAt && (!st.lastWelcomedAt || st.lastWelcomedAt < st.lastSignalAt) && now - st.lastSignalAt > 15000),
                secondsSinceSignal: st?.lastSignalAt ? Math.round((now - st.lastSignalAt) / 1000) : null,
                secondsSinceWelcome: st?.lastWelcomedAt ? Math.round((now - st.lastWelcomedAt) / 1000) : null,
                fireCount: vipSessionRuleFireCount.get('p:' + profile.id + ':user:' + rule.id) || 0
            };
        }
    }
    res.json({ now, overlays: vipOverlayCount(), statuses: out });
});

app.get('/api/games/vipwelcome/queue', (req, res) => {
    res.json({
        size: vipMediaQueue.size(),
        pendingCards: vipPendingCards.size(),
        items: vipMediaQueue.list().map(it => ({
            ruleLabel: it.payload.ruleLabel,
            eventType: it.payload.eventType,
            uniqueId: it.payload.user?.uniqueId,
            nickname: it.payload.user?.nickname,
            level: it.payload.user?.level || 0,
            priority: it.priority,
            ts: it.ts
        })),
        recent: vipWelcomeRecentLog
    });
});

// Thẻ + media thử (panel ▶ Thử) — KHÔNG qua presence để bấm liên tục vẫn hiện.
function vipShowTestJoin(user, match) {
    const u = { userId: '', avatar: '', fansClubName: '', isModerator: false, isSubscriber: false, isFriend: false, topUserNo: 0, isEnigma: false, ...user };
    const key = 'test:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    vipSendCard(vipBuildCard(u, key, match));
    if (match.media) {
        enqueueVipWelcomePayload(buildVipPayload({
            source: 'manual', ruleId: match.ruleId || '', ruleLabel: match.label, eventType: 'join', media: match.media, message: '',
            user: { uniqueId: u.uniqueId, nickname: u.nickname, level: u.level, profilePicture: '' }
        }), VIP_PRIORITY_TEST, key);
    }
}

// Giả lập người vào phòng — đi ĐÚNG đường thật (tier-match + presence + thẻ + media).
// mode: 'one' | 'burst' (10 người) | 'rejoin' (vào → banner trùng bị gộp → ra rồi vào lại sau 3s)
let vipSimSeq = 0;
function vipSimUser(p, i) {
    const n = ++vipSimSeq;
    const enigma = !!p.enigma;
    return {
        userId: 'sim' + (p.simId || (Date.now().toString(36) + n)),
        uniqueId: String(p.uniqueId || ('nguoi_thu_' + n)).replace(/^@/, ''),
        nickname: p.nickname || ('Người thử ' + n),
        avatar: '',
        level: p.level != null ? Math.max(0, Number(p.level) || 0) : Math.floor(Math.random() * 50),
        fansLevel: p.fansLevel != null ? Math.max(0, Number(p.fansLevel) || 0) : Math.floor(Math.random() * 21),
        fansClubName: '', isModerator: !!p.isModerator, isSubscriber: !!p.isSubscriber, isFriend: !!p.isFriend,
        isFollowing: !!p.isFriend, topUserNo: Number(p.topUserNo) || 0, isEnigma: enigma, verified: false
    };
}
app.post('/api/games/vipwelcome/simulate', express.json(), (req, res) => {
    const p = req.body || {};
    const source = ['member', 'barrage-grade', 'barrage-fans', 'barrage-enigma'].includes(p.source) ? p.source : 'member';
    const mode = p.mode || 'one';
    if (mode === 'burst') {
        for (let i = 0; i < 10; i++) {
            const u = vipSimUser({ ...p, level: undefined, fansLevel: undefined, uniqueId: undefined, nickname: undefined }, i);
            setTimeout(() => vipHandleJoinSignal({ source, user: u }), i * 150);
        }
        return res.json({ ok: true, mode, count: 10 });
    }
    if (mode === 'rejoin') {
        const u = vipSimUser(p, 0);
        const gapMs = 3000;
        vipHandleJoinSignal({ source, user: { ...u } });
        // Banner của CÙNG lần vào (khác nguồn, trong cửa sổ gộp) — phải bị gộp
        setTimeout(() => vipHandleJoinSignal({ source: source === 'member' ? 'barrage-grade' : 'member', user: { ...u } }), 1500);
        setTimeout(() => vipHandleJoinSignal({ source, user: { ...u } }), gapMs);
        return res.json({ ok: true, mode, expect: `2 thẻ: lúc 0s và ${gapMs / 1000}s (banner 1.5s bị gộp)` });
    }
    vipHandleJoinSignal({ source, user: vipSimUser(p, 0) });
    res.json({ ok: true, mode: 'one' });
});

// Sổ xu — tổng xu người xem đã tặng kênh đang kết nối (cộng dồn mọi buổi LIVE).
// Sổ ghé phòng — BXH khách quen theo kênh (panel + overlay BXH dùng chung)
app.get('/api/games/vipwelcome/visits', (req, res) => {
    const scope = req.query.scope === 'all' ? 'all' : 'month';
    res.json({
        host: vipHostKey(), scope,
        items: vipVisits.top(vipHostKey(), { scope, q: String(req.query.q || ''), limit: Math.min(500, Number(req.query.limit) || 100) }, Date.now())
    });
});
app.post('/api/games/vipwelcome/visits', express.json(), (req, res) => {
    if (req.body?.action === 'reset') { vipVisits.reset(vipHostKey()); vipBoardChanged(true); return res.json({ ok: true }); }
    res.status(400).json({ ok: false, error: 'bad_action' });
});
app.get('/api/games/vipwelcome/board', (req, res) => res.json(vipBoardPayload()));

app.get('/api/games/vipwelcome/ledger', (req, res) => {
    const host = String(req.query.host || vipHostKey());
    res.json({ host, items: vipLedger.list(host, { q: String(req.query.q || ''), limit: Math.min(1000, Number(req.query.limit) || 200) }) });
});
app.post('/api/games/vipwelcome/ledger', express.json(), (req, res) => {
    const { action, key, xu } = req.body || {};
    const host = String(req.body?.host || vipHostKey());
    if (action === 'set' && key) { vipLedger.set(host, String(key), xu); return res.json({ ok: true }); }
    if (action === 'reset') { vipLedger.reset(host); return res.json({ ok: true }); }
    res.status(400).json({ ok: false, error: 'bad_action' });
});

// Avatar qua server: link CDN TikTok có hạn → cache đĩa theo đường dẫn ảnh (bỏ query ký); chỉ host TikTok
// (chống SSRF), https, ≤ 2MB, image/*. Lỗi gì cũng trả avatar mặc định để thẻ không có ô trống.
const VIPWELCOME_AVATAR_DIR = path.join(DATA_DIR, 'vipwelcome-avatars');
const VIPWELCOME_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const VIPWELCOME_AVATAR_MAX_FILES = 500;
const VIPWELCOME_AVATAR_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ibyteimg\.com|byteimg\.com|muscdn\.com)$/i;
const VIPWELCOME_DEFAULT_AVATAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#2b1f6b"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="25" r="11" fill="#fff" fill-opacity=".85"/><path d="M12 58c2-12 10-18 20-18s18 6 20 18z" fill="#fff" fill-opacity=".85"/></svg>';
let vipAvatarWrites = 0;
function vipPruneAvatarCache() {
    try {
        const files = fs.readdirSync(VIPWELCOME_AVATAR_DIR).map(f => {
            const p = path.join(VIPWELCOME_AVATAR_DIR, f);
            return { p, t: fs.statSync(p).mtimeMs };
        }).sort((a, b) => a.t - b.t);
        for (let i = 0; i < files.length - VIPWELCOME_AVATAR_MAX_FILES; i++) fs.unlinkSync(files[i].p);
    } catch (e) {}
}
// Ảnh avatar chỉ nhận định dạng raster (không SVG — SVG chạy được script trên origin của app).
const VIPWELCOME_AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
function vipAvatarHeaders(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
}
function vipSendDefaultAvatar(res) {
    vipAvatarHeaders(res);
    res.set('Cache-Control', 'no-store').type('image/svg+xml').send(VIPWELCOME_DEFAULT_AVATAR);
}
function vipAvatarUrlAllowed(u) {
    return u && u.protocol === 'https:' && VIPWELCOME_AVATAR_HOSTS.test(u.hostname);
}
// Tự theo redirect (tối đa 3 bước) và kiểm host TRƯỚC mỗi bước — không để CDN chuyển hướng ra host lạ.
async function vipFetchAvatar(url) {
    for (let hop = 0; hop < 4; hop++) {
        const r = await fetch(url.href, { redirect: 'manual', signal: AbortSignal.timeout(6000) });
        if (r.status >= 300 && r.status < 400) {
            let next;
            try { next = new URL(r.headers.get('location') || '', url); } catch (e) { return null; }
            if (!vipAvatarUrlAllowed(next)) return null;
            url = next;
            continue;
        }
        return r.ok ? r : null;
    }
    return null;
}
// Đọc body theo luồng, dừng ngay khi vượt trần (server không gửi Content-Length vẫn không nuốt RAM).
async function vipReadCapped(r, maxBytes) {
    const reader = r.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { try { await reader.cancel(); } catch (e) {} return null; }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}
app.get('/api/games/vipwelcome/avatar', async (req, res) => {
    let url;
    try { url = new URL(String(req.query.u || '')); } catch (e) { return vipSendDefaultAvatar(res); }
    if (!vipAvatarUrlAllowed(url)) return vipSendDefaultAvatar(res);
    const id = crypto.createHash('sha1').update(url.hostname + url.pathname).digest('hex');
    try {
        fs.mkdirSync(VIPWELCOME_AVATAR_DIR, { recursive: true });
        const hit = fs.readdirSync(VIPWELCOME_AVATAR_DIR).find(f => f.startsWith(id + '.'));
        if (hit) {
            vipAvatarHeaders(res);
            return res.set('Cache-Control', 'public, max-age=86400').sendFile(path.join(VIPWELCOME_AVATAR_DIR, hit));
        }
        const r = await vipFetchAvatar(url);
        if (!r) return vipSendDefaultAvatar(res);
        const type = String(r.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
        const ext = VIPWELCOME_AVATAR_TYPES[type];
        if (!ext || Number(r.headers.get('content-length') || 0) > VIPWELCOME_AVATAR_MAX_BYTES) return vipSendDefaultAvatar(res);
        const buf = await vipReadCapped(r, VIPWELCOME_AVATAR_MAX_BYTES);
        if (!buf || !buf.length) return vipSendDefaultAvatar(res);
        fs.writeFileSync(path.join(VIPWELCOME_AVATAR_DIR, id + '.' + ext), buf);
        if (++vipAvatarWrites % 50 === 0) vipPruneAvatarCache();
        vipAvatarHeaders(res);
        res.set('Cache-Control', 'public, max-age=86400').type(type).send(buf);
    } catch (e) {
        vipSendDefaultAvatar(res);
    }
});


// ====== 🔊 SoundFX — đã chuyển sang app HP SoundEffects.exe (WPF) ======
// Module soundboard web cũ đã gỡ bỏ; Electron main mở app WPF độc lập qua nút 🎵.

// ====== 🎬 OBS Bridge — REST API ======
// Tab "Hiệu ứng OBS" trong Cài đặt gọi các endpoint này để config + test.

// GET /api/obs-bridge/config — lấy config + status + queue hiện tại
app.get('/api/obs-bridge/config', (req, res) => {
    const cfg = appConfig.obsBridge || {};
    // Mật khẩu OBS WebSocket chỉ trả cho máy này (hoặc client LAN đã có token) — bind 0.0.0.0 mà
    // trả nguyên văn thì mọi máy trong LAN đọc được.
    const trusted = requestIsTrusted(req);
    res.json({
        enabled: cfg.enabled !== false,
        url: cfg.url || '',
        password: trusted ? (cfg.password || '') : '',
        passwordSet: !!cfg.password,
        autoConnect: !!cfg.autoConnect,
        mapping: Array.isArray(cfg.mapping) ? cfg.mapping : [],
        groupsDisabled: Array.isArray(cfg.groupsDisabled) ? cfg.groupsDisabled : [],
        status: obsBridge.getStatus(),
        queue: obsBridgeQueueStatus()
    });
});

// GET /api/obs-bridge/lua-duration?hotkey=effect_xxx&scene=... — gợi ý duration (ms) theo hotkey hoặc tên Scene
app.get('/api/obs-bridge/lua-duration', (req, res) => {
    const hotkey = String(req.query.hotkey || '').trim();
    const scene = String(req.query.scene || '').trim();
    const ms = obsBridgeSuggestDurationMs(hotkey, scene);
    res.json({ hotkey, scene, ms, suggested: ms > 0 });
});

// ====== 📚 LUA Sync — REST API ======
// Helper: augment LUA state với mapping count (cho UI badge "Đã thêm")
function augmentLuaStateWithMapping(state) {
    const mappings = (appConfig.obsBridge && Array.isArray(appConfig.obsBridge.mapping))
        ? appConfig.obsBridge.mapping : [];
    state.luas = state.luas.map(lua => {
        const matched = mappings.filter(m => m.hotkey === lua.hotkey);
        return {
            ...lua,
            inMappingCount: matched.length,
            inMappingFilledCount: matched.filter(m => m.giftId && m.giftId !== '').length
        };
    });
    return state;
}

// GET /api/lua-sync/status — get full state (luas list, status, cache dir)
app.get('/api/lua-sync/status', (req, res) => {
    res.json({
        ok: true,
        config: {
            manifestUrlConfigured: !!(appConfig.luaSync && appConfig.luaSync.manifestUrl),
            autoCheckEnabled: !!(appConfig.luaSync && appConfig.luaSync.autoCheckEnabled),
            autoCheckIntervalSec: (appConfig.luaSync && appConfig.luaSync.autoCheckIntervalSec) || 300,
        },
        state: augmentLuaStateWithMapping(luaSync.getFullState())
    });
});

// POST /api/lua-sync/check — fetch manifest from hpvn.media
app.post('/api/lua-sync/check', async (req, res) => {
    try {
        await luaSync.fetchManifest();
        res.json({ ok: true, state: augmentLuaStateWithMapping(luaSync.getFullState()) });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, state: augmentLuaStateWithMapping(luaSync.getFullState()) });
    }
});

// POST /api/lua-sync/download — download specific LUA
// Body: { luaId }
app.post('/api/lua-sync/download', express.json(), async (req, res) => {
    const luaId = String(req.body?.luaId || '').trim();
    if (!luaId) return res.status(400).json({ ok: false, error: 'Thiếu luaId' });
    try {
        const r = await luaSync.downloadLua(luaId);
        res.json({ ok: true, ...r, state: augmentLuaStateWithMapping(luaSync.getFullState()) });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/lua-sync/download-all — download tất cả LUAs trong manifest
app.post('/api/lua-sync/download-all', async (req, res) => {
    try {
        const results = await luaSync.downloadAll();
        const okCount = results.filter(r => r.ok).length;
        res.json({ ok: true, results, okCount, failCount: results.length - okCount,
            state: augmentLuaStateWithMapping(luaSync.getFullState()) });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// PUT /api/lua-sync/config — update auto-check settings
app.put('/api/lua-sync/config', express.json(), (req, res) => {
    const body = req.body || {};
    if (!appConfig.luaSync) appConfig.luaSync = {};
    if (typeof body.autoCheckEnabled === 'boolean') {
        appConfig.luaSync.autoCheckEnabled = body.autoCheckEnabled;
    }
    if (typeof body.autoCheckIntervalSec === 'number') {
        appConfig.luaSync.autoCheckIntervalSec = Math.max(30, Math.min(3600, Math.floor(body.autoCheckIntervalSec)));
    }
    saveAppConfig();
    // Restart auto-check
    if (appConfig.luaSync.autoCheckEnabled) {
        luaSync.startAutoCheck(appConfig.luaSync.autoCheckIntervalSec);
    } else {
        luaSync.stopAutoCheck();
    }
    res.json({ ok: true, config: appConfig.luaSync });
});

// POST /api/lua-sync/add-to-mapping — tự tạo mapping entry cho LUA đã tải
// Body: { luaId, group? }
// SECURITY: KHÔNG expose path, chỉ tạo entry với hotkey + actionName + cooldown
app.post('/api/lua-sync/add-to-mapping', express.json(), (req, res) => {
    const luaId = String(req.body?.luaId || '').trim();
    const group = String(req.body?.group || '📚 LUA Effects').trim().slice(0, 40);
    if (!luaId) return res.status(400).json({ ok: false, error: 'Thiếu luaId' });

    const state = luaSync.getFullState();
    const lua = state.luas.find(l => l.id === luaId);
    if (!lua) return res.status(404).json({ ok: false, error: 'LUA không có trong manifest' });
    if (lua.status !== 'latest') {
        return res.status(400).json({ ok: false, error: 'LUA chưa tải về — bấm Tải trước rồi thử lại' });
    }
    if (!lua.hotkey) {
        return res.status(400).json({ ok: false, error: 'LUA thiếu hotkey trong manifest — không thể tạo mapping' });
    }

    if (!appConfig.obsBridge) appConfig.obsBridge = {};
    if (!Array.isArray(appConfig.obsBridge.mapping)) appConfig.obsBridge.mapping = [];

    // Check duplicate (cùng hotkey + chưa có giftId)
    const existingEmpty = appConfig.obsBridge.mapping.find(
        m => m.hotkey === lua.hotkey && (!m.giftId || m.giftId === '')
    );
    if (existingEmpty) {
        return res.json({
            ok: true,
            duplicate: true,
            mapping: existingEmpty,
            message: `⚠ Đã có mapping trống cho "${lua.name}" — chọn quà cho nó thay vì tạo mới`
        });
    }

    const newMapping = {
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        giftId: '',                       // user picks gift later
        giftName: '',
        giftImage: '',
        actionName: lua.name || lua.id,
        hotkey: lua.hotkey,
        cooldownMs: Math.max(0, Number(lua.durationMs) || 0),
        group: group,
        enabled: true
    };
    appConfig.obsBridge.mapping.push(newMapping);
    saveAppConfig();
    res.json({
        ok: true,
        mapping: newMapping,
        message: `✓ Đã thêm "${lua.name}" vào Mapping → giờ chỉ chọn quà`
    });
});

// ====== 🔄 OBS Settings Sync API ======

// GET /api/obs-settings/scene-collections — list .json files trong OBS scenes folder
app.get('/api/obs-settings/scene-collections', (req, res) => {
    try {
        const collections = obsSettings.listSceneCollections();
        res.json({ ok: true, collections, scenesDir: obsSettings.scenesDir });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/obs-settings/extract — extract settings cho 1 LUA từ scene collection
// Body: { luaId, sceneCollection }
app.post('/api/obs-settings/extract', express.json(), (req, res) => {
    const luaId = String(req.body?.luaId || '').trim();
    const sceneCollection = String(req.body?.sceneCollection || '').trim();
    if (!luaId || !sceneCollection) {
        return res.status(400).json({ ok: false, error: 'Thiếu luaId hoặc sceneCollection' });
    }
    try {
        const state = luaSync.getLocalState(luaId);
        if (!state.exists) {
            return res.status(400).json({ ok: false, error: 'LUA chưa tải về — bấm Tải trước' });
        }
        const obFilename = state.obName + '.lua';
        const result = obsSettings.extractSettings(sceneCollection, obFilename, luaId);
        if (!result.found) {
            return res.status(404).json({
                ok: false,
                error: result.message,
                availableScripts: result.availableScripts,
                triedStrategies: result.triedStrategies
            });
        }
        res.json({
            ok: true,
            settings: result.settings,
            settingsCount: result.settingsCount,
            scriptPath: result.scriptPath,
            strategy: result.strategy,
            matchedFile: result.matchedFile,
            signatureMatched: result.signatureMatched
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/obs-settings/apply — inject settings vào scene collection
// Body: { luaId, sceneCollection, settings }
// SECURITY: refuse nếu OBS WS đang connect (= OBS đang chạy)
app.post('/api/obs-settings/apply', express.json(), (req, res) => {
    const luaId = String(req.body?.luaId || '').trim();
    const sceneCollection = String(req.body?.sceneCollection || '').trim();
    const settings = req.body?.settings;
    if (!luaId || !sceneCollection || !settings || typeof settings !== 'object') {
        return res.status(400).json({ ok: false, error: 'Thiếu luaId/sceneCollection/settings' });
    }
    if (obsBridge.isConnected()) {
        return res.status(409).json({
            ok: false,
            error: '⚠ OBS đang chạy. Đóng OBS trước (Disconnect trên app + đóng OBS) rồi thử lại.',
            requiresObsClose: true
        });
    }
    try {
        const state = luaSync.getLocalState(luaId);
        if (!state.exists) {
            return res.status(400).json({ ok: false, error: 'LUA chưa tải về — bấm Tải trước' });
        }
        const obFilename = state.obName + '.lua';
        const cachedPath = state.path;
        const result = obsSettings.applySettings(sceneCollection, obFilename, settings, cachedPath, luaId);
        res.json({
            ok: true,
            action: result.action,
            matchStrategy: result.matchStrategy,
            scriptPath: result.scriptPath,
            settingsCount: result.settingsCount,
            message: `✓ Đã ${result.action === 'updated' ? 'cập nhật' : 'tạo mới'} script entry (match: ${result.matchStrategy}). Mở OBS để load.`
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/obs-settings/backup-all — extract settings TẤT CẢ LUAs trong cache + save vào file
// Body: { sceneCollection }
app.post('/api/obs-settings/backup-all', express.json(), (req, res) => {
    const sceneCollection = String(req.body?.sceneCollection || '').trim();
    if (!sceneCollection) {
        return res.status(400).json({ ok: false, error: 'Thiếu sceneCollection' });
    }
    try {
        const luas = (luaSync.getFullState().luas || []).filter(l => l.cached);
        const backup = {
            timestamp: Date.now(),
            sceneCollection,
            luas: {}
        };
        const errors = [];
        // ★ Diagnostic info — show user mapping luaId→file đang tìm
        const searchedFor = [];
        // ★ List TẤT CẢ scripts thực có trong scene collection (cho user compare)
        let allScriptsInCollection = [];
        try {
            allScriptsInCollection = obsSettings.listScripts(sceneCollection);
        } catch (e) {
            errors.push({ id: '_collection', error: 'List scripts fail: ' + e.message });
        }
        for (const lua of luas) {
            try {
                const state = luaSync.getLocalState(lua.id);
                if (!state.exists) continue;
                const lookingFor = state.obName + '.lua';
                searchedFor.push({ id: lua.id, name: lua.name, file: lookingFor });
                // ★ Pass luaId để multi-strategy fallback (obfuscated → original → signature)
                const result = obsSettings.extractSettings(sceneCollection, lookingFor, lua.id);
                if (result.found) {
                    backup.luas[lua.id] = {
                        name: lua.name,
                        hotkey: lua.hotkey,
                        version: lua.version,
                        matchStrategy: result.strategy,   // ★ cho UI biết match bằng cách nào
                        matchedFile: result.matchedFile,
                        settings: result.settings
                    };
                }
            } catch (e) {
                errors.push({ id: lua.id, error: e.message });
            }
        }
        const matchedCount = Object.keys(backup.luas).length;
        res.json({
            ok: true,
            backup,
            matchedCount,
            totalLuas: luas.length,
            errors,
            searchedFor,            // ★ tên file app đang tìm
            allScripts: allScriptsInCollection.map(s => s.filename),   // ★ tên file thực có trong OBS
            message: `${matchedCount}/${luas.length} LUA matched`
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/lua-sync/open-folder — mở folder cache trong Windows Explorer
// CẦN MẬT KHẨU (101016) — chống vô tình mở khi share screen
const LUA_FOLDER_PASSWORD = '101016';
app.post('/api/lua-sync/open-folder', express.json(), (req, res) => {
    const pwd = String(req.body?.password || '');
    if (pwd !== LUA_FOLDER_PASSWORD) {
        return res.status(403).json({ ok: false, error: 'Sai mật khẩu' });
    }
    try {
        const { shell } = require('electron');
        shell.openPath(luaSync.cacheDir);
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: false, error: 'Electron shell không available' });
    }
});

// ====== 🎭 BG Removal — AUTO-INSTALL (download zip + extract + copy to per-user OBS plugins) ======
// Strategy: cài per-user (%APPDATA%/obs-studio/plugins/) → KHÔNG cần admin
async function bgInstallDownloadFile(url, destPath, onProgress, redirectDepth = 0) {
    return new Promise((resolve, reject) => {
        if (redirectDepth > 5) return reject(new Error('Quá nhiều redirect'));
        const https = require('https');
        const fsmod = require('fs');
        const req = https.get(url, {
            headers: { 'User-Agent': 'HP-Action-LIVE/BGInstall' },
            timeout: 60000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return bgInstallDownloadFile(res.headers.location, destPath, onProgress, redirectDepth + 1)
                    .then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            const stream = fsmod.createWriteStream(destPath);
            let downloaded = 0;
            res.on('data', chunk => {
                downloaded += chunk.length;
                if (total > 0 && onProgress) {
                    onProgress(Math.round((downloaded / total) * 100), downloaded, total);
                }
            });
            res.pipe(stream);
            stream.on('finish', () => { stream.close(() => resolve(destPath)); });
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    });
}

async function bgInstallExtractZip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const fsmod = require('fs');
        try { fsmod.mkdirSync(destDir, { recursive: true }); } catch (_) {}
        // PowerShell Expand-Archive — built-in Windows, no deps
        const cmd = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`;
        const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true });
        let errBuf = '';
        ps.stderr.on('data', d => errBuf += d.toString());
        ps.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`Expand-Archive fail (code ${code}): ${errBuf.slice(0, 500)}`));
        });
        ps.on('error', reject);
    });
}

async function bgInstallCopyRecursive(src, dest) {
    const fsp = require('fs').promises;
    await fsp.cp(src, dest, { recursive: true, force: true });
}

async function bgInstallDoInstall() {
    const fsmod = require('fs');
    const osmod = require('os');
    const tmpRoot = path.join(osmod.tmpdir(), 'hp-bg-install-' + Date.now());
    fsmod.mkdirSync(tmpRoot, { recursive: true });

    try {
        // 1. Fetch latest release info từ GitHub API
        io.emit('bgInstall:progress', { phase: 'metadata', percent: 0, message: 'Đang lấy thông tin phiên bản...' });
        const fetchRel = await fetch('https://api.github.com/repos/locaal-ai/obs-backgroundremoval/releases/latest', {
            headers: { 'User-Agent': 'HP-Action-LIVE' },
            timeout: 15000
        });
        if (!fetchRel.ok) throw new Error(`GitHub API HTTP ${fetchRel.status}`);
        const release = await fetchRel.json();
        // Find Windows x64 zip asset
        const winAsset = (release.assets || []).find(a => /windows-x64\.zip$/i.test(a.name))
                      || (release.assets || []).find(a => /windows-x64.*\.zip$/i.test(a.name));
        if (!winAsset) throw new Error('Không tìm thấy Windows x64 ZIP trong release');

        const versionTag = String(release.tag_name || 'unknown').replace(/^v/i, '');
        console.log(`[bg-install] Downloading ${winAsset.name} v${versionTag} (${winAsset.size} bytes)`);

        // 2. Download zip với progress
        io.emit('bgInstall:progress', { phase: 'download', percent: 0, message: `Đang tải ${winAsset.name}...` });
        const zipPath = path.join(tmpRoot, winAsset.name);
        await bgInstallDownloadFile(winAsset.browser_download_url, zipPath, (pct, dl, total) => {
            io.emit('bgInstall:progress', {
                phase: 'download', percent: pct,
                message: `Tải: ${Math.round(dl/1024/1024)}MB / ${Math.round(total/1024/1024)}MB`
            });
        });

        // 3. Extract
        io.emit('bgInstall:progress', { phase: 'extract', percent: 50, message: 'Đang giải nén...' });
        const extractDir = path.join(tmpRoot, 'extract');
        await bgInstallExtractZip(zipPath, extractDir);

        // 4. Locate source files (zip có folder root "obs-backgroundremoval/")
        const srcRoot = path.join(extractDir, 'obs-backgroundremoval');
        if (!fsmod.existsSync(srcRoot)) {
            throw new Error('Cấu trúc zip lạ — không tìm thấy folder "obs-backgroundremoval/"');
        }

        // 5. Copy vào %PROGRAMDATA%\obs-studio\plugins\ (OBS official path)
        // ★ FIX v1.2.1: %APPDATA% KHÔNG ĐÚNG — OBS đọc plugin từ %PROGRAMDATA%
        const obsPluginDir = path.join(
            process.env.PROGRAMDATA || 'C:\\ProgramData',
            'obs-studio', 'plugins', 'obs-backgroundremoval'
        );

        // ★ Cleanup old WRONG install ở %APPDATA% (do v1.2.0 cài sai)
        const oldAppDataPath = path.join(
            process.env.APPDATA || osmod.homedir(),
            'obs-studio', 'plugins', 'obs-backgroundremoval'
        );
        try {
            if (fsmod.existsSync(oldAppDataPath)) {
                fsmod.rmSync(oldAppDataPath, { recursive: true, force: true });
                console.log('[bg-install] Cleaned up wrong install ở %APPDATA% (legacy v1.2.0)');
            }
        } catch (e) {
            console.log('[bg-install] Old %APPDATA% cleanup warn:', e.message);
        }

        io.emit('bgInstall:progress', { phase: 'copy', percent: 70, message: `Copy vào ${obsPluginDir}...` });
        // Remove old install nếu có (ở vị trí mới)
        try {
            if (fsmod.existsSync(obsPluginDir)) {
                fsmod.rmSync(obsPluginDir, { recursive: true, force: true });
                console.log('[bg-install] Removed previous plugin install');
            }
        } catch (e) {
            console.log('[bg-install] Old plugin remove FAIL:', e.message);
        }
        // Copy bin + data — có thể cần admin nếu ProgramData lock down
        try {
            fsmod.mkdirSync(obsPluginDir, { recursive: true });
        } catch (e) {
            throw new Error(`Không tạo được folder ${obsPluginDir}. Có thể cần Admin: ${e.message}`);
        }
        try {
            await bgInstallCopyRecursive(path.join(srcRoot, 'bin'), path.join(obsPluginDir, 'bin'));
            await bgInstallCopyRecursive(path.join(srcRoot, 'data'), path.join(obsPluginDir, 'data'));
        } catch (e) {
            // Quyền ghi vào ProgramData có thể bị deny → báo rõ cho user
            if (e.code === 'EPERM' || e.code === 'EACCES') {
                throw new Error(`Không có quyền ghi vào ${obsPluginDir}. Chạy HP Action LIVE bằng Admin rồi thử lại.`);
            }
            throw e;
        }

        // 6. Verify .dll exists
        const dllPath = path.join(obsPluginDir, 'bin', '64bit', 'obs-backgroundremoval.dll');
        if (!fsmod.existsSync(dllPath)) {
            throw new Error('Plugin DLL không tồn tại sau khi copy — install fail');
        }

        // 7. Cleanup temp
        try { fsmod.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}

        io.emit('bgInstall:progress', { phase: 'done', percent: 100, message: `✓ Đã cài plugin v${versionTag}` });
        return { ok: true, version: versionTag, installedTo: obsPluginDir, dll: dllPath };
    } catch (e) {
        // Cleanup on error
        try { fsmod.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
        io.emit('bgInstall:progress', { phase: 'error', percent: 0, message: e.message });
        throw e;
    }
}

let bgInstallInProgress = false;
app.post('/api/obs-bridge/install-bg-removal', async (req, res) => {
    if (bgInstallInProgress) {
        return res.status(429).json({ ok: false, error: 'Đang cài — đợi hoàn tất rồi thử lại' });
    }
    bgInstallInProgress = true;
    try {
        // Cảnh báo nếu OBS đang chạy (WS connected)
        if (obsBridge.isConnected()) {
            return res.status(409).json({
                ok: false,
                error: 'OBS đang chạy — đóng OBS trước (Ctrl+W trong OBS), sau đó bấm Cài tự động lại',
                requiresObsClose: true
            });
        }
        const r = await bgInstallDoInstall();
        res.json({ ok: true, ...r, message: 'Plugin đã cài. MỞ LẠI OBS để load plugin.' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    } finally {
        bgInstallInProgress = false;
    }
});

// GET /api/obs-bridge/check-bg-removal — kiểm tra Background Removal plugin có cài chưa
// Strategy: thử lấy default settings của filter kind "background_removal" qua OBS WS.
// Nếu OBS trả response OK → plugin installed. Lỗi "not found" → chưa cài.
app.get('/api/obs-bridge/check-bg-removal', async (req, res) => {
    if (!obsBridge.isConnected()) {
        return res.json({ ok: false, reason: 'disconnected', installed: null,
            message: 'Chưa kết nối OBS — bấm Kết nối trước rồi thử lại' });
    }
    try {
        // Try multiple filter kind names (different plugin versions)
        const candidateKinds = ['background_removal', 'obs-backgroundremoval', 'background-removal-filter'];
        let foundKind = null;
        for (const kind of candidateKinds) {
            try {
                await obsBridge.obs.call('GetSourceFilterDefaultSettings', { filterKind: kind });
                foundKind = kind;
                break;
            } catch (e) {
                // continue to next candidate
            }
        }
        if (foundKind) {
            return res.json({ ok: true, installed: true, filterKind: foundKind,
                message: `✓ Plugin đã cài (filter kind: "${foundKind}")` });
        }
        return res.json({ ok: true, installed: false,
            message: '❌ Plugin Background Removal CHƯA cài trên OBS' });
    } catch (e) {
        return res.json({ ok: false, reason: 'error', error: e.message || String(e),
            installed: null, message: 'Lỗi check: ' + (e.message || e) });
    }
});

// POST /api/obs-bridge/queue/clear — xóa hàng đợi (hủy effect chưa chạy)
app.post('/api/obs-bridge/queue/clear', (req, res) => {
    const removed = obsBridgeQueueClear();
    res.json({ ok: true, removed, queue: obsBridgeQueueStatus() });
});

// POST /api/obs-bridge/queue/simulate-gift — TEST queue bằng cách giả lập gift
// Body: { giftId, repeatCount }
app.post('/api/obs-bridge/queue/simulate-gift', express.json(), (req, res) => {
    const giftId = String(req.body?.giftId || '');
    const repeatCount = Number(req.body?.repeatCount) || 1;
    if (!giftId) return res.status(400).json({ ok: false, error: 'Thiếu giftId' });
    const result = obsBridgeEnqueueForGift(giftId, repeatCount, { source: 'simulate' });
    res.json({ ok: true, ...result, queue: obsBridgeQueueStatus() });
});

// PUT /api/obs-bridge/config — lưu config (URL/pass/autoConnect/mapping)
app.put('/api/obs-bridge/config', express.json(), (req, res) => {
    const body = req.body || {};
    if (!appConfig.obsBridge) appConfig.obsBridge = {};
    if (typeof body.enabled === 'boolean') {
        // Tính năng theo KEY: Hiệu ứng OBS bị khoá thì không bật được (nhớ ý muốn bật để mở khoá thì tự bật).
        const L = licenseLocks();
        if (body.enabled && !featureOn('obs-effects')) { appConfig.obsBridge.enabled = false; L.obsBridge = true; }
        else { appConfig.obsBridge.enabled = body.enabled; delete L.obsBridge; }
    }
    if (typeof body.url === 'string') appConfig.obsBridge.url = body.url.trim();
    if (typeof body.password === 'string') appConfig.obsBridge.password = body.password;
    if (typeof body.autoConnect === 'boolean') appConfig.obsBridge.autoConnect = body.autoConnect;
    if (Array.isArray(body.mapping)) {
        // Validate & sanitize each mapping row — KHÔNG filter để giữ row đang edit (giftId/hotkey rỗng)
        appConfig.obsBridge.mapping = body.mapping
            .filter(m => m && typeof m === 'object')
            .map(m => ({
                id:         String(m.id || ('m_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
                giftId:     String(m.giftId || '').trim(),
                giftName:   String(m.giftName || '').trim().slice(0, 200),
                giftImage:  String(m.giftImage || '').trim().slice(0, 500),
                actionName: String(m.actionName || '').trim().slice(0, 80),   // tên hành động hiển thị trong queue
                hotkey:     String(m.hotkey || '').trim(),                    // tùy chọn — LUA chưa tự chạy theo Scene
                scene:      String(m.scene || '').trim().slice(0, 120),       // Scene hiệu ứng trong OBS (đường chính)
                cooldownMs: Math.max(0, Number(m.cooldownMs) || 0),
                group:      String(m.group || '').trim().slice(0, 40),
                enabled:    m.enabled !== false   // default true; chỉ false khi explicit set
            }));
    }
    if (Array.isArray(body.groupsDisabled)) {
        // Sanitize: chỉ giữ string, max 80 group disabled
        appConfig.obsBridge.groupsDisabled = body.groupsDisabled
            .filter(g => typeof g === 'string')
            .map(g => String(g).trim().slice(0, 40))
            .slice(0, 80);
    }
    saveAppConfig();
    // Bảng Quà Tổng vẽ lại ngay khi mapping/nhóm/master đổi (không gửi password).
    io.emit('obsBridge:config', {
        enabled: appConfig.obsBridge.enabled !== false,
        mapping: Array.isArray(appConfig.obsBridge.mapping) ? appConfig.obsBridge.mapping : [],
        groupsDisabled: Array.isArray(appConfig.obsBridge.groupsDisabled) ? appConfig.obsBridge.groupsDisabled : []
    });
    res.json({ ok: true, config: appConfig.obsBridge });
});

// POST /api/obs-bridge/connect — kết nối ngay (dùng URL/pass đã lưu)
app.post('/api/obs-bridge/connect', async (req, res) => {
    const cfg = appConfig.obsBridge || {};
    const url = (req.body && req.body.url) || cfg.url;
    const pass = (req.body && req.body.password !== undefined) ? req.body.password : (cfg.password || '');
    if (!url) return res.status(400).json({ ok: false, error: 'Thiếu URL' });
    try {
        await obsBridge.connect(url, pass);
        res.json({ ok: true, status: obsBridge.getStatus() });
    } catch (e) {
        res.json({ ok: false, error: e.message || String(e), status: obsBridge.getStatus() });
    }
});

// POST /api/obs-bridge/disconnect — ngắt kết nối + tắt auto-reconnect
app.post('/api/obs-bridge/disconnect', async (req, res) => {
    await obsBridge.disconnect();
    res.json({ ok: true, status: obsBridge.getStatus() });
});

// GET /api/obs-bridge/hotkeys — list hotkey hiện đang đăng ký trong OBS
app.get('/api/obs-bridge/hotkeys', async (req, res) => {
    if (!obsBridge.isConnected()) {
        return res.json({ ok: false, error: 'Chưa kết nối OBS', hotkeys: [] });
    }
    const hotkeys = await obsBridge.listHotkeys();
    // Lọc chỉ effect_/hp_ để UI gợi ý
    const effectHotkeys = hotkeys.filter(h => /^(effect_|hp_)/i.test(h));
    res.json({ ok: true, hotkeys, effectHotkeys });
});

// GET /api/obs-bridge/scenes — danh sách Scene trong OBS (dropdown "Scene hiệu ứng" của mapping)
app.get('/api/obs-bridge/scenes', async (req, res) => {
    if (!obsBridge.isConnected()) {
        return res.json({ ok: false, error: 'Chưa kết nối OBS', scenes: [], current: '' });
    }
    const r = await obsBridge.listScenes();
    res.json({ ok: !!r.ok, error: r.ok ? undefined : (r.error || r.reason), scenes: r.scenes || [],
        current: r.current || '', homeScene: obsBridgeHomeScene });
});

// POST /api/obs-bridge/test-mapping — bấm 🔥 chạy thử 1 hàng y như quà thật (qua hàng đợi):
// chuyển Scene → LUA chạy → giữ đủ giây → quay về. Bỏ qua cờ tắt hàng/nhóm/master vì là thao tác tay.
app.post('/api/obs-bridge/test-mapping', express.json(), (req, res) => {
    const id = String((req.body && req.body.id) || '');
    const mapping = (appConfig.obsBridge && Array.isArray(appConfig.obsBridge.mapping)) ? appConfig.obsBridge.mapping : [];
    const m = mapping.find(x => x && String(x.id) === id);
    if (!m) return res.status(404).json({ ok: false, reason: 'not-found', error: 'Không thấy mapping — lưu rồi thử lại' });
    if (!m.scene && !m.hotkey) return res.status(400).json({ ok: false, reason: 'empty', error: 'Hàng này chưa chọn Scene hiệu ứng' });
    if (!obsBridge.isConnected()) return res.json({ ok: false, reason: 'disconnected', error: 'Chưa kết nối OBS' });
    const r = obsBridgeEnqueueMapping(m, 1, { source: 'test' });
    res.json({ ok: true, ...r, queue: obsBridgeQueueStatus() });
});

// POST /api/obs-bridge/trigger — test trigger 1 hotkey (bypass cooldown + mapping)
app.post('/api/obs-bridge/trigger', express.json(), async (req, res) => {
    const hotkey = req.body && req.body.hotkey;
    if (!hotkey) return res.status(400).json({ ok: false, error: 'Thiếu hotkey' });
    const result = await obsBridge.triggerHotkey(hotkey);
    res.json(result);
});

// ====== 🚀 Quick Launch — cửa sổ điều khiển nhanh tách rời, always-on-top ======
app.get('/quick-launch', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'quick-launch.html')));

// ====== 📦 Danh sách quà — cửa sổ tách rời, ghim trên cùng (test quà mọi game) ======
app.get('/gift-list', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'gift-list.html')));

// Default index
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ====== Socket rooms ======
// Cache snapshot cho relay-only events (level-quest / timer) — server cũ chỉ relay
// lab→overlay không lưu lại, nên overlay mở SAU lab không có state, phải Reset OBS
// mới buộc lab broadcast lại. Cache giải quyết: mỗi lần lab broadcast cfg/state,
// server lưu vào RAM; socket mới connect → emit cache ngay.
const relayCache = {
    levelquest: { cfg: null, state: null },
    timer:      { cfg: null, state: null }
};

// ===== Dịch Thuật LIVE — bầu "speaker" duy nhất (chống 2 tiếng đè nhau) =====
// Vì sao: io.emit('translate:comment') broadcast tới MỌI overlay. Nếu user đặt cùng 1
// link /overlay/translate vào nhiều Scene OBS → mỗi Browser Source là 1 instance trình
// duyệt riêng, đều phát TTS → 2-3 tiếng đè nhau. Hàng đợi tuần tự trong overlay chỉ chống
// đè TRONG 1 trang, không phối hợp giữa các instance. Giải pháp: chỉ overlay "speaker"
// (instance vào room sớm nhất) mới đọc; các overlay còn lại chỉ hiện chữ, không phát tiếng.
// Khi speaker đóng → tự bầu lại instance kế tiếp.
function assignTranslateSpeaker() {
    const room = io.sockets.adapter.rooms.get('translateOverlay');
    const ids = room ? Array.from(room) : [];
    // Link có ?speaker=1 thắng trước (người dùng chọn đúng nguồn phát tiếng); không có thì lấy overlay cũ nhất.
    const preferred = ids.filter(id => io.sockets.sockets.get(id)?.data?.translateSpeakerPreferred === true);
    const speakerId = preferred[0] || ids[0] || null; // Set giữ thứ tự chèn → phần tử đầu = cũ nhất
    for (const id of ids) {
        io.to(id).emit('translate:role', { isSpeaker: id === speakerId });
    }
}

io.on('connection', (socket) => {
    // Máy khác trong LAN (hoặc bind 0.0.0.0 qua HP_BIND_HOST) chỉ được NHẬN broadcast. Các event
    // GHI/điều khiển (quickLaunch, overlay:reload, nhatla:state/transient, timer/levelquest,
    // creatorCaption) chỉ nhận từ socket tin cậy: loopback, hoặc LAN đã bật + đúng token
    // (overlay gắn ?token= vào URL → io({ auth: { token } })). Socket lạ: bỏ qua im lặng, không
    // disconnect để overlay OBS trên máy đó vẫn xem được.
    socket.data.trusted = socketIsTrusted(socket);
    const onTrusted = (event, handler) => socket.on(event, (...args) => { if (socket.data.trusted === true) handler(...args); });
    touchplayFeed.attach(socket);
    socket.emit('giftboard:active', { on: giftboardActiveLast });   // 📋 overlay mới mở biết ngay có ẩn bảng quà riêng không
    // Default emits
    socket.emit('giftSheet', giftList);
    socket.emit('status', { connected: isTikTokLiveConnected(), username: currentUsername, roomId: currentRoomId });
    socket.emit('liveStats', liveStats);
    if (currentHostProfile) socket.emit('hostInfo', currentHostProfile);
    socket.emit('translate:config', sanitizeLiveTranslateConfig(appConfig.liveTranslate));
    socket.emit('translate:rules', getCommentRulesMeta());
    socket.emit('creatorCaption:config', sanitizeCreatorCaptionConfig(appConfig.creatorCaption));
    socket.emit('creatorCaption:listenerState', captionListener.snapshot());
    // Quick Launch cần biết Vote Bình Luận đang chạy phiên không — gửi snapshot ngay
    // khi connect (kể cả cửa sổ Khởi động nhanh mở giữa chừng) thay vì chờ broadcast tiếp.
    socket.emit('votecomment:state', voteCommentSnapshot());
    socket.emit('nhietdo:state', nhietDoSnapshot());
    socket.emit('bancung:state', banCungSnapshot());
    socket.emit('trongcay:state', trongCaySnapshot());   // đồng nhất với nhietdo/bancung — popup Khởi động nhanh + overlay mở sau nhận ngay
    // Browser Source cũ reconnect trong lúc app vừa restart cũng phải xóa DOM lá cũ.
    if (Date.now() < NHATLA_STARTUP_CLEAR_UNTIL) {
        socket.emit('gameCmd', { gameId: 'nhatla', cmd: 'clear', payload: null, seq: 0 });
        socket.emit('nhatla:state', { sourceId: 'server-startup-clear', state: gameStateCache.nhatla });
    }
    // LEVEL QUEST + TIMER snapshot — overlay mở SAU lab nhận state ngay, không phải
    // Reset OBS mới buộc lab broadcast lại
    if (relayCache.levelquest.cfg)   socket.emit('levelquest:cfg',   relayCache.levelquest.cfg);
    if (relayCache.levelquest.state) socket.emit('levelquest:state', relayCache.levelquest.state);
    socket.emit('levelquest:hub', { hubOwned: levelQuestHubOwned() });
    if (relayCache.timer.cfg)        socket.emit('timer:cfg',        relayCache.timer.cfg);
    if (relayCache.timer.state)      socket.emit('timer:state',      relayCache.timer.state);

    // Trang nghe (Edge/Chrome) → câu final đi dịch; chữ tạm phát thẳng cho overlay/popup (không dịch);
    // trạng thái nghe lưu vào máy trạng thái → popup biết cửa sổ đang mở/nghe/lỗi.
    onTrusted('creatorCaption:speech', (payload) => {
        // Câu quá cũ (trang nghe đệm lúc mất kết nối) → bỏ, không đổ dồn lên OBS.
        if (payload && Number(payload.ts) > 0 && Date.now() - Number(payload.ts) > 30000) return;
        processCreatorCaptionSpeech(payload).catch(e => console.warn('[creator-caption] translate failed:', e.message));
    });
    onTrusted('creatorCaption:partial', (payload) => {
        if (!sanitizeCreatorCaptionConfig(appConfig.creatorCaption).enabled) return;
        io.emit('creatorCaption:partial', { text: String(payload?.text || '').slice(0, 300), ts: Date.now() });
    });
    onTrusted('creatorCaption:listener', (payload) => {
        // DỪNG lúc cửa sổ còn đang mở dở → trang vừa nối tới: bảo đóng luôn, không nhận làm cửa sổ đang giữ.
        if (captionCancelOpen) {
            captionCancelOpen = false;
            io.to(socket.id).emit('creatorCaption:listener:stop', { close: true });
            return;
        }
        captionListener.attach(socket.id);
        const act = captionListener.report(socket.id, payload || {});
        if (act && act.action === 'start') io.to(socket.id).emit('creatorCaption:listener:start');   // mở bằng phím tắt → nghe ngay
        captionMaybeMinimize(socket.id, payload);
    });
    // Universal overlay reload — panel/app can force ALL OBS browser sources of a game to refresh
    // Use case: user mở game lần đầu → OBS source bị cache → emit để OBS tự reload
    onTrusted('overlay:reload', (data) => { socket.broadcast.emit('overlay:reload', data || {}); });

    // VIP Welcome — overlay báo đã phát xong 1 lượt chào → server gửi lượt kế (serial thật).
    socket.on('vipwelcome:done', (data) => { vipWelcomeOnItemDone(data?.seq); });
    socket.on('vipwelcome:playing', (data) => { vipWelcomeOnItemPlaying(data?.seq, data?.durationMs); });
    // Thẻ vào phòng đã hiện trên overlay → mới tính là "đã chào" (cooldown/chào muộn dựa vào mốc này).
    socket.on('vipwelcome:cardShown', (data) => { if (data && typeof data.id === 'string') vipOnCardShown(data.id); });
    // Mọi overlay đang giữ lượt media đã rời (vd OBS refresh, overlay mới không nhận lượt này) → chuyển lượt ngay,
    // không treo tới hạn chờ ack.
    socket.on('disconnecting', () => {
        if (vipWelcomePlaying && vipWelcomePlayTargets.delete(socket.id) && vipWelcomePlayTargets.size === 0) {
            console.log('[vipwelcome] Overlay đang phát đã đóng/refresh — chuyển lượt media kế.');
            vipWelcomeOnItemDone(vipWelcomePlaySeq);
        }
    });

    // LEVEL QUEST sync — lab broadcasts cfg/state; cache + relay tới mọi overlay
    onTrusted('levelquest:cfg',   (data) => { relayCache.levelquest.cfg   = data; socket.broadcast.emit('levelquest:cfg',   data); });
    onTrusted('levelquest:state', (data) => { relayCache.levelquest.state = data; socket.broadcast.emit('levelquest:state', data); });

    // ZOMBIE PHÁ NHÀ — streamer bấm phím trong app (OBS không nhận bàn phím) → relay tới overlay
    onTrusted('quaivat:key', (data) => {
        if (!data || typeof data.code !== 'string' || data.code.length > 24) return;
        socket.broadcast.emit('quaivat:key', { code: data.code, down: data.down === true });
    });
    // ZOMBIE PHÁ NHÀ — game nhắc lời dẫn cho streamer → panel trong app (không lên hình)
    onTrusted('quaivat:cue', (data) => {
        if (!data || typeof data.text !== 'string') return;
        socket.broadcast.emit('quaivat:cue', { text: data.text.slice(0, 160), ts: Date.now() });
    });
    // ĐƯỜNG VỀ QUÊ — phím streamer trong app → overlay
    onTrusted('duongveque:key', (data) => {
        if (!data || !['jump', 'ram', 'start'].includes(data.action)) return;
        socket.broadcast.emit('duongveque:key', { action: data.action });
    });
    // NHÀ TÙ ONLINE — chế độ Streamer: phím trong app → overlay (OBS không nhận bàn phím)
    onTrusted('nhatu:key', (data) => {
        if (!data || typeof data.code !== 'string' || data.code.length > 24) return;
        socket.broadcast.emit('nhatu:key', { code: data.code, down: data.down === true });
    });

    // TIMER (THỜI GIAN) sync — lab broadcasts cfg/state; cache + relay tới overlay/preview
    onTrusted('timer:cfg',     (data) => { relayCache.timer.cfg   = data; socket.broadcast.emit('timer:cfg',   data); });
    onTrusted('timer:state',   (data) => { relayCache.timer.state = data; socket.broadcast.emit('timer:state', data); });
    onTrusted('timer:trigger', (data) => { socket.broadcast.emit('timer:trigger', data); });

    // BẢNG QUÀ TỔNG — lab/overlay ?edit=1 đang kéo bảng: relay toạ độ/cỡ ở ≤30fps tới mọi view
    // khác (OBS đổi theo ngay), config thật vẫn đi đường POST /api/games/giftboard/config khi thả tay.
    onTrusted('giftboard:transient', (data) => {
        // { panels: { '<id>': { xPercent, yPercent, scale } } } — id là 'main' | 'col1'.. | 'g:<gameId>'
        const src = data && data.panels;
        if (!src || typeof src !== 'object' || Array.isArray(src)) return;
        const limits = { xPercent: [0, 100], yPercent: [0, 100], scale: [30, 300] };
        const panels = {};
        for (const [id, p] of Object.entries(src).slice(0, 40)) {
            if (!/^[\w:-]{1,40}$/.test(id) || !p || typeof p !== 'object') continue;
            const out = {};
            for (const [key, [min, max]] of Object.entries(limits)) {
                const value = Number(p[key]);
                if (Number.isFinite(value)) out[key] = Math.max(min, Math.min(max, value));
            }
            if (Object.keys(out).length) panels[id] = out;
        }
        if (!Object.keys(panels).length) return;
        socket.broadcast.emit('giftboard:transient', { sourceId: socket.id, panels });
    });

    // 🚀 Quick Launch — cửa sổ rời emit lệnh start/stop → server forward tới app chính để
    // chạy logic thật của từng game (openRegistration cho caro, postMessage iframe cho
    // level-quest/timer, click translate-toggle cho liveTranslate, control endpoint cho
    // votecomment). Broadcast tới MỌI client (kể cả sender) để app chính phản hồi nếu nó
    // chính là nguồn phát; cửa sổ rời tự ignore (kiểm tra trong handler client).
    onTrusted('quickLaunch:cmd', (data) => {
        // Tính năng theo KEY: lệnh bật/dừng/reset của mục bị khoá không chuyển tiếp (nút ⚙ mở = app chính tự báo 🔒).
        if (data && typeof data.gameId === 'string' && data.action !== 'open' && !featureOn(data.gameId)) return;
        io.emit('quickLaunch:cmd', data);
    });
    // App chính broadcast trạng thái Đang chạy của caro + liveTranslate (heartbeat 2s + on-change).
    // Cửa sổ Khởi động nhanh listen để cập nhật chip "Đang chạy" / "Sẵn sàng".
    onTrusted('quickLaunch:status', (data) => { socket.broadcast.emit('quickLaunch:status', data); });

    // Nhặt Lá: trạng thái lá nằm ở client để animation mượt, nhưng phải mirror giữa
    // overlay OBS và khung review. Server giữ snapshot mới nhất để review mở sau cũng nạp lại.
    onTrusted('nhatla:state', (data) => {
        if (Date.now() < nhatLaStateLockedUntil) return;
        const state = data?.state;
        if (!state || !Array.isArray(state.leaves) || state.leaves.length > 20000) return;
        gameStateCache.nhatla = state;
        io.emit('nhatla:state', { sourceId: socket.id, state });
    });
    // ----- Chém Trái Cây: tay (≤60/s), trọng tài tracker, state, sự kiện ván -----
    onTrusted('chemtraicay:tracker', (data) => {
        if (!data || typeof data.id !== 'string' || !data.id || data.id.length > 32) return;
        // Tracker gửi {active:true} mỗi ~1 s làm nhịp tim: cùng id → chỉ gia hạn, không phát lại trạng thái.
        const changed = data.active ? chemRelay.heartbeat(data.id, socket.id) : chemRelay.release(data.id);
        if (changed) io.emit('chemtraicay:trackerStatus', { activeId: chemRelay.activeId() });
    });
    onTrusted('chemtraicay:hand', (data) => {
        const v = chemRelay.acceptHand(data, socket.id);
        if (!v) return;
        socket.to('overlay').to('preview').emit('chemtraicay:hand', v);
    });
    // Đập Muỗi: overlay báo trạng thái → panel (room preview). Không cache server-side.
    onTrusted('dapmuoi:state', (data) => {
        if (!data || typeof data !== 'object') return;
        socket.to('preview').emit('dapmuoi:state', {
            flying: Number(data.flying) || 0, queue: Number(data.queue) || 0, killed: Number(data.killed) || 0,
            combo: Number(data.combo) || 0, racketMs: Number(data.racketMs) || 0, netMs: Number(data.netMs) || 0, ts: Date.now()
        });
    });
    onTrusted('chemtraicay:state', (data) => {
        if (!data || typeof data !== 'object') return;
        chemTraiCayStateCache = {
            score: Number(data.score) || 0, pile: Number(data.pile) || 0, playing: !!data.playing,
            fps: Number(data.fps) || 0, ts: Date.now(),
            buffs: { god: Number(data.buffs?.god) || 0, fast: Number(data.buffs?.fast) || 0, slow: Number(data.buffs?.slow) || 0 }
        };
        socket.to('preview').emit('chemtraicay:state', chemTraiCayStateCache);
    });
    onTrusted('chemtraicay:event', (data) => {
        const type = data && data.type;
        if (type !== 'start' && type !== 'end') return;
        if (!socket.rooms.has('overlay')) return; // tab review/preview không được đổi Scene OBS
        chemTraiCaySceneFor(type);
        socket.to('preview').emit('chemtraicay:event', { type, ts: Date.now() });
    });
    // Relay thao tác đang kéo ở 30fps — không ghi disk, để OBS chạy cùng nhịp review.
    onTrusted('nhatla:transient', (data) => {
        if (!data || !['bin', 'hud', 'topdonors', 'leaf', 'leafEnd', 'hand', 'effect', 'dragStart', 'display', 'bags', 'giftboard'].includes(data.type)) return;
        // Thanh trượt panel + kéo bảng TOP trên overlay: relay ngay để mọi view khớp nhau,
        // config thật vẫn đi đường POST /config có debounce.
        if (data.type === 'topdonors') {
            const limits = {
                count: [1, 10], minLeaves: [0, 100000],
                flyIntervalSec: [5, 600], flyDurationSec: [4, 60],
                flyYPercent: [0, 92], flyScale: [40, 250],
                boardXPercent: [0, 92], boardYPercent: [0, 92], boardScale: [40, 250]
            };
            const topDonors = {};
            for (const [key, [min, max]] of Object.entries(limits)) {
                const value = Number(data.topDonors?.[key]);
                if (Number.isFinite(value)) topDonors[key] = Math.max(min, Math.min(max, value));
            }
            for (const key of ['enabled', 'flyEnabled', 'boardEnabled']) {
                if (typeof data.topDonors?.[key] === 'boolean') topDonors[key] = data.topDonors[key];
            }
            if (data.topDonors?.flyMode === 'solo' || data.topDonors?.flyMode === 'train') topDonors.flyMode = data.topDonors.flyMode;
            if (!Object.keys(topDonors).length) return;
            socket.broadcast.emit('nhatla:transient', { sourceId: socket.id, type: 'topdonors', topDonors });
            return;
        }
        if (data.type === 'dragStart') {
            nhatLaActiveDragSocketId = socket.id;
            return;
        }
        if (data.type === 'bags') {
            const limits = {
                size: [100, 20000], openAtLeaves: [0, 20000], pourGapMs: [0, 200],
                xPercent: [0, 95], yPercent: [0, 95], scale: [30, 300], maxIcons: [1, 40]
            };
            const bags = {};
            for (const [key, [min, max]] of Object.entries(limits)) {
                const value = Number(data.bags?.[key]);
                if (Number.isFinite(value)) bags[key] = Math.max(min, Math.min(max, value));
            }
            for (const key of ['enabled', 'showList']) {
                if (typeof data.bags?.[key] === 'boolean') bags[key] = data.bags[key];
            }
            if (data.bags?.orientation === 'vertical' || data.bags?.orientation === 'horizontal') bags.orientation = data.bags.orientation;
            if (!Object.keys(bags).length) return;
            socket.broadcast.emit('nhatla:transient', { sourceId: socket.id, type: 'bags', bags });
            return;
        }
        // BẢNG QUÀ. Khác các nhánh trên ở chỗ relay CẢ `entries` — mảng {icon, nhãn} panel
        // đã tính sẵn bằng giftBoardEntries(). Nhờ vậy sửa tên một quà là overlay bảng vẽ
        // lại ngay, không phải đợi POST /config (debounce 260ms) rồi mới có gameConfig về.
        // Server không tự tính entries được: nó chưa nạp game.js, và config lúc này còn là
        // bản CŨ trên đĩa vì người dùng vẫn đang gõ.
        if (data.type === 'giftboard') {
            const limits = {
                scale: [40, 250], iconScale: [40, 250], gap: [0, 400], nameScale: [40, 250],
                xPercent: [0, 92], yPercent: [0, 92]
            };
            const giftBoard = {};
            for (const [key, [min, max]] of Object.entries(limits)) {
                const value = Number(data.giftBoard?.[key]);
                if (Number.isFinite(value)) giftBoard[key] = Math.max(min, Math.min(max, value));
            }
            for (const key of ['enabled', 'showDiamond']) {
                if (typeof data.giftBoard?.[key] === 'boolean') giftBoard[key] = data.giftBoard[key];
            }
            if (['vertical', 'horizontal'].includes(data.giftBoard?.layout)) giftBoard.layout = data.giftBoard.layout;
            if (['top', 'bottom', 'left', 'right'].includes(data.giftBoard?.namePos)) giftBoard.namePos = data.giftBoard.namePos;
            const scroll = data.giftBoard?.autoScroll;
            if (scroll && typeof scroll === 'object') {
                const out = {};
                if (typeof scroll.enabled === 'boolean') out.enabled = scroll.enabled;
                const visible = Number(scroll.visibleCount);
                if (Number.isFinite(visible)) out.visibleCount = Math.max(2, Math.min(30, visible));
                const speed = Number(scroll.speed);
                if (Number.isFinite(speed)) out.speed = Math.max(0.5, Math.min(20, speed));
                if (['up', 'down', 'left', 'right'].includes(scroll.direction)) out.direction = scroll.direction;
                if (Object.keys(out).length) giftBoard.autoScroll = out;
            }
            // entries đi qua đây là dữ liệu do client dựng — cắt ngắn mọi chuỗi và chặn trần
            // số phần tử để một panel lỗi không bơm được payload khổng lồ sang mọi overlay.
            let entries = null;
            if (Array.isArray(data.entries)) {
                entries = data.entries.slice(0, 200).map(item => ({
                    key: String(item?.key || '').slice(0, 120),
                    giftId: String(item?.giftId || '').slice(0, 40),
                    giftName: String(item?.giftName || '').slice(0, 80),
                    image: String(item?.image || '').slice(0, 500),
                    diamond: Math.max(0, Math.min(1000000, Number(item?.diamond) || 0)),
                    label: String(item?.label || '').slice(0, 200)
                }));
            }
            if (!Object.keys(giftBoard).length && !entries) return;
            socket.broadcast.emit('nhatla:transient', { sourceId: socket.id, type: 'giftboard', giftBoard, entries });
            return;
        }
        if (data.type === 'display') {
            const limits = {
                leafScale: [30, 400], handScale: [30, 400], binScale: [30, 400], pileFillPercent: [30, 100],
                // binYPercent nới tới 100 vì thùng được phép hạ xuống thò 1/3 dưới mép overlay.
                // Trần CHÍNH XÁC phụ thuộc cỡ thùng nên do client chốt (binYMaxPercent trong
                // public/games/nhatla/game.js); ở đây chỉ chặn số rác đi qua đường relay.
                binXPercent: [5, 95], binYPercent: [5, 100], hudXPercent: [0, 90], hudYPercent: [0, 90]
            };
            const display = {};
            for (const [key, [min, max]] of Object.entries(limits)) {
                const value = Number(data.display?.[key]);
                if (Number.isFinite(value)) display[key] = Math.max(min, Math.min(max, value));
            }
            if (typeof data.display?.showHud === 'boolean') display.showHud = data.display.showHud;
            if (!Object.keys(display).length) return;
            socket.broadcast.emit('nhatla:transient', { sourceId: socket.id, type: 'display', display });
            return;
        }
        if (data.type === 'leafEnd' && nhatLaActiveDragSocketId === socket.id) nhatLaActiveDragSocketId = null;
        if (data.type === 'effect' && (typeof data.effectId !== 'string' || data.effectId.length > 120)) return;
        socket.broadcast.emit('nhatla:transient', { sourceId: socket.id, ...data });
    });
    socket.on('disconnect', () => {
        if (nhatLaActiveDragSocketId === socket.id) nhatLaActiveDragSocketId = null;
        if (chemRelay.dropSocket(socket.id)) io.emit('chemtraicay:trackerStatus', { activeId: null });
        // Người dùng tự đóng cửa sổ Edge khi đang nghe → coi như đã DỪNG (LIVE nối lại không tự mở); popup biết ngay.
        const before = captionListener.snapshot();
        captionListener.detach(socket.id);
        if (before.socketId === socket.id && before.status === 'listening') captionUserStopped = true;
        captionMinimizedSockets.delete(socket.id);
    });

    socket.on('subscribe', (subscription) => {
        // Overlay Dịch gửi { room, speaker } (link có ?speaker=1 = nguồn được ưu tiên đọc); còn lại gửi chuỗi.
        const roomName = (subscription && typeof subscription === 'object') ? subscription.room : subscription;
        if (typeof roomName === 'string' && roomName.length < 32) {
            socket.join(roomName);
            // Dịch Thuật LIVE: mỗi lần có overlay mới vào/ra → bầu lại speaker duy nhất
            if (roomName === 'translateOverlay') {
                socket.data.translateSpeakerPreferred = typeof subscription === 'object' && subscription?.speaker === true;
                // Gửi config ngay để overlay biết "Đọc TTS ở" PC hay OBS trước câu đầu tiên.
                socket.emit('translate:config', sanitizeLiveTranslateConfig(appConfig.liveTranslate));
                assignTranslateSpeaker();
            }
            // Overlay Chào Mừng VIP vừa mở/nối lại → gửi thẻ vào phòng còn chờ + chạy tiếp hàng media.
            // Overlay mẹ 🎥 Game Camera (io query hub=camgames): quà kích hoạt phiên game chỉ mở khi trang này đang mở trên OBS.
            if (roomName === 'overlay' && socket.handshake?.query?.hub === 'camgames') {
                socket.data.camHub = true;
                if (camSession) socket.emit('camgames:session', { ...camSessionPublic(), serverNow: Date.now() });
            }
            if (roomName === 'overlay:vipwelcome') vipFlushPendingTo(socket);
            if (roomName === 'overlay:vipwelcome-board') socket.emit('vipwelcome:board', vipBoardPayload());
            // Khi overlay/preview subscribe → gửi BOTH config + state snapshot.
            // Trước đây chỉ gửi state → OBS có thể render với default config (race).
            // Giờ gửi config trước, state sau → OBS apply config → loadState → khớp App.
            if (roomName === 'overlay' || roomName === 'preview') {
                for (const gid of Object.keys(GAMES)) {
                    // Config trước — overlay setConfig để pick up đúng features/jar position
                    socket.emit('gameConfig', { gameId: gid, config: appConfig.games[gid] });
                    // State sau — loadState để khôi phục caughtList/policeForce/totals
                    if (gameStateCache[gid]) {
                        socket.emit('gameStateSnapshot', { gameId: gid, state: gameStateCache[gid] });
                    }
                }
                // Vote Bình Luận: state riêng (in-memory) — đẩy snapshot ngay
                socket.emit('votecomment:state', voteCommentSnapshot());
                // Biểu Cảm Nhiệt Độ: state riêng (in-memory)
                socket.emit('nhietdo:state', nhietDoSnapshot());
                // Bắn Cung: state riêng (in-memory)
                socket.emit('bancung:state', banCungSnapshot());
                // Nhặt Lá: bảng TOP nằm ở RAM server, overlay reload giữa buổi phải nạp lại.
                socket.emit('nhatla:top', { list: nhatLaTopList(), total: nhatLaDonors.size, ts: Date.now() });
                // Chém Trái Cây: tracker đang active + state gần nhất
                socket.emit('chemtraicay:trackerStatus', { activeId: chemRelay.activeId() });
                if (chemTraiCayStateCache) socket.emit('chemtraicay:state', chemTraiCayStateCache);
            }
        }
    });

    // Dịch Thuật LIVE: speaker đóng OBS → bầu lại instance kế tiếp làm speaker.
    // Lúc 'disconnect' socket đã rời mọi room nên assignTranslateSpeaker() chỉ tính các
    // overlay còn lại. Gọi vô điều kiện cũng an toàn (room rỗng → no-op).
    // 📋 Bảng Quà Tổng: overlay game báo "tôi đang mở" (lúc nối + nhắc lại ~8s, public/lib/overlay-hello.js).
    socket.on('overlay:hello', (raw) => {
        const info = OverlayPresence.normalizeHello(raw, id => !!GAMES[id]);
        if (!info) return;
        OverlayPresence.touch(overlayPresence, socket.id, info, Date.now());
        overlayPresenceBroadcast();
    });
    socket.on('disconnect', () => {
        if (OverlayPresence.drop(overlayPresence, socket.id)) overlayPresenceBroadcast();
        assignTranslateSpeaker();
        // Overlay cuối cùng rời đi giữa lúc đang chờ ack → đừng treo 20s, chuyển lượt ngay
        // (không còn overlay để phát → flush nhanh phần còn lại).
        if (vipWelcomePlaying && vipOverlayCount() === 0) vipWelcomeOnItemDone(vipWelcomePlaySeq);
    });
});
// Overlay hết nhắc (rớt mạng ngầm) / hub Game Camera mở-đóng / đổi game camera → phát lại presence khi có thay đổi.
setInterval(() => {
    OverlayPresence.prune(overlayPresence, Date.now());
    overlayPresenceBroadcast();
}, 3000).unref();
// Đối chiếu OBS WebSocket: link game nào nằm trong OBS, kể cả nguồn bật "Shutdown when not visible" (trang chưa tải).
let overlayObsScanBusy = false;
async function overlayObsScan() {
    if (overlayObsScanBusy) return;
    if (!obsBridge.connected) { if (overlayObsIds.length) { overlayObsIds = []; overlayPresenceBroadcast(); } return; }
    overlayObsScanBusy = true;
    try {
        const r = await obsBridge.listBrowserSourceUrls();
        if (!r.ok) return;
        const ids = new Set();
        for (const s of r.sources) {
            const id = OverlayPresence.gameIdFromOverlayUrl(s.url, PORT);
            if (id && GAMES[id]) ids.add(id);
        }
        overlayObsIds = [...ids].sort();
        overlayPresenceBroadcast();
    } catch (_) {
    } finally { overlayObsScanBusy = false; }
}
setInterval(overlayObsScan, 15000).unref();

httpServer.on('error', (e) => {
    const hint = e.code === 'EADDRINUSE' ? ' — port đang bận (HP Action LIVE khác đang chạy?)'
        : e.code === 'EADDRNOTAVAIL' ? ' — HP_BIND_HOST không phải IP của máy này' : '';
    console.error(`[server] Không lắng nghe được ${BIND_HOST}:${PORT}: ${e.code || e.message}${hint}`);
    throw e;   // giữ hành vi cũ (crash) nhưng đã có dòng log giải thích
});
httpServer.listen(PORT, BIND_HOST, async () => {
    // Tính năng theo KEY: áp theo danh sách đã lưu NGAY khi lên — trước mọi await (tải Google Sheet có thể mất vài
    // giây khi mạng chậm; trong lúc đó game bị khoá không được chạy).
    try { applyLicenseLocks('startup'); } catch (e) { console.warn('[license] áp khoá lúc khởi động lỗi:', e && e.message); }
    if (BIND_HOST === '127.0.0.1' || BIND_HOST === 'localhost' || BIND_HOST === '::1') {
        console.log(`[server] Lắng nghe ${BIND_HOST} (chỉ máy này)`);
    } else {
        const lanUrls = lanAddresses().map(ip => `http://${ip}:${PORT}`).join(' ');
        console.log(`[server] Lắng nghe ${BIND_HOST} (LAN: ${lanUrls || 'không tìm thấy IPv4 LAN'})${HP_BIND_HOST_ENV ? ' — theo HP_BIND_HOST' : ''}`);
    }
    console.log(`[server] HP Action LIVE chạy tại http://localhost:${PORT}`);
    console.log(`[server] Domain riêng cho TikTok Studio/OBS: http://${OBS_LOCAL_HOST}:${PORT}` +
        (isHostMapped() ? ' (hosts file OK)' : ' (CHƯA map hosts file — link .obs chưa dùng được)'));
    try { await loadGiftSheet(); }
    catch (e) { console.warn('[server] Không tải được Google Sheet:', e.message); }
    await refreshCommentRulesSheet();
    setInterval(refreshCommentRulesSheet, COMMENT_RULES_REFRESH_MS).unref?.();

    // HP KEY - check key real-time: cấm key trên admin -> đóng app trong <= RECHECK_SECONDS.
    // SDK v2: watcher qua guard — lỗi mơ hồ (mất mạng, server 5xx/HTML) chỉ cảnh báo; mã cứng lặp 3 lần mới thu hồi.
    try { console.log('[hpkey] sdk', require('./hpkey/version')); } catch (_) {}
    try {
        require('./hpkey/validate').startWatch({
            getKey: () => (appConfig.license && appConfig.license.key) || '',
            // Mỗi lần verify OK (≤ RECHECK_SECONDS): admin đổi tính năng của key → khoá/mở ngay, khỏi mở lại app.
            onOk: (payload, license) => {
                try {
                    if (!appConfig.license || !appConfig.license.key) return;
                    const f = license && Array.isArray(license.features) ? license.features.map(String) : null;
                    const gs = LicFeat.normalizeState(license && license.gameState);
                    // ft giữ nguyên mà gs đổi (Tạm tắt → Ẩn) vẫn phải vẽ lại → so cả hai.
                    if (LicFeat.same(f, appConfig.license.features) && LicFeat.sameState(gs, appConfig.license.gameState)) return;
                    appConfig.license = { ...appConfig.license, features: f, gameState: gs };
                    saveAppConfig();
                    applyLicenseLocks('watcher');
                } catch (e) { console.warn('[license] cập nhật tính năng lỗi:', e && e.message); }
            },
            onRevoked: (reason) => {
                console.warn('[hpkey] Key bị thu hồi:', reason, '-> đóng app');
                try {
                    // Giữ key đã lưu (chỉ đánh dấu chưa kích hoạt) -> mở khoá là tự vào lại
                    appConfig.license = { ...(appConfig.license || {}), activated: false, lastError: 'revoked:' + reason };
                    saveAppConfig();
                } catch (_) {}
                try {
                    const { dialog } = require('electron');
                    dialog.showErrorBox('Bản quyền bị thu hồi',
                        'KEY của bạn đã bị khóa/thu hồi hoặc hết hạn (' + reason + ').\n' +
                        'Ứng dụng sẽ đóng. Liên hệ HP Media để được hỗ trợ.');
                } catch (_) {}
                if (_electronApp) { _electronApp.quit(); setTimeout(() => { try { _electronApp.exit(0); } catch (_) {} }, 1500); }
                else process.exit(0);
            },
        });
    } catch (e) { console.warn('[hpkey] watch init failed:', e && e.message); }
});

// Export cho electron-main.js gọi httpServer.close() khi quit (+ captionListenerStop() để cửa sổ
// nghe Edge/Chrome tự đóng theo app).
// bodyCamRestore: 🧍 Bộ Tách Người đang dời camera ra ngoài khung OBS (nền "phòng sạch") → trả về chỗ cũ trước khi thoát
// (lần mở sau vẫn tự trả nếu còn file body-camhide.json).
const bodyCamRestore = (ms = 300) => { try { return bodyApi ? bodyApi.camRestoreBeforeQuit(ms) : Promise.resolve(); } catch (e) { return Promise.resolve(); } };
module.exports = { httpServer, app, io, captionListenerStop, bodyCamRestore };
if (!process.versions.electron) {
    // `node server.js` chạy tay: Ctrl+C cũng phải đóng cửa sổ nghe — chờ socket kịp gửi rồi mới thoát.
    process.on('SIGINT', () => {
        try { captionListenerStop(); } catch (e) {}
        Promise.race([bodyCamRestore(300), new Promise(r => setTimeout(r, 350))]).finally(() => setTimeout(() => process.exit(0), 150));
    });
}
