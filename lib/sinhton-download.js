'use strict';
/**
 * 🔫 Sinh Tồn — game bắn súng 3D chạy RIÊNG (bộ cài Windows ~110 MB), KHÔNG gói vào HP Action LIVE.
 * App chỉ tải bộ cài về khi có bản quyền, kiểm SHA-256, chạy bộ cài / mở game đã cài, báo khi có bản mới.
 *
 * Manifest đặt trên máy chủ HP Media (không phải GitHub), app đọc ngầm, KHÔNG đưa link tải ra giao diện:
 *   { "version": "1.1.0", "url": "https://hpvn.media/…/HP-Sinh-Ton-Setup-1.1.0.exe",
 *     "sha256": "<64 hex>", "size": 114566783, "notes": "…" }
 * Bộ cài lưu ở <dir> (%APPDATA%\hp-action-live\sinhton\), chỉ giữ bản mới nhất.
 *
 * Mọi phụ thuộc bên ngoài (fetch, tìm game đã cài, chạy exe) truyền vào → test được không cần mạng/registry.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_SIZE = 600 * 1024 * 1024;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SETUP_RE = /^HP-Sinh-Ton-Setup-(\d{1,4}\.\d{1,4}\.\d{1,4})\.exe$/;
const GAME_EXE = 'HP Sinh Tồn.exe';

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

function sha256File(file) {
    return new Promise((ok, fail) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', fail).on('end', () => ok(h.digest('hex')));
    });
}

/** Tìm game đã cài trong mục Gỡ cài đặt của Windows (bộ cài electron-builder, cài cho 1 người hoặc cả máy). */
function findInstalledWindows() {
    if (process.platform !== 'win32') return Promise.resolve(null);
    const { execFile } = require('child_process');
    const ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
        "Get-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*," +
        "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*," +
        "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* -ErrorAction SilentlyContinue |" +
        " Where-Object { $_.DisplayName -like 'HP Sinh T*' } | Select-Object DisplayVersion,InstallLocation,DisplayIcon,UninstallString | ConvertTo-Json -Compress";
    return new Promise((ok) => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10000 }, (err, out) => {
            if (err) return ok(null);
            let rows;
            try { rows = JSON.parse(String(out || '').trim() || 'null'); } catch (e) { return ok(null); }
            ok(pickInstalled(Array.isArray(rows) ? rows : rows ? [rows] : [], (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }));
        });
    });
}
/** Từ các dòng registry → { version, exe } của bản cài còn file exe (thuần, có test). */
function pickInstalled(rows, exists) {
    for (const r of rows) {
        if (!r) continue;
        const cands = [];
        const icon = String(r.DisplayIcon || '').replace(/^"|"?,\s*\d+$|"$/g, '');
        if (/\.exe$/i.test(icon) && !/uninst/i.test(path.win32.basename(icon))) cands.push(icon);
        if (r.InstallLocation) cands.push(path.win32.join(String(r.InstallLocation), GAME_EXE));
        const un = String(r.UninstallString || '').match(/^"?([^"]+\.exe)"?/i);
        if (un) cands.push(path.win32.join(path.win32.dirname(un[1]), GAME_EXE));
        if (icon) cands.push(path.win32.join(path.win32.dirname(icon), GAME_EXE));
        const exe = cands.find((c) => exists(c));
        if (exe) return { version: VERSION_RE.test(String(r.DisplayVersion || '')) ? String(r.DisplayVersion) : '', exe };
    }
    return null;
}

/**
 * opts: dir, manifestUrl, isLicensed(), canUse() (KEY mở mục này), fetchImpl, findInstalled(), spawnImpl(file),
 *       onChange(state) (gọi khi đổi trạng thái / tiến độ), log
 */
