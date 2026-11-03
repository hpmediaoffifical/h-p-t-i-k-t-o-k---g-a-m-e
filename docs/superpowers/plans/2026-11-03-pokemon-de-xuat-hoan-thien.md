# 🔴 Săn Pokemon — xem lại game + đề xuất hoàn thiện (03/11/2026)

Bổ sung cho mục "🔴 Săn Pokemon" trong `2026-11-03-game-tuong-tac-khao-sat.md` (lỗi tích hợp + độ mượt đã ghi ở đó, file này không chép lại).
Nguồn: chạy game thật (server thử cổng 3135, bot mô phỏng; Edge headless chụp đúng khung 1080×1920) + 4 agent bộ Claude Code Game Studios
đọc mã nguồn `F:\PHAT TRIEN GAME\Pokemon-main\src\` (nhánh `hp-action-live`, 9292ef4): `game-designer`, `economy-designer`, `ux-designer`, `performance-analyst`.
Mọi `file:dòng` dưới đây là trong repo Pokemon-main trừ khi ghi khác. Sửa ở `src/` → `npm run build:hp` → chép đè vào `public/games/pokemon/`.

> **✅ Đợt 2 + ⚔️ Tranh Huyền Thoại ĐÃ LÀM (03/11/2026)**:
> - Pokemon-main `81f1747` (Đợt 2) + `2dfb2ea` (trận tranh).
> - App `a7d145f` + `13d81d1` trên nhánh `tuongtac/pokemon`. Chưa push, chưa release.
>
> **Đợt 2** (chọn theo khuyên dùng):
> - Bố cục theo vùng an toàn TikTok (`src/data/stageLayout.ts`): dải xoay vòng 108–172, sân 196–552, dải 6 ghế nổi bật 556–614 (rộng 440 px), bên dưới chỉ phong cảnh.
> - Phản hồi theo bậc: tên người ném đi theo bóng, báo bắt con hiếm, màn Huyền Thoại "SỐ N".
> - Cân bằng lõi: Huyền Thoại 0,5%; cầu đủ cấp bắt ≥ 90%; thời tiết ×3 cho hệ hợp trời; x2 cộng dồn; chia sẻ 2 phút/lần; 30 tim = Lv6; 1 xu = Lv12.
> - Độ mượt: dùng `translate3d`, memo, bỏ `filter`.
>
> **Trận tranh** (theo cách chơi LIVE user mô tả: miễn phí để đăng ký, quà là ưu tiên cao nhất):
> - Tự mở mỗi 5 phút, khi có quà ≥ 300 xu, hoặc bằng lệnh `contest`.
> - Vé: `tranh` 1 · tim ≤ 5 · chia sẻ 3 · 1 xu = 1 vé · quà chỉ định ×3 · 10 giây cuối ×2.
> - Hết giờ quay số theo vé (có may rủi). Người thắng nhận con Huyền Thoại (+điểm ×2); người thua đã tặng được an ủi + 🍀 bùa (+10 vé trận sau).
> - 👑 Hạng Đồng → Kim Cương theo xu tuần trên dải ghế và trên bảng tranh.
>
> **Kiểm chứng:**
> - Test thuần 35/35.
> - e2e (Edge/CDP): 20/20 chung, 12/12 ghế/cân bằng, 13/13 trận tranh. Có bài thử "không chữ nào nằm trong vùng TikTok che".
> - Đo bằng script của phiên Tổng hợp (Chrome, RTX 4060, 1080×1920, 4 quà/giây): **FPS 14 → 30,4**, long task 30 → 5, DOM ~30.000 → 2.385 node.
>
> **Còn lại (Đợt 3):**
> - Vòng 50 ms vẫn làm App vẽ lại 20 lần/giây: chuyển sang ref + rAF.
> - Hạt và bóng bay sang canvas; nền PNG → WebP.
> - Chế độ đấu đội Đỏ vs Xanh / Raid; Pokédex cá nhân; tách BXH.
> - Thử trên OBS thật và điện thoại thật.

> **✅ Đợt 1 ĐÃ LÀM XONG (03/11/2026)**: Pokemon-main `212eea1` (nhánh `hp-action-live`) + HP Action LIVE `58ad60f` (nhánh `tuongtac/pokemon`, chỉ bản build + `pokemon-panel.js`, server không đổi). Chưa push, chưa release.
> Đủ 12 mục mục B, cộng các mục S của "Đợt 1" ở mục C, cộng 2 yêu cầu thêm của anh/chị:
> - **Rải đều Pokemon:** sân 3×3, mỗi con đi trong ô riêng, cột giữa so le (`src/data/arenaLayout.ts`).
> - **Kho 295 loài / 9 thế hệ:** 136 Thường · 81 Hiếm · 44 Siêu Cấp · 34 Huyền Thoại (`src/data/pokedexExtra.ts`). Không trùng loài trên sân, tránh 30 loài vừa gặp (`src/data/spawnRules.ts`). Ảnh động PokeAPI/showdown đã kiểm tra tồn tại từng id; bỏ #1008 Miraidon vì không có ảnh.
>
> **Kiểm chứng:** 26/26 test (`npm test`), TypeScript sạch. 2 bộ e2e chạy Edge headless + CDP trên bản sao nhánh, lệnh đi qua `/api/games/pokemon/cmd` thật: 17/17 + 9/9.
> - Không bot trên OBS; nhãn 9 con không đè, không tràn qua 8 lần đổi lượt (gặp 70 loài, không lần nào trùng).
> - MC gọi `/api/live-translate/tts`, không còn 404.
> - Khoá Huyền Thoại; ⏻ tắt/bật; lưu luật không bật lại game; clearSeats từ panel tới OBS.
> - Qua tuần không chép BXH cũ; bảng quà ghi đúng hiệu ứng + Lv; `?panel=1` không chạy game.
> - Ghế đầy: người tặng vẫn có ghế, không mất bóng. Bóng quà ném trước bóng tim. "+đ" chỉ khi bắt được.
> - Spam 20 ghế: tối đa 12 bóng bay, hàng đợi ≤ 60.
>
> Script thử: `pk-e2e.mjs`, `pk-e2e-seats.mjs` (scratchpad phiên, cần `?debug=1` → `window.__pk`).
> **Lưu ý:**
> - Mục "Master Ball có +đ" fail 1 lần trong khoảng 12 lần chạy (bóng còn đang bay sau 4 giây), sau đó không tái hiện. Nhiều khả năng do Edge headless làm chậm khung hình; cần nhìn lại khi thử OBS thật.
> - Chưa thử trên OBS thật và điện thoại thật. Đợt 2 (bố cục theo vùng an toàn TikTok) chưa làm.

## Tóm tắt

Game đã đủ "xương sống" (ghế, ném bóng, quà → bóng, BXH, nhiệm vụ phòng, MC), nhưng **chưa sẵn sàng lên LIVE thật** vì 3 lý do:

1. **Trên OBS 1080×1920 gần như không đọc được.** Khung chơi giãn theo cửa sổ nhưng toàn bộ chữ cố định 6–11 px (98 chỗ `text-[Npx]`), không phóng theo khung. Game trông ổn trong cửa sổ xem trước 540 px, nhưng ở 1080 px thì chữ và Pokemon chỉ còn một nửa, chiếm khoảng 2/3 màn là cỏ trống. Trên điện thoại (chia khoảng 2.8) chữ còn 2–4 px.
2. **Phần người xem cần thấy lại nằm dưới giao diện TikTok.** Lưới 20 ghế, nhiệm vụ, 4 nút và dòng hướng dẫn nằm trọn trong vùng khung bình luận che. Thẻ MC nằm dưới thanh chủ phòng.
3. **Luật quà đang thiệt người tặng lớn và phá giá chính nó.** Bóng quà bị ném vào ô ngẫu nhiên. Nhiệm vụ "10 quà bất kỳ" phát cho mỗi ghế 1 Master Ball, tức 10 xu đổi được thứ bình thường phải tặng 5000 xu. Huyền Thoại tự xuất hiện khoảng 29 lần mỗi giờ nên quà "triệu hồi" 1000 xu gần như vô nghĩa.

## A. Đã kiểm chứng tận mắt (không phải suy luận)

| # | Hiện tượng | Bằng chứng |
|---|---|---|
| A1 | Khung 1080×1920 thật: chữ và sprite rất nhỏ, sân cỏ trống chiếm khoảng 2/3 màn | Edge headless `--window-size=1080,1920` chụp `/overlay/pokemon?obs=1&sim=1`. Khung `min(100vw, 100vh*9/16)` (`App.tsx:1326-1330`) nhưng chữ dùng px cố định |
| A2 | Vùng che TikTok (trên 11%, dưới 36%×72% ngang, cạnh phải 16%×42%) phủ hết ghế, nhiệm vụ, 4 nút, dòng hướng dẫn; thẻ MC nằm dưới thanh chủ phòng | Phủ khung đỏ lên overlay ở 540×960 rồi chụp |
| A3 | Mỗi câu MC gọi `GET /api/tts` → **404** (app không có endpoint này) | Danh sách request mạng của overlay |
| A4 | Rơi về Web Speech thì **mỗi câu bị đọc 2 lần**: đếm được 2 câu → 4 `SpeechSynthesisUtterance` giống hệt | Cả `audio.onerror` lẫn `play().catch` đều gọi `fallbackWebSpeech` (`utils/speech.ts:56-67`) |
| A5 | Bảng quà OBS gắn nhãn "🌦 Thời tiết" cho **mọi** hiệu ứng: mồi hiếm, đổi lượt, đóng băng, x2, mưa bóng | `gifts/GiftBoardPage.tsx:162`. Mọi khoảng 30→999 xu đều hiện "1 Ultra Ball", không ghi Lv. Hàm mô tả đúng đã có sẵn: `describeRewards` (`live/giftRules.ts:332`) |
| A6 | Nhãn tên/CP của 9 Pokemon chồng lên nhau; banner cảm ơn quà nằm giữa sân, che Pokemon 4–6 | Ảnh chụp 540×960 |

## B. Đề xuất theo 3 đợt

### Đợt 1 — "Chạy đúng trên LIVE" (P0, hầu hết việc nhỏ, làm trước mọi thứ)

| # | Việc | Ở đâu | Công |
|---|---|---|---|
| 1 | **Sân khấu cố định 540×960 rồi `transform: scale(khung/540)`** (hoặc thiết kế lại ở 1080 với chữ ≥ 32 px). Đây là bản sửa tác động lớn nhất | `App.tsx:1326-1330` | S |
| 2 | Link OBS thêm `?obs=1`; trong app tắt bot mặc định và dọn ghế/BXH bot khi bắt đầu LIVE | `HP Action LIVE/public/games/pokemon/pokemon-panel.js:43`, `ControlPanelModal.tsx:204`, `App.tsx:108,149,1056` | S |
| 3 | MC đọc qua **`/api/live-translate/tts?lang=vi`** (app đã có, proxy Google TTS, server.js:5672). Audio phát trong Browser Source nên OBS thu được tiếng. Gọi fallback đúng **1 lần** | `utils/speech.ts:51-67`, nơi gán `speech.apiBase` | S |
| 4 | Bảng quà dùng `describeRewards` / tên hiệu ứng thật + ghi "Cầu Lv.N" | `gifts/GiftBoardPage.tsx:162,169`, `live/giftBoard.ts` | S |
| 5 | Nhiệm vụ "10 quà" thưởng Master Ball → đổi thành bóng Lv30–40; Master chỉ cho top 3 khi phá đảo; tối đa 3 vòng/ngày | `App.tsx:133,771,804` | S |
| 6 | Bóng của quà ném đúng quả vừa nhận. Quà có Huyền Thoại thì **tự nhắm con vừa triệu hồi** (khoá 10 giây cho người tặng). Bóng tim không được dùng bóng ≥ Lv60 | `App.tsx:98,483,688-696,868-870` | M |
| 7 | Ghế đầy thì quà không bị mất: đẩy người "chỉ thả tim" ra, hoặc cất bóng vào hàng chờ | `App.tsx:596-604,868` | S |
| 8 | Chỉ hiện "+đ" khi bắt được (đang bật lên ngay lúc chạm, kể cả khi trượt) | `App.tsx:1100` → `:1174` | S |
| 9 | Gõ `1`–`9` khi chưa ngồi thì tự vào ghế rồi ném; hết bóng thì báo cho đúng người đó | `App.tsx:977-984` | S |
| 10 | Bảng điều khiển gửi lệnh tới overlay OBS (`gameCmd`, `/api/test-gift`), không chạy bản game thứ 2 trong cửa sổ riêng; cửa sổ panel tắt tiếng | `ControlPanelModal.tsx:307-386,607-622`, `live/hpLiveBridge.ts:255` | M |
| 11 | Tôn trọng `enabled` / `gameDisabled` (nút ⏻ hiện không có tác dụng) | `live/configStore.ts:62` | S |
| 12 | BXH tuần / nhiệm vụ ngày reset đúng khi qua tuần/qua đêm (xem mục C), kèm trần + debounce lưu người chơi | `App.tsx:243-247,337-339`, `utils/storage.ts:17-23,52` | S |

### Đợt 2 — "Dễ hiểu + đọc được + mượt" (P1)

**Bố cục theo vùng an toàn TikTok** (ux-designer):

```
y0    ┌──────────────────────────────┐
      │ TRỐNG (chủ phòng/số xem)     │
