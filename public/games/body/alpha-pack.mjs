/* 🎞 Video trong suốt "xếp cặp" (packed alpha) - thay webm VP9 alpha (giải mã bằng CPU, ~1,3 nhân / video 1080p) bằng mp4 H.264
 * (GPU giải mã): một khung chứa 2 nửa - MÀU + kênh ALPHA dạng xám. Rộng > cao = cạnh nhau (trái màu · phải alpha, vd 2160×1920 -
 * nằm gọn giới hạn 4096×2304 giải mã phần cứng của mọi GPU); cao ≥ rộng = chồng dọc (trên màu · dưới alpha, vd 1080×3840).
 * Nhận diện theo TÊN file: "….pack.mp4" (cũng nhận _pack / -pack / .packed; mp4 / m4v / mov / mkv). Ghép alpha bằng WebGL trên
 * MỘT canvas phụ dùng chung rồi trả canvas đó để drawImage vào ctx 2D NGAY (trước lần ghép kế tiếp). Mỗi video giữ texture riêng,
 * chỉ tải khung mới khi video ra khung mới (requestVideoFrameCallback) - rAF 60–240 Hz không tải lại khung 30 fps cũ.
 * Cách tạo file: docs/camgames-video-hanh-dong.md (mục ⚡ Lag). */
