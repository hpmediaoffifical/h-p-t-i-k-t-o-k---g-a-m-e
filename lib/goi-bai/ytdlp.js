'use strict';
/**
 * 🎵 Gọi Bài — cầu nối yt-dlp: tải bản chính thức từ GitHub (kiểm SHA-256), tìm bài, lấy link âm thanh.
 * Hàm đọc dữ liệu (parse*, verifyBinary, assetName) là thuần, test: tests/goibai-ytdlp.test.js.
 *
 * Vì sao yt-dlp (spec §1): không có quảng cáo YouTube lọt lên sóng, không vướng video cấm nhúng.
 * Vì sao TỰ tải + kiểm SHA thay cho `yt-dlp -U`: -U tự thay exe mà không qua kiểm tra của app (cùng tinh thần
 * lib/update-integrity.js — mọi exe tải về phải khớp mã băm do chính bản release công bố).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn: nodeSpawn } = require('child_process');

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const SEARCH_TIMEOUT_MS = 20000;
const MAX_PROCS = 2;
const UA = 'HP-Action-LIVE';

function assetName(platform = process.platform) {
    if (platform === 'win32') return 'yt-dlp.exe';
    if (platform === 'darwin') return 'yt-dlp_macos';
    return 'yt-dlp';
}

function parseSums(text) {
    const m = new Map();
    for (const line of String(text || '').split(/\r?\n/)) {
        const mm = /^([0-9a-fA-F]{6,})\s+\*?(\S+)\s*$/.exec(line.trim());
        if (mm) m.set(mm[2], mm[1].toLowerCase());
    }
    return m;
}

/** expectedSha từ SHA2-256SUMS (bắt buộc); digest = trường `digest` của asset GitHub ("sha256:…", có thì phải khớp). */
function verifyBinary(buf, expectedSha, digest) {
    const exp = String(expectedSha || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(exp)) return false;
    const got = crypto.createHash('sha256').update(buf).digest('hex');
    if (got !== exp) return false;
    const d = String(digest || '');
    if (d && d.toLowerCase() !== 'sha256:' + got) return false;
    return true;
}

/** Phiên bản yt-dlp dạng "YYYY.MM.DD[.xxx]" cũ hơn `days` ngày → nên cập nhật (YouTube đổi cách chặn liên tục). */
function isStale(version, nowMs, days) {
    const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(String(version || ''));
    if (!m) return false;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return nowMs - t > days * 86400000;
}

function parseSearchOutput(stdout) {
    const items = [];
    for (const line of String(stdout || '').split(/\r?\n/)) {
        const s = line.trim();
        if (!s.startsWith('{')) continue;
        let j; try { j = JSON.parse(s); } catch (_) { continue; }
        if (!j || !j.id) continue;
        const live = j.live_status === 'is_live' || j.live_status === 'is_upcoming' || j.is_live === true;
        items.push({
            id: String(j.id),
            title: String(j.title || ''),
            channel: String(j.channel || j.uploader || ''),
            duration: Number(j.duration) > 0 ? Math.round(Number(j.duration)) : 0,
            isLive: !!live,
            thumb: `https://i.ytimg.com/vi/${encodeURIComponent(String(j.id))}/mqdefault.jpg`
        });
    }
    return items;
}

function parseAudioJson(text, nowMs = Date.now()) {
    let j; try { j = JSON.parse(String(text || '').trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop() || ''); } catch (_) { return null; }
    if (!j || typeof j !== 'object') return null;
    const f = j.url ? j : (Array.isArray(j.requested_formats) ? j.requested_formats.find(x => x && x.url) : null);
    if (!f || !f.url) return null;
    let validUntil = nowMs + 2 * 3600000;
    try {
        const e = Number(new URL(f.url).searchParams.get('expire'));
        if (e > 0) validUntil = e * 1000 - 5 * 60000;   // trừ hao 5 phút
    } catch (_) {}
    const ext = String(f.ext || j.ext || '').toLowerCase();
    return {
        url: String(f.url),
        headers: Object.assign({}, j.http_headers || {}, f.http_headers || {}),
        validUntil,
        ext,
        contentType: ext === 'webm' ? 'audio/webm' : ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
        duration: Number(j.duration) || 0
    };
}

/**
 * @param {{dir:string, fetch:Function, spawn?:Function, platform?:string, log?:Function}} opts
 */
