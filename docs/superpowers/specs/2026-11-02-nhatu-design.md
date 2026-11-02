# ⛓️ Nhà Tù Online (`nhatu`) — thiết kế

Ngày: 2026-11-02 · Branch: `feature/nhatu-online`

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
