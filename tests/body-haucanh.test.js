// 🧪 Lõi 🦊 HẬU CẢNH (public/games/haucanh/core.js - 🧍 Bộ Tách Người dùng lại) + 📷 ẨN CAM GỐC của lib/body-server.js (OBS giả).
// Chuyển từ HP LIVE NPC scripts/haucanh-selftest.cjs @1e884fe: lõi giữ nguyên; ẩn cam chạy trên installBody (vị trí gốc lưu
// <dataDir>/body-camhide.json thay cho camGames.camgames._camRestore).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const HC = require('../public/games/haucanh/core.js');

const GROUPS = [
    { id: 'common', name: 'MẶC ĐỊNH', enabled: true },
    { id: 'g_cas', name: 'Caspian', enabled: false, activatedAt: 5 },
    { id: 'g_abc', name: 'ABC', enabled: false, activatedAt: 9 },
    { id: 'g_yuna', name: 'Yuna', enabled: true, activatedAt: 7 }
];
const CFG = () => HC.normalizeConfig({ profiles: [
    { id: 'all', groupId: '', items: [{ id: 'x1', name: 'Pháo', gifts: [{ giftId: '5655', giftName: 'Rose' }, { giftId: '9' }] }] },
    { id: 'yuna', groupId: 'g_yuna', scale: 80, items: [
        { id: 'y1', name: 'Hồ ly 9 đuôi', file: '/media/duoi.webm', alpha: true, gifts: [{ giftId: '5655', giftName: 'Rose' }] },
        { id: 'y2', name: 'Rồng', file: 'G:/rong.mp4', gifts: [{ giftId: '77' }] }] },
    { id: 'cas', groupId: 'g_cas', items: [{ id: 'c1', gifts: [{ giftId: '77' }] }] }
] });

test('normalizeConfig: mặc định, kẹp số, bỏ quà không id, id trùng', () => {
    const d = HC.normalizeConfig(null);
    assert.deepEqual([d.enabled, d.profiles.length, d.matte.model, d.matte.tiles], [true, 0, 'selfie', 2]);
    const c = HC.normalizeConfig({ queueMax: 999, profiles: [
        { id: 'a', scale: 5, x: 99, items: [{ id: 'i', fit: 'xx', durSec: -3, scale: 10, gifts: [{ giftName: 'không id' }, { giftId: 1 }] }, { id: 'i' }] },
        { id: 'a', scale: 'abc' }] });
    assert.equal(c.queueMax, 30);
    const [p, q] = c.profiles;
    assert.deepEqual([p.scale, p.x, p.fadeMs], [30, 60, 350]);
    assert.deepEqual([p.items[0].fit, p.items[0].durSec, p.items[0].scale], ['cover', 0, 30]);   // cỡ riêng 0 = theo hồ sơ, 1..29 → 30
    assert.deepEqual(p.items[0].gifts, [{ giftId: '1', giftName: '', giftImage: '' }]);
    assert.deepEqual(p.items.map(x => x.id), ['i', 'i_']);
    assert.deepEqual([q.id, q.scale], ['a_', 100]);
});

