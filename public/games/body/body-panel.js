// 🌐 hpT(): ngôn ngữ giao diện - overlays/lib/hp-i18n.js; trang chưa nạp thì giữ tiếng Việt (chỉ thay {biến}). hpTA(): như hpT, thoát dấu " cho thuộc tính HTML.
var hpT = (typeof globalThis !== 'undefined' && globalThis.hpT) || function (s, v) { return String(s).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (m, k) { return v && v[k] != null ? String(v[k]) : m; }); };
var hpTA = function (s, v) { return hpT(s, v).replace(/"/g, '&quot;'); };
/* 🧍 Bộ Tách Người - panel trong app (Game Camera). Tự chèn <section id="view-body"> vào panel.html.
 * MỘT panel nhiều tab thay 3 panel Rơi Hố / Bị Đuổi / Hậu Cảnh: 🧍 Hồ sơ NPC · 🦊 Hậu Cảnh · 🕳️ Rơi Hố · 🏃 Bị Đuổi · ✂ Tách nền.
 * Config camGames.body (lõi window.HpBody - overlays/camgames/body/core.cjs); lưu debounce 350 ms, echo gameConfig chỉ áp khi không
 * phải bản vừa lưu. Bên phải là khung xem trước overlay /overlay/body (review=1, profile=<hồ sơ đang chọn>). Chọn quà = bộ chọn
 * chung camgames/board-gift-picker.js (🎁 Bảng Quà theo Hồ sơ NPC / ＋ quà mới). Thẻ kịch bản chép từ 3 panel cũ.
 * HP Action LIVE (chuyển từ HP LIVE NPC @1e884fe): MỘT hồ sơ (không có NPC) - tab 🧍 chỉ còn cỡ / lệch / nền thường trực; quà luôn
 * chạy NGAY (không có 📋 Danh sách hiệu ứng / nhạc nền); chọn quà = bảng quà của app (GET /api/gifts). */
(function () {
    'use strict';
    const $ = (sel, root) => (root || document).querySelector(sel);
    const HB = () => window.HpBody, BD = () => window.HpBiDuoi;
    const TABS = [
        ['npc', '🧍', hpT('Cỡ người'), hpT('Cỡ - vị trí - nền thường trực')],
        ['games', '🎮', hpT('Game'), hpT('Hậu Cảnh - Rơi Hố - Bị Đuổi - Video')],
        ['matte', '✂', hpT('Tách nền'), hpT('Model - viền - hàng chờ')]
    ];
    const DIR = { left: hpT('⬅ Trái'), right: hpT('Phải ➡') };
    let cfg = null, meta = { groups: [], enabledNpcIds: [], activeProfileId: '', board: {}, cam: {} };
    let socket = null, bound = false, persistTimer = null, feedStatus = null, feedPoll = null;
    let tab = 'npc', sel = '', testVideo = '', previewView = '', previewBg = 'checker';
    try {
        tab = localStorage.getItem('hpal.body.tab') || 'npc'; sel = localStorage.getItem('hpal.body.sel') || '';
        testVideo = localStorage.getItem('hpal.body.testVideo') || localStorage.getItem('hpal.haucanh.testVideo') || '';
    } catch (_) {}
    if (['haucanh', 'roiho', 'biduoi', 'vidfx'].includes(tab)) tab = 'games';     // tab cũ (trước khi gộp lưới game)
    if (!TABS.some(t => t[0] === tab)) tab = 'npc';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = v => { const n = Number(v); return Number.isInteger(n) ? String(n) : String(+n.toFixed(4)); };
    // HP Action LIVE: một hồ sơ "Mọi NPC", mọi kịch bản áp cho mọi hồ sơ (giống lib/body-server.js singleProfile).
    const norm = c => {
        const out = HB().normalizeConfig(c);
        const p0 = out.profiles[0];
        out.profiles = [{ ...(p0 || HB().normalizeProfile({ id: 'hs1' }, 0)), groupId: '' }];
        for (const k of HB().KINDS) for (const x of out[k].scripts) x.profileId = '';
        for (const x of out.haucanh.items) x.profileId = '';
        return out;
    };
    const cur = () => (cfg && (cfg.profiles.find(p => p.id === sel) || cfg.profiles[0])) || null;
    const setSel = id => { sel = id || ''; try { localStorage.setItem('hpal.body.sel', sel); } catch (_) {} };
    const npcName = gid => !gid ? hpT('Mọi người') : ((meta.groups.find(g => g.id === gid) || {}).name || (hpT('người đã xoá ({gid})', { gid })));
    const profOf = pid => (cfg && cfg.profiles.find(p => p.id === pid)) || null;
    const profName = pid => !pid ? hpT('Mọi hồ sơ người') : (profOf(pid) ? npcName(profOf(pid).groupId) : hpT('⚠ Hồ sơ đã xoá'));
    // /media/… (file tải lên) và /glassets/… (📦 video mẫu giao kèm app, list/) là URL của server → dùng thẳng; còn lại là đường dẫn máy.
    const fileLabel = f => !f ? '' : /^\/(media|games|api\/body\/asset)\//i.test(f) ? decodeURIComponent(f.split('/').pop()).replace(/^\d{10,}-/, '') : f.split(/[\\/]/).pop();
    const fileUrl = f => /^\/(media|games|api\/body\/asset)\//i.test(f) ? f : '/api/body/file?path=' + encodeURIComponent(f);
    const isVid = f => /\.(mp4|webm|mov|mkv|m4v)$/i.test(f);
    // mp4 "xếp cặp" nửa màu + nửa alpha (….pack.mp4 - overlays/camgames/body/alpha-pack.mjs): trong suốt mà GPU giải mã, nhẹ hơn webm alpha.
    const isPacked = f => /[._-]pack(ed)?\.(mp4|m4v|mov|mkv)$/i.test(f);
    const listOf = kind => kind === 'haucanh' ? cfg.haucanh.items : cfg[kind].scripts;

    // ---------- CSS lưới Ô + popup + menu chuột phải (dùng chung với trang chủ 🎥 Game Camera) ----------
    // Popup GỌN (user 2026-10-20 "gọn, chuyên nghiệp"): hàng ô chọn có nhãn nhỏ (.bt-opts), quà + mp3 một hàng chip (.bt-media),
    // khung video thấp (.bt-drop-mini) đặt cạnh công tắc (.bt-vrow), thông số sít - chỉ trong .bt-modal-body (tab Hồ sơ giữ nguyên).
    function ensureGridCss() {
        if (document.getElementById('bt-grid-css')) return;
        const st = document.createElement('style');
        st.id = 'bt-grid-css';
        st.textContent = `
            /* game grid + popup + context menu */
            .bt-vbar { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
            .bt-vbar input { flex: 1; min-width: 0; padding: 6px 10px; }
            .bt-vbar select { max-width: 46%; padding: 6px 6px; }
            .bt-vchips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
            .bt-vchips .bt-chip { padding: 4px 10px; font-size: 12px; } .bt-vchips .bt-chip em { font-style: normal; opacity: .6; margin-left: 3px; }
            .bt-vgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; margin-bottom: 8px; }
            .bt-vtile { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 6px; border: 1px solid #232733; border-radius: 12px;
                background: #0f1219; color: #e6e8ee; cursor: pointer; text-align: center; position: relative; content-visibility: auto; contain-intrinsic-size: auto 300px; }
            .bt-vtile:hover { border-color: #25f4ee; background: #121a22; box-shadow: 0 6px 18px rgba(37,244,238,.08); }
            .bt-vtile.warn { border-color: #5a4320; }
            .bt-vthumb { position: relative; aspect-ratio: 9 / 16; border-radius: 9px; overflow: hidden; display: grid; place-items: center;
                background: #1b1f2a repeating-conic-gradient(#242938 0% 25%, #1b1f2a 0% 50%) 50% / 16px 16px; }
            .bt-vthumb video, .bt-vthumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
            video.packed { object-view-box: inset(0 50% 0 0); }
            .bt-vnone { font-size: 28px; opacity: .6; }
            .bt-vthumb img.bt-vart { position: absolute; inset: 0; }
            .bt-vthumb img.bt-vart.on { background: inherit; }   /* nạp xong mới che emoji dự phòng (kể cả ảnh trong suốt) */
            .bt-vthumb img.bt-vart.over { transition: opacity .15s; } .bt-vtile:hover .bt-vthumb img.bt-vart.over { opacity: 0; }   /* rê chuột: ẩn ảnh bìa, phát video mẫu */
            .bt-vkind { position: absolute; left: 4px; top: 4px; font-size: 16px; background: rgba(10,12,18,.7); border-radius: 8px; padding: 1px 4px; }
            .bt-vgift { position: absolute; right: 4px; top: 4px; display: flex; align-items: center; gap: 2px; background: rgba(10,12,18,.7); border-radius: 8px; padding: 2px; font-size: 12px; }
            .bt-vgift img { width: 20px; height: 20px; object-fit: contain; } .bt-vgift em { font-style: normal; font-size: 10px; color: #25f4ee; }
            .bt-vplay { position: absolute; left: 50%; bottom: 8px; width: 34px; height: 34px; margin-left: -17px; box-sizing: border-box; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(8,12,18,.6);
                border: 1.5px solid rgba(255,255,255,.88); box-shadow: 0 2px 10px rgba(0,0,0,.45); backdrop-filter: blur(4px);
                opacity: 0; cursor: pointer; transition: opacity .15s, transform .12s, background .12s, border-color .12s, color .12s; }
            .bt-vplay svg { width: 16px; height: 16px; display: block; fill: currentColor; }
            .bt-vtile:hover .bt-vplay { opacity: 1; }
            .bt-vtile.firing { animation: btFire .7s ease-out; }
            .bt-vbr { position: absolute; right: 4px; bottom: 4px; display: flex; gap: 3px; align-items: center; }
            .bt-vsnd, .bt-vrun { font-size: 11px; background: rgba(10,12,18,.75); border-radius: 7px; padding: 1px 5px; }
            .bt-vrun { cursor: pointer; border: 1px solid transparent; }
            .bt-vrun.normal { opacity: .55; } .bt-vtile:hover .bt-vrun.normal { opacity: 1; }
            .bt-vrun.background { border-color: #6b8cff; } .bt-vrun.mute { border-color: #ff6b8a; }
            .bt-vrun:hover { border-color: #25f4ee; }
            .bt-vruns { display: inline-flex; gap: 2px; align-items: center; font-size: 12px; color: #8b93a8; white-space: nowrap; }
            .bt-vruns button { padding: 4px 7px; font-size: 13px; }
            .bt-vcount { position: absolute; left: 4px; bottom: 4px; font-size: 11px; background: rgba(10,12,18,.75); border-radius: 7px; padding: 1px 5px; }
            .bt-modal-kind { font-size: 11.5px; color: #8b93a8; border: 1px solid #2c3243; border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
            .bt-kset { margin-top: 10px; border: 1px solid #232733; border-radius: 10px; padding: 6px 10px; }
            .bt-kset > summary { cursor: pointer; font-weight: 700; font-size: 12.5px; color: #c9cbd6; padding: 4px 0; }
            .bt-kset[open] > summary { margin-bottom: 6px; }
            @keyframes btFire { 0% { box-shadow: 0 0 0 0 rgba(37,244,238,.7); } 100% { box-shadow: 0 0 0 14px rgba(37,244,238,0); } }
            .bt-vtile b { font-size: 12.5px; line-height: 1.25; max-height: 2.5em; overflow: hidden; }
            .bt-vtile small { font-size: 11px; color: #8b93a8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .bt-vwarn { font-size: 10.5px; color: #ffc46b; }
            .bt-modal { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 18px; background: rgba(0,0,0,.62); backdrop-filter: blur(3px); }
            .bt-modal[hidden] { display: none; }
            .bt-modal-card { width: min(720px, 96vw); max-height: 92vh; display: flex; flex-direction: column; background: #161a23; border: 1px solid #2c3243;
                border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.5); }
            .bt-modal-head { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid #1f2533; }
            .bt-modal-ico { font-size: 20px; } .bt-modal-title { flex: 1; min-width: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .bt-modal-body { overflow-y: auto; padding: 10px 12px; overscroll-behavior: contain; }
            .bt-modal-body .bt-item { border: 0; padding: 0; margin: 0; background: transparent; }
            /* compact popup */
            .bt-modal-body .bt-head { margin-bottom: 10px; }
            .bt-opts { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; margin-bottom: 10px; }
            .bt-opt { flex: 1 1 150px; min-width: 0; display: flex; flex-direction: column; gap: 3px; cursor: default; }
            .bt-opt > span { font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #8b93a8; white-space: nowrap; }
            .bt-opt select { width: 100%; min-width: 0; padding: 5px 7px; font-size: 12.5px; }
            .bt-opt .bt-seg { align-self: flex-start; } .bt-opt .bt-seg button { padding: 5px 12px; }
            .bt-opts > .ctc-toggle { flex: 1 1 120px; margin: 0 0 6px; }
            .bt-media { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 8px; margin-bottom: 10px; }
            .bt-cap { font-size: 10.5px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #8b93a8; white-space: nowrap; }
            .bt-modal-body .bt-gbox { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; margin: 0; min-height: 40px; box-sizing: border-box; }
            .bt-modal-body .bt-gbox .bt-cap { color: #ffd95a; }
            .bt-gchip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; padding: 2px 2px 2px 4px; border-radius: 8px;
                background: rgba(0,0,0,.25); border: 1px solid rgba(255,214,90,.25); font-size: 12.5px; }
            .bt-gchip img { width: 24px; height: 24px; object-fit: contain; flex: none; }
            .bt-gchip b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
            .bt-gchip button, .bt-gplus { padding: 1px 6px; min-width: 0; }
            .bt-gplus { margin-left: auto; }
            .bt-modal-body .bt-gbox.empty button[data-act=gadd] { margin-left: auto; }
            .bt-modal-body .bt-snd { margin: 0; padding: 6px 8px; border: 1px dashed #343b4d; min-height: 40px; box-sizing: border-box; gap: 6px; font-size: 12.5px; }
            .bt-modal-body .bt-snd.on { border-style: solid; border-color: rgba(37,244,238,.5); }
            .bt-modal-body .bt-snd:hover, .bt-modal-body .bt-snd.over { border-color: #25f4ee; }
            .bt-modal-body .bt-snd b { font-weight: 600; color: #cdd3e0; }
            .bt-modal-body .bt-snd:not(.on) b { color: #8b93a8; font-weight: 500; }
            .bt-modal-body .bt-snd input[type=range] { width: 64px; }
            .bt-modal-body .bt-snd button { padding: 1px 6px; }
            .bt-vrow { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
            .bt-toggles.col { flex-direction: column; flex: none; gap: 0; margin: 0; }
            .bt-vrow .bt-drop { flex: 1; min-width: 0; margin: 0; } .bt-vrow .bt-opt { flex: 0 0 140px; }
            .bt-drop-mini { gap: 10px; padding: 5px 8px; border-width: 1px; margin-bottom: 8px; }
            .bt-drop-mini .bt-thumb { width: 24px; height: 42px; border-radius: 4px; }
            .bt-drop-mini .bt-thumb-empty { font-size: 16px; }
            .bt-drop-mini .bt-drop-tx { gap: 1px; } .bt-drop-mini .bt-drop-tx b { font-size: 12.5px; } .bt-drop-mini .bt-drop-tx span { font-size: 11px; }
            .bt-toggles { display: flex; flex-wrap: wrap; gap: 2px 18px; margin: 0 0 10px; }
            /* 🎞 bảng lớp Hậu Cảnh: 4 cột thẳng hàng (Lớp · Video · Bắt đầu · Kết thúc), mỗi lớp một hàng */
            .bt-lgrid { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto auto; gap: 6px 12px; align-items: center; margin: 0 0 10px; }
            .bt-lgrid .bt-drop { margin: 0; } .bt-lgrid .bt-lh { opacity: .7; } .bt-lgrid .bt-lcap { font-size: 12px; opacity: .8; }
            .bt-lgrid .bt-lms { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
            .bt-lgrid .bt-lms input { width: 68px; padding: 4px 6px; font-size: 12.5px; text-align: right; } .bt-lgrid .bt-lms em { font-style: normal; font-size: 11.5px; opacity: .6; }
            .bt-lgrid .bt-ladd { justify-self: start; }
            .bt-fit { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; } .bt-fit select { padding: 3px 6px; font-size: 12px; }
            .bt-toggles .ctc-toggle { margin: 2px 0; font-size: 12.5px; }
            .bt-modal-body .bt-sub { margin: 12px 0 4px; padding-top: 10px; border-top: 1px solid #1f2533; font-size: 11px; color: #9aa3b8; }
            .bt-modal-body .ctc-row { grid-template-columns: 168px minmax(0, 1fr) 66px 44px; gap: 8px; padding: 2px 0; border-bottom: 0; }
            .bt-modal-body .ctc-row label { font-size: 12.5px; color: #b8bfce; }
            .bt-modal-body .ctc-row input[type=number] { padding: 3px 6px; font-size: 12.5px; }
            .bt-modal-body .ctc-row .unit { font-size: 11px; }
            .bt-modal-body .hint { font-size: 11.5px; line-height: 1.45; color: #8b93a8; }
            .bt-foot { display: flex; gap: 10px; align-items: flex-start; margin-top: 8px; } .bt-foot .hint { flex: 1; margin: 0; } .bt-foot button { flex: none; }
            .bt-modal-body .bt-vids { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
            .bt-modal-body .bt-v .bt-thumb { height: 120px; } .bt-modal-body .bt-addv { min-height: 120px; }
            .bt-modal-body .bt-pass { padding: 6px 8px; }
            @media (max-width: 560px) { .bt-media { grid-template-columns: minmax(0, 1fr); } .bt-modal-body .ctc-row { grid-template-columns: 1fr 1fr 60px 36px; } }
            .bt-ctx { position: fixed; z-index: 10001; min-width: 220px; display: grid; gap: 2px; padding: 6px; background: #1a1f2b; border: 1px solid #2c3243;
                border-radius: 12px; box-shadow: 0 18px 40px rgba(0,0,0,.5); }
            .bt-ctx[hidden] { display: none; }
            .bt-ctx button { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 9px; align-items: center; text-align: left; padding: 6px 8px;
                background: transparent; border: 0; border-radius: 8px; color: #e6e8ee; cursor: pointer; }
            .bt-ctx button:hover { background: rgba(37,244,238,.12); }
            .bt-ctx button.danger { color: #ff6b8b; }
            .bt-ctx-ico { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: #10131b; border: 1px solid #2c3243; font-size: 15px; }
            .bt-ctx-tx b { display: block; font-size: 13.5px; } .bt-ctx-tx small { display: block; font-size: 11.5px; color: #8b93a8; }
        `;
        document.head.appendChild(st);
    }

    // CSS thẻ chỉnh sửa (ô số, hồ sơ, quà, kéo thả…) - trang Bộ Tách Người và popup mở từ trang chủ Game Camera đều cần.
    function ensureBodyCss() {
        if (document.getElementById('bt-body-css')) return;
        const st = document.createElement('style');
        st.id = 'bt-body-css';
        st.textContent = `
            #view-body .bt-body { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 24px; }
            #view-body #bt-status { margin-bottom: 8px; }
            #view-body .bt-body.noprev { grid-template-columns: minmax(0, 1fr); }
            #view-body .bt-body.noprev > .bt-prev { display: none; }
            #bt-btn-prev.on { border-color: #25f4ee; color: #25f4ee; }
            .bt-vplay:hover { transform: scale(1.1); background: #25f4ee; border-color: #25f4ee; color: #071216; }
            #view-body .bt-prev-wrap { position: relative; }
            #view-body .bt-prev-offmsg { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; text-align: center;
                background: #14151b; color: #c9cbd6; border-radius: 10px; font-size: 13px; line-height: 1.6; padding: 12px; }
            #view-body .bt-prev-wrap.off .bt-prev-offmsg { display: flex; }
            .bt-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; position: sticky; top: 0; z-index: 2; background: var(--bg, #0f1320); padding: 4px 0; }
            .bt-tab { display: grid; grid-template-columns: auto 1fr; column-gap: 6px; align-items: center; text-align: left; padding: 6px 10px; border-radius: 10px;
                border: 1px solid rgba(255,255,255,.15); background: #161b27; color: #cfd3dc; cursor: pointer; min-width: 120px; flex: 1; }
            .bt-tab span { grid-row: span 2; font-size: 18px; } .bt-tab b { font-size: 13px; } .bt-tab em { font-style: normal; font-size: 11px; opacity: .65; }
            .bt-tab:hover { background: #1f2533; color: #fff; }
            .bt-tab.on { border-color: #25f4ee; background: rgba(37,244,238,.14); color: #fff; }
            .bt-tab .n { font-style: normal; font-size: 11px; color: #25f4ee; }
            .bt-prev { position: sticky; top: 0; display: flex; flex-direction: column; gap: 8px; }
            .bt-prev-bar { display: flex; gap: 6px; } .bt-prev-bar select { flex: 1; min-width: 0; padding: 6px 8px; }
            #bt-frame { width: 300px; height: 533px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: #111; }
            .bt-vid { display: flex; gap: 6px; } .bt-vid input { flex: 1; min-width: 0; padding: 6px 8px; }
            .bt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
            .bt-chip { padding: 6px 12px; border-radius: 99px; border: 1px solid rgba(255,255,255,.22); background: #1a1f2b; color: #e6e8ee; cursor: pointer; font-weight: 700; }
            .bt-chip:hover { background: #252b3a; color: #fff; }
            .bt-chip.on { border-color: #25f4ee; background: rgba(37,244,238,.16); color: #fff; }
            .bt-chip.add { border-style: dashed; color: #25f4ee; background: transparent; }
            .bt-chip .live { color: #ff4f6d; margin-left: 4px; font-size: 11px; }
            .bt-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
            .bt-head select { flex: 1; min-width: 0; padding: 6px 8px; font-weight: 700; }
            .bt-name { flex: 1; min-width: 0; padding: 6px 10px; font-weight: 800; font-size: 14px; }
            .bt-sub { margin: 12px 0 6px; font-weight: 800; font-size: 12px; letter-spacing: .5px; opacity: .8; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
            .bt-sub select { margin-left: auto; padding: 4px 6px; }
            .bt-prof { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; font-size: 12px; }
            .bt-prof select { flex: 1; min-width: 0; padding: 5px 8px; }
            .bt-item { border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
            .bt-drop { display: flex; gap: 12px; align-items: center; padding: 10px; border: 2px dashed rgba(255,255,255,.18); border-radius: 10px; cursor: pointer; margin-bottom: 8px; }
            .bt-drop:hover, .bt-drop.over { border-color: #25f4ee; background: rgba(37,244,238,.06); }
            .bt-thumb { width: 54px; height: 96px; object-fit: cover; border-radius: 6px; background: #111; flex: none; }
            .bt-thumb-empty { display: grid; place-items: center; font-size: 26px; }
            .bt-drop-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
            .bt-drop-tx b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .bt-drop-tx span { font-size: 12px; opacity: .7; }
            .bt-drop-tx progress { width: 100%; height: 6px; accent-color: #25f4ee; }
            .bt-vvol { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
            .bt-vvol input[type=range] { width: 88px; }
            .bt-vvol em { font-style: normal; min-width: 34px; opacity: .8; }
            .bt-snd { display: flex; align-items: center; gap: 8px; padding: 7px 10px; margin-bottom: 8px; border: 1px dashed rgba(255,255,255,.18); border-radius: 10px; cursor: pointer; font-size: 13px; }
            .bt-snd:hover, .bt-snd.over { border-color: #25f4ee; background: rgba(37,244,238,.06); }
            .bt-snd.on { border-style: solid; border-color: rgba(37,244,238,.5); }
            .bt-snd b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
            .bt-snd input[type=range] { width: 90px; }
            .bt-snd em { font-style: normal; opacity: .7; font-size: 12px; min-width: 34px; text-align: right; }
            .bt-gift { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-top: 1px solid rgba(255,255,255,.08); }
            .bt-gift img { width: 34px; height: 34px; object-fit: contain; } .bt-gift b { flex: 1; min-width: 0; }
            .bt-gbox { border: 1px solid rgba(255,214,90,.35); background: rgba(255,214,90,.06); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; }
            .bt-gbox .bt-sub { margin-top: 0; color: #ffd95a; opacity: 1; }
            .bt-gbox.empty { border-style: dashed; }
            .bt-warn { color: #ffb36b; font-size: 12px; margin: 4px 0; }
            .bt-steps { margin: 6px 0 0 18px; padding: 0; line-height: 1.6; }
            .bt-add { margin: 0 0 12px; }
            .bt-dim { opacity: .45; pointer-events: none; }
            .bt-selrow { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
            .bt-selrow select, #view-body .ctc-row select { min-width: 0; max-width: 100%; padding: 6px 8px; }
            .bt-seg { display: inline-flex; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; overflow: hidden; }
            .bt-seg button { border: 0; border-radius: 0; padding: 4px 10px; background: #1a1f2b; color: #cfd3dc; cursor: pointer; }
            .bt-seg button.on { background: rgba(37,244,238,.22); color: #fff; font-weight: 800; }
            .bt-vids { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; margin-bottom: 8px; }
            .bt-v { position: relative; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
            .bt-v.pin { border-color: #25f4ee; } .bt-v.off { opacity: .55; }
            .bt-v .bt-thumb { width: 100%; height: 150px; }
            .bt-v-tag { position: absolute; left: 10px; top: 10px; font-size: 11px; background: rgba(0,0,0,.7); padding: 2px 6px; border-radius: 6px; }
            .bt-v-x { position: absolute; right: 8px; top: 8px; }
            .bt-v-acts { display: flex; gap: 4px; }
            .bt-v input.bt-vname { width: 100%; padding: 4px 6px; font-size: 12px; box-sizing: border-box; }
            .bt-fg { font-size: 11px; padding: 4px 6px; border: 1px dashed rgba(255,255,255,.2); border-radius: 6px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .bt-fg.on { border-style: solid; border-color: #7fe08a; color: #b9f5c0; } .bt-fg.over { border-color: #25f4ee; }
            .bt-addv { display: grid; place-items: center; text-align: center; border: 2px dashed rgba(255,255,255,.2); border-radius: 10px; cursor: pointer; min-height: 150px; font-size: 12px; padding: 8px; }
            .bt-addv b { font-size: 26px; } .bt-addv.over, .bt-addv:hover { border-color: #25f4ee; }
            .bt-pass { border: 1px solid rgba(111,168,255,.3); border-radius: 10px; padding: 8px; margin-bottom: 8px; }
            .bt-pass-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-weight: 700; }
            .bt-pass-head button.ghost { margin-left: auto; }
            .bt-tl { display: flex; height: 22px; border-radius: 6px; overflow: hidden; font-size: 10px; margin: 4px 0; }
            .bt-tl span { display: grid; place-items: center; color: #111; font-weight: 700; overflow: hidden; white-space: nowrap; min-width: 0; }
            .bt-tl-marks { font-size: 12px; opacity: .8; line-height: 1.5; }
            @media (max-width: 1000px) {
                #view-body .bt-body { grid-template-columns: minmax(0, 1fr) 320px; }
                #view-body .bt-body > .ctc-status { grid-column: 1 / -1; grid-row: 1; }
                #view-body .bt-body > .bt-col:not(.bt-prev) { grid-column: 1; grid-row: 2; }
                #view-body .bt-body > .bt-prev { grid-column: 2; grid-row: 2; }
            }
            @media (max-width: 760px) {
                #view-body .bt-body { grid-template-columns: minmax(0, 1fr); }
                #view-body .bt-body > .bt-prev { grid-column: 1; grid-row: 2; position: static; align-items: center; }
                #view-body .bt-body > .bt-col:not(.bt-prev) { grid-column: 1; grid-row: 3; }
            }`;
        document.head.appendChild(st);
    }

    // ---------- khung ----------
    function ensureView() {
        ensureGridCss();
        if ($('#view-body')) return $('#view-body');
        const host = ($('#view-dapmuoi') || $('.view')).parentNode;
        const sec = document.createElement('section');
        sec.id = 'view-body'; sec.className = 'view game-view bt-view';
        sec.innerHTML = `
            <header class="game-header">
                <div><h2>${hpT('Bộ Tách Người')}</h2><div class="game-sub">${hpT('Tách nền một lần cho mọi game')}</div></div>
                <div class="overlay-bar">
                    <button class="ghost small" onclick="hpOpenGame('camgames')" title="${hpTA('Về Game Camera')}">← Game Camera</button>
                    <button id="bt-btn-test" class="small" title="${hpTA('Chạy thử mục đầu của tab đang mở trên OBS + khung xem trước')}">${hpT('Thử')}</button>
                    <button id="bt-btn-prev" class="ghost small" title="${hpTA('Ẩn / hiện khung xem thử bên phải')}">${hpT('Khung thử')}</button>
                    <span class="nd-bar-spacer"></span>
                    <button id="bt-btn-copy" class="obs-link small" title="${hpTA('Thêm vào Scene đang chiếu - chưa nối OBS thì copy link')}">${hpT('Thêm vào OBS')}</button>
                    <button id="bt-btn-reload" class="ghost small" title="${hpTA('Tải lại overlay trong OBS')}">${hpT('Tải lại overlay')}</button>
                    <button id="bt-btn-save" class="ghost small" title="${hpTA('Lưu ngay')}">${hpT('Lưu')}</button>
                </div>
            </header>
            <div class="game-body bt-body">
                <div class="bt-col">
                    <div class="ctc-status" id="bt-status"></div>
                    <div class="bt-tabs" id="bt-tabs">${TABS.map(([id, ic, nm, sub]) => `<button class="bt-tab" data-tab="${id}"><span>${ic}</span><b>${nm}</b><em>${sub}</em></button>`).join('')}</div>
                    <div id="bt-settings"></div>
                </div>
                <div class="bt-col bt-prev">
                    <div class="bt-prev-bar">
                        <select id="bt-bg" title="${hpTA('Nền khung thử')}">
                            <option value="checker">${hpT('Nền ô cờ')}</option>
                            <option value="#1c1d24">${hpT('Nền tối')}</option>
                        </select>
                        <select id="bt-view" title="${hpTA('Soi tách nền')}">
                            <option value="">${hpT('Người đã tách')}</option>
                            <option value="split">${hpT('So sánh: trái thường - phải mịn')}</option>
                            <option value="alpha">${hpT('Mặt nạ alpha')}</option>
                            <option value="mask">${hpT('Mặt nạ thô của model')}</option>
                        </select>
                        <button id="bt-prev-reload" class="ghost small" title="${hpTA('Nạp lại khung thử')}">↻</button>
                        <button id="bt-prev-off" class="ghost small" title="${hpTA('Bật/tắt khung xem thử - tốn GPU, rời trang là tự tắt')}">▶</button>
                    </div>
                    <div class="bt-prev-wrap"><iframe id="bt-frame" title="${hpTA('Xem trước Bộ Tách Người')}"></iframe><div class="bt-prev-offmsg">${hpT('Xem thử đang TẮT cho nhẹ máy')}<br><small>${hpT('OBS vẫn chạy bình thường - bấm nút phát trên thanh để bật')}</small></div></div>
                    <div class="bt-vid">
                        <input id="bt-video" type="text" placeholder="${hpTA('Video thử thay camera - dán đường dẫn file (vd G:\\\\mau.mp4)')}" />
                        <button id="bt-video-go" class="ghost small">Xem</button>
                    </div>
                </div>
            </div>`;
        host.appendChild(sec);
        ensureBodyCss();
        return sec;
    }

    function attachSocket(sk) {
        if (!sk || sk.__btAttached) return;
        sk.__btAttached = true;
        sk.on('gameConfig', ({ gameId, config }) => {
            if (gameId !== 'body' || persistTimer) return;
            const next = norm(config);
            if (cfg && JSON.stringify(next) === JSON.stringify(cfg)) return;
            cfg = next; renderSettings();
        });
        sk.on('body:profile', d => { meta.activeProfileId = String(d?.profileId || ''); renderChips(); renderStatus(); });
    }
    function open(sharedSocket) {
        socket = sharedSocket;
        const view = ensureView();
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v === view));
        if (!bound) { bindShell(); bound = true; }
        attachSocket(socket);
        if (socket) socket.emit('subscribe', 'preview');
        Promise.all([loadMeta(), loadConfig()]).then(() => { renderSettings(); reloadPreview(); })
            .catch(() => window.toast?.(hpT('Không tải được cấu hình Bộ Tách Người - bấm lại ⚙ Cài đặt để thử lại'), 'error'));
        clearInterval(feedPoll);
        feedPoll = setInterval(poll, 2000);
        poll();
    }
    async function poll() {
        const view = $('#view-body');
        if (!view || !view.classList.contains('active')) { clearInterval(feedPoll); feedPoll = null; return; }
        try { feedStatus = (await (await fetch('/api/camgames/feed-status', { cache: 'no-store' })).json()).status || null; }
        catch (e) { feedStatus = null; }
        const before = JSON.stringify([meta.groups, meta.enabledNpcIds, meta.activeProfileId, meta.board]);
        await loadMeta();
        if (JSON.stringify([meta.groups, meta.enabledNpcIds, meta.activeProfileId, meta.board]) !== before) { renderChips(); renderNpcSelect(); }
        renderStatus();
    }
    async function loadMeta() {
        try { const j = await fetch('/api/body/meta', { cache: 'no-store' }).then(r => r.json()); if (j && Array.isArray(j.groups)) meta = j; } catch (_) {}
    }
    async function loadConfig() {
        // Nạp lỗi (server bận / đang khởi động lại) → ném lỗi, KHÔNG dùng config mặc định: lưu đè bản mặc định lên config thật là mất game.
        for (let i = 0; ; i++) {
            try {
                const r = await fetch('/api/games/body/config', { cache: 'no-store' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                cfg = norm(await r.json());
                break;
            } catch (e) { if (i >= 4) throw e; await new Promise(res => setTimeout(res, 1000)); }   // thử lại 5 lần, ~1 s / lần
        }
        if (!cfg.profiles.some(p => p.id === sel)) setSel(meta.activeProfileId || (cfg.profiles[0] && cfg.profiles[0].id) || '');
    }
    function schedulePersist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistConfig, 350); }
    // Lưu nhanh lúc đang kéo (thanh âm lượng mp3): tối đa 1 lần / 150 ms, lần cuối luôn được gửi - overlay đổi âm lượng ngay khi nhận.
    let liveAt = 0, liveTimer = null;
    function livePersist() {
        clearTimeout(liveTimer);
        const wait = 150 - (Date.now() - liveAt);
        const go = () => { liveAt = Date.now(); clearTimeout(persistTimer); persistConfig(); };
        if (wait <= 0) go(); else liveTimer = setTimeout(go, wait);
    }
    async function persistConfig() {
        persistTimer = null;
        try { await fetch('/api/games/body/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); }
        catch (e) { console.error('[body] lưu config lỗi', e); }
    }
    function flashBtn(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1200); }
    async function runTest(body, btn) {
        if (persistTimer) { clearTimeout(persistTimer); await persistConfig(); }   // thử đúng bản đang sửa
        try {
            const p = cur();
            const r = await fetch('/api/body/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: p ? p.id : '', ...body }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) window.toast?.(j.error || hpT('Không chạy thử được'), 'error');
            else if (btn && body.kind && btn.dataset.act === 'test') markTesting(body.kind, String(j.id || body.id || ''));
            else if (btn) flashBtn(btn, hpT('✓ Đang chạy'));
        } catch (e) { window.toast?.(hpT('Không gọi được server'), 'error'); }
    }
    // ▶ Thử ↔ ⏹ Ngưng (user 2026-10-21): bấm Thử xong nút thành Ngưng tới hết lượt (ước lượng estimateMs + 1,5 s) hoặc tới khi bấm Ngưng
    // (POST /api/body/stop → overlay dừng lượt + bỏ lượt chờ của kịch bản đó). Vẽ lại thẻ (renderSettings) vẫn giữ trạng thái.
    let testRun = null;            // { key: kind:id, until, timer }
    const testKey = (kind, id) => kind + ':' + id;
    function markTesting(kind, id) {
        const x = listOf(kind).find(y => y.id === id);
        const est = x ? HB().estimateMs(kind, x) : 0;
        if (testRun) clearTimeout(testRun.timer);
        testRun = { key: testKey(kind, id), until: Date.now() + Math.max(2000, est || 15000) + 1500 };
        testRun.timer = setTimeout(() => { testRun = null; refreshTestBtns(); }, testRun.until - Date.now());
        refreshTestBtns();
    }
    function refreshTestBtns() {
        document.querySelectorAll('.bt-item [data-act=test]').forEach(b => {
            const card = b.closest('.bt-item'), kind = card && card.dataset.kind, x = kind ? listOf(kind)[Number(card.dataset.i)] : null;
            const on = !!(x && testRun && testRun.key === testKey(kind, x.id) && Date.now() < testRun.until);
            if (!b.dataset.title0) b.dataset.title0 = b.title;
            b.textContent = on ? hpT('Ngưng') : hpT('Thử');
            b.classList.toggle('danger', on);
            b.dataset.testing = on ? '1' : '';
            b.title = on ? hpTA('Ngưng lượt đang chạy trên OBS + khung xem trước (bỏ cả lượt đang chờ của kịch bản này)') : b.dataset.title0;
        });
    }
    async function stopTest(kind, x) {
        try {
            const r = await fetch('/api/body/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id: x.id }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) { window.toast?.(j.error || hpT('Không ngưng được'), 'error'); return; }
        } catch (_) { window.toast?.(hpT('Không gọi được server'), 'error'); return; }
        if (testRun) { clearTimeout(testRun.timer); testRun = null; }
        refreshTestBtns();
        window.toast?.(hpT('Đã ngưng "{name}"', { name: x.name }), 'success');
    }

    function previewUrl() {
        const p = new URLSearchParams({ review: '1', stats: '1', bg: previewBg });
        const pr = cur(); if (pr) p.set('profile', pr.id);
        if (previewView === 'split') p.set('split', '0.5');
        else if (previewView) p.set('view', previewView);
        if (testVideo) p.set('src', '/api/body/file?path=' + encodeURIComponent(testVideo)); // file phải đăng ký trước: registerTestVideo
        return '/overlay/body?' + p.toString();
    }
    // 🔒 /api/body/file chỉ phát file trong thư mục media đang dùng → video thử gõ tay phải đăng ký với server trước khi nạp khung.
    let testVideoRegistered = '';
    async function registerTestVideo() {
        if (!testVideo || /^\/(media|games|api\/body\/asset)\//i.test(testVideo) || testVideoRegistered === testVideo) return;
        try { await fetch('/api/body/test-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: testVideo }) }); testVideoRegistered = testVideo; } catch (_) {}
    }
    async function reloadPreview() { await registerTestVideo(); const f = $('#bt-frame'); if (f) f.src = previewUrl(); }

    function bindShell() {
        $('#bt-btn-copy').addEventListener('click', () => {
            const url = window.buildOverlayURL ? window.buildOverlayURL('/overlay/camgames') : (location.origin + '/overlay/camgames');
            if (window.hpObsQuick) { window.hpObsQuick(url, 'Game Camera').then((m) => flashBtn($('#bt-btn-copy'), m)); return; }
            if (window.hpCopyText) window.hpCopyText(url); else navigator.clipboard.writeText(url).catch(() => {});
            flashBtn($('#bt-btn-copy'), hpT('Đã copy'));
        });
        $('#bt-btn-reload').addEventListener('click', () => { if (socket) socket.emit('overlay:reload', { gameId: 'body' }); flashBtn($('#bt-btn-reload'), '✓'); });
        $('#bt-btn-save').addEventListener('click', async () => { clearTimeout(persistTimer); await persistConfig(); flashBtn($('#bt-btn-save'), hpT('✓ Đã lưu')); });
        $('#bt-btn-test').addEventListener('click', () => {
            // game đang mở popup → game đó; không thì game đầu của lưới (theo tìm / lọc đang chọn)
            const g = cfg ? (gOpen && gFind(gOpen)) || gVisible()[0] : null;
            if (!g) return window.toast?.(hpT('Chưa có mục nào để thử'), 'error');
            runTest({ kind: g.kind, id: g.x.id }, $('#bt-btn-test'));
        });
        $('#bt-tabs').addEventListener('click', e => {
            const b = e.target.closest('[data-tab]'); if (!b) return;
            tab = b.dataset.tab; try { localStorage.setItem('hpal.body.tab', tab); } catch (_) {}
            renderSettings();
        });
        $('#bt-bg').addEventListener('change', e => { previewBg = e.target.value; reloadPreview(); });
        $('#bt-view').addEventListener('change', e => { previewView = e.target.value; reloadPreview(); });
        $('#bt-prev-reload').addEventListener('click', reloadPreview);
        // ⏸ / ▶ khung thử - mặc định TẮT mỗi lần mở app cho nhẹ máy; rời trang / ẩn menu thì panel.html tự tắt lại (hp-preview-off).
        const applyOff = (off) => {
            $('#bt-frame').dataset.hpOff = off ? '1' : '0';
            $('#bt-prev-off').textContent = off ? '▶' : '⏸';
            $('#bt-prev-off').closest('.bt-prev').querySelector('.bt-prev-wrap').classList.toggle('off', off);
            window.__hpPreviewSync?.();
        };
        let prevOff = true;
        applyOff(prevOff);
        // 🖼 Khung thử: cột phải ẩn hẳn (mặc định) → lưới game rộng hết bề ngang; hiện lại thì vẫn ⏸ tới khi bấm ▶ trên khung
        let showPrev = false;
        try { showPrev = localStorage.getItem('hpal.body.prev') === '1'; } catch (_) {}
        const applyPrev = () => {
            $('#view-body .bt-body').classList.toggle('noprev', !showPrev);
            $('#bt-btn-prev').classList.toggle('on', showPrev);
            if (!showPrev) { prevOff = true; applyOff(true); }
        };
        applyPrev();
        $('#bt-btn-prev').addEventListener('click', () => { showPrev = !showPrev; try { localStorage.setItem('hpal.body.prev', showPrev ? '1' : '0'); } catch (_) {} applyPrev(); });
        $('#bt-prev-off').addEventListener('click', () => { prevOff = !prevOff; applyOff(prevOff); });
        $('#bt-frame').addEventListener('hp-preview-off', () => { prevOff = true; applyOff(true); });
        const vid = $('#bt-video');
        vid.value = testVideo;
        const go = () => {
            testVideo = vid.value.trim().replace(/^"|"$/g, '');
            try { localStorage.setItem('hpal.body.testVideo', testVideo); } catch (_) {}
            reloadPreview();
        };
        $('#bt-video-go').addEventListener('click', go);
        vid.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    }

    function renderStatus() {
        const el = $('#bt-status'); if (!el) return;
        const chips = [];
        const fs = feedStatus || {};
        if (fs.obsConnected === false) chips.push(`<span class="ctc-chip warn">${hpT('Chưa kết nối OBS')}</span>`);
        else if (!fs.source) chips.push(`<span class="ctc-chip warn">${hpT('Chưa chọn nguồn camera - chọn ở Game Camera')}</span>`);
        else if (fs.error) chips.push(`<span class="ctc-chip warn">📷 ${esc(fs.source)} - ${esc(fs.error)}</span>`);
        else chips.push(`<span class="ctc-chip ${fs.live ? 'ok' : 'warn'}">📷 ${esc(fs.source)}${fs.live ? hpT(' · {v} hình/s', { v: fs.fps || 0 }) : hpT(' - chưa có hình')}</span>`);
        const ov = fs.overlays ? fs.overlays.body : null;
        if (ov) chips.push(`<span class="ctc-chip ${ov.pose ? 'ok' : ''}">${hpT('{v} - {v2} khung/s - tách {v3}ms - {v4}', { v: ov.pose ? hpT('thấy người') : hpT('chưa thấy người'), v2: Math.round(ov.fps || 0), v3: Math.round(ov.aiMs || 0), v4: esc(ov.delegate || '') })}</span>`);
        else chips.push(`<span class="ctc-chip dim">${hpT('Overlay chưa gửi tín hiệu')}</span>`);
        // 🐢 Browser Source trong OBS không có GPU → game có video trong suốt / nền phòng giật (alpha-pack.mjs softwareWebGL).
        if (ov && ov.softGL) chips.push(`<span class="ctc-chip warn" title="${hpT('OBS → Cài đặt → Nâng cao → bật Tăng tốc phần cứng nguồn trình duyệt, mở lại OBS. Máy 2 card: Cài đặt Windows → Đồ họa → OBS → Hiệu năng cao.')}">${hpT('🐢 OBS tắt tăng tốc phần cứng Browser Source - game sẽ giật')}</span>`);
        const cs = meta.cam || {};
        if (cs.hidden) chips.push(`<span class="ctc-chip ok">${hpT('Cam gốc đang ẩn (đang chạy hiệu ứng)')}</span>`);
        else if (cs.pending) chips.push(`<span class="ctc-chip warn">${hpT('Đang chờ trả cam gốc về chỗ cũ (chờ OBS)')}</span>`);
        if (cs.error) chips.push(`<span class="ctc-chip warn">📷 ${esc(cs.error)}</span>`);
        if (cfg) {
            const live = cfg.profiles.find(p => p.id === meta.activeProfileId);
            const p0 = live || cfg.profiles[0];
            if (p0) chips.push(`<span class="ctc-chip ok">${hpT('Cỡ người: {scale}%', { scale: p0.scale })}</span>`);
            const miss = (meta.missingSamples || []).length;
            if (miss) chips.push(`<span class="ctc-chip warn" title="${hpTA('Chưa có trong public/games/body/samples: {v}', { v: (meta.missingSamples || []).map(f => f.split('/').pop()).join(', ') })}">${hpT('📦 Thiếu {n} file mẫu - game cần chúng chưa chạy được', { n: miss })}</span>`);
            const n = k => listOf(k).filter(x => x.gifts.length).length;
            chips.push(`<span class="ctc-chip ${n('haucanh') + n('roiho') + n('biduoi') + n('vidfx') + n('cry') + n('heart') + n('catch') + n('morph') ? '' : 'warn'}">${hpT('🎁 Có quà: 🦊 {v} - 🕳️ {v2} - 🏃 {v3} - 🎬 {v4} - 😭 {v5}', { v: n('haucanh'), v2: n('roiho'), v3: n('biduoi'), v4: n('vidfx'), v5: n('cry') })} - 💗 ${n('heart')} - 🔴 ${n('catch')} - ✨ ${n('morph')}</span>`);
        }
        el.innerHTML = chips.join(' ');
    }

    // ---------- mẩu dùng chung ----------
    function row(key, label, min, max, step, val, unit, hint) {
        return `<div class="ctc-row" data-k="${key}"${hint ? ` title="${esc(hint)}"` : ''}><label>${label}</label>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <input type="number" min="${min}" max="${max}" step="${step}" value="${fmt(val)}" />
            <span class="unit">${unit}</span></div>`;
    }
    const seg = (act, val, extra = '') => `<span class="bt-seg" ${extra}>${['left', 'right'].map(d => `<button type="button" class="${val === d ? 'on' : ''}" data-act="${act}" data-v="${d}">${DIR[d]}</button>`).join('')}</span>`;
    const edge = () => { const m = cfg.matte; return { c: (m.lo + m.hi) / 2, w: m.hi - m.lo }; };
    // 🎞 .pack.mp4 = nửa trái màu + nửa phải mặt nạ xám → class "packed" (CSS object-view-box): ảnh xem trước chỉ lấy nửa màu,
    // cắt trước khi co khung nên đúng mọi cỡ ô (Ô lưới gTile cũng vậy).
    function thumb(file, cls = 'bt-thumb') {
        return isVid(file) ? `<video class="${cls}${isPacked(file) ? ' packed' : ''}" src="${esc(fileUrl(file))}" muted loop playsinline preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()"></video>`
            : `<img class="${cls}" src="${esc(fileUrl(file))}" alt="">`;
    }
    function dropZone(act, file, emptyTitle, emptyHint) {
        return `<div class="bt-drop" data-drop="${act}" title="${hpTA('Bấm để chọn file, hoặc kéo thả video / ảnh vào đây')}">
                ${file ? thumb(file) : '<div class="bt-thumb bt-thumb-empty">📼</div>'}
                <div class="bt-drop-tx">${file ? `<b>${esc(fileLabel(file))}</b><span>${hpT('Bấm / kéo thả để đổi')}</span>` : `<b>${emptyTitle}</b><span>${emptyHint}</span>`}</div>
                ${file ? `<button class="ghost small" data-act="clear-${act}" title="${hpTA('Bỏ file')}">✕</button>` : ''}
                <input type="file" accept="video/*,image/*" hidden />
            </div>`;
    }
    async function uploadOne(file) {
        const r = await fetch('/api/body/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.error || hpT('Tải lên lỗi'));
        return j.url;
    }
    // 🎞 webm CÓ kênh alpha → tự đổi sang ….pack.mp4 (H.264 nửa màu + nửa alpha, GPU giải mã - alpha-pack.mjs) ngay trong panel
    // bằng WebCodecs (/games/body/pack-convert.mjs) rồi mới tải lên: bản cài không có ffmpeg. mp4 thường / webm không alpha giữ
    // nguyên (đã nhẹ). mov trong suốt (qtrle / ProRes) trình duyệt không giải mã được → giữ nguyên + nhắc scripts/pack-alpha.cjs.
    // onProgress(0…1) lúc đang đổi. Trả file sẽ tải lên (bản đã đổi hoặc gốc).
    let packMod, packChain = Promise.resolve();        // các lượt đổi xếp hàng lần lượt (thả 2 file liền tay không chạy song song)
    async function prepUpload(file, onProgress) {
        if (!/\.webm$/i.test(file.name)) {
            if (/\.mov$/i.test(file.name) && !(await canPlay(file))) window.toast?.(hpT('⚠ .mov này trình duyệt không phát được - đổi sang .pack.mp4 (scripts/pack-alpha.cjs)'), 'warn');
            return file;
        }
        const M = await (packMod ||= import('/games/body/pack-convert.mjs').catch(() => null));
        if (!M || !M.canPack() || !(await M.isAlphaWebm(file))) return file;
        try {
            const run = () => M.packAlphaWebm(file, { onProgress });
            const job = packChain.then(run, run);
            packChain = job.catch(() => {});
            const out = await job;
            window.toast?.(hpT('🎞 {v} → .pack.mp4: GPU giải mã, nhẹ máy', { v: file.name }));
            return out;
        } catch (e) { window.toast?.(hpT('Không đổi được sang .pack.mp4 - dùng webm gốc ({v})', { v: e.code || e.message }), 'warn'); return file; }
    }
    // Trình duyệt phát được file này không (mov qtrle / ProRes 4444 thì không)? Chỉ đọc metadata; quá 8 s coi như được.
    const canPlay = file => new Promise(res => {
        const v = document.createElement('video'), url = URL.createObjectURL(file), fin = ok => { URL.revokeObjectURL(url); res(ok); };
        v.onloadedmetadata = () => fin(true); v.onerror = () => fin(false); setTimeout(() => fin(true), 8000); v.src = url;
    });
    // Tải video / ảnh vào app (media/ của app, cùng API tải file hiệu ứng) → overlay đọc /media/… như mọi file hiệu ứng.
    async function upload(file, zone, done) {
        if (!file) return;
        if (!/^(video|image)\//.test(file.type) && !/\.(mp4|webm|mov|mkv|m4v|png|jpe?g|webp|gif)$/i.test(file.name)) { window.toast?.(hpT('Chỉ nhận video hoặc ảnh'), 'error'); return; }
        const tx = zone.querySelector('.bt-drop-tx');
        const show = (t, s) => { if (tx) tx.innerHTML = `<b>${t}</b><span>${s}</span>`; };
        show(hpT('⏳ Đang tải {v}…', { v: esc(file.name) }), `${(file.size / 1048576).toFixed(1)} MB`);
        try {
            const up = await prepUpload(file, p => show(hpT('🎞 Đang đổi sang .pack.mp4… {v} %', { v: Math.round(p * 100) }), `<progress max="100" value="${Math.round(p * 100)}"></progress>`));
            if (up !== file) show(hpT('⏳ Đang tải {v}…', { v: esc(up.name) }), `${(up.size / 1048576).toFixed(1)} MB`);
            done(await uploadOne(up), up); renderSettings(); schedulePersist();
        }
        catch (e) { window.toast?.(e.message || hpT('Tải lên lỗi'), 'error'); renderSettings(); }
    }
    function bindDrop(zone, done) {
        if (!zone) return;
        const fileIn = zone.querySelector('input[type=file]');
        zone.addEventListener('click', e => { if (e.target !== fileIn && !e.target.closest('[data-act]')) fileIn.click(); });
        fileIn.addEventListener('change', () => upload(fileIn.files[0], zone, done));
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('over'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); upload(e.dataTransfer.files[0], zone, done); });
    }
    // ---------- phần đầu GỌN của mọi thẻ game (user 2026-10-20: "gọn, chuyên nghiệp") ----------
    // Hàng 3 ô: 🧍 Áp dụng cho · 📋 Danh sách · 🎵 Nhạc nền (chữ ngắn, giải thích ở tooltip) → hàng 🎁 Quà + 🔊 mp3 dạng chip.
    const optCell = (cap, title, inner) => `<label class="bt-opt" title="${title}"><span>${cap}</span>${inner}</label>`;
    function profSelect(x) {
        return '';      // HP Action LIVE: một hồ sơ - không chọn "Áp dụng cho"
    }
    function profSelectNpc(x) {
        const opts = [`<option value="" ${!x.profileId ? 'selected' : ''}>${hpT('Mọi người')}</option>`]
            .concat(cfg.profiles.map(p => `<option value="${esc(p.id)}" ${x.profileId === p.id ? 'selected' : ''}>🧍 ${esc(npcName(p.groupId))}${p.id === meta.activeProfileId ? hpT(' · đang chạy') : ''}</option>`));
        if (x.profileId && !profOf(x.profileId)) opts.push(`<option value="${esc(x.profileId)}" selected>${hpT('⚠ Hồ sơ đã xoá - không chạy')}</option>`);
        return optCell(hpT('Áp dụng cho'), hpTA('Chỉ chạy khi người của hồ sơ này đang bật. Mọi người = người nào cũng chạy (hồ sơ cụ thể được ưu tiên khi trùng quà)'), `<select data-act="prof">${opts.join('')}</select>`);
    }
    // Phần đầu chung: hàng tuỳ chọn + hàng quà / âm thanh.
    function cardTop(kind, x, icon, hint) {
        const opts = profSelect(x) + modeSelect(kind, x);
        return `${opts ? `<div class="bt-opts">${opts}</div>` : ''}
            <div class="bt-media">${giftBox(x, icon, hint)}${sndBox(x)}</div>`;
    }
    // 📋 Vào DANH SÁCH HIỆU ỨNG (body/core.cjs QUEUE_MODES): Rơi Hố / Bị Đuổi mặc định ⏭ Kế tiếp, Hậu Cảnh mặc định 🔗 Kèm Bảng Quà.
    const QUEUE_MODES = [   // [giá trị, chữ ngắn trong ô, giải thích (tooltip)]
        ['next', hpT('⏭ Kế tiếp'), hpT('⏭ Kế tiếp #1 - vào DANH SÁCH, phát ngay sau hiệu ứng đang chạy (người thấy trước)')],
        ['queue', hpT('📋 Xếp hàng'), hpT('📋 Xếp hàng - vào cuối DANH SÁCH như quà thường')],
        ['attach', hpT('🔗 Kèm Bảng Quà'), hpT('🔗 Kèm Bảng Quà - chạy cùng lúc hiệu ứng Bảng Quà của quà này (không có thì như Kế tiếp)')],
        ['now', hpT('⚡ Phát ngay'), hpT('⚡ Phát ngay - ngoài danh sách, chạy song song ngay khi nhận quà')]
    ];
    // 🎵 Nhạc nền lúc game chạy (body/core.cjs RUN_MODES) - như nút 🎵/🔔/🔇 của 🎁 Bảng Quà. Chỉ hàng riêng (⏭ / 📋) mới theo được:
    // chọn 🔔 / 🔇 khi game đang 🔗 Kèm / ⚡ Phát ngay → tự chuyển sang ⏭ Kế tiếp.
    const RUN_MODES = [
        ['normal', '🎵', hpT('🎵 Chạy chung với nhạc nền')],
        ['background', '🔔', hpT('🔔 Chạy nền')],
        ['mute', '🔇', hpT('🔇 Không chạy chung nhạc nền')]
    ];
    const qModeOf = (kind, x) => x.queueMode || (kind === 'haucanh' ? 'attach' : 'next');
    const runOf = x => (RUN_MODES.some(r => r[0] === x.runMode) ? x.runMode : 'normal');
    const nextRunMode = (kind, x) => RUN_MODES[(RUN_MODES.findIndex(r => r[0] === runOf(x)) + 1) % RUN_MODES.length][0];
    function setRunMode(kind, x, mode) {
        x.runMode = mode;
        if (mode !== 'normal' && ['attach', 'now'].includes(qModeOf(kind, x))) x.queueMode = 'next';
    }
    function runBadge(kind, x) {
        return '';      // HP Action LIVE: không có nhạc nền theo danh sách
    }
    function runBadgeNpc(kind, x) {
        const r = RUN_MODES.find(m => m[0] === runOf(x));
        return `<span class="bt-vrun ${r[0]}" data-run role="button" title="${hpTA('{v} - bấm để đổi', { v: r[2] })}">${r[1]}</span>`;
    }
    function modeSelect(kind, x) {
        return '';      // HP Action LIVE: quà luôn chạy ngay - không có 📋 Danh sách hiệu ứng / nhạc nền
    }
    function modeSelectNpc(kind, x) {
        const cur = qModeOf(kind, x), run = runOf(x);
        return optCell(hpT('Vào danh sách'), hpTA('Quà về thì hiệu ứng này đi vào DANH SÁCH HIỆU ỨNG thế nào (cùng danh sách với Bảng Quà, ĐẶC BIỆT, Táp tim…)'),
                `<select data-act="qmode">${QUEUE_MODES.map(([v, n, d]) => `<option value="${v}" title="${esc(d)}" ${cur === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)
            + optCell(hpT('Nhạc nền'), hpTA('Nhạc nền lúc game chạy'), `<select data-act="rmode">${RUN_MODES.map(([v, , n]) => `<option value="${v}" ${run === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`);
    }
    // Áp một chế độ nhạc nền cho MỌI game của Bộ Tách Người.
    function setRunModeAll(mode) {
        const all = gAll();
        for (const { kind, x } of all) setRunMode(kind, x, mode);
        window.toast?.(hpT('{v} - {n} game', { v: RUN_MODES.find(r => r[0] === mode)[2], n: all.length }), 'success');
        renderSettings(); schedulePersist();
    }
    function giftBox(x, kindIcon, hint) {
        const tag = () => '';
        // Đa phần chỉ 1 quà → chip nhỏ (ảnh + tên + ✕) và nút ＋ gọn; chưa có quà thì nút "＋ Gắn quà" nổi bật.
        return `<div class="bt-gbox${x.gifts.length ? '' : ' empty'}" title="${hpTA('QUÀ KÍCH HOẠT - {hint}', { hint })}">
            <span class="bt-cap">${hpT('Quà')}</span>
            ${x.gifts.map((g, gi) => `<span class="bt-gchip">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}<b>${esc(g.giftName || (hpT('Quà #{giftId}', { giftId: g.giftId })))}${tag(g)}</b><button class="ghost small" data-act="gdel" data-gi="${gi}" title="${hpTA('Bỏ quà này')}">✕</button></span>`).join('')}
            <button class="small ${x.gifts.length ? 'ghost bt-gplus' : 'primary'}" data-act="gadd" title="${hpTA('Gắn quà tặng {kindIcon}', { kindIcon })}">${x.gifts.length ? '＋' : hpT('＋ Gắn quà')}</button>
        </div>`;
    }
    // 🔊 mp3 riêng của game - phát CÙNG tiếng video; không có mp3 + video không tiếng → tiếng giả lập (overlay.html sfxOn).
    function sndBox(x) {
        const f = x.sfxFile;
        return `<div class="bt-snd${f ? ' on' : ''}" data-snd title="${hpTA('Bấm để chọn, hoặc kéo thả mp3 / wav / m4a vào đây - phát cùng tiếng video. Không có mp3 lẫn tiếng video thì dùng tiếng giả lập')}">
                <span class="bt-cap">🔊</span><b>${f ? esc(fileLabel(f)) : hpT('Thêm mp3 riêng')}</b>
                ${f ? `<input type="range" min="0" max="100" step="1" value="${x.sfxVol}" data-act="sndvol" title="${hpTA('Âm lượng mp3')}"><em>${x.sfxVol}%</em>
                    <button class="ghost small" data-act="sndplay" title="${hpTA('Nghe thử')}">▶</button><button class="ghost small" data-act="snddel" title="${hpTA('Bỏ mp3')}">✕</button>` : ''}
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" hidden />
            </div>`;
    }
    // Ô "🎧 Tiếng giả lập" (chỉ khi chưa có mp3 riêng) - đặt trong hàng công tắc của thẻ.
    // 🎧 một ô duy nhất: chưa có mp3 = bật / tắt tiếng giả lập; có mp3 = tiếng giả lập chạy CÙNG mp3 (sfxMix, mặc định tắt; Ninja / Son Goku bật)
    const synthToggle = (x, synth) => !synth ? '' : x.sfxFile
        ? `<label class="ctc-toggle" title="${hpTA('🎧 Có mp3 riêng: bật để tiếng giả lập (va chạm, gió, vút…) vẫn chạy cùng mp3; tắt = chỉ mp3')}"><input type="checkbox" data-act="sfxmix" ${x.sfxMix ? 'checked' : ''}> ${hpT('🎧 Tiếng giả lập cùng mp3')}</label>`
        : `<label class="ctc-toggle" title="${hpTA('🎧 Tiếng giả lập khi video không có tiếng (va chạm, gió, vút…)')}"><input type="checkbox" data-act="sfxon" ${x.sfx !== false ? 'checked' : ''}> ${hpT('🎧 Tiếng giả lập')}</label>`;
    // Khung chọn video / ảnh gọn: 1 dòng tên file, gợi ý dài ở tooltip.
    function dropMini(act, file, emptyTitle, hint) {
        return `<div class="bt-drop bt-drop-mini" data-drop="${act}" title="${esc(hint)}">
                ${file ? thumb(file) : '<div class="bt-thumb bt-thumb-empty">📼</div>'}
                <div class="bt-drop-tx">${file ? `<b>${esc(fileLabel(file))}</b><span>${hpT('Bấm / kéo thả để đổi')}</span>` : `<b>${emptyTitle}</b><span>${hpT('Bấm hoặc kéo thả video / ảnh')}</span>`}</div>
                ${file ? `<button class="ghost small" data-act="clear-${act}" title="${hpTA('Bỏ file')}">✕</button>` : ''}
                <input type="file" accept="video/*,image/*" hidden />
            </div>`;
    }
    // 🔈 Âm lượng tiếng video (vidVol) - đặt cạnh công tắc "Tiếng video"; kéo là nghe đổi ngay trên OBS (livePersist → overlay sndLiveVol).
    const vidVolCtl = x => `<span class="bt-vvol" title="${hpTA('Âm lượng tiếng video - kéo là nghe đổi ngay')}"><input type="range" min="0" max="100" step="1" value="${x.vidVol ?? 100}" data-act="vidvol"><em>${x.vidVol ?? 100}%</em></span>`;
    let sndPrev = null;
    function bindSnd(card, x) {
        card.querySelectorAll('[data-act=vidvol]').forEach(r => {
            r.addEventListener('input', () => { x.vidVol = Number(r.value); r.nextElementSibling.textContent = x.vidVol + '%'; livePersist(); });
            r.addEventListener('change', () => schedulePersist());
        });
        const box = card.querySelector('[data-snd]');
        if (!box) return;
        const inp = box.querySelector('input[type=file]'), lbl = box.querySelector('b');
        const take = async file => {
            if (!file) return;
            if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name)) { window.toast?.(hpT('Chỉ nhận file âm thanh (mp3, wav, m4a…)'), 'error'); return; }
            lbl.textContent = hpT('⏳ Đang tải {v}…', { v: file.name });
            try { x.sfxFile = await uploadOne(file); x.sfxVol = x.sfxVol || 100; } catch (e) { window.toast?.(e.message || hpT('Tải lên lỗi'), 'error'); }
            renderSettings(); schedulePersist();
        };
        box.addEventListener('click', e => {
            const a = e.target.closest('[data-act]'), act = a && a.dataset.act;
            if (act === 'sndvol') return;
            e.stopPropagation();
            if (act === 'snddel') { x.sfxFile = ''; if (sndPrev) sndPrev.pause(); renderSettings(); schedulePersist(); return; }
            if (act === 'sndplay') {
                if (sndPrev && !sndPrev.paused) { sndPrev.pause(); return; }
                if (sndPrev) sndPrev.pause();
                sndPrev = new Audio(fileUrl(x.sfxFile)); sndPrev.__file = x.sfxFile; sndPrev.volume = x.sfxVol / 100; sndPrev.play().catch(() => {}); return;
            }
            if (e.target !== inp) inp.click();
        });
        inp.addEventListener('change', () => take(inp.files[0]));
        box.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); });
        box.addEventListener('dragleave', () => box.classList.remove('over'));
        box.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take(e.dataTransfer.files[0]); });
        const vol = box.querySelector('[data-act=sndvol]');
        if (vol) {
            // kéo là nghe đổi NGAY: ▶ nghe thử trong panel + mp3 đang phát trên OBS (lưu nhanh ≤ 150 ms / lần, overlay sndLiveVol)
            vol.addEventListener('input', () => {
                x.sfxVol = Number(vol.value); box.querySelector('em').textContent = x.sfxVol + '%';
                if (sndPrev && sndPrev.__file === x.sfxFile) sndPrev.volume = x.sfxVol / 100;
                livePersist();
            });
            vol.addEventListener('change', () => schedulePersist());
        }
        const on = card.querySelector('[data-act=sfxon]');
        if (on) on.addEventListener('change', e => { x.sfx = e.target.checked; schedulePersist(); });
        const mix = card.querySelector('[data-act=sfxmix]');
        if (mix) mix.addEventListener('change', e => { x.sfxMix = e.target.checked; schedulePersist(); });
    }
    // Chọn quà - bộ chọn chung: tab 🎁 Bảng Quà mở sẵn NPC của hồ sơ (tặng 1 lần chạy cả hiệu ứng Bảng Quà lẫn hiệu ứng này).
    // Chọn quà - bảng quà của app (GET /api/gifts), cùng khung .nd-gp-* của các panel khác. Quà đã gắn ở game khác của Bộ Tách
    // Người hiện tên game đó (vẫn chọn được: một quà chạy cả hai).
    let picker = null, pickFor = null;
    async function openGiftPicker(kind, x, icon) {
        if (!Array.isArray(window.__giftSheet) || !window.__giftSheet.length) {
            try { const r = await fetch('/api/gifts'); if (r.ok) window.__giftSheet = (await r.json()).slice().sort((a, b) => (a.diamond || 0) - (b.diamond || 0)); } catch (e) {}
        }
        const other = new Map();
        for (const k of GK_ALL) for (const y of listOf(k)) if (y !== x) y.gifts.forEach(g => { if (!other.has(String(g.giftId))) other.set(String(g.giftId), y.name); });
        pickFor = { x, icon, other };
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'nd-gp-overlay'; picker.hidden = true;
            picker.style.zIndex = '10002';      // trên popup cài đặt game (#bt-g-modal 10000) + menu chuột phải
            picker.innerHTML = `<div class="nd-gp-modal"><div class="nd-gp-head"><div class="nd-gp-title"></div><button class="nd-gp-close ghost small">✕</button></div>
                <input class="nd-gp-search" type="text" placeholder="${hpTA('Tìm quà hoặc ID…')}" /><div class="nd-gp-list"></div>
                <div class="nd-gp-hint">${hpT('Bấm vào quà để gắn. Quà đã gắn có dấu ✓.')}</div></div>`;
            document.body.appendChild(picker);
            picker.addEventListener('click', e => { if (e.target === picker) picker.hidden = true; });
            picker.querySelector('.nd-gp-close').addEventListener('click', () => { picker.hidden = true; });
            picker.querySelector('.nd-gp-search').addEventListener('input', e => renderGiftPicker(e.target.value));
        }
        picker.querySelector('.nd-gp-title').textContent = hpT('{icon} Chọn quà cho "{name}"', { icon, name: x.name });
        picker.hidden = false;
        picker.querySelector('.nd-gp-search').value = '';
        renderGiftPicker('');
        setTimeout(() => picker.querySelector('.nd-gp-search').focus(), 30);
    }
    function renderGiftPicker(filter) {
        if (!picker || !pickFor) return;
        const { x, other } = pickFor;
        const list = picker.querySelector('.nd-gp-list');
        const sheet = Array.isArray(window.__giftSheet) ? window.__giftSheet : [];
        const f = String(filter || '').toLowerCase().trim();
        const used = new Set(x.gifts.map(g => String(g.giftId)));
        const items = (!f ? sheet : sheet.filter(g => (g.name || '').toLowerCase().includes(f) || String(g.id || '').includes(f))).slice(0, 400);
        list.innerHTML = items.map(g => {
            const id = String(g.id), elsewhere = other.get(id);
            return `<div class="nd-gp-row${used.has(id) ? ' active' : ''}" data-gid="${esc(id)}" data-gn="${esc(g.name || '')}" data-gi="${esc(g.image || '')}"${elsewhere ? ` title="${hpTA('Đã gắn ở: {v}', { v: elsewhere })}"` : ''}>
                ${g.image ? `<img class="nd-gp-img" loading="lazy" decoding="async" src="${esc(g.image)}" />` : '<span class="nd-gp-icon">🎁</span>'}
                <span class="nd-gp-name">${esc(g.name || (hpT('Quà #{id}', { id })))}${elsewhere ? ` <small style="opacity:.6">· ${esc(elsewhere)}</small>` : ''}</span><span class="nd-gp-dia">${g.diamond || 0}<img class="hp-coin-ico" src="/coin.svg" alt=""></span>
                ${used.has(id) ? '<span class="nd-gp-tick">✓</span>' : ''}</div>`;
        }).join('') || `<div class="nd-empty">${hpT('Không tìm thấy quà')}</div>`;
        list.querySelectorAll('.nd-gp-row').forEach(r => r.addEventListener('click', () => {
            if (used.has(r.dataset.gid)) return;
            x.gifts.push({ giftId: r.dataset.gid, giftName: r.dataset.gn, giftImage: r.dataset.gi });
            picker.hidden = true;
            renderSettings(); schedulePersist();
        }));
    }
    // Hành vi chung của một thẻ (tên, hồ sơ, quà, thử, lên, xoá).
    function bindCommon(card, kind, x, i, icon) {
        bindSnd(card, x);
        if (testRun) refreshTestBtns();          // thẻ vừa vẽ lại giữa lúc đang chạy thử → nút vẫn là ⏹ Ngưng
        const name = card.querySelector('.bt-name');
        if (name) name.addEventListener('change', e => { x.name = e.target.value.trim().slice(0, 60) || x.name; schedulePersist(); });
        const ps = card.querySelector('[data-act=prof]');
        if (ps) ps.addEventListener('change', e => { x.profileId = e.target.value; renderSettings(); schedulePersist(); });
        const qm = card.querySelector('[data-act=qmode]');
        if (qm) qm.addEventListener('change', e => { x.queueMode = e.target.value; if (['attach', 'now'].includes(x.queueMode)) x.runMode = 'normal'; renderSettings(); schedulePersist(); });
        const rm = card.querySelector('[data-act=rmode]');
        if (rm) rm.addEventListener('change', e => { setRunMode(kind, x, e.target.value); renderSettings(); schedulePersist(); });
        card.addEventListener('click', e => {
            const el = e.target.closest('[data-act]'), act = el && el.dataset.act;
            if (!act || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
            const list = listOf(kind);
            if (act === 'gadd') openGiftPicker(kind, x, icon);
            else if (act === 'gdel') { x.gifts.splice(Number(el.dataset.gi), 1); renderSettings(); schedulePersist(); }
            else if (act === 'test') { if (el.dataset.testing) stopTest(kind, x); else runTest({ kind, id: x.id }, el); }
            else if (act === 'up' && i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); renderSettings(); schedulePersist(); }
            else if (act === 'del') { if (confirm(hpT('Xoá "{name}"?', { name: x.name }))) { list.splice(i, 1); renderSettings(); schedulePersist(); } }
        });
    }
    const headBtns = (i, testTitle) => `<button class="small" data-act="test" title="${testTitle}">${hpT('Thử')}</button>
        <button class="ghost small" data-act="up" title="${hpTA('Lên trên (quà nằm ở 2 mục cùng hạng thì mục trên thắng)')}"${i ? '' : ' disabled'}>↑</button>
        <button class="ghost small" data-act="del" title="${hpTA('Xoá')}">🗑</button>`;

    // Ô số / thanh trượt: khoá data-k → chỗ trong config.
    function bindRows(host) {
        host.querySelectorAll('.ctc-row[data-k]').forEach(r => {
            const key = r.dataset.k, range = r.querySelector('input[type=range]'), num = r.querySelector('input[type=number]');
            const apply = (v, final) => {
                const n = Number(v); if (!Number.isFinite(n)) return;
                const k = key.split(':');
                let retime = -1, rerender = false;
                if (k[0] === 'p') { const p = cur(); if (p) p[k[1]] = n; rerender = final && k[1] === 'scale'; }
                else if (k[0] === 'hc') { cfg.haucanh.items[Number(k[1])][k[2]] = n; rerender = final && k[2] === 'scale'; }
                else if (k[0] === 'rh') { const sc = cfg.roiho.scripts[Number(k[1])]; if (k[2] === 't') sc.timing[k[3]] = n; else sc[k[2]] = n; retime = k[2] === 't' ? -2 : -1; }
                else if (k[0] === 'bd') {
                    const i = Number(k[1]), sc = cfg.biduoi.scripts[i];
                    if (k[2] === 't') { sc.timing[k[3]] = n; retime = i; }
                    else if (k[2] === 'p') { const p = sc.passes[Number(k[3])]; if (k[4] === 'pct') p[k[5]] = n / 100; else { p[k[4]] = n; retime = i; } }
                    else if (k[2] === 'pct') sc[k[3]] = n / 100;
                    else if (k[2] === 'persp') sc.persp[k[3]] = n / 100;
                } else if (k[0] === 'vf') { cfg.vidfx.scripts[Number(k[1])][k[2]] = n; retime = -3; rerender = final && k[2] === 'waitSec'; }
                else if (k[0] === 'cr') cfg.cry.scripts[Number(k[1])][k[2]] = n;
                else if (k[0] === 'ht') cfg.heart.scripts[Number(k[1])][k[2]] = n;
                else if (k[0] === 'bc') { const sc = cfg.catch.scripts[Number(k[1])]; if (k[2] === 't') sc.timing[k[3]] = n; else sc[k[2]] = n; }
                else if (k[0] === 'mo') cfg.morph.scripts[Number(k[1])][k[2]] = n;
                else if (k[0] === 'bdg') cfg.biduoi.sfxVolume = n / 100;
                else if (k[0] === 'sv') cfg[k[1]].sfxVolume = n / 100;
                else if (k[0] === 'look') cfg.biduoi.look[k[1]] = n / 100;
                else if (k[0] === 'q') { if (k[1] === 'hc') cfg.haucanh[k[2]] = n; else cfg[k[1]] = n; }
                else if (k[0] === 'm') cfg.matte[k[1]] = k[1] === 'still' ? +(1 - n).toFixed(3) : n;
                else if (k[0] === 'e') {
                    const e = edge(), c = k[1] === 'c' ? 1 - n : e.c, w = k[1] === 'w' ? n : e.w;
                    cfg.matte.lo = +Math.max(0.01, c - w / 2).toFixed(3); cfg.matte.hi = +Math.min(0.99, c + w / 2).toFixed(3);
                }
                range.value = n; num.value = fmt(n); schedulePersist();
                if (retime >= 0) refreshTimeline(retime);
                if (retime === -2) refreshRoiHoHint(Number(k[1]));
                if (retime === -3) refreshVidFxPlan(Number(k[1]));
                if (rerender) renderSettings();
            };
            range.addEventListener('input', () => apply(range.value, false));
            range.addEventListener('change', () => apply(range.value, true));
            num.addEventListener('change', () => apply(num.value, true));
        });
    }

    // ---------- 🧍 HỒ SƠ NPC ----------
    function chipsHtml(withAdd) {
        const p0 = cur();
        return cfg.profiles.map(p => `<button class="bt-chip${p0 && p.id === p0.id ? ' on' : ''}" data-pid="${esc(p.id)}" title="${p.id === meta.activeProfileId ? hpT('Đang chạy trên LIVE') : hpT('Bấm để chọn')}">${esc(npcName(p.groupId))}${p.id === meta.activeProfileId ? '<span class="live">● LIVE</span>' : ''}</button>`).join('')
            + (withAdd ? `<button class="bt-chip add" data-act="padd" title="${hpTA('Thêm hồ sơ cho một người')}">${hpT('＋ Thêm hồ sơ')}</button>` : '');
    }
    function renderChips() { document.querySelectorAll('#bt-settings .bt-chips').forEach(el => { el.innerHTML = chipsHtml(el.dataset.add === '1'); }); }
    function npcOptions(p) {
        const taken = new Set(cfg.profiles.filter(x => x !== p).map(x => x.groupId));
        const opts = [`<option value="" ${!p.groupId ? 'selected' : ''}>${hpT('Mọi người (khi người đang bật chưa có hồ sơ riêng){v}', { v: taken.has('') ? hpT(' - đã có hồ sơ khác') : '' })}</option>`];
        for (const g of meta.groups) opts.push(`<option value="${esc(g.id)}" ${p.groupId === g.id ? 'selected' : ''}>${esc(g.name)}${g.enabled ? hpT(' · đang bật') : ''}${taken.has(g.id) ? hpT(' - đã có hồ sơ khác') : ''}</option>`);
        if (p.groupId && !meta.groups.some(g => g.id === p.groupId)) opts.push(`<option value="${esc(p.groupId)}" selected>${hpT('⚠ người đã xoá ({v})', { v: esc(p.groupId) })}</option>`);
        return opts.join('');
    }
    function renderNpcSelect() {
        const s = $('#bt-npc'), p = cur(); if (!s || !p) return;
        if (document.activeElement !== s) s.innerHTML = npcOptions(p);
        const dup = cfg.profiles.find(x => x !== p && x.groupId === p.groupId);
        const w = $('#bt-npc-warn'); if (w) w.textContent = dup ? hpT('⚠ {v} đã có hồ sơ khác - hồ sơ đứng trước trong danh sách được dùng.', { v: npcName(p.groupId) }) : '';
    }
    function newProfile() {
        const taken = new Set(cfg.profiles.map(p => p.groupId));
        // NPC đang bật chưa có hồ sơ → rồi NPC bất kỳ chưa có → rồi "Mọi NPC".
        const gid = (meta.enabledNpcIds || []).find(id => !taken.has(id)) || (meta.groups.find(g => !taken.has(g.id)) || {}).id || '';
        const p = HB().makeProfile({ groupId: gid });
        cfg.profiles.push(p); setSel(p.id);
        renderSettings(); schedulePersist(); reloadPreview();
    }
    function tabNpc() {
        const p = cur();
        return `
            <div class="ctc-card">
                <h3>${hpT('CỠ NGƯỜI - dùng chung cho mọi game')}</h3>
                ${!p ? '' : `
                <div class="bt-sub">${hpT('CỠ NGƯỜI (người đã tách nền)')}</div>
                ${row('p:scale', hpT('Cỡ người'), 30, 200, 1, p.scale, '%', hpT('Thu nhỏ / phóng to người đã tách nền - co giãn quanh bàn chân'))}
                ${row('p:x', hpT('Lệch ngang'), -60, 60, 1, p.x, '%', hpT('Âm = sang trái, dương = sang phải (phần trăm bề ngang khung)'))}
                ${row('p:y', hpT('Lệch dọc'), -60, 60, 1, p.y, '%', hpT('Âm = lên trên, dương = xuống dưới'))}
                ${row('p:fadeMs', hpT('Hiện / tắt dần'), 0, 2000, 10, p.fadeMs, 'ms', hpT('Video Hậu Cảnh mờ dần vào / ra, người co giãn mượt về cỡ mới'))}
                <div class="bt-sub">${hpT('NỀN THƯỜNG TRỰC (tuỳ chọn)')}</div>
                ${dropZone('idle', p.idleFile, hpT('Thêm nền luôn chạy sau lưng người'), hpT('Thay hẳn nền camera bằng video / ảnh này (lặp, không tiếng) - người luôn hiện theo cỡ đã chỉnh'))}
                ${p.idleFile ? `<label class="ctc-toggle"><input type="checkbox" id="bt-idle-alpha" ${p.idleAlpha ? 'checked' : ''}> ${hpT('Nền thường trực trong suốt (webm alpha)')}</label>` : ''}`}
            </div>
            <div class="ctc-card">
                <h3>${hpT('DỰNG TRONG OBS (trên → dưới)')}</h3>
                <ol class="bt-steps">
                    <li><b>${hpT('Trên cùng')}</b>${hpT(': overlay hiệu ứng quà khác (nếu có) - hiệu ứng TRƯỚC người.')}</li>
                    <li><b>${hpT('Giữa')}</b>${hpT(': Browser Source link Game Camera (1080×1920) phủ kín khung, chọn Chơi Bộ Tách Người ở menu Game Camera.')}</li>
                    <li><b>${hpT('Dưới cùng')}</b>${hpT(': nguồn camera - để HIỆN (mắt bật), KHÔNG ẩn: OBS phải chụp được hình để tách người.')}</li>
                </ol>
            </div>`;
    }
    function bindNpc(host) {
        const p = cur(); if (!p) return;
        const pdel = host.querySelector('[data-act=pdel]');
        if (pdel) pdel.addEventListener('click', () => {
            const attached = GK_ALL.reduce((n, k) => n + listOf(k).filter(x => x.profileId === p.id).length, 0);
            if (!confirm(hpT('Xoá hồ sơ "{v}"{v2}?', { v: npcName(p.groupId), v2: attached ? hpT(' cùng {attached} hiệu ứng / kịch bản gắn riêng cho nó', { attached }) : '' }))) return;
            cfg.profiles = cfg.profiles.filter(x => x !== p);
            cfg.haucanh.items = cfg.haucanh.items.filter(x => x.profileId !== p.id);
            for (const k of ['roiho', 'biduoi', 'vidfx', 'cry', 'heart', 'catch', 'morph']) cfg[k].scripts = cfg[k].scripts.filter(x => x.profileId !== p.id);
            setSel(cfg.profiles[0] ? cfg.profiles[0].id : '');
            renderSettings(); schedulePersist(); reloadPreview();
        });
        bindDrop(host.querySelector('[data-drop=idle]'), (url, file) => { p.idleFile = url; p.idleAlpha = isPacked(file.name) || (/\.webm$/i.test(file.name) ? p.idleAlpha : false); });
        const clr = host.querySelector('[data-act=clear-idle]');
        if (clr) clr.addEventListener('click', e => { e.stopPropagation(); p.idleFile = ''; renderSettings(); schedulePersist(); });
        const ia = $('#bt-idle-alpha'); if (ia) ia.addEventListener('change', e => { p.idleAlpha = e.target.checked; schedulePersist(); });
    }

    // ---------- 🦊 HẬU CẢNH ----------
    function hcCard(it, i) {
        const p = profOf(it.profileId) || cur();
        const k = key => `hc:${i}:${key}`;
        const warnAlpha = it.alpha && p && (it.scale || p.scale) !== 100 && !p.idleFile && !it.hideCam;
        const warnNoHide = it.alpha && !it.hideCam;
        return `
            <div class="bt-item" data-kind="haucanh" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(it.name)}" title="${hpTA('Tên hiệu ứng')}" />${headBtns(i, hpT('Chạy thử hiệu ứng này trên OBS + khung xem trước'))}</div>
                ${cardTop('haucanh', it, '🦊', hpT('tặng quà này là chạy video sau lưng'))}
                ${hcLayersBox(it)}
                <div class="bt-toggles">
                    <label class="bt-fit" title="${hpTA('Video khớp vào khung 1080×1920 thế nào (áp cho mọi lớp)')}"><span>${hpT('Khớp khung')}</span><select data-act="fit">
                        <option value="cover" ${it.fit === 'cover' ? 'selected' : ''}>${hpT('Phủ kín')}</option>
                        <option value="contain" ${it.fit === 'contain' ? 'selected' : ''}>${hpT('Vừa khung')}</option>
                        <option value="stretch" ${it.fit === 'stretch' ? 'selected' : ''}>${hpT('Kéo giãn')}</option>
                    </select></label>
                    <label class="ctc-toggle"><input type="checkbox" data-act="sound" ${it.sound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>${vidVolCtl(it)}
                    <label class="ctc-toggle" title="${hpTA('Video nền TRONG SUỐT (webm alpha)')}"><input type="checkbox" data-act="alpha" ${it.alpha ? 'checked' : ''}> ${hpT('Trong suốt')}</label>
                    <label class="ctc-toggle" title="${hpTA('Ẩn cam gốc lúc chạy - app dời camera ra ngoài khung OBS, overlay vẽ lại nền phòng + người (hết bóng đôi, tracking vẫn chạy)')}"><input type="checkbox" data-act="hidecam" ${it.hideCam ? 'checked' : ''}> ${hpT('Ẩn cam gốc')}</label>
                </div>
                ${row(k('scale'), hpT('Cỡ người riêng'), 0, 200, 1, it.scale, '%', hpT('0 = theo cỡ người của hồ sơ. Vd đuôi hồ ly to: thu người còn 80 % cho thấy đuôi'))}
                ${warnAlpha ? `<div class="bt-warn">${hpT('⚠ Video trong suốt để lộ camera gốc (có cả người cỡ 100 %) - đổi cỡ người sẽ thấy 2 người. Bật 📷 Ẩn cam gốc (app vẽ phòng sạch) hoặc dùng video phủ kín / nền thường trực.')}</div>` : ''}
                ${warnNoHide && !warnAlpha ? `<div class="bt-warn">${hpT('⚠ Video trong suốt mà không ẩn cam gốc: người vẽ lại trễ 1–2 khung đè lên camera gốc → dễ thấy bóng tay / chân đôi. Nên bật 📷 Ẩn cam gốc.')}</div>` : ''}
            </div>`;
    }
    // 🎞 LỚP SAU XA HƠN (user 2026-10-23: hồ ly 3 lớp = nền hoa đào · 9 đuôi · ho ly cưỡi): tối đa HC.MAX_LAYERS video trong suốt vẽ
    // DƯỚI video chính, cùng lúc, câm. Đánh số như streamer nhìn: Lớp 1 = video chính (gần cam nhất) · Lớp 2 = layers[0] ngay dưới ·
    // Lớp 3 = layers[1] dưới nữa; trên tất cả là NPC rồi 🎁 Bảng Quà (lớp trước cam).
    const MAX_LAYERS = () => (window.HpHauCanh && window.HpHauCanh.MAX_LAYERS) || 2;
    // ⏱ MỌI video có mốc Bắt đầu + Kết thúc (ms kể từ đầu lượt, 1 giây = 1000 ms; user 2026-10-23). Kết thúc 0 = cuối video.
    // li = '' → video chính (it.startMs / it.endMs); li = số → it.layers[li]. Đọc lại ở bindHauCanhLayers qua data-lk / data-li.
    // Ô ms không có nhãn riêng - nhãn là tiêu đề cột của bảng lưới (user 2026-10-23: "gọn, thẳng hàng, chia hàng").
    const msCell = (li, k, title, val) => `<label class="bt-lms" title="${title}"><input type="number" min="0" max="600000" step="100" value="${val}" data-lk="${k}" data-li="${li}"><em>ms</em></label>`;
    const msCells = (li, x) => msCell(li, 'startMs', hpTA('Hiện từ mốc N ms kể từ đầu lượt (1 giây = 1000 ms)'), x.startMs)
        + msCell(li, 'endMs', hpTA('Tắt ở mốc N ms kể từ đầu lượt. 0 = cuối video (phát một lần; ảnh: 6 giây). Đặt mốc dài hơn video thì video lặp'), x.endMs);
    // Bảng lưới 4 cột: Lớp · Video · Bắt đầu · Kết thúc. Hàng 1 = video chính (gần cam nhất), hàng 2-3 = lớp dưới, hàng cuối = ＋ Thêm lớp.
    function hcLayersBox(it) {
        const L = it.layers || [];
        const rowOf = (cap, drop, x, li) => `<span class="bt-cap bt-lcap">${cap}</span>${drop}${msCells(li, x)}`;
        const rows = [rowOf(hpT('Lớp 1'), dropMini('item', it.file, hpT('Video sau lưng người'), hpT('Lớp gần cam nhất, có tiếng. Bấm để chọn hoặc kéo thả video / ảnh - app tự lưu, không cần thêm vào OBS')), it, '')]
            .concat(L.map((x, li) => rowOf(hpT('Lớp {n}', { n: li + 2 }), dropMini('layer-' + li, x.file, hpT('Video lớp dưới'), hpT('Video / ảnh TRONG SUỐT (webm alpha / .pack.mp4) vẽ sau lưng người, dưới lớp ngay trên nó. Lớp 1 (video chính) gần cam nhất')), x, li)));
        const warn = L.some(x => /\.(mp4|m4v|mkv|jpe?g)$/i.test(x.file) && !isPacked(x.file)) ? `<div class="bt-warn">${hpT('⚠ Lớp dưới là mp4 / ảnh không trong suốt → che hết lớp dưới nó. Dùng webm alpha hoặc .pack.mp4.')}</div>` : '';
        return `<div class="bt-lgrid" title="${hpTA('Các lớp chạy CÙNG LÚC sau lưng người, Lớp 1 trên cùng (vd 9 đuôi trên nền hoa đào). Lớp trước người = webm của 🎁 Bảng Quà cùng quà + 🔗 Kèm Bảng Quà. 1 giây = 1000 ms')}">
                <span></span><span class="bt-cap bt-lh">${hpT('Video')}</span><span class="bt-cap bt-lh">${hpT('Bắt đầu')}</span><span class="bt-cap bt-lh">${hpT('Kết thúc')}</span>
                ${rows.join('')}
                ${L.length < MAX_LAYERS() ? `<span></span><button class="ghost small bt-ladd" data-act="ladd">${hpT('＋ Thêm lớp dưới')}</button><span></span><span></span>` : ''}
            </div>${warn}`;
    }
    function bindHauCanhLayers(card, it) {
        card.querySelector('[data-act=ladd]')?.addEventListener('click', () => {
            if (!it.layers) it.layers = [];
            if (it.layers.length >= MAX_LAYERS()) return;
            it.layers.push(window.HpHauCanh.makeLayer('')); renderSettings();
        });
        (it.layers || []).forEach((_, li) => {
            bindDrop(card.querySelector(`[data-drop="layer-${li}"]`), url => { it.layers[li].file = url; });
            card.querySelector(`[data-act="clear-layer-${li}"]`)?.addEventListener('click', e => { e.stopPropagation(); it.layers.splice(li, 1); renderSettings(); schedulePersist(); });
        });
        // ⏱ ô ms của video chính (data-li rỗng) + từng lớp sau.
        card.querySelectorAll('input[data-lk]').forEach(inp => {
            inp.addEventListener('change', () => {
                const tgt = inp.dataset.li === '' ? it : it.layers[Number(inp.dataset.li)];
                if (!tgt) return;
                const v = Math.round(Number(inp.value)); tgt[inp.dataset.lk] = Number.isFinite(v) ? Math.min(600000, Math.max(0, v)) : 0;
                if (tgt === it) it.durSec = it.endMs / 1000;
                inp.value = tgt[inp.dataset.lk]; schedulePersist();
            });
            // Lăn chuột qua ô số đang focus (Chrome) đổi giá trị ngầm từng nấc 100 ms - đo thử 2026-10-23: 500 → 1000 mà không gõ. Bỏ focus là xong.
            inp.addEventListener('wheel', () => inp.blur(), { passive: true });
        });
    }
    function bindHauCanh(host) {
        host.querySelector('[data-act=iadd]')?.addEventListener('click', () => {
            const p = cur();
            cfg.haucanh.items.push(HB().makeItem({ name: hpT('Hiệu ứng {n}', { n: cfg.haucanh.items.length + 1 }), profileId: p ? p.id : '' }));
            renderSettings(); schedulePersist();
        });
        host.querySelectorAll('.bt-item').forEach(card => {
            const i = Number(card.dataset.i), it = cfg.haucanh.items[i];
            bindCommon(card, 'haucanh', it, i, '🦊');
            // webm thường là hiệu ứng trong suốt → đoán sẵn, streamer bỏ tick nếu video có nền.
            bindDrop(card.querySelector('[data-drop=item]'), (url, file) => { it.file = url; it.alpha = /\.webm$/i.test(file.name) || isPacked(file.name); });
            const clr = card.querySelector('[data-act=clear-item]');
            if (clr) clr.addEventListener('click', e => { e.stopPropagation(); it.file = ''; renderSettings(); schedulePersist(); });
            bindHauCanhLayers(card, it);
            card.querySelector('[data-act=alpha]').addEventListener('change', e => { it.alpha = e.target.checked; renderSettings(); schedulePersist(); });
            card.querySelector('[data-act=hidecam]').addEventListener('change', e => { it.hideCam = e.target.checked; renderSettings(); schedulePersist(); });
            card.querySelector('[data-act=sound]').addEventListener('change', e => { it.sound = e.target.checked; schedulePersist(); });
            card.querySelector('[data-act=fit]').addEventListener('change', e => { it.fit = e.target.value; schedulePersist(); });
        });
    }

    // ---------- nền lượt hành động (Rơi Hố / Bị Đuổi) ----------
    function bgModeCard(kind, what) {
        const m = cfg[kind].bgMode;
        return `<div class="ctc-card">
            <h3>${hpT('NỀN LÚC {v}', { v: what.toUpperCase() })}</h3>
            <div class="bt-selrow"><label>${hpT('Phủ nền')}</label>
                <select data-bgmode="${kind}">
                    <option value="room" ${m === 'room' ? 'selected' : ''}>${hpT('🏠 Phòng thật (mặc định) - ẩn cam gốc, app vẽ lại phòng KHÔNG người')}</option>
                    <option value="effect" ${m === 'effect' ? 'selected' : ''}>${hpT('Video kịch bản phủ kín (chưa có video: nền 🦊 Hậu Cảnh / phủ tối)')}</option>
                    <option value="none" ${m === 'none' ? 'selected' : ''}>${hpT('Không - overlay trong suốt, tôi tự che camera trong OBS')}</option>
                </select></div>
        </div>`;
    }

    // ---------- 🕳️ RƠI HỐ ----------
    const at = sec => fmt(+sec.toFixed(2));
    function roiHoHint(T) {
        const openAt = T.waitSec, ceilAt = T.waitSec + (T.openMs + T.fallMs) / 1000 + T.underSec, landAt = ceilAt + (T.ceilMs + T.dropMs) / 1000;
        return hpT('Video nền chạy lại từ đầu mỗi lượt: hố mở ở giây {v} - nắp trên mở ở giây {v2} - chạm đất ở giây {v3}. Video đã có sẵn hố / nắp thì tắt ô trên.', { v: at(openAt), v2: at(ceilAt), v3: at(landAt) });
    }
    function refreshRoiHoHint(i) { const h = $(`.bt-item[data-kind=roiho][data-i="${i}"] .bt-rh-hint`); if (h) h.textContent = roiHoHint(cfg.roiho.scripts[i].timing); }
    function rhCard(sc, i) {
        const T = sc.timing, k = key => `rh:${i}:${key}`;
        return `
            <div class="ctc-card bt-item" data-kind="roiho" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử kịch bản này trên OBS + khung xem trước'))}</div>
                ${cardTop('roiho', sc, '🕳️', hpT('tặng quà này là rơi hố'))}
                <div class="bt-vrow">
                    ${dropMini('bg', sc.bgFile, hpT('Video nền (tuỳ chọn)'), hpT('Bấm để chọn hoặc kéo thả video / ảnh vào đây - app tự lưu, không cần thêm vào OBS'))}
                    <div class="bt-toggles col">
                        <label class="ctc-toggle"><input type="checkbox" data-act="sound" ${sc.bgSound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>${vidVolCtl(sc)}
                        ${synthToggle(sc, true)}
                        <label class="ctc-toggle" title="${hpTA('App vẽ thêm cổng xuyên không + gợn sóng + bụi')}"><input type="checkbox" data-act="props" ${sc.props ? 'checked' : ''}> ${hpT('🌀 Cổng + bụi')}</label>
                    </div>
                </div>
                <div class="bt-sub">${hpT('NHỊP (khớp với video nền)')}</div>
                ${row(k('t:waitSec'), hpT('Chờ trước khi rơi'), 0, 15, 0.1, T.waitSec, hpT('giây'), hpT('Nền đã hiện, người đứng biểu diễn (sợ hãi, cầu cứu…) rồi hố mới mở dưới chân. 0 = rơi ngay'))}
                ${row(k('t:openMs'), hpT('Hố mở dưới chân'), 100, 2000, 10, T.openMs, 'ms')}
                ${row(k('t:fallMs'), hpT('Rụng xuống hố'), 150, 2000, 10, T.fallMs, 'ms')}
                ${row(k('t:underSec'), hpT('Ở dưới hố'), 0.3, 15, 0.1, T.underSec, hpT('giây'), hpT('Thời gian người biến mất trước khi rơi lại từ trên đầu'))}
                ${row(k('t:ceilMs'), hpT('Nắp trên đầu mở'), 100, 2000, 10, T.ceilMs, 'ms')}
                ${row(k('t:dropMs'), hpT('Rơi từ trên xuống'), 150, 2000, 10, T.dropMs, 'ms')}
                ${row(k('t:settleMs'), hpT('Nhún khi đáp'), 150, 1500, 10, T.settleMs, 'ms')}
                ${row(k('shake'), hpT('Rung khi đáp'), 0, 60, 1, sc.shake, 'px')}
                <div class="hint bt-rh-hint">${roiHoHint(T)}</div>
            </div>`;
    }
    function bindRoiHo(host) {
        host.querySelector('[data-act=sadd]')?.addEventListener('click', () => { cfg.roiho.scripts.push(HB().makeRoiHo({ name: hpT('Kịch bản {n}', { n: cfg.roiho.scripts.length + 1 }) })); renderSettings(); schedulePersist(); });
        host.querySelectorAll('.bt-item[data-kind=roiho]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.roiho.scripts[i];
            bindCommon(card, 'roiho', sc, i, '🕳️');
            bindDrop(card.querySelector('[data-drop=bg]'), url => { sc.bgFile = url; });
            const clr = card.querySelector('[data-act=clear-bg]');
            if (clr) clr.addEventListener('click', e => { e.stopPropagation(); sc.bgFile = ''; renderSettings(); schedulePersist(); });
            card.querySelector('[data-act=sound]').addEventListener('change', e => { sc.bgSound = e.target.checked; schedulePersist(); });
            card.querySelector('[data-act=props]').addEventListener('change', e => { sc.props = e.target.checked; schedulePersist(); });
        });
    }

    // ---------- 😭 KHÓC LÓC (lớp mặt - bám 2 mắt, không cần video) ----------
    const CRY_MOODS = () => [['cry', hpT('😭 Khóc')], ['laugh', hpT('😂 Cười ra nước mắt')]];
    const CRY_STYLES = () => [['both', hpT('Dòng chảy + giọt văng')], ['stream', hpT('Chỉ dòng chảy')], ['spray', hpT('Chỉ giọt văng')]];
    const selOpt = (act, list, cur) => `<select data-act="${act}">${list.map(([v, n]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    function cryCard(sc, i) {
        const k = key => `cr:${i}:${key}`, laugh = sc.mood === 'laugh';
        return `
            <div class="ctc-card bt-item" data-kind="cry" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử trên OBS + khung xem trước (phải thấy mặt trong camera)'))}</div>
                ${cardTop('cry', sc, gIcon('cry', sc), laugh ? hpT('tặng quà này là người cười ra nước mắt') : hpT('tặng quà này là người khóc'))}
                <div class="bt-opts">
                    ${optCell(hpT('Kiểu'), hpTA('😭 Khóc: mắt long lanh → dòng chảy mí dưới → phun vòi 2 bên - 😂 Cười: giọt bắn ngang + chữ HA HA'), selOpt('mood', CRY_MOODS(), sc.mood))}
                    ${optCell(hpT('Nước mắt'), hpTA('Dòng chảy ở mí dưới - giọt văng từ khoé ngoài mắt'), selOpt('style', CRY_STYLES(), sc.style))}
                    ${optCell(hpT('Màu nước'), hpTA('Màu nước mắt'), `<input type="color" data-act="color" value="${esc(sc.color)}">`)}
                </div>
                <div class="bt-toggles">
                    <label class="ctc-toggle" title="${hpTA('Khóc TO DẦN theo giây: rơm rớm → chảy → phun vòi (tắt = đều suốt lượt)')}"><input type="checkbox" data-act="ramp" ${sc.ramp ? 'checked' : ''}> ${hpT('To dần')}</label>
                    <label class="ctc-toggle" title="${hpTA('Vẽ thêm mũi đỏ + má ửng hồng (😂 chỉ má hồng)')}"><input type="checkbox" data-act="face" ${sc.face ? 'checked' : ''}> ${hpT('🔴 Mũi đỏ + má hồng')}</label>
                    ${laugh ? '' : `<label class="ctc-toggle" title="${hpTA('Vẽ đè nét miệng mếu lên miệng thật lúc khóc to')}"><input type="checkbox" data-act="mouth" ${sc.mouth ? 'checked' : ''}> ${hpT('〰 Miệng mếu')}</label>`}
                    <label class="ctc-toggle" title="${hpTA('Nước mắt đọng thành vũng dâng từ đáy khung OBS: sóng gợn, giọt chạm nước nổ vòng, bong bóng, bóng người phản chiếu; hết lượt nước rút')}"><input type="checkbox" data-act="puddle" ${sc.puddle ? 'checked' : ''}> ${hpT('💧 Vũng nước dưới chân')}</label>
                    <label class="ctc-toggle" title="${hpTA('Đám mây hoạt hình lơ lửng trên đỉnh đầu, xám dần và mưa dày dần theo mức khóc, chớp loé lúc phun vòi; hết lượt bay đi')}"><input type="checkbox" data-act="cloud" ${sc.cloud ? 'checked' : ''}> ${hpT('☁️ Mây mưa trên đầu')}</label>
                </div>
                ${row(k('durSec'), hpT('Thời lượng'), 1, 60, 0.5, sc.durSec, hpT('giây'), hpT('Combo ×N thì khóc dài thêm N lần (trần theo Combo tối đa của Bộ Tách Người)'))}
                ${row(k('intensity'), hpT('Cường độ'), 1, 3, 1, sc.intensity, '', hpT('1 nhẹ - 2 vừa - 3 ào ạt (giọt to hơn, nhiều hơn, dòng dày hơn)'))}
                ${sc.puddle ? row(k('puddleMax'), hpT('Mực nước tối đa'), 5, 45, 1, sc.puddleMax, '%', hpT('% chiều cao khung OBS mà vũng nước dâng tới khi khóc hết lượt')) : ''}
            </div>`;
    }
    function bindCry(host) {
        host.querySelectorAll('.bt-item[data-kind=cry]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.cry.scripts[i];
            bindCommon(card, 'cry', sc, i, gIcon('cry', sc));
            card.querySelector('[data-act=mood]').addEventListener('change', e => { sc.mood = e.target.value; renderSettings(); schedulePersist(); if (gOpen) openGModal(gKey('cry', sc), true); });
            card.querySelector('[data-act=style]').addEventListener('change', e => { sc.style = e.target.value; schedulePersist(); });
            card.querySelector('[data-act=color]').addEventListener('input', e => { sc.color = e.target.value; schedulePersist(); });
            for (const a of ['ramp', 'face', 'mouth', 'cloud']) card.querySelector(`[data-act=${a}]`)?.addEventListener('change', e => { sc[a] = e.target.checked; schedulePersist(); });
            card.querySelector('[data-act=puddle]').addEventListener('change', e => { sc.puddle = e.target.checked; schedulePersist(); if (gOpen) openGModal(gKey('cry', sc), true); });
        });
    }

    // ---------- 💗 BẮN TIM (lớp tay - bám bàn tay hình trái tim, không cần video) ----------
    // Mỗi người tặng một lượt: tới lượt NPC có "Thời gian chờ tay" để đưa tay hình tim, quá giờ = mất hiệu lực, chuyển người kế.
    const HEART_POSES = () => [['finger', hpT('Bắn tim 1 tay'), hpTA('Ngón cái chéo ngón trỏ, 3 ngón còn lại gập')], ['hands', hpT('Tim 2 tay'), hpTA('2 ngón cái chạm nhau + 2 ngón trỏ chạm nhau thành hình trái tim - avatar hiện trong lòng tim')]];
    function heartCard(sc, i) {
        const k = key => `ht:${i}:${key}`;
        return `
            <div class="ctc-card bt-item" data-kind="heart" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử trên OBS + khung xem trước (đưa tay hình trái tim trước camera)'))}</div>
                ${cardTop('heart', sc, '💗', hpT('tặng quà này là người bắn tim, avatar người tặng hiện trên tay'))}
                <div class="bt-toggles">
                    ${HEART_POSES().map(([v, n, t]) => `<label class="ctc-toggle" title="${t}"><input type="checkbox" data-pose="${v}" ${sc.poses.includes(v) ? 'checked' : ''}> ${n}</label>`).join('')}
                    <label class="ctc-toggle" title="${hpTA('Tên người tặng trên avatar')}"><input type="checkbox" data-act="showName" ${sc.showName ? 'checked' : ''}> ${hpT('Hiện tên')}</label>
                    <label class="ctc-toggle" title="${hpTA('Lúc chờ tay: ô Bắn tim cho @tên + đếm ngược ở mép trên khung OBS, để người biết tới lượt ai')}"><input type="checkbox" data-act="hint" ${sc.hint ? 'checked' : ''}> ${hpT('Gợi ý chờ')}</label>
                    <label class="ctc-toggle" title="${hpTA('Avatar hiện rồi thì dính theo tay; người vung / hất tay thật nhanh thì avatar văng theo đúng hướng đó - hất mạnh bay vút khỏi khung, hất nhẹ nảy lên rồi rơi')}"><input type="checkbox" data-act="fling" ${sc.fling ? 'checked' : ''}> ${hpT('Vung tay ném')}</label>
                </div>
                <div class="bt-opts">
                    ${optCell(hpT('Màu tim'), hpTA('Màu trái tim + viền avatar'), `<input type="color" data-act="color" value="${esc(sc.color)}">`)}
                </div>
                ${row(k('waitSec'), hpT('Thời gian chờ tay'), 3, 120, 1, sc.waitSec, hpT('giây'), hpT('Tới lượt người tặng mà người không đưa tay hình trái tim trong ngần này giây thì lượt mất hiệu lực, chuyển người kế'))}
                ${row(k('durSec'), hpT('Thời lượng'), 1, 30, 0.5, sc.durSec, hpT('giây'), hpT('Avatar + tim bay hiện bao lâu sau khi thấy tay. Cùng người tặng thêm (combo) thì dài thêm, tim dày hơn'))}
                ${row(k('avatarSize'), hpT('Cỡ avatar'), 40, 250, 5, sc.avatarSize, '%', hpT('So với cỡ bàn tay'))}
            </div>`;
    }
    function bindHeart(host) {
        host.querySelectorAll('.bt-item[data-kind=heart]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.heart.scripts[i];
            bindCommon(card, 'heart', sc, i, '💗');
            card.querySelectorAll('[data-pose]').forEach(cb => cb.addEventListener('change', () => {
                const on = [...card.querySelectorAll('[data-pose]')].filter(x => x.checked).map(x => x.dataset.pose);
                if (!on.length) { cb.checked = true; window.toast?.(hpT('Cần bật ít nhất một kiểu tay'), 'warn'); return; }
                sc.poses = on; schedulePersist();
            }));
            for (const a of ['showName', 'hint', 'fling']) card.querySelector(`[data-act=${a}]`).addEventListener('change', e => { sc[a] = e.target.checked; schedulePersist(); });
            card.querySelector('[data-act=color]').addEventListener('input', e => { sc.color = e.target.value; schedulePersist(); });
        });
    }

    // ---------- 🔴 BẮT NPC (ném cầu → hút NPC vào cầu → lắc → bắt được / xổng; body/fx-catch.mjs) ----------
    const CATCH_OUTCOMES = () => [['random', hpT('Ngẫu nhiên theo tỉ lệ')], ['win', hpT('Luôn bắt được')], ['fail', hpT('Luôn xổng')]];
    const CATCH_FAILS = () => [['self', hpT('Nhả lại đúng người')], ['video', hpT('Nhả ra video hài')], ['random', hpT('Ngẫu nhiên 2 kiểu')]];
    const CATCH_COLS = () => [['ballColor', hpT('Nắp')], ['ballColor2', hpT('Đáy')], ['bandColor', hpT('Đai + nút')], ['glowColor', hpT('Sáng + sao')], ['energyColor', hpT('Tia hút')], ['textColor2', hpT('Viền hộp chữ')]];
    function catchCard(sc, i) {
        const k = key => `bc:${i}:${key}`, T = sc.timing, rnd = sc.outcome === 'random', vid = sc.failMode !== 'self';
        return `
            <div class="ctc-card bt-item" data-kind="catch" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử trên OBS + khung xem trước'))}</div>
                ${cardTop('catch', sc, '🔴', hpT('tặng quà này là ném cầu bắt NPC'))}
                <div class="bt-opts">
                    ${optCell(hpT('Kết quả'), hpTA('Ngẫu nhiên: bắt được theo tỉ lệ bên dưới, còn lại xổng'), selOpt('outcome', CATCH_OUTCOMES(), sc.outcome))}
                    ${optCell(hpT('Khi xổng'), hpTA('Nhả lại đúng người, hoặc nhả ra một video hài (Mr.Bean, con vật…) đứng đúng chỗ người rồi người mới hiện lại'), selOpt('failMode', CATCH_FAILS(), sc.failMode))}
                    ${optCell(hpT('Tên người trong chữ'), hpTA('Thay cho {npc} trong hộp chữ - để trống = người'), `<input type="text" data-act="npcName" value="${esc(sc.npcName)}" placeholder="NPC" maxlength="40">`)}
                </div>
                ${vid ? `<div class="bt-vrow">
                    ${dropMini('cfail', sc.failFile, hpT('Video hài khi xổng'), hpT('Nên dùng webm TRONG SUỐT (hoặc .pack.mp4): mp4 thường sẽ hiện thành khung chữ nhật. App tự đổi webm trong suốt sang .pack.mp4 cho nhẹ'))}
                    <div class="bt-toggles col">
                        <label class="ctc-toggle"><input type="checkbox" data-act="failSound" ${sc.failSound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>
                    </div>
                </div>` : ''}
                <div class="bt-media">${audioMini('cfaila', sc.failAudio, sc.failAudioVol, hpT('mp3 khi xổng (tuỳ chọn)'))}</div>
                <div class="bt-sub" title="${hpTA('người nằm trong cầu (cam gốc vẫn ẩn) tới khi video + mp3 chạy HẾT rồi mới được thả ra. Nhiều video thì mỗi lượt bốc ngẫu nhiên, không lặp liền')}">${hpT('KHI BẮT ĐƯỢC - video phủ khung, chạy hết mới thả người')}</div>
                <div class="bt-cwins">
                    ${(sc.winFiles || []).map((f, wi) => dropMini('cwin' + wi, f, '', hpT('Bấm / kéo thả để đổi video này'))).join('')}
                    ${dropMini('cwinadd', '', hpT('＋ Thêm video bắt được'), hpT('Nên dùng webm TRONG SUỐT khung dọc 1080×1920 (mèo nhảy, ăn mừng…) - phủ cả khung OBS. App tự đổi webm trong suốt sang .pack.mp4 cho nhẹ'))}
                </div>
                <div class="bt-media">
                    ${audioMini('cwina', sc.winAudio, sc.winAudioVol, hpT('mp3 khi bắt được (tuỳ chọn)'))}
                    <label class="ctc-toggle"><input type="checkbox" data-act="winSound" ${sc.winSound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>
                </div>
                <div class="bt-toggles">
                    <label class="ctc-toggle" title="${hpTA('Hộp chữ kiểu game ở mép dưới: Đang thu phục... (chấm theo từng lần lắc) rồi câu bắt được / thoát ra')}"><input type="checkbox" data-act="showText" ${sc.showText ? 'checked' : ''}> ${hpT('💬 Hộp chữ kiểu game')}</label>
                    ${synthToggle(sc, true)}
                </div>
                ${sc.showText ? `<div class="bt-sub">${hpT('HỘP CHỮ - {user} = người tặng, {npc} = tên người · mỗi dòng 1 câu, mỗi lượt bốc ngẫu nhiên')}</div>
                ${['textWait', 'textWin', 'textFail'].map(f => `<div class="ctc-row"><label>${{ textWait: hpT('Lúc lắc'), textWin: hpT('Bắt được'), textFail: hpT('Xổng') }[f]}</label>
                    <textarea data-text="${f}" rows="${Math.min(5, Math.max(1, String(sc[f]).split('\n').length))}" maxlength="800" style="grid-column: span 3; resize: vertical; font: inherit">${esc(sc[f])}</textarea></div>`).join('')}` : ''}
                <div class="bt-sub">${hpT('QUẢ CẦU')}</div>
                <div class="bt-opts">${CATCH_COLS().map(([f, n]) => optCell(n, n, `<input type="color" data-color="${f}" value="${esc(sc[f])}">`)).join('')}</div>
                <div class="bt-vrow">${dropMini('cball', sc.ballFile, hpT('Ảnh quả cầu riêng (tuỳ chọn)'), hpT('Ảnh PNG cầu tròn nhìn thẳng, nền trong suốt: nửa trên = nắp (mở ra sau), nửa dưới = đáy. Trống = cầu vẽ sẵn theo màu trên'))}</div>
                ${row(k('ballSize'), hpT('Cỡ cầu'), 40, 250, 5, sc.ballSize, '%')}
                <div class="bt-sub">${hpT('NHỊP')}</div>
                ${rnd ? row(k('winPct'), hpT('Tỉ lệ bắt được'), 0, 100, 1, sc.winPct, '%') : ''}
                ${row(k('shakes'), hpT('Số lần lắc'), 1, 5, 1, sc.shakes, hpT('lần'), hpT('Bắt được thì lắc đủ số lần rồi mới cạch; xổng thì bung ra ở một lần lắc bất kỳ'))}
                ${row(k('waitSec'), hpT('Chờ trước khi ném'), 0, 10, 0.1, sc.waitSec, hpT('giây'))}
                ${row(k('holdSec'), hpT('Giữ trong cầu khi bắt được'), 0, 20, 0.5, sc.holdSec, hpT('giây'), hpT('Sau tiếng TING, người ở trong cầu bao lâu rồi mới được thả ra'))}
                ${row(k('t:suckMs'), hpT('Hút vào cầu'), 300, 3000, 10, T.suckMs, 'ms')}
                ${row(k('t:shakeMs'), hpT('Một lần lắc'), 150, 1500, 10, T.shakeMs, 'ms')}
                ${row(k('t:shakeGapMs'), hpT('Nghỉ giữa 2 lần lắc'), 100, 2000, 10, T.shakeGapMs, 'ms')}
                ${vid ? row(k('failScale'), hpT('Cỡ video hài'), 30, 250, 5, sc.failScale, hpT('% người')) + row(k('failDurSec'), hpT('Video hài chạy'), 0, 60, 0.5, sc.failDurSec, hpT('giây'), hpT('0 = hết video')) : ''}
            </div>`;
    }
    function bindCatch(host) {
        host.querySelectorAll('.bt-item[data-kind=catch]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.catch.scripts[i];
            const redraw = () => { renderSettings(); schedulePersist(); if (gOpen) openGModal(gKey('catch', sc), true); };
            bindCommon(card, 'catch', sc, i, '🔴');
            card.querySelector('[data-act=outcome]').addEventListener('change', e => { sc.outcome = e.target.value; redraw(); });
            card.querySelector('[data-act=failMode]').addEventListener('change', e => { sc.failMode = e.target.value; redraw(); });
            card.querySelector('[data-act=npcName]').addEventListener('change', e => { sc.npcName = e.target.value.trim().slice(0, 40); schedulePersist(); });
            card.querySelector('[data-act=showText]').addEventListener('change', e => { sc.showText = e.target.checked; redraw(); });
            card.querySelector('[data-act=failSound]')?.addEventListener('change', e => { sc.failSound = e.target.checked; schedulePersist(); });
            card.querySelectorAll('[data-text]').forEach(inp => inp.addEventListener('change', () => { sc[inp.dataset.text] = inp.value.slice(0, 800); schedulePersist(); }));
            card.querySelectorAll('[data-color]').forEach(inp => inp.addEventListener('input', () => { sc[inp.dataset.color] = inp.value; schedulePersist(); }));
            bindDrop(card.querySelector('[data-drop=cfail]'), url => { sc.failFile = url; });
            bindDrop(card.querySelector('[data-drop=cball]'), url => { sc.ballFile = url; });
            card.querySelector('[data-act=clear-cfail]')?.addEventListener('click', e => { e.stopPropagation(); sc.failFile = ''; redraw(); });
            card.querySelector('[data-act=clear-cball]')?.addEventListener('click', e => { e.stopPropagation(); sc.ballFile = ''; redraw(); });
            // 🎬 video bắt được: đổi / bỏ từng video, thêm video mới
            (sc.winFiles || []).forEach((f, wi) => {
                bindDrop(card.querySelector(`[data-drop=cwin${wi}]`), url => { sc.winFiles[wi] = url; });
                card.querySelector(`[data-act=clear-cwin${wi}]`)?.addEventListener('click', e => { e.stopPropagation(); sc.winFiles.splice(wi, 1); redraw(); });
            });
            bindDrop(card.querySelector('[data-drop=cwinadd]'), url => { sc.winFiles = [...(sc.winFiles || []), url].slice(0, 20); });
            card.querySelector('[data-act=winSound]').addEventListener('change', e => { sc.winSound = e.target.checked; schedulePersist(); });
            bindAudioMini(card.querySelector('[data-aud=cwina]'), sc, 'winAudio', 'winAudioVol', redraw);
            bindAudioMini(card.querySelector('[data-aud=cfaila]'), sc, 'failAudio', 'failAudioVol', redraw);
        });
    }
    // ---------- ✨ BIẾN HÌNH (vẽ bằng mã, không cần video; body/fx-morph.mjs) ----------
    const MO_ICON = { ice: '🧊', pixel: '👾', zap: '⚡', vacuum: '🌀', bees: '🐝', slap: '🖐', fly: '', ghost: '👻', clone: '🪞', melt: '🫠', balloon: '🎈', lipo: '💉', phone: '📱', anime: '🎨' };      // Son Goku không biểu tượng (user 2026-10-28)
    const MO_SHORT = () => ({ ice: hpT('Đóng băng'), pixel: hpT('Vỡ điểm ảnh'), zap: hpT('Sét đánh'), vacuum: hpT('Ống hút người'), bees: hpT('Ong vỡ tổ'), slap: hpT('Tát bay'), fly: 'Son Goku',
        ghost: hpT('Hồn lìa khỏi xác'), clone: hpT('Phân thân'), melt: hpT('Tan chảy'), balloon: hpT('Thổi phồng'), lipo: hpT('Hút mỡ'), phone: hpT('Hút vào điện thoại'), anime: hpT('Biến hoạt hình') });
    const MO_HINT = () => ({
        ice: hpT('gió băng thổi qua, người đóng băng dần thành tượng pha lê, đứng vài giây rồi tan rã thành mảnh kính'),
        pixel: hpT('người chớp glitch nhiều kiểu, thành khối vuông 3D, đổ sụp xuống sàn rồi xoáy bay về ghép lại'),
        zap: hpT('mây đen tụ trên đầu, sét giáng xuống: chớp trắng + lộ xương kiểu X-quang, rồi cháy đen bốc khói'),
        vacuum: hpT('ống hút thả xuống, hút người thu nhỏ vào ống rồi rút đi; vài giây sau ống hạ xuống thả người ra'),
        bees: hpT('tổ ong rơi trúng đầu, đàn ong bu lên người; người vung tay xua thì ong tản ra rồi bu lại'),
        slap: hpT('bàn tay khổng lồ tát qua tát lại, người bay văng nhiều hướng có vệt nhoè rồi bay về đáp đất'),
        fly: hpT('cảnh trời mây núi, người thu nhỏ nấp sau toà nhà rồi bay vụt lên có hào quang, chưởng / lao vào màn hình / đánh nhau với bản sao'),
        ghost: hpT('thân người đứng im như chết, hồn ma trong suốt phát sáng bay ra (cử động theo người thật), lượn vòng rồi bị hút về nhập lại'),
        clone: hpT('người phân thân thành nhiều bản sao đứng hàng sau, nhảy trễ nhịp như nhóm nhảy rồi nhập lại làm một'),
        melt: hpT('mặt trời chói chang hạ xuống, nhiệt kế vọt đỏ, người đổ mồ hôi rồi chảy xuống như kem thành vũng sủi bọt; mặt trời đi thì mọc lên lại'),
        balloon: hpT('người bị bơm phồng tròn như bóng bay, bay lên rồi nổ BỤP, xì hơi bay vòng vèo, nằm bẹp rồi phồng về như cũ'),
        lipo: hpT('máy hút mỡ lăn tới cắm ống vào bụng, mỡ vàng chảy vào bình, người tóp dần ốm nhom, má hóp rồi bật phồng lại'),
        phone: hpT('điện thoại khổng lồ bay tới hút người vào màn hình LIVE có avatar người tặng, rồi bị vuốt văng ra'),
        anime: hpT('người biến thành nhân vật truyện tranh: viền mực, tô màu phẳng, vệt tốc độ, chữ tượng thanh; cuối lượt trang truyện xé đôi')
    });
    const moLabel = v => (MO_ICON[v] ? MO_ICON[v] + ' ' : '') + MO_SHORT()[v];
    const MO_STYLES = () => HB().MORPH_STYLES.map(v => [v, moLabel(v)]);
    const FLY_ACTS = () => [['random', hpT('🎲 Ngẫu nhiên')], ['beam', hpT('🌊 Chưởng vào màn hình')], ['dive', hpT('🚀 Lao vào màn hình')], ['fight', hpT('🥊 Đánh nhau với bản sao')]];
    function morphCard(sc, i) {
        const k = key => `mo:${i}:${key}`, col = ['ice', 'zap', 'fly', 'ghost', 'clone', 'balloon'].includes(sc.style);
        return `
            <div class="ctc-card bt-item" data-kind="morph" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử trên OBS + khung xem trước'))}</div>
                ${cardTop('morph', sc, MO_ICON[sc.style] || '✨', hpT('tặng quà này là {v}', { v: MO_HINT()[sc.style] || '' }))}
                <div class="bt-opts">
                    ${optCell(hpT('Kiểu'), hpTA('Mỗi kiểu một hiệu ứng vẽ bằng mã - không cần video'), selOpt('style', MO_STYLES(), sc.style))}
                    ${sc.style === 'fly' ? optCell(hpT('Ra đòn'), hpTA('Bay lên xong người làm gì; Ngẫu nhiên = mỗi lượt một kiểu, không lặp lượt trước'), selOpt('act', FLY_ACTS(), sc.act || 'random')) : ''}
                    ${col ? optCell(sc.style === 'ice' ? hpT('Màu băng') : sc.style === 'fly' ? hpT('Màu hào quang') : sc.style === 'ghost' ? hpT('Màu hồn') : sc.style === 'clone' ? hpT('Màu viền bản sao') : sc.style === 'balloon' ? hpT('Màu bóng') : hpT('Màu tia sét'), hpTA('Màu chủ đạo của hiệu ứng'), `<input type="color" data-act="color" value="${esc(sc.color)}">`) : ''}
                </div>
                ${sc.style === 'slap' ? `<div class="bt-vrow">${dropMini('mohand', sc.handFile, hpT('Ảnh bàn tay riêng (tuỳ chọn)'), hpT('PNG nền trong suốt, khung dọc ~3:4 (vd 960×1320): lòng bàn tay hướng camera, ngón chỉ LÊN, ngón cái chìa sang TRÁI, cổ tay sát mép dưới. App tự lật gương khi tát sang trái. Trống = bàn tay vẽ sẵn'))}</div>` : ''}
                <div class="bt-toggles">
                    <label class="ctc-toggle" title="${hpTA('Rung màn lúc va chạm: vỡ băng, sét giáng, người rơi từ ống hút xuống')}"><input type="checkbox" data-act="shake" ${sc.shake ? 'checked' : ''}> ${hpT('📳 Rung màn')}</label>
                    ${synthToggle(sc, true)}
                </div>
                ${sc.style === 'vacuum' ? row(k('waitSec'), hpT('Giữ trong ống'), 0, 20, 0.5, sc.waitSec, hpT('giây'), hpT('Ống hút người lên rồi rút đi; sau ngần này giây ống hạ xuống thả người ra'))
                    : sc.style === 'ice' ? row(k('waitSec'), hpT('Đóng băng giữ'), 0.5, 20, 0.5, sc.waitSec, hpT('giây'), hpT('Tượng băng đứng yên ngần này giây rồi mới tan rã'))
                    : sc.style === 'pixel' ? row(k('waitSec'), hpT('Nằm vụn'), 0.5, 20, 0.5, sc.waitSec, hpT('giây'), hpT('Khối vỡ nằm trên sàn ngần này giây rồi mới bay về ghép lại'))
                    : sc.style === 'melt' ? row(k('waitSec'), hpT('Nằm thành vũng'), 0.5, 20, 0.5, sc.waitSec, hpT('giây'), hpT('Vũng sủi bọt ngần này giây rồi người mới mọc lên lại'))
                    : sc.style === 'slap' || sc.style === 'zap' ? ''
                    : row(k('durSec'), hpT('Thời lượng'), HB().MORPH_MIN[sc.style] || 3, 30, 0.5, sc.durSec, hpT('giây'), hpT('Độ dài cả lượt; combo ×N chạy N lượt nối nhau'))}
                ${row(k('power'), sc.style === 'slap' ? hpT('Số cú tát') : sc.style === 'zap' ? hpT('Số tia sét') : sc.style === 'clone' ? hpT('Số bản sao') : hpT('Cường độ'), 1, 3, 1, sc.power, '', sc.style === 'slap' ? hpT('1 = 3 cú - 2 = 4 cú - 3 = 5 cú') : sc.style === 'zap' ? hpT('1 = 2 tia - 2 = 3 tia - 3 = 4 tia') : sc.style === 'clone' ? hpT('1 = 4 bản - 2 = 6 bản - 3 = 8 bản') : sc.style === 'fly' ? hpT('Đánh nhau: 1 = 3 hiệp - 2 = 4 hiệp - 3 = 5 hiệp (lượt ngắn thì bớt); chưởng: rung mạnh hơn') : hpT('1 nhẹ - 2 vừa - 3 mạnh: nhiều mảnh vỡ / khối / ong / tia điện hơn'))}
            </div>`;
    }
    function bindMorph(host) {
        host.querySelectorAll('.bt-item[data-kind=morph]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.morph.scripts[i];
            bindCommon(card, 'morph', sc, i, MO_ICON[sc.style] || '✨');
            card.querySelector('[data-act=style]').addEventListener('change', e => {
                const st = e.target.value, oldName = HB().morphLabel(sc.style);
                const keep = { id: sc.id, name: sc.name, profileId: sc.profileId, gifts: sc.gifts, queueMode: sc.queueMode, shake: sc.shake, power: sc.power,
                    sfx: sc.sfx, sfxFile: sc.sfxFile, sfxVol: sc.sfxVol, vidVol: sc.vidVol, runMode: sc.runMode };
                // tên còn là tên mẫu của kiểu cũ → đổi theo kiểu mới; tên tự đặt giữ nguyên
                if (!keep.name || keep.name === oldName || keep.name === HB().MORPH_NAMES[sc.style]) keep.name = HB().morphLabel(st);
                cfg.morph.scripts[i] = HB().normalizeMorph({ ...HB().makeMorph({ style: st }), ...keep }, i);
                renderSettings(); schedulePersist(); if (gOpen) openGModal(gKey('morph', cfg.morph.scripts[i]), true);
            });
            card.querySelector('[data-act=color]')?.addEventListener('input', e => { sc.color = e.target.value; schedulePersist(); });
            card.querySelector('[data-act=act]')?.addEventListener('change', e => { sc.act = e.target.value; schedulePersist(); });
            card.querySelector('[data-act=shake]').addEventListener('change', e => { sc.shake = e.target.checked; schedulePersist(); });
            bindDrop(card.querySelector('[data-drop=mohand]'), url => { sc.handFile = url; });
            card.querySelector('[data-act=clear-mohand]')?.addEventListener('click', e => { e.stopPropagation(); sc.handFile = ''; renderSettings(); schedulePersist(); if (gOpen) openGModal(gKey('morph', sc), true); });
        });
    }
    // 🔊 ô mp3 nhỏ (Bắt NPC: mp3 lúc bắt được / xổng) - bấm / kéo thả để chọn, thanh âm lượng, ✕ bỏ.
    function audioMini(act, file, vol, title) {
        return `<div class="bt-snd${file ? ' on' : ''}" data-aud="${act}" title="${hpTA('Bấm để chọn, hoặc kéo thả mp3 / wav / m4a vào đây')}">
                <span class="bt-cap">🔊</span><b>${file ? esc(fileLabel(file)) : title}</b>
                ${file ? `<input type="range" min="0" max="100" step="1" value="${vol}" data-avol title="${hpTA('Âm lượng')}"><em>${vol}%</em>
                    <button class="ghost small" data-adel title="${hpTA('Bỏ mp3')}">✕</button>` : ''}
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" hidden />
            </div>`;
    }
    function bindAudioMini(box, sc, key, volKey, redraw) {
        if (!box) return;
        const inp = box.querySelector('input[type=file]');
        const take = async file => {
            if (!file) return;
            if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name)) { window.toast?.(hpT('Chỉ nhận file âm thanh (mp3, wav, m4a…)'), 'error'); return; }
            box.querySelector('b').textContent = hpT('⏳ Đang tải {v}…', { v: file.name });
            try { sc[key] = await uploadOne(file); } catch (e) { window.toast?.(e.message || hpT('Tải lên lỗi'), 'error'); }
            redraw();
        };
        box.addEventListener('click', e => {
            if (e.target.closest('[data-avol]')) return;
            e.stopPropagation();
            if (e.target.closest('[data-adel]')) { sc[key] = ''; redraw(); return; }
            if (e.target !== inp) inp.click();
        });
        inp.addEventListener('change', () => take(inp.files[0]));
        box.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); });
        box.addEventListener('dragleave', () => box.classList.remove('over'));
        box.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take(e.dataTransfer.files[0]); });
        const v = box.querySelector('[data-avol]');
        if (v) {
            v.addEventListener('input', () => { sc[volKey] = Number(v.value); box.querySelector('em').textContent = v.value + '%'; livePersist(); });
            v.addEventListener('change', () => schedulePersist());
        }
    }

    // ---------- 🎬 VIDEO HÀNH ĐỘNG ----------
    // Kiểu chuyển động (body/core.cjs VIDFX_PRESETS): đổi kiểu = nạp lại nhịp mẫu đã đo từ video mẫu cùng tên.
    const VF_MOTIONS = [
        ['portal', hpT('🌀 Tụt cổng')],
        ['blast', hpT('☄️ Bị nổ văng')],
        ['abduct', hpT('🛸 Bị hút lên')],
        ['knock', hpT('🥊 Đấm văng')],
        ['crush', hpT('👊 Đè bẹp')],
        ['mario', hpT('🍄 Mario')],
        ['pickle', hpT('🏓 Pickleball')],
        ['ninja', hpT('🥷 Ninja')],
        ['batu', hpT('🪢 Ba Tư')]
    ];
    const VF_GAMES = ['mario', 'pickle', 'ninja', 'batu'];
    const VF_LAYERS = [   // [giá trị, chữ ngắn, giải thích (tooltip)]
        ['auto', hpT('Tự động'), hpT('Tự động - TRƯỚC người tới lúc người quay về, sau đó làm NỀN')],
        ['front', hpT('Trước người'), hpT('Luôn TRƯỚC người (webm trong suốt: nắm đấm, vụ nổ, găng…)')],
        ['back', hpT('Sau người (nền)'), hpT('Luôn SAU người - làm nền (mp4 phủ kín, cảnh đổi nền như UFO…)')]
    ];
    function vidFxPlanHint(sc) {
        const P = HB().vidFxPlan(sc, sc.durSec > 0 ? sc.durSec * 1000 : NaN);
        if (sc.motion === 'batu') {
            return hpT('Mỗi chu kỳ {v} giây: cảnh toàn tới giây {v2} rồi cắt cận - {n} cú quất - hết lượt giây {v3}.', {
                v: fmt(sc.bPeriod), v2: fmt(sc.bCut), n: (P.hits || []).length, v3: atMs(P.end) }) + (sc.bgFile ? '' : ' ' + hpT('⚠ Chưa có video nền dưới cùng'));
        }
        if (VF_GAMES.includes(sc.motion)) {
            return hpT('Video nền chạy lại từ 0 mỗi lượt: bắt đầu về cỡ thật ở giây {v} - xong giây {v2} - hết lượt giây {v3}{v4}.', {
                v: atMs(P.back), v2: atMs(P.land), v3: atMs(P.end), v4: sc.durSec > 0 ? hpT(' (video dài {v} giây)', { v: fmt(+sc.durSec.toFixed(2)) }) : '' })
                + (P.hits ? ' ' + hpT('{n} cú đánh.', { n: P.hits.length }) : '')
                + (sc.motion === 'ninja' ? ' ' + hpT('{n} lần né.', { n: HB().parseMoves(sc.nMoves).length }) : '');
        }
        const gone = sc.motion === 'crush' ? hpT('nằm bẹp') : hpT('vắng');
        return hpT('Video chạy lại từ 0 mỗi lượt: rời đi ở giây {v} - {gone} {v2}–{v3} - về tới chỗ ở giây {v4} - đứng vững giây {v5} - hết lượt giây {v6}{v7}.', {
            v: atMs(P.hit), gone, v2: atMs(P.gone), v3: atMs(P.back), v4: atMs(P.land), v5: atMs(P.still), v6: atMs(P.end),
            v7: sc.durSec > 0 ? hpT(' (video dài {v} giây)', { v: fmt(+sc.durSec.toFixed(2)) }) : '' });
    }
    function refreshVidFxPlan(i) { const h = $(`.bt-item[data-kind=vidfx][data-i="${i}"] .bt-vf-hint`); if (h) h.textContent = vidFxPlanHint(cfg.vidfx.scripts[i]); }
    function vfCard(sc, i) {
        const k = key => `vf:${i}:${key}`;
        const back = sc.motion === 'crush' ? hpT('Bật dậy ở giây') : hpT('Quay về ở giây');
        const game = VF_GAMES.includes(sc.motion);
        return `
            <div class="ctc-card bt-item" data-kind="vidfx" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên hiện trên thông báo')}" />${headBtns(i, hpT('Chạy thử video này trên OBS + khung xem trước'))}</div>
                ${cardTop('vidfx', sc, '🎬', hpT('tặng quà này là chạy video + người diễn theo'))}
                <div class="bt-vrow">
                    ${dropMini('vf', sc.file, hpT('Video hiệu ứng'), hpT('webm trong suốt (nắm đấm, vụ nổ, UFO…) hoặc mp4 phủ kín (phòng scifi) - app tự lưu, không cần thêm vào OBS'))}
                    ${sc.motion === 'batu' || sc.bgFile ? dropMini('vfbg', sc.bgFile, hpT('Video nền dưới cùng'), hpT('Nằm SAU người (người kẹp giữa video hiệu ứng và video nền) - chạy lặp, khớp giờ video hiệu ứng')) : ''}
                    <div class="bt-toggles col">
                        <label class="ctc-toggle"><input type="checkbox" data-act="sound" ${sc.sound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>${vidVolCtl(sc)}
                        ${synthToggle(sc, !game || sc.motion === 'ninja')}
                    </div>
                </div>
                <div class="bt-opts">
                    ${optCell(hpT('Kiểu người diễn'), hpTA('Đổi kiểu = nạp nhịp mẫu của kiểu đó'), `<select data-act="motion">${VF_MOTIONS.map(([v, n]) => `<option value="${v}" ${sc.motion === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
                    ${optCell(hpT('Lớp video'), hpTA('Video nằm trước hay sau người'), `<select data-act="layer">${VF_LAYERS.map(([v, n, d]) => `<option value="${v}" title="${esc(d)}" ${sc.layer === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
                    ${sc.motion === 'blast' || sc.motion === 'knock' ? optCell(hpT('Văng về phía'), '', seg('vfdir', sc.dir)) : ''}
                </div>
                ${game ? vfGameRows(sc, k) : `
                <div class="bt-sub">${hpT('NHỊP (khớp với video - giây tính từ đầu video)')}</div>
                ${row(k('hitSec'), hpT('Bị trúng / rời đi ở giây'), 0, 30, 0.05, sc.hitSec, hpT('giây'), hpT('Lúc nắm đấm / thiên thạch / găng chạm người, cổng mở, luồng sáng UFO bắt đầu hút'))}
                ${row(k('outMs'), hpT('Rời đi trong'), 50, 3000, 10, sc.outMs, 'ms', hpT('Văng khỏi màn / tụt xuống / bay lên / bẹp xuống trong bấy nhiêu ms'))}
                ${row(k('backSec'), back, 0, 30, 0.05, sc.backSec, hpT('giây'), hpT('Lúc người rơi lại / lăn về / bật dậy'))}
                ${row(k('inMs'), hpT('Về tới chỗ trong'), 50, 3000, 10, sc.inMs, 'ms')}
                ${row(k('settleMs'), hpT('Khuỵu rồi đứng dậy'), 0, 4000, 10, sc.settleMs, 'ms')}
                ${row(k('waitSec'), hpT('Chờ thêm trước khi rời đi'), 0, 30, 0.5, sc.waitSec, hpT('giây'), hpT('Video lặp đoạn bên dưới (vd cổng đang mở) trong lúc người đứng chờ - 0 = không chờ'))}
                ${sc.waitSec > 0 ? row(k('loopFrom'), hpT('Lặp đoạn video từ giây'), 0, 30, 0.05, sc.loopFrom, hpT('giây')) + row(k('loopTo'), hpT('đến giây'), 0, 30, 0.05, sc.loopTo, hpT('giây'), hpT('Đoạn lặp phải kết thúc TRƯỚC mốc rời đi')) : ''}
                ${row(k('shake'), hpT('Rung màn'), 0, 60, 1, sc.shake, 'px', hpT('Rung lúc bị trúng + lúc đáp'))}
                ${sc.motion === 'portal' ? row(k('anchorX'), hpT('Cổng ngang'), 0, 100, 1, sc.anchorX, '%', hpT('Chỗ cổng trong video (tính từ mép trái) - người tự trượt tới đó trước khi tụt')) + row(k('anchorY'), hpT('Mặt sàn cổng'), 40, 100, 1, sc.anchorY, hpT('% cao'), hpT('Người tụt dưới đường này thì bị che (rơi vào cổng)')) : ''}
                ${sc.motion === 'abduct' ? row(k('anchorY'), hpT('Đáy đĩa bay'), 0, 60, 1, sc.anchorY, hpT('% cao'), hpT('Đáy đĩa bay trong video, tính từ mép TRÊN xuống - người tự thu nhỏ để đầu nằm dưới đường này, bị hút vào / nhả ra tại đây')) : ''}`}
                <div class="bt-foot"><div class="hint bt-vf-hint">${vidFxPlanHint(sc)}</div>
                    <button class="ghost small" data-act="vfpreset" title="${hpTA('Nạp lại nhịp mẫu của kiểu này (đo từ video mẫu)')}">${hpT('Nhịp mẫu')}</button></div>
            </div>`;
    }
    // Ô riêng của kiểu game (Mario / Pickleball): toạ độ % khung 1080×1920 + mốc giây theo video nền.
    function vfGameRows(sc, k) {
        if (sc.motion === 'mario') return `
                <div class="bt-sub">${hpT('ĐIỂM TRÊN NỀN (% khung)')}</div>
                ${row(k('m1x'), hpT('Điểm 1 (xuất hiện)'), 0, 100, 0.5, sc.m1x, hpT('% ngang'))}
                ${row(k('m2x'), hpT('Điểm 2 (dưới ô ?)'), 0, 100, 0.5, sc.m2x, hpT('% ngang'))}
                ${row(k('m3x'), hpT('Điểm 3 (ăn nấm)'), 0, 100, 0.5, sc.m3x, hpT('% ngang'))}
                ${row(k('mGround'), hpT('Mặt đất'), 20, 100, 0.1, sc.mGround, hpT('% cao'), hpT('Chân người đứng trên đường này - tính từ mép TRÊN'))}
                ${row(k('mBlock'), hpT('Đáy ô ?'), 0, 100, 0.1, sc.mBlock, hpT('% cao'), hpT('Cú nhảy đưa đầu người chạm đúng đường này'))}
                ${row(k('mSize'), hpT('Cỡ người nhỏ'), 3, 60, 0.5, sc.mSize, hpT('% cao'), hpT('Chiều cao người lúc làm Mario (phần trăm chiều cao khung)'))}
                <div class="bt-sub">${hpT('NHỊP (giây tính từ đầu video nền)')}</div>
                ${row(k('outMs'), hpT('Thu nhỏ về điểm 1 trong'), 100, 3000, 10, sc.outMs, 'ms')}
                ${row(k('mArrive'), hpT('Tới điểm 2 + nhảy ở giây'), 0, 30, 0.05, sc.mArrive, hpT('giây'), hpT('Đỉnh cú nhảy nên trùng lúc ô ? bật lên trong video'))}
                ${row(k('mJumpMs'), hpT('Cú nhảy dài'), 100, 2000, 10, sc.mJumpMs, 'ms')}
                ${row(k('mLeave'), hpT('Chạy theo nấm từ giây'), 0, 30, 0.05, sc.mLeave, hpT('giây'))}
                ${row(k('mReach'), hpT('Tới điểm 3 ở giây'), 0, 30, 0.05, sc.mReach, hpT('giây'), hpT('Lúc nấm tới chỗ người (nấm biến mất trong video)'))}
                ${row(k('mMush'), hpT('Ăn nấm (to nhỏ) từ giây'), 0, 30, 0.05, sc.mMush, hpT('giây'))}
                ${row(k('mMushMs'), hpT('To nhỏ liên tục trong'), 300, 5000, 10, sc.mMushMs, 'ms')}
                ${row(k('mGrow'), hpT('Chớp phóng to dần từ giây'), 0, 30, 0.05, sc.mGrow, hpT('giây'), hpT('Theo tiếng nhấp nháy sau tiếng ăn nấm: to → chớp → to hơn → chớp… rồi về cỡ thật'))}
                ${row(k('mGrowX'), hpT('Bậc đầu to gấp'), 0, 20, 0.1, sc.mGrowX, '×', hpT('Gấp mấy lần cỡ người nhỏ - 0 = tắt chớp phóng to'))}
                ${row(k('mGrowAdd'), hpT('Mỗi bậc to thêm'), 0, 10, 0.1, sc.mGrowAdd, '×')}
                ${row(k('mGrowMs'), hpT('Mỗi bậc dài'), 80, 3000, 10, sc.mGrowMs, 'ms', hpT('Một lần chớp + giữ cỡ - khớp nhịp nhấp nháy của video (~270 ms)'))}
                ${row(k('backSec'), hpT('Về cỡ thật từ giây'), 0, 30, 0.05, sc.backSec, hpT('giây'))}
                ${row(k('inMs'), hpT('Về cỡ thật trong'), 50, 3000, 10, sc.inMs, 'ms')}`;
        if (sc.motion === 'batu') return `
                <div class="bt-sub">${hpT('🪢 CẢNH TOÀN - bị trói ở cột (xa)')}</div>
                ${row(k('bAx'), hpT('Ngang'), 0, 100, 0.5, sc.bAx, hpT('% ngang'), hpT('Giữa người - giữa vòng dây trên cột'))}
                ${row(k('bAbot'), hpT('Mép cam dưới'), 0, 150, 0.5, sc.bAbot, hpT('% cao'), hpT('Chỗ camera cắt chân - đặt ngay DƯỚI miệng bao tải một chút để bao che mất'))}
                ${row(k('bAsz'), hpT('Cao người'), 3, 200, 0.5, sc.bAsz, hpT('% cao'), hpT('Từ đỉnh đầu tới mép cam dưới - vòng dây nên nằm ngang ngực'))}
                <div class="bt-sub">${hpT('🪢 CẢNH CẬN - roi quất (gần)')}</div>
                ${row(k('bBx'), hpT('Ngang'), 0, 100, 0.5, sc.bBx, hpT('% ngang'))}
                ${row(k('bBbot'), hpT('Mép cam dưới'), 0, 150, 0.5, sc.bBbot, hpT('% cao'), hpT('Chỗ camera cắt chân - đặt ngay DƯỚI miệng bao tải một chút để bao che mất'))}
                ${row(k('bBsz'), hpT('Cao người'), 3, 200, 0.5, sc.bBsz, hpT('% cao'), hpT('Từ đỉnh đầu tới mép cam dưới - vòng dây nên nằm ngang ngực'))}
                <div class="bt-sub">${hpT('NHỊP (giây tính từ đầu video hiệu ứng)')}</div>
                ${row(k('bCut'), hpT('Cắt sang cảnh cận ở giây'), 0, 30, 0.001, sc.bCut, hpT('giây'), hpT('Trong mỗi chu kỳ - đúng khung video cắt cảnh'))}
                ${row(k('bPeriod'), hpT('Một chu kỳ dài'), 0.2, 30, 0.001, sc.bPeriod, hpT('giây'), hpT('Toàn + cận, rồi lặp lại (bằng độ dài video nền)'))}
                <div class="ctc-row" title="${hpTA('Giây roi quất trúng người, cách nhau bằng dấu cách - người giật nảy, loé đỏ, rung màn')}"><label>${hpT('Mốc roi quất')}</label>
                    <input type="text" data-act="bhits" value="${esc(sc.bHits)}" style="grid-column: span 2" /><span class="unit">${hpT('giây')}</span></div>
                ${row(k('bSway'), hpT('Vùng vẫy / giật'), 0, 300, 5, sc.bSway, '%', hpT('Độ lắc khi bị trói + độ giật khi trúng roi'))}
                ${row(k('shake'), hpT('Rung màn'), 0, 60, 1, sc.shake, 'px', hpT('Rung lúc roi quất trúng'))}
                ${row(k('backSec'), hpT('Về cỡ thật ở giây'), 0, 30, 0.05, sc.backSec, hpT('giây'), hpT('Hết video hiệu ứng - cắt về người như cũ'))}`;
        if (sc.motion === 'ninja') return `
                <div class="bt-sub">${hpT('🌳 NGỌN CÂY (đứng trên mây lúc đầu)')}</div>
                ${row(k('nTreeX'), hpT('Ngang'), 0, 100, 0.5, sc.nTreeX, hpT('% ngang'))}
                ${row(k('nTreeY'), hpT('Chân trên mây'), 0, 100, 0.5, sc.nTreeY, hpT('% cao'), hpT('Tính từ mép TRÊN xuống'))}
                ${row(k('nTreeSz'), hpT('Cỡ người trên cây'), 3, 80, 0.5, sc.nTreeSz, hpT('% cao'))}
                ${row(k('outMs'), hpT('Bay lên cây trong'), 100, 3000, 10, sc.outMs, 'ms')}
                ${row(k('nDrop'), hpT('Cưỡi mây tụt xuống từ giây'), 0, 30, 0.05, sc.nDrop, hpT('giây'))}
                ${row(k('nLand'), hpT('Chạm đất ở giây'), 0, 30, 0.05, sc.nLand, hpT('giây'), hpT('Mây tan, đĩa chân chạy hiện ra'))}
                <div class="bt-sub">${hpT('🏃 CHẠY GIỮA CAM')}</div>
                ${row(k('nX'), hpT('Ngang'), 0, 100, 0.5, sc.nX, hpT('% ngang'))}
                ${row(k('nGround'), hpT('Mặt đất'), 20, 100, 0.1, sc.nGround, hpT('% cao'), hpT('Đáy đĩa chân chạm đường này - tính từ mép TRÊN'))}
                ${row(k('nSize'), hpT('Cỡ người'), 3, 80, 0.5, sc.nSize, hpT('% cao'), hpT('Chiều cao thân người (phần camera thấy) lúc chạy'))}
                ${row(k('nFeetSz'), hpT('Đĩa chân to'), 0, 200, 1, sc.nFeetSz, hpT('% người'), hpT('Đường kính đĩa chân chạy so với chiều cao người - 0 = ẩn'))}
                <div class="ctc-row" title="${hpTA('người bị cắt chân (camera nửa người): đĩa nằm dưới thân. Full người (camera thấy cả chân): đĩa đưa lên che phần chân')}"><label>${hpT('Chân giả')}</label>
                    <select data-act="nfeetmode" style="grid-column: span 2"><option value="cut" ${sc.nFeetMode !== 'full' ? 'selected' : ''}>${hpT('✂ người bị cắt chân')}</option><option value="full" ${sc.nFeetMode === 'full' ? 'selected' : ''}>${hpT('🧍 Full người')}</option></select><span class="unit"></span></div>
                ${sc.nFeetMode === 'full'
                    ? row(k('nFeetLeg'), hpT('Đĩa che lên chân'), 0, 100, 1, sc.nFeetLeg, hpT('% người'), hpT('Tâm đĩa cao bao nhiêu phần chiều cao người, tính từ bàn chân - tăng để đĩa che lên cao hơn'))
                    : row(k('nFeetUp'), hpT('Thân lút vào đĩa'), 0, 100, 1, sc.nFeetUp, '%', hpT('Đáy thân người (chỗ camera cắt) nằm sâu trong đĩa bao nhiêu phần đường kính'))}
                <div class="bt-sub">${hpT('🥷 NÉ CHƯỚNG NGẠI')}</div>
                ${row(k('nJump'), hpT('Nhảy cao'), 0, 100, 0.5, sc.nJump, hpT('% cao'))}
                ${row(k('nHop'), hpT('Nhảy ngắn cao'), 0, 100, 0.5, sc.nHop, hpT('% cao'))}
                ${row(k('nDuck'), hpT('Cúi còn'), 20, 100, 1, sc.nDuck, hpT('% người'))}
                <div class="ctc-row" title="${hpTA('Mỗi lần né: chữ cái + giây bắt đầu-giây kết thúc, cách nhau bằng dấu cách. j = nhảy · f = nhảy lộn vòng · h = nhảy ngắn · d = cúi · s = trượt háng + đạp lưng. Vd: j1.55-2.3 d3.1-3.75')}"><label>${hpT('Mốc né')}</label>
                    <input type="text" data-act="nmoves" value="${esc(sc.nMoves)}" style="grid-column: span 2" /><span class="unit">${hpT('giây')}</span></div>
                <div class="bt-sub">${hpT('🏁 KẾT THÚC (bảng WIN / GAME OVER)')}</div>
                <div class="ctc-row" title="${hpTA('Ngẫu nhiên = mỗi lượt bốc 1 trong 10 kiểu (7 WIN, 3 GAME OVER). Đang GAME OVER mà có thêm lượt cùng game (combo / phát ngay / bấm thử) thì CONTINUE: đếm 3-2-1 rồi chơi tiếp')}"><label>${hpT('Kiểu chơi')}</label>
                    <select data-act="nend" style="grid-column: span 2">${[['random', hpT('🎲 Ngẫu nhiên')], ['win', hpT('🏆 Vượt qua hết - WIN')], ['twister', hpT('🌪 Bị lốc cuốn - vẫn WIN')], ['burnt', hpT('🔥 Cháy đen thui - vẫn WIN')], ['matrix', hpT('🕶 Né phi tiêu kiểu Matrix - WIN')], ['bonk', hpT('😵 Bị Bowser húc - vẫn WIN')], ['ride', hpT('🐢 Cưỡi Bowser - WIN')], ['pole', hpT('🪧 Đu biển hp - WIN')], ['star', hpT('⭐ Dính phi tiêu - GAME OVER')], ['rock', hpT('🪨 Bị đá đè - GAME OVER')], ['gone', hpT('🌠 Lốc cuốn bay mất - GAME OVER')]]
                        .map(([v, n]) => `<option value="${v}" ${sc.nEnd === v ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="unit"></span></div>
                ${row(k('nTwistHit'), hpT('Bị lốc cuốn ở giây'), 0, 30, 0.05, sc.nTwistHit, hpT('giây'), hpT('Lúc lốc xoáy chạm người - cuốn vào, bay lên cao'))}
                ${row(k('nTwistLand'), hpT('Rơi bịch xuống đất ở giây'), 0, 30, 0.05, sc.nTwistLand, hpT('giây'), hpT('Nên trước cú cúi né cầu lửa (3,1 s)'))}
                ${row(k('nBurnHit'), hpT('Cháy đen ở giây'), 0, 30, 0.05, sc.nBurnHit, hpT('giây'))}
                ${row(k('nBonkHit'), hpT('Bowser húc ở giây'), 0, 30, 0.05, sc.nBonkHit, hpT('giây'))}
                ${row(k('nRideAt'), hpT('Nhảy lên lưng Bowser ở giây'), 0, 30, 0.05, sc.nRideAt, hpT('giây'))}
                ${row(k('nPoleAt'), hpT('Nhảy tới biển hp ở giây'), 0, 30, 0.05, sc.nPoleAt, hpT('giây'))}
                ${row(k('nSlow'), hpT('Matrix chạy chậm còn'), 10, 100, 1, sc.nSlow, '%', hpT('Tốc độ video lúc né phi tiêu kiểu Matrix'))}
                ${row(k('nStarHit'), hpT('Dính phi tiêu ở giây'), 0, 30, 0.05, sc.nStarHit, hpT('giây'), hpT('Lúc phi tiêu chạm người - video đứng hình, người ngã nằm'))}
                ${row(k('nRockHit'), hpT('Đá đè ở giây'), 0, 30, 0.05, sc.nRockHit, hpT('giây'), hpT('Lúc cục đá bắt đầu đè lên người'))}
                ${row(k('nOverSec'), hpT('Bảng hiện trong'), 0.5, 15, 0.5, sc.nOverSec, hpT('giây'))}
                ${row(k('backSec'), hpT('Về cỡ thật từ giây'), 0, 30, 0.05, sc.backSec, hpT('giây'), hpT('Hết video nền: bảng WIN hiện từ đây'))}
                ${row(k('inMs'), hpT('Về cỡ thật trong'), 50, 3000, 10, sc.inMs, 'ms')}`;
        return `
                <div class="bt-sub">${hpT('🏓 ĐẦU A - sát camera: thấy KHUÔN MẶT')}</div>
                ${row(k('pAx'), hpT('Mặt ngang'), 0, 100, 0.5, sc.pAx, hpT('% ngang'))}
                ${row(k('pAy'), hpT('Mặt dọc'), -50, 150, 0.5, sc.pAy, hpT('% cao'))}
                ${row(k('pAsz'), hpT('Mặt cao'), 10, 200, 1, sc.pAsz, hpT('% cao'), hpT('Khuôn mặt người to bao nhiêu khi lao sát màn hình'))}
                ${row(k('pFace'), hpT('Tâm mặt trên người'), 0, 50, 0.5, sc.pFace, hpT('% người'), hpT('Tính từ đỉnh đầu xuống, theo chiều cao người đã tách - chỉnh nếu khung zoom lệch khỏi mặt (camera cận nửa người thì tăng lên)'))}
                <div class="bt-sub">${hpT('🏓 ĐẦU B - vợt cô bé (bóng NHỎ, xa)')}</div>
                ${row(k('pBx'), hpT('Tâm ngang'), 0, 100, 0.5, sc.pBx, hpT('% ngang'))}
                ${row(k('pBy'), hpT('Tâm dọc'), 0, 100, 0.5, sc.pBy, hpT('% cao'))}
                ${row(k('pBsz'), hpT('Cao'), 2, 80, 0.5, sc.pBsz, hpT('% cao'))}
                <div class="bt-sub">${hpT('ĐƯỜNG BAY')}</div>
                ${row(k('pLob'), hpT('Vồng lên cao'), 0, 150, 1, sc.pLob, hpT('% cao'), hpT('Bóng bay vọt lên rồi mới rơi xuống đầu bên kia'))}
                ${row(k('pSpin'), hpT('Quay đầu–chân mỗi chặng'), 0, 500, 10, sc.pSpin, hpT('% vòng'), hpT('100 = 1 vòng; luôn làm tròn số vòng để tới vợt / tới mặt là thẳng người'))}
                ${row(k('pFlips'), hpT('Lộn nhào mỗi chặng'), 0, 5, 1, sc.pFlips, hpT('vòng'))}
                ${row(k('inMs'), hpT('Về cỡ thật trong'), 50, 3000, 10, sc.inMs, 'ms')}
                <div class="ctc-row" title="${hpTA('Giây có tiếng đánh trong video nền, cách nhau bằng dấu cách. Cú đầu ở A (camera), xen kẽ A / B; cú cuối là lúc bóng về A rồi người trở lại cỡ thật')}"><label>${hpT('Mốc cú đánh')}</label>
                    <input type="text" data-act="phits" value="${esc(sc.pHits)}" style="grid-column: span 2" /><span class="unit">${hpT('giây')}</span></div>`;
    }
    // ---------- 🎮 lưới GAME chung (kiểu 🧪 Thư viện hiệu ứng Douyin / TikTok Studio) ----------
    // Mọi game của Bộ Tách Người trong MỘT lưới (user 2026-10-19: "đưa toàn bộ game xuống dưới, làm gọn, dạng thấy được review"):
    // 🦊 Hậu Cảnh (mỗi video / ảnh nền sau lưng = 1 game) · 🕳️ Rơi Hố · 🏃 Bị Đuổi · 🎬 Video Hành Động (7 kiểu).
    // Ô = ảnh xem trước từ video / ảnh của game (rê chuột là phát) - bấm = ▶ CHẠY THỬ (user 2026-10-19; game chưa có video thì mở
    // popup để thêm); chuột phải = ⚙ Cài đặt (popup chỉnh riêng + cài đặt chung của loại) · 🎁 Gắn quà · 📄 Nhân bản · ⬆ Lên đầu ·
    // 🗑 Xoá. Tìm + chip lọc theo loại: 20–50 game vẫn
    // gọn; video xem trước chỉ nạp khi Ô cuộn tới (IntersectionObserver) - không nạp 50 video cùng lúc.
    const VF_ICON = { portal: '🌀', blast: '☄️', abduct: '🛸', knock: '🥊', crush: '👊', mario: '🍄', pickle: '🏓', ninja: '🥷', batu: '🪢' };
    // mốc lấy ảnh xem trước (giây) - lúc video có hình rõ nhất (video trong suốt đầu thường trống)
    const VF_THUMB_T = { portal: 1.2, blast: 2.2, abduct: 2.0, knock: 0.35, crush: 0.8, mario: 1.0, pickle: 1.0, ninja: 4.9, batu: 0.6 };
    const VF_SHORT = { portal: hpT('Tụt cổng'), blast: hpT('Bị nổ văng'), abduct: hpT('Bị hút lên'), knock: hpT('Đấm văng'), crush: hpT('Đè bẹp'), mario: hpT('Mario'), pickle: hpT('Pickleball'), ninja: hpT('Ninja'), batu: hpT('Ba Tư') };
    const GKINDS = {
        haucanh: { icon: '🦊', name: hpT('Hậu Cảnh'), file: x => x.file },
        roiho: { icon: '🕳️', name: hpT('Rơi Hố'), file: x => x.bgFile },
        biduoi: { icon: '🏃', name: hpT('Bị Đuổi'), file: x => (x.videos[0] || {}).file || '' },
        vidfx: { icon: '🎬', name: hpT('Video Hành Động'), file: x => x.file },
        cry: { icon: '😭', name: hpT('Khóc Lóc'), file: () => '' },         // lớp mặt: không cần video
        heart: { icon: '💗', name: hpT('Bắn Tim'), file: () => '' },        // lớp tay: không cần video
        catch: { icon: '🔴', name: hpT('Bắt NPC'), file: () => '' },        // quả cầu vẽ bằng mã: không cần video
        morph: { icon: '✨', name: hpT('Biến Hình'), file: () => '' }       // vẽ bằng mã: không cần video
    };
    const GK_ALL = ['haucanh', 'roiho', 'biduoi', 'vidfx', 'cry', 'heart', 'catch', 'morph'];
    const gIcon = (kind, x) => kind === 'vidfx' ? (VF_ICON[x.motion] || '🎬') : kind === 'cry' ? (x.mood === 'laugh' ? '😂' : '😭') : kind === 'morph' ? (MO_ICON[x.style] || '✨') : GKINDS[kind].icon;
    const gType = (kind, x) => kind === 'vidfx' ? (VF_SHORT[x.motion] || '') : kind === 'cry' ? (x.mood === 'laugh' ? hpT('Cười ra nước mắt') : hpT('Khóc Lóc')) : kind === 'morph' ? (MO_SHORT()[x.style] || GKINDS.morph.name) : GKINDS[kind].name;
    const gFilterOf = (kind, x) => kind === 'vidfx' ? 'vf:' + x.motion : kind;
    const gKey = (kind, x) => kind + ':' + x.id;
    // 🖼 Ảnh bìa: list/camgames/body/thumb/<tên>.webp (bảng tên: docs/thumbnail-game-ve-bang-ma.md). Game vẽ bằng mã + 🕳️ / 🏃 chưa có
    // video → thay emoji; 🎬 Video Hành Động: ảnh theo KIỂU game (motion) đè khung hình video, video nào cũng vậy - máy dev gắn video
    // nghiên cứu ngoài list/ cũng phải ra ảnh (user 2026-10-29); rê chuột thì ẩn ảnh, phát video. Chưa có file ảnh → ảnh lỗi bị gỡ
    // (về emoji / video); nhớ URL lỗi để vẽ lại lưới không hỏi lại server.
    const ART_DIR = '/games/body/samples/thumb/';
    const artName = (kind, x, file) => file ? (kind === 'vidfx' && x.motion ? 'vf-' + x.motion : '')
        : kind === 'morph' ? (x.style ? 'morph-' + x.style : '') : kind === 'cry' ? (x.mood === 'laugh' ? 'cry-laugh' : 'cry')
        : ['heart', 'catch', 'roiho', 'biduoi'].includes(kind) ? kind : '';
    const artBad = new Set();
    const artUrl = (kind, x, file) => { const n = artName(kind, x, file), u = n ? ART_DIR + n + '.webp' : ''; return u && !artBad.has(u) ? u : ''; };
    // ▶ chạy thử: tam giác SVG có TRỌNG TÂM đúng x = 12 (giữa khung 24) → nhìn đúng giữa vòng tròn (ký tự "▶" lệch theo font).
    const PLAY_ICON = '<span class="bt-vplay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg></span>';
    let gQuery = '', gFilter = '', gOpen = '';
    try { gFilter = localStorage.getItem('hpal.body.gFilter') || ''; } catch (_) {}
    function gAll() {
        const out = [];
        for (const kind of GK_ALL) listOf(kind).forEach((x, i) => out.push({ kind, x, i }));
        return out;
    }
    const gFind = key => gAll().find(g => gKey(g.kind, g.x) === key) || null;
    // 📦 file mẫu bắt buộc chưa có trên máy (meta.missingSamples từ server) - như lib/body-server.js requiredFiles
    function missOf(kind, x) {
        const miss = new Set(meta.missingSamples || []);
        if (!miss.size) return [];
        const req = kind === 'haucanh' ? [x.file] : kind === 'roiho' ? [x.bgFile] : kind === 'vidfx' ? [x.file, x.bgFile]
            : kind === 'biduoi' ? (x.videos.length === 1 ? [x.videos[0].file, x.videos[0].fg] : []) : [];
        return req.filter(f => f && miss.has(f));
    }
    function gTile({ kind, x, i }) {
        const file = GKINDS[kind].file(x), g = x.gifts[0];
        const ms = HB().estimateMs(kind, x), sec = ms > 0 ? ms / 1000 : 0;
        // 🕳️ Rơi Hố / 🏃 Bị Đuổi chạy được KHÔNG cần video nền (user 2026-10-19) → không báo thiếu, vẫn có ▶ chạy thử.
        const noFile = kind === 'biduoi' ? !x.videos.length : !file;
        const needFile = noFile && (kind === 'haucanh' || kind === 'vidfx');
        const miss = missOf(kind, x);
        const warn = needFile ? (kind === 'haucanh' ? hpT('Chưa có video nền') : hpT('Chưa có video')) : miss.length ? hpT('Thiếu file mẫu {v}', { v: miss.map(f => f.split('/').pop()).join(', ') }) : !x.gifts.length ? hpT('Chưa gắn quà') : (x.profileId && !profOf(x.profileId)) ? hpT('Hồ sơ đã xoá') : '';
        const t = kind === 'vidfx' ? (VF_THUMB_T[x.motion] || 1.2) : 1;
        const prof = x.profileId && profOf(x.profileId) ? npcName(profOf(x.profileId).groupId) : '';
        const art = artUrl(kind, x, file), artOver = art && file && isVid(file);
        return `<button type="button" class="bt-vtile${warn ? ' warn' : ''}" data-g="${esc(gKey(kind, x))}" title="${hpTA('Bấm: chạy thử - Chuột phải: Cài đặt / Gắn quà / Nhân bản…')}">
            <div class="bt-vthumb">${file && (meta.missingSamples || []).includes(file) ? `<span class="bt-vnone">${gIcon(kind, x)}</span>` : file && isVid(file) ? `<video${isPacked(file) ? ' class="packed"' : ''} muted loop playsinline preload="none" data-src="${esc(fileUrl(file))}#t=${t}" data-t="${t}"></video>${artOver ? `<img class="bt-vart over" src="${esc(art)}" alt="" loading="lazy" decoding="async">` : ''}` : file ? `<img src="${esc(fileUrl(file))}" alt="" loading="lazy">` : `<span class="bt-vnone">${gIcon(kind, x)}</span>${art ? `<img class="bt-vart" src="${esc(art)}" alt="" loading="lazy" decoding="async">` : ''}`}
                <span class="bt-vkind" title="${esc(gType(kind, x))}">${gIcon(kind, x)}</span>
                ${g ? `<span class="bt-vgift" title="${esc(x.gifts.map(y => y.giftName).join(', '))}">${g.giftImage ? `<img src="${esc(g.giftImage)}" alt="">` : '🎁'}${x.gifts.length > 1 ? `<em>+${x.gifts.length - 1}</em>` : ''}</span>` : ''}
                ${kind === 'biduoi' && x.videos.length > 1 ? `<span class="bt-vcount">📼 ${x.videos.length}</span>` : ''}
                <span class="bt-vbr">${x.sfxFile ? `<span class="bt-vsnd" title="${esc(fileLabel(x.sfxFile))}">🔊</span>` : ''}${runBadge(kind, x)}</span>
                ${needFile ? '' : PLAY_ICON}
            </div>
            <b>${esc(x.name)}</b>
            <small>${esc(gType(kind, x))}${sec ? ` · ${fmt(+sec.toFixed(1))}s` : ''}${prof ? ` · 🧍 ${esc(prof)}` : ''}</small>
            ${warn ? `<span class="bt-vwarn">⚠ ${esc(warn)}</span>` : ''}
        </button>`;
    }
    function gVisible() {
        const q = gQuery.trim().toLowerCase();
        return gAll().filter(({ kind, x }) => (!gFilter || gFilter === kind || gFilter === gFilterOf(kind, x))
            && (!q || [x.name, gType(kind, x), GKINDS[kind].name, fileLabel(GKINDS[kind].file(x)), ...x.gifts.map(g => g.giftName)].join(' ').toLowerCase().includes(q)));
    }
    function gGridHtml() {
        return gVisible().map(gTile).join('')
            || `<div class="hint">${gAll().length ? hpT('Không có game nào khớp.') : hpT('Chưa có game nào. Chọn loại rồi bấm ＋ Thêm.')}</div>`;
    }
    // Loại game có thể thêm: 3 loại riêng + 7 kiểu Video Hành Động.
    const GNEW = () => [['haucanh', hpT('🦊 Hậu Cảnh')], ['roiho', hpT('🕳️ Rơi Hố')], ['biduoi', hpT('🏃 Bị Đuổi')]]
        .concat(VF_MOTIONS.map(([v, n]) => ['vf:' + v, n]))
        .concat([['cry', hpT('😭 Khóc Lóc')], ['cry:laugh', hpT('😂 Cười ra nước mắt')], ['heart', hpT('💗 Bắn Tim')], ['catch', hpT('🔴 Bắt NPC')]])
        .concat(MO_STYLES().map(([v, n]) => ['mo:' + v, n]));
    function tabGames() {
        const all = gAll(), chips = [];
        const add = (f, label, n) => { if (n) chips.push(`<button class="bt-chip${gFilter === f ? ' on' : ''}" data-g-filter="${f}">${label} <em>${n}</em></button>`); };
        for (const kind of ['haucanh', 'roiho', 'biduoi']) add(kind, `${GKINDS[kind].icon} ${GKINDS[kind].name}`, all.filter(g => g.kind === kind).length);
        const vf = all.filter(g => g.kind === 'vidfx');
        add('vidfx', `🎬 ${GKINDS.vidfx.name}`, vf.length);
        for (const m of [...new Set(vf.map(g => g.x.motion))]) add('vf:' + m, `${VF_ICON[m]} ${VF_SHORT[m]}`, vf.filter(g => g.x.motion === m).length);
        add('cry', `😭 ${GKINDS.cry.name}`, all.filter(g => g.kind === 'cry').length);
        add('heart', `💗 ${GKINDS.heart.name}`, all.filter(g => g.kind === 'heart').length);
        add('catch', `🔴 ${GKINDS.catch.name}`, all.filter(g => g.kind === 'catch').length);
        add('morph', `✨ ${GKINDS.morph.name}`, all.filter(g => g.kind === 'morph').length);
        return `<div class="ctc-card">
                <div class="bt-vbar">
                    <input id="bt-g-q" type="search" placeholder="${hpTA('Tìm game / quà…')}" value="${esc(gQuery)}" />
                    <select id="bt-g-new" title="${hpTA('Loại game mới')}">${GNEW().map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
                    <button class="small primary" data-act="gnew">${hpT('Thêm')}</button>
                </div>
                <div class="bt-vbar"><div class="bt-vchips" style="flex:1;margin:0"><button class="bt-chip${!gFilter ? ' on' : ''}" data-g-filter="">${hpT('Tất cả')} <em>${all.length}</em></button>${chips.join('')}</div></div>
                <div class="bt-vgrid" id="bt-vgrid">${gGridHtml()}</div>
            </div>`;
    }
    // Đọc độ dài video (giây) để DANH SÁCH HIỆU ỨNG giữ hàng đúng lâu.
    function readDuration(url, done) {
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true; v.src = fileUrl(url);
        v.onloadedmetadata = () => { if (Number.isFinite(v.duration)) done(+v.duration.toFixed(2)); v.removeAttribute('src'); v.load(); };
    }
    let gThumbObs = null;
    function bindGGrid(host) { bindGGridEl(host.querySelector('#bt-vgrid')); }
    function bindGGridEl(grid) {
        if (!grid) return;
        // video xem trước nạp khi Ô hiện ra (preload none → metadata + khung đẹp nhất)
        if (gThumbObs) gThumbObs.disconnect();
        gThumbObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
            if (!e.isIntersecting) return;
            const v = e.target; gThumbObs.unobserve(v);
            if (v.dataset.src && !v.src) { v.preload = 'metadata'; v.src = v.dataset.src; }
        }), { root: null, rootMargin: '200px' }) : null;
        const loadVid = v => { if (gThumbObs) gThumbObs.observe(v); else { v.preload = 'metadata'; v.src = v.dataset.src; } };
        // video có ảnh bìa đè lên: khỏi nạp trước, rê chuột mới nạp (mouseenter bên dưới)
        grid.querySelectorAll('video[data-src]').forEach(v => { if (!v.parentNode.querySelector('img.bt-vart')) loadVid(v); });
        grid.querySelectorAll('img.bt-vart').forEach(im => {
            const bad = () => { artBad.add(im.getAttribute('src')); const v = im.parentNode && im.parentNode.querySelector('video[data-src]'); im.remove(); if (v && !v.src) loadVid(v); };
            const ok = () => im.classList.add('on');
            if (im.complete) { if (im.naturalWidth) ok(); else bad(); return; }
            im.addEventListener('load', ok, { once: true });
            im.addEventListener('error', bad, { once: true });
        });
        grid.querySelectorAll('.bt-vtile').forEach(t => {
            const v = t.querySelector('video');
            if (v) {
                t.addEventListener('mouseenter', () => { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); });
                t.addEventListener('mouseleave', () => { v.pause(); try { v.currentTime = Number(v.dataset.t) || 1; } catch (_) {} });
            }
            t.addEventListener('click', e => {
                const g = gFind(t.dataset.g); if (!g) return;
                if (e.target.closest('[data-run]')) { setRunMode(g.kind, g.x, nextRunMode(g.kind, g.x)); renderSettings(); schedulePersist(); return; }
                // Hậu Cảnh / 🎬 chưa có video → mở để thêm; 🕳️ Rơi Hố / 🏃 Bị Đuổi chạy được không cần video → bấm là chạy (cài đặt: chuột phải).
                if (!g.kind || ((g.kind === 'haucanh' || g.kind === 'vidfx') && !GKINDS[g.kind].file(g.x))) return openGModal(t.dataset.g);
                runTest({ kind: g.kind, id: g.x.id });
                t.classList.add('firing'); setTimeout(() => t.classList.remove('firing'), 700);
            });
            t.addEventListener('contextmenu', e => { e.preventDefault(); gMenu(e, t.dataset.g); });
        });
    }
    // Tạo game mới theo loại chọn ở ô "＋ Thêm" → mở popup ngay để chọn video / ảnh nền.
    function gCreate(v) {
        const p = cur(), pid = p ? p.id : '';
        let kind = v, x;
        if (v === 'haucanh') x = HB().makeItem({ name: hpT('Hậu Cảnh {n}', { n: cfg.haucanh.items.length + 1 }), profileId: pid });
        else if (v === 'roiho') x = HB().makeRoiHo({ name: hpT('Rơi Hố {n}', { n: cfg.roiho.scripts.length + 1 }) });
        else if (v === 'biduoi') x = HB().makeBiDuoi({ name: hpT('Bị Đuổi {n}', { n: cfg.biduoi.scripts.length + 1 }) });
        else if (v === 'cry' || v === 'cry:laugh') { kind = 'cry'; const laugh = v === 'cry:laugh'; x = HB().makeCry({ name: laugh ? hpT('Cười ra nước mắt {n}', { n: cfg.cry.scripts.length + 1 }) : hpT('Khóc Lóc {n}', { n: cfg.cry.scripts.length + 1 }), mood: laugh ? 'laugh' : 'cry', profileId: pid }); }
        else if (v === 'heart') x = HB().makeHeart({ name: hpT('Bắn Tim {n}', { n: cfg.heart.scripts.length + 1 }), profileId: pid });
        else if (v === 'catch') x = HB().makeCatch({ name: hpT('Bắt NPC {n}', { n: cfg.catch.scripts.length + 1 }), profileId: pid });
        else if (v.startsWith('mo:')) { kind = 'morph'; const st = v.slice(3); x = HB().makeMorph({ style: st, name: HB().morphLabel(st), profileId: pid }); }
        else { kind = 'vidfx'; const m = v.slice(3); x = HB().makeVidFx({ ...(HB().vidFxSample(m) || {}), motion: m, profileId: pid }); }   // 📦 sẵn video mẫu của kiểu
        listOf(kind).push(x);
        renderSettings(); schedulePersist(); openGModal(gKey(kind, x));
    }
    function bindGames(host) {
        host.querySelector('[data-act=gnew]').addEventListener('click', () => gCreate($('#bt-g-new').value));
        host.querySelectorAll('[data-run-all]').forEach(b => b.addEventListener('click', () => setRunModeAll(b.dataset.runAll)));
        const q = host.querySelector('#bt-g-q');
        q.addEventListener('input', () => { gQuery = q.value; host.querySelector('#bt-vgrid').innerHTML = gGridHtml(); bindGGrid(host); });
        host.querySelectorAll('[data-g-filter]').forEach(b => b.addEventListener('click', () => {
            gFilter = b.dataset.gFilter; try { localStorage.setItem('hpal.body.gFilter', gFilter); } catch (_) {}
            renderSettings();
        }));
        bindGGrid(host);
        // độ dài video Video Hành Động chưa biết (thêm file từ bản cũ) → đọc nền
        cfg.vidfx.scripts.forEach((sc, i) => { if (sc.file && !(sc.durSec > 0) && isVid(sc.file)) readDuration(sc.file, d => { sc.durSec = d; refreshVidFxPlan(i); schedulePersist(); }); });
    }
    // Gắn hành vi cho thẻ chỉnh sửa Video Hành Động (trong popup).
    function bindVfCard(card) {
        const i = Number(card.dataset.i), sc = cfg.vidfx.scripts[i];
        bindCommon(card, 'vidfx', sc, i, '🎬');
        const gotDur = d => { sc.durSec = d; refreshVidFxPlan(i); schedulePersist(); };
        bindDrop(card.querySelector('[data-drop=vf]'), url => { sc.file = url; sc.durSec = 0; readDuration(url, gotDur); });
        bindDrop(card.querySelector('[data-drop=vfbg]'), url => { sc.bgFile = url; });
        card.querySelector('[data-act=clear-vfbg]')?.addEventListener('click', e => { e.stopPropagation(); sc.bgFile = ''; renderSettings(); schedulePersist(); });
        card.querySelector('[data-act=bhits]')?.addEventListener('change', e => {
            const hits = HB().parseHits(e.target.value, 0);
            if (!hits) { window.toast?.(hpT('Mốc giây tăng dần, cách nhau bằng dấu cách'), 'error'); e.target.value = sc.bHits; return; }
            sc.bHits = hits.join(' '); e.target.value = sc.bHits; refreshVidFxPlan(i); schedulePersist();
        });
        const clr = card.querySelector('[data-act=clear-vf]');
        if (clr) clr.addEventListener('click', e => { e.stopPropagation(); sc.file = ''; sc.durSec = 0; renderSettings(); schedulePersist(); });
        card.querySelector('[data-act=sound]').addEventListener('change', e => { sc.sound = e.target.checked; schedulePersist(); });
        card.querySelector('[data-act=layer]').addEventListener('change', e => { sc.layer = e.target.value; schedulePersist(); });
        const ph = card.querySelector('[data-act=phits]');
        if (ph) ph.addEventListener('change', e => {
            const hits = HB().parseHits(e.target.value);
            if (!hits) { window.toast?.(hpT('Cần ít nhất 2 mốc giây tăng dần'), 'error'); e.target.value = sc.pHits; return; }
            sc.pHits = hits.join(' '); e.target.value = sc.pHits; refreshVidFxPlan(i); schedulePersist();
        });
        card.querySelector('[data-act=nend]')?.addEventListener('change', e => { sc.nEnd = e.target.value; refreshVidFxPlan(i); schedulePersist(); });
        card.querySelector('[data-act=nfeetmode]')?.addEventListener('change', e => { sc.nFeetMode = e.target.value; renderSettings(); schedulePersist(); if (gOpen) openGModal(gKey('vidfx', sc), true); });
        const nm = card.querySelector('[data-act=nmoves]');
        if (nm) nm.addEventListener('change', e => {
            const moves = HB().parseMoves(e.target.value);
            if (e.target.value.trim() && !moves.length) { window.toast?.(hpT('Mốc né dạng j1.5-2.3 (j nhảy · f lộn · h nhảy ngắn · d cúi · s trượt háng)'), 'error'); e.target.value = sc.nMoves; return; }
            sc.nMoves = moves.map(m => m.t + m.a + '-' + m.b).join(' '); e.target.value = sc.nMoves; refreshVidFxPlan(i); schedulePersist();
        });
        card.querySelector('[data-act=motion]').addEventListener('change', e => {
            const keep = { id: sc.id, name: sc.name, profileId: sc.profileId, gifts: sc.gifts, queueMode: sc.queueMode, file: sc.file, bgFile: sc.bgFile, sound: sc.sound, durSec: sc.durSec,
                sfxFile: sc.sfxFile, sfxVol: sc.sfxVol, sfx: sc.sfx, runMode: sc.runMode };   // 🔊 mp3 riêng + âm lượng + tiếng giả lập + 🎵 nhạc nền giữ nguyên khi đổi kiểu
            // Đang dùng video mẫu (hoặc chưa có video) → đổi sang video mẫu của kiểu mới; video của streamer thì giữ nguyên.
            const old = HB().vidFxSample(sc.motion), nu = HB().vidFxSample(e.target.value);
            if (nu && (!sc.file || HB().isVidFxSampleFile(sc.file))) { keep.file = nu.file; keep.durSec = nu.durSec; if (!keep.name || (old && keep.name === old.name)) keep.name = nu.name; }
            // 🎞 video nền dưới cùng: nền mẫu đi theo kiểu (kiểu mới không có thì bỏ); nền riêng của streamer giữ nguyên
            if (!sc.bgFile || HB().isVidFxSampleFile(sc.bgFile)) keep.bgFile = (nu && nu.bgFile) || '';
            // 🎵 nhạc mẫu đi theo video mẫu: chưa có mp3 riêng (hoặc đang dùng nhạc mẫu của kiểu cũ) → lấy nhạc mẫu của kiểu mới (không có thì bỏ)
            if (nu && (!sc.sfxFile || HB().isVidFxSampleFile(sc.sfxFile))) { keep.sfxFile = nu.sfxFile || ''; if (nu.sfxVol) keep.sfxVol = nu.sfxVol; }
            cfg.vidfx.scripts[i] = HB().normalizeVidFx({ ...HB().makeVidFx({ motion: e.target.value }), ...keep }, i);
            renderSettings(); schedulePersist();
        });
        card.addEventListener('click', e => {
            const el = e.target.closest('[data-act]'); if (!el) return;
            if (el.dataset.act === 'vfdir') { sc.dir = el.dataset.v; renderSettings(); schedulePersist(); }
            else if (el.dataset.act === 'vfpreset') { Object.assign(sc, HB().VIDFX_PRESETS[sc.motion], HB().VIDFX_EXTRA[sc.motion] || {}); renderSettings(); schedulePersist(); }
        });
    }
    // Cài đặt CHUNG của một loại (áp cho mọi game cùng loại) - gập trong popup.
    function kindSettings(kind) {
        const synthVol = k => `<div class="ctc-card">${row(`sv:${k}`, hpT('🎧 Âm lượng tiếng giả lập'), 0, 100, 1, Math.round((cfg[k].sfxVolume ?? 0.7) * 100), '%')}</div>`;
        if (kind === 'roiho') return bgModeCard('roiho', hpT('rơi hố')) + synthVol('roiho');
        if (kind === 'vidfx') return bgModeCard('vidfx', hpT('chạy video hành động')) + synthVol('vidfx');
        if (kind === 'biduoi') return bgModeCard('biduoi', hpT('bị đuổi')) + biDuoiLook();
        if (kind === 'catch') return bgModeCard('catch', hpT('bắt NPC')) + synthVol('catch');
        if (kind === 'morph') return bgModeCard('morph', hpT('biến hình')) + synthVol('morph');
        return '';
    }
    // ---------- popup chỉnh sửa 1 game ----------
    function gModalEl() {
        let m = document.getElementById('bt-g-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'bt-g-modal'; m.className = 'bt-modal'; m.hidden = true;
        m.innerHTML = `<div class="bt-modal-card" role="dialog" aria-modal="true">
            <div class="bt-modal-head"><span class="bt-modal-ico"></span><b class="bt-modal-title"></b><span class="bt-modal-kind"></span>
                <button class="ghost small" data-mact="reset" title="${hpTA('Về mặc định của nhà phát hành - giữ tên, quà và hồ sơ người')}">${hpT('Về mặc định')}</button>
                <button class="ghost small" data-mact="prev" title="${hpTA('Game trước')}">‹</button><button class="ghost small" data-mact="next" title="${hpTA('Game sau')}">›</button>
                <button class="ghost small bt-modal-x" data-mact="close" title="${hpTA('Đóng (Esc)')}">✕</button></div>
            <div class="bt-modal-body"></div></div>`;
        document.body.appendChild(m);
        // người dùng đóng popup → vẽ lại lưới (tên / quà / video vừa sửa hiện ngay trên Ô)
        const userClose = () => { closeGModal(); renderSettings(); };
        m.addEventListener('mousedown', e => { if (e.target === m) userClose(); });
        m.querySelector('.bt-modal-head').addEventListener('click', e => {
            const a = e.target.closest('[data-mact]'); if (!a) return;
            if (a.dataset.mact === 'close') return userClose();
            if (a.dataset.mact === 'reset') { const g = gFind(gOpen); if (g) resetGame(g.kind, g.x); return; }
            const list = gVisible(), k = list.findIndex(g => gKey(g.kind, g.x) === gOpen);
            const nxt = list[(k + (a.dataset.mact === 'next' ? 1 : -1) + list.length) % list.length];
            if (nxt) openGModal(gKey(nxt.kind, nxt.x));
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.hidden && document.getElementById('bt-ctx')?.hidden !== false) userClose(); });
        return m;
    }
    function openGModal(key, keepScroll) {
        const g = gFind(key);
        if (!g) return closeGModal();
        gOpen = key;
        const { kind, x, i } = g, m = gModalEl(), body = m.querySelector('.bt-modal-body'), top = keepScroll ? body.scrollTop : 0;
        const wasOpen = body.querySelector('details.bt-kset')?.open;
        m.querySelector('.bt-modal-ico').textContent = gIcon(kind, x);
        m.querySelector('.bt-modal-title').textContent = x.name;
        m.querySelector('.bt-modal-kind').textContent = gType(kind, x);
        const card = kind === 'haucanh' ? hcCard(x, i) : kind === 'roiho' ? rhCard(x, i) : kind === 'biduoi' ? bdCard(x, i) : kind === 'cry' ? cryCard(x, i) : kind === 'heart' ? heartCard(x, i) : kind === 'catch' ? catchCard(x, i) : kind === 'morph' ? morphCard(x, i) : vfCard(x, i);
        const ks = kindSettings(kind);
        body.innerHTML = card + (ks ? `<details class="bt-kset"${wasOpen ? ' open' : ''}><summary>${hpT('Cài đặt chung - mọi game {v}', { v: GKINDS[kind].name })}</summary>${ks}</details>` : '');
        if (kind === 'haucanh') bindHauCanh(body);
        else if (kind === 'roiho') bindRoiHo(body);
        else if (kind === 'biduoi') bindBiDuoi(body);
        else if (kind === 'cry') bindCry(body);
        else if (kind === 'heart') bindHeart(body);
        else if (kind === 'catch') bindCatch(body);
        else if (kind === 'morph') bindMorph(body);
        else bindVfCard(body.querySelector('.bt-item'));
        body.querySelectorAll('[data-bgmode]').forEach(s => s.addEventListener('change', e => { cfg[s.dataset.bgmode].bgMode = e.target.value; renderSettings(); schedulePersist(); }));
        bindRows(body);
        m.hidden = false;
        body.scrollTop = top;
    }
    function closeGModal() {
        gOpen = '';
        const m = document.getElementById('bt-g-modal');
        if (m && !m.hidden) { m.hidden = true; m.querySelector('.bt-modal-body').innerHTML = ''; }
    }
    // Panel gọi renderSettings() sau mỗi thay đổi → popup đang mở vẽ lại theo dữ liệu mới (giữ chỗ cuộn); game đã xoá → đóng.
    function refreshGModal() { if (gOpen) openGModal(gOpen, true); }
    // ---------- menu chuột phải ----------
    // items: [{ icon, label, desc?, danger?, run }] - hiện tại con trỏ, kẹp trong cửa sổ; bấm ngoài / Esc / lăn chuột là đóng.
    function showCtx(e, items) {
        ensureGridCss();
        let menu = document.getElementById('bt-ctx');
        if (!menu) {
            menu = document.createElement('div'); menu.id = 'bt-ctx'; menu.className = 'bt-ctx'; menu.hidden = true;
            document.body.appendChild(menu);
            const close = () => { menu.hidden = true; };
            document.addEventListener('mousedown', ev => { if (!menu.hidden && !menu.contains(ev.target)) close(); }, true);
            document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
            document.addEventListener('wheel', close, { capture: true, passive: true });   // người dùng lăn chuột (ảnh nạp làm trang tự dịch không tính)
        }
        menu.innerHTML = items.map((it, k) => `<button type="button" class="${it.danger ? 'danger' : ''}" data-k="${k}"><span class="bt-ctx-ico">${it.icon}</span><span class="bt-ctx-tx"><b>${esc(it.label)}</b>${it.desc ? `<small>${esc(it.desc)}</small>` : ''}</span></button>`).join('');
        menu.onclick = ev => { const b = ev.target.closest('[data-k]'); if (!b) return; menu.hidden = true; items[Number(b.dataset.k)].run(); };
        // panel.html đặt body zoom 1.15 → toạ độ chuột chia lại theo zoom; kẹp trong cửa sổ
        const z = parseFloat(getComputedStyle(document.body).zoom) || 1;
        menu.hidden = false; menu.style.visibility = 'hidden'; menu.style.left = '0px'; menu.style.top = '0px';
        const r = menu.getBoundingClientRect(), vw = window.innerWidth / z, vh = window.innerHeight / z;
        menu.style.left = Math.max(4, Math.min(e.clientX / z, vw - r.width - 4)) + 'px';
        menu.style.top = Math.max(4, Math.min(e.clientY / z, vh - r.height - 4)) + 'px';
        menu.style.visibility = '';
    }
    // ↺ Về MẶC ĐỊNH CỦA NHÀ PHÁT HÀNH (user 2026-10-20): mọi thông số / nhịp / công tắc / danh sách / nhạc nền về như lúc giao app.
    // GIỮ: mã, tên, quà đã gắn, hồ sơ NPC + video / ảnh của streamer (Hậu Cảnh, Rơi Hố, Bị Đuổi). 🎬 Video Hành Động về đúng game mẫu của
    // kiểu đó (video mẫu + nhịp đo từ video mẫu); game mẫu giao kèm (vft_…) về cả tên mẫu.
    function factoryOf(kind, x, i) {
        const keep = { id: x.id, name: x.name, gifts: x.gifts, profileId: x.profileId };
        if (kind === 'haucanh') return HB().normalizeItem(HB().makeItem({ ...keep, file: x.file, layers: x.layers, alpha: x.alpha }), i);
        if (kind === 'roiho') return HB().normalizeRoiHo(HB().makeRoiHo({ ...keep, bgFile: x.bgFile }), i);
        if (kind === 'biduoi') return HB().normalizeBiDuoi(HB().makeBiDuoi({ ...keep, videos: x.videos }), i);
        if (kind === 'cry') return HB().normalizeCry(HB().makeCry({ ...keep, mood: x.mood }), i);
        if (kind === 'heart') return HB().normalizeHeart(HB().makeHeart(keep), i);
        if (kind === 'morph') return HB().normalizeMorph(HB().makeMorph({ ...keep, style: x.style, handFile: x.handFile }), i);
        if (kind === 'catch') return HB().normalizeCatch(HB().makeCatch({ ...keep, failFile: x.failFile, ballFile: x.ballFile, winFiles: x.winFiles, winAudio: x.winAudio, failAudio: x.failAudio }), i);
        const tpl = HB().vidFxTemplates().find(t => t.motion === x.motion);
        const smp = HB().vidFxSample(x.motion) || {};
        return HB().normalizeVidFx({ ...(tpl || HB().makeVidFx({ ...smp, motion: x.motion })), ...keep, ...(tpl && x.id === tpl.id ? { name: tpl.name } : {}) }, i);
    }
    function resetGame(kind, x) {
        const msg = kind === 'vidfx'
            ? hpT('Đưa "{name}" về mặc định của nhà phát hành?\nVideo mẫu + nhịp mẫu + mọi thông số về như lúc cài app; giữ tên, quà đã gắn và hồ sơ người.', { name: x.name })
            : hpT('Đưa "{name}" về mặc định của nhà phát hành?\nGiữ tên, quà đã gắn, hồ sơ người và video của bạn; mọi thông số khác về như lúc cài app.', { name: x.name });
        if (!confirm(msg)) return;
        const list = listOf(kind), i = list.indexOf(x);
        if (i < 0) return;
        list[i] = factoryOf(kind, x, i);
        renderSettings(); schedulePersist();
        if (gOpen) openGModal(gKey(kind, list[i]));
        window.toast?.(hpT('"{name}" đã về mặc định', { name: list[i].name }), 'success');
    }
    function gMenu(e, key) {
        const g = gFind(key); if (!g) return;
        const { kind, x, i } = g, list = listOf(kind);
        const norm1 = (y, n) => kind === 'haucanh' ? HB().normalizeItem(y, n) : kind === 'roiho' ? HB().normalizeRoiHo(y, n) : kind === 'biduoi' ? HB().normalizeBiDuoi(y, n) : kind === 'cry' ? HB().normalizeCry(y, n) : kind === 'heart' ? HB().normalizeHeart(y, n) : kind === 'catch' ? HB().normalizeCatch(y, n) : kind === 'morph' ? HB().normalizeMorph(y, n) : HB().normalizeVidFx(y, n);
        const items = [
            { icon: '⚙', label: hpT('Cài đặt'), desc: hpT('Mở bảng chỉnh riêng game này'), run: () => openGModal(key) },
            { icon: '🎁', label: hpT('Gắn quà'), desc: x.gifts.length ? hpT('{n} quà đang gắn', { n: x.gifts.length }) : hpT('Chưa gắn quà nào'), run: () => openGiftPicker(kind, x, gIcon(kind, x)) },
            { icon: '📄', label: hpT('Nhân bản'), desc: hpT('Tạo bản sao để chỉnh nhịp / quà khác'), run: () => {
                const copy = norm1({ ...JSON.parse(JSON.stringify(x)), id: kind.slice(0, 2) + Math.random().toString(36).slice(2, 8), name: hpT('{name} (bản sao)', { name: x.name }).slice(0, 60), gifts: [] }, list.length);
                list.splice(i + 1, 0, copy); renderSettings(); schedulePersist(); openGModal(gKey(kind, copy));
            } },
            ...(i > 0 ? [{ icon: '⬆', label: hpT('Lên đầu'), desc: hpT('Trùng quà thì game đứng trước được chạy'), run: () => { list.unshift(list.splice(i, 1)[0]); renderSettings(); schedulePersist(); } }] : []),
            { icon: '↺', label: hpT('Về mặc định'), desc: hpT('Mặc định của nhà phát hành - giữ tên + quà'), run: () => resetGame(kind, x) },
            { icon: '🗑', label: hpT('Xoá'), danger: true, run: () => { if (confirm(hpT('Xoá "{name}"?', { name: x.name }))) { list.splice(i, 1); renderSettings(); schedulePersist(); } } }
        ];
        showCtx(e, items);
    }

    // ---------- 🏃 BỊ ĐUỔI ----------
    const atMs = ms => fmt(+(ms / 1000).toFixed(2));
    // Thanh mốc thời gian một lượt - khớp video đuổi bắt (video chạy lại từ 0 mỗi lượt).
    function timeline(sc) {
        const P = BD().plan(sc);
        const segs = [[hpT('Chờ'), 0, P.waitEnd, '#8a8f9c'], [hpT('Lấy đà'), P.waitEnd, P.windEnd, '#ffb547'], [hpT('Chạy ra'), P.windEnd, P.exitEnd, '#ff7a59']];
        let t = P.exitEnd;
        P.passes.forEach((p, i) => { if (p.start > t) segs.push(['', t, p.start, '#2c3140']); segs.push([hpT('Vòng {n}', { n: i + 1 }), p.start, p.end, '#6fa8ff']); t = p.end; });
        segs.push([hpT('Vắng'), t, P.retStart, '#2c3140'], [hpT('Chạy về'), P.retStart, P.retEnd, '#5fd38a'], [hpT('Dừng'), P.retEnd, P.endAt, '#4fd1c5']);
        const bar = segs.filter(s => s[2] > s[1]).map(([n, a, b, c]) => `<span style="flex:${b - a};background:${c}" title="${hpTA('{v} {v2}–{v3} giây', { v: esc(n || hpT('Vắng')), v2: atMs(a), v3: atMs(b) })}">${n}</span>`).join('');
        const marks = [`${hpT('chân quay ở giây')} <b>${atMs(P.waitEnd)}</b>`, `${hpT('phóng ra bên {v} ở giây', { v: sc.exitDir === 'left' ? hpT('trái') : hpT('phải') })} <b>${atMs(P.windEnd)}</b>`]
            .concat(P.passes.map((p, i) => `${hpT('vòng {v} ({v2}) giây', { v: i + 1, v2: p.dir === 'right' ? hpT('trái → phải') : hpT('phải → trái') })} <b>${atMs(p.start)}–${atMs(p.end)}</b>`))
            .concat([`${hpT('chạy về từ bên {v} giây', { v: sc.returnDir === 'left' ? hpT('trái') : hpT('phải') })} <b>${atMs(P.retStart)}</b>`, `${hpT('đứng yên giây')} <b>${atMs(P.retEnd)}</b>`, `${hpT('hết lượt giây')} <b>${atMs(P.endAt)}</b>`]);
        return `<div class="bt-tl">${bar}</div><div class="bt-tl-marks">${hpT('Video chạy lại từ 0 mỗi lượt: {v}.', { v: marks.join(' · ') })}</div>`;
    }
    function refreshTimeline(i) {
        const card = $(`.bt-item[data-kind=biduoi][data-i="${i}"]`), sc = cfg.biduoi.scripts[i];
        if (!card || !sc) return;
        const tl = card.querySelector('.bt-tl'), mk = card.querySelector('.bt-tl-marks');
        if (!tl || !mk) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = timeline(BD().normalizeScript(sc, i));
        tl.replaceWith(tmp.children[0]); mk.replaceWith(tmp.children[0]);
    }
    function videoCard(sc, v, vi) {
        const pinned = sc.pick === 'fixed' && sc.pickIdx === vi;
        return `<div class="bt-v${pinned ? ' pin' : ''}${sc.pick === 'fixed' && !pinned ? ' off' : ''}" data-vi="${vi}" title="${esc(fileLabel(v.file))}">
            ${thumb(v.file)}${pinned ? `<span class="bt-v-tag">${hpT('Đang dùng')}</span>` : ''}
            <button class="ghost small bt-v-x" data-act="vdel" data-vi="${vi}" title="${hpTA('Bỏ video này')}">✕</button>
            <input class="bt-vname" data-vi="${vi}" value="${esc(v.name)}" placeholder="${esc(fileLabel(v.file).replace(/\.[^.]+$/, '').slice(0, 24))}" title="${hpTA('Tên hiện trên thông báo (VD: Chó đuổi)')}" />
            <div class="bt-v-acts">
                <button class="small" data-act="vtest" data-vi="${vi}" title="${hpTA('Chạy thử đúng video này')}">▶</button>
                ${sc.pick === 'fixed' ? `<button class="ghost small" data-act="vpin" data-vi="${vi}" title="${hpTA('Chỉ định dùng video này')}">📌</button>` : ''}
            </div>
            <div class="bt-fg${v.fg ? ' on' : ''}" data-act="fgpick" data-vi="${vi}" title="${v.fg ? hpT('Lớp trước: {v} - bấm / kéo thả để đổi', { v: esc(fileLabel(v.fg)) }) : hpT('Lớp TRƯỚC người: webm nền trong suốt hoặc png (kẻ đuổi lao ngang trước mặt, bụi cây che người…). Bấm hoặc kéo thả vào đây')}">
                🌿 ${v.fg ? esc(fileLabel(v.fg)) : hpT('Lớp trước')}${v.fg ? `<button class="ghost small" data-act="fgdel" data-vi="${vi}" title="${hpTA('Bỏ lớp trước')}">✕</button>` : ''}
                <input type="file" accept="video/webm,image/png,image/webp,image/gif,video/*" hidden />
            </div>
        </div>`;
    }
    function passCard(p, j, i, sc) {
        const k = key => `bd:${i}:p:${j}:${key}`;
        const auto = sc.persp && sc.persp.on;
        return `<div class="bt-pass" data-j="${j}">
            <div class="bt-pass-head">${hpT('🔁 Vòng {v} {v2}', { v: j + 1, v2: seg('pdir', p.dir, `data-j="${j}"`) })}<button class="ghost small" data-act="pdel" data-j="${j}" title="${hpTA('Bỏ vòng này')}">✕</button></div>
            ${row(k('gapSec'), hpT('Chờ trước vòng'), 0, 15, 0.1, p.gapSec, hpT('giây'), hpT('Khoảng vắng trước khi chạy ngang qua màn'))}
            ${row(k('ms'), hpT('Thời gian chạy qua màn'), 200, 6000, 50, p.ms, 'ms')}
            ${auto ? `<div class="hint">${hpT('📐 Cỡ người tự tính theo đường chân trời (chân càng gần chân trời càng nhỏ).')}</div>` : `
            ${row(k('pct:scale'), hpT('Cỡ người lúc vào'), 5, 150, 1, Math.round(p.scale * 100), '%')}
            ${row(k('pct:scaleEnd'), hpT('Cỡ người lúc ra'), 2, 150, 1, Math.round(p.scaleEnd * 100), '%', hpT('Nhỏ hơn "lúc vào" = chạy chéo vào sâu con đường'))}`}
            ${row(k('pct:y'), hpT('Chỗ chân lúc vào'), 5, 120, 1, Math.round(p.y * 100), '% cao', hpT('Tính từ mép TRÊN màn hình xuống - đặt đúng mặt đường trong video'))}
            ${row(k('pct:yEnd'), hpT('Chỗ chân lúc ra'), 5, 120, 1, Math.round(p.yEnd * 100), '% cao')}
        </div>`;
    }
    function bdCard(sc, i) {
        const T = sc.timing, k = key => `bd:${i}:${key}`;
        return `
            <div class="ctc-card bt-item" data-kind="biduoi" data-i="${i}">
                <div class="bt-head"><input class="bt-name" value="${esc(sc.name)}" title="${hpTA('Tên kịch bản')}" />${headBtns(i, hpT('Chạy thử kịch bản này (bốc video theo luật bên dưới)'))}</div>
                ${cardTop('biduoi', sc, '🏃', hpT('tặng quà này là bị đuổi'))}
                <div class="bt-sub">${hpT('VIDEO ĐUỔI BẮT ({length})', { length: sc.videos.length })}
                    <select data-act="pick" title="${hpTA('Mỗi lượt dùng video nào')}">
                        <option value="random" ${sc.pick === 'random' ? 'selected' : ''}>${hpT('🎲 Ngẫu nhiên (không lặp liền)')}</option>
                        <option value="fixed" ${sc.pick === 'fixed' ? 'selected' : ''}>${hpT('Chỉ định 1 video')}</option>
                    </select></div>
                <div class="bt-vids">
                    ${sc.videos.map((v, vi) => videoCard(sc, v, vi)).join('')}
                    ${sc.videos.length < BD().MAX_VIDEOS ? `<div class="bt-addv" data-act="vadd" title="${hpTA('Bấm để chọn, hoặc kéo thả 1 hay nhiều video / ảnh vào đây')}"><div><b>＋</b><br>${hpT('Thêm video')}<br><small>${hpT('chó đuổi, bà già, zombie, cảnh sát…')}<br>${hpT('kéo thả được nhiều file')}</small></div><input type="file" accept="video/*,image/*" multiple hidden /></div>` : ''}
                </div>
                <div class="bt-opts">
                    ${optCell(hpT('Chạy trốn ra phía'), '', seg('exit', sc.exitDir))}
                    ${optCell(hpT('Chạy về, vào từ bên'), '', seg('ret', sc.returnDir))}
                    <label class="ctc-toggle"><input type="checkbox" data-act="sound" ${sc.bgSound ? 'checked' : ''}> ${hpT('🔈 Tiếng video')}</label>${vidVolCtl(sc)}
                </div>
                <div class="bt-sub">${hpT('NHỊP (khớp với video)')}</div>
                ${row(k('t:waitSec'), hpT('Chờ trước khi chạy'), 0, 15, 0.1, T.waitSec, hpT('giây'), hpT('Video đã phủ, người đứng biểu diễn (giật mình, hoảng hốt…) rồi mới lấy đà. 0 = chạy ngay'))}
                ${row(k('t:windupSec'), hpT('Chân quay vòng tròn (lấy đà)'), 0, 6, 0.1, T.windupSec, hpT('giây'), hpT('Chân hoá vòng tròn quay tít tại chỗ trước khi phóng'))}
                ${row(k('t:exitMs'), hpT('Phóng ra khỏi màn'), 150, 3000, 10, T.exitMs, 'ms')}
                ${row(k('t:awaySec'), hpT('Vắng mặt trước khi chạy về'), 0, 30, 0.1, T.awaySec, hpT('giây'), hpT('Sau vòng chạy xa cuối (hoặc sau khi phóng ra nếu không có vòng nào)'))}
                ${row(k('t:returnMs'), hpT('Chạy về chỗ cũ'), 200, 4000, 10, T.returnMs, 'ms', hpT('Về tới nơi phanh trượt lố một chút rồi lùi lại'))}
                ${row(k('t:settleMs'), hpT('Chân trở lại bình thường'), 100, 2000, 10, T.settleMs, 'ms')}
                <div class="bt-sub">${hpT('VÒNG CHẠY XA (zikzak, nhỏ dần theo con đường)')}</div>
                <label class="ctc-toggle"><input type="checkbox" data-act="persp" ${sc.persp.on ? 'checked' : ''}> ${hpT('📐 Phối cảnh tự động - cỡ người theo đường chân trời của video')}</label>
                ${sc.persp.on ? row(k('persp:horizon'), hpT('Đường chân trời'), 2, 90, 1, Math.round(sc.persp.horizon * 100), '% cao', hpT('Chỗ con đường thu về một điểm (tính từ mép TRÊN màn hình)')) : ''}
                ${sc.passes.map((p, j) => passCard(p, j, i, sc)).join('') || `<div class="hint">${hpT('Không có vòng nào - phóng ra rồi chạy về luôn.')}</div>`}
                ${sc.passes.length < BD().MAX_PASSES ? `<button class="small" data-act="padd">${hpT('＋ Thêm vòng')}</button>` : ''}
                <div class="bt-sub">${hpT('HIỆU ỨNG')}</div>
                <div class="bt-toggles">
                    <label class="ctc-toggle" title="${hpTA('Chân hoá vòng tròn quay (kiểu hoạt hình)')}"><input type="checkbox" data-act="wheel" ${sc.wheel ? 'checked' : ''}> ${hpT('🌀 Chân vòng tròn')}</label>
                    <label class="ctc-toggle"><input type="checkbox" data-act="smoke" ${sc.smoke ? 'checked' : ''}> ${hpT('Khói dưới chân')}</label>
                    <label class="ctc-toggle" title="${hpTA('Vệt tốc độ + bóng mờ phía sau')}"><input type="checkbox" data-act="lines" ${sc.lines ? 'checked' : ''}> ${hpT('Vệt tốc độ')}</label>
                    <label class="ctc-toggle" title="${hpTA('Tiếng hoạt hình (brrr lấy đà - vút - phanh két)')}"><input type="checkbox" data-act="sfx" ${sc.sfx ? 'checked' : ''}> ${hpT('🎧 Tiếng hoạt hình')}</label>
                </div>
                ${row(k('pct:hip'), hpT('Vòng chân bắt đầu từ'), 30, 75, 1, Math.round(sc.hip * 100), hpT('% thân'), hpT('Tính từ đỉnh đầu: 50 % ≈ ngang hông. Tăng nếu vòng ăn mất quần / váy'))}
                <div class="bt-sub">${hpT('MỐC THỜI GIAN')}</div>
                ${timeline(sc)}
            </div>`;
    }
    // Cài đặt 2.5D chung của mọi game Bị Đuổi (popup → ⚙ Cài đặt chung).
    function biDuoiLook() {
        const L = cfg.biduoi.look;
        return `
            <div class="ctc-card">
                <h3>${hpT('2.5D - CHIỀU SÂU')}</h3>
                ${row('bdg:sfxVolume', hpT('Âm lượng tiếng hoạt hình'), 0, 100, 1, Math.round(cfg.biduoi.sfxVolume * 100), '%')}
                <label class="ctc-toggle"><input type="checkbox" data-look="lite" ${L.lite ? 'checked' : ''}> ${hpT('⚡ Nhẹ máy - tắt hết phần dưới + bóng mờ phía sau (máy yếu / đang lag)')}</label>
                <div class="${L.lite ? 'bt-dim' : ''}">
                    <label class="ctc-toggle"><input type="checkbox" data-look="tint" ${L.tint ? 'checked' : ''}> ${hpT('🎨 Hoà màu người theo video (sáng / tối / ánh màu của cảnh)')}</label>
                    ${L.tint ? row('look:tintAmt', hpT('Mức hoà màu'), 0, 100, 1, Math.round(L.tintAmt * 100), '%') : ''}
                    <label class="ctc-toggle"><input type="checkbox" data-look="shadow" ${L.shadow ? 'checked' : ''}> ${hpT('🌓 Bóng đổ dài trên mặt đất')}</label>
                    ${L.shadow ? `<div class="ctc-row"><label>${hpT('Bóng ngả về')}</label>${seg('shdir', L.shadowDir < 0 ? 'left' : 'right')}<span></span><span class="unit"></span></div>` : ''}
                    <label class="ctc-toggle"><input type="checkbox" data-look="camera" ${L.camera ? 'checked' : ''}> ${hpT('🎥 Máy quay động (dồn vào mặt lúc lấy đà, lia theo khi chạy, rung khi phanh)')}</label>
                </div>
            </div>`;
    }
    async function uploadVideos(i, files, card) {
        const list = [...(files || [])].filter(f => /^(video|image)\//.test(f.type) || /\.(mp4|webm|mov|mkv|m4v|png|jpe?g|webp|gif)$/i.test(f.name));
        if (!list.length) { if (files && files.length) window.toast?.(hpT('Chỉ nhận video hoặc ảnh'), 'error'); return; }
        const add = card.querySelector('.bt-addv');
        for (const [n, file] of list.entries()) {
            if (cfg.biduoi.scripts[i].videos.length >= BD().MAX_VIDEOS) break;
            const show = (b, t) => { if (add) add.innerHTML = `<div><b>${b}</b><br>${t}<br><small>${esc(file.name)}</small></div>`; };
            show('⏳', hpT('Đang tải {v}/{length}', { v: n + 1, length: list.length }));
            try {
                const up = await prepUpload(file, p => show(`🎞 ${Math.round(p * 100)} %`, hpT('Đang đổi sang .pack.mp4')));
                cfg.biduoi.scripts[i].videos.push({ file: await uploadOne(up), name: '', fg: '' });
            }
            catch (e) { window.toast?.(`${file.name}: ${e.message || hpT('Tải lên lỗi')}`, 'error'); }
        }
        renderSettings(); schedulePersist();
    }
    async function uploadFg(i, vi, file, box) {
        if (!file) return;
        if (!/\.(webm|png|webp|gif|mp4|mov)$/i.test(file.name)) { window.toast?.(hpT('Lớp trước nên là webm nền trong suốt hoặc png'), 'error'); return; }
        box.textContent = hpT('⏳ Đang tải…');
        try {
            const up = await prepUpload(file, p => { box.textContent = `🎞 ${Math.round(p * 100)} %`; });
            cfg.biduoi.scripts[i].videos[vi].fg = await uploadOne(up);
            if (/\.(mp4|mov)$/i.test(up.name) && !isPacked(up.name)) window.toast?.(hpT('mp4 / mov không có nền trong suốt - lớp trước sẽ che kín người. Nên dùng webm có kênh alpha.'), 'warn');
        } catch (e) { window.toast?.(e.message || hpT('Tải lên lỗi'), 'error'); }
        renderSettings(); schedulePersist();
    }
    function bindBiDuoi(host) {
        host.querySelectorAll('[data-look]').forEach(cb => cb.addEventListener('change', e => { cfg.biduoi.look[cb.dataset.look] = e.target.checked; renderSettings(); schedulePersist(); }));
        host.querySelectorAll('[data-act=shdir]').forEach(b => b.addEventListener('click', () => { cfg.biduoi.look.shadowDir = b.dataset.v === 'left' ? -1 : 1; renderSettings(); schedulePersist(); }));
        host.querySelector('[data-act=sadd]')?.addEventListener('click', () => { cfg.biduoi.scripts.push(HB().makeBiDuoi({ name: hpT('Kịch bản {n}', { n: cfg.biduoi.scripts.length + 1 }) })); renderSettings(); schedulePersist(); });
        host.querySelectorAll('.bt-item[data-kind=biduoi]').forEach(card => {
            const i = Number(card.dataset.i), sc = cfg.biduoi.scripts[i];
            const redraw = () => { cfg.biduoi.scripts[i] = HB().normalizeBiDuoi(sc, i); renderSettings(); schedulePersist(); };
            bindCommon(card, 'biduoi', sc, i, '🏃');
            card.querySelectorAll('.bt-vname').forEach(inp => inp.addEventListener('change', e => { sc.videos[Number(inp.dataset.vi)].name = e.target.value.trim().slice(0, 60); schedulePersist(); }));
            const add = card.querySelector('.bt-addv');
            if (add) {
                const fileIn = add.querySelector('input[type=file]');
                fileIn.addEventListener('change', () => uploadVideos(i, fileIn.files, card));
                add.addEventListener('dragover', e => { e.preventDefault(); add.classList.add('over'); });
                add.addEventListener('dragleave', () => add.classList.remove('over'));
                add.addEventListener('drop', e => { e.preventDefault(); add.classList.remove('over'); uploadVideos(i, e.dataTransfer.files, card); });
            }
            card.querySelector('[data-act=pick]').addEventListener('change', e => { sc.pick = e.target.value; redraw(); });
            card.querySelector('[data-act=persp]').addEventListener('change', e => { sc.persp.on = e.target.checked; redraw(); });
            card.querySelectorAll('.bt-fg').forEach(box => {
                const vi = Number(box.dataset.vi), inp = box.querySelector('input[type=file]');
                inp.addEventListener('change', () => uploadFg(i, vi, inp.files[0], box));
                box.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); box.classList.add('over'); });
                box.addEventListener('dragleave', () => box.classList.remove('over'));
                box.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); uploadFg(i, vi, e.dataTransfer.files[0], box); });
            });
            card.addEventListener('click', e => {
                const el = e.target.closest('[data-act]'), act = el && el.dataset.act;
                if (!act || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
                const vi = Number(el.dataset.vi), j = Number(el.dataset.j);
                if (act === 'vadd') { if (e.target.tagName !== 'INPUT') add.querySelector('input[type=file]').click(); }
                else if (act === 'fgpick') { if (e.target.tagName !== 'INPUT') el.querySelector('input[type=file]').click(); }
                else if (act === 'fgdel') { e.stopPropagation(); sc.videos[vi].fg = ''; redraw(); }
                else if (act === 'vdel') { sc.videos.splice(vi, 1); if (sc.pickIdx > vi) sc.pickIdx--; redraw(); }
                else if (act === 'vtest') runTest({ kind: 'biduoi', id: sc.id, videoIdx: vi }, el);
                else if (act === 'vpin') { sc.pickIdx = vi; redraw(); }
                else if (act === 'exit') { sc.exitDir = el.dataset.v; redraw(); }
                else if (act === 'ret') { sc.returnDir = el.dataset.v; redraw(); }
                else if (act === 'pdir') { sc.passes[Number(el.closest('[data-j]').dataset.j)].dir = el.dataset.v; redraw(); }
                else if (act === 'pdel') { sc.passes.splice(j, 1); redraw(); }
                else if (act === 'padd') {
                    // vòng mới: chạy NGƯỢC chiều vòng trước (zikzak), nhỏ hơn và lùi lên phía xa của con đường
                    const prev = sc.passes[sc.passes.length - 1];
                    const lastDir = prev ? prev.dir : sc.exitDir === 'left' ? 'left' : 'right';
                    const s = prev ? +(prev.scaleEnd * 0.7).toFixed(2) : 0.6, y = prev ? +Math.max(0.3, prev.yEnd - 0.08).toFixed(2) : 0.8;
                    sc.passes.push({ dir: lastDir === 'left' ? 'right' : 'left', gapSec: 1, ms: prev ? prev.ms : 1100, scale: s, scaleEnd: s, y, yEnd: y });
                    redraw();
                }
            });
            for (const key of ['sound', 'wheel', 'smoke', 'lines', 'sfx']) {
                card.querySelector(`[data-act=${key}]`).addEventListener('change', e => { sc[key === 'sound' ? 'bgSound' : key] = e.target.checked; schedulePersist(); });
            }
        });
    }

    // ---------- ✂ TÁCH NỀN + hàng chờ ----------
    function tabMatte() {
        const M = cfg.matte, E = edge();
        return `
            <div class="ctc-card">
                <h3>${hpT('TÁCH NỀN - chạy MỘT lần cho cả 3 hiệu ứng')}</h3>
                <div class="ctc-row"><label>Model</label>
                    <select id="bt-model"><option value="selfie" ${M.model === 'selfie' ? 'selected' : ''}>${hpT('Nhanh - mượt (khuyên dùng)')}</option></select>
                    <span></span><span class="unit"></span></div>
                <label class="ctc-toggle"><input type="checkbox" id="bt-tiles" ${M.tiles === 2 ? 'checked' : ''}> ${hpT('Chia nửa trên / dưới (rõ tóc + bàn chân, tốn gấp đôi)')}</label>
                ${row('m:radius', hpT('Bám mép ảnh (bán kính)'), 2, 16, 1, M.radius, 'px', hpT('Lớn: viền tự bám theo mép thật xa hơn (tóc xù) - nhỏ: giữ sát mặt nạ model'))}
                ${row('m:eps', hpT('Độ chi tiết viền'), 0.0005, 0.02, 0.0005, M.eps, '', hpT('Nhỏ: bám từng sợi tóc / mép áo - lớn: viền trơn hơn'))}
                ${row('e:c', hpT('Co ← → nở viền'), 0.25, 0.75, 0.01, 1 - E.c, '', hpT('Kéo sang trái nếu còn viền nền quanh người, sang phải nếu bị ăn mất tóc / ngón tay'))}
                ${row('e:w', hpT('Độ mềm viền'), 0.05, 0.9, 0.01, E.w, '')}
                ${row('m:still', hpT('Chống rung viền'), 0, 0.9, 0.05, 1 - M.still, '', hpT('Cao: viền đứng im khi người đứng yên (cử động mạnh vẫn theo ngay)'))}
                ${row('m:decon', hpT('Khử viền màu nền'), 0, 1, 0.05, M.decon, '')}
            </div>
            <div class="ctc-card">
                <h3>${hpT('HÀNG CHỜ')}</h3>
                <div class="hint">${hpT('Tặng bao nhiêu chạy bấy nhiêu: tặng 1 lần = 1 lượt, combo ×5 = 5 lượt, ×99 = 99 lượt nối nhau tới hết - không bỏ quà khi hàng dài.')}</div>
            </div>`;
    }
    function bindMatte() {
        $('#bt-tiles').addEventListener('change', e => { cfg.matte.tiles = e.target.checked ? 2 : 1; schedulePersist(); });
        $('#bt-model').addEventListener('change', e => { cfg.matte.model = e.target.value; schedulePersist(); });
    }

    // ---------- dựng ----------
    const hubListeners = new Set();
    const notifyHub = () => hubListeners.forEach(fn => { try { fn(); } catch (e) { console.warn('[body] hub', e); } });
    function renderSettings() {
        const host = $('#bt-settings');
        if (!cfg) return;
        if (!host) { refreshGModal(); notifyHub(); return; }
        const p = cur();
        if (p && p.id !== sel) setSel(p.id);
        document.querySelectorAll('#bt-tabs .bt-tab').forEach(b => {
            b.classList.toggle('on', b.dataset.tab === tab);
            const k = b.dataset.tab, n = k === 'games' ? gAll().length : k === 'npc' ? cfg.profiles.length : null;
            const em = b.querySelector('em'); const base = TABS.find(t => t[0] === k)[3];
            em.textContent = n == null ? base : `${n} · ${base}`;
        });
        host.innerHTML = tab === 'npc' ? tabNpc() : tab === 'games' ? tabGames() : tabMatte();
        host.querySelectorAll('.bt-chips').forEach(el => el.addEventListener('click', e => {
            const b = e.target.closest('.bt-chip'); if (!b) return;
            if (b.dataset.act === 'padd') return newProfile();
            if (b.dataset.pid && b.dataset.pid !== sel) { setSel(b.dataset.pid); renderSettings(); reloadPreview(); }
        }));
        host.querySelectorAll('[data-bgmode]').forEach(s => s.addEventListener('change', e => { cfg[s.dataset.bgmode].bgMode = e.target.value; renderSettings(); schedulePersist(); }));
        if (tab === 'npc') { bindNpc(host); renderNpcSelect(); }
        else if (tab === 'games') bindGames(host);
        else bindMatte();
        bindRows(host);
        renderStatus();
        // Popup mở từ lưới 🎥 Game Camera (màn Bộ Tách Người không hiện) thì giữ mở, chỉ vẽ lại — đóng chỉ khi ở chính màn này đổi tab.
        if (tab === 'games' || !document.getElementById('view-body')?.classList.contains('active')) refreshGModal(); else closeGModal();
        notifyHub();
    }

    // 🎥 Trang chủ Game Camera hiện TỪNG game tách người thành Ô (user 2026-10-19 "đưa toàn bộ game ra trang chủ"):
    //   ready(socket) nạp config + NPC · grid() HTML các Ô · bind(gridEl) gắn bấm / ▶ / chuột phải · add(type) tạo + mở popup ·
    //   types() loại thêm được · count() · onChange(fn) vẽ lại trang chủ khi game đổi · menu(e, items) menu chuột phải dùng chung.
    let hubReady = null;
    window.HpBodyPanel = { open, hub: {
        ready(sk) {
            if (sk) { socket = socket || sk; attachSocket(sk); }
            ensureGridCss(); ensureBodyCss();
            if (!hubReady) hubReady = Promise.all([loadMeta(), loadConfig()]).catch(e => { hubReady = null; throw e; });
            return hubReady;
        },
        grid: () => (cfg ? gAll().map(gTile).join('') : ''),
        count: () => (cfg ? gAll().length : 0),
        bind: el => bindGGridEl(el),
        types: () => GNEW(),
        add: v => { if (cfg) gCreate(v); },
        onChange: fn => { hubListeners.add(fn); return () => hubListeners.delete(fn); },
        menu: (e, items) => showCtx(e, items)
    } };
    try { window.dispatchEvent(new Event('hp-body-panel-ready')); } catch (_) {}
})();
