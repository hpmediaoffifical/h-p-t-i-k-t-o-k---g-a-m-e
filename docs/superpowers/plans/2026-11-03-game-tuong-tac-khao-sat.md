# 🎮 Game Tương Tác — khảo sát 4 game đang dở (03/11/2026)

Khảo sát chỉ đọc code + chạy test sẵn có; **chưa đo FPS/draw call thật trên OBS**. Số draw call, bộ nhớ là ước tính từ code.
Mỗi game có nhánh riêng tách từ `feature/creator-online` (b40889a):

| Game | Nhánh | Ghi chú nhánh |
|---|---|---|
| 🧟 Zombie Phá Nhà (`quaivat`) | `tuongtac/zombie` | = b40889a + gộp `feature/quaivat-dep-dot1` (1676003 làm đẹp đợt 1, 3f6c702 map 8 Đầm Sen) |
| ⛓️ Nhà Tù Online (`nhatu`) | `tuongtac/nhatu` | 4a1a610 + 8a4834a chưa release (v1.20.0 = cbd95ec) |
| 🔴 Săn Pokemon (`pokemon`) | `tuongtac/pokemon` | Bản build Vite; **source ở repo khác** `F:\PHAT TRIEN GAME\Pokemon-main` (nhánh `hp-action-live`) |
| 🏢 Creator Online (`creatoronline`) | `tuongtac/creator-online` | Code ở thư mục `CREATOR ONLINE/` **chưa từng commit** (untracked) |

Bộ agent Claude Code Game Studios đã cài cục bộ trong `.claude/` — xem `.claude/CLAUDE.md`. Hợp cho việc này: agent `performance-analyst`, `technical-artist`, `gameplay-programmer`, `qa-tester`; skill `/perf-profile`, `/soak-test`.

---

## 🧟 Zombie Phá Nhà — `tuongtac/zombie`

**Tình trạng:** đã phát hành v1.20.0. Phần làm đẹp đợt 1 + map Đầm Sen chưa release, nay đã gộp vào nhánh này. File bàn giao còn untracked trong worktree `.claude/worktrees/zombie-dep`: `docs/superpowers/plans/2026-11-03-quaivat-lam-dep-ban-giao.md`. Chưa có test, chưa có spec riêng.

**Kiến trúc:** `game.js` 3577 dòng; Three r160 (`vendor/`, dùng chung với Nhà Tù). Hậu kỳ EffectComposer MSAA×4 + Bloom; bóng PCFSoft 2048. Cỏ, hàng rào và cây dùng instancing (33.200 ngọn cỏ). Model: zombie 4 GLB 5.4 MB (mỗi lần nạp 1), env 100 GLB 6.6 MB. Game chạy trong cửa sổ Edge/Chrome `--app` vì Electron tắt GPU.

**Rủi ro độ mượt (theo thứ tự nặng):**
1. Đổi map không dispose: `buildMap` chỉ gọi `world.clear()` (game.js:629), khoảng 40 texture/material/geometry mỗi map bị bỏ lại. Mỗi lần zombie thắng là đổi map, nên GPU rò dần suốt buổi LIVE. Texture làn cỏ 1024² vẽ 52k nét canvas (330–335) làm khựng hình lúc đổi map.
2. Đồ vật không trần, không dispose: `removeItem` chỉ gỡ khỏi scene (2768–2773). Khoai, thùng, dây bóng tạo material mới mỗi món (2074, 1921, 1977). Hàng đợi xả tới khoảng 33 món/giây (3046).
3. Hạt `puff()` tạo SpriteMaterial mới cho từng hạt, không pool (1079–1085).
4. antialias + MSAA×4 + Bloom, pixelRatio tới 2 (202). Không giới hạn FPS; dt bị chặn 0.05 nên dưới 20 FPS game chạy chậm như slow-motion (3550–3563).
5. Mỗi khung cấp phát khoảng 20 Vector3 cho IK khiên (1623–1631). `updateHud` ghi DOM mỗi khung (3324–3340).
6. *(Suy luận)* Cửa sổ game bị che có thể đứng hình: cờ khởi chạy thiếu `--disable-backgrounding-occluded-windows` / `--disable-renderer-backgrounding` (lib/caption-listener.js:72–83).
7. Lá sen và bông sen ở map Đầm Sen là mesh lẻ, cánh hoa có đổ bóng. Nên chuyển sang InstancedMesh.

