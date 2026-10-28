// overlays/lib/obs-scene-map.mjs (port nguyên từ HP Action LIVE public/lib/obs-scene-map.mjs) - quy đổi toạ độ theo transform scene item của OBS.
//
// Tái hiện update_item_transform() của libobs (obs-scene.c): crop → scale (hoặc bounds) →
// trừ origin theo alignment → xoay → cộng position. Ma trận affine 2D dạng [a,b,c,d,e,f]:
//   X = a·x + c·y + e,  Y = b·x + d·y + f
// Dùng cho game webcam: điểm tay trên ảnh chụp nguồn camera → toạ độ sân khấu overlay.

const LEFT = 1, RIGHT = 2, TOP = 4, BOTTOM = 8;

export const mul = (m, n) => [               // m ∘ n (áp n trước rồi m)
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];
export function inv(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det) return null;
    const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
export const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export const scaleM = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];

function alignOffset(align, w, h) {
    const x = align & RIGHT ? w : align & LEFT ? 0 : w / 2;
    const y = align & BOTTOM ? h : align & TOP ? 0 : h / 2;
    return [x, y];
}

// Ma trận: pixel NGUYÊN BẢN của nguồn (chưa crop, 0..sourceWidth) → pixel canvas cha.
export function itemMatrix(t) {
    const cl = t.cropLeft || 0, cr = t.cropRight || 0, ct = t.cropTop || 0, cb = t.cropBottom || 0;
    const cw = Math.max(1, (t.sourceWidth || 0) - cl - cr), ch = Math.max(1, (t.sourceHeight || 0) - ct - cb);
    let sx = t.scaleX ?? 1, sy = t.scaleY ?? 1;
    let ox, oy;
    const bt = t.boundsType || 'OBS_BOUNDS_NONE';
    if (bt !== 'OBS_BOUNDS_NONE' && t.boundsWidth > 0 && t.boundsHeight > 0) {
        const bw = t.boundsWidth, bh = t.boundsHeight;
        const w0 = cw * Math.abs(sx), h0 = ch * Math.abs(sy);
        let type = bt;
        if (type === 'OBS_BOUNDS_MAX_ONLY') type = (w0 > bw || h0 > bh) ? 'OBS_BOUNDS_SCALE_INNER' : 'NONE_INSIDE';
        if (type === 'OBS_BOUNDS_SCALE_INNER' || type === 'OBS_BOUNDS_SCALE_OUTER') {
            let useWidth = bw / bh < w0 / h0;
            if (type === 'OBS_BOUNDS_SCALE_OUTER') useWidth = !useWidth;
            const k = useWidth ? bw / w0 : bh / h0; sx *= k; sy *= k;
        } else if (type === 'OBS_BOUNDS_SCALE_TO_WIDTH') { const k = bw / w0; sx *= k; sy *= k; }
        else if (type === 'OBS_BOUNDS_SCALE_TO_HEIGHT') { const k = bh / h0; sx *= k; sy *= k; }
        else if (type === 'OBS_BOUNDS_STRETCH') { sx = Math.sign(sx || 1) * bw / cw; sy = Math.sign(sy || 1) * bh / ch; }
        const w = cw * sx, h = ch * sy;
        // nội dung căn trong khung bounds theo boundsAlignment; lật (scale âm) thì bù lại bề rộng
        const [dx, dy] = alignOffset(t.boundsAlignment ?? 0, bw - Math.abs(w), bh - Math.abs(h));
        ox = -dx + (w < 0 ? w : 0); oy = -dy + (h < 0 ? h : 0);
        const [ax, ay] = alignOffset(t.alignment ?? 5, bw, bh);
        ox += ax; oy += ay;
    } else {
        [ox, oy] = alignOffset(t.alignment ?? 5, cw * sx, ch * sy);
    }
    const r = (t.rotation || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    // cục bộ: lx = (x − cl)·sx − ox ; ly = (y − ct)·sy − oy ; rồi xoay + dời
    const lx0 = -cl * sx - ox, ly0 = -ct * sy - oy;
    return [cos * sx, sin * sx, -sin * sy, cos * sy,
        (t.positionX || 0) + cos * lx0 - sin * ly0, (t.positionY || 0) + sin * lx0 + cos * ly0];
}

export function chainMatrix(chain) {
    let m = [1, 0, 0, 1, 0, 0];
    for (const t of chain || []) m = mul(m, itemMatrix(t));
    return m;
}

/**
 * Ma trận ảnh chụp camera (bw×bh pixel) → sân khấu game (stageW×stageH).
 * layout: { canvas:{w,h}, cam:{found, chain}, overlay:{found, chain}, overlays:{<gameId>:{found, chain}} } (từ server).
 * Overlay hiển thị sân khấu kiểu "contain" giữa khung Browser Source (fitOverlay).
 * overlayId: game nào đang hỏi - nhiều overlay cùng nhận hình thì mỗi game lấy đúng Browser Source
 * của mình trong layout.overlays; không có thì dùng layout.overlay (Touch & Play, bản cũ).
 */
export function cameraToStage(layout, bw, bh, stageW, stageH, overlayId = '') {
    const canvas = layout?.canvas || { w: stageW, h: stageH };
    const overlay = (overlayId && layout?.overlays?.[overlayId]) || layout?.overlay;
    const chain = layout?.cam?.chain;
    const inner = chain && chain.length ? chain[chain.length - 1] : null;
    const sw = inner?.sourceWidth || bw, sh = inner?.sourceHeight || bh;
    // ảnh chụp → pixel nguồn
    let m = scaleM(sw / bw, sh / bh);
    // nguồn → canvas (chưa thấy trong scene thì giả định phủ kín canvas kiểu cover)
    if (layout?.cam?.found && chain?.length) m = mul(chainMatrix(chain), m);
    else { const s = Math.max(canvas.w / sw, canvas.h / sh); m = mul([s, 0, 0, s, (canvas.w - sw * s) / 2, (canvas.h - sh * s) / 2], m); }
    // canvas → pixel cục bộ của Browser Source overlay
    let ow = canvas.w, oh = canvas.h;
    if (overlay?.found && overlay.chain?.length) {
        const oc = overlay.chain, ot = oc[oc.length - 1];
        const im = inv(chainMatrix(oc));
        if (im) { m = mul(im, m); ow = ot.sourceWidth || ow; oh = ot.sourceHeight || oh; }
    }
    // pixel overlay → sân khấu (contain, căn giữa)
    const s = Math.min(ow / stageW, oh / stageH);
    const toStage = [1 / s, 0, 0, 1 / s, -((ow - stageW * s) / 2) / s, -((oh - stageH * s) / 2) / s];
    return mul(toStage, m);
}

// Ô chữ nhật cục bộ (pixel nguồn) của một scene item sau crop: [x0, y0, x1, y1].
const cropBox = t => [t.cropLeft || 0, t.cropTop || 0, (t.sourceWidth || 0) - (t.cropRight || 0), (t.sourceHeight || 0) - (t.cropBottom || 0)];
// Khung bao (trục thẳng) của ô [x0,y0,x1,y1] sau ma trận m.
function boxThrough(m, b) {
    const p = [apply(m, b[0], b[1]), apply(m, b[2], b[1]), apply(m, b[0], b[3]), apply(m, b[2], b[3])];
    const xs = p.map(q => q.x), ys = p.map(q => q.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const clipBox = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];

/**
 * 👁 VÙNG NHÌN THẤY của sân khấu trên OBS: phần sân khấu (stageW×stageH, contain giữa Browser Source như cameraToStage)
 * thật sự hiện trên canvas - Browser Source bị crop (Scene PK / Colab thu "cover" vào khung cam 540×540, 540×1050…), group /
 * scene lồng bị crop, hoặc thò ra ngoài canvas thì phần đó không thấy. Trả { x, y, w, h } theo toạ độ sân khấu.
 * Chưa biết bố cục / không thấy Browser Source / vùng còn lại quá nhỏ (< minFrac mỗi chiều - nghi bố cục sai) → cả sân khấu.
 * Có xoay thì lấy khung bao trục thẳng (gần đúng - Scene PK không xoay).
 */
export function visibleStage(layout, stageW, stageH, overlayId = '', minFrac = 0.2) {
    const full = { x: 0, y: 0, w: stageW, h: stageH };
    const overlay = (overlayId && layout?.overlays?.[overlayId]) || layout?.overlay;
    const oc = overlay?.found && overlay.chain;
    if (!oc || !oc.length) return full;
    const ot = oc[oc.length - 1];
    const ow = ot.sourceWidth, oh = ot.sourceHeight;
    if (!(ow > 0 && oh > 0)) return full;
    // Trên canvas: ô sau crop của từng tầng (tầng i = item trong scene cha, toạ độ nguồn → canvas qua chain[0..i]) giao nhau, giao canvas.
    const canvas = layout?.canvas;
    let box = canvas?.w > 0 && canvas?.h > 0 ? [0, 0, canvas.w, canvas.h] : [-Infinity, -Infinity, Infinity, Infinity];
    let m = [1, 0, 0, 1, 0, 0];
    for (const t of oc) {
        m = mul(m, itemMatrix(t));
        if (t.sourceWidth > 0 && t.sourceHeight > 0) box = clipBox(box, boxThrough(m, cropBox(t)));
    }
    if (!(box[2] > box[0] && box[3] > box[1])) return full;
    const im = inv(m);
    if (!im) return full;
    // canvas → pixel Browser Source → sân khấu (contain, căn giữa)
    const b = clipBox(boxThrough(im, box), [0, 0, ow, oh]);
    const s = Math.min(ow / stageW, oh / stageH), ox = (ow - stageW * s) / 2, oy = (oh - stageH * s) / 2;
    const r = clipBox([(b[0] - ox) / s, (b[1] - oy) / s, (b[2] - ox) / s, (b[3] - oy) / s], [0, 0, stageW, stageH]);
    const w = r[2] - r[0], h = r[3] - r[1];
    if (!(w >= stageW * minFrac && h >= stageH * minFrac)) return full;
    const k = v => Math.round(v * 100) / 100;
    return { x: k(r[0]), y: k(r[1]), w: k(w), h: k(h) };
}

// ---------- 👁 createCamView - VÙNG NHÌN THẤY cho từng game (chỉ chạy trong trình duyệt; Node chỉ import visibleStage) ----------
//
// Scene PK / Colab / PK 4 / PK 6 thu Browser Source Game Camera (sân khấu 1080×1920) "cover" vào khung cam của NPC bằng crop:
// ô không phải 9:16 (540×540, 540×1050…) thì mất phần trên/dưới hoặc hai bên. Người vẽ lại vẫn khớp cam (cameraToStage), nhưng
// thứ gắn MÉP SÂN KHẤU (HUD điểm, cổng trần, vũng nước, vùng sinh vật thể…) phải lùi vào phần còn thấy → dùng rect của createCamView.
// Không ở Scene PK (không crop) → rect = cả sân khấu, không đổi gì.
//
//   const cv = createCamView({ W, H, overlayId: 'dapmuoi', getLayout: () => feed.layout });
//   cv.rect            → { x, y, w, h } toạ độ sân khấu (tự tính lại khi bố cục OBS / cỡ cửa sổ đổi)
//   CSS: :root nhận --cv-t / --cv-r / --cv-b / --cv-l = khoảng lùi (px) của vùng thấy so với mép khung trang, vd
//        top: calc(var(--cv-t, 0px) + 3vmin)
//
// Bố cục lấy theo thứ tự: ?cview=x,y,w,h (thử tay, toạ độ sân khấu) → getLayout() của game (feed riêng) → bố cục overlay mẹ
// /overlay/camgames (window.parent.__hpCamShared.layout, Browser Source 'camgames').

function forced(W, H) {
    const q = new URLSearchParams(location.search).get('cview');
    if (!q) return null;
    const [x, y, w, h] = q.split(',').map(Number);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(w, W), h: Math.min(h, H) };
}
function parentLayout() {
    try { return window.parent !== window ? window.parent.__hpCamShared?.layout || null : null; } catch (_) { return null; }
}

export function createCamView({ W = 1080, H = 1920, overlayId = '', getLayout = null, root = document.documentElement, onChange = null, interval = 500 } = {}) {
    const fixed = forced(W, H);
    let rect = { x: 0, y: 0, w: W, h: H }, lastLayout, lastId, lastVw = -1, lastVh = -1, cssKey = '';

    function setCss() {
        if (!root) return;
        // sân khấu W×H nằm "contain" giữa khung trang (canvas object-fit: contain / overlay-resolution)
        const vw = innerWidth || W, vh = innerHeight || H, s = Math.min(vw / W, vh / H);
        const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
        const t = Math.round(oy + rect.y * s), l = Math.round(ox + rect.x * s);
        const b = Math.round(vh - (oy + (rect.y + rect.h) * s)), r = Math.round(vw - (ox + (rect.x + rect.w) * s));
        const key = `${t},${r},${b},${l}`;
        if (key === cssKey) return;
        cssKey = key;
        root.style.setProperty('--cv-t', t + 'px'); root.style.setProperty('--cv-r', r + 'px');
        root.style.setProperty('--cv-b', b + 'px'); root.style.setProperty('--cv-l', l + 'px');
    }
    function refresh() {
        const own = typeof getLayout === 'function' ? getLayout() : null;
        const layout = fixed ? null : own || parentLayout();
        const id = own ? overlayId : 'camgames';
        if (layout === lastLayout && id === lastId && innerWidth === lastVw && innerHeight === lastVh) return rect;
        lastLayout = layout; lastId = id; lastVw = innerWidth; lastVh = innerHeight;
        const next = fixed || visibleStage(layout, W, H, id);
        const changed = next.x !== rect.x || next.y !== rect.y || next.w !== rect.w || next.h !== rect.h;
        rect = next;
        setCss();
        if (changed && onChange) try { onChange(rect); } catch (e) { console.warn('[cam-view]', e); }
        return rect;
    }
    refresh();
    setCss();
    const timer = interval > 0 ? setInterval(refresh, interval) : 0;
    addEventListener('resize', () => { lastVw = -1; refresh(); });
    return {
        get rect() { return refresh(); },
        refresh,
        stop() { clearInterval(timer); }
    };
}