test('🎞 Lớp sau xa hơn (layers): tối đa 2, {file, startMs, endMs}, nhận cả chuỗi file cũ, bỏ rỗng, kẹp ms, mặc định []', () => {
    assert.deepEqual(HC.normalizeItem({}, 0).layers, []);
    assert.deepEqual(HC.normalizeItem({ layers: 'x' }, 0).layers, []);
    const it = HC.normalizeItem({ layers: ['  /media/hoa.webm ', '', null, 7, { file: '/media/a.pack.mp4', startMs: 1500, endMs: 3500 }, { file: '' }, '/media/thua.webm'] }, 0);
    assert.deepEqual(it.layers, [{ file: '/media/hoa.webm', startMs: 0, endMs: 0 }, { file: '/media/a.pack.mp4', startMs: 1500, endMs: 3500 }]);   // thứ tự giữ nguyên: [0] = Lớp 2 (ngay dưới video chính), [1] = Lớp 3
    assert.equal(HC.normalizeItem({ layers: ['a'.repeat(2000)] }, 0).layers[0].file.length, 1000);
    // ms kẹp 0..600000 (10 phút), không phải số → 0
    assert.deepEqual(HC.normalizeItem({ layers: [{ file: 'f', startMs: -5, endMs: 'abc' }, { file: 'g', startMs: 9e9, endMs: 1234.7 }] }, 0).layers.map(L => [L.startMs, L.endMs]), [[0, 0], [600000, 1235]]);
    assert.deepEqual(HC.makeItem().layers, []);
    assert.deepEqual(HC.makeLayer('/media/x.webm'), { file: '/media/x.webm', startMs: 0, endMs: 0 });
    assert.equal(HC.MAX_LAYERS, 2);
});

test('⏱ Video chính: startMs / endMs (ms); endMs 0 = cuối video; durSec cũ (giây) → endMs; durSec chiếu lại từ endMs', () => {
    const a = HC.normalizeItem({}, 0);
    assert.deepEqual([a.startMs, a.endMs, a.durSec], [0, 0, 0]);
    const b = HC.normalizeItem({ startMs: 1200.4, endMs: 5000 }, 0);
    assert.deepEqual([b.startMs, b.endMs, b.durSec], [1200, 5000, 5]);
    const c = HC.normalizeItem({ durSec: 12 }, 0);                 // config cũ
    assert.deepEqual([c.startMs, c.endMs, c.durSec], [0, 12000, 12]);
    const d = HC.normalizeItem({ durSec: 12, endMs: 0 }, 0);       // endMs là chuẩn khi có mặt (0 = cuối video)
    assert.deepEqual([d.endMs, d.durSec], [0, 0]);
    assert.equal(HC.runMs({ startMs: 1500, endMs: 0, file: 'a.mp4' }, 4.5), 6000);          // bắt đầu trễ 1,5 s + hết video 4,5 s
    assert.equal(HC.runMs({ startMs: 1500, endMs: 4000, file: 'a.mp4' }, 4.5), 4000);       // mốc kết thúc tuyệt đối
    assert.equal(HC.runMs({ startMs: 1000, endMs: 0, file: '/media/a.png' }, NaN), 7000);   // ảnh 6 s sau mốc bắt đầu
});

test('NPC đang bật: bỏ MẶC ĐỊNH + NPC tắt, bật sau cùng đứng trước; hồ sơ NPC trước hồ sơ "Mọi NPC"', () => {
    assert.deepEqual(HC.enabledNpcIds(GROUPS), ['g_yuna']);
    const two = GROUPS.map(g => g.id === 'g_cas' ? { ...g, enabled: true, activatedAt: 99 } : g);
    assert.deepEqual(HC.enabledNpcIds(two), ['g_cas', 'g_yuna']);
    const c = CFG();
    assert.equal(HC.activeProfile(c, ['g_yuna']).id, 'yuna');
    assert.equal(HC.activeProfile(c, ['g_abc']).id, 'all');              // NPC chưa có hồ sơ → hồ sơ Mọi NPC
    assert.equal(HC.activeProfile(c, []).id, 'all');
    assert.equal(HC.activeProfile(HC.normalizeConfig({ profiles: [{ groupId: 'g_cas' }] }), ['g_yuna']), null);
});

test('Quà → hiệu ứng: hồ sơ NPC đang bật thắng "Mọi NPC"; NPC tắt không nhận; quà lạ → null', () => {
    const c = CFG();
    assert.equal(HC.pickForGift(c, ['g_yuna'], '5655').item.id, 'y1');
    assert.equal(HC.pickForGift(c, ['g_yuna'], '9').item.id, 'x1');        // Yuna không có quà 9 → rơi xuống Mọi NPC
    assert.equal(HC.pickForGift(c, ['g_abc'], '5655').item.id, 'x1');
    assert.equal(HC.pickForGift(c, ['g_yuna'], '77').item.id, 'y2');       // Caspian (tắt) có 77 nhưng không được dùng
    assert.equal(HC.pickForGift(c, ['g_yuna'], '123'), null);
    assert.equal(HC.pickForGift(c, ['g_yuna'], ''), null);
});

