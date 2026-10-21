'use strict';
/**
 * 🪄 Sticker AI cho Hũ Thủy Tinh — người dùng TỰ tạo tài khoản OpenAI và dán khoá API của họ
 * (lib/ai-openai.js gọi thẳng OpenAI; HP Media không trung gian, không trả tiền ảnh).
 * Thư viện ảnh đã tạo nằm ở <DATA_DIR>/ai-art/ (index.json + <id>.png), overlay OBS đọc qua /ai-art/<id>.png.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRESETS = ['chibi', 'sticker', '3d', 'anime', 'pixel', 'none'];
const QUALITIES = ['low', 'medium', 'high'];
const MAX_PROMPT = 1000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_LIBRARY = 200;

const ERR_VI = {
    bad_params: 'Thiếu mô tả hoặc dữ liệu không hợp lệ.',
    image_too_large: 'Ảnh quá lớn (tối đa 4 MB).',
    bad_image: 'Ảnh không đọc được — dùng PNG/JPG/WebP.',
    moderation_blocked: 'OpenAI từ chối nội dung (ảnh/mô tả không phù hợp). Thử mô tả khác.',
    provider_error: 'OpenAI đang lỗi — thử lại sau.',
    bad_response: 'OpenAI trả dữ liệu lạ — thử lại sau.',
    timeout: 'AI vẽ quá lâu — thử lại (chất lượng Nhanh sẽ nhanh hơn).',
    busy: 'Đang có 1 ảnh đang vẽ — đợi xong rồi tạo tiếp.',
    rate_limited: 'OpenAI báo gửi quá nhanh — đợi chút rồi thử lại.',
    no_key: 'Chưa dán khoá OpenAI — mở 🪄 AI › Khoá OpenAI.',
    key_format: 'Khoá không đúng dạng (khoá OpenAI bắt đầu bằng sk-).',
    key_invalid: 'Khoá OpenAI sai hoặc đã bị xoá — tạo khoá mới ở platform.openai.com › API keys.',
    no_credit: 'Tài khoản OpenAI hết tiền — nạp thêm ở platform.openai.com › Billing.',
    org_unverified: 'OpenAI yêu cầu xác minh tổ chức trước khi dùng model ảnh — làm ở platform.openai.com › Settings › Organization.',
    model_unavailable: 'Tài khoản chưa dùng được model này — đổi model hoặc xác minh tổ chức.',
    no_network: 'Không kết nối được OpenAI — kiểm tra mạng.',
};
const errVi = (code, fallback) => ERR_VI[code] || fallback || ('Lỗi: ' + code);

/** Chuẩn hoá yêu cầu từ panel. Trả { ok, req } hoặc { ok:false, error }. */
function normalizeRequest(body) {
    const b = body && typeof body === 'object' ? body : {};
    const prompt = String(b.prompt || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PROMPT);
    const preset = PRESETS.includes(b.preset) ? b.preset : 'chibi';
    const quality = QUALITIES.includes(b.quality) ? b.quality : 'medium';
    let image = null;
    if (b.image) {
        const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(b.image));
        if (!m) return { ok: false, error: 'bad_image' };
        const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
        if (!buf.length) return { ok: false, error: 'bad_image' };
        if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'image_too_large' };
        image = buf;
    }
    if (!prompt && !image) return { ok: false, error: 'bad_params' };
    return { ok: true, req: { prompt: prompt || 'cute sticker of the subject in the photo', preset, quality, image } };
}

/** PNG có kênh alpha? (IHDR color type 4 = xám+alpha, 6 = RGBA; hoặc có chunk tRNS) */
function pngHasAlpha(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return false;
    const colorType = buf[25];
    if (colorType === 4 || colorType === 6) return true;
    return buf.indexOf('tRNS', 33, 'latin1') > 0;
}

/** createClient({ dataDir, settings, openai }) — settings/openai từ lib/ai-openai.js */
function createClient(opts) {
    const o = opts || {};
    const dir = path.join(o.dataDir, 'ai-art');
    const indexFile = path.join(dir, 'index.json');
    let busy = false;

    function readIndex() {
        try { const j = JSON.parse(fs.readFileSync(indexFile, 'utf8')); return Array.isArray(j) ? j : []; } catch (_) { return []; }
    }
    function writeIndex(list) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(indexFile + '.tmp', JSON.stringify(list, null, 1));
        fs.renameSync(indexFile + '.tmp', indexFile);
    }
    const publicItem = (it) => ({ ...it, src: '/ai-art/' + it.id + '.png' });
    const fail = (code, extra) => ({ ok: false, error: code, message: errVi(code), ...(extra || {}) });

    async function generate(rawBody) {
        const n = normalizeRequest(rawBody);
        if (!n.ok) return fail(n.error);
        const st = o.settings.get();
        if (!st.apiKey) return fail('no_key');
        if (busy) return fail('busy');
        busy = true;
        try {
            const { prompt, preset, quality, image } = n.req;
            const t0 = Date.now();
            const j = await o.openai.generate({ apiKey: st.apiKey, model: st.model, prompt, preset, quality, image });
            if (!j.ok) return fail(j.error, j.detail ? { detail: String(j.detail).slice(0, 300) } : null);
            const png = Buffer.from(String(j.png || ''), 'base64');
            if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47) return fail('bad_response');
            const id = 'ai' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, id + '.png'), png);
            const item = { id, prompt, preset, hasPhoto: !!image, alpha: pngHasAlpha(png), model: String(j.model || ''), createdAt: Date.now() };
            const list = [item, ...readIndex()];
            list.slice(MAX_LIBRARY).forEach((old) => { try { fs.unlinkSync(path.join(dir, old.id + '.png')); } catch (_) {} });
            writeIndex(list.slice(0, MAX_LIBRARY));
            return { ok: true, item: publicItem(item), ms: Date.now() - t0 };
        } finally {
            busy = false;
        }
    }

    function library() { return readIndex().map(publicItem); }

    function remove(id) {
        if (!/^ai[a-z0-9]+$/i.test(String(id || ''))) return false;
        const list = readIndex();
        const next = list.filter((x) => x.id !== id);
        if (next.length === list.length) return false;
        try { fs.unlinkSync(path.join(dir, id + '.png')); } catch (_) {}
        writeIndex(next);
        return true;
    }

    return { generate, library, remove, dir, get busy() { return busy; } };
}

module.exports = { createClient, normalizeRequest, pngHasAlpha, errVi, PRESETS, QUALITIES };
