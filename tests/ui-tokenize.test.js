// 🎨 Giao diện mới — style.css được "tokenize": màu cứng → var(--bg|fg|bd-<khoá>, <màu cũ>).
// Biến chỉ khai báo trong public/ui/ui-v2*.css (chỉ app nạp) → overlay OBS nạp /style.css vẫn y cũ.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { tokenize, tokenizeHtml, untokenize, colorKey, VAR_RE } = require('../tools/ui-tokenize-css.js');

const SAMPLE = `/* c {color:#fff} */
.a { background: #0b0d12; color: #e6e9ef; border: 1px solid rgba(255,255,255,.08); }
.b{box-shadow:0 0 4px #000;color:#8b93a8}
@media (max-width:900px){ .c { background-color:#161A23 } }
@keyframes k { 0% { background:#111 } }
.btn { background: linear-gradient(135deg,#ff2d6f,#ff7a45); color:#fff }
.d { --x: #123456; outline: 2px solid white; content: "#abc;" }`;

test('untokenize(tokenize(x)) trả đúng từng byte bản gốc', () => {
    assert.strictEqual(untokenize(tokenize(SAMPLE).css), SAMPLE);
});

test('tokenize idempotent', () => {
    const once = tokenize(SAMPLE).css;
    assert.strictEqual(tokenize(once).css, once);
});

test('đổi đúng loại theo thuộc tính, bỏ qua shadow / keyframes / biến / comment / chuỗi', () => {
    const out = tokenize(SAMPLE).css;
    assert.match(out, /background: var\(--bg-0b0d12, #0b0d12\)/);
    assert.match(out, /color: var\(--fg-e6e9ef, #e6e9ef\)/);
    assert.match(out, /var\(--bd-rgba_255_255_255_08, rgba\(255,255,255,\.08\)\)/);
    assert.match(out, /background-color:var\(--bg-161a23, #161A23\)/);
    assert.match(out, /box-shadow:0 0 4px #000/);
    assert.match(out, /0% \{ background:#111 \}/);
    assert.match(out, /--x: #123456/);
    assert.match(out, /\/\* c \{color:#fff\} \*\//);
    assert.match(out, /"#abc;"/);
    assert.match(out, /outline: 2px solid var\(--bd-white, white\)/);
});

test('rule có nền màu nhấn (gradient hồng) giữ chữ trắng', () => {
    const out = tokenize(SAMPLE).css;
    assert.match(out, /\.btn \{ background: linear-gradient\(135deg,var\(--bg-ff2d6f, #ff2d6f\),var\(--bg-ff7a45, #ff7a45\)\); color:#fff \}/);
});

for (const [rel, min] of [['public/style.css', 500], ['public/quick-launch.html', 20]]) {
    test(`${rel}: mọi biến có fallback đúng màu tên biến mã hoá (overlay/cửa sổ nổi luôn y cũ)`, () => {
        const text = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        let n = 0;
        for (const m of text.matchAll(VAR_RE)) {
            n++;
            assert.strictEqual(m[2], colorKey(m[3]), `biến --${m[1]}-${m[2]} có fallback ${m[3]}`);
        }
        assert.ok(n > min, rel + ' đã được tokenize (' + n + ' biến)');
        const again = rel.endsWith('.html') ? tokenizeHtml(text).css : tokenize(text).css;
        assert.strictEqual(again, text, 'chạy lại node tools/ui-tokenize-css.js sau khi sửa ' + rel);
    });
}

test('ui-v2-map.css khai báo biến cho đúng các màu đang dùng', () => {
    const map = fs.readFileSync(path.join(__dirname, '..', 'public', 'ui', 'ui-v2-map.css'), 'utf8');
    assert.match(map, /--bg-0b0d12: #FBF5F4;/);
    assert.match(map, /body\.ui-v2 \.ui-keep-colors \{/);
});
