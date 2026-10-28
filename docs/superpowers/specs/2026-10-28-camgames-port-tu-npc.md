# 🎥 Game Camera — chuyển từ HP LIVE NPC về HP Action LIVE (28/10/2026)

HP LIVE NPC (`F:\PHAT TRIEN GAME\HP LIVE NPC`) chép 🎥 Game Camera của app này ngày 16/10 (commit NPC `84abbf9`) rồi phát
triển thêm ~89 commit tới `1e884fe` (28/10). Tài liệu này là bản đối chiếu + thứ tự chuyển ngược về. Nhánh làm việc:
`feature/camgames-npc-port` (worktree `.claude/worktrees/camport`).

## Quy tắc chuyển (áp cho mọi file chép từ NPC)

| NPC | Bên mình | Cách làm |
|---|---|---|
| Sự kiện feed `camfeed:*` | `touchplay:*` (giữ tên, `lib/touchplay-obs-feed.js`) | chép qua bộ đổi `camfeed:` → `touchplay:` |
| `hpT()` / `/i18n/hp-i18n.js` | chỉ tiếng Việt | `public/i18n/hp-i18n.js` bản tối giản: chỉ thay `{biến}` |
| `/lib/hp-icons.js`, `/lib/hp-game-feed.js` | chưa có | chép nguyên vào `public/lib/` |
| `/games/camgames/cam-frame-guard.js` | chưa có | chép + overlay mẹ gửi `hp-cam-frame` |
| `obs-scene-map.mjs` (`visibleStage`, `createCamView`) | bản cũ | thay bằng bản NPC (bản NPC là tập cha) |
| `hp-tracking.mjs` (handWorker, face mở rộng) | bản cũ | thay bằng bản NPC (`handWorker` mặc định tắt → tương thích) |
| `lib/camgames-server.cjs` (gom logic hub) | logic nằm trong `server.js` | KHÔNG chép file; nối từng phần vào `server.js` |
| `localStorage 'hpnpc.*'` | `'hpal.*'` | bộ đổi tự thay |
| Khoá license `ft/gs`, Scene theo NPC, nhóm NPC, PK & Colab, Thư viện hiệu ứng Douyin/TikTok Studio, Danh sách hiệu ứng | không có | bỏ |

## Đối chiếu

### Game đã có ở cả hai bên
| Game | NPC thêm (nên chuyển) | Bỏ qua / cân nhắc |
|---|---|---|
| ✋ Touch & Play | quà chỉ định từng hành động `cfg.gifts` (+ `TOUCHPLAY_GIFTS` trong lib/camgames), bỏ màn chờ GIỮ TAY, `loseRule`, Chậm/Nhanh/×2 khi sân trống thả 4 bóng, `handDots`, danh sách người tặng `hp-game-feed` + vị trí, vùng nhìn thấy, frame-guard | icon nét |
| 🍉 Chém Trái Cây | quả chạm đáy nằm lại chém được, Giải Cứu dọn cả quả nằm, quà tới tự vào ván, `setArea`, danh sách người tặng + vị trí, bảng chọn quà đủ danh mục | 💣 `fxbomb` (cần Thư viện hiệu ứng NPC); NPC bỏ tracker webcam/camRect/videoSource — bên mình GIỮ |
| 🦟 Đập Muỗi | Bình xịt ×N = N mây, trần combo 100, danh sách người tặng + vị trí, `setArea`, tiếng vo ve thật `muoi-keu.mp3` | **Muỗi Chúa boss** của NPC trái với spec "Muỗi Chúa = skin" đang làm dở ở bên mình → hỏi user; đốt toàn thân (đổi `body-frames.mjs`); `BASE_SIZE` 100 (gu NPC) |
| 🏹 Bắn Cung | preset theo số mũi + `/api/games/bancung/presets`, hồi máu nhanh dần `regenRampSec` + hồi sinh khi máu hồi, 300 mũi/lần tặng, ▶ Phát thử từng quà, vị trí danh sách quà, máu loang + màu máu, gom tim >20, ẩn khi mất kết nối, camView | ô chọn nguồn riêng (NPC bỏ, bên mình giữ) |
| 🎯 Level Quest | 18 cấp + mục tiêu 💎 30k (migrate), link riêng tự ẩn khi đang chạy trong hub (`hubOwned`), hết thanh cuộn ngang | Túi mù lên cấp, giữ KPI (nhánh NPC) |

### Game chưa có
| Game | Nội dung | Ghi chú |
|---|---|---|
| 🏸 Đá Cầu (`dacau`, khe `kick`) | quà tung cầu (thường/vàng/to/lửa), đỡ bằng đầu/đùi theo pose, mốc chạm, đổi chân ×2, tăng tốc | 💥 Rổ PHẠT khi rơi cần thư viện hiệu ứng → chưa có, `fxIds:[]` |
| 🧍 Bộ Tách Người (`body`, khe `body`) | tách nền người + 🦊 Hậu Cảnh, 🕳 Rơi Hố, 🏃 Bị Đuổi, 🎬 Video Hành Động (cổng, thiên thạch, UFO, đấm, đè bẹp, Mario, pickleball, 🥷 Ninja, 🪢 Ba Tư), 😭 Khóc Lóc, 💗 Bắn Tim, 🔴 Bắt NPC, ✨ Biến Hình (băng, pixel, sét, hút bụi, ong, 🖐 Tát bay, Son Goku) | ~1,1 MB mã + ~72 MB video mẫu + model `selfie_segmenter.tflite`; chuyển theo đợt P0→P5 |

### Hạ tầng hub
khe `kick`/`body` (chơi tối đa 4 game cùng lúc), frame-guard, phiên game theo quà (`camgames-session.cjs`, mặc định 300 s,
⏭ Kế tiếp / 📋 Xếp hàng / ✂ Cắt, combo ×N = N lượt), quà mẫu (`camgames-gift-seed.json`), 📷 tự nhận camera, ＋ Thêm nhanh
overlay vào Scene, ẩn cam trong Group OBS (`hp-cam-hide`), vùng nhìn thấy, `/api/camgames/feed-status`.

## Thứ tự làm
1. **Hạ tầng client** (libs + frame-guard + i18n tối giản) · luật khe `kick`/`body` · **🏸 Đá Cầu** trọn bộ + test engine.
2. Nâng 5 game đã có (bảng trên, trừ mục cần hỏi).
3. Phiên game theo quà + quà mẫu + feed-status / tự nhận camera / Thêm nhanh overlay.
4. 🧍 Bộ Tách Người: P0 hạ tầng tách nền + Rơi Hố → P1 Bị Đuổi + Hậu Cảnh (+ ẩn cam OBS) → P2 Video Hành Động →
   P3 Bắt NPC → P4 Khóc Lóc + Bắn Tim → P5 Biến Hình. Lấy theo commit NPC `1e884fe` (working tree NPC có 6 kiểu Biến Hình
   dở dang, thiếu `fx-morph-more.mjs`).

## Việc cần user quyết
- Muỗi Chúa: giữ spec "skin" của mình hay theo boss có thanh máu của NPC.
- Kích thước muỗi `BASE_SIZE` 150 (mình) hay 100 (NPC).
- Đốt toàn thân (70 % vào mặt, còn lại bụng/hông/bắp tay).