export const PACKED_FILE = /[._-]pack(ed)?\.(mp4|m4v|mov|mkv)(\?|$)/i;
export const isPackedFile = f => PACKED_FILE.test(String(f || ''));
// 🐢 WebGL chạy bằng PHẦN MỀM (OBS tắt "tăng tốc phần cứng Browser Source" / "Blacklisted device", máy không driver): ghép alpha bằng
// WebGL thành SwiftShader trên CPU. Đo Chrome --disable-gpu 2026-10-23, ufo.pack.mp4 vẽ 1080×1920: WebGL 16 khung/s, 59 ms/khung, rớt
// 45 % khung · canvas 2D 37 khung/s, 23 ms · webm VP9 alpha gốc 212 khung/s, 3 ms (có GPU thì ngược lại: pack 0,28 nhân, webm 0,75).
let softGL = null;
export function softwareWebGL() {
    if (softGL != null) return softGL;
    if (/[?&]softgl=1(&|$)/.test(location.search)) return (softGL = true);       // thử đường không GPU trên máy có GPU
    try {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return (softGL = true);
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        softGL = /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch (_) { softGL = true; }
    return softGL;
}
// Bản webm VP9 alpha đặt CẠNH file pack (….pack.mp4 → ….webm) - chỉ video mẫu giao kèm mới chắc có (list/camgames/body).
export const webmTwinOf = f => String(f || '').replace(/[._-]pack(ed)?\.(mp4|m4v|mov|mkv)(?=\?|$)/i, '.webm');
// Bố cục theo kích thước video: { side, w, h } = cạnh nhau?, cỡ MỘT nửa (cỡ hình hiện ra).
export function packedLayout(vw, vh) {
    const side = vw > vh;
    return { side, w: side ? Math.floor(vw / 2) : vw, h: side ? vh : Math.floor(vh / 2) };
}

const VS = `attribute vec2 a; uniform vec2 sc; varying vec2 uv;
void main() { uv = a * sc; gl_Position = vec4(a.x * 2.0 - 1.0, 1.0 - a.y * 2.0, 0.0, 1.0); }`;
// Màu ở nửa đầu, alpha = kênh đỏ (xám) ở nửa sau (lệch 'off'). Kẹp toạ độ màu cách đường nối nửa texel - lọc tuyến tính không
// kéo xám của nửa alpha vào mép màu. Bỏ nhiễu nén quanh 0 / 255 (alpha ≤ 3/255 → 0) để vùng trong suốt không lấm tấm.
const FS = `precision mediump float; uniform sampler2D t; uniform vec2 off, lim; varying vec2 uv;
void main() {
    vec2 p = min(uv, lim);
    vec3 c = texture2D(t, p).rgb;
    float al = clamp((texture2D(t, p + off).r - 0.012) * 1.025, 0.0, 1.0);
    gl_FragColor = vec4(c * al, al);
}`;

export function createAlphaUnpacker() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    let gl = null, loc = null, failed = '', lost = false;
    let soft = softwareWebGL();              // không có GPU → ghép bằng canvas 2D (draw2d)
    const vids = new Map();                  // <video> → { tex, key, pf, pfAt, rvfc }
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { lost = false; gl = null; for (const st of vids.values()) { st.tex = null; st.key = null; } });
    function init() {
        gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
        if (!gl) { failed = 'no WebGL'; return false; }
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { failed = 'shader: ' + gl.getProgramInfoLog(prog); gl = null; return false; }
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(prog, 'a');
        gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.clearColor(0, 0, 0, 0);
        loc = { sc: gl.getUniformLocation(prog, 'sc'), off: gl.getUniformLocation(prog, 'off'), lim: gl.getUniformLocation(prog, 'lim') };
        return true;
    }
    function newTex() {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    function track(el) {
        let st = vids.get(el);
        if (st) return st;
        st = { tex: null, key: null, pf: 0, pfAt: -1e9, rvfc: 0 };
        vids.set(el, st);
        if (el.requestVideoFrameCallback) {
            const cb = (_, md) => { if (vids.get(el) !== st) return; st.pf = md.presentedFrames; st.pfAt = performance.now(); st.rvfc = el.requestVideoFrameCallback(cb); };
            st.rvfc = el.requestVideoFrameCallback(cb);
        }
        return st;
    }
    // Khung hiện tại có khác lần tải trước? Đang chạy: theo số khung đã ra (rVFC còn chạy trong 250 ms qua) - rVFC đứng (trang ẩn,
    // video kẹt) thì tải mỗi lần cho chắc. Dừng / hết: theo currentTime (tua khi soi bằng __bodyT vẫn đổi khung).
    const keyOf = (el, st) => el.paused || el.ended ? 't' + el.currentTime : performance.now() - st.pfAt < 250 ? 'f' + st.pf : null;
    const stat = { n: 0, ms: 0, uploads: 0, skips: 0 };
    // 🐢 Không có GPU: ghép bằng canvas 2D - nửa alpha qua bộ lọc SVG (đỏ → alpha, cùng ngưỡng nhiễu với shader) rồi nửa màu
    // 'source-in'. Mỗi video một canvas riêng, chỉ ghép lại khi video ra khung mới (rAF 60 Hz không ghép lại khung 30 fps cũ).
    let svgReady = false;
    function draw2d(el, vw, vh) {
        if (!svgReady) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
            svg.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none';
            svg.innerHTML = '<filter id="hp-pack-a" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.025 0 0 0 -0.0123"/></filter>';
            document.body.appendChild(svg);
            svgReady = true;
        }
        const t0 = performance.now();
        const st = track(el), L = packedLayout(vw, vh), key = keyOf(el, st);
        if (!st.cv) { st.cv = document.createElement('canvas'); st.g = st.cv.getContext('2d'); }
        const cv = st.cv, g = st.g;
        if (cv.width !== L.w || cv.height !== L.h) { cv.width = L.w; cv.height = L.h; st.key = null; }
        if (key == null || key !== st.key) {
            const ax = L.side ? L.w : 0, ay = L.side ? 0 : L.h;
            g.globalCompositeOperation = 'copy'; g.filter = 'url(#hp-pack-a)';
            g.drawImage(el, ax, ay, L.w, L.h, 0, 0, L.w, L.h);
            g.filter = 'none'; g.globalCompositeOperation = 'source-in';
            g.drawImage(el, 0, 0, L.w, L.h, 0, 0, L.w, L.h);
            g.globalCompositeOperation = 'source-over';
            st.key = key; stat.uploads++;
        } else stat.skips++;
        const ms = performance.now() - t0;
        stat.ms = stat.n ? stat.ms * 0.9 + ms * 0.1 : ms; stat.n++;
        return cv;
    }
    // Ghép khung hiện tại của video packed → canvas (cỡ một nửa). null = chưa vẽ được (WebGL hỏng / mất ngữ cảnh / chưa có khung).
    function draw(el) {
        const vw = el.videoWidth, vh = el.videoHeight;
        if (!vw || !vh || el.readyState < 2) return null;
        if (soft) return draw2d(el, vw, vh);
        if (lost) return null;
        if (failed || (!gl && !init())) { soft = true; return draw2d(el, vw, vh); }      // không tạo được WebGL → canvas 2D
        const t0 = performance.now();
        const st = track(el), L = packedLayout(vw, vh), key = keyOf(el, st);
        if (canvas.width !== L.w || canvas.height !== L.h) { canvas.width = L.w; canvas.height = L.h; }
        gl.viewport(0, 0, L.w, L.h);
        if (!st.tex) { st.tex = newTex(); st.key = null; } else gl.bindTexture(gl.TEXTURE_2D, st.tex);
        if (key == null || key !== st.key) {
            try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); } catch (_) { return null; }
            st.key = key; stat.uploads++;
        } else stat.skips++;
        if (L.side) { gl.uniform2f(loc.sc, 0.5, 1); gl.uniform2f(loc.off, 0.5, 0); gl.uniform2f(loc.lim, 0.5 - 0.5 / vw, 1); }
        else { gl.uniform2f(loc.sc, 1, 0.5); gl.uniform2f(loc.off, 0, 0.5); gl.uniform2f(loc.lim, 1, 0.5 - 0.5 / vh); }
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const ms = performance.now() - t0;
        stat.ms = stat.n ? stat.ms * 0.9 + ms * 0.1 : ms; stat.n++;
        return canvas;
    }
    // Video bỏ khỏi bộ đệm media → trả texture (mỗi cái ~16 MB ở 2160×1920).
    function release(el) {
        const st = vids.get(el);
        if (!st) return;
        vids.delete(el);
        if (st.rvfc && el.cancelVideoFrameCallback) try { el.cancelVideoFrameCallback(st.rvfc); } catch (_) {}
        if (st.tex && gl && !lost) gl.deleteTexture(st.tex);
        if (st.cv) { st.cv.width = st.cv.height = 0; st.cv = null; }
    }
    return { draw, release, canvas, stat, get error() { return failed; }, get count() { return vids.size; }, get soft() { return soft; } };
}
