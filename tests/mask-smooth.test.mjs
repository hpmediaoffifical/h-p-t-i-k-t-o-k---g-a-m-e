// node --test tests/mask-smooth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { temporalBlend, boxBlur, smoothMask, toAlpha } from '../public/games/bancung/mask-smooth.mjs';

const W = 40, H = 40;
// Đĩa tròn bán kính R giữa ảnh — "người" giả.
function disc(R, cx = 20, cy = 20, w = W, h = H) {
    const a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = Math.hypot(x - cx, y - cy) <= R ? 1 : 0;
    return a;
}
const at = (a, x, y, w = W) => a[y * w + x];

test('boxBlur: giữ tổng (bờ kẹp) và làm mềm bậc thang', () => {
    const src = disc(10), tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    boxBlur(src, out, tmp, W, H, 2);
    const s0 = src.reduce((p, v) => p + v, 0), s1 = out.reduce((p, v) => p + v, 0);
    assert.ok(Math.abs(s0 - s1) / s0 < 0.02, `tổng lệch: ${s0} → ${s1}`);
    assert.ok(at(out, 20, 20) > 0.99, 'tâm vẫn đặc');
    const edge = at(out, 30, 20);              // ngay mép
    assert.ok(edge > 0.2 && edge < 0.8, 'mép thành dải chuyển: ' + edge);
});

test('smoothMask: xoá chấm nhiễu lẻ ngoài người và lấp lỗ nhỏ trong người', () => {
    const m = disc(12);
    m[3 * W + 3] = 1;                          // chấm nhiễu ngoài nền
    m[20 * W + 20] = 0;                        // lỗ 1 điểm giữa người
    m[20 * W + 21] = 0;
    const st = {};
    const out = smoothMask(st, m, W, H, { radius: 2, temporal: false });
    assert.ok(at(out, 3, 3) < 0.15, 'chấm nhiễu phải mất: ' + at(out, 3, 3));
    assert.ok(at(out, 20, 20) > 0.85, 'lỗ phải được lấp: ' + at(out, 20, 20));
});

test('temporalBlend: rung nhỏ bị nén, đổi lớn theo ngay', () => {
    const acc = new Float32Array([0.5, 0.0]);
    temporalBlend(acc, new Float32Array([0.6, 1.0]), 2);
    assert.ok(acc[0] > 0.5 && acc[0] < 0.56, 'rung 0.1 chỉ đi ~1/3: ' + acc[0]);
    assert.ok(acc[1] > 0.95, 'đổi 1.0 (người cử động) theo gần hết: ' + acc[1]);
});

test('smoothMask: người đứng yên mà mặt nạ rung ±1px → viền đầu ra rung ít hơn hẳn', () => {
    const st = {};
    let prevRaw = null, prevOut = null, rawJ = 0, outJ = 0;
    for (let f = 0; f < 30; f++) {
        const jx = (f % 2) ? 1 : -1;             // mép lệch qua lại 2px mỗi khung
        const raw = disc(12, 20 + jx, 20);
        const out = Float32Array.from(smoothMask(st, raw, W, H, { radius: 2, temporal: true }));
        if (prevRaw && f > 5) {
            for (let i = 0; i < raw.length; i++) { rawJ += Math.abs(raw[i] - prevRaw[i]); outJ += Math.abs(out[i] - prevOut[i]); }
        }
        prevRaw = raw; prevOut = out;
    }
    assert.ok(outJ < rawJ * 0.35, `rung sau lọc phải < 35% gốc: gốc ${rawJ.toFixed(1)}, sau ${outJ.toFixed(1)}`);
});

test('smoothMask: người dời hẳn chỗ → bám theo trong ≤ 2 khung, không để bóng ma', () => {
    const st = {};
    smoothMask(st, disc(8, 12, 20), W, H, { radius: 2, temporal: true });
    smoothMask(st, disc(8, 12, 20), W, H, { radius: 2, temporal: true });
    smoothMask(st, disc(8, 28, 20), W, H, { radius: 2, temporal: true });
    const out = smoothMask(st, disc(8, 28, 20), W, H, { radius: 2, temporal: true });
    assert.ok(at(out, 12, 20) < 0.15, 'chỗ cũ phải hết đỏ: ' + at(out, 12, 20));
    assert.ok(at(out, 28, 20) > 0.85, 'chỗ mới phải đặc: ' + at(out, 28, 20));
});

test('toAlpha: dải cắt quanh 0.5 → 0/255 hai bên, trơn ở giữa', () => {
    const px = new Uint8ClampedArray(3 * 4);
    toAlpha(new Float32Array([0.2, 0.5, 0.8]), px, 0.4, 0.6);
    assert.equal(px[3], 0); assert.equal(px[11], 255);
    assert.ok(px[7] > 100 && px[7] < 155, 'giữa dải ~ nửa: ' + px[7]);
});

test('smoothMask: người đi đều 2px/khung — có shift thì không trễ, không shift thì trễ', () => {
    const cx = a => { let s = 0, m = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = a[y * W + x]; s += v * x; m += v; } return s / m; };
    const run = useShift => {
        const st = {};
        let out;
        for (let f = 0; f < 10; f++) out = smoothMask(st, disc(7, 8 + f * 2, 20), W, H, { radius: 2, temporal: true, shift: useShift && f ? [2, 0] : [0, 0] });
        return cx(out) - (8 + 9 * 2);           // lệch so với vị trí thật
    };
    const withShift = run(true), noShift = run(false);
    assert.ok(Math.abs(withShift) < 0.3, 'có shift phải khớp vị trí: lệch ' + withShift.toFixed(2));
    assert.ok(noShift < -0.5, 'không shift thì trễ lại phía sau: lệch ' + noShift.toFixed(2));
});

test('downsample2: trung bình khối 2×2, cạnh lẻ thì kẹp mép', async () => {
    const { downsample2 } = await import('../public/games/bancung/mask-smooth.mjs');
    const src = new Float32Array([1, 1, 0, 0, 0,
                                  1, 1, 0, 0, 1,
                                  0, 0, 1, 0, 0]);           // 5×3
    const { data, w, h } = downsample2(src, 5, 3, {});
    assert.equal(w, 3); assert.equal(h, 2);
    assert.equal(data[0], 1);                       // khối đặc
    assert.equal(data[1], 0);                       // khối rỗng
    assert.equal(data[2], 0.5);                     // cột lẻ cuối: (0,1) kẹp → (0+0+1+1)/4
    assert.equal(data[4], 0.5);                     // hàng lẻ cuối: (1,0) kẹp → (1+0+1+0)/4
});

test('boxBlur nhanh = boxBlur chuẩn (so với bản kẹp mép từng điểm)', () => {
    const w = 23, h = 17, r = 3, src = new Float32Array(w * h).map(() => Math.random());
    const ref = new Float32Array(w * h), tmp = new Float32Array(w * h);
    const once = (a, b) => {                        // bản tham chiếu chậm, kẹp từng điểm
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = s / (2 * r + 1); }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; b[y * w + x] = s / (2 * r + 1); }
    };
    once(src, ref); once(ref, ref);
    const out = new Float32Array(w * h);
    boxBlur(src, out, new Float32Array(w * h), w, h, r);
    let worst = 0; for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - ref[i]));
    assert.ok(worst < 1e-5, 'lệch tối đa ' + worst);
});