test('Thời lượng: 0 = hết video (chưa biết độ dài → NaN), ảnh 6 giây, N giây cố định', () => {
    assert.ok(Number.isNaN(HC.runMs({ durSec: 0, file: 'a.webm' }, NaN)));
    assert.equal(HC.runMs({ durSec: 0, file: 'a.mp4' }, 4.5), 4500);
    assert.equal(HC.runMs({ durSec: 0, file: '/media/a.png' }, NaN), 6000);
    assert.equal(HC.runMs({ durSec: 12, file: 'a.mp4' }, 3), 12000);
});

// ---------- 📷 ẩn cam gốc (OBS giả) trên lib/body-server.js ----------
// rebase: mô phỏng resize_group() của libobs - sau MỌI lần đổi transform của item con trong group, OBS dời toàn bộ con sao cho góc
// trên-trái của khung bao về (0,0) và cộng phần dời đó vào vị trí của chính group (hình không đổi, số thì đổi).
function camWorld({ rebase = false, group = { x: 0, y: 0 }, cam = { x: 120, y: 300 }, extra = [] } = {}) {
    const st = { calls: [], items: { 'Yuna': [{ sourceName: 'Nhóm', sceneItemId: 1, isGroup: true, sceneItemEnabled: true, sceneItemTransform: { positionX: group.x, positionY: group.y } }],
        'Nhóm': [{ sourceName: 'Cam NPC', sceneItemId: 7, sceneItemEnabled: true, sceneItemTransform: { positionX: cam.x, positionY: cam.y } }, ...extra] } };
    const rebaseGroup = (groupName) => {
        const kids = st.items[groupName] || [];
        const owner = Object.values(st.items).flat().find(x => x.isGroup && x.sourceName === groupName);
        if (!rebase || !owner || !kids.length) return;
        const minX = Math.min(...kids.map(k => k.sceneItemTransform.positionX)), minY = Math.min(...kids.map(k => k.sceneItemTransform.positionY));
        for (const k of kids) { k.sceneItemTransform.positionX -= minX; k.sceneItemTransform.positionY -= minY; }
        owner.sceneItemTransform.positionX += minX; owner.sceneItemTransform.positionY += minY;
    };
    const w = { st };
    w.obsCall = async (type, d = {}) => {
        st.calls.push([type, d]);
        if (st.hang) return new Promise(() => {});
        if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: 'Yuna' };
        if (type === 'GetSceneItemList' || type === 'GetGroupSceneItemList') return { sceneItems: st.items[d.sceneName] || [] };
        if (type === 'GetSceneItemTransform') {
            const it = (st.items[d.sceneName] || []).find(x => x.sceneItemId === d.sceneItemId);
            if (!it) { const e = new Error('not found'); e.code = 600; throw e; }
            return { sceneItemTransform: { ...it.sceneItemTransform } };
        }
        if (type === 'SetSceneItemTransform') {
            const it = (st.items[d.sceneName] || []).find(x => x.sceneItemId === d.sceneItemId);
            if (!it) { const e = new Error('not found'); e.code = 600; throw e; }
            Object.assign(it.sceneItemTransform, d.sceneItemTransform);
            rebaseGroup(d.sceneName);
            return {};
        }
        return {};
    };
    w.pins = [];
    w.feed = { status: () => ({ source: 'Cam NPC' }), pinLayout: r => w.pins.push(r) };
    w.grp = () => st.items['Yuna'][0].sceneItemTransform;
    // vị trí TRÊN MÀN HÌNH của item con thứ i (group căn trên-trái, tỉ lệ 1)
    w.world = (i = 0) => ({ x: w.grp().positionX + st.items['Nhóm'][i].sceneItemTransform.positionX, y: w.grp().positionY + st.items['Nhóm'][i].sceneItemTransform.positionY });
    w.cam = () => st.items['Nhóm'][0].sceneItemTransform;
    return w;
}
const harnesses = [];
function camHarness(world, { saved } = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpal-body-'));
    if (saved) fs.writeFileSync(path.join(dataDir, 'body-camhide.json'), JSON.stringify(saved));
    const routes = {};
    const app = { get: (p, ...f) => { routes['GET ' + p] = f[f.length - 1]; }, post: (p, ...f) => { routes['POST ' + p] = f[f.length - 1]; }, use: () => {} };
    let onConn = null;
    const io = { emit() {}, to() { return this; }, on: (ev, fn) => { if (ev === 'connection') onConn = fn; } };
    let config;
    const api = require('../lib/body-server.js').installBody({
        app, io, express: { raw: () => (q, s, n) => n() }, path, dataDir,
        getConfig: () => config, setConfig: c => { config = c; }, saveConfig: () => {},
        obsBridge: { isConnected: () => true, obs: { call: (t, d) => world.obsCall(t, d) } },
        touchplayFeed: world.feed, logger: { log() {}, warn() {} }, socketIsTrusted: () => true
    });
    harnesses.push(api);
    const sock = (id, rooms = ['overlay']) => {
        const h = {};
        const s = { id, rooms: new Set(rooms), data: {}, handshake: { headers: {}, address: '127.0.0.1' }, on: (ev, fn) => { h[ev] = fn; } };
        onConn(s);
        return { ask: (hide, game = 'body') => new Promise(res => h['camgames:camhide']({ game, hide }, res)), drop: () => h.disconnect() };
    };
    return { cam: api, routes, sock, saved: () => api._test.saved(), setSaved: v => api._test.setSaved(v), dataDir };
}
test.after(() => { for (const h of harnesses) h._test.stop(); });

