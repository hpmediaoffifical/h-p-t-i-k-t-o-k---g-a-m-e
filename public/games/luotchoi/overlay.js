/* 🎲 Đấu Trường Mini — overlay OBS: CHỈ hiển thị trạng thái 'luotchoi:state' (lib/luot-choi/controller.js).
 * Đếm ngược tự chạy theo giờ server (bù lệch). Sự kiện (seq tăng dần) → thông báo nổi + hiệu ứng bàn + giọng đọc.
 *
 * PHẦN DIỄN: trạng thái có lượt chọn mới KHÔNG vẽ ngay. Tay (hoặc que tre) bay vào đúng ô trên bàn ĐANG HIỆN,
 * đợi SUSPENSE_MS rồi mới vẽ bàn mới → kết quả lộ sau nhịp hồi hộp. Server giữ lượt kế thêm đúng khoảng này
 * (table.js SUSPENSE_MS) nên ván không chậm đi. Trạng thái đến trong lúc diễn → chỉ giữ cái mới nhất, vẽ sau.
 * Giọng đọc: /api/live-translate/tts (cùng đường Chào Mừng VIP), bật/tắt + âm lượng trong panel (cfg.voice/voiceVolume).
 *
 * ?demo=<hama|chumcoc|thaptre|latcap>[&step=n][&freeze=1][&voice=1] → hỏi /api/luotchoi/demo?step=n (bàn TẠM chạy
 * luật thật), không đụng bàn thật; bàn mẫu không đọc trừ khi &voice=1. ?mute=1 tắt giọng. ?slow=n diễn chậm (chụp ảnh). */