function createYtdlp(opts) {
    const dir = opts.dir;
    const fetch = opts.fetch;
    const spawn = opts.spawn || nodeSpawn;
    const platform = opts.platform || process.platform;
    const log = opts.log || (() => {});
    const exe = path.join(dir, assetName(platform));
    const state = { state: 'missing', version: '', progress: 0, error: '' };
    let running = 0;
    const waiters = [];
    let installing = null;

    const installed = () => { try { return fs.statSync(exe).size > 1000000; } catch (_) { return false; } };
    if (installed()) state.state = 'ready';

    function acquire() {
        if (running < MAX_PROCS) { running++; return Promise.resolve(); }
        return new Promise(res => waiters.push(res)).then(() => { running++; });
    }
    function release() { running--; const w = waiters.shift(); if (w) w(); }

    async function run(args, timeoutMs = SEARCH_TIMEOUT_MS) {
        if (!installed()) { const e = new Error('yt-dlp chưa cài'); e.code = 'noengine'; throw e; }
        await acquire();
        try {
            return await new Promise((resolve, reject) => {
                let out = '', err = '';
                const p = spawn(exe, args, { windowsHide: true });
                const timer = setTimeout(() => { try { p.kill(); } catch (_) {} const e = new Error('yt-dlp quá thời gian'); e.code = 'timeout'; reject(e); }, timeoutMs);
                p.stdout.on('data', d => { out += d; if (out.length > 8e6) out = out.slice(-8e6); });
                p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
                p.on('error', e => { clearTimeout(timer); reject(e); });
                p.on('close', code => {
                    clearTimeout(timer);
                    if (code === 0 || out.trim()) resolve(out);
                    else { const e = new Error((err.trim().split(/\r?\n/).pop() || 'yt-dlp lỗi') + ` (mã ${code})`); e.code = 'error'; reject(e); }
                });
            });
        } finally { release(); }
    }

    async function version() {
        try { state.version = String(await run(['--version'], 10000)).trim().split(/\r?\n/)[0]; }
        catch (_) { state.version = ''; }
        return state.version;
    }

    async function search(query, n = 5) {
        const q = String(query || '').replace(/[\r\n]/g, ' ').trim().slice(0, 120);
        if (!q) return [];
        const out = await run(['--dump-json', '--flat-playlist', '--no-warnings', '--ignore-errors', `ytsearch${Math.max(1, Math.min(10, n))}:${q}`]);
        return parseSearchOutput(out);
    }

    async function resolveAudio(videoId) {
        const id = String(videoId || '');
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw Object.assign(new Error('videoId sai'), { code: 'error' });
        const out = await run(['-j', '--no-playlist', '--no-warnings', '-f', 'bestaudio[ext=m4a]/bestaudio', `https://www.youtube.com/watch?v=${id}`], 30000);
        const a = parseAudioJson(out);
        if (!a) throw Object.assign(new Error('Không lấy được link âm thanh'), { code: 'error' });
        return a;
    }

    async function getJson(url) {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
        if (!r.ok) throw new Error(`GitHub trả ${r.status}`);
        return r.json();
    }

    async function doInstall(onChange) {
        state.state = 'downloading'; state.progress = 0; state.error = ''; onChange && onChange();
        try {
            const rel = await getJson(RELEASE_API);
            const name = assetName(platform);
            const asset = (rel.assets || []).find(a => a.name === name);
            const sumsAsset = (rel.assets || []).find(a => a.name === 'SHA2-256SUMS');
            if (!asset || !sumsAsset) throw new Error('Bản release thiếu file yt-dlp hoặc SHA2-256SUMS');
            const sumsRes = await fetch(sumsAsset.browser_download_url, { headers: { 'User-Agent': UA } });
            if (!sumsRes.ok) throw new Error(`Tải SHA2-256SUMS lỗi ${sumsRes.status}`);
            const expected = parseSums(await sumsRes.text()).get(name);
            if (!expected) throw new Error('SHA2-256SUMS không có mã của ' + name);
            const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': UA } });
            if (!res.ok) throw new Error(`Tải yt-dlp lỗi ${res.status}`);
            const total = Number(res.headers.get('content-length')) || Number(asset.size) || 0;
            const chunks = []; let got = 0, lastPush = 0;
            await new Promise((resolve, reject) => {
                res.body.on('data', c => {
                    chunks.push(c); got += c.length;
                    if (total) state.progress = Math.min(99, Math.round(got * 100 / total));
                    if (Date.now() - lastPush > 400) { lastPush = Date.now(); onChange && onChange(); }
                });
                res.body.on('end', resolve);
                res.body.on('error', reject);
            });
            const buf = Buffer.concat(chunks);
            if (!verifyBinary(buf, expected, asset.digest)) throw new Error('Mã băm SHA-256 không khớp — đã huỷ, không cài');
            fs.mkdirSync(dir, { recursive: true });
            const tmp = exe + '.tmp';
            fs.writeFileSync(tmp, buf);
            if (platform !== 'win32') fs.chmodSync(tmp, 0o755);
            try { fs.unlinkSync(exe); } catch (_) {}
            fs.renameSync(tmp, exe);
            state.state = 'ready'; state.progress = 100;
            await version();
            log(`[goibai] yt-dlp ${state.version || rel.tag_name} đã cài (SHA-256 khớp)`);
        } catch (e) {
            state.state = installed() ? 'ready' : 'error';
            state.error = String(e && e.message || e);
            log('[goibai] cài yt-dlp lỗi: ' + state.error);
        } finally {
            onChange && onChange();
        }
    }

    function install(onChange) {
        if (!installing) installing = doInstall(onChange).finally(() => { installing = null; });
        return installing;
    }

    return {
        exe,
        status: () => Object.assign({ installed: installed() }, state),
        install, version, search, resolveAudio,
        get busy() { return !!installing; }
    };
}

module.exports = { createYtdlp, assetName, parseSums, parseSearchOutput, parseAudioJson, verifyBinary, isStale };