test('📷 ẩn cam gốc: dời camera (trong group) ra ngoài khung, ghim bố cục, lưu vị trí gốc; thôi ẩn → trả đúng chỗ cũ', async () => {
    const w = camWorld(), h = camHarness(w);
    const a = h.sock('obs1');
    const r = await a.ask(true);
    assert.deepEqual([r.ok, r.hidden], [true, true]);
    assert.ok(w.cam().positionX > 10000, JSON.stringify(w.cam()));
    assert.equal(w.cam().positionY, 300);
    assert.deepEqual(w.pins, ['camhide']);
    assert.deepEqual([h.saved().x, h.saved().sceneName], [120, 'Nhóm']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(h.dataDir, 'body-camhide.json'), 'utf8')).x, 120);   // lưu đĩa TRƯỚC khi dời
    const moves = () => w.st.calls.filter(([t]) => t === 'SetSceneItemTransform').length;
    await a.ask(true);                                            // nhịp giữ hợp đồng không dời thêm
    assert.equal(moves(), 1);
    const r2 = await a.ask(false);
    assert.deepEqual([r2.ok, r2.hidden], [true, false]);
    assert.deepEqual([w.cam().positionX, w.cam().positionY], [120, 300]);
    assert.deepEqual(w.pins, ['camhide', '']);
    assert.equal(h.saved(), null);
    assert.equal(fs.existsSync(path.join(h.dataDir, 'body-camhide.json')), false);
});

