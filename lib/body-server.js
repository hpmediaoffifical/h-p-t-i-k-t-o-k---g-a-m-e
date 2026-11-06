// lib/body-server.js — 🧍 BỘ TÁCH NGƯỜI (game con của 🎥 Game Camera), phần server.
//
// Chuyển từ HP LIVE NPC (lib/camgames-server.cjs @1e884fe, phần body / camHide). Lõi luật dùng chung server + trình duyệt:
// public/games/body/core.js (UMD → window.HpBody), cần public/games/biduoi/core.js + public/games/haucanh/core.js.
// Bỏ các khái niệm chỉ NPC có: Hồ sơ theo NPC / Scene NPC (app này chỉ MỘT hồ sơ "Mọi NPC"), 📋 Danh sách hiệu ứng (mọi quà
// phát NGAY - overlay có hàng chờ riêng), khoá KEY, Thư viện hiệu ứng, xuất / nhập gói NPC.
//
// Sự kiện socket server → overlay (room 'overlay' + 'preview'):
//   'body:play'  {profileId, itemId, qty, …người tặng}         🦊 Hậu Cảnh (hàng riêng, chạy song song)
//   'body:run'   {kind, scriptId, videoIdx, qty, …người tặng}  🕳️ 🏃 🎬 🔴 ✨ (hàng hành động) · 😭 💗 (lớp mặt / tay)
//   'body:stop'  {kind, scriptId}                             ⏹ ngưng lượt đang chạy + bỏ lượt chờ của kịch bản đó
//   'body:profile' {profileId}
// overlay → server: 'camgames:camhide' {game, hide} (+ack) · 'camgames:bodyStat' · 'touchplay:boost' (cờ socket.data.feedBoost)
//
// 📷 Ẩn cam gốc (bgMode 'room' / Hậu Cảnh "Ẩn cam gốc"): DỜI scene item camera ra xa ngoài khung OBS (nguồn vẫn hiện → vẫn chụp
// được), overlay vẽ lại phòng + người từ cùng ảnh chụp. Vị trí gốc lưu <dataDir>/body-camhide.json TRƯỚC khi dời; overlay giữ
// "hợp đồng" mỗi giây — mất nhịp 3,5 s / rớt socket / app khởi động lại đều tự trả camera về chỗ cũ.
'use strict';

const fs = require('fs');
const nodePath = require('path');
const Body = require('../public/games/body/core.js');
const BiDuoi = require('../public/games/biduoi/core.js');
const { applyBodyGiftSeed } = require('./body-gift-seed.js');

const PUBLIC_DIR = nodePath.join(__dirname, '..', 'public');
const BODY_DIR = nodePath.join(PUBLIC_DIR, 'games', 'body');
const SAMPLE_URL = '/games/body/samples/';
const SAMPLE_DIR = nodePath.join(BODY_DIR, 'samples');
const ASSET_URL = '/api/body/asset/';
const MEDIA_RE = /\.(mp4|webm|mov|mkv|m4v|png|jpe?g|webp|gif)$/i;
const UPLOAD_EXTS = ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'wav', 'm4a', 'ogg', 'aac'];
const CAM_AWAY = 40000;
const BODY_ICON = { haucanh: '🦊', roiho: '🕳️', biduoi: '🏃', vidfx: '🎬', cry: '😭', heart: '💗', catch: '🔴', morph: '✨' };

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isLoopback = a => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(String(a || ''));
const isNetOrDevicePath = p => /^[\\/]{2}/.test(String(p || ''));

// ---------- cấu hình ----------
// App này không có NPC → đúng MỘT hồ sơ "Mọi NPC" (cỡ / lệch / nền thường trực) và mọi kịch bản áp cho mọi hồ sơ.
function singleProfile(out) {
    const p0 = (out.profiles || [])[0];
    out.profiles = [{ ...(p0 || Body.normalizeProfile({ id: 'hs1' }, 0)), groupId: '' }];
    for (const kind of Body.KINDS) for (const sc of (out[kind] && out[kind].scripts) || []) sc.profileId = '';
    for (const it of (out.haucanh && out.haucanh.items) || []) it.profileId = '';
    return out;
}
function normalizeConfig(c) {
    const out = singleProfile(Body.normalizeConfig(isObj(c) ? c : {}));
    applyBodyGiftSeed(out);      // 🎁 quà mẫu: chỉ loại game còn trống quà, MỘT lần (cờ giftSeedV)
    return out;
}
function defaultConfig() { return normalizeConfig(Body.defaultConfig()); }
// Quà game gán ĐÍCH DANH (để lib/camgames có thể bắt nhánh bắt-mọi-quà của game khác nhường) - mỗi mục {giftId, giftName}.
function explicitGifts(cfg) {
    const c = isObj(cfg) ? cfg : {};
    const out = [];
    const take = list => { for (const x of Array.isArray(list) ? list : []) for (const g of (x && x.gifts) || []) if (g && g.giftId) out.push({ giftId: String(g.giftId), giftName: String(g.giftName || '') }); };
    for (const kind of Body.KINDS) take(c[kind] && c[kind].scripts);
    take(c.haucanh && c.haucanh.items);
    return out;
}

