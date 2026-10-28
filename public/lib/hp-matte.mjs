// overlays/lib/hp-matte.mjs - tách người MỊN từ mặt nạ thô (WebGL2), phục vụ tại /lib/hp-matte.mjs.
//
// Mặt nạ của model (MediaPipe selfie ~256 px) phóng lên khung 1080×1920 thì viền răng cưa, tóc thành cục,
// viền rung lăn tăn từng khung. Ở đây làm 4 việc trên GPU, mỗi khung vài ms:
//   1. Lọc theo thời gian CÓ THÍCH NGHI: chỗ ảnh đứng yên trộn mạnh với khung trước (hết rung viền),
//      chỗ ảnh đổi nhiều (người cử động / nhảy / rơi) lấy ngay mặt nạ mới (không để bóng ma).
//   2. Guided filter MÀU (He & Sun) ở độ phân giải thấp: mặt nạ "bám" theo mép thật của ảnh - sợi tóc,
//      ngón tay, mép áo - rồi phóng hệ số lên đủ độ phân giải (fast guided filter) → viền mịn mà sắc.
//   3. Nắn độ cứng viền (smoothstep lo..hi): trong người đặc, viền mềm vài px.
//   4. Khử viền nền: điểm ảnh ở mép mang màu nền cũ → kéo về màu người lân cận (hết quầng sáng/viền xanh).
// Ra canvas RGBA (alpha nhân sẵn) cùng cỡ ảnh vào → vẽ thẳng lên sân khấu bằng drawImage.
//
//   const m = new HpMatte();
//   m.render(img, w, h, { data:Uint8Array(mw*mh), w:mw, h:mh, rect:[x,y,w,h] /* 0..1 trong ảnh */ }, opts);
//   ctx.drawImage(m.canvas, …)

// 🌐 hpT(): ngôn ngữ của trang (overlays/lib/hp-i18n.js); trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}).
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };

const VS = `#version 300 es
out vec2 v_uv;
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    v_uv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Mặt nạ thô tại toạ độ ảnh (rect = vùng ảnh model đã nhìn; ngoài vùng = nền).
const MASK_FN = `
uniform sampler2D uMask;
uniform vec4 uRect;
float maskAt(vec2 uv) {
    vec2 m = (uv - uRect.xy) / uRect.zw;
    if (m.x < 0.0 || m.y < 0.0 || m.x > 1.0 || m.y > 1.0) return 0.0;
    return texture(uMask, m).r;
}`;

// Ảnh thấp: 4 mẫu quanh tâm để khỏi răng cưa khi thu nhỏ 2–4 lần.
const PREP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D uFrame;
uniform sampler2D uPrev;
uniform vec2 uLowTexel;
uniform float uHasPrev, uStill;
uniform vec2 uMotion;
${MASK_FN}
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
layout(location = 4) out vec4 o4;
void main() {
    vec2 d = uLowTexel * 0.25;
    vec3 I = (texture(uFrame, v_uv + vec2(-d.x, -d.y)).rgb + texture(uFrame, v_uv + vec2(d.x, -d.y)).rgb
            + texture(uFrame, v_uv + vec2(-d.x, d.y)).rgb + texture(uFrame, v_uv + vec2(d.x, d.y)).rgb) * 0.25;
    float l = dot(I, vec3(0.299, 0.587, 0.114));
    float p = maskAt(v_uv);
    if (uHasPrev > 0.5) {
        vec4 pr = texture(uPrev, v_uv);
        float k = mix(uStill, 1.0, smoothstep(uMotion.x, uMotion.y, abs(l - pr.w)));
        p = mix(pr.z, p, k);
    }
    vec3 c = I - 0.5;                       // lệch về 0 cho phép tính phương sai đỡ mất chính xác
    o0 = vec4(c, p);
    o1 = vec4(c * p, p * p);
    o2 = vec4(c.r * c.r, c.r * c.g, c.r * c.b, c.g * c.g);
    o3 = vec4(c.g * c.b, c.b * c.b, p, l);  // zw (chưa làm mờ) = trạng thái cho khung sau
    float w = smoothstep(0.8, 1.0, p);      // chỉ phần CHẮC là người - màu lõi để khử viền nền
    o4 = vec4(c * w, w);
}`;

