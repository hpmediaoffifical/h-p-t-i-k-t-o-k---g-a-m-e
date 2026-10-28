/* 🕳️ RƠI HỐ - mô-đun hiệu ứng của 🧍 Bộ Tách Người (overlays/camgames/body/overlay.html).
 * Một lượt: chờ biểu diễn → cổng xuyên không bung dưới chân → bị hút xuống → N giây → cổng trên đầu mở → rơi xuống, đáp nhún + rung.
 * Overlay chung lo tách nền / hồ sơ NPC / nền; mô-đun chỉ lo hình học + vẽ lượt. env:
 *   ctx, W, H        canvas sân khấu 1080×1920
 *   view()           👁 vùng sân khấu còn thấy trên OBS { x, y, w, h } (Scene PK cắt ô) - cổng trần / đáy hố bám mép vùng này
 *   person()         người đã tách nền ĐÃ ÁP cỡ / vị trí hồ sơ NPC: { ready, img, M, feet, head, w }
 *   backdrop(m, bg)  vẽ nền lượt (video kịch bản / nền Hậu Cảnh / phòng sạch theo bgMode) - tràn mép m
 *   media(file)      phần tử video / ảnh đã nạp sẵn (overlay chung giữ bộ đệm)
 *   playOnce(m, sound)  chạy lại video từ 0 (không lặp) · muted(sound) theo khung thử
 * Phần vẽ cổng (drawPortal / drawRipple / drawDust) chép nguyên từ overlays/camgames/roiho/overlay.html. */