**Việc còn lại:**
1. Viết hàm dispose cho map và đồ vật (giữ cache `geo`/`MS`), rồi kiểm `renderer.info.memory` sau 10 lần đổi map.
2. Pool hạt và dùng chung material. Đặt trần số món đang sống (món cũ biến mất sớm, không bỏ quà).
3. Thêm cờ chống ngừng vẽ khi bị che, giới hạn 60 FPS, pixelRatio 1, tắt antialias khi đã có composer. Đưa `?q=low` thành tuỳ chọn "Chất lượng" trong panel (link cửa sổ ở server.js:7571 chưa truyền tham số này).
4. Đo FPS + `renderer.info.render.calls` trên máy stream + OBS thật ở các map 1/6/7/8.
5. Chuyển lá sen sang InstancedMesh; chốt vị trí map 8.
6. Viết test thuần cho hàng đợi/combo/tim.
7. Dọn code chết: `LIMIT` (3057, trùng khoá `shield`), `qvAutoDodge` (không tác dụng vì `manual=true` cứng, 1699/1745/2808). Commit file bàn giao.
8. Làm đẹp đợt 2 (núi, trăng sao) và đợt 3 (hạt bay, cửa vỡ, SSAO) theo file bàn giao.

---

## ⛓️ Nhà Tù Online — `tuongtac/nhatu`

> **03/11 đã làm (chưa commit):** lỗi đẩy người chờ lượt (+ test hồi quy đã thấy fail trên code cũ) · `beginTurn` dựng lại nhân vật · nhân vật gộp thành 1 SkinnedMesh + bóng thay thế (141 nhân vật toàn cảnh: 2.458 → ~430 lệnh vẽ, 14 → ~5 ms/lần vẽ trong pane) · số áo atlas cố định + `disposeCharacter` (texture về đúng mức sau 3 vòng làm mới trại) · đèn trại tắt ban ngày · `near()` không cấp phát · HUD chỉ ghi DOM khi đổi · gom dòng nhập trại · trần thú cưng/người thăm · thả tim không đẩy ai, bình luận ≤3 người/giây · `?mode=` thắng config · chế độ `off` + "Chất lượng hình" trong panel · `?win=1` tự đóng khi mất app · cờ chống ngừng vẽ cho cửa sổ game. **Còn:** va chạm cửa biệt giam, test `events`/`npc`, dọn `DATA.hints`/`cleanHoldSec`/`setProgress`, thử OBS + LIVE thật.

**Tình trạng:** spec `2026-11-02-nhatu-design.md` gần như đã làm đủ, test 28/28 pass. Chưa release. Spec ghi tên nhánh `feature/nhatu-online`, nhưng nhánh đó đang đứng ở cbd95ec và không chứa code Nhà Tù.

**Lỗi thấy trực tiếp:**
1. **Nặng nhất:** khi trại đầy, người đang *chờ lượt* có thể bị đẩy khỏi trại, vì bộ lọc chỉ chừa người đang lên sóng (game.js:195). `balancePopulation` thì có chừa (800). Hậu quả: tới lượt mà không có nhân vật, `beginTurn` thoát im lặng nhưng đồng hồ vẫn chạy (391).
2. `?mode=` trên URL bị config server ghi đè (1034 so với 911). Server có gửi `?win=1` nhưng game.js không đọc. Panel thiếu chế độ `off` (nhatu-panel.js:94–97), nút copy link thiếu `?q=low` (63).
3. Cửa biệt giam không có va chạm (world.js:561). Không giới hạn số chó, mèo, người thăm nuôi (events.js:441, 493).

**Rủi ro độ mượt:** tối đa khoảng 130 nhân vật (`ntMaxViewers` 5–120 + `ntNpcCount` 6–80, game.js:919–920).
1. Mỗi nhân vật khoảng 22 draw call, không instancing/LOD, nên góc toàn cảnh khoảng 2.900 draw call mỗi khung, cộng pass bóng 2048² PCFSoft vẽ lại mỗi khung.
2. 5 PointLight vẫn được tính trong shader ban ngày dù cường độ bằng 0 (world.js:500–516).
3. Rò rỉ: mỗi số áo (1000–9998) tạo một CanvasTexture + material, cache không bao giờ giải phóng (character.js:82–99). Material bóng giả tạo riêng cho từng nhân vật (118). `removeInmate` không dispose (npc.js:142).
4. Cấp phát mỗi bước mô phỏng: `npcs.all` tạo mảng mới (npc.js:69); `near()` tạo `new Set` (physics.js:49), khoảng 3 lần mỗi nhân vật mỗi bước. `separateActors` là O(n²).
5. DOM: khoảng 130 bảng tên được ghi transform + zIndex mỗi khung. HUD xoá và tạo lại `<img>` avatar 5 lần/giây (game.js:644–709). `board` trong bộ nhớ không bị cắt.
6. Thả tim cũng cho vào trại, nên phòng đông có vòng vào ra liên tục: mỗi người tạo khoảng 27 mesh + DOM + texture + dòng chat.

