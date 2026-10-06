// public/lib/obs-scene-map.mjs — quy đổi toạ độ theo transform scene item của OBS.
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
 * overlayId: game nào đang hỏi — nhiều overlay cùng nhận hình thì mỗi game lấy đúng Browser Source
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
