/* 🎞 Đổi video TRONG SUỐT webm (VP9 / VP8 alpha) → mp4 H.264 "xếp cặp" (….pack.mp4) NGAY TRONG panel bằng WebCodecs - bản cài
 * của app không có ffmpeg. Cùng định dạng với scripts/pack-alpha.cjs: một khung = nửa TRÁI màu + nửa PHẢI kênh alpha dạng xám
 * (1080×1920 → 2160×1920); overlay ghép lại bằng alpha-pack.mjs.
 * - Tự tách webm (EBML): màu = Block, alpha = BlockAdditional (BlockAddID 1) - một luồng VP8/VP9 riêng, giải mã bằng VideoDecoder
 *   thứ hai (WebCodecs không tự ghép alpha). Giải mã phần mềm (libvpx) - ra khung ngay, đúng thứ tự, không giữ khung chờ.
 * - Ghép thẳng trên mặt phẳng I420 (không qua RGB): nửa trái = Y/U/V gốc; nửa phải Y = 16 + a·219/255 (xám limited range y như
 *   ffmpeg rgb24 → yuv420p), U/V = 128 → bộ giải mã đọc lại R = a.
 * - Tiếng: Opus / Vorbis giải mã rồi nén AAC (mp4 chuẩn, OBS phát được); không có bộ nén AAC → giữ gói Opus. Lỗi tiếng = bỏ tiếng, không bỏ video.
 * - H.264: để trình duyệt chọn (phần cứng Media Foundation nếu có); lỗi giữa chừng → chạy lại bằng phần mềm (OpenH264).
 * .mov (qtrle / ProRes 4444) trình duyệt không giải mã được → vẫn phải đổi bằng scripts/pack-alpha.cjs (ffmpeg).
 * Lỗi ném ra có .code: 'webcodecs' | 'format' | 'noalpha' | 'codec' | 'size' | 'decode' | 'encode' | 'stall'. */
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';

export const canPack = () => typeof VideoDecoder === 'function' && typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
export const packedName = name => String(name || 'video').replace(/\.[^.\\/]+$/, '') + '.pack.mp4';
// Trần giải mã H.264 phần cứng phổ biến (cũng là lý do chọn xếp CẠNH NHAU - alpha-pack.mjs).
const MAX_W = 4096, MAX_H = 2304;

const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

// ───────────── WebM / Matroska (EBML) - chỉ đọc phần cần ─────────────
const E = {
    SEGMENT: 0x18538067, INFO: 0x1549A966, SCALE: 0x2AD7B1, DURATION: 0x4489, TRACKS: 0x1654AE6B, ENTRY: 0xAE, NUM: 0xD7, TYPE: 0x83,
    CODEC: 0x86, PRIV: 0x63A2, DEFDUR: 0x23E383, VIDEO: 0xE0, PW: 0xB0, PH: 0xBA, ALPHA: 0x53C0, AUDIO: 0xE1, RATE: 0xB5, CH: 0x9F,
    CLUSTER: 0x1F43B675, TC: 0xE7, SIMPLE: 0xA3, GROUP: 0xA0, BLOCK: 0xA1, ADDS: 0x75A1, MORE: 0xA6, ADDID: 0xEE, ADD: 0xA5, REF: 0xFB,
};
// Phần tử cấp Segment: gặp chúng trong Cluster cỡ "không rõ" (webm ghi trực tiếp) = Cluster đã hết.
const TOP = new Set([E.CLUSTER, 0x1C53BB6B, 0x1254C367, 0x1941A469, 0x1043A770, 0x114D9B74, E.INFO, E.TRACKS]);

function readId(u8, p) {
    const b = u8[p];
    let len = 1;
    while (len <= 4 && !(b & (0x80 >> (len - 1)))) len++;
    if (len > 4 || p + len > u8.length) return null;
    let v = 0;
    for (let i = 0; i < len; i++) v = v * 256 + u8[p + i];
    return [v, len];
}
function readVint(u8, p) {
    const b = u8[p];
    let len = 1;
    while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++;
    if (len > 8 || p + len > u8.length) return null;
    const m = (0x80 >> (len - 1)) - 1;
    let v = b & m, ones = v === m;
    for (let i = 1; i < len; i++) { v = v * 256 + u8[p + i]; if (u8[p + i] !== 255) ones = false; }
    return [ones ? -1 : v, len];
}
const readUint = (u8, s, e) => { let v = 0; for (let i = s; i < e; i++) v = v * 256 + u8[i]; return v; };
const readFloat = (dv, s, e) => e - s === 4 ? dv.getFloat32(s) : e - s === 8 ? dv.getFloat64(s) : 0;

