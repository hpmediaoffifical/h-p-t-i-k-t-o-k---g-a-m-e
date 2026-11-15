'use strict';
/**
 * 🎮 Game TẢI RIÊNG (không gói vào bản cập nhật HP Action LIVE) — Sinh Tồn, HP Đại Chiến…
 * App chỉ tải khi có bản quyền, kiểm dung lượng + SHA-256, báo khi có bản mới. Hai kiểu gói:
 *   kind 'exe' — bộ cài Windows (Sinh Tồn): Tải về → Cài đặt (chạy bộ cài, kiểm SHA-256 lại) → Mở game (exe đã cài,
 *                tìm trong mục Gỡ cài đặt của Windows theo DisplayName).
 *   kind 'web' — gói zip game web (HP Đại Chiến): Tải về → tự giải nén → app phục vụ tại /dl/<id>/ → Mở game
 *                (cửa sổ Edge/Chrome do server mở) hoặc dán link vào OBS.
 *
 * Manifest đặt trên máy chủ HP Media (không phải GitHub), app đọc ngầm, KHÔNG đưa link tải ra giao diện:
 *   { "version": "1.1.0", "url": "https://hpvn.media/…", "sha256": "<64 hex>", "size": 114566783, "notes": "…" }
 * File lưu ở <dir> (%APPDATA%\hp-action-live\games\<id>\), chỉ giữ bản mới nhất.
 *
 * Mọi phụ thuộc bên ngoài (fetch, tìm game đã cài, chạy exe, giải nén, mở cửa sổ) truyền vào → test không cần mạng/registry.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_SIZE = 600 * 1024 * 1024;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function compareVersions(a, b) {
    const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
    return 0;
}

/** Manifest hợp lệ → bản sạch; sai → null. Chỉ nhận link https, mã SHA-256 đủ 64 ký tự, dung lượng có giới hạn. */
function validateManifest(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const version = String(m.version || '').trim();
    const url = String(m.url || '').trim();
    const sha256 = String(m.sha256 || '').trim().toLowerCase();
    const size = Number(m.size);
    if (!VERSION_RE.test(version) || !/^[0-9a-f]{64}$/.test(sha256)) return null;
    if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE) return null;
    try { if (new URL(url).protocol !== 'https:') return null; } catch (e) { return null; }
    return { version, url, sha256, size, notes: String(m.notes || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 400) };
}

/**
 * fetch tối giản bằng https LUÔN kiểm chứng chỉ (rejectUnauthorized: true ghi rõ → thắng biến môi trường
 * NODE_TLS_REJECT_UNAUTHORIZED=0 nếu máy lỡ đặt; fetch có sẵn của Node thì nghe theo biến đó).
 * Chỉ đi https, theo tối đa 5 lần chuyển hướng. Trả { ok, status, url, json(), body } — body đọc được bằng for await.
 */
function strictFetch(url, opts = {}, hops = 0) {
    const https = require('https');
    return new Promise((ok, fail) => {
        let u;
        try { u = new URL(url); } catch (e) { return fail(e); }
        if (u.protocol !== 'https:') return fail(new Error('chỉ nhận https'));
        const req = https.get(u, { rejectUnauthorized: true, signal: opts.signal, headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'HP-Action-LIVE' } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                if (hops >= 5) return fail(new Error('chuyển hướng quá nhiều'));
                return strictFetch(new URL(res.headers.location, u).href, opts, hops + 1).then(ok, fail);
            }
            ok({
                ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, url: u.href, body: res,
                json: () => new Promise((y, n) => { let s = ''; res.setEncoding('utf8'); res.on('data', (c) => { s += c; if (s.length > 65536) req.destroy(new Error('manifest quá lớn')); }); res.on('end', () => { try { y(JSON.parse(s)); } catch (e) { n(e); } }); res.on('error', n); }),
            });
        });
        req.on('error', fail);
    });
}

function sha256File(file) {
    return new Promise((ok, fail) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', fail).on('end', () => ok(h.digest('hex')));
    });
}

