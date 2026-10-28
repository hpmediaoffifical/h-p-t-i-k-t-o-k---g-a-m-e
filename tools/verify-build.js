// Kiểm tra ruột installer TRƯỚC khi đẩy cho toàn bộ máy khách.
//
// Phải chạy bằng Electron chứ không phải node: file nằm trong app.asar, và chỉ Electron mới
// vá fs để đọc xuyên vào asar. Đây cũng chính là lý do bài kiểm này tồn tại — có những lỗi
// chỉ xuất hiện sau khi đóng gói, đọc thư mục trong asar là một cái:
//
//     fs.readdirSync(dir, { withFileTypes: true })
//
// Chạy trên đĩa thường thì ngon lành, nhưng nếu bản Electron nào đó không hỗ trợ tuỳ chọn
// này bên trong asar, hàm sẽ NÉM LỖI — mà server.js bắt lỗi rồi trả mảng rỗng, nên app cài
// mới sẽ không có bộ skin nào và không báo gì cả. Lỗi im lặng kiểu đó chỉ lộ ra khi khách
// đã cài. Vì vậy bài kiểm này gọi ĐÚNG hàm mà server.js gọi, không gọi hàm tương đương.
//
//     npx electron tools/verify-build.js [đường-dẫn-app.asar]

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const asar = process.argv[2] ||
    path.join(process.cwd(), 'dist', 'win-unpacked', 'resources', 'app.asar');