// Duyệt con trong [s, e): fn(id, ds, de, unknown, p) - de = cuối phần tử (cỡ "không rõ" → tới hết cha), p = đầu phần tử; fn trả
// số = vị trí đọc tiếp. Dừng êm khi file bị cắt (dò đầu file).
function each(u8, s, e, fn) {
    let p = s;
    while (p < e) {
        const id = readId(u8, p); if (!id) return;
        const sz = readVint(u8, p + id[1]); if (!sz) return;
        const ds = p + id[1] + sz[1];
        if (ds > u8.length) return;
        const de = sz[0] < 0 ? -1 : Math.min(ds + sz[0], u8.length);
        const next = fn(id[0], ds, de < 0 ? e : de, de < 0, p);
        p = typeof next === 'number' ? next : de < 0 ? e : de;
    }
}

// Tách webm trong bộ nhớ → { video, audio, vFrames: [{ ts µs, key, data, add }], aFrames, durUs }. Bỏ qua mọi thứ không cần.
export function demuxWebm(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let scale = 1e6, durTicks = 0;
    const tracks = new Map(), blocks = [];
    const parseTrack = (s, e) => {
        const t = { num: 0, type: 0, codec: '', priv: null, defDur: 0, w: 0, h: 0, alpha: false, rate: 0, ch: 0 };
        each(u8, s, e, (id, ds, de) => {
            if (id === E.NUM) t.num = readUint(u8, ds, de);
            else if (id === E.TYPE) t.type = readUint(u8, ds, de);
            else if (id === E.CODEC) t.codec = new TextDecoder().decode(u8.subarray(ds, de)).replace(/\0+$/, '');
            else if (id === E.PRIV) t.priv = u8.slice(ds, de);
            else if (id === E.DEFDUR) t.defDur = readUint(u8, ds, de);
            else if (id === E.VIDEO) each(u8, ds, de, (i2, s2, e2) => {
                if (i2 === E.PW) t.w = readUint(u8, s2, e2); else if (i2 === E.PH) t.h = readUint(u8, s2, e2);
                else if (i2 === E.ALPHA) t.alpha = readUint(u8, s2, e2) === 1;
            });
            else if (id === E.AUDIO) each(u8, ds, de, (i2, s2, e2) => {
                if (i2 === E.RATE) t.rate = readFloat(dv, s2, e2); else if (i2 === E.CH) t.ch = readUint(u8, s2, e2);
            });
        });
        if (t.num) tracks.set(t.num, t);
    };
    const addBlock = (s, e, tc, simple, hasRef, add) => {
        const tn = readVint(u8, s); if (!tn || s + tn[1] + 3 > e) return;
        let p = s + tn[1];
        const t = tc + dv.getInt16(p), flags = u8[p + 2];
        p += 3;
        const key = simple ? !!(flags & 0x80) : !hasRef, lacing = (flags >> 1) & 3;
        if (!lacing) { blocks.push({ track: tn[0], t, lace: 0, key, data: u8.subarray(p, e), add }); return; }
        // Gói ghép (lacing) - gặp ở tiếng; video gần như không bao giờ.
        const n = u8[p++] + 1, sizes = [];
        if (lacing === 1) for (let i = 0; i < n - 1; i++) { let v = 0, b; do { b = u8[p++]; v += b; } while (b === 255); sizes.push(v); }
        else if (lacing === 3) {
            let r = readVint(u8, p); p += r[1]; sizes.push(r[0]);
            for (let i = 1; i < n - 1; i++) { r = readVint(u8, p); p += r[1]; sizes.push(sizes[i - 1] + r[0] - (2 ** (7 * r[1] - 1) - 1)); }
        }
        if (lacing === 2) { const each1 = Math.floor((e - p) / n); for (let i = 0; i < n; i++) sizes.push(each1); }
        else sizes.push(e - p - sizes.reduce((a, b) => a + b, 0));
        for (let i = 0; i < n; i++) { blocks.push({ track: tn[0], t, lace: i, key: true, data: u8.subarray(p, p + sizes[i]), add: null }); p += sizes[i]; }
    };
    const parseCluster = (s, e, unknown) => {
        let tc = 0, end = e;
        each(u8, s, e, (id, ds, de, _u, p) => {
            if (unknown && TOP.has(id)) { end = p; return e; }   // dừng: phần tử này thuộc Segment
            if (id === E.TC) tc = readUint(u8, ds, de);
            else if (id === E.SIMPLE) addBlock(ds, de, tc, true, false, null);
            else if (id === E.GROUP) {
                let bs = -1, be = -1, ref = false, add = null;
                each(u8, ds, de, (i2, s2, e2) => {
                    if (i2 === E.BLOCK) { bs = s2; be = e2; }
                    else if (i2 === E.REF) ref = true;
                    else if (i2 === E.ADDS) each(u8, s2, e2, (i3, s3, e3) => {
                        if (i3 !== E.MORE) return;
                        let aid = 1, data = null;
                        each(u8, s3, e3, (i4, s4, e4) => { if (i4 === E.ADDID) aid = readUint(u8, s4, e4); else if (i4 === E.ADD) data = u8.subarray(s4, e4); });
                        if (aid === 1 && data) add = data;
                    });
                });
                if (bs >= 0) addBlock(bs, be, tc, false, ref, add);
            }
        });
        return end;
    };
    each(u8, 0, u8.length, (id, ds, de) => {
        if (id !== E.SEGMENT) return;
        let p = ds;
        while (p < de) {
            const idr = readId(u8, p); if (!idr) break;
            const sz = readVint(u8, p + idr[1]); if (!sz) break;
            const cs = p + idr[1] + sz[1];
            if (cs > u8.length) break;
            const unknown = sz[0] < 0, ce = unknown ? de : Math.min(cs + sz[0], u8.length);
            if (idr[0] === E.INFO) each(u8, cs, ce, (i2, s2, e2) => {
                if (i2 === E.SCALE) scale = readUint(u8, s2, e2) || 1e6; else if (i2 === E.DURATION) durTicks = readFloat(dv, s2, e2);
            });
            else if (idr[0] === E.TRACKS) each(u8, cs, ce, (i2, s2, e2) => { if (i2 === E.ENTRY) parseTrack(s2, e2); });
            // Cluster "không rõ cỡ" (webm ghi trực tiếp): đọc tiếp từ phần tử cấp Segment đầu tiên gặp trong nó.
            if (idr[0] === E.CLUSTER) p = parseCluster(cs, ce, unknown);
            else p = ce;
        }
        return de;
    });
    const all = [...tracks.values()];
    const video = all.find(t => t.type === 1 && /^V_VP[89]$/.test(t.codec)) || all.find(t => t.type === 1) || null;
    const audio = all.find(t => t.type === 2) || null;
    const us = t => Math.round(t * scale / 1000);
    const toFrames = tr => !tr ? [] : blocks.filter(b => b.track === tr.num)
        .map(b => ({ ts: us(b.t) + (b.lace ? Math.round(b.lace * (tr.defDur || 20e6) / 1000) : 0), key: b.key, data: b.data, add: b.add }));
    return { video, audio, vFrames: toFrames(video), aFrames: toFrames(audio), durUs: us(durTicks) };
}
// webm có kênh alpha? Chỉ đọc 2 MB đầu (Tracks + vài Cluster) - thả file 300 MB không phải đọc hết.
export async function isAlphaWebm(file) {
    try {
        const m = demuxWebm(await file.slice(0, 2 * 1048576).arrayBuffer());
        return !!(m.video && /^V_VP[89]$/.test(m.video.codec) && (m.video.alpha || m.vFrames.some(f => f.add)));
    } catch (_) { return false; }
}

