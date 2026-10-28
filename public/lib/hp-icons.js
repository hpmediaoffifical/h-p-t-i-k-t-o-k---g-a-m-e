// 🎨 BỘ ICON SVG NÉT DÙNG CHUNG TOÀN APP - MỘT nguồn duy nhất cho cả cửa sổ app (React: src/hp-icons.jsx đọc lại file này)
// lẫn trang HTML thuần (bảng Game Camera, trang điện thoại, overlay). Luật: docs/huong-dan-thiet-ke-giao-dien.md mục 5.1
// (người dùng chốt 2026-10-22): KHÔNG dùng emoji / icon có sẵn làm icon thiết kế - mọi icon là SVG nét khung 24, fill none,
// stroke currentColor, nét 2, bo tròn; hình theo bộ Lucide (giấy phép ISC) hoặc vẽ cùng phong cách.
//
// Trang thuần:  <script src="/lib/hp-icons.js"></script>  rồi
//   HpIcons.svg('lock')              → chuỗi <svg …> (chèn innerHTML)
//   HpIcons.ic('🔒 Cài đặt')         → chuỗi: icon SVG + "Cài đặt" (emoji chưa có icon → giữ nguyên)
//   HpIcons.observe(document.body, { skip: '.thumb' })  → tự đổi emoji ĐẦU mọi đoạn chữ trên trang thành icon, kể cả chữ vẽ lại sau
//                                      (bỏ qua <option>/<textarea>/<script>/ô nhập, mọi thứ trong [data-no-icon] và bộ chọn skip -
//                                      dùng cho vùng HÌNH NỘI DUNG như bìa game, ô hiệu ứng, tên người dùng)
// Thêm icon: thêm 1 mục PATHS (+ 1 dòng EMOJI nếu thay emoji đó). Không chép path SVG rải rác ở file khác.
// Nặng nhẹ: cả bộ ~15 KB chưa nén; SVG nét vẽ nhẹ hơn emoji màu. observe() chỉ soi đoạn chữ MỚI thêm / đổi.
(function (root) {
  if (root.HpIcons) return;
  var PATHS = {
    "live": "<path d=\"M5 8.5a8 8 0 0 0 0 7\"/><path d=\"M19 8.5a8 8 0 0 1 0 7\"/><path d=\"M8.5 10.5a4 4 0 0 0 0 3\"/><path d=\"M15.5 10.5a4 4 0 0 1 0 3\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>",
    "gift": "<path d=\"M4 10h16v10H4z\"/><path d=\"M3 7h18v3H3z\"/><path d=\"M12 7v13\"/><path d=\"M12 7c-3 0-5-1-5-3 0-1.2 1-2 2.2-2C11 2 12 4 12 7Z\"/><path d=\"M12 7c3 0 5-1 5-3 0-1.2-1-2-2.2-2C13 2 12 4 12 7Z\"/>",
    "overlay": "<rect x=\"4\" y=\"5\" width=\"16\" height=\"12\" rx=\"2\"/><path d=\"M8 20h8\"/><path d=\"M12 17v3\"/><path d=\"M8 9h8\"/><path d=\"M8 12h5\"/>",
    "fxlib": "<path d=\"M9 3h6\"/><path d=\"M10 3v5L5 18a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3L14 8V3\"/><path d=\"M7.5 14h9\"/>",
    "deck": "<rect x=\"3\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"4\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>",
    "script": "<path d=\"M7 4h8l3 3v13H7z\"/><path d=\"M15 4v4h4\"/><path d=\"M9.5 11h5\"/><path d=\"M9.5 14h5\"/><path d=\"M9.5 17h3\"/>",
    "obs": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 4a5 5 0 0 1 2.5 8.8\"/><path d=\"M19 13a5 5 0 0 1-8.9 2.4\"/><path d=\"M6.2 17a5 5 0 0 1 4.1-8\"/>",
    "translate": "<path d=\"M4 5h9\"/><path d=\"M8.5 3v2\"/><path d=\"M6 5c.7 3.2 2.5 5.5 5.5 7\"/><path d=\"M12 5c-.6 2.6-2 4.7-4.5 6.5\"/><path d=\"M13 20l4-9 4 9\"/><path d=\"M15 16h4\"/>",
    "level": "<path d=\"M12 20V5\"/><path d=\"m6 11 6-6 6 6\"/><path d=\"M5 20h14\"/><path d=\"M8 16h8\"/>",
    "vote": "<path d=\"M4 10h16v10H4z\"/><path d=\"M8 10V7l4-3 4 3v3\"/><path d=\"m9 14 2 2 4-5\"/>",
    "pk": "<circle cx=\"7\" cy=\"7\" r=\"2.5\"/><circle cx=\"17\" cy=\"7\" r=\"2.5\"/><path d=\"M3 19v-2.5A3.5 3.5 0 0 1 6.5 13h1A3.5 3.5 0 0 1 11 16.5V19\"/><path d=\"M13 19v-2.5a3.5 3.5 0 0 1 3.5-3.5h1a3.5 3.5 0 0 1 3.5 3.5V19\"/><path d=\"M12 4v6\"/><path d=\"m10.5 8.5 1.5 1.5 1.5-1.5\"/>",
    "camera": "<path d=\"M4 8h3l2-3h6l2 3h3v11H4z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>",
    "popup": "<rect x=\"5\" y=\"9\" width=\"10\" height=\"9\" rx=\"1.5\"/><path d=\"M9 6h10v8\"/><path d=\"M8.5 13h3\"/>",
    "dice": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"4\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.5\" cy=\"8.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8.5\" cy=\"15.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.5\" cy=\"15.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
    "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3\"/><path d=\"M12 19v3\"/><path d=\"M4.9 4.9 7 7\"/><path d=\"m17 17 2.1 2.1\"/><path d=\"M2 12h3\"/><path d=\"M19 12h3\"/><path d=\"m4.9 19.1 2.1-2.1\"/><path d=\"m17 7 2.1-2.1\"/>",
    "health": "<path d=\"M20 7 10 17l-5-5\"/><path d=\"M4 4h16v16H4z\"/>",
    "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 10v6\"/><path d=\"M12 7h.01\"/>",
    "link": "<path d=\"M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5\"/><path d=\"M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19.5\"/>",
    "refresh": "<path d=\"M20 12a8 8 0 1 1-2.3-5.7\"/><path d=\"M20 4v5h-5\"/>",
    "close": "<path d=\"M6 6l12 12\"/><path d=\"M18 6 6 18\"/>",
    "copy": "<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"/>",
    "eye": "<path d=\"M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "eyeOff": "<path d=\"M3 3l18 18\"/><path d=\"M10.6 5.8A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.3 4\"/><path d=\"M6.6 6.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 4.5-1.1\"/><path d=\"M9.9 9.9a3 3 0 0 0 4.2 4.2\"/>",
    "send": "<path d=\"M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1z\"/><path d=\"m21.8 2.2-10.9 10.9\"/>",
    "alert": "<path d=\"m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>",
    "play": "<path d=\"M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z\"/>",
    "stop": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2.5\"/>",
    "skip": "<path d=\"M13 19l9-7-9-7z\"/><path d=\"M2 19l9-7-9-7z\"/>",
    "undo": "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "x": "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>",
    "minus": "<path d=\"M5 12h14\"/>",
    "lock": "<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>",
    "wrench": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z\"/>",
    "flask": "<path d=\"M14 2v6a2 2 0 0 0 .2 1l5.5 10a2 2 0 0 1-1.7 3H6a2 2 0 0 1-1.7-3l5.5-10a2 2 0 0 0 .2-1V2\"/><path d=\"M6.5 15h11\"/><path d=\"M8.5 2h7\"/>",
    "clapper": "<path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z\"/><path d=\"m6.2 5.3 3.1 3.9\"/><path d=\"m12.4 3.4 3.1 4\"/><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z\"/>",
    "hourglass": "<path d=\"M5 22h14\"/><path d=\"M5 2h14\"/><path d=\"M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22\"/><path d=\"M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2\"/>",
    "timer": "<path d=\"M10 2h4\"/><path d=\"m12 14 3-3\"/><circle cx=\"12\" cy=\"14\" r=\"8\"/>",
    "alarm": "<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 9v4l2 2\"/><path d=\"M5 3 2 6\"/><path d=\"m22 6-3-3\"/>",
    "zap": "<path d=\"M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z\"/>",
    "swords": "<path d=\"M14.5 17.5 3 6V3h3l11.5 11.5\"/><path d=\"m13 19 6-6\"/><path d=\"m16 16 4 4\"/><path d=\"m19 21 2-2\"/><path d=\"M14.5 6.5 18 3h3v3l-3.5 3.5\"/><path d=\"m5 14 4 4\"/><path d=\"m7 17-3 3\"/><path d=\"m3 19 2 2\"/>",
    "handshake": "<path d=\"m11 17 2 2a1 1 0 1 0 3-3\"/><path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.3L21 4\"/><path d=\"m21 3 1 11h-2\"/><path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\"/><path d=\"M3 4h8\"/>",
    "volume": "<path d=\"M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z\"/><path d=\"M16 9a5 5 0 0 1 0 6\"/><path d=\"M19.4 18.4a9 9 0 0 0 0-12.8\"/>",
    "mute": "<path d=\"M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z\"/><path d=\"m22 9-6 6\"/><path d=\"m16 9 6 6\"/>",
    "mic": "<rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><path d=\"M12 19v3\"/>",
    "gamepad": "<path d=\"M6 11h4\"/><path d=\"M8 9v4\"/><path d=\"M15 12h.01\"/><path d=\"M18 10h.01\"/><path d=\"M17.3 5H6.7a4 4 0 0 0-4 3.6C2.6 9.4 2 14.5 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.4-1.4A2 2 0 0 1 9.8 16h4.4a2 2 0 0 1 1.4.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.5-.6-6.6-.7-7.3A4 4 0 0 0 17.3 5z\"/>",
    "layout": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M9 21V9\"/>",
    "sparkles": "<path d=\"M9.9 15.5A2 2 0 0 0 8.5 14l-6.1-1.6a.5.5 0 0 1 0-1L8.5 9.9A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z\"/><path d=\"M20 3v4\"/><path d=\"M22 5h-4\"/>",
    "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m21 21-4.3-4.3\"/>",
    "swap": "<path d=\"m16 3 4 4-4 4\"/><path d=\"M20 7H4\"/><path d=\"m8 21-4-4 4-4\"/><path d=\"M4 17h16\"/>",
    "phone": "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"2.5\"/><path d=\"M11 18h2\"/>",
    "heart": "<path d=\"M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z\"/>",
    "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M20 21a8 8 0 0 0-16 0\"/>",
    "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.9\"/><path d=\"M16 3.1a4 4 0 0 1 0 7.8\"/>",
    "chevronsUp": "<path d=\"m17 11-5-5-5 5\"/><path d=\"m17 18-5-5-5 5\"/>",
    "star": "<path d=\"M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2.1 2.1 0 0 0 1.6 1.2l5.2.7a.5.5 0 0 1 .3.9l-3.8 3.7a2.1 2.1 0 0 0-.6 1.9l.9 5.1a.5.5 0 0 1-.8.6l-4.6-2.4a2.1 2.1 0 0 0-2 0L6.4 21a.5.5 0 0 1-.8-.6l.9-5.1a2.1 2.1 0 0 0-.6-1.9L2.2 9.8a.5.5 0 0 1 .3-.9l5.2-.7a2.1 2.1 0 0 0 1.6-1.2z\"/>",
    "target": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>",
    "hand": "<path d=\"M18 11V6a2 2 0 0 0-4 0\"/><path d=\"M14 10V4a2 2 0 0 0-4 0v2\"/><path d=\"M10 10.5V6a2 2 0 0 0-4 0v8\"/><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15\"/>",
    "arrowsV": "<path d=\"M12 3v18\"/><path d=\"m8 7 4-4 4 4\"/><path d=\"m8 17 4 4 4-4\"/>",
    "arrowsH": "<path d=\"M3 12h18\"/><path d=\"m7 8-4 4 4 4\"/><path d=\"m17 8 4 4-4 4\"/>",
    "tag": "<path d=\"M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
    "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21\"/>",
    "film": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 3v18\"/><path d=\"M17 3v18\"/><path d=\"M3 7.5h4\"/><path d=\"M3 12h18\"/><path d=\"M3 16.5h4\"/><path d=\"M17 7.5h4\"/><path d=\"M17 16.5h4\"/>",
    "gem": "<path d=\"M6 3h12l4 6-10 13L2 9Z\"/><path d=\"M11 3 8 9l4 13 4-13-3-6\"/><path d=\"M2 9h20\"/>",
    "chart": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M18 17V9\"/><path d=\"M13 17V5\"/><path d=\"M8 17v-3\"/>",
    "trend": "<path d=\"M22 7 13.5 15.5 8.5 10.5 2 17\"/><path d=\"M16 7h6v6\"/>",
    "flame": "<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>",
    "shuffle": "<path d=\"m18 14 4 4-4 4\"/><path d=\"m18 2 4 4-4 4\"/><path d=\"M2 18h2a4 4 0 0 0 3.3-1.7l5.4-7.6A4 4 0 0 1 16 7h6\"/><path d=\"M2 6h2a4 4 0 0 1 3.6 2.2\"/><path d=\"M22 18h-6a4 4 0 0 1-3.3-1.8l-.4-.4\"/>",
    "battery": "<rect x=\"2\" y=\"7\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M22 11v2\"/><path d=\"M6 11v2\"/><path d=\"M10 11v2\"/>",
    "idcard": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"M15 9h3\"/><path d=\"M15 13h3\"/><path d=\"M6 16.5a3 3 0 0 1 6 0\"/>",
    "sliders": "<path d=\"M4 21v-7\"/><path d=\"M4 10V3\"/><path d=\"M12 21v-9\"/><path d=\"M12 8V3\"/><path d=\"M20 21v-5\"/><path d=\"M20 12V3\"/><path d=\"M2 14h4\"/><path d=\"M10 8h4\"/><path d=\"M18 16h4\"/>",
    "scale": "<path d=\"m16 16 3-8 3 8c-.9.6-1.9 1-3 1s-2.1-.4-3-1Z\"/><path d=\"m2 16 3-8 3 8c-.9.6-1.9 1-3 1s-2.1-.4-3-1Z\"/><path d=\"M7 21h10\"/><path d=\"M12 3v18\"/><path d=\"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2\"/>",
    "square": "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/>",
    "save": "<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\"/><path d=\"M7 3v4a1 1 0 0 0 1 1h7\"/>",
    "pin": "<path d=\"M12 17v5\"/><path d=\"M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/>",
    "flag": "<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.3 2q2 0 3.1-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.5\"/>",
    "ban": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m5.6 5.6 12.8 12.8\"/>",
    "eraser": "<path d=\"M21 21H8a2 2 0 0 1-1.4-.6l-4-4a2 2 0 0 1 0-2.8l10-10a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L12.8 21\"/><path d=\"m5.1 11.1 8.8 8.8\"/>",
    "trash": "<path d=\"M3 6h18\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/>",
    "wheel": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M12 3v7\"/><path d=\"M12 14v7\"/><path d=\"M3 12h7\"/><path d=\"M14 12h7\"/><path d=\"m5.6 5.6 5 5\"/><path d=\"m13.4 13.4 5 5\"/><path d=\"m18.4 5.6-5 5\"/><path d=\"m10.6 13.4-5 5\"/>",
    "palette": "<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.2a1.8 1.8 0 0 0-1.4 2.8l.3.4a1.8 1.8 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"17.5\" cy=\"10.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"6.5\" cy=\"12.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"8.5\" cy=\"7.5\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
    "monitor": "<rect x=\"2\" y=\"3\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M8 21h8\"/><path d=\"M12 17v4\"/>",
    "clipboard": "<rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/><path d=\"M9 12h6\"/><path d=\"M9 16h4\"/>",
    "coins": "<circle cx=\"8\" cy=\"8\" r=\"6\"/><path d=\"M18.1 10.4A6 6 0 1 1 10.3 18\"/><path d=\"M7 6h1v4\"/><path d=\"m16.7 13.9.7.7-2.8 2.8\"/>",
    "trophy": "<path d=\"M6 9H4.5a2.5 2.5 0 0 1 0-5H6\"/><path d=\"M18 9h1.5a2.5 2.5 0 0 0 0-5H18\"/><path d=\"M4 22h16\"/><path d=\"M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22\"/><path d=\"M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8\"/><path d=\"M18 2H6v7a6 6 0 0 0 12 0V2Z\"/>",
    "message": "<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\"/>",
    "party": "<path d=\"M5.8 11.3 2 22l10.7-3.8\"/><path d=\"M4 3h.01\"/><path d=\"M22 8h.01\"/><path d=\"M15 2h.01\"/><path d=\"M22 20h.01\"/><path d=\"m22 2-2.2.8a2.9 2.9 0 0 0-2 3.1c.1.9-.6 1.6-1.5 1.6h-.4c-.9 0-1.6.6-1.8 1.4L14 10\"/><path d=\"M11 13c1.9 1.9 2.8 4.2 2 5-.8.8-3.1-.1-5-2-1.9-1.9-2.8-4.2-2-5 .8-.8 3.1.1 5 2Z\"/>",
    "folder": "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>",
    "music": "<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>",
    "headphones": "<path d=\"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3\"/>",
    "pause": "<rect x=\"6\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\" rx=\"1\"/>",
    "bell": "<path d=\"M10.3 21a1.9 1.9 0 0 0 3.4 0\"/><path d=\"M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3\"/>",
    "key": "<path d=\"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4\"/><path d=\"m21 2-9.6 9.6\"/><circle cx=\"7.5\" cy=\"15.5\" r=\"5.5\"/>",
    "download": "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>",
    "upload": "<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>",
    "plus": "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>",
    "edit": "<path d=\"M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z\"/><path d=\"m15 5 4 4\"/>",
    "globe": "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>",
    "crown": "<path d=\"M11.6 3.3a.5.5 0 0 1 .9 0l2.9 5.6a1 1 0 0 0 1.5.3l4.3-3.7a.5.5 0 0 1 .8.5l-2.8 10.3a1 1 0 0 1-1 .7H5.8a1 1 0 0 1-1-.7L2 6a.5.5 0 0 1 .8-.5l4.3 3.7a1 1 0 0 0 1.5-.3z\"/><path d=\"M5 21h14\"/>",
    "rocket": "<path d=\"M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z\"/><path d=\"m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z\"/><path d=\"M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0\"/><path d=\"M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5\"/>",
    "keyboard": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M6 9h.01\"/><path d=\"M10 9h.01\"/><path d=\"M14 9h.01\"/><path d=\"M18 9h.01\"/><path d=\"M6 13h.01\"/><path d=\"M18 13h.01\"/><path d=\"M10 13h4\"/><path d=\"M8 16h8\"/>",
    "bag": "<path d=\"M6 7h12l1.5 13a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1z\"/><path d=\"M9 10V6a3 3 0 0 1 6 0v4\"/>",
    "puzzle": "<path d=\"M15.4 4.4a1 1 0 0 0 1.7-.5 2.5 2.5 0 1 1 3 3 1 1 0 0 0-.5 1.7l1.7 1.7a2.4 2.4 0 0 1 0 3.4l-1.7 1.7a1 1 0 0 1-1.7-.5 2.5 2.5 0 1 0-3 3 1 1 0 0 1 .5 1.7l-1.7 1.7a2.4 2.4 0 0 1-3.4 0l-1.7-1.7a1 1 0 0 0-1.7.5 2.5 2.5 0 1 1-3-3 1 1 0 0 0 .5-1.7l-1.7-1.7a2.4 2.4 0 0 1 0-3.4l1.7-1.7a1 1 0 0 1 1.7.5 2.5 2.5 0 1 0 3-3 1 1 0 0 1-.5-1.7l1.7-1.7a2.4 2.4 0 0 1 3.4 0z\"/>",
    "cloud": "<path d=\"M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z\"/>",
    "ruler": "<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z\"/><path d=\"m14.5 12.5 2-2\"/><path d=\"m11.5 9.5 2-2\"/><path d=\"m8.5 6.5 2-2\"/><path d=\"m17.5 15.5 2-2\"/>",
    "burst": "<path d=\"M12 2v4\"/><path d=\"M12 18v4\"/><path d=\"m4.9 4.9 2.8 2.8\"/><path d=\"m16.3 16.3 2.8 2.8\"/><path d=\"M2 12h4\"/><path d=\"M18 12h4\"/><path d=\"m4.9 19.1 2.8-2.8\"/><path d=\"m16.3 7.7 2.8-2.8\"/>",
    "scissors": "<circle cx=\"6\" cy=\"6\" r=\"3\"/><path d=\"M8.1 8.1 12 12\"/><path d=\"M20 4 8.1 15.9\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><path d=\"M14.8 14.8 20 20\"/>",
    "bug": "<path d=\"m8 2 1.9 1.9\"/><path d=\"M14.1 3.9 16 2\"/><path d=\"M9 7.1v-1a3 3 0 1 1 6 0v1\"/><path d=\"M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6\"/><path d=\"M12 20v-9\"/><path d=\"M6.5 9C4.6 8.8 3 7.1 3 5\"/><path d=\"M6 13H2\"/><path d=\"M3 21c0-2.1 1.7-3.9 3.8-4\"/><path d=\"M21 5c0 2.1-1.6 3.8-3.5 4\"/><path d=\"M22 13h-4\"/><path d=\"M17.2 17c2.1.1 3.8 1.9 3.8 4\"/>",
    // 🦟 Đập Muỗi (vẽ cùng phong cách Lucide; bình xịt = spray-can, giọt = droplet của Lucide)
    "mosquito": "<circle cx=\"12\" cy=\"6\" r=\"1.6\"/><path d=\"M12 4.4V1.5\"/><path d=\"M12 8c1.3 0 2.1 1 2.1 2.6 0 2.4-.8 4.9-.8 7.2S12.8 22 12 22s-1.3-1.9-1.3-4.2-.8-4.8-.8-7.2C9.9 9 10.7 8 12 8z\"/><path d=\"M10 9.5 3.6 7.3c-1-.3-1.8.9-1 1.7l3.5 3c.6.5 1.5.5 2.1 0L10 10.8\"/><path d=\"m14 9.5 6.4-2.2c1-.3 1.8.9 1 1.7l-3.5 3c-.6.5-1.5.5-2.1 0L14 10.8\"/><path d=\"m10.4 13.5-3.4 2.8-1.2 4.2\"/><path d=\"m13.6 13.5 3.4 2.8 1.2 4.2\"/>",
    "spray": "<path d=\"M3 3h.01\"/><path d=\"M7 5h.01\"/><path d=\"M11 7h.01\"/><path d=\"M3 7h.01\"/><path d=\"M7 9h.01\"/><path d=\"M3 11h.01\"/><rect x=\"15\" y=\"5\" width=\"4\" height=\"4\"/><path d=\"m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2\"/><path d=\"m13 14 8-2\"/><path d=\"m13 19 8-2\"/>",
    "racket": "<ellipse cx=\"14.5\" cy=\"9.5\" rx=\"6\" ry=\"6.5\" transform=\"rotate(45 14.5 9.5)\"/><path d=\"M10.3 13.7 3.5 20.5\"/><path d=\"M14.5 4.5v10\"/><path d=\"M9.5 9.5h10\"/><path d=\"M11.5 6.2v6.6\"/><path d=\"M17.5 6.2v6.6\"/>",
    "bednet": "<path d=\"M12 2v2.5\"/><path d=\"M12 4.5 4.5 10V21h15V10z\"/><path d=\"M9 7.3V21\"/><path d=\"M15 7.3V21\"/><path d=\"M4.5 15.5h15\"/>",
    "cream": "<path d=\"M10 2h4v3h-4z\"/><path d=\"M9.5 5h5l2.5 13H7z\"/><path d=\"M7 18h10v3.5H7z\"/><path d=\"M12 8.5v5\"/><path d=\"M9.5 11h5\"/>",
    "droplet": "<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\"/>",
    // 🎥 Game Camera khác (shield / snow / skull / bow = Lucide; shuttle / melon vẽ cùng phong cách)
    "shield": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>",
    "snow": "<path d=\"M2 12h20\"/><path d=\"M12 2v20\"/><path d=\"m20 16-4-4 4-4\"/><path d=\"m4 8 4 4-4 4\"/><path d=\"m16 4-4 4-4-4\"/><path d=\"m8 20 4-4 4 4\"/>",
    "skull": "<path d=\"m12.5 17-.5-1-.5 1h1z\"/><path d=\"M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z\"/><circle cx=\"15\" cy=\"12\" r=\"1\"/><circle cx=\"9\" cy=\"12\" r=\"1\"/>",
    "shuttle": "<path d=\"M5 3l4.5 12h5L19 3\"/><path d=\"M12 3v12\"/><path d=\"M8.7 3.6l2 11.4\"/><path d=\"M15.3 3.6l-2 11.4\"/><path d=\"M6.6 7.5h10.8\"/><path d=\"M9.5 15h5v1.5a2.5 2.5 0 0 1-5 0z\"/>",
    "bow": "<path d=\"M17 3h4v4\"/><path d=\"M18.6 11.1a13 13 0 0 1 1 9 1.2 1.2 0 0 1-1.9.6L14 17\"/><path d=\"M7 10 3.3 6.3a1.2 1.2 0 0 1 .6-1.9 13 13 0 0 1 9 1\"/><path d=\"M7 14a1.7 1.7 0 0 0-1.2.5l-2.6 2.6a.5.5 0 0 0 .3.9H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .9.4l2.6-2.7A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z\"/><path d=\"M9.7 14.3 21 3\"/>",
    "bomb": "<circle cx=\"11\" cy=\"13\" r=\"9\"/><path d=\"M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95\"/><path d=\"m22 2-1.5 1.5\"/>",
    "melon":"<path d=\"M3 10h18a9 9 0 0 1-18 0z\"/><path d=\"M6.3 10a5.7 5.7 0 0 0 11.4 0\"/><path d=\"M10 13.5h.01\"/><path d=\"M14 13.5h.01\"/><path d=\"M12 15.5h.01\"/>",
    "dot": "<circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"currentColor\" stroke=\"none\"/>",
    "ring": "<circle cx=\"12\" cy=\"12\" r=\"5.5\"/>",
    "turtle": "<path d=\"m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z\"/><path d=\"M4.82 7.9 8 10\"/><path d=\"M15.18 7.9 12 10\"/><path d=\"M16.93 10H20a2 2 0 0 1 0 4H2\"/>",
    "cloudRain": "<path d=\"M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2\"/><path d=\"M16 14v6\"/><path d=\"M8 14v6\"/><path d=\"M12 16v6\"/>",
    "ball": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M7.5 10a5 5 0 0 1 3-3.5\"/>",
    "utensils": "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/><path d=\"M7 2v20\"/><path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>"
  };
  // Emoji đầu nhãn → [tên icon, sắc màu]. Khoá đã bỏ biến thể U+FE0F. Emoji chỉ NỘI DUNG game (🍉 🏹 🧸…) để nguyên.
  var EMOJI = {
    "📨": ["send"],
    "⚠": ["alert","warn"],
    "▶": ["play"],
    "⏹": ["stop"],
    "⏸": ["pause"],
    "⏩": ["skip"],
    "⏭": ["skip"],
    "↩": ["undo"],
    "↺": ["refresh"],
    "↻": ["refresh"],
    "🔄": ["refresh"],
    "🔁": ["refresh"],
    "🤝": ["handshake"],
    "🧪": ["flask"],
    "🎬": ["clapper"],
    "⏳": ["hourglass"],
    "⏱": ["timer"],
    "⏰": ["alarm"],
    "⌛": ["hourglass"],
    "🔒": ["lock"],
    "🔐": ["lock"],
    "🔑": ["key"],
    "🔧": ["wrench"],
    "🛠": ["wrench"],
    "⚙": ["settings"],
    "✕": ["x"],
    "✗": ["x"],
    "✖": ["x"],
    "❌": ["x","err"],
    "✓": ["check"],
    "✔": ["check"],
    "✅": ["check","ok"],
    "➖": ["minus"],
    "➕": ["plus"],
    "⚡": ["zap"],
    "⚔": ["swords"],
    "🆚": ["swords"],
    "🥊": ["pk"],
    "🎮": ["gamepad"],
    "🎲": ["dice"],
    "🎰": ["dice"],
    "🔊": ["volume"],
    "🔉": ["volume"],
    "🔈": ["volume"],
    "🔇": ["mute"],
    "🎤": ["mic"],
    "🎙": ["mic"],
    "🎵": ["music"],
    "🎶": ["music"],
    "🟢": ["dot","ok"],
    "🔴": ["dot","err"],
    "🟡": ["dot","warn"],
    "🟠": ["dot","warn"],
    "⚪": ["dot","off"],
    "⚫": ["dot"],
    "●": ["dot"],
    "○": ["ring"],
    "⭕": ["ring"],
    "🎁": ["gift"],
    "📐": ["layout"],
    "✨": ["sparkles"],
    "🔮": ["sparkles"],
    "🔎": ["search"],
    "🔍": ["search"],
    "📱": ["phone"],
    "🖥": ["monitor"],
    "💻": ["monitor"],
    "🩷": ["heart","pink"],
    "💙": ["heart","blue"],
    "❤": ["heart","pink"],
    "💓": ["heart","pink"],
    "💕": ["heart","pink"],
    "🫀": ["heart","pink"],
    "❤‍🔥": ["heart","pink"],
    "💖": ["heart","pink"],
    "🧍": ["user"],
    "👤": ["user"],
    "👥": ["users"],
    "🌊": ["chevronsUp"],
    "⭐": ["star"],
    "🌟": ["star"],
    "🎯": ["target"],
    "👌": ["hand"],
    "✋": ["hand"],
    "⇕": ["arrowsV"],
    "↕": ["arrowsV"],
    "↔": ["arrowsH"],
    "⇔": ["arrowsH"],
    "🏷": ["tag"],
    "🖼": ["image"],
    "🎞": ["film"],
    "💎": ["coin"],
    "📊": ["chart"],
    "📈": ["trend"],
    "🔥": ["flame"],
    "🔀": ["shuffle"],
    "🔋": ["battery"],
    "📇": ["idcard"],
    "🎚": ["sliders"],
    "🎛": ["sliders"],
    "⚖": ["scale"],
    "🔲": ["square"],
    "💾": ["save"],
    "📌": ["pin"],
    "📍": ["pin"],
    "🏁": ["flag"],
    "ℹ": ["info"],
    "⛔": ["ban","err"],
    "🚫": ["ban","err"],
    "🧹": ["eraser"],
    "🗑": ["trash"],
    "🎡": ["wheel"],
    "🎨": ["palette"],
    "📋": ["clipboard"],
    "🪙": ["coin"],
    "💰": ["coins"],
    "🏆": ["trophy"],
    "🏅": ["trophy"],
    "💬": ["message"],
    "🗨": ["message"],
    "🗳": ["vote"],
    "🎉": ["party"],
    "🎊": ["party"],
    "📁": ["folder"],
    "📂": ["folder"],
    "🔔": ["bell"],
    "🔗": ["link"],
    "👁": ["eye"],
    "🙈": ["eyeOff"],
    "📥": ["download"],
    "⬇": ["download"],
    "📤": ["upload"],
    "⬆": ["upload"],
    "✏": ["edit"],
    "📝": ["edit"],
    "🌐": ["globe"],
    "👑": ["crown"],
    "🚀": ["rocket"],
    "📡": ["live"],
    "📷": ["camera"],
    "📸": ["camera"],
    "🎥": ["camera"],
    "📹": ["camera"],
    "🌈": ["palette"],
    "🎭": ["users"],
    "🗂": ["folder"],
    "📜": ["script"],
    "📄": ["script"],
    "⌨": ["keyboard"],
    "🎒": ["bag"],
    "🧩": ["puzzle"],
    "☁": ["cloud"],
    "📏": ["ruler"],
    "💥": ["burst"],
    "💗": ["heart","pink"],
    "🎹": ["music"],
    "👏": ["hand"],
    "👀": ["eye"],
    "✂": ["scissors"],
    "🦟": ["mosquito"],
    "🧴": ["spray"],
    "🏸": ["racket"],
    "🛏": ["bednet"],
    "🩹": ["cream"],
    "🩸": ["droplet"],
    "🛡": ["shield"],
    "❄": ["snow"],
    "💀": ["skull"],
    "☠": ["skull"],
    "🏹": ["bow"],
    "🍉": ["melon"],
    "🖐": ["hand"],
    "🙆": ["user"],
    "🥇": ["trophy","gold"],
    "🥈": ["trophy","silver"],
    "🥉": ["trophy","bronze"],
    "💃": ["music"],
    "🐢": ["turtle"],
    "🌧": ["cloudRain"]
  };
  var LEAD_RE = new RegExp('^((?:\\p{Extended_Pictographic}|[\\u2190-\\u21FF\\u2713\\u2715\\u2717\\u25CB\\u25CF\\u2B55\\u2139])(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*)\\uFE0F?\\s*', 'u');
  var CSS = '.hp-ico{width:1.15em;height:1.15em;display:inline-block;flex:none;vertical-align:-.2em;overflow:visible}'
    + '.hp-ico-lead{margin-right:.38em}.hp-coin{object-fit:contain}'
    + '.hp-ico-ok{color:#16a34a}.hp-ico-err{color:#e5484d}.hp-ico-warn{color:#e08a00}.hp-ico-off{color:#9aa0a6}'
    + '.hp-ico-pink{color:#ff3d8b}.hp-ico-blue{color:#2f8bff}'
    + '.hp-ico-gold{color:#f5b301}.hp-ico-silver{color:#b8c2cc}.hp-ico-bronze{color:#d0874a}'
    // nút nền đậm (đang chọn / nguy hiểm / nút chính): icon có màu cố định lấy màu chữ của nút, kẻo chấm đỏ trên nền đỏ biến mất
    + ':is(button.active,button.danger,button.go,.active>button,.pk-act.main,.pk-act.invite) .hp-ico[class*=" hp-ico-"]{color:inherit}';

  function svg(name, tone, cls) {
    // 'coin' = icon COIN mặc định của app (/coin.svg, đồng xu vàng - ảnh màu, ngoại lệ duy nhất của luật nét; docs 5.1) thay mọi 💎
    if (name === 'coin') return '<img class="hp-ico hp-coin' + (cls ? ' ' + cls : '') + '" src="/coin.svg" alt="" draggable="false">';
    return '<svg class="hp-ico' + (tone ? ' hp-ico-' + tone : '') + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || PATHS.info) + '</svg>';
  }
  /** Tách emoji đầu nhãn: { name, tone, rest } hoặc null (không có / chưa có icon). */
  function split(label) {
    if (typeof label !== 'string') return null;
    var m = LEAD_RE.exec(label);
    if (!m) return null;
    var spec = EMOJI[m[1].replace(/\uFE0F/g, '')];
    return spec ? { name: spec[0], tone: spec[1] || '', rest: label.slice(m[0].length) } : null;
  }
  /** Chuỗi HTML: icon + phần chữ còn lại (phần chữ giữ nguyên - người gọi tự thoát HTML nếu cần). */
  function ic(label) {
    var s = split(label);
    return s ? svg(s.name, s.tone, s.rest ? 'hp-ico-lead' : '') + s.rest : label;
  }
  /** Bỏ emoji đầu câu (tooltip, tiêu đề tab, chữ thuần). */
  function noEmoji(label) {
    if (typeof label !== 'string') return label;
    var m = LEAD_RE.exec(label);
    return m ? label.slice(m[0].length) : label;
  }

  // ---- tự đổi emoji đầu chữ trên trang thuần ----
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, OPTGROUP: 1, TITLE: 1, SELECT: 1, CANVAS: 1, NOSCRIPT: 1 };
  var cssDone = false, skipSel = '[data-no-icon],[contenteditable=""],[contenteditable="true"],svg';
  function injectCss(doc) {
    doc = doc || document;
    if (cssDone || !doc.head) return;
    cssDone = true;
    var st = doc.createElement('style');
    st.setAttribute('data-hp-icons', '');
    st.textContent = CSS;
    doc.head.appendChild(st);
  }
  function fixText(node) {
    var p = node.parentNode;
    if (!p || p.nodeType !== 1 || SKIP[p.nodeName]) return;
    var v = node.nodeValue;
    if (!v) return;
    var lead = /^\s*/.exec(v)[0];
    // đường tắt: mọi emoji trong EMOJI đều ≥ U+2000 → chữ / số mở đầu bằng ký tự thường (đồng hồ, điểm, tên đổi liên tục) khỏi chạy regex
    if (v.charCodeAt(lead.length) < 0x2000) return;
    var s = split(v.slice(lead.length));
    if (!s) return;
    if (p.closest && p.closest(skipSel)) return;
    var tpl = p.ownerDocument.createElement('span');
    tpl.innerHTML = svg(s.name, s.tone, s.rest.trim() ? 'hp-ico-lead' : '');
    var el = tpl.firstChild;
    if (lead) p.insertBefore(p.ownerDocument.createTextNode(lead), node);
    p.insertBefore(el, node);
    node.nodeValue = s.rest;
  }
  function apply(rootEl) {
    if (!rootEl) return rootEl;
    if (rootEl.nodeType === 3) { fixText(rootEl); return rootEl; }
    var doc = rootEl.ownerDocument || document;
    injectCss(doc);
    var w = doc.createTreeWalker(rootEl, 4 /* TEXT */, null), list = [], n;
    while ((n = w.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) fixText(list[i]);
    return rootEl;
  }
  function observe(rootEl, opts) {
    rootEl = rootEl || document.body;
    if (opts && opts.skip) skipSel += ',' + opts.skip;
    if (!rootEl || rootEl.__hpIconsObs) return;
    apply(rootEl);
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'characterData') { fixText(r.target); continue; }
        for (var j = 0; j < r.addedNodes.length; j++) apply(r.addedNodes[j]);
      }
    });
    mo.observe(rootEl, { childList: true, subtree: true, characterData: true });
    rootEl.__hpIconsObs = mo;
  }

  root.HpIcons = { PATHS: PATHS, EMOJI: EMOJI, CSS: CSS, svg: svg, split: split, ic: ic, noEmoji: noEmoji, apply: apply, observe: observe, injectCss: injectCss };
})(typeof window !== 'undefined' ? window : globalThis);