// OBS thật: cam là item con của GROUP → dời cam +40000 xong OBS re-base (cam về (0,0), GROUP nhảy +40000) → phải trả theo vị trí trên màn hình.
const LOGO = (x, y) => ({ sourceName: 'Logo', sceneItemId: 8, sceneItemEnabled: true, sceneItemTransform: { positionX: x, positionY: y } });
for (const [label, opts] of [
    ['cam là item duy nhất', { rebase: true, group: { x: 100, y: 50 }, cam: { x: 0, y: 0 } }],
    ['cam ở mép trái, còn item khác', { rebase: true, group: { x: 100, y: 50 }, cam: { x: 0, y: 0 }, extra: [LOGO(300, 40)] }],
    ['item khác ở mép trái', { rebase: true, group: { x: 100, y: 50 }, cam: { x: 250, y: 0 }, extra: [LOGO(0, 40)] }],
    ['OBS không re-base (scene lồng)', { rebase: false, group: { x: 100, y: 50 }, cam: { x: 120, y: 300 } }]
]) {
    test(`📷 ẩn cam gốc trong GROUP (${label}): thôi ẩn → cam + item khác về đúng chỗ cũ trên màn hình`, async () => {
        const w = camWorld(opts), h = camHarness(w);
        const n = w.st.items['Nhóm'].length;
        const start = [...Array(n).keys()].map(i => w.world(i));
        const a = h.sock('obs1');
        assert.equal((await a.ask(true)).hidden, true);
        assert.ok(w.world(0).x > 10000, JSON.stringify({ cam: w.cam(), grp: w.grp() }));
        assert.equal(w.world(0).y, start[0].y);
        await a.ask(true);
        assert.equal((await a.ask(false)).hidden, false);
        assert.deepEqual([...Array(n).keys()].map(i => w.world(i)), start, JSON.stringify({ cam: w.cam(), grp: w.grp() }));
        assert.equal(h.saved(), null);
    });
}

const SAVED_GROUP = { sceneName: 'Nhóm', sceneItemId: 7, source: 'Cam NPC', x: 0, y: 0, at: 1, group: { sceneName: 'Yuna', sceneItemId: 1 }, wx: 100, wy: 50 };
test('📷 ẩn cam gốc trong GROUP: app tắt giữa hiệu ứng (OBS đã re-base) → lần mở sau trả theo vị trí ĐÃ LƯU trên đĩa', async () => {
    const w = camWorld({ rebase: true, group: { x: 40100, y: 50 }, cam: { x: 0, y: 0 } });
    const h = camHarness(w, { saved: SAVED_GROUP });
    await new Promise(r => setTimeout(r, 1300));                 // không ai giữ → nhịp 1 giây tự trả
    assert.deepEqual(w.world(0), { x: 100, y: 50 }, JSON.stringify({ cam: w.cam(), grp: w.grp() }));
    assert.equal(h.saved(), null);
});

test('📷 ẩn cam gốc trong GROUP: app tắt giữa hiệu ứng rồi overlay xin ẩn lại → KHÔNG dời thêm, thôi ẩn vẫn về đúng chỗ', async () => {
    const w = camWorld({ rebase: true, group: { x: 40100, y: 50 }, cam: { x: 0, y: 0 } });
    const h = camHarness(w, { saved: SAVED_GROUP });
    const a = h.sock('obs1');
    assert.equal((await a.ask(true)).hidden, true);
    assert.equal(w.st.calls.filter(([t]) => t === 'SetSceneItemTransform').length, 0);
    assert.equal(w.world(0).x, 40100);
    await a.ask(false);
    assert.deepEqual(w.world(0), { x: 100, y: 50 });
});

test('📷 khung group: đổi qua lại Scene cha ↔ trong group khớp với itemMatrix của obs-scene-map (căn giữa, tỉ lệ, xoay, cắt)', async () => {
    const { itemMatrix, apply } = await import('../public/lib/obs-scene-map.mjs');
    const { groupToParent, parentToGroup } = require('../lib/body-server.js');
    for (const t of [{ positionX: 540, positionY: 960, alignment: 0, scaleX: 0.5, scaleY: 0.75, sourceWidth: 1200, sourceHeight: 900, rotation: 30, cropLeft: 40, cropTop: 10 },
        { positionX: 10, positionY: 20, alignment: 10, scaleX: -1, scaleY: 1, sourceWidth: 800, sourceHeight: 600 }]) {
        const m = itemMatrix(t), a = apply(m, 333, 222), b = groupToParent(t, 333, 222);
        assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, JSON.stringify([a, b]));
        const back = parentToGroup(t, b.x, b.y);
        assert.ok(Math.abs(back.x - 333) < 1e-6 && Math.abs(back.y - 222) < 1e-6, JSON.stringify(back));
    }
});