// Làm mờ hộp 1 chiều cho 4 tấm cùng lúc (MRT).
const BLUR4_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D t0, t1, t2, t3, t4;
uniform vec2 uStep;
uniform int uR;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
layout(location = 4) out vec4 o4;
void main() {
    vec4 a = vec4(0.0), b = vec4(0.0), c = vec4(0.0), e = vec4(0.0), f = vec4(0.0);
    for (int i = -24; i <= 24; i++) {
        if (i < -uR || i > uR) continue;
        vec2 uv = v_uv + uStep * float(i);
        a += texture(t0, uv); b += texture(t1, uv); c += texture(t2, uv); e += texture(t3, uv); f += texture(t4, uv);
    }
    float n = 1.0 / float(2 * uR + 1);
    o0 = a * n; o1 = b * n; o2 = c * n; o3 = e * n; o4 = f * n;
}`;

const BLUR1_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D t0;
uniform vec2 uStep;
uniform int uR;
out vec4 o0;
void main() {
    vec4 a = vec4(0.0);
    for (int i = -24; i <= 24; i++) {
        if (i < -uR || i > uR) continue;
        a += texture(t0, v_uv + uStep * float(i));
    }
    o0 = a / float(2 * uR + 1);
}`;

// Hệ số guided filter màu: a = (Σ + εI)⁻¹ · cov(I, p), b = mean(p) − a·mean(I).
const COEF_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D t0, t1, t2, t3;
uniform float uEps;
out vec4 o0;
void main() {
    vec4 B0 = texture(t0, v_uv), B1 = texture(t1, v_uv), B2 = texture(t2, v_uv), B3 = texture(t3, v_uv);
    vec3 mI = B0.rgb; float mp = B0.a;
    float rr = B2.r - mI.r * mI.r + uEps, rg = B2.g - mI.r * mI.g, rb = B2.b - mI.r * mI.b;
    float gg = B2.a - mI.g * mI.g + uEps, gb = B3.r - mI.g * mI.b, bb = B3.g - mI.b * mI.b + uEps;
    vec3 cov = B1.rgb - mI * mp;
    mat3 S = mat3(rr, rg, rb, rg, gg, gb, rb, gb, bb);
    vec3 a = inverse(S) * cov;
    o0 = vec4(a, mp - dot(a, mI));
}`;

// Ra màn: phóng hệ số (nội suy tay - tấm float không chắc lọc tuyến tính được), tính alpha, khử viền nền.
const FINAL_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D uFrame, uCoef, uB4;
uniform vec2 uLowSize;
uniform float uLo, uHi, uDecon, uSplit, uRaw;
uniform int uView;
${MASK_FN}
out vec4 o0;
vec4 bil(sampler2D t, vec2 uv) {
    vec2 p = uv * uLowSize - 0.5;
    vec2 f = fract(p);
    ivec2 i = ivec2(floor(p));
    ivec2 mx = ivec2(uLowSize) - 1;
    vec4 a = texelFetch(t, clamp(i, ivec2(0), mx), 0);
    vec4 b = texelFetch(t, clamp(i + ivec2(1, 0), ivec2(0), mx), 0);
    vec4 c = texelFetch(t, clamp(i + ivec2(0, 1), ivec2(0), mx), 0);
    vec4 d = texelFetch(t, clamp(i + ivec2(1, 1), ivec2(0), mx), 0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);   // khung ra màn đánh số từ dưới lên, ảnh từ trên xuống
    vec3 I = texture(uFrame, uv).rgb;
    float raw = maskAt(uv);
    float al;
    vec3 C = I;
    if (uRaw > 0.5 || uv.x < uSplit) {
        al = smoothstep(0.45, 0.55, raw);   // như lọc nền thường: cắt cứng quanh 0.5, không làm mịn
    } else {
        vec4 ab = bil(uCoef, uv);
        float q = dot(ab.rgb, I - 0.5) + ab.a;
        al = smoothstep(uLo, uHi, q);
        vec4 f4 = bil(uB4, uv);
        if (f4.a > 0.01) {
            vec3 F = clamp(f4.rgb / f4.a + 0.5, 0.0, 1.0);   // màu LÕI người quanh đây (không lẫn nền)
            // Mép nửa trong suốt mang màu nền cũ → kéo về màu lõi; giữ độ sáng gốc để sợi tóc không bết.
            vec3 Fl = F * (dot(I, vec3(0.299, 0.587, 0.114)) + 0.02) / (dot(F, vec3(0.299, 0.587, 0.114)) + 0.02);
            C = mix(I, clamp(mix(F, Fl, 0.5), 0.0, 1.0), uDecon * (1.0 - smoothstep(0.82, 1.0, al)));
        }
    }
    if (uView == 1) o0 = vec4(vec3(al), 1.0);
    else if (uView == 2) o0 = vec4(vec3(raw), 1.0);
    else o0 = vec4(C * al, al);
}`;

