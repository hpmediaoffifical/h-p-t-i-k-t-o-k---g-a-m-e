# ⛓️ Nhà Tù Online (`nhatu`) — thiết kế

Ngày: 2026-11-02 · Branch: `feature/creator-online` (code) → làm tiếp trên `tuongtac/nhatu` (03/11/2026)

## Ý tưởng

Trại giam 3D chibi theo phong cách ảnh mẫu "Nhà Tù Online". Người xem TikTok LIVE vào trại thành phạm nhân mang tên và avatar của mình. Trại sống theo lịch: điểm danh, thể dục, ăn, lao động, giờ tự do, nghỉ trưa, ngủ. Mục tiêu chính là **treo máy cả buổi không cần người trực**.

## Chế độ

| Chế độ | Ai điều khiển | Camera |
|---|---|---|
| `auto` — Tự chơi (mặc định) | Người tặng quà được 1 lượt lên sóng, bình luận mã để ra lệnh | Bám người đang có lượt; không ai có lượt thì lia toàn cảnh / bám ngẫu nhiên |
| `streamer` | Streamer đi lại bằng phím (cửa sổ game hoặc ô phím trong app, relay `nhatu:key`) | Bám nhân vật streamer |

## Lượt lên sóng (`js/logic/spotlight.js`, test `tests/nhatu-spotlight.test.mjs`)

- Thời lượng = `ntTurnBase + (xu − 1) × ntTurnPerCoin`, trần `ntTurnMax`.
- Cùng người tặng thêm → cộng giờ. Người khác tặng → xếp hàng. `ntPreempt` bật thì người đang chơi giữ tối thiểu `ntMinTurn` giây rồi nhường.
- Mã bình luận (`data.json → actions[].keys`): mã ngắn 1–2 ký tự ở đầu câu (`1`, `B`, `#2 nha`), từ khoá dài phải là cả câu (`lau sàn`) để tránh "bông hoa" thành ném bóng.
- Im lặng quá `ntIdleAuto` giây → nhân vật tự làm một nhiệm vụ ngẫu nhiên.

Nhiệm vụ cá nhân: 🏀 ném bóng, 🧽 lau sàn, 🍚 ăn cơm, 💪 tập thể dục, 💃 nhảy, 😴 đi ngủ, 👮 chào cán bộ.

## Vai trò + luật ngầm (`js/events.js`, `js/logic/roles.js`, test `tests/nhatu-roles.test.mjs`)

- 👑 **Đại Ca** (`ntBossSec`): vương miện, kính đen, dây chuyền vàng, ngồi ghế đại ca ở góc trước-trái. `ntBossFollowers` NPC bu quanh theo `ENTOURAGE_SLOTS`: massa vai, lau chân, quạt mát, che ô, bưng mì tôm, vỗ tay, mời nước, cúi chào. Người khác tặng quà Đại Ca = cướp ngôi.
- 👮 **Cán Bộ** (`ntGuardSec`): đồng phục xanh, đi tuần như cán bộ NPC; tù nhân đi ngang cúi chào (mỗi người 25 giây/lần).
- 🔒 **Biệt giam** (`ntJailIdleSec`, mặc định 180 giây): người xem không bình luận / thả tim / tặng quà quá lâu → tự bị dẫn lên phòng trên lầu, cửa song sắt đóng (`world.setCellLocked`). Tương tác lại là được thả. Không thông báo công khai (luật ngầm).
- 🧑‍🍳 **Đầu Bếp** / 🧹 **Tổ Trưởng** / 🩺 **Y Tá** (`ntJobSec`): Đầu Bếp đứng quầy cơm `world.kitchen` múc cơm cho NPC xếp hàng rồi ra bàn ăn; Tổ Trưởng (băng tay đỏ) dẫn tổ 4 NPC cầm cây lau đi lau vết bẩn và đốc thúc; Y Tá đi khám, cho từng bạn tù uống thuốc. Mỗi việc +1 điểm. Mỗi người chỉ giữ 1 chức vụ; đang giữ chức vụ thì không bị "tự chơi" kéo đi nhiệm vụ khác.
- Bảng điểm "🏆 Bảng điểm trong trại" ghi biểu tượng chức vụ trước tên (👑 👮 🧑‍🍳 🧹 🩺 ⭐).
- Fallback theo xu: quà chưa gán ≥ `ntBossCoins` / `ntGuardCoins` → Đại Ca / Cán Bộ (0 = tắt).

## Sự kiện cả trại (gán quà trong panel, thử bằng 🧪)

🍜 Tiệc mì tôm · 🎤 Karaoke · 💪 Vật tay · 🐕 Chó nghiệp vụ · 🐈 Mèo trại · 🧺 Thăm nuôi · 🚨 Khám phòng · 🕺 Flashmob · 🌙 Tắt đèn · 🎆 Ân xá (danh hiệu ⭐ + pháo hoa).

