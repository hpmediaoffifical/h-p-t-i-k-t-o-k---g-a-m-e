/* HP Trồng Cây — Thú cưng sân vườn 🐾
   9 con vật vẽ kiểu mascot "3D" (gradient + highlight + đổ bóng). ĐẦU NHÌN CHÍNH DIỆN 2 MẮT
   (không còn kiểu 1 mắt/sai góc), thân hơi nghiêng để thấy hướng đi. Overlay lật scaleX(-1)
   khi đi sang trái (đầu đối xứng nên lật vẫn ổn). Chân .leg.a/.leg.b bước xen kẽ; tai/đuôi .wag;
   cánh chim .flap; con bay có meta.flyer (lượn trên không). media trống = vẽ sẵn; up WEBM/PNG để thay. */
(function () {
    'use strict';

    const DEFS = `
        <radialGradient id="pgcat" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffc888"/><stop offset=".55" stop-color="#f2913c"/><stop offset="1" stop-color="#cf6e26"/></radialGradient>
        <linearGradient id="pgcatd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e07f30"/><stop offset="1" stop-color="#b75e1f"/></linearGradient>
        <radialGradient id="pgdog" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#f4cd92"/><stop offset=".55" stop-color="#dca256"/><stop offset="1" stop-color="#b67c34"/></radialGradient>
        <linearGradient id="pgdogd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cf9347"/><stop offset="1" stop-color="#a06d2b"/></linearGradient>
        <radialGradient id="pgrab" cx=".4" cy=".28" r=".95"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f3eef4"/><stop offset="1" stop-color="#d9d0de"/></radialGradient>
        <linearGradient id="pgrabd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe9f1"/><stop offset="1" stop-color="#cfc6d6"/></linearGradient>
        <radialGradient id="pgduck" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ffe98a"/><stop offset=".55" stop-color="#ffc62e"/><stop offset="1" stop-color="#e89a00"/></radialGradient>
        <linearGradient id="pgduckd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc62e"/><stop offset="1" stop-color="#dd9200"/></linearGradient>
        <radialGradient id="pgshell" cx=".42" cy=".26" r=".95"><stop offset="0" stop-color="#a7e06f"/><stop offset=".5" stop-color="#5fae3c"/><stop offset="1" stop-color="#2f6b22"/></radialGradient>
        <linearGradient id="pgshelld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f9b32"/><stop offset="1" stop-color="#2c5e1f"/></linearGradient>
        <radialGradient id="pgskin" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#bfe88a"/><stop offset="1" stop-color="#7cb84e"/></radialGradient>
        <radialGradient id="pgham" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#f3dcb4"/><stop offset=".55" stop-color="#d6ad77"/><stop offset="1" stop-color="#ab8049"/></radialGradient>
        <linearGradient id="pghamd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6ad77"/><stop offset="1" stop-color="#a87d44"/></linearGradient>
        <radialGradient id="pgpeng" cx=".42" cy=".26" r=".95"><stop offset="0" stop-color="#5d6e7b"/><stop offset=".5" stop-color="#374751"/><stop offset="1" stop-color="#1b2730"/></radialGradient>
        <radialGradient id="pgsnake" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#d79af2"/><stop offset=".55" stop-color="#a655d8"/><stop offset="1" stop-color="#6f2bb0"/></radialGradient>
        <linearGradient id="pgsnaked" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a3fc8"/><stop offset="1" stop-color="#5a2398"/></linearGradient>
        <radialGradient id="pgbird" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#9bdcf3"/><stop offset=".55" stop-color="#46a6da"/><stop offset="1" stop-color="#2877a8"/></radialGradient>
        <linearGradient id="pgbirdd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46a6da"/><stop offset="1" stop-color="#2a78ab"/></linearGradient>`;

    // 1 con mắt long lanh
    const eye = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#241d18"/><circle cx="${cx - r * 0.32}" cy="${cy - r * 0.4}" r="${r * 0.4}" fill="#fff"/>`;
    // 2 mắt đối xứng quanh tâm mặt fx (mắt chính diện)
    const eyes2 = (fx, ey, gap, r) => eye(fx - gap, ey, r) + eye(fx + gap, ey, r);

    // ── 🐱 MÈO cam (mặt chính diện 2 mắt) ──
    const cat = `<svg viewBox="0 0 120 100">
        <path class="wag" d="M22 66 C 2 60 6 33 23 27 C 14 42 27 54 37 58 Z" fill="url(#pgcatd)"/>
        <rect class="leg b" x="44" y="62" width="9" height="32" rx="4.5" fill="url(#pgcatd)"/>
        <rect class="leg a" x="71" y="62" width="9" height="32" rx="4.5" fill="url(#pgcatd)"/>
        <ellipse cx="38" cy="61" rx="19" ry="18" fill="url(#pgcat)"/>
        <ellipse cx="58" cy="61" rx="29" ry="20" fill="url(#pgcat)"/>
        <rect class="leg a" x="40" y="62" width="10" height="34" rx="5" fill="url(#pgcat)"/>
        <rect class="leg b" x="66" y="62" width="10" height="34" rx="5" fill="url(#pgcat)"/>
        <ellipse cx="50" cy="53" rx="12" ry="6" fill="rgba(255,244,222,.26)"/>
        <path d="M66 30 L70 9 L85 25 Z" fill="url(#pgcat)"/><path d="M99 30 L95 9 L80 25 Z" fill="url(#pgcat)"/>
        <path d="M71 27 L73 16 L81 25 Z" fill="#ffcfae"/><path d="M94 27 L92 16 L84 25 Z" fill="#ffcfae"/>
        <circle cx="82" cy="41" r="21" fill="url(#pgcat)"/>
        <path d="M82 25 v8 M75 27 l-2 7 M89 27 l2 7" stroke="rgba(150,72,18,.5)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <ellipse cx="74" cy="47" rx="8.5" ry="6.5" fill="#ffe9d4"/><ellipse cx="90" cy="47" rx="8.5" ry="6.5" fill="#ffe9d4"/>
        ${eyes2(82, 39, 7.5, 3.7)}
        <path d="M79 45 h6 l-3 3 Z" fill="#e8806e"/>
        <path d="M82 48 v2.5 M82 50.5 q-4 3 -7 1 M82 50.5 q4 3 7 1" stroke="#9a5a44" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path d="M72 46 q-12 -1 -18 -4 M72 49 q-12 1 -18 1" stroke="rgba(255,255,255,.6)" stroke-width="1" fill="none"/>
        <path d="M92 46 q12 -1 18 -4 M92 49 q12 1 18 1" stroke="rgba(255,255,255,.6)" stroke-width="1" fill="none"/>
    </svg>`;

    // ── 🐶 CHÓ Shiba (mặt chính diện) ──
    const dog = `<svg viewBox="0 0 120 100">
        <path class="wag" d="M22 60 C 6 48 12 27 29 30 C 21 35 21 47 35 53 Z" fill="url(#pgdog)"/>
        <rect class="leg b" x="46" y="62" width="10" height="32" rx="5" fill="url(#pgdogd)"/>
        <rect class="leg a" x="74" y="62" width="10" height="32" rx="5" fill="url(#pgdogd)"/>
        <ellipse cx="40" cy="60" rx="20" ry="19" fill="url(#pgdog)"/>
        <ellipse cx="60" cy="60" rx="30" ry="21" fill="url(#pgdog)"/>
        <path d="M40 66 q24 11 44 0 q-2 11 -22 11 q-20 0 -22 -11 Z" fill="#fbf0db"/>
        <rect class="leg a" x="42" y="62" width="11" height="34" rx="5.5" fill="url(#pgdog)"/>
        <rect class="leg b" x="70" y="62" width="11" height="34" rx="5.5" fill="url(#pgdog)"/>
        <rect x="42" y="87" width="11" height="9" rx="4" fill="#fbf0db"/><rect x="70" y="87" width="11" height="9" rx="4" fill="#fbf0db"/>
        <path d="M64 28 L62 9 L80 22 Z" fill="url(#pgdog)"/><path d="M100 28 L102 9 L84 22 Z" fill="url(#pgdog)"/>
        <circle cx="82" cy="42" r="21" fill="url(#pgdog)"/>
        <path d="M82 40 q14 4 0 18 q-14 -4 0 -18 Z" fill="#fbf0db"/>
        <ellipse cx="82" cy="40" rx="14" ry="11" fill="#fbf0db"/>
        ${eyes2(82, 36, 8, 3.5)}
        <ellipse cx="82" cy="46" rx="3.6" ry="2.8" fill="#2a221c"/>
        <path d="M82 49 v3 M82 52 q-4 2 -7 1 M82 52 q4 2 7 1" stroke="#7a5230" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </svg>`;

    // ── 🐰 THỎ trắng (nhảy, mặt chính diện) ──
    const rabbit = `<svg viewBox="0 0 120 100">
        <ellipse class="wag" cx="26" cy="66" rx="9" ry="9" fill="url(#pgrab)"/>
        <ellipse cx="56" cy="66" rx="26" ry="22" fill="url(#pgrab)"/>
        <ellipse cx="50" cy="58" rx="12" ry="8" fill="rgba(255,255,255,.5)"/>
        <ellipse cx="50" cy="88" rx="13" ry="7" fill="url(#pgrabd)"/><ellipse cx="70" cy="86" rx="14" ry="7" fill="url(#pgrab)"/>
        <g class="wag"><ellipse cx="74" cy="20" rx="6.5" ry="21" fill="url(#pgrab)" transform="rotate(-13 78 42)"/><ellipse cx="74" cy="22" rx="3" ry="15" fill="#f6c3cf" transform="rotate(-13 78 42)"/></g>
        <ellipse cx="90" cy="20" rx="6.5" ry="21" fill="url(#pgrab)" transform="rotate(13 86 42)"/><ellipse cx="90" cy="22" rx="3" ry="15" fill="#f6c3cf" transform="rotate(13 86 42)"/>
        <circle cx="82" cy="50" r="17" fill="url(#pgrab)"/>
        ${eyes2(82, 47, 7, 3.4)}
        <path d="M79 54 h6 l-3 3 Z" fill="#ef94a4"/>
        <path d="M82 57 v3 M82 60 q-3 2 -6 1 M82 60 q3 2 6 1" stroke="#cf7b8a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <path d="M76 55 q-10 0 -16 -3 M88 55 q10 0 16 -3" stroke="rgba(170,160,170,.6)" stroke-width="1" fill="none"/>
    </svg>`;

    // ── 🦆 VỊT vàng (mặt chính diện) ──
    const duck = `<svg viewBox="0 0 120 100">
        <rect class="leg a" x="46" y="76" width="6" height="16" rx="2.5" fill="#ef9a2e"/><path class="leg a" d="M40 92 h18 l-3 5 h-12 Z" fill="#f2922e"/>
        <rect class="leg b" x="66" y="76" width="6" height="16" rx="2.5" fill="#e0861f"/><path class="leg b" d="M60 92 h18 l-3 5 h-12 Z" fill="#e0861f"/>
        <ellipse cx="52" cy="60" rx="30" ry="23" fill="url(#pgduck)"/>
        <path class="wag" d="M24 56 q-7 5 -1 14 q9 7 18 3 q-12 -2 -17 -17 Z" fill="url(#pgduck)"/>
        <ellipse cx="60" cy="58" rx="20" ry="14" fill="url(#pgduckd)" opacity=".45"/>
        <ellipse cx="46" cy="50" rx="12" ry="7" fill="rgba(255,250,210,.32)"/>
        <circle cx="80" cy="40" r="18" fill="url(#pgduck)"/>
        ${eyes2(80, 36, 7.5, 3.4)}
        <path d="M74 47 q6 7 12 0 q-1 6 -6 6 q-5 0 -6 -6 Z" fill="#f2922e"/>
        <ellipse cx="80" cy="49" rx="9" ry="4.5" fill="#f7a23a"/>
        <circle cx="77" cy="49" r="0.9" fill="#b9701a"/><circle cx="83" cy="49" r="0.9" fill="#b9701a"/>
    </svg>`;

    // ── 🐢 RÙA xanh (chậm) — ĐẦU vẽ SAU mai để không bị che, thò hẳn ra phải ──
    const turtle = `<svg viewBox="0 0 120 100">
        <rect class="leg b" x="30" y="68" width="13" height="20" rx="6" fill="url(#pgshelld)"/><rect class="leg a" x="60" y="70" width="13" height="20" rx="6" fill="url(#pgshelld)"/>
        <path class="wag" d="M22 66 q-11 2 -13 -4 q7 -4 13 -1 Z" fill="url(#pgskin)"/>
        <ellipse cx="52" cy="64" rx="40" ry="14" fill="url(#pgshelld)"/>
        <path d="M14 62 a38 30 0 0 1 76 0 Z" fill="url(#pgshell)"/>
        <path d="M26 60 a26 21 0 0 1 52 0" fill="none" stroke="rgba(30,70,20,.45)" stroke-width="2"/>
        <path d="M52 35 l0 25 M36 41 l-6 19 M68 41 l6 19" stroke="rgba(30,70,20,.4)" stroke-width="2" fill="none"/>
        <path d="M52 38 l-13 4 2 12 11 4 11 -4 2 -12 Z" fill="none" stroke="rgba(30,70,20,.5)" stroke-width="2"/>
        <ellipse cx="40" cy="48" rx="12" ry="6" fill="rgba(220,255,190,.3)"/>
        <rect class="leg a" x="34" y="70" width="14" height="20" rx="7" fill="url(#pgskin)"/><rect class="leg b" x="58" y="72" width="14" height="18" rx="7" fill="url(#pgskin)"/>
        <path d="M84 66 q10 -2 16 0" stroke="url(#pgskin)" stroke-width="13" stroke-linecap="round"/>
        <circle cx="103" cy="64" r="13" fill="url(#pgskin)"/>
        <circle cx="99" cy="59" r="5" fill="rgba(240,255,210,.4)"/>
        ${eyes2(105, 61, 5, 2.9)}
        <path d="M101 68 q4 2 8 0" stroke="rgba(40,80,30,.5)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`;

    // ── 🐹 HAMSTER (mặt chính diện, má phồng) ──
    const hamster = `<svg viewBox="0 0 120 100">
        <ellipse cx="60" cy="66" rx="34" ry="28" fill="url(#pgham)"/>
        <ellipse cx="60" cy="74" rx="22" ry="16" fill="#fbeede"/>
        <ellipse cx="48" cy="52" rx="13" ry="8" fill="rgba(255,248,230,.3)"/>
        <rect class="leg a" x="40" y="84" width="11" height="12" rx="5" fill="url(#pghamd)"/><rect class="leg b" x="70" y="84" width="11" height="12" rx="5" fill="url(#pghamd)"/>
        <circle cx="42" cy="44" r="9" fill="url(#pgham)"/><circle cx="42" cy="44" r="4.5" fill="#f6c9c0"/>
        <circle cx="78" cy="44" r="9" fill="url(#pgham)"/><circle cx="78" cy="44" r="4.5" fill="#f6c9c0"/>
        <ellipse cx="60" cy="56" rx="30" ry="26" fill="url(#pgham)"/>
        <ellipse cx="44" cy="64" rx="11" ry="9" fill="#fbeede"/><ellipse cx="76" cy="64" rx="11" ry="9" fill="#fbeede"/>
        ${eyes2(60, 52, 11, 4)}
        <path d="M56 60 h8 l-4 3 Z" fill="#3a2a22"/>
        <path d="M60 63 v2 M60 65 q-3 2 -6 1 M60 65 q3 2 6 1" stroke="#8a5a44" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </svg>`;

    // ── 🐧 CÁNH CỤT (mặt chính diện) ──
    const penguin = `<svg viewBox="0 0 120 100">
        <path class="leg a" d="M46 90 h16 l-3 6 h-12 Z" fill="#f2922e"/><path class="leg b" d="M58 90 h16 l-3 6 h-12 Z" fill="#e0861f"/>
        <ellipse cx="60" cy="56" rx="32" ry="40" fill="url(#pgpeng)"/>
        <ellipse cx="60" cy="62" rx="21" ry="31" fill="#f6f3ec"/>
        <path class="wag" d="M30 48 q-12 8 -6 30 q10 4 12 -6 Z" fill="url(#pgpeng)"/>
        <path d="M90 48 q12 8 6 30 q-10 4 -12 -6 Z" fill="url(#pgpeng)"/>
        ${eyes2(60, 40, 9, 4)}
        <path d="M53 49 q7 7 14 0 q-3 7 -7 7 q-4 0 -7 -7 Z" fill="#f6a52e"/>
        <ellipse cx="44" cy="34" rx="9" ry="6" fill="rgba(255,255,255,.14)"/>
    </svg>`;

    // ── 🐍 RẮN tím (trườn) — thân NẰM DÀI sát đất, phần đầu/cổ NGÓC LÊN, đuôi thon nhọn ──
    // Thân tô kín 1 mảnh: đuôi nhỏ (trái) → thân nằm trên đất → cổ vươn cao → đầu hình nêm ngẩng.
    const snake = `<svg viewBox="0 0 120 100">
        <ellipse cx="46" cy="90" rx="40" ry="5" fill="rgba(0,0,0,.18)"/>
        <path d="M 8 86 Q 18 80 28 82 Q 40 84 48 82 Q 60 80 66 78 Q 74 74 78 68 Q 84 59 88 50 Q 90 43 100 43 Q 112 45 112 53 Q 111 61 102 61 Q 96 63 92 67 Q 85 75 80 81 Q 70 88 60 88 Q 48 91 40 90 Q 28 90 18 88 Q 12 88 8 86 Z" fill="url(#pgsnake)"/>
        <path d="M 14 86 Q 34 89 56 87 Q 70 85 78 79" fill="none" stroke="rgba(255,232,180,.5)" stroke-width="4" stroke-linecap="round"/>
        <path d="M34 82 l1 8 M52 81 l1 9 M67 78 l3 9 M80 64 l6 9" stroke="rgba(70,20,110,.45)" stroke-width="5" stroke-linecap="round" fill="none"/>
        <ellipse cx="40" cy="83" rx="16" ry="3.5" fill="rgba(255,255,255,.14)"/>
        <ellipse cx="98" cy="49" rx="6" ry="3.5" fill="rgba(255,240,255,.3)"/>
        ${eye(100, 51, 3.6)}
        <circle cx="110" cy="53" r="1.1" fill="rgba(60,16,96,.7)"/>
        <path d="M103 58 q6 0 9 -2" stroke="rgba(70,20,110,.5)" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path class="wag" d="M112 54 l14 -2 -8 3 8 2 -14 0 Z" fill="#ec4658"/>
    </svg>`;

    // ── 🐦 CHIM (bay, đầu phải) — đuôi xòe phía SAU, cánh DÍNH SÁT THÂN vỗ lên/xuống ──
    const bird = `<svg viewBox="0 0 120 100">
        <path d="M40 52 L10 44 L32 54 L7 60 L32 60 L13 68 L38 62 Z" fill="url(#pgbirdd)"/>
        <path d="M60 48 Q44 30 32 38 Q42 46 50 47 Q40 51 36 57 Q50 60 61 52 Z" fill="url(#pgbirdd)" opacity=".5"/>
        <ellipse cx="60" cy="56" rx="27" ry="20" fill="url(#pgbird)"/>
        <path d="M42 62 q18 14 38 1 q-4 12 -19 12 q-15 0 -19 -13 Z" fill="#eaf7ff"/>
        <circle cx="84" cy="44" r="15" fill="url(#pgbird)"/>
        <ellipse cx="79" cy="39" rx="6" ry="3.5" fill="rgba(255,255,255,.26)"/>
        ${eye(88, 42, 3.9)}
        <path d="M98 43 Q107 44.5 115 46 Q107 47.5 98 48 Z" fill="#f6a52e"/>
        <path d="M99 46 L114 46" stroke="#cf7a18" stroke-width="1.1" fill="none" stroke-linecap="round"/>
        <path d="M62 73 q3 4 0 7 M71 74 q3 4 0 7" stroke="#e8923a" stroke-width="2" fill="none" stroke-linecap="round"/>
        <g class="flap"><path d="M61 46 Q44 23 29 32 Q40 42 50 44 Q38 49 33 57 Q50 61 63 51 Z" fill="url(#pgbirdd)"/><path d="M60 48 Q47 31 36 37 Q45 44 53 46 Q43 50 39 55 Q51 58 61 51 Z" fill="url(#pgbird)"/></g>
    </svg>`;

    const ART = { cat, dog, rabbit, duck, turtle, hamster, penguin, snake, bird };
    const META = {
        cat:     { label: '🐱 Mèo',     speed: 7,   size: 96,  baseY: 93,   hopper: false, flyer: false },
        dog:     { label: '🐶 Chó',     speed: 8,   size: 106, baseY: 94,   hopper: false, flyer: false },
        rabbit:  { label: '🐰 Thỏ',     speed: 10,  size: 82,  baseY: 92,   hopper: true,  flyer: false },
        duck:    { label: '🦆 Vịt',     speed: 5.5, size: 80,  baseY: 95,   hopper: false, flyer: false },
        turtle:  { label: '🐢 Rùa',     speed: 2.2, size: 94,  baseY: 95.5, hopper: false, flyer: false },
        hamster: { label: '🐹 Hamster', speed: 6,   size: 68,  baseY: 95.5, hopper: false, flyer: false },
        penguin: { label: '🐧 Cánh cụt', speed: 4,  size: 86,  baseY: 95,   hopper: false, flyer: false },
        snake:   { label: '🐍 Rắn',     speed: 6,   size: 104, baseY: 96.5, hopper: false, flyer: false, slither: true },
        bird:    { label: '🐦 Chim',    speed: 13,  size: 78,  baseY: 60,   hopper: false, flyer: true  }
    };
    const ORDER = ['cat', 'dog', 'rabbit', 'duck', 'turtle', 'hamster', 'penguin', 'snake', 'bird'];
    const TOP_ELIGIBLE = ORDER.filter(k => k !== 'dog');   // 🐶 KHÔNG dùng chó làm con vật TOP (kém tôn trọng)
    function defaultTopPets() { return [{ kind: 'cat', media: '' }, { kind: 'rabbit', media: '' }, { kind: 'turtle', media: '' }]; }
    function defaultDecorPets() { return [{ kind: 'dog', enabled: true, media: '' }, { kind: 'duck', enabled: true, media: '' }, { kind: 'bird', enabled: true, media: '' }]; }

    window.HpTrongCayPets = { DEFS, ART, META, ORDER, TOP_ELIGIBLE, defaultTopPets, defaultDecorPets };
})();