(function () {
    'use strict';
    var T = window.hpT || function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); };
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var COLORS = ['#ff6b8b', '#4fb3ff', '#ffb547', '#39d98a', '#b388ff', '#ff8a4c'];
    var TRAP_WORD = { hama: '🦛 NGOẠM!', chumcoc: '🐸 CÓC NHẢY RA!', thaptre: '🎋 THÁP ĐỔ!' };
    var SAVE_WORD = { hama: 'rụt tay kịp', chumcoc: 'giữ được nắp chum', thaptre: 'đỡ được tháp' };
    var TRAP_SAY = { hama: '{n} bị hà mã cắn rồi!', chumcoc: 'Cóc nhảy ra! {n} dính bẫy!', thaptre: 'Tháp đổ! {n} thua rồi!' };
    var VERB = { hama: 'ấn răng', chumcoc: 'cắm lỗ', thaptre: 'rút thanh', latcap: 'lật ô', oanquan: 'bốc quân' };
    var DIR = { 1: 'sang trái', 2: 'sang phải' };
    var TOOL = { hama: 'press', chumcoc: 'stick', thaptre: 'pull', latcap: 'tap', oanquan: 'press' };
    var SUSPENSE_MS = 800;   // = lib/luot-choi/table.js SUSPENSE_MS
    var RING = 2 * Math.PI * 50;

    var st = null, off = 0, lastSeq = -1, firstState = true, resultKey = '';
    var pending = null, staging = false;
    var params = new URLSearchParams(location.search);
    var demo = params.get('demo');
    var SLOW = Math.max(1, Math.min(20, Number(params.get('slow')) || 1));   // ?slow=n: diễn chậm n lần (chỉ để chụp ảnh)

    function colorOf(k) { var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
    function avatar(s) {
        var inner = s.avatar ? '<img src="' + esc(s.avatar) + '" alt="">' : esc(Array.from(s.nickname || '?')[0] || '?').toUpperCase();
        return '<div class="lc-av" style="background:' + colorOf(s.key || '') + '">' + inner +
            '<svg viewBox="0 0 114 114"><circle class="bg" cx="57" cy="57" r="50"></circle><circle class="fg" cx="57" cy="57" r="50" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '"></circle></svg></div>';
    }
    var now = function () { return Date.now() + off; };
    var secLeft = function (u) { return Math.max(0, Math.ceil((u - now()) / 1000)); };
    var seatName = function (s, key) { var x = (s.seats || []).find(function (q) { return q.key === key; }); return x ? x.nickname : ''; };

    // ── giọng đọc ──────────────────────────────────────────────────────────
    var voiceQ = [], voiceBusy = false, audio = new Audio(), voiceGuard = null;
    // Đọc tên: bỏ emoji / ký hiệu (TTS đọc ra tiếng lạ), giữ chữ + số, tối đa 24 ký tự
    function speakName(n) { var t = String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); return Array.from(t).slice(0, 24).join('') || T('người chơi'); }
    function voiceOn() { return st && st.cfg && st.cfg.voice !== false && params.get('mute') !== '1' && (!demo || params.get('voice') === '1'); }
    // low = câu phụ ("Tới lượt …", "… vào ghế"): chỉ đọc khi loa đang rảnh, nhường chỗ cho câu chọn số / kết quả
    function say(text, low) {
        if (!voiceOn() || !text) return;
        if (low && (voiceBusy || voiceQ.length)) return;
        voiceQ.push(text);
        if (voiceQ.length > 4) voiceQ.splice(0, voiceQ.length - 4);   // dồn quá → bỏ câu cũ, giữ nhịp với ván
        nextVoice();
    }
    function nextVoice() {
        if (voiceBusy || !voiceQ.length) return;
        voiceBusy = true;
        var done = function () { clearTimeout(voiceGuard); audio.onended = audio.onerror = null; voiceBusy = false; nextVoice(); };
        audio.onended = done; audio.onerror = done;
        audio.src = '/api/live-translate/tts?lang=vi&text=' + encodeURIComponent(voiceQ.shift());
        audio.volume = Math.max(0, Math.min(1, ((st && st.cfg && st.cfg.voiceVolume) ?? 80) / 100));
        voiceGuard = setTimeout(done, 9000);   // mạng chậm / TTS lỗi → không kẹt hàng đọc
        audio.play().catch(done);
    }

    function toast(text, kind) {
        var el = document.createElement('div');
        el.className = 'lc-toast' + (kind ? ' ' + kind : '');
        el.innerHTML = text;
        $('toasts').appendChild(el);
        while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
        setTimeout(function () { el.remove(); }, 2700);
    }

    function newEvents(s) {
        var evs = s.events || [];
        if (firstState) return [];
        if (evs.length && evs[evs.length - 1].seq < lastSeq) lastSeq = 0;   // server khởi động lại / bàn mẫu quay vòng
        return evs.filter(function (e) { return e.seq > lastSeq; });
    }
    function sayPicks(s, picks) {
        if (!picks.length) return;
        if (s.game.id === 'oanquan') {
            var nm0 = speakName(picks[0].nickname);
            var cell = picks.find(function (p) { return p.outcome === 'pending'; }), mv = picks.find(function (p) { return p.outcome === 'move'; });
            say(cell && mv ? T('{n} chọn ô {c}, rải {d}', { n: nm0, c: cell.n, d: DIR[mv.n] }) : cell ? T('{n} chọn ô {c}', { n: nm0, c: cell.n }) : T('{n} rải {d}', { n: nm0, d: DIR[mv.n] }));
            return;
        }
        var name = speakName(picks[0].nickname);
        var nums = picks.map(function (p) { return p.n; }).join(' và ');
        say(T('{n} chọn số {x}', { n: name, x: nums }));
    }

    // Toast + giọng đọc cho sự kiện của 1 trạng thái (sau khi đã lộ kết quả)
    function handleEvents(s, evs, spokenPicks) {
        var fresh = false;
        var g = s.game.id;
        if (firstState) { var all = s.events || []; lastSeq = all.length ? all[all.length - 1].seq : 0; firstState = false; return false; }
        var picks = evs.filter(function (e) { return e.type === 'pick'; });
        if (picks.length && !spokenPicks) sayPicks(s, picks);
        evs.forEach(function (e) {
            lastSeq = Math.max(lastSeq, e.seq);
            var who = '<b>' + esc(e.nickname || '') + '</b>', nm = speakName(e.nickname || seatName(s, e.key));
            switch (e.type) {
                case 'pick': fresh = true; if (e.outcome === 'trap') toast(T(TRAP_WORD[g] || '💥'), 'bad'); break;
                case 'seat': toast('🪑 ' + who + ' ' + T('vào ghế')); break;
                case 'queue': toast('⏳ ' + who + ' ' + T('chờ ván sau')); break;
                case 'shieldAdd': toast('🛡️ ' + who + ' ' + T('+1 khiên'), 'good'); say(T('{n} có thêm khiên', { n: nm }), true); break;
                case 'shield': toast('🛡️ ' + who + ' ' + T(SAVE_WORD[g] || 'được khiên cứu'), 'good'); say(T('{n} được khiên cứu!', { n: nm })); break;
                case 'match': toast('✨ ' + T('Trúng cặp! +1'), 'good'); say(T('{n} lật trúng cặp!', { n: nm })); break;
                case 'miss': say(T('Trượt rồi!')); break;
                case 'move': {   // Ô Ăn Quan: tổng quân ăn được trong nước vừa rải
                    var tr = (s.board && s.board.lastMove && s.board.lastMove.trace) || [], dan = 0, quan = 0;
                    tr.forEach(function (x) { if (x.k === 'cap') { dan += x.dan; quan += x.quan; } });
                    if (quan) { toast('👑 ' + who + ' ' + T('ăn QUAN!'), 'good'); say(T('{n} ăn quan!', { n: nm })); }
                    else if (dan) { toast('🪨 ' + who + ' ' + T('ăn {d} quân', { d: dan }), 'good'); say(T('{n} ăn được {d} quân', { n: nm, d: dan })); }
                    break;
                }
                case 'refill':
                    toast('🪨 ' + who + ' ' + T('hết dân — rải lại 5 quân') + (e.borrowed ? ' (' + T('vay {b}', { b: e.borrowed }) + ')' : ''));
                    say(T('{n} hết dân, rải lại 5 quân', { n: nm }), true);
                    break;
                case 'start': toast('🎲 ' + T('Bắt đầu!')); say(T('Bắt đầu!')); break;
                case 'turn': if (e.key) say(T('Tới lượt {n}', { n: nm }), true); break;
                case 'win': say(T('{n} vô địch!', { n: (e.winners || []).map(function (w) { return speakName(w.nickname); }).join(' và ') })); break;
                case 'draw': say(T('Hoà rồi!')); break;
                case 'out':
                    if (e.kicked) toast('👋 ' + who + ' ' + T('rời ghế'));
                    else {
                        toast('🗑️ ' + (e.byNickname ? '<b>' + esc(e.byNickname) + '</b> ' + T('ném') + ' ' : '') + who + ' ' + T('vào thùng rác!'), 'bad');
                        say(T(TRAP_SAY[g] || '{n} dính bẫy!', { n: nm }));
                    }
                    break;
            }
        });
        return fresh;
    }

    // ── tay bay vào ô vừa chọn ─────────────────────────────────────────────
    // bàn tay / que tre vẽ ở hand-art.js (window.LcHandArt), có thể thay bằng ảnh vẽ tay qua assets/manifest.json
    function handHtml(tool) { return window.LcHandArt ? window.LcHandArt(tool === 'stick' ? 'stick' : 'point') : ''; }
    var lastPress = '';
    function stopHand(hand) { try { hand.getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) {} }
    function cellOf(n) { return $('stage').querySelector('[data-n="' + n + '"]'); }
    function flyTo(n, tool, ms) {
        return new Promise(function (res) {
            var cell = cellOf(n), hand = $('hand'), card = $('card');
            if (!cell || !hand) return setTimeout(res, ms);
            var c = card.getBoundingClientRect(), r = cell.getBoundingClientRect();
            var x = r.left + r.width / 2 - c.left, y = r.top + r.height / 2 - c.top;
            if (tool === 'pull') x = r.right - c.left - 18;   // tháp: kẹp đầu thanh bên phải
            stopHand(hand);   // hoạt cảnh cũ (fill: forwards) không được dồn lại
            hand.className = 'lc-hand ' + tool;
            hand.innerHTML = handHtml(tool);
            hand.hidden = false;
            cell.classList.add('aim');
            var from = tool === 'stick' ? 'translate(' + (x + 260) + 'px,' + (y - 420) + 'px) rotate(28deg)' : 'translate(' + (c.width + 40) + 'px,' + (c.height + 60) + 'px) rotate(-24deg)';
            var at = tool === 'stick' ? 'translate(' + x + 'px,' + y + 'px) rotate(28deg)' : 'translate(' + x + 'px,' + y + 'px) rotate(0deg)';
            var press = lastPress = tool === 'stick' ? 'translate(' + (x - 10) + 'px,' + (y + 22) + 'px) rotate(28deg)' : 'translate(' + x + 'px,' + (y + 16) + 'px) rotate(0deg) scale(.92)';
            try {
                hand.animate([{ transform: from, opacity: 0 }, { transform: at, opacity: 1, offset: 0.62 }, { transform: at, offset: 0.8 }, { transform: press }],
                    { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
            } catch (e) { hand.style.transform = press; }
            setTimeout(res, ms);
        });
    }
    function handAway(tool) {
        var hand = $('hand');
        if (!hand || hand.hidden) return;
        var out = tool === 'pull' ? ' translate(240px, 0)' : ' translate(260px, 420px) rotate(-20deg)';
        stopHand(hand);
        try { hand.animate([{ transform: lastPress, opacity: 1 }, { transform: lastPress + out, opacity: 0 }], { duration: 420, easing: 'ease-in', fill: 'forwards' }); }
        catch (e) {}
        setTimeout(function () { if (!staging) { stopHand(hand); hand.hidden = true; } }, 450);
    }

    // ── trạng thái vào → (diễn) → vẽ ───────────────────────────────────────
    // ô tay cần bay tới cho 1 lượt chọn: số ô; Ô Ăn Quan = "bên:ô" (bước chọn hướng không bay)
    function targetOf(s, p) {
        if (s.game.id !== 'oanquan') return String(p.n);
        if (p.outcome !== 'pending') return null;
        var side = (s.seats || []).findIndex(function (x) { return x.key === p.key; });
        return (side < 0 ? 0 : side) + ':' + p.n;
    }
    function incoming(s) {
        pending = s;
        if (!staging) pump();
    }
    function pump() {
        var s = pending;
        if (!s) return;
        pending = null;
        var evs = newEvents(s);
        var picks = evs.filter(function (e) { return e.type === 'pick'; });
        var rebuilt = evs.some(function (e) { return e.type === 'start' || e.type === 'rebuild'; });
        var shown = st && st.board;
        var targets = picks.map(function (p) { return targetOf(s, p); }).filter(Boolean);
        var canStage = targets.length && shown && !rebuilt && s.board && st.board.kind === s.board.kind && !document.hidden;
        if (!canStage) { apply(s, evs, false); return; }
        // Diễn: tay bay vào từng ô (Lật Cặp có thể 2 ô trong 1 bình luận) trên bàn cũ → đợi → lộ kết quả
        staging = true;
        sayPicks(s, picks);
        var tool = TOOL[s.board.kind] || 'press';
        var per = Math.max(380, Math.round(SUSPENSE_MS / targets.length)) * SLOW;
        var chain = Promise.resolve();
        targets.forEach(function (t) { chain = chain.then(function () { return flyTo(t, tool, per); }); });
        chain.then(function () {
            apply(s, evs, true);
            handAway(tool);
            staging = false;
            if (pending) setTimeout(pump, 30);
        });
    }

    function renderSeats(s) {
        var n = s.cfg.seats, html = '';
        for (var i = 0; i < n; i++) {
            var x = s.seats[i];
            if (!x) { html += '<div class="lc-seat empty"><div class="lc-av" style="background:rgba(255,255,255,.08)">🪑</div><div class="nm">' + T('Ghế trống') + '</div><div class="sub"></div></div>'; continue; }
            var sub = (x.shields ? '🛡️'.repeat(x.shields) : '') + (s.game.kind === 'score' && s.phase !== 'lobby' ? ' ' + x.score + ' ' + T(s.game.id === 'oanquan' ? 'điểm' : 'cặp') : '') + (x.host ? ' 🎙️' : '');
            html += '<div class="lc-seat' + (x.turn ? ' turn' : '') + (x.out ? ' out' : '') + '" data-k="' + esc(x.key) + '"><span class="no">' + (i + 1) + '</span>' +
                (x.out ? '<span class="bin">🗑️</span>' : '') + avatar(x) + '<div class="nm">' + esc(x.nickname) + '</div><div class="sub">' + sub + '</div></div>';
        }
        $('seats').innerHTML = html;
    }

    function rangeText(s) {
        var o = s.options || [];
        if (!o.length) return '';
        var lo = Math.min.apply(null, o), hi = Math.max.apply(null, o);
        return lo === hi ? String(lo) : lo + '–' + hi;
    }

    function renderPrompt() {
        var s = st, el = $('prompt');
        if (!s) return;
        var gift = (s.cfg.seatGifts || [])[0];
        var giftHtml = gift ? (gift.giftImage ? '<img src="' + esc(gift.giftImage) + '" alt=""> ' : '🎁 ') + '<b>' + esc(gift.giftName || T('quà')) + '</b>' : '🎁';
        if (staging) { el.innerHTML = '<span class="lc-wait-dots">' + T('Đang {v}', { v: T(VERB[s.game.id] || 'chọn') }) + '</span>'; return; }
        if (s.phase === 'lobby') {
            var free = s.cfg.seats - s.seats.length;
            var line = free > 0 ? T('Tặng') + ' ' + giftHtml + ' ' + T('để vào ghế') + ' · ' + T('còn {n} ghế', { n: free }) : T('Đủ người!');
            if (s.lobbyUntil) line += ' <span class="cd">' + secLeft(s.lobbyUntil) + 's</span>';
            else if (s.seats.length < s.cfg.minPlayers) line += '<br><small>' + T('Cần ít nhất {n} người', { n: s.cfg.minPlayers }) + '</small>';
            el.innerHTML = line;
        } else if (s.phase === 'playing') {
            var cur = s.seats.find(function (x) { return x.turn; });
            if (s.holdUntil || !cur) { el.innerHTML = '&nbsp;'; return; }
            if (s.game.id === 'oanquan') {
                var hint = s.board && s.board.sel != null
                    ? T('chọn hướng') + ' <b>1</b> ⬅ ' + T('hoặc') + ' <b>2</b> ➡'
                    : T('bình luận ô + hướng, vd') + ' <b>3 2</b> <small>(1 ⬅ · 2 ➡)</small>';
                el.innerHTML = T('Tới lượt') + ' <b>' + esc(cur.nickname) + '</b> · ' + hint + ' <span class="cd">' + secLeft(s.turnUntil) + 's</span>';
                return;
            }
            var oneOpen = s.board && s.board.cards && s.board.cards.some(function (c) { return c.open && !c.matched; });
            var how = oneOpen ? T('lật thêm 1 số') + ' <b>' + rangeText(s) + '</b>' : s.game.perTurn === 2 ? T('bình luận 2 số, vd {a}', { a: '<b>3 9</b>' }) : T('bình luận số còn trống') + ' <b>' + rangeText(s) + '</b>';
            el.innerHTML = T('Tới lượt') + ' <b>' + esc(cur.nickname) + '</b> · ' + how + ' <span class="cd">' + secLeft(s.turnUntil) + 's</span>';
        } else el.innerHTML = '&nbsp;';
    }

    function renderRing() {
        var s = st;
        if (!s) return;
        document.querySelectorAll('.lc-seat .fg').forEach(function (c) { c.setAttribute('stroke-dashoffset', RING); });
        if (s.phase !== 'playing' || s.holdUntil || !s.turnUntil || staging) return;
        var c = document.querySelector('.lc-seat.turn .fg');
        if (!c) return;
        var frac = Math.max(0, Math.min(1, (s.turnUntil - now()) / (s.cfg.turnSec * 1000)));
        c.setAttribute('stroke-dashoffset', String(RING * (1 - frac)));
        c.classList.toggle('low', frac < 0.3);
    }

    function renderResult(s) {
        var box = $('result');
        if (s.phase !== 'result' || !s.result) { box.classList.add('lc-hidden'); resultKey = ''; return; }
        var r = s.result, key = String(s.resultUntil);
        if (key === resultKey) return;   // đã vẽ — không chạy lại hiệu ứng
        resultKey = key;
        var names = r.winners.map(function (w) { return esc(w.nickname); }).join(', ');
        var loser = r.losers.length ? r.losers[r.losers.length - 1] : null;
        var by = r.winners[0];
        box.innerHTML = r.draw
            ? '<div class="crown">🤝</div><div class="who">' + T('HOÀ!') + '</div><div class="sub">' + T('Bằng điểm, không ai vào thùng rác') + '</div>'
            : '<div class="crown">👑</div><div class="who">' + names + '</div><div class="sub">' + T('VÔ ĐỊCH') + (s.game.kind === 'score' ? ' · ' + r.winners[0].score + ' ' + T(s.game.id === 'oanquan' ? 'điểm' : 'cặp') : '') + '</div>' +
              (loser ? '<div class="sub">' + (by ? '<b>' + esc(by.nickname) + '</b> ' + T('vác') + ' ' : '') + '<b>' + esc(loser.nickname) + '</b> ' + T('ném vào thùng rác') + '</div>' +
                '<div class="trash"><div class="loser"><span>' + esc(loser.nickname) + '</span></div><div class="can">🗑️</div></div>' : '');
        box.classList.remove('lc-hidden');
    }

    function apply(s, evs, spokenPicks) {
        st = s;
        off = (s.now || Date.now()) - Date.now();
        var show = s.cfg.enabled || s.demo;
        $('card').classList.toggle('lc-hidden', !show);
        if (!show) { $('result').classList.add('lc-hidden'); firstState = false; lastSeq = Math.max(lastSeq, ((s.events || []).slice(-1)[0] || {}).seq || 0); return; }
        var fresh = handleEvents(s, evs || [], spokenPicks);
        $('g-icon').textContent = s.game.icon;
        $('g-name').textContent = T(s.game.name);
        $('champs').innerHTML = (s.champs || []).slice(0, 3).map(function (c, i) { return '<span>' + ['🥇', '🥈', '🥉'][i] + ' ' + esc(c.nickname) + ' ×' + c.wins + '</span>'; }).join('');
        renderSeats(s);
        var stage = $('stage');
        var b = s.board || s.preview;
        stage.classList.toggle('idle', !s.board);
        // 3D (board3d.js, Three.js) khi đã nạp xong; chưa xong / máy không có WebGL → bản 2D (boards.js)
        var R = window.LcBoards3D && window.LcBoards3D.ready ? window.LcBoards3D : window.LcBoards;
        R.render(stage, b, { fresh: fresh, marks: s.board ? s.marks : [], colorOf: colorOf, boardId: s.board ? s.boardId : 'preview', players: (s.seats || []).map(function (x) { return x.nickname; }) });
        if (!s.board) {
            var w = document.createElement('div');
            w.className = 'wait';
            w.innerHTML = s.seats.length ? T('Chờ người vào ghế…') : T('Tặng quà để ngồi vào bàn chơi');
            stage.appendChild(w);
        }
        $('queue').innerHTML = s.queue && s.queue.length ? T('Chờ ván sau') + ': ' + s.queue.slice(0, 6).map(function (q) { return esc(q.nickname); }).join(' · ') + (s.queue.length > 6 ? ' +' + (s.queue.length - 6) : '') : '';
        renderPrompt();
        renderRing();
        renderResult(s);
    }

    setInterval(function () { renderPrompt(); renderRing(); }, 200);
    // bàn 3D nạp xong sau trạng thái đầu → vẽ lại trạng thái đang hiện bằng 3D
    window.addEventListener('lc3d:ready', function () { if (st && !staging) apply(st, [], true); });
    window.__lcOverlay = { get state() { return st; }, get staging() { return staging; } };   // gỡ lỗi / chụp ảnh

    if (demo) {
        var step = Math.max(0, Number(params.get('step')) || 0), game = /^(hama|chumcoc|thaptre|latcap|oanquan)$/.test(demo) ? demo : 'hama';
        var poll = function () {
            fetch('/api/luotchoi/demo?game=' + game + '&step=' + step, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
                // bàn mẫu chạy trên đồng hồ giả: đổi giờ về "bây giờ" + lượt còn 12 s cho đẹp
                var shift = Date.now() - s.now;
                ['turnUntil', 'lobbyUntil', 'resultUntil', 'holdUntil'].forEach(function (k) { if (s[k]) s[k] += shift; });
                if (s.turnUntil && !s.holdUntil) s.turnUntil = Date.now() + 12000 - (step % 5) * 1500;
                s.now = Date.now();
                incoming(s);
                step = step >= 400 ? 0 : step + 1;
            }).catch(function () {});
        };
        poll();
        if (params.get('freeze') !== '1') setInterval(poll, 1300);   // &freeze=1: đứng yên 1 cảnh (chụp ảnh)
        return;
    }
    var socket = io({ transports: ['websocket', 'polling'] });
    socket.on('luotchoi:state', incoming);
    socket.on('overlay:reload', function (d) { if (!d || !d.gameId || d.gameId === 'luotchoi') location.reload(); });
    socket.on('connect', function () { fetch('/api/luotchoi/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(incoming).catch(function () {}); });
})();