export const MATTE_DEFAULTS = {
    work: 512,       // cạnh dài ảnh thấp để tính guided filter (px)
    radius: 6,       // bán kính lọc ở ảnh thấp - lớn: viền theo mép ảnh xa hơn
    eps: 0.003,      // nhỏ: bám mép ảnh sát hơn (chi tiết) · lớn: mượt hơn
    lo: 0.28, hi: 0.72,   // độ cứng viền: khoảng alpha chuyển từ nền sang người
    still: 0.3,      // chỗ đứng yên: trộn bao nhiêu mặt nạ mới mỗi khung (nhỏ = chống rung mạnh)
    motionLo: 0.015, motionHi: 0.08,   // mức đổi sáng coi là "đang cử động"
    decon: 0.7,      // khử viền nền 0..1
    view: 0,         // 0 người đã tách · 1 alpha · 2 mặt nạ thô
    split: -1,       // 0..1: nửa trái = cắt thường (để so), nửa phải = tách mịn
    raw: false       // tắt hẳn làm mịn (cắt thường)
};

export class HpMatte {
    constructor({ canvas } = {}) {
        this.canvas = canvas || document.createElement('canvas');
        const gl = this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, depth: false, stencil: false });
        // 3 lỗi này hiện lên bảng / cảnh báo của Bộ Tách Người (matteErr) → dịch. Lỗi shader/FBO có tiền tố [hp-matte] là cho dev.
        if (!gl) throw new Error(hpT('Máy không có WebGL2'));
        if (!gl.getExtension('EXT_color_buffer_float')) throw new Error(hpT('GPU không hỗ trợ EXT_color_buffer_float'));
        if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 5) throw new Error(hpT('GPU không đủ 5 đích vẽ cùng lúc'));
        this.p = {
            prep: this._prog(PREP_FS), blur4: this._prog(BLUR4_FS), blur1: this._prog(BLUR1_FS),
            coef: this._prog(COEF_FS), final: this._prog(FINAL_FS)
        };
        this.vao = gl.createVertexArray();
        this.frameTex = this._tex(gl.LINEAR);
        this.maskTex = this._tex(gl.LINEAR);
        this.low = null; this.cur = 0; this.hasPrev = false;
        this.ms = 0;
    }

    _prog(fs) {
        const gl = this.gl;
        const mk = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('[hp-matte] shader: ' + gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[hp-matte] link: ' + gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
        return { p, u };
    }
    _tex(filter) {
        const gl = this.gl, t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }
    // n tấm float32 cùng cỡ gắn vào 1 FBO (MRT).
    _set(n, w, h) {
        const gl = this.gl, fb = gl.createFramebuffer(), tex = [];
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        for (let i = 0; i < n; i++) {
            const t = this._tex(gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
            tex.push(t);
        }
        gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('[hp-matte] FBO chưa đủ');
        return { fb, tex };
    }
    _freeLow() {
        const gl = this.gl, L = this.low;
        if (!L) return;
        for (const s of [L.prep[0], L.prep[1], L.tmp, L.blur, L.coef, L.coefTmp, L.coefBlur]) { s.tex.forEach(t => gl.deleteTexture(t)); gl.deleteFramebuffer(s.fb); }
        this.low = null;
    }
    _ensureLow(fw, fh, work) {
        const k = Math.min(1, work / Math.max(fw, fh));
        const w = Math.max(8, Math.round(fw * k)), h = Math.max(8, Math.round(fh * k));
        if (this.low && this.low.w === w && this.low.h === h) return this.low;
        this._freeLow();
        this.low = {
            w, h,
            prep: [this._set(5, w, h), this._set(5, w, h)], tmp: this._set(5, w, h), blur: this._set(5, w, h),
            coef: this._set(1, w, h), coefTmp: this._set(1, w, h), coefBlur: this._set(1, w, h)
        };
        this.hasPrev = false;
        return this.low;
    }
    _bindTex(prog, name, unit, tex) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
        if (prog.u[name]) gl.uniform1i(prog.u[name], unit);
    }
    _draw(target, w, h) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // Quên khung trước (đổi nguồn / cắt cảnh) - tránh trộn mặt nạ của cảnh cũ.
    reset() { this.hasPrev = false; }

    /**
     * @param {TexImageSource} img  khung camera (ImageBitmap / video / canvas)
     * @param {number} fw, fh      cỡ khung
     * @param {{data:Uint8Array,w:number,h:number,rect:number[]}} mask  độ tin người 0..255, rect = vùng trong ảnh (0..1)
     */
    render(img, fw, fh, mask, opts = {}) {
        const o = { ...MATTE_DEFAULTS, ...opts };
        const gl = this.gl, t0 = performance.now();
        if (this.canvas.width !== fw || this.canvas.height !== fh) { this.canvas.width = fw; this.canvas.height = fh; }
        const L = this._ensureLow(fw, fh, o.work);
        gl.bindVertexArray(this.vao);
        gl.disable(gl.BLEND);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.w, mask.h, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
        const rect = mask.rect || [0, 0, 1, 1];

        // 1. ảnh thấp + mặt nạ lọc theo thời gian + các tích cho guided filter
        const cur = L.prep[this.cur], prev = L.prep[1 - this.cur];
        let P = this.p.prep;
        gl.useProgram(P.p);
        this._bindTex(P, 'uFrame', 0, this.frameTex);
        this._bindTex(P, 'uMask', 1, this.maskTex);
        this._bindTex(P, 'uPrev', 2, prev.tex[3]);
        gl.uniform4f(P.u.uRect, rect[0], rect[1], rect[2], rect[3]);
        gl.uniform2f(P.u.uLowTexel, 1 / L.w, 1 / L.h);
        gl.uniform1f(P.u.uHasPrev, this.hasPrev ? 1 : 0);
        gl.uniform1f(P.u.uStill, o.still);
        gl.uniform2f(P.u.uMotion, o.motionLo, o.motionHi);
        this._draw(cur, L.w, L.h);
        this.cur = 1 - this.cur; this.hasPrev = true;

        // 2. trung bình hộp (ngang rồi dọc)
        const r = Math.max(1, Math.min(24, Math.round(o.radius)));
        P = this.p.blur4;
        gl.useProgram(P.p);
        gl.uniform1i(P.u.uR, r);
        const blur4 = (src, dst, sx, sy) => {
            src.tex.forEach((t, i) => this._bindTex(P, 't' + i, i, t));
            gl.uniform2f(P.u.uStep, sx, sy);
            this._draw(dst, L.w, L.h);
        };
        blur4(cur, L.tmp, 1 / L.w, 0);
        blur4(L.tmp, L.blur, 0, 1 / L.h);

        // 3. hệ số a, b rồi trung bình chúng
        P = this.p.coef;
        gl.useProgram(P.p);
        L.blur.tex.slice(0, 4).forEach((t, i) => this._bindTex(P, 't' + i, i, t));
        gl.uniform1f(P.u.uEps, o.eps);
        this._draw(L.coef, L.w, L.h);
        P = this.p.blur1;
        gl.useProgram(P.p);
        gl.uniform1i(P.u.uR, r);
        this._bindTex(P, 't0', 0, L.coef.tex[0]); gl.uniform2f(P.u.uStep, 1 / L.w, 0); this._draw(L.coefTmp, L.w, L.h);
        this._bindTex(P, 't0', 0, L.coefTmp.tex[0]); gl.uniform2f(P.u.uStep, 0, 1 / L.h); this._draw(L.coefBlur, L.w, L.h);

        // 4. ra màn đủ độ phân giải
        P = this.p.final;
        gl.useProgram(P.p);
        this._bindTex(P, 'uFrame', 0, this.frameTex);
        this._bindTex(P, 'uCoef', 1, L.coefBlur.tex[0]);
        this._bindTex(P, 'uB4', 2, L.blur.tex[4]);
        this._bindTex(P, 'uMask', 4, this.maskTex);
        gl.uniform4f(P.u.uRect, rect[0], rect[1], rect[2], rect[3]);
        gl.uniform2f(P.u.uLowSize, L.w, L.h);
        gl.uniform1f(P.u.uLo, Math.min(o.lo, o.hi - 0.01));
        gl.uniform1f(P.u.uHi, o.hi);
        gl.uniform1f(P.u.uDecon, o.decon);
        gl.uniform1f(P.u.uSplit, o.split);
        gl.uniform1f(P.u.uRaw, o.raw ? 1 : 0);
        gl.uniform1i(P.u.uView, o.view | 0);
        gl.clearColor(0, 0, 0, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this._draw(null, fw, fh);
        this.ms = this.ms * 0.85 + (performance.now() - t0) * 0.15;
        return this.canvas;
    }

    dispose() {
        this._freeLow();
        const gl = this.gl;
        gl.deleteTexture(this.frameTex); gl.deleteTexture(this.maskTex);
        for (const k in this.p) gl.deleteProgram(this.p[k].p);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}
