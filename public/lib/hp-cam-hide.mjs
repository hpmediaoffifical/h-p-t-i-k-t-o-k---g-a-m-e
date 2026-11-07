/* 📷 ẨN CAM GỐC + NỀN PHÒNG - dùng chung cho mọi game 🎥 Game Camera VẼ LẠI NGƯỜI (🦊 Hậu Cảnh NPC, 🕳️ Rơi Hố, 🏃 Bị Đuổi…).
 *
 * VẤN ĐỀ: overlay vẽ lại người tách nền TRỄ 1–3 khung so với camera gốc bên dưới → thấy tay / chân đôi, và người không thể
 * "biến mất" (rơi hố, chạy khỏi màn) vì camera gốc vẫn hiện.
 * CÁCH LÀM (đã thử OBS thật 2026-10-17):
 *   - KHÔNG ẩn nguồn camera (nguồn video NPC bị ẩn thì OBS dừng phát; camera có thể tắt) và KHÔNG làm trong suốt bằng filter
 *     (GetSourceScreenshot chụp CẢ filter → tracking mất hình).
 *   - Server DỜI scene item camera ra xa ngoài khung OBS (lib/camgames-server.cjs, sự kiện 'camgames:camhide'): nguồn vẫn
 *     "đang hiện" → vẫn phát, vẫn chụp được; bố cục camera được ghim (feed.pinLayout) để overlay vẫn biết chỗ cũ.
 *   - Overlay tự vẽ lại phần camera đã mất:
 *       'raw'   = khung camera GỐC của đúng ảnh model vừa tách → người + phòng khớp tuyệt đối (người đứng yên tại chỗ: Hậu Cảnh)
 *       'plate' = phòng SẠCH (không người) tự học dần từ các khung: chỗ nào không có người thì ghi vào; chỗ người chưa từng
 *                 rời đi được lấp bằng màu kéo ngang từ hai bên (người rời chỗ: Rơi Hố, Bị Đuổi)
 *   - Overlay "giữ hợp đồng" mỗi giây; rớt kết nối 3,5 s / app tắt / khởi động lại → server tự trả camera về chỗ cũ (vị trí gốc
 *     lưu trong config TRƯỚC khi dời).
 *
 * GẮN VÀO MỘT GAME MỚI (xem docs/camgames-an-cam-goc.md):
 *   import { HpCamHide, HpRoom } from '/lib/hp-cam-hide.mjs';
 *   const room = new HpRoom();
 *   const camHide = new HpCamHide({ game: '<id game>', getSocket: () => socket, allowed: !isReview && !SRC });
 *   // sau matte.render(img, iw, ih, m, …) trong processFrame:
 *   room.update(img, iw, ih, matte.canvas, { plate: <cần phòng sạch?>, found: !!m.box });
 *   // mỗi khung vẽ (idempotent - gọi thoải mái):
 *   camHide.want(<đang chạy hiệu ứng cần ẩn cam?>);
 *   // vẽ: khi camHide.covering (đang xin ẩn HOẶC server chưa trả cam về) PHẢI tự vẽ nền dưới người:
 *   room.drawPlate(ctx, person.M, margin)  hoặc  room.drawRaw(ctx, person.M)
 *   // hết hiệu ứng mà camHide.covering vẫn true (OBS đang trả cam) → vẽ room.drawRaw + người như thường để không chớp.
 */