// ---------- 📦 video / ảnh mẫu giao kèm (public/games/body/samples) ----------
// Bản này chưa chép video mẫu > 1 MB → file mẫu nào thiếu thì kịch bản cần nó KHÔNG chạy (báo lỗi khi ▶ Thử, bỏ qua khi có quà).
const sampleCache = new Map();      // tên file → { ok, at }
function sampleExists(url) {
    const name = String(url || '').slice(SAMPLE_URL.length);
    if (!name || /[\\/]|\.\./.test(name)) return false;
    const c = sampleCache.get(name);
    if (c && Date.now() - c.at < 5000) return c.ok;
    let ok = false;
    try { ok = fs.statSync(nodePath.join(SAMPLE_DIR, name)).isFile(); } catch (_) {}
    sampleCache.set(name, { ok, at: Date.now() });
    return ok;
}
const isSample = f => typeof f === 'string' && f.startsWith(SAMPLE_URL);
const missingOf = files => [...new Set(files.filter(f => isSample(f) && !sampleExists(f)))];
// File BẮT BUỘC của một lượt (thiếu = không chạy). Ảnh / mp3 / video phụ (lớp sau, đĩa chân, video bắt được) thiếu thì overlay bỏ qua.
function requiredFiles(kind, x, videoIdx) {
    if (!x) return [];
    if (kind === 'haucanh') return [x.file];
    if (kind === 'roiho') return [x.bgFile];
    if (kind === 'vidfx') return [x.file, x.bgFile];
    if (kind === 'biduoi') { const v = (x.videos || [])[videoIdx]; return v ? [v.file, v.fg] : []; }
    return [];
}
// Mọi file mẫu mà cấu hình + lõi trỏ tới (để panel / overlay biết file nào chưa có).
function sampleRefs(cfg) {
    const out = new Set();
    const walk = v => {
        if (typeof v === 'string') { if (isSample(v)) out.add(v); return; }
        if (Array.isArray(v)) { for (const x of v) walk(x); return; }
        if (isObj(v)) for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(cfg);
    walk(Object.values(Body.VIDFX_SAMPLES || {}).map(s => [s.file, s.bg, s.mp3].filter(Boolean).map(f => SAMPLE_URL + f)));
    walk(Body.CATCH_WIN_SAMPLES); walk(Body.NINJA_FEET_FILE); walk(Body.FLY_MUSIC); walk(Body.SLAP_HAND_FILE); walk(Body.SLAP_HAND_SET);
    try { walk(Body.hcTemplates()); } catch (_) {}
    return [...out];
}
const missingSamples = cfg => sampleRefs(cfg).filter(f => !sampleExists(f)).sort();
const fileName = f => String(f || '').split('/').pop();

// ---------- 🔁 ghép group (vị trí cam trong group OBS ↔ Scene cha) ----------
function groupFrame(t = {}) {
    const sx = Number(t.scaleX ?? 1) || 1, sy = Number(t.scaleY ?? 1) || 1, al = Number(t.alignment ?? 5);
    const cl = Number(t.cropLeft) || 0, ct = Number(t.cropTop) || 0;
    const cw = Math.max(0, (Number(t.sourceWidth) || 0) - cl - (Number(t.cropRight) || 0)), ch = Math.max(0, (Number(t.sourceHeight) || 0) - ct - (Number(t.cropBottom) || 0));
    const ox = (al & 2 ? cw : al & 1 ? 0 : cw / 2) * sx, oy = (al & 8 ? ch : al & 4 ? 0 : ch / 2) * sy;
    const r = (Number(t.rotation) || 0) * Math.PI / 180;
    return { sx, sy, cos: Math.cos(r), sin: Math.sin(r), px: Number(t.positionX) || 0, py: Number(t.positionY) || 0, lx0: -cl * sx - ox, ly0: -ct * sy - oy };
}
function groupToParent(t, x, y) {
    const f = groupFrame(t), lx = x * f.sx + f.lx0, ly = y * f.sy + f.ly0;
    return { x: f.px + f.cos * lx - f.sin * ly, y: f.py + f.sin * lx + f.cos * ly };
}
function parentToGroup(t, x, y) {
    const f = groupFrame(t), dx = x - f.px, dy = y - f.py;
    const lx = f.cos * dx + f.sin * dy, ly = -f.sin * dx + f.cos * dy;
    return { x: (lx - f.lx0) / f.sx, y: (ly - f.ly0) / f.sy };
}

// Feed camera chưa có ghim bố cục (lib/touchplay-obs-feed.js) → vá tại chỗ: lúc cam gốc bị dời ra ngoài khung, feed KHÔNG đọc lại
// bố cục (không thì người tách nền cũng bị vẽ ra ngoài theo). Feed đã có pinLayout thì dùng của nó.
//
// Lượt đọc bố cục chạy trên một bản "bóng" của feed (Object.create): ghi layout / _layoutJson / _canvas và lệnh phát
// 'touchplay:layout' rơi vào bóng, xong mới xét rồi chép sang feed thật. Nhờ vậy (chép từ HP LIVE NPC e705360, 2026-11-03,
// máy streamer báo "cam về → văng đi → về lại"):
// - _pinGen: lượt đọc bắt đầu TRƯỚC khi ghim / bỏ ghim mà xong SAU (OBS bận chụp → lệnh xếp hàng) có thể đã đọc camera ở chỗ
//   ĐÃ DỜI → bỏ kết quả, chờ nhịp sau (không thì người vẽ lại văng ra ngoài tới hết lượt ẩn cam).
// - camera nằm XA ngoài khung (📷 ẩn cam gốc dời +40000) không bao giờ là bố cục thật → giữ bố cục cũ (stale).
const CAM_FAR = 20000;
const camFar = cam => !!(cam && cam.found && Array.isArray(cam.chain)
    && cam.chain.some(tr => tr && (Math.abs(Number(tr.positionX) || 0) > CAM_FAR || Math.abs(Number(tr.positionY) || 0) > CAM_FAR)));
function ensureFeedPin(feed) {
    if (!feed || typeof feed.pinLayout === 'function' || typeof feed._refreshLayout !== 'function') return;
    const raw = feed._refreshLayout;
    const hasCam = () => !!(feed.layout && feed.layout.cam && feed.layout.cam.found);
    const orig = async source => {
        const gen = feed._pinGen;
        let sent = null;
        const shadow = Object.create(feed);
        shadow.io = { to: room => ({ emit: (ev, data) => { sent = { room, ev, data }; return true; } }) };
        const res = await raw.call(shadow, source);
        for (const k of ['_canvas', '_canvasAt']) if (Object.prototype.hasOwnProperty.call(shadow, k)) feed[k] = shadow[k];
        if (!Object.prototype.hasOwnProperty.call(shadow, 'layout')) return res;      // bố cục không đổi
        // ghim / bỏ ghim xảy ra giữa lượt đọc → kết quả không còn đúng lúc này, chờ nhịp sau
        if (gen !== feed._pinGen || (feed.pinned && hasCam())) return res;
        let layout = shadow.layout;
        if (layout && camFar(layout.cam) && hasCam()) layout = { ...layout, cam: { ...feed.layout.cam, stale: true } };
        const j = JSON.stringify(layout);
        if (j === feed._layoutJson) return res;
        feed._layoutJson = j; feed.layout = layout;
        if (sent && feed.io && typeof feed.io.to === 'function') feed.io.to(sent.room).emit(sent.ev, layout);
        return res;
    };
    feed.pinned = '';
    feed._pinGen = 0;
    feed.pinLayout = reason => { const v = reason ? String(reason) : ''; if (v !== feed.pinned) feed._pinGen++; feed.pinned = v; };
    feed._refreshLayout = async source => { if (feed.pinned && hasCam()) return; return orig(source); };
    if (typeof feed.refreshLayoutNow !== 'function') {
        feed.refreshLayoutNow = async () => {
            if (feed.pinned) return;
            let src = '';
            try { src = (feed.status() || {}).source || ''; } catch (_) {}
            if (!src || !feed.bridge || !feed.bridge.connected) return;
            feed._layoutAt = Date.now();
            await orig(src);
        };
    }
}

function installBody(ctx) {
    const { app, io, express, dataDir } = ctx;
    const getConfig = typeof ctx.getConfig === 'function' ? ctx.getConfig : () => undefined;
    const setConfig = typeof ctx.setConfig === 'function' ? ctx.setConfig : () => {};
    const saveConfig = typeof ctx.saveConfig === 'function' ? ctx.saveConfig : () => {};
    const obsBridge = ctx.obsBridge || null;
    const feed = ctx.touchplayFeed || null;
    const gameEnabled = typeof ctx.gameEnabled === 'function' ? ctx.gameEnabled : () => true;
    const log = ctx.logger || console;
    const isTrusted = typeof ctx.isTrusted === 'function' ? ctx.isTrusted : req => isLoopback(req && req.socket && req.socket.remoteAddress);
    const socketTrusted = typeof ctx.socketIsTrusted === 'function' ? ctx.socketIsTrusted : s => isLoopback(s && s.handshake && s.handshake.address);
    const obsConnected = () => !!(obsBridge && (typeof obsBridge.isConnected === 'function' ? obsBridge.isConnected() : obsBridge.connected));
    const obs = (type, data) => {
        if (!obsBridge || !obsBridge.obs || !obsConnected()) return Promise.reject(new Error('chưa kết nối OBS'));
        return obsBridge.obs.call(type, data);
    };
    const emitAll = (ev, payload) => io.to('overlay').to('preview').emit(ev, payload);

    // Cấu hình đang lưu: chuẩn hoá + quà mẫu + một hồ sơ, ghi lại MỘT lần lúc cài (để panel / overlay đọc thẳng bản đã đủ).
    try {
        const cur = getConfig();
        const next = normalizeConfig(cur);
        if (!cur || JSON.stringify(cur) !== JSON.stringify(next)) { setConfig(next); saveConfig(); }
    } catch (e) { log.warn('[body] chuẩn hoá cấu hình lỗi:', e && e.message ? e.message : e); }
    const bodyCfg = () => normalizeConfig(getConfig());
    const activeProfileId = () => { const p = Body.activeProfile(bodyCfg(), []); return p ? p.id : ''; };

    // ---------- tải file lên (video / ảnh / mp3 của streamer) ----------
    const ASSETS_DIR = nodePath.join(dataDir, 'body-assets');
    try { fs.mkdirSync(ASSETS_DIR, { recursive: true }); } catch (_) {}
    const slug = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
    app.post('/api/body/upload', express.raw({ limit: '400mb', type: () => true }), (req, res) => {
        if (!isTrusted(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
        let name = '';
        try { name = decodeURIComponent(String(req.headers['x-file-name'] || req.query.name || '')); } catch (_) { name = String(req.query.name || ''); }
        const m = /\.([a-z0-9]+)$/i.exec(name);
        const ext = (m ? m[1] : String(req.query.ext || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!UPLOAD_EXTS.includes(ext)) return res.status(400).json({ ok: false, error: 'Định dạng file không hỗ trợ (.' + (ext || '?') + ')' });
        if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: 'File rỗng' });
        const base = slug(name.replace(/\.[a-z0-9]+$/i, '')) || 'file';
        const fn = `${Date.now()}-${base}.${ext}`;
        try {
            fs.writeFileSync(nodePath.join(ASSETS_DIR, fn), req.body);
            res.json({ ok: true, url: ASSET_URL + encodeURIComponent(fn), name: fn, size: req.body.length });
        } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
    });
    app.get('/api/body/asset/:fn', (req, res) => {
        const fn = String(req.params.fn || '').replace(/[^a-z0-9._-]/gi, '');
        if (!fn || fn.startsWith('.')) return res.status(404).end();
        const fp = nodePath.join(ASSETS_DIR, fn);
        if (!fs.existsSync(fp)) return res.status(404).end();
        res.sendFile(fp, err => { if (err && !res.headersSent) res.status(404).end(); });
    });

    // ---------- file trên máy (video thử thay camera ở khung xem trước) ----------
    // 🔒 Chỉ: file trong <dataDir>/body-assets, hoặc file vừa ĐĂNG KÝ qua POST /api/body/test-video (đường dẫn người dùng gõ ở
    // khung xem thử). Chỉ máy chạy app, chỉ video / ảnh, đường dẫn tuyệt đối, không đường mạng / thiết bị.
    const testFiles = new Set();
    const assetsReal = (() => { try { return fs.realpathSync.native(ASSETS_DIR); } catch (_) { return ASSETS_DIR; } })();
    const inside = (p, dir) => { const r = nodePath.relative(dir, p); return !!r && !r.startsWith('..') && !nodePath.isAbsolute(r); };
    const fileAllowed = abs => testFiles.has(abs.toLowerCase()) || inside(abs, ASSETS_DIR) || inside(abs, assetsReal);
    app.get('/api/body/file', (req, res) => {
        if (!isTrusted(req)) return res.status(403).end();
        const p = String(req.query.path || '');
        if (!MEDIA_RE.test(p) || !nodePath.isAbsolute(p)) return res.status(400).end();
        if (isNetOrDevicePath(p)) return res.status(403).end();
        const abs = nodePath.resolve(p);
        if (!fileAllowed(abs)) return res.status(403).end();
        let real = abs;
        try { real = fs.realpathSync.native(abs); } catch (_) {}
        if (real !== abs && !fileAllowed(real)) return res.status(403).end();
        res.sendFile(abs, { dotfiles: 'allow' }, err => { if (err && !res.headersSent) res.status(404).end(); });
    });
    app.post('/api/body/test-video', (req, res) => {
        if (!isTrusted(req)) return res.status(403).end();
        const p = String((req.body && req.body.path) || '').trim();
        if (!p) return res.json({ ok: true });
        if (!MEDIA_RE.test(p) || !nodePath.isAbsolute(p) || isNetOrDevicePath(p)) return res.status(400).json({ ok: false });
        if (testFiles.size >= 50) testFiles.clear();
        testFiles.add(nodePath.resolve(p).toLowerCase());
        res.json({ ok: true });
    });

    // ---------- overlay ----------
    app.get('/overlay/body', (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(nodePath.join(BODY_DIR, 'overlay.html'));
    });

    // ---------- chạy hiệu ứng ----------
    const lastVideo = new Map();        // kịch bản Bị Đuổi → video lượt trước (ngẫu nhiên không lặp liền)
    // → { ok, videoIdx } | { ok:false, missing:[file mẫu thiếu] }
    function emitRun(kind, sc, payload, videoIdx) {
        if (kind === 'biduoi' && !(Number.isInteger(videoIdx) && videoIdx >= 0 && videoIdx < sc.videos.length)) {
            videoIdx = BiDuoi.pickVideo(sc, lastVideo.has(sc.id) ? lastVideo.get(sc.id) : -1);
        }
        if (kind !== 'biduoi') videoIdx = -1;
        const missing = missingOf(requiredFiles(kind, sc, videoIdx));
        if (missing.length) return { ok: false, missing };
        if (kind === 'biduoi' && videoIdx >= 0) lastVideo.set(sc.id, videoIdx);
        emitAll('body:run', { ...payload, kind, scriptId: sc.id, videoIdx });
        return { ok: true, videoIdx };
    }
    function emitPlay(item, payload) {
        const missing = missingOf(requiredFiles('haucanh', item));
        if (missing.length) return { ok: false, missing };
        emitAll('body:play', { ...payload, itemId: item.id });
        return { ok: true };
    }
    const missingMsg = missing => 'Thiếu file mẫu: ' + missing.map(fileName).join(', ') + ' (chưa chép vào public/games/body/samples)';

    // Quà → hiệu ứng Bộ Tách Người: mọi chế độ chạy NGAY (app này không có 📋 Danh sách hiệu ứng). Trả danh sách lượt đã phát
    // (để server.js ghi nhật ký nếu muốn).
    const BODY_RUN_CAP = 999;
    function handleGift(base) {
        const b = isObj(base) ? base : {};
        const bc = bodyCfg();
        if (!bc.enabled || !gameEnabled() || !b.giftId) return [];
        const hit = Body.pickForGift(bc, [], String(b.giftId));
        const who = g => ({ nickname: b.nickname || b.uniqueId || '', uniqueId: b.uniqueId || '', profilePicture: b.profilePicture || '',
            giftName: b.giftName || g.giftName || '', giftImage: b.giftImage || g.giftImage || '', source: b.source || 'tiktok', ts: Date.now() });
        // TẶNG BAO NHIÊU CHẠY BẤY NHIÊU (user 29/10/2026): tặng 1 = 1 lượt, combo ×5 = 5 lượt, ×99 = 99 lượt nối nhau tới hết;
        // chỉ trần an toàn BODY_RUN_CAP chống spam treo máy (overlay cũng trần 999 lượt chờ, không bỏ quà khi hàng dài).
        const n = Math.min(BODY_RUN_CAP, Math.max(1, Math.floor(Number(b.repeatCount) || 1)));
        const out = [];
        if (hit.haucanh) {
            const it = hit.haucanh.item, qty = n;
            const r = emitPlay(it, { ...who(hit.haucanh.gift), profileId: hit.haucanh.profile ? hit.haucanh.profile.id : activeProfileId(), qty });
            out.push({ kind: 'haucanh', id: it.id, name: it.name, icon: BODY_ICON.haucanh, qty, ok: r.ok, missing: r.missing || [] });
            if (!r.ok) log.warn(`[body] bỏ qua 🦊 "${it.name}" - ${missingMsg(r.missing)}`);
        }
        for (const a of hit.actions) {
            const qty = n;
            const r = emitRun(a.kind, a.script, { ...who(a.gift), qty });
            out.push({ kind: a.kind, id: a.script.id, name: a.script.name, icon: BODY_ICON[a.kind] || '🧍', qty, ok: r.ok, missing: r.missing || [] });
            if (!r.ok) log.warn(`[body] bỏ qua ${BODY_ICON[a.kind] || ''} "${a.script.name}" - ${missingMsg(r.missing)}`);
        }
        if (out.some(x => x.ok)) log.log(`[body] ${b.nickname || '?'} tặng ${b.giftName || b.giftId} x${n} → ${out.filter(x => x.ok).map(x => x.icon + ' ' + x.name).join(', ')}`);
        return out;
    }

    app.post('/api/body/test', (req, res) => {
        const bc = bodyCfg(), q = req.body || {};
        const kind = String(q.kind || ''), id = String(q.id || '');
        const tester = { nickname: 'Thử nghiệm', uniqueId: 'tester', profilePicture: '', giftImage: '', qty: 1, ts: Date.now(), test: true, source: 'test' };
        if (kind === 'haucanh') {
            const items = bc.haucanh.items;
            const it = items.find(x => x.id === id) || items[0];
            if (!it) return res.json({ ok: false, error: 'Chưa có hiệu ứng Hậu Cảnh nào' });
            const profileId = String(q.profileId || '') || activeProfileId();
            const r = emitPlay(it, { ...tester, giftName: 'Thử ' + it.name, profileId });
            if (!r.ok) return res.json({ ok: false, error: missingMsg(r.missing), missing: r.missing });
            return res.json({ ok: true, kind, id: it.id, profileId });
        }
        if (!Body.KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'kind không hợp lệ' });
        const list = Body.listOf(bc, kind);
        const sc = list.find(x => x.id === id) || list[0];
        if (!sc) return res.json({ ok: false, error: 'Chưa có kịch bản nào' });
        const want = Number(q.videoIdx);
        const r = emitRun(kind, sc, { ...tester, giftName: 'Thử ' + sc.name }, Number.isInteger(want) ? want : undefined);
        if (!r.ok) return res.json({ ok: false, error: missingMsg(r.missing), missing: r.missing });
        res.json({ ok: true, kind, id: sc.id, videoIdx: r.videoIdx });
    });
    app.post('/api/body/stop', (req, res) => {
        const q = req.body || {}, kind = String(q.kind || ''), id = String(q.id || '');
        if (kind !== 'haucanh' && !Body.KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'kind không hợp lệ' });
        emitAll('body:stop', { kind, scriptId: id, ts: Date.now() });
        res.json({ ok: true, kind, id });
    });

    // ---------- 📷 ẩn cam gốc ----------
    ensureFeedPin(feed);
    const CAMHIDE_FILE = nodePath.join(dataDir, 'body-camhide.json');
    const camHide = { holders: new Map(), hidden: null, chain: Promise.resolve(), lastErr: '', game: '', quitting: false, quitTimer: null };
    let saved = null;
    try { const j = JSON.parse(fs.readFileSync(CAMHIDE_FILE, 'utf8')); if (isObj(j) && j.sceneName) saved = j; } catch (_) {}
    const camSaved = () => saved;
    const persistSaved = v => {
        saved = v || null;
        try { if (saved) fs.writeFileSync(CAMHIDE_FILE, JSON.stringify(saved)); else if (fs.existsSync(CAMHIDE_FILE)) fs.unlinkSync(CAMHIDE_FILE); }
        catch (e) { log.warn('[body] lưu vị trí cam gốc lỗi:', e.message); }
    };
    async function findCamItem() {
        let st = {};
        try { st = feed && feed.status ? feed.status() : {}; } catch (_) {}
        const source = String(st.source || '');
        if (!source) throw new Error('chưa có nguồn camera (🎥 Game Camera)');
        const { currentProgramSceneName: scene } = await obs('GetCurrentProgramScene');
        const walk = async (sceneName, isGroup, depth, group) => {
            if (depth > 3) return null;
            const { sceneItems } = await obs(isGroup ? 'GetGroupSceneItemList' : 'GetSceneItemList', { sceneName });
            for (const it of sceneItems || []) {
                if (it.sceneItemEnabled !== false && it.sourceName === source) return { sceneName, sceneItemId: it.sceneItemId, t: it.sceneItemTransform || {}, group };
            }
            for (const it of sceneItems || []) {
                if (it.sceneItemEnabled === false || !(it.isGroup || it.sourceType === 'OBS_SOURCE_TYPE_SCENE')) continue;
                const r = await walk(it.sourceName, !!it.isGroup, depth + 1,
                    it.isGroup ? { sceneName, sceneItemId: it.sceneItemId, t: it.sceneItemTransform || {} } : null);
                if (r) return r;
            }
            return null;
        };
        const r = await walk(scene, false, 0, null);
        if (!r) throw new Error(`không thấy camera "${source}" trong Scene "${scene}"`);
        return { ...r, source };
    }
    const camSetPos = (sceneName, sceneItemId, x, y) => obs('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: { positionX: x, positionY: y } });
    async function camHideNow() {
        if (camHide.hidden) return;
        if (!obsConnected()) throw new Error('chưa kết nối OBS');
        if (feed && feed.refreshLayoutNow) { try { await feed.refreshLayoutNow(); } catch (_) {} }
        const it = await findCamItem();
        const cx = Number(it.t.positionX) || 0, cy = Number(it.t.positionY) || 0;
        const old = camSaved();
        const same = old && old.sceneName === it.sceneName && old.sceneItemId === it.sceneItemId;
        const inGroup = !!it.group && !(same && !old.group);
        let orig, away;
        if (inGroup) {
            // vị trí cam theo Scene cha của group; app tắt giữa hiệu ứng → cam đã ở xa vị trí đã lưu = đang dời sẵn, KHÔNG dời thêm
            const w = groupToParent(it.group.t, cx, cy);
            const group = { sceneName: it.group.sceneName, sceneItemId: it.group.sceneItemId };
            const sx = Math.abs(groupFrame(it.group.t).sx);
            away = !!(same && old.group && Number.isFinite(old.wx) && Math.hypot(w.x - old.wx, w.y - old.wy) > CAM_AWAY * sx / 2);
            orig = away ? old : { sceneName: it.sceneName, sceneItemId: it.sceneItemId, source: it.source, x: cx, y: cy, group, wx: w.x, wy: w.y };
        } else {
            // còn vị trí gốc chưa trả (app tắt giữa hiệu ứng) và vẫn là item đó → vị trí thật là bản đã lưu
            orig = same ? old : { sceneName: it.sceneName, sceneItemId: it.sceneItemId, source: it.source, x: cx, y: cy };
            away = false;
        }
        persistSaved({ ...orig, game: camHide.game || '', at: Date.now() });
        if (feed && feed.pinLayout) feed.pinLayout('camhide');
        try {
            if (inGroup) { if (!away) await camSetPos(it.sceneName, it.sceneItemId, cx + CAM_AWAY, cy); }
            else await camSetPos(orig.sceneName, orig.sceneItemId, orig.x + CAM_AWAY, orig.y);
        } catch (e) { if (feed && feed.pinLayout) feed.pinLayout(''); persistSaved(null); throw e; }
        camHide.hidden = orig;
        log.log(`[body] 📷 ẩn cam gốc "${orig.source}" (${orig.sceneName}${inGroup ? ' - trong group' : ''})`);
    }
    async function camRestoreNow() {
        const orig = camHide.hidden || camSaved();
        if (orig) {
            try {
                if (orig.group && Number.isFinite(orig.wx) && Number.isFinite(orig.wy)) {
                    const { sceneItemTransform: gt } = await obs('GetSceneItemTransform', { sceneName: orig.group.sceneName, sceneItemId: orig.group.sceneItemId });
                    const p = parentToGroup(gt || {}, orig.wx, orig.wy);
                    await camSetPos(orig.sceneName, orig.sceneItemId, p.x, p.y);
                } else await camSetPos(orig.sceneName, orig.sceneItemId, orig.x, orig.y);
            } catch (e) { if (!(e && e.code === 600)) throw e; }      // item / group đã bị xoá khỏi Scene → thôi
            log.log(`[body] 📷 trả cam gốc "${orig.source || ''}" về chỗ cũ`);
        }
        camHide.hidden = null;
        if (camSaved()) persistSaved(null);
        if (feed && feed.pinLayout) feed.pinLayout('');
    }
    function camSync() {
        const run = async () => {
            const want = camHide.holders.size > 0 && !camHide.quitting;
            try {
                if (want && !camHide.hidden) await camHideNow();
                else if (!want && (camHide.hidden || (camSaved() && obsConnected()))) await camRestoreNow();
                camHide.lastErr = '';
            } catch (e) { camHide.lastErr = e && e.message ? e.message : String(e); throw e; }
        };
        const p = camHide.chain.then(run, run);
        camHide.chain = p.catch(() => {});
        return p;
    }
    const camHideActive = () => Boolean(camHide.hidden) || camHide.holders.size > 0;
    const camLeaseTimer = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, at] of camHide.holders) if (now - at > 3500) { camHide.holders.delete(id); changed = true; }
        if (changed || (!camHide.holders.size && (camHide.hidden || camSaved()) && obsConnected())) {
            camSync().catch(e => log.warn('[body] trả cam gốc lỗi:', e && e.message ? e.message : e));
        }
    }, 1000);
    if (camLeaseTimer.unref) camLeaseTimer.unref();
    // 🛑 App sắp tắt: trả camera về chỗ cũ NGAY (không thì cam nằm ngoài khung OBS tới lần mở app sau). Hết giờ → lần mở sau tự trả.
    function camRestoreBeforeQuit(timeoutMs = 300) {
        camHide.quitting = true;
        clearTimeout(camHide.quitTimer);
        camHide.quitTimer = setTimeout(() => { camHide.quitting = false; }, 10000);
        if (camHide.quitTimer.unref) camHide.quitTimer.unref();
        if (!camHide.hidden && !camSaved()) return Promise.resolve(false);
        const done = camSync().then(() => !camHide.hidden && !camSaved(), () => false);
        return Promise.race([done, new Promise(r => { const t = setTimeout(() => r(false), timeoutMs); if (t.unref) t.unref(); })]);
    }
    const camHideStatus = () => ({ hidden: !!camHide.hidden, pending: !!camSaved(), holders: camHide.holders.size, game: camHide.hidden ? camHide.game : '', error: camHide.lastErr });

    app.get('/api/body/meta', (req, res) => {
        const c = getConfig();
        res.json({ groups: [], enabledNpcIds: [], activeProfileId: activeProfileId(), board: {}, cam: camHideStatus(),
            missingSamples: missingSamples(c), obsConnected: obsConnected() });
    });

    // ---------- socket ----------
    io.on('connection', socket => {
        // 📷 overlay trên OBS xin ẩn / thôi ẩn cam gốc; gửi lại mỗi giây lúc đang chạy hiệu ứng (hợp đồng). Khung thử trong panel
        // (room 'preview') bị từ chối - không bao giờ đụng OBS.
        socket.on('camgames:camhide', (d, ack) => {
            const reply = typeof ack === 'function' ? ack : () => {};
            if (!socket.rooms.has('overlay') || !socketTrusted(socket)) return reply({ ok: false, hidden: false, error: 'chỉ overlay trên OBS' });
            const game = String((d && d.game) || 'body').slice(0, 24);
            const key = socket.id + '|' + game, had = camHide.holders.has(key);
            // Trang tự báo đang nằm ở Scene KHÔNG phát (obsSourceActiveChanged false) → không cho ẩn cam của Scene đang phát
            // (chép HP LIVE NPC e705360; overlay bản mới đã tự chặn trong hp-cam-hide.mjs - giữ ở đây cho chắc).
            const offAir = !!(d && d.hide && d.onAir === false);
            if (d && d.hide && !offAir) { camHide.holders.set(key, Date.now()); if (!camHide.hidden) camHide.game = game; }
            else camHide.holders.delete(key);
            if (offAir && !had) return reply({ ok: false, hidden: !!camHide.hidden, error: 'trang Game Camera này đang ở Scene không phát' });
            if (d && d.hide && !offAir && had && camHide.hidden) return reply({ ok: true, hidden: true });     // nhịp giữ hợp đồng
            camSync().then(() => reply({ ok: true, hidden: !!camHide.hidden }), e => reply({ ok: false, hidden: !!camHide.hidden, error: e && e.message ? e.message : String(e) }));
        });
        // ⚡ overlay đang / sắp có hiệu ứng cần ảnh nét + dày → feed đọc socket.data.feedBoost (xem lib/touchplay-obs-feed.js).
        socket.on('touchplay:boost', on => { socket.data.feedBoost = !!on; });
        // 📓 số đo mỗi lượt / lỗi JS của trang Bộ Tách Người trên OBS → nhật ký server (chỉ lỗi + lượt nặng).
        socket.on('camgames:bodyStat', d => {
            if (!socket.rooms.has('overlay') || !isObj(d)) return;
            if (d.type === 'error') log.warn('[body] overlay lỗi:', String(d.msg || '').slice(0, 300));
            else if (d.type === 'run' && (Number(d.ltMax) > 400 || d.ok === false)) log.warn(`[body] lượt ${d.kind} "${String(d.name || '').slice(0, 60)}" ${d.ok === false ? 'không chạy được' : 'nặng'} - tác vụ dài tối đa ${d.ltMax} ms`);
        });
        socket.on('disconnect', () => {
            let held = false;
            for (const k of [...camHide.holders.keys()]) if (k.startsWith(socket.id + '|')) { camHide.holders.delete(k); held = true; }
            if (held) camSync().catch(() => {});
        });
    });

    return { defaultConfig, normalizeConfig, handleGift, explicitGifts, missingSamples: () => missingSamples(getConfig()),
        camHideStatus, camHideActive, camRestoreBeforeQuit,
        _test: { camHide, camSync, emitRun, emitPlay, saved: () => camSaved(), setSaved: v => persistSaved(v), stop: () => clearInterval(camLeaseTimer) } };
}

module.exports = { installBody, defaultConfig, normalizeConfig, explicitGifts, missingSamples, requiredFiles, groupFrame, groupToParent, parentToGroup, SAMPLE_URL };
