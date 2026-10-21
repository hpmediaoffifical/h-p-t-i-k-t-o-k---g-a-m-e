const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const O = require('../lib/ai-openai');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KEY = 'sk-proj-' + 'a'.repeat(40);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-openai-'));

test('buildPrompt: phong cách + luật nền trong suốt; có ảnh thì dặn giữ nét', () => {
    const p = O.buildPrompt('chibi', 'mèo đội nón lá', false);
    assert.match(p, /chibi/i);
    assert.match(p, /Subject: mèo đội nón lá/);
    assert.match(p, /transparent background/);
    assert.doesNotMatch(p, /reference photo/);
    assert.match(O.buildPrompt('3d', 'tôi', true), /reference photo/);
    assert.strictEqual(O.buildPrompt('none', 'abc', false), 'abc. Transparent background, no watermark.');
});

test('sniffMime + buildMultipart', () => {
    assert.strictEqual(O.sniffMime(PNG), 'image/png');
    assert.strictEqual(O.sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
    assert.strictEqual(O.sniffMime(Buffer.from('RIFF0000WEBPVP8 ')), 'image/webp');
    assert.strictEqual(O.sniffMime(Buffer.from('hello world!')), '');
    const mp = O.buildMultipart({ model: 'm', prompt: 'p' }, { name: 'image[]', filename: 'a.png', type: 'image/png', data: PNG });
    const txt = mp.body.toString('latin1');
    const b = mp.contentType.split('boundary=')[1];
    assert.ok(txt.includes(`--${b}\r\nContent-Disposition: form-data; name="model"\r\n\r\nm\r\n`));
    assert.ok(txt.includes('name="image[]"; filename="a.png"\r\nContent-Type: image/png'));
    assert.ok(txt.endsWith(`--${b}--\r\n`));
});

test('mapOpenAIError', () => {
    assert.strictEqual(O.mapOpenAIError(401, {}), 'key_invalid');
    assert.strictEqual(O.mapOpenAIError(429, { error: { code: 'insufficient_quota' } }), 'no_credit');
    assert.strictEqual(O.mapOpenAIError(429, { error: { message: 'Rate limit' } }), 'rate_limited');
    assert.strictEqual(O.mapOpenAIError(403, { error: { message: 'Your organization must be verified to use the model' } }), 'org_unverified');
    assert.strictEqual(O.mapOpenAIError(400, { error: { code: 'moderation_blocked' } }), 'moderation_blocked');
    assert.strictEqual(O.mapOpenAIError(404, {}), 'model_unavailable');
    assert.strictEqual(O.mapOpenAIError(500, null), 'provider_error');
});

test('settings: khoá mã hoá theo máy, view không lộ khoá, sai máy = mất khoá', () => {
    const dir = tmp();
    const s = O.createSettings({ dataDir: dir, machineSecret: () => 'HWID-A' });
    assert.strictEqual(s.view().hasKey, false);
    assert.strictEqual(s.view().quality, 'medium');
    assert.strictEqual(s.set({ apiKey: 'abc' }).error, 'key_format');
    const r = s.set({ apiKey: KEY, model: 'gpt-image-x; rm -rf', quality: 'high' });
    assert.ok(r.ok);
    assert.strictEqual(r.settings.hasKey, true);
    assert.strictEqual(r.settings.keyHint, '…aaaa');
    assert.strictEqual(r.settings.model, 'gpt-image-xrm-rf');
    assert.strictEqual(r.settings.quality, 'high');
    assert.ok(!JSON.stringify(r.settings).includes(KEY));
    assert.ok(!fs.readFileSync(s.file, 'utf8').includes(KEY), 'file không chứa khoá rõ');
    assert.strictEqual(s.get().apiKey, KEY);
    const other = O.createSettings({ dataDir: dir, machineSecret: () => 'HWID-B' });
    assert.strictEqual(other.get().apiKey, '');
    s.set({ clearKey: true });
    assert.strictEqual(s.view().hasKey, false);
});

test('checkKey', async () => {
    const ok = O.createOpenAI({ transport: async (url) => ({ status: url.endsWith('/models/m1') ? 200 : 404, raw: '{}' }) });
    assert.deepStrictEqual(await ok.checkKey({ apiKey: KEY, model: 'm1' }), { ok: true, model: 'm1' });
    assert.strictEqual((await ok.checkKey({ apiKey: KEY, model: 'm2' })).error, 'model_unavailable');
});

test('model auto: có ảnh → Sunburst, chỉ chữ → Flare; tên tự đặt giữ nguyên', () => {
    assert.strictEqual(O.resolveModel('auto', true), 'gpt-image-2.5-sunburst');
    assert.strictEqual(O.resolveModel('', false), 'gpt-image-2.5-flare');
    assert.strictEqual(O.resolveModel('gpt-image-3', true), 'gpt-image-3');
    assert.strictEqual(O.createSettings({ dataDir: tmp(), machineSecret: () => 'x' }).view().model, 'auto');
});