y210  ├──────────────────────────────┤
      │ DẢI XOAY 44px: GÕ 111 ĐỂ CHƠI│ ← luật → Top 3 → nhiệm vụ → gợi ý quà; banner quà lớn cũng ở đây
y340  ├──────────────────────────────┤
      │  (1)      (2)      (3)  [❄12s]
      │ (4)      (5)      (6)        │ đấu trường: số 64px, chỉ "Lv25 Pikachu" 30px
      │  (7)      (8)      (9)       │ mỗi con có vùng đi lại riêng → nhãn không chồng
y1110 ├────────────────────────┬─────┤
      │GHẾ NÓNG: 6-8 avatar 80px│TikTok│
      │tên 26px · "14/20 ghế"  │ nút │
y1230 ├────────────────────────┤     │
      │ VÙNG BÌNH LUẬN: chỉ nền│     │
y1920 └────────────────────────┴─────┘
```

- Dạy chơi trong 5 giây: dải luật xoay 4 câu, mỗi câu 4 giây. Phòng có dưới 5 người thì hiện ghế mẫu nhấp nháy kèm "@ban: 111". Gõ 111 thì hiện "@Tên vào ghế · 1 bóng · gõ 1-9 để ném".
- Bỏ 4 nút XẾP HẠNG/POKÉDEX/NHIỆM VỤ/BẢNG QUÀ trên OBS (người xem không bấm được), đưa nội dung vào dải xoay (`UserSeatDeck.tsx:230-241`).
- Phản hồi 4 bậc:
  - T0 (tim, ném): hiệu ứng nhỏ.
  - T1 (bắt thường): thẻ avatar + tên bám theo bóng khi bay, trượt cũng hiện tên.
  - T2 (hiếm/siêu cấp): lên dải trên 2.5 giây.
  - T3 (Huyền Thoại xuất hiện hoặc bị bắt): làm tối sân, banner toàn ngang, chữ "SỐ 7!" thật to (`ThrowLayer.tsx:19-54,94,101`; `App.tsx:448,486,1134`).
- Tim bay khỏi cột nút phải (`App.tsx:855`). Bớt bướm/đom đóm (`PokemonArena.tsx:207-289`).

**Cân bằng lõi** (game-designer + economy-designer):
- Huyền Thoại tự nhiên 6% → khoảng 0,5%, trọng số theo loài (`App.tsx:435,441`). Hiện mỗi loài Hiếm (7,6%) còn ra nhiều hơn mỗi loài Thường (6,7%).
- Giữ đúng lời hứa "cầu Lv.N bắt chắc Pokemon ≤ Lv.N": tỉ lệ ≥ 90% khi cấp bóng ≥ cấp Pokemon (`live/giftRules.ts:104-109`). Hiện bóng Lv30 bắt Snorlax Lv30 chỉ 66%.
- Thời tiết phải có tác dụng: hệ hợp trời ×3 trọng số xuất hiện, bắt +10%, tạm dừng tự xoay 120 giây (`App.tsx:427-441,1257-1264`). Quà 88–99 xu hiện chỉ đổi hình nền.
- Hàng ném ưu tiên bóng quà trước bóng tim. Hiện dùng chung 1 hàng, 420 ms/quả, trần 60, nên quà có thể chờ tới khoảng 25 giây (`App.tsx:748-761`).
- x2 điểm cộng dồn thời gian (`App.tsx:219`). Cooldown chia sẻ 120 giây/người (`App.tsx:991-996`).
- Tim ngang Hoa hồng (10 tim = 1 xu = bóng Lv10): đề xuất 30 tim = Lv6 (thêm `likeBallLevel`), 1 xu = Lv12.

**Độ mượt:** xem mục C.

### Đợt 3 — "Cuốn + đáng clip" (P1–P2)

| Tính năng | Cách chơi | Công | File chính |
|---|---|---|---|
| **Cổng Huyền Thoại cả phòng** | Mọi xu đổ vào một thanh chung (vd 1.500 xu). Đầy thì Huyền Thoại xuất hiện + đóng băng 10 giây; người góp nhiều nhất được ném trước 8 giây. Quà 1 xu cũng thấy mình góp phần | M | `App.tsx:482-487,915-925`, `InfoTopBar.tsx` |
| **Raid Huyền Thoại** | Boss khổng lồ có thanh máu, 90 giây. Tim = 1 sát thương, bóng = sát thương bằng cấp bóng. Hạ được thì ai góp ≥ 1% được một lượt bắt; người gọi và người đánh nhiều nhất bắt chắc | L | file mới `RaidBoss.tsx`, `App.tsx:1087-1199` |
| **Shiny 1/100** | Lấp lánh, đếm ngược 30 giây, điểm ×3, MC hô "ai bắt được?" | S | `App.tsx:427-480`, `PokemonArena.tsx:347-379` |
| **Thẻ thu phục toàn màn** | Bắt Siêu Cấp, Huyền Thoại hoặc Shiny thì hiện thẻ 3 giây: avatar + Pokemon + "con thứ N tuần này" | S | dùng lại hàng vinh danh `App.tsx:193-212` |
| **Bầy theo mốc tim** | Mỗi 1000 tim cả phòng: 30 giây cả 9 ô cùng một hệ, bóng tim lên Lv20. Khoảnh khắc người không tặng quà cũng tạo ra được | S–M | `App.tsx:950-957` |
| **Pokédex cá nhân** | "12/19 loài", Shiny tính riêng, không reset theo tuần | M | `PokedexModal.tsx` |
| **Tách BXH** | Bảng "Thợ Săn" chỉ tính điểm bắt (bỏ `xu × 10`, `App.tsx:919`) + bảng Nhà Tài Trợ (`topGifters`). Thêm lễ chốt tuần, vương miện top 3 | S | `App.tsx:243,270,919` |
| **Đỏ vs Xanh** | Gõ `đỏ`/`xanh`, kéo co 5 phút, đội thắng được mưa bóng | M | `App.tsx:966-990` |
| Bảo hiểm Huyền Thoại, combo quà 5/10, cấp Huấn luyện viên, huy hiệu hệ, tiến hoá | — | P2 | — |

**Bảng quà đề xuất** (economy-designer, vẫn cấu hình được; cần đổi `effect` → `effects[]` ở `giftRules.ts:36`):

| Nguồn | Cầu | Hiệu ứng |
|---|---|---|
| 30 tim | Lv6 | 0đ/tim |
| 1 xu | Lv12 | – |
| 5/10/20/30 xu | 20/25/30/35 | giữ nguyên |
| 50 xu | Lv40 | Mồi 45 giây |
| 88–99 xu | Lv42 | Thời tiết 90 giây có tác dụng thật |
| 199 xu | Lv55 | Đóng băng 15 giây |
| 299 xu | Lv60 | x2 trong 120 giây, cộng dồn |
| 500 xu | Lv70 | Mưa bóng Lv25 |
| 1000 xu | Lv85 | Huyền Thoại khoá cho người tặng + tự nhắm |
| 5000 xu | Lv100 | Huyền Thoại + mưa bóng Lv40 + x2 180 giây (bỏ VIP, vì 100 xu đã cho VIP) |

Lý do: hiện điểm/xu giảm đều từ 61,5 (1 xu) xuống 10,1 (5000 xu), và **bậc 5000 xu kém hơn bậc 1000 xu**. Từ 100 xu trở lên, điểm bắt chưa tới 10% điểm BXH (BXH thực chất là `xu × 10`).

## C. Độ mượt (performance-analyst — đếm từ mã, CHƯA đo trên OBS)

Mọi mục "Rủi ro độ mượt" trong khảo sát đều **đúng**. Bổ sung những gì khảo sát bỏ sót:
- Vòng rAF gọi `setActiveThrows` mỗi khung (`App.tsx:1087-1198`), nên lúc có bóng bay App render 60 lần/giây. Cộng hạt 33 lần/giây thì có lúc tới khoảng 110 lần/giây. Tầng bị dựng lại thừa nhiều nhất là `UserSeatDeck`.
- Tiến độ bay tính theo khung (`:1095`) nhưng pha hút/lắc tính theo đồng hồ thật (`:1114`). OBS chạy 30 fps thì **mất hẳn pha hút bóng**.
- `transition-all` trên chính khối Pokemon đang di chuyển và trên thanh thời gian (`PokemonArena.tsx:320,402`) ép layout mỗi khung. `backdrop-blur` ở bảng ghế nằm dưới nền đặc 95% (`UserSeatDeck.tsx:76`): tốn GPU mà không nhìn thấy.
- Chat `1`–`9` ném ngay, không qua hàng đợi (`App.tsx:977-984`): 20 ghế spam thì khoảng 70 bóng bay cùng lúc, trên 3.500 node DOM.
- **Lỗi BXH/nhiệm vụ không bao giờ reset (đã kiểm lại code):** `playersKey`/`questsKey` tính lại mỗi lần render (`App.tsx:243-247,337-339`). Overlay mở xuyên qua tuần/qua đêm thì effect ghi dữ liệu cũ sang khoá mới, tải lại trang vẫn ra dữ liệu cũ. Khoá cũ cũng không bao giờ bị xoá.

| Đợt | Việc | Công |
|---|---|---|
| 1 | Map người chơi tuần: chỉ lưu người có điểm, trần 2.000 theo `lastSeen`, ghi debounce 2 giây (`debounce` có sẵn ở `storage.ts:52` mà chưa dùng), xoá khoá cũ, sửa lỗi reset tuần/ngày · chat 1–9 đi qua hàng đợi (tối đa 12 bóng cùng lúc, mỗi ghế 1 quả/0,5 giây) · bỏ backdrop-blur vô hình · tiến độ bóng `= (now − createdAt) / FLIGHT_MS` · bản ghi bắt chỉ giữ id + debounce · LRU `avatarCache` 500, hàng đợi MC tối đa 5 | S |
| 2 | `translate3d` thay left/top %, thanh thời gian dùng `scaleX` · bỏ `drop-shadow` trên GIF và glow `filter` (dùng bóng div + lớp opacity) · `React.memo` UserSeatDeck/InfoTopBar/PokeballIcon + `useCallback` cho prop inline · panel không chạy bản game thứ 2 · cache `getBoundingClientRect` | S–M |
| 3 | Một vòng rAF chung ghi thẳng `style.transform` (không qua setState) · hạt và bóng bay sang canvas + pool · nền PNG 3,35 MB → WebP, tự host sprite/font/avatar · soak test 2 giờ | M |

Phần đã ổn: mọi interval/rAF đều có cleanup, chỉ 1 AudioContext, combo 99 đã được server gộp thành 1 sự kiện (`server.js:3794-3802`).

**Cách đo** (số trong Browser pane là software render, chỉ so trước/sau):
- Mở OBS với `--remote-debugging-port=9222`, vào `chrome://inspect`.
- Đo React Profiler (số commit/giây), long task > 50 ms, `usedJSHeapSize`, số DOM node, kích thước khoá `hp-pokemon:v1:*` mỗi 60 giây.
- Cần nâng `scripts/fake-hp-live.mjs`: hiện chỉ có 12 người xem cố định, nên phải sinh người mới liên tục, kèm combo 99 và đợt spam "1".
- Ngưỡng đạt đề xuất: heap tăng < 10%/giờ, localStorage < 1 MB, không có long task > 100 ms ngoài lúc burst.