**Việc còn lại:**
1. Sửa lỗi đẩy người chờ lượt; `beginTurn` dựng lại nhân vật nếu đã mất.
2. Giảm draw call: gộp thân thành mesh vertex-color hoặc instancing theo bộ phận; LOD ẩn mặt/tóc khi ở xa; nhân vật xa không đổ bóng.
3. Gỡ PointLight ban ngày; giảm shadow map khi `q=low`.
4. Sửa rò rỉ số áo (bộ số cố định) và dùng chung material bóng.
5. Giới hạn số người được thay mỗi giây; gộp các dòng "đã nhập trại".
6. HUD chỉ cập nhật phần thay đổi; chỉ ghi zIndex khi thứ tự đổi.
7. Bỏ cấp phát mỗi bước (dùng lại Set, cache mảng).
8. Dọn `?win`, chế độ `off`, code không dùng (`DATA.hints`, `cleanHoldSec`, `setProgress`, `drawAvatar`).
9. Viết test cho `events`/`npc`; thử OBS thật với khoảng 120 người. Sửa tên nhánh trong spec.

---

## 🔴 Săn Pokemon — `tuongtac/pokemon`

**Nguồn code:** `public/games/pokemon/` là bản build Vite nén, giống hệt `Pokemon-main/dist-hp/pokemon`, chỉ khác `pokemon-panel.js`. Source là React 19 + Tailwind, không dùng game engine, nằm ở `F:\PHAT TRIEN GAME\Pokemon-main` (GitHub `hpmediaoffifical/Pokemon`, nhánh `hp-action-live`, HEAD 9292ef4). Cách sửa: sửa `src/` → `npm run build:hp` → chép đè vào app. **Không sửa trực tiếp bản build.** Test luật quà 11/11 pass (`tsx --test tests/giftRules.test.ts`).

**Lỗi thấy trực tiếp:**
1. Link OBS thiếu `?obs=1` (pokemon-panel.js:6, 49): nút ⚙ hiện lên stream, bot mô phỏng tự chạy cho tới khi nối LIVE, người xem giả chiếm ghế và vào BXH tuần (lưu vào localStorage).
2. Bảng `?panel=1` là một bản game riêng: thử sự kiện, thời tiết, dọn ghế chỉ chạy trong cửa sổ đó, không tới OBS (panel không gọi `/api/games/pokemon/cmd` dù overlay có nghe `gameCmd`). *(Suy luận)* Cửa sổ panel cũng nhận sự kiện thật nên MC và âm thanh phát đôi.
3. Nút ⏻ Tắt không có tác dụng: game không đọc `enabled`, không nghe `gameDisabled`, mỗi lần lưu còn ép `enabled:true` (configStore.ts:62).
4. "MC AI" trong app không có AI: `canUseApi=false` nên chỉ dùng câu soạn sẵn (`mcFallback.ts`); Gemini + TTS chỉ có ở server riêng cổng 3210. *(Suy luận)* MC có thể đọc 2 lần (speech.ts:61–70).
5. *(Suy luận)* BXH tuần và nhiệm vụ ngày không tự reset qua nửa đêm/tuần mới, chỉ reset khi tải lại trang (App.tsx:243–247, 337–339).
6. Pokemon không nằm trong CATALOG KEY (lib/license-features.js:15–32).

**Rủi ro độ mượt:**
1. `setInterval` 50 ms gọi setState, nên cả App re-render 20 lần/giây, không có `React.memo` (App.tsx:550–581). Hạt chạy interval 30 ms (527). Tiến độ bóng +0.048 mỗi khung nên tốc độ phụ thuộc FPS (1095).
2. Pokemon di chuyển bằng `left/top %` (PokemonArena.tsx:324), không dùng transform. `drop-shadow` chạy liên tục trên GIF, `backdrop-blur`.
3. Danh sách người chơi tuần không giới hạn (ai chat/tim cũng thêm, App.tsx:968, 1007); mỗi sự kiện sao chép, sắp xếp và ghi toàn bộ localStorage. Vượt khoảng 5 MB của origin `localhost:3000` (dùng chung với game khác) thì lỗi bị nuốt (storage.ts:17–23).
4. Ảnh nền PNG 3.27 MB; 2 ảnh thừa 426 KB + 233 KB. Sprite, avatar và font lấy từ mạng ngoài (raw.githubusercontent, dicebear, Google Fonts).

**Việc còn lại:**
1. Thêm `?obs=1` vào link, hoặc tự tắt mô phỏng khi chạy trong app.
2. Panel gửi lệnh qua `/api/games/pokemon/cmd`; cửa sổ panel tắt âm thanh và MC.
3. Tôn trọng `enabled`/`gameDisabled`.
4. Giới hạn danh sách người chơi, gom các lần ghi, reset theo đồng hồ.
5. Giảm re-render (memo, transform hoặc canvas); vật lý theo thời gian thực.
6. Nén nền sang WebP, xoá ảnh thừa, tự host sprite và font.
7. Chốt hướng MC AI (Gemini cần khoá + server, hay giữ câu soạn sẵn).
8. CATALOG KEY nếu bán theo gói; thêm test + spec trong repo app.
9. *(Lưu ý)* Tên và sprite Pokémon thuộc Nintendo, cần cân nhắc nếu bán thương mại.

