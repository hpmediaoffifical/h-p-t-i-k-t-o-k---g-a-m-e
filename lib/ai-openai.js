'use strict';
/**
 * 🪄 Sticker AI — gọi THẲNG OpenAI bằng khoá API người dùng tự tạo ở platform.openai.com.
 *  - Mẫu câu lệnh (prompt) theo phong cách nằm ở đây (STYLE/RULES) — người dùng chỉ gõ chủ thể.
 *  - Khoá lưu mã hoá AES-256-GCM theo HWID máy ở <DATA_DIR>/ai-sticker.json — chép file sang máy khác là vô dụng,
 *    và KHÔNG bao giờ trả khoá về giao diện (chỉ 4 ký tự cuối).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const OPENAI = 'https://api.openai.com/v1';
// Model (developers.openai.com › Image generation, 21/10/2026): cả 2 đều cho nền trong suốt (background "transparent" + png).
// 'auto' = có ảnh thật → Sunburst (sửa ảnh chính xác), chỉ mô tả → Flare (nhanh). Đổi được trong cài đặt khi OpenAI ra model mới.
const DEFAULT_MODEL = 'auto';
const AUTO_MODEL = { edit: 'gpt-image-2.5-sunburst', generate: 'gpt-image-2.5-flare' };
const resolveModel = (model, hasImage) => (!model || model === 'auto' ? (hasImage ? AUTO_MODEL.edit : AUTO_MODEL.generate) : model);

const STYLE = {
    chibi: 'Cute chibi character sticker: big head, small body, large sparkling eyes, soft pastel colors, clean bold outlines, kawaii style.',
    sticker: 'Die-cut vinyl sticker illustration, vibrant flat colors, clean vector-like shapes, glossy highlight.',
    '3d': 'Adorable 3D rendered figurine like a soft vinyl toy, smooth glossy materials, soft studio lighting, Pixar-like charm.',
    anime: 'Anime illustration sticker, cel shading, expressive eyes, crisp linework, bright colors.',
    pixel: 'Pixel art sticker, 64x64 style upscaled, crisp pixels, limited bright palette.',
};
const RULES = 'Single subject, centered, full body visible, thick white die-cut outline around the subject, transparent background, no text, no letters, no watermark, no frame.';

function buildPrompt(preset, userPrompt, hasImage) {
    const p = String(userPrompt || '').trim();
    if (preset === 'none') return `${p}. Transparent background, no watermark.`;
    const lead = hasImage ? 'Turn the person, pet or object in the reference photo into this style, keeping recognizable features (hair, colors, clothing). ' : '';
    return `${lead}${STYLE[preset] || STYLE.chibi} Subject: ${p}. ${RULES}`;
}

function sniffMime(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return '';
    if (buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
    return '';
}

function buildMultipart(fields, file) {
    const boundary = '----hpai' + crypto.randomBytes(12).toString('hex');
    const parts = [];
    Object.entries(fields).forEach(([k, v]) => {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    });
    if (file) {
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`));
        parts.push(file.data, Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function httpRequest(url, { method, headers, body }, timeoutMs) {
    const u = new URL(url);
    return new Promise((resolve, reject) => {
        const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, timeout: timeoutMs }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (body) req.write(body);
        req.end();
    });
}

/** Lỗi OpenAI → mã lỗi chung của Sticker AI (thông điệp tiếng Việt ở ai-sticker.js) */
function mapOpenAIError(status, j) {
    const e = (j && j.error) || {};
    const code = String(e.code || ''), type = String(e.type || ''), msg = String(e.message || '');
    if (code === 'moderation_blocked' || /safety system|moderation/i.test(msg)) return 'moderation_blocked';
    if (status === 401) return 'key_invalid';
    if (status === 403 && /verif/i.test(msg)) return 'org_unverified';
    if (status === 429 && (code === 'insufficient_quota' || type === 'insufficient_quota')) return 'no_credit';
    if (code === 'billing_hard_limit_reached' || /billing/i.test(msg)) return 'no_credit';
    if (status === 429) return 'rate_limited';
    if (status === 404 || code === 'model_not_found') return 'model_unavailable';
    if (status === 400 && /image/i.test(msg) && /invalid|unsupported/i.test(msg)) return 'bad_image';
    return 'provider_error';
}

