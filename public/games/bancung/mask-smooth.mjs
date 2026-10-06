// public/games/bancung/mask-smooth.mjs — làm mượt mặt nạ người (độ tin 0..1 mỗi điểm ảnh) trước khi tô đỏ / đen.
//
// Mặt nạ thô từ MediaPipe Pose có 3 tật khi phóng lên khung 1080×1920:
//   1. viền răng cưa / gợn sóng (độ phân giải thấp)   → làm mờ rồi CẮT LẠI quanh 0.5: viền trơn mà vẫn sắc,
//      chấm nhiễu lẻ biến mất, lỗ nhỏ trong người được lấp.
//   2. viền rung lăn tăn dù người đứng yên            → lọc theo thời gian CÓ THÍCH NGHI: đổi ít (nhiễu) thì
//      nén mạnh, đổi nhiều (người cử động) thì theo ngay — không để bóng ma.
//   3. người dời chỗ giữa hai khung model            → dời bộ nhớ đệm theo tâm thân (shift) trước khi trộn,
//      để bộ lọc thời gian chỉ xử lý nhiễu, không làm trễ chuyển động.
// Thuần JS, không DOM — chạy được trong Node để kiểm thử (tests/mask-smooth.test.mjs).

// Trộn acc về src theo độ lệch: |d| nhỏ → k≈0.25 (nén rung), |d| ≥ 0.7 → k=1 (theo ngay).
export function temporalBlend(acc, src, n) {
    for (let i = 0; i < n; i++) {
        const d = src[i] - acc[i];
        const ad = d < 0 ? -d : d;
        let s = (ad - 0.25) / 0.45;
        s = s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s);
        acc[i] += d * (0.25 + 0.75 * s);
    }
}

// Làm mờ hộp tách hàng/cột, chạy 2 lượt ≈ Gauss. Tổng tích luỹ chạy → O(n) bất kể bán kính. Bờ: kẹp mép.
// Vòng giữa không cần kẹp chỉ số → nhanh; chỉ đoạn sát hai mép mới kẹp.
export function boxBlur(src, out, tmp, w, h, r) {
    if (r < 1) { out.set(src); return; }
    const inv = 1 / (2 * r + 1);
    const pass = (a, b) => {
        for (let y = 0; y < h; y++) {                       // ngang: a → tmp
            const row = y * w, last = row + w - 1;
            let acc = 0;
            for (let k = -r; k <= r; k++) acc += a[row + (k < 0 ? 0 : k > w - 1 ? w - 1 : k)];
            for (let x = 0; x < w; x++) {
                tmp[row + x] = acc * inv;
                const add = x + r + 1, sub = x - r;
                acc += a[add < w ? row + add : last] - a[sub > 0 ? row + sub : row];
            }
        }
        const lastRow = (h - 1) * w;
        for (let x = 0; x < w; x++) {                       // dọc: tmp → b
            let acc = 0;
            for (let k = -r; k <= r; k++) acc += tmp[(k < 0 ? 0 : k > h - 1 ? h - 1 : k) * w + x];
            for (let y = 0, i = x; y < h; y++, i += w) {
                b[i] = acc * inv;
                const add = y + r + 1, sub = y - r;
                acc += tmp[add < h ? add * w + x : lastRow + x] - tmp[sub > 0 ? sub * w + x : x];
            }
        }
    };
    pass(src, out);
    pass(out, out);     // lượt 2 đọc/ghi cùng mảng an toàn: ngang ghi ra tmp trước, dọc mới ghi lại out
}

// Thu nhỏ một nửa (trung bình khối 2×2, cạnh lẻ kẹp mép). Mặt nạ của model vốn tính ở ~256 điểm ảnh
// rồi phóng lên cỡ ảnh vào, nên xử lý ở nửa độ phân giải không mất chi tiết mà nhẹ đi ~4 lần.
export function downsample2(src, w, h, st) {
    const dw = Math.ceil(w / 2), dh = Math.ceil(h / 2), n = dw * dh;
    if (!st.ds || st.ds.length !== n) st.ds = new Float32Array(n);
    const d = st.ds;
    for (let y = 0; y < dh; y++) {
        const y0 = 2 * y * w, y1 = Math.min(h - 1, 2 * y + 1) * w;
        for (let x = 0; x < dw; x++) {
            const x0 = 2 * x, x1 = Math.min(w - 1, 2 * x + 1);
            d[y * dw + x] = (src[y0 + x0] + src[y0 + x1] + src[y1 + x0] + src[y1 + x1]) * 0.25;
        }
    }
    return { data: d, w: dw, h: dh };
}

// Dời mảng w×h đi (dx, dy) điểm ảnh nguyên, chỗ trống = 0. Dùng buf phụ cỡ bằng a.
function shiftInPlace(a, buf, w, h, dx, dy) {
    if (!dx && !dy) return;
    buf.fill(0);
    for (let y = 0; y < h; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < w; x++) {
            const sx = x - dx;
            if (sx >= 0 && sx < w) buf[y * w + x] = a[sy * w + sx];
        }
    }
    a.set(buf);
}

/**
 * Một khung mặt nạ mới → mặt nạ đã làm mượt (0..1, viền đã cắt trơn). st giữ trạng thái giữa các khung.
 * opts: radius (bán kính làm mờ, điểm ảnh mặt nạ), temporal (bật lọc thời gian),
 *       shift [dx,dy] (người dời bao nhiêu điểm ảnh mặt nạ kể từ khung trước), lo/hi (dải cắt viền).
 */
export function smoothMask(st, raw, w, h, opts = {}) {
    const n = w * h, r = opts.radius ?? 2, lo = opts.lo ?? 0.4, hi = opts.hi ?? 0.6;
    if (!st.blur || st.n !== n || st.w !== w) {
        st.n = n; st.w = w; st.h = h;
        st.blur = new Float32Array(n); st.tmp = new Float32Array(n); st.acc = null; st.out = new Float32Array(n);
    }
    boxBlur(raw, st.blur, st.tmp, w, h, r);
    let v = st.blur;
    if (opts.temporal) {
        if (!st.acc) st.acc = Float32Array.from(st.blur);
        else {
            const [dx, dy] = opts.shift || [0, 0];
            const sx = Math.round(dx), sy = Math.round(dy);
            // Dời quá xa (đổi cảnh, mất người lâu) → bỏ bộ đệm cũ, bắt đầu lại.
            if (Math.abs(sx) > w / 4 || Math.abs(sy) > h / 4) st.acc.set(st.blur);
            else { shiftInPlace(st.acc, st.tmp, w, h, sx, sy); temporalBlend(st.acc, st.blur, n); }
        }
        v = st.acc;
    }
    const out = st.out, span = hi - lo;
    for (let i = 0; i < n; i++) {
        let t = (v[i] - lo) / span;
        out[i] = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    }
    return out;
}

// Giá trị 0..1 → kênh alpha (RGB trắng) của ImageData, cắt mềm trong [lo, hi].
export function toAlpha(vals, px, lo = 0, hi = 1) {
    const span = hi - lo || 1;
    for (let i = 0, j = 0; i < vals.length; i++, j += 4) {
        let t = (vals[i] - lo) / span;
        t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        px[j] = px[j + 1] = px[j + 2] = 255; px[j + 3] = t * 255;
    }
}