// VP9: profile nằm ở 2 bit đầu khung (sau frame_marker). Chỉ nhận 8-bit 4:2:0 (profile 0) - 10/12-bit trình duyệt ra khung khác.
function vpCodec(track, first) {
    if (track.codec === 'V_VP8') return 'vp8';
    if (track.codec !== 'V_VP9') throw fail('codec', track.codec);
    const b = first ? first[0] : 0x80, profile = ((b >> 5) & 1) | (((b >> 4) & 1) << 1);
    if (profile !== 0) throw fail('codec', 'VP9 profile ' + profile);
    return 'vp09.00.41.08';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const COLR_OK = { primaries: ['bt709', 'bt470bg', 'smpte170m'], transfer: ['bt709', 'smpte170m', 'iec61966-2-1'], matrix: ['rgb', 'bt709', 'bt470bg', 'smpte170m'] };
const colrOk = cs => cs && COLR_OK.primaries.includes(cs.primaries) && COLR_OK.transfer.includes(cs.transfer) && COLR_OK.matrix.includes(cs.matrix);
// Y của nửa alpha: xám limited range (= ffmpeg gray → rgb24 → yuv420p) để bộ giải mã trả R đúng bằng alpha.
const ALPHA_Y = new Uint8Array(256).map((_, a) => Math.round(16 + a * 219 / 255));

// Tiếng: ưu tiên AAC (mp4 chuẩn - OBS / mọi trình duyệt phát được): Opus / Vorbis giải mã bằng WebCodecs rồi nén AAC. Không nén
// được AAC → Opus giữ nguyên gói (mp4 nhận Opus, Chromium phát được), Vorbis bỏ tiếng. Trả { opts (Muxer audio), chunks } hoặc null.
async function prepAudio(m) {
    const a = m.audio;
    if (!a || !m.aFrames.length) return null;
    const isOpus = a.codec === 'A_OPUS', isVorbis = a.codec === 'A_VORBIS';
    if (!isOpus && !isVorbis) return null;
    const fr = m.aFrames, gaps = fr.slice(1).map((f, i) => f.ts - fr[i].ts);
    const durOf = i => Math.max(1, gaps[i] ?? gaps[i - 1] ?? 20000);
    const rate = isOpus ? 48000 : Math.round(a.rate || 48000);
    const ch = a.ch || (isOpus && a.priv && a.priv.length > 9 ? a.priv[9] : 2);
    const priv = a.priv && (isVorbis || a.priv.length >= 19) ? { description: a.priv } : {};
    if (typeof AudioDecoder === 'function' && typeof AudioEncoder === 'function' && (isOpus || a.priv)) {
        const aac = await transcodeAac(fr, durOf, { codec: isOpus ? 'opus' : 'vorbis', sampleRate: rate, numberOfChannels: ch, ...priv }).catch(() => null);
        if (aac) return aac;
    }
    if (!isOpus) return null;
    const decoderConfig = { codec: 'opus', sampleRate: 48000, numberOfChannels: ch, ...priv };
    return { opts: { codec: 'opus', numberOfChannels: ch, sampleRate: 48000 }, chunks: fr.map((f, i) => ({ data: f.data, ts: f.ts, dur: durOf(i), meta: i ? undefined : { decoderConfig } })) };
}
async function transcodeAac(fr, durOf, decCfg) {
    const enc = { codec: 'mp4a.40.2', sampleRate: decCfg.sampleRate, numberOfChannels: decCfg.numberOfChannels, bitrate: 128000 };
    if (!(await AudioEncoder.isConfigSupported(enc)).supported || !(await AudioDecoder.isConfigSupported(decCfg)).supported) return null;
    const chunks = [];
    let err = null;
    const ae = new AudioEncoder({
        output: (c, meta) => { const d = new Uint8Array(c.byteLength); c.copyTo(d); chunks.push({ data: d, ts: c.timestamp, dur: c.duration || 0, meta: chunks.length ? undefined : meta }); },
        error: e => { err = e; },
    });
    ae.configure(enc);
    const ad = new AudioDecoder({ output: d => { if (!err) ae.encode(d); d.close(); }, error: e => { err = e; } });
    ad.configure(decCfg);
    for (const [i, f] of fr.entries()) { if (err) break; ad.decode(new EncodedAudioChunk({ type: 'key', timestamp: f.ts, duration: durOf(i), data: f.data })); }
    if (!err) { await ad.flush(); await ae.flush(); }
    try { ad.close(); ae.close(); } catch (_) {}
    if (err || !chunks.length || !chunks[0].meta?.decoderConfig) return null;
    return { opts: { codec: 'aac', numberOfChannels: enc.numberOfChannels, sampleRate: enc.sampleRate }, chunks };
}

async function pickEncoder(w, h, bitrate, framerate, hw) {
    for (const codec of ['avc1.640033', 'avc1.4d0033', 'avc1.42e033']) {
        const c = { codec, width: w, height: h, bitrate, framerate, bitrateMode: 'variable', hardwareAcceleration: hw, avc: { format: 'avc' } };
        try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (_) {}
    }
    throw fail('encode', 'H.264 encoder not supported');
}

// Một lượt đổi (hw = 'no-preference' | 'prefer-software'). onProgress(0…1).
async function run(m, hw, srcBytes, onProgress) {
    const vt = m.video, frames = m.vFrames, total = frames.length;
    const codec = vpCodec(vt, frames.find(f => f.key)?.data);
    const W = vt.w, H = vt.h;
    const HW = W + (W & 1), HH = H + (H & 1), PW = HW * 2;
    if (PW > MAX_W || HH > MAX_H) throw fail('size', `${W}×${H}`);
    const lastTs = frames[total - 1].ts, durUs = Math.max(m.durUs, lastTs + 1);
    const fps = total > 1 ? Math.min(120, Math.max(1, (total - 1) / ((lastTs - frames[0].ts) / 1e6))) : 30;
    // Bitrate ≈ webm gốc (đã gồm kênh alpha; đo: sai số Y/U/V < 1/255, tốt hơn x264 crf 20) - kẹp 4–16 Mbps (viền alpha cần đủ bit).
    const bitrate = Math.round(Math.min(16e6, Math.max(4e6, srcBytes * 8 / (durUs / 1e6))));
    const encCfg = await pickEncoder(PW, HH, bitrate, Math.round(fps), hw);
    const audio = await prepAudio(m).catch(() => null);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: 'avc', width: PW, height: HH, frameRate: Math.round(fps) }, ...(audio ? { audio: audio.opts } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'cross-track-offset' });
    const t0 = Math.min(frames[0].ts, audio ? audio.chunks[0].ts : Infinity, 0);   // mp4 không nhận mốc âm → dời cả hai
    if (audio) for (const c of audio.chunks) muxer.addAudioChunkRaw(c.data, 'key', c.ts - t0, c.dur, c.meta);

    let error = null, lastMove = performance.now();
    const cOut = [], aOut = [], need = [];
    const enc = new VideoEncoder({
        output: (chunk, meta) => {
            if (meta?.decoderConfig?.colorSpace && !colrOk(meta.decoderConfig.colorSpace)) meta = { ...meta, decoderConfig: { ...meta.decoderConfig, colorSpace: undefined } };
            try { muxer.addVideoChunk(chunk, meta, chunk.timestamp - t0); } catch (e) { error ||= fail('encode', e.message); }
        },
        error: e => { error ||= fail('encode', e.message); },
    });
    enc.configure(encCfg);
    const decCfg = { codec, codedWidth: W, codedHeight: H, hardwareAcceleration: 'prefer-software' };
    const mkDec = q => { const d = new VideoDecoder({ output: f => { q.push(f); lastMove = performance.now(); }, error: e => { error ||= fail('decode', e.message); } }); d.configure(decCfg); return d; };
    const cdec = mkDec(cOut), adec = mkDec(aOut);

    const out = new Uint8Array(PW * HH * 3 / 2);
    out.fill(16, 0, PW * HH); out.fill(128, PW * HH);   // phần đệm (cạnh lẻ): trái đen, phải alpha 0; chroma trung tính
    const uOff = PW * HH, pcw = PW / 2, vOff = uOff + pcw * (HH / 2), cw = HW / 2, chh = Math.ceil(H / 2);
    let tmpC = null, tmpA = null, cs = null, done = 0;
    const gop = Math.max(10, Math.min(60, Math.round(fps)));
    async function compose(c, a) {
        const sc = c.allocationSize();
        if (!tmpC || tmpC.length < sc) tmpC = new Uint8Array(sc);
        const L = await c.copyTo(tmpC), fmt = c.format;
        if (!/^(I420A?|NV12)$/.test(fmt || '')) throw fail('codec', 'format ' + fmt);
        const w = Math.min(W, c.visibleRect.width), h = Math.min(H, c.visibleRect.height);
        for (let y = 0; y < h; y++) out.set(tmpC.subarray(L[0].offset + y * L[0].stride, L[0].offset + y * L[0].stride + w), y * PW);
        const cww = Math.ceil(w / 2), chh2 = Math.min(chh, Math.ceil(h / 2));
        if (fmt === 'NV12') {
            for (let y = 0; y < chh2; y++) {
                const s = L[1].offset + y * L[1].stride, d = y * pcw;
                for (let x = 0; x < cww; x++) { out[uOff + d + x] = tmpC[s + 2 * x]; out[vOff + d + x] = tmpC[s + 2 * x + 1]; }
            }
        } else for (let y = 0; y < chh2; y++) {
            out.set(tmpC.subarray(L[1].offset + y * L[1].stride, L[1].offset + y * L[1].stride + cww), uOff + y * pcw);
            out.set(tmpC.subarray(L[2].offset + y * L[2].stride, L[2].offset + y * L[2].stride + cww), vOff + y * pcw);
        }
        if (a) {
            const sa = a.allocationSize();
            if (!tmpA || tmpA.length < sa) tmpA = new Uint8Array(sa);
            const LA = await a.copyTo(tmpA), aw = Math.min(w, a.visibleRect.width), ah = Math.min(h, a.visibleRect.height);
            for (let y = 0; y < ah; y++) {
                const s = LA[0].offset + y * LA[0].stride, d = y * PW + HW;
                for (let x = 0; x < aw; x++) out[d + x] = ALPHA_Y[tmpA[s + x]];
            }
        } else for (let y = 0; y < h; y++) out.fill(235, y * PW + HW, y * PW + HW + w);   // khung thiếu alpha = đặc
        if (!cs) { const j = c.colorSpace?.toJSON?.() || {}; cs = Object.fromEntries(Object.entries(j).filter(([, v]) => v != null)); }
        const vf = new VideoFrame(out, { format: 'I420', codedWidth: PW, codedHeight: HH, timestamp: c.timestamp, ...(c.duration ? { duration: c.duration } : {}), colorSpace: cs });
        enc.encode(vf, { keyFrame: done % gop === 0 });
        vf.close();
        done++; lastMove = performance.now();
        onProgress(done / total);
    }
    async function drain() {
        while (!error && cOut.length && (need[0] === false || aOut.length)) {
            const c = cOut.shift(), hasA = need.shift(), a = hasA ? aOut.shift() : null;
            try { await compose(c, a); } finally { c.close(); a?.close(); }
        }
    }
    const busy = () => cdec.decodeQueueSize + cOut.length > 3 || adec.decodeQueueSize + aOut.length > 3 || enc.encodeQueueSize > 3;
    try {
        let alphaOn = false;
        for (let i = 0; i < total && !error; i++) {
            const f = frames[i];
            await drain();
            while (!error && busy()) {
                await sleep(2); await drain();
                if (performance.now() - lastMove > 15000) throw fail('stall');
            }
            if (error) break;
            cdec.decode(new EncodedVideoChunk({ type: f.key ? 'key' : 'delta', timestamp: f.ts, data: f.data }));
            // Luồng alpha bắt đầu ở khung khoá đầu tiên có alpha; mất alpha giữa chừng → các khung sau coi là đặc (không vỡ bộ giải mã).
            const useA = !!f.add && (alphaOn || f.key);
            if (useA) { alphaOn = true; adec.decode(new EncodedVideoChunk({ type: f.key ? 'key' : 'delta', timestamp: f.ts, data: f.add })); }
            else if (!f.add) alphaOn = false;
            need.push(useA);
        }
        if (!error) { await Promise.all([cdec.flush(), adec.flush()]); await drain(); }
        if (!error) await enc.flush();
        if (error) throw error;
        if (done < total * 0.9) throw fail('decode', `${done}/${total} frames`);
        muxer.finalize();
        return target.buffer;
    } finally {
        for (const f of [...cOut, ...aOut]) try { f.close(); } catch (_) {}
        for (const x of [cdec, adec, enc]) try { if (x.state !== 'closed') x.close(); } catch (_) {}
    }
}

// Đổi một File webm alpha → File ….pack.mp4. onProgress(0…1) theo số khung đã ghép.
export async function packAlphaWebm(file, { onProgress = () => {} } = {}) {
    if (!canPack()) throw fail('webcodecs');
    const m = demuxWebm(await file.arrayBuffer());
    if (!m.video || !m.vFrames.length) throw fail('format');
    if (!m.vFrames.some(f => f.add)) throw fail('noalpha');
    if (!m.vFrames[0].key) throw fail('format', 'first frame not key');
    let buf;
    try { buf = await run(m, 'no-preference', file.size, onProgress); }
    catch (e) {
        if (e.code !== 'encode' && e.code !== 'stall') throw e;
        onProgress(0);   // bộ nén phần cứng hỏng giữa chừng → làm lại bằng phần mềm
        buf = await run(m, 'prefer-software', file.size, onProgress);
    }
    return new File([buf], packedName(file.name), { type: 'video/mp4' });
}
