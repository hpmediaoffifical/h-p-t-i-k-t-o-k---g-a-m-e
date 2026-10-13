// node --test tests/app-smoke.test.js
// Nạp public/app.js trong vm với DOM giả "chấp nhận mọi thứ": bắt ReferenceError/TypeError lúc khởi động
// (hàm bị xoá nhưng vẫn còn chỗ gọi) — `node --check` chỉ kiểm cú pháp nên không thấy lỗi này.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Proxy "mọi thứ đều có": thuộc tính nào cũng trả về chính nó, gọi được, chuyển kiểu về ''/0/false.
function anything() {
    const fn = function () { return proxy; };
    const proxy = new Proxy(fn, {
        get(_, key) {
            if (key === Symbol.toPrimitive) return () => '';
            if (key === 'toString' || key === 'valueOf') return () => '';
            if (key === 'then') return undefined;               // không phải thenable
            if (key === Symbol.iterator) return function* () {};
            if (key === 'length') return 0;
            if (key === 'checked' || key === 'hidden' || key === 'disabled') return false;
            if (key === 'value' || key === 'textContent' || key === 'innerHTML' || key === 'className' || key === 'id') return '';
            if (key === 'children' || key === 'options' || key === 'files' || key === 'classList') return proxyArrayLike();
            return proxy;
        },
        set() { return true; },
        has() { return true; },
        apply() { return proxy; },
        construct() { return proxy; }
    });
    return proxy;
}
function proxyArrayLike() {
    const base = [];
    return new Proxy(base, { get(t, key) { if (key in t) return t[key]; return anything(); } });
}

test('public/app.js nạp không ném lỗi với DOM giả', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const el = anything();
    const document = {
        getElementById: () => el,
        querySelector: () => el,
        querySelectorAll: () => [],
        createElement: () => el,
        addEventListener() {},
        body: el, documentElement: el, head: el
    };
    const storage = { getItem: () => null, setItem() {}, removeItem() {} };
    const windowObj = {
        document, localStorage: storage, sessionStorage: storage,
        location: { origin: 'http://localhost:3000', href: 'http://localhost:3000/', search: '', hostname: 'localhost', port: '3000', protocol: 'http:' },
        navigator: { userAgent: 'test', mediaDevices: null, clipboard: null },
        io: () => anything(),
        fetch: () => new Promise(() => {}),
        setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
        requestAnimationFrame: () => 0, cancelAnimationFrame() {},
        addEventListener() {}, removeEventListener() {},
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        MutationObserver: class { observe() {} disconnect() {} },
        ResizeObserver: class { observe() {} disconnect() {} },
        console, Promise, JSON, Math, Date, Number, String, Array, Object, Set, Map, Symbol, Error, RegExp, parseInt, parseFloat, isFinite, isNaN,
        encodeURIComponent, decodeURIComponent, URL, URLSearchParams, Blob: class {}, FileReader: class {}, Audio: class { play() { return Promise.resolve(); } },
        Image: class {}, CustomEvent: class {}, Event: class {}, HTMLElement: class {}, Node: class {}, Element: class {},
        getComputedStyle: () => anything(), alert() {}, confirm: () => false, prompt: () => null,
        innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, screen: { width: 1920, height: 1080 },
        HpCamGames: [], HpNhatLaPanel: null, HpCaroPanel: null, HpVipWelcomePanel: null
    };
    windowObj.window = windowObj;
    windowObj.globalThis = windowObj;
    windowObj.self = windowObj;
    const ctx = vm.createContext(windowObj);
    assert.doesNotThrow(() => vm.runInContext(src, ctx, { filename: 'public/app.js' }));
});