Quà đã gán hiện trên overlay trong bảng "🎁 Tặng quà để…" (`ntShowGiftLegend`).

## Bộ quà gợi ý (mặc định, `data.json → suggestedGiftMap`)

Máy mới cài nhận sẵn bộ này (`GAMES.nhatu.defaultConfig.ntGiftMap`); máy đã có cấu hình bấm **🎁 Dùng bộ quà gợi ý** trong panel. 🌹 Hoa hồng cố ý để trống: chỉ cho lượt lên sóng.

| Nhóm | Quà → hành động |
|---|---|
| Nhiệm vụ (1–10 xu) | Que phát sáng → lau sàn · Kem ốc quế → ăn cơm · Đỉnh → tập thể dục · TikTok → nhảy · GG → chào cán bộ · Trái bóng xoáy → ném bóng · Chuyển động chậm → đi ngủ |
| Chức vụ (99 xu) | Vương miện nhỏ → 👑 Đại Ca · Mũ lưỡi trai → 👮 Cán Bộ · Cốc Sundae → 🧑‍🍳 Đầu Bếp · Mũ và ria mép → 🧹 Tổ Trưởng · Trái tim chào mừng → 🩺 Y Tá |
| Sự kiện | DJ Vinyl (10) → karaoke · Takoyaki (88) → tiệc mì tôm · Gia đình (90) → thăm nuôi · Đũa thần PK (100) → vật tay · Pháo hoa giấy (100) → ân xá · Kính râm (199) → khám phòng · Chú ngựa tiệc tùng (199) → flashmob · Sao đêm (199) → tắt đèn · Mèo (222) → mèo trại · Chó Corgi (299) → chó nghiệp vụ |

## Kỹ thuật

- Overlay `/overlay/nhatu` → `public/games/nhatu/overlay.html`, ES module, Three.js r160 dùng chung `public/games/quaivat/vendor/` qua import map (chạy offline trong OBS).
- Bảng tên tự chiếu toạ độ (`js/labels.js`), không cần CSS2DRenderer.
- Ngân sách điểm ảnh ~2,2 triệu (`?q=low` = 1 triệu, tắt khử răng cưa). Máy giật thì mô phỏng nhiều bước ≤ 50 ms để không bị chậm như quay chậm.
- Dân số ổn định: người xem vào thì bớt NPC (`ntNpcCount`), người xem im lặng 30 phút thì rời trại.
- Lưu trong localStorage của nguồn OBS: giờ trại, bảng TOP, tổng ngày gạch.
- Lệnh panel qua `POST /api/games/nhatu/cmd`: `demo {on}`, `skip`, `act {action}`, `reset`, `test {kind: gift|comment|like|follow|action, action?, coins?, name?}`.
- Cửa sổ game: `POST /api/nhatu/window/open` (Edge/Chrome `--app`, vì Electron của app tắt GPU).

## Tham khảo

Rà soát GitHub: `docs/nhatu-tham-khao-github.md` — chưa có repo mã nguồn mở nào làm đúng ý tưởng này.

## GĐ3 — Nghịch ngợm + nhịp nhanh (03/11/2026, nhánh `tuongtac/nhatu`)

**Nhịp:** mỗi quà = người tặng lên sóng vài giây (`ntTurnBase 6`, `ntMinTurn 4`, `ntTurnMax 30`) rồi camera chuyển người kế; nhiệm vụ nhỏ 2–5 giây. Quà sự kiện cả trại (`crowd: true` trong `data.json`: tiệc, flashmob, tắt đèn, khám phòng, chụp ảnh, tổng vệ sinh) chạy đồng loạt ngay, KHÔNG chiếm lượt; sự kiện tập thể sau giành người ngay (`crowdUntil`), không chờ sự kiện trước xong. `ntCommentPlay` (mặc định tắt): tắt = chỉ chơi bằng quà, ẩn menu lệnh + dòng hướng dẫn.

