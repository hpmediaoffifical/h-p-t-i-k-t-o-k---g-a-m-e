// LEVEL QUEST (public/_prototype/level-quest.html): chạy script chính trong vm với DOM giả "nuốt mọi thứ"
// để kiểm phần logic không cần trình duyệt — tối đa 18 cấp + cắt bản lưu cũ, kẹp tiến trình, link riêng
// nhường overlay mẹ 🎥 Game Camera (sự kiện 'levelquest:hub').
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', '_prototype', 'level-quest.html'), 'utf8');
const MAIN = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).sort((a, b) => b.length - a.length)[0];
// Giá trị mặc định của ô nhập như trình duyệt đọc từ HTML (<input id=… value=…>; <select> = option đầu).
const DEFAULTS = new Map([...HTML.matchAll(/<input id="(\w+)"[^>]*?\bvalue="([^"]*)"/g)].map(m => [m[1], m[2]]));
for (const m of HTML.matchAll(/<select id="(\w+)"[^>]*>\s*<option value="([^"]*)"/g)) DEFAULTS.set(m[1], m[2]);

// Đối tượng giả: gọi được, đọc thuộc tính nào cũng ra chính nó, đổi sang số = 0, lặp = rỗng.
function chameleon() {
    const fn = function () {};
    const p = new Proxy(fn, {
        get(_, k) {
            if (k === Symbol.toPrimitive) return () => 0;
            if (k === Symbol.iterator) return function* () {};
            if (k === 'then') return undefined;
            if (k === 'length') return 0;
            return p;
        },
        set() { return true; },
        apply() { return p; },
        construct() { return p; }
    });
    return p;
}
function fakeEl() {
    // childElementCount phải là số thật: render() thêm/bớt pill bằng vòng while theo nó.
    const store = { value: '', checked: false, textContent: '', hidden: false, childElementCount: 0 };
    store.appendChild = c => { store.childElementCount++; return c; };
    store.removeChild = c => { store.childElementCount = Math.max(0, store.childElementCount - 1); return c; };
    const classes = new Set();
    store.classList = {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; },
        contains: c => classes.has(c)
    };
    return new Proxy(store, {
        get(t, k) { return k in t ? t[k] : chameleon(); },
        set(t, k, v) { t[k] = v; return true; }
    });
}

function boot({ search = '', cfg = null, state = null } = {}) {
    const ls = new Map();
    if (cfg) ls.set('levelQuest.cfg.v1', JSON.stringify(cfg));
    if (state) ls.set('levelQuest.state.v1', JSON.stringify(state));
    const els = new Map();
    const body = fakeEl();
    const document = new Proxy({
        getElementById: id => {
            if (!els.has(id)) { const el = fakeEl(); if (DEFAULTS.has(id)) el.value = DEFAULTS.get(id); els.set(id, el); }
            return els.get(id);
        },
        body,
        documentElement: fakeEl(),
        head: fakeEl(),
        querySelector: () => fakeEl(),
        querySelectorAll: () => [],
        createElement: () => fakeEl(),
        createElementNS: () => fakeEl()
    }, { get(t, k) { return k in t ? t[k] : chameleon(); } });
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        location: { search, protocol: 'http:', host: 'localhost' },
        URLSearchParams, Math, JSON, Date, Number, String, Array, Object, Set, Map, Promise, parseInt, parseFloat, isFinite,
        localStorage: {
            getItem: k => (ls.has(k) ? ls.get(k) : null),
            setItem: (k, v) => ls.set(k, String(v)),
            removeItem: k => ls.delete(k)
        },
        document,
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        requestAnimationFrame: () => 0, performance: { now: () => 0 },
        addEventListener() {}, innerWidth: 1080, innerHeight: 1920,
        navigator: {}
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(MAIN, ctx);
    return { ctx, ls, body, run: code => vm.runInContext(code, ctx) };
}

test('mặc định: 18 cấp, mục tiêu 💎 30.000', () => {
    const { run } = boot();
    assert.strictEqual(run('LQ_MAX_LEVEL'), 18);
    assert.strictEqual(run('cfg.maxLevel'), 18);
    assert.strictEqual(run('cfg.diaKPI.length'), 18);
    assert.strictEqual(run('sum(cfg.diaKPI)'), 30000);
});