function createOpenAI(opts) {
    const o = opts || {};
    const request = o.transport || httpRequest;
    const timeout = o.timeoutMs || 180000;

    async function generate({ apiKey, model, prompt, preset, quality, image }) {
        const m = resolveModel(model, !!image);
        const full = buildPrompt(preset, prompt, !!image);
        const common = { model: m, prompt: full, size: '1024x1024', quality: quality || 'medium', background: 'transparent', output_format: 'png', n: '1' };
        let r;
        try {
            if (image) {
                const type = sniffMime(image);
                if (!type) return { ok: false, error: 'bad_image' };
                const mp = buildMultipart(common, { name: 'image[]', filename: 'photo.' + type.split('/')[1], type, data: image });
                r = await request(`${OPENAI}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': mp.contentType, 'Content-Length': mp.body.length }, body: mp.body }, timeout);
            } else {
                const body = JSON.stringify({ ...common, n: 1 });
                r = await request(`${OPENAI}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body }, timeout);
            }
        } catch (e) {
            return { ok: false, error: /timeout/i.test(String(e && e.message)) ? 'timeout' : 'no_network' };
        }
        let j = null;
        try { j = JSON.parse(r.raw); } catch (_) { j = null; }
        if (r.status !== 200 || !j) return { ok: false, error: mapOpenAIError(r.status, j), detail: j && j.error && j.error.message };
        const b64 = j.data && j.data[0] && j.data[0].b64_json;
        if (!b64) return { ok: false, error: 'provider_error' };
        return { ok: true, png: b64, model: m, usage: j.usage || null };
    }

    /** Kiểm tra khoá + quyền dùng model (không tốn tiền ảnh). */
    async function checkKey({ apiKey, model }) {
        const m = resolveModel(model, false);
        let r;
        try { r = await request(`${OPENAI}/models/${encodeURIComponent(m)}`, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } }, 20000); }
        catch (_) { return { ok: false, error: 'no_network' }; }
        if (r.status === 200) return { ok: true, model: m };
        let j = null;
        try { j = JSON.parse(r.raw); } catch (_) {}
        return { ok: false, error: mapOpenAIError(r.status, j) };
    }

    return { generate, checkKey };
}

/* ---------------- Cài đặt (chế độ + khoá mã hoá theo máy) ---------------- */
function createSettings({ dataDir, machineSecret }) {
    const file = path.join(dataDir, 'ai-sticker.json');
    const k = () => crypto.createHash('sha256').update('hp-ai-sticker|' + String(machineSecret ? machineSecret() : '')).digest();
    const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { return {}; } };
    const write = (d) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(file + '.tmp', file); };
    function enc(text) {
        const iv = crypto.randomBytes(12);
        const c = crypto.createCipheriv('aes-256-gcm', k(), iv);
        const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
        return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
    }
    function dec(s) {
        try {
            const [iv, tag, ct] = String(s || '').split('.').map((x) => Buffer.from(x, 'base64'));
            const d = crypto.createDecipheriv('aes-256-gcm', k(), iv);
            d.setAuthTag(tag);
            return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
        } catch (_) { return ''; }
    }
    function get() {
        const d = read();
        const key = d.keyEnc ? dec(d.keyEnc) : '';
        return { model: String(d.model || DEFAULT_MODEL), quality: ['low', 'medium', 'high'].includes(d.quality) ? d.quality : 'medium', apiKey: key };
    }
    /** Dạng an toàn gửi về giao diện — không có khoá. */
    function view() {
        const s = get();
        return { model: s.model, quality: s.quality, defaultModel: DEFAULT_MODEL, hasKey: !!s.apiKey, keyHint: s.apiKey ? '…' + s.apiKey.slice(-4) : '' };
    }
    function set(patch) {
        const p = patch || {};
        const d = read();
        if (['low', 'medium', 'high'].includes(p.quality)) d.quality = p.quality;
        if (typeof p.model === 'string') d.model = p.model.trim().slice(0, 64).replace(/[^\w.\-:]/g, '') || DEFAULT_MODEL;
        if (p.clearKey) delete d.keyEnc;
        if (typeof p.apiKey === 'string' && p.apiKey.trim()) {
            const key = p.apiKey.trim();
            if (!/^sk-[\w-]{20,}$/.test(key)) return { ok: false, error: 'key_format' };
            d.keyEnc = enc(key);
        }
        write(d);
        return { ok: true, settings: view() };
    }
    return { get, view, set, file };
}

module.exports = { createOpenAI, createSettings, buildPrompt, buildMultipart, sniffMime, mapOpenAIError, DEFAULT_MODEL, AUTO_MODEL, resolveModel };