export class HpCamHide {
    /**
     * @param {object} o
     * @param {string} o.game          id game (báo server để ghi nhật ký / đếm người giữ)
     * @param {() => any} o.getSocket  socket.io client của overlay (đã subscribe 'overlay')
     * @param {boolean} o.allowed      false = khung thử trong panel / video thử: không bao giờ đụng OBS
     */
    constructor({ game, getSocket, allowed = true }) {
        this.game = String(game || '');
        this.getSocket = getSocket;
        this.allowed = !!allowed;
        this.wanted = false;      // overlay đang muốn ẩn
        this.hidden = false;      // server xác nhận cam gốc đang ở ngoài khung
        this.err = '';
        this.backAt = 0;
        // 📺 Trang có đang nằm trong Scene ĐANG PHÁT không (OBS bắn obsSourceActiveChanged khi đổi; null = OBS chưa báo).
        // Cùng link Game Camera dán ở NHIỀU Scene → mọi trang đều chạy lượt; trang ở Scene ẩn chạy trễ mà vẫn xin ẩn cam thì cam
        // của Scene đang phát bị dời LẦN HAI sau khi trang đang phát đã trả - không ai vẽ đè → khán giả thấy "cam về → văng đi →
        // về lại" (HP LIVE NPC e705360, 2026-11-03). Trang báo chắc chắn ĐANG ẨN thì không xin ẩn cam.
        this.onAir = null;
        const onAirEv = e => {
            const d = e && e.detail;
            const v = d && typeof d.active === 'boolean' ? d.active : d && typeof d.visible === 'boolean' && !d.visible ? false : null;
            if (v === null || v === this.onAir) return;
            this.onAir = v;
            if (!v && this.wanted) { this.wanted = false; this.backAt = performance.now(); this._ask(false); }
        };
        const wins = [window];
        try { if (window.top && window.top !== window && window.top.document) wins.push(window.top); } catch (_) {}   // khung con trong overlay mẹ: OBS bắn ở trang mẹ
        for (const w of wins) { w.addEventListener('obsSourceActiveChanged', onAirEv); w.addEventListener('obsSourceVisibleChanged', onAirEv); }
        this._t = setInterval(() => {
            if (this.wanted) this._ask(true);                                     // giữ hợp đồng
            else if (this.hidden && performance.now() - this.backAt > 2500) this.hidden = false;   // server im lặng → thôi giữ hình
        }, 1000);
    }
    // Vẽ nền thay camera từ lúc XIN ẩn (đè lên cam gốc còn hiện vài chục ms - y hệt nhau) tới lúc server xác nhận ĐÃ TRẢ.
    get covering() { return this.wanted || this.hidden; }
    want(on) {
        on = !!on && this.allowed && this.onAir !== false;
        if (on === this.wanted) return;
        this.wanted = on;
        if (!on) this.backAt = performance.now();
        if (on || this.hidden || this.allowed) this._ask(on);
    }
    _ask(hide) {
        const s = this.getSocket && this.getSocket();
        if (!s || !s.connected) { if (!hide) this.hidden = false; return; }
        s.timeout(4000).emit('camgames:camhide', { game: this.game, hide, onAir: this.onAir }, (err, r) => {
            if (err) { if (!hide) this.hidden = false; return; }
            this.hidden = !!(r && r.hidden);
            this.err = r && r.ok === false ? String(r.error || '') : '';
            if (hide && r && r.ok === false) { this.wanted = false; console.warn(`[${this.game}] không ẩn được cam gốc:`, this.err); }
        });
    }
    dispose() { clearInterval(this._t); this.want(false); }
}