export function createRoiHo(env) {
    const { ctx, W, H } = env;
    let person = env.person();
    let fx = null;
    const FULL = { x: 0, y: 0, w: W, h: H };
    const viewNow = () => (env.view && env.view()) || FULL;
    const easeIn = t => t * t;
    const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

    // Hố / nắp / chiều cao người theo chỗ người đang đứng - đo lúc hố bắt đầu mở (sau phần chờ biểu diễn).
    function fxGeom() {
        const v = viewNow(), bottom = v.y + v.h;
        const feet = person.feet || { x: W / 2, y: H * 0.86 }, head = person.head || { x: W / 2, y: H * 0.3 };
        const ph = Math.max(200, feet.y - head.y);
        const rx = Math.max(220, Math.min(480, (person.w || 300) * 0.95));
        // Khung chỉ tới gối / eo (không thấy chân): hố nằm sát mép dưới VÙNG THẤY, người tụt ra khỏi đáy màn - không cắt ngang người.
        const cropped = feet.y > bottom - 40;
        const ry = rx * 0.3, cry = rx * 0.28;
        // Cổng trần cách mép trên vùng thấy 7,5 % chiều cao vùng; vùng bị cắt trên (Scene PK) thì không để vành cổng lẹm ra ngoài.
        const ceilY = v.y + v.h * 0.075 + (v.y > 0 ? Math.max(0, cry + 12 - v.h * 0.075) : 0);
        return { hole: { x: feet.x, y: cropped ? bottom - ry * 0.55 : feet.y, rx, ry, cropped }, ceil: { y: ceilY, rx: rx * 0.95, ry: cry },
                 bottom, ph: cropped ? Math.max(ph, H) : ph };
    }
    function burstDust(x, y, rx) {
        for (let i = 0; i < 46; i++) {
            const a = Math.PI + Math.random() * Math.PI, sp = 260 + Math.random() * 520;
            fx.dust.push({ x: x + (Math.random() - 0.5) * rx * 0.6, y, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp * 0.35 - 80,
                           r: 10 + Math.random() * 26, life: 0.7 + Math.random() * 0.6, age: 0 });
        }
    }

    // ---------- 🌀 CỔNG XUYÊN KHÔNG ----------
    // Cổng DƯỚI hút vào (lam – tím), cổng TRÊN nhả ra (vàng – hồng). Mỗi cổng: hào quang · lòng đường hầm sáng có vòng chạy sâu vào
    // tâm · nhánh xoáy · vòng vạch như mặt đồng hồ thời gian · vành sáng đổi màu xoay · hạt năng lượng bị hút / phun · tia sét lóe ở
    // vành · cột sáng · sóng xung kích lúc mở. Vẽ 2 lớp: 'back' (sau người) và 'front' (vành trước, đè lên người → người lọt VÀO cổng).
    // Toạ độ vẽ trong hệ đã ép dẹt (scale 1, ry/rx) - cổng nằm nghiêng theo phối cảnh sàn / trần.
    const PAL = {
        down: { core: ['rgba(255,255,255,.98)', 'rgba(170,250,255,.95)', 'rgba(60,200,255,.9)', 'rgba(110,60,255,.92)', 'rgba(30,8,70,.96)'],
                rim: ['#3ef3ff', '#a64bff', '#ff4fd8', '#5b7bff', '#3ef3ff'], glow: '80,220,255', spark: '190,250,255', ring: '160,240,255' },
        up:   { core: ['rgba(255,255,255,.98)', 'rgba(255,246,200,.95)', 'rgba(255,196,80,.9)', 'rgba(255,90,140,.9)', 'rgba(70,10,60,.96)'],
                rim: ['#ffd95a', '#ff7bd5', '#8a7bff', '#ff9f43', '#ffd95a'], glow: '255,200,90', spark: '255,240,190', ring: '255,220,150' }
    };
    const TAU = Math.PI * 2;
    function makePortal(kind) { return { kind, parts: [], arcs: [], spin: Math.random() * TAU, last: 0, openAt: 0, wasOpen: 0 }; }

    // Cập nhật hạt + tia sét (một lần mỗi khung, gọi từ lớp 'back').
    function stepPortal(P, R, k, now) {
        const dt = P.last ? Math.min(0.05, (now - P.last) / 1000) : 0;
        P.last = now;
        const down = P.kind === 'down';
        // hạt: cổng dưới sinh ở ngoài vành rồi xoáy vào tâm; cổng trên sinh ở tâm rồi xoáy văng ra
        P.acc = (P.acc || 0) + 95 * k * dt;
        while (P.acc >= 1) {
            P.acc -= 1;
            const a = Math.random() * TAU;
            P.parts.push(down
                ? { a, r: R * (1.15 + Math.random() * 0.55), vr: -R * (0.9 + Math.random() * 0.8), va: 2.4 + Math.random() * 1.6, life: 1.1, age: 0, s: 3 + Math.random() * 6 }
                : { a, r: R * (0.1 + Math.random() * 0.2), vr: R * (0.9 + Math.random() * 0.9), va: -(2 + Math.random() * 1.4), life: 1.0, age: 0, s: 3 + Math.random() * 6 });
        }
        for (const p of P.parts) { p.age += dt; p.px = p.r; p.pa = p.a; p.r += p.vr * dt; p.a += p.va * dt * (down ? 1 + (R / Math.max(20, p.r)) * 0.15 : 1); }
        P.parts = P.parts.filter(p => p.age < p.life && p.r > R * 0.05 && p.r < R * 2);
        if (P.parts.length > 220) P.parts.splice(0, P.parts.length - 220);
        // tia sét ở vành: thỉnh thoảng lóe 90–160 ms
        if (k > 0.6 && Math.random() < 0.09) {
            const a = Math.random() * TAU, pts = [];
            let r = R * 0.98, aa = a;
            for (let i = 0; i < 7; i++) { pts.push([Math.cos(aa) * r, Math.sin(aa) * r]); r += R * (0.04 + Math.random() * 0.07); aa += (Math.random() - 0.5) * 0.35; }
            P.arcs.push({ pts, until: now + 90 + Math.random() * 70, front: down ? Math.sin(a) > 0 : Math.sin(a) < 0 });   // nửa gần (xem vành)
        }
        P.arcs = P.arcs.filter(x => x.until > now);
    }

    // k: độ mở 0..1 (có nảy); part: 'back' | 'front'
    function drawPortal(P, x, y, rx, ry, k, now, part) {
        if (k <= 0.001) return;
        const pal = PAL[P.kind], t = now / 1000, down = P.kind === 'down', dir = down ? 1 : -1;
        const R = rx * k, sy = ry / rx;
        if (part === 'back') {
            if (!P.wasOpen) { P.wasOpen = 1; P.openAt = now; }
            stepPortal(P, R, Math.min(1, k), now);
            // cột sáng: cổng dưới bốc lên, cổng trên rọi xuống
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bh = H * (down ? 0.34 : 0.55) * Math.min(1, k);
            const y2 = y + (down ? -bh : bh), w0 = R * (down ? 0.85 : 0.8), w1 = R * (down ? 0.5 : 1.2);
            const bg = ctx.createLinearGradient(0, y, 0, y2);
            bg.addColorStop(0, `rgba(${pal.spark},${0.3 + 0.08 * Math.sin(t * 9)})`); bg.addColorStop(0.35, `rgba(${pal.glow},.14)`); bg.addColorStop(1, `rgba(${pal.glow},0)`);
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.moveTo(x - w0, y); ctx.lineTo(x - w1, y2); ctx.lineTo(x + w1, y2); ctx.lineTo(x + w0, y); ctx.fill();
            // vệt sáng chạy dọc chùm (đi lên ở cổng dưới, đi xuống ở cổng trên)
            ctx.lineCap = 'round';
            for (let i = 0; i < 9; i++) {
                const u = ((i * 0.37 + t * (0.55 + (i % 3) * 0.2)) % 1), lane = ((i * 0.61) % 1) * 2 - 1;
                const yy = y + (y2 - y) * u, ww = w0 + (w1 - w0) * u, len = bh * 0.12;
                ctx.strokeStyle = `rgba(${pal.spark},${0.55 * Math.sin(Math.PI * u)})`; ctx.lineWidth = 3 + (i % 3) * 2;
                ctx.beginPath(); ctx.moveTo(x + lane * ww * 0.85, yy); ctx.lineTo(x + lane * ww * 0.85, yy + (down ? len : -len)); ctx.stroke();
            }
            ctx.restore();
        }
        ctx.save();
        ctx.translate(x, y); ctx.scale(1, sy);
        if (part === 'back') {
            // hào quang
            ctx.globalCompositeOperation = 'lighter';
            let g = ctx.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.9);
            g.addColorStop(0, `rgba(${pal.glow},.55)`); g.addColorStop(1, `rgba(${pal.glow},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, TAU); ctx.fill();
            // lòng cổng: đường hầm sáng
            ctx.globalCompositeOperation = 'source-over';
            g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
            [0, 0.16, 0.4, 0.72, 1].forEach((st, i) => g.addColorStop(st, pal.core[i]));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
            // vòng chạy sâu vào tâm (cổng dưới) / dội ra (cổng trên) - cảm giác đường hầm thời gian
            ctx.save();
            ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 7; i++) {
                let f = ((i / 7) + t * 0.55 * dir) % 1; if (f < 0) f += 1;
                const rr = R * (down ? 1 - f : f) ;
                ctx.strokeStyle = `rgba(${pal.ring},${0.35 * Math.sin(Math.PI * f)})`;
                ctx.lineWidth = Math.max(1.5, R * 0.03 * (rr / R + 0.2));
                ctx.beginPath(); ctx.arc(0, 0, Math.max(1, rr), 0, TAU); ctx.stroke();
            }
            // nhánh xoáy
            const arms = 6;
            for (let a = 0; a < arms; a++) {
                ctx.beginPath();
                for (let j = 0; j <= 30; j++) {
                    const fr = j / 30, r = R * (1 - fr * 0.9);
                    const ang = P.spin + a * TAU / arms + fr * 3.4 * dir + t * 1.9 * dir;
                    const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
                    j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.strokeStyle = a % 2 ? `rgba(255,255,255,.28)` : `rgba(${pal.ring},.42)`;
                ctx.lineWidth = R * 0.045; ctx.lineCap = 'round';
                ctx.stroke();
            }
            ctx.restore();
            // vòng vạch thời gian (xoay ngược chiều xoáy)
            ctx.save();
            ctx.rotate(-t * 0.6 * dir + P.spin);
            ctx.strokeStyle = `rgba(${pal.ring},.55)`;
            for (let i = 0; i < 60; i++) {
                const a = i / 60 * TAU, long = i % 5 === 0;
                const r0 = R * 1.1, r1 = R * (long ? 1.22 : 1.16);
                ctx.lineWidth = long ? 4 : 2;
                ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
            }
            ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 1.27, 0, TAU); ctx.stroke();
            ctx.restore();
            // hạt năng lượng (vệt ngắn)
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            for (const p of P.parts) {
                const al = Math.sin(Math.PI * Math.min(1, p.age / p.life)) * 0.9;
                ctx.strokeStyle = `rgba(${pal.spark},${al})`; ctx.lineWidth = p.s;
                ctx.beginPath(); ctx.moveTo(Math.cos(p.pa) * p.px, Math.sin(p.pa) * p.px); ctx.lineTo(Math.cos(p.a) * p.r, Math.sin(p.a) * p.r); ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        // vành sáng đổi màu xoay - 'back' vẽ nửa XA, 'front' vẽ nửa GẦN (đè lên người). Cổng sàn nhìn xuống: nửa gần là nửa
        // DƯỚI; cổng trần nhìn lên: nửa gần là nửa TRÊN (người treo dưới trần che nửa dưới vành, nửa trên vành che người).
        const near = down ? [0, Math.PI] : [Math.PI, TAU], far = down ? [Math.PI, TAU] : [0, Math.PI];
        const half = part === 'back' ? far : near;
        const cg = ctx.createConicGradient ? ctx.createConicGradient(P.spin + t * 1.4 * dir, 0, 0) : null;
        if (cg) pal.rim.forEach((c, i) => cg.addColorStop(i / (pal.rim.length - 1), c));
        ctx.shadowColor = pal.rim[0]; ctx.shadowBlur = 28;
        ctx.strokeStyle = cg || pal.rim[0]; ctx.lineWidth = R * 0.075;
        ctx.beginPath(); ctx.arc(0, 0, R, half[0], half[1]); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(2, R * 0.014);
        ctx.beginPath(); ctx.arc(0, 0, R * 0.985, half[0], half[1]); ctx.stroke();
        if (part === (down ? 'front' : 'back')) {
            // sương năng lượng trong lòng cổng - cổng sàn: phủ lên phần người đã chìm vào (ngập trong đường hầm sáng);
            // cổng trần: nằm SAU người (người đã ra khỏi lòng cổng, ở trước nó)
            ctx.globalCompositeOperation = 'lighter';
            const hz = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
            hz.addColorStop(0, `rgba(${pal.spark},.32)`); hz.addColorStop(0.7, `rgba(${pal.glow},.18)`); hz.addColorStop(1, `rgba(${pal.glow},0)`);
            ctx.fillStyle = hz; ctx.beginPath(); ctx.arc(0, 0, R * 0.96, 0, TAU); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        // tia sét
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16;
        for (const arc of P.arcs) {
            if (arc.front !== (part === 'front')) continue;
            ctx.strokeStyle = `rgba(${pal.spark},.95)`; ctx.lineWidth = 3;
            ctx.beginPath(); arc.pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
        }
        ctx.shadowBlur = 0;
        // sóng xung kích lúc vừa mở (350 ms)
        if (part === 'front' && P.openAt) {
            const q = (now - P.openAt) / 350;
            if (q < 1) {
                ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; ctx.lineWidth = R * 0.06 * (1 - q) + 2;
                ctx.beginPath(); ctx.arc(0, 0, R * (1 + q * 0.9), 0, TAU); ctx.stroke();
            }
        }
        ctx.restore();
    }
    // Độ mở có nảy (vượt 1 rồi về) - cổng "bung" ra chứ không trượt đều.
    const easeOutBack = t => { const c = 1.9; t = clamp01(t) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

    // Gợn năng lượng chỗ đáp đất (thay vết nứt).
    function drawRipple(x, y, rx, el, kind) {
        const pal = PAL[kind];
        ctx.save();
        ctx.translate(x, y); ctx.scale(1, 0.3);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const q = (el - i * 120) / 700;
            if (q <= 0 || q >= 1) continue;
            ctx.strokeStyle = `rgba(${pal.ring},${0.8 * (1 - q)})`; ctx.lineWidth = 10 * (1 - q) + 2;
            ctx.beginPath(); ctx.arc(0, 0, rx * (0.3 + q * 1.1), 0, TAU); ctx.stroke();
        }
        const q0 = el / 500;
        if (q0 < 1) {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.9);
            g.addColorStop(0, `rgba(255,255,255,${0.7 * (1 - q0)})`); g.addColorStop(1, `rgba(${pal.glow},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * 0.9, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    function drawDust(f, dt) {
        for (const p of f.dust) {
            p.age += dt; if (p.age >= p.life) continue;
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy += 260 * dt;
            const a = (1 - p.age / p.life) * 0.55;
            ctx.fillStyle = `rgba(190,170,150,${a})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.age * 1.4), 0, Math.PI * 2); ctx.fill();
        }
        f.dust = f.dust.filter(p => p.age < p.life);
    }

    // Chỗ chân chạm đất (khung cắt ngang người thì lấy sát mép dưới).
    const groundX = () => person.feet ? person.feet.x : W / 2;
    const groundY = f => Math.min(person.feet ? person.feet.y : H * 0.86, f.hole.cropped ? f.hole.y : f.bottom);

    // Vẽ người với dời/nhún quanh chân, cắt theo vùng: clip = { top, bottom, ell?, cut? } - dải ngang [top, bottom] HỢP với lòng
    // cổng `ell` (người tụt qua mặt sàn vẫn thấy phần đang ở TRONG cổng) / TRỪ lòng cổng `cut` (cổng trần: người ló ra dưới vành).
    function drawPerson(dy, sx, sy, clip) {
        if (!person.ready || !person.img || !person.M) return;
        const M = person.M, ax = person.feet ? person.feet.x : W / 2, ay = person.feet ? person.feet.y : H;
        ctx.save();
        if (clip) {
            ctx.beginPath(); ctx.rect(-W, clip.top, W * 3, clip.bottom - clip.top);
            if (clip.ell) ctx.ellipse(clip.ell.x, clip.ell.y, clip.ell.rx, clip.ell.ry, 0, 0, TAU);
            ctx.clip();
            if (clip.cut) { ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); ctx.ellipse(clip.cut.x, clip.cut.y, clip.cut.rx, clip.cut.ry, 0, 0, TAU); ctx.clip('evenodd'); }
        }
        ctx.translate(ax, ay + dy); ctx.scale(sx, sy); ctx.translate(-ax, -ay);
        ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        ctx.drawImage(person.img, 0, 0);
        ctx.restore();
    }

    // 🪂 Rơi từ cổng trần xuống. k = tiến độ 0..1 (rơi tự do: quãng đường ∝ k², tốc độ ∝ k).
    //   - người CHUI RA khỏi lòng cổng: thấy phần dưới vành trên (cùng mặt phẳng trần) - dải dưới tâm HỢP lòng cổng; nửa vành gần
    //     (nửa trên) vẽ sau ở lớp 'front' nên che phần người còn trong cổng.
    //   - thân giãn dọc theo tốc độ (hoạt hình rơi nhanh) + 2 bóng mờ ở chỗ vài phần trăm trước - mắt đọc ra tốc độ.
    function drawDrop(f, k, cx) {
        const C = f.ceil, fy = person.feet ? person.feet.y : H * 0.86;
        const dy0 = C.y - fy;                   // lúc đầu: chân ngang mặt cổng trần
        const clip = { top: C.y, bottom: H * 2, ell: { x: cx, y: C.y, rx: C.rx * 0.97, ry: C.ry * 0.97 } };
        const v = k;                            // tốc độ tương đối
        const sy = 1 + 0.13 * v * (1 - Math.max(0, k - 0.92) / 0.08), sx = 1 - 0.05 * v;   // sát đất thì thôi giãn (đáp nhún lo tiếp)
        const at = q => dy0 * (1 - easeIn(clamp01(q)));
        const trail = Math.min(1, v * 1.6) * (k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1);   // sát đất tắt dần - khỏi thành "người thứ hai"
        for (const [lag, a] of [[0.16, 0.12], [0.08, 0.24]]) {
            if (k - lag <= 0.05 || trail <= 0) continue;
            ctx.save(); ctx.globalAlpha = a * trail;
            drawPerson(at(k - lag), sx, sy, clip);
            ctx.restore();
        }
        drawPerson(at(k), sx, sy, clip);
    }
    // Bóng dưới chân chỗ sắp đáp: mờ, nhỏ lúc người còn trên cao → đậm, to dần khi sắp chạm đất.
    function drawShadow(f, k) {
        const x = groundX(), y = groundY(f), rx = Math.max(90, (person.w || 300) * 0.55);
        const q = easeIn(k);
        ctx.save();
        ctx.translate(x, y); ctx.scale(1, 0.22);
        const r = rx * (0.45 + 0.55 * q);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(0,0,0,${0.12 + 0.38 * q})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // d = { script (đã chuẩn hoá), … }. Trả false nếu không chạy được.
    function start(d, now) {
        person = env.person();
        const sc = d.script, T = sc.timing;
        const t = { wait: Math.max(0, Number(T.waitSec) || 0) * 1000, open: T.openMs, fall: T.fallMs, under: T.underSec * 1000, ceil: T.ceilMs, drop: T.dropMs, settle: T.settleMs };
        const s = {};
        // Chờ biểu diễn (nền đã phủ, người đứng tự do) → hố mở → rụng → dưới hố → nắp mở → rơi → đáp.
        s.openAt = t.wait; s.fallAt = s.openAt + t.open; s.goneAt = s.fallAt + t.fall; s.ceilAt = s.goneAt + t.under; s.dropAt = s.ceilAt + t.ceil;
        s.landAt = s.dropAt + t.drop; s.endAt = s.landAt + Math.max(t.settle, 700) + 300;
        const bg = sc.bgFile ? env.media(sc.bgFile) : null;
        fx = { d, script: sc, start: now, t, s, ...fxGeom(), placed: t.wait <= 0, dust: [], landed: false, bg, pd: makePortal('down'), pu: makePortal('up'), cue: new Set() };
        if (bg) env.playOnce(bg, sc.bgSound);       // video nền chạy lại từ đầu mỗi lượt (khớp mốc hố / nắp trong video)
        return true;
    }
    function stop() { if (fx && fx.bg && fx.bg.isVideo) fx.bg.el.pause(); fx = null; }
    // 🔊 Tiếng giả lập theo mốc (sfx-real.mjs) - game có mp3 riêng / tắt "Tiếng giả lập" thì im. Mốc đã qua > 0,4 s (tua soi) bỏ qua.
    function sounds(f, e) {
        if (!env.sfx || !env.sfxOn || !env.sfxOn(f.script)) return;
        const s = f.s, t = f.t, X = env.sfx, v = env.cfg().sfxVolume ?? 0.7;
        const once = (k, at, fn) => { if (e >= at && !f.cue.has(k)) { f.cue.add(k); if (e - at < 400) fn(); } };
        once('open', s.openAt, () => { X.crack(1, { vol: v }); X.portal((t.open + t.fall) / 1000 + 0.4, { vol: v * 0.8 }); });
        once('fall', s.fallAt, () => { X.whoosh(Math.max(0.25, t.fall / 1000), { vol: v * 0.9, f0: 800, f1: 220 }); X.rustle(0.3, { vol: v * 0.6 }); });
        once('ceil', s.ceilAt, () => { X.crack(0.7, { vol: v * 0.9 }); X.debris(10, { vol: v * 0.8, spread: (t.ceil + t.drop) / 1000 }); X.portal((t.ceil + t.drop) / 1000 + 0.45, { vol: v * 0.7 }); });
        once('drop', s.dropAt, () => X.wind(t.drop / 1000, { vol: v * 0.85 }));
        once('land', s.landAt, () => { X.thud(1.1, { vol: v }); X.debris(6, { vol: v * 0.6, at: 0.03, spread: 0.5 }); X.rumble(0.5, { vol: v * 0.5 }); });
    }

    // Vẽ một khung của lượt (ctx đang ở hệ sân khấu, đã xoá). Trả true khi hết lượt.
    function frame(now, dt, eFix) {
        if (!fx) return true;
        person = env.person();
        const f = fx, e = eFix != null ? eFix : now - f.start, s = f.s;
        sounds(f, e);
        // rung khi đáp: dời cả sân khấu, tắt dần
        let shx = 0, shy = 0;
        if (f.landed) {
            const k = clamp01(1 - (now - f.landedAt) / 480);
            shx = (Math.random() - 0.5) * 2 * f.script.shake * k; shy = (Math.random() - 0.5) * 2 * f.script.shake * k * 0.7;
        }
        ctx.setTransform(1, 0, 0, 1, shx, shy);
        env.backdrop((f.script.shake || 0) + 4, f.bg);     // tràn mép bằng biên độ rung - rung không hở camera gốc ở mép
        const props = f.script.props !== false;
        // Hết phần chờ: đặt hố đúng chỗ chân lúc này (trong lúc biểu diễn người có thể đã đi chỗ khác).
        if (!f.placed && e >= s.openAt) { Object.assign(f, fxGeom()); f.placed = true; }
        const h = f.hole;
        let done = false;
        if (e < s.openAt) {
            drawPerson(0, 1, 1, null);
        } else if (e < s.goneAt + 300) {
            const open = e < s.goneAt ? easeOutBack((e - s.openAt) / f.t.open) : 1 - easeIn(clamp01((e - s.goneAt) / 300));
            if (props) drawPortal(f.pd, h.x, h.y, h.rx, h.ry, open, now, 'back');
            if (e < s.goneAt) {
                const k = clamp01((e - s.fallAt) / f.t.fall);
                const dy = easeIn(k) * (f.ph * 1.25);
                const sc = 1 - easeIn(k) * 0.22;                 // bị hút: co lại dần khi chìm
                drawPerson(dy, sc, sc, e >= s.fallAt && !h.cropped ? { top: -H, bottom: h.y, ell: { x: h.x, y: h.y, rx: h.rx * 0.97, ry: h.ry * 0.97 } } : null);
            }
            if (props) drawPortal(f.pd, h.x, h.y, h.rx, h.ry, open, now, 'front');
        } else if (e < s.dropAt + f.t.drop) {
            const cx = person.feet ? person.feet.x : W / 2;
            const ck = e < s.ceilAt ? 0 : easeOutBack((e - s.ceilAt) / f.t.ceil);
            const C = f.ceil;
            if (e >= s.dropAt) drawShadow(f, clamp01((e - s.dropAt) / f.t.drop));
            if (props) drawPortal(f.pu, cx, C.y, C.rx, C.ry, ck, now, 'back');
            if (e >= s.dropAt) drawDrop(f, clamp01((e - s.dropAt) / f.t.drop), cx);
            if (props) drawPortal(f.pu, cx, C.y, C.rx, C.ry, ck, now, 'front');
            if (e >= s.landAt - 16 && !f.landed) { f.landed = true; f.landedAt = now; burstDust(groundX(), groundY(f), h.rx); }
        } else {
            if (!f.landed) { f.landed = true; f.landedAt = now; burstDust(groundX(), groundY(f), h.rx); }
            const el = now - f.landedAt;
            const cx = person.feet ? person.feet.x : W / 2;
            const C = f.ceil, ck = 1 - easeIn(clamp01(el / 350));
            if (props) drawPortal(f.pu, cx, C.y, C.rx, C.ry, ck, now, 'back');
            if (props) drawRipple(groundX(), groundY(f), h.rx, el, 'up');
            const q = clamp01(el / f.t.settle);
            const squash = Math.sin(q * Math.PI) * 0.1 * (1 - q * 0.5);
            drawPerson(0, 1 + squash * 0.6, 1 - squash, null);
            if (props) drawPortal(f.pu, cx, C.y, C.rx, C.ry, ck, now, 'front');
            if (e >= s.endAt) done = true;
        }
        if (f.dust.length) drawDust(f, dt);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (done) stop();
        return done;
    }
    // Ngoài hố (đứng chờ / đáp xong) người ở chỗ cũ; lúc biến mất (dưới hố) không có ai trên màn.
    return { start, stop, frame, get fx() { return fx; }, playing: () => (fx && fx.bg ? [fx.bg] : []) };
}
