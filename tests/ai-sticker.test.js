const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/ai-sticker');
const O = require('../lib/ai-openai');

// PNG 1×1 RGBA (color type 6) và RGB (color type 2)
const PNG_RGBA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PNG_RGB = Buffer.from(PNG_RGBA); PNG_RGB[25] = 2;
const KEY = 'sk-proj-' + 'a'.repeat(40);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sticker-'));
const okOpenAI = (calls) => O.createOpenAI({ transport: async (url, req) => { if (calls) calls.push({ url, req }); return { status: 200, raw: JSON.stringify({ data: [{ b64_json: PNG_RGBA.toString('base64') }] }) }; } });
function client(dir, openai, withKey = true) {
    const settings = O.createSettings({ dataDir: dir, machineSecret: () => 'H' });
    if (withKey) settings.set({ apiKey: KEY, model: 'gpt-image-test' });
    return { settings, c: A.createClient({ dataDir: dir, settings, openai }) };
}

test('normalizeRequest: cắt prompt, preset/quality lạ về mặc định, ảnh data URL', () => {
    const r = A.normalizeRequest({ prompt: '  mèo   chibi  ', preset: 'xyz', quality: 'ultra' });
    assert.strictEqual(r.req.prompt, 'mèo chibi');
    assert.strictEqual(r.req.preset, 'chibi');
    assert.strictEqual(r.req.quality, 'medium');
    assert.strictEqual(r.req.image, null);
    assert.strictEqual(A.normalizeRequest({}).error, 'bad_params');
    assert.strictEqual(A.normalizeRequest({ prompt: 'a', image: 'data:text/plain;base64,AAAA' }).error, 'bad_image');
    const withImg = A.normalizeRequest({ image: 'data:image/png;base64,' + PNG_RGBA.toString('base64') });
    assert.ok(withImg.ok && Buffer.isBuffer(withImg.req.image));
    assert.ok(withImg.req.prompt.length > 0, 'chỉ có ảnh vẫn có prompt mặc định');
    assert.strictEqual(A.normalizeRequest({ prompt: 'x'.repeat(5000) }).req.prompt.length, 1000);
});

test('pngHasAlpha', () => {
    assert.strictEqual(A.pngHasAlpha(PNG_RGBA), true);
    assert.strictEqual(A.pngHasAlpha(PNG_RGB), false);
    assert.strictEqual(A.pngHasAlpha(Buffer.from('nope')), false);
});

test('generate: gọi OpenAI bằng khoá người dùng, lưu PNG + index, thư viện, xoá', async () => {
    const dir = tmp(), calls = [];
    const { c } = client(dir, okOpenAI(calls));
    const r = await c.generate({ prompt: 'mèo', preset: 'sticker' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(calls[0].url, /\/images\/generations$/);
    assert.strictEqual(calls[0].req.headers.Authorization, 'Bearer ' + KEY);
    const body = JSON.parse(calls[0].req.body);
    assert.strictEqual(body.model, 'gpt-image-test');
    assert.strictEqual(body.background, 'transparent');
    assert.match(r.item.src, /^\/ai-art\/ai[a-z0-9]+\.png$/);
    assert.strictEqual(r.item.alpha, true);
    assert.ok(fs.existsSync(path.join(dir, 'ai-art', r.item.id + '.png')));
    const r2 = await c.generate({ prompt: 'tôi', image: 'data:image/png;base64,' + PNG_RGBA.toString('base64') });
    assert.ok(r2.ok);
    assert.match(calls[1].url, /\/images\/edits$/);
    assert.match(calls[1].req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
    assert.strictEqual(c.library().length, 2);
    assert.strictEqual(c.remove('../evil'), false);
    assert.strictEqual(c.remove(r.item.id), true);
    assert.strictEqual(c.library().length, 1);
    assert.ok(!fs.existsSync(path.join(dir, 'ai-art', r.item.id + '.png')));
});

test('generate: thiếu khoá / OpenAI hết tiền / mất mạng → thông điệp tiếng Việt; chặn gọi chồng', async () => {
    const dir = tmp();
    assert.strictEqual((await client(dir, okOpenAI(), false).c.generate({ prompt: 'a' })).error, 'no_key');
    const broke = O.createOpenAI({ transport: async () => ({ status: 429, raw: JSON.stringify({ error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }) }) });
    const r = await client(tmp(), broke).c.generate({ prompt: 'a' });
    assert.strictEqual(r.error, 'no_credit');
    assert.match(r.message, /nạp thêm/);
    const off = O.createOpenAI({ transport: async () => { throw new Error('ECONNRESET'); } });
    assert.strictEqual((await client(tmp(), off).c.generate({ prompt: 'a' })).error, 'no_network');
    const junk = O.createOpenAI({ transport: async () => ({ status: 200, raw: JSON.stringify({ data: [{ b64_json: Buffer.from('not png').toString('base64') }] }) }) });
    assert.strictEqual((await client(tmp(), junk).c.generate({ prompt: 'a' })).error, 'bad_response');
    let release;
    const slow = O.createOpenAI({ transport: () => new Promise(res => { release = res; }) });
    const { c } = client(tmp(), slow);
    const p = c.generate({ prompt: 'a' });
    assert.strictEqual((await c.generate({ prompt: 'b' })).error, 'busy');
    release({ status: 200, raw: JSON.stringify({ data: [{ b64_json: PNG_RGBA.toString('base64') }] }) });
    assert.ok((await p).ok);
    assert.strictEqual(c.busy, false);
});