// Từng mục là một thứ mà THIẾU nó thì máy khách hỏng theo cách khó đoán ra.
const FILES = [
    ['hpkey/secret.local.js', 'thiếu là máy cài mới KHÔNG active được key nào'],
    ['server.js', 'lõi server'],
    ['public/index.html', 'giao diện app'],
    ['public/games/nhatla/overlay.html', 'overlay Nhặt Lá'],
    ['public/games/nhatla/game.js', 'engine helper Nhặt Lá'],
    ['public/games/nhatla/board.html', 'overlay bảng quà Nhặt Lá'],
    ['public/games/nhatla/board.css', 'kiểu dáng bảng quà — panel và overlay dùng chung'],
    // server.js require() các module này lúc khởi động — thiếu 1 file là app không mở được
    ['lib/vipwelcome/join-signals.js', 'nhận diện vào phòng (thiếu = server không khởi động)'],
    ['lib/vipwelcome/presence.js', 'vào/ra/vào lại (thiếu = server không khởi động)'],
    ['lib/vipwelcome/tier-match.js', 'bậc thẻ vào phòng (thiếu = server không khởi động)'],
    ['lib/vipwelcome/gift-ledger.js', 'sổ xu (thiếu = server không khởi động)'],
    ['lib/vipwelcome/media-queue.js', 'hàng media VIP (thiếu = server không khởi động)'],
    ['lib/vipwelcome/visits.js', 'sổ ghé phòng (thiếu = server không khởi động)'],
    ['lib/vipwelcome/batcher.js', 'gộp thẻ khi đông (thiếu = server không khởi động)'],
    ['lib/vipwelcome/tts-text.js', 'câu đọc tên (thiếu = server không khởi động)'],
    ['public/games/vipwelcome/board.html', 'overlay BXH khách quen'],
    ['public/_prototype/giftboard.html', 'Bảng Quà Tổng — nút ở đáy sidebar + link OBS'],
    // 🎥 Game Camera: overlay mẹ nhúng game con (Touch & Play / Chém Trái Cây) + feed camera dùng chung
    ['public/games/camgames/overlay.html', 'overlay Game Camera (1 link OBS cho mọi game camera)'],
    ['public/games/camgames/registry.js', 'danh sách game con của Game Camera (thiếu = menu rỗng)'],
    ['public/games/camgames/camgames-panel.js', 'panel Game Camera'],
    ['public/_prototype/touchplay.html', 'game Touch & Play (Game Camera nhúng vào)'],
    ['lib/touchplay-obs-feed.js', 'feed camera từ OBS (thiếu = server không khởi động)'],
    ['public/lib/obs-scene-map.mjs', 'khớp vùng camera trong scene OBS'],
    ['public/lib/hp-tracking.mjs', 'nhận diện tay/người MediaPipe'],
    ['lib/chemtraicay-relay.js', 'relay tay Chém Trái Cây (thiếu = server không khởi động)'],
    ['public/games/vipwelcome/joincard.css', 'giao diện thẻ vào phòng trên OBS'],
    ['public/lib/mediapipe/hand_landmarker.task', 'model tay offline cho Chém Trái Cây'],
    ['public/lib/mediapipe/vision_bundle.mjs', 'MediaPipe offline cho game camera'],
    ['public/lib/mediapipe/pose_landmarker_lite.task', 'model body offline (Bắn Cung / Đập Muỗi / Level Quest bám người)'],
    // 🎥 Game Camera chơi 2 game cùng lúc: luật khe/quà/phím (server require) + một bộ nhận diện chung trong overlay mẹ
    ['lib/camgames.js', 'luật Game Camera chơi nhiều game (thiếu = server không khởi động)'],
    ['lib/caption-listener.js', 'Phụ đề giọng: tìm Edge/Chrome + máy trạng thái cửa sổ nghe (thiếu = server không khởi động)'],
    ['lib/win-minimize.js', 'Phụ đề giọng: thu nhỏ cửa sổ nghe (chạy ngầm)'],
    ['public/listen/caption.html', 'Phụ đề giọng: trang nghe mở trong Edge/Chrome'],
    ['public/listen/caption.js', 'Phụ đề giọng: logic trang nghe'],
    ['public/lib/caption-speech.mjs', 'Phụ đề giọng: gộp kết quả nhận diện / bật lại / tự ngắt'],
    ['public/lib/caption-pace.mjs', 'Phụ đề giọng: overlay giữ nhịp đọc'],
    ['public/lib/hp-cam-shared.mjs', 'bộ nhận diện dùng chung của overlay Game Camera'],
    ['public/lib/body-frames.mjs', 'khung đầu/thân từ pose (Đập Muỗi chích, Level Quest bám đầu)'],
    ['public/lib/head-anchor.mjs', 'Level Quest bám đỉnh đầu trong Game Camera'],
    ['public/games/bancung/body-track.mjs', 'Bắn Cung bám người thật'],
    // 🦟 Đập Muỗi: server require engine lúc khởi động
    ['public/games/dapmuoi/game.js', 'engine Đập Muỗi (thiếu = server không khởi động)'],
    ['public/games/dapmuoi/overlay.html', 'overlay Đập Muỗi'],
    ['public/games/dapmuoi/clap.js', 'nhận diện vỗ tay Đập Muỗi'],
    ['public/games/dapmuoi/bumps.js', 'nốt muỗi chích bám người'],
    ['public/games/dapmuoi/dapmuoi-panel.js', 'panel Đập Muỗi'],
    ['public/games/dapmuoi/assets/muoi-chua-3d.png', 'ảnh 👑 Muỗi Chúa'],
    // v1.19.0 — chuyển từ HP LIVE NPC: server require lúc khởi động
    ['lib/camgames-session.js', '🎮 phiên game theo quà (thiếu = server không khởi động)'],
    ['lib/camgames-gift-seed.js', 'quà mẫu Game Camera (thiếu = server không khởi động)'],
    ['lib/camgames-gift-seed.json', 'dữ liệu quà mẫu Game Camera'],
    ['lib/camgames-obs.js', '＋ Thêm nhanh overlay / cảnh báo Scene (thiếu = server không khởi động)'],
    ['lib/body-server.js', '🧍 Bộ Tách Người phía server (thiếu = server không khởi động)'],
    ['lib/body-gift-seed.js', 'quà mẫu Bộ Tách Người'],
    ['public/games/dacau/game.js', 'engine 🏸 Đá Cầu (thiếu = server không khởi động)'],
    ['public/games/dacau/overlay.html', 'overlay Đá Cầu'],
    ['public/games/body/core.js', 'lõi Bộ Tách Người (thiếu = server không khởi động)'],
    ['public/games/biduoi/core.js', 'lõi Bị Đuổi (server require)'],
    ['public/games/haucanh/core.js', 'lõi Hậu Cảnh'],
    ['public/games/body/overlay.html', 'overlay Bộ Tách Người'],
    ['public/games/body/body-panel.js', 'panel Bộ Tách Người + lưới ô trong Game Camera'],
    ['public/games/body/fx-morph-more.mjs', '7 game Biến Hình đợt 2'],
    ['public/games/body/samples/ninja.webm', 'video mẫu giao kèm (Ninja)'],
    ['public/games/body/samples/thumb/morph-phone.webp', 'ảnh bìa game tách người'],
    ['public/games/camgames/thumb/dacau.webp', 'ảnh bìa game camera'],
    ['public/games/camgames/cam-frame-guard.js', 'khung game ẩn / mất kết nối thì câm + dừng'],
    ['public/lib/mediapipe/selfie_segmenter.tflite', 'model tách nền người offline'],
    ['public/lib/hp-person-seg.mjs', 'tách nền người'],
    ['public/lib/hp-matte.mjs', 'làm mịn viền tách nền'],
];