test('bản lưu cũ 50 cấp → cắt về 18, chia lại TỔNG mục tiêu, ghi lại bản mới', () => {
    const old = { maxLevel: 50, diaKPI: Array(50).fill(100), heartKPI: Array(50).fill(1000), shareKPI: Array(50).fill(2),
        totDia: 50000, totHeart: 0, totShare: 100, totMaxLv: 50, totMode: 'curve' };
    const { run, ls } = boot({ cfg: old });
    assert.strictEqual(run('cfg.maxLevel'), 18);
    assert.strictEqual(run('cfg.diaKPI.length'), 18);
    assert.strictEqual(run('sum(cfg.diaKPI)'), 50000);          // tổng đã nhập
    assert.strictEqual(run('sum(cfg.heartKPI)'), 50000);        // không có tổng nhập → tổng bảng cũ (50 × 1000)
    assert.strictEqual(run('sum(cfg.shareKPI)'), 100);
    const saved = JSON.parse(ls.get('levelQuest.cfg.v1'));
    assert.strictEqual(saved.maxLevel, 18);
    assert.strictEqual(saved.totMaxLv, 18);
    assert.strictEqual(saved.diaDefaultV, 2);
});

test('bản lưu ≤18 cấp giữ nguyên — mục tiêu 💎 tự đặt 10.000 KHÔNG bị nâng', () => {
    const kpi = Array(18).fill(0).map((_, i) => (i < 17 ? 555 : 10000 - 555 * 17));
    const { run, ls } = boot({ cfg: { maxLevel: 18, diaKPI: kpi, heartKPI: Array(18).fill(10), shareKPI: Array(18).fill(1), totDia: 10000 } });
    assert.strictEqual(run('sum(cfg.diaKPI)'), 10000);
    assert.strictEqual(run('cfgMigrated'), false);
    assert.strictEqual(JSON.parse(ls.get('levelQuest.cfg.v1')).diaDefaultV, undefined);   // không ghi lại khi không cần
});

test('tiến trình lưu từ hồi >18 cấp → kẹp về cấp cuối', () => {
    const { run } = boot({
        cfg: { maxLevel: 50, diaKPI: Array(50).fill(10), heartKPI: Array(50).fill(10), shareKPI: Array(50).fill(1), persistState: true },
        state: { level: 40, dia: 5, heart: 0, share: 0 }
    });
    assert.strictEqual(run('state.level'), 17);
});

test('applyConfig / applyTotalsPreset không cho quá 18 cấp', () => {
    const { run, ctx } = boot();
    ctx.document.getElementById('cfgMaxLv').value = '40';
    run('applyConfig()');
    assert.strictEqual(run('cfg.maxLevel'), 18);
    ctx.document.getElementById('cfgTotalMaxLv').value = '30';
    ctx.document.getElementById('cfgTotalDia').value = '30000';
    ctx.document.getElementById('cfgTotalHeart').value = '1000';
    ctx.document.getElementById('cfgTotalShare').value = '10';
    ctx.document.getElementById('cfgTotalMode').value = 'curve';
    run('applyTotalsPreset()');
    assert.strictEqual(run('cfg.maxLevel'), 18);
    assert.strictEqual(run('sum(cfg.diaKPI)'), 30000);
});

test('chỉnh nhanh đồng hồ: cỡ kẹp 16–220, màu sai → đỏ mặc định, ô cài đặt font đồng bộ theo', () => {
    const { run, ctx } = boot();
    run("setTimerFs('300')");
    assert.strictEqual(run('cfg.timerFs'), 220);
    assert.strictEqual(ctx.document.getElementById('cfgTimerFs').value, 220);
    run("setTimerFs('')");                       // đang xoá trắng ô để gõ số mới → giữ nguyên
    assert.strictEqual(run('cfg.timerFs'), 220);
    run("setTimerColor('#00ff00')");
    assert.strictEqual(ctx.document.getElementById('cfgTimerColor').value, '#00ff00');
    run("setTimerColor('javascript:x')");
    assert.strictEqual(run('cfg.timerColor'), '#ff4040');
});

test("link riêng (?mode=overlay) ẩn khi server báo 'levelquest:hub' {hubOwned:true}", () => {
    const { run, body } = boot({ search: '?mode=overlay' });
    run('applyHubOwned({ hubOwned: true })');
    assert.ok(body.classList.contains('lq-hub-owned'));
    run('applyHubOwned({ hubOwned: false })');
    assert.ok(!body.classList.contains('lq-hub-owned'));
    run('applyHubOwned(null)');
    assert.ok(!body.classList.contains('lq-hub-owned'));
});

test('bản trong hub (cam=1) và trang điều khiển không bao giờ ẩn', () => {
    for (const search of ['?mode=overlay&cam=1', '']) {
        const { run, body } = boot({ search });
        run('applyHubOwned({ hubOwned: true })');
        assert.ok(!body.classList.contains('lq-hub-owned'), search || '(lab)');
    }
});

test('overlay: ẩn thanh cuộn + CSS lq-hub-owned có trong trang', () => {
    assert.match(HTML, /html\[data-overlay="1"\] body \{[^}]*overflow: hidden !important;/);
    assert.match(HTML, /body\.lq-hub-owned > \*\{ visibility: hidden !important; \}/);
    assert.match(HTML, /_sock\.on\('levelquest:hub', applyHubOwned\)/);
});