**😈 Nghịch ngợm** (`group: 'mischief'`, logic thuần `js/logic/mischief.js`, test `tests/nhatu-mischief.test.mjs`):
- 💩 Đi bậy / 💦 Tè bậy: ra góc tường (`world.mischiefSpots`) để lại bãi (`MessSystem` trong `effects.js`, ruồi = 1 InstancedMesh). Cán bộ (NPC hoặc người xem làm cán bộ) trong `CATCH_RADIUS` 7 m → bắt quả tang. Nhãn trên màn hình dùng "Đi bậy/Tè bậy" (tránh từ thô dễ bị TikTok bóp).
- 📢 Tố cáo: bắt lần đi bậy mới nhất chưa bị bắt (≤ 5 phút) → cán bộ NPC gần nhất tới bắt.
- Bị bắt → giam `ntOffenseJailSec` (180) giây, đồng hồ ⏱ trên đầu. Bình luận/tim KHÔNG thả (khác luật ngầm im lặng). Ra tù khi hết hạn, quà 🔓 Bảo lãnh (tự bảo lãnh, hoặc bảo lãnh bạn tù bị giam lâu nhất) hoặc quà cần ra ngoài làm (chức vụ, karaoke, vật tay, ân xá, nhiệm vụ) — **ra tù vẫn phải tự dọn bãi của mình** (`mustClean`, huy hiệu 🧹).
- Điểm cống hiến khi dọn bãi: dọn giúp người khác +20, dọn bãi của mình +5 (`CLEAN_POINTS`). Lệnh/quà "Lau sàn" ưu tiên bãi đi bậy.
- 🗑️ Ném vào thùng rác: người tặng (bị giam / đang làm đại ca → đàn em làm hộ) chạy tới 1 bạn tù (ưu tiên người xem thật), vác qua đầu, ném cắm đầu vào 1 trong 2 thùng cạnh cổng (`world.bins`, 3 chỗ/thùng), kẹt `ntTrashSec` (60) giây, người xung quanh cười. **Camera bám cảnh này** (`events.focusActor()`), trên cả lượt lên sóng.
- Sự kiện mới: 📸 Chụp ảnh tập thể, 🧼 Tổng vệ sinh, 🧧 Lì xì bạn tù (+5 cho 3 người xem ngẫu nhiên).

**HUD:** người đang lên sóng: tên 🎥 viền vàng nhấp nháy; hàng "⏳ Tiếp theo" có tên + số thứ tự, huy hiệu ⏳N trên đầu người chờ (`label.setBadge`).

## GĐ4 — Trò đùa ngắn, sự kiện tập thể mới, gắn với LIVE (03/11/2026)

**Luật chung mọi trò thi đấu: người THUA bị người THẮNG vác ném vào thùng rác** (`startTrash(carrier, victim)` trong `events.js`) — vật tay, thi chạy, kéo co PK; trò đối kháng sau này cũng vậy.

- **😂 Trò đùa ngắn** (`group: 'prank'`): 💇 Cạo đầu trọc, 👗 Mặc váy hồng (+ nơ), 🎂 Úp bánh kem (mặt dính kem 30 s) — người tặng chạy tới 1 bạn tù (ưu tiên người xem), làm trò ~2 s, cả trại cười; đổi đầu/đồ giữ `ntPrankSec` (120) rồi tự trả lại (chờ xong chức vụ nếu đang làm). 🍌 Vỏ chuối (ném trước mặt người đang đi → trượt ngã ngửa), 🏋️ Phạt hít đất (5 cái, đếm trên đầu). Tư thế đặc biệt do `holdPose()` giữ (xoay cả người quanh gót chân).
- **🎉 Sự kiện tập thể mới** (`crowd: true`): 🎂 Sinh nhật, 🏃 Thi chạy (5 làn `world.raceLanes`, về nhất +10, về chót vào thùng rác, camera bám người dẫn đầu), 🚒 Diễn tập thoát hiểm (ôm đầu ra sân), ☔ Mưa rào (`RainSystem`, trú hành lang `world.shelterSpots`, trời tối bớt), 🐀 Thả chuột (người gần hét, nhảy dựng).
- **Quà cá nhân được kéo người ra khỏi sự kiện tập thể** (`freeInmates({crowd:true})`) — quà của từng người luôn ưu tiên hơn hoạt động nền.
- **🔥 Combo** (`js/logic/live.js comboPower`): chuỗi TikTok gộp (server chờ repeatEnd) + quà rời cùng loại trong 10 s cộng dồn; ×5 → power 2, ×10 → 3: trò đùa / thùng rác / hít đất / vỏ chuối / chuột trúng 2–3 người, lì xì 6–9 người, pháo hoa. Banner 🔥 COMBO.
- **❤️ Mốc tim** `ntLikeEvent` (1000): đủ tim → 1 sự kiện cả trại ngẫu nhiên (flashmob / chụp ảnh / mưa / chuột). **Trại vắng quà > 3 phút** (`ntAutoEvents`): mỗi 4–7 phút tự mưa / chuột chạy qua.
- **🪢 Kéo co theo PK** (`ntPkTug`): server phát `io.emit('pk:state', {phase: start|score|end, host, opp, result})` từ dữ liệu PK thật (LINK_MIC_BATTLE action 4/5, LINK_MIC_ARMIES điểm). Đội mình = người xem trong trại (tối đa 6), đội bạn = NPC; dây dịch theo điểm (`tugShift`), thanh điểm trên HUD; hết PK đội thắng vác tối đa 3 người đội thua vào thùng rác. Thử không cần LIVE: panel 🪢 Thử kéo co PK (lệnh `gameCmd` `pk`).
- **Banner xếp hàng** (~1,6 s/cái, tối đa 3) — 1 quà thường bật 2–3 banner cùng lúc.
- **💤 Đi ngủ = nằm ngửa trên giường tầng** (`bed.lie` trong world.js; người thứ nhất giường dưới, thứ hai giường trên; `syncActor` xoay cả người, bảng tên treo trên đầu qua `char.anchor`).