// Khung camera gốc + phòng sạch. Mọi canvas ở hệ PIXEL CAMERA (cùng hệ với matte.canvas) - vẽ ra sân khấu bằng ma trận M.
export class HpRoom {
    constructor() {
        const cv = () => { const c = document.createElement('canvas'); c.width = c.height = 2; return [c, c.getContext('2d', { willReadFrequently: false })]; };
        [this.raw, this._rawCtx] = cv();
        [this.plate, this._plateCtx] = cv();
        [this._tmp, this._tmpCtx] = cv();
        [this._pm, this._pmCtx] = cv();       // mặt nạ người thu nhỏ (đọc canvas WebGL của matte MỘT lần / lượt học)
        [this._cut, this._cutCtx] = cv();     // vùng khoét (mặt nạ nhoè + dời 8 hướng + khung người) ở ảnh nhỏ
        this.fill = document.createElement('canvas'); this._fillCtx = this.fill.getContext('2d', { willReadFrequently: true });
        this.fillSoft = document.createElement('canvas'); this._fillSoftCtx = this.fillSoft.getContext('2d');
        this.hasRaw = false; this.plateAt = 0; this.fillAt = 0; this.plateFrames = 0;
    }
    _size(iw, ih) {
        if (this.raw.width === iw && this.raw.height === ih) return;
        for (const c of [this.raw, this.plate, this._tmp]) { c.width = iw; c.height = ih; }
        this.fill.width = this.fillSoft.width = Math.max(8, Math.round(iw / 8)); this.fill.height = this.fillSoft.height = Math.max(8, Math.round(ih / 8));
        this.plateFrames = 0; this.plateAt = 0; this.fillAt = 0;
    }
    /**
     * Gọi NGAY sau matte.render (img còn sống). opts.plate: cập nhật phòng sạch (tốn ~vài ms, tự giãn nhịp 150 ms);
     * opts.found: model có thấy người không (không thấy → cả khung là phòng); opts.box: [x, y, w, h] khung bao người (m.box của
     * HpPersonSeg, pixel camera) - khoét CẢ khung (nới rộng) khỏi lượt học: mặt nạ yếu ở chân / tay vung không lọt người vào phòng.
     * Đo OBS thật 2026-10-17: chỉ khoét theo mặt nạ thì NPC đứng một chỗ vài phút → mỗi khung lọt chút ít, cộng dồn thành bóng người.
     */
    update(img, iw, ih, personCanvas, opts = {}) {
        this._size(iw, ih);
        this._rawCtx.drawImage(img, 0, 0, iw, ih);
        this.hasRaw = true;
        if (!opts.plate) return;
        const now = performance.now();
        if (this.plateFrames > 10 && now - this.plateAt < 150) return;
        this.plateAt = now;
        const t = this._tmpCtx;
        t.globalCompositeOperation = 'source-over'; t.filter = 'none';
        t.clearRect(0, 0, iw, ih);
        t.drawImage(img, 0, 0, iw, ih);
        if (opts.found !== false && personCanvas) {
            // Khoét người + một viền an toàn (mặt nạ nhoè + dời 8 hướng) - mép tóc / bóng đổ không lọt vào phòng sạch.
            // Làm ở ảnh 1/CUT rồi phóng lên MỘT lần: bản cũ vẽ canvas WebGL của matte 10 lần ở cỡ thật kèm filter blur → OBS (CEF vẽ
            // canvas 2D bằng CPU) mất 330-500 ms MỖI lượt học, chặn luồng chính → overlay chỉ xử lý < 1 khung/giây lúc Rơi Hố / Bị Đuổi
            // = "cam bị giật" (đo OBS thật 2026-10-22). Vùng khoét vốn nhoè + nới rộng nên ảnh nhỏ không làm mất chi tiết; phòng giữ nét.
            const CUT = 4;
            const mw = Math.max(8, Math.round(iw / CUT)), mh = Math.max(8, Math.round(ih / CUT));
            if (this._cut.width !== mw || this._cut.height !== mh) { this._cut.width = this._pm.width = mw; this._cut.height = this._pm.height = mh; }
            const pm = this._pmCtx, c = this._cutCtx;
            pm.clearRect(0, 0, mw, mh);
            pm.drawImage(personCanvas, 0, 0, mw, mh);
            c.globalCompositeOperation = 'source-over';
            c.clearRect(0, 0, mw, mh);
            c.filter = `blur(${Math.max(1.5, Math.max(6, Math.round(iw * 0.012)) / CUT)}px)`;
            const d = Math.max(8, Math.round(iw * 0.035)), ds = d / CUT;
            for (const [dx, dy] of [[0, 0], [ds, 0], [-ds, 0], [0, ds], [0, -ds], [ds, ds], [-ds, ds], [ds, -ds], [-ds, -ds]]) c.drawImage(this._pm, dx, dy);
            c.drawImage(this._pm, 0, 0);
            c.filter = 'none';
            const b = opts.box;
            if (Array.isArray(b) && b.length >= 4) {
                const mx = b[2] * 0.06 + d, my = b[3] * 0.04 + d;
                c.fillStyle = '#000';
                c.fillRect((b[0] - mx) / CUT, (b[1] - my) / CUT, (b[2] + 2 * mx) / CUT, (b[3] + 2 * my) / CUT);
            }
            t.globalCompositeOperation = 'destination-out';
            t.imageSmoothingEnabled = true;
            t.drawImage(this._cut, 0, 0, iw, ih);
            t.globalCompositeOperation = 'source-over';
        }
        // 10 khung đầu ghi thẳng (có phòng ngay); sau đó trộn 25 % mỗi lần - một khung mặt nạ hụt (tay vung nhoè, chân bị cắt)
        // chỉ để lại vết mờ rồi phai qua vài khung sạch kế tiếp, không đóng cứng "bóng tay" vào phòng.
        const pc = this._plateCtx;
        pc.globalAlpha = this.plateFrames < 10 ? 1 : 0.25;
        pc.drawImage(this._tmp, 0, 0);
        pc.globalAlpha = 1;
        this.plateFrames++;
    }
    // Lấp chỗ phòng sạch còn trống (người chưa từng rời chỗ): ảnh nhỏ 1/8, mỗi hàng nội suy ngang giữa điểm có màu gần nhất
    // bên trái / phải - tường, sàn kéo vào lấp chỗ người. Đọc ngược GPU → chỉ làm khi cần vẽ, tối đa 2 lần / giây.
    _refill() {
        const now = performance.now();
        if (now - this.fillAt < 500) return;
        this.fillAt = now;
        const f = this._fillCtx, w = this.fill.width, h = this.fill.height;
        f.clearRect(0, 0, w, h);
        f.imageSmoothingQuality = 'high';
        f.drawImage(this.plate, 0, 0, w, h);
        const im = f.getImageData(0, 0, w, h), d = im.data;
        const solid = i => d[i * 4 + 3] > 150;
        let anyHole = false;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            let x = 0;
            while (x < w) {
                if (solid(row + x)) { x++; continue; }
                const x0 = x; while (x < w && !solid(row + x)) x++;
                anyHole = true;
                const L = x0 > 0 ? row + x0 - 1 : -1, R = x < w ? row + x : -1;
                for (let k = x0; k < x; k++) {
                    const i = (row + k) * 4;
                    if (L < 0 && R < 0) { d[i + 3] = 0; continue; }
                    const u = L < 0 ? 1 : R < 0 ? 0 : (k - x0 + 1) / (x - x0 + 1);
                    for (let c = 0; c < 3; c++) d[i + c] = (L < 0 ? 0 : d[L * 4 + c] * (1 - u)) + (R < 0 ? 0 : d[R * 4 + c] * u);
                    d[i + 3] = 255;
                }
            }
        }
        // Hàng trống trọn (chưa có màu nào) → lấy hàng trên / dưới gần nhất.
        for (let y = 0; y < h; y++) {
            if (d[(y * w) * 4 + 3]) continue;
            let yy = -1;
            for (let k = 1; k < h && yy < 0; k++) { if (y - k >= 0 && d[((y - k) * w) * 4 + 3]) yy = y - k; else if (y + k < h && d[((y + k) * w) * 4 + 3]) yy = y + k; }
            if (yy >= 0) d.copyWithin(y * w * 4, yy * w * 4, (yy + 1) * w * 4);
        }
        f.putImageData(im, 0, 0);
        // làm mịn chỗ lấp (vệt kéo ngang thành mảng màu mềm thay vì sọc khối)
        const g = this._fillSoftCtx;
        g.clearRect(0, 0, w, h);
        g.filter = 'blur(3px)'; g.drawImage(this.fill, 0, 0); g.filter = 'none';
        this._filled = anyHole;
    }
    _place(ctx, M, margin) {
        ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        if (margin > 0) {   // phóng nhẹ quanh tâm - rung sân khấu không hở mép (cam gốc đã ra ngoài, mép hở là trống)
            const k = Math.hypot(M[0], M[1]) || 1, cx = this.raw.width / 2, cy = this.raw.height / 2;
            const s = 1 + (2 * margin / k) / Math.min(this.raw.width, this.raw.height);
            ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
        }
    }
    drawRaw(ctx, M, margin = 0) {
        if (!this.hasRaw || !M) return false;
        ctx.save(); this._place(ctx, M, margin); ctx.drawImage(this.raw, 0, 0); ctx.restore();
        return true;
    }
    // Phòng sạch; chưa học được gì (vừa bật) thì dùng tạm khung gốc.
    drawPlate(ctx, M, margin = 0) {
        if (!M) return false;
        if (this.plateFrames < 1) return this.drawRaw(ctx, M, margin);
        this._refill();
        ctx.save(); this._place(ctx, M, margin);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.fillSoft, 0, 0, this.raw.width, this.raw.height);
        ctx.drawImage(this.plate, 0, 0);
        ctx.restore();
        return true;
    }
}