test('📷 ẩn cam gốc: 2 overlay cùng giữ → chỉ trả khi cả hai thôi; rớt socket = thôi; khung thử (không phải overlay) bị từ chối', async () => {
    const w = camWorld(), h = camHarness(w);
    const a = h.sock('obs1'), b = h.sock('obs2'), prev = h.sock('panel', ['preview']);
    assert.equal((await prev.ask(true)).ok, false);
    assert.equal(w.cam().positionX, 120);
    await a.ask(true); await b.ask(true);
    await a.ask(false);
    assert.ok(w.cam().positionX > 10000);
    b.drop();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(w.cam().positionX, 120);
});

test('📷 ẩn cam gốc: app tắt giữa hiệu ứng → lần sau dùng vị trí ĐÃ LƯU (không lấy chỗ đang dời làm gốc) và tự trả về', async () => {
    const w = camWorld();
    w.cam().positionX = 40120;                                   // còn kẹt ngoài khung từ lần trước
    const h = camHarness(w, { saved: { sceneName: 'Nhóm', sceneItemId: 7, source: 'Cam NPC', x: 120, y: 300, at: 1 } });
    const a = h.sock('obs1');
    await a.ask(true);
    assert.equal(h.saved().x, 120);
    await a.ask(false);
    assert.equal(w.cam().positionX, 120);
    w.cam().positionX = 40120;
    h.setSaved({ sceneName: 'Nhóm', sceneItemId: 7, x: 120, y: 300 });
    await new Promise(r => setTimeout(r, 1300));                 // không ai giữ mà còn vị trí chưa trả → nhịp 1 giây tự trả
    assert.equal(w.cam().positionX, 120);
    assert.equal(h.saved(), null);
});

test('📷 ẩn cam gốc: TẮT APP giữa hiệu ứng → trả camera ngay, overlay còn gia hạn cũng không ẩn lại', async () => {
    const w = camWorld(), h = camHarness(w);
    const a = h.sock('obs1');
    await a.ask(true);
    assert.ok(w.cam().positionX > 10000);
    assert.equal(await h.cam.camRestoreBeforeQuit(300), true);
    assert.deepEqual([w.cam().positionX, w.cam().positionY], [120, 300]);
    assert.equal(h.saved(), null);
    assert.deepEqual(w.pins, ['camhide', '']);
    const r = await a.ask(true);
    assert.equal(r.hidden, false);
    assert.equal(w.cam().positionX, 120);
    const calls = w.st.calls.length;
    assert.equal(await h.cam.camRestoreBeforeQuit(300), false);
    assert.equal(w.st.calls.length, calls);
});

test('📷 ẩn cam gốc: tắt app mà OBS treo → hết thời hạn vẫn trả lời, vị trí gốc còn để lần sau trả', async () => {
    const w = camWorld(), h = camHarness(w);
    await h.sock('obs1').ask(true);
    w.st.hang = true;
    const t0 = Date.now();
    const ok = await h.cam.camRestoreBeforeQuit(150);
    assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
    assert.equal(ok, false);
    assert.equal(h.saved().x, 120);
});