/** Tìm game exe đã cài trong mục Gỡ cài đặt của Windows (bộ cài electron-builder). namePrefix: 'HP Sinh T' (chữ ASCII đầu tên). */
function findInstalledWindows(namePrefix, exeName) {
    if (process.platform !== 'win32') return Promise.resolve(null);
    const { execFile } = require('child_process');
    const like = String(namePrefix).replace(/[^\w ]/g, '') + '*';
    const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
        "Get-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*," +
        "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*," +
        "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue |" +
        ` Where-Object { $_.DisplayName -like '${like}' } | Select-Object DisplayVersion,InstallLocation,DisplayIcon,UninstallString | ConvertTo-Json -Compress`;
    return new Promise((ok) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10000 }, (err, out) => {
            if (err) return ok(null);
            let rows;
            try { rows = JSON.parse(String(out || '').trim() || 'null'); } catch (e) { return ok(null); }
            ok(pickInstalled(Array.isArray(rows) ? rows : rows ? [rows] : [], exeName, (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }));
        });
    });
}
/** Từ các dòng registry → { version, exe } của bản cài còn file exe (thuần, có test). */
function pickInstalled(rows, exeName, exists) {
    for (const r of rows) {
        if (!r) continue;
        const cands = [];
        const icon = String(r.DisplayIcon || '').replace(/^"|"?,\s*\d+$|"$/g, '');
        if (/\.exe$/i.test(icon) && !/uninst/i.test(path.win32.basename(icon))) cands.push(icon);
        if (r.InstallLocation) cands.push(path.win32.join(String(r.InstallLocation), exeName));
        const un = String(r.UninstallString || '').match(/^"?([^"]+\.exe)"?/i);
        if (un) cands.push(path.win32.join(path.win32.dirname(un[1]), exeName));
        if (icon) cands.push(path.win32.join(path.win32.dirname(icon), exeName));
        const exe = cands.find((c) => exists(c));
        if (exe) return { version: VERSION_RE.test(String(r.DisplayVersion || '')) ? String(r.DisplayVersion) : '', exe };
    }
    return null;
}

/** Giải nén zip bằng tar.exe có sẵn của Windows (bsdtar: tự bỏ đường dẫn tuyệt đối và "..") / unzip. */
function extractZip(zip, dest) {
    const { execFile } = require('child_process');
    const win = process.platform === 'win32';
    const cmd = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
    const args = win ? ['-xf', zip, '-C', dest] : ['-q', zip, '-d', dest];
    return new Promise((ok, fail) => execFile(cmd, args, { windowsHide: true, timeout: 300000 }, (e) => (e ? fail(e) : ok())));
}
/** Sau giải nén: không có liên kết tắt (symlink) nào, mọi file nằm trong dest. */
function checkTree(dest) {
    const root = path.resolve(dest) + path.sep;
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isSymbolicLink() || !path.resolve(p).startsWith(root)) throw new Error('gói có đường dẫn lạ');
            if (e.isDirectory()) walk(p);
        }
    };
    walk(dest);
}

/**
 * opts: id, kind 'exe'|'web', dir, manifestUrl, isLicensed(), canUse(),
 *   exe:  fileName(version) → tên bộ cài, findInstalled(), spawnImpl(file)
 *   web:  entry ('index.html'), extract(zip, dest), openWeb(entry)  — app phục vụ webRoot() tại /dl/<id>/
 *   fetchImpl, onChange(state), log
 */
