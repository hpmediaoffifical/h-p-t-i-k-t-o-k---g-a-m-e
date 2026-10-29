# 🏆 Thẻ Giải Đấu (leaguecard) — thiết kế bản đầu

Ngày: 30/10/2026 · Nhánh: `feature/league-card` · Mockup: `public/_prototype/league-card.html`

## Mục tiêu

Overlay OBS nhỏ ở góc màn hình cho streamer thấy (và cho người xem thấy) vị trí của phòng trong
**giải đấu LIVE** của TikTok: bậc (D5 → A1 → S), số **mảnh** (sao), hạng trên BXH, còn thiếu bao nhiêu
điểm để giữ hạng, còn bao lâu tới giờ chốt. Mục đích chính: biến "thiếu X điểm" thành lời kêu gọi
tặng quà cụ thể và tôn vinh người tặng cứu hạng.

## Dữ liệu (đã biết / còn giả định)

Nguồn: sự kiện `rankUpdate` (`WebcastRankUpdateMessage`, proto v3) — trước đây app không nghe.
Bước 0 (`lib/rank-log.js`) đã ghi log thô để đối chiếu khi LIVE thật.

| Trường | Dùng làm | Trạng thái |
|---|---|---|
| `updates[].classInfo.classType` (100…2000, 2100) | Bậc D5…A1, S | Có trong proto |
| `updates[].classInfo.starCount` | Số mảnh | User xác nhận "mảnh" = sao |
| `affiliatedInfo.realTimeRank` / `ownRank` | Hạng BXH | Có trong proto |
| `currentScore` | Điểm hiện có | Có trong proto |
| `affiliatedInfo.gapDesc` (Text) | "Thiếu X" — lấy số đầu tiên trong câu | **Giả định**: X là điểm ≈ xu |
| `countdown` / `settleInfo.rankSettleTimestamp` | Giờ chốt | **Giả định** đơn vị (giây hoặc mốc thời gian) |
| `settleInfo.old/newClassInfo` | Lên / rớt hạng | Có trong proto |
| `affiliatedInfo.teamRankBonusTime` | "Giờ vàng" | **Suy đoán** — có thể thuộc BXH Đội; mặc định TẮT |

Số mảnh tối đa mỗi bậc chưa biết → cấu hình `maxStars` (mặc định 5). Mọi chỗ đọc đều phòng thủ
(enum dạng số hoặc chuỗi, int64 dạng chuỗi, thiếu trường thì ẩn phần đó). Sau buổi LIVE thật sẽ chỉnh
bộ đọc theo log.

## Phạm vi bản đầu

1. **3 kiểu** — A Khiên + bảng · B Thanh gọn · C Vòng tiến độ; **20 skin** dùng chung (lấy từ mockup).
2. **Quy đổi ra quà** — "≈ 2 🦁 · 50 🌹": tự chọn (quà đắt nhất ≤ số thiếu + quà rẻ nhất) hoặc
   streamer chọn tối đa 2 quà. 1 điểm = 1 xu (giả định, ghi "≈").
3. **Người giữ hạng** — khi thẻ ở trạng thái *sắp rớt*, cộng xu từng người tặng; người dẫn đầu hiện
   dưới thẻ (avatar + tên + xu). Thoát nguy hiểm mà đã đủ điểm → dải "🛡 @tên đã giữ hạng!" + pháo giấy.
4. **Tự thu gọn** — sau N giây không có gì đổi (mặc định 20) và không nguy hiểm → chỉ còn khiên + mảnh;
   có biến động là mở lại.
5. **Giờ vàng** bật/tắt; chỉ hiện khi bật **và** TikTok gửi khung giờ đang diễn ra.

Không làm ở bản đầu: nhắc bằng giọng nói, nối hiệu ứng OBS / Level Quest / PK, báo cáo sau LIVE,
skin theo mùa tự đổi, ảnh khiên riêng, neo góc trái (thẻ luôn mọc sang trái từ khiên).

## Kiến trúc

```
TikTok rankUpdate ──► lib/league-card.js  parseRankUpdate() ─► tracker.applyRankUpdate() ─┐
emitGift(enriched) ─────────────────────────────────────────► tracker.applyGift()  ────────┤
                                                                                           ▼
                                  io.emit('league:state', snapshot) + io.emit('league:event', ev)
                                                                                           ▼
             /overlay/leaguecard (public/games/leaguecard/overlay.html + league-card.js/css)
             view-leaguecard trong app (leaguecard-panel.js): cài đặt + xem trước + nút thử
```

- `lib/league-card.js` (thuần, có test): `parseRankUpdate`, `textToString`, `parseNumberLoose`,
  `divisionFromClassType`, `createLeagueTracker({ now, dangerMinutes })`.
  - *Sắp rớt* = còn thiếu điểm **và** (còn ≤ `dangerMinutes` phút tới giờ chốt; nếu không biết giờ chốt
    thì tỉ lệ giữ hạng `score/(score+need)` < 35%).
  - Sự kiện: `rank` (đổi hạng BXH), `star` (±mảnh), `promo`/`demote` (đổi bậc), `danger`, `safe`,
    `kept` (thoát nguy hiểm khi đủ điểm, kèm người giữ hạng), `rescuer` (người dẫn đầu đổi / tăng xu).
- `server.js`: `GAMES.leaguecard` (config phẳng, route `/api/games/leaguecard/config` sẵn có),
  nghe `WebcastEvent.RANK_UPDATE`, móc `emitGift`, reset khi kết nối phòng mới,
  `GET /api/leaguecard/state`, `POST /api/leaguecard/simulate` (gói giả qua đúng bộ đọc — để thử OBS),
  `GET /overlay/leaguecard`.
- Client: `league-card.css` (kiểu + skin), `league-card.js` (vẽ + hiệu ứng, dùng chung cho overlay và
  xem trước), `overlay.html` (`?demo=1` tự chạy kịch bản giả cho khung xem trước), `leaguecard-panel.js`.
- Vị trí trong app: mục 🏆 trong Thư viện Game (là một tính năng như Chào VIP, không phải công cụ
  gom nhiều game nên không cần nút riêng ở đáy sidebar).

## Cấu hình (`appConfig.games.leaguecard`)

`enabled, style('A'|'B'|'C'), skin, xPercent(97), yPercent(4), scale(100), maxStars(5), golden(false),
autoCollapse(true), collapseAfterSec(20), convertMode('auto'|'manual'|'off'), convertGifts([id,id]),
rescuer(true), dangerMinutes(30)`.

## Kiểm thử

- `tests/league-card.test.js`: đọc gói (số/chuỗi enum, Text có pieces, số "1,2K"/"1.250"), chọn đúng
  mục giải đấu trong `updates`, tracker sinh đúng sự kiện, người giữ hạng chỉ tính trong lúc nguy hiểm.
- Thử tay: `POST /api/leaguecard/simulate` đẩy chuỗi gói giả → overlay đổi đúng; `npm test` xanh.
- Sau buổi LIVE thật: đối chiếu `/api/rank-log` với bảng dữ liệu ở trên, sửa bộ đọc nếu lệch.