## GĐ5 — Chỉ định người bằng mã số tù nhân, phòng = đội, camera miễn phí (03/11/2026, nhánh `tuongtac/nhatu-target`)

**🎯 Mã số tù nhân:** mỗi phạm nhân (NPC + người xem) có 1 số 4 chữ số riêng (`NpcManager.allocNumber`, atlas số áo mở rộng 224 số), in trên áo + ô vàng trước tên. Người xem giữ số cũ qua các buổi (`localStorage nt_numbers`).
- Quà chơi khăm (`TARGETED` trong `js/logic/target.js`: thùng rác, cạo đầu, váy hồng, bánh kem, vỏ chuối, hít đất, vật tay, lì xì, bảo lãnh, tố cáo) KHÔNG chạy ngay: mở cửa sổ `ntTargetSec` (mặc định **15 giây**), thẻ đỏ "🎯 chọn người" trên HUD. Người tặng bình luận mã số (`4823`, `#4823 5120`) → chạy ngay vào đúng người đó (combo → tối đa 3 người; lì xì đích danh = cả phong bao). Người bị chỉ định ở đâu cũng bị tới tận nơi (trên lầu, trong phòng) — trừ người đang giữ chức vụ / bị giam / đang dính trò khác (`events.targetIssue`).
- **Hết giờ** (gõ không kịp, hoặc người tặng đã rời trại) → **vác 1 người ngẫu nhiên** như cũ; người tặng đã rời thì đàn em làm hộ.
- **⚔️ Trả thù** (`Grudges`, `ntRevengeSec` 60): người bị chơi khăm tặng quà chơi khăm + gõ đúng mã số kẻ vừa chơi mình trong hạn → banner TRẢ THÙ, +5 điểm.
- Vật tay = thách đấu: trận ~7 giây, 2 bên tặng quà để gồng sức (`duelGift`, xác suất 55% ± theo xu).

**Hàng chờ lên sóng theo xu** (`SpotlightQueue.place`): quà lớn chen lên trước, quà đã gán hành động ưu tiên ×2; mỗi người bị chen tối đa `MAX_JUMPS` = 3 lần.

**Camera:** cảnh trò đùa, vật tay, ngã vỏ chuối, hít đất giành camera như thùng rác (`focusActor`). Không ai có lượt quà: người chia sẻ / theo dõi được ghé riêng 4 giây + cảm ơn (`CameoQueue`), camera đi dạo ưu tiên ai tương tác nhiều (`Interest`: chia sẻ 8 > theo dõi 6 > bình luận 3 > tim 1, giảm nửa sau 90 giây). `js/logic/cameo.js`.

**🏠 Phòng = đội** (`js/logic/rooms.js`, `ntRooms` 6, `ntRoomRoundMin` 5): người mới tự vào phòng ít người nhất, bình luận `P1`…`P6` / "phòng 3" để đổi (1 lần/phút); ô mã số đổi màu theo phòng. Điểm phòng: tim 1, bình luận 5 (1 lần/10 giây/người), chia sẻ/theo dõi 50, quà 10/xu. Hết vòng: phòng nhất ăn tiệc mì tôm + mỗi người +10.

**✋ Đăng ký trò tập thể:** bình luận "tham gia"/"tg" → 5 phút được ưu tiên vào thi chạy, kéo co, vật tay ngẫu nhiên (`rankCrowd`). Đang PK: ai tặng quà được vào dây kéo co đội mình thay NPC (`tugGift`).

Sửa kèm: người vừa vác xong (nạn nhân đang kẹt thùng) không còn bị coi là bận, và bị gọi đi việc khác không kéo nạn nhân ra khỏi thùng. Server gửi kèm `profilePicture` trong `like`/`social` (người chỉ thả tim / chia sẻ có avatar).

Test: `tests/nhatu-target|cameo|rooms.test.mjs` + thêm vào `nhatu-spotlight.test.mjs`. Panel 🧪 có "🎯 Thử chọn người (thùng rác)" và "↗️ Chia sẻ".
