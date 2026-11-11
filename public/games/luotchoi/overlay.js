/* 🎲 Trò Chơi Theo Lượt — overlay OBS: CHỈ hiển thị trạng thái 'luotchoi:state' (lib/luot-choi/controller.js).
 * Đếm ngược tự chạy theo giờ server (bù lệch). Sự kiện (seq tăng dần) → thông báo nổi + hiệu ứng bàn.
 * ?demo=<hama|chumcoc|thaptre|latcap>[&step=n][&freeze=1] → hỏi /api/luotchoi/demo?step=n (bàn TẠM chạy luật thật), không đụng bàn thật. */
(function () {
    'use strict';
    var T = window.hpT || function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v && v[k] != null ? v[k] : m; }); };
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var COLORS = ['#ff6b8b', '#4fb3ff', '#ffb547', '#39d98a', '#b388ff', '#ff8a4c'];
    var TRAP_WORD = { hama: '🦛 NGOẠM!', chumcoc: '🐸 CÓC NHẢY RA!', thaptre: '🎋 THÁP ĐỔ!' };
    var SAVE_WORD = { hama: 'rụt tay kịp', chumcoc: 'giữ được nắp chum', thaptre: 'đỡ được tháp' };
    var RING = 2 * Math.PI * 50;

    var st = null, off = 0, lastSeq = -1, firstState = true, resultKey = '';
    var params = new URLSearchParams(location.search);
    var demo = params.get('demo');

    function colorOf(k) { var h = 0; for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
    function avatar(s) {
        var inner = s.avatar ? '<img src="' + esc(s.avatar) + '" alt="">' : esc(Array.from(s.nickname || '?')[0] || '?').toUpperCase();
        return '<div class="lc-av" style="background:' + colorOf(s.key || '') + '">' + inner +
            '<svg viewBox="0 0 114 114"><circle class="bg" cx="57" cy="57" r="50"></circle><circle class="fg" cx="57" cy="57" r="50" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '"></circle></svg></div>';
    }
    var now = function () { return Date.now() + off; };
    var secLeft = function (u) { return Math.max(0, Math.ceil((u - now()) / 1000)); };

    function toast(text, kind) {
        var el = document.createElement('div');
        el.className = 'lc-toast' + (kind ? ' ' + kind : '');
        el.innerHTML = text;
        $('toasts').appendChild(el);
        while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
        setTimeout(function () { el.remove(); }, 2700);
    }

    function handleEvents(s) {
        var evs = s.events || [];
        var fresh = false;
        if (firstState) { lastSeq = evs.length ? evs[evs.length - 1].seq : 0; firstState = false; return false; }
        if (evs.length && evs[evs.length - 1].seq < lastSeq) lastSeq = 0;   // server khởi động lại / bàn mẫu quay vòng
        evs.forEach(function (e) {
            if (e.seq <= lastSeq) return;
            lastSeq = e.seq;
            var g = s.game.id, who = '<b>' + esc(e.nickname || '') + '</b>';
            switch (e.type) {
                case 'pick': fresh = true; if (e.outcome === 'trap') toast(T(TRAP_WORD[g] || '💥'), 'bad'); break;
                case 'seat': toast('🪑 ' + who + ' ' + T('vào ghế')); break;
                case 'queue': toast('⏳ ' + who + ' ' + T('chờ ván sau')); break;
                case 'shieldAdd': toast('🛡️ ' + who + ' ' + T('+1 khiên'), 'good'); break;
                case 'shield': toast('🛡️ ' + who + ' ' + T(SAVE_WORD[g] || 'được khiên cứu'), 'good'); break;
                case 'match': toast('✨ ' + T('Trúng cặp! +1'), 'good'); break;
                case 'start': toast('🎲 ' + T('Bắt đầu!')); break;
                case 'out':
                    if (e.kicked) toast('👋 ' + who + ' ' + T('rời ghế'));
                    else toast('🗑️ ' + (e.byNickname ? '<b>' + esc(e.byNickname) + '</b> ' + T('ném') + ' ' : '') + who + ' ' + T('vào thùng rác!'), 'bad');
                    break;
            }
        });
        return fresh;
    }

    function renderSeats(s) {
        var n = s.cfg.seats, html = '';
        for (var i = 0; i < n; i++) {
            var x = s.seats[i];
            if (!x) { html += '<div class="lc-seat empty"><div class="lc-av" style="background:rgba(255,255,255,.08)">🪑</div><div class="nm">' + T('Ghế trống') + '</div><div class="sub"></div></div>'; continue; }
            var sub = (x.shields ? '🛡️'.repeat(x.shields) : '') + (s.game.kind === 'score' && s.phase !== 'lobby' ? ' ' + x.score + ' ' + T('cặp') : '') + (x.host ? ' 🎙️' : '');
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
        if (s.phase === 'lobby') {
            var free = s.cfg.seats - s.seats.length;
            var line = free > 0 ? T('Tặng') + ' ' + giftHtml + ' ' + T('để vào ghế') + ' · ' + T('còn {n} ghế', { n: free }) : T('Đủ người!');
            if (s.lobbyUntil) line += ' <span class="cd">' + secLeft(s.lobbyUntil) + 's</span>';
            else if (s.seats.length < s.cfg.minPlayers) line += '<br><small>' + T('Cần ít nhất {n} người', { n: s.cfg.minPlayers }) + '</small>';
            el.innerHTML = line;
        } else if (s.phase === 'playing') {
            var cur = s.seats.find(function (x) { return x.turn; });
            if (s.holdUntil || !cur) { el.innerHTML = '&nbsp;'; return; }
            var oneOpen = s.board && s.board.cards && s.board.cards.some(function (c) { return c.open && !c.matched; });
            var how = oneOpen ? T('lật thêm 1 số') + ' <b>' + rangeText(s) + '</b>' : s.game.perTurn === 2 ? T('bình luận 2 số, vd {a}', { a: '<b>3 9</b>' }) : T('bình luận số còn trống') + ' <b>' + rangeText(s) + '</b>';
            el.innerHTML = T('Tới lượt') + ' <b>' + esc(cur.nickname) + '</b> · ' + how + ' <span class="cd">' + secLeft(s.turnUntil) + 's</span>';
        } else el.innerHTML = '&nbsp;';
    }

    function renderRing() {
        var s = st;
        if (!s) return;
        document.querySelectorAll('.lc-seat .fg').forEach(function (c) { c.setAttribute('stroke-dashoffset', RING); });
        if (s.phase !== 'playing' || s.holdUntil || !s.turnUntil) return;
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
            : '<div class="crown">👑</div><div class="who">' + names + '</div><div class="sub">' + T('VÔ ĐỊCH') + (s.game.kind === 'score' ? ' · ' + r.winners[0].score + ' ' + T('cặp') : '') + '</div>' +
              (loser ? '<div class="sub">' + (by ? '<b>' + esc(by.nickname) + '</b> ' + T('vác') + ' ' : '') + '<b>' + esc(loser.nickname) + '</b> ' + T('ném vào thùng rác') + '</div>' +
                '<div class="trash"><div class="loser"><span>' + esc(loser.nickname) + '</span></div><div class="can">🗑️</div></div>' : '');
        box.classList.remove('lc-hidden');
    }

    function render(s) {
        st = s;
        off = (s.now || Date.now()) - Date.now();
        var show = s.cfg.enabled || s.demo;
        $('card').classList.toggle('lc-hidden', !show);
        if (!show) { $('result').classList.add('lc-hidden'); return; }
        var fresh = handleEvents(s);
        $('g-icon').textContent = s.game.icon;
        $('g-name').textContent = T(s.game.name);
        $('champs').innerHTML = (s.champs || []).slice(0, 3).map(function (c, i) { return '<span>' + ['🥇', '🥈', '🥉'][i] + ' ' + esc(c.nickname) + ' ×' + c.wins + '</span>'; }).join('');
        renderSeats(s);
        var stage = $('stage');
        var b = s.board || s.preview;
        stage.classList.toggle('idle', !s.board);
        window.LcBoards.render(stage, b, { fresh: fresh });
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

    if (demo) {
        var step = Math.max(0, Number(params.get('step')) || 0), game = /^(hama|chumcoc|thaptre|latcap)$/.test(demo) ? demo : 'hama';
        var poll = function () {
            fetch('/api/luotchoi/demo?game=' + game + '&step=' + step, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (s) {
                // bàn mẫu chạy trên đồng hồ giả: đổi giờ về "bây giờ" + lượt còn 12 s cho đẹp
                var shift = Date.now() - s.now;
                ['turnUntil', 'lobbyUntil', 'resultUntil', 'holdUntil'].forEach(function (k) { if (s[k]) s[k] += shift; });
                if (s.turnUntil && !s.holdUntil) s.turnUntil = Date.now() + 12000 - (step % 5) * 1500;
                s.now = Date.now();
                render(s);
                step = step >= 400 ? 0 : step + 1;
            }).catch(function () {});
        };
        poll();
        if (params.get('freeze') !== '1') setInterval(poll, 1300);   // &freeze=1: đứng yên 1 cảnh (chụp ảnh)
        return;
    }
    var socket = io({ transports: ['websocket', 'polling'] });
    socket.on('luotchoi:state', render);
    socket.on('overlay:reload', function (d) { if (!d || !d.gameId || d.gameId === 'luotchoi') location.reload(); });
    socket.on('connect', function () { fetch('/api/luotchoi/state', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(render).catch(function () {}); });
})();