function createGameDownload(opts) {
    const o = Object.assign({ kind: 'exe', entry: 'index.html', fetchImpl: strictFetch, extract: extractZip, isLicensed: () => true, canUse: () => true, onChange: () => {}, log: () => {} }, opts);
    const web = o.kind === 'web';
    const fileName = o.fileName || ((v) => `${o.id}-${v}${web ? '.zip' : '.exe'}`);
    const st = { manifest: null, checkedAt: 0, error: '', installed: null, installedAt: 0, dl: { status: 'idle', received: 0, total: 0, error: '' } };
    let abort = null, lastEmit = 0;
    try { fs.mkdirSync(o.dir, { recursive: true }); } catch (e) {}

    const emit = (force) => {
        const now = Date.now();
        if (!force && now - lastEmit < 300) return;
        lastEmit = now;
        try { o.onChange(state()); } catch (e) {}
    };
    function record() {
        try {
            const r = JSON.parse(fs.readFileSync(path.join(o.dir, 'setup.json'), 'utf8'));
            return r && VERSION_RE.test(String(r.version || '')) ? r : null;
        } catch (e) { return null; }
    }
    // exe: bộ cài đã tải (đúng tên chuẩn + đủ dung lượng). web: không giữ zip sau khi giải nén.
    function localSetup() {
        const rec = record();
        if (web || !rec || rec.file !== fileName(rec.version)) return null;
        const file = path.join(o.dir, rec.file);
        try { if (fs.statSync(file).size !== rec.size) return null; } catch (e) { return null; }
        return { version: rec.version, file, sha256: rec.sha256, size: rec.size };
    }
    /** web: thư mục game đang dùng (đã giải nén, có file vào) — server phục vụ tại /dl/<id>/. */
    function webRoot() {
        if (!web) return null;
        const rec = record();
        if (!rec || !rec.webDir || !/^web-\d+\.\d+\.\d+$/.test(rec.webDir)) return null;
        const d = path.join(o.dir, rec.webDir);
        return fs.existsSync(path.join(d, o.entry)) ? d : null;
    }
    async function refreshInstalled(force) {
        if (web) { const rec = record(); st.installed = webRoot() ? { version: rec.version } : null; return st.installed; }
        if (!force && Date.now() - st.installedAt < 5000) return st.installed;
        try { st.installed = await o.findInstalled(); } catch (e) { st.installed = null; }
        st.installedAt = Date.now();
        return st.installed;
    }
    function state() {
        if (web) { const rec = record(); st.installed = webRoot() ? { version: rec.version } : null; }
        const m = st.manifest, setup = localSetup(), inst = st.installed;
        const latest = m ? m.version : '';
        const setupReady = !!setup && (!latest || compareVersions(setup.version, latest) >= 0);
        let action = 'download';
        if (inst && !(latest && compareVersions(latest, inst.version || '0.0.0') > 0)) action = 'open';
        else if (inst) action = setupReady ? 'install-update' : 'update';
        else if (setupReady) action = 'install';
        return {
            id: o.id, kind: o.kind,
            licensed: !!o.isLicensed(), allowed: !!o.canUse(),
            latest: m ? { version: m.version, size: m.size, notes: m.notes } : null,   // KHÔNG trả url
            checkedAt: st.checkedAt, error: st.error,
            installed: inst ? { version: inst.version } : null,
            setup: setup ? { version: setup.version, size: setup.size } : null,
            download: { ...st.dl }, action,
        };
    }
    async function checkManifest() {
        if (!o.isLicensed() || !o.canUse()) { st.error = 'Cần KEY bản quyền đã kích hoạt để tải game'; emit(true); return state(); }
        if (!o.manifestUrl) { st.error = 'Chưa cấu hình nguồn tải'; emit(true); return state(); }
        try {
            const r = await o.fetchImpl(o.manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (r.status === 404) { st.manifest = null; st.error = 'Game chưa có bản tải về — HP Media sẽ mở sớm'; await refreshInstalled(true); emit(true); return state(); }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const m = validateManifest(await r.json());
            if (!m) throw new Error('manifest sai định dạng');
            st.manifest = m; st.checkedAt = Date.now(); st.error = '';
        } catch (e) {
            st.error = 'Không kiểm tra được bản mới (' + (e && e.message || e) + ')';
            o.log(`[${o.id}] manifest lỗi:`, e && e.message);
        }
        await refreshInstalled(true);
        emit(true);
        return state();
    }
    // web: giải nén vào thư mục tạm → kiểm → đổi tên thành web-<version> → bỏ bản cũ
    async function installWeb(zip, version) {
        const tmp = path.join(o.dir, `web-${version}.tmp`), final = path.join(o.dir, `web-${version}`);
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
        try {
            await o.extract(zip, tmp);
            checkTree(tmp);
            if (!fs.existsSync(path.join(tmp, o.entry))) throw new Error('gói thiếu ' + o.entry);
            fs.rmSync(final, { recursive: true, force: true });
            fs.renameSync(tmp, final);
        } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
    }
    async function download() {
        if (st.dl.status === 'downloading' || st.dl.status === 'verifying') return state();
        if (!o.isLicensed() || !o.canUse()) throw new Error('Cần KEY bản quyền đã kích hoạt để tải game');
        if (!st.manifest) await checkManifest();
        const m = st.manifest;
        if (!m) throw new Error(st.error || 'Chưa có thông tin bản tải');
        const name = fileName(m.version);
        const part = path.join(o.dir, name + '.part');
        st.dl = { status: 'downloading', received: 0, total: m.size, error: '' };
        emit(true);
        abort = new AbortController();
        try {
            const r = await o.fetchImpl(m.url, { signal: abort.signal });
            if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
            if (r.url && !/^https:/i.test(r.url)) throw new Error('nguồn tải không an toàn');
            const out = fs.createWriteStream(part);
            const hash = crypto.createHash('sha256');
            try {
                for await (const chunk of r.body) {
                    st.dl.received += chunk.length;
                    if (st.dl.received > m.size) throw new Error('file lớn hơn khai báo');
                    hash.update(chunk);
                    if (!out.write(chunk)) await new Promise((ok) => out.once('drain', ok));
                    emit(false);
                }
            } finally { await new Promise((ok) => out.end(ok)); }
            st.dl.status = 'verifying'; emit(true);
            if (st.dl.received !== m.size) throw new Error('tải thiếu (' + st.dl.received + '/' + m.size + ' byte)');
            if (hash.digest('hex') !== m.sha256) throw new Error('mã kiểm tra SHA-256 không khớp — file hỏng hoặc bị sửa');
            const rec = { version: m.version, file: name, sha256: m.sha256, size: m.size };
            if (web) {
                await installWeb(part, m.version);
                fs.unlinkSync(part);
                rec.webDir = `web-${m.version}`;
            } else fs.renameSync(part, path.join(o.dir, name));
            fs.writeFileSync(path.join(o.dir, 'setup.json'), JSON.stringify(rec));
            // chỉ giữ bản mới nhất
            for (const f of fs.readdirSync(o.dir)) {
                if (f === 'setup.json' || f === name || f === rec.webDir) continue;
                try { fs.rmSync(path.join(o.dir, f), { recursive: true, force: true }); } catch (e) {}
            }
            st.dl = { status: 'done', received: m.size, total: m.size, error: '' };
        } catch (e) {
            try { fs.unlinkSync(part); } catch (x) {}
            const cancelled = abort && abort.signal.aborted;
            st.dl = { status: cancelled ? 'idle' : 'error', received: 0, total: m.size, error: cancelled ? '' : 'Tải lỗi: ' + (e && e.message || e) };
        } finally { abort = null; emit(true); }
        if (st.dl.status === 'error') throw new Error(st.dl.error);
        return state();
    }
    function cancel() { if (abort) abort.abort(); return state(); }
    async function runInstalled() {
        if (web) { if (!webRoot()) throw new Error('Chưa tải game'); await o.openWeb(o.entry); return { ok: true, ran: 'game' }; }
        o.spawnImpl(st.installed.exe);
        return { ok: true, ran: 'game' };
    }
    /** Mở game đã có (cùng bản mới nhất); exe chưa cài / có bản mới đã tải → chạy bộ cài (kiểm lại SHA-256 trước khi chạy). */
    async function open() {
        await refreshInstalled(true);
        const s = state();
        if (s.action === 'open') return runInstalled();
        if (s.action === 'install' || s.action === 'install-update') {
            const setup = localSetup();
            if (!setup || (await sha256File(setup.file)) !== setup.sha256) throw new Error('Bộ cài đã tải bị hỏng — bấm Tải về lại');
            o.spawnImpl(setup.file);
            return { ok: true, ran: 'installer' };
        }
        throw new Error('Chưa tải game');
    }
    /** Mở bản đang có dù có bản mới (chưa muốn cập nhật giữa buổi LIVE). */
    async function openInstalled() {
        if (!(await refreshInstalled(true))) throw new Error('Chưa có game trên máy');
        return runInstalled();
    }
    return { id: o.id, kind: o.kind, state, checkManifest, download, cancel, open, openInstalled, refreshInstalled, webRoot };
}

module.exports = { createGameDownload, strictFetch, validateManifest, compareVersions, pickInstalled, findInstalledWindows, extractZip, checkTree, sha256File };