---

## 🏢 Creator Online — `tuongtac/creator-online`

**Tình trạng:** khoảng 8.500 dòng trong `CREATOR ONLINE/`, **chưa commit lần nào**. Test 25/25 pass. Đây là game **độc lập**: người chơi tự đi bằng WASD, server LAN riêng `server/server.mjs` cổng 8090 mở `0.0.0.0`, xu lưu trong localStorage. Dùng three@0.170 + Google Fonts từ CDN nên cần Internet. **Chưa nhận sự kiện TikTok nào.** Đã có code cho mọi mục trong `docs/Y-TUONG-CREATOR-ONLINE.md`: 25 phòng, PK, nhận vai, mini game, TV trực tiếp. Có hệ thống 🎟️ vé chủ phòng nhưng docs chưa ghi.

**Quan hệ với Nhà Tù:** chép nguyên `logic/physics|rng|format.js`. Viết lại character, npc, world, effects, audio, labels (dùng CSS2DRenderer thay `LabelLayer`). Không mang theo `game.js` (socket.io/TikTok), events, spotlight, roles, panel, overlay.

**Đường vào app** (spec `2026-11-02-game-tuong-tac-design.md:39–41` đã định): id `creatoronline`, khoá config `co*`, route `/api/creatoronline/*`, Three r160 từ `quaivat/vendor/` (thiếu `renderers/CSS2DRenderer.js`, nên thêm file này hoặc chuyển sang `LabelLayer`), thay WS 8090 bằng socket.io của app, bỏ `soon: true` trong registry.

**Rủi ro độ mượt:** pixelRatio tới 1.75 + antialias + PCFSoft, chưa giới hạn theo khung 1080×1920 như Nhà Tù (main.js:32–36). Khoảng 19 mesh mỗi nhân vật, không instancing; 91 nhân vật nền, tối đa khoảng 211 (ước 1.700–4.000 draw call). Cắt bớt theo khoảng cách không áp dụng ở chế độ toàn cảnh (main.js:2191). TV trực tiếp vẽ lại cả cảnh mỗi 3 khung (2012–2019). Tách va chạm O(n²) (npc.js:63). Mỗi nhân vật một nhãn DOM. Khoảng 80 canvas texture, phòng gần vẽ lại 10 lần/giây. `removeQueuer` không dispose material (npc.js:202–206).

**Việc còn lại:**
1. Commit `CREATOR ONLINE/` (hiện chỉ nằm trên ổ đĩa).
2. Viết spec lối chơi LIVE: quà/tim/bình luận → fan NPC, vai, thể loại, vé; chế độ tự chơi (camera bám như spotlight Nhà Tù) hay streamer điều khiển (relay phím như `nhatu:key`).
3. Chuyển sang `public/games/creatoronline/`: Three r160 từ vendor, LabelLayer, font tự host.
4. `GAMES.creatoronline` + config `co*` + route + socket.io; bỏ server 8090/0.0.0.0 và xu localStorage.
5. Panel, view, app.js, bảng quà gợi ý (giống `ntGiftMap`); bỏ `soon`.
6. Giảm tải cho OBS: giới hạn pixelRatio, instancing/LOD nhân vật, `coNpcCount`, trần hàng chờ, công tắc TV trực tiếp, cắt bớt ở chế độ toàn cảnh.
7. Chuyển test sang `tests/creatoronline-*.test.mjs`; kiểm `app-smoke`.
8. Cập nhật docs (hệ thống vé); nhạc thật hay giữ nhạc tự tổng hợp.
9. Cảnh báo quà trùng với game khác / HP Game Hub (`docs/HP-GAME-HUB-LIEN-KET.md` chưa nhắc tới Game Tương Tác).

---

## Điểm chung cả 4 game
- Không game nào có dispose/pool bài bản. LIVE chạy nhiều giờ thì bộ nhớ GPU và DOM phình dần. Đây là nguyên nhân "không mượt" đáng sửa trước, trước cả việc làm đẹp.
- Chưa game nào giới hạn FPS / pixelRatio theo khung OBS một cách thống nhất. Nên có một helper dùng chung (`public/lib/`) cho Three: pixelRatio 1, 60 FPS, chế độ `q=low`, và đếm `renderer.info` hiện qua `?debug=1`.
- Đo thật trên OBS. Số trong Browser pane là software render, chỉ dùng để so tương đối.