## D. Cần anh/chị quyết định

1. **Ghế:** dải 6–8 "ghế nóng" trong vùng an toàn (khuyên dùng) / giữ 20 ghế thu nhỏ.
2. **BXH/Pokédex trên OBS:** dải trên xoay vòng (khuyên dùng) / màn nghỉ 10 giây mỗi 3 phút / nguồn OBS riêng như bảng quà.
3. **Bảng quà mới** ở đợt 3: áp nguyên, sửa số, hay chỉ làm các mục P0 (nhiệm vụ Master, nhắm đúng Huyền Thoại, không mất quà).
4. **Tính năng "đáng clip" đầu tiên:** Cổng Huyền Thoại (M) hay Raid (L). Shiny + thẻ thu phục rẻ, có thể làm kèm.
5. **MC:** giọng Google qua app (đã có sẵn, miễn phí) hay giữ hướng Gemini (cần khoá + server riêng cổng 3210).
6. **OBS Browser Source đặt 30 hay 60 fps?** Câu trả lời quyết định ngân sách khung hình. Ở 30 fps, lỗi mất pha hút bóng hiện rõ.
7. *(Lưu ý)* Tên và sprite Pokémon thuộc Nintendo/The Pokémon Company. Nếu bán thương mại trong gói KEY nên cân nhắc đổi sang sinh vật tự thiết kế.

## E. Dùng tiếp bộ Game Studios thế nào

- Sau khi sửa luật quà: chạy `/balance-check` (hoặc agent `economy-designer`) trên `giftRules.ts` + bảng mới, rồi cập nhật `tests/giftRules.test.ts:20-48`.
- Đợt 2: `/ux-design` cho bố cục HUD mới → `ui-programmer` làm → `/ux-review`.
- Độ mượt: `/perf-profile` trước/sau; `/soak-test` chạy bot mô phỏng 2 giờ (đếm DOM node, `performance.memory`, độ dài localStorage).
- Trước khi đưa vào release: `/smoke-check` + `qa-tester` viết checklist thử trên OBS thật và điện thoại thật.