// [thư mục, số bộ tối thiểu] — đọc bằng withFileTypes y như server.js.
// Danh sách này phải khớp NHATLA_SKIN_KINDS trong server.js. Thiếu một chiều ở đây thì
// installer rỗng bộ đó vẫn qua cửa: server.js nuốt lỗi rồi trả mảng rỗng, panel hiện ô
// chọn trống mà không báo gì.
const SKIN_DIRS = [
    ['public/games/nhatla/skins/hat', 1],
    ['public/games/nhatla/skins/thung', 1],
    ['public/games/nhatla/skins/tui', 1],
];

const problems = [];

function checkFiles() {
    for (const [rel, why] of FILES) {
        const full = path.join(asar, ...rel.split('/'));
        let size = -1;
        try { size = fs.statSync(full).size; } catch (e) {}
        if (size < 0) problems.push(`thiếu ${rel} — ${why}`);
        else if (size === 0) problems.push(`${rel} rỗng 0 byte — ${why}`);
        else console.log(`  ok  ${rel} (${size} byte)`);
    }
}

function checkSkins() {
    for (const [rel, min] of SKIN_DIRS) {
        const full = path.join(asar, ...rel.split('/'));
        let dirs;
        try {
            dirs = fs.readdirSync(full, { withFileTypes: true })
                     .filter(e => e.isDirectory()).map(e => e.name);
        } catch (e) {
            problems.push(`không đọc được ${rel} trong asar: ${e.message}`);
            continue;
        }
        // Bộ nào manifest hỏng thì server bỏ qua bộ đó mà không báo, nên đọc thử từng cái.
        const broken = [];
        for (const d of dirs) {
            try {
                const m = JSON.parse(fs.readFileSync(path.join(full, d, 'skin.json'), 'utf8'));
                const frames = Math.max(1, Number(m.count) || 1);
                for (let i = 1; i <= frames; i++) {
                    const frame = String(i).padStart(2, '0') + '.' + (m.ext || 'png');
                    fs.statSync(path.join(full, d, frame));
                }
            } catch (e) {
                broken.push(`${d} (${e.message.split('\n')[0]})`);
            }
        }
        if (broken.length) problems.push(`${rel}: bộ hỏng — ${broken.join(', ')}`);
        if (dirs.length < min) problems.push(`${rel}: chỉ có ${dirs.length} bộ, cần tối thiểu ${min}`);
        if (!broken.length && dirs.length >= min) {
            console.log(`  ok  ${rel} — ${dirs.length} bộ, ảnh đủ: ${dirs.join(', ')}`);
        }
    }
}

app.whenReady().then(() => {
    console.log(`Kiểm tra ${asar}`);
    if (!fs.existsSync(asar)) {
        console.error(`LỖI: không thấy ${asar} — chạy 'npm run build:win' trước`);
        return app.exit(1);
    }
    checkFiles();
    checkSkins();
    if (problems.length) {
        console.error('\nKHÔNG ĐẠT:');
        for (const p of problems) console.error('  - ' + p);
        return app.exit(1);
    }
    console.log('\nĐẠT — installer đủ ruột.');
    app.exit(0);
});