test('📷 ẩn cam gốc: không thấy camera trong Scene → báo lỗi, KHÔNG dời gì, không kẹt vị trí đã lưu', async () => {
    const w = camWorld();
    w.feed.status = () => ({ source: 'Camera khác' });
    const h = camHarness(w);
    const r = await h.sock('obs1').ask(true);
    assert.equal(r.ok, false);
    assert.match(r.error, /không thấy camera/);
    assert.equal(w.cam().positionX, 120);
    assert.equal(h.saved(), null);
    assert.equal(HC.normalizeItem({}, 0).hideCam, true);
    assert.equal(HC.normalizeItem({ hideCam: false }, 0).hideCam, false);
});

test('📷 dùng chung: 2 game cùng giữ → chỉ trả khi cả hai thôi; trạng thái ở /api/body/meta', async () => {
    const w = camWorld();
    w.cam().positionX = 40120;
    const h = camHarness(w, { saved: { sceneName: 'Nhóm', sceneItemId: 7, x: 120, y: 300 } });
    const a = h.sock('obs1');
    assert.equal((await a.ask(true, 'body')).hidden, true);
    assert.equal((await a.ask(true, 'dacau')).hidden, true);
    await a.ask(false, 'body');
    assert.ok(w.cam().positionX > 10000);
    await a.ask(false, 'dacau');
    assert.equal(w.cam().positionX, 120);
    const st = {}; h.routes['GET /api/body/meta']({}, { json: d => Object.assign(st, d) });
    assert.deepEqual([st.cam.hidden, st.cam.pending, st.cam.holders], [false, false, 0]);
});

test('📷 đọc lại bố cục TRƯỚC khi ghim + dời; camHideActive theo lượt ẩn; feed chưa có pinLayout thì được vá', async () => {
    const w = camWorld();
    const order = [];
    w.feed.refreshLayoutNow = async () => { order.push('layout'); };
    const origPin = w.feed.pinLayout; w.feed.pinLayout = (r) => { if (r) order.push('pin'); origPin(r); };
    const origCall = w.obsCall;
    w.obsCall = async (type, d) => { if (type === 'SetSceneItemTransform') order.push('move'); return origCall(type, d); };
    const h = camHarness(w);
    assert.equal(h.cam.camHideActive(), false);
    const a = h.sock('obs1');
    await a.ask(true);
    assert.deepEqual(order, ['layout', 'pin', 'move']);
    assert.equal(h.cam.camHideActive(), true);
    await a.ask(false);
    assert.equal(h.cam.camHideActive(), false);
    // feed kiểu lib/touchplay-obs-feed.js (chưa có pinLayout) → body-server vá: đang ghim thì _refreshLayout không đọc lại
    let reads = 0;
    const feed = { layout: { cam: { found: true } }, bridge: { connected: true }, status: () => ({ source: 'Cam NPC' }), _refreshLayout: async () => { reads++; } };
    const w2 = camWorld(); w2.feed = feed;
    camHarness(w2);
    assert.equal(typeof feed.pinLayout, 'function');
    await feed._refreshLayout('Cam NPC'); assert.equal(reads, 1);
    feed.pinLayout('camhide');
    await feed._refreshLayout('Cam NPC'); assert.equal(reads, 1);
    feed.pinLayout('');
    await feed._refreshLayout('Cam NPC'); assert.equal(reads, 2);
});

test('📷 overlay Bộ Tách Người dùng HpCamHide (/lib/hp-cam-hide.mjs có thật); Bị Đuổi nhận bgMode room', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/games/body/overlay.html'), 'utf8');
    assert.match(src, /from '\/lib\/hp-cam-hide\.mjs'/);
    assert.match(src, /new HpCamHide\(\{ game: GAME/);
    assert.ok(fs.existsSync(path.join(__dirname, '../public/lib/hp-cam-hide.mjs')));
    const BD = require('../public/games/biduoi/core.js');
    assert.equal(BD.normalizeConfig({ bgMode: 'room' }).bgMode, 'room');
    assert.equal(BD.normalizeConfig({ bgMode: 'xx' }).bgMode, 'room');
    assert.equal(BD.normalizeConfig({ bgMode: 'effect', bgModeV: 2 }).bgMode, 'effect');
});