function createSinhTon(opts) {
    const o = Object.assign({ fetchImpl: (...a) => fetch(...a), findInstalled: findInstalledWindows, isLicensed: () => true, canUse: () => true, onChange: () => {}, log: () => {} }, opts);
    const st = { manifest: null, checkedAt: 0, error: '', installed: null, installedAt: 0, dl: { status: 'idle', received: 0, total: 0, error: '' } };
    let abort = null, lastEmit = 0;
    try { fs.mkdirSync(o.dir, { recursive: true }); } catch (e) {}

    const emit = (force) => {
        const now = Date.now();
        if (!force && now - lastEmit < 300) return;
        lastEmit = now;
        try { o.onChange(state()); } catch (e) {}
    };
    // bộ cài đã tải: file mới nhất khớp tên chuẩn (bản ghi setup.json giữ mã SHA-256 lúc tải)
    function localSetup() {
        let rec = null;
        try { rec = JSON.parse(fs.readFileSync(path.join(o.dir, 'setup.json'), 'utf8')); } catch (e) {}
        if (!rec || !SETUP_RE.test(String(rec.file || ''))) return null;
        const file = path.join(o.dir, rec.file);
        try { if (fs.statSync(file).size !== rec.size) return null; } catch (e) { return null; }
        return { version: rec.version, file, sha256: rec.sha256, size: rec.size };
    }
    async function refreshInstalled(force) {
        if (!force && Date.now() - st.installedAt < 5000) return st.installed;
        try { st.installed = await o.findInstalled(); } catch (e) { st.installed = null; }
        st.installedAt = Date.now();
        return st.installed;
    }
    function state() {
        const m = st.manifest, setup = localSetup(), inst = st.installed;
        const latest = m ? m.version : '';
        const setupReady = !!setup && (!latest || compareVersions(setup.version, latest) >= 0);
        let action = 'download';
        if (inst && !(latest && compareVersions(latest, inst.version || '0.0.0') > 0)) action = 'open';
        else if (inst) action = setupReady ? 'install-update' : 'update';
        else if (setupReady) action = 'install';
        return {
            licensed: !!o.isLicensed(), allowed: !!o.canUse(),
            latest: m ? { version: m.version, size: m.size, notes: m.notes } : null,   // KHÔNG trả url
            checkedAt: st.checkedAt, error: st.error,
            installed: inst ? { version: inst.version } : null,
            setup: setup ? { version: setup.version, size: setup.size } : null,
            download: { ...st.dl }, action,
        };
    }
    async function checkManifest() {
        if (!o.isLicensed() || !o.canUse()) { st.error = 'Cần KEY bản quyền đã kích hoạt để tải Sinh Tồn'; emit(true); return state(); }
        if (!o.manifestUrl) { st.error = 'Chưa cấu hình nguồn tải Sinh Tồn'; emit(true); return state(); }
        try {
            const r = await o.fetchImpl(o.manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const m = validateManifest(await r.json());
            if (!m) throw new Error('manifest sai định dạng');
            st.manifest = m; st.checkedAt = Date.now(); st.error = '';
        } catch (e) {
            st.error = 'Không kiểm tra được bản Sinh Tồn mới (' + (e && e.message || e) + ')';
            o.log('[sinhton] manifest lỗi:', e && e.message);
        }
        await refreshInstalled(true);
        emit(true);
        return state();
    }
    async function download() {
        if (st.dl.status === 'downloading' || st.dl.status === 'verifying') return state();
        if (!o.isLicensed() || !o.canUse()) throw new Error('Cần KEY bản quyền đã kích hoạt để tải Sinh Tồn');
        if (!st.manifest) await checkManifest();
        const m = st.manifest;
        if (!m) throw new Error(st.error || 'Chưa có thông tin bản tải');
        const name = `HP-Sinh-Ton-Setup-${m.version}.exe`;
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
            fs.renameSync(part, path.join(o.dir, name));
            fs.writeFileSync(path.join(o.dir, 'setup.json'), JSON.stringify({ version: m.version, file: name, sha256: m.sha256, size: m.size }));
            for (const f of fs.readdirSync(o.dir)) if (f !== name && /^HP-Sinh-Ton-Setup-.*\.exe(\.part)?$/.test(f)) { try { fs.unlinkSync(path.join(o.dir, f)); } catch (e) {} }
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
    /** Mở game đã cài (cùng bản mới nhất); chưa cài / có bản mới → chạy bộ cài đã tải (kiểm lại SHA-256 trước khi chạy). */
    async function open() {
        await refreshInstalled(true);
        const s = state();
        if (s.action === 'open' && st.installed) { o.spawnImpl(st.installed.exe); return { ok: true, ran: 'game' }; }
        if (s.action === 'install' || s.action === 'install-update') {
            const setup = localSetup();
            if (!setup || (await sha256File(setup.file)) !== setup.sha256) throw new Error('Bộ cài đã tải bị hỏng — bấm Tải về lại');
            o.spawnImpl(setup.file);
            return { ok: true, ran: 'installer' };
        }
        throw new Error('Chưa tải bộ cài Sinh Tồn');
    }
    /** Mở bản đang cài dù có bản mới (người dùng chưa muốn cập nhật giữa buổi LIVE). */
    async function openInstalled() {
        const inst = await refreshInstalled(true);
        if (!inst) throw new Error('Chưa cài Sinh Tồn');
        o.spawnImpl(inst.exe);
        return { ok: true, ran: 'game' };
    }
    return { state, checkManifest, download, cancel, open, openInstalled, refreshInstalled };
}

module.exports = { createSinhTon, validateManifest, compareVersions, pickInstalled, sha256File, GAME_EXE };
